package registry_test

import (
	"context"
	"testing"

	"github.com/fdatoo/switchyard/internal/registry"
	"github.com/fdatoo/switchyard/internal/testutil"
)

func TestRegistry_AreasInMemory(t *testing.T) {
	ctx := context.Background()
	db := testutil.NewTestDB(t)
	reg, err := registry.New(ctx, db)
	if err != nil {
		t.Fatal(err)
	}

	reg.SetAreas([]registry.Area{
		{ID: "kitchen", DisplayName: "Kitchen"},
		{ID: "", DisplayName: "ignored"},
		{ID: "bedroom", DisplayName: "Bedroom", ParentID: "upstairs"},
	})

	areas := reg.ListAreasInMemory()
	if len(areas) != 2 {
		t.Fatalf("ListAreasInMemory len = %d, want 2", len(areas))
	}
	if areas[0].ID != "bedroom" || areas[1].ID != "kitchen" {
		t.Fatalf("areas not sorted by ID: %+v", areas)
	}

	got, ok := reg.GetAreaInMemory("bedroom")
	if !ok {
		t.Fatal("GetAreaInMemory(bedroom) ok = false")
	}
	if got.DisplayName != "Bedroom" || got.ParentID != "upstairs" {
		t.Fatalf("GetAreaInMemory(bedroom) = %+v", got)
	}

	if _, ok := reg.GetAreaInMemory("missing"); ok {
		t.Fatal("GetAreaInMemory(missing) ok = true")
	}
}

func TestRegistry_EntityAreasInMemory(t *testing.T) {
	ctx := context.Background()
	db := testutil.NewTestDB(t)
	reg, err := registry.New(ctx, db)
	if err != nil {
		t.Fatal(err)
	}

	assignments := map[string]string{"light.kitchen": "kitchen"}
	reg.SetEntityAreas(assignments)
	assignments["light.kitchen"] = "mutated"

	if got := reg.AreaForEntity("light.kitchen"); got != "kitchen" {
		t.Fatalf("AreaForEntity(light.kitchen) = %q, want kitchen", got)
	}
	if got := reg.AreaForEntity("light.bedroom"); got != "" {
		t.Fatalf("AreaForEntity(light.bedroom) = %q, want empty", got)
	}

	reg.SetEntityAreas(nil)
	if got := reg.AreaForEntity("light.kitchen"); got != "" {
		t.Fatalf("AreaForEntity after reset = %q, want empty", got)
	}
}
