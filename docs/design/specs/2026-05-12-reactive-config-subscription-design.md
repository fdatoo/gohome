# Reactive config subscription — design spec

**Date:** 2026-05-12
**Status:** approved, ready for plan
**Closes:** the gap left by the editors + auto-discovery plans where form-driven saves and filesystem edits update the daemon snapshot but never propagate to the front-end. Today users save a new automation and see stale data until a full page reload.

## Goal

Make config changes propagate end-to-end in real time:

1. Form `CommitEdit`, filesystem edits under `<configDir>/`, and explicit `Reload` RPC calls all trigger the daemon to re-evaluate config and update its in-memory snapshot.
2. The daemon broadcasts a `ConfigChanged` event to subscribed clients on each successful update.
3. Front-end views subscribe once at app startup and re-fetch their slice of config when the event fires.
4. A user-facing "Reload config" button in the topbar's connection menu gives users an explicit recovery path.

## Non-goals

- Persistent reload history. Only "last reload at" is surfaced in the connection menu.
- Per-kind subscriptions (automations-only, areas-only). Subscribe streams a single event for all changes; views re-fetch their kind.
- Streaming the full snapshot. The event is a tick (timestamp + bundle hash); views re-fetch via existing `listAutomations` / `listAreas` / `listScenes` calls.
- Reload-progress UI. If `Reload` blocks long enough to need a spinner we add one later.
- Polling fallback. Server-streaming Connect RPCs are the established pattern (mirroring `EntityService.Subscribe`); no parallel polling code.

## Architecture

```
                                                          ┌──────────────────────┐
  form save  ──► EditSessionService.CommitEdit ──┐        │ ConfigService        │
                                                  │        │  .Subscribe (stream) │
  fs change  ──► config.Watcher (existing) ──────┼──► Manager.Apply ──► pubsub ──┤  ConfigChanged ──► front-end
                                                  │                              │  Heartbeat
  user click ──► ConfigService.Reload (existing) ─┘        │                      │
                                                          └──────────────────────┘
```

Three reload paths converge on `Manager.Apply`. Each successful Apply publishes a `ConfigChanged` event on a new internal pub/sub. The Subscribe RPC tails the pub/sub and streams events to clients.

## Components

### Daemon-side

**`internal/config/reloader.go` (new)** — `Reloader` owns the debounce + Manager.Apply orchestration:

- `Trigger(source string)` — non-blocking call that requests a reload. Sources are `"form"`, `"watcher"`, `"rpc"` for telemetry/logging.
- A single goroutine wakes on the trigger signal, sleeps 250ms, drains any further triggers that arrived during the sleep, then calls `Manager.Apply`. On success, publishes `ConfigChanged`. On failure, publishes nothing and stores the error for retrieval via the next `Reload` RPC response.
- Wired to the existing `Watcher` as a second subscriber (alongside editsession's `ExternalEditDetected`). The reloader's watcher subscriber filters by path: only fires for `main.pkl`, files under `automations/`, `areas/`, `scenes/`, and `entity-areas.pkl`.

**`internal/config/pubsub.go` (new)** — bounded fan-out pub/sub for `ConfigChanged` events:

- `Subscribe() (ch <-chan ConfigChanged, unsubscribe func())` — buffered channel, cap 16.
- `Publish(ConfigChanged)` — non-blocking; drops oldest pending event if a subscriber's channel is full.
- `Heartbeat(ConfigHeartbeat)` — same delivery semantics but published by an independent ticker (30s).

The "drop oldest on backpressure" choice is deliberate: a slow client falling behind has no use for stale events. The heartbeat ensures even a starved client eventually proves the stream is alive.

**`internal/api/config_subscribe.go` (new)** — gRPC handler that registers a subscriber, forwards events to the stream, unregisters on disconnect. Includes a 30s heartbeat ticker.

**Hooks into existing code:**

- `EditSessionService.CommitEdit` (`internal/editsession/service.go`): on successful write, call `reloader.Trigger("form")`.
- `Watcher`'s subscriber list (`internal/config/watcher.go`): add `reloader.OnFileChange` alongside the existing editsession subscriber.
- `ConfigService.Reload` handler: replace the existing direct `Manager.Apply` call with `reloader.Trigger("rpc")`. The RPC response carries the most recent error if Apply failed (so the user gets feedback on the manual-button path).

### Proto

Extend `proto/switchyard/v1alpha1/config.proto`:

```proto
service ConfigService {
  rpc Validate      (ValidateConfigRequest)       returns (ValidateConfigResponse);
  rpc Apply         (ApplyConfigRequest)          returns (ApplyConfigResponse);
  rpc Reload        (ReloadConfigRequest)         returns (ReloadConfigResponse);
  rpc Subscribe     (SubscribeConfigRequest)      returns (stream SubscribeConfigEvent);
  rpc GetArtifact   (GetConfigArtifactRequest)    returns (GetConfigArtifactResponse);
  rpc EvalCompute   (EvalComputeRequest)          returns (EvalComputeResponse);
  rpc RegenPreview  (RegenPreviewRequest)         returns (RegenPreviewResponse);
}

message SubscribeConfigRequest {}

message SubscribeConfigEvent {
  oneof event {
    ConfigChanged changed   = 1;
    Heartbeat     heartbeat = 2;
  }
}

message ConfigChanged {
  int64  at_unix_ms  = 1;
  string bundle_hash = 2;
}

message Heartbeat {
  int64 at_unix_ms = 1;
}

// Augment the existing ReloadConfigResponse with an error surface so the
// manual-reload button can show meaningful feedback when Apply fails.
message ReloadConfigResponse {
  ConfigDiff diff           = 1;
  string     correlation_id = 2;
  string     error          = 3;  // empty on success
}
```

### Front-end

**`app/src/stores/config-store.ts` (new)** — singleton store mirroring `entity-store.ts`:

```ts
type ConfigChangeListener = (ev: ConfigChanged) => void;

export const configStore = {
  start(): Promise<void>,
  stop(): void,
  onChanged(cb: ConfigChangeListener): () => void,  // returns unsubscribe
  lastReloadAt(): number | null,
  lastReloadError(): string | null,
};
```

Internally manages the Subscribe stream with reconnect + heartbeat-timeout logic identical to `entityStore`. Listeners are fired on `ConfigChanged`; the store also exposes `lastReloadAt` / `lastReloadError` for the connection menu to read.

`AppLayout.vue` calls `configStore.start()` once on mount and `configStore.stop()` on unmount, alongside the existing `entityStore.start()`.

**View wiring.** Views with config-derived data add a `configStore.onChanged(refetch)` registration in `onMounted` and call the unsubscribe in `onBeforeUnmount`. Concretely:

| View | Re-fetch on change |
|------|--------------------|
| `AutomationsView.vue` | `listAutomations` |
| `RoomDetailView.vue` | `listAreas` + `listScenes` |
| `HomeView.vue` | `listAutomations` + `listAreas` |
| `AppLayout.vue` (palette catalog) | `listDrivers` + `listAutomations` + `listAreas` |

Other views (Settings, Devices) don't show config-derived data; no wiring needed.

**`SyTopBar.vue` modification.** The status `SyDot` becomes a click target that opens a popover.

**`SyConnectionMenu.vue` (new)** — popover content. Layout:

```
●  Connected
   Last reload: 14:32:18
   ─────────────────────
   ↻  Reload config
```

Click "Reload config" calls `ConfigService.Reload`. Success closes the popover (the resulting `ConfigChanged` tick already updates the "Last reload" timestamp via the stream). Failure shows the error inline as a small red caption and leaves the popover open; user clicks anywhere outside to dismiss.

If `daemonStatus !== "ok"`, the menu still opens but the Reload button is disabled with a hint ("Reconnect first"). Last-reload timestamp continues to show the last known successful value.

## Data flow

```
1. User saves automation in form.
2. EditSessionService.CommitEdit writes file → calls reloader.Trigger("form").
3. Reloader debounces 250ms → calls Manager.Apply.
4. Apply re-evaluates main.pkl + discovery → produces fresh snapshot.
5. Reloader publishes ConfigChanged{at, bundle_hash} on pubsub.
6. ConfigService.Subscribe handler forwards event to all open streams.
7. Front-end configStore receives ConfigChanged, fires listener callbacks.
8. AutomationsView's refetch listener calls listAutomations() → list re-renders.
9. Connection menu's "Last reload" updates via configStore.lastReloadAt().
```

## Error handling

| Failure | Behavior |
|---------|----------|
| Pkl eval failure in main.pkl during Apply | No ConfigChanged published. Reloader stores error. Next `Reload` RPC returns it in `ReloadConfigResponse.error`. Watcher path stores it for the next `Reload` call to surface; user sees it when they next click the menu. |
| Discovery hard error (duplicate id) | Same as above. The error message names the offending file. |
| Single bad `automations/<id>.pkl` (soft error) | Per the auto-discovery spec: file dropped, soft `ValidationError` surfaces via the existing validation report. The Apply *succeeds*; the bad file just isn't in the snapshot. `ConfigChanged` fires only if the resulting `bundle_hash` differs from the last-published one — so writing a single bad file with no other changes produces no event (the snapshot didn't move). The validation surface (not yet built in detail) is where users see soft errors. |
| Subscribe stream drops | Client reconnects with exponential backoff (1s, 2s, 4s, …, max 30s). `daemonStatus` indicator turns to `reconnecting`. |
| Slow client | Pub/sub buffer fills (cap 16) → daemon drops oldest event. Heartbeat keeps the stream alive; the next ConfigChanged will resync the client's local state. |
| Two rapid saves (race) | Both saves trigger reloader; debounce collapses to one Apply; one ConfigChanged fires. Even if two ticks somehow arrive, view re-fetch is idempotent — last-write-wins on the client. |

## Testing

### Unit (Go)

- `Reloader.Trigger` debouncing: fire N triggers within 250ms → assert Manager.Apply called exactly once, with all triggers' sources logged.
- `pubsub.Publish` + `Subscribe` correctness: publish 5 events to 3 subscribers → assert each subscriber receives all 5 in order.
- `pubsub` backpressure: fill a subscriber's buffer (cap 16), publish a 17th → assert oldest dropped, newest delivered.
- `Reloader` failure path: stub Manager.Apply to return error → assert no ConfigChanged published, error stored on reloader, retrievable via `Reloader.LastError()`.

### Integration (Go)

- Full daemon + real watcher. Write `automations/foo.pkl` via raw filesystem. Subscribe via in-process gRPC client. Assert exactly one `ConfigChanged` event arrives within 500ms with the expected bundle_hash.
- Write a syntactically invalid Pkl file under `automations/`. Assert no `ConfigChanged` event fires (because Apply succeeds — single bad file is a soft error, but the snapshot still moved if other valid files changed; actually here only the bad file changed, so Apply produces the same snapshot and we should NOT publish). Then write a valid one — assert exactly one event.
- Heartbeat: subscribe and wait 35s with no other activity → assert exactly one Heartbeat event arrives around 30s.

### End-to-end (Playwright)

- Start daemon, open AutomationsView. Drive `+ New automation` form to save. Assert the new automation appears in the list within 2s without a manual page reload.
- Click the connection indicator. Assert popover opens with "Reload config" button. Click it. Assert popover closes and "Last reload" timestamp updates.
- Simulate daemon stop (kill the process). Assert indicator transitions to `down` within ~5s and the menu's reload button is disabled.

## Open questions left for implementation

- Should the pub/sub publish `ConfigChanged` when Apply produces an identical snapshot (bundle hash unchanged)? **No** — suppress, since views re-fetching the same data is wasteful. Compare `bundle_hash` against the last-published value; skip publication on match.
- Where do soft ValidationErrors surface in the UI? **Out of scope for this spec.** They're already collected by `Evaluate` and pass through to ValidateOffline. A future "validation surface" task will route them into the UI; for now they're logged and available via the validation report.
