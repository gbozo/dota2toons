/**
 * debug.ts
 *
 * Debug visualisation helpers:
 *   - World-space coordinate grid with axis labels
 *   - Mouse-world coordinate tracker (updates a div)
 */

import * as THREE from 'three';

const MAP_HALF  = 10464;
const GRID_STEP = 2000;   // grid line every 2000 world units
const LABEL_Y   = 20;     // height above ground for labels

// ── Sprite label (canvas texture) ──────────────────────────────────────────

function makeTextSprite(text: string, color = '#ffffff', size = 28): THREE.Sprite {
  const canvas  = document.createElement('canvas');
  canvas.width  = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 8);
  ctx.fill();
  ctx.font      = `bold ${size}px monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex  = new THREE.CanvasTexture(canvas);
  const mat  = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(600, 150, 1);
  return sprite;
}

// ── Grid ───────────────────────────────────────────────────────────────────

export function createDebugGrid(): THREE.Group {
  const group = new THREE.Group();
  group.name  = 'debug_grid';

  const matMinor = new THREE.LineBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.5 });
  const matMajor = new THREE.LineBasicMaterial({ color: 0x667788, transparent: true, opacity: 0.8 });
  const matAxis  = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });

  // Grid lines — use -v for Z (game Y → Three -Z)
  for (let v = -MAP_HALF; v <= MAP_HALF; v += GRID_STEP) {
    const isZero   = v === 0;
    const isMajor  = v % 4000 === 0;
    const mat      = isZero ? matAxis : isMajor ? matMajor : matMinor;

    // Lines along X (constant game-Y = v → Three Z = -v)
    const gx = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-MAP_HALF, 0, -v),
      new THREE.Vector3( MAP_HALF, 0, -v),
    ]);
    group.add(new THREE.Line(gx, mat));

    // Lines along Z (constant X = v)
    const gz = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(v, 0, -MAP_HALF),
      new THREE.Vector3(v, 0,  MAP_HALF),
    ]);
    group.add(new THREE.Line(gz, mat));
  }

  // Map boundary
  const corners = [
    [-MAP_HALF, 0, -MAP_HALF], [ MAP_HALF, 0, -MAP_HALF],
    [ MAP_HALF, 0,  MAP_HALF], [-MAP_HALF, 0,  MAP_HALF],
    [-MAP_HALF, 0, -MAP_HALF],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const borderGeo = new THREE.BufferGeometry().setFromPoints(corners);
  group.add(new THREE.Line(borderGeo, new THREE.LineBasicMaterial({ color: 0xff4400 })));

  const labelOffset = MAP_HALF + 400;
  for (let v = -MAP_HALF; v <= MAP_HALF; v += GRID_STEP) {
    if (v === 0) continue;
    const coord = v.toString();

    // X-axis labels (game Y = -MAP_HALF edge → Three Z = +MAP_HALF)
    const lx = makeTextSprite(coord, '#88ccff');
    lx.position.set(v, LABEL_Y, MAP_HALF + 200);
    group.add(lx);

    // Y-axis labels (left edge, X = -MAP_HALF)
    const ly = makeTextSprite(coord, '#ffcc88');
    ly.position.set(-labelOffset, LABEL_Y, -v);   // game Y=v → Three Z=-v
    group.add(ly);
  }

  // Axis name labels
  const lxName = makeTextSprite('X →', '#88ccff', 32);
  lxName.position.set(MAP_HALF + 600, LABEL_Y, MAP_HALF + 200);
  group.add(lxName);

  const lyName = makeTextSprite('Y ↑', '#ffcc88', 32);
  lyName.position.set(-labelOffset, LABEL_Y, -(MAP_HALF + 600));  // game Y=+MAX → Three Z=-MAX = top of screen
  group.add(lyName);

  // Origin
  const originSprite = makeTextSprite('(0,0)', '#ffffff', 32);
  originSprite.position.set(0, LABEL_Y, 0);
  group.add(originSprite);

  // Radiant / Dire markers at actual fountain positions
  const radiantLabel = makeTextSprite('RADIANT ●', '#4a9eff', 32);
  radiantLabel.position.set(-7456, LABEL_Y, 6938);   // game (-7456,-6938) → Three (-7456,y,+6938)
  group.add(radiantLabel);

  const direLabel = makeTextSprite('DIRE ●', '#ff4a4a', 32);
  direLabel.position.set(7408, LABEL_Y, -6848);   // game (7408,6848) → Three (7408,y,-6848)
  group.add(direLabel);

  return group;
}

// ── Object labels ──────────────────────────────────────────────────────────

/**
 * Adds a floating text label above an object in the scene.
 * Returns the sprite so the caller can remove it later.
 */
export function addLabel(
  scene: THREE.Scene,
  text: string,
  x: number, y: number, z: number,
  color = '#ffffff'
): THREE.Sprite {
  const sprite = makeTextSprite(text, color);
  sprite.position.set(x, y + 80, z);
  scene.add(sprite);
  return sprite;
}

// ── Mouse-world raycaster ──────────────────────────────────────────────────

export class MouseCoordTracker {
  private raycaster  = new THREE.Raycaster();
  private ndc        = new THREE.Vector2();
  private plane      = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0
  private target     = new THREE.Vector3();
  private camera:    THREE.Camera;
  private canvas:    HTMLCanvasElement;
  private displayEl: HTMLElement;
  private cleanup:   Array<() => void> = [];

  constructor(camera: THREE.Camera, canvas: HTMLCanvasElement, displayEl: HTMLElement) {
    this.camera    = camera;
    this.canvas    = canvas;
    this.displayEl = displayEl;

    const mm = (e: MouseEvent) => this.onMove(e);
    window.addEventListener('mousemove', mm);
    this.cleanup.push(() => window.removeEventListener('mousemove', mm));
  }

  private onMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    this.ndc.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (this.raycaster.ray.intersectPlane(this.plane, this.target)) {
      // Three X = game X, Three Z = -game Y
      const gameX = this.target.x;
      const gameY = -this.target.z;
      this.displayEl.textContent =
        `map: (${gameX.toFixed(0)}, ${gameY.toFixed(0)})`;
    }
  }

  dispose(): void {
    this.cleanup.forEach(f => f());
  }
}
