import type { Component } from '../ecs/world';
export type { Component };

export const PositionComponentId = 'position';

export interface PositionData {
  x: number;
  y: number;
  z: number;
  rotation: number;
}

export interface PositionComponent extends Component {
  componentId: typeof PositionComponentId;
  x: number;
  y: number;
  z: number;
  rotation: number;
}

export function createPositionComponent(
  x = 0,
  y = 0,
  z = 0,
  rotation = 0
): PositionComponent {
  return {
    componentId: PositionComponentId,
    x,
    y,
    z,
    rotation,
  };
}

export const VelocityComponentId = 'velocity';

export interface VelocityData {
  dx: number;
  dy: number;
  dz: number;
}

export interface VelocityComponent extends Component {
  componentId: typeof VelocityComponentId;
  dx: number;
  dy: number;
  dz: number;
}

export function createVelocityComponent(
  dx = 0,
  dy = 0,
  dz = 0
): VelocityComponent {
  return {
    componentId: VelocityComponentId,
    dx,
    dy,
    dz,
  };
}

export const TeamComponentId = 'team';

export type Team = 'radiant' | 'dire' | 'neutral';

export interface TeamComponent extends Component {
  componentId: typeof TeamComponentId;
  team: Team;
}

export function createTeamComponent(team: Team = 'neutral'): TeamComponent {
  return {
    componentId: TeamComponentId,
    team,
  };
}

export const UnitTypeComponentId = 'unitType';

export type UnitType = 'hero' | 'creep' | 'tower' | 'building' | 'tree' | 'rune' | 'ancient';

export interface UnitTypeComponent extends Component {
  componentId: typeof UnitTypeComponentId;
  type: UnitType;
  subtype: string;
}

export function createUnitTypeComponent(
  type: UnitType = 'creep',
  subtype = ''
): UnitTypeComponent {
  return {
    componentId: UnitTypeComponentId,
    type,
    subtype,
  };
}

export const HeroModelComponentId = 'heroModel';

export interface HeroModelComponent extends Component {
  componentId: typeof HeroModelComponentId;
  modelPath: string;
  animation: string;
}

export function createHeroModelComponent(
  modelPath = '',
  animation = 'idle'
): HeroModelComponent {
  return {
    componentId: HeroModelComponentId,
    modelPath,
    animation,
  };
}

export const HealthComponentId = 'health';

export interface HealthComponent extends Component {
  componentId: typeof HealthComponentId;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
}

export function createHealthComponent(
  hp = 100,
  maxHp = 100,
  mana = 0,
  maxMana = 0
): HealthComponent {
  return {
    componentId: HealthComponentId,
    hp,
    maxHp,
    mana,
    maxMana,
  };
}

export const CombatComponentId = 'combat';

export interface CombatComponent extends Component {
  componentId: typeof CombatComponentId;
  damageMin: number;
  damageMax: number;
  attackRange: number;
  /** Base attack time in seconds (1.0 = 1 attack/sec at 0 bonus) */
  baseAttackTime: number;
  /** Attack speed bonus % (0 = base rate) */
  attackSpeedBonus: number;
  armor: number;
  lastAttackTime: number;
  /** Entity ID of current attack target, or null */
  targetId: string | null;
}

export function createCombatComponent(
  damageMin = 10,
  damageMax = 20,
  attackRange = 100,
  baseAttackTime = 1.7,
  armor = 0,
  lastAttackTime = 0
): CombatComponent {
  return {
    componentId: CombatComponentId,
    damageMin,
    damageMax,
    attackRange,
    baseAttackTime,
    attackSpeedBonus: 0,
    armor,
    lastAttackTime,
    targetId: null,
  };
}

export const PathComponentId = 'path';

export interface PathWaypoint {
  x: number;
  y: number;
}

export interface PathComponent extends Component {
  componentId: typeof PathComponentId;
  targetX: number;
  targetY: number;
  waypoints: PathWaypoint[];
  currentWaypointIndex: number;
  reachedTarget: boolean;
}

export function createPathComponent(
  targetX = 0,
  targetY = 0,
  waypoints: PathWaypoint[] = [],
  currentWaypointIndex = 0,
  reachedTarget = true
): PathComponent {
  return {
    componentId: PathComponentId,
    targetX,
    targetY,
    waypoints,
    currentWaypointIndex,
    reachedTarget,
  };
}

export const AABBComponentId = 'aabb';

export interface AABBComponent extends Component {
  componentId: typeof AABBComponentId;
  width: number;
  height: number;
  depth: number;
}

export function createAABBComponent(
  width = 32,
  height = 32,
  depth = 32
): AABBComponent {
  return {
    componentId: AABBComponentId,
    width,
    height,
    depth,
  };
}

export const SelectionComponentId = 'selection';

export interface SelectionComponent extends Component {
  componentId: typeof SelectionComponentId;
  selected: boolean;
}

export function createSelectionComponent(selected = false): SelectionComponent {
  return {
    componentId: SelectionComponentId,
    selected,
  };
}

export const DeadComponentId = 'dead';

export interface DeadComponent extends Component {
  componentId: typeof DeadComponentId;
  /** Game time (ms) when this entity died — used for respawn timer */
  diedAt: number;
}

export function createDeadComponent(diedAt: number): DeadComponent {
  return { componentId: DeadComponentId, diedAt };
}

// ---------------------------------------------------------------------------
// Inventory / Economy — gold, XP, level (heroes only)
// ---------------------------------------------------------------------------

export const InventoryComponentId = 'inventory';

export interface InventoryComponent extends Component {
  componentId: typeof InventoryComponentId;
  gold: number;
  xp: number;
  level: number;
  xpToNextLevel: number;
  /** Item slot IDs — null means empty, max 6 slots */
  items: Array<string | null>;
}

// XP required to reach each level (SPEC table)
export const XP_PER_LEVEL = [0, 230, 370, 480, 580, 600, 720, 750, 890, 930, 1050];

export function createInventoryComponent(startingGold = 600): InventoryComponent {
  return {
    componentId: InventoryComponentId,
    gold: startingGold,
    xp: 0,
    level: 1,
    xpToNextLevel: XP_PER_LEVEL[1],
    items: [null, null, null, null, null, null],
  };
}

// ---------------------------------------------------------------------------
// Respawn — tracks respawn position for heroes
// ---------------------------------------------------------------------------

export const RespawnComponentId = 'respawn';

export interface RespawnComponent extends Component {
  componentId: typeof RespawnComponentId;
  spawnX: number;
  spawnY: number;
}

export function createRespawnComponent(x: number, y: number): RespawnComponent {
  return { componentId: RespawnComponentId, spawnX: x, spawnY: y };
}

// ---------------------------------------------------------------------------
// AbilityComponent — per-hero ability slots with runtime state
// ---------------------------------------------------------------------------

export const AbilityComponentId = 'ability';

export interface AbilitySlotState {
  abilityId: string;
  level: number;          // 0 = not yet levelled, 1-3 active
  cooldownEndsAt: number; // game time ms when ability comes off CD
  /** Pending cast state set by InputManager, consumed by AbilitySystem */
  pendingCast: {
    targetEntityId?: string;
    targetX?: number;
    targetY?: number;
  } | null;
}

export interface AbilityComponent extends Component {
  componentId: typeof AbilityComponentId;
  slots: [AbilitySlotState, AbilitySlotState, AbilitySlotState, AbilitySlotState];
  /** Skill points available to spend */
  skillPoints: number;
}

export function createAbilityComponent(abilityIds: [string, string, string, string]): AbilityComponent {
  return {
    componentId: AbilityComponentId,
    slots: abilityIds.map(id => ({
      abilityId: id,
      level: 0,
      cooldownEndsAt: 0,
      pendingCast: null,
    })) as AbilityComponent['slots'],
    skillPoints: 0,
  };
}

// ---------------------------------------------------------------------------
// StatusEffectsComponent — active debuffs/buffs on a unit
// ---------------------------------------------------------------------------

export const StatusEffectsComponentId = 'statusEffects';

export interface ActiveStatusEffect {
  type: string;         // 'stun' | 'slow' | 'root' | 'silence' | 'taunt'
  expiresAt: number;    // game time ms
  magnitude?: number;   // e.g. slow factor 0.5
  sourceEntityId: string;
}

export interface StatusEffectsComponent extends Component {
  componentId: typeof StatusEffectsComponentId;
  effects: ActiveStatusEffect[];
}

export function createStatusEffectsComponent(): StatusEffectsComponent {
  return { componentId: StatusEffectsComponentId, effects: [] };
}

export function hasStatus(comp: StatusEffectsComponent, type: string, now: number): boolean {
  return comp.effects.some(e => e.type === type && e.expiresAt > now);
}

export function addStatus(
  comp: StatusEffectsComponent,
  type: string,
  durationMs: number,
  now: number,
  sourceEntityId: string,
  magnitude?: number
): void {
  // Replace existing effect of same type if new duration is longer
  const existing = comp.effects.findIndex(e => e.type === type);
  const newEffect: ActiveStatusEffect = {
    type, expiresAt: now + durationMs, magnitude, sourceEntityId,
  };
  if (existing >= 0) {
    if (newEffect.expiresAt > comp.effects[existing].expiresAt) {
      comp.effects[existing] = newEffect;
    }
  } else {
    comp.effects.push(newEffect);
  }
}

// ---------------------------------------------------------------------------
// ProjectileComponent — moving projectile entities
// ---------------------------------------------------------------------------

export const ProjectileComponentId = 'projectile';

export interface ProjectileComponent extends Component {
  componentId: typeof ProjectileComponentId;
  /** Who fired it */
  ownerId: string;
  ownerTeam: string;
  /** Target (for homing) or null (for point-targeted, moves in straight line) */
  targetEntityId: string | null;
  /** Fixed destination for point projectiles */
  destX: number;
  destY: number;
  speed: number;   // world units / sec
  /** Effect JSON string — parsed by AbilitySystem on hit */
  effectJson: string;
  /** Visual radius for AoE on arrival */
  aoeRadius: number;
}

export function createProjectileComponent(
  ownerId: string,
  ownerTeam: string,
  destX: number, destY: number,
  speed: number,
  effectJson: string,
  targetEntityId: string | null = null,
  aoeRadius = 0
): ProjectileComponent {
  return {
    componentId: ProjectileComponentId,
    ownerId, ownerTeam,
    targetEntityId, destX, destY,
    speed, effectJson, aoeRadius,
  };
}