/**
 * systems/combat.ts
 *
 * CombatSystem — processes attack targets, applies damage on cooldown, handles death.
 *
 * Damage formula (SPEC):
 *   final_damage = base_damage * (1 - armor_reduction)
 *   armor_reduction = 0.06 * armor / (1 + 0.06 * |armor|)
 *
 * Attack interval:
 *   interval_ms = (baseAttackTime / (1 + attackSpeedBonus / 100)) * 1000
 */

import type { World, System } from '../ecs/world';
import {
  PositionComponentId,
  CombatComponentId,
  HealthComponentId,
  TeamComponentId,
  UnitTypeComponentId,
  DeadComponentId,
  createDeadComponent,
  type PositionComponent,
  type CombatComponent,
  type HealthComponent,
  type TeamComponent,
  type UnitTypeComponent,
} from '../components/index';

// Emitted when a unit dies so other systems (economy, UI) can react
export interface DeathEvent {
  entityId: string;
  killerId: string | null;
  isHero: boolean;
  team: string;
}

export interface HitEvent {
  targetId: string;
  damage: number;
  damageType: string;
}

export class CombatSystem implements System {
  readonly name = 'combat';

  private gameTime = 0;

  deathEvents: DeathEvent[] = [];
  hitEvents: HitEvent[] = [];

  update(dt: number, world: World): void {
    this.gameTime += dt;
    this.deathEvents = [];
    this.hitEvents   = [];

    for (const entity of world.entities.values()) {
      if (!entity.active) continue;

      // Skip dead entities
      if (world.hasComponent(entity.id, DeadComponentId)) continue;

      const combat = world.getComponent<CombatComponent>(entity.id, CombatComponentId);
      if (!combat || !combat.targetId) continue;

      const pos = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      if (!pos) continue;

      // Validate target exists and is alive
      const targetEntity = world.getEntity(combat.targetId);
      if (!targetEntity || !targetEntity.active || world.hasComponent(combat.targetId, DeadComponentId)) {
        combat.targetId = null;
        continue;
      }

      const targetPos = world.getComponent<PositionComponent>(combat.targetId, PositionComponentId);
      const targetHP  = world.getComponent<HealthComponent>(combat.targetId, HealthComponentId);
      if (!targetPos || !targetHP) { combat.targetId = null; continue; }

      // Check range
      const dist = Math.hypot(targetPos.x - pos.x, targetPos.y - pos.y);
      if (dist > combat.attackRange + 8) continue; // +8 tolerance

      // Check attack cooldown
      const interval = (combat.baseAttackTime / (1 + combat.attackSpeedBonus / 100)) * 1000;
      if (this.gameTime - combat.lastAttackTime < interval) continue;

      // Apply damage
      const targetCombat = world.getComponent<CombatComponent>(combat.targetId, CombatComponentId);
      const armor = targetCombat?.armor ?? 0;
      const armorReduction = (0.06 * armor) / (1 + 0.06 * Math.abs(armor));

      const rawDamage = combat.damageMin + Math.random() * (combat.damageMax - combat.damageMin);
      const finalDamage = Math.max(1, Math.round(rawDamage * (1 - armorReduction)));

      targetHP.hp = Math.max(0, targetHP.hp - finalDamage);
      combat.lastAttackTime = this.gameTime;
      this.hitEvents.push({ targetId: combat.targetId!, damage: finalDamage, damageType: 'physical' });

      // Handle death
      if (targetHP.hp <= 0) {
        this.killEntity(world, combat.targetId, entity.id);
        combat.targetId = null;
      }
    }
  }

  private killEntity(world: World, entityId: string, killerId: string | null): void {
    const ut   = world.getComponent<UnitTypeComponent>(entityId, UnitTypeComponentId);
    const team = world.getComponent<TeamComponent>(entityId, TeamComponentId);

    const isHero = ut?.type === 'hero';

    if (isHero) {
      // Heroes don't get removed — they respawn. Mark as dead with timestamp.
      world.addComponent(entityId, createDeadComponent(Date.now()));
    } else {
      // Creeps and projectiles get removed immediately
      const entity = world.getEntity(entityId);
      if (entity) entity.active = false;
    }

    this.deathEvents.push({
      entityId,
      killerId,
      isHero,
      team: team?.team ?? 'neutral',
    });
  }

  /** Damage formula helper — exported for use by other systems */
  static calcDamage(damageMin: number, damageMax: number, targetArmor: number): number {
    const armorReduction = (0.06 * targetArmor) / (1 + 0.06 * Math.abs(targetArmor));
    const raw = damageMin + Math.random() * (damageMax - damageMin);
    return Math.max(1, Math.round(raw * (1 - armorReduction)));
  }
}
