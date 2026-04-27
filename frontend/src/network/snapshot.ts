/**
 * network/snapshot.ts
 *
 * Applies full and delta snapshots from the server to the client ECS world.
 *
 * For now the client runs its own simulation (Phases 0-5).
 * In Phase 7 the server becomes authoritative and these functions replace
 * the client-side simulation for all non-local entities.
 */

import type { World } from '../ecs/world';
import type { FullSnapshot, DeltaSnapshot, EntityState } from './protocol';
import {
  createPositionComponent,
  createVelocityComponent,
  createTeamComponent,
  createUnitTypeComponent,
  createHealthComponent,
  createCombatComponent,
  createPathComponent,
  createInventoryComponent,
  createStatusEffectsComponent,
} from '../components/index';

// ---------------------------------------------------------------------------
// Apply full snapshot — replace entire ECS state
// ---------------------------------------------------------------------------

export function applyFullSnapshot(world: World, snap: FullSnapshot): void {
  // Remove all existing entities except locally controlled ones
  for (const [id] of world.entities) {
    world.destroyEntity(id);
  }

  for (const es of snap.ents) {
    applyEntityState(world, es);
  }
}

// ---------------------------------------------------------------------------
// Apply delta snapshot — create/update/destroy
// ---------------------------------------------------------------------------

export function applyDeltaSnapshot(world: World, snap: DeltaSnapshot): void {
  // Destroys
  for (const id of snap.destroys) {
    const entity = world.getEntity(id);
    if (entity) entity.active = false;
  }

  // Creates
  for (const es of snap.creates) {
    applyEntityState(world, es);
  }

  // Updates — only non-local entities (local hero is predicted client-side)
  for (const es of snap.updates) {
    updateEntityState(world, es);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyEntityState(world: World, es: EntityState): void {
  // Create entity with server-assigned ID
  const entity = world.createEntity(es.id);

  world.addComponent(entity.id, createPositionComponent(es.x, es.y, es.z, es.rot));
  world.addComponent(entity.id, createVelocityComponent());
  world.addComponent(entity.id, createTeamComponent(es.team as any));
  world.addComponent(entity.id, createUnitTypeComponent(es.ut as any, es.sub));
  world.addComponent(entity.id, createHealthComponent(es.hp, es.mhp, es.mp, es.mmp));
  world.addComponent(entity.id, createCombatComponent());
  world.addComponent(entity.id, createPathComponent());
  world.addComponent(entity.id, createStatusEffectsComponent());

  if (es.ut === 'hero' && es.ex) {
    const inv = createInventoryComponent(es.ex['gold'] ?? 600);
    inv.xp            = es.ex['xp'] ?? 0;
    inv.level         = es.ex['level'] ?? 1;
    inv.xpToNextLevel = 230;
    world.addComponent(entity.id, inv);
  }
}

function updateEntityState(world: World, es: EntityState): void {
  const pos = world.getComponent<any>(es.id, 'position');
  if (pos) {
    pos.x = es.x; pos.y = es.y; pos.z = es.z; pos.rotation = es.rot;
  }

  const hp = world.getComponent<any>(es.id, 'health');
  if (hp) {
    hp.hp = es.hp; hp.maxHp = es.mhp; hp.mana = es.mp; hp.maxMana = es.mmp;
  }

  if (es.ut === 'hero' && es.ex) {
    const inv = world.getComponent<any>(es.id, 'inventory');
    if (inv) {
      inv.gold  = es.ex['gold']  ?? inv.gold;
      inv.xp    = es.ex['xp']    ?? inv.xp;
      inv.level = es.ex['level'] ?? inv.level;
    }
  }
}
