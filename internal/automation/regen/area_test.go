package regen_test

import (
	"strings"
	"testing"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	"github.com/fdatoo/switchyard/internal/automation/regen"
)

func TestRenderArea_BasicFields(t *testing.T) {
	out, err := regen.RenderArea(&configpb.AreaConfig{
		Id:          "bedroom",
		DisplayName: "Bedroom",
	})
	if err != nil {
		t.Fatalf("RenderArea: %v", err)
	}
	s := string(out)
	for _, want := range []string{
		`import "switchyard:areas" as ar`,
		`new ar.Area {`,
		`id = "bedroom"`,
		`displayName = "Bedroom"`,
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("output missing %q\n----\n%s\n----", want, s)
		}
	}
}

func TestRenderArea_ParentId(t *testing.T) {
	out, err := regen.RenderArea(&configpb.AreaConfig{
		Id:          "kitchenette",
		DisplayName: "Kitchenette",
		ParentId:    "kitchen",
	})
	if err != nil {
		t.Fatalf("RenderArea: %v", err)
	}
	if !strings.Contains(string(out), `parentId = "kitchen"`) {
		t.Fatalf("output missing parentId line\n%s", out)
	}
}

func TestRenderArea_NoParentIdLineWhenAbsent(t *testing.T) {
	out, err := regen.RenderArea(&configpb.AreaConfig{
		Id:          "office",
		DisplayName: "Office",
	})
	if err != nil {
		t.Fatalf("RenderArea: %v", err)
	}
	if strings.Contains(string(out), `parentId`) {
		t.Fatalf("output unexpectedly contains parentId\n%s", out)
	}
}
