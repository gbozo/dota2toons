package network

import (
	"sync"

	"github.com/gorilla/websocket"
)

// Session tracks the state of one connected client.
type Session struct {
	mu sync.Mutex

	ClientID     string
	HeroEntityID string
	Team         string
	HeroKey      string
	Conn         *websocket.Conn
	Send         chan []byte

	// Last tick the client ACK'd — used for delta compression
	LastACKTick int
	// Sequence number of the last received input command
	LastSeq int
}

// NewSession creates a session for an incoming WebSocket connection.
func NewSession(clientID string, conn *websocket.Conn) *Session {
	return &Session{
		ClientID: clientID,
		Conn:     conn,
		Send:     make(chan []byte, 256),
	}
}

// Write queues a message for sending (non-blocking, drops on full).
func (s *Session) Write(data []byte) {
	select {
	case s.Send <- data:
	default:
	}
}

// WritePump reads from Send and writes to the WebSocket.
func (s *Session) WritePump() {
	defer s.Conn.Close()
	for msg := range s.Send {
		if err := s.Conn.WriteMessage(websocket.BinaryMessage, msg); err != nil {
			return
		}
	}
}

// Close shuts down the session.
func (s *Session) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	close(s.Send)
}
