/**
 * heroLoader.ts
 *
 * Async GLTF hero model loader with:
 *   - Per-key model cache (load once, clone for each instance)
 *   - AnimationMixer per instance
 *   - Fallback colored box when model file is absent
 *   - Scale / orientation normalisation for the orthographic view
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// Hero registry
// ---------------------------------------------------------------------------

interface HeroInfo {
  name: string;
  /** Uniform scale applied after load (tune per model if needed). */
  scale: number;
  /** Team-tint fallback color when no GLTF is available. */
  fallbackColor: number;
}

// MVP 10 heroes plus the full roster for completeness.
// Keys must match the directory names under /heroes/<key>/scene.gltf
const HERO_DATA: Record<string, HeroInfo> = {
  axe:             { name: 'Axe',            scale: 1.0, fallbackColor: 0xff3333 },
  pudge:           { name: 'Pudge',          scale: 1.0, fallbackColor: 0xff8844 },
  crystal_maiden:  { name: 'Crystal Maiden', scale: 1.0, fallbackColor: 0x88ddff },
  sniper:          { name: 'Sniper',         scale: 1.0, fallbackColor: 0xffdd44 },
  drow_ranger:     { name: 'Drow Ranger',    scale: 1.0, fallbackColor: 0x99ccff },
  juggernaut:      { name: 'Juggernaut',     scale: 1.0, fallbackColor: 0xffaa00 },
  lion:            { name: 'Lion',           scale: 1.0, fallbackColor: 0xaa44ff },
  lina:            { name: 'Lina',           scale: 1.0, fallbackColor: 0xff4444 },
  sven:            { name: 'Sven',           scale: 1.0, fallbackColor: 0x4488ff },
  witch_doctor:    { name: 'Witch Doctor',   scale: 1.0, fallbackColor: 0x44ff88 },
  // Extended roster
  abaddon:         { name: 'Abaddon',           scale: 1.0, fallbackColor: 0x8888ff },
  alchemist:       { name: 'Alchemist',         scale: 1.0, fallbackColor: 0xaaff44 },
  anti_mage:       { name: 'Anti Mage',         scale: 1.0, fallbackColor: 0x4444ff },
  ancient_apparition: { name: 'Ancient Apparition', scale: 1.0, fallbackColor: 0xaaeeff },
  blood_seeker:    { name: 'Bloodseeker',       scale: 1.0, fallbackColor: 0xff2200 },
  bounty_hunter:   { name: 'Bounty Hunter',     scale: 1.0, fallbackColor: 0xdd9900 },
  brewmaster:      { name: 'Brewmaster',        scale: 1.0, fallbackColor: 0xffaa55 },
  bristleback:     { name: 'Bristleback',       scale: 1.0, fallbackColor: 0xaa6633 },
  centaur:         { name: 'Centaur Warrunner', scale: 1.0, fallbackColor: 0xbbaa88 },
  chaos_knight:    { name: 'Chaos Knight',      scale: 1.0, fallbackColor: 0x882200 },
  chen:            { name: 'Chen',              scale: 1.0, fallbackColor: 0x44aa44 },
  clinkz:          { name: 'Clinkz',            scale: 1.0, fallbackColor: 0xff6600 },
  dark_seer:       { name: 'Dark Seer',         scale: 1.0, fallbackColor: 0x5533aa },
  dazzle:          { name: 'Dazzle',            scale: 1.0, fallbackColor: 0xff88ff },
  death_prophet:   { name: 'Death Prophet',     scale: 1.0, fallbackColor: 0x9955cc },
  disruptor:       { name: 'Disruptor',         scale: 1.0, fallbackColor: 0x3388ff },
  doom_bringer:    { name: 'Doom',              scale: 1.0, fallbackColor: 0xff3300 },
  dragon_knight:   { name: 'Dragon Knight',     scale: 1.0, fallbackColor: 0x336600 },
  earth_spirit:    { name: 'Earth Spirit',      scale: 1.0, fallbackColor: 0x886644 },
  earthshaker:     { name: 'Earthshaker',       scale: 1.0, fallbackColor: 0xcc8833 },
  elder_titan:     { name: 'Elder Titan',       scale: 1.0, fallbackColor: 0xaabb99 },
  ember_spirit:    { name: 'Ember Spirit',      scale: 1.0, fallbackColor: 0xff6622 },
  enchantress:     { name: 'Enchantress',       scale: 1.0, fallbackColor: 0x88ff88 },
  enigma:          { name: 'Enigma',            scale: 1.0, fallbackColor: 0x110033 },
  faceless_void:   { name: 'Faceless Void',     scale: 1.0, fallbackColor: 0x220055 },
  gyrocopter:      { name: 'Gyrocopter',        scale: 1.0, fallbackColor: 0xddcc00 },
  huskar:          { name: 'Huskar',            scale: 1.0, fallbackColor: 0xff4422 },
  invoker:         { name: 'Invoker',           scale: 1.0, fallbackColor: 0x55aaff },
  io:              { name: 'Io',                scale: 1.0, fallbackColor: 0xaaffff },
  jakiro:          { name: 'Jakiro',            scale: 1.0, fallbackColor: 0x44aaff },
  juggernaut2:     { name: 'Juggernaut',        scale: 1.0, fallbackColor: 0xffaa00 },
  keeper_of_the_light: { name: 'Keeper of the Light', scale: 1.0, fallbackColor: 0xffffaa },
  kunkka:          { name: 'Kunkka',            scale: 1.0, fallbackColor: 0x334488 },
  legion_commander: { name: 'Legion Commander', scale: 1.0, fallbackColor: 0xcc3333 },
  leshrac:         { name: 'Leshrac',           scale: 1.0, fallbackColor: 0x33cc99 },
  lich:            { name: 'Lich',              scale: 1.0, fallbackColor: 0x88ccff },
  lifestealer:     { name: 'Lifestealer',       scale: 1.0, fallbackColor: 0x33aa33 },
  luna:            { name: 'Luna',              scale: 1.0, fallbackColor: 0xccaaff },
  lycan:           { name: 'Lycan',             scale: 1.0, fallbackColor: 0x775533 },
  magnus:          { name: 'Magnus',            scale: 1.0, fallbackColor: 0xcc7722 },
  medusa:          { name: 'Medusa',            scale: 1.0, fallbackColor: 0x33cc88 },
  meepo:           { name: 'Meepo',             scale: 1.0, fallbackColor: 0x88aa33 },
  mirana:          { name: 'Mirana',            scale: 1.0, fallbackColor: 0xffffff },
  morphling:       { name: 'Morphling',         scale: 1.0, fallbackColor: 0x2277ff },
  naga_siren:      { name: 'Naga Siren',        scale: 1.0, fallbackColor: 0x33aacc },
  necrolyte:       { name: 'Necrophos',         scale: 1.0, fallbackColor: 0x55aa55 },
  night_stalker:   { name: 'Night Stalker',     scale: 1.0, fallbackColor: 0x220044 },
  ogre_magi:       { name: 'Ogre Magi',         scale: 1.0, fallbackColor: 0xcc5500 },
  omniknight:      { name: 'Omniknight',        scale: 1.0, fallbackColor: 0xffdd88 },
  oracle:          { name: 'Oracle',            scale: 1.0, fallbackColor: 0xffcc44 },
  phantom_assassin: { name: 'Phantom Assassin', scale: 1.0, fallbackColor: 0xaaaacc },
  phantom_lancer:  { name: 'Phantom Lancer',    scale: 1.0, fallbackColor: 0x4466cc },
  phoenix:         { name: 'Phoenix',           scale: 1.0, fallbackColor: 0xff8800 },
  puck:            { name: 'Puck',              scale: 1.0, fallbackColor: 0x44ffcc },
  pugna:           { name: 'Pugna',             scale: 1.0, fallbackColor: 0x33ff33 },
  queen_of_pain:   { name: 'Queen of Pain',     scale: 1.0, fallbackColor: 0xcc2266 },
  razor:           { name: 'Razor',             scale: 1.0, fallbackColor: 0x2244ff },
  riki:            { name: 'Riki',              scale: 1.0, fallbackColor: 0x553377 },
  rubick:          { name: 'Rubick',            scale: 1.0, fallbackColor: 0x33cc44 },
  sand_king:       { name: 'Sand King',         scale: 1.0, fallbackColor: 0xddbb44 },
  shadow_demon:    { name: 'Shadow Demon',      scale: 1.0, fallbackColor: 0x440066 },
  shadow_shaman:   { name: 'Shadow Shaman',     scale: 1.0, fallbackColor: 0x228833 },
  silencer:        { name: 'Silencer',          scale: 1.0, fallbackColor: 0x335588 },
  skeleton_king:   { name: 'Wraith King',       scale: 1.0, fallbackColor: 0x44ff44 },
  skywrath_mage:   { name: 'Skywrath Mage',     scale: 1.0, fallbackColor: 0x88aaff },
  slardar:         { name: 'Slardar',           scale: 1.0, fallbackColor: 0x3355bb },
  slark:           { name: 'Slark',             scale: 1.0, fallbackColor: 0x224488 },
  specter:         { name: 'Spectre',           scale: 1.0, fallbackColor: 0x553388 },
  storm_spirit:    { name: 'Storm Spirit',      scale: 1.0, fallbackColor: 0x2288ff },
  techies:         { name: 'Techies',           scale: 1.0, fallbackColor: 0xffdd00 },
  templar_assassin: { name: 'Templar Assassin', scale: 1.0, fallbackColor: 0xffaacc },
  terrorblade:     { name: 'Terrorblade',       scale: 1.0, fallbackColor: 0x11cc44 },
  tidehunter:      { name: 'Tidehunter',        scale: 1.0, fallbackColor: 0x224466 },
  timbersaw:       { name: 'Timbersaw',         scale: 1.0, fallbackColor: 0xcc4400 },
  tiny:            { name: 'Tiny',              scale: 1.0, fallbackColor: 0x888899 },
  treant:          { name: 'Treant Protector',  scale: 1.0, fallbackColor: 0x336600 },
  troll_warlord:   { name: 'Troll Warlord',     scale: 1.0, fallbackColor: 0x886600 },
  tusk:            { name: 'Tusk',              scale: 1.0, fallbackColor: 0x88ccff },
  undying:         { name: 'Undying',           scale: 1.0, fallbackColor: 0x668855 },
  ursa:            { name: 'Ursa',              scale: 1.0, fallbackColor: 0x997755 },
  venomancer:      { name: 'Venomancer',        scale: 1.0, fallbackColor: 0x44cc00 },
  viper:           { name: 'Viper',             scale: 1.0, fallbackColor: 0x55cc22 },
  visage:          { name: 'Visage',            scale: 1.0, fallbackColor: 0xaaaaff },
  void_spirit:     { name: 'Void Spirit',       scale: 1.0, fallbackColor: 0x6622cc },
  warlock:         { name: 'Warlock',           scale: 1.0, fallbackColor: 0xcc6600 },
  weaver:          { name: 'Weaver',            scale: 1.0, fallbackColor: 0x996600 },
  windrunner:      { name: 'Windranger',        scale: 1.0, fallbackColor: 0x33aa33 },
  winters_wyvern:  { name: 'Winter Wyvern',     scale: 1.0, fallbackColor: 0x88ddff },
  witch_doctor2:   { name: 'Witch Doctor',      scale: 1.0, fallbackColor: 0x44ff88 },
  wraith_king:     { name: 'Wraith King',       scale: 1.0, fallbackColor: 0x44ff44 },
  zeus:            { name: 'Zeus',              scale: 1.0, fallbackColor: 0xffff44 },
};

// ---------------------------------------------------------------------------
// Animation state
// ---------------------------------------------------------------------------

export type AnimationState = 'idle' | 'run' | 'attack' | 'cast' | 'death';

/** Known animation clip name fragments per state, tried in order. */
const ANIM_PATTERNS: Record<AnimationState, string[]> = {
  idle:   ['idle', 'stand', 'wait'],
  run:    ['run', 'walk', 'move'],
  attack: ['attack', 'atk', 'hit'],
  cast:   ['cast', 'spell', 'ability'],
  death:  ['death', 'die', 'dead'],
};

// ---------------------------------------------------------------------------
// Loaded model handle
// ---------------------------------------------------------------------------

export interface HeroInstance {
  /** Root Three.js object — add to scene. */
  root: THREE.Group;
  /** Call update(delta) every render frame. */
  mixer: THREE.AnimationMixer | null;
  /** Transition to a new animation state. */
  setState(state: AnimationState): void;
  /** Current animation state. */
  currentState: AnimationState;
  /** Hero key (e.g. 'axe') */
  heroKey: string;
}

// ---------------------------------------------------------------------------
// HeroModelLoader
// ---------------------------------------------------------------------------

export class HeroModelLoader {
  private basePath: string;
  private loader = new GLTFLoader();

  /** Cached raw GLTF scenes keyed by heroKey */
  private cache = new Map<string, THREE.Group>();
  /** Cached animation clips keyed by heroKey */
  private clipCache = new Map<string, THREE.AnimationClip[]>();

  constructor(basePath = '/heroes') {
    this.basePath = basePath;
  }

  getAvailableHeroes(): string[] {
    return Object.keys(HERO_DATA);
  }

  getHeroInfo(heroKey: string) {
    return HERO_DATA[heroKey];
  }

  // ---------------------------------------------------------------------------
  // Async load + cache
  // ---------------------------------------------------------------------------

  /**
   * Loads a GLTF model for the given hero key and returns a cloned instance
   * with its own AnimationMixer.  Falls back to a colored box if the file
   * doesn't exist or fails to load.
   */
  async loadHero(heroKey: string): Promise<HeroInstance> {
    // Try loading the GLTF
    if (!this.cache.has(heroKey)) {
      // Models are stored as <heroKey>.gltf (e.g. axe/axe.gltf)
      const url = `${this.basePath}/${heroKey}/${heroKey}.gltf`;
      try {
        const gltf = await this.loader.loadAsync(url);
        this.cache.set(heroKey, gltf.scene);
        this.clipCache.set(heroKey, gltf.animations);
      } catch {
        // Model not found — will use fallback below
        this.cache.set(heroKey, this.makeFallbackModel(heroKey));
        this.clipCache.set(heroKey, []);
      }
    }

    let scene: THREE.Group;
    let clips: THREE.AnimationClip[];
    scene = this.cache.get(heroKey)!.clone(true);
    clips = this.clipCache.get(heroKey) ?? [];

    // The GLTF (ClayGL fbx2gltf) has a baked root-node matrix that rotates
    // Z-up FBX → Y-up Three.js. The hero stands ~160 native units tall after
    // that rotation. We wrap it in a root group that syncMeshes drives.
    // Scale 0.4 → body width ~62 world units ≈ 1 grid cell (64 units).
    // Height ~66 world units, slightly above 1 grid cell.
    // This matches the visible footprint of heroes in Dota 2 relative to the map grid.
    const info = HERO_DATA[heroKey];
    const s = (info?.scale ?? 1.0) * 0.4;

    const root = new THREE.Group();
    root.name = heroKey;
    root.scale.setScalar(s);

    // The GLTF baked matrix leaves the model facing +X in Three.js space.
    // Wrap scene in a pivot so we can fix the base orientation without
    // interfering with syncMeshes driving root.rotation.y for facing direction.
    // Rotate -90° around X to lay the model flat (top-down view),
    // then 0° around Y initially — syncMeshes drives that.
    scene.rotation.x = -Math.PI / 2;
    scene.rotation.y = Math.PI; // face north (toward Dire) by default
    scene.position.y = 0;
    root.add(scene);

    // These meshes are SkinnedMesh nodes. In Three.js, SkinnedMesh uses an
    // 'attached' bind mode by default: bone matrices are computed in world space
    // and the mesh ignores its own parent transform — so the geometry stays
    // pinned at world origin no matter where root is moved.
    //
    // Fix: switch every SkinnedMesh to DetachedBindMode so it respects the
    // parent chain like a normal mesh, then reset the bind matrix to identity.
    root.traverse((obj) => {
      obj.matrixAutoUpdate = true;
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = obj as THREE.SkinnedMesh;
        sm.bindMode = THREE.DetachedBindMode;
        sm.bindMatrix.identity();
        sm.bindMatrixInverse.identity();
      }
    });

    // AnimationMixer
    let mixer: THREE.AnimationMixer | null = null;
    let actions = new Map<AnimationState, THREE.AnimationAction>();
    let currentAction: THREE.AnimationAction | null = null;
    let currentStateVal: AnimationState = 'idle';

    if (clips.length > 0) {
      mixer = new THREE.AnimationMixer(scene);

      // Map each AnimationState to the best matching clip
      for (const state of Object.keys(ANIM_PATTERNS) as AnimationState[]) {
        const patterns = ANIM_PATTERNS[state];
        for (const pattern of patterns) {
          const clip = clips.find((c) =>
            c.name.toLowerCase().includes(pattern)
          );
          if (clip) {
            const action = mixer.clipAction(clip);
            action.clampWhenFinished = state === 'death';
            action.loop = state === 'death' ? THREE.LoopOnce : THREE.LoopRepeat;
            actions.set(state, action);
            break;
          }
        }
      }

      // Start idle
      const idleAction = actions.get('idle');
      if (idleAction) {
        idleAction.play();
        currentAction = idleAction;
      } else if (clips.length > 0) {
        // No recognised idle — play first clip
        const fallbackAction = mixer.clipAction(clips[0]);
        fallbackAction.play();
        currentAction = fallbackAction;
      }
    }

    const instance: HeroInstance = {
      root,
      mixer,
      heroKey,
      currentState: currentStateVal,
      setState(state: AnimationState) {
        if (state === currentStateVal) return;
        if (!mixer) return;

        const next = actions.get(state);
        if (!next) return;

        if (currentAction && currentAction !== next) {
          next.reset().fadeIn(0.15);
          currentAction.fadeOut(0.15);
        } else {
          next.reset().play();
        }

        currentAction = next;
        currentStateVal = state;
        instance.currentState = state;
      },
    };

    return instance;
  }

  // ---------------------------------------------------------------------------
  // Synchronous fallback (used while async load is pending or unavailable)
  // ---------------------------------------------------------------------------

  /** Creates an immediate placeholder box — no async needed. */
  createFallbackInstance(heroKey: string): HeroInstance {
    const root = new THREE.Group();
    root.name = heroKey;
    root.add(this.makeFallbackModel(heroKey));
    return {
      root,
      mixer: null,
      heroKey,
      currentState: 'idle',
      setState() {},
    };
  }

  private makeFallbackModel(heroKey: string): THREE.Group {
    const info = HERO_DATA[heroKey];
    const color = info?.fallbackColor ?? 0xff00ff;

    // Body — sized to match scale=0.4 GLTF: ~44 wide × 55 tall × 28 deep
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(44, 55, 28),
      new THREE.MeshLambertMaterial({ color })
    );
    body.position.y = 27;

    // Head — smaller to match
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(12, 8, 8),
      new THREE.MeshLambertMaterial({ color })
    );
    head.position.y = 66;

    const group = new THREE.Group();
    group.add(body, head);
    return group;
  }
}
