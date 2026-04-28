/**
 * game/audio.ts
 *
 * AudioManager for Dota 2 Toons.
 *
 * Performance design:
 *   - All AudioBuffers are pre-baked ONCE at init time. Zero allocation at play time.
 *   - Per-sound rate limiting: each sound has a minimum interval between plays.
 *     This caps the number of active Web Audio nodes regardless of how many
 *     game events fire per tick (e.g. 60 creeps fighting = many hit events/tick).
 *   - Spatial filtering: sounds beyond AUDIO_RADIUS world units from the camera
 *     focus point are dropped entirely before reaching the Web Audio API.
 *   - All position-unaware sounds (ability, buy, levelup, ui_click, death, kill)
 *     always play — they're direct player actions or hero-scoped events.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SoundId =
  | 'hit'
  | 'ability'
  | 'levelup'
  | 'buy'
  | 'kill'
  | 'death'
  | 'ui_click';

/** Minimum ms between consecutive plays of the same sound. */
const RATE_LIMIT_MS: Record<SoundId, number> = {
  hit:      80,   // many per tick in fights — cap to ~12/s
  ability:  200,
  levelup:  500,
  buy:      300,
  kill:     200,
  death:    500,
  ui_click: 100,
};

// ---------------------------------------------------------------------------
// AudioManager
// ---------------------------------------------------------------------------

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxVolume = 0.4;
  private enabled = true;

  /** Pre-baked buffers keyed by SoundId. Filled once in _prebake(). */
  private buffers = new Map<SoundId, AudioBuffer>();
  /** Timestamp of last play per SoundId, for rate limiting. */
  private lastPlayed = new Map<SoundId, number>();

  /**
   * World units — sounds beyond this radius from the reference position are silent.
   * Only applies to positional sounds passed via playAt().
   */
  static readonly AUDIO_RADIUS = 2500;

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  /** Lazily init AudioContext and pre-bake all buffers. Call on first user gesture. */
  private getCtx(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.sfxVolume;
        this.masterGain.connect(this.ctx.destination);
        this._prebake(this.ctx);
      } catch {
        this.enabled = false;
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Pre-bake all AudioBuffers. Called once when AudioContext is first created.
   * After this, play() only schedules — no allocation.
   */
  private _prebake(ctx: AudioContext): void {
    this.buffers.set('hit',      this._bakeHit(ctx));
    this.buffers.set('ability',  this._bakeAbility(ctx));
    this.buffers.set('levelup',  this._bakeLevelup(ctx));
    this.buffers.set('buy',      this._bakeBuy(ctx));
    this.buffers.set('kill',     this._bakeKill(ctx));
    this.buffers.set('death',    this._bakeDeath(ctx));
    this.buffers.set('ui_click', this._bakeUiClick(ctx));
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  setVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.sfxVolume;
  }

  mute():   void { if (this.masterGain) this.masterGain.gain.value = 0; }
  unmute(): void { if (this.masterGain) this.masterGain.gain.value = this.sfxVolume; }

  /**
   * Play a sound unconditionally (player actions: ability, buy, levelup, ui_click).
   * Rate-limited internally.
   */
  play(id: SoundId): void {
    this._playInternal(id);
  }

  /**
   * Play a positional sound — only if the event position is within AUDIO_RADIUS
   * of the listener position. Both are game-space (x, y) coordinates.
   * Rate-limited internally.
   *
   * @param id       Sound to play
   * @param ex       Event world X
   * @param ey       Event world Y
   * @param lx       Listener world X (local hero)
   * @param ly       Listener world Y (local hero)
   */
  playAt(id: SoundId, ex: number, ey: number, lx: number, ly: number): void {
    const dx = ex - lx;
    const dy = ey - ly;
    if (dx * dx + dy * dy > AudioManager.AUDIO_RADIUS * AudioManager.AUDIO_RADIUS) return;
    this._playInternal(id);
  }

  // ---------------------------------------------------------------------------
  // Internal scheduling (no allocation)
  // ---------------------------------------------------------------------------

  private _playInternal(id: SoundId): void {
    const ctx = this.getCtx();
    if (!ctx || !this.masterGain) return;

    // Rate limiting
    const now = performance.now();
    const last = this.lastPlayed.get(id) ?? 0;
    if (now - last < RATE_LIMIT_MS[id]) return;
    this.lastPlayed.set(id, now);

    const buf = this.buffers.get(id);
    if (!buf) return;

    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.masterGain);
      src.start(ctx.currentTime);
      // src auto-disconnects when it finishes (no explicit cleanup needed)
    } catch { /* silently ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Buffer bakers — called ONCE at init, return pre-rendered AudioBuffers.
  // Each renders the sound offline into a Float32Array so play() is zero-alloc.
  // ---------------------------------------------------------------------------

  private _bakeHit(ctx: AudioContext): AudioBuffer {
    // Short bandpass noise burst — 60 ms
    const len = Math.ceil(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    // Bandpass approx at ~600 Hz via simple IIR-like weighted noise
    for (let i = 0; i < len; i++) {
      const env = (1 - i / len);          // linear decay
      d[i] = (Math.random() * 2 - 1) * env * 0.35;
    }
    return buf;
  }

  private _bakeAbility(ctx: AudioContext): AudioBuffer {
    // Rising sine sweep 300→900 Hz over 220 ms
    const len = Math.ceil(ctx.sampleRate * 0.22);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    const sr  = ctx.sampleRate;
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t   = i / len;
      const f   = 300 + (900 - 300) * t;         // linear sweep
      phase    += (2 * Math.PI * f) / sr;
      const env = t < 0.1 ? t / 0.1 : (1 - t);  // attack + decay
      d[i]     = Math.sin(phase) * env * 0.3;
    }
    return buf;
  }

  private _bakeLevelup(ctx: AudioContext): AudioBuffer {
    // C-E-G-C arpeggio, 4×100 ms notes, total 500 ms
    const notes = [261.63, 329.63, 392.0, 523.25];
    const noteDur = Math.ceil(ctx.sampleRate * 0.12);
    const total   = noteDur * notes.length;
    const buf     = ctx.createBuffer(1, total, ctx.sampleRate);
    const d       = buf.getChannelData(0);
    const sr      = ctx.sampleRate;
    for (let n = 0; n < notes.length; n++) {
      let phase = 0;
      const offset = n * noteDur;
      for (let i = 0; i < noteDur; i++) {
        phase += (2 * Math.PI * notes[n]) / sr;
        const env = 1 - i / noteDur;
        d[offset + i] = Math.sin(phase) * env * 0.25;
      }
    }
    return buf;
  }

  private _bakeBuy(ctx: AudioContext): AudioBuffer {
    // Square wave 1200→800 Hz, 70 ms
    const len = Math.ceil(ctx.sampleRate * 0.07);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    const sr  = ctx.sampleRate;
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const f   = 1200 - 400 * (i / len);
      phase    += (2 * Math.PI * f) / sr;
      const env = 1 - i / len;
      d[i]     = (Math.sin(phase) > 0 ? 1 : -1) * env * 0.2;
    }
    return buf;
  }

  private _bakeKill(ctx: AudioContext): AudioBuffer {
    // Thud (180→60 Hz) + snap noise, 160 ms
    const len = Math.ceil(ctx.sampleRate * 0.16);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    const sr  = ctx.sampleRate;
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t   = i / len;
      const f   = 180 - 120 * t;
      phase    += (2 * Math.PI * f) / sr;
      const env = 1 - t;
      // blend sine thud + noise snap at start
      const noise = i < len * 0.25 ? (Math.random() * 2 - 1) * (1 - t * 4) * 0.4 : 0;
      d[i]        = Math.sin(phase) * env * 0.5 + noise;
    }
    return buf;
  }

  private _bakeDeath(ctx: AudioContext): AudioBuffer {
    // Sawtooth 220→55 Hz with lowpass, 500 ms
    const len    = Math.ceil(ctx.sampleRate * 0.5);
    const buf    = ctx.createBuffer(1, len, ctx.sampleRate);
    const d      = buf.getChannelData(0);
    const sr     = ctx.sampleRate;
    // Simple one-pole lowpass (RC filter approx)
    const cutoff = 400 / sr;
    const rc     = 1 / (2 * Math.PI * cutoff);
    const alpha  = 1 / (1 + rc);
    let phase    = 0;
    let prev     = 0;
    for (let i = 0; i < len; i++) {
      const t   = i / len;
      const f   = 220 * Math.pow(55 / 220, t);   // exponential sweep
      phase    += (2 * Math.PI * f) / sr;
      const saw = ((phase % (2 * Math.PI)) / Math.PI) - 1; // sawtooth [-1,1]
      const env = 1 - t;
      const raw = saw * env * 0.35;
      prev      = prev + alpha * (raw - prev);    // lowpass
      d[i]      = prev;
    }
    return buf;
  }

  private _bakeUiClick(ctx: AudioContext): AudioBuffer {
    // Short sine tick at 1800 Hz, 40 ms
    const len = Math.ceil(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    const sr  = ctx.sampleRate;
    let phase = 0;
    for (let i = 0; i < len; i++) {
      phase += (2 * Math.PI * 1800) / sr;
      const env = 1 - i / len;
      d[i]     = Math.sin(phase) * env * 0.15;
    }
    return buf;
  }
}

// Singleton instance — import and call play() / playAt() anywhere
export const audio = new AudioManager();
