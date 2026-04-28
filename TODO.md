# TODO.md - Work Items

---

## Phase 0: Cleanup ✅ COMPLETE
## Phase 1: Renderable Map ✅ COMPLETE
## Phase 2: Hero Loading + Input ✅ COMPLETE
## Phase 3: Client-Side Game Loop ✅ COMPLETE
## Phase 4: Hero Abilities ✅ COMPLETE
## Phase 5: HUD and Shop ✅ COMPLETE
## Phase 6: Server-Side Game State ✅ COMPLETE
## Phase 7: Networking ✅ COMPLETE
## Phase 8: Polish + Fixes ✅ COMPLETE (~95%)

### Completed this session
- [x] Audio: Web Audio API, pre-baked buffers, per-sound rate limiting, positional `playAt()` with radius filter
- [x] Creep AI rewrite: direct waypoint march (no A*), A*-only for chase, no leash/return, no dynamic blocking
- [x] Creep visibility: `frustumCulled = false`, `CylinderGeometry` (top-down visible), elevation from `MovementSystem`
- [x] Separation system: walkability-clamped pushes (no pushing units into river/blocked cells)
- [x] Watch tower fix: `npc_dota_watch_tower` excluded from combat entity spawn (was attacking friendly heroes)
- [x] Creep debug overlay: nav grid (walkable/blocked/occupied), per-creep direction arrows, path target lines, state labels
- [x] Persistent player identity: `localStorage` UUID, name, room, hero — pre-fills lobby on reload
- [x] Server reconnect: `clientId → heroEntityId` map per room — same hero reused on re-join
- [x] Auto-select local hero: server sends `oid` (ownerClientId) in snapshots, client claims + selects on first receive
- [x] Disconnect return-to-spawn: A* path to fountain on clean disconnect or ping timeout (10s ping / 15s pong deadline)

---

## Phase 9: Performance — IN PROGRESS

All items below are specific, evidence-based bottlenecks identified by code
inspection. Each entry names the exact file and line range responsible.

---

### P0 — Frame budget killers (fix first)

- [ ] **`syncCreeps` allocates 4 Three.js objects every frame** (`main.tsx:1198-1201`)
  `new THREE.Matrix4()`, `Vector3`, `Quaternion`, `Vector3(1,1,1)` are created
  inside the loop body on every render call. Hoist them as class-level reusable
  instances and call `.set()` / `.identity()` to reuse. Same pattern as
  `_screenPos` which is already hoisted.

- [ ] **`syncCreeps` allocates `new THREE.Vector3(0,1,0)` per creep** (`main.tsx:1226`)
  `quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), facingY)` — allocates a
  Vector3 for every creep every frame. Hoist as `private readonly _UP = new
  THREE.Vector3(0, 1, 0)`.

- [ ] **`drawFogOfWar` creates a `RadialGradient` + `clone()` per vision source every frame** (`main.tsx:1311-1320`)
  `createRadialGradient` is expensive canvas API. `this._screenPos.clone()`
  allocates a new `Vector3`. Cache the pixel radius per hero/tower (it only
  changes when the camera zooms) and skip gradient recreation when nothing
  moved. At minimum, replace `.clone()` with a second pre-allocated `_edgePos`
  vector.

- [ ] **`drawHealthBars` iterates ALL entities and does 4 component lookups + a
  `Vector3.project()` per entity per frame** (`main.tsx:1349-1408`)
  At 300 entities that's 1200 Map lookups + 300 matrix-vector multiplies per
  frame purely for bar rendering. Solution: maintain a separate flat array of
  `{ pos, hp, team, isHero }` updated once per tick (not per frame), and only
  iterate that in the render path.

- [ ] **`snapshotPrevPositions` allocates a new `{ x, y, z }` object per entity per tick** (`main.tsx:1154-1160`)
  At 300 entities × 30 Hz = 9 000 short-lived objects/s. Replace the
  `Map<string, {x,y,z}>` with two `Float32Array`s (or a single interleaved one)
  indexed by a stable entity integer ID. Zero allocation per tick.

---

### P1 — A* per-query allocation (CPU spikes during wave fights)

- [ ] **`Pathfinding.findPath` allocates `new MinHeap()`, `new Set()`, `new Map()`,
  and one `HeapNode` object per open-set expansion, every call** (`movement.ts:332-345`)
  With 60 creeps replanning every 10 ticks, that's 6 A* calls/tick × many node
  allocs each. Pre-allocate the open set heap array, closed set (use a
  generation-stamp Uint8Array instead of `Set<number>`), and a flat node pool
  (`Float64Array` for g/h/f + `Int32Array` for parent links). Zero GC pressure
  per pathfind.

- [ ] **`CreepAISystem.update` rebuilds `dynamicBlocked: Set<number>` from scratch
  every tick** (`creep.ts:234-242`)
  Clear-and-refill a persistent `Set` instead of `new Set()` each tick — avoids
  one allocation and one GC per tick.

- [ ] **`CreepAISystem` calls `this.pathfinding.findPath` which returns a new
  `Array<{x,y}>` every call** (`movement.ts:367-368, creep.ts:343`)
  The returned waypoint array is immediately copied into `path.waypoints` and
  the original is discarded. Pass a pre-allocated output array as a parameter
  and write into it directly. Eliminates one short-lived array per A* call.

---

### P2 — ECS hot-path overhead

- [ ] **Every system iterates `world.entities.values()` (a `Map` iterator) and
  performs string-keyed `Map.get()` for each component lookup** (all systems)
  String key hashing on every `getComponent('position', ...)` call is measurable
  overhead at 300 entities × ~5 lookups per system × 8 systems. Options:
  (a) intern component IDs as small integers and use array-indexed component
  storage per entity; or (b) cache `entity.components.get('position')` in a
  local var at the top of each system's per-entity loop body (already done in
  some places, not all).

- [ ] **`world.entities` is never compacted — inactive entities accumulate**
  Dead creeps are marked `active = false` but stay in the Map forever. Over a
  long game this grows the iteration cost of every system. Add a periodic
  compaction pass (e.g. every 30 ticks) that deletes inactive non-hero entities.

---

### P3 — Canvas HUD (secondary, lower impact)

- [ ] **`drawHealthBars` calls `ctx.fillStyle = ...` inside the loop, causing style
  state changes per entity** (`main.tsx:1396-1407`)
  Batch by colour: collect all green bars, draw them with one `fillStyle` set,
  then amber, then red. Reduces canvas state changes from 300 to ~3.

- [ ] **`drawFogOfWar` renders at full canvas resolution every frame**
  Render fog at half resolution (e.g. 960×540) and upscale with `drawImage`
  with `imageSmoothingEnabled = false`. Fog edges are soft anyway; the
  quality difference is imperceptible at half res.

- [ ] **Fog is redrawn every frame even when no vision sources moved**
  Track previous positions of all vision sources. Skip the fog redraw entirely
  if nothing changed. Heroes move every frame so this only helps during camera
  pan with no hero movement, but towers (static) always skip.

---

### P4 — Three.js render

- [ ] **No frustum culling on health bars / damage numbers** — screen-space
  bars are already filtered by `sx < -BAR_W || sx > W + BAR_W` but damage
  numbers have no culling. Add bounds check before pushing to `_dmgNums`.

- [ ] **Hero label `Sprite` positions are updated every frame** (`main.tsx:1191`)
  Labels only need to move when the hero moves. Move label update into the tick
  path, not the render path.

- [ ] **`animSystem.updateMixers(dtSec)` called every frame for all heroes**
  Already efficient, but confirm mixers for dead/off-screen heroes are paused.

---

### P5 — Server side

- [ ] **`SeparationSystem` and `CreepAISystem` on server both iterate all entities
  with full `w.Entities()` snapshot (returns a new slice each call)**
  (`systems.go:621, spawner.go:100`)
  `w.Entities()` allocates a new `[]*Entity` slice every call under a read
  lock. Cache the slice for the duration of a tick by calling it once at tick
  start and passing it down, or expose an `EntitiesUnsafe()` that skips the
  copy inside a tick-scoped lock.

- [ ] **Server `CreepAISystem` chases with a direct two-point waypoint** — does not
  use A*, so creeps walk through walls in server auth mode. Add server-side
  pathfinding calls (same A* already used for hero move commands, `tick.go:208`).

---

## Progress Summary

| Phase | Status |
|-------|--------|
| 0: Cleanup | ✅ Done |
| 1: Renderable Map | ✅ Done |
| 2: Hero Loading + Input | ✅ Done |
| 3: Game Loop | ✅ Done |
| 4: Hero Abilities | ✅ Done |
| 5: HUD and Shop | ✅ Done |
| 6: Server-Side | ✅ Done |
| 7: Networking | ✅ Done |
| 8: Polish + Fixes | ✅ ~90% done |
| 9: Performance | 🔄 Not started |
