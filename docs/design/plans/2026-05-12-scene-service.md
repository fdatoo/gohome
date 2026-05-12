# SceneService implementation plan

> **For agentic workers:** Use superpowers:executing-plans to work through this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the SceneService `Unimplemented` stub with a real implementation backed by Pkl-declared scenes and the existing automation action dispatcher.

**Architecture:** Scenes are config-driven (`Pkl class Scene { id, displayName, actions }`) — the evaluator carries them through to a new `SceneConfig` proto on `ConfigSnapshot`, the registry holds them in-memory (refreshed on each config Apply, identical to the Area pattern). `SceneService.Apply` fans out the scene's actions in parallel via the existing `CallServiceAction.Execute` path, returning a correlation id once all goroutines settle (best-effort — per-action errors are logged, not surfaced).

**Tech Stack:** Go (daemon, evaluator, registry, ConnectRPC), Pkl (config schema), Playwright for E2E validation.

**Reference spec:** `docs/design/specs/2026-05-12-scene-service-design.md`

**Verification strategy:** `go test ./...` for backend changes (no UI changes — RoomDetailView already consumes the API). Manual Playwright end-to-end on the running daemon to confirm a real scene apply flips real hardware.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `internal/config/pkl/switchyard/scenes.pkl` | new | `class Scene { id, displayName, actions: Listing<CallServiceAction> }` |
| `internal/config/pkl/switchyard/config.pkl` | modify | Import scenes module; add `scenes: Listing<sc.Scene>` |
| `proto/switchyard/config/v1/snapshot.proto` | modify | Add `SceneConfig` message + `repeated SceneConfig scenes = 31` |
| `internal/config/evaluator.go` | modify | `sceneJSON` type + Pkl→proto carry-through |
| `internal/registry/scenes.go` | new | In-memory scene store + lookup helpers |
| `internal/registry/registry.go` | modify | Embed `scenes` map + reuse `areaMu` for it |
| `internal/registry/scenes_test.go` | new | Set/Get/List semantics |
| `internal/daemon/area_sync.go` | rename → `config_sync.go` | Now syncs both areas and scenes |
| `internal/daemon/config_sync.go` | modify | `syncScenesToRegistry` companion to `syncAreasToRegistry` |
| `internal/api/deps.go` | modify | Add `SceneReader` interface |
| `internal/api/service_scene.go` | new | Real SceneService (List + Apply + Preview-stub) |
| `internal/api/service_scene_test.go` | new | List / Apply / unknown-id / partial-failure / preview tests |
| `internal/api/service_unimplemented.go` | modify | Remove the SceneService entries |
| `internal/daemon/daemon.go` | modify | Wire `api.NewSceneService(...)` with registry + dispatcher |
| `~/.local/share/switchyard/config/main.pkl` | local-only | Sample scene for E2E (not committed — gitignored dev config) |

---

## Task 1: Pkl Scene class + config wiring

**Files:**
- Create: `internal/config/pkl/switchyard/scenes.pkl`
- Modify: `internal/config/pkl/switchyard/config.pkl`

- [ ] **Step 1: Create the Scene Pkl module**

Write `internal/config/pkl/switchyard/scenes.pkl`:

```pkl
module switchyard.scenes

import "switchyard:automations" as auto

/// Scene — a named one-tap action set. Tapping a scene chip in the UI
/// fires `SceneService.Apply`, which fans out the actions in parallel
/// via the same dispatcher automations use.
class Scene {
  id:          String(!isEmpty)
  displayName: String
  actions:     Listing<auto.CallServiceAction>
}
```

- [ ] **Step 2: Add `scenes` to config root**

Edit `internal/config/pkl/switchyard/config.pkl`. Find the `import` block near the top and add the scenes import next to the areas one:
```pkl
import "switchyard:areas" as ar
import "switchyard:scenes" as sc
```

Then in the body, alongside `areas`:
```pkl
areas: Listing<ar.Area> = new {}
scenes: Listing<sc.Scene> = new {}
```

- [ ] **Step 3: Run config tests — confirm no regression**

```bash
go test ./internal/config/...
```
Expected: PASS. The new `scenes` field has a default of `new {}` so all existing configs still evaluate.

- [ ] **Step 4: Commit**

```bash
git add internal/config/pkl/switchyard/scenes.pkl internal/config/pkl/switchyard/config.pkl
git commit -m "pkl: Scene class + config.scenes Listing"
```

---

## Task 2: SceneConfig proto + regen

**Files:**
- Modify: `proto/switchyard/config/v1/snapshot.proto`

- [ ] **Step 1: Add the SceneConfig message + ConfigSnapshot field**

Edit `proto/switchyard/config/v1/snapshot.proto`. Find `message ConfigSnapshot { ... }`. In the `30-39: assignments / overrides` band (after `entity_areas = 30`), add:

```proto
  repeated SceneConfig scenes = 31;
```

Then, after the existing `AreaConfig` definition (search for `message AreaConfig` and add right after its closing brace):

```proto
message SceneConfig {
  string                id           = 1;
  string                display_name = 2;
  repeated ActionConfig actions      = 3;
}
```

- [ ] **Step 2: Regenerate**

```bash
export PATH="$(go env GOPATH)/bin:$PATH"
buf generate
```
Expected: clean output, no errors.

Verify the new field landed:
```bash
grep -n "SceneConfig\|Scenes" gen/switchyard/config/v1/snapshot.pb.go | head -8
```
Expected: matches showing `Scenes []*SceneConfig` on `ConfigSnapshot` and `type SceneConfig struct`.

- [ ] **Step 3: Confirm build**

```bash
go build ./...
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add proto/switchyard/config/v1/snapshot.proto gen/switchyard/config/v1/snapshot.pb.go
git commit -m "proto: SceneConfig message + ConfigSnapshot.scenes (field 31)"
```

---

## Task 3: Evaluator carry-through

**Files:**
- Modify: `internal/config/evaluator.go`

- [ ] **Step 1: Add `sceneJSON` type next to `automationJSON`**

In `internal/config/evaluator.go`, find `type automationJSON struct`. Below it (and below `areaJSON` if it sits nearby) add:

```go
type sceneJSON struct {
	ID          string            `json:"id"`
	DisplayName string            `json:"displayName"`
	Actions     []json.RawMessage `json:"actions"`
}
```

- [ ] **Step 2: Add `Scenes` field to the top-level configJSON**

In the same file, find `type configJSON struct`. Add `Scenes`:

```go
type configJSON struct {
	DriverInstances  []json.RawMessage    `json:"driverInstances"`
	Areas            []areaJSON           `json:"areas"`
	Scenes           []sceneJSON          `json:"scenes"`
	Entities         []entityJSON         `json:"entities"`
	// ... rest unchanged ...
}
```

- [ ] **Step 3: Carry scenes through to the proto**

In `parseConfigJSON`, after the existing `for _, a := range raw.Areas { ... }` loop, add a scenes loop:

```go
for _, s := range raw.Scenes {
	scfg := &configpb.SceneConfig{
		Id:          strings.TrimSpace(s.ID),
		DisplayName: s.DisplayName,
	}
	for _, rawA := range s.Actions {
		ac, err := decodeAction(rawA)
		if err != nil {
			return nil, fmt.Errorf("scene %q action: %w", s.ID, err)
		}
		scfg.Actions = append(scfg.Actions, ac)
	}
	snap.Scenes = append(snap.Scenes, scfg)
}
```

(`decodeAction` already exists for automations; same shape applies to scenes.)

- [ ] **Step 4: Build + run config tests**

```bash
go build ./...
go test ./internal/config/...
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/config/evaluator.go
git commit -m "config: evaluator carries Pkl scenes through to ConfigSnapshot"
```

---

## Task 4: Registry scene store

**Files:**
- Create: `internal/registry/scenes.go`
- Create: `internal/registry/scenes_test.go`
- Modify: `internal/registry/registry.go`

- [ ] **Step 1: Add the Scene type + fields to Registry**

Edit `internal/registry/types.go`. Add a `Scene` struct near the existing `Area` struct:

```go
// Scene is a user-declared one-tap action set. Like areas, scenes are
// config-driven (Pkl `scenes: Listing<Scene>`), not event-sourced —
// the registry holds them in memory and refreshes on each config Apply.
type Scene struct {
	ID          string
	DisplayName string
	Actions     []*configpb.ActionConfig
}
```

You'll need `configpb` imported here. Find existing imports in `types.go`; add:
```go
configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
```

Then edit `internal/registry/registry.go`. Find `type Registry struct` (it already has `areaMu` and `areas`). Add a `scenes` map alongside (reuse the same mutex — scenes and areas have identical lifecycles):

```go
type Registry struct {
	db *sql.DB
	eventstore.NoSnapshot

	// Area + scene state — config-driven, refreshed on each config Apply.
	areaMu      sync.RWMutex
	areas       map[string]Area
	entityAreas map[string]string
	scenes      map[string]Scene
}
```

- [ ] **Step 2: Implement SetScenes / ListScenesInMemory / GetSceneInMemory**

Create `internal/registry/scenes.go`:

```go
package registry

// SetScenes replaces the registry's known scene set. Called by the
// config manager on every successful Apply (same lifecycle as SetAreas).
func (r *Registry) SetScenes(scenes []Scene) {
	r.areaMu.Lock()
	defer r.areaMu.Unlock()
	m := make(map[string]Scene, len(scenes))
	for _, s := range scenes {
		if s.ID == "" {
			continue
		}
		m[s.ID] = s
	}
	r.scenes = m
}

// ListScenesInMemory returns all known scenes, sorted by ID. Fresh slice,
// safe to retain.
func (r *Registry) ListScenesInMemory() []Scene {
	r.areaMu.RLock()
	defer r.areaMu.RUnlock()
	out := make([]Scene, 0, len(r.scenes))
	for _, s := range r.scenes {
		out = append(out, s)
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j-1].ID > out[j].ID; j-- {
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
	return out
}

// GetSceneInMemory returns one scene by id. ok=false means unknown.
func (r *Registry) GetSceneInMemory(id string) (Scene, bool) {
	r.areaMu.RLock()
	defer r.areaMu.RUnlock()
	s, ok := r.scenes[id]
	return s, ok
}
```

- [ ] **Step 3: Write failing tests**

Create `internal/registry/scenes_test.go`:

```go
package registry_test

import (
	"context"
	"testing"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	"github.com/fdatoo/switchyard/internal/registry"
	"github.com/fdatoo/switchyard/internal/storage"
)

func newRegistryForScenes(t *testing.T) *registry.Registry {
	t.Helper()
	db, err := storage.OpenSQLite(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	r, err := registry.New(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestRegistry_SetScenes_ReplacesPreviousSet(t *testing.T) {
	r := newRegistryForScenes(t)
	r.SetScenes([]registry.Scene{
		{ID: "wind-down", DisplayName: "Wind down"},
		{ID: "movie",     DisplayName: "Movie"},
	})
	if got := len(r.ListScenesInMemory()); got != 2 {
		t.Fatalf("ListScenesInMemory len = %d, want 2", got)
	}
	r.SetScenes([]registry.Scene{
		{ID: "all-off", DisplayName: "All off"},
	})
	all := r.ListScenesInMemory()
	if len(all) != 1 || all[0].ID != "all-off" {
		t.Fatalf("after second SetScenes got %v, want only all-off", all)
	}
}

func TestRegistry_GetSceneInMemory_NotFound(t *testing.T) {
	r := newRegistryForScenes(t)
	if _, ok := r.GetSceneInMemory("missing"); ok {
		t.Fatal("expected GetSceneInMemory to return false for unknown id")
	}
	r.SetScenes([]registry.Scene{{ID: "wind-down", DisplayName: "Wind down"}})
	got, ok := r.GetSceneInMemory("wind-down")
	if !ok || got.DisplayName != "Wind down" {
		t.Fatalf("after SetScenes: got=%+v ok=%v", got, ok)
	}
}

func TestRegistry_Scenes_PreserveActions(t *testing.T) {
	r := newRegistryForScenes(t)
	r.SetScenes([]registry.Scene{{
		ID:          "wind-down",
		DisplayName: "Wind down",
		Actions:     []*configpb.ActionConfig{{}, {}}, // 2 empty actions
	}})
	got, ok := r.GetSceneInMemory("wind-down")
	if !ok {
		t.Fatal("scene not found")
	}
	if len(got.Actions) != 2 {
		t.Fatalf("Actions len = %d, want 2", len(got.Actions))
	}
}
```

If `storage.OpenSQLite` doesn't have that exact signature, locate the helper that other registry tests use (`internal/registry/registry_test.go` is the reference) and match its pattern.

- [ ] **Step 4: Run tests**

```bash
go test ./internal/registry/... -run TestRegistry_Scenes -v
go test ./internal/registry/... -run TestRegistry_SetScenes -v
go test ./internal/registry/... -run TestRegistry_GetSceneInMemory -v
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/registry/types.go internal/registry/registry.go internal/registry/scenes.go internal/registry/scenes_test.go
git commit -m "registry: in-memory Scene store (config-driven, like areas)"
```

---

## Task 5: config_sync rename + syncScenesToRegistry

**Files:**
- Rename: `internal/daemon/area_sync.go` → `internal/daemon/config_sync.go`
- Modify: contents to add the scenes companion

- [ ] **Step 1: Rename + extend the file**

```bash
git mv internal/daemon/area_sync.go internal/daemon/config_sync.go
```

Now overwrite `internal/daemon/config_sync.go` with:

```go
package daemon

import (
	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	"github.com/fdatoo/switchyard/internal/registry"
)

// syncAreasToRegistry pushes the snapshot's area set and entity→area
// assignments into the registry's in-memory area store. Called both on
// initial config load and via OnApplied on every subsequent reload.
func syncAreasToRegistry(reg *registry.Registry, snap *configpb.ConfigSnapshot) {
	if reg == nil || snap == nil {
		return
	}
	areas := make([]registry.Area, 0, len(snap.GetAreas()))
	for _, a := range snap.GetAreas() {
		areas = append(areas, registry.Area{
			ID:          a.GetId(),
			DisplayName: a.GetDisplayName(),
			ParentID:    a.GetParentId(),
		})
	}
	reg.SetAreas(areas)
	reg.SetEntityAreas(snap.GetEntityAreas())
}

// syncScenesToRegistry pushes the snapshot's scene set into the
// registry's in-memory scene store. Same lifecycle as syncAreasToRegistry.
func syncScenesToRegistry(reg *registry.Registry, snap *configpb.ConfigSnapshot) {
	if reg == nil || snap == nil {
		return
	}
	scenes := make([]registry.Scene, 0, len(snap.GetScenes()))
	for _, s := range snap.GetScenes() {
		scenes = append(scenes, registry.Scene{
			ID:          s.GetId(),
			DisplayName: s.GetDisplayName(),
			Actions:     s.GetActions(),
		})
	}
	reg.SetScenes(scenes)
}
```

- [ ] **Step 2: Call syncScenesToRegistry alongside the area sync**

Edit `internal/daemon/daemon.go`. Find the two call sites for `syncAreasToRegistry` (one in the initial sync, one inside `OnApplied`). After each, add a matching `syncScenesToRegistry` call:

```go
if initial := d.configMgr.Current(); initial != nil {
	syncAreasToRegistry(d.registry, initial)
	syncScenesToRegistry(d.registry, initial)
}
d.configMgr.OnApplied(func(snap *configpb.ConfigSnapshot) {
	syncAreasToRegistry(d.registry, snap)
	syncScenesToRegistry(d.registry, snap)
	// ...rest of the callback unchanged...
})
```

- [ ] **Step 3: Build + test**

```bash
go build ./...
go test ./internal/daemon/...
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add internal/daemon/config_sync.go internal/daemon/daemon.go
git commit -m "daemon: syncScenesToRegistry on each config Apply"
```

---

## Task 6: SceneReader interface

**Files:**
- Modify: `internal/api/deps.go`

- [ ] **Step 1: Add the interface**

In `internal/api/deps.go`, near the existing `AreaReader` definition (search for `type AreaReader interface`), add:

```go
// SceneReader exposes the registry's scene set to the API layer.
type SceneReader interface {
	ListScenes() []Scene
	GetScene(id string) (Scene, bool)
}

// Scene mirrors registry.Scene for the API layer. The ActionConfig
// pointers are shared (config snapshot owns them; the registry holds
// references). Callers must not mutate.
type Scene struct {
	ID          string
	DisplayName string
	Actions     []*configpb.ActionConfig
}
```

Add the `configpb` import if it's not already there:
```go
configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
```

- [ ] **Step 2: Confirm build**

```bash
go build ./...
```
Expected: clean (no consumers yet; we add one in Task 7).

- [ ] **Step 3: Commit**

```bash
git add internal/api/deps.go
git commit -m "api: SceneReader interface for the API layer"
```

---

## Task 7: SceneService — List

**Files:**
- Create: `internal/api/service_scene.go`
- Create: `internal/api/service_scene_test.go`

- [ ] **Step 1: Skeleton with List + Preview stubs**

Create `internal/api/service_scene.go`:

```go
package api

import (
	"context"

	"connectrpc.com/connect"

	v1 "github.com/fdatoo/switchyard/gen/switchyard/v1alpha1"
	"github.com/fdatoo/switchyard/gen/switchyard/v1alpha1/switchyardv1alpha1connect"
	"github.com/fdatoo/switchyard/internal/automation/action"
)

// SceneService implements switchyard.v1alpha1.SceneService.
type SceneService struct {
	registry   SceneReader
	dispatcher action.CommandDispatcher
}

func NewSceneService(reg SceneReader, dispatcher action.CommandDispatcher) *SceneService {
	return &SceneService{registry: reg, dispatcher: dispatcher}
}

var _ switchyardv1alpha1connect.SceneServiceHandler = (*SceneService)(nil)

func (s *SceneService) List(ctx context.Context, _ *connect.Request[v1.ListScenesRequest]) (*connect.Response[v1.ListScenesResponse], error) {
	out := &v1.ListScenesResponse{Page: &v1.PageResponse{}}
	if s.registry == nil {
		return connect.NewResponse(out), nil
	}
	for _, sc := range s.registry.ListScenes() {
		out.Scenes = append(out.Scenes, &v1.Scene{Id: sc.ID, DisplayName: sc.DisplayName})
	}
	return connect.NewResponse(out), nil
}

func (s *SceneService) Apply(ctx context.Context, req *connect.Request[v1.ApplySceneRequest]) (*connect.Response[v1.ApplySceneResponse], error) {
	// Implemented in Task 8.
	return nil, connect.NewError(connect.CodeUnimplemented, nil)
}

func (s *SceneService) Preview(ctx context.Context, _ *connect.Request[v1.PreviewSceneRequest]) (*connect.Response[v1.PreviewSceneResponse], error) {
	// Stubbed: returns empty lines. Full implementation is a separate
	// design (probably renders the action list as readable text).
	return connect.NewResponse(&v1.PreviewSceneResponse{}), nil
}
```

- [ ] **Step 2: Write failing test for List**

Create `internal/api/service_scene_test.go`:

```go
package api_test

import (
	"context"
	"sort"
	"testing"

	"connectrpc.com/connect"

	v1 "github.com/fdatoo/switchyard/gen/switchyard/v1alpha1"
	"github.com/fdatoo/switchyard/internal/api"
)

type fakeSceneReader struct {
	scenes map[string]api.Scene
}

func (f *fakeSceneReader) ListScenes() []api.Scene {
	out := make([]api.Scene, 0, len(f.scenes))
	for _, s := range f.scenes {
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (f *fakeSceneReader) GetScene(id string) (api.Scene, bool) {
	s, ok := f.scenes[id]
	return s, ok
}

func TestSceneService_List_ReturnsRegistryScenes(t *testing.T) {
	svc := api.NewSceneService(&fakeSceneReader{
		scenes: map[string]api.Scene{
			"wind-down": {ID: "wind-down", DisplayName: "Wind down"},
			"movie":     {ID: "movie", DisplayName: "Movie"},
		},
	}, nil)
	resp, err := svc.List(context.Background(), connect.NewRequest(&v1.ListScenesRequest{}))
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if got := len(resp.Msg.Scenes); got != 2 {
		t.Fatalf("List scenes = %d, want 2", got)
	}
}
```

- [ ] **Step 3: Run test**

```bash
go test -run TestSceneService_List ./internal/api/... -v
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add internal/api/service_scene.go internal/api/service_scene_test.go
git commit -m "api: SceneService skeleton (List + Preview stub)"
```

---

## Task 8: SceneService — Apply (parallel best-effort)

**Files:**
- Modify: `internal/api/service_scene.go`
- Modify: `internal/api/service_scene_test.go`

- [ ] **Step 1: Write failing test for Apply on unknown id**

Append to `internal/api/service_scene_test.go`:

```go
func TestSceneService_Apply_UnknownID(t *testing.T) {
	svc := api.NewSceneService(&fakeSceneReader{scenes: map[string]api.Scene{}}, nil)
	_, err := svc.Apply(context.Background(), connect.NewRequest(&v1.ApplySceneRequest{Id: "ghost"}))
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Fatalf("Apply unknown id err = %v (code=%v), want NotFound", err, connect.CodeOf(err))
	}
}
```

- [ ] **Step 2: Run — expect failure**

```bash
go test -run TestSceneService_Apply_UnknownID ./internal/api/... -v
```
Expected: FAIL (current Apply returns CodeUnimplemented).

- [ ] **Step 3: Implement Apply with parallel dispatch + correlation id**

Replace the `Apply` stub in `internal/api/service_scene.go` with the real implementation. Add the imports up top:

```go
import (
	"context"
	"errors"
	"log/slog"
	"sync"

	"connectrpc.com/connect"
	"github.com/oklog/ulid/v2"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	v1 "github.com/fdatoo/switchyard/gen/switchyard/v1alpha1"
	"github.com/fdatoo/switchyard/gen/switchyard/v1alpha1/switchyardv1alpha1connect"
	"github.com/fdatoo/switchyard/internal/automation/action"
)
```

Replace Apply:

```go
func (s *SceneService) Apply(ctx context.Context, req *connect.Request[v1.ApplySceneRequest]) (*connect.Response[v1.ApplySceneResponse], error) {
	if s.registry == nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("scene registry not configured"))
	}
	scene, ok := s.registry.GetScene(req.Msg.GetId())
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("scene not found"))
	}
	if s.dispatcher == nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("scene dispatcher not configured"))
	}

	correlationID := ulid.Make().String()
	run := &action.Run{
		CorrelationID: correlationID,
		AutomationID:  "scene:" + scene.ID, // audit lineage
		Dispatcher:    s.dispatcher,
	}

	// Parallel best-effort: every action gets its own goroutine.
	// Errors are logged, not surfaced — partial scenes are
	// acceptable per the design spec.
	var wg sync.WaitGroup
	for _, ac := range scene.Actions {
		executor := actionExecutorFor(ac)
		if executor == nil {
			slog.WarnContext(ctx, "scene apply: unsupported action kind",
				"scene_id", scene.ID, "action", ac.String())
			continue
		}
		wg.Add(1)
		go func(exec action.Executor) {
			defer wg.Done()
			if err := exec.Execute(ctx, run); err != nil {
				slog.WarnContext(ctx, "scene apply: action failed",
					"scene_id", scene.ID, "correlation_id", correlationID, "err", err)
			}
		}(executor)
	}
	wg.Wait()

	return connect.NewResponse(&v1.ApplySceneResponse{
		CorrelationId: correlationID,
	}), nil
}

// actionExecutorFor returns an action.Executor for a config-side ActionConfig.
// v1 only supports CallServiceAction (the most common action kind); unsupported
// kinds are logged and skipped by Apply.
func actionExecutorFor(ac *configpb.ActionConfig) action.Executor {
	if ac == nil {
		return nil
	}
	if cs := ac.GetCallService(); cs != nil {
		args := make(map[string]string, len(cs.GetArgs()))
		for k, v := range cs.GetArgs() {
			args[k] = v
		}
		return &action.CallServiceAction{
			Entity:     cs.GetEntity(),
			Capability: cs.GetCapability(),
			Args:       args,
		}
	}
	return nil
}
```

Note: `action.Executor` is the interface satisfied by `*CallServiceAction`. Verify it exists in `internal/automation/action/action.go`:
```bash
grep -n "type Executor interface" internal/automation/action/action.go
```
If the interface has a different name, match it. If there's no such interface (action types just have `Execute` methods directly), simplify by typing the local variable as `*action.CallServiceAction` and inlining the dispatch.

- [ ] **Step 4: Re-run the unknown-id test**

```bash
go test -run TestSceneService_Apply_UnknownID ./internal/api/... -v
```
Expected: PASS.

- [ ] **Step 5: Add a dispatch test**

Append to `service_scene_test.go`:

```go
type recordingDispatcher struct {
	mu    sync.Mutex
	calls []dispatchedCall
	failFor string  // if entity matches, return ok=false
}

type dispatchedCall struct {
	Entity, Capability string
	Args               map[string]string
}

func (d *recordingDispatcher) Dispatch(ctx context.Context, entity, capability string, args map[string]string) (*ghstarlark.DispatchResult, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.calls = append(d.calls, dispatchedCall{entity, capability, args})
	if entity == d.failFor {
		return &ghstarlark.DispatchResult{Ok: false, Error: "fake-failure"}, nil
	}
	return &ghstarlark.DispatchResult{Ok: true}, nil
}

func TestSceneService_Apply_DispatchesAllActions(t *testing.T) {
	disp := &recordingDispatcher{}
	scene := api.Scene{
		ID: "wind-down",
		Actions: []*configpb.ActionConfig{
			actionCall("light.kitchen", "turn_off", nil),
			actionCall("light.bedroom", "set_brightness", map[string]string{"value": "30"}),
		},
	}
	svc := api.NewSceneService(
		&fakeSceneReader{scenes: map[string]api.Scene{"wind-down": scene}},
		disp,
	)
	resp, err := svc.Apply(context.Background(), connect.NewRequest(&v1.ApplySceneRequest{Id: "wind-down"}))
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if resp.Msg.CorrelationId == "" {
		t.Fatal("Apply returned empty correlation_id")
	}
	if len(disp.calls) != 2 {
		t.Fatalf("dispatcher saw %d calls, want 2", len(disp.calls))
	}
}

func TestSceneService_Apply_PartialFailureBestEffort(t *testing.T) {
	disp := &recordingDispatcher{failFor: "light.bedroom"}
	scene := api.Scene{
		ID: "wind-down",
		Actions: []*configpb.ActionConfig{
			actionCall("light.kitchen", "turn_off", nil),
			actionCall("light.bedroom", "turn_off", nil), // will fail
		},
	}
	svc := api.NewSceneService(
		&fakeSceneReader{scenes: map[string]api.Scene{"wind-down": scene}},
		disp,
	)
	resp, err := svc.Apply(context.Background(), connect.NewRequest(&v1.ApplySceneRequest{Id: "wind-down"}))
	if err != nil {
		t.Fatalf("Apply should succeed even with a partial failure, got: %v", err)
	}
	if resp.Msg.CorrelationId == "" {
		t.Fatal("Apply returned empty correlation_id")
	}
	if len(disp.calls) != 2 {
		t.Fatalf("dispatcher saw %d calls, want 2 (both attempted)", len(disp.calls))
	}
}

// actionCall is a tiny helper to build a CallServiceAction wrapped in an
// ActionConfig. Mirrors the on-wire shape produced by the evaluator.
func actionCall(entity, capability string, args map[string]string) *configpb.ActionConfig {
	return &configpb.ActionConfig{
		Kind: &configpb.ActionConfig_CallService{
			CallService: &configpb.CallServiceAction{
				Entity:     entity,
				Capability: capability,
				Args:       args,
			},
		},
	}
}
```

Add the missing imports to the test file:
```go
import (
	"context"
	"sort"
	"sync"
	"testing"

	"connectrpc.com/connect"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	v1 "github.com/fdatoo/switchyard/gen/switchyard/v1alpha1"
	"github.com/fdatoo/switchyard/internal/api"
	ghstarlark "github.com/fdatoo/switchyard/internal/starlark"
)
```

If `ghstarlark.DispatchResult` lives at a different import path, locate it via:
```bash
grep -rn "type DispatchResult\b" internal/ | head -3
```
Match the correct package path.

- [ ] **Step 6: Run all SceneService tests**

```bash
go test -run TestSceneService ./internal/api/... -v
```
Expected: all four tests PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/api/service_scene.go internal/api/service_scene_test.go
git commit -m "api: SceneService.Apply — parallel best-effort, returns correlation_id"
```

---

## Task 9: Wire SceneService into the daemon

**Files:**
- Modify: `internal/api/service_unimplemented.go`
- Modify: `internal/daemon/daemon.go`

- [ ] **Step 1: Remove the SceneService stub**

Edit `internal/api/service_unimplemented.go`. Delete the SceneService struct, constructor, and the three handler methods (lines around 16-32 from the earlier grep — they all reference `*SceneService`). Keep the rest of the file intact.

- [ ] **Step 2: Construct + register the real SceneService in daemon.go**

In `internal/daemon/daemon.go`, find the line `Scene: api.NewSceneService(),` (it's in the services map). Replace it with the wired-up call:

```go
		Scene: api.NewSceneService(
			&sceneReaderAdapter{reg: d.registry},
			&carportAdapter{host: d.carport},
		),
```

(`carportAdapter` is the same adapter already passed as the automation engine's Dispatcher — search for it earlier in the file. The same instance can be shared, but cheap to construct fresh.)

Then add the adapter near the existing `areaReaderAdapter` (search for `type areaReaderAdapter`). After it, add:

```go
type sceneReaderAdapter struct {
	reg *registry.Registry
}

func (a *sceneReaderAdapter) ListScenes() []api.Scene {
	if a.reg == nil {
		return nil
	}
	src := a.reg.ListScenesInMemory()
	out := make([]api.Scene, 0, len(src))
	for _, s := range src {
		out = append(out, api.Scene{ID: s.ID, DisplayName: s.DisplayName, Actions: s.Actions})
	}
	return out
}

func (a *sceneReaderAdapter) GetScene(id string) (api.Scene, bool) {
	if a.reg == nil {
		return api.Scene{}, false
	}
	s, ok := a.reg.GetSceneInMemory(id)
	if !ok {
		return api.Scene{}, false
	}
	return api.Scene{ID: s.ID, DisplayName: s.DisplayName, Actions: s.Actions}, true
}
```

- [ ] **Step 3: Build + run full daemon tests**

```bash
go build ./...
go test ./internal/daemon/... ./internal/api/...
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add internal/api/service_unimplemented.go internal/daemon/daemon.go
git commit -m "daemon: wire real SceneService (registry + carport dispatcher)"
```

---

## Task 10: Sample scene in dev Pkl + end-to-end Playwright

**Files:**
- Modify: `~/.local/share/switchyard/config/main.pkl` (gitignored — not committed)

- [ ] **Step 1: Add a sample scene to dev config**

Edit `~/.local/share/switchyard/config/main.pkl`. Add an import for scenes at the top alongside the existing `auto` and `ar` imports:
```pkl
import "switchyard:scenes" as sc
```

Then add a `scenes` block. Pick an entity in the living room that's safe to toggle (NOT the Bedroom lamp per the saved preference):

```pkl
scenes = new {
  new sc.Scene {
    id          = "tv-mode"
    displayName = "TV mode"
    actions = new {
      new auto.CallServiceAction {
        entity     = "light.hue_689c9b8a"  // TV Light Strip
        capability = "set_brightness"
        args = new { ["value"] = "60" }
      }
      new auto.CallServiceAction {
        entity     = "light.hue_7fb5a9eb"  // Main lights
        capability = "turn_off"
        args = new {}
      }
    }
  }
}
```

- [ ] **Step 2: Rebuild + restart daemon**

```bash
cd /Users/fdatoo/Developer/Switchyard
go build -o dist/switchyardd ./cmd/switchyardd
pkill -TERM -f "dist/switchyardd" 2>&1; sleep 2; rm -f ~/.local/share/switchyard/switchyardd.lock
( source ~/.local/share/switchyard/config/secrets.env && exec /Users/fdatoo/Developer/Switchyard/dist/switchyardd ) > /tmp/switchyardd.log 2>&1 &
sleep 5
ls -la ~/.local/share/switchyard/switchyardd.sock 2>&1 | head -1
```
Expected: socket appears, no startup errors in `/tmp/switchyardd.log`.

- [ ] **Step 3: Verify via curl**

```bash
SOCK=~/.local/share/switchyard/switchyardd.sock
curl -s --unix-socket "$SOCK" -H 'Content-Type: application/json' -H 'Connect-Protocol-Version: 1' -d '{}' \
  http://localhost/switchyard.v1alpha1.SceneService/List
```
Expected: JSON with `tv-mode` in the scenes array.

```bash
curl -s --unix-socket "$SOCK" -H 'Content-Type: application/json' -H 'Connect-Protocol-Version: 1' -d '{"id":"tv-mode"}' \
  http://localhost/switchyard.v1alpha1.SceneService/Apply
```
Expected: JSON with a `correlationId` field, no error.

- [ ] **Step 4: Playwright validation**

Navigate to `http://localhost:5174/rooms/living_room`. Verify:
1. Scenes section is now visible (was previously suppressed when daemon returned 501).
2. A "TV mode" chip appears.
3. Clicking it: chip enters busy state briefly; physical lights flip (TV Light Strip to 60%, Main lights off).
4. No inline error.
5. Activity section picks up the new state_changed events within a few seconds.

Take screenshots: `scenes-chip-visible.png`, `scenes-after-apply.png`.

- [ ] **Step 5: Cross-page sanity sweep**

Visit /, /rooms, /devices, /activity, /automations, /settings. Confirm zero new console errors and no regressions in any other section.

- [ ] **Step 6: Full Go test pass**

```bash
go test ./...
```
Expected: all PASS.

- [ ] **Step 7: No commit needed**

The dev Pkl file is gitignored (`~/.local/share/switchyard/config/`). Implementation is fully committed via Tasks 1-9.

---

## Self-review notes

**Spec coverage:**
- Pkl Scene class + scenes Listing → Task 1.
- SceneConfig proto + ConfigSnapshot.scenes → Task 2.
- Evaluator carry-through → Task 3.
- Registry scene store → Task 4.
- syncScenesToRegistry on config Apply → Task 5.
- SceneReader interface → Task 6.
- SceneService.List → Task 7.
- SceneService.Apply (parallel best-effort) → Task 8.
- SceneService.Preview (empty stub) → Task 7 (skeleton).
- Daemon wiring (replace stub) → Task 9.
- Sample scene + E2E → Task 10.

**Placeholder scan:**
- "If the interface has a different name, match it." (Task 8) is a deliberate stop-and-look — the action package may or may not export an Executor interface. The fallback (typed local variable + direct method call) is spelled out.
- "If `ghstarlark.DispatchResult` lives at a different import path" (Task 8) — also a stop-and-look with the exact grep to find the right path.
- No vague "add error handling" or "test the above" — every test step shows full code.

**Type consistency:**
- `api.Scene` (Task 6) and `registry.Scene` (Task 4) share the same field shape (`ID`, `DisplayName`, `Actions []*configpb.ActionConfig`). The adapter in Task 9 maps cleanly.
- `SceneReader.ListScenes` (Task 6) ↔ `Registry.ListScenesInMemory` (Task 4) — adapter renames at the boundary, matches existing pattern (`AreaReader.ListAreas` vs `Registry.ListAreasInMemory`).
- Apply's `correlation_id` (Task 8) matches the proto's `correlation_id` (lowercase snake → CorrelationId on the Go struct).
