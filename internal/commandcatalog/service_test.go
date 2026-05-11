package commandcatalog_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"connectrpc.com/connect"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	catalogv1 "github.com/fdatoo/switchyard/gen/switchyard/commandcatalog/v1"
	"github.com/fdatoo/switchyard/gen/switchyard/commandcatalog/v1/commandcatalogv1connect"
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

func buildFullRegistry() *commandcatalog.Registry {
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
	return r
}

// TestCommandCatalogService_Integration spins up an in-process test HTTP server,
// calls CommandCatalogService.List, and asserts catalog completeness.
func TestCommandCatalogService_Integration(t *testing.T) {
	r := buildFullRegistry()
	svc := commandcatalog.NewCommandCatalogService(r)

	mux := http.NewServeMux()
	path, handler := commandcatalogv1connect.NewCommandCatalogServiceHandler(svc)
	mux.Handle(path, handler)

	srv := httptest.NewUnstartedServer(h2c.NewHandler(mux, &http2.Server{}))
	srv.Start()
	t.Cleanup(srv.Close)

	client := commandcatalogv1connect.NewCommandCatalogServiceClient(
		srv.Client(),
		srv.URL,
	)

	resp, err := client.List(context.Background(), connect.NewRequest(&catalogv1.ListRequest{}))
	if err != nil {
		t.Fatalf("List() error: %v", err)
	}

	verbs := resp.Msg.Verbs
	if len(verbs) < 22 {
		t.Fatalf("expected at least 22 verbs, got %d", len(verbs))
	}

	// Build lookup by name.
	byName := make(map[string]*catalogv1.Verb, len(verbs))
	for _, v := range verbs {
		byName[v.Name] = v
	}

	// events tail: source, kind, entity, since all optional.
	t.Run("events tail", func(t *testing.T) {
		v := requireVerb(t, byName, "events tail")
		optionalArgs := optionalArgNames(v)
		for _, want := range []string{"source", "kind", "entity", "since"} {
			if !optionalArgs[want] {
				t.Errorf("expected optional arg %q", want)
			}
		}
	})

	// entity get: id required.
	t.Run("entity get", func(t *testing.T) {
		v := requireVerb(t, byName, "entity get")
		req := requiredArgNames(v)
		if !req["id"] {
			t.Error("expected required arg 'id'")
		}
	})

	// driver logs: name required, lines optional.
	t.Run("driver logs", func(t *testing.T) {
		v := requireVerb(t, byName, "driver logs")
		req := requiredArgNames(v)
		opt := optionalArgNames(v)
		if !req["name"] {
			t.Error("expected required arg 'name'")
		}
		if !opt["lines"] {
			t.Error("expected optional arg 'lines'")
		}
	})
}

func requireVerb(t *testing.T, byName map[string]*catalogv1.Verb, name string) *catalogv1.Verb {
	t.Helper()
	v, ok := byName[name]
	if !ok {
		t.Fatalf("verb %q not found in catalog", name)
	}
	return v
}

func requiredArgNames(v *catalogv1.Verb) map[string]bool {
	m := map[string]bool{}
	for _, a := range v.Args {
		if a.Required {
			m[a.Name] = true
		}
	}
	return m
}

func optionalArgNames(v *catalogv1.Verb) map[string]bool {
	m := map[string]bool{}
	for _, a := range v.Args {
		if !a.Required {
			m[a.Name] = true
		}
	}
	return m
}
