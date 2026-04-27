# TODO.md - Work Items by Agent

Work items are organized by **phase** and split into two independent agent tracks:
- **[FE]** Frontend Agent -- TypeScript, Three.js, React, client ECS
- **[BE]** Backend Agent -- Go, server ECS, game systems, networking

---

## Phase 0: Project Cleanup ✅ COMPLETE

- [x] Remove unused deps, dead code, fix ECS bugs, add vite.config.ts proxy
- [x] Rename main.ts → main.tsx, React root mount
- [x] Fix hero key typos in heroLoader
- [x] Fix mapLoader entity detection using category keys
- [x] Add leamare submodule, copy mapdata to server + frontend/public
- [x] Go: CheckOrigin, direct deps, internal/ structure, mapdata loader + HTTP endpoints

---

## Phase 1: Renderable Map ✅ COMPLETE

- [x] Terrain PlaneGeometry(20928,20928,326,326) with vertex displacement + color
- [x] InstancedMesh trees (1 draw call for 2475 trees)
- [x] Team-colored BoxGeometry buildings
- [x] Perspective top-down camera (fov=50), WASD/edge-scroll/zoom
- [x] Terrain 90° CW rotation via vertex index remapping (Radiant bottom-left)
- [x] Coordinate system: game X→Three X, game Y→Three -Z; camera.up=(0,0,-1)
- [x] Debug overlay: grid, axis labels, RADIANT/DIRE markers, mouse hover coords+elevation+object

---

## Phase 2: Hero Loading and Input ✅ COMPLETE

- [x] 10 MVP hero GLTF models downloaded from gbozo/dota2hero, placed in public/heroes/
- [x] GLTFLoader with cache, clone, SkinnedMesh DetachedBindMode fix
- [x] Model orientation: scene.rotation.x=-PI/2, scene.rotation.y=PI (upright, facing north)
- [x] Scale 0.4 → body width ≈1 grid cell (64 world units)
- [x] Animation state machine (idle/run/attack) — clips absent in ClayGL format, ready for future
- [x] Smooth rotation interpolation 540°/s, shortest-path angular wrap
- [x] input.ts: Raycaster click-to-ground, entity picking, selection ring, cursor ring
- [x] Right-click → A* pathfind → PathComponent; left-click → select
- [x] Space → center camera; S → stop
- [x] Pathfinding: binary heap A*, 8-dir, diagonal corner-cutting, LOS path smoothing
- [x] Gridnav correctness: gridnavdata.json marks BLOCKED cells (inverted)
- [x] buildObjectBlockedSet: trees + buildings added to pathfinding blocked set
- [x] Path snap + prepend exact pos fix (warp on new move command)
- [x] LOS corner-cutting fix (mid-path warp through walls)

---

## Phase 3: Client-Side Game Loop ✅ COMPLETE

### Game Loop
- [x] Fixed-timestep 30Hz accumulator in main.tsx
- [x] Waypoint budget carry-over (no micro-stutter at waypoints)
- [x] Render interpolation: snapshotPrevPositions + lerp by alpha=accumulator/TICK

### Creep System
- [x] CreepSpawnerSystem: 3 melee + 1 ranged per lane every 30s, siege every 5th wave
- [x] LaneAIComponent: lane, waypointIndex, state (march/fight/chase/return), aggroTarget
- [x] CreepAISystem: state machine, 500u aggro range, 800u leash, sets combat.targetId
- [x] SeparationSystem: O(n²) push-apart, UNIT_RADIUS=32 (half grid cell)
- [x] Creep InstancedMesh capsule per team, updated each frame

### Tower System
- [x] TowerAISystem: SPEC priority (hero attacker > creep > siege > hero)
- [x] 22 towers spawned as ECS entities with tier-based HP/damage stats
- [x] Sets combat.targetId; CombatSystem handles damage

### Combat System
- [x] CombatSystem: SPEC damage formula, attack interval from baseAttackTime
- [x] CombatComponent: armor, baseAttackTime, attackSpeedBonus, targetId
- [x] DeadComponent: heroes marked for respawn, creeps deactivated
- [x] DeathEvent emitted per kill for economy

### Economy
- [x] EconomySystem: creep/hero bounty gold, XP split among nearby allies (1300u)
- [x] Passive gold +1/sec to living heroes
- [x] Level-up via XP_PER_LEVEL table from SPEC
- [x] RespawnSystem: respawn after (level×2+4)s, restore HP/mana, teleport to fountain
- [x] InventoryComponent (gold, xp, level) + RespawnComponent (spawn coords)

### Health Bars
- [x] 2D canvas overlay, projected from 3D world positions each frame
- [x] HP colour: green→yellow→red; team pip; selected hero highlighted gold
- [x] Dead hero: respawn countdown at fountain position

---

## Phase 4: Hero Abilities — NOT STARTED

### [FE] Ability Framework

- [ ] Design ability data structure: id, name, slot (Q/W/E/R), cooldown, manaCost, castRange, castTime, abilityType (targeted/point/no-target/passive), maxLevel
- [ ] Create `AbilitySystem`: process casts, check cooldown + mana, apply effects
- [ ] Implement ability types: Targeted (click entity), Point (click ground), No-target (instant), Passive
- [ ] Status effect system: stun, slow, root, silence with duration tracking
- [ ] Projectile entities: spawn on cast, move toward target, apply effect on arrival
- [ ] Damage types: Physical (armor), Magical (magic resist), Pure (no reduction)
- [ ] Ability UI: icons with cooldown radial overlay, mana cost, level dots, Q/W/E/R labels
- [ ] Q/W/E/R keybinds + click-to-target flow
- [ ] Ability leveling: skill points on level-up, max 4/4/4/3 per ability

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

## Phase 5: HUD and Shop — MOSTLY COMPLETE

### [FE] React UI

- [x] TopBar: game clock (MM:SS), Radiant kills – Dire kills
- [x] BottomBar: hero portrait (abbrev), HP/mana/XP bars (live from ECS), level, gold
- [x] KillFeed: kill events with killer/victim names, team colour, auto-dismiss 5s
- [x] Minimap: canvas 2D bottom-left, tower squares, creep dots, hero circles, local hero outlined
- [x] Health bars: 2D canvas projected from 3D positions, all units
- [x] Gold + Level wired live to InventoryComponent via syncHudStats()
- [x] DEBUG_MAP flag gates walkable overlay + coordinate grid
- [ ] Ability bar: 4 slots with cooldown radial overlay, mana cost, level dots, hotkey labels `[3h]`
- [ ] Inventory bar: 6 item slots `[2h]`
- [ ] Scoreboard: Tab overlay, K/D/A, level, gold, net worth `[3h]`
- [ ] Shop: B key overlay, item grid by category, buy on click `[4h]`
- [ ] HeroSelect: pre-game pick screen (deferred to Phase 7 lobby) `[3h]`

---

## Phase 6: Server-Side Game State — NOT STARTED

### [BE] Server ECS

- [ ] `internal/game/entity.go`: Entity struct with component map, entity pool
- [ ] `internal/game/world.go`: World struct with entity CRUD, system registration, update loop
- [ ] All components in Go matching TypeScript IDs: Position, Velocity, Team, UnitType, Health, Combat, Path, LaneAI, Ability, Inventory, NetworkId

### [BE] Server Systems

- [ ] Port MovementSystem to Go: waypoint following, elevation lookup
- [ ] Port CombatSystem to Go: damage formula, attack timing, death handling
- [ ] Port CreepAISystem to Go: state machine, aggro, targeting
- [ ] Port TowerAISystem to Go: target selection per SPEC priority
- [ ] Port SpawnerSystem to Go: creep waves, hero respawn timers
- [ ] VisionSystem: per-team visibility from hero/tower vision ranges
- [ ] EconomySystem: gold tracking, XP distribution, level-up
- [ ] Port ability system to Go (depends on Phase 4)

### [BE] Server Pathfinding

- [ ] Binary heap in Go
- [ ] A* 8-directional with gridnav-inverted logic, path smoothing
- [ ] Flow fields for creep lane movement (precomputed direction grid per lane)
- [ ] Validate client move commands against server pathfinding

### [BE] Game Loop

- [ ] `internal/game/tick.go`: time.Ticker at 30 Hz, fixed-step simulation
- [ ] Input queue: buffer per-client inputs, process at tick start
- [ ] System execution order: Input → Movement → Combat → CreepAI → TowerAI → Spawner → Separation → Vision → Economy

---

## Phase 7: Networking — NOT STARTED

### [BE] Protocol and Snapshots

- [x] vmihailenco/msgpack/v5 added to Go dependencies
- [ ] `internal/network/protocol.go`: all client→server and server→client message types
- [ ] `internal/network/session.go`: per-client state, input queue, ACK tracking
- [ ] `internal/network/snapshot.go`: full + delta snapshot serializer
- [ ] Vision filtering in snapshots
- [ ] Priority accumulator for high-frequency entities

### [BE] Connection Management

- [ ] Refactor hub.go: game rooms, player assignment, team balancing
- [ ] Lobby: create room, join, ready up, start game
- [ ] Disconnect: grace period, reconnect with full snapshot
- [ ] Game-over: detect ancient destruction, broadcast result, cleanup

### [FE] Network Client

- [x] @msgpack/msgpack added to frontend dependencies
- [ ] `network/client.ts`: WebSocket, MessagePack encode/decode, message routing
- [ ] `network/protocol.ts`: TypeScript types matching Go messages
- [ ] `network/snapshot.ts`: apply full/delta snapshot to client ECS

### [FE] Prediction and Reconciliation

- [ ] `game/prediction.ts`: input buffer with sequence numbers
- [ ] Apply move commands locally, store pending
- [ ] Reconcile on server state, replay unACK'd inputs
- [ ] Entity interpolation: buffer 2 server states, lerp at render time
- [ ] Ping indicator in HUD

### [FE] Lobby UI

- [ ] Lobby screen: room list, create/join
- [ ] Hero select connected to server: pick, see others' picks, timer

---

## Phase 8: Polish and Optimization — NOT STARTED

### [FE] Visual Polish

- [ ] Fog of war: dark overlay with radial cutouts at vision sources
- [ ] Day/night cycle: tint lighting, reduce vision range at night
- [ ] Particle effects: ability impacts, gold sparkle, level-up glow
- [ ] Damage numbers: floating text per hit, coloured by damage type
- [ ] Death animation: hero falls, greys out, respawn timer overlay
- [ ] Loading screen: asset preload progress bar

### [FE] Audio

- [ ] Howler.js integration
- [ ] Attack hit sounds, ability cast sounds
- [ ] Ambient map sounds (birds, water)
- [ ] UI sounds: click, buy, level-up, kill announce

### [FE] Performance

- [x] InstancedMesh for creeps (one capsule mesh per team)
- [ ] LOD system: reduce geometry detail for distant objects
- [ ] Texture atlas for terrain
- [ ] Profile + fix top 5 frame-time bottlenecks

### [BE] Performance and Reliability

- [ ] Profile server tick: target <10ms with 300 entities
- [ ] Connection stress test: 10 clients, measure bandwidth
- [ ] Graceful shutdown, structured logging (slog)
- [ ] Replay system: record inputs per tick, replay viewer

---

## Known Issues / Tech Debt

- **Hero animations**: ClayGL GLTF exports store animations in `animations.json` (custom format), not embedded in GLTF. AnimationMixer ready but clips don't play. Needs custom loader.
- **SeparationSystem O(n²)**: fine for ~62 units, needs spatial hashing at higher counts.
- **Terrain/walkable coordinate split**: terrain mesh uses rotated elevation indices (visual); gameplay lookups use original indices. Must maintain carefully.
- **Minimap click-to-pan**: minimap renders correctly but clicking it doesn't pan camera yet.
- **Shop/Items**: Economy system tracks gold but no item purchases implemented.
- **Hero stats not scaling with level**: HP, damage, armor should increase on level-up (not yet implemented).

---

## Progress Summary

| Phase | Status | Notes |
|-------|--------|-------|
| 0: Cleanup | ✅ Done | All items |
| 1: Renderable Map | ✅ Done | Perspective cam, correct orientation |
| 2: Hero Loading + Input | ✅ Done | SkinnedMesh fix, pathfinding corrected |
| 3: Game Loop | ✅ Done | Creeps, towers, combat, economy, respawn, interpolation |
| 4: Hero Abilities | ⏳ Not started | 40 abilities across 10 heroes |
| 5: HUD and Shop | 🔄 ~75% | TopBar, BottomBar, Minimap, KillFeed done; Shop/Abilities/Scoreboard remain |
| 6: Server-Side | ⏳ Not started | BE work |
| 7: Networking | ⏳ Not started | deps added only |
| 8: Polish | ⏳ Not started | InstancedMesh creeps done |
