package commandcatalog_test

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	catalogv1 "github.com/fdatoo/switchyard/gen/switchyard/commandcatalog/v1"
	"github.com/fdatoo/switchyard/internal/activity"
	"github.com/fdatoo/switchyard/internal/auth"
	"github.com/fdatoo/switchyard/internal/automation"
	"github.com/fdatoo/switchyard/internal/commandcatalog"
	"github.com/fdatoo/switchyard/internal/config"
	"github.com/fdatoo/switchyard/internal/page"
	"github.com/fdatoo/switchyard/internal/display"
	"github.com/fdatoo/switchyard/internal/driver"
	"github.com/fdatoo/switchyard/internal/entity"
	"github.com/fdatoo/switchyard/internal/pkl"
	"github.com/fdatoo/switchyard/internal/widgetpack"
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

// TestAllDomainVerbs verifies that all 22 built-in verbs from the catalog table are registered
// with the expected required/optional arg shapes.
func TestAllDomainVerbs(t *testing.T) {
	r := commandcatalog.NewRegistry()
	activity.RegisterCommands(r)
	entity.RegisterCommands(r)
	automation.RegisterCommands(r)
	driver.RegisterCommands(r)
	config.RegisterCommands(r)
	pkl.RegisterCommands(r)
	page.RegisterCommands(r)
	widgetpack.RegisterCommands(r)
	auth.RegisterCommands(r)
	display.RegisterCommands(r)

	all := r.All()
	if len(all) < 22 {
		t.Fatalf("expected at least 22 verbs, got %d", len(all))
	}

	// Build a lookup map for assertions.
	byName := make(map[string]commandcatalog.Verb, len(all))
	for _, v := range all {
		byName[v.Name] = v
	}

	type argExpect struct {
		name     string
		required bool
	}
	cases := []struct {
		verb     string
		required []string
		optional []string
	}{
		{
			verb:     "events tail",
			required: nil,
			optional: []string{"source", "kind", "entity", "since"},
		},
		{
			verb:     "events query",
			required: nil,
			optional: []string{"kind", "source", "entity", "issuedBy", "since", "until", "limit"},
		},
		{
			verb:     "entity get",
			required: []string{"id"},
			optional: nil,
		},
		{
			verb:     "entity call-capability",
			required: []string{"id", "capability"},
			optional: []string{"args"},
		},
		{
			verb:     "automation run",
			required: []string{"id"},
		},
		{
			verb:     "automation enable",
			required: []string{"id"},
		},
		{
			verb:     "automation disable",
			required: []string{"id"},
		},
		{
			verb:     "driver restart",
			required: []string{"name"},
		},
		{
			verb:     "driver logs",
			required: []string{"name"},
			optional: []string{"lines"},
		},
		{
			verb: "driver list",
		},
		{
			verb:     "config apply",
			optional: []string{"path"},
		},
		{
			verb:     "config validate",
			optional: []string{"path"},
		},
		{
			verb:     "pkl open",
			required: []string{"path"},
		},
		{
			verb:     "page open",
			required: []string{"slug"},
		},
		{
			verb:     "page create",
			required: []string{"slug"},
		},
		{
			verb:     "page export",
			required: []string{"slug"},
		},
		{
			verb:     "widget install",
			required: []string{"oci_ref"},
		},
		{
			verb: "widget list",
		},
		{
			verb:     "token issue",
			required: []string{"name", "scopes"},
		},
		{
			verb: "passkey enroll",
		},
		{
			verb: "display pair",
		},
		{
			verb:     "display configure",
			required: []string{"id"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.verb, func(t *testing.T) {
			v, ok := byName[tc.verb]
			if !ok {
				t.Fatalf("verb %q not found in catalog", tc.verb)
			}

			// Build lookup maps from registered args.
			reqArgs := map[string]bool{}
			optArgs := map[string]bool{}
			for _, a := range v.Args {
				if a.Required {
					reqArgs[a.Name] = true
				} else {
					optArgs[a.Name] = true
				}
			}

			for _, name := range tc.required {
				if !reqArgs[name] {
					t.Errorf("expected arg %q to be required", name)
				}
			}
			for _, name := range tc.optional {
				if !optArgs[name] {
					t.Errorf("expected arg %q to be optional", name)
				}
			}
		})
	}
}

// TestAllDomainVerbs_ViaService verifies the service List RPC returns all 22 verbs.
func TestAllDomainVerbs_ViaService(t *testing.T) {
	r := commandcatalog.NewRegistry()
	activity.RegisterCommands(r)
	entity.RegisterCommands(r)
	automation.RegisterCommands(r)
	driver.RegisterCommands(r)
	config.RegisterCommands(r)
	pkl.RegisterCommands(r)
	page.RegisterCommands(r)
	widgetpack.RegisterCommands(r)
	auth.RegisterCommands(r)
	display.RegisterCommands(r)

	svc := commandcatalog.NewCommandCatalogService(r)
	resp, err := svc.List(context.Background(), connect.NewRequest(&catalogv1.ListRequest{}))
	if err != nil {
		t.Fatalf("List() error: %v", err)
	}
	if len(resp.Msg.Verbs) < 22 {
		t.Fatalf("expected at least 22 verbs, got %d", len(resp.Msg.Verbs))
	}
}
