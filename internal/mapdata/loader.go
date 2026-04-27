// Package mapdata loads and parses the Dota 2 map JSON files.
package mapdata

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Team represents a game team.
type Team string

const (
	TeamRadiant Team = "radiant"
	TeamDire    Team = "dire"
	TeamNeutral Team = "neutral"
)

// teamFromID converts leamare's team integer to our Team type.
// 2 = good guys (Radiant), 3 = bad guys (Dire)
func teamFromID(id int) Team {
	switch id {
	case 2:
		return TeamRadiant
	case 3:
		return TeamDire
	default:
		return TeamNeutral
	}
}

// Building represents a structure on the map (tower, barracks, ancient, fountain).
type Building struct {
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Z    float64 `json:"z"`
	Team Team    `json:"team"`
}

// Tree represents a destructible tree.
type Tree struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

// GridCell represents a walkable navigation grid cell.
type GridCell struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// LanePath is a list of waypoints for a lane path.
type LanePath struct {
	Name   string      `json:"name"`
	Points [][2]float64 `json:"points"`
}

// MapData holds all parsed map information.
type MapData struct {
	Buildings []Building  `json:"buildings"`
	Trees     []Tree      `json:"trees"`
	GridNav   []GridCell  `json:"gridNav"`
	Elevation [][]int     `json:"elevation"`
	Lanes     []LanePath  `json:"lanes"`
}

// -------------------------------------------------------------------
// Raw JSON structures from leamare/dota-map-coordinates
// -------------------------------------------------------------------

type rawEntityJSON struct {
	Name *string `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Z    float64 `json:"z"`
	Team int     `json:"team"`
}

type rawMapDataJSON struct {
	Data map[string][]rawEntityJSON `json:"data"`
}

type rawGridNavJSON struct {
	Data []GridCell `json:"data"`
}

type rawElevationJSON struct {
	Data [][]int `json:"data"`
}

type rawLaneFeature struct {
	Properties struct {
		Name string `json:"name"`
	} `json:"properties"`
	Geometry struct {
		Coordinates [][2]float64 `json:"coordinates"`
	} `json:"geometry"`
}

type rawLaneDataJSON struct {
	Type     string           `json:"type"`
	Features []rawLaneFeature `json:"features"`
}

// Building category keys from leamare mapdata
var buildingCategories = map[string]bool{
	"npc_dota_tower":    true,
	"npc_dota_barracks": true,
	"npc_dota_fort":     true,
	"ent_dota_fountain": true,
	"ent_dota_shop":     true,
}

const treeCategoryKey = "ent_dota_tree"

// -------------------------------------------------------------------
// Load
// -------------------------------------------------------------------

// Load reads all map data files from the given directory and returns a
// populated MapData. Returns an error if any file is missing or malformed.
func Load(dir string) (*MapData, error) {
	result := &MapData{}

	// mapdata.json
	if err := loadMapEntities(filepath.Join(dir, "mapdata.json"), result); err != nil {
		return nil, fmt.Errorf("mapdata.json: %w", err)
	}

	// gridnavdata.json
	if err := loadGridNav(filepath.Join(dir, "gridnavdata.json"), result); err != nil {
		return nil, fmt.Errorf("gridnavdata.json: %w", err)
	}

	// elevationdata.json
	if err := loadElevation(filepath.Join(dir, "elevationdata.json"), result); err != nil {
		return nil, fmt.Errorf("elevationdata.json: %w", err)
	}

	// lanedata.json
	if err := loadLanes(filepath.Join(dir, "lanedata.json"), result); err != nil {
		return nil, fmt.Errorf("lanedata.json: %w", err)
	}

	return result, nil
}

func loadJSON(path string, v any) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewDecoder(f).Decode(v)
}

func loadMapEntities(path string, result *MapData) error {
	var raw rawMapDataJSON
	if err := loadJSON(path, &raw); err != nil {
		return err
	}

	for category, entities := range raw.Data {
		for _, e := range entities {
			if e.X == 0 && e.Y == 0 {
				continue // skip entities without coordinates
			}
			name := category
			if e.Name != nil && *e.Name != "" {
				name = *e.Name
			}

			if category == treeCategoryKey {
				result.Trees = append(result.Trees, Tree{X: e.X, Y: e.Y, Z: e.Z})
			} else if buildingCategories[category] {
				result.Buildings = append(result.Buildings, Building{
					Name: name,
					X:    e.X,
					Y:    e.Y,
					Z:    e.Z,
					Team: teamFromID(e.Team),
				})
			}
		}
	}
	return nil
}

func loadGridNav(path string, result *MapData) error {
	var raw rawGridNavJSON
	if err := loadJSON(path, &raw); err != nil {
		return err
	}
	result.GridNav = raw.Data
	return nil
}

func loadElevation(path string, result *MapData) error {
	var raw rawElevationJSON
	if err := loadJSON(path, &raw); err != nil {
		return err
	}
	result.Elevation = raw.Data
	return nil
}

func loadLanes(path string, result *MapData) error {
	var raw rawLaneDataJSON
	if err := loadJSON(path, &raw); err != nil {
		return err
	}
	for _, feature := range raw.Features {
		result.Lanes = append(result.Lanes, LanePath{
			Name:   feature.Properties.Name,
			Points: feature.Geometry.Coordinates,
		})
	}
	return nil
}

// -------------------------------------------------------------------
// Grid helpers
// -------------------------------------------------------------------

const (
	GridCellSize = 64
	MapOffset    = -10464
)

// IsWalkable returns true if the world position (x, y) is in the walkable grid.
func (m *MapData) IsWalkable(x, y float64) bool {
	col := int((x - MapOffset) / GridCellSize)
	row := int((y - MapOffset) / GridCellSize)
	if row < 0 || row >= len(m.Elevation) {
		return false
	}
	if col < 0 || col >= len(m.Elevation[row]) {
		return false
	}
	return m.Elevation[row][col] >= 0
}

// ElevationAt returns the elevation value (0-26) at a world position.
func (m *MapData) ElevationAt(x, y float64) int {
	col := int((x - MapOffset) / GridCellSize)
	row := int((y - MapOffset) / GridCellSize)
	if row < 0 || row >= len(m.Elevation) {
		return 0
	}
	if col < 0 || col >= len(m.Elevation[row]) {
		return 0
	}
	v := m.Elevation[row][col]
	if v < 0 {
		return 0
	}
	return v
}
