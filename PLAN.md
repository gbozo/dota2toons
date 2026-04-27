# Dota 2 Toons - Technical Plan

## Project Overview
A web-based MOBA game for teens - lighter Dota 2 clone with orthographic view, full gameplay mechanics, and multiplayer support.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend (React + TS)              │
│  Three.js WebGL Rendering (Orthographic)            │
│  ECS Client + WebSocket                          │
└────────────────────────┬──────────────────────────┘
                       │ WebSocket
┌────────────────────┴──────────────────────────┐
│                Backend (Go)                   │
│  Game State + ECS Server                      │
│  A* Pathfinding with Elevation                │
└────────────────────────────────────────────┘
```

## Core Systems

### 1. Game Engine
- **Tick Rate**: 30 Hz
- **ECS**: Custom Entity Component System
- **Network**: WebSocket with client prediction

### 2. Rendering
- Three.js with orthographic camera (45° rotation, 45° tilt)
- Pre-calculated lightmap baking
- Mix 3D heroes (gltf) + 2D static objects

### 3. Map System
- Source: `leamare/dota-map-coordinates` JSON
- Navigation grid: 64x64 tiles (A* pathfinding)
- Elevation: 327x327 heightmap
- Lane paths: 6 routes from spawn to barracks

### 4. Hero Assets
- Source: `gbozo/dota2hero` (gltf + SMD animations)
- ~110 heroes available
- Note: Valve IP - legal review needed for commercial use

### 5. Pathfinding
- A* on 2D grid with elevation checks
- Bot lane routing via waypoint paths
- Terrain costs per unit type

## Implementation Phases

### Phase 1: Foundation ✓
- [x] Go backend with WebSocket
- [x] React + Vite frontend
- [x] TailwindCSS styling
- [x] Map data from JSON

### Phase 2: Rendering ✓
- [x] Three.js orthographic camera
- [x] Terrain tiles with elevation colors
- [x] Building meshes
- [x] Tree cones

### Phase 3: ECS + Pathfinding
- [x] Entity Component System
- [x] Position, Velocity, Team components
- [x] A* pathfinding on grid
- [x] Movement system with elevation

### Phase 4: Hero Integration ✓
- [x] Hero model loader
- [x] Hero spawning
- [x] Team-based colors

### Phase 5: Multiplayer (Pending)
- [ ] WebSocket sync protocol
- [ ] Client prediction
- [ ] State reconciliation

### Phase 6: Gameplay (Pending)
- [ ] Creep spawning
- [ ] Tower AI
- [ ] Combat system
- [ ] Gold/exp
- [ ] Abilities

## File Structure

```
dota2toons/
├── cmd/server/main.go     # WebSocket server
├── go.mod               # Go dependencies
├── mapdata/             # Dota map JSON data
│   └── data/
│       ├── mapdata.json
│       ├── gridnavdata.json
│       ├── elevationdata.json
│       └── lanedata.json
├── assets/heroes/        # Hero models (gbozo repo)
└── frontend/
    ├── src/
    │   ├── ecs/world.ts           # ECS core
    │   ├── components/index.ts     # Game components
    │   ├── systems/movement.ts  # A* + movement
    │   ├── game/
    │   │   ├── engine.ts        # Three.js setup
    │   │   ├── mapLoader.ts    # Map data parsing
    │   │   └── heroLoader.ts  # Hero models
    │   ├── hooks/useWebSocket.ts
    │   ├── types/game.ts
    │   └── main.ts
    └── public/
        ├── mapdata/            # Copied map data
        └── heroes/            # Copied hero assets
```

## Running the Project

```bash
# Terminal 1: Start backend
go run cmd/server/main.go

# Terminal 2: Start frontend
cd frontend && npm run dev
```

## Key Technical Decisions

1. **30 Hz tick** - Balance between responsiveness and performance
2. **Orthographic** - Classic MOBA feel, easier for pathfinding
3. **A* on grid** - Fast pathfinding, elevation-aware
4. **GLTF heroes** - Web-compatible, animated
5. **Custom ECS** - Optimized for networked game state