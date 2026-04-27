/**
 * network/client.ts
 *
 * WebSocket client with MessagePack encode/decode.
 * Connects to the Go server and routes incoming messages.
 */

import * as msgpack from '@msgpack/msgpack';
import type {
  MsgType, Envelope, FullSnapshot, DeltaSnapshot,
  AttackEvent, DeathEventMsg, GoldUpdate, XPUpdate, GameOver, LobbyState,
} from './protocol';

type Handler<T> = (payload: T) => void;

interface Handlers {
  full_snapshot:  Handler<FullSnapshot>;
  delta_snapshot: Handler<DeltaSnapshot>;
  attack_event:   Handler<AttackEvent>;
  death_event:    Handler<DeathEventMsg>;
  gold_update:    Handler<GoldUpdate>;
  xp_update:      Handler<XPUpdate>;
  game_over:      Handler<GameOver>;
  lobby_state:    Handler<LobbyState>;
  connected:      () => void;
  disconnected:   () => void;
}

export class GameClient {
  private ws:      WebSocket | null = null;
  private seq      = 0;
  private tick     = 0;
  private handlers: Partial<Handlers> = {};
  private url:     string;

  constructor(url: string) {
    this.url = url;
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  connect(): void {
    this.ws = new WebSocket(this.url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.handlers.connected?.();
    };

    this.ws.onclose = () => {
      this.handlers.disconnected?.();
      // Auto-reconnect after 2s
      setTimeout(() => this.connect(), 2000);
    };

    this.ws.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      try {
        const env = msgpack.decode(new Uint8Array(e.data)) as Envelope;
        this.route(env);
      } catch (err) {
        console.warn('WS decode error:', err);
      }
    };
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Routing ───────────────────────────────────────────────────────────────

  on<K extends keyof Handlers>(type: K, handler: Handlers[K]): void {
    (this.handlers as any)[type] = handler;
  }

  private route(env: Envelope): void {
    const payload = msgpack.decode(env.d) as any;
    switch (env.t as MsgType) {
      case 'full_snapshot':  this.handlers.full_snapshot?.(payload);  break;
      case 'delta_snapshot': this.handlers.delta_snapshot?.(payload); break;
      case 'attack_event':   this.handlers.attack_event?.(payload);   break;
      case 'death_event':    this.handlers.death_event?.(payload);    break;
      case 'gold_update':    this.handlers.gold_update?.(payload);    break;
      case 'xp_update':      this.handlers.xp_update?.(payload);      break;
      case 'game_over':      this.handlers.game_over?.(payload);      break;
      case 'lobby_state':    this.handlers.lobby_state?.(payload);    break;
    }
  }

  // ── Sending helpers ───────────────────────────────────────────────────────

  private send(type: MsgType, payload: unknown): void {
    if (!this.connected) return;
    const data = msgpack.encode(payload);
    const env  = msgpack.encode({ t: type, d: data });
    this.ws!.send(env);
  }

  sendMove(targetX: number, targetY: number): void {
    this.send('move_command', { seq: ++this.seq, tick: this.tick, tx: targetX, ty: targetY });
  }

  sendAttack(targetEntityId: string): void {
    this.send('attack_command', { seq: ++this.seq, tick: this.tick, tid: targetEntityId });
  }

  sendAbility(slot: number, targetEntityId?: string, targetX?: number, targetY?: number): void {
    this.send('ability_command', { seq: ++this.seq, tick: this.tick, slot, tid: targetEntityId, tx: targetX, ty: targetY });
  }

  sendStop(): void {
    this.send('stop_command', { seq: ++this.seq, tick: this.tick });
  }

  sendBuyItem(itemId: string): void {
    this.send('buy_item', { seq: ++this.seq, item: itemId });
  }

  sendJoin(clientId: string, name: string): void {
    this.send('join_game', { cid: clientId, name });
  }

  sendPickHero(heroKey: string): void {
    this.send('pick_hero', { hero: heroKey });
  }

  /** Called by game loop to keep client tick in sync */
  advanceTick(): void { this.tick++; }
}
