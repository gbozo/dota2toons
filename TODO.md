# TODO.md - Work Items

---

## Phase 0: Cleanup ✅ COMPLETE
## Phase 1: Renderable Map ✅ COMPLETE
## Phase 2: Hero Loading + Input ✅ COMPLETE
## Phase 3: Client-Side Game Loop ✅ COMPLETE
## Phase 4: Hero Abilities ✅ COMPLETE
## Phase 5: HUD and Shop ✅ COMPLETE
## Phase 6: Server-Side Game State ✅ COMPLETE
## Phase 7: Networking ✅ COMPLETE

---

## Phase 8: Polish, Performance, and Remaining Issues — IN PROGRESS (~25%)

### Visual Polish

- [x] Damage numbers: floating canvas text, white/blue by type, 1.2s fade
- [x] Minimap click-to-pan
- [x] Context menu suppressed on document level
- [ ] Fog of war + Vision system (client overlay with radial cutouts; server filters snapshots by team vision) — *addresses: "Vision system not implemented"*
- [ ] Day/night cycle: tint scene lighting, reduce vision range at night
- [ ] Particle effects: ability impacts, gold sparkle, level-up glow
- [ ] Death animation: hero greys out, respawn timer on model
- [ ] Loading screen: asset preload progress bar
- [ ] Hero animations: custom loader for ClayGL `animations.json` format → feed to AnimationMixer — *addresses: "Hero animations don't play"*

### Audio

- [ ] Howler.js integration: attack hits, ability casts, ambience (birds/water), UI sounds (click, buy, level-up, kill announce)

### Performance

- [x] InstancedMesh for creeps (one capsule per team)
- [ ] SeparationSystem: replace O(n²) with spatial hash grid for 200+ units — *addresses: "SeparationSystem O(n²)"*
- [ ] Hero movement: investigate remaining warp/lag (flow fields for creeps, wider LOS corridor check) — *addresses: "Hero movement lag/warp"*
- [ ] LOD system: reduce geometry for distant objects
- [ ] Texture atlas for terrain (replace vertex colors with proper material)
- [ ] Profile + fix top 5 frame-time bottlenecks (client)

### Server Reliability

- [ ] Delta compression: diff against cached previous state instead of sending all entities every tick — *addresses: "Server delta compression"*
- [ ] Server tick profiling: target <10ms with 300 entities
- [ ] Reconnect: resend full snapshot on client reconnect — *addresses: "Reconnect with full snapshot"*
- [ ] Team balancing: enforce Radiant/Dire assignment, reject invalid team requests — *addresses: "Team balancing"*
- [ ] Graceful shutdown + structured logging (slog)
- [ ] Replay system: record all inputs per tick, allow playback

### Gameplay Fixes

- [x] Lobby/Shop pointer-events (separate modal root DOM)
- [x] WS null array guards (Go nil slices → JS null)
- [x] Ability leveling: Ctrl+Q/W/E/R, skill points awarded on level-up
- [ ] Hero stat scaling: HP, damage, armor should increase per level (per SPEC level gain table) — *addresses: "Hero stat scaling with level"*

---

## Progress Summary

| Phase | Status |
|-------|--------|
| 0: Cleanup | ✅ Done |
| 1: Renderable Map | ✅ Done |
| 2: Hero Loading + Input | ✅ Done |
| 3: Game Loop | ✅ Done |
| 4: Hero Abilities | ✅ Done |
| 5: HUD and Shop | ✅ Done |
| 6: Server-Side | ✅ Done |
| 7: Networking | ✅ Done |
| 8: Polish + Fixes | 🔄 ~25% |
