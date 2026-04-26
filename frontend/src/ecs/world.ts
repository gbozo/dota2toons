// Entity Component System for Dota 2 Toons

export type EntityID = string;

export interface Component {
  readonly componentId: string;
}

export interface Entity {
  readonly id: EntityID;
  components: Map<string, Component>;
  active: boolean;
}

export interface System {
  readonly name: string;
  update(dt: number, world: World): void;
}

export interface World {
  entities: Map<EntityID, Entity>;
  tick: number;
  deltaTime: number;
  
  createEntity(id?: EntityID): Entity;
  destroyEntity(id: EntityID): void;
  getEntity(id: EntityID): Entity | undefined;
  
  addComponent<T extends Component>(entityId: EntityID, component: T): void;
  removeComponent(entityId: EntityID, componentId: string): void;
  getComponent<T extends Component>(entityId: EntityID, componentId: string): T | undefined;
  hasComponent(entityId: EntityID, componentId: string): boolean;
  
  registerSystem(system: System): void;
  unregisterSystem(systemName: string): void;
  
  update(dt: number): void;
}

export function createWorld(): World {
  const entities = new Map<EntityID, Entity>();
  const systems: System[] = [];
  let currentTick = 0;
  let currentDeltaTime = 0;
  
  const entityCounter = { count: 0 };
  
  const generateId = (): EntityID => {
    entityCounter.count++;
    return `entity_${entityCounter.count}`;
  };
  
  return {
    entities,
    tick: currentTick,
    deltaTime: currentDeltaTime,
    
    createEntity(id?: EntityID): Entity {
      const entity: Entity = {
        id: id || generateId(),
        components: new Map(),
        active: true,
      };
      entities.set(entity.id, entity);
      return entity;
    },
    
    destroyEntity(id: EntityID): void {
      entities.delete(id);
    },
    
    getEntity(id: EntityID): Entity | undefined {
      return entities.get(id);
    },
    
    addComponent<T extends Component>(entityId: EntityID, component: T): void {
      const entity = entities.get(entityId);
      if (entity) {
        entity.components.set(component.componentId, component);
      }
    },
    
    removeComponent(entityId: EntityID, componentId: string): void {
      const entity = entities.get(entityId);
      if (entity) {
        entity.components.delete(componentId);
      }
    },
    
    getComponent<T extends Component>(entityId: EntityID, componentId: string): T | undefined {
      const entity = entities.get(entityId);
      if (entity) {
        return entity.components.get(componentId) as T | undefined;
      }
      return undefined;
    },
    
    hasComponent(entityId: EntityID, componentId: string): boolean {
      const entity = entities.get(entityId);
      if (entity) {
        return entity.components.has(componentId);
      }
      return false;
    },
    
    registerSystem(system: System): void {
      systems.push(system);
    },
    
    unregisterSystem(systemName: string): void {
      const index = systems.findIndex(s => s.name === systemName);
      if (index !== -1) {
        systems.splice(index, 1);
      }
    },
    
    update(dt: number): void {
      currentTick++;
      currentDeltaTime = dt;
      
      for (const system of systems) {
        system.update(dt, this);
      }
    },
  };
}