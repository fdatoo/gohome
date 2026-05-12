package config

import (
	"encoding/json"
	"testing"
)

func TestAutomationFromJSON_BuildsProto(t *testing.T) {
	a := automationJSON{
		ID:      "test",
		Enabled: true,
		Mode:    "single",
		Triggers: []json.RawMessage{
			json.RawMessage(`{"_type":"switchyard.automations#EventTrigger","kind":"sun.sunset"}`),
		},
		Actions: []json.RawMessage{
			json.RawMessage(`{"_type":"switchyard.automations#CallServiceAction","entity":"light.x","capability":"turn_on","args":{}}`),
		},
	}
	got, err := automationFromJSON(a)
	if err != nil {
		t.Fatalf("automationFromJSON: %v", err)
	}
	if got.GetId() != "test" {
		t.Errorf("id = %q, want test", got.GetId())
	}
	if len(got.GetTriggers()) != 1 || got.GetTriggers()[0].GetEvent() == nil {
		t.Errorf("trigger not decoded: %+v", got.GetTriggers())
	}
}

func TestAreaFromJSON_BuildsProto(t *testing.T) {
	pid := "parent"
	a := areaJSON{ID: "kitchen", DisplayName: "Kitchen", ParentID: &pid}
	got := areaFromJSON(a)
	if got.GetId() != "kitchen" || got.GetParentId() != "parent" {
		t.Errorf("got %+v", got)
	}
}

func TestSceneFromJSON_BuildsProto(t *testing.T) {
	s := sceneJSON{
		ID:          "movie",
		DisplayName: "Movie",
		Actions: []json.RawMessage{
			json.RawMessage(`{"_type":"switchyard.automations#CallServiceAction","entity":"light.x","capability":"turn_off","args":{}}`),
		},
	}
	got, err := sceneFromJSON(s)
	if err != nil {
		t.Fatalf("sceneFromJSON: %v", err)
	}
	if got.GetId() != "movie" || len(got.GetActions()) != 1 {
		t.Errorf("got %+v", got)
	}
}
