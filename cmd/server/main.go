package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"dota2toons/internal/mapdata"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow connections from the Vite dev server and any origin in development.
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// Client represents a single connected WebSocket client.
type Client struct {
	ID   string
	Conn *websocket.Conn
	Send chan []byte
}

// Hub manages all connected clients.
type Hub struct {
	Clients    map[string]*Client
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
}

func newHub() *Hub {
	return &Hub{
		Clients:    make(map[string]*Client),
		Broadcast:  make(chan []byte),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.Register:
			h.Clients[client.ID] = client
			log.Printf("Client connected: %s (total: %d)", client.ID, len(h.Clients))
		case client := <-h.Unregister:
			if _, ok := h.Clients[client.ID]; ok {
				delete(h.Clients, client.ID)
				close(client.Send)
				log.Printf("Client disconnected: %s (total: %d)", client.ID, len(h.Clients))
			}
		case message := <-h.Broadcast:
			for _, client := range h.Clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.Clients, client.ID)
				}
			}
		}
	}
}

func (h *Hub) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Upgrade error: %v", err)
		return
	}

	// Use UUID for stable client identity.
	clientID := r.URL.Query().Get("clientId")
	if clientID == "" {
		clientID = uuid.New().String()
	}

	client := &Client{
		ID:   clientID,
		Conn: conn,
		Send: make(chan []byte, 256),
	}

	h.Register <- client

	go client.writePump()
	go client.readPump(h)
}

func (c *Client) readPump(h *Hub) {
	defer func() {
		h.Unregister <- c
		c.Conn.Close()
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Read error from %s: %v", c.ID, err)
			}
			break
		}
		log.Printf("Message from %s: %d bytes", c.ID, len(message))
		h.Broadcast <- message
	}
}

func (c *Client) writePump() {
	defer c.Conn.Close()

	for {
		message, ok := <-c.Send
		if !ok {
			c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
			return
		}

		w, err := c.Conn.NextWriter(websocket.BinaryMessage)
		if err != nil {
			return
		}
		w.Write(message)

		if err := w.Close(); err != nil {
			return
		}
	}
}

// jsonHandler wraps a value as a JSON HTTP response.
func jsonHandler(v any) http.HandlerFunc {
	data, err := json.Marshal(v)
	if err != nil {
		panic("json marshal failed: " + err.Error())
	}
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write(data)
	}
}

func main() {
	// Load map data at startup
	log.Println("Loading map data...")
	mapData, err := mapdata.Load("mapdata/data")
	if err != nil {
		log.Fatalf("Failed to load map data: %v", err)
	}
	log.Printf(
		"Map loaded: %d buildings, %d trees, %d walkable cells, %d lane paths",
		len(mapData.Buildings), len(mapData.Trees), len(mapData.GridNav), len(mapData.Lanes),
	)

	hub := newHub()
	go hub.run()

	// WebSocket endpoint
	http.HandleFunc("/ws", hub.handleWebSocket)

	// Map data API endpoints (pre-serialized for fast serving)
	http.HandleFunc("/api/mapdata/mapdata.json", jsonHandler(map[string]any{
		"buildings": mapData.Buildings,
		"trees":     mapData.Trees,
	}))
	http.HandleFunc("/api/mapdata/gridnavdata.json", jsonHandler(map[string]any{
		"data": mapData.GridNav,
	}))
	http.HandleFunc("/api/mapdata/elevationdata.json", jsonHandler(map[string]any{
		"data": mapData.Elevation,
	}))
	http.HandleFunc("/api/mapdata/lanedata.json", jsonHandler(map[string]any{
		"lanes": mapData.Lanes,
	}))

	// Also serve raw files as fallback
	http.Handle("/api/mapdata/raw/", http.StripPrefix("/api/mapdata/raw/", http.FileServer(http.Dir("mapdata/data"))))

	log.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("ListenAndServe: %v", err)
	}
}
