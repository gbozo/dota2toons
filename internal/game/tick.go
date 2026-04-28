package game

import (
	"math"
	"sync"
	"time"

	"dota2toons/internal/mapdata"
)

const TickRate = 30              // Hz
const TickDuration = time.Second / TickRate

// GameInstance is the authoritative server-side game state.
type GameInstance struct {
	mu      sync.RWMutex
	world   *World
	systems []System

	// Core systems exposed for cross-system wiring
	Combat   *CombatSystem
	Economy  *EconomySystem
	Spawner  *CreepSpawnerSystem

	// Input queue: clientID → pending commands
	inputQueue   map[string][]InputCommand
	inputMu      sync.Mutex

	// Tick counter and game time
	GameTime float64 // seconds

	done chan struct{}
}

// InputCommand is a command received from a client.
type InputCommand struct {
	Type          string  // "move" | "attack" | "stop"
	Seq           int
	TargetX       float64
	TargetY       float64
	TargetEntityID string
	ClientID      string
	HeroEntityID  string
}

// NewGameInstance builds and wires all systems, loads map data.
func NewGameInstance(md *mapdata.MapData) *GameInstance {
	g := &GameInstance{
		world:      NewWorld(),
		inputQueue: make(map[string][]InputCommand),
		done:       make(chan struct{}),
	}

	pf := NewPathfinder(md)
	lw := ParseLaneWaypoints(md)

	// Build and register systems in execution order
	statusSys   := &StatusSystem{}
	moveSys     := &MovementSystem{PF: pf}
	combatSys   := &CombatSystem{}
	economySys  := &EconomySystem{}
	respawnSys  := &RespawnSystem{}
	spawnerSys  := &CreepSpawnerSystem{LaneWaypoints: lw, timeSinceSpawn: 29.0}
	creepAISys  := &CreepAISystem{}
	towerAISys  := &TowerAISystem{}
	sepSys      := &SeparationSystem{}

	economySys.SetCombat(combatSys)

	for _, s := range []System{
		statusSys, moveSys, spawnerSys, creepAISys, towerAISys,
		combatSys, economySys, respawnSys, sepSys,
	} {
		g.world.RegisterSystem(s)
	}

	g.Combat  = combatSys
	g.Economy = economySys
	g.Spawner = spawnerSys

	// Spawn map structures (towers) from mapdata
	g.spawnMapStructures(md)

	return g
}

// SpawnHero creates a hero entity for a player and returns its ID.
func (g *GameInstance) SpawnHero(heroKey, team, clientID string, spawnX, spawnY float64) EntityID {
	e := g.world.CreateEntity()

	g.world.AddComponent(e.ID, CPosition,  &Position{X: spawnX, Y: spawnY})
	g.world.AddComponent(e.ID, CVelocity,  &Velocity{})
	g.world.AddComponent(e.ID, CTeam,      &Team{Team: team})
	g.world.AddComponent(e.ID, CUnitType,  &UnitType{Type: "hero", Subtype: heroKey})
	g.world.AddComponent(e.ID, CHealth,    &Health{HP: 600, MaxHP: 600, Mana: 200, MaxMana: 200})
	g.world.AddComponent(e.ID, CCombat,    &Combat{DamageMin: 45, DamageMax: 55, AttackRange: 150, BaseAttackTime: 1.7, Armor: 2})
	g.world.AddComponent(e.ID, CPath,      &Path{ReachedTarget: true})
	g.world.AddComponent(e.ID, CNetworkID, &NetworkID{OwnerClientID: clientID, EntityType: "hero"})
	g.world.AddComponent(e.ID, CInventory, &Inventory{Gold: 600, Level: 1, XPToNextLevel: 230})
	g.world.AddComponent(e.ID, CRespawn,   &Respawn{SpawnX: spawnX, SpawnY: spawnY})
	g.world.AddComponent(e.ID, CStatusEffects, &StatusEffects{})

	return e.ID
}

// ReturnToSpawn paths a disconnected hero back to their spawn point using A*.
// Safe to call from outside the tick goroutine — it queues a move command.
func (g *GameInstance) ReturnToSpawn(heroEntityID EntityID) {
	pos    := GetPosition(g.world, heroEntityID)
	spawn  := GetRespawn(g.world, heroEntityID)
	if pos == nil || spawn == nil {
		return
	}

	// Don't bother if already at spawn
	if math.Hypot(pos.X-spawn.SpawnX, pos.Y-spawn.SpawnY) < 128 {
		return
	}

	pf := g.world.systems[1].(*MovementSystem).PF
	wps := pf.FindPath(pos.X, pos.Y, spawn.SpawnX, spawn.SpawnY)
	if len(wps) == 0 {
		// Straight line fallback — just set the destination directly
		wps = []Waypoint{{spawn.SpawnX, spawn.SpawnY}}
	}

	p := GetPath(g.world, heroEntityID)
	if p == nil {
		return
	}
	p.Waypoints = append([]Waypoint{{pos.X, pos.Y}}, wps...)
	p.CurrentWaypointIndex = 0
	p.ReachedTarget = false
	p.TargetX = spawn.SpawnX
	p.TargetY = spawn.SpawnY

	// Clear any combat target so the hero doesn't fight on the way home
	if combat := GetCombat(g.world, heroEntityID); combat != nil {
		combat.TargetID = ""
	}
}

func (g *GameInstance) spawnMapStructures(md *mapdata.MapData) {
	tierHP := map[int]float64{1: 1300, 2: 1600, 3: 1900, 4: 2100}
	tierDmg := map[int]float64{1: 100, 2: 120, 3: 140, 4: 160}

	for _, b := range md.Buildings {
		name := b.Name
		// Skip non-attack structures: watch towers, fountains, barracks, ancients etc.
		// Only spawn real attack towers (npc_dota_tower entities named dota_*guys_tower*).
		if !contains(name, "tower") || contains(name, "watch_tower") {
			continue
		}
		var tier int
		switch {
		case contains(name, "tower4"):
			tier = 4
		case contains(name, "tower3"):
			tier = 3
		case contains(name, "tower2"):
			tier = 2
		case contains(name, "tower"):
			tier = 1
		default:
			continue
		}
		team := b.Team
		if team == "" {
			continue
		}

		e := g.world.CreateEntity()
		g.world.AddComponent(e.ID, CPosition, &Position{X: b.X, Y: b.Y})
		g.world.AddComponent(e.ID, CTeam,     &Team{Team: string(team)})
		g.world.AddComponent(e.ID, CUnitType, &UnitType{Type: "tower", Subtype: itoa(tier)})
		g.world.AddComponent(e.ID, CHealth,   &Health{HP: tierHP[tier], MaxHP: tierHP[tier]})
		g.world.AddComponent(e.ID, CCombat,   &Combat{
			DamageMin: tierDmg[tier], DamageMax: tierDmg[tier],
			AttackRange: 700, BaseAttackTime: 1.0,
		})
	}
}

// QueueInput enqueues a client command to be processed next tick.
func (g *GameInstance) QueueInput(cmd InputCommand) {
	g.inputMu.Lock()
	g.inputQueue[cmd.ClientID] = append(g.inputQueue[cmd.ClientID], cmd)
	g.inputMu.Unlock()
}

// Start begins the 30 Hz game loop in a goroutine.
func (g *GameInstance) Start() {
	ticker := time.NewTicker(TickDuration)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-g.done:
				return
			case <-ticker.C:
				g.tick()
			}
		}
	}()
}

// Stop shuts down the game loop.
func (g *GameInstance) Stop() {
	close(g.done)
}

// World returns the ECS world (read-only for snapshot serialization).
func (g *GameInstance) World() *World {
	return g.world
}

const dt = 1.0 / TickRate

func (g *GameInstance) tick() {
	g.GameTime += dt

	// Process queued inputs
	g.inputMu.Lock()
	queue := g.inputQueue
	g.inputQueue = make(map[string][]InputCommand)
	g.inputMu.Unlock()

	for _, cmds := range queue {
		for _, cmd := range cmds {
			g.processInput(cmd)
		}
	}

	// Run all ECS systems
	g.world.Update(dt)
}

func (g *GameInstance) processInput(cmd InputCommand) {
	if cmd.HeroEntityID == "" {
		return
	}
	switch cmd.Type {
	case "move":
		p := GetPath(g.world, cmd.HeroEntityID)
		pos := GetPosition(g.world, cmd.HeroEntityID)
		if p == nil || pos == nil {
			return
		}
		// Snap start and find path
		pf := g.world.systems[1].(*MovementSystem).PF
		wps := pf.FindPath(pos.X, pos.Y, cmd.TargetX, cmd.TargetY)
		if len(wps) == 0 {
			return
		}
		p.Waypoints = append([]Waypoint{{pos.X, pos.Y}}, wps...)
		p.CurrentWaypointIndex = 0
		p.ReachedTarget = false
		p.TargetX, p.TargetY = cmd.TargetX, cmd.TargetY

	case "attack":
		combat := GetCombat(g.world, cmd.HeroEntityID)
		if combat != nil {
			combat.TargetID = cmd.TargetEntityID
		}

	case "stop":
		p := GetPath(g.world, cmd.HeroEntityID)
		if p != nil {
			p.Waypoints = nil
			p.ReachedTarget = true
		}
		v := GetVelocity(g.world, cmd.HeroEntityID)
		if v != nil {
			v.DX, v.DY = 0, 0
		}
	}
}
