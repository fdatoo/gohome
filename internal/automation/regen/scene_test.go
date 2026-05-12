package regen_test

import (
	"strings"
	"testing"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	"github.com/fdatoo/switchyard/internal/automation/regen"
)

func TestRenderScene_BasicFields(t *testing.T) {
	out, err := regen.RenderScene(&configpb.SceneConfig{
		Id:          "wind-down",
		DisplayName: "Wind down",
	})
	if err != nil {
		t.Fatalf("RenderScene: %v", err)
	}
	s := string(out)
	for _, want := range []string{
		`import "switchyard:scenes" as sc`,
		`import "switchyard:automations" as auto`,
		`new sc.Scene {`,
		`id = "wind-down"`,
		`displayName = "Wind down"`,
		`actions {`,
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("output missing %q\n----\n%s\n----", want, s)
		}
	}
}

func TestRenderScene_WithCallServiceAction(t *testing.T) {
	out, err := regen.RenderScene(&configpb.SceneConfig{
		Id:          "tv-mode",
		DisplayName: "TV mode",
		Actions: []*configpb.ActionConfig{
			{Kind: &configpb.ActionConfig_CallService{
				CallService: &configpb.CallServiceAction{
					Entity:     "light.tv",
					Capability: "set_brightness",
					Args:       map[string]string{"value": "60"},
				},
			}},
		},
	})
	if err != nil {
		t.Fatalf("RenderScene: %v", err)
	}
	s := string(out)
	for _, want := range []string{
		`new auto.CallServiceAction {`,
		`entity = "light.tv"`,
		`capability = "set_brightness"`,
		`["value"] = "60"`,
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("output missing %q\n----\n%s\n----", want, s)
		}
	}
}
