/**
 * types/abilities.ts
 *
 * Core ability data structures.  Everything that defines WHAT an ability does
 * lives here.  The AbilitySystem in systems/ability.ts interprets these.
 */

// ---------------------------------------------------------------------------
// Enums / union types
// ---------------------------------------------------------------------------

export type AbilityType =
  | 'no_target'   // instant, no click required (Rot, Counter Helix passive proc)
  | 'point'       // click on ground
  | 'unit_target' // click on a unit
  | 'passive';    // never cast — always active

export type DamageType = 'physical' | 'magical' | 'pure';

export type StatusEffectType = 'stun' | 'slow' | 'root' | 'silence' | 'taunt';

// ---------------------------------------------------------------------------
// Status effect descriptor
// ---------------------------------------------------------------------------

export interface StatusEffect {
  type: StatusEffectType;
  duration: number;   // ms
  /** For slow: movement speed multiplier (0.5 = 50% slow) */
  magnitude?: number;
}

// ---------------------------------------------------------------------------
// Ability effect — what happens when the ability fires
// ---------------------------------------------------------------------------

export interface AbilityEffect {
  damageType?: DamageType;
  damage?: number;          // flat damage per level (array of 3 values)
  damagePerLevel?: number[];
  /** AoE radius — 0 means single target */
  radius?: number;
  status?: StatusEffect;
  /** Heal amount */
  heal?: number;
  healPerLevel?: number[];
  /** Projectile speed in world units/sec (0 = instant) */
  projectileSpeed?: number;
  /** Custom effect id handled by AbilitySystem switch */
  customEffect?: string;
}

// ---------------------------------------------------------------------------
// Ability definition — static data per hero/ability
// ---------------------------------------------------------------------------

export interface AbilityDef {
  id: string;
  name: string;
  slot: 0 | 1 | 2 | 3;       // Q W E R
  abilityType: AbilityType;
  manaCostPerLevel: number[];  // [lv1, lv2, lv3]
  cooldownPerLevel: number[];  // ms per level
  castRange: number;           // 0 = self/melee
  castPoint: number;           // ms cast animation delay
  maxLevel: number;            // 3 for Q/W/E, 3 for R
  effect: AbilityEffect;
  description: string;
}

// ---------------------------------------------------------------------------
// Hero ability roster
// ---------------------------------------------------------------------------

export type HeroAbilityRoster = Record<string, AbilityDef[]>;
