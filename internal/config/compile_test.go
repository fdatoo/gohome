package config

import (
	"strings"
	"testing"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
)

type fakeQuerier struct {
	knownDrivers map[string]bool
}

func (f *fakeQuerier) DriverExists(name string) bool {
	return f.knownDrivers[name]
}

func TestCompile_DuplicateDriverInstanceID(t *testing.T) {
	snap := &configpb.ConfigSnapshot{
		DriverInstances: []*configpb.DriverInstanceConfig{
			{Id: "hue-main", DriverName: "hue"},
			{Id: "hue-main", DriverName: "hue"},
		},
	}
	errs := Compile(snap, &fakeQuerier{knownDrivers: map[string]bool{"hue": true}})
	if len(errs) == 0 {
		t.Fatal("expected duplicate ID error, got none")
	}
}

func TestCompile_UnknownDriver(t *testing.T) {
	snap := &configpb.ConfigSnapshot{
		DriverInstances: []*configpb.DriverInstanceConfig{
			{Id: "hue-main", DriverName: "nonexistent"},
		},
	}
	errs := Compile(snap, &fakeQuerier{knownDrivers: map[string]bool{}})
	if len(errs) == 0 {
		t.Fatal("expected unknown driver error, got none")
	}
}

func TestCompile_InvalidEntityID(t *testing.T) {
	snap := &configpb.ConfigSnapshot{
		Entities: []*configpb.EntityConfig{
			{Id: "invalid_no_dot", FriendlyName: "Bad"},
		},
	}
	errs := Compile(snap, &fakeQuerier{})
	if len(errs) == 0 {
		t.Fatal("expected entity ID error, got none")
	}
}

func TestCompile_Valid(t *testing.T) {
	snap := &configpb.ConfigSnapshot{
		DriverInstances: []*configpb.DriverInstanceConfig{
			{Id: "hue-main", DriverName: "hue"},
		},
		Entities: []*configpb.EntityConfig{
			{Id: "light.living_room", FriendlyName: "Living Room"},
		},
	}
	errs := Compile(snap, &fakeQuerier{knownDrivers: map[string]bool{"hue": true}})
	if len(errs) != 0 {
		t.Fatalf("expected no errors, got: %v", errs)
	}
}

func TestCompile_SceneDanglingAreaRef(t *testing.T) {
	snap := &configpb.ConfigSnapshot{
		Areas: []*configpb.AreaConfig{{Id: "kitchen"}},
		Scenes: []*configpb.SceneConfig{
			{Id: "good", AreaId: "kitchen"},
			{Id: "bad", AreaId: "ghost-room"},
			{Id: "global"},
		},
	}
	errs := Compile(snap, nil)
	gotDangling := 0
	for _, e := range errs {
		if e.Code == "dangling_area_ref" {
			gotDangling++
			if !strings.Contains(e.Message, "ghost-room") {
				t.Errorf("message should mention ghost-room: %s", e.Message)
			}
		}
	}
	if gotDangling != 1 {
		t.Errorf("want 1 dangling_area_ref error, got %d (all errs: %+v)", gotDangling, errs)
	}
}
