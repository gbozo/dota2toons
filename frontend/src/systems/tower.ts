/**
 * systems/tower.ts
 *
 * TowerAISystem — processes tower entities each tick.
 *
 * Target priority (per SPEC, highest to lowest):
 *   1. Enemy unit attacking a friendly hero within tower range
 *   2. Nearest enemy creep
 *   3. Nearest enemy siege creep
 *   4. Nearest enemy hero
 */

import type { World, System } from '../ecs/world';
import {
  PositionComponentId,
  CombatComponentId,
  HealthComponentId,
  TeamComponentId,
  UnitTypeComponentId,
  DeadComponentId,
  type PositionComponent,
  type CombatComponent,
  type HealthComponent,
  type TeamComponent,
  type UnitTypeComponent,
} from '../components/index';

export class TowerAISystem implements System {
  readonly name = 'towerAI';

  update(_dt: number, world: World): void {
    // Build a snapshot of all alive unit positions
    type UnitInfo = {
      pos: PositionComponent;
      team: string;
      unitType: string;
      subtype: string;
      combatTargetId: string | null;
    };
    const units = new Map<string, UnitInfo>();

    for (const entity of world.entities.values()) {
      if (!entity.active) continue;
      if (world.hasComponent(entity.id, DeadComponentId)) continue;

      const pos    = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      const team   = world.getComponent<TeamComponent>(entity.id, TeamComponentId);
      const ut     = world.getComponent<UnitTypeComponent>(entity.id, UnitTypeComponentId);
      const combat = world.getComponent<CombatComponent>(entity.id, CombatComponentId);
      if (!pos || !team || !ut) continue;

      units.set(entity.id, {
        pos, team: team.team,
        unitType: ut.type, subtype: ut.subtype,
        combatTargetId: combat?.targetId ?? null,
      });
    }

    // Process each tower
    for (const [towerId, tower] of units) {
      if (tower.unitType !== 'tower') continue;

      const combat = world.getComponent<CombatComponent>(towerId, CombatComponentId);
      const hp     = world.getComponent<HealthComponent>(towerId, HealthComponentId);
      if (!combat || !hp || hp.hp <= 0) continue;

      // Validate existing target
      if (combat.targetId) {
        const t = units.get(combat.targetId);
        const tHP = world.getComponent<HealthComponent>(combat.targetId, HealthComponentId);
        if (!t || t.team === tower.team || !tHP || tHP.hp <= 0 ||
            world.hasComponent(combat.targetId, DeadComponentId)) {
          combat.targetId = null;
        }
      }

      // Select new target using priority rules
      if (!combat.targetId) {
        combat.targetId = this.selectTarget(towerId, tower, units, combat.attackRange);
      }
    }
  }

  private selectTarget(
    towerId: string,
    tower: { pos: PositionComponent; team: string },
    units: Map<string, { pos: PositionComponent; team: string; unitType: string; subtype: string; combatTargetId: string | null }>,
    range: number
  ): string | null {
    const enemies = this.enemiesInRange(towerId, tower, units, range);
    if (enemies.length === 0) return null;

    // Priority 1: enemy unit that is attacking a friendly hero inside range
    for (const [id, info] of enemies) {
      if (info.combatTargetId) {
        const tgt = units.get(info.combatTargetId);
        if (tgt && tgt.team === tower.team && tgt.unitType === 'hero') {
          return id;
        }
      }
    }

    // Priority 2: nearest creep (non-siege)
    let bestCreep: [string, number] | null = null;
    for (const [id, info] of enemies) {
      if (info.unitType === 'creep' && info.subtype !== 'siege') {
        const d = this.dist(tower.pos, info.pos);
        if (!bestCreep || d < bestCreep[1]) bestCreep = [id, d];
      }
    }
    if (bestCreep) return bestCreep[0];

    // Priority 3: nearest siege creep
    let bestSiege: [string, number] | null = null;
    for (const [id, info] of enemies) {
      if (info.unitType === 'creep' && info.subtype === 'siege') {
        const d = this.dist(tower.pos, info.pos);
        if (!bestSiege || d < bestSiege[1]) bestSiege = [id, d];
      }
    }
    if (bestSiege) return bestSiege[0];

    // Priority 4: nearest hero
    let bestHero: [string, number] | null = null;
    for (const [id, info] of enemies) {
      if (info.unitType === 'hero') {
        const d = this.dist(tower.pos, info.pos);
        if (!bestHero || d < bestHero[1]) bestHero = [id, d];
      }
    }
    return bestHero?.[0] ?? null;
  }

  private enemiesInRange(
    _towerId: string,
    tower: { pos: PositionComponent; team: string },
    units: Map<string, { pos: PositionComponent; team: string; unitType: string; subtype: string; combatTargetId: string | null }>,
    range: number
  ): Array<[string, typeof units extends Map<string, infer V> ? V : never]> {
    const result: Array<[string, any]> = [];
    for (const [id, info] of units) {
      if (info.team === tower.team || info.unitType === 'tower' || info.unitType === 'building') continue;
      if (this.dist(tower.pos, info.pos) <= range) {
        result.push([id, info]);
      }
    }
    return result;
  }

  private dist(a: PositionComponent, b: PositionComponent): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}

// ---------------------------------------------------------------------------
// Tower entity factory — called from main when initialising the map
// ---------------------------------------------------------------------------

export interface TowerDef {
  name: string;
  x: number;
  y: number;
  team: 'radiant' | 'dire';
  tier: number; // 1-4
}

export function towerStatsForTier(tier: number): { hp: number; damage: number; range: number } {
  const stats: Record<number, { hp: number; damage: number; range: number }> = {
    1: { hp: 1300, damage: 100, range: 700 },
    2: { hp: 1600, damage: 120, range: 700 },
    3: { hp: 1900, damage: 140, range: 700 },
    4: { hp: 2100, damage: 160, range: 700 },
  };
  return stats[tier] ?? stats[1];
}

export function parseTowerDefs(
  buildings: Array<{ name: string; x: number; y: number; team: string }>
): TowerDef[] {
  return buildings
    .filter(b => {
      const name = b.name.toLowerCase();
      // Only real attack towers from npc_dota_tower — exclude watch towers,
      // fountains, barracks, and other non-combat structures.
      return name.includes('tower') && !name.includes('watch_tower') && !name.includes('watch tower');
    })
    .map(b => {
      const name = b.name.toLowerCase();
      const tier = name.includes('tower4') ? 4
        : name.includes('tower3') ? 3
        : name.includes('tower2') ? 2 : 1;
      const team = (b.team === 'radiant' ? 'radiant' : 'dire') as 'radiant' | 'dire';
      return { name: b.name, x: b.x, y: b.y, team, tier };
    });
}
