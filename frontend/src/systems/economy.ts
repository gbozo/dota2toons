/**
 * systems/economy.ts
 *
 * EconomySystem  — processes DeathEvents from CombatSystem each tick:
 *   - Awards gold to the killing hero (last-hitter)
 *   - Splits XP among nearby allied heroes within 1300 units
 *   - Passive gold income: +1/second to all living heroes
 *   - Level-up stat bonuses when XP threshold is reached
 *
 * RespawnSystem  — monitors DeadComponent on heroes and respawns them
 *                  at their fountain after (level * 2 + 4) seconds.
 */

import type { World, System } from '../ecs/world';
import {
  PositionComponentId,
  HealthComponentId,
  TeamComponentId,
  UnitTypeComponentId,
  DeadComponentId,
  InventoryComponentId,
  RespawnComponentId,
  PathComponentId,
  XP_PER_LEVEL,
  type PositionComponent,
  type HealthComponent,
  type InventoryComponent,
  type RespawnComponent,
  type PathComponent,
} from '../components/index';
import type { DeathEvent } from './combat';
// audio is NOT imported here — level-up sound is fired by the game loop
// in main.tsx when the local hero's level changes, not per-hero.

// Bounty tables per SPEC
const CREEP_GOLD: Record<string, { min: number; max: number }> = {
  melee:  { min: 36, max: 46 },
  ranged: { min: 41, max: 49 },
  siege:  { min: 60, max: 75 },
};
const CREEP_XP: Record<string, number> = {
  melee: 57, ranged: 69, siege: 88,
};
const HERO_KILL_GOLD_BASE = 200;
const HERO_KILL_GOLD_PER_LEVEL = 10;
const XP_SHARE_RANGE = 1300;
const PASSIVE_GOLD_PER_SEC = 1;

// ---------------------------------------------------------------------------
// EconomySystem
// ---------------------------------------------------------------------------

export class EconomySystem implements System {
  readonly name = 'economy';

  private combatDeathEvents: DeathEvent[] = [];
  private passiveAccum = 0; // ms accumulator for passive gold

  /** Called by main game loop to feed in death events from CombatSystem */
  feedDeathEvents(events: DeathEvent[]): void {
    this.combatDeathEvents = events;
  }

  update(dt: number, world: World): void {
    // Process kills
    for (const event of this.combatDeathEvents) {
      this.processKill(world, event);
    }
    this.combatDeathEvents = [];

    // Passive gold income: +1 per second to all living heroes
    this.passiveAccum += dt;
    if (this.passiveAccum >= 1000) {
      const ticks = Math.floor(this.passiveAccum / 1000);
      this.passiveAccum -= ticks * 1000;
      for (const entity of world.entities.values()) {
        if (!entity.active || world.hasComponent(entity.id, DeadComponentId)) continue;
        const ut  = world.getComponent<any>(entity.id, UnitTypeComponentId);
        const inv = world.getComponent<InventoryComponent>(entity.id, InventoryComponentId);
        if (ut?.type === 'hero' && inv) {
          inv.gold += PASSIVE_GOLD_PER_SEC * ticks;
        }
      }
    }
  }

  private processKill(world: World, event: DeathEvent): void {
    const deadUT  = world.getComponent<any>(event.entityId, UnitTypeComponentId);
    const deadPos = world.getComponent<PositionComponent>(event.entityId, PositionComponentId);
    if (!deadUT || !deadPos) return;

    const isCreep = deadUT.type === 'creep';
    const isHero  = deadUT.type === 'hero';
    const subtype = deadUT.subtype as string;

    // ── Gold ──────────────────────────────────────────────────────────────
    if (event.killerId) {
      const killerInv = world.getComponent<InventoryComponent>(event.killerId, InventoryComponentId);
      if (killerInv) {
        if (isCreep) {
          const bounty = CREEP_GOLD[subtype] ?? CREEP_GOLD.melee;
          killerInv.gold += Math.round(bounty.min + Math.random() * (bounty.max - bounty.min));
        } else if (isHero) {
          const victimInv = world.getComponent<InventoryComponent>(event.entityId, InventoryComponentId);
          killerInv.gold += HERO_KILL_GOLD_BASE + (victimInv?.level ?? 1) * HERO_KILL_GOLD_PER_LEVEL;
        }
      }
    }

    // ── XP — split among nearby allied heroes of the killer ───────────────
    if (!deadPos) return;
    const baseXP = isCreep
      ? (CREEP_XP[subtype] ?? CREEP_XP.melee)
      : isHero ? 200 + (world.getComponent<InventoryComponent>(event.entityId, InventoryComponentId)?.level ?? 1) * 20
      : 0;
    if (baseXP <= 0) return;

    // Find killer's team
    const killerTeam = event.killerId
      ? world.getComponent<any>(event.killerId, TeamComponentId)?.team
      : null;
    if (!killerTeam) return;

    // Collect nearby allied heroes
    const receivers: string[] = [];
    for (const entity of world.entities.values()) {
      if (!entity.active || world.hasComponent(entity.id, DeadComponentId)) continue;
      const ut   = world.getComponent<any>(entity.id, UnitTypeComponentId);
      const team = world.getComponent<any>(entity.id, TeamComponentId);
      const pos  = world.getComponent<PositionComponent>(entity.id, PositionComponentId);
      if (ut?.type !== 'hero' || team?.team !== killerTeam || !pos) continue;
      const dist = Math.hypot(pos.x - deadPos.x, pos.y - deadPos.y);
      if (dist <= XP_SHARE_RANGE) receivers.push(entity.id);
    }

    if (receivers.length === 0) return;
    const xpEach = Math.round(baseXP / receivers.length);

    for (const heroId of receivers) {
      const inv = world.getComponent<InventoryComponent>(heroId, InventoryComponentId);
      if (!inv) continue;
      inv.xp += xpEach;
      this.checkLevelUp(inv, world, heroId);
    }
  }

  private checkLevelUp(inv: InventoryComponent, world: World, heroId: string): void {
    const maxLevel = XP_PER_LEVEL.length;
    while (inv.level < maxLevel && inv.xpToNextLevel > 0 && inv.xp >= inv.xpToNextLevel) {
      inv.xp -= inv.xpToNextLevel;
      inv.level++;
      inv.xpToNextLevel = XP_PER_LEVEL[inv.level] ?? 1050;

      // Award a skill point on each level-up
      const ab = world.getComponent<any>(heroId, 'ability');
      if (ab && ab.skillPoints !== undefined) {
        ab.skillPoints++;
      }

      // Stat gains per level (SPEC averages)
      const hp = world.getComponent<HealthComponent>(heroId, HealthComponentId);
      if (hp) {
        hp.maxHp  += 60;   // +40-80 avg 60
        hp.hp     += 60;   // heal the gained HP
        hp.maxMana += 35;  // +20-50 avg 35
        hp.mana   += 35;
      }
      const combat = world.getComponent<any>(heroId, 'combat');
      if (combat) {
        combat.damageMin += 3;   // +2-4 avg 3
        combat.damageMax += 3;
        combat.armor     += 0.4; // +0.3-0.5 avg 0.4
      }

      // Level-up sound is played by the game loop (main.tsx) for the local hero only.
    }
  }
}

// ---------------------------------------------------------------------------
// RespawnSystem
// ---------------------------------------------------------------------------

export class RespawnSystem implements System {
  readonly name = 'respawn';

  private gameTime = 0;

  update(dt: number, world: World): void {
    this.gameTime += dt;

    for (const entity of world.entities.values()) {
      if (!entity.active) continue;

      const dead = world.getComponent<any>(entity.id, DeadComponentId);
      if (!dead) continue;

      const ut = world.getComponent<any>(entity.id, UnitTypeComponentId);
      if (ut?.type !== 'hero') continue;

      const inv     = world.getComponent<InventoryComponent>(entity.id, InventoryComponentId);
      const level   = inv?.level ?? 1;
      const respawnMs = (level * 2 + 4) * 1000; // (level*2+4) seconds

      if (this.gameTime - dead.diedAt >= respawnMs) {
        this.respawn(world, entity.id);
      }
    }
  }

  private respawn(world: World, heroId: string): void {
    // Remove dead marker
    world.removeComponent(heroId, DeadComponentId);

    // Restore full HP/mana
    const hp = world.getComponent<HealthComponent>(heroId, HealthComponentId);
    if (hp) { hp.hp = hp.maxHp; hp.mana = hp.maxMana; }

    // Teleport to spawn point
    const spawn = world.getComponent<RespawnComponent>(heroId, RespawnComponentId);
    const pos   = world.getComponent<PositionComponent>(heroId, PositionComponentId);
    if (pos && spawn) {
      pos.x = spawn.spawnX;
      pos.y = spawn.spawnY;
    }

    // Clear any active path
    const path = world.getComponent<PathComponent>(heroId, PathComponentId);
    if (path) {
      path.waypoints = [];
      path.reachedTarget = true;
    }
  }
}
