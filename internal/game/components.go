package game

// ---------------------------------------------------------------------------
// Component ID constants — must match TypeScript component IDs exactly
// ---------------------------------------------------------------------------

const (
	CPosition       = "position"
	CVelocity       = "velocity"
	CTeam           = "team"
	CUnitType       = "unitType"
	CHealth         = "health"
	CCombat         = "combat"
	CPath           = "path"
	CLaneAI         = "laneAI"
	CAbility        = "ability"
	CInventory      = "inventory"
	CNetworkID      = "networkId"
	CDead           = "dead"
	CRespawn        = "respawn"
	CStatusEffects  = "statusEffects"
	CProjectile     = "projectile"
)

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

type Position struct {
	X, Y, Z  float64
	Rotation float64
}

// ---------------------------------------------------------------------------
// Velocity
// ---------------------------------------------------------------------------

type Velocity struct {
	DX, DY, DZ float64
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

type Team struct {
	Team string // "radiant" | "dire" | "neutral"
}

// ---------------------------------------------------------------------------
// UnitType
// ---------------------------------------------------------------------------

type UnitType struct {
	Type    string // "hero" | "creep" | "tower" | "building" | "projectile"
	Subtype string // e.g. hero key, creep type, tier
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

type Health struct {
	HP     float64
	MaxHP  float64
	Mana   float64
	MaxMana float64
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

type Combat struct {
	DamageMin        float64
	DamageMax        float64
	AttackRange      float64
	BaseAttackTime   float64 // seconds
	AttackSpeedBonus float64 // %
	Armor            float64
	LastAttackTime   float64 // game time seconds
	TargetID         string  // current attack target entity ID
}

func (c *Combat) AttackInterval() float64 {
	return c.BaseAttackTime / (1.0 + c.AttackSpeedBonus/100.0)
}

// ---------------------------------------------------------------------------
// Path / Waypoints
// ---------------------------------------------------------------------------

type Waypoint struct {
	X, Y float64
}

type Path struct {
	TargetX, TargetY     float64
	Waypoints            []Waypoint
	CurrentWaypointIndex int
	ReachedTarget        bool
}

// ---------------------------------------------------------------------------
// LaneAI
// ---------------------------------------------------------------------------

type CreepState string

const (
	StateMarch  CreepState = "march"
	StateFight  CreepState = "fight"
	StateChase  CreepState = "chase"
	StateReturn CreepState = "return"
)

type LaneAI struct {
	Lane          string // "top" | "mid" | "bot"
	Team          string
	WaypointIndex int
	State         CreepState
	AggroTargetID string
	ReturnX       float64
	ReturnY       float64
}

// ---------------------------------------------------------------------------
// Dead
// ---------------------------------------------------------------------------

type Dead struct {
	DiedAt float64 // game time seconds
}

// ---------------------------------------------------------------------------
// Respawn
// ---------------------------------------------------------------------------

type Respawn struct {
	SpawnX, SpawnY float64
}

// ---------------------------------------------------------------------------
// StatusEffect
// ---------------------------------------------------------------------------

type StatusEffect struct {
	Type        string  // "stun" | "slow" | "root" | "silence" | "taunt"
	ExpiresAt   float64 // game time seconds
	Magnitude   float64 // e.g. slow factor
	SourceID    string
}

type StatusEffects struct {
	Effects []StatusEffect
}

func (se *StatusEffects) Has(effectType string, now float64) bool {
	for _, e := range se.Effects {
		if e.Type == effectType && e.ExpiresAt > now {
			return true
		}
	}
	return false
}

func (se *StatusEffects) Add(effectType string, duration float64, now float64, sourceID string, magnitude float64) {
	newExp := now + duration
	for i, e := range se.Effects {
		if e.Type == effectType {
			if newExp > e.ExpiresAt {
				se.Effects[i].ExpiresAt = newExp
				se.Effects[i].Magnitude = magnitude
				se.Effects[i].SourceID  = sourceID
			}
			return
		}
	}
	se.Effects = append(se.Effects, StatusEffect{
		Type: effectType, ExpiresAt: newExp, Magnitude: magnitude, SourceID: sourceID,
	})
}

func (se *StatusEffects) Prune(now float64) {
	out := se.Effects[:0]
	for _, e := range se.Effects {
		if e.ExpiresAt > now {
			out = append(out, e)
		}
	}
	se.Effects = out
}

// ---------------------------------------------------------------------------
// NetworkID
// ---------------------------------------------------------------------------

type NetworkID struct {
	ServerID      string
	OwnerClientID string
	EntityType    string // "hero" | "creep" | "tower" | "projectile"
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

type Inventory struct {
	Gold         float64
	XP           float64
	Level        int
	XPToNextLevel float64
	Items        [6]string // item IDs, empty string = empty slot
}

// ---------------------------------------------------------------------------
// AbilitySlot
// ---------------------------------------------------------------------------

type AbilitySlot struct {
	AbilityID      string
	Level          int
	CooldownEndsAt float64 // game time seconds
}

type Abilities struct {
	Slots [4]AbilitySlot
}

// ---------------------------------------------------------------------------
// Projectile
// ---------------------------------------------------------------------------

type Projectile struct {
	OwnerID      string
	OwnerTeam    string
	TargetID     string // homing target (empty = straight line)
	DestX, DestY float64
	Speed        float64  // world units/sec
	EffectJSON   string   // ability effect data
	AOERadius    float64
}

// ---------------------------------------------------------------------------
// Component accessor helpers — type-safe wrappers
// ---------------------------------------------------------------------------

func GetPosition(w *World, id EntityID) *Position {
	v := w.GetComponent(id, CPosition)
	if v == nil { return nil }
	p, _ := v.(*Position)
	return p
}

func GetVelocity(w *World, id EntityID) *Velocity {
	v := w.GetComponent(id, CVelocity)
	if v == nil { return nil }
	p, _ := v.(*Velocity)
	return p
}

func GetTeam(w *World, id EntityID) *Team {
	v := w.GetComponent(id, CTeam)
	if v == nil { return nil }
	p, _ := v.(*Team)
	return p
}

func GetUnitType(w *World, id EntityID) *UnitType {
	v := w.GetComponent(id, CUnitType)
	if v == nil { return nil }
	p, _ := v.(*UnitType)
	return p
}

func GetHealth(w *World, id EntityID) *Health {
	v := w.GetComponent(id, CHealth)
	if v == nil { return nil }
	p, _ := v.(*Health)
	return p
}

func GetCombat(w *World, id EntityID) *Combat {
	v := w.GetComponent(id, CCombat)
	if v == nil { return nil }
	p, _ := v.(*Combat)
	return p
}

func GetPath(w *World, id EntityID) *Path {
	v := w.GetComponent(id, CPath)
	if v == nil { return nil }
	p, _ := v.(*Path)
	return p
}

func GetLaneAI(w *World, id EntityID) *LaneAI {
	v := w.GetComponent(id, CLaneAI)
	if v == nil { return nil }
	p, _ := v.(*LaneAI)
	return p
}

func GetDead(w *World, id EntityID) *Dead {
	v := w.GetComponent(id, CDead)
	if v == nil { return nil }
	p, _ := v.(*Dead)
	return p
}

func GetRespawn(w *World, id EntityID) *Respawn {
	v := w.GetComponent(id, CRespawn)
	if v == nil { return nil }
	p, _ := v.(*Respawn)
	return p
}

func GetStatusEffects(w *World, id EntityID) *StatusEffects {
	v := w.GetComponent(id, CStatusEffects)
	if v == nil { return nil }
	p, _ := v.(*StatusEffects)
	return p
}

func GetInventory(w *World, id EntityID) *Inventory {
	v := w.GetComponent(id, CInventory)
	if v == nil { return nil }
	p, _ := v.(*Inventory)
	return p
}

func GetProjectile(w *World, id EntityID) *Projectile {
	v := w.GetComponent(id, CProjectile)
	if v == nil { return nil }
	p, _ := v.(*Projectile)
	return p
}
