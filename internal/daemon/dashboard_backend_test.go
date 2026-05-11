package daemon

import (
	"context"
	"testing"

	"github.com/fdatoo/switchyard/internal/widgetpack"
)

func TestPageBackend_WidgetCatalog_ReflectsStore(t *testing.T) {
	store := widgetpack.NewStore(t.TempDir())
	if err := store.Load(context.Background()); err != nil {
		t.Fatalf("store.Load: %v", err)
	}
	if err := store.Add(context.Background(), widgetpack.InstalledPack{
		Name:    "bar-widgets",
		Version: "1.0.0",
		SHA256:  "sha256:abc",
		Classes: []string{"BarChart", "PieChart"},
	}); err != nil {
		t.Fatalf("store.Add: %v", err)
	}

	be := newPageBackend(t.TempDir(), t.TempDir(), store)
	classes, err := be.WidgetCatalog(context.Background())
	if err != nil {
		t.Fatalf("WidgetCatalog: %v", err)
	}

	// Must include 15 builtins + 2 pack classes.
	if len(classes) < 17 {
		t.Errorf("expected at least 17 classes (15 builtins + 2 pack), got %d", len(classes))
	}

	// Find the pack class "bar-widgets/BarChart".
	var found bool
	for _, c := range classes {
		if c.ClassID == "bar-widgets/BarChart" {
			found = true
			if c.IsBuiltin {
				t.Errorf("bar-widgets/BarChart should not be marked builtin")
			}
			if c.PackName != "bar-widgets" {
				t.Errorf("PackName = %q, want bar-widgets", c.PackName)
			}
			if c.PackVersion != "1.0.0" {
				t.Errorf("PackVersion = %q, want 1.0.0", c.PackVersion)
			}
			break
		}
	}
	if !found {
		t.Error("bar-widgets/BarChart not found in catalog")
	}
}

func TestPageBackend_WidgetCatalog_NilStore(t *testing.T) {
	be := newPageBackend(t.TempDir(), t.TempDir(), nil)
	classes, err := be.WidgetCatalog(context.Background())
	if err != nil {
		t.Fatalf("WidgetCatalog: %v", err)
	}
	// Should return 15 builtins.
	if len(classes) != 15 {
		t.Errorf("expected 15 builtin classes with nil store, got %d", len(classes))
	}
}
