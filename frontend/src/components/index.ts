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

export interface AttackStats {
  damageMin: number;
  damageMax: number;
  attackRange: number;
  attackSpeed: number;
}

export interface CombatComponent extends Component {
  componentId: typeof CombatComponentId;
  damageMin: number;
  damageMax: number;
  attackRange: number;
  attackSpeed: number;
  lastAttackTime: number;
}

export function createCombatComponent(
  damageMin = 10,
  damageMax = 20,
  attackRange = 100,
  attackSpeed = 1.0,
  lastAttackTime = 0
): CombatComponent {
  return {
    componentId: CombatComponentId,
    damageMin,
    damageMax,
    attackRange,
    attackSpeed,
    lastAttackTime,
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