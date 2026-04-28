/**
 * systems/creep.ts
 *
 * CreepSpawnerSystem  — spawns creep waves every 30 s per lane per team.
 *                       3 melee + 1 ranged per wave (siege every 5th wave).
 *
 * CreepAISystem       — drives creep movement and combat.
 *
 * Navigation rules:
 *   MARCH: walk directly between lane waypoints (straight line, no A*).
 *          The separation system handles push-apart — no dynamic blocking needed.
 *          Aggro range check: if an enemy enters 500 units, switch to FIGHT.
 *
 *   FIGHT: if target in attack range → stop and attack.
 *          If out of range → chase with A* (static obstacles only, no dynamic
 *          blocking — creeps push through each other to reach the target).
 *          When target dies/gone and no replacement → resume MARCH from current
 *          position toward the next lane waypoint. No leash, no return.
 */

import type { World, System } from '../ecs/world';
import {
  createPositionComponent,
  createVelocityComponent,
  createTeamComponent,
  createUnitTypeComponent,
  createHealthComponent,
  createPathComponent,
  createCombatComponent,
  PositionComponentId,
  PathComponentId,
  TeamComponentId,
  CombatComponentId,
  DeadComponentId,
  UnitTypeComponentId,
  HealthComponentId,
  type PositionComponent,
  type PathComponent,
  type TeamComponent,
  type UnitTypeComponent,
  type HealthComponent,
  type CombatComponent,
} from '../components/index';
import type { Team } from '../types/game';
import type { Pathfinding } from './movement';

// ---------------------------------------------------------------------------
// Lane waypoint data
// ---------------------------------------------------------------------------

export interface LaneWaypoints {
  radiant: { top: number[][], mid: number[][], bot: number[][] };
  dire:    { top: number[][], mid: number[][], bot: number[][] };
}

export function parseLaneWaypoints(
  lanes: Record<string, Array<{ x: number; y: number }>>
): LaneWaypoints {
  const get = (key: string) => (lanes[key] ?? []).map(p => [p.x, p.y]);
  return {
    radiant: {
      top: get('npc_dota_spawner_good_top'),
      mid: get('npc_dota_spawner_good_mid'),
      bot: get('npc_dota_spawner_good_bot'),
    },
    dire: {
      top: get('npc_dota_spawner_bad_top'),
      mid: get('npc_dota_spawner_bad_mid'),
      bot: get('npc_dota_spawner_bad_bot'),
    },
  };
}

// ---------------------------------------------------------------------------
// LaneAI component
// ---------------------------------------------------------------------------

export const LaneAIComponentId = 'laneAI';

export type CreepState = 'march' | 'fight';

export interface LaneAIComponent {
  readonly componentId: typeof LaneAIComponentId;
  lane: 'top' | 'mid' | 'bot';
  team: Team;
  /** Index of the next waypoint to march toward. */
  waypointIndex: number;
  /** Full ordered lane waypoints for this team+lane. */
  laneWaypoints: Array<{ x: number; y: number }>;
  state: CreepState;
  aggroTargetId: string | null;
  /** Cooldown before next A* chase replan (ticks). */
  chaseCooldown: number;
}

export function createLaneAIComponent(
  lane: 'top' | 'mid' | 'bot',
  team: Team,
  laneWaypoints: Array<{ x: number; y: number }>
): LaneAIComponent {
  return {
    componentId: LaneAIComponentId,
    lane, team,
    waypointIndex: 1,
    laneWaypoints,
    state: 'march',
    aggroTargetId: null,
    chaseCooldown: 0,
  };
}

// ---------------------------------------------------------------------------
// Creep stats
// ---------------------------------------------------------------------------

const MELEE_STATS  = { hp: 550, dmgMin: 19, dmgMax: 23, range: 100 };
const RANGED_STATS = { hp: 300, dmgMin: 21, dmgMax: 26, range: 500 };
const SIEGE_STATS  = { hp: 800, dmgMin: 40, dmgMax: 60, range: 690 };

const AGGRO_RANGE       = 500;
const WAYPOINT_REACH    = 96;   // world units — close enough to advance waypoint
const CHASE_REPLAN      = 10;   // ticks between A* chase replans (~333 ms at 30 Hz)

// ---------------------------------------------------------------------------
// CreepSpawnerSystem
// ---------------------------------------------------------------------------

export class CreepSpawnerSystem implements System {
  readonly name = 'creepSpawner';

  private laneWaypoints: LaneWaypoints;
  private timeSinceSpawn = 29000;
  private waveNumber = 0;
  private readonly SPAWN_INTERVAL = 30000;
  private getElevation: ((x: number, y: number) => number) | null = null;

  constructor(laneWaypoints: LaneWaypoints) {
    this.laneWaypoints = laneWaypoints;
  }

  setElevationFn(fn: (x: number, y: number) => number): void {
    this.getElevation = fn;
  }

  update(dt: number, world: World): void {
    this.timeSinceSpawn += dt;
    if (this.timeSinceSpawn < this.SPAWN_INTERVAL) return;

    this.timeSinceSpawn -= this.SPAWN_INTERVAL;
    this.waveNumber++;

    const isSiegeWave = this.waveNumber % 5 === 0;
    const lanes: Array<'top' | 'mid' | 'bot'> = ['top', 'mid', 'bot'];
    const teams: Team[] = ['radiant', 'dire'];

    for (const team of teams) {
      for (const lane of lanes) {
        this.spawnWave(world, team, lane, isSiegeWave);
      }
    }
  }

  private spawnWave(world: World, team: Team, lane: 'top' | 'mid' | 'bot', includeSiege: boolean): void {
    const raw = team === 'neutral' ? [] : this.laneWaypoints[team][lane];
    if (!raw.length) return;

    const [spawnX, spawnY] = raw[0];
    const wps = raw.map(([wx, wy]) => ({ x: wx, y: wy }));

    const composition: Array<{ type: string; ox: number; oy: number }> = [
      { type: 'melee',  ox:   0, oy:   0 },
      { type: 'melee',  ox:  80, oy:   0 },
      { type: 'melee',  ox:   0, oy:  80 },
      { type: 'ranged', ox:  80, oy:  80 },
    ];
    if (includeSiege) composition.push({ type: 'siege', ox: -80, oy: 0 });

    for (const { type, ox, oy } of composition) {
      this.spawnCreep(world, team, lane, type, spawnX + ox, spawnY + oy, wps);
    }
  }

  private spawnCreep(
    world: World, team: Team, lane: 'top' | 'mid' | 'bot',
    type: string, x: number, y: number,
    waypoints: Array<{ x: number; y: number }>
  ): void {
    const stats = type === 'siege' ? SIEGE_STATS : type === 'ranged' ? RANGED_STATS : MELEE_STATS;
    const elev  = this.getElevation ? this.getElevation(x, y) : 0;

    const entity = world.createEntity();
    world.addComponent(entity.id, createPositionComponent(x, y, elev));
    world.addComponent(entity.id, createVelocityComponent());
    world.addComponent(entity.id, createTeamComponent(team));
    world.addComponent(entity.id, createUnitTypeComponent('creep', type));
    world.addComponent(entity.id, createHealthComponent(stats.hp, stats.hp, 0, 0));
    world.addComponent(entity.id, createCombatComponent(stats.dmgMin, stats.dmgMax, stats.range, 1.7, 0));
    world.addComponent(entity.id, createPathComponent());
    world.addComponent(entity.id, createLaneAIComponent(lane, team, waypoints));
  }
}

// ---------------------------------------------------------------------------
// CreepAISystem
// ---------------------------------------------------------------------------

type UnitInfo = { x: number; y: number; team: Team; type: string };

export class CreepAISystem implements System {
  readonly name = 'creepAI';

  private pathfinding: Pathfinding | null = null;

  setPathfinding(pf: Pathfinding): void {
    this.pathfinding = pf;
  }

  update(_dt: number, world: World): void {
    // ── Build unit snapshot for aggro checks only (no dynamic blocking) ──────
    const unitPositions = new Map<string, UnitInfo>();

    for (const entity of world.entities.values()) {
      if (!entity.active) continue;
      if (world.hasComponent(entity.id, DeadComponentId)) continue;
      const pos  = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      const team = world.getComponent<TeamComponent>(entity.id, TeamComponentId);
      const ut   = world.getComponent<UnitTypeComponent>(entity.id, UnitTypeComponentId);
      if (!pos || !team) continue;
      unitPositions.set(entity.id, { x: pos.x, y: pos.y, team: team.team, type: ut?.type ?? '' });
    }

    // ── Process each creep ───────────────────────────────────────────────────
    for (const entity of world.entities.values()) {
      if (!entity.active) continue;
      if (world.hasComponent(entity.id, DeadComponentId)) continue;

      const laneAI = world.getComponent<LaneAIComponent>(entity.id, LaneAIComponentId);
      if (!laneAI) continue;

      const pos    = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      const path   = world.getComponent<PathComponent>(entity.id, PathComponentId);
      const combat = world.getComponent<CombatComponent>(entity.id, CombatComponentId) ?? null;
      if (!pos || !path) continue;

      if (laneAI.chaseCooldown > 0) laneAI.chaseCooldown--;

      switch (laneAI.state) {
        case 'march': this.handleMarch(entity.id, laneAI, pos, path, combat, unitPositions); break;
        case 'fight': this.handleFight(entity.id, laneAI, pos, path, combat, world, unitPositions); break;
      }
    }
  }

  // ── March: direct straight-line steps between waypoints, no A* ────────────

  private handleMarch(
    id: string,
    laneAI: LaneAIComponent,
    pos: PositionComponent,
    path: PathComponent,
    combat: CombatComponent | null,
    unitPositions: Map<string, UnitInfo>
  ): void {
    void id;

    // Aggro check — if enemy in range, switch to fight
    const enemy = this.nearestEnemy(id, pos, laneAI.team, unitPositions, AGGRO_RANGE);
    if (enemy) {
      laneAI.aggroTargetId = enemy.id;
      laneAI.state = 'fight';
      laneAI.chaseCooldown = 0;
      if (combat) combat.targetId = null;
      return;
    }

    const wps = laneAI.laneWaypoints;
    if (wps.length === 0) return;

    // Clamp waypoint index
    if (laneAI.waypointIndex >= wps.length) {
      // Reached end of lane — stop (base destruction not yet implemented)
      path.waypoints = [];
      path.reachedTarget = true;
      if (combat) combat.targetId = null;
      return;
    }

    const wp   = wps[laneAI.waypointIndex];
    const dist = Math.hypot(wp.x - pos.x, wp.y - pos.y);

    // Advance to next waypoint when close enough
    if (dist < WAYPOINT_REACH && laneAI.waypointIndex < wps.length - 1) {
      laneAI.waypointIndex++;
    }

    // Set direct path to next waypoint — no A*, separation handles push-apart
    const target = wps[laneAI.waypointIndex];
    path.waypoints = [{ x: pos.x, y: pos.y }, { x: target.x, y: target.y }];
    path.currentWaypointIndex = 1;
    path.reachedTarget = false;
    if (combat) combat.targetId = null;
  }

  // ── Fight: attack if in range, chase with A* (static obstacles only) ──────

  private handleFight(
    id: string,
    laneAI: LaneAIComponent,
    pos: PositionComponent,
    path: PathComponent,
    combat: CombatComponent | null,
    world: World,
    unitPositions: Map<string, UnitInfo>
  ): void {
    // Validate current target
    if (laneAI.aggroTargetId) {
      const te  = world.getEntity(laneAI.aggroTargetId);
      const tHP = te ? world.getComponent<HealthComponent>(laneAI.aggroTargetId, HealthComponentId) : null;
      const dead = te ? world.hasComponent(laneAI.aggroTargetId, DeadComponentId) : true;
      if (!te || !te.active || !tHP || tHP.hp <= 0 || dead) {
        laneAI.aggroTargetId = null;
      }
    }

    // Re-acquire nearest enemy
    if (!laneAI.aggroTargetId) {
      const enemy = this.nearestEnemy(id, pos, laneAI.team, unitPositions, AGGRO_RANGE);
      if (enemy) {
        laneAI.aggroTargetId = enemy.id;
        laneAI.chaseCooldown = 0;
      } else {
        // No enemies — resume march
        laneAI.state = 'march';
        if (combat) combat.targetId = null;
        path.waypoints = [];
        path.reachedTarget = true;
        return;
      }
    }

    const tgt = unitPositions.get(laneAI.aggroTargetId!);
    if (!tgt) {
      laneAI.state = 'march';
      return;
    }

    const attackRange = combat?.attackRange ?? 100;
    const dist = Math.hypot(tgt.x - pos.x, tgt.y - pos.y);

    if (dist <= attackRange + 8) {
      // In range — stop moving, attack
      path.waypoints = [];
      path.reachedTarget = true;
      if (combat) combat.targetId = laneAI.aggroTargetId;
    } else {
      // Chase — A* with static obstacles only (no dynamic blocking)
      if (combat) combat.targetId = null;
      if (laneAI.chaseCooldown === 0 || path.waypoints.length === 0) {
        this.chaseReplan(pos, tgt.x, tgt.y, path);
        laneAI.chaseCooldown = CHASE_REPLAN;
      }
    }
  }

  // ── Replan chase path with A* (static obstacles only) ────────────────────

  private chaseReplan(
    pos: PositionComponent,
    targetX: number,
    targetY: number,
    path: PathComponent
  ): void {
    if (!this.pathfinding) {
      // Fallback: straight line
      path.waypoints = [{ x: pos.x, y: pos.y }, { x: targetX, y: targetY }];
      path.currentWaypointIndex = 1;
      path.reachedTarget = false;
      return;
    }

    // Clear dynamic blocked — creeps path through each other when chasing
    this.pathfinding.setDynamicBlocked(null);
    const wps = this.pathfinding.findPath(pos.x, pos.y, targetX, targetY);

    if (wps.length > 0) {
      path.waypoints = [{ x: pos.x, y: pos.y }, ...wps];
      path.currentWaypointIndex = 1;
      path.reachedTarget = false;
    } else {
      // A* found no path — straight line fallback
      path.waypoints = [{ x: pos.x, y: pos.y }, { x: targetX, y: targetY }];
      path.currentWaypointIndex = 1;
      path.reachedTarget = false;
    }
  }

  // ── Nearest enemy within range ────────────────────────────────────────────

  private nearestEnemy(
    selfId: string,
    pos: PositionComponent,
    myTeam: Team,
    unitPositions: Map<string, UnitInfo>,
    range: number
  ): { id: string; dist: number } | null {
    let best: { id: string; dist: number } | null = null;
    for (const [id, up] of unitPositions) {
      if (id === selfId) continue;
      if (up.team === myTeam || up.team === 'neutral') continue;
      const dist = Math.hypot(up.x - pos.x, up.y - pos.y);
      if (dist <= range && (!best || dist < best.dist)) {
        best = { id, dist };
      }
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// SeparationSystem — spatial hash O(n) push-apart, walkability-clamped
// ---------------------------------------------------------------------------

const UNIT_RADIUS    = 32;
const SEPARATION_DIA = UNIT_RADIUS * 2;
const HASH_CELL      = SEPARATION_DIA;

export class SeparationSystem implements System {
  readonly name = 'separation';

  private isWalkable: ((x: number, y: number) => boolean) | null = null;

  /** Inject walkability checker so pushes never move units off the navmesh. */
  setWalkableFn(fn: (x: number, y: number) => boolean): void {
    this.isWalkable = fn;
  }

  update(_dt: number, world: World): void {
    const units: Array<{ id: string; pos: PositionComponent }> = [];
    for (const entity of world.entities.values()) {
      if (!entity.active) continue;
      const pos = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      if (pos) units.push({ id: entity.id, pos });
    }
    if (units.length === 0) return;

    const grid = new Map<string, number[]>();
    const cellOf = (x: number, y: number) =>
      `${Math.floor(x / HASH_CELL)},${Math.floor(y / HASH_CELL)}`;

    for (let i = 0; i < units.length; i++) {
      const key = cellOf(units[i].pos.x, units[i].pos.y);
      let b = grid.get(key);
      if (!b) { b = []; grid.set(key, b); }
      b.push(i);
    }

    const diaSq = SEPARATION_DIA * SEPARATION_DIA;
    for (let i = 0; i < units.length; i++) {
      const a  = units[i];
      const cx = Math.floor(a.pos.x / HASH_CELL);
      const cy = Math.floor(a.pos.y / HASH_CELL);

      for (let nx = cx - 1; nx <= cx + 1; nx++) {
        for (let ny = cy - 1; ny <= cy + 1; ny++) {
          const bucket = grid.get(`${nx},${ny}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const b  = units[j];
            const dx = b.pos.x - a.pos.x;
            const dy = b.pos.y - a.pos.y;
            const dSq = dx * dx + dy * dy;
            if (dSq >= diaSq || dSq < 0.0001) continue;
            const d    = Math.sqrt(dSq);
            const push = (SEPARATION_DIA - d) * 0.5;
            const ex   = dx / d;
            const ey   = dy / d;

            // Only apply push if destination remains walkable
            const ax2 = a.pos.x - ex * push;
            const ay2 = a.pos.y - ey * push;
            const bx2 = b.pos.x + ex * push;
            const by2 = b.pos.y + ey * push;

            if (!this.isWalkable || this.isWalkable(ax2, ay2)) {
              a.pos.x = ax2;
              a.pos.y = ay2;
            }
            if (!this.isWalkable || this.isWalkable(bx2, by2)) {
              b.pos.x = bx2;
              b.pos.y = by2;
            }
          }
        }
      }
    }
  }
}
