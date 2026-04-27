package game

import (
	"container/heap"
	"math"

	"dota2toons/internal/mapdata"
)

// ---------------------------------------------------------------------------
// Pathfinder — A* with binary heap, 8-directional, gridnav-inverted
// ---------------------------------------------------------------------------

const (
	gridSize   = 64
	gridOffset = -10464
	gridCols   = 327
	gridRows   = 327
	sqrt2      = math.Sqrt2
)

// Pathfinder holds the walkability grid built from map data.
type Pathfinder struct {
	blocked   map[int]bool // gridnav cells are BLOCKED
	insideMap map[int]bool // cells with elevation >= 0
	mapData   *mapdata.MapData
}

// NewPathfinder builds walkability from map data.
func NewPathfinder(md *mapdata.MapData) *Pathfinder {
	pf := &Pathfinder{
		blocked:   make(map[int]bool),
		insideMap: make(map[int]bool),
		mapData:   md,
	}

	// gridNavData marks BLOCKED cells
	for _, gc := range md.GridNav {
		col := int(math.Round(float64(gc.X-gridOffset) / gridSize))
		row := int(math.Round(float64(gc.Y-gridOffset) / gridSize))
		pf.blocked[row*gridCols+col] = true
	}

	// insideMap = elevation >= 0
	for r, row := range md.Elevation {
		for c, v := range row {
			if v >= 0 {
				pf.insideMap[r*gridCols+c] = true
			}
		}
	}

	// Extra blocked: trees and buildings
	for _, tree := range md.Trees {
		col := int(math.Round(float64(tree.X-gridOffset) / gridSize))
		row := int(math.Round(float64(tree.Y-gridOffset) / gridSize))
		pf.blocked[row*gridCols+col] = true
	}
	for _, b := range md.Buildings {
		radius := 1
		if bName := b.Name; len(bName) > 0 &&
			(contains(bName, "fort") || contains(bName, "ancient")) {
			radius = 2
		}
		cx := int(math.Round(float64(b.X-gridOffset) / gridSize))
		cy := int(math.Round(float64(b.Y-gridOffset) / gridSize))
		for dx := -radius; dx <= radius; dx++ {
			for dy := -radius; dy <= radius; dy++ {
				pf.blocked[(cy+dy)*gridCols+(cx+dx)] = true
			}
		}
	}

	return pf
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && func() bool {
		for i := 0; i <= len(s)-len(sub); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	}()
}

// IsWalkable returns true if the world position (x,y) is passable.
func (pf *Pathfinder) IsWalkable(x, y float64) bool {
	col := int(math.Round(snapGrid(x) / gridSize))
	row := int(math.Round(snapGrid(y) / gridSize))
	key := row*gridCols + col
	return pf.insideMap[key] && !pf.blocked[key]
}

// GetElevation returns the terrain elevation at a world position (0 if outside).
func (pf *Pathfinder) GetElevation(x, y float64) int {
	col := int(math.Round((snapGrid(x) - gridOffset) / gridSize))
	row := int(math.Round((snapGrid(y) - gridOffset) / gridSize))
	if row < 0 || row >= len(pf.mapData.Elevation) { return 0 }
	if col < 0 || col >= len(pf.mapData.Elevation[row]) { return 0 }
	v := pf.mapData.Elevation[row][col]
	if v < 0 { return 0 }
	return v
}

func snapGrid(v float64) float64 {
	return math.Round(v/gridSize) * gridSize
}

func (pf *Pathfinder) walkableAt(col, row int) bool {
	if col < 0 || col >= gridCols || row < 0 || row >= gridRows {
		return false
	}
	key := row*gridCols + col
	return pf.insideMap[key] && !pf.blocked[key]
}

func toGrid(world float64) int {
	return int(math.Round((world - gridOffset) / gridSize))
}

func toWorld(g int) float64 {
	return float64(gridOffset + g*gridSize)
}

// ---------------------------------------------------------------------------
// A* with binary min-heap
// ---------------------------------------------------------------------------

type pfNode struct {
	col, row int
	g, h, f  float64
	parent   *pfNode
	index    int // heap index
}

type pfHeap []*pfNode

func (h pfHeap) Len() int            { return len(h) }
func (h pfHeap) Less(i, j int) bool  { return h[i].f < h[j].f }
func (h pfHeap) Swap(i, j int) {
	h[i], h[j] = h[j], h[i]
	h[i].index = i
	h[j].index = j
}
func (h *pfHeap) Push(x any) {
	n := x.(*pfNode)
	n.index = len(*h)
	*h = append(*h, n)
}
func (h *pfHeap) Pop() any {
	old := *h
	n := old[len(old)-1]
	*h = old[:len(old)-1]
	n.index = -1
	return n
}

// FindPath returns a list of world-space waypoints from (sx,sy) to (ex,ey).
// Returns nil if no path exists.
func (pf *Pathfinder) FindPath(sx, sy, ex, ey float64) []Waypoint {
	sc, sr := toGrid(sx), toGrid(sy)
	ec, er := toGrid(ex), toGrid(ey)

	// Snap target to nearest walkable
	if !pf.walkableAt(ec, er) {
		if nc, nr, ok := pf.nearestWalkable(ec, er); ok {
			ec, er = nc, nr
		} else {
			return nil
		}
	}

	if sc == ec && sr == er {
		return []Waypoint{{sx, sy}}
	}

	type key struct{ c, r int }
	bestG := make(map[key]float64)
	open  := &pfHeap{}
	heap.Init(open)

	start := &pfNode{col: sc, row: sr, g: 0}
	start.h = octileH(sc, sr, ec, er)
	start.f = start.h
	heap.Push(open, start)
	bestG[key{sc, sr}] = 0

	dirs := [8][3]float64{
		{1, 0, gridSize}, {-1, 0, gridSize},
		{0, 1, gridSize}, {0, -1, gridSize},
		{1, 1, gridSize * sqrt2}, {1, -1, gridSize * sqrt2},
		{-1, 1, gridSize * sqrt2}, {-1, -1, gridSize * sqrt2},
	}

	for open.Len() > 0 {
		cur := heap.Pop(open).(*pfNode)
		if cur.col == ec && cur.row == er {
			return pf.smoothPath(pf.reconstruct(cur))
		}

		curKey := key{cur.col, cur.row}
		if g, ok := bestG[curKey]; ok && cur.g > g {
			continue
		}

		for _, d := range dirs {
			dc, dr := int(d[0]), int(d[1])
			nc, nr := cur.col+dc, cur.row+dr
			if !pf.walkableAt(nc, nr) {
				continue
			}
			// Diagonal corner cut check
			if dc != 0 && dr != 0 {
				if !pf.walkableAt(cur.col+dc, cur.row) ||
					!pf.walkableAt(cur.col, cur.row+dr) {
					continue
				}
			}
			ng := cur.g + d[2]
			nk := key{nc, nr}
			if prev, ok := bestG[nk]; ok && prev <= ng {
				continue
			}
			bestG[nk] = ng
			nh := octileH(nc, nr, ec, er)
			heap.Push(open, &pfNode{col: nc, row: nr, g: ng, h: nh, f: ng + nh, parent: cur})
		}
	}
	return nil
}

func octileH(ac, ar, bc, br int) float64 {
	dc := math.Abs(float64(ac - bc))
	dr := math.Abs(float64(ar - br))
	return gridSize * (dc + dr + (sqrt2-2)*math.Min(dc, dr))
}

type crNode struct{ c, r int }

func (pf *Pathfinder) reconstruct(end *pfNode) []crNode {
	var path []crNode
	for n := end; n != nil; n = n.parent {
		path = append([]crNode{{n.col, n.row}}, path...)
	}
	return path
}

// smoothPath applies Bresenham LOS string-pulling.
func (pf *Pathfinder) smoothPath(path []crNode) []Waypoint {
	if len(path) <= 2 {
		out := make([]Waypoint, len(path))
		for i, p := range path {
			out[i] = Waypoint{toWorld(p.c), toWorld(p.r)}
		}
		return out
	}

	smooth := []crNode{path[0]}
	anchor := 0

	for i := 2; i < len(path); i++ {
		if !pf.hasLOS(path[anchor], path[i]) {
			smooth = append(smooth, path[i-1])
			anchor = i - 1
		}
	}
	smooth = append(smooth, path[len(path)-1])

	out := make([]Waypoint, len(smooth))
	for i, p := range smooth {
		out[i] = Waypoint{toWorld(p.c), toWorld(p.r)}
	}
	return out
}

// hasLOS checks line-of-sight with corner-cutting guard.
func (pf *Pathfinder) hasLOS(a, b crNode) bool {
	x0, y0 := a.c, a.r
	x1, y1 := b.c, b.r
	dx, dy := abs(x1-x0), abs(y1-y0)
	sx, sy := sign(x1-x0), sign(y1-y0)
	err := dx - dy
	for {
		if !pf.walkableAt(x0, y0) {
			return false
		}
		if x0 == x1 && y0 == y1 {
			break
		}
		e2 := 2 * err
		if e2 > -dy && e2 < dx {
			if !pf.walkableAt(x0+sx, y0) || !pf.walkableAt(x0, y0+sy) {
				return false
			}
		}
		if e2 > -dy { err -= dy; x0 += sx }
		if e2 < dx  { err += dx; y0 += sy }
	}
	return true
}

// nearestWalkable finds the closest walkable cell via BFS.
func (pf *Pathfinder) nearestWalkable(ec, er int) (int, int, bool) {
	type pt struct{ c, r int }
	visited := map[pt]bool{}
	q := []pt{{ec, er}}
	visited[pt{ec, er}] = true
	for i := 0; i < len(q) && i < 500; i++ {
		p := q[i]
		if pf.walkableAt(p.c, p.r) {
			return p.c, p.r, true
		}
		for _, d := range [][2]int{{1,0},{-1,0},{0,1},{0,-1}} {
			np := pt{p.c + d[0], p.r + d[1]}
			if !visited[np] {
				visited[np] = true
				q = append(q, np)
			}
		}
	}
	return 0, 0, false
}

func abs(x int) int {
	if x < 0 { return -x }
	return x
}

func sign(x int) int {
	if x > 0 { return 1 }
	if x < 0 { return -1 }
	return 0
}
