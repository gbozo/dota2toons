/**
 * game/input.ts
 *
 * Input manager for Dota 2 Toons.
 *
 * Tracks:
 *   - Mouse position (screen + normalised device coords)
 *   - Mouse button state (left / right)
 *   - Keyboard key state (code-based)
 *
 * Fires typed callbacks for:
 *   - onMoveCommand(worldX, worldY)        — right-click on walkable terrain
 *   - onAttackCommand(entityId)            — right-click on enemy mesh
 *   - onSelectEntity(entityId | null)      — left-click on unit / ground
 *   - onAbilityKey(slot)                   — Q/W/E/R pressed
 *   - onStop()                             — S pressed
 *   - onHold()                             — H pressed
 *
 * The movement cursor ring (green, fades out) is created and managed here.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MoveCallback     = (worldX: number, worldY: number) => void;
export type AttackCallback   = (entityId: string) => void;
export type SelectCallback   = (entityId: string | null) => void;
export type AbilityCallback  = (slot: 0 | 1 | 2 | 3) => void;
export type StopCallback     = () => void;

interface InputConfig {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  /** Terrain mesh used as the ground plane for raycasting. */
  terrainMesh: THREE.Object3D;
  /** Map from Three.js Object3D uuid → game entity id, for picking. */
  entityMeshMap: Map<string, string>;
  /** Scene — movement cursor ring is added here. */
  scene: THREE.Scene;
  onMove:    MoveCallback;
  onAttack:  AttackCallback;
  onSelect:  SelectCallback;
  onAbility: AbilityCallback;
  onStop:    StopCallback;
  onHold:    StopCallback;
}

// ---------------------------------------------------------------------------
// Cursor ring
// ---------------------------------------------------------------------------

function createCursorRing(): THREE.Mesh {
  const geo = new THREE.RingGeometry(28, 36, 24);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x44ff88,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ring.name = 'cursor_ring';
  return ring;
}

// ---------------------------------------------------------------------------
// InputManager
// ---------------------------------------------------------------------------

export class InputManager {
  // Raw input state
  private keys = new Set<string>();
  private mouseNDC = new THREE.Vector2();

  // Three.js tools
  private raycaster = new THREE.Raycaster();
  private camera: THREE.Camera;
  private canvas: HTMLCanvasElement;
  private terrainMesh: THREE.Object3D;
  private entityMeshMap: Map<string, string>;

  // Cursor ring
  private cursorRing: THREE.Mesh;
  private cursorFadeTimer = 0;
  private readonly CURSOR_FADE_DURATION = 800; // ms

  // Callbacks
  private onMove:    MoveCallback;
  private onAttack:  AttackCallback;
  private onSelect:  SelectCallback;
  private onAbility: AbilityCallback;
  private onStop:    StopCallback;
  private onHold:    StopCallback;

  private cleanupFns: Array<() => void> = [];

  constructor(cfg: InputConfig) {
    this.camera        = cfg.camera;
    this.canvas        = cfg.canvas;
    this.terrainMesh   = cfg.terrainMesh;
    this.entityMeshMap = cfg.entityMeshMap;
    this.onMove        = cfg.onMove;
    this.onAttack      = cfg.onAttack;
    this.onSelect      = cfg.onSelect;
    this.onAbility     = cfg.onAbility;
    this.onStop        = cfg.onStop;
    this.onHold        = cfg.onHold;

    this.cursorRing = createCursorRing();
    cfg.scene.add(this.cursorRing);

    this.attach();
  }

  // ---------------------------------------------------------------------------
  // Public queries
  // ---------------------------------------------------------------------------

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  // ---------------------------------------------------------------------------
  // Per-frame update — call every render frame with dt in ms
  // ---------------------------------------------------------------------------

  update(dtMs: number): void {
    // Fade cursor ring
    if (this.cursorRing.visible) {
      this.cursorFadeTimer -= dtMs;
      const t = Math.max(0, this.cursorFadeTimer / this.CURSOR_FADE_DURATION);
      (this.cursorRing.material as THREE.MeshBasicMaterial).opacity = t * 0.9;
      if (this.cursorFadeTimer <= 0) {
        this.cursorRing.visible = false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Event attachment
  // ---------------------------------------------------------------------------

  private attach(): void {
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onMouseDown = (e: MouseEvent) => {
      // Only act on clicks directly on the canvas
      if (e.target !== this.canvas) return;
      this.updateNDC(e);

      if (e.button === 2) {
        // Right-click — try entity pick first, then ground
        const entityId = this.pickEntity();
        if (entityId) {
          this.onAttack(entityId);
        } else {
          const hit = this.raycastGround();
          if (hit) {
            this.onMove(hit.x, hit.z); // Three.js Z = game Y
            this.showCursorRing(hit);
          }
        }
      } else if (e.button === 0) {
        // Left-click — select entity or deselect
        const entityId = this.pickEntity();
        this.onSelect(entityId);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      this.updateNDC(e);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      this.keys.add(e.code);
      switch (e.code) {
        case 'KeyQ': this.onAbility(0); break;
        case 'KeyW': this.onAbility(1); break;
        case 'KeyE': this.onAbility(2); break;
        case 'KeyR': this.onAbility(3); break;
        case 'KeyS': this.onStop();    break;
        case 'KeyH': this.onHold();    break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };

    this.canvas.addEventListener('contextmenu', onContextMenu);
    this.canvas.addEventListener('mousedown',   onMouseDown);
    window.addEventListener('mousemove',        onMouseMove);
    window.addEventListener('keydown',          onKeyDown);
    window.addEventListener('keyup',            onKeyUp);

    this.cleanupFns.push(
      () => this.canvas.removeEventListener('contextmenu', onContextMenu),
      () => this.canvas.removeEventListener('mousedown',   onMouseDown),
      () => window.removeEventListener('mousemove',        onMouseMove),
      () => window.removeEventListener('keydown',          onKeyDown),
      () => window.removeEventListener('keyup',            onKeyUp),
    );
  }

  // ---------------------------------------------------------------------------
  // Raycasting
  // ---------------------------------------------------------------------------

  private updateNDC(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseNDC.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    this.mouseNDC.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  }

  /** Returns the world-space intersection point on the terrain, or null. */
  private raycastGround(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);

    // Collect all descendants of terrainMesh to intersect
    const targets: THREE.Object3D[] = [];
    this.terrainMesh.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) targets.push(obj);
    });
    if ((this.terrainMesh as THREE.Mesh).isMesh) targets.push(this.terrainMesh);

    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length > 0) {
      return hits[0].point;
    }
    return null;
  }

  /**
   * Returns the game entity ID of the first entity mesh under the cursor,
   * or null if none.
   */
  private pickEntity(): string | null {
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);

    // Delegate to entityObjectMap (populated by InputManager.registerMesh)
    const targets = Array.from(this.entityObjects.values());
    if (targets.length === 0) return null;

    const hits = this.raycaster.intersectObjects(targets, true);
    if (hits.length === 0) return null;

    // Walk up to find the registered root
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj) {
      const id = this.entityMeshMap.get(obj.uuid);
      if (id) return id;
      obj = obj.parent;
    }
    return null;
  }

  /** Separate map: mesh uuid → Object3D (the root group, for raycasting) */
  private entityObjects = new Map<string, THREE.Object3D>();

  /**
   * Register a hero/unit root mesh for entity picking.
   * Call whenever a new entity mesh is added to the scene.
   */
  registerMesh(entityId: string, root: THREE.Object3D): void {
    this.entityMeshMap.set(root.uuid, entityId);
    this.entityObjects.set(entityId, root);

    // Also register all descendants
    root.traverse((child) => {
      this.entityMeshMap.set(child.uuid, entityId);
    });
  }

  unregisterMesh(entityId: string, root: THREE.Object3D): void {
    this.entityObjects.delete(entityId);
    this.entityMeshMap.delete(root.uuid);
    root.traverse((child) => {
      this.entityMeshMap.delete(child.uuid);
    });
  }

  // ---------------------------------------------------------------------------
  // Cursor ring
  // ---------------------------------------------------------------------------

  private showCursorRing(pos: THREE.Vector3): void {
    this.cursorRing.position.set(pos.x, pos.y + 4, pos.z);
    this.cursorRing.visible = true;
    this.cursorFadeTimer = this.CURSOR_FADE_DURATION;
    (this.cursorRing.material as THREE.MeshBasicMaterial).opacity = 0.9;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  dispose(): void {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
  }
}
