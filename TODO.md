# TODO.md - Work Items by Agent

Work items are organized by **phase** and split into two independent agent tracks:
- **[FE]** Frontend Agent -- TypeScript, Three.js, React, client ECS
- **[BE]** Backend Agent -- Go, server ECS, game systems, networking

Items within a phase can be worked in parallel across agents. Items within the same agent track should be worked sequentially within each phase. Each item has an estimated effort tag.

Dependencies between agents are marked with `[DEPENDS: item]`.

---

## Phase 0: Project Cleanup ✅ COMPLETE

### [FE] Frontend Cleanup

- [x] Remove `socket.io-client` and `uuid` from package.json (unused)
- [x] Remove dead code: `useGameEngine()` and `createRenderer()` from engine.ts
- [x] Fix ECS world.ts: tick/deltaTime not updating on the returned object (value copy bug)
- [x] Fix duplicate `Component` interface in components/index.ts (import from ecs/world.ts)
- [x] Fix terrain range: was -128..128, now covers -10464..+10464
- [x] Add vite.config.ts with dev proxy for `/ws` and `/api` → `localhost:8080`
- [x] Rename main.ts to main.tsx, set up React root mount alongside Three.js canvas
- [x] Clean heroLoader.ts: fix hero key typos (riKI, sandbox, disjoint, io_j, venoman)
- [x] Fix mapLoader.ts: use category keys not entity name field for tree/building detection

### [BE] Backend Cleanup

- [x] Delete stale `server` binary (Windows PE64, non-functional on macOS)
- [x] Add `CheckOrigin` to WebSocket upgrader (allow cross-origin from Vite dev server)
- [x] Make `google/uuid` and `gorilla/websocket` direct deps; add `vmihailenco/msgpack/v5`
- [x] Set up Go project structure: `internal/game/`, `internal/network/`, `internal/pathfinding/`, `internal/mapdata/`
- [x] Add map data JSON files: added `leamare/dota-map-coordinates` as git submodule, copied to `mapdata/data/`
- [x] Copy map data to `frontend/public/mapdata/`

---

## Phase 1: Renderable Map ✅ COMPLETE

### [FE] Map Rendering

- [x] Implement terrain as single `PlaneGeometry(20928, 20928, 326, 326)` with vertex displacement from elevation data
- [x] Apply vertex colors to terrain based on elevation (river/lowland/midground/highland)
- [x] Replace individual tree meshes with `InstancedMesh` using `ConeGeometry` (one draw call for 2475 trees)
- [x] Render buildings as team-colored `BoxGeometry` positioned from mapdata.json
- [x] Implement camera controller: WASD pan, edge-of-screen pan, scroll wheel zoom
- [x] Add ambient + directional lighting (shadows disabled at map scale — too expensive)
- [x] Handle window resize: update renderer size, camera aspect
- [x] **Note:** Camera switched to `PerspectiveCamera` top-down (not orthographic as originally spec'd) — better for debugging and comparable feel
- [x] **Note:** Terrain rotated 90° CW via vertex index remapping to match correct Dota 2 orientation (Radiant bottom-left, river SW→NE)
- [x] Coordinate system: game X → Three X, game Y → Three -Z; `camera.up=(0,0,-1)`
- [x] Debug overlay: coordinate grid, axis labels, RADIANT/DIRE markers, mouse hover shows map coords + grid col/row + elevation + hovered object name

### [BE] Map Data Pipeline

- [x] Create `internal/mapdata/loader.go`: parse mapdata.json, gridnavdata.json, elevationdata.json, lanedata.json
- [x] Expose parsed map data via HTTP endpoints (`GET /api/mapdata/*.json`)
- [x] Navigation grid in-memory (bitset for walkability, 2D array for elevation)
- [x] Parse lane waypoint data into structured lane paths per team per lane

---

## Phase 2: Hero Loading and Input ✅ COMPLETE

### [FE] Hero Models

- [x] Download GLTF hero models for 10 MVP heroes from gbozo/dota2hero repo
- [x] Place models in `frontend/public/heroes/<hero_key>/` directory structure
- [x] Implement `GLTFLoader` in heroLoader.ts: async load, cache, clone for instances
- [x] Fix `SkinnedMesh` world-space pinning: switch to `DetachedBindMode` + identity bind matrices so models follow parent transform
- [x] Fix model orientation: `scene.rotation.x=-PI/2`, `scene.rotation.y=PI` → upright, facing north
- [x] Scale models to 0.4 → body width ~62 world units ≈ 1 grid cell (matches Dota 2 scale)
- [x] Animation state machine (idle/run/attack) wired to ECS — models have no embedded animations in ClayGL GLTF format; state machine ready for when animations are loaded separately
- [x] Smooth rotation interpolation: 540°/s turn speed, shortest-path angular wrap

### [FE] Input System

- [x] Create `input.ts`: mouse NDC tracking, button state, keyboard state
- [x] `THREE.Raycaster` for click-to-ground: right-click on terrain → world position
- [x] Right-click on ground → A* pathfind → set PathComponent waypoints
- [x] Right-click on enemy entity → attack command (wired to console.log, combat in Phase 3)
- [x] Left-click → select unit, show selection ring + hero name in HUD
- [x] Space → center camera on selected/local hero
- [x] Movement cursor ring (green, fades out 800ms)
- [x] Pathfinding: binary heap A*, 8-directional movement, diagonal corner-cutting, LOS path smoothing
- [x] Gridnav correctness fix: `gridnavdata.json` marks BLOCKED cells (not walkable) — inverted logic
- [x] Tree + building obstacles added to pathfinding blocked set (`buildObjectBlockedSet`)
- [x] Path start snapped to grid + exact current pos prepended as first waypoint (fixes warp on new move command)
- [x] LOS corner-cutting check added to `hasLOS` (fixes mid-path warp through walls)

---

## Phase 3: Client-Side Game Loop (Single Player Prototype) — IN PROGRESS

### [FE] Game Loop

- [x] Fixed-timestep accumulator in main.tsx (30 Hz simulation, 60 FPS render)
- [x] Waypoint budget carry-over: hero consumes full movement budget across multiple waypoints per tick (eliminates micro-stutter)
- [ ] Render interpolation: store previous + current entity positions, lerp by accumulator alpha

### [FE] Creep System

- [x] `CreepSpawnerSystem`: spawns 3 melee + 1 ranged per lane every 30s, siege every 5th wave
- [x] `LaneAIComponent`: lane, waypointIndex, state (march/fight/chase/return), aggroTarget, returnPos
- [x] `CreepAISystem`: state machine along lane waypoints, aggro at 500 units, leash at 800 units
- [x] `SeparationSystem`: O(n²) push-apart prevents creeps stacking on same cell
- [x] Creep visuals: `InstancedMesh` capsule per team (blue=Radiant, red=Dire), updated each frame
- [x] `parseLaneWaypoints`: maps 6 lanedata.json paths to radiant/dire × top/mid/bot structure
- [ ] Creep death visual: flash/fade before removing instance

### [FE] Tower System

- [ ] Create `TowerAISystem`: scan for enemies in range, select target by priority per SPEC
- [ ] Implement tower attacks: cooldown-based, damage applied per SPEC stats
- [ ] Tower destruction: remove entity when HP <= 0, visual feedback
- [ ] Tower aggro switch: re-target when hero attacks a friendly hero in range

### [FE] Combat System

- [x] `CombatSystem`: process `combat.targetId`, check range, apply damage on cooldown
- [x] Damage formula: `base_damage * (1 - 0.06 * armor / (1 + 0.06 * |armor|))`
- [x] Attack interval: `baseAttackTime / (1 + speedBonus/100) * 1000ms`
- [x] `CombatComponent` updated: armor, baseAttackTime, attackSpeedBonus, targetId
- [x] `DeadComponent`: heroes marked dead for respawn; creeps set `entity.active = false`
- [x] `DeathEvent` emitted per kill (for economy system consumption)
- [x] Health bars: 2D canvas overlay, projected from 3D world positions, team-colored pip
- [ ] Hero respawn: timer = `(level*2)+4` seconds, respawn at fountain
- [ ] Creep bounty: gold to last-hitter, XP split among nearby heroes

### [FE] Economy

- [ ] Track gold per hero: starting 600, +1/sec passive, +bounty on kill
- [ ] Track XP per hero: level-up thresholds per SPEC, stat gains on level-up
- [ ] Display gold count and level in HUD (gold display exists, not yet wired to economy system)

---

## Phase 4: Hero Abilities

### [FE] Ability Framework

- [ ] Design ability data structure: id, name, slot (Q/W/E/R), cooldown, manaCost, castRange, castTime, abilityType, maxLevel
- [ ] Create `AbilitySystem`: process ability casts, check cooldown + mana, apply effects
- [ ] Implement ability types: Targeted, Point, No-target, Passive
- [ ] Create status effect system: stun, slow, root, silence with duration tracking
- [ ] Projectile entities: create on cast, move toward target per tick, apply effect on arrival
- [ ] Damage types: Physical (armor), Magical (magic resist), Pure (no reduction)
- [ ] Ability UI: icons in HUD with cooldown overlay, mana cost tooltip, level indicator
- [ ] Ability keybinds: Q/W/E/R keys, click to target/confirm
- [ ] Ability leveling: spend skill points on level-up, max 4/4/4/3 per ability

### [FE] Implement 10 Heroes (4 abilities each)

- [ ] Axe: Berserker's Call (AoE taunt), Battle Hunger (DoT), Counter Helix (passive spin), Culling Blade (execute ult)
- [ ] Pudge: Meat Hook (skillshot pull), Rot (toggle AoE), Flesh Heap (passive HP), Dismember (channel stun)
- [ ] Crystal Maiden: Crystal Nova (AoE slow), Frostbite (root), Arcane Aura (passive mana regen), Freezing Field (channel AoE)
- [ ] Sniper: Shrapnel (AoE zone), Headshot (passive proc), Take Aim (range bonus), Assassinate (long-range nuke)
- [ ] Drow Ranger: Frost Arrows (attack modifier slow), Gust (silence push), Multishot (AoE arrows), Marksmanship (passive agility)
- [ ] Juggernaut: Blade Fury (spin AoE immune), Healing Ward (summon heal), Blade Dance (crit passive), Omnislash (jump ult)
- [ ] Lion: Earth Spike (line stun), Hex (poly disable), Mana Drain (channel drain), Finger of Death (burst nuke)
- [ ] Lina: Dragon Slave (line nuke), Light Strike Array (delayed AoE stun), Fiery Soul (passive AS), Laguna Blade (burst nuke)
- [ ] Sven: Storm Hammer (ranged stun), Great Cleave (passive cleave), Warcry (team armor+speed), God's Strength (damage ult)
- [ ] Witch Doctor: Paralyzing Cask (bounce stun), Voodoo Restoration (toggle heal), Maledict (delayed burst), Death Ward (channel ward)

---

## Phase 5: HUD and Shop

### [FE] React UI

- [x] React render root alongside Three.js canvas (pointer-events:none overlay)
- [x] Basic status display, mouse coordinate debug, selected hero name
- [x] Gold count display (static, not yet wired to economy)
- [x] 2D canvas health bar overlay (drawn per frame, projected from 3D positions)
- [ ] Create `TopBar.tsx`: game clock, kill score (radiant vs dire), day/night indicator
- [ ] Create full `HUD.tsx`: hero portrait, HP/mana bars, level, gold count (wired to economy)
- [ ] Create ability bar in HUD: 4 ability icons with cooldown radial overlay, mana cost, level dots, hotkey labels
- [ ] Create inventory bar in HUD: 6 item slots, drag-to-swap, right-click to use consumables
- [ ] Create `Minimap.tsx`: canvas 2D render, hero dots, tower markers, click-to-pan
- [ ] Create `KillFeed.tsx`: event notifications (kills, tower destruction), auto-dismiss after 5s
- [ ] Create `Scoreboard.tsx`: Tab overlay, hero rows with K/D/A, level, items, gold, net worth
- [ ] Create `Shop.tsx`: overlay panel on B key, item grid by category, search bar, buy on click
- [ ] Create `HeroSelect.tsx`: pre-game hero pick screen, 10 hero portraits, team assignment

---

## Phase 6: Server-Side Game State

### [BE] Server ECS

- [ ] Create `internal/game/entity.go`: Entity struct with component map, entity pool
- [ ] Create `internal/game/world.go`: World struct with entity CRUD, system registration, update loop
- [ ] Define all components in Go matching TypeScript component IDs: Position, Velocity, Team, UnitType, Health, Combat, Path, LaneAI, Ability, Inventory, NetworkId

### [BE] Server Systems

- [ ] Port `MovementSystem` to Go: velocity application, waypoint following, elevation lookup
- [ ] Port `CombatSystem` to Go: damage formula, attack timing, death handling
- [ ] Port `CreepAISystem` to Go: state machine, aggro, targeting
- [ ] Port `TowerAISystem` to Go: target selection, attacks
- [ ] Port `SpawnerSystem` to Go: creep waves, hero respawn timers
- [ ] Implement `VisionSystem` in Go: per-team visibility based on hero/tower vision ranges
- [ ] Implement `EconomySystem` in Go: gold tracking, XP distribution, level-up
- [ ] Port ability system to Go: all 40 abilities with cooldowns, effects, projectiles

### [BE] Server Pathfinding

- [ ] Implement binary heap in Go
- [ ] Port A* algorithm to Go: 8-directional, elevation cost, path smoothing, gridnav-inverted logic
- [ ] Implement flow fields for creep lane movement (precomputed direction grid per lane)
- [ ] Validate client move commands against server pathfinding (reject impossible moves)

### [BE] Game Loop

- [ ] Create `internal/game/tick.go`: `time.Ticker` at 30 Hz, fixed-step simulation
- [ ] Input queue: buffer per-client inputs, process all at tick start
- [ ] System execution order: Input → Movement → Combat → CreepAI → TowerAI → Spawner → Separation → Vision → Economy

---

## Phase 7: Networking

### [BE] Protocol and Snapshots

- [x] Add `vmihailenco/msgpack/v5` to Go dependencies
- [ ] Define message types in `internal/network/protocol.go`: all client→server and server→client messages per SPEC
- [ ] Implement `internal/network/session.go`: per-client state, input queue, last ACK'd tick, sequence tracking
- [ ] Implement `internal/network/snapshot.go`: full snapshot serializer, delta snapshot (diff from base tick)
- [ ] Implement vision filtering in snapshot: only include entities visible to the client's team
- [ ] Implement priority accumulator: high-priority entities update more often than distant ones

### [BE] Connection Management

- [ ] Refactor `hub.go`: separate game rooms, player assignment, team balancing
- [ ] Implement lobby: create room, join room, ready up, start game
- [ ] Handle disconnect: grace period (5 min), reconnect with full snapshot
- [ ] Handle game-over: detect ancient destruction, broadcast result, cleanup

### [FE] Network Client

- [x] Add `@msgpack/msgpack` to frontend dependencies
- [ ] Create `network/client.ts`: WebSocket connection, MessagePack encode/decode, message routing
- [ ] Create `network/protocol.ts`: TypeScript types matching Go message definitions
- [ ] Create `network/snapshot.ts`: apply full/delta snapshot to client ECS

### [FE] Prediction and Reconciliation

- [ ] Create `game/prediction.ts`: input buffer with sequence numbers
- [ ] Implement prediction: apply move commands locally, store in pending buffer
- [ ] Implement reconciliation: on server state, set authoritative position, replay unACK'd inputs
- [ ] Implement entity interpolation: buffer 2 server states per remote entity, lerp at render time
- [ ] Add latency display in HUD (ping indicator)

### [FE] Lobby UI

- [ ] Create lobby screen: room list, create/join buttons
- [ ] Connect hero select screen to server: pick hero, see others' picks, timer

---

## Phase 8: Polish and Optimization

### [FE] Visual Polish

- [ ] Fog of war: dark overlay texture with radial cutouts at vision source positions
- [ ] Day/night cycle: tint scene lighting, reduce vision range at night
- [ ] Particle effects: ability impacts, gold pickup sparkle, level-up glow
- [ ] Damage numbers: floating text on hit, color by damage type
- [ ] Death animation: hero falls, grays out, respawn timer shown
- [ ] Loading screen: asset preload progress bar, hero splash art
- [ ] Restore orthographic camera option (currently perspective top-down, may want to switch back)

### [FE] Audio

- [ ] Add Howler.js for sound playback
- [ ] Attack hit sounds (per weapon type)
- [ ] Ability cast sounds (per ability)
- [ ] Ambient map sounds (birds, water, creep camps)
- [ ] UI sounds: click, buy, level-up, kill announce

### [FE] Performance

- [x] InstancedMesh for creeps (one capsule mesh per team)
- [ ] LOD system: reduce geometry detail for distant objects
- [ ] Texture atlas for terrain (replace vertex colors with proper material)
- [ ] Profile and optimize: identify top 5 frame-time bottlenecks, fix each

### [BE] Performance and Reliability

- [ ] Profile server tick time: target < 10ms per tick with 300 entities
- [ ] Connection stress test: simulate 10 clients, measure bandwidth per client
- [ ] Add graceful shutdown: drain connections, save game state
- [ ] Add structured logging (slog) for debugging
- [ ] Replay system: record all inputs per tick, allow replay playback

---

## Known Issues / Tech Debt

- Hero animations: ClayGL GLTF exports store animations in a separate `animations.json` (custom format), not embedded in the GLTF. AnimationMixer state machine is wired up but clips don't play. Need to parse and load animations separately.
- Path smoothing can still produce suboptimal routes around large tree clusters — LOS corner fix helps but flow fields would be better for creeps.
- `SeparationSystem` is O(n²) — acceptable for ~62 units but will need spatial hashing at higher unit counts.
- Terrain elevation and walkable grid use the **original** (unrotated) data coordinates for gameplay; only the terrain *mesh* vertices use rotated indices. This is correct but must be maintained carefully.

---

## Effort Summary (Updated)

| Phase | Status | FE Done | Notes |
|-------|--------|---------|-------|
| 0: Cleanup | ✅ Done | All items | BE cleanup done too |
| 1: Renderable Map | ✅ Done | All items | Perspective cam, correct orientation |
| 2: Hero Loading + Input | ✅ Done | All items | SkinnedMesh fix, pathfinding inverted |
| 3: Game Loop | 🔄 In Progress | ~70% | Missing: tower AI, respawn, economy, interpolation |
| 4: Hero Abilities | ⏳ Not started | 0% | — |
| 5: HUD and Shop | 🔄 Partial | ~15% | Basic overlays only |
| 6: Server-Side Game State | ⏳ Not started | 0% | BE work |
| 7: Networking | ⏳ Not started | ~5% | msgpack dep added only |
| 8: Polish | ⏳ Not started | ~5% | InstancedMesh creeps done |
