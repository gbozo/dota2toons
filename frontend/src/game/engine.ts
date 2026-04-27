import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Perspective camera — simple top-down view
// ---------------------------------------------------------------------------

export interface PerspectiveCameraConfig {
  fov?: number;       // degrees (default 50)
  aspect: number;
  near?: number;
  far?: number;
}

/**
 * Creates a perspective camera looking straight down at the map centre.
 * Height is set so the full map (20928 units wide) fits in view at default zoom.
 */
export function createPerspectiveCamera(cfg: PerspectiveCameraConfig): THREE.PerspectiveCamera {
  const fov    = cfg.fov  ?? 50;
  const near   = cfg.near ?? 100;
  const far    = cfg.far  ?? 80000;

  const camera = new THREE.PerspectiveCamera(fov, cfg.aspect, near, far);

  // Height to see the full 20928-unit map width at fov=50:
  //   half_width = 10464,  half_fov = 25 deg
  //   height = half_width / tan(half_fov) ≈ 10464 / 0.466 ≈ 22470
  // Start at 60 % of that for a comfortable initial zoom.
  const height = 14000;
  camera.position.set(0, height, 0);
  camera.up.set(0, 0, -1); // screen-right = +X, screen-up = -Z → game Y=-6938 (Radiant) maps to Three Z=+6938 = bottom
  camera.lookAt(0, 0, 0);

  return camera;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export interface SceneConfig {
  ambientLight?: number;
  directionalLight?: number;
}

export function createGameScene(config: SceneConfig = {}): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  scene.add(new THREE.AmbientLight(0xffffff, config.ambientLight ?? 0.6));

  const dir = new THREE.DirectionalLight(0xffffff, config.directionalLight ?? 0.8);
  dir.position.set(5000, 8000, 5000);
  dir.castShadow = false;
  scene.add(dir);

  return scene;
}
