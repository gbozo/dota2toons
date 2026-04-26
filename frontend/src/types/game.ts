export type Team = 'radiant' | 'dire' | 'neutral';
export type UnitType = 'hero' | 'creep' | 'tower' | 'building' | 'tree' | 'rune' | 'ancient';

export interface GameEntity {
  id: string;
  type: string;
  team: Team;
  x: number;
  y: number;
  z: number;
  rotation?: number;
}

export interface MapBuilding {
  name: string;
  x: number;
  y: number;
  z: number;
  team: Team;
  bounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export interface MapTree {
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface MapData {
  buildings: MapBuilding[];
  trees: MapTree[];
  gridNav: Array<{ x: number; y: number }>;
  elevation: Array<Array<number>>;
  lanes: Record<string, Array<{ x: number; y: number }>>;
  spawnPoints: Record<Team, { x: number; y: number }>;
}

export type WSMessageType =
  | 'connect'
  | 'disconnect'
  | 'game_state'
  | 'entity_spawn'
  | 'entity_destroy'
  | 'entity_update'
  | 'chat'
  | 'error';

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
}

export interface GameStateMessage {
  tick: number;
  entities: GameEntity[];
}

export interface EntitySpawnMessage {
  entityId: string;
  type: string;
  team: Team;
  hero?: string;
  x: number;
  y: number;
}

export interface EntityUpdateMessage {
  entityId: string;
  x?: number;
  y?: number;
  z?: number;
  hp?: number;
  mana?: number;
}

export interface MapLoadProgress {
  loaded: number;
  total: number;
  file: string;
}

export interface PathNode {
  x: number;
  y: number;
  g: number;
  h: number;
  parent?: PathNode;
}