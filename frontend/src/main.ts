import './index.css';
import { createWorld, type Entity } from './ecs/world';
import { loadMapData } from './game/mapLoader';
import { createOrthographicCamera, createGameScene } from './game/engine';
import { HeroModelLoader } from './game/heroLoader';
import { MovementSystem, Pathfinding } from './systems/movement';
import { createPositionComponent, createVelocityComponent, createTeamComponent, createUnitTypeComponent, createHealthComponent, createPathComponent, PositionComponentId, VelocityComponentId, TeamComponentId, UnitTypeComponentId, PathComponentId, type Team } from './components/index';
import type { MapData } from './types/game';
import * as THREE from 'three';

interface GameEntity {
  mesh: THREE.Object3D;
  entity: Entity;
}

class Game {
  private world = createWorld();
  private mapData: MapData | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private gameEntities = new Map<string, GameEntity>();
  private terrain: THREE.Group | null = null;
  private buildings: THREE.Group | null = null;
  private treeMeshes: THREE.Group | null = null;
  private heroUnits: THREE.Group | null = null;
  private animationFrameId: number | null = null;
  private movementSystem: MovementSystem | null = null;
  private _pathfinding: Pathfinding | null = null;
  private heroLoader: HeroModelLoader;

  constructor() {
    this.heroLoader = new HeroModelLoader('/heroes');
  }

  getEntities() { return this.gameEntities; }
  getPathfinding() { return this._pathfinding; }
  getHeroLoader() { return this.heroLoader; }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const mapdataPath = '/mapdata';
    
    this.mapData = await loadMapData(mapdataPath);
    
    this.movementSystem = new MovementSystem(this.mapData.gridNav, this.mapData.elevation);
    this._pathfinding = new Pathfinding(this.mapData.gridNav);
    
    this.world.registerSystem(this.movementSystem);

    const aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera = createOrthographicCamera({
      frustumSize: 4096,
      aspect,
      near: -10000,
      far: 10000,
      rotation: 45,
      tilt: 45,
    });

    this.scene = createGameScene();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.createTerrain();
    this.createBuildings();
    this.createTrees();
    this.createHeroLayer();
    this.spawnInitialUnits();

    this.startGameLoop();
  }

  spawnHero(heroKey: string, team: Team, x: number, y: number): GameEntity | null {
    const heroMesh = this.heroLoader.createHeroInstance(heroKey);
    heroMesh.position.set(x, this.getElevationAt(x, y), y);
    
    const entity = this.world.createEntity();
    this.world.addComponent(entity.id, createPositionComponent(x, y, this.getElevationAt(x, y)));
    this.world.addComponent(entity.id, createVelocityComponent());
    this.world.addComponent(entity.id, createTeamComponent(team));
    this.world.addComponent(entity.id, createUnitTypeComponent('hero', heroKey));
    this.world.addComponent(entity.id, createHealthComponent(100, 100, 100, 100));
    this.world.addComponent(entity.id, createPathComponent());
    
    this.heroUnits?.add(heroMesh);
    this.gameEntities.set(entity.id, { mesh: heroMesh, entity });
    
    return this.gameEntities.get(entity.id);
  }

  private createHeroLayer(): void {
    this.heroUnits = new THREE.Group();
    this.heroUnits.name = 'heroes';
    this.scene?.add(this.heroUnits);
  }

  private spawnInitialUnits(): void {
    // Spawn radiant hero
    this.spawnHero('axe', 'radiant', -6800, -6800);
    this.spawnHero('pudge', 'radiant', -6600, -7000);
    
    // Spawn dire hero
    this.spawnHero('axe', 'dire', 6800, 6800);
    this.spawnHero('pudge', 'dire', 6600, 7000);
  }

  private createTerrain(): void {
    if (!this.scene || !this.mapData) return;

    this.terrain = new THREE.Group();
    this.terrain.name = 'terrain';

    const gridSize = 64;
    const mapExtent = 128;

    for (let x = -mapExtent; x < mapExtent; x += gridSize) {
      for (let y = -mapExtent; y < mapExtent; y += gridSize) {
        const height = this.getElevationAt(x, y);
        const color = height > 0 ? 0x2d4a3e : 0x1a3a2e;
        
        const geometry = new THREE.PlaneGeometry(gridSize - 2, gridSize - 2);
        const material = new THREE.MeshLambertMaterial({ color });
        const tile = new THREE.Mesh(geometry, material);
        
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(x, height * 16, y);
        
        this.terrain!.add(tile);
      }
    }

    this.scene.add(this.terrain);
  }

  private createBuildings(): void {
    if (!this.scene || !this.mapData) return;

    this.buildings = new THREE.Group();
    this.buildings.name = 'buildings';

    const buildingColors: Record<string, number> = {
      radiant: 0x4a9eff,
      dire: 0xff4a4a,
      neutral: 0x888888,
    };

    for (const building of this.mapData!.buildings) {
      const color = buildingColors[building.team] || 0x888888;
      
      const geometry = new THREE.BoxGeometry(64, 128, 64);
      const material = new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(geometry, material);
      
      mesh.position.set(building.x, building.z * 16 + 64, building.y);
      
      this.buildings!.add(mesh);
    }

    this.scene.add(this.buildings);
  }

  private createTrees(): void {
    if (!this.scene || !this.mapData) return;

    this.treeMeshes = new THREE.Group();
    this.treeMeshes.name = 'trees';

    for (const tree of this.mapData!.trees) {
      const geometry = new THREE.ConeGeometry(16, 64, 8);
      const material = new THREE.MeshLambertMaterial({ color: 0x228b22 });
      const mesh = new THREE.Mesh(geometry, material);
      
      mesh.position.set(tree.x, tree.z * 16 + 32, tree.y);
      
      this.treeMeshes!.add(mesh);
    }

    this.scene.add(this.treeMeshes);
  }

  getElevationAt(x: number, y: number): number {
    if (!this.mapData?.elevation) return 0;
    
    const gridSize = 64;
    const offset = -10432;
    const col = Math.floor((x - offset) / gridSize);
    const row = Math.floor((y - offset) / gridSize);
    
    if (row >= 0 && row < this.mapData.elevation.length) {
      if (col >= 0 && col < this.mapData.elevation[row].length) {
        return this.mapData.elevation[row][col];
      }
    }
    
    return 0;
  }

  private lastTime = 0;
  private tickRate = 30;
  private tickInterval = 1000 / this.tickRate;

  private startGameLoop(): void {
    this.lastTime = performance.now();

    const loop = () => {
      const now = performance.now();
      const elapsed = now - this.lastTime;

      if (elapsed >= this.tickInterval) {
        const dt = elapsed;
        this.lastTime = now - (elapsed % this.tickInterval);
        this.world.update(dt);
        this.syncEntities();
        this.updateRendering();
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private syncEntities(): void {
    for (const [id, gameEntity] of this.gameEntities) {
      const pos = this.world.getComponent(id, PositionComponentId);
      if (pos) {
        gameEntity.mesh.position.set(pos.x, pos.z, pos.y);
      }
    }
  }

  private updateRendering(): void {
    this.renderer?.render(this.scene!, this.camera!);
  }

  dispose(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.renderer?.dispose();
  }
}

let game: Game | null = null;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="game-container">
    <canvas id="game-canvas"></canvas>
    <div id="game-ui">
      <div id="loading">Loading map...</div>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

game = new Game();

game.init(canvas).then(() => {
  const loading = document.querySelector('#loading');
  if (loading) {
    loading.textContent = 'Game loaded!';
    setTimeout(() => loading.remove(), 1000);
  }
});

console.log('Dota 2 Toons initialized');
console.log('Available heroes:', game?.getHeroLoader().getAvailableHeroes().slice(0, 10), '...');