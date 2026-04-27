# Dota 2 Toons - Game Specification

## Overview

| Field | Value |
|-------|-------|
| **Name** | Dota 2 Toons |
| **Type** | Web-based MOBA (5v5) |
| **Target audience** | Teens 13+ |
| **Style** | Simplified Dota 2, orthographic view, cartoon aesthetic |
| **Platform** | Desktop browsers (Chrome, Firefox, Safari) |

## Architecture Summary

- **Server**: Go, authoritative game simulation at 30 Hz
- **Client**: TypeScript, Three.js rendering at 60 FPS, React UI overlay
- **Transport**: WebSocket, binary protocol (MessagePack)
- **ECS**: Mirrored on server (Go) and client (TypeScript) with shared component IDs

The server owns all game state. Clients send inputs and receive snapshots. The local player's hero uses client-side prediction with server reconciliation. All other entities use interpolation.

---

## Map

### Coordinate System

| Property | Value |
|----------|-------|
| World range | -10464 to +10464 on X and Y |
| Total size | 20928 x 20928 world units |
| Grid cell size | 64 world units |
| Grid dimensions | 327 x 327 cells |
| Elevation grid | 327 x 327, values 0-26 |
| Walkable cells | ~47,323 of 106,929 total |

### Map Layout

- **3 lanes**: Top, Mid, Bot
- **2 jungles**: Radiant (south-west), Dire (north-east)
- **2 bases**: Radiant (south-west corner), Dire (north-east corner)
- **1 river**: Diagonal from top-left to bottom-right
- **1 Roshan pit**: Near river

### Structures

| Structure | Count | HP | Damage | Range |
|-----------|-------|----|--------|-------|
| Tier 1 Tower | 6 (3 per team) | 1300 | 100 | 700 |
| Tier 2 Tower | 6 (3 per team) | 1600 | 120 | 700 |
| Tier 3 Tower | 6 (3 per team) | 1900 | 140 | 700 |
| Tier 4 Tower | 4 (2 per team) | 2100 | 160 | 700 |
| Melee Barracks | 6 (3 per team) | 1500 | 0 | 0 |
| Ranged Barracks | 6 (3 per team) | 1200 | 0 | 0 |
| Ancient | 2 (1 per team) | 4250 | 0 | 0 |
| Fountain | 2 (1 per team) | -- | 230 | 1200 |

### Trees

- Count: ~2475 destructible trees
- Respawn: 5 minutes after destruction
- Block pathing and vision

---

## Units

### Heroes (MVP: 10 heroes)

| Stat | Base Range | Per Level |
|------|-----------|-----------|
| HP | 500-700 | +40-80 |
| Mana | 200-400 | +20-50 |
| Base damage | 40-65 | +2-4 |
| Armor | 0-6 | +0.3-0.5 |
| Move speed | 280-330 | -- |
| Attack range | 150 (melee) / 600 (ranged) | -- |
| Attack speed | 1.0-1.7 attacks/sec | variable |
| Vision range (day) | 1800 | -- |
| Vision range (night) | 800 | -- |

#### MVP Hero Pool (10)

| Hero | Role | Attack | Key Ability |
|------|------|--------|-------------|
| Axe | Tank/Initiator | Melee | Berserker's Call (AoE taunt) |
| Pudge | Tank/Ganker | Melee | Meat Hook (skillshot pull) |
| Crystal Maiden | Support | Ranged | Frostbite (root) |
| Sniper | Carry | Ranged | Take Aim (long range) |
| Drow Ranger | Carry | Ranged | Frost Arrows (slow) |
| Juggernaut | Carry | Melee | Blade Fury (spin AoE) |
| Lion | Support | Ranged | Hex (disable) |
| Lina | Nuker | Ranged | Dragon Slave (line nuke) |
| Sven | Carry/Tank | Melee | Storm Hammer (stun) |
| Witch Doctor | Support | Ranged | Paralyzing Cask (bounce stun) |

Each hero has 4 abilities (Q, W, E, R) with 3 skill levels each (R has 3 levels at 6/12/18).

### Creeps

| Type | HP | Damage | Speed | Range | Bounty (gold) | XP |
|------|-----|--------|-------|-------|---------|-----|
| Melee | 550 | 19-23 | 325 | 100 | 36-46 | 57 |
| Ranged | 300 | 21-26 | 325 | 500 | 41-49 | 69 |
| Siege (catapult) | 800 | 40-60 | 325 | 690 | 60-75 | 88 |

- **Wave composition**: 3 melee + 1 ranged per lane
- **Spawn interval**: Every 30 seconds
- **Siege creep**: Added to wave every 5th wave (2:30, 5:00, 7:30...)
- **Spawn locations**: Barracks for each lane per team

### Neutral Creeps (P2 -- deferred)

Jungle camps with respawn timers. Not in MVP.

---

## Economy

| Event | Gold |
|-------|------|
| Starting gold | 600 |
| Passive gold | 1 per second |
| Melee creep kill | 36-46 |
| Ranged creep kill | 41-49 |
| Siege creep kill | 60-75 |
| Hero kill | 200 + (victim_level x 10) |
| Tower kill (team) | 200 per team member |
| Barracks kill (team) | 150 per team member |

### Items (MVP: basic items only)

| Item | Cost | Effect |
|------|------|--------|
| Healing Salve | 110 | Restore 400 HP over 8s |
| Clarity | 50 | Restore 150 mana over 16s |
| Iron Branch | 50 | +1 all stats |
| Boots of Speed | 500 | +45 move speed |
| Blade of Attack | 450 | +10 damage |
| Chainmail | 550 | +5 armor |
| Broadsword | 1200 | +18 damage |
| Platemail | 1400 | +10 armor |

---

## Experience

| Level | Total XP | XP to next |
|-------|----------|------------|
| 1 | 0 | 230 |
| 2 | 230 | 370 |
| 3 | 600 | 480 |
| 4 | 1080 | 580 |
| 5 | 1660 | 600 |
| 6 | 2260 | 720 |
| 7 | 2980 | 750 |
| 8 | 3730 | 890 |
| 9 | 4620 | 930 |
| 10 | 5550 | 1050 |
| 11-25 | +1050-2000 per level | escalating |

- XP is split equally among nearby allied heroes (1300 unit radius)
- Deny (last-hitting own creep) gives 50% XP to enemy

---

## Combat

### Damage Formula

```
final_damage = base_damage * (1 - armor_reduction)
armor_reduction = 0.06 * armor / (1 + 0.06 * abs(armor))
```

### Attack Timing

```
attack_interval = base_attack_time / (1 + attack_speed_bonus / 100)
```

### Tower Targeting Priority (highest to lowest)

1. Unit attacking a friendly hero within tower range
2. Nearest enemy creep
3. Nearest enemy siege creep
4. Nearest enemy hero

### Creep Aggro Priority

1. Nearest enemy unit attacking a friendly hero (within 500 units)
2. Nearest enemy hero attacking a friendly unit (within 500 units)
3. Nearest enemy unit
4. Nearest enemy hero

### Death and Respawn

- Respawn time: `(level x 2) + 4` seconds
- Death gold loss: `net_worth / 40` (min 50)
- Buyback cost: `100 + (level x level x 1.5) + (game_time / 12)`

---

## Win Condition

Destroy the enemy Ancient. Game also ends if all 5 players on a team disconnect for 5+ minutes.

---

## Controls

| Input | Action |
|-------|--------|
| Right-click ground | Move (pathfind to point) |
| Right-click enemy | Attack-move to target |
| Left-click | Select unit / inspect |
| Q / W / E / R | Cast ability 1-4 |
| A + left-click | Attack-move (attack nearest on path) |
| S | Stop |
| H | Hold position |
| B | Open shop |
| Tab | Toggle scoreboard |
| Space | Center camera on hero |
| Mouse edge / WASD | Pan camera |
| Scroll wheel | Zoom camera |

---

## Rendering

| Property | Value |
|----------|-------|
| Engine | Three.js (WebGL) |
| Camera | Orthographic, 45 deg rotation, 45 deg tilt |
| Default frustum | 4096 world units |
| Zoom range | 1024 - 8192 frustum |
| Render FPS | 60 target (decoupled from tick) |
| Simulation tick | 30 Hz fixed timestep (33.33ms) |
| Hero models | GLTF from gbozo/dota2hero |
| Terrain | Single displaced PlaneGeometry from elevation data |
| Trees | InstancedMesh cones (single draw call) |
| Buildings | Box or GLTF meshes, team-colored |

---

## Network

| Property | Value |
|----------|-------|
| Protocol | WebSocket |
| Serialization | MessagePack (binary) |
| Server tick | 30 Hz |
| Client sends | Input commands with sequence numbers |
| Server sends | Delta-compressed snapshots per tick |
| Prediction | Client-side for local hero movement |
| Interpolation | Other entities rendered 1 tick behind |
| Full snapshot | Sent on connect, then deltas only |

### Message Types

**Client -> Server:**
```
move_command     { seq, tick, targetX, targetY }
attack_command   { seq, tick, targetEntityId }
ability_command  { seq, tick, abilitySlot, targetX?, targetY?, targetEntityId? }
stop_command     { seq, tick }
buy_item         { seq, itemId }
```

**Server -> Client:**
```
full_snapshot    { tick, entities[] }
delta_snapshot   { tick, baseTick, creates[], updates[], destroys[] }
attack_event     { attackerId, targetId, damage, tick }
ability_event    { casterId, abilityId, targets[], effects[], tick }
death_event      { entityId, killerId, tick }
gold_update      { playerId, gold, goldChange, reason }
xp_update        { playerId, xp, level }
chat_message     { playerId, text }
game_over        { winnerTeam }
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Initial load | < 5s on broadband |
| Memory | < 256 MB |
| Server tick | < 10 ms processing per tick |
| Client render | 60 FPS on mid-range GPU (GTX 1060 / M1) |
| Network bandwidth | < 50 KB/s per client |
| Max entities | ~300 (10 heroes + 60 creeps + 24 towers + 12 barracks + projectiles) |
| Pathfinding | < 2 ms per A* query |

---

## Color Palette

```css
--map-ground:    #2d4a3e   /* terrain base */
--map-elevated:  #3a5c4e   /* high ground */
--map-river:     #2a5a7a   /* river water */
--map-path:      #3d5a4e   /* dirt lanes */
--radiant:       #4a9eff   /* radiant team blue */
--dire:          #ff4a4a   /* dire team red */
--neutral:       #888888   /* neutral units */
--tree:          #228b22   /* tree foliage */
--gold:          #ffd700   /* gold/currency */
--health:        #22cc22   /* health bars */
--mana:          #4488ff   /* mana bars */
--xp:            #cc88ff   /* experience */
--background:    #1a1a2e   /* scene background */
```
