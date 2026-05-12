# Scenes end-to-end — design spec

**Date:** 2026-05-12
**Status:** approved, ready for plan
**Closes:** the gap left by the auto-discovery + Track A work where scenes existed as data in the snapshot (`snap.Scenes`) but nothing executed them and no UI could create them. Also lights up the existing stubs at `SceneService.{List,Apply,Preview}` and the front-end's already-wired `applyScene` button on `RoomDetailView`.

## Goal

Make scenes a first-class, end-to-end product surface:

1. **Schema:** scenes gain an optional `area_id` so they can be room-scoped or global.
2. **Runtime:** `SceneService.{List,Apply,Preview}` work for real. Apply executes a scene's actions in parallel via the existing action executor; best-effort error collection. Automations containing `SceneAction { slug = ... }` actually invoke the scene's actions (today's `StubSceneApplier` is replaced).
3. **UI:** room-scoped scenes appear on `/rooms/:id`; global scenes (no `area_id`) appear on the `/rooms` index. "+ New scene" lives on both surfaces and auto-scopes via the invocation context.
4. **Forms:** new `SySceneForm` (id, displayName, areaId, actions) and `SyAreaForm` (id, displayName, parentId). Both save via the existing `EditSession.CommitEdit` flow; Track A's reactive subscription makes the list views update without a page reload.

## Non-goals

- Scene parameters (no per-invocation inputs).
- Scene scheduling — scenes run from `SceneService.Apply` or from inside automation `SceneAction`s only.
- Scene composition UI — declaring a `SceneAction` inside another scene's actions works at the Pkl level but doesn't get a dedicated UI affordance.
- Cascade-deleting scenes when their area is deleted — dangling refs surface as a soft validation error instead.
- "Run in dry-run mode" — `Preview` covers the textual side; no half-execution.

## Schema changes

### Proto

```proto
message SceneConfig {
  string id           = 1;
  string display_name = 2;
  repeated ActionConfig actions = 3;
  string area_id      = 4;  // optional; empty = global
}
```

### Pkl

Both the plural `switchyard:scenes` module and the singular `switchyard:scene` template gain:

```
areaId: String? = null
```

Empty/null = global scene. The amend-form template's emit unchanged otherwise.

### Validation

`internal/config/compile.go` adds a check: for each scene with non-empty `area_id`, the value must reference a declared area id. Failure → `ValidationError{Code: "dangling_area_ref", Field: "scenes[<id>].area_id"}`. Soft error (snapshot still loads); rendered alongside other compile errors.

## Data flow

```
1. User clicks "+ New scene" on /rooms (global) or /rooms/:id (scoped).
2. SySceneForm opens. areaId is hidden but pre-populated from context.
3. User fills id, displayName, actions[]. Save.
4. Form regen-renders to Pkl, calls EditSession.OpenForEdit + CommitEdit.
5. CommitEdit writes scenes/<id>.pkl and triggers reloader (Track A).
6. Reloader → Manager.Apply → discovery picks up file → snapshot updated.
7. ConfigPubsub publishes ConfigChanged → configStore.onChanged fires.
8. /rooms or /rooms/:id refetches via listScenes() and the new scene appears.
9. User clicks "Apply" on the scene → SceneService.Apply RPC.
10. Daemon's scene.Applier looks up scene by id, compiles actions, executes in parallel via action.Executor, appends "scene_applied" event with per-action outcomes.
```

## Runtime

### New package: `internal/automation/scene`

```
internal/automation/scene/
  applier.go        // Applier struct + Invoke method
  applier_test.go
  errors.go         // ErrSceneNotFound and friends
```

The `Applier` reuses the existing `internal/automation/action` package's `Executor` interface and `Run` struct. It does NOT depend on the `automation` engine itself (no triggers, no conditions, no engine state); it's a thinner orchestrator.

```go
type Applier struct {
    snap     SnapshotReader
    state    StateReader
    dispatch CommandDispatcher
    store    EventAppender
    scripts  ScriptCaller
    runtime  *starlark.Runtime
    logger   *slog.Logger
    metrics  *observability.Metrics
}

func (a *Applier) Invoke(ctx context.Context, sceneID, correlationID, invokedBy string) error {
    snap := a.snap.Current()
    scene := lookup(snap, sceneID)
    if scene == nil {
        return ErrSceneNotFound
    }

    // Compile each ActionConfig into an action.Executor (reuse the
    // automation engine's existing compiler at internal/automation/compile.go).
    // Wrap in a ParallelBlock executor with continueOnError=true.
    parallel := compileScene(scene)

    run := &action.Run{
        CorrelationID: correlationID,
        AutomationID:  "scene:" + sceneID, // tag origin; scene Apply runs share the Run struct shape
        State:         a.state,
        Dispatcher:    a.dispatch,
        Store:         a.store,
        Scenes:        a, // SceneActions inside scenes recurse here
        Scripts:       a.scripts,
        Runtime:       a.runtime,
        Logger:        a.logger,
        Metrics:       a.metrics,
    }
    err := parallel.Execute(ctx, run)

    // Append "scene_applied" event (new payload kind) with per-action
    // outcomes pulled from run.Logs.
    a.store.Append(ctx, eventstore.Event{
        Kind: "scene", Source: "scene.Applier",
        Payload: &eventv1.Payload{Kind: &eventv1.Payload_SceneApplied{
            SceneApplied: &eventv1.SceneApplied{
                SceneId:       sceneID,
                AreaId:        scene.GetAreaId(),
                CorrelationId: correlationID,
                InvokedBy:     invokedBy,
                Steps:         run.Steps,
                Logs:          run.Logs,
                Outcome:       outcomeFor(err),
            },
        }},
    })
    return err
}
```

### Wiring

`internal/daemon/daemon.go` currently constructs `action.StubSceneApplier{}` and threads it into the automation engine. Replace with the real `scene.Applier`, sharing the same instance with `SceneService` so automation `SceneAction` and direct RPC `Apply` go through the same code path.

### SceneService

Replace the stubs at `internal/api/service_unimplemented.go` with a real `internal/api/service_scene.go`:

```go
type SceneService struct {
    snap    SnapshotReader
    applier SceneInvoker  // wraps scene.Applier
    logger  *slog.Logger
}

func (s *SceneService) List(ctx, req) — projects snap.Scenes →
    []v1.Scene{id, display_name, area_id}. No filtering at the
    service layer; clients filter (RoomDetailView by area_id;
    /rooms index by !area_id).

func (s *SceneService) Apply(ctx, req) — generates correlation_id,
    calls applier.Invoke asynchronously (returns immediately), maps
    ErrSceneNotFound → connect.CodeNotFound.

func (s *SceneService) Preview(ctx, req) — looks up scene, returns
    one human-readable line per action ("Turn on light.kitchen",
    "Set light.living_room brightness to 40"). Synchronous, no
    carport calls.
```

The `v1.Scene` proto message gains `string area_id = 3` (added alongside the existing `id` and `display_name`).

### Concurrency

Scenes are state-setters and idempotent. No `mode` field (unlike automations). Two concurrent Applies for the same scene just run twice — the carport dispatcher's per-entity ordering handles the rest. No queue, no single-mode lockout.

### Execution semantics

Actions run **in parallel**, best-effort, with `continueOnError=true` for each child:

- All actions are dispatched; each completes independently.
- Per-action errors collected.
- The `Apply` RPC returns success (just `correlation_id`) as soon as the scene is found and dispatch starts — it does not wait for actions to complete. The per-action results live in the event-store record (`scene_applied` payload), readable via the Activity stream.
- A scene whose actions all fail still produces a `scene_applied` event with outcome=failure; the RPC itself does not retroactively error.

This diverges from automation semantics (sequential by default). The asymmetry is intentional: automations describe a causal chain ("if X then Y then Z"); scenes describe a target state ("set this configuration").

## UI

### `/rooms` (index)

Existing rooms grid stays. New section below:

```
─────────────────────────────────────
[+ New area]    [+ New scene]
─────────────────────────────────────
Global scenes
  ▸ All lights off       [Apply]  [⋯]
  ▸ Goodnight            [Apply]  [⋯]
  ▸ Movie mode (entire house)  [Apply]  [⋯]
─────────────────────────────────────
```

Populated by `listScenes().filter(s => !s.areaId)`. The "+ New scene" button opens `SySceneForm` with `areaId=""`. The "+ New area" button opens `SyAreaForm`. Edit and overflow actions defer to v2 (the file picker in Settings → Pkl already covers manual editing).

### `/rooms/:id` (detail)

Existing scene list changes from "all scenes" to "scenes scoped to this room" — `listScenes().filter(s => s.areaId === route.params.id)`. New "+ New scene" button opens `SySceneForm` with `areaId=route.params.id` (hidden, non-editable).

### `SySceneForm.vue` (new)

Mirror of `SyAutomationForm` in `app/src/views/automations/`. Field set:

| Field | Type | Source |
|-------|------|--------|
| id | text (kebab-case) | user |
| displayName | text | user |
| areaId | hidden string | invocation context (empty for global, set for room-scoped) |
| actions[] | `ActionEditor[]` (reused unchanged) | user |

On save: build the AST, call `regenPreview` with `fileType: "scene"`, write to `scenes/<id>.pkl` via `EditSession.OpenForEdit` + `CommitEdit`. Track A's reactive loop updates the list views.

### `SyAreaForm.vue` (new)

Smaller form. Field set:

| Field | Type | Source |
|-------|------|--------|
| id | text (kebab-case) | user |
| displayName | text | user |
| parentId | optional dropdown of existing area ids | user |

On save: `RenderArea` → `areas/<id>.pkl` → `CommitEdit`. Same reactive-refresh path.

### `regen.RenderScene` extension

Update the existing `internal/automation/regen/scene.go` to emit `areaId = "..."` line when non-empty. Migration: existing test goldens regenerate (we did this once already for the amend-form switch).

### `applyScene` failure surfacing

When Apply returns with per-action errors, surface via a transient toast banner in the calling view. If no toast system exists, fallback is a `console.warn` plus the existing Activity stream entry (which we already emit via the new `scene_applied` event). The Activity stream becomes the forensic surface.

## Error handling

| Failure | Behavior |
|---------|----------|
| Scene with dangling `area_id` | Soft `ValidationError{Code: "dangling_area_ref"}`. Snapshot still loads. UI shows the scene in the global section (since its area can't be resolved) and the validation report flags it. |
| `SceneService.Apply` with unknown id | `connect.CodeNotFound`. UI surfaces the error in a toast/banner. |
| Mid-scene action failure | Best-effort. All actions attempted. `scene_applied` event records per-action outcomes. UI's Activity stream entry shows the partial success. |
| Concurrent Apply of same scene | Both run. Idempotent semantics — carport dispatcher's per-entity ordering handles the rest. |
| Apply during daemon reload | Apply takes a snapshot reference at call time. In-flight invocation runs against that snapshot even if reload swaps the live one. |
| Action targets entity in different area than `scene.area_id` | Not an error. Area is a UX scope, not an enforcement boundary. |
| Automation triggers a deleted scene via `SceneAction` | `ErrSceneNotFound` from `Applier.Invoke` propagates up as the action's error; the automation's existing `continueOnError` flag decides whether the rest of the automation continues. |

## Testing

### Unit (Go)

`internal/automation/scene.Applier`:

- `Invoke` happy path: scene with two `CallServiceAction`s → both dispatched, `scene_applied` event appended.
- `Invoke` partial-failure path: stub dispatcher returns error for one entity → other action still dispatched, event payload records per-action outcomes.
- `Invoke` of unknown scene → `ErrSceneNotFound`, no event appended.

`internal/api/service_scene.go`:

- `List` returns all scenes from snapshot (no service-side filtering).
- `Apply` returns a non-empty `correlation_id` for valid scenes; `NotFound` for missing.
- `Preview` returns N lines for N actions (CallService → "Set/Turn entity capability"; Scene → "Apply scene <slug>"; Script → "Run script <name>"; etc.).

`internal/config.Compile`:

- Scene with valid `area_id` → no error.
- Scene with dangling `area_id` → `ValidationError{Code: "dangling_area_ref"}`.

### Integration (Go, real Pkl + carport fake)

- Declare a global scene + a room-scoped scene in `main.pkl`. `SceneService.List` returns both. `Apply` each → carport fake records the expected dispatches.
- Discovery: write `scenes/<id>.pkl` to a temp configDir with `areaId = "kitchen"`. Reload. Verify the scene appears in the snapshot with the right area.
- Automation containing `SceneAction { slug = "movie-night" }` runs → the carport fake records both the automation's own actions AND the scene's actions (i.e., the real Applier replaced the stub).

### End-to-end (Playwright + live daemon)

The same harness used to validate Track A's loop-closure:

- Navigate to `/rooms`. Assert "Global scenes" section visible. Click "+ New scene". Fill form. Save. Assert new scene appears in Global section within 2s (configStore loop).
- Navigate to `/rooms/<existing-room-id>`. Click "+ New scene". Save. Assert scene appears in room scoped list, NOT in the global section.
- Click "Apply" on a scene. Assert the Activity stream shows the new `scene_applied` event with the scene id within 2s.

## Migration

- One-time regen-test golden updates for `RenderScene` (gains an `areaId = "..."` line when set; absent when global). Drop and regenerate goldens.
- No user-facing config-file migration required: existing scenes have empty `area_id` (global by default), which is the v1 behavior.

## Component boundaries

| Component | Inputs | Outputs | Responsibility |
|-----------|--------|---------|----------------|
| `scene.Applier` | `SnapshotReader`, dispatcher, store, scripts, runtime | `scene_applied` event + `error` | Invoke a scene by id; execute its actions in parallel; record per-action outcomes |
| `api.SceneService` | `SnapshotReader`, `SceneInvoker` (interface over Applier) | gRPC responses | Project snap → proto; route Apply RPC; return Preview lines |
| `regen.RenderScene` | `*configpb.SceneConfig` | `[]byte` | Emit canonical Pkl for one scene (gains `areaId` line) |
| `SySceneForm.vue` | optional `initial`, mounting-context `areaId` | save event | Build AST, regen, commit; emits `saved` |
| `SyAreaForm.vue` | optional `initial` | save event | Build AST, regen, commit |
| `compile.go` (area-ref check) | `*configpb.ConfigSnapshot` | `[]ValidationError` | Validate dangling area refs |

Each unit testable in isolation: applier against fake dispatcher; service against fake applier; form against fake `EditSession` client.
