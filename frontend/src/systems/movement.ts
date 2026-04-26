import type { World, System } from '../ecs/world';
import {
  PositionComponentId,
  VelocityComponentId,
  PathComponentId,
  UnitTypeComponentId,
  type PositionComponent,
  type VelocityComponent,
  type PathComponent,
  type UnitTypeComponent,
} from '../components/index';

export class MovementSystem implements System {
  readonly name = 'movement';

  private gridNavData: Set<string> = new Set();
  private elevationData: Map<string, number> = new Map();

  constructor(
    gridNavData?: Array<{ x: number; y: number }>,
    elevationData?: Array<Array<number>>
  ) {
    if (gridNavData) {
      for (const point of gridNavData) {
        this.gridNavData.add(`${point.x},${point.y}`);
      }
    }
    if (elevationData) {
      this.parseElevation(elevationData);
    }
  }

  private parseElevation(data: Array<Array<number>>): void {
    const gridSize = 64;
    const offset = -10432;
    for (let row = 0; row < data.length; row++) {
      for (let col = 0; col < data[row].length; col++) {
        const height = data[row][col];
        if (height >= 0) {
          const x = offset + col * gridSize;
          const y = offset + row * gridSize;
          this.elevationData.set(`${x},${y}`, height);
        }
      }
    }
  }

  isWalkable(x: number, y: number): boolean {
    return this.gridNavData.has(`${Math.floor(x / 64) * 64},${Math.floor(y / 64) * 64}`);
  }

  getElevation(x: number, y: number): number {
    return this.elevationData.get(`${Math.floor(x / 64) * 64},${Math.floor(y / 64) * 64}`) || 0;
  }

  update(dt: number, world: World): void {
    const entities = Array.from(world.entities.values());
    
    for (const entity of entities) {
      if (!entity.active) continue;
      
      const position = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      const velocity = world.getComponent<VelocityComponent>(entity.id, VelocityComponentId);
      const path = world.getComponent<PathComponent>(entity.id, PathComponentId);
      const unitType = world.getComponent<UnitTypeComponent>(entity.id, UnitTypeComponentId);
      
      if (!position || !velocity) continue;
      
      const dtSeconds = dt / 1000;
      
      if (path && path.waypoints.length > 0 && !path.reachedTarget) {
        const target = path.waypoints[path.currentWaypointIndex];
        const dx = target.x - position.x;
        const dy = target.y - position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const speed = 150;
        const moveSpeed = speed * dtSeconds;
        
        if (distance < moveSpeed) {
          position.x = target.x;
          position.y = target.y;
          position.z = this.getElevation(target.x, target.y);
          
          if (path.currentWaypointIndex < path.waypoints.length - 1) {
            path.currentWaypointIndex++;
          } else {
            path.reachedTarget = true;
          }
        } else {
          position.x += (dx / distance) * moveSpeed;
          position.y += (dy / distance) * moveSpeed;
          position.z = this.getElevation(position.x, position.y);
          
          if (unitType) {
            position.rotation = Math.atan2(dy, dx);
          }
        }
      } else if (velocity.dx !== 0 || velocity.dy !== 0) {
        const newX = position.x + velocity.dx * dtSeconds;
        const newY = position.y + velocity.dy * dtSeconds;
        
        if (this.isWalkable(newX, newY)) {
          position.x = newX;
          position.y = newY;
          position.z = this.getElevation(newX, newY);
        }
        
        if (unitType) {
          position.rotation = Math.atan2(velocity.dy, velocity.dx);
        }
        
        velocity.dx = 0;
        velocity.dy = 0;
      }
    }
  }
}

export class Pathfinding {
  private gridNavData: Set<string> = new Set();
  private gridSize = 64;

  constructor(gridNavData?: Array<{ x: number; y: number }>) {
    if (gridNavData) {
      for (const point of gridNavData) {
        this.gridNavData.add(`${point.x},${point.y}`);
      }
    }
  }

  findPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Array<{ x: number; y: number }> {
    const endKey = `${Math.floor(endX / this.gridSize) * this.gridSize},${Math.floor(endY / this.gridSize) * this.gridSize}`;
    
    if (!this.gridNavData.has(endKey)) {
      return [];
    }
    
    const startNode = this.getGridCoord(startX, startY);
    const endNode = this.getGridCoord(endX, endY);
    
    const openSet: Array<{ x: number; y: number; g: number; h: number; parent?: { x: number; y: number } }> = [];
    const closedSet = new Set<string>();
    
    openSet.push({ x: startNode.x, y: startNode.y, g: 0, h: this.heuristic(startNode, endNode) });
    
    while (openSet.length > 0) {
      openSet.sort((a, b) => (a.g + a.h) - (b.g + b.h));
      const current = openSet.shift()!;
      const currentKey = `${current.x},${current.y}`;
      
      if (currentKey === endKey) {
        return this.reconstructPath(current);
      }
      
      closedSet.add(currentKey);
      
      const neighbors = this.getNeighbors(current.x, current.y);
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        
        if (closedSet.has(neighborKey)) continue;
        
        const tentativeG = current.g + this.gridSize;
        const existing = openSet.find(n => n.x === neighbor.x && n.y === neighbor.y);
        
        if (!existing) {
          openSet.push({
            x: neighbor.x,
            y: neighbor.y,
            g: tentativeG,
            h: this.heuristic(neighbor, endNode),
            parent: current,
          });
        } else if (tentativeG < existing.g) {
          existing.g = tentativeG;
          existing.parent = current;
        }
      }
    }
    
    return [];
  }

  private getGridCoord(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.floor(x / this.gridSize) * this.gridSize,
      y: Math.floor(y / this.gridSize) * this.gridSize,
    };
  }

  private heuristic(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  private getNeighbors(x: number, y: number): Array<{ x: number; y: number }> {
    const neighbors: Array<{ x: number; y: number }> = [];
    const directions = [
      { dx: this.gridSize, dy: 0 },
      { dx: -this.gridSize, dy: 0 },
      { dx: 0, dy: this.gridSize },
      { dx: 0, dy: -this.gridSize },
    ];
    
    for (const dir of directions) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;
      if (this.gridNavData.has(`${nx},${ny}`)) {
        neighbors.push({ x: nx, y: ny });
      }
    }
    
    return neighbors;
  }

  private reconstructPath(
    endNode: { x: number; y: number; parent?: { x: number; y: number } }
  ): Array<{ x: number; y: number }> {
    const path: Array<{ x: number; y: number }> = [];
    let current: typeof endNode | undefined = endNode;
    
    while (current) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent as typeof endNode | undefined;
    }
    
    return path;
  }
}