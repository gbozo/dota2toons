package mapdata_test

import (
	"testing"

	"dota2toons/internal/mapdata"
)

func TestLoad(t *testing.T) {
	m, err := mapdata.Load("../../mapdata/data")
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if len(m.Buildings) == 0 {
		t.Error("expected buildings, got none")
	}
	if len(m.Trees) == 0 {
		t.Error("expected trees, got none")
	}
	if len(m.GridNav) == 0 {
		t.Error("expected grid nav cells, got none")
	}
	if len(m.Elevation) != 327 {
		t.Errorf("expected 327 elevation rows, got %d", len(m.Elevation))
	}
	if len(m.Lanes) == 0 {
		t.Error("expected lane paths, got none")
	}

	// Spot-check elevation helper
	elev := m.ElevationAt(0, 0)
	if elev < 0 {
		t.Errorf("ElevationAt(0,0) = %d, expected >= 0", elev)
	}
}
