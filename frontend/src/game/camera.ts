/**
 * camera.ts — simple top-down perspective camera controller.
 *
 * Controls:
 *   WASD / arrow keys   pan
 *   Scroll wheel        zoom (change camera height)
 *   Mouse edge scroll   pan (after first mouse move)
 *   Space               center on target position
 */

import * as THREE from 'three';

const PAN_SPEED_BASE   = 0.6;   // fraction of view-width per second
const ZOOM_FACTOR      = 0.12;
const HEIGHT_MIN       = 1000;
const HEIGHT_MAX       = 40000;
const EDGE_MARGIN      = 40;    // px

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  private targetX    = 0;
  private targetZ    = 0;   // game Y maps to Three.js Z
  private height     = 14000;

  private keys       = new Set<string>();
  private mouseX     = 0;
  private mouseY     = 0;
  private edgeScroll = false; // enabled after first mouse move

  private cleanup: Array<() => void> = [];

  constructor(
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    x = 0, z = 0, height = 14000
  ) {
    this.camera   = camera;
    this.renderer = renderer;
    this.targetX  = x;
    this.targetZ  = z;
    this.height   = height;
    this.apply();
    this.listen();
  }

  // ── public ──────────────────────────────────────────────────────────────

  update(dtSec: number): void {
    const speed = this.height * PAN_SPEED_BASE * dtSec;

    let dx = 0, dz = 0;

    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    dz -= 1;  // screen-up = -Z (toward Dire in Three space)
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  dz += 1;

    if (this.edgeScroll) {
      const w = window.innerWidth, h = window.innerHeight;
      if (this.mouseX < EDGE_MARGIN)      dx -= 1;
      if (this.mouseX > w - EDGE_MARGIN)  dx += 1;
      if (this.mouseY < EDGE_MARGIN)      dz -= 1;
      if (this.mouseY > h - EDGE_MARGIN)  dz += 1;
    }

    if (dx !== 0 || dz !== 0) {
      const len = Math.sqrt(dx * dx + dz * dz);
      this.targetX += (dx / len) * speed;
      this.targetZ += (dz / len) * speed;
      this.clamp();
      this.apply();
    }
  }

  /** Center on game world coordinates (gameX, gameY). */
  centerOn(gameX: number, gameY: number): void {
    this.targetX = gameX;
    this.targetZ = -gameY;  // game Y → Three -Z
    this.clamp();
    this.apply();
  }

  onResize(w: number, h: number): void {
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  get position() { return { x: this.targetX, z: this.targetZ }; }

  dispose(): void {
    this.cleanup.forEach(f => f());
  }

  // ── private ─────────────────────────────────────────────────────────────

  private apply(): void {
    this.camera.position.set(this.targetX, this.height, this.targetZ);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(this.targetX, 0, this.targetZ);
  }

  private clamp(): void {
    const M = 10464;
    this.targetX = Math.max(-M, Math.min(M, this.targetX));
    this.targetZ = Math.max(-M, Math.min(M, this.targetZ));
  }

  private zoom(dir: number): void {
    const f = dir > 0 ? 1 + ZOOM_FACTOR : 1 - ZOOM_FACTOR;
    this.height = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, this.height * f));
    this.apply();
  }

  private listen(): void {
    const kd = (e: KeyboardEvent) => this.keys.add(e.code);
    const ku = (e: KeyboardEvent) => this.keys.delete(e.code);
    const mm = (e: MouseEvent)    => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.edgeScroll = true;
    };
    const wh = (e: WheelEvent) => {
      e.preventDefault();
      this.zoom(e.deltaY > 0 ? 1 : -1);
    };

    window.addEventListener('keydown',   kd);
    window.addEventListener('keyup',     ku);
    window.addEventListener('mousemove', mm);
    window.addEventListener('wheel',     wh, { passive: false });

    this.cleanup.push(
      () => window.removeEventListener('keydown',   kd),
      () => window.removeEventListener('keyup',     ku),
      () => window.removeEventListener('mousemove', mm),
      () => window.removeEventListener('wheel',     wh),
    );
  }
}
