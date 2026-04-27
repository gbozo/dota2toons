# AGENTS.md - Development Guide

## Available Commands

```bash
# Backend
go run cmd/server/main.go      # Start WebSocket server (port 8080)
go build ./cmd/server        # Build server binary

# Frontend
cd frontend
npm run dev                # Start dev server (port 5173)
npm run build             # Production build
npm run preview           # Preview production build
```

## Key Files

### Frontend
- `frontend/src/main.ts` - Game entry point
- `frontend/src/ecs/world.ts` - ECS core
- `frontend/src/components/index.ts` - Game components
- `frontend/src/systems/movement.ts` - A* pathfinding + movement
- `frontend/src/game/engine.ts` - Three.js setup
- `frontend/src/game/mapLoader.ts` - Map JSON parsing
- `frontend/src/game/heroLoader.ts` - Hero model loader

### Backend
- `cmd/server/main.go` - WebSocket server

### Data
- `mapdata/data/mapdata.json` - Buildings, trees
- `mapdata/data/gridnavdata.json` - Navigation grid
- `mapdata/data/elevationdata.json` - Height map
- `mapdata/data/lanedata.json` - Lane paths

## Build Commands

```bash
# TypeScript check (runs automatically with build)
cd frontend && npx tsc --noEmit

# Vite development
cd frontend && npm run dev

# Go server
go run cmd/server/main.go
```

## Important Notes

1. **Hero models**: From `gbozo/dota2hero` (gltf format)
2. **Map data**: From `leamare/dota-map-coordinates` (JSON)
3. **Tick rate**: 30 Hz server tick
4. **Camera**: Orthographic at 45° rotation, 45° tilt
5. **Grid size**: 64 units for A* pathfinding

## Development Workflow

1. Start Go server: `go run cmd/server/main.go`
2. Start frontend: `cd frontend && npm run dev`
3. Open http://localhost:5173

## Code Style

- TypeScript with strict mode
- TailwindCSS for UI (v4)
- Three.js for 3D rendering

## Adding New Heroes

Edit `frontend/src/game/heroLoader.ts` to add hero entries in `heroData` object.

## Adding New Components

Add to `frontend/src/components/index.ts`:
```typescript
export const NewCompId = 'newComponent';
export interface NewComp extends Component {
  componentId: typeof NewCompId;
  field1: number;
}

export function createNewComp(field1 = 0): NewComp {
  return { componentId: NewCompId, field1 };
}
```

## Map Coordinate System

- Dota map range: -10464 to +10464
- Grid: 64 units (327x327 grid)
- Elevation: 0-26 height values
- Camera frustum: 4096 units