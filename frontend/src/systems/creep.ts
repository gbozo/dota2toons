/**
 * systems/creep.ts
 *
 * CreepSpawnerSystem  — spawns creep waves every 30 s per lane per team.
 *                       3 melee + 1 ranged per wave (siege added every 5th wave).
 *
 * CreepAISystem       — state machine driving creep movement along lane waypoints.
 *                       States: march → fight → chase → return
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

// ---------------------------------------------------------------------------
// Lane waypoint data (loaded from mapdata)
// ---------------------------------------------------------------------------

export interface LaneWaypoints {
  radiant: { top: number[][], mid: number[][], bot: number[][] };
  dire:    { top: number[][], mid: number[][], bot: number[][] };
}

/** Parse lanedata from MapData.lanes into structured LaneWaypoints. */
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

export type CreepState = 'march' | 'fight' | 'chase' | 'return';

export interface LaneAIComponent {
  readonly componentId: typeof LaneAIComponentId;
  lane: 'top' | 'mid' | 'bot';
  team: Team;
  waypointIndex: number;
  state: CreepState;
  aggroTargetId: string | null;
  /** World position to return to after chase */
  returnX: number;
  returnY: number;
}

export function createLaneAIComponent(
  lane: 'top' | 'mid' | 'bot',
  team: Team
): LaneAIComponent {
  return {
    componentId: LaneAIComponentId,
    lane, team,
    waypointIndex: 0,
    state: 'march',
    aggroTargetId: null,
    returnX: 0,
    returnY: 0,
  };
}

// ---------------------------------------------------------------------------
// Creep stats per SPEC
// ---------------------------------------------------------------------------

const MELEE_STATS  = { hp: 550, dmgMin: 19, dmgMax: 23, range: 100, speed: 1.0 };
const RANGED_STATS = { hp: 300, dmgMin: 21, dmgMax: 26, range: 500, speed: 1.0 };
const SIEGE_STATS  = { hp: 800, dmgMin: 40, dmgMax: 60, range: 690, speed: 1.0 };

const AGGRO_RANGE  = 500;
const LEASH_RANGE  = 800;  // max chase distance before returning

// ---------------------------------------------------------------------------
// CreepSpawnerSystem
// ---------------------------------------------------------------------------

export class CreepSpawnerSystem implements System {
  readonly name = 'creepSpawner';

  private laneWaypoints: LaneWaypoints;
  private timeSinceSpawn = 29000; // start spawning at 30s (first wave at t=30s)
  private waveNumber = 0;
  private readonly SPAWN_INTERVAL = 30000; // 30s in ms

  constructor(laneWaypoints: LaneWaypoints) {
    this.laneWaypoints = laneWaypoints;
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

  private spawnWave(
    world: World,
    team: Team,
    lane: 'top' | 'mid' | 'bot',
    includeSiege: boolean
  ): void {
    const waypoints = team === 'neutral' ? [] : this.laneWaypoints[team][lane];
    if (!waypoints.length) return;

    const [spawnX, spawnY] = waypoints[0];

    // 3 melee + 1 ranged (+ 1 siege every 5th wave)
    const composition: Array<{ type: string; offsetX: number; offsetY: number }> = [
      { type: 'melee',  offsetX:   0, offsetY:   0 },
      { type: 'melee',  offsetX:  80, offsetY:   0 },
      { type: 'melee',  offsetX:   0, offsetY:  80 },
      { type: 'ranged', offsetX:  80, offsetY:  80 },
    ];
    if (includeSiege) {
      composition.push({ type: 'siege', offsetX: -80, offsetY: 0 });
    }

    for (const { type, offsetX, offsetY } of composition) {
      this.spawnCreep(world, team, lane, type, spawnX + offsetX, spawnY + offsetY, waypoints);
    }
  }

  private spawnCreep(
    world: World,
    team: Team,
    lane: 'top' | 'mid' | 'bot',
    type: string,
    x: number,
    y: number,
    waypoints: number[][]
  ): void {
    const stats =
      type === 'siege' ? SIEGE_STATS :
      type === 'ranged' ? RANGED_STATS : MELEE_STATS;

    const entity = world.createEntity();

    world.addComponent(entity.id, createPositionComponent(x, y, 0));
    world.addComponent(entity.id, createVelocityComponent());
    world.addComponent(entity.id, createTeamComponent(team));
    world.addComponent(entity.id, createUnitTypeComponent('creep', type));
    world.addComponent(entity.id, createHealthComponent(stats.hp, stats.hp, 0, 0));
    world.addComponent(entity.id, createCombatComponent(
      stats.dmgMin, stats.dmgMax, stats.range, 1.7, 0  // baseAttackTime=1.7s, armor=0
    ));

    // Path: march along all lane waypoints
    const pathWaypoints = waypoints.map(([wx, wy]) => ({ x: wx, y: wy }));
    world.addComponent(entity.id, createPathComponent(
      waypoints[waypoints.length - 1][0],
      waypoints[waypoints.length - 1][1],
      pathWaypoints,
      1, // start at index 1 (index 0 is the spawn point)
      false
    ));

    // Lane AI
    const laneAI = createLaneAIComponent(lane, team);
    laneAI.waypointIndex = 1;
    world.addComponent(entity.id, laneAI);
  }
}

// ---------------------------------------------------------------------------
// CreepAISystem
// ---------------------------------------------------------------------------

export class CreepAISystem implements System {
  readonly name = 'creepAI';

  update(_dt: number, world: World): void {
    // Collect positions of all ALIVE active units for aggro checks
    const unitPositions = new Map<string, { x: number; y: number; team: Team }>();
    for (const entity of world.entities.values()) {
      if (!entity.active) continue;
      if (world.hasComponent(entity.id, DeadComponentId)) continue;
      const pos  = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      const team = world.getComponent<TeamComponent>(entity.id, TeamComponentId);
      if (pos && team) {
        unitPositions.set(entity.id, { x: pos.x, y: pos.y, team: team.team });
      }
    }

    for (const entity of world.entities.values()) {
      if (!entity.active) continue;
      if (world.hasComponent(entity.id, DeadComponentId)) continue;

      const laneAI = world.getComponent<LaneAIComponent>(entity.id, LaneAIComponentId);
      if (!laneAI) continue;

      const pos  = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      const path = world.getComponent<PathComponent>(entity.id, PathComponentId);
      const hp   = world.getComponent<HealthComponent>(entity.id, HealthComponentId);
      const ut   = world.getComponent<UnitTypeComponent>(entity.id, UnitTypeComponentId);

      if (!pos || !path || !hp || !ut) continue;

      switch (laneAI.state) {
        case 'march':
          this.handleMarch(entity.id, laneAI, pos, path, unitPositions);
          break;
        case 'fight':
          this.handleFight(entity.id, laneAI, pos, path, world, unitPositions);
          break;
        case 'chase':
          this.handleChase(entity.id, laneAI, pos, path, world, unitPositions);
          break;
        case 'return':
          this.handleReturn(entity.id, laneAI, pos, path);
          break;
      }
    }
  }

  private handleMarch(
    _id: string,
    laneAI: LaneAIComponent,
    pos: PositionComponent,
    path: PathComponent,
    unitPositions: Map<string, { x: number; y: number; team: Team }>
  ): void {
    // Check for enemies in aggro range
    const enemy = this.nearestEnemy(pos, laneAI.team, unitPositions, AGGRO_RANGE);
    if (enemy) {
      // Save return position and switch to fight
      laneAI.returnX = pos.x;
      laneAI.returnY = pos.y;
      laneAI.aggroTargetId = enemy.id;
      laneAI.state = 'fight';
      return;
    }

    // Continue marching — path system handles actual movement
    // Advance laneAI.waypointIndex when path waypoint is reached
    if (path.reachedTarget && path.waypoints.length > 0) {
      // Reached end of lane — creep has arrived at enemy base, despawn it
      // (In Phase 3 it just stops; Phase 6 will handle base destruction)
      path.waypoints = [];
    }
  }

  private handleFight(
    id: string,
    laneAI: LaneAIComponent,
    pos: PositionComponent,
    path: PathComponent,
    world: World,
    unitPositions: Map<string, { x: number; y: number; team: Team }>
  ): void {
    // Validate current target — dead or gone?
    if (laneAI.aggroTargetId) {
      const targetEntity = world.getEntity(laneAI.aggroTargetId);
      const targetHP = targetEntity
        ? world.getComponent<HealthComponent>(laneAI.aggroTargetId, HealthComponentId)
        : null;
      const isDead = targetEntity
        ? world.hasComponent(laneAI.aggroTargetId, DeadComponentId)
        : true;
      if (!targetEntity || !targetEntity.active || !targetHP || targetHP.hp <= 0 || isDead) {
        laneAI.aggroTargetId = null;
      }
    }

    // Re-acquire if no target
    if (!laneAI.aggroTargetId) {
      const enemy = this.nearestEnemy(pos, laneAI.team, unitPositions, AGGRO_RANGE);
      if (enemy) {
        laneAI.aggroTargetId = enemy.id;
      } else {
        laneAI.state = 'return';
        return;
      }
    }

    const targetPos = unitPositions.get(laneAI.aggroTargetId!);
    if (!targetPos) { laneAI.state = 'return'; return; }

    // Check leash distance
    const returnDist = Math.hypot(laneAI.returnX - pos.x, laneAI.returnY - pos.y);
    if (returnDist > LEASH_RANGE) {
      laneAI.state = 'return';
      laneAI.aggroTargetId = null;
      // Clear combat target
      const combat = world.getComponent<CombatComponent>(id, CombatComponentId);
      if (combat) combat.targetId = null;
      return;
    }

    // Get our attack range from CombatComponent
    const combat = world.getComponent<CombatComponent>(id, CombatComponentId);
    const attackRange = combat?.attackRange ?? 100;

    const dist = Math.hypot(targetPos.x - pos.x, targetPos.y - pos.y);

    if (dist > attackRange + 8) {
      // Not in range — move toward target
      path.waypoints = [{ x: pos.x, y: pos.y }, { x: targetPos.x, y: targetPos.y }];
      path.currentWaypointIndex = 1;
      path.reachedTarget = false;
      if (combat) combat.targetId = null; // not attacking while moving toward
    } else {
      // In attack range — stop moving, set combat target for CombatSystem
      path.waypoints = [];
      path.reachedTarget = true;
      if (combat) combat.targetId = laneAI.aggroTargetId;
    }
  }

  private handleChase(
    id: string,
    laneAI: LaneAIComponent,
    pos: PositionComponent,
    path: PathComponent,
    world: World,
    unitPositions: Map<string, { x: number; y: number; team: Team }>
  ): void {
    // Chase is handled identically to fight for now
    this.handleFight(id, laneAI, pos, path, world, unitPositions);
  }

  private handleReturn(
    _id: string,
    laneAI: LaneAIComponent,
    pos: PositionComponent,
    path: PathComponent
  ): void {
    const dist = Math.hypot(laneAI.returnX - pos.x, laneAI.returnY - pos.y);
    if (dist < 64) {
      // Back on lane — resume march
      laneAI.state = 'march';
      laneAI.aggroTargetId = null;
    } else {
      // Walk back to return position
      path.waypoints = [{ x: pos.x, y: pos.y }, { x: laneAI.returnX, y: laneAI.returnY }];
      path.currentWaypointIndex = 1;
      path.reachedTarget = false;
    }
  }

  private nearestEnemy(
    pos: PositionComponent,
    myTeam: Team,
    unitPositions: Map<string, { x: number; y: number; team: Team }>,
    range: number
  ): { id: string; dist: number } | null {
    let best: { id: string; dist: number } | null = null;
    for (const [id, up] of unitPositions) {
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
// SeparationSystem — prevents units stacking on the same cell
// ---------------------------------------------------------------------------

const UNIT_RADIUS    = 32;   // world units — half a grid cell
const SEPARATION_DIA = UNIT_RADIUS * 2;

export class SeparationSystem implements System {
  readonly name = 'separation';

  update(_dt: number, world: World): void {
    // Collect all active unit positions
    const units: Array<{ id: string; pos: PositionComponent }> = [];
    for (const entity of world.entities.values()) {
      if (!entity.active) continue;
      const pos = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      if (pos) units.push({ id: entity.id, pos });
    }

    // O(n²) push-apart — acceptable for ~60 creeps + 2 heroes = ~62 units
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i];
        const b = units[j];

        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const distSq = dx * dx + dy * dy;

        if (distSq >= SEPARATION_DIA * SEPARATION_DIA || distSq < 0.0001) continue;

        const dist  = Math.sqrt(distSq);
        const overlap = SEPARATION_DIA - dist;

        // Push each unit half the overlap distance away from the other
        const nx = dx / dist;
        const ny = dy / dist;
        const push = overlap * 0.5;

        a.pos.x -= nx * push;
        a.pos.y -= ny * push;
        b.pos.x += nx * push;
        b.pos.y += ny * push;
      }
    }
  }
}
