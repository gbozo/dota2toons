/**
 * systems/ability.ts
 *
 * AbilitySystem   — each tick: processes pending casts, advances projectiles,
 *                   ticks DoTs, and applies status effects.
 * StatusSystem    — prunes expired status effects and applies their gameplay
 *                   consequences (stun blocks movement, etc).
 */

import type { World, System } from '../ecs/world';
import {
  AbilityComponentId, StatusEffectsComponentId,
  ProjectileComponentId,
  PositionComponentId, HealthComponentId, TeamComponentId,
  UnitTypeComponentId, CombatComponentId, DeadComponentId,
  VelocityComponentId, PathComponentId,
  createProjectileComponent, createStatusEffectsComponent,
  addStatus, hasStatus,
  type AbilityComponent,
  type StatusEffectsComponent,
  type ProjectileComponent,
  type PositionComponent,
  type HealthComponent,
  type CombatComponent,
  type PathComponent,
} from '../components/index';
import { ABILITY_BY_ID } from '../data/heroAbilities';
import { CombatSystem } from './combat';
import type { AbilityDef } from '../types/abilities';

// ---------------------------------------------------------------------------
// AbilitySystem
// ---------------------------------------------------------------------------

export class AbilitySystem implements System {
  readonly name = 'ability';

  private gameTime = 0;
  private combatRef: CombatSystem | null = null;

  /** Inject CombatSystem ref so abilities can apply damage directly */
  setCombatSystem(cs: CombatSystem): void { this.combatRef = cs; }

  update(dt: number, world: World): void {
    this.gameTime += dt;

    // Process pending casts
    for (const entity of world.entities.values()) {
      if (!entity.active || world.hasComponent(entity.id, DeadComponentId)) continue;

      const ab = world.getComponent<AbilityComponent>(entity.id, AbilityComponentId);
      if (!ab) continue;

      // Check if stunned/silenced — can't cast
      const se = world.getComponent<StatusEffectsComponent>(entity.id, StatusEffectsComponentId);
      const silenced = se ? hasStatus(se, 'silence', this.gameTime) : false;
      const stunned  = se ? hasStatus(se, 'stun',    this.gameTime) : false;
      if (stunned || silenced) {
        // Clear all pending casts
        for (const slot of ab.slots) slot.pendingCast = null;
        continue;
      }

      for (let i = 0; i < 4; i++) {
        const slot = ab.slots[i];
        if (!slot.pendingCast || slot.level === 0) {
          slot.pendingCast = null;
          continue;
        }

        const def = ABILITY_BY_ID.get(slot.abilityId);
        if (!def) { slot.pendingCast = null; continue; }

        // Check cooldown
        if (this.gameTime < slot.cooldownEndsAt) {
          slot.pendingCast = null;
          continue;
        }

        // Check mana
        const hp = world.getComponent<HealthComponent>(entity.id, HealthComponentId);
        const manaCost = def.manaCostPerLevel[slot.level - 1] ?? 0;
        if (hp && hp.mana < manaCost) {
          slot.pendingCast = null;
          continue;
        }

        // Consume mana, set cooldown
        if (hp) hp.mana = Math.max(0, hp.mana - manaCost);
        const cdMs = def.cooldownPerLevel[slot.level - 1] ?? 0;
        slot.cooldownEndsAt = this.gameTime + cdMs;

        // Execute
        this.executeAbility(world, entity.id, def, slot.level, slot.pendingCast);
        slot.pendingCast = null;
      }
    }

    // Advance projectiles
    this.tickProjectiles(dt, world);
  }

  private executeAbility(
    world: World,
    casterId: string,
    def: AbilityDef,
    level: number,
    cast: { targetEntityId?: string; targetX?: number; targetY?: number }
  ): void {
    const casterPos  = world.getComponent<PositionComponent>(casterId, PositionComponentId);
    const casterTeam = world.getComponent<any>(casterId, TeamComponentId)?.team as string;
    if (!casterPos || !casterTeam) return;

    const fx = def.effect;

    // ── Spawn projectile ────────────────────────────────────────────────────
    if (fx.projectileSpeed && fx.projectileSpeed > 0) {
      const destX = cast.targetX ?? (cast.targetEntityId
        ? world.getComponent<PositionComponent>(cast.targetEntityId, PositionComponentId)?.x ?? casterPos.x
        : casterPos.x);
      const destY = cast.targetY ?? (cast.targetEntityId
        ? world.getComponent<PositionComponent>(cast.targetEntityId, PositionComponentId)?.y ?? casterPos.y
        : casterPos.y);

      const proj = world.createEntity();
      world.addComponent(proj.id, createProjectileComponent(
        casterId, casterTeam,
        destX, destY,
        fx.projectileSpeed,
        JSON.stringify({ def: def.id, level, cast }),
        cast.targetEntityId ?? null,
        fx.radius ?? 0
      ));
      world.addComponent(proj.id, createStatusEffectsComponent());
      world.addComponent(proj.id, {
        componentId: PositionComponentId,
        x: casterPos.x, y: casterPos.y, z: casterPos.z, rotation: 0,
      });
      return; // damage applied on arrival
    }

    // ── Instant / custom effect ─────────────────────────────────────────────
    this.applyEffect(world, casterId, casterTeam, casterPos, def, level, cast);
  }

  private applyEffect(
    world: World,
    casterId: string,
    casterTeam: string,
    casterPos: PositionComponent,
    def: AbilityDef,
    level: number,
    cast: { targetEntityId?: string; targetX?: number; targetY?: number }
  ): void {
    const fx       = def.effect;
    const dmg      = fx.damagePerLevel?.[level - 1] ?? fx.damage ?? 0;
    const radius   = fx.radius ?? 0;
    const targetId = cast.targetEntityId;
    const now      = this.gameTime;

    const hitTargets = this.resolveTargets(world, casterId, casterTeam, casterPos,
                                           radius, targetId, cast.targetX, cast.targetY);

    for (const tid of hitTargets) {
      // Damage
      if (dmg > 0 && fx.damageType) {
        this.dealAbilityDamage(world, casterId, tid, dmg, fx.damageType);
      }
      // Status
      if (fx.status) {
        let se = world.getComponent<StatusEffectsComponent>(tid, StatusEffectsComponentId);
        if (!se) {
          world.addComponent(tid, createStatusEffectsComponent());
          se = world.getComponent<StatusEffectsComponent>(tid, StatusEffectsComponentId)!;
        }
        addStatus(se, fx.status.type, fx.status.duration, now, casterId, fx.status.magnitude);
      }
    }

    // Custom effects
    if (fx.customEffect) {
      this.handleCustomEffect(world, casterId, casterTeam, casterPos, def, level, cast, hitTargets);
    }
  }

  private handleCustomEffect(
    world: World,
    casterId: string,
    casterTeam: string,
    casterPos: PositionComponent,
    def: AbilityDef,
    level: number,
    cast: { targetEntityId?: string; targetX?: number; targetY?: number },
    _hitTargets: string[]
  ): void {
    const ce  = def.effect.customEffect!;
    const now = this.gameTime;

    switch (ce) {
      // ── Axe ──────────────────────────────────────────────────────────────
      case 'axe_call':
        // Taunt is already applied via status in applyEffect
        // Also grant Axe bonus armor while active
        break;

      case 'axe_cull': {
        // Culling Blade: execute if target HP below threshold (300/450/600)
        const thresholds = [300, 450, 600];
        const tid = cast.targetEntityId;
        if (!tid) break;
        const targetHP = world.getComponent<HealthComponent>(tid, HealthComponentId);
        if (targetHP && targetHP.hp <= thresholds[level - 1]) {
          targetHP.hp = 0;
          world.addComponent(tid, { componentId: DeadComponentId, diedAt: now } as any);
          // Reset CD — handled externally since we don't track kills here easily
        }
        break;
      }

      // ── Pudge ─────────────────────────────────────────────────────────────
      case 'pudge_rot': {
        // Toggle: DoT aura — store toggle state on combat component (reuse lastAttackTime trick)
        const combat = world.getComponent<CombatComponent>(casterId, CombatComponentId);
        if (combat) {
          // Use attackSpeedBonus as rot-active flag (0 = off, 1 = on)
          combat.attackSpeedBonus = combat.attackSpeedBonus ? 0 : 1;
        }
        break;
      }

      case 'pudge_hook': {
        // Hook pulls first enemy hit — handled by projectile arrival
        break;
      }

      // ── Crystal Maiden ────────────────────────────────────────────────────
      case 'cm_aura': {
        // Passive mana regen handled in EconomySystem already via passive gold equivalent
        break;
      }

      // ── Sniper ────────────────────────────────────────────────────────────
      case 'sniper_range': {
        // Passive: increase attack range — adjust CombatComponent.attackRange
        const increments = [100, 200, 300];
        const combat = world.getComponent<CombatComponent>(casterId, CombatComponentId);
        if (combat) combat.attackRange = 600 + increments[level - 1]; // base 600
        break;
      }

      case 'sniper_headshot': {
        // Passive: 40% proc on attack — handled in CombatSystem hook (not yet wired)
        break;
      }

      // ── Sven ─────────────────────────────────────────────────────────────
      case 'sven_strength': {
        const bonuses = [100, 150, 200];
        const combat = world.getComponent<CombatComponent>(casterId, CombatComponentId);
        if (combat) {
          combat.damageMin += bonuses[level - 1];
          combat.damageMax += bonuses[level - 1];
        }
        // In a full implementation we'd add a timed buff that reverts after duration
        break;
      }

      default:
        // All other abilities: effect already applied via damage + status above
        break;
    }

    void casterTeam; void casterPos; void cast; void world;
  }

  // ── Target resolution ─────────────────────────────────────────────────────

  private resolveTargets(
    world: World,
    casterId: string,
    casterTeam: string,
    casterPos: PositionComponent,
    radius: number,
    targetEntityId?: string,
    targetX?: number,
    targetY?: number
  ): string[] {
    if (radius === 0 && targetEntityId) {
      // Single target
      return this.isValidTarget(world, targetEntityId, casterId) ? [targetEntityId] : [];
    }

    const cx = targetX ?? casterPos.x;
    const cy = targetY ?? casterPos.y;
    const r  = radius > 0 ? radius : 300; // default aoe

    const results: string[] = [];
    for (const entity of world.entities.values()) {
      if (!entity.active || entity.id === casterId) continue;
      if (world.hasComponent(entity.id, DeadComponentId)) continue;
      const t = world.getComponent<any>(entity.id, TeamComponentId);
      if (!t || t.team === casterTeam) continue; // only enemies
      const p = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      if (!p) continue;
      if (Math.hypot(p.x - cx, p.y - cy) <= r) results.push(entity.id);
    }
    return results;
  }

  private isValidTarget(world: World, entityId: string, _casterId: string): boolean {
    const entity = world.getEntity(entityId);
    return !!entity?.active && !world.hasComponent(entityId, DeadComponentId);
  }

  // ── Damage helper ─────────────────────────────────────────────────────────

  private dealAbilityDamage(
    world: World, casterId: string, targetId: string,
    amount: number, damageType: string
  ): void {
    const hp = world.getComponent<HealthComponent>(targetId, HealthComponentId);
    if (!hp) return;

    let finalDmg = amount;
    if (damageType === 'magical') {
      // Simplified 25% magic resistance for heroes
      const ut = world.getComponent<any>(targetId, UnitTypeComponentId);
      if (ut?.type === 'hero') finalDmg = Math.round(amount * 0.75);
    } else if (damageType === 'physical') {
      finalDmg = CombatSystem.calcDamage(amount, amount, 0);
    }

    hp.hp = Math.max(0, hp.hp - finalDmg);

    if (hp.hp <= 0) {
      const ut = world.getComponent<any>(targetId, UnitTypeComponentId);
      if (ut?.type === 'hero') {
        world.addComponent(targetId, { componentId: DeadComponentId, diedAt: this.gameTime } as any);
      } else {
        const entity = world.getEntity(targetId);
        if (entity) entity.active = false;
      }
      // Emit death event via combatRef
      if (this.combatRef) {
        this.combatRef.deathEvents.push({
          entityId: targetId,
          killerId: casterId,
          isHero: world.getComponent<any>(targetId, UnitTypeComponentId)?.type === 'hero',
          team: world.getComponent<any>(targetId, TeamComponentId)?.team ?? 'neutral',
        });
      }
    }
  }

  // ── Projectiles ───────────────────────────────────────────────────────────

  private tickProjectiles(dt: number, world: World): void {
    const dtSec = dt / 1000;

    for (const entity of world.entities.values()) {
      if (!entity.active) continue;
      const proj = world.getComponent<ProjectileComponent>(entity.id, ProjectileComponentId);
      if (!proj) continue;

      const pos = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      if (!pos) continue;

      // Homing: update destination to target's current position
      if (proj.targetEntityId) {
        const tgt = world.getComponent<PositionComponent>(proj.targetEntityId, PositionComponentId);
        if (tgt && !world.hasComponent(proj.targetEntityId, DeadComponentId)) {
          proj.destX = tgt.x;
          proj.destY = tgt.y;
        }
      }

      const dx   = proj.destX - pos.x;
      const dy   = proj.destY - pos.y;
      const dist = Math.hypot(dx, dy);
      const step = proj.speed * dtSec;

      if (dist <= step) {
        // Arrived — apply effect
        const casterPos: PositionComponent = {
          componentId: PositionComponentId, x: proj.destX, y: proj.destY, z: 0, rotation: 0
        };
        try {
          const info = JSON.parse(proj.effectJson) as { def: string; level: number; cast: any };
          const def  = ABILITY_BY_ID.get(info.def);
          if (def) {
            this.applyEffect(world, proj.ownerId, proj.ownerTeam, casterPos,
                             def, info.level, info.cast);
          }
        } catch { /* ignore */ }

        // Remove projectile
        entity.active = false;
      } else {
        pos.x += (dx / dist) * step;
        pos.y += (dy / dist) * step;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// StatusSystem — prunes expired effects each tick, blocks movement when stunned
// ---------------------------------------------------------------------------

export class StatusSystem implements System {
  readonly name = 'status';

  private gameTime = 0;

  update(dt: number, world: World): void {
    this.gameTime += dt;

    for (const entity of world.entities.values()) {
      if (!entity.active) continue;
      const se = world.getComponent<StatusEffectsComponent>(entity.id, StatusEffectsComponentId);
      if (!se) continue;

      // Prune expired effects
      se.effects = se.effects.filter(e => e.expiresAt > this.gameTime);

      // Stun/taunt: clear path and velocity so unit can't move
      const isStunned  = hasStatus(se, 'stun',  this.gameTime);
      const isTaunted  = hasStatus(se, 'taunt', this.gameTime);
      if (isStunned || isTaunted) {
        const path = world.getComponent<PathComponent>(entity.id, PathComponentId);
        if (path) { path.waypoints = []; path.reachedTarget = true; }
        const vel  = world.getComponent<any>(entity.id, VelocityComponentId);
        if (vel)  { vel.dx = 0; vel.dy = 0; }
        // Taunt: force attack nearest enemy of caster (simplified — just stop movement)
      }

      // Root: stop movement but allow attacks/spells
      if (hasStatus(se, 'root', this.gameTime)) {
        const path = world.getComponent<PathComponent>(entity.id, PathComponentId);
        if (path) { path.waypoints = []; path.reachedTarget = true; }
      }
    }
  }
}
