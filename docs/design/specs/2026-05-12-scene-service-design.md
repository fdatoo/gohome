# SceneService implementation — design

**Status:** Draft
**Date:** 2026-05-12
**Branch:** `feat/new-ui`

## Problem

`SceneService` exists as a proto (`List`, `Apply`, `Preview`) but the
daemon ships only the `Unimplemented` stub. The new Vue UI's
`RoomDetailView` is already wired to call `listScenes` / `applyScene`
and renders `SyScene` chips when scenes are present; in production
it silently suppresses the Scenes section because the stub returns
`501`. Scenes are a familiar smart-home concept ("Wind down",
"Movie", "All off") and the easiest user-facing win to add now that
Areas and the Devices controls are live.

## Goal

Replace the SceneService stub with a real implementation. Scenes are
declared in Pkl, persisted only through the config snapshot (not
event-sourced), and applied in parallel via the existing automation
action dispatcher. The Vue UI already consumes the API; no UI change
is required for the feature to appear.

In scope:

- Pkl `class Scene { id, displayName, actions }` reusing the existing
  `CallServiceAction` type.
- `config.scenes: Listing<Scene>` on the config root.
- `SceneConfig` message on `ConfigSnapshot`.
- Evaluator carries Pkl scenes through to the proto.
- Registry holds scenes in-memory, refreshed on every config Apply.
- New `internal/api/service_scene.go` replaces the unimplemented stub:
  - `List` — returns the registry's scenes.
  - `Apply` — fans out all actions in parallel, best-effort, returns a
    fresh `correlation_id`.
  - `Preview` — returns empty `lines: []` (intentionally stubbed; full
    implementation is its own future design).
- Daemon wires the real service with the existing `CommandDispatcher`.

Out of scope (explicit follow-ups):

- `Preview` — defer until a UX requirement appears.
- Per-area scene scoping — scenes are global; per-room curation was
  cut during the earlier room-dashboard brainstorm.
- Scene editing UI — declarative Pkl only.
- Scene-triggered scenes — the action repertoire is just
  `CallServiceAction`.
- New `ScriptAction` or `BlockAction` for scenes — same reason.

## Architecture

### Apply flow

```
SceneService.Apply(id)
   ├─ registry.GetScene(id) — NotFound if absent
   ├─ build minimal action.Run {
   │     CorrelationID: new ULID,
   │     AutomationID:  "scene:" + id,    // audit lineage
   │     Dispatcher:    <injected>,
   │   }
   ├─ for each action in scene.actions:
   │     go execAction(ctx, run)         // parallel best-effort
   ├─ wait (errgroup-style; collect errors but don't fail-fast)
   ├─ log per-action errors via slog (scene id + action target)
   └─ return correlation_id
```

Per-action failures don't fail the RPC — Apply always returns
`success: true` and the correlation id once all goroutines settle.
The user-facing chip's busy state clears at that point. If the user
needs per-entity outcome, the resulting `state_changed` (or absence)
flows through to the Activity feed via the normal event path.

### Why parallel best-effort

- Tapping a chip should feel instant; serializing N bridge round-trips
  is visibly slow with 5+ entities.
- A partial scene (some lights respond, one doesn't) is acceptable for
  v1 — the activity feed surfaces the discrepancy.
- The existing automation engine runs actions sequentially per
  automation; that's correct for automation semantics (causal chains)
  but wrong for scenes (independent commands).

### Why reuse `CallServiceAction`

- The Pkl `Action` union is already established and users know its shape.
- `CallServiceAction.Execute(ctx, run)` only needs `run.Dispatcher`,
  `run.CorrelationID`, and `run.AutomationID`. We construct a minimal
  `Run` with those three set; other fields stay nil. The action never
  touches them.
- The proto's `ActionConfig` is the canonical wire representation;
  scenes get it for free via the existing evaluator's `decodeAction`.

## Components

### Pkl

`internal/config/pkl/switchyard/scenes.pkl` *(new module)*:

```pkl
module switchyard.scenes

import "switchyard:automations" as auto

class Scene {
  id:          String(!isEmpty)
  displayName: String
  actions:     Listing<auto.CallServiceAction>
}
```

`internal/config/pkl/switchyard/config.pkl` *(modify)*:

```pkl
import "switchyard:scenes" as sc
…
scenes: Listing<sc.Scene> = new {}
```

### Proto

`proto/switchyard/config/v1/snapshot.proto` *(modify)*:

```proto
message ConfigSnapshot {
  …
  repeated SceneConfig scenes = 31;   // 30-39: assignments / overrides
}

message SceneConfig {
  string                 id           = 1;
  string                 display_name = 2;
  repeated ActionConfig  actions      = 3;
}
```

Field 31 sits alongside the existing `entity_areas = 30` in the
"assignments / overrides" band — scenes are declarative, not
runtime-mutable.

### Evaluator

`internal/config/evaluator.go` *(modify)*:

```go
type configJSON struct {
  …
  Scenes []sceneJSON `json:"scenes"`
}

type sceneJSON struct {
  ID          string            `json:"id"`
  DisplayName string            `json:"displayName"`
  Actions     []json.RawMessage `json:"actions"`
}
```

Plus a loop in `parseConfigJSON` that decodes each scene's actions
via the existing `decodeAction` helper (the same one used for
automations) and appends to `snap.Scenes`.

### Registry

`internal/registry/scenes.go` *(new — same pattern as `areas.go`)*:

```go
type Scene struct {
  ID, DisplayName string
  Actions         []*configpb.ActionConfig
}

func (r *Registry) SetScenes(scenes []Scene)
func (r *Registry) ListScenesInMemory() []Scene
func (r *Registry) GetSceneInMemory(id string) (Scene, bool)
```

`internal/registry/registry.go` gains `scenes map[string]Scene` and
a second mutex (or extend the existing `areaMu` to cover scenes; areas
and scenes have the same config-driven lifecycle so sharing the mutex
is fine).

`internal/daemon/area_sync.go` is renamed to `config_sync.go` and grows
a `syncScenesToRegistry` companion. Both areas and scenes sync on the
same OnApplied callback, sharing the same one-shot initial sync the
daemon already does for areas.

### Service

`internal/api/service_scene.go` *(new — replaces the SceneService
entries in `service_unimplemented.go`)*:

```go
type SceneService struct {
  registry    SceneReader              // ListScenesInMemory, GetSceneInMemory
  dispatcher  action.CommandDispatcher // same as automation engine
}

func (s *SceneService) List(ctx, req) (*ListScenesResponse, error)
func (s *SceneService) Apply(ctx, req) (*ApplySceneResponse, error)
func (s *SceneService) Preview(ctx, req) (*PreviewSceneResponse, error)  // empty lines
```

Apply uses a `sync.WaitGroup` (parallel best-effort — no errgroup
fail-fast). Per-action errors logged via `slog.WarnContext` with scene
id + action target.

### Daemon wiring

`internal/daemon/daemon.go`:

- Remove SceneService from the unimplemented services bundle.
- Construct `api.NewSceneService(registry, dispatcher)` where
  `dispatcher` is the `automation.Engine`'s underlying
  `CommandDispatcher` (already exposed for automations).
- Register it in `services` so `BuildRoutes` includes it.

The new `SceneReader` interface in `internal/api/deps.go` is the
narrow read API the service needs — the daemon supplies a small
adapter over the registry, identical pattern to `AreaReader`.

## Errors

| Case | Code |
|---|---|
| Apply id not found | `CodeNotFound` |
| Apply with nil dispatcher (misconfigured daemon) | `CodeInternal` |
| Per-action failures | Logged only; Apply returns success |
| Preview (any) | Returns empty lines, no error |
| List | Always succeeds; empty if no scenes declared |

## Testing

### Go unit / integration

`internal/api/service_scene_test.go` *(new)*:

- `TestSceneService_List_ReturnsRegistryScenes` — seed the registry
  via a fake reader; List returns the same set.
- `TestSceneService_Apply_UnknownID` — Apply against an empty
  registry returns NotFound.
- `TestSceneService_Apply_DispatchesAllActions` — fake
  CommandDispatcher records calls; Apply on a 3-action scene records
  3 (entity, capability, args) tuples and returns success.
- `TestSceneService_Apply_PartialFailureBestEffort` — fake dispatcher
  fails on one entity; Apply still returns success and a correlation
  id; the other dispatches still ran.
- `TestSceneService_Preview_ReturnsEmpty` — Preview on any id returns
  `{lines: []}`, no error.

`internal/registry/scenes_test.go` *(new)*:
- `TestRegistry_SetScenes_ReplacesPreviousSet`
- `TestRegistry_GetSceneInMemory_NotFound`

`internal/config/evaluator_test.go` *(extend)*:
- Add a `TestEvaluator_ScenesCarryThrough` case: a Pkl fixture
  declaring two scenes evaluates to a `ConfigSnapshot.Scenes` with
  both, and the actions decode to their proto shapes correctly.

### End-to-end (Playwright)

- Add a sample scene to dev Pkl: e.g. `Living-room TV mode` that
  flips the TV Light Strip on at 60%. Restart daemon.
- Navigate to `/rooms/living_room`, verify Scenes section renders the
  chip, click it, confirm:
  1. Chip enters busy state briefly.
  2. The TV Light Strip flips on (live entity state confirms via the
     stream).
  3. No inline error.
- Verify the chip respects the saved preference: scenes should not
  touch the Bedroom lamp.

## Edge cases

- **Empty actions list** — scene exists with no actions. Apply runs
  zero goroutines, returns immediately with a correlation id. List
  shows it normally.
- **Duplicate scene ids** — evaluator preserves the last one (Pkl
  Listing semantics). No collision error; the user sees the
  last-declared scene's actions on Apply.
- **Action references unknown entity** — dispatcher returns the
  driver-not-running error; logged; doesn't fail the RPC.
- **Concurrent Apply of the same scene** — each call gets its own
  correlation id, runs its own goroutines. No locking. Two rapid
  taps fire the actions twice, which is the user's intent (idempotent
  capabilities like `set_brightness` are no-op on second call;
  non-idempotent like `toggle` would flip twice — but `CallService`
  uses explicit capabilities like `turn_on`, not toggle).
