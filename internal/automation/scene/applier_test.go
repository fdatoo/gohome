package scene

import (
	"context"
	"errors"
	"sync"
	"testing"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	"github.com/fdatoo/switchyard/internal/eventstore"
	ghstarlark "github.com/fdatoo/switchyard/internal/starlark"
)

type fakeDispatch struct {
	mu    sync.Mutex
	calls []string
	fail  map[string]bool // entityID:capability → return error
}

func (f *fakeDispatch) Dispatch(_ context.Context, entityID, capability string, _ map[string]string) (*ghstarlark.DispatchResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	key := entityID + ":" + capability
	f.calls = append(f.calls, key)
	if f.fail[key] {
		return nil, errors.New("dispatch error")
	}
	return &ghstarlark.DispatchResult{}, nil
}

type fakeStore struct {
	mu     sync.Mutex
	events []eventstore.Event
}

func (f *fakeStore) Append(_ context.Context, ev eventstore.Event) (uint64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, ev)
	return uint64(len(f.events)), nil
}

type fakeSnap struct {
	scenes []*configpb.SceneConfig
}

func (f *fakeSnap) Current() *configpb.ConfigSnapshot {
	return &configpb.ConfigSnapshot{Scenes: f.scenes}
}

func twoCallServiceScene() *configpb.SceneConfig {
	return &configpb.SceneConfig{
		Id: "movie-night",
		Actions: []*configpb.ActionConfig{
			{Kind: &configpb.ActionConfig_CallService{CallService: &configpb.CallServiceAction{
				Entity: "light.living_room", Capability: "turn_off",
			}}},
			{Kind: &configpb.ActionConfig_CallService{CallService: &configpb.CallServiceAction{
				Entity: "light.bedroom", Capability: "turn_off",
			}}},
		},
	}
}

func TestApplier_HappyPath(t *testing.T) {
	scene := twoCallServiceScene()
	dispatch := &fakeDispatch{}
	store := &fakeStore{}
	applier := NewApplier(&fakeSnap{scenes: []*configpb.SceneConfig{scene}}, dispatch, store, nil, nil, nil, nil, nil)

	err := applier.Invoke(context.Background(), "movie-night", "corr-1", "test")
	if err != nil {
		t.Fatalf("Invoke: %v", err)
	}
	if len(dispatch.calls) != 2 {
		t.Errorf("want 2 dispatches, got %d: %v", len(dispatch.calls), dispatch.calls)
	}
	if len(store.events) != 1 || store.events[0].Kind != "scene" {
		t.Errorf("want 1 scene event, got %d (%+v)", len(store.events), store.events)
	}
}

func TestApplier_UnknownSceneIsError(t *testing.T) {
	applier := NewApplier(&fakeSnap{}, &fakeDispatch{}, &fakeStore{}, nil, nil, nil, nil, nil)
	err := applier.Invoke(context.Background(), "ghost", "corr-2", "test")
	if !errors.Is(err, ErrSceneNotFound) {
		t.Errorf("want ErrSceneNotFound, got %v", err)
	}
}

func TestApplier_PartialFailureRecordedInEvent(t *testing.T) {
	scene := twoCallServiceScene()
	dispatch := &fakeDispatch{fail: map[string]bool{"light.bedroom:turn_off": true}}
	store := &fakeStore{}
	applier := NewApplier(&fakeSnap{scenes: []*configpb.SceneConfig{scene}}, dispatch, store, nil, nil, nil, nil, nil)

	_ = applier.Invoke(context.Background(), "movie-night", "corr-3", "test")
	if len(dispatch.calls) != 2 {
		t.Errorf("both actions should attempt; got %d dispatches: %v", len(dispatch.calls), dispatch.calls)
	}
	if len(store.events) != 1 {
		t.Fatalf("want one scene event, got %d", len(store.events))
	}
}
