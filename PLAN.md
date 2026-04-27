# Dota 2 Toons - Technical Plan

## Architecture

```
Browser (Client)                          Server (Go)
┌──────────────────────────┐       ┌──────────────────────────┐
│  React UI (HUD/Shop/etc) │       │  WebSocket Hub           │
│  ────────────────────────│       │  ──────────────────────  │
│  Three.js Renderer       │◄─WS──►│  Game Loop (30 Hz)       │
│  Camera / Input Manager  │       │  ──────────────────────  │
│  ────────────────────────│       │  ECS World               │
│  Client ECS (prediction) │       │    MovementSystem         │
│  Prediction + Interp     │       │    CombatSystem           │
│  ────────────────────────│       │    CreepAISystem          │
│  WebSocket Client        │       │    TowerAISystem          │
│                          │       │    SpawnerSystem          │
│                          │       │    VisionSystem           │
│                          │       │  ──────────────────────  │
│                          │       │  Snapshot Serializer      │
│                          │       │  Map/Nav/Elevation Data   │
└──────────────────────────┘       └──────────────────────────┘
```

### Core Principle: Authoritative Server

All game state lives on the server. The client is a renderer that sends input commands and receives state snapshots. The client predicts only the local player's hero movement for responsiveness.

### Data Flow Per Tick (33.33ms at 30 Hz)

```
1. Client captures player input (click, ability key)
2. Client sends InputCommand { seq, tick, type, data } to server
3. Client applies prediction locally (movement only)
4. ──── Server receives input, queues it ────
5. Server processes all queued inputs for this tick
6. Server runs all systems: Movement → Combat → CreepAI → TowerAI → Spawner → Vision
7. Server computes delta snapshot (only changed components since client's last ACK)
8. Server sends DeltaSnapshot to each client (filtered by vision)
9. ──── Client receives snapshot ────
10. Client reconciles: discard ACK'd inputs, set authoritative state, replay pending inputs
11. Client interpolates other entities (1 tick behind)
12. Client renders at 60 FPS using interpolated state
```

---

## Development Phases

The project follows 8 phases. Phases are designed so the game is playable at the end of each phase, starting from Phase 3.

### Phase 0: Project Cleanup (current state)

The codebase has structural scaffolding but several issues:
- Map data files missing from `public/`
- Terrain renders only a 256-unit patch (should be 20928)
- React and socket.io-client in package.json but unused
- Hero models are placeholder boxes
- WebSocket client exists but is not connected to the game
- Dead code in engine.ts (`useGameEngine`, `createRenderer`)
- ECS tick/deltaTime exposure bug in world.ts
- A* uses array sort instead of binary heap
- `go.sum` lists `google/uuid` (indirect, unused)

This phase cleans the foundation before building on it.

### Phase 1: Renderable Map

Produce a correct, performant rendering of the full Dota 2 map.

- **Terrain**: Single `PlaneGeometry(20928, 20928, 326, 326)` with vertex displacement from elevation data. Vertex colors based on elevation (green lowland, lighter highland, blue river).
- **Trees**: `InstancedMesh` with `ConeGeometry`. Single draw call for all 2475 trees.
- **Buildings**: Positioned `BoxGeometry` meshes with team colors. Later replaced by GLTF.
- **Camera**: Orthographic with pan (WASD / edge scroll), zoom (scroll wheel), and center-on-hero (Space).
- **Frustum culling**: Trees and buildings culled by `THREE.Frustum` check each frame.

### Phase 2: Hero Loading and Input

Load real GLTF hero models and let the player click-to-move.

- **GLTF loader**: `GLTFLoader` loads models from `public/heroes/`. Cache loaded models, clone for instances.
- **Animations**: `AnimationMixer` per hero entity. States: idle, run, attack, cast, death.
- **Input system**: Raycaster for click-to-ground. Right-click = move command. Right-click on enemy = attack command.
- **Camera follow**: Camera centered on the local player's hero with smooth pan.
- **Selection**: Left-click selects units. Selected unit shows health bar and info panel.

### Phase 3: Client-Side Game Loop (Single Player)

Make the game playable in single-player mode with all logic running client-side. This is the "playable prototype" milestone.

- **Fixed timestep**: Accumulator pattern. Simulation always steps at 33.33ms. Rendering interpolates between ticks.
- **Pathfinding upgrade**: Binary heap for open set. 8-directional movement. Path smoothing (line-of-sight string pulling). Elevation cost in A* heuristic.
- **Creep spawning**: Waves every 30s. 3 melee + 1 ranged per lane. Follow lane waypoints.
- **Creep AI**: State machine (march → fight → chase → return). Aggro priority per SPEC.
- **Tower AI**: Target selection per SPEC priority. Attack nearest valid target.
- **Combat**: Damage formula per SPEC. Attack cooldowns. Health bars. Death removes entity. Creep gold/XP distribution.
- **Hero respawn**: Timer based on level. Respawn at fountain.
- **Gold/XP**: Starting gold, passive income, creep bounties. XP curve, level-up stat gains.

At the end of Phase 3, one player can control a hero, fight creeps, gain gold/XP, and push lanes. No abilities yet, just auto-attacks.

### Phase 4: Hero Abilities

Add the Q/W/E/R ability system for the 10 MVP heroes.

- **Ability framework**: Each ability has: cooldown, mana cost, cast range, cast time, effect.
- **Ability types**: Targeted (click on unit), Point (click on ground), No-target (instant), Passive.
- **Status effects**: Stun, slow, root, silence. Duration-based with stacking rules.
- **Projectiles**: Entity with `ProjectileComponent`. Travels at speed, applies effect on arrival.
- **Damage types**: Physical (reduced by armor), Magical (reduced by magic resistance), Pure.
- **Implement 10 heroes**: 4 abilities each = 40 abilities total.

### Phase 5: HUD and Shop

Build the React UI overlay for gameplay.

- **HUD layout**:
  - Top bar: Game time, kill score, day/night indicator
  - Bottom bar: Hero portrait, HP/mana bars, ability icons (Q/W/E/R) with cooldowns, inventory (6 slots), gold count
  - Minimap: Bottom-left, second orthographic camera render. Click to pan.
  - Kill feed: Top-right, scrolling event log
  - Scoreboard: Tab overlay showing all 10 heroes, K/D/A, items, gold, level
- **Shop**: Overlay panel (B key). Item grid with categories. Search. Buy/sell. Recommended items per hero.
- **Health bars**: CSS2DRenderer or canvas-drawn bars above each unit. Team-colored.

### Phase 6: Server-Side Game State (Multiplayer Foundation)

Port the game simulation from client to Go server.

- **Server ECS**: Mirror the client ECS in Go. Same component IDs, same system logic.
- **Server systems**: Movement, Combat, CreepAI, TowerAI, Spawner, Vision -- all ported from TS.
- **Server pathfinding**: Port A* to Go. Load gridnav/elevation data at startup.
- **Game loop**: `time.Ticker` at 30 Hz. Process input queue → run systems → produce snapshot.
- **Map data**: Server loads map JSON at startup. Serves map data to clients via HTTP for initial load.

### Phase 7: Networking

Connect clients to the authoritative server.

- **Protocol**: MessagePack over WebSocket. Define all message types (see SPEC.md).
- **Input pipeline**: Client sends `InputCommand` with sequence number. Server queues per-client.
- **Snapshot system**: Full snapshot on connect. Delta snapshots per tick, filtered by vision.
- **Client prediction**: Local hero moves immediately. Input buffer tracks unACK'd commands. On server state, reconcile + replay pending inputs.
- **Entity interpolation**: Other entities rendered between two known server states (1 tick delay).
- **Connection handling**: Reconnect with state resync. Disconnect timeout (5 min before forfeit).
- **Lobby**: Simple lobby to create/join games. Hero selection screen.

### Phase 8: Polish and Optimization

- **Fog of war**: Server filters entities by vision. Client renders fog overlay (radial gradient texture).
- **Sound**: Howler.js for positional audio. Attack hits, ability casts, ambient.
- **Particles**: Three.js particle systems for abilities, deaths, gold pickup.
- **Day/night cycle**: Affects vision range. Visual tinting.
- **Performance**: InstancedMesh for creeps. LOD for distant objects. Texture atlas for terrain.
- **Loading screen**: Asset preload with progress bar.
- **Reconnection**: Resume game state after disconnect.
- **Replays**: Record tick-by-tick input log. Replay viewer.

---

## File Structure

```
dota2toons/
├── AGENTS.md                     # Development guide
├── PLAN.md                       # This file
├── SPEC.md                       # Game specification
├── TODO.md                       # Work items by agent
├── go.mod / go.sum               # Go dependencies
├── cmd/
│   └── server/
│       └── main.go               # Entry point: HTTP + WebSocket server
├── internal/
│   ├── game/
│   │   ├── world.go              # Server ECS world
│   │   ├── tick.go               # Fixed-timestep game loop
│   │   ├── entity.go             # Entity + component structures
│   │   └── snapshot.go           # State serialization + delta compression
│   ├── systems/
│   │   ├── movement.go           # Server-side movement + pathfinding validation
│   │   ├── combat.go             # Damage calculation, attack resolution
│   │   ├── creep_ai.go           # Lane AI, aggro, targeting
│   │   ├── tower_ai.go           # Tower targeting + attacks
│   │   ├── spawner.go            # Creep wave spawning, hero respawn
│   │   ├── vision.go             # Fog of war, entity visibility
│   │   ├── ability.go            # Ability execution, cooldowns, effects
│   │   └── economy.go            # Gold distribution, XP, leveling
│   ├── pathfinding/
│   │   ├── astar.go              # A* with binary heap, 8-dir, elevation
│   │   ├── grid.go               # Navigation grid loader + queries
│   │   └── flowfield.go          # Flow fields for mass creep movement
│   ├── network/
│   │   ├── hub.go                # WebSocket connection manager
│   │   ├── protocol.go           # Message types, MessagePack codec
│   │   └── session.go            # Per-client state, input queue, ACK tracking
│   └── mapdata/
│       └── loader.go             # JSON map data loader
├── mapdata/
│   └── data/
│       ├── mapdata.json          # Buildings, trees (from leamare repo)
│       ├── gridnavdata.json      # Walkable grid
│       ├── elevationdata.json    # Height map
│       └── lanedata.json         # Lane waypoints
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts            # Vite config with proxy for /api and /ws
│   ├── public/
│   │   ├── heroes/               # GLTF hero models (from gbozo repo)
│   │   └── mapdata/              # Symlink or copy of mapdata/data/
│   └── src/
│       ├── main.tsx              # React root + Three.js canvas mount
│       ├── index.css             # TailwindCSS + theme vars
│       ├── ecs/
│       │   └── world.ts          # Client-side ECS core
│       ├── components/
│       │   └── index.ts          # All ECS component definitions (shared IDs)
│       ├── systems/
│       │   ├── movement.ts       # Client-side movement + prediction
│       │   ├── interpolation.ts  # Entity interpolation for remote entities
│       │   └── animation.ts      # Animation state machine per entity
│       ├── game/
│       │   ├── engine.ts         # Three.js scene, camera, renderer setup
│       │   ├── loop.ts           # Fixed-timestep game loop (accumulator)
│       │   ├── mapLoader.ts      # Fetch + parse map JSON data
│       │   ├── mapRenderer.ts    # Terrain mesh, tree instances, building meshes
│       │   ├── heroLoader.ts     # GLTF model loader + cache
│       │   ├── input.ts          # Mouse/keyboard input manager + raycaster
│       │   ├── camera.ts         # Camera controller (pan, zoom, follow)
│       │   └── prediction.ts     # Client prediction + server reconciliation
│       ├── network/
│       │   ├── client.ts         # WebSocket client, MessagePack codec
│       │   ├── protocol.ts       # Shared message type definitions
│       │   └── snapshot.ts       # Snapshot deserializer, delta application
│       ├── ui/
│       │   ├── App.tsx           # React root component
│       │   ├── HUD.tsx           # Bottom bar: portrait, HP, abilities, items
│       │   ├── Minimap.tsx       # Minimap component
│       │   ├── Shop.tsx          # Shop overlay
│       │   ├── Scoreboard.tsx    # Tab scoreboard overlay
│       │   ├── KillFeed.tsx      # Kill/event feed
│       │   ├── TopBar.tsx        # Game time, score
│       │   ├── HealthBar.tsx     # Entity health bar (CSS2D or canvas)
│       │   └── HeroSelect.tsx    # Pre-game hero selection
│       └── types/
│           ├── game.ts           # Game entity, map data types
│           ├── network.ts        # Message types, snapshot types
│           └── hero.ts           # Hero definitions, abilities, items
```

---

## Technology Stack

### Backend (Go)

| Dependency | Purpose |
|-----------|---------|
| `gorilla/websocket` | WebSocket server |
| `vmihailenco/msgpack` | MessagePack serialization |
| `google/uuid` | Entity IDs |
| Standard library | HTTP server, JSON parsing, time, sync |

### Frontend (TypeScript)

| Dependency | Purpose |
|-----------|---------|
| `three` | 3D rendering |
| `@types/three` | Three.js types |
| `react` / `react-dom` | UI components |
| `@msgpack/msgpack` | MessagePack client-side |
| `vite` | Build tool + dev server |
| `tailwindcss` | UI styling |
| `typescript` | Type safety |

**Remove from package.json**: `socket.io-client` (not compatible with gorilla/websocket), `uuid` (unused).

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **30 Hz tick** | Standard for MOBAs (Dota 2, LoL). Balances responsiveness with server load. At 300 u/s move speed, hero moves 10 units per tick -- sufficient for 64-unit grid. |
| **Authoritative server** | Required for fair multiplayer. Client prediction only for local hero movement. |
| **Fixed timestep** | Deterministic simulation. Both server and client step at exactly 33.33ms. Prevents physics divergence. |
| **MessagePack** | 30-50% smaller than JSON. Drop-in replacement. Good Go and JS library support. |
| **Orthographic camera** | Classic MOBA top-down feel. Simpler raycasting (no perspective distortion). |
| **ECS on both sides** | Same component IDs enable direct state synchronization. Server ECS is authoritative; client ECS is for prediction and rendering. |
| **React for UI** | Complex game UI (shop, scoreboard, ability bars) benefits from component model. Renders as DOM overlay on Three.js canvas. |
| **GLTF hero models** | Web-native 3D format. Includes animations. ~110 available from gbozo/dota2hero. |
| **Single-player first** | All game systems developed and testable before adding network complexity. Phase 3 is a playable game. Multiplayer is a layer on top. |
| **Binary heap for A*** | Current `Array.sort()` is O(n log n) per expansion. Heap is O(log n). Required for real-time pathfinding with 47K walkable cells. |
| **InstancedMesh** | 2475 individual tree draws → 1 instanced draw call. Same for creeps (~60 per team). |
| **Delta compression** | Only send changed components since client's last ACK. Reduces bandwidth from ~200 KB/s to ~30-50 KB/s per client. |
