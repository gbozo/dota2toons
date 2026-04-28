/**
 * systems/movement.ts
 *
 * MovementSystem  — ECS system that advances entities along their PathComponent
 *                   waypoints each tick at the correct hero/creep speed.
 *
 * Pathfinding     — A* with binary min-heap open set, 8-directional movement,
 *                   diagonal corner-cutting guard, and straight-line path
 *                   smoothing (string-pulling).
 */

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

// ---------------------------------------------------------------------------
// MovementSystem
// ---------------------------------------------------------------------------

export class MovementSystem implements System {
  readonly name = 'movement';

  // gridNavData marks BLOCKED (untraversable) cells — walkable = insideMap AND NOT blocked
  private blocked: Set<number> = new Set();
  private insideMap: Set<number> = new Set(); // cells with elevation >= 0
  private elevationData: Map<number, number> = new Map();
  private readonly GRID = 64;
  private readonly OFFSET = -10464;
  private readonly COLS = 327;

  constructor(
    gridNavData?: Array<{ x: number; y: number }>,
    elevationData?: Array<Array<number>>,
    extraBlocked?: Array<{ x: number; y: number }>
  ) {
    if (gridNavData) {
      for (const p of gridNavData) {
        this.blocked.add(this.packXY(p.x, p.y));
      }
    }
    // Extra blocked cells from trees, buildings, etc.
    if (extraBlocked) {
      for (const p of extraBlocked) {
        this.blocked.add(this.packXY(p.x, p.y));
      }
    }
    if (elevationData) {
      this.parseElevation(elevationData);
    }
  }

  private packXY(x: number, y: number): number {
    // Shift to non-negative grid indices then pack into a single integer
    const col = Math.round((x - this.OFFSET) / this.GRID);
    const row = Math.round((y - this.OFFSET) / this.GRID);
    return row * this.COLS + col;
  }

  private snapToGrid(v: number): number {
    return Math.round(v / this.GRID) * this.GRID;
  }

  private parseElevation(data: number[][]): void {
    for (let row = 0; row < data.length; row++) {
      for (let col = 0; col < data[row].length; col++) {
        const h = data[row][col];
        if (h >= 0) {
          const key = row * this.COLS + col;
          this.elevationData.set(key, h);
          this.insideMap.add(key);
        }
      }
    }
  }

  isWalkable(x: number, y: number): boolean {
    const key = this.packXY(this.snapToGrid(x), this.snapToGrid(y));
    return this.insideMap.has(key) && !this.blocked.has(key);
  }

  getElevation(x: number, y: number): number {
    // Original (unrotated) lookup — terrain mesh rotation is visual only.
    const col = Math.round((this.snapToGrid(x) - this.OFFSET) / this.GRID);
    const row = Math.round((this.snapToGrid(y) - this.OFFSET) / this.GRID);
    return this.elevationData.get(row * this.COLS + col) ?? 0;
  }

  update(dt: number, world: World): void {
    const dtSec = dt / 1000;

    for (const entity of world.entities.values()) {
      if (!entity.active) continue;

      const pos    = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      const vel    = world.getComponent<VelocityComponent>(entity.id, VelocityComponentId);
      const path   = world.getComponent<PathComponent>(entity.id, PathComponentId);
      const utype  = world.getComponent<UnitTypeComponent>(entity.id, UnitTypeComponentId);

      if (!pos || !vel) continue;

      if (path && path.waypoints.length > 0 && !path.reachedTarget) {
        // Hero speed 300, creep speed 325 per SPEC
        const isCreep = utype?.type === 'creep';
        const speed   = isCreep ? 325 : 300;
        let remaining = speed * dtSec; // budget for this tick

        // Consume budget across multiple waypoints in a single tick
        while (remaining > 0 && path.currentWaypointIndex < path.waypoints.length) {
          const wp = path.waypoints[path.currentWaypointIndex];
          const dx = wp.x - pos.x;
          const dy = wp.y - pos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist <= remaining) {
            // Reach this waypoint — update facing toward it before snapping
            if (dist > 0.001 && utype) pos.rotation = Math.atan2(dy / dist, dx / dist);
            pos.x = wp.x;
            pos.y = wp.y;
            pos.z = this.getElevation(wp.x, wp.y);
            remaining -= dist;

            if (path.currentWaypointIndex < path.waypoints.length - 1) {
              path.currentWaypointIndex++;
            } else {
              path.reachedTarget = true;
              vel.dx = 0;
              vel.dy = 0;
              break;
            }
          } else {
            const nx = dx / dist;
            const ny = dy / dist;
            pos.x += nx * remaining;
            pos.y += ny * remaining;
            pos.z  = this.getElevation(pos.x, pos.y);
            if (utype) pos.rotation = Math.atan2(ny, nx);
            vel.dx = nx * speed;
            vel.dy = ny * speed;
            remaining = 0;
          }
        }
      } else if (vel.dx !== 0 || vel.dy !== 0) {
        // Velocity-driven (no path)
        const nx = pos.x + vel.dx * dtSec;
        const ny = pos.y + vel.dy * dtSec;
        if (this.isWalkable(nx, ny)) {
          pos.x = nx;
          pos.y = ny;
          pos.z = this.getElevation(nx, ny);
        }
        if (utype) pos.rotation = Math.atan2(vel.dy, vel.dx);
        vel.dx = 0;
        vel.dy = 0;
      } else {
        // Stationary — still keep z locked to terrain so units don't
        // spawn or get pushed under/above the ground surface.
        pos.z = this.getElevation(pos.x, pos.y);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Binary min-heap for A* open set
// ---------------------------------------------------------------------------

interface HeapNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: HeapNode | null;
}

class MinHeap {
  private data: HeapNode[] = [];

  get size(): number { return this.data.length; }

  push(node: HeapNode): void {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapNode {
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].f <= this.data[i].f) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.data[l].f < this.data[smallest].f) smallest = l;
      if (r < n && this.data[r].f < this.data[smallest].f) smallest = r;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

// ---------------------------------------------------------------------------
// Pathfinding — A* with binary heap + 8-dir + path smoothing
// ---------------------------------------------------------------------------

const SQRT2 = Math.SQRT2;

export class Pathfinding {
  // gridNavData marks BLOCKED cells — walkable = insideMap AND NOT blocked
  private blocked: Set<number>;
  private insideMap: Set<number>;
  private readonly GRID = 64;
  private readonly OFFSET = -10464;
  private readonly COLS = 327;
  private readonly ROWS = 327;

  constructor(
    gridNavData?: Array<{ x: number; y: number }>,
    elevationData?: Array<Array<number>>,
    extraBlocked?: Array<{ x: number; y: number }>
  ) {
    this.blocked  = new Set();
    this.insideMap = new Set();
    if (gridNavData) {
      for (const p of gridNavData) {
        this.blocked.add(this.packXY(p.x, p.y));
      }
    }
    // Extra blocked cells from trees, buildings, etc.
    if (extraBlocked) {
      for (const p of extraBlocked) {
        this.blocked.add(this.packXY(p.x, p.y));
      }
    }
    if (elevationData) {
      for (let row = 0; row < elevationData.length; row++) {
        for (let col = 0; col < elevationData[row].length; col++) {
          if (elevationData[row][col] >= 0) {
            this.insideMap.add(row * this.COLS + col);
          }
        }
      }
    }
  }

  /** Pack a world coordinate into the grid integer key. Public for dynamic blocked sets. */
  packWorld(x: number, y: number): number {
    const col = Math.round((x - this.OFFSET) / this.GRID);
    const row = Math.round((y - this.OFFSET) / this.GRID);
    return row * this.COLS + col;
  }

  private packXY(x: number, y: number): number {
    const col = Math.round((x - this.OFFSET) / this.GRID);
    const row = Math.round((y - this.OFFSET) / this.GRID);
    return row * this.COLS + col;
  }

  private toGrid(world: number): number {
    return Math.round((world - this.OFFSET) / this.GRID);
  }

  private toWorld(grid: number): number {
    return this.OFFSET + grid * this.GRID;
  }

  /** Optional per-query extra blocked set (dynamic unit obstacles). */
  private dynamicBlocked: Set<number> | null = null;

  /** Call before findPath to inject dynamic unit-occupied cells. */
  setDynamicBlocked(s: Set<number> | null): void {
    this.dynamicBlocked = s;
  }

  private walkableAt(col: number, row: number): boolean {
    if (col < 0 || col >= this.COLS || row < 0 || row >= this.ROWS) return false;
    const key = row * this.COLS + col;
    if (!this.insideMap.has(key) || this.blocked.has(key)) return false;
    if (this.dynamicBlocked && this.dynamicBlocked.has(key)) return false;
    return true;
  }

  // Octile heuristic — exact for 8-dir grids (admissible + consistent)
  private heuristic(ac: number, ar: number, bc: number, br: number): number {
    const dc = Math.abs(ac - bc);
    const dr = Math.abs(ar - br);
    return this.GRID * (dc + dr + (SQRT2 - 2) * Math.min(dc, dr));
  }

  findPath(
    startX: number, startY: number,
    endX:   number, endY:   number
  ): Array<{ x: number; y: number }> {
    const sc = this.toGrid(startX);
    const sr = this.toGrid(startY);
    const ec = this.toGrid(endX);
    const er = this.toGrid(endY);

    // If target is not walkable, find the nearest walkable cell
    let tc = ec;
    let tr = er;
    if (!this.walkableAt(tc, tr)) {
      const nearest = this.nearestWalkable(ec, er);
      if (!nearest) return [];
      tc = nearest.c;
      tr = nearest.r;
    }

    if (sc === tc && sr === tr) return [{ x: startX, y: startY }];

    const openSet   = new MinHeap();
    const closedSet = new Set<number>();
    // Best g-cost seen for each cell (for duplicate detection in open set)
    const bestG     = new Map<number, number>();

    const startNode: HeapNode = {
      x: sc, y: sr, g: 0,
      h: this.heuristic(sc, sr, tc, tr),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;
    openSet.push(startNode);
    bestG.set(sr * this.COLS + sc, 0);

    // 8-directional neighbours: [dc, dr, cost]
    const DIRS: [number, number, number][] = [
      [ 1,  0, this.GRID],
      [-1,  0, this.GRID],
      [ 0,  1, this.GRID],
      [ 0, -1, this.GRID],
      [ 1,  1, this.GRID * SQRT2],
      [ 1, -1, this.GRID * SQRT2],
      [-1,  1, this.GRID * SQRT2],
      [-1, -1, this.GRID * SQRT2],
    ];

    while (openSet.size > 0) {
      const cur = openSet.pop();
      const key = cur.y * this.COLS + cur.x;

      if (closedSet.has(key)) continue;
      closedSet.add(key);

      if (cur.x === tc && cur.y === tr) {
        return this.smoothPath(this.reconstruct(cur));
      }

      for (const [dc, dr, cost] of DIRS) {
        const nc = cur.x + dc;
        const nr = cur.y + dr;

        if (!this.walkableAt(nc, nr)) continue;

        // Diagonal corner-cutting: both adjacent cardinal cells must be walkable
        if (dc !== 0 && dr !== 0) {
          if (!this.walkableAt(cur.x + dc, cur.y) ||
              !this.walkableAt(cur.x, cur.y + dr)) continue;
        }

        const nkey = nr * this.COLS + nc;
        if (closedSet.has(nkey)) continue;

        const ng = cur.g + cost;
        if ((bestG.get(nkey) ?? Infinity) <= ng) continue;

        bestG.set(nkey, ng);
        const nh = this.heuristic(nc, nr, tc, tr);
        openSet.push({ x: nc, y: nr, g: ng, h: nh, f: ng + nh, parent: cur });
      }
    }

    return []; // no path
  }

  private reconstruct(node: HeapNode): Array<{ c: number; r: number }> {
    const path: Array<{ c: number; r: number }> = [];
    let cur: HeapNode | null = node;
    while (cur) {
      path.unshift({ c: cur.x, r: cur.y });
      cur = cur.parent;
    }
    return path;
  }

  /**
   * String-pulling (line-of-sight) path smoothing.
   * Removes intermediate waypoints that can be replaced by a direct sight line.
   */
  private smoothPath(
    path: Array<{ c: number; r: number }>
  ): Array<{ x: number; y: number }> {
    if (path.length <= 2) {
      return path.map((p) => ({ x: this.toWorld(p.c), y: this.toWorld(p.r) }));
    }

    const smooth: Array<{ c: number; r: number }> = [path[0]];
    let anchor = 0;

    for (let i = 2; i < path.length; i++) {
      if (!this.hasLOS(path[anchor], path[i])) {
        smooth.push(path[i - 1]);
        anchor = i - 1;
      }
    }
    smooth.push(path[path.length - 1]);

    return smooth.map((p) => ({ x: this.toWorld(p.c), y: this.toWorld(p.r) }));
  }

  /** Bresenham line-of-sight check — also guards diagonal corner-cutting. */
  private hasLOS(a: { c: number; r: number }, b: { c: number; r: number }): boolean {
    let x0 = a.c, y0 = a.r;
    const x1 = b.c, y1 = b.r;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      if (!this.walkableAt(x0, y0)) return false;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      // When the line steps diagonally, check both adjacent cardinal cells
      // to prevent cutting through blocked corners (same rule as A* diagonals)
      if (e2 > -dy && e2 < dx) {
        // Diagonal step about to happen — check both cardinals
        if (!this.walkableAt(x0 + sx, y0) || !this.walkableAt(x0, y0 + sy)) return false;
      }
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx)  { err += dx; y0 += sy; }
    }
    return true;
  }

  /** BFS outward from (ec, er) to find the nearest walkable cell. */
  private nearestWalkable(
    ec: number, er: number
  ): { c: number; r: number } | null {
    const visited = new Set<number>();
    const queue: Array<{ c: number; r: number }> = [{ c: ec, r: er }];
    visited.add(er * this.COLS + ec);

    for (let i = 0; i < queue.length && i < 500; i++) {
      const { c, r } = queue[i];
      if (this.walkableAt(c, r)) return { c, r };
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = c + dc, nr = r + dr;
        const nk = nr * this.COLS + nc;
        if (!visited.has(nk)) {
          visited.add(nk);
          queue.push({ c: nc, r: nr });
        }
      }
    }
    return null;
  }
}
