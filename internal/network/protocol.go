// Package network defines the WebSocket message protocol for Dota 2 Toons.
// All messages are serialized with MessagePack (vmihailenco/msgpack/v5).
package network

// ---------------------------------------------------------------------------
// Message envelope
// ---------------------------------------------------------------------------

// MsgType identifies the message kind.
type MsgType string

const (
	// Client → Server
	MsgMoveCommand    MsgType = "move_command"
	MsgAttackCommand  MsgType = "attack_command"
	MsgAbilityCommand MsgType = "ability_command"
	MsgStopCommand    MsgType = "stop_command"
	MsgBuyItem        MsgType = "buy_item"
	MsgJoinGame       MsgType = "join_game"
	MsgPickHero       MsgType = "pick_hero"

	// Server → Client
	MsgFullSnapshot  MsgType = "full_snapshot"
	MsgDeltaSnapshot MsgType = "delta_snapshot"
	MsgAttackEvent   MsgType = "attack_event"
	MsgDeathEvent    MsgType = "death_event"
	MsgGoldUpdate    MsgType = "gold_update"
	MsgXPUpdate      MsgType = "xp_update"
	MsgGameOver      MsgType = "game_over"
	MsgLobbyState    MsgType = "lobby_state"
)

// Envelope wraps every message with its type tag.
type Envelope struct {
	Type MsgType `msgpack:"t"`
	Data []byte  `msgpack:"d"` // msgpack-encoded payload
}

// ---------------------------------------------------------------------------
// Client → Server messages
// ---------------------------------------------------------------------------

type MoveCommand struct {
	Seq     int     `msgpack:"seq"`
	Tick    int     `msgpack:"tick"`
	TargetX float64 `msgpack:"tx"`
	TargetY float64 `msgpack:"ty"`
}

type AttackCommand struct {
	Seq            int    `msgpack:"seq"`
	Tick           int    `msgpack:"tick"`
	TargetEntityID string `msgpack:"tid"`
}

type AbilityCommand struct {
	Seq            int     `msgpack:"seq"`
	Tick           int     `msgpack:"tick"`
	AbilitySlot    int     `msgpack:"slot"`
	TargetX        float64 `msgpack:"tx"`
	TargetY        float64 `msgpack:"ty"`
	TargetEntityID string  `msgpack:"tid"`
}

type StopCommand struct {
	Seq  int `msgpack:"seq"`
	Tick int `msgpack:"tick"`
}

type BuyItemCommand struct {
	Seq    int    `msgpack:"seq"`
	ItemID string `msgpack:"item"`
}

type JoinGameCommand struct {
	ClientID string `msgpack:"cid"`
	Name     string `msgpack:"name"`
}

type PickHeroCommand struct {
	HeroKey string `msgpack:"hero"`
}

// ---------------------------------------------------------------------------
// Server → Client messages
// ---------------------------------------------------------------------------

// EntityState is one entity's full state in a snapshot.
type EntityState struct {
	ID       string             `msgpack:"id"`
	X        float64            `msgpack:"x"`
	Y        float64            `msgpack:"y"`
	Z        float64            `msgpack:"z"`
	Rotation float64            `msgpack:"rot"`
	HP       float64            `msgpack:"hp"`
	MaxHP    float64            `msgpack:"mhp"`
	Mana     float64            `msgpack:"mp"`
	MaxMana  float64            `msgpack:"mmp"`
	Team     string             `msgpack:"team"`
	UnitType string             `msgpack:"ut"`
	Subtype  string             `msgpack:"sub"`
	Dead     bool               `msgpack:"dead"`
	Extra    map[string]float64 `msgpack:"ex,omitempty"` // gold, level, etc.
}

// FullSnapshot sends the complete world state on connect.
type FullSnapshot struct {
	Tick     int           `msgpack:"tick"`
	Entities []EntityState `msgpack:"ents"`
}

// DeltaSnapshot sends only changed entities since the client's last ACK.
type DeltaSnapshot struct {
	Tick     int           `msgpack:"tick"`
	BaseTick int           `msgpack:"base"`
	Creates  []EntityState `msgpack:"creates"`
	Updates  []EntityState `msgpack:"updates"`
	Destroys []string      `msgpack:"destroys"`
}

type AttackEvent struct {
	AttackerID string  `msgpack:"aid"`
	TargetID   string  `msgpack:"tid"`
	Damage     float64 `msgpack:"dmg"`
	Tick       int     `msgpack:"tick"`
}

type DeathEventMsg struct {
	EntityID string `msgpack:"eid"`
	KillerID string `msgpack:"kid"`
	Tick     int    `msgpack:"tick"`
}

type GoldUpdate struct {
	PlayerID   string  `msgpack:"pid"`
	Gold       float64 `msgpack:"gold"`
	GoldChange float64 `msgpack:"dgold"`
	Reason     string  `msgpack:"reason"`
}

type XPUpdate struct {
	PlayerID string  `msgpack:"pid"`
	XP       float64 `msgpack:"xp"`
	Level    int     `msgpack:"level"`
}

type GameOver struct {
	WinnerTeam string `msgpack:"winner"`
}

// LobbyPlayer describes one player in the lobby.
type LobbyPlayer struct {
	ClientID string `msgpack:"cid"`
	Name     string `msgpack:"name"`
	HeroKey  string `msgpack:"hero"`
	Team     string `msgpack:"team"`
	Ready    bool   `msgpack:"ready"`
}

type LobbyState struct {
	Players  []LobbyPlayer `msgpack:"players"`
	GameID   string        `msgpack:"gid"`
	Started  bool          `msgpack:"started"`
}
