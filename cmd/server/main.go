package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/vmihailenco/msgpack/v5"

	"dota2toons/internal/game"
	"dota2toons/internal/mapdata"
	"dota2toons/internal/network"
)

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin:     func(_ *http.Request) bool { return true },
	}
	mapDataGlobal *mapdata.MapData
	roomsMu       sync.RWMutex
	rooms         = make(map[string]*Room)
)

// ---------------------------------------------------------------------------
// Room — one game instance + its connected sessions
// ---------------------------------------------------------------------------

type Room struct {
	mu       sync.RWMutex
	ID       string
	Game     *game.GameInstance
	Sessions map[string]*network.Session // clientID → session

	// Lobby state before game starts
	Lobby   []network.LobbyPlayer
	Started bool

	destroyedIDs []string // entities destroyed since last snapshot tick

	// Persistent identity: clientID → hero entity ID.
	// Survives disconnect/reconnect within the same room.
	heroByClient map[string]string

	// Team balancing counters
	radiantCount int
	direCount    int
}

func newRoom(id string, md *mapdata.MapData) *Room {
	return &Room{
		ID:           id,
		Game:         game.NewGameInstance(md),
		Sessions:     make(map[string]*network.Session),
		heroByClient: make(map[string]string),
	}
}

func (r *Room) addSession(s *network.Session) {
	r.mu.Lock()
	r.Sessions[s.ClientID] = s
	r.mu.Unlock()
}

func (r *Room) removeSession(clientID string) {
	r.mu.Lock()
	delete(r.Sessions, clientID)
	r.mu.Unlock()
}

func (r *Room) broadcast(data []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, s := range r.Sessions {
		s.Write(data)
	}
}

// broadcastSnapshots sends delta snapshots to all clients at 30 Hz.
// Each client receives only entities visible to their team (vision filtering).
// Uses per-session SnapshotCache for true delta compression.
func (r *Room) broadcastSnapshots() {
	ticker := time.NewTicker(time.Second / 30)
	defer ticker.Stop()
	for range ticker.C {
		r.mu.RLock()
		if len(r.Sessions) == 0 {
			r.mu.RUnlock()
			continue
		}
		sessions := make([]*network.Session, 0, len(r.Sessions))
		for _, s := range r.Sessions {
			sessions = append(sessions, s)
		}
		r.mu.RUnlock()

		r.mu.Lock()
		destroyed := r.destroyedIDs
		r.destroyedIDs = nil
		r.mu.Unlock()

		for _, sess := range sessions {
			team := sess.Team
			if team == "" { team = "radiant" }
			data, err := network.BuildDeltaSnapshotCached(
				r.Game.World(), r.Game.World().Tick,
				destroyed, team, sess.SnapCache,
			)
			if err == nil {
				sess.Write(data)
			}
		}
	}
}

// ---------------------------------------------------------------------------
// WebSocket handler
// ---------------------------------------------------------------------------

func handleWebSocket(w http.ResponseWriter, req *http.Request) {
	conn, err := upgrader.Upgrade(w, req, nil)
	if err != nil {
		log.Printf("WS upgrade error: %v", err)
		return
	}

	clientID := req.URL.Query().Get("clientId")
	if clientID == "" {
		clientID = uuid.New().String()
	}
	roomID := req.URL.Query().Get("room")

	// Get or create room
	roomsMu.Lock()
	room, ok := rooms[roomID]
	if !ok {
		room = newRoom(roomID, mapDataGlobal)
		rooms[roomID] = room
		room.Game.Start()
		go room.broadcastSnapshots()
		log.Printf("Room %s created", roomID)
	}
	roomsMu.Unlock()

	sess := network.NewSession(clientID, conn)
	room.addSession(sess)
	log.Printf("Client %s joined room %s", clientID, roomID)

	// Send full snapshot immediately (also covers reconnects — cache is fresh per NewSession)
	if data, err := network.BuildFullSnapshot(room.Game.World(), room.Game.World().Tick); err == nil {
		sess.Write(data)
	}

	go sess.WritePump()
	readPump(sess, room)

	// Client disconnected — path their hero back to spawn
	room.removeSession(clientID)
	log.Printf("Client %s left room %s", clientID, roomID)
	if sess.HeroEntityID != "" {
		room.Game.ReturnToSpawn(sess.HeroEntityID)
		log.Printf("Hero %s returning to spawn (client %s disconnected)", sess.HeroEntityID, clientID)
	}
}

// readPump reads client messages and routes them.
// Sends a WebSocket ping every 10 s; if no pong within 15 s the connection
// is considered dead and the read loop exits (triggering ReturnToSpawn).
func readPump(sess *network.Session, room *Room) {
	const (
		pingInterval = 10 * time.Second
		pongTimeout  = 15 * time.Second
	)

	conn := sess.Conn
	conn.SetReadDeadline(time.Now().Add(pongTimeout))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongTimeout))
		return nil
	})

	pingTicker := time.NewTicker(pingInterval)
	defer pingTicker.Stop()
	defer conn.Close()

	// Run pings in a separate goroutine
	go func() {
		for range pingTicker.C {
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Read error from %s: %v", sess.ClientID, err)
			}
			break
		}

		var env network.Envelope
		if err := msgpack.Unmarshal(raw, &env); err != nil {
			log.Printf("Bad envelope from %s: %v", sess.ClientID, err)
			continue
		}

		handleMessage(sess, room, env)
	}
}

func handleMessage(sess *network.Session, room *Room, env network.Envelope) {
	switch env.Type {
	case network.MsgJoinGame:
		var cmd network.JoinGameCommand
		if err := network.Decode(env.Data, &cmd); err != nil { return }
		if cmd.ClientID != "" { sess.ClientID = cmd.ClientID }
		// Send lobby state
		lsData, _ := network.EncodeEnvelope(network.MsgLobbyState, &network.LobbyState{
			GameID:  room.ID,
			Players: room.Lobby,
		})
		sess.Write(lsData)

	case network.MsgPickHero:
		var cmd network.PickHeroCommand
		if err := network.Decode(env.Data, &cmd); err != nil { return }
		sess.HeroKey = cmd.HeroKey

		room.mu.Lock()
		existingHeroID, alreadySpawned := room.heroByClient[sess.ClientID]
		room.mu.Unlock()

		if alreadySpawned {
			// Reconnect: reuse the existing hero entity
			sess.HeroEntityID = existingHeroID
			// Restore team from the hero's ECS component
			if t := game.GetTeamFromWorld(room.Game.World(), existingHeroID); t != "" {
				sess.Team = t
			}
			log.Printf("Client %s reconnected to existing hero %s", sess.ClientID, existingHeroID)
		} else {
			// First join: assign team and spawn hero
			if sess.Team == "" {
				room.mu.Lock()
				if room.radiantCount <= room.direCount {
					sess.Team = "radiant"
					room.radiantCount++
				} else {
					sess.Team = "dire"
					room.direCount++
				}
				room.mu.Unlock()
			}

			var spawnX, spawnY float64
			if sess.Team == "dire" {
				spawnX, spawnY = direSpawn(0)
			} else {
				spawnX, spawnY = radiantSpawn(0)
			}
			heroID := room.Game.SpawnHero(cmd.HeroKey, sess.Team, sess.ClientID, spawnX, spawnY)
			sess.HeroEntityID = heroID

			room.mu.Lock()
			room.heroByClient[sess.ClientID] = heroID
			room.mu.Unlock()
			log.Printf("Client %s spawned new hero %s as %s", sess.ClientID, heroID, sess.Team)
		}

		// Reset snapshot cache and send full snapshot
		sess.SnapCache = network.NewSnapshotCache()
		if data, err := network.BuildFullSnapshot(room.Game.World(), room.Game.World().Tick); err == nil {
			sess.Write(data)
		}

	case network.MsgMoveCommand:
		var cmd network.MoveCommand
		if err := network.Decode(env.Data, &cmd); err != nil { return }
		room.Game.QueueInput(game.InputCommand{
			Type: "move", Seq: cmd.Seq,
			TargetX: cmd.TargetX, TargetY: cmd.TargetY,
			ClientID: sess.ClientID, HeroEntityID: sess.HeroEntityID,
		})

	case network.MsgAttackCommand:
		var cmd network.AttackCommand
		if err := network.Decode(env.Data, &cmd); err != nil { return }
		room.Game.QueueInput(game.InputCommand{
			Type: "attack", Seq: cmd.Seq,
			TargetEntityID: cmd.TargetEntityID,
			ClientID: sess.ClientID, HeroEntityID: sess.HeroEntityID,
		})

	case network.MsgStopCommand:
		var cmd network.StopCommand
		if err := network.Decode(env.Data, &cmd); err != nil { return }
		room.Game.QueueInput(game.InputCommand{
			Type: "stop", Seq: cmd.Seq,
			ClientID: sess.ClientID, HeroEntityID: sess.HeroEntityID,
		})

	default:
		log.Printf("Unknown msg type %q from %s", env.Type, sess.ClientID)
	}
}

// Spawn positions near respective fountains.
func radiantSpawn(_ int) (float64, float64) { return -7328, -6810 }
func direSpawn(_ int) (float64, float64)    { return 7152, 6720 }

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

func main() {
	log.Println("Loading map data...")
	md, err := mapdata.Load("mapdata/data")
	if err != nil {
		log.Fatalf("Failed to load map data: %v", err)
	}
	mapDataGlobal = md
	log.Printf("Map loaded: %d buildings, %d trees, %d walkable cells, %d lanes",
		len(md.Buildings), len(md.Trees), len(md.GridNav), len(md.Lanes))

	// WebSocket game endpoint
	http.HandleFunc("/ws", handleWebSocket)

	// Map data REST endpoints (JSON)
	http.HandleFunc("/api/mapdata/mapdata.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"buildings": md.Buildings, "trees": md.Trees,
		})
	})
	http.HandleFunc("/api/mapdata/gridnavdata.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": md.GridNav})
	})
	http.HandleFunc("/api/mapdata/elevationdata.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": md.Elevation})
	})
	http.HandleFunc("/api/mapdata/lanedata.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		_ = json.NewEncoder(w).Encode(map[string]any{"lanes": md.Lanes})
	})
	http.Handle("/api/mapdata/raw/", http.StripPrefix("/api/mapdata/raw/", http.FileServer(http.Dir("mapdata/data"))))

	log.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("ListenAndServe: %v", err)
	}
}
