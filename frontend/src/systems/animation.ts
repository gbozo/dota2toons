/**
 * systems/animation.ts
 *
 * AnimationSystem drives HeroInstance animation state from ECS component data.
 * Each tick it checks:
 *   - PathComponent.reachedTarget → idle vs run
 *   - CombatComponent.lastAttackTime (fresh) → attack
 *
 * AnimationMixer.update() is called per render frame (not per tick) via the
 * separate updateMixers() helper so animations stay smooth at 60 FPS.
 */

import type { World, System } from '../ecs/world';
import {
  PathComponentId,
  CombatComponentId,
  UnitTypeComponentId,
  type PathComponent,
  type CombatComponent,
  type UnitTypeComponent,
} from '../components/index';
import type { HeroInstance, AnimationState } from '../game/heroLoader';

export class AnimationSystem implements System {
  readonly name = 'animation';

  /** Map from entityId → HeroInstance */
  private instances = new Map<string, HeroInstance>();

  register(entityId: string, instance: HeroInstance): void {
    this.instances.set(entityId, instance);
  }

  unregister(entityId: string): void {
    this.instances.delete(entityId);
  }

  update(dt: number, world: World): void {
    const now = performance.now();

    for (const [entityId, instance] of this.instances) {
      const path = world.getComponent<PathComponent>(entityId, PathComponentId);
      const combat = world.getComponent<CombatComponent>(entityId, CombatComponentId);
      const unitType = world.getComponent<UnitTypeComponent>(entityId, UnitTypeComponentId);

      if (!unitType) continue;

      let desired: AnimationState = 'idle';

      // Moving?
      if (path && !path.reachedTarget && path.waypoints.length > 0) {
        desired = 'run';
      }

      // Attacking? (attack fired within the last 600 ms)
      if (combat && now - combat.lastAttackTime < 600) {
        desired = 'attack';
      }

      if (desired !== instance.currentState) {
        instance.setState(desired);
      }
    }

    // Note: mixer.update(dt) is NOT called here — it's called per render frame
    // via updateMixers() to keep animations smooth at 60 FPS regardless of tick.
    void dt;
  }

  /**
   * Call this every render frame with the real frame delta (seconds).
   * Keeps AnimationMixer running at full 60 FPS smoothness.
   */
  updateMixers(dtSeconds: number): void {
    for (const instance of this.instances.values()) {
      instance.mixer?.update(dtSeconds);
    }
  }
}
