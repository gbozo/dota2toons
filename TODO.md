# TODO.md - Project Tasks

## Phase 1: Foundation ✓
- [x] Initialize Go backend module
- [x] Initialize React + Vite frontend with TypeScript
- [x] Set up TailwindCSS
- [x] Clone map data source (leamare/dota-map-coordinates)
- [x] Create basic WebSocket server skeleton
- [x] Create frontend WS client + core project structure

## Phase 2: Rendering ✓
- [x] Set up Three.js with orthographic camera
- [x] Create terrain tiles with elevation colors
- [x] Render building meshes
- [x] Render tree cones
- [x] Configure lighting and shadows

## Phase 3: ECS + Pathfinding ✓
- [x] Implement Entity Component System
- [x] Create Position, Velocity, Team components
- [x] Build A* pathfinding on grid
- [x] Create Movement system with elevation
- [x] Add Health, Combat, Path components

## Phase 4: Hero Integration ✓
- [x] Clone hero models (gbozo/dota2hero)
- [x] Create HeroModelLoader class
- [x] Define 90+ hero definitions
- [x] Implement hero spawning
- [x] Add team-based colors

## Phase 5: Multiplayer
- [ ] Design WebSocket message protocol
- [ ] Implement server-side game state
- [ ] Add client prediction
- [ ] Implement state reconciliation
- [ ] Handle player connections/disconnections
- [ ] Add lag compensation

## Phase 6: Gameplay - Creeps
- [ ] Create creep spawning system
- [ ] Implement lane AI movement
- [ ] Add creep combat (melee/ranged)
- [ ] Implement gold/xp distribution
- [ ] Add wave timing (every 30s)

## Phase 7: Gameplay - Towers
- [ ] Place tower entities
- [ ] Implement tower targeting
- [ ] Add tower attacks
- [ ] Create tower destruction logic
- [ ] Add barracks spawning creeps

## Phase 8: Gameplay - Combat
- [ ] Implement hero attacks
- [ ] Add spell abilities (basic)
- [ ] Create health bars
- [ ] Handle death/respawn
- [ ] Add items (basic purchase)

## Phase 9: UI/HUD
- [ ] Create game overlay UI
- [ ] Implement minimap
- [ ] Add hero selection screen
- [ ] Create shop interface
- [ ] Add health/mana bars
- [ ] Show score/kill feed

## Phase 10: Polish
- [ ] Load actual GLTF hero models
- [ ] Add hero animations (idle, run, attack)
- [ ] Optimize performance
- [ ] Add sound effects
- [ ] Create loading screen

## Gameplay Features (Priority Order)

### P0 - Must Have
- [ ] Basic hero movement (click to move)
- [ ] A* pathfinding working
- [ ] Hero vs hero combat
- [ ] Towers deal damage
- [ ] Towers can be destroyed
- [ ] Win condition (ancient destruction)

### P1 - Should Have
- [ ] Creep waves spawn
- [ ] Creeps fight creeps
- [ ] Creeps fight heroes
- [ ] Gold accumulation
- [ ] Experience/levels
- [ ] Basic abilities (QWER)

### P2 - Nice to Have
- [ ] Items in shop
- [ ] Roshan spawns
- [ ] Runes spawn
- [ ] Ward placement
- [ ] Full ability list

## Technical Debt

- [ ] Convert placeholder boxes to GLTF models
- [ ] Add proper TypeScript types for all ECS
- [ ] Implement proper error boundaries
- [ ] Add game pause functionality
- [ ] Handle window resize properly

## Bug Fixes (Known Issues)

- [ ] Hero model shows placeholder box
- [ ] No selection click handling
- [ ] No camera controls (pan/zoom)
- [ ] Trees render without culling (performance)

## Documentation Tasks

- [x] Create PLAN.md
- [x] Create SPEC.md
- [x] Create AGENTS.md
- [ ] Create API.md (WebSocket protocol)
- [ ] Create HEROES.md (hero list)

---

Last updated: 2026-04-27