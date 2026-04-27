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
import { createDebugGrid, addLabel, MouseCoordTracker } from './game/debug';

import {
  createPositionComponent,
  createVelocityComponent,
  createTeamComponent,
  createUnitTypeComponent,
  createHealthComponent,
  createPathComponent,
  createSelectionComponent,
  PositionComponentId,
  SelectionComponentId,
  UnitTypeComponentId,
  type PositionComponent,
  type SelectionComponent,
  type UnitTypeComponent,
} from './components/index';
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
  selectedHero: string | null;
  gold: number;
  mouseCoord: string;
}

function HUD({ ui, onSetUI }: { ui: UIState; onSetUI: (s: Partial<UIState>) => void }) {
  void onSetUI;
  return (
    <>
      {ui.status && (
        <div style={{
          position: 'absolute', top: 8, left: 8, color: '#fff',
          fontFamily: 'monospace', fontSize: '12px',
          background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 4,
          pointerEvents: 'none',
        }}>
          {ui.status}
        </div>
      )}

      {/* Debug: mouse coord + grid + elevation */}
      <div id="mouse-coord" style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        fontFamily: 'monospace', fontSize: '12px',
        background: 'rgba(0,0,0,0.7)', padding: '4px 14px', borderRadius: 4,
        pointerEvents: 'none', whiteSpace: 'nowrap', textAlign: 'center',
      }}>
        map: —
      </div>

      {ui.selectedHero && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          color: '#ffd700', fontFamily: 'monospace', fontSize: '13px',
          background: 'rgba(0,0,0,0.65)', padding: '6px 16px',
          borderRadius: 6, pointerEvents: 'none', border: '1px solid #ffd700',
        }}>
          {ui.selectedHero}
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 8, right: 12,
        color: '#ffd700', fontFamily: 'monospace', fontSize: '13px', pointerEvents: 'none',
      }}>
        Gold: {ui.gold}
      </div>

      <div style={{
        position: 'absolute', top: 8, right: 12,
        color: '#aaa', fontFamily: 'monospace', fontSize: '11px',
        pointerEvents: 'none', lineHeight: 1.7, textAlign: 'right',
      }}>
        Right-click: move / attack<br />
        Left-click: select<br />
        WASD / scroll: camera<br />
        Space: center on hero
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
  const geo = new THREE.RingGeometry(40, 50, 32);
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
// Game
// ---------------------------------------------------------------------------

class Game {
  private world          = createWorld();
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

  private heroLoader  = new HeroModelLoader('/heroes');
  private heroGroup: THREE.Group | null = null;
  private entities    = new Map<string, GameEntityRecord>();
  private entityMeshMap = new Map<string, string>();
  private selectedId: string | null = null;
  private localHeroId: string | null = null;

  // Smoothed render rotation per entity (interpolated toward pos.rotation each frame)
  private renderRotation = new Map<string, number>();

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
    this.world.registerSystem(this.movementSystem);
    this.world.registerSystem(this.animSystem);

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

    // Debug grid + labels
    this.scene.add(createDebugGrid());

    // Walkable cell overlay (debug)
    this.scene.add(createWalkableMesh(this.mapData.gridNav, this.mapData.elevation, objectBlocked));

    // Hero group
    this.heroGroup = new THREE.Group();
    this.heroGroup.name = 'heroes';
    this.scene.add(this.heroGroup);

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
      onAttack:  (id)   => console.log('attack →', id),
      onSelect:  (id)   => this.handleSelect(id),
      onAbility: (slot) => console.log('ability', slot),
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
      this.cameraCtrl?.onResize(window.innerWidth, window.innerHeight);
    });

    this.status('Game loaded!', true);
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
    this.world.addComponent(entity.id, createPathComponent());
    this.world.addComponent(entity.id, createSelectionComponent(false));

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

  // ── input handlers ────────────────────────────────────────────────────────

  private handleMove(threeX: number, threeZ: number): void {
    if (!this.selectedId || !this.pathfinding) return;
    const pos = this.world.getComponent<PositionComponent>(this.selectedId, PositionComponentId);
    if (!pos) return;
    // Convert Three.js hit point back to game coords: gameX=threeX, gameY=-threeZ
    const gameX = threeX;
    const gameY = -threeZ;
    const wps = this.pathfinding.findPath(pos.x, pos.y, gameX, gameY);
    if (!wps.length) return;
    const path = this.world.getComponent<any>(this.selectedId, 'path');
    if (!path) return;
    path.waypoints = wps;
    path.currentWaypointIndex = 0;
    path.reachedTarget = false;
    path.targetX = gameX;
    path.targetY = gameY;
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
  }

  // ── game loop ─────────────────────────────────────────────────────────────

  private startLoop(): void {
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      const frame = Math.min(now - this.lastFrame, 200);
      this.lastFrame = now;

      this.accumulator += frame;
      while (this.accumulator >= this.TICK) {
        this.world.update(this.TICK);
        this.accumulator -= this.TICK;
      }

      const dtSec = frame / 1000;
      this.cameraCtrl?.update(dtSec);
      this.animSystem.updateMixers(dtSec);
      this.inputMgr?.update(frame);

      this.syncMeshes(dtSec);
      this.renderer?.render(this.scene!, this.camera!);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  // Rotation turn speed: radians per second
  private readonly TURN_SPEED = Math.PI * 3; // 540°/s — snappy but not instant

  private syncMeshes(dtSec: number): void {
    for (const [id, rec] of this.entities) {
      const pos = this.world.getComponent<PositionComponent>(id, PositionComponentId);
      if (!pos) continue;
      const worldY = pos.z * ELEVATION_SCALE;
      rec.instance.root.position.set(pos.x, worldY, -pos.y);

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
      rec.label.position.set(pos.x, worldY + 350, -pos.y);
    }
  }

  centerOnHero(): void {
    const id = this.selectedId ?? this.localHeroId;
    if (!id) return;
    const pos = this.world.getComponent<PositionComponent>(id, PositionComponentId);
    if (pos) this.cameraCtrl?.centerOn(pos.x, pos.y);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.cameraCtrl?.dispose();
    this.inputMgr?.dispose();
    this.mouseTracker?.dispose();
    this.renderer?.dispose();
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

// UI root
const uiRoot = document.createElement('div');
uiRoot.style.cssText =
  'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
document.body.appendChild(uiRoot);

let updateUI: ((fn: (prev: UIState) => UIState) => void) | null = null;

function Root() {
  const [ui, setUI] = React.useState<UIState>({
    status: 'Initializing...', selectedHero: null, gold: 600, mouseCoord: '',
  });
  React.useEffect(() => {
    updateUI = setUI;
    return () => { updateUI = null; };
  }, []);
  return <HUD ui={ui} onSetUI={p => setUI(s => ({ ...s, ...p }))} />;
}

createRoot(uiRoot).render(<Root />);

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
});

let gameRef: Game | null = null;
const game = new Game();
gameRef = game;
game.setUIUpdater(fn => updateUI?.(fn));

game.init(canvas).catch(err => {
  console.error('Game init failed:', err);
  updateUI?.(s => ({ ...s, status: 'Error — check console.' }));
});
