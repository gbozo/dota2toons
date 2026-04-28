import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';

import { createWorld } from './ecs/world';
import { loadMapData, buildObjectBlockedSet, blockedSetToCoords } from './game/mapLoader';
import { createPerspectiveCamera, createGameScene } from './game/engine';
import { createTerrain, createTreeInstances, createBuildingMeshes, createWalkableMesh } from './game/mapRenderer';
import { CameraController } from './game/camera';
import { HeroModelLoader } from './game/heroLoader';
import type { HeroInstance } from './game/heroLoader';
import { InputManager } from './game/input';
import { MovementSystem, Pathfinding } from './systems/movement';
import { AnimationSystem } from './systems/animation';
import { CreepSpawnerSystem, CreepAISystem, SeparationSystem, parseLaneWaypoints, LaneAIComponentId } from './systems/creep';
import { CombatSystem } from './systems/combat';
import { TowerAISystem, parseTowerDefs, towerStatsForTier } from './systems/tower';
import { EconomySystem, RespawnSystem } from './systems/economy';
import { AbilitySystem, StatusSystem } from './systems/ability';
import { createDebugGrid, addLabel, MouseCoordTracker } from './game/debug';
import { GameClient } from './network/client';
import { PredictionBuffer } from './game/prediction';
import type { EntityState } from './network/protocol';

import {
  createPositionComponent,
  createVelocityComponent,
  createTeamComponent,
  createUnitTypeComponent,
  createHealthComponent,
  createCombatComponent,
  createPathComponent,
  createSelectionComponent,
  createInventoryComponent,
  createRespawnComponent,
  createAbilityComponent,
  createStatusEffectsComponent,
  PositionComponentId,
  SelectionComponentId,
  UnitTypeComponentId,
  TeamComponentId,
  InventoryComponentId,
  AbilityComponentId,
  type PositionComponent,
  type SelectionComponent,
  type UnitTypeComponent,
  type AbilityComponent,
} from './components/index';
import { HERO_ABILITIES, ABILITY_BY_ID } from './data/heroAbilities';
import { ITEMS, ITEM_BY_ID, ITEM_CATEGORIES } from './data/items';
import type { MapData, Team } from './types/game';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ELEVATION_SCALE = 80; // world units per elevation level

// ---------------------------------------------------------------------------
// React HUD
// ---------------------------------------------------------------------------

interface UIState {
  status: string;
  mouseCoord: string;
  networkConnected: boolean;
  lobbyVisible: boolean;
  // Top bar
  gameClock: number;
  killsRadiant: number;
  killsDire: number;
  // Bottom bar
  selectedHero: string | null;
  heroHp: number;
  heroMaxHp: number;
  heroMana: number;
  heroMaxMana: number;
  gold: number;
  level: number;
  xp: number;
  xpToNext: number;
  // Ability bar
  abilities: Array<{
    name: string;
    key: string;
    cooldownPct: number;
    manaCost: number;
    level: number;
  }>;
  skillPoints: number;
  // Inventory
  items: Array<string | null>;
  // Overlays
  shopOpen: boolean;
  scoreboardOpen: boolean;
  // Kill feed
  killFeed: Array<{ id: number; text: string; color: string }>;
  // Damage numbers (consumed by canvas draw)
  damageNumbers: Array<{ id: number; text: string; x: number; y: number; color: string; born: number }>;
}
// ── Colour palette ──────────────────────────────────────────────────────────
const C = {
  radiant: '#4a9eff',
  dire:    '#ff4a4a',
  gold:    '#ffd700',
  hp:      '#22cc22',
  mana:    '#4488ff',
  xp:      '#cc88ff',
  bg:      'rgba(10,14,20,0.85)',
  bgLight: 'rgba(20,28,40,0.9)',
  border:  'rgba(80,100,130,0.6)',
};

// ── Reusable bar component ──────────────────────────────────────────────────
function Bar({ value, max, color, height = 6 }: { value: number; max: number; color: string; height?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div style={{ width: '100%', height, background: 'rgba(0,0,0,0.5)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.1s' }} />
    </div>
  );
}

// ── TopBar ──────────────────────────────────────────────────────────────────
function TopBar({ ui }: { ui: UIState }) {
  const mins = Math.floor(ui.gameClock / 60);
  const secs = ui.gameClock % 60;
  const clock = `${mins}:${secs.toString().padStart(2, '0')}`;
  return (
    <div style={{
      position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 12,
      background: C.bg, border: `1px solid ${C.border}`,
      borderTop: 'none', borderRadius: '0 0 8px 8px',
      padding: '4px 16px', fontFamily: 'monospace', fontSize: '13px',
      pointerEvents: 'none',
    }}>
      <span style={{ color: C.radiant, fontWeight: 'bold' }}>{ui.killsRadiant}</span>
      <span style={{ color: '#666' }}>–</span>
      <span style={{ color: '#888' }}>{clock}</span>
      <span style={{ color: '#666' }}>–</span>
      <span style={{ color: C.dire, fontWeight: 'bold' }}>{ui.killsDire}</span>
      <span style={{ color: ui.networkConnected ? '#44ff88' : '#ff6644', fontSize: 10, marginLeft: 4 }}>
        {ui.networkConnected ? '● online' : '● offline'}
      </span>
    </div>
  );
}

// ── BottomBar ───────────────────────────────────────────────────────────────
function BottomBar({ ui }: { ui: UIState }) {
  if (!ui.selectedHero) return null;
  const xpPct = ui.xpToNext > 0 ? ui.xp / ui.xpToNext : 1;
  void xpPct;
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'stretch', gap: 10,
      background: C.bg, border: `1px solid ${C.border}`,
      borderBottom: 'none', borderRadius: '8px 8px 0 0',
      padding: '10px 16px', fontFamily: 'monospace',
      pointerEvents: 'none', minWidth: 320,
    }}>
      {/* Hero portrait placeholder */}
      <div style={{
        width: 54, height: 54, flexShrink: 0,
        background: C.bgLight, border: `2px solid ${C.border}`,
        borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#aaa', fontSize: 10, textAlign: 'center',
      }}>
        {ui.selectedHero?.split(' ')[0].toUpperCase().slice(0, 3) ?? '?'}
      </div>

      {/* Stats */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#ccc' }}>
          <span style={{ color: C.hp }}>{Math.ceil(ui.heroHp)} / {ui.heroMaxHp}</span>
          <span style={{ color: C.mana }}>{Math.ceil(ui.heroMana)} / {ui.heroMaxMana}</span>
        </div>
        <Bar value={ui.heroHp}   max={ui.heroMaxHp}   color={C.hp}   height={7} />
        <Bar value={ui.heroMana} max={ui.heroMaxMana} color={C.mana} height={5} />
        <Bar value={ui.xp} max={ui.xpToNext} color={C.xp} height={3} />
      </div>

      {/* Level + Gold */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 4, fontSize: 12 }}>
        <div style={{ color: C.xp }}>Lv {ui.level}</div>
        <div style={{ color: C.gold }}>⬡ {Math.floor(ui.gold)}</div>
      </div>

      {/* Ability bar */}
      {ui.abilities.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
          {ui.abilities.map((ab, i) => {
            const keys = ['Q','W','E','R'];
            const isReady = ab.cooldownPct <= 0;
            const notLearned = ab.level === 0;
            return (
              <div key={i} style={{
                width: 44, height: 44, position: 'relative',
                background: notLearned ? 'rgba(0,0,0,0.5)' : C.bgLight,
                border: `1px solid ${isReady && !notLearned ? C.border : '#333'}`,
                borderRadius: 4, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                opacity: notLearned ? 0.4 : 1,
                overflow: 'hidden',
              }}>
                {/* Cooldown overlay */}
                {!isReady && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: `${ab.cooldownPct * 100}%`,
                    background: 'rgba(0,0,0,0.6)',
                  }} />
                )}
                <div style={{ fontSize: 9, color: '#888', zIndex: 1 }}>{keys[i]}</div>
                <div style={{ fontSize: 8, color: '#ccc', zIndex: 1, textAlign: 'center',
                  maxWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ab.name.split(' ').map(w => w[0]).join('')}
                </div>
                {ab.manaCost > 0 && (
                  <div style={{ fontSize: 7, color: C.mana, zIndex: 1 }}>{ab.manaCost}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <InventoryBar items={ui.items} gold={ui.gold} />
    </div>
  );
}

// ── KillFeed ────────────────────────────────────────────────────────────────
// ── Lobby screen ─────────────────────────────────────────────────────────────
function LobbyScreen({ onJoin }: { onJoin: (room: string, name: string, hero: string) => void }) {
  const [room, setRoom]   = React.useState('default');
  const [name, setName]   = React.useState(`Player${Math.floor(Math.random()*1000)}`);
  const [hero, setHero]   = React.useState('axe');

  const heroes = ['axe','pudge','crystal_maiden','sniper','drow_ranger',
                  'juggernaut','lion','lina','sven','witch_doctor'];

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(10,14,20,0.92)', zIndex: 200,
    }}>
      <div style={{
        background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 32, minWidth: 360,
        fontFamily: 'monospace',
      }}>
        <div style={{ color: '#ccc', fontSize: 20, marginBottom: 24, textAlign: 'center' }}>
          Dota 2 Toons
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ color: '#888', fontSize: 11 }}>Player name</label>
          <input value={name} onChange={e => setName(e.target.value)} style={{
            background: C.bgLight, border: `1px solid ${C.border}`,
            color: '#ccc', borderRadius: 4, padding: '6px 10px',
            fontFamily: 'monospace', fontSize: 13, outline: 'none',
          }} />

          <label style={{ color: '#888', fontSize: 11 }}>Room</label>
          <input value={room} onChange={e => setRoom(e.target.value)} style={{
            background: C.bgLight, border: `1px solid ${C.border}`,
            color: '#ccc', borderRadius: 4, padding: '6px 10px',
            fontFamily: 'monospace', fontSize: 13, outline: 'none',
          }} />

          <label style={{ color: '#888', fontSize: 11 }}>Hero</label>
          <select value={hero} onChange={e => setHero(e.target.value)} style={{
            background: C.bgLight, border: `1px solid ${C.border}`,
            color: '#ccc', borderRadius: 4, padding: '6px 10px',
            fontFamily: 'monospace', fontSize: 13, outline: 'none',
          }}>
            {heroes.map(h => <option key={h} value={h}>{h.replace(/_/g, ' ')}</option>)}
          </select>

          <button onClick={() => onJoin(room, name, hero)} style={{
            marginTop: 8,
            background: C.radiant, border: 'none', color: '#fff',
            borderRadius: 6, padding: '10px 0', fontSize: 14,
            fontFamily: 'monospace', cursor: 'pointer', fontWeight: 'bold',
          }}>
            Play
          </button>

          <div style={{ color: '#444', fontSize: 10, textAlign: 'center', marginTop: 4 }}>
            Connects to ws://localhost:8080 · Solo play if server offline
          </div>
        </div>
      </div>
    </div>
  );
}

function KillFeed({ events }: { events: UIState['killFeed'] }) {
  if (events.length === 0) return null;
  return (
    <div style={{
      position: 'absolute', top: 48, right: 8,
      display: 'flex', flexDirection: 'column', gap: 3,
      fontFamily: 'monospace', fontSize: '11px', pointerEvents: 'none',
    }}>
      {events.map(e => (
        <div key={e.id} style={{
          background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 4, padding: '2px 8px',
          color: e.color, whiteSpace: 'nowrap',
        }}>
          {e.text}
        </div>
      ))}
    </div>
  );
}

// ── Inventory bar ────────────────────────────────────────────────────────────
function InventoryBar({ items, gold, onBuy }: {
  items: Array<string | null>;
  gold: number;
  onBuy?: (itemId: string) => void;
}) {
  void onBuy;
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 8 }}>
      {items.map((itemId, i) => {
        const item = itemId ? ITEM_BY_ID.get(itemId) : null;
        return (
          <div key={i} title={item ? `${item.name}\n${item.description}` : 'Empty'} style={{
            width: 36, height: 36,
            background: item ? C.bgLight : 'rgba(0,0,0,0.3)',
            border: `1px solid ${item ? C.border : 'rgba(60,70,90,0.4)'}`,
            borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: item ? '#ccc' : '#444',
            textAlign: 'center', cursor: 'default',
          }}>
            {item ? item.name.split(' ').map(w => w[0]).join('') : ''}
          </div>
        );
      })}
      <div style={{ color: C.gold, fontSize: 11, marginLeft: 4 }}>⬡{Math.floor(gold)}</div>
    </div>
  );
}

// ── Shop ─────────────────────────────────────────────────────────────────────
function Shop({ gold, items, onBuy, onClose }: {
  gold: number;
  items: Array<string | null>;
  onBuy: (itemId: string) => void;
  onClose: () => void;
}) {
  const [selectedCat, setSelectedCat] = React.useState<string>('basic');
  const filtered = ITEMS.filter(i => i.category === selectedCat);
  const slotsUsed = items.filter(Boolean).length;

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)',
      background: C.bg, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: 16, minWidth: 360,
      fontFamily: 'monospace', zIndex: 100,
      pointerEvents: 'all',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
        <span style={{ color: '#ccc', fontSize: 14 }}>Shop</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: C.gold, fontSize: 13 }}>⬡ {Math.floor(gold)}</span>
          <button onClick={onClose} style={{
            background: 'none', border: `1px solid ${C.border}`, color: '#888',
            borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'monospace',
          }}>✕</button>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {ITEM_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setSelectedCat(cat)} style={{
            background: selectedCat === cat ? C.bgLight : 'transparent',
            border: `1px solid ${selectedCat === cat ? C.border : 'rgba(60,70,90,0.3)'}`,
            color: selectedCat === cat ? '#ccc' : '#666',
            borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
            fontFamily: 'monospace', fontSize: 11, textTransform: 'capitalize',
          }}>{cat}</button>
        ))}
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {filtered.map(item => {
          const canAfford = gold >= item.cost;
          const canBuy    = canAfford && slotsUsed < 6;
          return (
            <div key={item.id} title={item.description} onClick={() => canBuy && onBuy(item.id)}
              style={{
                width: 120, background: C.bgLight,
                border: `1px solid ${canBuy ? C.border : 'rgba(60,70,90,0.3)'}`,
                borderRadius: 6, padding: '6px 8px', cursor: canBuy ? 'pointer' : 'default',
                opacity: canBuy ? 1 : 0.5,
              }}>
              <div style={{ color: '#ddd', fontSize: 11, marginBottom: 2 }}>{item.name}</div>
              <div style={{ color: C.gold, fontSize: 12 }}>⬡ {item.cost}</div>
              <div style={{ color: '#777', fontSize: 9, marginTop: 2 }}>{item.description}</div>
            </div>
          );
        })}
      </div>

      <div style={{ color: '#555', fontSize: 10, marginTop: 10 }}>
        {slotsUsed}/6 slots used &nbsp;·&nbsp; Press B to close
      </div>
    </div>
  );
}

// ── Scoreboard ───────────────────────────────────────────────────────────────
function Scoreboard({ ui }: { ui: UIState }) {
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)',
      background: C.bg, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: 16, minWidth: 480,
      fontFamily: 'monospace', zIndex: 100, pointerEvents: 'none',
    }}>
      <div style={{ color: '#ccc', fontSize: 14, marginBottom: 12, textAlign: 'center' }}>
        Scoreboard &nbsp;
        <span style={{ color: C.radiant }}>{ui.killsRadiant}</span>
        <span style={{ color: '#555' }}> – </span>
        <span style={{ color: C.dire }}>{ui.killsDire}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ color: C.radiant, marginBottom: 6, fontSize: 11 }}>RADIANT</div>
          <div style={{ color: '#888', fontSize: 10 }}>Hero info available in Phase 7 (multiplayer)</div>
        </div>
        <div>
          <div style={{ color: C.dire, marginBottom: 6, fontSize: 11 }}>DIRE</div>
          <div style={{ color: '#888', fontSize: 10 }}>Hero info available in Phase 7 (multiplayer)</div>
        </div>
      </div>
      <div style={{ color: '#444', fontSize: 10, marginTop: 10, textAlign: 'center' }}>
        Hold Tab to view
      </div>
    </div>
  );
}

// ── HUD root ────────────────────────────────────────────────────────────────
function HUD({ ui, onSetUI }: { ui: UIState; onSetUI: (s: Partial<UIState> & { _buyItem?: string; _joinRoom?: { room: string; name: string; hero: string } }) => void }) {
  return (
    <>
      {/* Lobby screen */}
      {ui.lobbyVisible && (
        <LobbyScreen onJoin={(room, name, hero) =>
          onSetUI({ lobbyVisible: false, _joinRoom: { room, name, hero } } as any)
        } />
      )}

      {/* Status message */}
      {ui.status && (
        <div style={{
          position: 'absolute', top: 8, left: 8, color: '#fff',
          fontFamily: 'monospace', fontSize: '12px',
          background: C.bg, padding: '4px 10px', borderRadius: 4,
          pointerEvents: 'none',
        }}>
          {ui.status}
        </div>
      )}

      {/* Mouse coord debug */}
      <div id="mouse-coord" style={{
        position: 'absolute', top: 36, left: '50%', transform: 'translateX(-50%)',
        fontFamily: 'monospace', fontSize: '11px',
        background: 'rgba(0,0,0,0.55)', padding: '2px 10px', borderRadius: 4,
        pointerEvents: 'none', whiteSpace: 'nowrap', color: '#667',
      }}>
        map: —
      </div>

      {/* 2D canvas for health bars + minimap */}
      <canvas id="hud-canvas" style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
      }} />

      <TopBar ui={ui} />
      <BottomBar ui={ui} />
      <KillFeed events={ui.killFeed} />

      {/* Shop overlay */}
      {ui.shopOpen && (
        <Shop
          gold={ui.gold}
          items={ui.items}
          onBuy={(itemId) => onSetUI({ shopOpen: false, _buyItem: itemId } as any)}
          onClose={() => onSetUI({ shopOpen: false })}
        />
      )}

      {/* Scoreboard overlay */}
      {ui.scoreboardOpen && <Scoreboard ui={ui} />}

      {/* Controls hint */}
      <div style={{
        position: 'absolute', top: 8, right: 8,
        color: '#555', fontFamily: 'monospace', fontSize: '10px',
        pointerEvents: 'none', lineHeight: 1.7, textAlign: 'right',
      }}>
        RMB: move/attack&nbsp;&nbsp;LMB: select<br />
        WASD: camera&nbsp;&nbsp;Scroll: zoom&nbsp;&nbsp;Space: follow<br />
        B: shop&nbsp;&nbsp;Tab: scoreboard
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Entity record
// ---------------------------------------------------------------------------

interface GameEntityRecord {
  entityId: string;
  heroKey: string;
  team: Team;
  instance: HeroInstance;
  selectionRing: THREE.Mesh;
  label: THREE.Sprite;
}

function makeSelectionRing(): THREE.Mesh {
  const geo = new THREE.RingGeometry(32, 38, 32); // ~1 grid cell diameter
  const mat = new THREE.MeshBasicMaterial({
    color: 0x44ff88, side: THREE.DoubleSide,
    transparent: true, opacity: 0.85, depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  return ring;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Debug flag — set to true to show grid overlay and walkable mesh
// ---------------------------------------------------------------------------
const DEBUG_MAP = false;

// Game
// ---------------------------------------------------------------------------

class Game {
  world          = createWorld();
  private mapData: MapData | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private terrainMesh: THREE.Object3D | null = null;

  private movementSystem: MovementSystem | null = null;
  private animSystem     = new AnimationSystem();
  private pathfinding: Pathfinding | null = null;
  private cameraCtrl: CameraController | null = null;
  private inputMgr: InputManager | null = null;
  private mouseTracker: MouseCoordTracker | null = null;
  private hudCanvas: HTMLCanvasElement | null = null;
  private hudCtx: CanvasRenderingContext2D | null = null;

  private heroLoader  = new HeroModelLoader('/heroes');
  private heroGroup: THREE.Group | null = null;
  private entities    = new Map<string, GameEntityRecord>();
  private entityMeshMap = new Map<string, string>();
  private selectedId: string | null = null;
  localHeroId: string | null = null;

  // Creep + combat systems
  private creepSpawner: CreepSpawnerSystem | null = null;
  private creepAI      = new CreepAISystem();
  private towerAI      = new TowerAISystem();
  private combatSystem  = new CombatSystem();
  private abilitySystem = new AbilitySystem();
  private statusSystem  = new StatusSystem();
  private economySystem = new EconomySystem();
  private respawnSystem = new RespawnSystem();
  private separation   = new SeparationSystem();
  // Creep visuals — one InstancedMesh per team, updated each frame
  private creepMeshRadiant: THREE.InstancedMesh | null = null;
  private creepMeshDire:    THREE.InstancedMesh | null = null;
  private readonly MAX_CREEPS = 200;

  // ── Networking ────────────────────────────────────────────────────────────
  private netClient   : GameClient | null = null;
  private prediction    = new PredictionBuffer();
  /** When true, input commands are also sent to the server */
  private networkMode   = false;
  /** Tick counter for syncing with server */
  private clientTick    = 0;

  // Smoothed render rotation per entity
  private renderRotation = new Map<string, number>();
  // Previous-tick positions for render interpolation
  private prevPos = new Map<string, { x: number; y: number; z: number }>();

  private rafId       = 0;
  private lastFrame   = 0;
  private accumulator = 0;
  private readonly TICK = 1000 / 30;

  private setUI: (fn: (prev: UIState) => UIState) => void = () => {};

  setUIUpdater(fn: (fn: (prev: UIState) => UIState) => void): void {
    this.setUI = fn;
  }

  private status(msg: string, autoClear = false): void {
    this.setUI(s => ({ ...s, status: msg }));
    if (autoClear) setTimeout(() => this.setUI(s => ({ ...s, status: '' })), 1800);
  }

  // ── init ──────────────────────────────────────────────────────────────────

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.status('Loading map data...');
    this.mapData = await loadMapData('/mapdata');

    // Build extra blocked cells from static map objects (trees, buildings)
    const objectBlocked = blockedSetToCoords(buildObjectBlockedSet(this.mapData));

    this.movementSystem = new MovementSystem(this.mapData.gridNav, this.mapData.elevation, objectBlocked);
    this.pathfinding    = new Pathfinding(this.mapData.gridNav, this.mapData.elevation, objectBlocked);
    this.world.registerSystem(this.statusSystem);
    this.world.registerSystem(this.movementSystem);
    this.world.registerSystem(this.animSystem);
    this.abilitySystem.setCombatSystem(this.combatSystem);
    this.world.registerSystem(this.abilitySystem);
    const laneWaypoints = parseLaneWaypoints(this.mapData.lanes);
    this.creepSpawner   = new CreepSpawnerSystem(laneWaypoints);
    this.world.registerSystem(this.creepSpawner);
    this.world.registerSystem(this.creepAI);
    this.world.registerSystem(this.towerAI);
    this.world.registerSystem(this.combatSystem);
    this.world.registerSystem(this.economySystem);
    this.world.registerSystem(this.respawnSystem);
    this.world.registerSystem(this.separation);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // Perspective camera — top-down view
    this.camera = createPerspectiveCamera({
      fov: 50,
      aspect: canvas.clientWidth / canvas.clientHeight,
    });

    this.scene = createGameScene();

    // Camera controller — start centered on map
    this.cameraCtrl = new CameraController(this.camera, this.renderer, 0, 0, 26000);

    // Mouse coord tracker — created after scene objects are added so it can pick them.
    // Defer init to after map geometry is placed (see below).
    let coordEl: HTMLElement | null = null;

    // Map geometry
    this.status('Building terrain...');
    const terrain = createTerrain(this.mapData);
    this.scene.add(terrain);
    this.terrainMesh = terrain;

    this.status('Placing trees...');
    this.scene.add(createTreeInstances(this.mapData, this.mapData.elevation));

    this.status('Placing buildings...');
    const buildings = createBuildingMeshes(this.mapData, this.mapData.elevation);
    this.scene.add(buildings);

    // Spawn tower ECS entities so TowerAISystem + CombatSystem can process them
    this.spawnTowers();

    if (DEBUG_MAP) {
      this.scene.add(createDebugGrid());
      this.scene.add(createWalkableMesh(this.mapData.gridNav, this.mapData.elevation, objectBlocked));
    }

    // Hero group
    this.heroGroup = new THREE.Group();
    this.heroGroup.name = 'heroes';
    this.scene.add(this.heroGroup);

    // Creep instanced meshes — simple capsule shapes, team-colored
    const creepGeo = new THREE.CapsuleGeometry(20, 40, 4, 8);
    this.creepMeshRadiant = new THREE.InstancedMesh(
      creepGeo,
      new THREE.MeshLambertMaterial({ color: 0x4a9eff }),
      this.MAX_CREEPS
    );
    this.creepMeshRadiant.name = 'creeps_radiant';
    this.creepMeshRadiant.count = 0;
    this.scene.add(this.creepMeshRadiant);

    this.creepMeshDire = new THREE.InstancedMesh(
      creepGeo,
      new THREE.MeshLambertMaterial({ color: 0xff4a4a }),
      this.MAX_CREEPS
    );
    this.creepMeshDire.name = 'creeps_dire';
    this.creepMeshDire.count = 0;
    this.scene.add(this.creepMeshDire);

    // HUD canvas for health bars
    const hc = document.getElementById('hud-canvas') as HTMLCanvasElement | null;
    if (hc) {
      hc.width  = canvas.clientWidth;
      hc.height = canvas.clientHeight;
      this.hudCanvas = hc;
      this.hudCtx    = hc.getContext('2d');
    }
    // Minimap click-to-pan — listen on window, check minimap region
    window.addEventListener('mousedown', (e) => this.handleHudCanvasClick(e));

    // Mouse coord tracker — now that scene objects exist
    coordEl = document.getElementById('mouse-coord');
    if (coordEl) {
      this.mouseTracker = new MouseCoordTracker(
        this.camera, canvas, coordEl,
        this.mapData!.elevation,
        this.scene,
        // Resolve a hovered mesh to a display label
        (obj) => {
          // Hero entity?
          const entityId = this.entityMeshMap.get(obj.uuid);
          if (entityId) {
            const rec = this.entities.get(entityId);
            if (rec) return `${rec.heroKey} (${rec.team})`;
          }
          // Building / named scene object?
          if (obj.name && obj.name !== '' &&
              obj.name !== 'terrain' && obj.name !== 'trees' &&
              obj.name !== 'heroes' && !obj.name.startsWith('entity_')) {
            return obj.name;
          }
          return null;
        }
      );
    }

    // Input
    this.inputMgr = new InputManager({
      canvas,
      camera: this.camera,
      terrainMesh: this.terrainMesh,
      entityMeshMap: this.entityMeshMap,
      scene: this.scene,
      onMove:    (x, z) => this.handleMove(x, z),
      onAttack:  (id)   => this.handleAttackCommand(id),
      onSelect:  (id)   => this.handleSelect(id),
      onAbility: (slot, targetEntityId, targetX, targetZ) =>
        this.handleAbility(slot, targetEntityId, targetX, targetZ !== undefined ? -targetZ : undefined),
      onLevelUp: (slot) => this.handleLevelUp(slot),
      onStop:    ()     => this.handleStop(),
      onHold:    ()     => this.handleStop(),
    });

    // Spawn heroes at nearest walkable cells to each fountain
    this.status('Spawning heroes...');
    await Promise.all([
      this.spawnHero('axe',   'radiant', -7328, -6810, true),   // nearest walkable to Radiant fountain
      this.spawnHero('pudge', 'dire',     7152,  6720, false),   // nearest walkable to Dire fountain
    ]);

    // Start centered on full map so both heroes are visible
    this.cameraCtrl.centerOn(0, 0);

    // Resize
    window.addEventListener('resize', () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      if (this.hudCanvas) {
        this.hudCanvas.width  = window.innerWidth;
        this.hudCanvas.height = window.innerHeight;
      }
      this.cameraCtrl?.onResize(window.innerWidth, window.innerHeight);
    });

    this.status('Game loaded!', true);

    // Show lobby screen — player picks room + hero before connecting
    // Auto-connect if ?room= is in the URL (direct link)
    const urlRoom = new URLSearchParams(location.search).get('room');
    if (urlRoom) {
      this.initNetwork(urlRoom);
    } else {
      // Show lobby via the modal root (separate DOM tree, pointer-events:auto)
      (window as any).__showLobby?.();
    }

    this.startLoop();
  }

  // ── spawn ─────────────────────────────────────────────────────────────────

  private async spawnHero(
    heroKey: string, team: Team,
    gameX: number, gameY: number,
    isLocal: boolean
  ): Promise<void> {
    const instancePromise = this.heroLoader.loadHero(heroKey);
    const fallback        = this.heroLoader.createFallbackInstance(heroKey);

    const entity = this.world.createEntity();
    const elev   = this.movementSystem!.getElevation(gameX, gameY);

    // Initial facing: Radiant heroes face toward Dire base, Dire heroes face toward Radiant
    const RADIANT_BASE = { x: -7456, y: -6938 };
    const DIRE_BASE    = { x:  7408, y:  6848 };
    const target = team === 'radiant' ? DIRE_BASE : RADIANT_BASE;
    const initialRotation = Math.atan2(target.y - gameY, target.x - gameX);

    this.world.addComponent(entity.id, createPositionComponent(gameX, gameY, elev, initialRotation));
    this.world.addComponent(entity.id, createVelocityComponent());
    this.world.addComponent(entity.id, createTeamComponent(team));
    this.world.addComponent(entity.id, createUnitTypeComponent('hero', heroKey));
    this.world.addComponent(entity.id, createHealthComponent(600, 600, 200, 200));
    this.world.addComponent(entity.id, createCombatComponent(45, 55, 150, 1.7, 2));
    this.world.addComponent(entity.id, createPathComponent());
    this.world.addComponent(entity.id, createSelectionComponent(false));
    this.world.addComponent(entity.id, createInventoryComponent(600));
    this.world.addComponent(entity.id, createRespawnComponent(gameX, gameY));
    this.world.addComponent(entity.id, createStatusEffectsComponent());

    // Add ability slots from hero definition
    const defs = HERO_ABILITIES[heroKey];
    if (defs && defs.length >= 4) {
      const ids = defs.slice(0, 4).map(d => d.id) as [string, string, string, string];
      const ab = createAbilityComponent(ids);
      // Start with 4 skill points spent: each basic ability at level 1
      ab.slots[0].level = 1;
      ab.slots[1].level = 1;
      ab.slots[2].level = 1;
      // Ult starts unlearned (level 0) — unlocked at hero level 6
      ab.slots[3].level = 0;
      ab.skillPoints = 1; // 1 remaining point (heroes start at level 1, get 1 point)
      this.world.addComponent(entity.id, ab);
    }

    const selRing = makeSelectionRing();

    // Label above hero
    const labelText = `${heroKey} (${team})`;
    const labelColor = team === 'radiant' ? '#4a9eff' : '#ff4a4a';
    const worldY = elev * ELEVATION_SCALE;

    fallback.root.position.set(gameX, worldY, -gameY);  // game Y → Three -Z
    fallback.root.add(selRing);
    this.heroGroup!.add(fallback.root);

    // Floating label
    const label = addLabel(this.scene!, labelText, gameX, worldY, -gameY, labelColor);

    const rec: GameEntityRecord = {
      entityId: entity.id, heroKey, team,
      instance: fallback, selectionRing: selRing, label,
    };
    this.entities.set(entity.id, rec);
    this.renderRotation.set(entity.id, initialRotation); // start facing the right way
    this.inputMgr!.registerMesh(entity.id, fallback.root);
    this.animSystem.register(entity.id, fallback);
    if (isLocal && !this.localHeroId) this.localHeroId = entity.id;

    // Swap to real GLTF when loaded
    instancePromise.then(real => {
      real.root.position.set(gameX, worldY, -gameY);
      fallback.root.remove(selRing);
      real.root.add(selRing);

      this.heroGroup!.remove(fallback.root);
      this.heroGroup!.add(real.root);

      this.inputMgr!.unregisterMesh(entity.id, fallback.root);
      this.inputMgr!.registerMesh(entity.id, real.root);
      this.animSystem.unregister(entity.id);
      this.animSystem.register(entity.id, real);
      rec.instance = real;
    }).catch(() => {});
  }

  private spawnTowers(): void {
    if (!this.mapData) return;
    const defs = parseTowerDefs(this.mapData.buildings);
    for (const def of defs) {
      const stats = towerStatsForTier(def.tier);
      const entity = this.world.createEntity();
      const elev = this.movementSystem!.getElevation(def.x, def.y);
      this.world.addComponent(entity.id, createPositionComponent(def.x, def.y, elev));
      this.world.addComponent(entity.id, createTeamComponent(def.team));
      this.world.addComponent(entity.id, createUnitTypeComponent('tower', `tier${def.tier}`));
      this.world.addComponent(entity.id, createHealthComponent(stats.hp, stats.hp, 0, 0));
      // Tower: damage, range, 1.0s base attack, 0 armor, no current target
      this.world.addComponent(entity.id, createCombatComponent(
        stats.damage, stats.damage, stats.range, 1.0, 0
      ));
    }
  }

  // ── input handlers ────────────────────────────────────────────────────────

  private handleAttackCommand(targetId: string): void {
    if (!this.selectedId) return;
    const combat = this.world.getComponent<any>(this.selectedId, 'combat');
    if (combat) combat.targetId = targetId;
    // Forward to server
    if (this.networkMode && this.netClient && this.selectedId === this.localHeroId) {
      this.netClient.sendAttack(targetId);
    }
  }

  private handleAbility(
    slot: 0 | 1 | 2 | 3,
    targetEntityId?: string,
    targetX?: number,
    targetY?: number
  ): void {
    const heroId = this.selectedId ?? this.localHeroId;
    if (!heroId) return;

    const ab = this.world.getComponent<AbilityComponent>(heroId, AbilityComponentId);
    if (!ab) return;

    const slotState = ab.slots[slot];
    if (!slotState || slotState.level === 0) return;

    const def = ABILITY_BY_ID.get(slotState.abilityId);
    if (!def) return;

    // For abilities that need targeting: enter targeting mode if no target provided yet
    if (def.abilityType === 'unit_target' && !targetEntityId) {
      if (this.inputMgr) {
        this.inputMgr.pendingAbilitySlot = slot;
        this.inputMgr.pendingAbilityType = 'unit_target';
        this.setUI(s => ({ ...s, status: `Select target for ${def.name}` }));
        setTimeout(() => this.setUI(s => ({ ...s, status: '' })), 3000);
      }
      return;
    }
    if (def.abilityType === 'point' && targetX === undefined) {
      if (this.inputMgr) {
        this.inputMgr.pendingAbilitySlot = slot;
        this.inputMgr.pendingAbilityType = 'point';
        this.setUI(s => ({ ...s, status: `Select point for ${def.name}` }));
        setTimeout(() => this.setUI(s => ({ ...s, status: '' })), 3000);
      }
      return;
    }

    // Set pending cast — AbilitySystem consumes it next tick
    slotState.pendingCast = { targetEntityId, targetX, targetY };
  }

  private handleMove(threeX: number, threeZ: number): void {
    if (!this.selectedId || !this.pathfinding) return;
    const pos = this.world.getComponent<PositionComponent>(this.selectedId, PositionComponentId);
    if (!pos) return;
    const gameX = threeX;
    const gameY = -threeZ;

    // Snap start position to the nearest grid cell so A* always starts
    // from a clean grid-aligned position. This prevents the path from
    // starting mid-cell and warping on new commands issued mid-movement.
    const GRID = 64;
    const snapX = Math.round(pos.x / GRID) * GRID;
    const snapY = Math.round(pos.y / GRID) * GRID;

    const wps = this.pathfinding.findPath(snapX, snapY, gameX, gameY);
    if (!wps.length) return;
    const path = this.world.getComponent<any>(this.selectedId, 'path');
    if (!path) return;

    // Prepend the hero's exact current position as waypoint[0] so movement
    // continues smoothly from wherever the hero is right now, not from the
    // snapped grid cell (which could be slightly behind/ahead).
    path.waypoints = [{ x: pos.x, y: pos.y }, ...wps];
    path.currentWaypointIndex = 0;
    path.reachedTarget = false;
    path.targetX = gameX;
    path.targetY = gameY;

    // Also send to server when in network mode
    if (this.networkMode && this.netClient && this.selectedId === this.localHeroId) {
      this.netClient.sendMove(gameX, gameY);
      this.prediction.push({ type: 'move', targetX: gameX, targetY: gameY }, this.clientTick);
    }
  }

  private handleSelect(entityId: string | null): void {
    if (this.selectedId) {
      const prev = this.entities.get(this.selectedId);
      if (prev) {
        prev.selectionRing.visible = false;
        const sc = this.world.getComponent<SelectionComponent>(this.selectedId, SelectionComponentId);
        if (sc) sc.selected = false;
      }
    }
    this.selectedId = entityId;
    if (entityId) {
      const rec = this.entities.get(entityId);
      if (rec) {
        rec.selectionRing.visible = true;
        const sc = this.world.getComponent<SelectionComponent>(entityId, SelectionComponentId);
        if (sc) sc.selected = true;
        const ut = this.world.getComponent<UnitTypeComponent>(entityId, UnitTypeComponentId);
        this.setUI(s => ({ ...s, selectedHero: `${ut?.subtype ?? '?'} (${rec.team})` }));
      }
    } else {
      this.setUI(s => ({ ...s, selectedHero: null }));
      if (this.localHeroId) this.handleSelect(this.localHeroId);
    }
  }

  private handleStop(): void {
    if (!this.selectedId) return;
    const path = this.world.getComponent<any>(this.selectedId, 'path');
    if (path) { path.waypoints = []; path.reachedTarget = true; }
    const vel  = this.world.getComponent<any>(this.selectedId, 'velocity');
    if (vel)  { vel.dx = 0; vel.dy = 0; }
    if (this.networkMode && this.netClient && this.selectedId === this.localHeroId) {
      this.netClient.sendStop();
    }
  }

  private handleLevelUp(slot: 0 | 1 | 2 | 3): void {
    const heroId = this.localHeroId;
    if (!heroId) return;
    const ab = this.world.getComponent<AbilityComponent>(heroId, AbilityComponentId);
    if (!ab || ab.skillPoints <= 0) return;

    const s = ab.slots[slot];
    if (!s) return;
    const def = ABILITY_BY_ID.get(s.abilityId);
    if (!def) return;

    // Check max level
    if (s.level >= def.maxLevel) return;

    // R (slot 3) requires hero level 6+ to unlock
    if (slot === 3) {
      const inv = this.world.getComponent<any>(heroId, 'inventory');
      if (!inv || inv.level < 6) return;
    }

    s.level++;
    ab.skillPoints--;
  }

  // ── game loop ─────────────────────────────────────────────────────────────

  private startLoop(): void {
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      const frame = Math.min(now - this.lastFrame, 200);
      this.lastFrame = now;

      this.accumulator += frame;
      while (this.accumulator >= this.TICK) {
        this.economySystem.feedDeathEvents(this.combatSystem.deathEvents);
        // Snapshot previous positions before the tick for interpolation
        this.snapshotPrevPositions();
        this.world.update(this.TICK);
        this.accumulator -= this.TICK;
      }

      // Render interpolation alpha: how far between the last tick and the next
      const alpha = this.accumulator / this.TICK;

      const dtSec = frame / 1000;
      this.cameraCtrl?.update(dtSec);
      this.animSystem.updateMixers(dtSec);
      this.inputMgr?.update(frame);

      this.processDeathsForUI();
      this.processHitsForUI();
      this.syncMeshes(dtSec, alpha);
      this.syncCreeps(alpha);
      this.syncHudStats(frame);
      this.renderer?.render(this.scene!, this.camera!);
      this.drawFogOfWar();
      this.drawHealthBars();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  // Rotation turn speed: radians per second
  private readonly TURN_SPEED = Math.PI * 3;

  /** Snapshot current ECS positions before each tick — used for render interpolation. */
  private snapshotPrevPositions(): void {
    for (const entity of this.world.entities.values()) {
      if (!entity.active) continue;
      const pos = this.world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      if (pos) this.prevPos.set(entity.id, { x: pos.x, y: pos.y, z: pos.z });
    }
  }

  private syncMeshes(dtSec: number, alpha = 1): void {
    for (const [id, rec] of this.entities) {
      const pos = this.world.getComponent<PositionComponent>(id, PositionComponentId);
      if (!pos) continue;

      // Interpolate between previous tick position and current (alpha = 0..1)
      const prev = this.prevPos.get(id);
      const rx = prev ? prev.x + (pos.x - prev.x) * alpha : pos.x;
      const ry = prev ? prev.y + (pos.y - prev.y) * alpha : pos.y;
      const rz = prev ? prev.z + (pos.z - prev.z) * alpha : pos.z;

      const worldY = rz * ELEVATION_SCALE;
      rec.instance.root.position.set(rx, worldY, -ry);

      // Smooth rotation — lerp current render angle toward ECS target angle
      // using shortest angular path to avoid spinning the long way round
      const targetAngle = pos.rotation;
      let current = this.renderRotation.get(id) ?? targetAngle;

      // Wrap delta to [-PI, PI]
      let delta = targetAngle - current;
      while (delta >  Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;

      const maxStep = this.TURN_SPEED * dtSec;
      current += Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
      this.renderRotation.set(id, current);

      rec.instance.root.rotation.y = Math.atan2(-Math.cos(current), Math.sin(current));
      rec.label.position.set(pos.x, worldY + 80, -pos.y);
    }
  }

  private syncCreeps(alpha = 1): void {
    if (!this.creepMeshRadiant || !this.creepMeshDire) return;

    const matrix   = new THREE.Matrix4();
    const pos3     = new THREE.Vector3();
    const quat     = new THREE.Quaternion();
    const scale    = new THREE.Vector3(1, 1, 1);

    let ri = 0;
    let di = 0;

    for (const entity of this.world.entities.values()) {
      if (!entity.active) continue;
      const laneAI = this.world.getComponent<any>(entity.id, LaneAIComponentId);
      if (!laneAI) continue;

      const pos  = this.world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      const team = this.world.getComponent<any>(entity.id, TeamComponentId);
      if (!pos || !team) continue;

      // Interpolate position
      const prev = this.prevPos.get(entity.id);
      const rx = prev ? prev.x + (pos.x - prev.x) * alpha : pos.x;
      const ry = prev ? prev.y + (pos.y - prev.y) * alpha : pos.y;
      const rz = prev ? prev.z + (pos.z - prev.z) * alpha : pos.z;

      const worldY = rz * ELEVATION_SCALE + 40;
      pos3.set(rx, worldY, -ry);

      // Rotate to face movement direction
      const facingY = Math.atan2(-Math.cos(pos.rotation), Math.sin(pos.rotation));
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), facingY);
      matrix.compose(pos3, quat, scale);

      if (team.team === 'radiant' && ri < this.MAX_CREEPS) {
        this.creepMeshRadiant.setMatrixAt(ri++, matrix);
      } else if (team.team === 'dire' && di < this.MAX_CREEPS) {
        this.creepMeshDire.setMatrixAt(di++, matrix);
      }
    }

    this.creepMeshRadiant.count = ri;
    this.creepMeshRadiant.instanceMatrix.needsUpdate = true;
    this.creepMeshDire.count = di;
    this.creepMeshDire.instanceMatrix.needsUpdate = true;
  }

  private readonly _screenPos = new THREE.Vector3();

  // ── Fog of War ─────────────────────────────────────────────────────────────

  private fogCanvas: HTMLCanvasElement | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;

  private drawFogOfWar(): void {
    if (!this.camera || !this.hudCanvas) return;

    // Lazy-init a separate offscreen canvas for fog (same size as HUD canvas)
    if (!this.fogCanvas) {
      this.fogCanvas = document.createElement('canvas');
      this.fogCanvas.width  = this.hudCanvas.width;
      this.fogCanvas.height = this.hudCanvas.height;
      this.fogCtx = this.fogCanvas.getContext('2d');
    }
    const ctx = this.fogCtx;
    if (!ctx) return;

    const W = this.fogCanvas.width;
    const H = this.fogCanvas.height;
    if (W !== this.hudCanvas.width || H !== this.hudCanvas.height) {
      this.fogCanvas.width  = this.hudCanvas.width;
      this.fogCanvas.height = this.hudCanvas.height;
    }

    // Fill with dark fog
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    // Cut out circles at each vision source (local team heroes + towers)
    ctx.globalCompositeOperation = 'destination-out';

    const localTeam = this.localHeroId
      ? this.world.getComponent<any>(this.localHeroId, 'team')?.team
      : 'radiant';

    const VISION_DAY = 1800; // world units
    const TOWER_VISION = 1800;

    for (const entity of this.world.entities.values()) {
      if (!entity.active) continue;
      if (this.world.hasComponent(entity.id, 'dead')) continue;

      const team = this.world.getComponent<any>(entity.id, 'team');
      if (!team || team.team !== localTeam) continue;

      const ut  = this.world.getComponent<any>(entity.id, 'unitType');
      const pos = this.world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      if (!pos || !ut) continue;

      const isHero  = ut.type === 'hero';
      const isTower = ut.type === 'tower';
      if (!isHero && !isTower) continue;

      const visionRange = isTower ? TOWER_VISION : VISION_DAY;

      // Project world position to screen
      const worldY = pos.z * ELEVATION_SCALE + 50;
      this._screenPos.set(pos.x, worldY, -pos.y);
      this._screenPos.project(this.camera);
      if (this._screenPos.z > 1) continue;

      const sx = ( this._screenPos.x + 1) / 2 * W;
      const sy = (-this._screenPos.y + 1) / 2 * H;

      // Convert vision range (world units) to screen pixels
      // Approximate: project a point offset by visionRange and measure screen distance
      const edgePos = this._screenPos.clone();
      edgePos.set(pos.x + visionRange, worldY, -pos.y);
      edgePos.project(this.camera);
      const edgeSx = (edgePos.x + 1) / 2 * W;
      const radiusPx = Math.abs(edgeSx - sx);

      // Radial gradient cutout
      const gradient = ctx.createRadialGradient(sx, sy, radiusPx * 0.6, sx, sy, radiusPx);
      gradient.addColorStop(0, 'rgba(0,0,0,1)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(sx, sy, radiusPx, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';

    // Draw fog onto HUD canvas
    const hudCtx = this.hudCtx;
    if (hudCtx) {
      hudCtx.drawImage(this.fogCanvas, 0, 0);
    }
  }

   private drawHealthBars(): void {
    const ctx = this.hudCtx;
    const cam = this.camera;
    if (!ctx || !cam || !this.hudCanvas) return;

    const W = this.hudCanvas.width;
    const H = this.hudCanvas.height;
    ctx.clearRect(0, 0, W, H);

    const BAR_W  = 40;
    const BAR_H  = 5;
    const BAR_Y_OFFSET = -8;

    for (const entity of this.world.entities.values()) {
      if (!entity.active) continue;

      const pos  = this.world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      const hp   = this.world.getComponent<any>(entity.id, 'health');
      const ut   = this.world.getComponent<any>(entity.id, 'unitType');
      const team = this.world.getComponent<any>(entity.id, 'team');
      const dead = this.world.getComponent<any>(entity.id, 'dead');
      if (!pos || !hp || hp.maxHp <= 0) continue;

      const isHero = ut?.type === 'hero';

      // For dead heroes — show respawn countdown at their spawn position
      if (dead && isHero) {
        const inv   = this.world.getComponent<any>(entity.id, InventoryComponentId);
        const spawn = this.world.getComponent<any>(entity.id, 'respawn');
        if (!spawn) continue;
        const respawnMs = ((inv?.level ?? 1) * 2 + 4) * 1000;
        const elapsed   = Date.now() - dead.diedAt;
        const remaining = Math.max(0, Math.ceil((respawnMs - elapsed) / 1000));
        this._screenPos.set(spawn.spawnX, pos.z * ELEVATION_SCALE + 80, -spawn.spawnY);
        this._screenPos.project(cam);
        if (this._screenPos.z > 1) continue;
        const sx = ( this._screenPos.x + 1) / 2 * W;
        const sy = (-this._screenPos.y + 1) / 2 * H;
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(`Respawn ${remaining}s`, sx - 28, sy + 1);
        ctx.fillStyle = '#ffaa44';
        ctx.fillText(`Respawn ${remaining}s`, sx - 28, sy);
        continue;
      }
      if (dead) continue; // non-hero dead units don't render

      // Project world position to screen
      const worldY = pos.z * ELEVATION_SCALE + (isHero ? 80 : 50);
      this._screenPos.set(pos.x, worldY, -pos.y);
      this._screenPos.project(cam);

      if (this._screenPos.z > 1) continue;
      const sx = ( this._screenPos.x + 1) / 2 * W;
      const sy = (-this._screenPos.y + 1) / 2 * H + BAR_Y_OFFSET;
      if (sx < -BAR_W || sx > W + BAR_W || sy < 0 || sy > H) continue;

      const pct = hp.hp / hp.maxHp;
      const bx  = sx - BAR_W / 2;

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, sy - 1, BAR_W + 2, BAR_H + 2);

      const isSelected = entity.id === this.selectedId;
      const isRadiant   = team?.team === 'radiant';
      ctx.fillStyle = isSelected ? '#ffd700'
        : pct > 0.5 ? '#22cc22'
        : pct > 0.25 ? '#ddaa00' : '#cc2222';
      ctx.fillRect(bx, sy, BAR_W * pct, BAR_H);

      ctx.fillStyle = isRadiant ? '#4a9eff' : '#ff4a4a';
      ctx.fillRect(bx - 3, sy, 2, BAR_H);
    }

    this.drawMinimap(ctx, W, H);
    this.drawDamageNumbers(ctx);
  }

  private drawDamageNumbers(ctx: CanvasRenderingContext2D): void {
    const now  = performance.now();
    const LIFE = 1200; // ms
    ctx.font   = 'bold 13px monospace';

    this._dmgNums = this._dmgNums.filter(n => now - n.born < LIFE);

    for (const n of this._dmgNums) {
      const progress = (now - n.born) / LIFE;
      ctx.globalAlpha = 1 - progress;
      ctx.fillStyle   = n.color;
      ctx.fillText(n.text, n.x + (Math.random() * 2 - 1), n.y - 40 * progress);
    }
    ctx.globalAlpha = 1;
  }

  private gameClockMs  = 0;
  private killFeedSeq  = 0;
  private killsRadiant = 0;
  private killsDire    = 0;

  /** Called each tick to process death events for kill feed + scoreboard. */
  private dmgNumSeq = 0;
  _dmgNums: UIState['damageNumbers'] = [];

  private processHitsForUI(): void {
    for (const evt of this.combatSystem.hitEvents) {
      const pos = this.world.getComponent<PositionComponent>(evt.targetId, PositionComponentId);
      if (!pos || !this.camera || !this.hudCanvas) continue;
      this._screenPos.set(pos.x, pos.z * ELEVATION_SCALE + 80, -pos.y);
      this._screenPos.project(this.camera);
      if (this._screenPos.z > 1) continue;
      const sx = ( this._screenPos.x + 1) / 2 * this.hudCanvas.width;
      const sy = (-this._screenPos.y + 1) / 2 * this.hudCanvas.height;
      const color = evt.damageType === 'magical' ? '#88aaff' : '#ffffff';
      this._dmgNums.push({ id: ++this.dmgNumSeq, text: String(evt.damage), x: sx, y: sy, color, born: performance.now() });
      if (this._dmgNums.length > 30) this._dmgNums.shift();
    }
  }

  private processDeathsForUI(): void {
    for (const evt of this.combatSystem.deathEvents) {
      const ut   = this.world.getComponent<any>(evt.entityId, 'unitType');
      const team = this.world.getComponent<any>(evt.entityId, 'team');
      const name = ut?.subtype || ut?.type || '?';

      // Kill score
      if (team?.team === 'radiant') this.killsDire++;
      else this.killsRadiant++;

      // Kill feed text
      const killerUT = evt.killerId
        ? this.world.getComponent<any>(evt.killerId, 'unitType')
        : null;
      const killerName = killerUT?.subtype || killerUT?.type || 'environment';
      const color = team?.team === 'radiant' ? C.dire : C.radiant;
      const text  = `${killerName} killed ${name}`;
      const id    = ++this.killFeedSeq;

      this.setUI(s => ({
        ...s,
        killsRadiant: this.killsRadiant,
        killsDire: this.killsDire,
        killFeed: [...s.killFeed.slice(-4), { id, text, color }],
      }));

      // Auto-dismiss after 5 s
      setTimeout(() => {
        this.setUI(s => ({ ...s, killFeed: s.killFeed.filter(e => e.id !== id) }));
      }, 5000);
    }
  }

  private syncHudStats(dtMs: number): void {
    this.gameClockMs += dtMs;
    const clockSec = Math.floor(this.gameClockMs / 1000);

    if (!this.localHeroId) return;

    const inv  = this.world.getComponent<any>(this.localHeroId, InventoryComponentId);
    const hp   = this.world.getComponent<any>(this.localHeroId, 'health');
    const ut   = this.world.getComponent<any>(this.localHeroId, 'unitType');
    const ab   = this.world.getComponent<AbilityComponent>(this.localHeroId, AbilityComponentId);
    const dead = this.world.hasComponent(this.localHeroId, 'dead');

    const heroName = dead
      ? `${ut?.subtype ?? '?'} (respawning...)`
      : ut?.subtype ?? null;

    // Build ability bar data
    const abilities: UIState['abilities'] = [];
    if (ab) {
      const now = this.gameClockMs; // use local clock for CD display
      for (const slot of ab.slots) {
        const def = ABILITY_BY_ID.get(slot.abilityId);
        if (!def) continue;
        const cdTotal = def.cooldownPerLevel[Math.max(0, slot.level - 1)] ?? 1;
        const cdRemaining = Math.max(0, slot.cooldownEndsAt - now);
        abilities.push({
          name:        def.name,
          key:         ['Q','W','E','R'][def.slot],
          cooldownPct: cdTotal > 0 ? cdRemaining / cdTotal : 0,
          manaCost:    def.manaCostPerLevel[Math.max(0, slot.level - 1)] ?? 0,
          level:       slot.level,
        });
      }
    }

    this.setUI(s => ({
      ...s,
      gameClock:    clockSec,
      selectedHero: heroName,
      gold:         Math.floor(inv?.gold ?? s.gold),
      level:        inv?.level ?? s.level,
      xp:           inv?.xp ?? s.xp,
      xpToNext:     inv?.xpToNextLevel ?? s.xpToNext,
      heroHp:       hp?.hp    ?? s.heroHp,
      heroMaxHp:    hp?.maxHp ?? s.heroMaxHp,
      heroMana:     hp?.mana  ?? s.heroMana,
      heroMaxMana:  hp?.maxMana ?? s.heroMaxMana,
      abilities,
      skillPoints: ab?.skillPoints ?? 0,
      items: inv?.items ?? s.items,
    }));
  }

  // ── Networking ────────────────────────────────────────────────────────────

  /** Called from the Lobby screen when player clicks Play. */
  joinRoom(roomId: string, playerName: string, heroKey: string): void {
    // If already connected, disconnect first
    this.netClient?.disconnect();
    this.netClient = null;
    this.networkMode = false;

    // Override local hero key if it differs from picked hero
    const localRec = this.localHeroId ? this.entities.get(this.localHeroId) : null;
    if (localRec && localRec.heroKey !== heroKey) {
      // Re-spawn with the chosen hero (simplified — just update heroKey for now)
      localRec.heroKey = heroKey;
    }

    this.initNetwork(roomId, playerName, heroKey);
  }

  private initNetwork(
    roomOverride?: string,
    nameOverride?: string,
    heroOverride?: string
  ): void {
    const proto    = location.protocol === 'https:' ? 'wss' : 'ws';
    const roomId   = roomOverride ?? new URLSearchParams(location.search).get('room') ?? 'default';
    const clientId = `client_${Math.random().toString(36).slice(2, 9)}`;
    const url      = `${proto}://${location.host}/ws?room=${encodeURIComponent(roomId)}&clientId=${clientId}`;

    const client   = new GameClient(url);
    const heroKey  = heroOverride ?? (this.localHeroId ? this.entities.get(this.localHeroId)?.heroKey : 'axe') ?? 'axe';
    const name     = nameOverride ?? clientId;

    client.on('connected', () => {
      this.networkMode = true;
      this.setUI(s => ({ ...s, networkConnected: true, status: 'Connected to server' }));
      setTimeout(() => this.setUI(s => ({ ...s, status: '' })), 2000);

      // Join the room
      client.sendJoin(clientId, name);
      client.sendPickHero(heroKey);
    });

    client.on('disconnected', () => {
      this.networkMode = false;
      this.setUI(s => ({ ...s, networkConnected: false, status: 'Disconnected — reconnecting...' }));
    });

    client.on('full_snapshot', (snap) => {
      // Apply full snapshot to update server-controlled entities
      // Local hero keeps its client-side predicted position
      this.applyServerSnapshot(snap.ents ?? [], true);
    });

    client.on('delta_snapshot', (snap) => {
      this.clientTick = snap.tick;
      client.advanceTick();
      this.applyServerSnapshot(snap.updates ?? [], false);

      // Destroy server-removed entities (non-local only)
      for (const id of snap.destroys ?? []) {
        if (id === this.localHeroId) continue; // never destroy local hero
        const entity = this.world.getEntity(id);
        if (entity) entity.active = false;
      }
    });

    client.on('death_event', (evt) => {
      // Server confirmed a death — mark entity dead if we haven't already
      const entity = this.world.getEntity(evt.eid);
      if (entity && !this.world.hasComponent(evt.eid, 'dead')) {
        this.world.addComponent(evt.eid, { componentId: 'dead', diedAt: Date.now() } as any);
      }
    });

    client.connect();
    this.netClient = client;
  }

  private applyServerSnapshot(entities: EntityState[], isFull: boolean): void {
    for (const es of entities) {
      // Never overwrite local hero position (prediction)
      const isLocalHero = es.id === this.localHeroId;

      const existing = this.world.getEntity(es.id);
      if (!existing) {
        // New entity from server — create in ECS if not a hero we track visually
        if (es.ut === 'creep' || es.ut === 'tower') {
          const e = this.world.createEntity(es.id);
          this.world.addComponent(e.id, { componentId: 'position', x: es.x, y: es.y, z: es.z, rotation: es.rot } as any);
          this.world.addComponent(e.id, { componentId: 'team', team: es.team } as any);
          this.world.addComponent(e.id, { componentId: 'unitType', type: es.ut, subtype: es.sub } as any);
          this.world.addComponent(e.id, { componentId: 'health', hp: es.hp, maxHp: es.mhp, mana: es.mp, maxMana: es.mmp } as any);
        }
      } else if (!isLocalHero) {
        // Update existing non-local entity
        const pos = this.world.getComponent<any>(es.id, 'position');
        if (pos) { pos.x = es.x; pos.y = es.y; pos.z = es.z; pos.rotation = es.rot; }
        const hp = this.world.getComponent<any>(es.id, 'health');
        if (hp) { hp.hp = es.hp; hp.maxHp = es.mhp; hp.mana = es.mp; hp.maxMana = es.mmp; }
        if (es.dead && !this.world.hasComponent(es.id, 'dead')) {
          this.world.addComponent(es.id, { componentId: 'dead', diedAt: Date.now() } as any);
        }
      } else if (isLocalHero) {
        // Reconciliation: server confirmed position — replay unACK'd commands
        const pos = this.world.getComponent<any>(es.id, 'position');
        if (pos && isFull) {
          // On full snapshot, trust server completely
          pos.x = es.x; pos.y = es.y; pos.z = es.z;
          this.prediction.clear();
        }
        // Delta: don't overwrite — local prediction is more responsive
      }
    }
    void isFull;
  }

  centerOnHero(): void {
    const id = this.selectedId ?? this.localHeroId;
    if (!id) return;
    const pos = this.world.getComponent<PositionComponent>(id, PositionComponentId);
    if (pos) this.cameraCtrl?.centerOn(pos.x, pos.y);
  }

  buyItem(itemId: string): void {
    if (!this.localHeroId) return;
    const inv = this.world.getComponent<any>(this.localHeroId, InventoryComponentId);
    if (!inv) return;
    const def = ITEM_BY_ID.get(itemId);
    if (!def) return;
    if (inv.gold < def.cost) return;
    const slot = inv.items.findIndex((s: string | null) => s === null);
    if (slot === -1) return; // no free slots

    inv.gold -= def.cost;
    inv.items[slot] = itemId;

    // Apply stat bonuses
    const hp = this.world.getComponent<any>(this.localHeroId, 'health');
    const combat = this.world.getComponent<any>(this.localHeroId, 'combat');
    if (hp) {
      if (def.bonuses.hp)   { hp.maxHp   += def.bonuses.hp;   hp.hp   = Math.min(hp.hp + def.bonuses.hp, hp.maxHp); }
      if (def.bonuses.mana) { hp.maxMana += def.bonuses.mana; hp.mana = Math.min(hp.mana + def.bonuses.mana, hp.maxMana); }
    }
    if (combat) {
      if (def.bonuses.damageMin) { combat.damageMin += def.bonuses.damageMin; combat.damageMax += def.bonuses.damageMax ?? 0; }
      if (def.bonuses.armor)     combat.armor += def.bonuses.armor;
    }
    // Forward to server
    if (this.networkMode && this.netClient) {
      this.netClient.sendBuyItem(itemId);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.cameraCtrl?.dispose();
    this.inputMgr?.dispose();
    this.mouseTracker?.dispose();
    this.renderer?.dispose();
  }

  private handleHudCanvasClick(e: MouseEvent): void {
    if (!this.hudCanvas || !this.cameraCtrl) return;
    const W    = this.hudCanvas.width;
    const H    = this.hudCanvas.height;
    const SIZE = Math.min(W, H) * 0.18;
    const PAD  = 10;
    const mx   = PAD;
    const my   = H - SIZE - PAD;
    const cx   = e.clientX * (W / this.hudCanvas.clientWidth);
    const cy   = e.clientY * (H / this.hudCanvas.clientHeight);

    // Only handle clicks inside the minimap rect
    if (cx < mx || cx > mx + SIZE || cy < my || cy > my + SIZE) return;

    e.stopPropagation();
    const MAP = 20928;
    const nx  = (cx - mx) / SIZE;             // 0→1 left→right
    const ny  = (cy - my) / SIZE;             // 0→1 top→bottom
    const gameX = nx * MAP - MAP / 2;
    const gameY = -(ny * MAP - MAP / 2);      // flip Y (top=Dire=+Y)
    this.cameraCtrl.centerOn(gameX, gameY);
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const SIZE   = Math.min(W, H) * 0.18; // 18% of smaller dimension
    const PAD    = 10;
    const mx     = PAD;
    const my     = H - SIZE - PAD;
    const MAP    = 20928; // world units

    // Background
    ctx.fillStyle = 'rgba(10,18,28,0.85)';
    ctx.strokeStyle = 'rgba(80,120,180,0.6)';
    ctx.lineWidth = 1;
    ctx.fillRect(mx, my, SIZE, SIZE);
    ctx.strokeRect(mx, my, SIZE, SIZE);

    const toScreen = (gx: number, gy: number): [number, number] => {
      // game X → minimap X (left=-10464, right=+10464)
      // game Y → minimap Y (bottom=-10464=Radiant, top=+10464=Dire)
      const nx = (gx + MAP / 2) / MAP;
      const ny = 1 - (gy + MAP / 2) / MAP; // flip Y so Radiant is at bottom
      return [mx + nx * SIZE, my + ny * SIZE];
    };

    // Draw river diagonal hint
    ctx.strokeStyle = 'rgba(42,90,122,0.5)';
    ctx.lineWidth = SIZE * 0.04;
    ctx.beginPath();
    const [r0x, r0y] = toScreen(-MAP / 2, MAP / 2);
    const [r1x, r1y] = toScreen(MAP / 2, -MAP / 2);
    ctx.moveTo(r0x, r0y); ctx.lineTo(r1x, r1y);
    ctx.stroke();
    ctx.lineWidth = 1;

    // Draw towers
    for (const entity of this.world.entities.values()) {
      if (!entity.active) continue;
      const ut   = this.world.getComponent<any>(entity.id, 'unitType');
      const pos  = this.world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      const team = this.world.getComponent<any>(entity.id, 'team');
      const hp   = this.world.getComponent<any>(entity.id, 'health');
      if (ut?.type !== 'tower' || !pos || !team) continue;

      const [sx, sy] = toScreen(pos.x, pos.y);
      const alive = !hp || hp.hp > 0;
      ctx.fillStyle = alive
        ? (team.team === 'radiant' ? C.radiant : C.dire)
        : 'rgba(80,80,80,0.5)';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }

    // Draw creeps
    for (const entity of this.world.entities.values()) {
      if (!entity.active) continue;
      const laneAI = this.world.getComponent<any>(entity.id, 'laneAI');
      const pos    = this.world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      const team   = this.world.getComponent<any>(entity.id, 'team');
      if (!laneAI || !pos || !team) continue;
      const [sx, sy] = toScreen(pos.x, pos.y);
      ctx.fillStyle = team.team === 'radiant' ? C.radiant : C.dire;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw heroes
    for (const [id, rec] of this.entities) {
      const pos  = this.world.getComponent<PositionComponent>(id, PositionComponentId);
      const dead = this.world.hasComponent(id, 'dead');
      if (!pos) continue;
      const [sx, sy] = toScreen(pos.x, pos.y);
      const isLocal = id === this.localHeroId;
      ctx.fillStyle = dead ? '#555'
        : rec.team === 'radiant' ? C.radiant : C.dire;
      ctx.beginPath();
      ctx.arc(sx, sy, isLocal ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (isLocal) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
  }
} // end class Game

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

// UI root (HUD: pointer-events:none so clicks pass to canvas below)
const uiRoot = document.createElement('div');
uiRoot.id = 'ui-root';
uiRoot.style.cssText =
  'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
document.body.appendChild(uiRoot);

// Modal root (Lobby/Shop: pointer-events:auto, hidden when no modal open)
const modalRoot = document.createElement('div');
modalRoot.id = 'modal-root';
modalRoot.style.cssText =
  'position:absolute;top:0;left:0;width:100%;height:100%;z-index:20;display:none;';
document.body.appendChild(modalRoot);

let updateUI: ((fn: (prev: UIState) => UIState) => void) | null = null;

/** Show/hide the modal root DOM element based on whether any modal is open */
function setModalVisible(visible: boolean): void {
  modalRoot.style.display = visible ? 'block' : 'none';
}

// ── Modal component (rendered into modalRoot — separate React tree) ─────────
function ModalUI(): React.ReactElement | null {
  const [lobby, setLobby] = React.useState(false);
  const [shop, setShop]   = React.useState(false);
  const [shopGold, setShopGold] = React.useState(600);
  const [shopItems, setShopItems] = React.useState<Array<string|null>>([null,null,null,null,null,null]);

  // Expose controls globally
  React.useEffect(() => {
    (window as any).__showLobby = () => { setLobby(true); setModalVisible(true); };
    (window as any).__hideLobby = () => { setLobby(false); setModalVisible(false); };
    (window as any).__showShop  = (gold: number, items: Array<string|null>) => {
      setShopGold(gold); setShopItems(items); setShop(true); setModalVisible(true);
    };
    (window as any).__hideShop  = () => { setShop(false); setModalVisible(false); };
  }, []);

  if (!lobby && !shop) return null;

  return (
    <>
      {lobby && (
        <LobbyScreen onJoin={(room, name, hero) => {
          setLobby(false); setModalVisible(false);
          gameRef?.joinRoom(room, name, hero);
        }} />
      )}
      {shop && (
        <Shop
          gold={shopGold}
          items={shopItems}
          onBuy={(itemId) => { setShop(false); setModalVisible(false); gameRef?.buyItem(itemId); }}
          onClose={() => { setShop(false); setModalVisible(false); }}
        />
      )}
    </>
  );
}

function Root() {
  const [ui, setUI] = React.useState<UIState>({
    status: 'Initializing...', mouseCoord: '',
    gameClock: 0, killsRadiant: 0, killsDire: 0,
    networkConnected: false, lobbyVisible: false,
    selectedHero: null, heroHp: 600, heroMaxHp: 600, heroMana: 200, heroMaxMana: 200,
    gold: 600, level: 1, xp: 0, xpToNext: 230,
    abilities: [], skillPoints: 0, items: [null,null,null,null,null,null],
    shopOpen: false, scoreboardOpen: false,
    killFeed: [], damageNumbers: [],
  });
  React.useEffect(() => {
    updateUI = setUI;
    return () => { updateUI = null; };
  }, []);
  return <HUD ui={ui} onSetUI={(p: Partial<UIState> & { _buyItem?: string; _joinRoom?: { room: string; name: string; hero: string } }) => {
    if (p._buyItem)   { gameRef?.buyItem(p._buyItem); return; }
    if (p._joinRoom)  { gameRef?.joinRoom(p._joinRoom.room, p._joinRoom.name, p._joinRoom.hero); return; }
    setUI(s => ({ ...s, ...p }));
  }} />;
}

createRoot(uiRoot).render(<Root />);
createRoot(modalRoot).render(<ModalUI />);

// Canvas
const container = document.querySelector<HTMLDivElement>('#app')!;
container.style.cssText = 'position:relative;width:100vw;height:100vh;overflow:hidden;background:#1a1a2e;';

const canvas = document.createElement('canvas');
canvas.id = 'game-canvas';
canvas.style.cssText = 'display:block;width:100%;height:100%;';
canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;
container.appendChild(canvas);

window.addEventListener('resize', () => {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
});

window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); gameRef?.centerOnHero(); }
  if (e.code === 'KeyB') {
    e.preventDefault();
    const inv = gameRef?.localHeroId
      ? gameRef.world.getComponent<any>(gameRef.localHeroId, 'inventory')
      : null;
    (window as any).__showShop?.(inv?.gold ?? 600, inv?.items ?? [null,null,null,null,null,null]);
  }
  if (e.code === 'Tab')   { e.preventDefault(); updateUI?.(s => ({ ...s, scoreboardOpen: true })); }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Tab') { updateUI?.(s => ({ ...s, scoreboardOpen: false })); }
});

let gameRef: Game | null = null;
const game = new Game();
gameRef = game;
game.setUIUpdater(fn => updateUI?.(fn));

game.init(canvas).catch(err => {
  console.error('Game init failed:', err);
  updateUI?.(s => ({ ...s, status: 'Error — check console.' }));
});
