/**
 * network/protocol.ts
 *
 * TypeScript types matching Go internal/network/protocol.go
 */

export type MsgType =
  // Client → Server
  | 'move_command'
  | 'attack_command'
  | 'ability_command'
  | 'stop_command'
  | 'buy_item'
  | 'join_game'
  | 'pick_hero'
  // Server → Client
  | 'full_snapshot'
  | 'delta_snapshot'
  | 'attack_event'
  | 'death_event'
  | 'gold_update'
  | 'xp_update'
  | 'game_over'
  | 'lobby_state';

export interface Envelope {
  t: MsgType;
  d: Uint8Array; // msgpack-encoded payload
}

// ── Client → Server ──────────────────────────────────────────────────────────

export interface MoveCommand       { seq: number; tick: number; tx: number; ty: number }
export interface AttackCommand     { seq: number; tick: number; tid: string }
export interface AbilityCommand    { seq: number; tick: number; slot: number; tx?: number; ty?: number; tid?: string }
export interface StopCommand       { seq: number; tick: number }
export interface BuyItemCommand    { seq: number; item: string }
export interface JoinGameCommand   { cid: string; name: string }
export interface PickHeroCommand   { hero: string }

// ── Server → Client ──────────────────────────────────────────────────────────

export interface EntityState {
  id:    string;
  x:     number;
  y:     number;
  z:     number;
  rot:   number;
  hp:    number;
  mhp:   number;
  mp:    number;
  mmp:   number;
  team:  string;
  ut:    string;
  sub:   string;
  dead:  boolean;
  oid?:  string;              // ownerClientId — only set for hero entities
  ex?:   Record<string, number>;
}

export interface FullSnapshot {
  tick:  number;
  ents:  EntityState[];
}

export interface DeltaSnapshot {
  tick:     number;
  base:     number;
  creates:  EntityState[];
  updates:  EntityState[];
  destroys: string[];
}

export interface AttackEvent   { aid: string; tid: string; dmg: number; tick: number }
export interface DeathEventMsg { eid: string; kid: string; tick: number }
export interface GoldUpdate    { pid: string; gold: number; dgold: number; reason: string }
export interface XPUpdate      { pid: string; xp: number; level: number }
export interface GameOver      { winner: string }

export interface LobbyPlayer   { cid: string; name: string; hero: string; team: string; ready: boolean }
export interface LobbyState    { players: LobbyPlayer[]; gid: string; started: boolean }
