package game

import (
	"dota2toons/internal/mapdata"
)

// ---------------------------------------------------------------------------
// CreepSpawnerSystem
// ---------------------------------------------------------------------------

// LaneWaypoints holds waypoints for all 6 lane paths.
type LaneWaypoints struct {
	Radiant map[string][]Waypoint // "top" | "mid" | "bot"
	Dire    map[string][]Waypoint
}

// ParseLaneWaypoints converts mapdata lane paths into LaneWaypoints.
func ParseLaneWaypoints(md *mapdata.MapData) LaneWaypoints {
	lw := LaneWaypoints{
		Radiant: make(map[string][]Waypoint),
		Dire:    make(map[string][]Waypoint),
	}

	for _, lane := range md.Lanes {
		wps := make([]Waypoint, len(lane.Points))
		for i, p := range lane.Points {
			wps[i] = Waypoint{p[0], p[1]}
		}
		// leamare naming: npc_dota_spawner_good_mid → radiant mid
		name := lane.Name
		switch {
		case contains(name, "good_mid"):
			lw.Radiant["mid"] = wps
		case contains(name, "good_top"):
			lw.Radiant["top"] = wps
		case contains(name, "good_bot"):
			lw.Radiant["bot"] = wps
		case contains(name, "bad_mid"):
			lw.Dire["mid"] = wps
		case contains(name, "bad_top"):
			lw.Dire["top"] = wps
		case contains(name, "bad_bot"):
			lw.Dire["bot"] = wps
		}
	}
	return lw
}

// creep base stats
var creepStats = map[string][3]float64{
	// [hp, dmgMin, dmgMax]
	"melee":  {550, 19, 23},
	"ranged": {300, 21, 26},
	"siege":  {800, 40, 60},
}

var creepRanges = map[string]float64{
	"melee": 100, "ranged": 500, "siege": 690,
}

// CreepSpawnerSystem spawns wave every 30s.
type CreepSpawnerSystem struct {
	LaneWaypoints LaneWaypoints
	timeSinceSpawn float64
	waveNumber     int
}

func (s *CreepSpawnerSystem) Name() string { return "creepSpawner" }

func (s *CreepSpawnerSystem) Update(dt float64, w *World) {
	s.timeSinceSpawn += dt
	if s.timeSinceSpawn < 30.0 {
		return
	}
	s.timeSinceSpawn -= 30.0
	s.waveNumber++
	siege := s.waveNumber%5 == 0

	for _, team := range []string{"radiant", "dire"} {
		waysMap := s.LaneWaypoints.Radiant
		if team == "dire" {
			waysMap = s.LaneWaypoints.Dire
		}
		for _, lane := range []string{"top", "mid", "bot"} {
			wps, ok := waysMap[lane]
			if !ok || len(wps) == 0 {
				continue
			}
			s.spawnWave(w, team, lane, wps, siege)
		}
	}
}

type creepDef struct {
	ctype   string
	offsetX float64
	offsetY float64
}

func (s *CreepSpawnerSystem) spawnWave(w *World, team, lane string, wps []Waypoint, siege bool) {
	composition := []creepDef{
		{"melee", 0, 0}, {"melee", 80, 0}, {"melee", 0, 80}, {"ranged", 80, 80},
	}
	if siege {
		composition = append(composition, creepDef{"siege", -80, 0})
	}
	spawnX, spawnY := wps[0].X, wps[0].Y

	for _, c := range composition {
		s.spawnCreep(w, team, lane, c.ctype, spawnX+c.offsetX, spawnY+c.offsetY, wps)
	}
}

func (s *CreepSpawnerSystem) spawnCreep(w *World, team, lane, ctype string, x, y float64, wps []Waypoint) {
	stats := creepStats[ctype]
	e := w.CreateEntity()

	w.AddComponent(e.ID, CPosition,  &Position{X: x, Y: y})
	w.AddComponent(e.ID, CVelocity,  &Velocity{})
	w.AddComponent(e.ID, CTeam,      &Team{Team: team})
	w.AddComponent(e.ID, CUnitType,  &UnitType{Type: "creep", Subtype: ctype})
	w.AddComponent(e.ID, CHealth,    &Health{HP: stats[0], MaxHP: stats[0]})
	w.AddComponent(e.ID, CCombat,    &Combat{
		DamageMin: stats[1], DamageMax: stats[2],
		AttackRange: creepRanges[ctype], BaseAttackTime: 1.7,
	})
	w.AddComponent(e.ID, CStatusEffects, &StatusEffects{})

	// Path — start marching from waypoint 1 (0 is spawn)
	pathWps := make([]Waypoint, len(wps))
	copy(pathWps, wps)
	startIdx := 1
	if startIdx >= len(pathWps) { startIdx = 0 }
	w.AddComponent(e.ID, CPath, &Path{
		Waypoints:            pathWps,
		CurrentWaypointIndex: startIdx,
		ReachedTarget:        false,
		TargetX:              wps[len(wps)-1].X,
		TargetY:              wps[len(wps)-1].Y,
	})
	w.AddComponent(e.ID, CLaneAI, &LaneAI{
		Lane:  lane,
		Team:  team,
		State: StateMarch,
	})
}
