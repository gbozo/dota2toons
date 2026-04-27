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
  /** XP accumulated toward next level */
  xpToNextLevel: number;
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