package commandcatalog_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	catalogv1 "github.com/fdatoo/switchyard/gen/switchyard/commandcatalog/v1"
	"github.com/fdatoo/switchyard/internal/commandcatalog"
)

func TestRegistry_RegisterAndAll(t *testing.T) {
	r := commandcatalog.NewRegistry()
	v := commandcatalog.Verb{
		Name:        "events tail",
		Description: "Stream events",
		CLIForm:     "switchyard event tail",
		HandlerRef:  "events.tail",
		Args: []commandcatalog.ArgSchema{
			{Name: "source", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--source"},
		},
	}
	r.Register(v)
	all := r.All()
	if len(all) != 1 {
		t.Fatalf("expected 1 verb, got %d", len(all))
	}
	if all[0].Name != "events tail" {
		t.Errorf("expected 'events tail', got %q", all[0].Name)
	}
	if len(all[0].Args) != 1 {
		t.Errorf("expected 1 arg, got %d", len(all[0].Args))
	}
}

func TestRegistry_DuplicatePanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic for duplicate verb registration")
		}
	}()
	r := commandcatalog.NewRegistry()
	v := commandcatalog.Verb{Name: "events tail"}
	r.Register(v)
	r.Register(v) // should panic
}

func TestCommandCatalogService_List(t *testing.T) {
	r := commandcatalog.NewRegistry()
	r.Register(commandcatalog.Verb{
		Name:        "events tail",
		Description: "Stream events",
		CLIForm:     "switchyard event tail",
		HandlerRef:  "events.tail",
		Args: []commandcatalog.ArgSchema{
			{Name: "source", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--source", Hint: "driver name"},
			{Name: "kind", Type: commandcatalog.ArgTypeString, Required: false, CLIFlag: "--kind"},
		},
	})

	svc := commandcatalog.NewCommandCatalogService(r)
	resp, err := svc.List(context.Background(), connect.NewRequest(&catalogv1.ListRequest{}))
	if err != nil {
		t.Fatalf("List() error: %v", err)
	}
	if len(resp.Msg.Verbs) != 1 {
		t.Fatalf("expected 1 verb, got %d", len(resp.Msg.Verbs))
	}
	got := resp.Msg.Verbs[0]
	if got.Name != "events tail" {
		t.Errorf("expected 'events tail', got %q", got.Name)
	}
	if got.Description != "Stream events" {
		t.Errorf("unexpected description: %q", got.Description)
	}
	if got.CliForm != "switchyard event tail" {
		t.Errorf("unexpected cli_form: %q", got.CliForm)
	}
	if got.HandlerRef != "events.tail" {
		t.Errorf("unexpected handler_ref: %q", got.HandlerRef)
	}
	if len(got.Args) != 2 {
		t.Fatalf("expected 2 args, got %d", len(got.Args))
	}
	if got.Args[0].Name != "source" {
		t.Errorf("expected arg 'source', got %q", got.Args[0].Name)
	}
	if got.Args[0].Type != catalogv1.ArgType_ARG_TYPE_STRING {
		t.Errorf("unexpected arg type: %v", got.Args[0].Type)
	}
	if got.Args[0].Required {
		t.Error("expected source to be optional")
	}
	if got.Args[0].CliFlag != "--source" {
		t.Errorf("unexpected cli_flag: %q", got.Args[0].CliFlag)
	}
	if got.Args[0].Hint != "driver name" {
		t.Errorf("unexpected hint: %q", got.Args[0].Hint)
	}
}
