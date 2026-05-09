package eventstore_test

import (
	"context"
	"errors"
	"testing"

	"github.com/fdatoo/switchyard/internal/eventstore"
	"github.com/fdatoo/switchyard/internal/observability"
	"github.com/fdatoo/switchyard/internal/state"
	"github.com/fdatoo/switchyard/internal/testutil"
)

func TestReplay_RebuildsStateFromEvents(t *testing.T) {
	ctx := context.Background()
	f := newStoreFixture(t)
	cache1 := state.New()
	if err := f.store.RegisterProjector(cache1, eventstore.ProjectorModeSync); err != nil {
		t.Fatal(err)
	}
	if err := f.store.Start(ctx); err != nil {
		t.Fatal(err)
	}

	_, _ = f.store.Append(ctx, testutil.StateChanged("light.a", 100))
	_, _ = f.store.Append(ctx, testutil.StateChanged("light.b", 50))
	_, _ = f.store.Append(ctx, testutil.StateChanged("light.a", 200))
	t.Cleanup(func() { _ = f.store.Close(ctx) })

	// Second store, same DB: replay must reconstruct state.
	logger := observability.Init(observability.LogConfig{})
	metrics := observability.NewMetrics()
	s2, err := eventstore.Open(ctx, eventstore.Config{}, f.db, logger, metrics)
	if err != nil {
		t.Fatal(err)
	}
	cache2 := state.New()
	if err := s2.RegisterProjector(cache2, eventstore.ProjectorModeSync); err != nil {
		t.Fatal(err)
	}
	if err := s2.Replay(ctx); err != nil {
		t.Fatalf("Replay: %v", err)
	}

	s, ok := cache2.Get("light.a")
	if !ok {
		t.Fatal("light.a missing after replay")
	}
	if s.Attributes.GetLight().Brightness != 200 {
		t.Fatalf("brightness = %d, want 200", s.Attributes.GetLight().Brightness)
	}
}

func TestReplay_ReturnsReplayError(t *testing.T) {
	ctx := context.Background()

	// Populate the DB with one event using a store that has no failing projector.
	f := newStoreFixture(t)
	if err := f.store.Start(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.store.Append(ctx, testutil.StateChanged("light.x", 1)); err != nil {
		t.Fatal(err)
	}
	_ = f.store.Close(ctx)

	// Replay on a fresh store with a projector that fails on the first Apply call.
	f2 := newStoreFixtureOnDB(t, f.db)
	if err := f2.store.RegisterProjector(&countingProjector{name: "boom", failAt: 1}, eventstore.ProjectorModeSync); err != nil {
		t.Fatal(err)
	}
	err := f2.store.Replay(ctx)
	if err == nil {
		t.Fatal("expected replay to fail")
	}
	var re *eventstore.ReplayError
	if !errors.As(err, &re) {
		t.Fatalf("expected *eventstore.ReplayError, got %T: %v", err, err)
	}
	if re.Position == 0 {
		t.Fatal("ReplayError.Position must be non-zero")
	}
	if re.Projector != "boom" {
		t.Fatalf("ReplayError.Projector = %q, want %q", re.Projector, "boom")
	}
	if re.Err == nil {
		t.Fatal("ReplayError.Err must not be nil")
	}
}
