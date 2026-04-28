package game

import (
	"math"
	"math/rand"
)

// ---------------------------------------------------------------------------
// StatusSystem — prune expired effects, block movement when stunned/rooted
// ---------------------------------------------------------------------------

type StatusSystem struct{}

func (s *StatusSystem) Name() string { return "status" }

func (s *StatusSystem) Update(_ float64, w *World) {
	now := gameTimeSec(w)
	for _, e := range w.Entities() {
		se := GetStatusEffects(w, e.ID)
		if se == nil {
			continue
		}
		se.Prune(now)

		if se.Has("stun", now) || se.Has("taunt", now) || se.Has("root", now) {
			if p := GetPath(w, e.ID); p != nil {
				p.Waypoints = nil
				p.ReachedTarget = true
			}
			if v := GetVelocity(w, e.ID); v != nil {
				v.DX, v.DY = 0, 0
			}
		}
	}
}

// ---------------------------------------------------------------------------
// MovementSystem
// ---------------------------------------------------------------------------

const HeroMoveSpeed  = 300.0
const CreepMoveSpeed = 325.0

type MovementSystem struct {
	PF *Pathfinder
}

func (s *MovementSystem) Name() string { return "movement" }

func (s *MovementSystem) Update(dt float64, w *World) {
	for _, e := range w.Entities() {
		if w.HasComponent(e.ID, CDead) {
			continue
		}

		pos := GetPosition(w, e.ID)
		vel := GetVelocity(w, e.ID)
		p   := GetPath(w, e.ID)
		ut  := GetUnitType(w, e.ID)
		if pos == nil || vel == nil {
			continue
		}

		speed := HeroMoveSpeed
		if ut != nil && ut.Type == "creep" {
			speed = CreepMoveSpeed
		}

		// Apply slow
		if se := GetStatusEffects(w, e.ID); se != nil {
			now := gameTimeSec(w)
			for _, eff := range se.Effects {
				if eff.Type == "slow" && eff.ExpiresAt > now && eff.Magnitude > 0 {
					speed *= (1.0 - eff.Magnitude)
					break
				}
			}
		}

		if p != nil && len(p.Waypoints) > 0 && !p.ReachedTarget {
			remaining := speed * dt
			for remaining > 0 && p.CurrentWaypointIndex < len(p.Waypoints) {
				wp := p.Waypoints[p.CurrentWaypointIndex]
				dx := wp.X - pos.X
				dy := wp.Y - pos.Y
				dist := math.Hypot(dx, dy)

				if dist <= remaining {
					if dist > 0.001 {
						pos.Rotation = math.Atan2(dy/dist, dx/dist)
					}
					pos.X = wp.X
					pos.Y = wp.Y
					pos.Z = float64(s.PF.GetElevation(pos.X, pos.Y))
					remaining -= dist
					if p.CurrentWaypointIndex < len(p.Waypoints)-1 {
						p.CurrentWaypointIndex++
					} else {
						p.ReachedTarget = true
						vel.DX, vel.DY = 0, 0
						break
					}
				} else {
					nx, ny := dx/dist, dy/dist
					pos.X += nx * remaining
					pos.Y += ny * remaining
					pos.Z = float64(s.PF.GetElevation(pos.X, pos.Y))
					pos.Rotation = math.Atan2(ny, nx)
					vel.DX = nx * speed
					vel.DY = ny * speed
					remaining = 0
				}
			}
		} else if vel.DX != 0 || vel.DY != 0 {
			nx := pos.X + vel.DX*dt
			ny := pos.Y + vel.DY*dt
			if s.PF.IsWalkable(nx, ny) {
				pos.X, pos.Y = nx, ny
				pos.Z = float64(s.PF.GetElevation(nx, ny))
			}
			vel.DX, vel.DY = 0, 0
		}
	}
}

// ---------------------------------------------------------------------------
// CombatSystem
// ---------------------------------------------------------------------------

type DeathEvent struct {
	EntityID string
	KillerID string
	IsHero   bool
	Team     string
}

type CombatSystem struct {
	gameTime    float64
	DeathEvents []DeathEvent
}

func (s *CombatSystem) Name() string { return "combat" }

func (s *CombatSystem) Update(dt float64, w *World) {
	s.gameTime += dt
	s.DeathEvents = s.DeathEvents[:0]

	for _, e := range w.Entities() {
		if w.HasComponent(e.ID, CDead) {
			continue
		}
		combat := GetCombat(w, e.ID)
		if combat == nil || combat.TargetID == "" {
			continue
		}
		pos := GetPosition(w, e.ID)
		if pos == nil {
			continue
		}

		tgt := w.GetEntity(combat.TargetID)
		if tgt == nil || !tgt.Active || w.HasComponent(combat.TargetID, CDead) {
			combat.TargetID = ""
			continue
		}

		tgtPos := GetPosition(w, combat.TargetID)
		tgtHP  := GetHealth(w, combat.TargetID)
		if tgtPos == nil || tgtHP == nil {
			combat.TargetID = ""
			continue
		}

		if math.Hypot(tgtPos.X-pos.X, tgtPos.Y-pos.Y) > combat.AttackRange+8 {
			continue
		}
		if s.gameTime-combat.LastAttackTime < combat.AttackInterval() {
			continue
		}

		tgtCombat := GetCombat(w, combat.TargetID)
		armor := 0.0
		if tgtCombat != nil {
			armor = tgtCombat.Armor
		}
		final := CalcDamage(combat.DamageMin, combat.DamageMax, armor)
		tgtHP.HP = math.Max(0, tgtHP.HP-final)
		combat.LastAttackTime = s.gameTime

		if tgtHP.HP <= 0 {
			s.killEntity(w, combat.TargetID, e.ID)
			combat.TargetID = ""
		}
	}
}

func (s *CombatSystem) killEntity(w *World, entityID, killerID string) {
	ut   := GetUnitType(w, entityID)
	team := GetTeam(w, entityID)
	isHero := ut != nil && ut.Type == "hero"

	if isHero {
		w.AddComponent(entityID, CDead, &Dead{DiedAt: s.gameTime})
	} else {
		w.DestroyEntity(entityID)
	}

	t := ""
	if team != nil {
		t = team.Team
	}
	s.DeathEvents = append(s.DeathEvents, DeathEvent{
		EntityID: entityID, KillerID: killerID, IsHero: isHero, Team: t,
	})
}

// CalcDamage applies the SPEC armor reduction formula.
func CalcDamage(dmgMin, dmgMax, armor float64) float64 {
	red := 0.06 * armor / (1 + 0.06*math.Abs(armor))
	raw := dmgMin + rand.Float64()*(dmgMax-dmgMin)
	return math.Max(1, math.Round(raw*(1-red)))
}

// ---------------------------------------------------------------------------
// TowerAISystem — SPEC target priority
// ---------------------------------------------------------------------------

type unitSnap struct {
	pos            *Position
	team           string
	unitType       string
	subtype        string
	combatTargetID string
}

type TowerAISystem struct{}

func (s *TowerAISystem) Name() string { return "towerAI" }

func (s *TowerAISystem) Update(_ float64, w *World) {
	units := make(map[string]unitSnap)
	for _, e := range w.Entities() {
		if w.HasComponent(e.ID, CDead) { continue }
		pos    := GetPosition(w, e.ID)
		team   := GetTeam(w, e.ID)
		ut     := GetUnitType(w, e.ID)
		combat := GetCombat(w, e.ID)
		if pos == nil || team == nil || ut == nil { continue }
		tgt := ""
		if combat != nil { tgt = combat.TargetID }
		units[e.ID] = unitSnap{pos, team.Team, ut.Type, ut.Subtype, tgt}
	}

	for id, tower := range units {
		if tower.unitType != "tower" { continue }
		combat := GetCombat(w, id)
		hp     := GetHealth(w, id)
		if combat == nil || hp == nil || hp.HP <= 0 { continue }

		if combat.TargetID != "" {
			t, ok := units[combat.TargetID]
			tHP  := GetHealth(w, combat.TargetID)
			if !ok || t.team == tower.team || tHP == nil || tHP.HP <= 0 {
				combat.TargetID = ""
			}
		}
		if combat.TargetID == "" {
			combat.TargetID = towerSelectTarget(tower, units, combat.AttackRange)
		}
	}
}

func towerSelectTarget(tower unitSnap, units map[string]unitSnap, attackRange float64) string {
	var enemies []struct{ id string; d float64; u unitSnap }
	for id, u := range units {
		if u.team == tower.team || u.unitType == "tower" || u.unitType == "building" { continue }
		d := math.Hypot(u.pos.X-tower.pos.X, u.pos.Y-tower.pos.Y)
		if d <= attackRange {
			enemies = append(enemies, struct{ id string; d float64; u unitSnap }{id, d, u})
		}
	}
	// P1: enemy attacking friendly hero
	for _, e := range enemies {
		if e.u.combatTargetID != "" {
			tgt, ok := units[e.u.combatTargetID]
			if ok && tgt.team == tower.team && tgt.unitType == "hero" { return e.id }
		}
	}
	// P2: nearest creep
	best, bestD := "", math.MaxFloat64
	for _, e := range enemies {
		if e.u.unitType == "creep" && e.u.subtype != "siege" && e.d < bestD { best, bestD = e.id, e.d }
	}
	if best != "" { return best }
	// P3: nearest siege
	bestD = math.MaxFloat64
	for _, e := range enemies {
		if e.u.unitType == "creep" && e.u.subtype == "siege" && e.d < bestD { best, bestD = e.id, e.d }
	}
	if best != "" { return best }
	// P4: nearest hero
	bestD = math.MaxFloat64
	for _, e := range enemies {
		if e.u.unitType == "hero" && e.d < bestD { best, bestD = e.id, e.d }
	}
	return best
}

// ---------------------------------------------------------------------------
// CreepAISystem — march to end of lane using waypoints; attack enemies in range;
// resume march when enemy dies. No leash / return mechanic.
// ---------------------------------------------------------------------------

type creepUnitSnap struct {
	pos  *Position
	team string
	ut   string
}

const aggroRange = 500.0
const waypointReachDist = 96.0

type CreepAISystem struct{}

func (s *CreepAISystem) Name() string { return "creepAI" }

func (s *CreepAISystem) Update(_ float64, w *World) {
	// Snapshot alive units for aggro checks
	aliveUnits := map[string]creepUnitSnap{}
	for _, e := range w.Entities() {
		if w.HasComponent(e.ID, CDead) {
			continue
		}
		pos  := GetPosition(w, e.ID)
		team := GetTeam(w, e.ID)
		ut   := GetUnitType(w, e.ID)
		if pos != nil && team != nil && ut != nil {
			aliveUnits[e.ID] = creepUnitSnap{pos, team.Team, ut.Type}
		}
	}

	for _, e := range w.Entities() {
		if w.HasComponent(e.ID, CDead) {
			continue
		}
		ai := GetLaneAI(w, e.ID)
		if ai == nil {
			continue
		}
		pos    := GetPosition(w, e.ID)
		path   := GetPath(w, e.ID)
		combat := GetCombat(w, e.ID)
		if pos == nil || path == nil {
			continue
		}

		switch ai.State {
		case StateMarch:
			// Check for nearby enemy — switch to fight
			enemy := nearestEnemy(e.ID, ai.Team, pos, aliveUnits, aggroRange)
			if enemy != "" {
				ai.AggroTargetID = enemy
				ai.State = StateFight
				break
			}
			// Advance waypoint index when close enough
			if len(path.Waypoints) > 0 {
				wi := path.CurrentWaypointIndex
				if wi >= len(path.Waypoints) {
					wi = len(path.Waypoints) - 1
				}
				wp := path.Waypoints[wi]
				dist := math.Hypot(wp.X-pos.X, wp.Y-pos.Y)
				if dist < waypointReachDist && wi < len(path.Waypoints)-1 {
					path.CurrentWaypointIndex = wi + 1
				}
			}
			// If reached end of waypoints, stop (base destroyed / no more path)
			if path.ReachedTarget {
				path.Waypoints = nil
			}

		case StateFight, StateChase:
			// Validate target
			if ai.AggroTargetID != "" {
				tgt, ok := aliveUnits[ai.AggroTargetID]
				tHP := GetHealth(w, ai.AggroTargetID)
				if !ok || tHP == nil || tHP.HP <= 0 {
					_ = tgt
					ai.AggroTargetID = ""
				}
			}
			// Re-acquire
			if ai.AggroTargetID == "" {
				enemy := nearestEnemy(e.ID, ai.Team, pos, aliveUnits, aggroRange)
				if enemy != "" {
					ai.AggroTargetID = enemy
				} else {
					// No enemies — resume march (no return)
					ai.State = StateMarch
					if combat != nil {
						combat.TargetID = ""
					}
					break
				}
			}
			tgtInfo, ok := aliveUnits[ai.AggroTargetID]
			if !ok {
				ai.State = StateMarch
				break
			}
			attackRange := 100.0
			if combat != nil {
				attackRange = combat.AttackRange
			}
			dist := math.Hypot(tgtInfo.pos.X-pos.X, tgtInfo.pos.Y-pos.Y)
			if dist > attackRange+8 {
				// Chase: set path toward target directly (server uses simple waypoints)
				path.Waypoints = []Waypoint{{pos.X, pos.Y}, {tgtInfo.pos.X, tgtInfo.pos.Y}}
				path.CurrentWaypointIndex = 1
				path.ReachedTarget = false
				if combat != nil {
					combat.TargetID = ""
				}
			} else {
				path.Waypoints = nil
				path.ReachedTarget = true
				if combat != nil {
					combat.TargetID = ai.AggroTargetID
				}
			}

		case StateReturn:
			// Legacy state — treat as march
			ai.State = StateMarch
		}
	}
}

func nearestEnemy(selfID, selfTeam string, selfPos *Position, units map[string]creepUnitSnap, rng float64) string {
	best, bestD := "", math.MaxFloat64
	for id, u := range units {
		if id == selfID || u.team == selfTeam || u.team == "neutral" { continue }
		d := math.Hypot(u.pos.X-selfPos.X, u.pos.Y-selfPos.Y)
		if d <= rng && d < bestD {
			best, bestD = id, d
		}
	}
	return best
}

// ---------------------------------------------------------------------------
// EconomySystem
// ---------------------------------------------------------------------------

var xpPerLevel = [11]float64{0, 230, 370, 480, 580, 600, 720, 750, 890, 930, 1050}

type EconomySystem struct {
	gameTime     float64
	combatRef    *CombatSystem
	passiveAccum float64
}

func (s *EconomySystem) Name() string { return "economy" }

func (s *EconomySystem) SetCombat(cs *CombatSystem) { s.combatRef = cs }

func (s *EconomySystem) Update(dt float64, w *World) {
	s.gameTime += dt

	// Process kills from CombatSystem
	if s.combatRef != nil {
		for _, evt := range s.combatRef.DeathEvents {
			s.processKill(w, evt)
		}
	}

	// Passive gold +1/sec
	s.passiveAccum += dt
	if s.passiveAccum >= 1.0 {
		ticks := math.Floor(s.passiveAccum)
		s.passiveAccum -= ticks
		for _, e := range w.Entities() {
			if w.HasComponent(e.ID, CDead) { continue }
			ut  := GetUnitType(w, e.ID)
			inv := GetInventory(w, e.ID)
			if ut != nil && ut.Type == "hero" && inv != nil {
				inv.Gold += ticks
			}
		}
	}
}

func (s *EconomySystem) processKill(w *World, evt DeathEvent) {
	deadUT  := GetUnitType(w, evt.EntityID)
	deadPos := GetPosition(w, evt.EntityID)
	if deadUT == nil || deadPos == nil { return }

	isCreep := deadUT.Type == "creep"
	isHero  := deadUT.Type == "hero"
	subtype := deadUT.Subtype

	// Gold to killer
	if evt.KillerID != "" {
		killerInv := GetInventory(w, evt.KillerID)
		if killerInv != nil {
			if isCreep {
				switch subtype {
				case "melee":
					killerInv.Gold += 36 + rand.Float64()*10
				case "ranged":
					killerInv.Gold += 41 + rand.Float64()*8
				case "siege":
					killerInv.Gold += 60 + rand.Float64()*15
				}
			} else if isHero {
				victimInv := GetInventory(w, evt.EntityID)
				lvl := 1
				if victimInv != nil { lvl = victimInv.Level }
				killerInv.Gold += float64(200 + lvl*10)
			}
		}
	}

	// XP — split among nearby allies of killer
	baseXP := 0.0
	if isCreep {
		switch subtype {
		case "melee":  baseXP = 57
		case "ranged": baseXP = 69
		case "siege":  baseXP = 88
		}
	} else if isHero {
		victimInv := GetInventory(w, evt.EntityID)
		lvl := 1
		if victimInv != nil { lvl = victimInv.Level }
		baseXP = float64(200 + lvl*20)
	}
	if baseXP == 0 { return }

	killerTeam := ""
	if evt.KillerID != "" {
		if t := GetTeam(w, evt.KillerID); t != nil {
			killerTeam = t.Team
		}
	}
	if killerTeam == "" { return }

	var receivers []string
	for _, e := range w.Entities() {
		if w.HasComponent(e.ID, CDead) { continue }
		ut   := GetUnitType(w, e.ID)
		team := GetTeam(w, e.ID)
		pos  := GetPosition(w, e.ID)
		if ut == nil || team == nil || pos == nil { continue }
		if ut.Type != "hero" || team.Team != killerTeam { continue }
		if math.Hypot(pos.X-deadPos.X, pos.Y-deadPos.Y) <= 1300 {
			receivers = append(receivers, e.ID)
		}
	}

	if len(receivers) == 0 { return }
	xpEach := math.Round(baseXP / float64(len(receivers)))
	for _, heroID := range receivers {
		inv := GetInventory(w, heroID)
		if inv == nil { continue }
		inv.XP += xpEach
		for inv.Level < 10 && inv.XPToNextLevel > 0 && inv.XP >= inv.XPToNextLevel {
			inv.XP -= inv.XPToNextLevel
			inv.Level++
			if inv.Level < len(xpPerLevel) {
				inv.XPToNextLevel = xpPerLevel[inv.Level]
			} else {
				inv.XPToNextLevel = 2000
			}
			// Stat gains per level (SPEC averages)
			if hp := GetHealth(w, heroID); hp != nil {
				hp.MaxHP += 60
				hp.HP += 60
				hp.MaxMana += 35
				hp.Mana += 35
			}
			if combat := GetCombat(w, heroID); combat != nil {
				combat.DamageMin += 3
				combat.DamageMax += 3
				combat.Armor += 0.4
			}
		}
	}
}

// ---------------------------------------------------------------------------
// RespawnSystem
// ---------------------------------------------------------------------------

type RespawnSystem struct {
	gameTime float64
}

func (s *RespawnSystem) Name() string { return "respawn" }

func (s *RespawnSystem) Update(dt float64, w *World) {
	s.gameTime += dt

	for _, e := range w.Entities() {
		dead := GetDead(w, e.ID)
		if dead == nil { continue }
		ut := GetUnitType(w, e.ID)
		if ut == nil || ut.Type != "hero" { continue }

		inv := GetInventory(w, e.ID)
		lvl := 1
		if inv != nil { lvl = inv.Level }
		respawnTime := float64(lvl*2+4)

		if s.gameTime-dead.DiedAt >= respawnTime {
			w.RemoveComponent(e.ID, CDead)

			hp := GetHealth(w, e.ID)
			if hp != nil { hp.HP = hp.MaxHP; hp.Mana = hp.MaxMana }

			spawn := GetRespawn(w, e.ID)
			pos   := GetPosition(w, e.ID)
			if pos != nil && spawn != nil {
				pos.X, pos.Y = spawn.SpawnX, spawn.SpawnY
			}
			if p := GetPath(w, e.ID); p != nil {
				p.Waypoints = nil
				p.ReachedTarget = true
			}
		}
	}
}

// ---------------------------------------------------------------------------
// SeparationSystem — spatial hash grid O(n) expected instead of O(n²)
// ---------------------------------------------------------------------------

const unitRadius     = 32.0
const separationDia  = unitRadius * 2
// hashCell must be >= separationDia so only 3×3 neighbours need checking
const hashCell       = separationDia // 64 world units

type cellKey struct{ cx, cy int }

type SeparationSystem struct{}

func (s *SeparationSystem) Name() string { return "separation" }

func (s *SeparationSystem) Update(_ float64, w *World) {
	type up struct {
		id string
		p  *Position
	}
	units := make([]up, 0, 128)
	for _, e := range w.Entities() {
		p := GetPosition(w, e.ID)
		if p != nil {
			units = append(units, up{e.ID, p})
		}
	}
	if len(units) == 0 {
		return
	}

	// Build spatial hash
	grid := make(map[cellKey][]int, len(units))
	cell := func(x, y float64) cellKey {
		return cellKey{int(math.Floor(x / hashCell)), int(math.Floor(y / hashCell))}
	}
	for i, u := range units {
		k := cell(u.p.X, u.p.Y)
		grid[k] = append(grid[k], i)
	}

	diaSq := separationDia * separationDia
	for i := range units {
		a := units[i]
		cx := int(math.Floor(a.p.X / hashCell))
		cy := int(math.Floor(a.p.Y / hashCell))

		for nx := cx - 1; nx <= cx+1; nx++ {
			for ny := cy - 1; ny <= cy+1; ny++ {
				for _, j := range grid[cellKey{nx, ny}] {
					if j <= i {
						continue // each pair once
					}
					b := units[j]
					dx := b.p.X - a.p.X
					dy := b.p.Y - a.p.Y
					distSq := dx*dx + dy*dy
					if distSq >= diaSq || distSq < 0.0001 {
						continue
					}
					dist := math.Sqrt(distSq)
					overlap := (separationDia - dist) * 0.5
					ex, ey := dx/dist, dy/dist
					a.p.X -= ex * overlap
					a.p.Y -= ey * overlap
					b.p.X += ex * overlap
					b.p.Y += ey * overlap
				}
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func gameTimeSec(w *World) float64 {
	return float64(w.Tick) / 30.0
}
