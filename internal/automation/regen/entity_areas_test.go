package regen_test

import (
	"strings"
	"testing"

	"github.com/fdatoo/switchyard/internal/automation/regen"
)

func TestRenderEntityAreas_EmittedSorted(t *testing.T) {
	out, err := regen.RenderEntityAreas(map[string]string{
		"light.b": "kitchen",
		"light.a": "bedroom",
		"light.c": "living_room",
	})
	if err != nil {
		t.Fatalf("RenderEntityAreas: %v", err)
	}
	s := string(out)
	// Sorted by key so output is deterministic.
	idxA := strings.Index(s, `["light.a"]`)
	idxB := strings.Index(s, `["light.b"]`)
	idxC := strings.Index(s, `["light.c"]`)
	if !(idxA >= 0 && idxA < idxB && idxB < idxC) {
		t.Fatalf("entries not sorted by key:\n%s", s)
	}
	for _, want := range []string{
		`entityAreas {`,
		`["light.a"] = "bedroom"`,
		`["light.b"] = "kitchen"`,
		`["light.c"] = "living_room"`,
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("output missing %q\n----\n%s\n----", want, s)
		}
	}
}

func TestRenderEntityAreas_EmptyMap(t *testing.T) {
	out, err := regen.RenderEntityAreas(map[string]string{})
	if err != nil {
		t.Fatalf("RenderEntityAreas: %v", err)
	}
	s := string(out)
	if !strings.Contains(s, `entityAreas {`) || !strings.Contains(s, `}`) {
		t.Fatalf("empty entityAreas block missing\n%s", s)
	}
}
