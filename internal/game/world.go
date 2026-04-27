// Package game implements the authoritative server-side ECS for Dota 2 Toons.
package game

import "sync"

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

// EntityID is a unique string identifier for each entity.
type EntityID = string

// Entity holds a map of components keyed by their component type ID.
type Entity struct {
	ID         EntityID
	Components map[string]any
	Active     bool
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

// System is executed every tick.
type System interface {
	Name() string
	Update(dt float64, w *World)
}

// World is the authoritative ECS world running on the server.
type World struct {
	mu       sync.RWMutex
	entities map[EntityID]*Entity
	systems  []System
	counter  int
	Tick     int
}

// NewWorld creates an empty world.
func NewWorld() *World {
	return &World{
		entities: make(map[EntityID]*Entity),
	}
}

// CreateEntity allocates a new entity and returns it.
func (w *World) CreateEntity() *Entity {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.counter++
	id := EntityID(w.generateID())
	e := &Entity{ID: id, Components: make(map[string]any), Active: true}
	w.entities[id] = e
	return e
}

func (w *World) generateID() string {
	// Simple incrementing ID — good enough for server authority
	return "entity_" + itoa(w.counter)
}

// DestroyEntity marks an entity as inactive.
func (w *World) DestroyEntity(id EntityID) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if e, ok := w.entities[id]; ok {
		e.Active = false
	}
}

// GetEntity returns the entity or nil.
func (w *World) GetEntity(id EntityID) *Entity {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.entities[id]
}

// Entities returns a snapshot of all active entities (safe to iterate).
func (w *World) Entities() []*Entity {
	w.mu.RLock()
	defer w.mu.RUnlock()
	out := make([]*Entity, 0, len(w.entities))
	for _, e := range w.entities {
		if e.Active {
			out = append(out, e)
		}
	}
	return out
}

// AddComponent stores a component on an entity.
func (w *World) AddComponent(id EntityID, componentID string, value any) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if e, ok := w.entities[id]; ok {
		e.Components[componentID] = value
	}
}

// RemoveComponent deletes a component from an entity.
func (w *World) RemoveComponent(id EntityID, componentID string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if e, ok := w.entities[id]; ok {
		delete(e.Components, componentID)
	}
}

// HasComponent returns true if the entity has the given component.
func (w *World) HasComponent(id EntityID, componentID string) bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	if e, ok := w.entities[id]; ok {
		_, has := e.Components[componentID]
		return has
	}
	return false
}

// GetComponent returns the raw component value or nil.
func (w *World) GetComponent(id EntityID, componentID string) any {
	w.mu.RLock()
	defer w.mu.RUnlock()
	if e, ok := w.entities[id]; ok {
		return e.Components[componentID]
	}
	return nil
}

// RegisterSystem adds a system to the execution list.
func (w *World) RegisterSystem(s System) {
	w.systems = append(w.systems, s)
}

// Update runs all registered systems with the given delta time (seconds).
func (w *World) Update(dt float64) {
	w.Tick++
	for _, s := range w.systems {
		s.Update(dt, w)
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := [20]byte{}
	pos := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		pos--
		buf[pos] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		pos--
		buf[pos] = '-'
	}
	return string(buf[pos:])
}
