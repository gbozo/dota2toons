# AGENTS.md - Development Guide

## Quick Start

```bash
# Terminal 1: Start Go backend
go run cmd/server/main.go

# Terminal 2: Start frontend dev server
cd frontend && npm run dev

# Open http://localhost:5173
```

## Agent Roles

This project uses two independent agents working in parallel.

### Frontend Agent [FE]

**Owns**: Everything under `frontend/`, Three.js rendering, React UI, client-side ECS, input handling, prediction/interpolation.

**Language**: TypeScript (strict mode)

**Key entry points**:
- `frontend/src/main.tsx` -- React root + Three.js canvas mount
- `frontend/src/game/loop.ts` -- Fixed-timestep game loop
- `frontend/src/ecs/world.ts` -- Client ECS core
- `frontend/src/systems/` -- Client-side game systems
- `frontend/src/ui/` -- React UI components

**Commands**:
```bash
cd frontend
npm run dev          # Dev server on :5173 (proxies /ws to :8080)
npm run build        # TypeScript check + production build
npx tsc --noEmit     # Type check only
```

### Backend Agent [BE]

**Owns**: Everything under `cmd/`, `internal/`, `mapdata/`. Go server, authoritative game simulation, WebSocket networking, pathfinding, AI systems.

**Language**: Go 1.21+

**Key entry points**:
- `cmd/server/main.go` -- HTTP + WebSocket entry point
- `internal/game/world.go` -- Server ECS world
- `internal/game/tick.go` -- 30 Hz game loop
- `internal/systems/` -- Server-side game systems
- `internal/network/` -- WebSocket hub, protocol, snapshots

**Commands**:
```bash
go run cmd/server/main.go    # Start server on :8080
go build ./cmd/server        # Build binary
go test ./internal/...       # Run all tests
go vet ./...                 # Static analysis
```

---

## Architecture Overview

```
Client (Browser)                    Server (Go :8080)
┌────────────────────┐       ┌────────────────────────┐
│ React UI overlay   │       │ WebSocket Hub           │
│ Three.js renderer  │◄─WS──►│ 30 Hz Game Loop         │
│ Client ECS         │       │ Server ECS (authority)  │
│ Prediction engine  │       │ Snapshot serializer     │
└────────────────────┘       └────────────────────────┘
```

**Authority model**: Server owns all game state. Client sends inputs, receives snapshots. Client predicts local hero movement only. See PLAN.md for full data flow.

---

## Project Structure

```
dota2toons/
├── AGENTS.md              # This file
├── PLAN.md                # Architecture + phases
├── SPEC.md                # Game specification
├── TODO.md                # Work items by agent
├── go.mod / go.sum
├── cmd/server/main.go     # Server entry point
├── internal/
│   ├── game/              # Server ECS, game loop, snapshots
│   ├── systems/           # Server game systems
│   ├── pathfinding/       # A*, flow fields
│   ├── network/           # WebSocket, protocol, sessions
│   └── mapdata/           # Map JSON loader
├── mapdata/data/          # Map JSON files (gitignored source data)
│   ├── mapdata.json       # Buildings, trees
│   ├── gridnavdata.json   # Walkable grid (327x327)
│   ├── elevationdata.json # Height map (327x327, values 0-26)
│   └── lanedata.json      # Lane waypoints (GeoJSON)
└── frontend/
    ├── public/
    │   ├── heroes/        # GLTF hero models (gbozo/dota2hero)
    │   └── mapdata/       # Copy of mapdata/data/ for client fetching
    └── src/
        ├── main.tsx       # React root + canvas
        ├── ecs/           # Client ECS core
        ├── components/    # Shared ECS component definitions
        ├── systems/       # Client game systems
        ├── game/          # Three.js engine, map, heroes, input, camera
        ├── network/       # WebSocket client, protocol, snapshots
        ├── ui/            # React components (HUD, Shop, Minimap, etc.)
        └── types/         # TypeScript interfaces
```

---

## Shared Contracts

The FE and BE agents share these contracts. Changes must be coordinated.

### ECS Component IDs

Both agents use identical string IDs for components. Defined in `frontend/src/components/index.ts` (TypeScript) and mirrored in `internal/game/entity.go` (Go).

| Component ID | Description |
|--------------|-------------|
| `position` | x, y, z, rotation |
| `velocity` | dx, dy, dz |
| `team` | radiant / dire / neutral |
| `unitType` | hero / creep / tower / building / projectile + subtype |
| `health` | hp, maxHp, mana, maxMana |
| `combat` | damageMin, damageMax, attackRange, attackSpeed |
| `path` | targetX, targetY, waypoints[], currentIndex, reached |
| `laneAI` | lane, waypointIndex, state, aggroTarget |
| `networkId` | server-assigned ID, ownerClientId, entityType |
| `ability` | abilities[], cooldowns[], levels[] |
| `inventory` | items[6], gold |
| `selection` | selected (client-only, not replicated) |
| `heroModel` | modelPath, currentAnimation (client-only) |

### WebSocket Protocol

Message format: MessagePack binary over WebSocket.

**Client -> Server** (input commands):
```
move_command     { seq, tick, targetX, targetY }
attack_command   { seq, tick, targetEntityId }
ability_command  { seq, tick, abilitySlot, targetX?, targetY?, targetEntityId? }
stop_command     { seq, tick }
buy_item         { seq, itemId }
```

**Server -> Client** (state updates):
```
full_snapshot    { tick, entities[] }
delta_snapshot   { tick, baseTick, creates[], updates[], destroys[] }
attack_event     { attackerId, targetId, damage, tick }
ability_event    { casterId, abilityId, targets[], effects[], tick }
death_event      { entityId, killerId, tick }
gold_update      { playerId, gold, goldChange, reason }
xp_update        { playerId, xp, level }
game_over        { winnerTeam }
```

Full message type definitions are in SPEC.md.

---

## Coordination Rules

1. **Component ID changes** require both agents to update simultaneously.
2. **Protocol message changes** require updating both `internal/network/protocol.go` and `frontend/src/network/protocol.ts`.
3. **Game balance changes** (damage, HP, gold, XP values) are defined in SPEC.md and used by whichever side currently runs the simulation. During single-player phases (0-5), values live in TypeScript. After Phase 6, the server is authoritative and TypeScript values are display-only.
4. **Map data format changes** affect both `internal/mapdata/loader.go` and `frontend/src/game/mapLoader.ts`.

---

## Key Technical Constants

| Constant | Value | Used By |
|----------|-------|---------|
| Tick rate | 30 Hz (33.33ms) | Both |
| Grid cell size | 64 world units | Both |
| Map range | -10464 to +10464 | Both |
| Grid dimensions | 327 x 327 | Both |
| Camera frustum (default) | 4096 | FE |
| Camera rotation | 45 deg | FE |
| Camera tilt | 45 deg | FE |
| WebSocket port | 8080 | Both |
| Vite dev port | 5173 | FE |
| Hero move speed | 280-330 u/s | Both |
| Creep move speed | 325 u/s | Both |
| Creep spawn interval | 30s | Both |
| Aggro range (creeps) | 500 units | Both |
| Tower range | 700 units | Both |
| Vision range (day) | 1800 units | Both |
| Vision range (night) | 800 units | Both |

---

## Development Workflow

### ⚠️ Git Policy — Read This First

**NEVER commit or push code unless the user explicitly says so in writing.**

- Do NOT run `git commit` at any point unless the user writes something like:
  - "commit", "commit this", "commit the code", "commit changes"
- Do NOT run `git push` at any point unless the user writes something like:
  - "push", "push it", "push upstream", "push to remote"
- Do NOT combine commit + push into one action unless both are explicitly requested.

**The only exception is the `wrap up` shortcut command:**

When the user says **"wrap up"**, this is a shorthand for:
1. Update `TODO.md` to reflect all completed and pending work
2. Run `git add -A && git commit` with an appropriate message
3. Run `git push` to push upstream

No other phrases, implications, or context trigger a commit or push.
When in doubt — **do not commit, do not push**.

---

### Phase Progression

Phases are in TODO.md. Follow this order:

```
Phase 0 (Cleanup)  ─► Phase 1 (Map) ─► Phase 2 (Heroes+Input) ─► Phase 3 (Game Loop)
                                                                        │
Phase 6 (Server ECS) ◄── BE can start Phase 6 while FE does Phase 4-5 ─┘
        │
        ▼
Phase 7 (Networking) ─► Phase 8 (Polish)
```

- **FE** works through Phases 0-5 sequentially (single-player-first strategy)
- **BE** works Phase 0-1 (cleanup + map data), then jumps to Phase 6-7 when FE reaches Phase 3+
- Both agents converge at Phase 7 (networking) to integrate client and server

### Validation Before Marking Work Done

**Always validate before considering a task complete — never commit unvalidated code:**
- FE: `npx tsc --noEmit` passes, `npm run build` succeeds, manual test in browser
- BE: `go vet ./...` passes, `go build ./cmd/server` succeeds, `go test ./internal/...` passes

### Commit Convention

```
feat(fe): add camera pan and zoom controls
feat(be): implement server-side A* pathfinding
fix(fe): terrain renders full map range
fix(be): creep spawner timing off by one tick
refactor(fe): extract game loop into loop.ts
chore: clean unused dependencies from package.json
```

Prefix with `fe` or `be` scope to indicate which agent's domain.

---

## Map Coordinate System

```
              +Y (North / Dire base)
               ▲
               │
               │    Dire Ancient (~8000, ~8000)
               │
  -X ──────────┼──────────► +X
               │
  Radiant Ancient (~-8000, ~-8000)
               │
               │
              -Y (South / Radiant base)
```

- Full range: -10464 to +10464 on both axes
- Grid cell: 64 units (327 cells per axis)
- Elevation: 0-26 (integer height values)
- Three.js mapping: game X → Three X, game Y → Three Z, elevation → Three Y

---

## Hero Models (gbozo/dota2hero)

GLTF format. Place in `frontend/public/heroes/<key>/`.

MVP 10 heroes: `axe`, `pudge`, `crystal_maiden`, `sniper`, `drow_ranger`, `juggernaut`, `lion`, `lina`, `sven`, `witch_doctor`

Note: Valve IP. These models are for development only. A commercial release would need original art.

---

## References

| Topic | Source |
|-------|--------|
| Client prediction + reconciliation | [Gabriel Gambetta](https://www.gabrielgambetta.com/client-server-game-architecture.html) |
| Fixed timestep game loop | [Glenn Fiedler - Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/) |
| State synchronization | [Glenn Fiedler - State Sync](https://gafferongames.com/post/state_synchronization/) |
| A* pathfinding | [Red Blob Games](https://www.redblobgames.com/pathfinding/a-star/introduction.html) |
| Dota 2 mechanics reference | [Dota 2 Wiki](https://dota2.fandom.com/wiki/Dota_2_Wiki) |
