/**
 * data/heroAbilities.ts
 *
 * Static ability definitions for the 10 MVP heroes.
 * Damage/cooldown/mana values are simplified Dota 2 approximations at 3 levels.
 */

import type { AbilityDef, HeroAbilityRoster } from '../types/abilities';

// ── Helper shorthand ────────────────────────────────────────────────────────
const cd  = (...v: number[]) => v;   // cooldowns ms
const mp  = (...v: number[]) => v;   // mana cost
const dmg = (...v: number[]) => v;   // damage per level

// ─────────────────────────────────────────────────────────────────────────────
// AXE
// ─────────────────────────────────────────────────────────────────────────────
const AXE: AbilityDef[] = [
  {
    id: 'axe_beserkers_call', name: "Berserker's Call", slot: 0,
    abilityType: 'no_target',
    manaCostPerLevel: mp(80, 80, 80), cooldownPerLevel: cd(16000, 14000, 12000),
    castRange: 0, castPoint: 300, maxLevel: 3,
    effect: { radius: 300, status: { type: 'taunt', duration: 1500 },
              customEffect: 'axe_call' },
    description: 'Forces nearby enemies to attack Axe for a short duration.',
  },
  {
    id: 'axe_battle_hunger', name: 'Battle Hunger', slot: 1,
    abilityType: 'unit_target',
    manaCostPerLevel: mp(80, 80, 80), cooldownPerLevel: cd(20000, 15000, 10000),
    castRange: 750, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(16, 24, 32),
              status: { type: 'slow', duration: 999999, magnitude: 0.12 },
              customEffect: 'axe_hunger' },
    description: 'Afflicts an enemy with a DoT slow until they get a kill.',
  },
  {
    id: 'axe_counter_helix', name: 'Counter Helix', slot: 2,
    abilityType: 'passive',
    manaCostPerLevel: mp(0, 0, 0), cooldownPerLevel: cd(0, 0, 0),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { damageType: 'pure', damagePerLevel: dmg(100, 140, 180),
              radius: 275, customEffect: 'axe_helix' },
    description: 'On attack, has a 20% chance to spin and deal pure AoE damage.',
  },
  {
    id: 'axe_culling_blade', name: 'Culling Blade', slot: 3,
    abilityType: 'unit_target',
    manaCostPerLevel: mp(60, 120, 180), cooldownPerLevel: cd(75000, 65000, 55000),
    castRange: 150, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'pure', damagePerLevel: dmg(150, 250, 450),
              customEffect: 'axe_cull' },
    description: 'Instantly kills an enemy below a HP threshold; resets CD on kill.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PUDGE
// ─────────────────────────────────────────────────────────────────────────────
const PUDGE: AbilityDef[] = [
  {
    id: 'pudge_meat_hook', name: 'Meat Hook', slot: 0,
    abilityType: 'point',
    manaCostPerLevel: mp(110, 120, 130), cooldownPerLevel: cd(14000, 13000, 12000),
    castRange: 1300, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'pure', damagePerLevel: dmg(100, 180, 260),
              projectileSpeed: 1600, customEffect: 'pudge_hook' },
    description: 'Throws a hook that drags the first enemy hit back to Pudge.',
  },
  {
    id: 'pudge_rot', name: 'Rot', slot: 1,
    abilityType: 'no_target',
    manaCostPerLevel: mp(0, 0, 0), cooldownPerLevel: cd(0, 0, 0),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(50, 75, 100),
              radius: 250, customEffect: 'pudge_rot' },
    description: 'Toggle: deals AoE damage around Pudge and slows nearby enemies.',
  },
  {
    id: 'pudge_flesh_heap', name: 'Flesh Heap', slot: 2,
    abilityType: 'passive',
    manaCostPerLevel: mp(0, 0, 0), cooldownPerLevel: cd(0, 0, 0),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { customEffect: 'pudge_flesh' },
    description: 'Grants magic resistance and bonus strength on nearby enemy death.',
  },
  {
    id: 'pudge_dismember', name: 'Dismember', slot: 3,
    abilityType: 'unit_target',
    manaCostPerLevel: mp(100, 130, 170), cooldownPerLevel: cd(30000, 25000, 20000),
    castRange: 150, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(100, 175, 250),
              status: { type: 'stun', duration: 3000 }, customEffect: 'pudge_dismember' },
    description: 'Channels for 3s, dealing damage and disabling an enemy.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CRYSTAL MAIDEN
// ─────────────────────────────────────────────────────────────────────────────
const CRYSTAL_MAIDEN: AbilityDef[] = [
  {
    id: 'cm_crystal_nova', name: 'Crystal Nova', slot: 0,
    abilityType: 'point',
    manaCostPerLevel: mp(100, 120, 140), cooldownPerLevel: cd(11000, 10000, 9000),
    castRange: 700, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(100, 175, 250),
              radius: 425, status: { type: 'slow', duration: 4500, magnitude: 0.3 } },
    description: 'AoE blast that damages and slows enemies.',
  },
  {
    id: 'cm_frostbite', name: 'Frostbite', slot: 1,
    abilityType: 'unit_target',
    manaCostPerLevel: mp(100, 110, 120), cooldownPerLevel: cd(9000, 8000, 7000),
    castRange: 500, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(50, 100, 150),
              status: { type: 'root', duration: 1500 } },
    description: 'Encases an enemy in ice, rooting and dealing damage over time.',
  },
  {
    id: 'cm_arcane_aura', name: 'Arcane Aura', slot: 2,
    abilityType: 'passive',
    manaCostPerLevel: mp(0, 0, 0), cooldownPerLevel: cd(0, 0, 0),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { customEffect: 'cm_aura' },
    description: 'Grants mana regen to all allied heroes globally.',
  },
  {
    id: 'cm_freezing_field', name: 'Freezing Field', slot: 3,
    abilityType: 'no_target',
    manaCostPerLevel: mp(200, 400, 600), cooldownPerLevel: cd(90000, 80000, 70000),
    castRange: 0, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(105, 140, 170),
              radius: 835, status: { type: 'slow', duration: 9000, magnitude: 0.3 },
              customEffect: 'cm_freezing' },
    description: 'Channels: random explosions around CM slow and damage all enemies.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SNIPER
// ─────────────────────────────────────────────────────────────────────────────
const SNIPER: AbilityDef[] = [
  {
    id: 'sniper_shrapnel', name: 'Shrapnel', slot: 0,
    abilityType: 'point',
    manaCostPerLevel: mp(120, 130, 140), cooldownPerLevel: cd(16000, 15000, 14000),
    castRange: 1800, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(15, 30, 45),
              radius: 450, status: { type: 'slow', duration: 3000, magnitude: 0.15 } },
    description: 'Lobs a grenade that deals AoE damage and slows for several seconds.',
  },
  {
    id: 'sniper_headshot', name: 'Headshot', slot: 1,
    abilityType: 'passive',
    manaCostPerLevel: mp(0, 0, 0), cooldownPerLevel: cd(0, 0, 0),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { damageType: 'physical', damagePerLevel: dmg(30, 60, 90),
              customEffect: 'sniper_headshot' },
    description: '40% chance on attack to deal bonus damage and briefly slow.',
  },
  {
    id: 'sniper_take_aim', name: 'Take Aim', slot: 2,
    abilityType: 'passive',
    manaCostPerLevel: mp(0, 0, 0), cooldownPerLevel: cd(0, 0, 0),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { customEffect: 'sniper_range' },
    description: 'Increases attack range by 100/200/300.',
  },
  {
    id: 'sniper_assassinate', name: 'Assassinate', slot: 3,
    abilityType: 'unit_target',
    manaCostPerLevel: mp(175, 225, 275), cooldownPerLevel: cd(20000, 15000, 10000),
    castRange: 3000, castPoint: 1700, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(320, 520, 720),
              projectileSpeed: 3000, customEffect: 'sniper_assassinate' },
    description: 'Long-range sniper shot after a 1.7s channel.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// DROW RANGER
// ─────────────────────────────────────────────────────────────────────────────
const DROW_RANGER: AbilityDef[] = [
  {
    id: 'drow_frost_arrows', name: 'Frost Arrows', slot: 0,
    abilityType: 'no_target',
    manaCostPerLevel: mp(12, 12, 12), cooldownPerLevel: cd(0, 0, 0),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { status: { type: 'slow', duration: 1500, magnitude: 0.15 },
              customEffect: 'drow_frost' },
    description: 'Toggle: attacks apply a chilling frost that slows movement.',
  },
  {
    id: 'drow_gust', name: 'Gust', slot: 1,
    abilityType: 'no_target',
    manaCostPerLevel: mp(75, 75, 75), cooldownPerLevel: cd(15000, 13000, 11000),
    castRange: 0, castPoint: 300, maxLevel: 3,
    effect: { status: { type: 'silence', duration: 3000 }, customEffect: 'drow_gust' },
    description: 'Releases a wave of wind that silences and pushes back nearby enemies.',
  },
  {
    id: 'drow_multishot', name: 'Multishot', slot: 2,
    abilityType: 'point',
    manaCostPerLevel: mp(65, 80, 95), cooldownPerLevel: cd(25000, 20000, 15000),
    castRange: 900, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'physical', damagePerLevel: dmg(40, 80, 120),
              radius: 200, customEffect: 'drow_multi' },
    description: 'Fires a volley of arrows in a cone.',
  },
  {
    id: 'drow_marksmanship', name: 'Marksmanship', slot: 3,
    abilityType: 'passive',
    manaCostPerLevel: mp(0, 0, 0), cooldownPerLevel: cd(0, 0, 0),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { customEffect: 'drow_marks' },
    description: 'Greatly increases agility when no enemy heroes are nearby.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// JUGGERNAUT
// ─────────────────────────────────────────────────────────────────────────────
const JUGGERNAUT: AbilityDef[] = [
  {
    id: 'jugg_blade_fury', name: 'Blade Fury', slot: 0,
    abilityType: 'no_target',
    manaCostPerLevel: mp(110, 110, 110), cooldownPerLevel: cd(30000, 24000, 19000),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(80, 100, 120),
              radius: 250, customEffect: 'jugg_fury' },
    description: 'Spins for 5s, dealing AoE damage and becoming spell immune.',
  },
  {
    id: 'jugg_healing_ward', name: 'Healing Ward', slot: 1,
    abilityType: 'point',
    manaCostPerLevel: mp(120, 125, 130), cooldownPerLevel: cd(60000, 50000, 40000),
    castRange: 400, castPoint: 300, maxLevel: 3,
    effect: { customEffect: 'jugg_ward' },
    description: 'Summons a ward that heals nearby allies each second.',
  },
  {
    id: 'jugg_blade_dance', name: 'Blade Dance', slot: 2,
    abilityType: 'passive',
    manaCostPerLevel: mp(0, 0, 0), cooldownPerLevel: cd(0, 0, 0),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { customEffect: 'jugg_dance' },
    description: '20/35/50% chance to deal 2× critical damage on attack.',
  },
  {
    id: 'jugg_omnislash', name: 'Omnislash', slot: 3,
    abilityType: 'unit_target',
    manaCostPerLevel: mp(200, 275, 350), cooldownPerLevel: cd(130000, 120000, 110000),
    castRange: 450, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'physical', damagePerLevel: dmg(200, 325, 450),
              customEffect: 'jugg_omni' },
    description: 'Juggernaut rapidly slashes through random nearby enemies.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// LION
// ─────────────────────────────────────────────────────────────────────────────
const LION: AbilityDef[] = [
  {
    id: 'lion_earth_spike', name: 'Earth Spike', slot: 0,
    abilityType: 'point',
    manaCostPerLevel: mp(100, 120, 140), cooldownPerLevel: cd(12000, 10000, 8000),
    castRange: 500, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(100, 175, 260),
              status: { type: 'stun', duration: 1200 }, customEffect: 'lion_spike' },
    description: 'Line of spikes that stuns and damages enemies.',
  },
  {
    id: 'lion_hex', name: 'Hex', slot: 1,
    abilityType: 'unit_target',
    manaCostPerLevel: mp(100, 150, 200), cooldownPerLevel: cd(30000, 24000, 18000),
    castRange: 500, castPoint: 300, maxLevel: 3,
    effect: { status: { type: 'stun', duration: 1500 }, customEffect: 'lion_hex' },
    description: 'Polymorphs an enemy into a harmless creature.',
  },
  {
    id: 'lion_mana_drain', name: 'Mana Drain', slot: 2,
    abilityType: 'unit_target',
    manaCostPerLevel: mp(25, 25, 25), cooldownPerLevel: cd(18000, 14000, 10000),
    castRange: 600, castPoint: 300, maxLevel: 3,
    effect: { customEffect: 'lion_drain' },
    description: 'Channels to drain mana from an enemy.',
  },
  {
    id: 'lion_finger', name: 'Finger of Death', slot: 3,
    abilityType: 'unit_target',
    manaCostPerLevel: mp(150, 225, 300), cooldownPerLevel: cd(160000, 100000, 40000),
    castRange: 900, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(600, 900, 1200),
              customEffect: 'lion_finger' },
    description: 'Single-target nuke dealing massive magical damage.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// LINA
// ─────────────────────────────────────────────────────────────────────────────
const LINA: AbilityDef[] = [
  {
    id: 'lina_dragon_slave', name: 'Dragon Slave', slot: 0,
    abilityType: 'point',
    manaCostPerLevel: mp(100, 115, 130), cooldownPerLevel: cd(9000, 8500, 8000),
    castRange: 900, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(100, 175, 265),
              radius: 150, customEffect: 'lina_slave' },
    description: 'Sends a wave of fire in a line.',
  },
  {
    id: 'lina_lsa', name: 'Light Strike Array', slot: 1,
    abilityType: 'point',
    manaCostPerLevel: mp(90, 100, 110), cooldownPerLevel: cd(7000, 6500, 6000),
    castRange: 625, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(80, 160, 240),
              radius: 225, status: { type: 'stun', duration: 1500 } },
    description: 'Delayed AoE stun that deals damage.',
  },
  {
    id: 'lina_fiery_soul', name: 'Fiery Soul', slot: 2,
    abilityType: 'passive',
    manaCostPerLevel: mp(0, 0, 0), cooldownPerLevel: cd(0, 0, 0),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { customEffect: 'lina_soul' },
    description: 'Gains bonus attack and movement speed per spell cast.',
  },
  {
    id: 'lina_laguna_blade', name: 'Laguna Blade', slot: 3,
    abilityType: 'unit_target',
    manaCostPerLevel: mp(280, 420, 680), cooldownPerLevel: cd(55000, 40000, 25000),
    castRange: 900, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(450, 675, 950),
              customEffect: 'lina_laguna' },
    description: 'Single-target lightning bolt dealing massive damage.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SVEN
// ─────────────────────────────────────────────────────────────────────────────
const SVEN: AbilityDef[] = [
  {
    id: 'sven_storm_hammer', name: 'Storm Hammer', slot: 0,
    abilityType: 'unit_target',
    manaCostPerLevel: mp(140, 155, 170), cooldownPerLevel: cd(13000, 12000, 11000),
    castRange: 600, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(100, 175, 275),
              radius: 255, status: { type: 'stun', duration: 1500 } },
    description: 'Throws gauntlet that stuns and damages all enemies in AoE.',
  },
  {
    id: 'sven_great_cleave', name: 'Great Cleave', slot: 1,
    abilityType: 'passive',
    manaCostPerLevel: mp(0, 0, 0), cooldownPerLevel: cd(0, 0, 0),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { customEffect: 'sven_cleave' },
    description: 'Attacks cleave for 30/45/60% of damage to nearby enemies.',
  },
  {
    id: 'sven_warcry', name: 'Warcry', slot: 2,
    abilityType: 'no_target',
    manaCostPerLevel: mp(25, 25, 25), cooldownPerLevel: cd(32000, 24000, 16000),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { customEffect: 'sven_warcry' },
    description: 'Rallies nearby allies, granting bonus armor and movement speed.',
  },
  {
    id: 'sven_gods_strength', name: "God's Strength", slot: 3,
    abilityType: 'no_target',
    manaCostPerLevel: mp(100, 150, 200), cooldownPerLevel: cd(80000, 70000, 60000),
    castRange: 0, castPoint: 300, maxLevel: 3,
    effect: { customEffect: 'sven_strength' },
    description: 'Sven channels his rogue strength for massive bonus damage.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// WITCH DOCTOR
// ─────────────────────────────────────────────────────────────────────────────
const WITCH_DOCTOR: AbilityDef[] = [
  {
    id: 'wd_cask', name: 'Paralyzing Cask', slot: 0,
    abilityType: 'unit_target',
    manaCostPerLevel: mp(110, 130, 150), cooldownPerLevel: cd(28000, 24000, 20000),
    castRange: 700, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(50, 75, 100),
              projectileSpeed: 900, status: { type: 'stun', duration: 800 },
              customEffect: 'wd_cask' },
    description: 'Launches a cask that bounces between enemies, stunning each.',
  },
  {
    id: 'wd_voodoo_restoration', name: 'Voodoo Restoration', slot: 1,
    abilityType: 'no_target',
    manaCostPerLevel: mp(12, 16, 20), cooldownPerLevel: cd(0, 0, 0),
    castRange: 0, castPoint: 0, maxLevel: 3,
    effect: { customEffect: 'wd_restore' },
    description: 'Toggle: heals nearby allied units each second.',
  },
  {
    id: 'wd_maledict', name: 'Maledict', slot: 2,
    abilityType: 'point',
    manaCostPerLevel: mp(110, 120, 130), cooldownPerLevel: cd(25000, 23000, 21000),
    castRange: 525, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'magical', damagePerLevel: dmg(30, 50, 70),
              radius: 215, customEffect: 'wd_maledict' },
    description: 'Curses enemies; they take burst damage based on HP lost.',
  },
  {
    id: 'wd_death_ward', name: 'Death Ward', slot: 3,
    abilityType: 'point',
    manaCostPerLevel: mp(150, 175, 200), cooldownPerLevel: cd(80000, 70000, 60000),
    castRange: 600, castPoint: 300, maxLevel: 3,
    effect: { damageType: 'physical', damagePerLevel: dmg(95, 130, 175),
              customEffect: 'wd_ward' },
    description: 'Channels a ward that attacks nearby enemies rapidly.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export const HERO_ABILITIES: HeroAbilityRoster = {
  axe:            AXE,
  pudge:          PUDGE,
  crystal_maiden: CRYSTAL_MAIDEN,
  sniper:         SNIPER,
  drow_ranger:    DROW_RANGER,
  juggernaut:     JUGGERNAUT,
  lion:           LION,
  lina:           LINA,
  sven:           SVEN,
  witch_doctor:   WITCH_DOCTOR,
};

/** Flat lookup: abilityId → AbilityDef */
export const ABILITY_BY_ID = new Map<string, AbilityDef>(
  Object.values(HERO_ABILITIES).flat().map(a => [a.id, a])
);
