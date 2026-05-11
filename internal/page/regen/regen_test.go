package regen_test

import (
	"strings"
	"testing"

	"github.com/fdatoo/switchyard/internal/page"
	"github.com/fdatoo/switchyard/internal/page/regen"
)

func TestRender_EmptyPage(t *testing.T) {
	p := &page.PageData{
		Slug:  "empty",
		Title: "Empty",
	}
	out, err := regen.Render(p)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	s := string(out)
	if !strings.Contains(s, "sections") {
		t.Error("missing sections declaration")
	}
	if !strings.Contains(s, `import "switchyard:pages"`) {
		t.Error("missing pages import")
	}
}

func TestRender_HeroSection(t *testing.T) {
	p := &page.PageData{
		Slug: "test",
		Sections: []page.SectionData{
			{
				ID:   "hero-1",
				Type: "Hero",
				Props: map[string]any{
					"title":    "Energy & Climate",
					"subtitle": "Live readings",
				},
			},
		},
	}
	out, err := regen.Render(p)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	s := string(out)
	if !strings.Contains(s, `id = "hero-1"`) {
		t.Errorf("missing section id in output: %s", s)
	}
	if !strings.Contains(s, "p.HeroSection") {
		t.Error("missing HeroSection class in output")
	}
	if !strings.Contains(s, `title = "Energy & Climate"`) {
		t.Error("missing title prop in output")
	}
}

func TestRender_Deterministic(t *testing.T) {
	p := &page.PageData{
		Slug: "determ",
		Sections: []page.SectionData{
			{ID: "b", Type: "Chart", Props: map[string]any{"window": "24h"}},
			{ID: "a", Type: "Hero", Props: map[string]any{"title": "test"}},
		},
	}
	first, _ := regen.Render(p)
	for i := 0; i < 5; i++ {
		out, _ := regen.Render(p)
		if string(out) != string(first) {
			t.Fatalf("non-deterministic on iteration %d", i)
		}
	}
}

func TestRender_SectionWithTilesAndCells(t *testing.T) {
	p := &page.PageData{
		Slug: "full",
		Sections: []page.SectionData{
			{
				ID:   "room-grid-1",
				Type: "RoomGrid",
				Tiles: []page.TileData{
					{ID: "tile-a", Type: "RoomTile", Props: map[string]any{"label": "Living Room"}},
				},
			},
			{
				ID:   "entity-list-1",
				Type: "EntityList",
				Cells: []page.CellData{
					{ID: "cell-a", Type: "EntityRow", Props: map[string]any{"entityId": "sensor.temp"}},
				},
			},
		},
	}
	out, err := regen.Render(p)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	s := string(out)
	if !strings.Contains(s, "p.RoomGridSection") {
		t.Error("missing RoomGridSection")
	}
	if !strings.Contains(s, "p.RoomTileTile") {
		t.Error("missing RoomTileTile")
	}
	if !strings.Contains(s, "p.EntityListSection") {
		t.Error("missing EntityListSection")
	}
	if !strings.Contains(s, "p.EntityRowCell") {
		t.Error("missing EntityRowCell")
	}
}
