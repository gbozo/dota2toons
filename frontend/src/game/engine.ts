import * as THREE from 'three';

export type TickCallback = (dt: number, tick: number) => void;

export interface GameEngineConfig {
  tickRate: number;
  interpolate?: boolean;
}

export function useGameEngine(config: GameEngineConfig = { tickRate: 30 }) {
  let runningRef = false;
  let lastTimeRef = 0;
  const callbacksRef: TickCallback[] = [];
  let frameRef: number | null = null;
  let tickRef = 0;

  const registerTickCallback = (callback: TickCallback) => {
    callbacksRef.push(callback);
    return () => {
      const index = callbacksRef.indexOf(callback);
      if (index !== -1) {
        callbacksRef.splice(index, 1);
      }
    };
  };

  const start = () => {
    if (runningRef) return;
    runningRef = true;
    lastTimeRef = performance.now();
    
    const tickInterval = 1000 / config.tickRate;
    
    const loop = () => {
      if (!runningRef) return;
      
      const now = performance.now();
      const elapsed = now - lastTimeRef;
      
      if (elapsed >= tickInterval) {
        const dt = elapsed;
        lastTimeRef = now - (elapsed % tickInterval);
        
        for (const callback of callbacksRef) {
          callback(dt, tickRef + 1);
        }
        
        tickRef++;
      }
      
      frameRef = requestAnimationFrame(loop);
    };
    
    frameRef = requestAnimationFrame(loop);
  };

  const stop = () => {
    runningRef = false;
    if (frameRef) {
      cancelAnimationFrame(frameRef);
      frameRef = null;
    }
  };

  return {
    tick: tickRef,
    start,
    stop,
    running: runningRef,
    registerTickCallback,
  };
}

export interface CameraConfig {
  frustumSize: number;
  aspect: number;
  near: number;
  far: number;
  rotation: number;
  tilt: number;
}

export function createOrthographicCamera(config: CameraConfig): THREE.OrthographicCamera {
  const { 
    frustumSize = 2048, 
    aspect = 16 / 9, 
    near = -10000, 
    far = 10000,
    rotation = 45,
    tilt = 45
  } = config;

  const camera = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    -frustumSize / 2,
    near,
    far
  );

  const rotationRad = (rotation * Math.PI) / 180;
  const tiltRad = (tilt * Math.PI) / 180;
  
  const distance = frustumSize * 1.5;
  camera.position.set(
    distance * Math.sin(rotationRad) * Math.cos(tiltRad),
    distance * Math.sin(tiltRad),
    distance * Math.cos(rotationRad) * Math.cos(tiltRad)
  );
  camera.lookAt(0, 0, 0);

  return camera;
}

export interface RendererConfig {
  width: number;
  height: number;
  antialias?: boolean;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  config: RendererConfig
): THREE.WebGLRenderer {
  const { width, height, antialias = true } = config;
  
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias,
    alpha: true,
  });
  
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  return renderer;
}

export interface SceneConfig {
  ambientLight?: number;
  directionalLight?: number;
}

export function createGameScene(config: SceneConfig = {}): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  const ambientLight = new THREE.AmbientLight(0xffffff, config.ambientLight ?? 0.4);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, config.directionalLight ?? 0.8);
  directionalLight.position.set(1000, 2000, 1000);
  directionalLight.castShadow = true;
  
  const shadowSize = 4096;
  directionalLight.shadow.mapSize.width = shadowSize;
  directionalLight.shadow.mapSize.height = shadowSize;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 5000;
  directionalLight.shadow.camera.left = -2000;
  directionalLight.shadow.camera.right = 2000;
  directionalLight.shadow.camera.top = 2000;
  directionalLight.shadow.camera.bottom = -2000;
  
  scene.add(directionalLight);

  return scene;
}