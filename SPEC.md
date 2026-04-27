# Dota 2 Toons - Specification

## Project Overview
- **Name**: Dota 2 Toons
- **Type**: Web-based MOBA game
- **Target**: Teens (13+)
- **Style**: Light Dota 2 with orthographic view

## Game Mechanics

### Teams
- **Radiant** (blue) vs **Dire** (red)
- 5v5 gameplay

### Units
| Unit Type | HP | Damage | Speed | Range |
|----------|-----|--------|-------|--------|
| Hero | 100-700 | 30-70 | 300 | 100-600 |
| Creep (melee) | 300 | 20-25 | 270 | 100 |
| Creep (ranged) | 200 | 30-40 | 270 | 400 |
| Tower | 1500 | 100-150 | 0 | 700 |
| Barracks | 1500 | 0 | 0 | 0 |
| Ancient | 2000 | 0 | 0 | 0 |

### Map
- Size: ~16000x16000 units (250x250 tiles at 64)
- 3 lanes: Top, Mid, Bot
- 2 forests (Radiant/Dire jungle)
- 1 roshan pit

### Economy
- Starting gold: 600
- Gold per creep: ~40 melee, ~70 ranged
- Gold per tower: 200
- Gold per barracks: 300

### Experience
- Hero XP curve: Levels 1-25
- Creep XP: 62 (melee), 88 (ranged), 25 (shared)

## Technical Specs

### Rendering
- **Engine**: Three.js
- **Camera**: Orthographic, 45° rotation, 45° tilt
- **Resolution**: Responsive, pixelRatio aware
- **FPS**: 30 Hz game tick, 60 FPS render target

### Network
- **Protocol**: WebSocket
- **Tick Rate**: 30 Hz
- **Latency**: Client prediction + server reconciliation

### Pathfinding
- **Algorithm**: A* on 64x64 grid
- **Elevation**: Height map aware
- **Waypoints**: Lane routes for AI

## UI Elements

### HUD
- Top: Minimap, game timer
- Bottom: Shop, hero stats, abilities
- Sides: Score, chat

### Controls
- Click: Select / Move / Attack
- Right-click: Context menu
- Keys: 1-6 abilities, B shop, M minimap

## Assets

### Hero Models (gbozo/dota2hero)
- Format: GLTF + SMD animations
- Count: ~110 heroes
- Scale: ~100 units tall

### Map Data (leamare/dota-map-coordinates)
- Buildings: 22 towers, 12 barracks, 2 ancients, shops
- Trees: 2475 cuttable
- Navigation: 47,323 walkable points
- Elevation: 327x327 grid

## API Reference

### ECS Components
```typescript
PositionComponent { x, y, z, rotation }
VelocityComponent { dx, dy, dz }
TeamComponent { team: 'radiant'|'dire'|'neutral' }
UnitTypeComponent { type, subtype }
HealthComponent { hp, maxHp, mana, maxMana }
CombatComponent { damageMin, damageMax, attackRange, attackSpeed }
PathComponent { waypoints[], currentWaypointIndex, reachedTarget }
AABBComponent { width, height, depth }
```

### Game Methods
```typescript
game.spawnHero(heroKey, team, x, y) → GameEntity
game.getPathfinding().findPath(startX, startY, endX, endY) → waypoints[]
game.getElevationAt(x, y) → height
```

### WebSocket Messages
```typescript
{ type: 'game_state', payload: { tick, entities } }
{ type: 'entity_spawn', payload: { entityId, hero, x, y, team } }
{ type: 'entity_update', payload: { entityId, x, y, hp } }
```

## Color Palette
```css
--map-ground: #2d4a3e    /* Terrain green */
--map-path: #3d5a4e        /* Dirt path */
--radiant: #4a9eff       /* Radiant blue */
--dire: #ff4a4a          /* Dire red */
--tree: #228b22          /* Tree green */
--gold: #ffd700           /* Gold accent */
```

## Performance Targets
- Load time: < 5s on broadband
- Memory: < 200MB
- Tick: < 16ms server processing
- Render: 60 FPS on mid-range hardware