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
import { createDebugGrid, addLabel, MouseCoordTracker } from './game/debug';

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
  PositionComponentId,
  SelectionComponentId,
  UnitTypeComponentId,
  TeamComponentId,
  InventoryComponentId,
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
  level: number;
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

      {/* 2D canvas for health bars — drawn by game loop each frame */}
      <canvas id="hud-canvas" style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
      }} />

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
        lineHeight: 1.7,
      }}>
        <div>Gold: {ui.gold}</div>
        <div style={{ color: '#cc88ff' }}>Level: {ui.level}</div>
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
  private hudCanvas: HTMLCanvasElement | null = null;
  private hudCtx: CanvasRenderingContext2D | null = null;

  private heroLoader  = new HeroModelLoader('/heroes');
  private heroGroup: THREE.Group | null = null;
  private entities    = new Map<string, GameEntityRecord>();
  private entityMeshMap = new Map<string, string>();
  private selectedId: string | null = null;
  private localHeroId: string | null = null;

  // Creep + combat systems
  private creepSpawner: CreepSpawnerSystem | null = null;
  private creepAI      = new CreepAISystem();
  private towerAI      = new TowerAISystem();
  private combatSystem = new CombatSystem();
  private economySystem = new EconomySystem();
  private respawnSystem = new RespawnSystem();
  private separation   = new SeparationSystem();
  // Creep visuals — one InstancedMesh per team, updated each frame
  private creepMeshRadiant: THREE.InstancedMesh | null = null;
  private creepMeshDire:    THREE.InstancedMesh | null = null;
  private readonly MAX_CREEPS = 200; // max visible creeps per team

  // Smoothed render rotation per entity (interpolated toward pos.rotation each frame)
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
    this.world.registerSystem(this.movementSystem);
    this.world.registerSystem(this.animSystem);

    // Creep systems
    const laneWaypoints = parseLaneWaypoints(this.mapData.lanes);
    this.creepSpawner = new CreepSpawnerSystem(laneWaypoints);
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
      if (this.hudCanvas) {
        this.hudCanvas.width  = window.innerWidth;
        this.hudCanvas.height = window.innerHeight;
      }
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
    this.world.addComponent(entity.id, createCombatComponent(45, 55, 150, 1.7, 2));
    this.world.addComponent(entity.id, createPathComponent());
    this.world.addComponent(entity.id, createSelectionComponent(false));
    this.world.addComponent(entity.id, createInventoryComponent(600)); // starting gold
    this.world.addComponent(entity.id, createRespawnComponent(gameX, gameY)); // respawn here

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

      this.syncMeshes(dtSec, alpha);
      this.syncCreeps(alpha);
      this.syncHudStats();
      this.renderer?.render(this.scene!, this.camera!);
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
  }

  private lastGold = -1;
  private lastLevel = -1;
  private syncHudStats(): void {
    if (!this.localHeroId) return;
    const inv = this.world.getComponent<any>(this.localHeroId, InventoryComponentId);
    if (!inv) return;
    const g = Math.floor(inv.gold);
    const l = inv.level;
    if (g !== this.lastGold || l !== this.lastLevel) {
      this.lastGold  = g;
      this.lastLevel = l;
      this.setUI(s => ({ ...s, gold: g, level: l }));
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
    status: 'Initializing...', selectedHero: null, gold: 600, level: 1, mouseCoord: '',
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
