package network

import (
	"dota2toons/internal/game"

	"github.com/vmihailenco/msgpack/v5"
)

// Encode serializes a value with MessagePack.
func Encode(v any) ([]byte, error) {
	return msgpack.Marshal(v)
}

// Decode deserializes a MessagePack payload.
func Decode(data []byte, v any) error {
	return msgpack.Unmarshal(data, v)
}

// EncodeEnvelope wraps a message payload in an Envelope and serializes it.
func EncodeEnvelope(msgType MsgType, payload any) ([]byte, error) {
	data, err := msgpack.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return msgpack.Marshal(&Envelope{Type: msgType, Data: data})
}

// ---------------------------------------------------------------------------
// Snapshot serialization
// ---------------------------------------------------------------------------

// BuildEntityState converts ECS components to a wire-format EntityState.
func BuildEntityState(w *game.World, id game.EntityID) *EntityState {
	pos  := game.GetPosition(w, id)
	hp   := game.GetHealth(w, id)
	team := game.GetTeam(w, id)
	ut   := game.GetUnitType(w, id)

	if pos == nil || ut == nil {
		return nil
	}

	es := &EntityState{
		ID:       id,
		X:        pos.X,
		Y:        pos.Y,
		Z:        pos.Z,
		Rotation: pos.Rotation,
		UnitType: ut.Type,
		Subtype:  ut.Subtype,
		Dead:     w.HasComponent(id, game.CDead),
	}

	if hp != nil {
		es.HP     = hp.HP
		es.MaxHP  = hp.MaxHP
		es.Mana   = hp.Mana
		es.MaxMana = hp.MaxMana
	}
	if team != nil {
		es.Team = team.Team
	}

	// Include inventory data for heroes
	if ut.Type == "hero" {
		if inv := game.GetInventory(w, id); inv != nil {
			es.Extra = map[string]float64{
				"gold":  inv.Gold,
				"xp":    inv.XP,
				"level": float64(inv.Level),
			}
		}
	}

	return es
}

// BuildFullSnapshot serializes the entire world state.
func BuildFullSnapshot(w *game.World, tick int) ([]byte, error) {
	snap := FullSnapshot{Tick: tick}
	for _, e := range w.Entities() {
		if !e.Active {
			continue
		}
		es := BuildEntityState(w, e.ID)
		if es != nil {
			snap.Entities = append(snap.Entities, *es)
		}
	}
	return EncodeEnvelope(MsgFullSnapshot, snap)
}

// BuildDeltaSnapshot serializes only changes since the base snapshot.
// Filters entities by team vision: only sends entities visible to the specified team.
func BuildDeltaSnapshot(w *game.World, tick, baseTick int, destroyedIDs []string, viewTeam string) ([]byte, error) {
	snap := DeltaSnapshot{
		Tick:     tick,
		BaseTick: baseTick,
		Destroys: destroyedIDs,
	}

	// Collect vision sources for the viewing team
	type visionSource struct {
		x, y, r float64
	}
	var sources []visionSource
	for _, e := range w.Entities() {
		if !e.Active { continue }
		team := game.GetTeam(w, e.ID)
		ut   := game.GetUnitType(w, e.ID)
		pos  := game.GetPosition(w, e.ID)
		if team == nil || ut == nil || pos == nil { continue }
		if team.Team != viewTeam { continue }
		switch ut.Type {
		case "hero":
			sources = append(sources, visionSource{pos.X, pos.Y, 1800})
		case "tower":
			sources = append(sources, visionSource{pos.X, pos.Y, 1800})
		}
	}

	for _, e := range w.Entities() {
		if !e.Active { continue }
		es := BuildEntityState(w, e.ID)
		if es == nil { continue }

		// Always include entities on the same team
		if es.Team == viewTeam {
			snap.Updates = append(snap.Updates, *es)
			continue
		}

		// Check if entity is within vision range of any source
		pos := game.GetPosition(w, e.ID)
		if pos == nil { continue }
		visible := false
		for _, src := range sources {
			dx := pos.X - src.x
			dy := pos.Y - src.y
			if dx*dx+dy*dy <= src.r*src.r {
				visible = true
				break
			}
		}
		if visible {
			snap.Updates = append(snap.Updates, *es)
		}
	}

	return EncodeEnvelope(MsgDeltaSnapshot, snap)
}
