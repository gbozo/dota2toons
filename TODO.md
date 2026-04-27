# TODO.md - Work Items by Agent

Work items are organized by **phase** and split into two independent agent tracks:
- **[FE]** Frontend Agent -- TypeScript, Three.js, React, client ECS
- **[BE]** Backend Agent -- Go, server ECS, game systems, networking

Items within a phase can be worked in parallel across agents. Items within the same agent track should be worked sequentially within each phase. Each item has an estimated effort tag.

Dependencies between agents are marked with `[DEPENDS: item]`.

---

## Phase 0: Project Cleanup

### [FE] Frontend Cleanup

- [ ] Remove `socket.io-client` and `uuid` from package.json (unused) `[0.5h]`
- [ ] Remove dead code: `useGameEngine()` and `createRenderer()` from engine.ts `[0.5h]`
- [ ] Fix ECS world.ts: tick/deltaTime not updating on the returned object (value copy bug) `[0.5h]`
- [ ] Fix duplicate `Component` interface in components/index.ts (import from ecs/world.ts) `[0.5h]`
- [ ] Fix terrain range: currently -128..128, must cover -10464..+10464 `[1h]`
- [ ] Remove inline renderer creation in main.ts, use `createRenderer()` from engine.ts `[0.5h]`
- [ ] Add vite.config.ts with dev proxy for `/ws` -> `localhost:8080` `[0.5h]`
- [ ] Rename main.ts to main.tsx, set up React root mount alongside Three.js canvas `[1h]`
- [ ] Clean heroLoader.ts: fix hero key typos (riKI, sandbox, disjoint, io_j, venoman) `[0.5h]`

### [BE] Backend Cleanup

- [ ] Delete stale `server` binary (Windows PE64, non-functional on macOS) `[0.1h]`
- [ ] Add `CheckOrigin` to WebSocket upgrader (allow cross-origin from Vite dev server) `[0.5h]`
- [ ] Remove unused `google/uuid` indirect dependency or start using it `[0.5h]`
- [ ] Set up Go project structure: `internal/game/`, `internal/network/`, `internal/pathfinding/`, `internal/mapdata/` `[1h]`
- [ ] Add map data JSON files: download from leamare repo, place in `mapdata/data/` `[1h]`
- [ ] Copy map data to `frontend/public/mapdata/` (or configure Vite to serve from root) `[0.5h]`

---

## Phase 1: Renderable Map

### [FE] Map Rendering

- [ ] Implement terrain as single `PlaneGeometry(20928, 20928, 326, 326)` with vertex displacement from elevation data `[3h]`
- [ ] Apply vertex colors to terrain based on elevation (green lowland, lighter highland, blue for river areas) `[2h]`
- [ ] Replace individual tree meshes with `InstancedMesh` using `ConeGeometry` (one draw call for all 2475 trees) `[2h]`
- [ ] Render buildings as team-colored `BoxGeometry` positioned from mapdata.json `[1h]`
- [ ] Implement camera controller: WASD pan, edge-of-screen pan, scroll wheel zoom (1024-8192 frustum) `[3h]`
- [ ] Add frustum culling: check tree/building visibility against `THREE.Frustum` each frame, toggle `.visible` `[1h]`
- [ ] Add ambient lighting + directional light with proper shadow setup `[1h]`
- [ ] Handle window resize: update renderer size, camera aspect, camera frustum `[1h]`

### [BE] Map Data Pipeline

- [ ] Create `internal/mapdata/loader.go`: parse mapdata.json, gridnavdata.json, elevationdata.json, lanedata.json `[3h]`
- [ ] Expose parsed map data via HTTP endpoints (`GET /api/mapdata`, etc.) so client can fetch from server instead of static files `[2h]`
- [ ] Create navigation grid in-memory: bitset for walkability, 2D array for elevation `[2h]`
- [ ] Parse lane waypoint data into structured lane paths per team per lane `[1h]`

---

## Phase 2: Hero Loading and Input

### [FE] Hero Models

- [ ] Download GLTF hero models for 10 MVP heroes from gbozo/dota2hero repo `[2h]`
- [ ] Place models in `frontend/public/heroes/<hero_key>/` directory structure `[1h]`
- [ ] Implement `GLTFLoader` in heroLoader.ts: async load, cache loaded models, clone for instances `[3h]`
- [ ] Implement `AnimationMixer` per hero entity: idle, run, attack states `[3h]`
- [ ] Create animation state machine: transition idle↔run on movement, play attack on combat `[2h]`
- [ ] Scale and orient GLTF models correctly for orthographic view `[1h]`

### [FE] Input System

- [ ] Create `input.ts`: mouse position tracking, button state, keyboard state `[2h]`
- [ ] Implement `THREE.Raycaster` for click-to-ground: right-click on terrain → calculate world position `[2h]`
- [ ] Right-click on ground → set PathComponent target, trigger A* pathfind `[1h]`
- [ ] Right-click on enemy entity → set attack target (entity selection via raycaster) `[2h]`
- [ ] Left-click → select unit, show info. Left-click empty → deselect `[1h]`
- [ ] Space → center camera on local hero `[0.5h]`
- [ ] Add movement cursor (green ring at click point, fades out) `[1h]`

---

## Phase 3: Client-Side Game Loop (Single Player Prototype)

### [FE] Game Loop

- [ ] Implement fixed-timestep accumulator pattern in `loop.ts` (see PLAN.md data flow) `[2h]`
- [ ] Decouple simulation (30 Hz) from rendering (60 FPS): simulation uses fixed dt=33.33ms, rendering interpolates between ticks `[3h]`
- [ ] Implement render interpolation: store previous + current entity positions, lerp by accumulator alpha `[2h]`

### [FE] Pathfinding Upgrade

- [ ] Replace `Array.sort()` open set with binary heap (O(log n) push/pop) `[2h]`
- [ ] Add 8-directional movement (diagonal neighbors with sqrt(2) cost) `[1h]`
- [ ] Add corner-cutting check: diagonal blocked if either adjacent cardinal is unwalkable `[0.5h]`
- [ ] Add path smoothing: line-of-sight string pulling to remove unnecessary waypoints `[2h]`
- [ ] Add elevation cost to A* heuristic: steep elevation changes increase path cost `[1h]`

### [FE] Creep System (client-side for now)

- [ ] Create `CreepSpawnerSystem`: spawn 3 melee + 1 ranged per lane every 30s `[2h]`
- [ ] Create `LaneAIComponent`: lane, waypointIndex, state (march/fight/chase/return), aggroTarget `[1h]`
- [ ] Create `CreepAISystem`: state machine driving creep behavior along lane waypoints `[3h]`
- [ ] Implement aggro: detect enemies in aggro range, switch to fight state, select target by priority per SPEC `[2h]`
- [ ] Implement chase: follow target up to leash range, then return to lane `[1h]`
- [ ] Add siege creep to every 5th wave `[0.5h]`
- [ ] Creep visuals: use InstancedMesh (one per creep type per team, update transforms each frame) `[2h]`

### [FE] Tower System (client-side for now)

- [ ] Create `TowerAISystem`: scan for enemies in range, select target by priority per SPEC `[2h]`
- [ ] Implement tower attacks: cooldown-based, damage applied per SPEC stats `[1h]`
- [ ] Tower destruction: remove entity when HP <= 0, visual/audio feedback `[1h]`
- [ ] Tower aggro switch: re-target when a hero attacks a friendly hero in range `[1h]`

### [FE] Combat System (client-side for now)

- [ ] Create `CombatSystem`: process entities with attack targets, check range, apply damage on cooldown `[3h]`
- [ ] Implement damage formula from SPEC: `base_damage * (1 - 0.06 * armor / (1 + 0.06 * |armor|))` `[1h]`
- [ ] Health bars: draw HP bar above each unit (canvas texture or CSS2D) `[2h]`
- [ ] Death handling: entity dies at HP=0, remove from scene, award gold/XP to killer/nearby allies `[2h]`
- [ ] Hero respawn: timer = `(level*2)+4` seconds, respawn at fountain `[1h]`
- [ ] Creep bounty: distribute gold to last-hitter, split XP among nearby heroes `[1h]`

### [FE] Economy (client-side for now)

- [ ] Track gold per hero: starting 600, +1/sec passive, +bounty on kill `[1h]`
- [ ] Track XP per hero: level-up thresholds per SPEC table, stat gains on level `[2h]`
- [ ] Display gold count and level in HUD `[0.5h]`

---

## Phase 4: Hero Abilities

### [FE] Ability Framework

- [ ] Design ability data structure: id, name, slot (Q/W/E/R), cooldown, manaCost, castRange, castTime, abilityType (targeted/point/no-target/passive), maxLevel `[2h]`
- [ ] Create `AbilitySystem`: process ability casts, check cooldown + mana, apply effects `[3h]`
- [ ] Implement ability types: Targeted (click entity), Point (click ground), No-target (instant), Passive (always active) `[3h]`
- [ ] Create status effect system: stun, slow, root, silence with duration tracking `[3h]`
- [ ] Projectile entities: create on cast, move toward target per tick, apply effect on arrival `[2h]`
- [ ] Damage types: Physical (armor), Magical (magic resist), Pure (no reduction) `[1h]`
- [ ] Ability UI: icons in HUD with cooldown overlay, mana cost tooltip, level indicator `[2h]`
- [ ] Ability keybinds: Q/W/E/R keys, click to target/confirm `[1h]`
- [ ] Ability leveling: spend skill points on level-up, max 4/4/4/3 per ability `[1h]`

### [FE] Implement 10 Heroes (4 abilities each)

- [ ] Axe: Berserker's Call (AoE taunt), Battle Hunger (DoT), Counter Helix (passive spin), Culling Blade (execute ult) `[4h]`
- [ ] Pudge: Meat Hook (skillshot pull), Rot (toggle AoE), Flesh Heap (passive HP), Dismember (channel stun) `[4h]`
- [ ] Crystal Maiden: Crystal Nova (AoE slow), Frostbite (root), Arcane Aura (passive mana regen), Freezing Field (channel AoE) `[4h]`
- [ ] Sniper: Shrapnel (AoE zone), Headshot (passive proc), Take Aim (range bonus), Assassinate (long-range nuke) `[4h]`
- [ ] Drow Ranger: Frost Arrows (attack modifier slow), Gust (silence push), Multishot (AoE arrows), Marksmanship (passive agility) `[4h]`
- [ ] Juggernaut: Blade Fury (spin AoE immune), Healing Ward (summon heal), Blade Dance (crit passive), Omnislash (jump ult) `[4h]`
- [ ] Lion: Earth Spike (line stun), Hex (poly disable), Mana Drain (channel drain), Finger of Death (burst nuke) `[4h]`
- [ ] Lina: Dragon Slave (line nuke), Light Strike Array (delayed AoE stun), Fiery Soul (passive AS), Laguna Blade (burst nuke) `[4h]`
- [ ] Sven: Storm Hammer (ranged stun), Great Cleave (passive cleave), Warcry (team armor+speed), God's Strength (damage ult) `[4h]`
- [ ] Witch Doctor: Paralyzing Cask (bounce stun), Voodoo Restoration (toggle heal), Maledict (delayed burst), Death Ward (channel ward) `[4h]`

---

## Phase 5: HUD and Shop

### [FE] React UI

- [ ] Set up React render root alongside Three.js canvas (portal pattern, no interference) `[2h]`
- [ ] Create `App.tsx`: game state provider, conditional screens (loading/hero-select/in-game/game-over) `[2h]`
- [ ] Create `TopBar.tsx`: game clock, kill score (radiant vs dire), day/night indicator `[2h]`
- [ ] Create `HUD.tsx`: hero portrait, HP/mana bars, level, gold count `[3h]`
- [ ] Create ability bar in HUD: 4 ability icons with cooldown radial overlay, mana cost, level dots, hotkey labels `[3h]`
- [ ] Create inventory bar in HUD: 6 item slots, drag-to-swap, right-click to use consumables `[2h]`
- [ ] Create `Minimap.tsx`: second camera render target (or canvas 2D), hero dots, tower markers, click-to-pan `[4h]`
- [ ] Create `KillFeed.tsx`: event notifications (kills, tower destruction, Roshan), auto-dismiss after 5s `[2h]`
- [ ] Create `Scoreboard.tsx`: Tab overlay, 10 hero rows with K/D/A, level, items, gold, net worth `[3h]`
- [ ] Create `Shop.tsx`: overlay panel on B key, item grid by category, search bar, buy on click, sell from inventory `[4h]`
- [ ] Create `HeroSelect.tsx`: pre-game hero pick screen, 10 hero portraits, team assignment `[3h]`

---

## Phase 6: Server-Side Game State

### [BE] Server ECS

- [ ] Create `internal/game/entity.go`: Entity struct with component map, entity pool `[2h]`
- [ ] Create `internal/game/world.go`: World struct with entity CRUD, system registration, update loop `[3h]`
- [ ] Define all components in Go matching TypeScript component IDs: Position, Velocity, Team, UnitType, Health, Combat, Path, LaneAI, Ability, Inventory, NetworkId `[3h]`

### [BE] Server Systems

- [ ] Port `MovementSystem` to Go: velocity application, waypoint following, elevation lookup `[3h]`
- [ ] Port `CombatSystem` to Go: damage formula, attack timing, death handling `[3h]`
- [ ] Port `CreepAISystem` to Go: state machine, aggro, targeting `[3h]`
- [ ] Port `TowerAISystem` to Go: target selection, attacks `[2h]`
- [ ] Port `SpawnerSystem` to Go: creep waves, hero respawn timers `[2h]`
- [ ] Implement `VisionSystem` in Go: per-team visibility based on hero/tower/ward vision ranges `[3h]`
- [ ] Implement `EconomySystem` in Go: gold tracking, XP distribution, level-up `[2h]`
- [ ] Port ability system to Go: all 40 abilities with cooldowns, effects, projectiles `[8h]`

### [BE] Server Pathfinding

- [ ] Implement binary heap in Go `[1h]`
- [ ] Port A* algorithm to Go: 8-directional, elevation cost, path smoothing `[3h]`
- [ ] Implement flow fields for creep lane movement (precomputed direction grid per lane) `[3h]`
- [ ] Validate client move commands against server pathfinding (reject impossible moves) `[1h]`

### [BE] Game Loop

- [ ] Create `internal/game/tick.go`: `time.Ticker` at 30 Hz, fixed-step simulation `[2h]`
- [ ] Input queue: buffer per-client inputs, process all at tick start `[2h]`
- [ ] System execution order: Input → Movement → Combat → CreepAI → TowerAI → Spawner → Vision → Economy `[1h]`

---

## Phase 7: Networking

### [BE] Protocol and Snapshots

- [ ] Add `vmihailenco/msgpack/v5` to Go dependencies `[0.5h]`
- [ ] Define message types in `internal/network/protocol.go`: all client→server and server→client messages per SPEC `[3h]`
- [ ] Implement `internal/network/session.go`: per-client state, input queue, last ACK'd tick, sequence tracking `[2h]`
- [ ] Implement `internal/network/snapshot.go`: full snapshot serializer, delta snapshot (diff from base tick) `[4h]`
- [ ] Implement vision filtering in snapshot: only include entities visible to the client's team `[2h]`
- [ ] Implement priority accumulator: high-priority entities (heroes, nearby creeps) update more often than distant ones `[2h]`

### [BE] Connection Management

- [ ] Refactor `hub.go`: separate game rooms, player assignment, team balancing `[3h]`
- [ ] Implement lobby: create room, join room, ready up, start game `[3h]`
- [ ] Handle disconnect: grace period (5 min), reconnect with full snapshot `[2h]`
- [ ] Handle game-over: detect ancient destruction, broadcast result, cleanup `[1h]`

### [FE] Network Client

- [ ] Add `@msgpack/msgpack` to frontend dependencies `[0.5h]`
- [ ] Create `network/client.ts`: WebSocket connection, MessagePack encode/decode, message routing `[3h]`
- [ ] Create `network/protocol.ts`: TypeScript types matching Go message definitions `[2h]`
- [ ] Create `network/snapshot.ts`: apply full snapshot to client ECS, apply delta snapshot (create/update/destroy entities) `[3h]`

### [FE] Prediction and Reconciliation

- [ ] Create `game/prediction.ts`: input buffer with sequence numbers `[2h]`
- [ ] Implement prediction: apply move commands locally, store in pending buffer `[2h]`
- [ ] Implement reconciliation: on server state, set authoritative position, replay unACK'd inputs `[3h]`
- [ ] Implement entity interpolation: buffer 2 server states per remote entity, lerp between them at render time `[3h]`
- [ ] Add latency display in HUD (ping indicator) `[0.5h]`

### [FE] Lobby UI

- [ ] Create lobby screen: room list, create/join buttons `[2h]`
- [ ] Connect hero select screen to server: pick hero, see others' picks, timer `[2h]`

---

## Phase 8: Polish and Optimization

### [FE] Visual Polish

- [ ] Fog of war: dark overlay texture with radial cutouts at vision source positions `[4h]`
- [ ] Day/night cycle: tint scene lighting, reduce vision range at night `[2h]`
- [ ] Particle effects: ability impacts, gold pickup sparkle, level-up glow `[4h]`
- [ ] Damage numbers: floating text on hit, color by damage type `[2h]`
- [ ] Death animation: hero falls, grays out, respawn timer shown `[2h]`
- [ ] Loading screen: asset preload progress bar, hero splash art `[2h]`

### [FE] Audio

- [ ] Add Howler.js for sound playback `[1h]`
- [ ] Attack hit sounds (per weapon type) `[2h]`
- [ ] Ability cast sounds (per ability) `[3h]`
- [ ] Ambient map sounds (birds, water, creep camps) `[2h]`
- [ ] UI sounds: click, buy, level-up, kill announce `[1h]`

### [FE] Performance

- [ ] InstancedMesh for creeps (one per type per team, ~6 instances covering all creeps) `[3h]`
- [ ] LOD system: reduce geometry detail for distant objects `[2h]`
- [ ] Texture atlas for terrain (replace vertex colors with proper material) `[3h]`
- [ ] Profile and optimize: identify top 5 frame-time bottlenecks, fix each `[4h]`

### [BE] Performance and Reliability

- [ ] Profile server tick time: target < 10ms per tick with 300 entities `[2h]`
- [ ] Connection stress test: simulate 10 clients, measure bandwidth per client `[2h]`
- [ ] Add graceful shutdown: drain connections, save game state `[1h]`
- [ ] Add structured logging (slog) for debugging `[1h]`
- [ ] Replay system: record all inputs per tick, allow replay playback `[4h]`

---

## Effort Summary

| Phase | FE Hours | BE Hours | Total |
|-------|----------|----------|-------|
| 0: Cleanup | 5.5h | 3.6h | 9.1h |
| 1: Renderable Map | 14h | 8h | 22h |
| 2: Hero Loading + Input | 18.5h | 0h | 18.5h |
| 3: Client-Side Game Loop | 39h | 0h | 39h |
| 4: Hero Abilities | 61h | 0h | 61h |
| 5: HUD and Shop | 30h | 0h | 30h |
| 6: Server-Side Game State | 0h | 42h | 42h |
| 7: Networking | 23h | 22.5h | 45.5h |
| 8: Polish | 35h | 10h | 45h |
| **Total** | **226h** | **86.1h** | **312.1h** |

The frontend-heavy distribution reflects the single-player-first strategy. The backend agent ramps up in Phase 6-7 when the game logic is ported to the authoritative server. Both agents can work in parallel across phases (FE on Phase 2-5 while BE builds Phase 1 backend + Phase 6 server ECS).
