# Reactive config subscription implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make config changes propagate end-to-end. Daemon re-evaluates and broadcasts; front-end views observe and re-fetch; a manual "Reload config" button in the topbar's connection menu acts as the user-driven safety valve.

**Architecture:** A new `Reloader` debounces and centralizes the three reload triggers (form `CommitEdit`, watcher file events, `Reload` RPC) into a single `Manager.Apply` call. A `pubsub` broker fans out `ConfigChanged` events from `Manager.OnApplied` to subscribed clients via a new `ConfigService.Subscribe` server-streaming RPC, mirroring the existing `EntityService.Subscribe` pattern. Front-end `configStore` subscribes once at app start and notifies registered listener callbacks; views re-fetch via existing `list*` RPCs on each change.

**Tech Stack:** Go (apple/pkl-go, connectrpc), Vue 3 + TypeScript + Connect, existing `BoundedFanOut` + `NewHeartbeatTicker` + `Manager.OnApplied` + `SyMenu` primitives.

**Spec:** `docs/design/specs/2026-05-12-reactive-config-subscription-design.md`

---

## File map

| File | Status | Responsibility |
|------|--------|----------------|
| `proto/switchyard/v1alpha1/config.proto` | MOD | Add `Subscribe` RPC + `SubscribeConfigRequest` + `SubscribeConfigEvent` (oneof: `ConfigChanged` / `Heartbeat`). Add `error` field to `ReloadConfigResponse`. |
| `gen/switchyard/v1alpha1/config.pb.go` | GEN | Regenerated from proto. |
| `gen/switchyard/v1alpha1/switchyardv1alpha1connect/config.connect.go` | GEN | Regenerated handler interface. |
| `internal/config/pubsub.go` | NEW | Bounded fan-out broker for `ConfigChangedEvent`. Cap-16 per-subscriber buffer, drop-oldest on full. |
| `internal/config/pubsub_test.go` | NEW | Unit tests. |
| `internal/config/reloader.go` | NEW | `Reloader` owns debounce (250ms) + Manager.Apply orchestration + last-error tracking. Wires into watcher + edit-session + manager-hooks. |
| `internal/config/reloader_test.go` | NEW | Unit tests with fake manager. |
| `internal/api/deps.go` | MOD | Extend `ConfigApplier` with `Subscribe(ctx) (<-chan ConfigChangedEvent, func(), error)`, `LastReloadError() string`. Add `ConfigChangedEvent` struct. |
| `internal/api/service_config.go` | MOD | Add `Subscribe` handler using `BoundedFanOut` + `NewHeartbeatTicker`. Update `Reload` handler to include last-error in response. |
| `internal/api/service_config_test.go` | MOD | Add Subscribe handler tests. |
| `internal/editsession/service.go` | MOD | `CommitEdit` calls `reloader.Trigger("form")` after successful write. |
| `internal/daemon/daemon.go` | MOD | Instantiate `Reloader`, wire `OnApplied` hook + watcher subscriber. |
| `internal/daemon/api_adapters.go` | MOD | `configApplierAdapter.Reload` routes through reloader; new `Subscribe` + `LastReloadError` methods. |
| `app/src/data/config-service.ts` | MOD | Add `subscribeConfig()` returning AsyncIterable of events. Add `error` field to ReloadConfigResponse type. |
| `app/src/stores/config-store.ts` | NEW | Singleton store mirroring `entity-store.ts`. |
| `app/src/views/AppLayout.vue` | MOD | `configStore.start()` / `.stop()` lifecycle. |
| `app/src/views/AutomationsView.vue` | MOD | Subscribe to `configStore.onChanged` → refetch. |
| `app/src/views/HomeView.vue` | MOD | Same pattern. |
| `app/src/views/RoomDetailView.vue` | MOD | Same pattern. |
| `app/src/lib/components/topbar/SyConnectionMenu.vue` | NEW | Menu content: status, last-reload time, "Reload config" action, last-reload-error if any. |
| `app/src/lib/components/topbar/SyTopBar.vue` | MOD | Wrap `SyDot` in a click trigger that opens `SyConnectionMenu`. |
| `app/src/lib/components/shell/SyShell.vue` | MOD | Plumb `daemonStatus` + reload handler through to `SyConnectionMenu` via topbar. |

---

## Task 1: Proto + generated code for Subscribe RPC

**Files:**
- Modify: `proto/switchyard/v1alpha1/config.proto`
- Generate: `gen/switchyard/v1alpha1/config.pb.go`, `gen/switchyard/v1alpha1/switchyardv1alpha1connect/config.connect.go`

- [ ] **Step 1: Edit the proto file**

Modify `proto/switchyard/v1alpha1/config.proto`. After the existing `RegenPreview` RPC, add `Subscribe`:

```protobuf
service ConfigService {
  rpc Validate      (ValidateConfigRequest)       returns (ValidateConfigResponse);
  rpc Apply         (ApplyConfigRequest)          returns (ApplyConfigResponse);
  rpc Reload        (ReloadConfigRequest)         returns (ReloadConfigResponse);
  rpc Subscribe     (SubscribeConfigRequest)      returns (stream SubscribeConfigEvent);
  rpc GetArtifact   (GetConfigArtifactRequest)    returns (GetConfigArtifactResponse);
  rpc EvalCompute   (EvalComputeRequest)          returns (EvalComputeResponse);
  rpc RegenPreview  (RegenPreviewRequest)         returns (RegenPreviewResponse);
}
```

Modify `ReloadConfigResponse` to add the error field:

```protobuf
message ReloadConfigResponse {
  ConfigDiff diff           = 1;
  string     correlation_id = 2;
  string     error          = 3;
}
```

Add the new messages at the bottom of the file (before any existing trailing message blocks if any):

```protobuf
message SubscribeConfigRequest {}

message SubscribeConfigEvent {
  oneof event {
    ConfigChanged     changed   = 1;
    ConfigHeartbeat   heartbeat = 2;
  }
}

message ConfigChanged {
  int64  at_unix_ms  = 1;
  string bundle_hash = 2;
}

message ConfigHeartbeat {
  int64 at_unix_ms = 1;
}
```

Note the type name `ConfigHeartbeat` (not `Heartbeat`) to avoid collision with the existing `Heartbeat` in `v1alpha1/entity.proto`.

- [ ] **Step 2: Regenerate proto bindings**

Run:

```bash
buf generate
```

Expected: clean regeneration. New types appear in `gen/switchyard/v1alpha1/config.pb.go`. New `ConfigServiceHandler` interface in `config.connect.go` includes `Subscribe` method.

- [ ] **Step 3: Verify build**

Run: `go build ./...`
Expected: FAIL — `internal/api/service_config.go` doesn't implement the new `Subscribe` method on `ConfigServiceHandler`. That's fine; Task 8 fixes it. For now, comment out the `var _ switchyardv1alpha1connect.ConfigServiceHandler = (*ConfigService)(nil)` assertion at `internal/api/service_config.go:17` to unblock the build; Task 8 reverts that.

Actually do this instead — change the assertion line to:

```go
// var _ switchyardv1alpha1connect.ConfigServiceHandler = (*ConfigService)(nil) // restored in Task 8
```

Run `go build ./...` again. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add proto/switchyard/v1alpha1/config.proto gen/switchyard/v1alpha1/ internal/api/service_config.go
git commit -m "feat(proto): ConfigService.Subscribe + error field on ReloadResponse"
```

---

## Task 2: Pubsub broker

`Reloader` and the Subscribe RPC handler need a small fan-out broker — multiple Subscribe RPC clients each get the same `ConfigChanged` event stream. Bounded buffer per subscriber, drop-oldest on overflow.

**Files:**
- Create: `internal/config/pubsub.go`
- Test: `internal/config/pubsub_test.go`

- [ ] **Step 1: Write the failing tests**

Create `internal/config/pubsub_test.go`:

```go
package config

import (
	"sync"
	"testing"
	"time"
)

func TestPubsub_PublishToSingleSubscriber(t *testing.T) {
	ps := NewConfigPubsub(16)
	ch, _ := ps.Subscribe()

	ps.Publish(ConfigChangedEvent{AtUnixMs: 100, BundleHash: "h1"})
	select {
	case ev := <-ch:
		if ev.AtUnixMs != 100 || ev.BundleHash != "h1" {
			t.Errorf("got %+v", ev)
		}
	case <-time.After(time.Second):
		t.Fatal("did not receive event")
	}
}

func TestPubsub_FanOut(t *testing.T) {
	ps := NewConfigPubsub(16)
	ch1, _ := ps.Subscribe()
	ch2, _ := ps.Subscribe()
	ch3, _ := ps.Subscribe()

	ps.Publish(ConfigChangedEvent{AtUnixMs: 200, BundleHash: "h2"})

	for i, ch := range []<-chan ConfigChangedEvent{ch1, ch2, ch3} {
		select {
		case ev := <-ch:
			if ev.BundleHash != "h2" {
				t.Errorf("subscriber %d got %q", i, ev.BundleHash)
			}
		case <-time.After(time.Second):
			t.Fatalf("subscriber %d did not receive event", i)
		}
	}
}

func TestPubsub_UnsubscribeStopsDelivery(t *testing.T) {
	ps := NewConfigPubsub(16)
	ch, unsubscribe := ps.Subscribe()

	unsubscribe()
	ps.Publish(ConfigChangedEvent{AtUnixMs: 300, BundleHash: "h3"})

	select {
	case ev, ok := <-ch:
		if ok {
			t.Errorf("expected channel closed, got event %+v", ev)
		}
	case <-time.After(100 * time.Millisecond):
		// Channel may be closed or never receive; either is acceptable.
	}
}

func TestPubsub_DropsOldestOnFullBuffer(t *testing.T) {
	ps := NewConfigPubsub(2) // tiny buffer
	ch, _ := ps.Subscribe()

	// Fill the buffer + overflow.
	ps.Publish(ConfigChangedEvent{AtUnixMs: 1, BundleHash: "h1"})
	ps.Publish(ConfigChangedEvent{AtUnixMs: 2, BundleHash: "h2"})
	ps.Publish(ConfigChangedEvent{AtUnixMs: 3, BundleHash: "h3"})

	// Drain. Should receive h2 + h3 (h1 dropped) or h1 + h3 (h2 dropped) —
	// the contract is "drop oldest" so we expect h2 + h3.
	got := []string{}
	for i := 0; i < 2; i++ {
		select {
		case ev := <-ch:
			got = append(got, ev.BundleHash)
		case <-time.After(100 * time.Millisecond):
			t.Fatalf("expected 2 events, got %d", i)
		}
	}
	if len(got) != 2 || got[0] != "h2" || got[1] != "h3" {
		t.Errorf("want [h2, h3], got %v", got)
	}
}

func TestPubsub_ConcurrentPublishSafe(t *testing.T) {
	ps := NewConfigPubsub(64)
	ch, _ := ps.Subscribe()

	var wg sync.WaitGroup
	const n = 100
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			ps.Publish(ConfigChangedEvent{AtUnixMs: int64(i)})
		}(i)
	}
	wg.Wait()

	count := 0
	timeout := time.After(time.Second)
	for {
		select {
		case <-ch:
			count++
			if count >= n {
				return
			}
		case <-timeout:
			t.Fatalf("got %d / %d events before timeout", count, n)
		}
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/config -run TestPubsub -v`
Expected: FAIL — `NewConfigPubsub` and `ConfigChangedEvent` undefined.

- [ ] **Step 3: Create `internal/config/pubsub.go`**

```go
package config

import "sync"

// ConfigChangedEvent is published on every successful Manager.Apply where
// the resulting snapshot's bundle_hash differs from the previously
// published one.
type ConfigChangedEvent struct {
	AtUnixMs   int64
	BundleHash string
}

// ConfigPubsub is a small fan-out broker for ConfigChangedEvent. Each
// Subscribe call returns a bounded buffered channel; if a subscriber falls
// behind by more than the buffer capacity, Publish drops the oldest pending
// event for that subscriber rather than blocking.
type ConfigPubsub struct {
	mu      sync.Mutex
	bufSize int
	subs    map[*subscriber]struct{}
}

type subscriber struct {
	ch chan ConfigChangedEvent
}

// NewConfigPubsub creates a broker with the given per-subscriber buffer.
// Recommended cap: 16.
func NewConfigPubsub(bufSize int) *ConfigPubsub {
	if bufSize <= 0 {
		bufSize = 16
	}
	return &ConfigPubsub{
		bufSize: bufSize,
		subs:    map[*subscriber]struct{}{},
	}
}

// Subscribe registers a new subscriber. Returns a receive-only channel and
// an unsubscribe function. The channel is closed when unsubscribe runs.
func (p *ConfigPubsub) Subscribe() (<-chan ConfigChangedEvent, func()) {
	s := &subscriber{ch: make(chan ConfigChangedEvent, p.bufSize)}
	p.mu.Lock()
	p.subs[s] = struct{}{}
	p.mu.Unlock()
	unsubscribe := func() {
		p.mu.Lock()
		if _, ok := p.subs[s]; ok {
			delete(p.subs, s)
			close(s.ch)
		}
		p.mu.Unlock()
	}
	return s.ch, unsubscribe
}

// Publish fans out the event to every current subscriber. If a
// subscriber's channel is full, the oldest pending event is dropped
// to make room.
func (p *ConfigPubsub) Publish(ev ConfigChangedEvent) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for s := range p.subs {
		for {
			select {
			case s.ch <- ev:
				goto next
			default:
				// Buffer full — drop oldest and retry.
				select {
				case <-s.ch:
				default:
				}
			}
		}
	next:
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/config -run TestPubsub -v`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add internal/config/pubsub.go internal/config/pubsub_test.go
git commit -m "feat(config): ConfigPubsub fan-out broker for ConfigChangedEvent"
```

---

## Task 3: Reloader (debouncer + last-error tracker)

**Files:**
- Create: `internal/config/reloader.go`
- Test: `internal/config/reloader_test.go`

- [ ] **Step 1: Write the failing tests**

Create `internal/config/reloader_test.go`:

```go
package config

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeApplier counts Apply calls; returns the configured error.
type fakeApplier struct {
	mu        sync.Mutex
	calls     int32
	err       error
	lastSrcs  []string
	applyDone chan struct{}
}

func (f *fakeApplier) Apply(_ context.Context, source string) error {
	atomic.AddInt32(&f.calls, 1)
	f.mu.Lock()
	f.lastSrcs = append(f.lastSrcs, source)
	err := f.err
	done := f.applyDone
	f.mu.Unlock()
	if done != nil {
		close(done)
	}
	return err
}

func TestReloader_DebouncesBurst(t *testing.T) {
	app := &fakeApplier{}
	r := NewReloader(app, 50*time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r.Start(ctx)

	for i := 0; i < 5; i++ {
		r.Trigger("watcher")
	}
	time.Sleep(200 * time.Millisecond)

	got := atomic.LoadInt32(&app.calls)
	if got != 1 {
		t.Errorf("want 1 Apply call (debounced), got %d", got)
	}
}

func TestReloader_SeparateBurstsEachApply(t *testing.T) {
	app := &fakeApplier{}
	r := NewReloader(app, 50*time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r.Start(ctx)

	// Burst 1
	r.Trigger("form")
	r.Trigger("form")
	time.Sleep(200 * time.Millisecond)
	// Burst 2
	r.Trigger("rpc")
	time.Sleep(200 * time.Millisecond)

	got := atomic.LoadInt32(&app.calls)
	if got != 2 {
		t.Errorf("want 2 Apply calls, got %d", got)
	}
}

func TestReloader_TracksLastError(t *testing.T) {
	app := &fakeApplier{err: errors.New("apply failed")}
	r := NewReloader(app, 10*time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r.Start(ctx)

	r.Trigger("rpc")
	time.Sleep(100 * time.Millisecond)

	if got := r.LastError(); got == "" || got != "apply failed" {
		t.Errorf("LastError = %q, want %q", got, "apply failed")
	}

	// Successful apply clears the error.
	app.mu.Lock()
	app.err = nil
	app.mu.Unlock()

	r.Trigger("rpc")
	time.Sleep(100 * time.Millisecond)

	if got := r.LastError(); got != "" {
		t.Errorf("LastError after success = %q, want empty", got)
	}
}

func TestReloader_StopHaltsDispatch(t *testing.T) {
	app := &fakeApplier{}
	r := NewReloader(app, 30*time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	r.Start(ctx)

	r.Trigger("watcher")
	cancel()
	time.Sleep(100 * time.Millisecond)
	r.Trigger("watcher") // after stop — must not Apply

	got := atomic.LoadInt32(&app.calls)
	if got > 1 {
		t.Errorf("post-stop trigger fired Apply (calls=%d)", got)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/config -run TestReloader -v`
Expected: FAIL — `NewReloader` undefined.

- [ ] **Step 3: Create `internal/config/reloader.go`**

```go
package config

import (
	"context"
	"sync"
	"time"
)

// ReloaderApplier abstracts the part of Manager.Apply that Reloader
// invokes. The real Manager satisfies this via an adapter (set up in
// the daemon wiring layer).
type ReloaderApplier interface {
	// Apply re-evaluates and applies config. `source` is a free-form
	// telemetry tag ("form" | "watcher" | "rpc") describing what
	// requested the reload.
	Apply(ctx context.Context, source string) error
}

// Reloader coalesces reload requests from three triggers (form save,
// watcher, RPC) into debounced Manager.Apply calls. It tracks the most
// recent Apply error so the Reload RPC can surface it to the user.
type Reloader struct {
	app      ReloaderApplier
	debounce time.Duration

	mu        sync.Mutex
	pending   []string // sources accumulated within the current debounce window
	lastErr   string
	scheduled bool

	signal chan struct{}
	stop   chan struct{}
}

// NewReloader creates a Reloader with the given debounce window.
// Recommended: 250ms.
func NewReloader(app ReloaderApplier, debounce time.Duration) *Reloader {
	if debounce <= 0 {
		debounce = 250 * time.Millisecond
	}
	return &Reloader{
		app:      app,
		debounce: debounce,
		signal:   make(chan struct{}, 1),
		stop:     make(chan struct{}),
	}
}

// Start spawns the dispatch goroutine. Cancelling ctx stops it.
func (r *Reloader) Start(ctx context.Context) {
	go r.loop(ctx)
}

// Trigger requests a reload. Multiple Trigger calls within `debounce` of
// each other coalesce into a single Apply.
func (r *Reloader) Trigger(source string) {
	r.mu.Lock()
	r.pending = append(r.pending, source)
	r.mu.Unlock()
	select {
	case r.signal <- struct{}{}:
	default:
		// Signal already pending; loop will pick up the appended source.
	}
}

// LastError returns the most recent Apply error message, or "" if the
// most recent Apply succeeded (or none has run yet).
func (r *Reloader) LastError() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.lastErr
}

func (r *Reloader) loop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.signal:
		}
		// Debounce: sleep, then drain any further signals that arrived.
		timer := time.NewTimer(r.debounce)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		// Drain trailing signals (best-effort; new triggers from this
		// point onward will queue another iteration).
		select {
		case <-r.signal:
		default:
		}

		r.mu.Lock()
		sources := r.pending
		r.pending = nil
		r.mu.Unlock()

		// Combine sources for telemetry — first source wins if mixed.
		source := "unknown"
		if len(sources) > 0 {
			source = sources[0]
		}

		err := r.app.Apply(ctx, source)
		r.mu.Lock()
		if err != nil {
			r.lastErr = err.Error()
		} else {
			r.lastErr = ""
		}
		r.mu.Unlock()
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/config -run TestReloader -v`
Expected: PASS — all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add internal/config/reloader.go internal/config/reloader_test.go
git commit -m "feat(config): Reloader debounces+coalesces reload triggers"
```

---

## Task 4: Wire Reloader → Manager + ConfigPubsub publish on success

Connect the Reloader to the real `Manager`, and have each successful Apply publish a `ConfigChangedEvent` via `ConfigPubsub`. This uses `Manager.OnApplied` (already exists at `internal/config/manager.go:48`).

**Files:**
- Modify: `internal/daemon/daemon.go` (instantiate + wire)
- Modify: `internal/daemon/api_adapters.go` (adapt Manager to `ReloaderApplier`)

- [ ] **Step 1: Find the daemon startup site**

Read `internal/daemon/daemon.go` around line 374 (where `OnApplied` is already used) to understand the lifecycle context. The Reloader needs to be created after `configMgr` but before the watcher and edit-session are wired.

- [ ] **Step 2: Add the manager-to-reloader-applier adapter**

In `internal/daemon/api_adapters.go`, find `configApplierAdapter` (it's the struct that has `Reload` at line 762). Add a sibling adapter type below it:

```go
// managerReloaderApplier adapts *config.Manager to config.ReloaderApplier.
// Apply uses Manager.Apply(ctx, false) (dry-run=false).
type managerReloaderApplier struct {
	mgr *config.Manager
}

func (m *managerReloaderApplier) Apply(ctx context.Context, source string) error {
	// `source` is just telemetry for the debounce log line; Manager
	// doesn't care about the reason.
	_ = source
	return m.mgr.Apply(ctx, false)
}
```

You'll need an import of `"github.com/fdatoo/switchyard/internal/config"` at the top of the file — likely already present; verify before adding.

- [ ] **Step 3: Wire pubsub + reloader into daemon startup**

In `internal/daemon/daemon.go`, locate the existing `OnApplied` registration (around line 374). Just BEFORE that registration, add the pubsub + reloader setup:

```go
// Reactive config subscription: pubsub + debouncing reloader.
configPubsub := config.NewConfigPubsub(16)
reloader := config.NewReloader(&managerReloaderApplier{mgr: d.configMgr}, 250*time.Millisecond)
reloader.Start(ctx)
d.configReloader = reloader
d.configPubsub = configPubsub

// Publish a ConfigChanged event on every successful Apply. v1 does
// not suppress no-op applies (no bundle_hash field on ConfigSnapshot
// yet); views re-fetching the same data is benign. A future
// optimization can hash the snapshot and skip publish when unchanged.
d.configMgr.OnApplied(func(snap *configpb.ConfigSnapshot) {
    configPubsub.Publish(config.ConfigChangedEvent{
        AtUnixMs:   snap.GetEvaluatedAtUnixMs(),
        BundleHash: "", // not exposed today; populated when proto gains the field
    })
})
```

Add the two fields to the `daemon` struct:

```go
type daemon struct {
    // ... existing fields ...
    configReloader *config.Reloader
    configPubsub   *config.ConfigPubsub
}
```

- [ ] **Step 4: Run the daemon test suite**

Run: `go build ./... && go test ./internal/daemon -count=1 -run TestDaemon -v`
Expected: PASS — existing daemon tests should not regress (reloader is opt-in via Trigger, which nothing calls yet).

- [ ] **Step 5: Commit**

```bash
git add internal/daemon/daemon.go internal/daemon/api_adapters.go
git commit -m "feat(daemon): instantiate Reloader+ConfigPubsub; publish on OnApplied"
```

---

## Task 5: Wire form-save trigger from EditSession → Reloader

After `CommitEdit` writes the file, call `reloader.Trigger("form")` so the snapshot updates without waiting for the watcher to poll.

**Files:**
- Modify: `internal/editsession/service.go`
- Modify: `internal/daemon/daemon.go` (pass reloader into edit-session service)

- [ ] **Step 1: Find the CommitEdit success path**

Read `internal/editsession/service.go`. Find the `CommitEdit` method. After the file is written successfully (after `os.WriteFile` returns nil and before the success Response is built), the trigger should fire.

- [ ] **Step 2: Add a trigger hook to the Service**

Modify `internal/editsession/service.go`. Add to the Service struct:

```go
type Service struct {
    // ... existing fields ...
    onCommitTrigger func(source string) // nullable; set during daemon wiring
}

// SetOnCommitTrigger registers a callback invoked after each successful
// CommitEdit. Used by the daemon to wire form saves into the config
// reloader.
func (s *Service) SetOnCommitTrigger(fn func(source string)) {
    s.onCommitTrigger = fn
}
```

In `CommitEdit`, after the successful `os.WriteFile`, before returning the success response, add:

```go
if s.onCommitTrigger != nil {
    s.onCommitTrigger("form")
}
```

- [ ] **Step 3: Wire the trigger in daemon startup**

In `internal/daemon/daemon.go`, find where the editsession `Service` is instantiated. After the line that creates it (and after `reloader` is created in Task 4), add:

```go
editSessionSvc.SetOnCommitTrigger(reloader.Trigger)
```

If the variable name is different (e.g., `editSession`), use whatever the existing code uses. Search for `editsession.NewService(`.

- [ ] **Step 4: Verify build + tests still pass**

Run: `go build ./... && go test ./internal/editsession ./internal/daemon -count=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/editsession/service.go internal/daemon/daemon.go
git commit -m "feat(editsession): form-save triggers config reloader"
```

---

## Task 6: Wire Watcher → Reloader (filesystem-driven reload)

The watcher polls `*.pkl` files and fires subscriber callbacks. Add a second subscriber that filters for config-relevant paths and calls `reloader.Trigger("watcher")`.

**Files:**
- Modify: `internal/daemon/daemon.go`

- [ ] **Step 1: Find the watcher startup**

Read `internal/daemon/daemon.go`. Find where the `config.Watcher` is created and `Subscribe` is called for the editsession `ExternalEditDetected` subscriber. The new subscriber goes right next to that.

- [ ] **Step 2: Add the watcher subscriber**

Add this block in `daemon.go` right after the existing watcher.Subscribe call:

```go
// Filesystem-driven config reloads: every change to a *.pkl file under
// configDir that affects the snapshot wakes the reloader. The reloader
// itself debounces bursts and ignores no-op applies.
watcher.Subscribe(func(path, _ string, _ time.Time) {
    if isConfigRelevantPath(d.cfg.ConfigDir, path) {
        reloader.Trigger("watcher")
    }
})
```

Add the helper function (place it at the bottom of `daemon.go`):

```go
// isConfigRelevantPath returns true if the watched path is one of the
// files the daemon's config snapshot depends on: main.pkl or any .pkl
// under automations/, areas/, scenes/, or the entity-areas.pkl singleton.
func isConfigRelevantPath(configDir, path string) bool {
    rel, err := filepath.Rel(configDir, path)
    if err != nil {
        return false
    }
    rel = filepath.ToSlash(rel)
    if rel == "main.pkl" || rel == "entity-areas.pkl" {
        return true
    }
    if strings.HasPrefix(rel, "automations/") && strings.HasSuffix(rel, ".pkl") {
        return true
    }
    if strings.HasPrefix(rel, "areas/") && strings.HasSuffix(rel, ".pkl") {
        return true
    }
    if strings.HasPrefix(rel, "scenes/") && strings.HasSuffix(rel, ".pkl") {
        return true
    }
    return false
}
```

Verify `path/filepath` and `strings` are imported in the file.

- [ ] **Step 3: Verify build + tests still pass**

Run: `go build ./... && go test ./internal/daemon -count=1`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add internal/daemon/daemon.go
git commit -m "feat(daemon): watcher fires reloader on config-relevant *.pkl changes"
```

---

## Task 7: Route Reload RPC through Reloader; expose last-error

`ConfigService.Reload` currently calls `Manager.Apply` directly via `ConfigApplier.Reload`. Replace that with a path through the Reloader, and surface `LastError` in the response.

**Files:**
- Modify: `internal/api/deps.go`
- Modify: `internal/daemon/api_adapters.go`
- Modify: `internal/api/service_config.go`

- [ ] **Step 1: Extend the ConfigApplier interface**

Edit `internal/api/deps.go`. Modify the `ConfigApplier` interface to add a `LastReloadError() string` method:

```go
type ConfigApplier interface {
    Validate(ctx context.Context, pklBundle []byte) (valid bool, errs []string, diff ConfigDiff, hash string, err error)
    Apply(ctx context.Context, pklBundle []byte, message, expectedHash string, dryRun, strict bool, actor string) (ConfigApplyResult, error)
    Reload(ctx context.Context, actor string) (diff ConfigDiff, correlationID string, err error)
    CurrentArtifact(ctx context.Context) (*configv1.ConfigSnapshot, error)
    LastReloadError() string
}
```

- [ ] **Step 2: Update the daemon adapter**

In `internal/daemon/api_adapters.go`, find `configApplierAdapter`. Modify `Reload` to trigger the reloader instead of calling Manager.Apply directly, and add `LastReloadError`:

```go
func (a *configApplierAdapter) Reload(ctx context.Context, _ string) (api.ConfigDiff, string, error) {
    // Trigger reload via the reloader; the apply happens asynchronously
    // (debounced 250ms). We do not wait for it — the user's UI will
    // observe the ConfigChanged event via the Subscribe stream.
    a.reloader.Trigger("rpc")
    return api.ConfigDiff{}, "", nil
}

func (a *configApplierAdapter) LastReloadError() string {
    return a.reloader.LastError()
}
```

Add `reloader *config.Reloader` to the `configApplierAdapter` struct, and populate it at construction (find where `configApplierAdapter` is instantiated in `daemon.go`).

- [ ] **Step 3: Update the Reload handler to include the error**

In `internal/api/service_config.go`, update the `Reload` handler:

```go
func (s *ConfigService) Reload(ctx context.Context, _ *connect.Request[v1.ReloadConfigRequest]) (*connect.Response[v1.ReloadConfigResponse], error) {
    diff, correlationID, err := s.be.Reload(ctx, principalID(ctx))
    if err != nil {
        return nil, ToConnect(ctx, err, "reload_failed")
    }
    return connect.NewResponse(&v1.ReloadConfigResponse{
        Diff:          configDiffToProto(diff),
        CorrelationId: correlationID,
        Error:         s.be.LastReloadError(),
    }), nil
}
```

- [ ] **Step 4: Verify build + tests**

Run: `go build ./... && go test ./internal/api ./internal/daemon -count=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/api/deps.go internal/daemon/api_adapters.go internal/api/service_config.go
git commit -m "feat(api): Reload RPC routes through Reloader; reports LastError"
```

---

## Task 8: Implement ConfigService.Subscribe handler

Server-streaming RPC that registers a pubsub subscriber, forwards `ConfigChanged` events to the stream, sends heartbeats every 30s.

**Files:**
- Modify: `internal/api/service_config.go` (add Subscribe method, restore the interface-conformance assertion)
- Modify: `internal/api/deps.go` (add Subscribe + types to ConfigApplier)
- Modify: `internal/daemon/api_adapters.go` (implement Subscribe in adapter)

- [ ] **Step 1: Extend ConfigApplier**

In `internal/api/deps.go`, add the subscribe primitive types and interface method:

```go
type ConfigSubscriber interface {
    SubscribeConfig() (<-chan ConfigChangedEvent, func())
}

type ConfigChangedEvent struct {
    AtUnixMs   int64
    BundleHash string
}
```

Extend `ConfigApplier`:

```go
type ConfigApplier interface {
    Validate(ctx context.Context, pklBundle []byte) (valid bool, errs []string, diff ConfigDiff, hash string, err error)
    Apply(ctx context.Context, pklBundle []byte, message, expectedHash string, dryRun, strict bool, actor string) (ConfigApplyResult, error)
    Reload(ctx context.Context, actor string) (diff ConfigDiff, correlationID string, err error)
    CurrentArtifact(ctx context.Context) (*configv1.ConfigSnapshot, error)
    LastReloadError() string
    SubscribeConfig() (<-chan ConfigChangedEvent, func())
}
```

- [ ] **Step 2: Implement Subscribe in the adapter**

In `internal/daemon/api_adapters.go`, add to `configApplierAdapter`:

```go
func (a *configApplierAdapter) SubscribeConfig() (<-chan api.ConfigChangedEvent, func()) {
    ch, unsubscribe := a.pubsub.Subscribe()
    // Translate internal config.ConfigChangedEvent → api.ConfigChangedEvent.
    out := make(chan api.ConfigChangedEvent, cap(ch))
    done := make(chan struct{})
    go func() {
        defer close(out)
        for {
            select {
            case <-done:
                return
            case ev, ok := <-ch:
                if !ok {
                    return
                }
                select {
                case out <- api.ConfigChangedEvent{AtUnixMs: ev.AtUnixMs, BundleHash: ev.BundleHash}:
                case <-done:
                    return
                }
            }
        }
    }()
    cancel := func() {
        close(done)
        unsubscribe()
    }
    return out, cancel
}
```

Add `pubsub *config.ConfigPubsub` field to the adapter, populated at construction in `daemon.go`.

- [ ] **Step 3: Write the failing Subscribe handler test**

Add to `internal/api/service_config_test.go` (create the file if absent):

```go
package api

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"

	v1 "github.com/fdatoo/switchyard/gen/switchyard/v1alpha1"
	"github.com/fdatoo/switchyard/gen/switchyard/v1alpha1/switchyardv1alpha1connect"
	configv1 "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
)

type fakeConfigBackend struct {
	subCh    chan ConfigChangedEvent
	subClose func()
}

func (f *fakeConfigBackend) Validate(context.Context, []byte) (bool, []string, ConfigDiff, string, error) {
	return false, nil, ConfigDiff{}, "", errors.New("not implemented")
}
func (f *fakeConfigBackend) Apply(context.Context, []byte, string, string, bool, bool, string) (ConfigApplyResult, error) {
	return ConfigApplyResult{}, errors.New("not implemented")
}
func (f *fakeConfigBackend) Reload(context.Context, string) (ConfigDiff, string, error) {
	return ConfigDiff{}, "", nil
}
func (f *fakeConfigBackend) CurrentArtifact(context.Context) (*configv1.ConfigSnapshot, error) {
	return &configv1.ConfigSnapshot{}, nil
}
func (f *fakeConfigBackend) LastReloadError() string { return "" }
func (f *fakeConfigBackend) SubscribeConfig() (<-chan ConfigChangedEvent, func()) {
	if f.subCh == nil {
		f.subCh = make(chan ConfigChangedEvent, 16)
	}
	return f.subCh, func() { /* test owns lifetime */ }
}

func TestConfigService_Subscribe_ReceivesEvent(t *testing.T) {
	be := &fakeConfigBackend{}
	svc := NewConfigService(be)

	mux := connect.NewMux()
	path, handler := switchyardv1alpha1connect.NewConfigServiceHandler(svc)
	mux.Handle(path, handler)

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := switchyardv1alpha1connect.NewConfigServiceClient(srv.Client(), srv.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	stream, err := client.Subscribe(ctx, connect.NewRequest(&v1.SubscribeConfigRequest{}))
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}

	// Give the handler a moment to register the subscriber.
	time.Sleep(50 * time.Millisecond)
	be.subCh <- ConfigChangedEvent{AtUnixMs: 12345, BundleHash: "h-test"}

	for stream.Receive() {
		msg := stream.Msg()
		if ch := msg.GetChanged(); ch != nil {
			if ch.GetAtUnixMs() != 12345 || ch.GetBundleHash() != "h-test" {
				t.Errorf("got %+v", ch)
			}
			return
		}
		// Skip any heartbeats that arrive first.
	}
	t.Fatal("stream closed without delivering ConfigChanged event")
}
```

Note `connect.NewMux` may not be the right helper — adjust if the existing tests in `service_entity_test.go` use a different setup pattern. Mirror whatever they do.

- [ ] **Step 4: Run test to verify it fails**

Run: `go test ./internal/api -run TestConfigService_Subscribe -v`
Expected: FAIL — `Subscribe` method missing on `*ConfigService`.

- [ ] **Step 5: Implement the handler**

Add to `internal/api/service_config.go`:

```go
func (s *ConfigService) Subscribe(ctx context.Context, _ *connect.Request[v1.SubscribeConfigRequest], stream *connect.ServerStream[v1.SubscribeConfigEvent]) error {
    src, cancel := s.be.SubscribeConfig()
    defer cancel()

    cfg := currentStreamConfig()
    ticker := NewHeartbeatTicker(ctx, cfg.HeartbeatInterval)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return nil
        case ev, ok := <-src:
            if !ok {
                return nil
            }
            if err := stream.Send(&v1.SubscribeConfigEvent{
                Event: &v1.SubscribeConfigEvent_Changed{Changed: &v1.ConfigChanged{
                    AtUnixMs:   ev.AtUnixMs,
                    BundleHash: ev.BundleHash,
                }},
            }); err != nil {
                return err
            }
            ticker.NotePayloadSent()
        case tick := <-ticker.C():
            if err := stream.Send(&v1.SubscribeConfigEvent{
                Event: &v1.SubscribeConfigEvent_Heartbeat{Heartbeat: &v1.ConfigHeartbeat{
                    AtUnixMs: tick.UnixMilli(),
                }},
            }); err != nil {
                return err
            }
        }
    }
}
```

Restore the interface-conformance assertion at line 17:

```go
var _ switchyardv1alpha1connect.ConfigServiceHandler = (*ConfigService)(nil)
```

- [ ] **Step 6: Run tests to verify pass**

Run: `go test ./internal/api -run TestConfigService_Subscribe -v`
Expected: PASS.

- [ ] **Step 7: Verify full build**

Run: `go build ./... && go test ./internal/api ./internal/daemon ./internal/config -count=1`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add internal/api/service_config.go internal/api/service_config_test.go internal/api/deps.go internal/daemon/api_adapters.go
git commit -m "feat(api): ConfigService.Subscribe handler with heartbeat"
```

---

## Task 9: Daemon-side end-to-end integration test

Boot a real daemon (or close to it — the config evaluator + reloader + pubsub + Subscribe handler). Write a `.pkl` file under the config dir. Observe a `ConfigChanged` event arrives via the Subscribe stream within 500ms.

**Files:**
- Create: `internal/daemon/config_subscribe_e2e_test.go`

- [ ] **Step 1: Write the test**

Look at `internal/daemon/daemon_test.go:TestDaemon_StartsAndShutsDownCleanly` to understand the daemon-startup pattern. The new test bootstraps similarly but additionally drives the Subscribe RPC.

Create `internal/daemon/config_subscribe_e2e_test.go`:

```go
//go:build integration

package daemon_test

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"connectrpc.com/connect"

	v1 "github.com/fdatoo/switchyard/gen/switchyard/v1alpha1"
	"github.com/fdatoo/switchyard/gen/switchyard/v1alpha1/switchyardv1alpha1connect"
	"github.com/fdatoo/switchyard/internal/daemon"
	"github.com/fdatoo/switchyard/internal/observability"
)

func TestConfigSubscribe_FilesystemChangeFiresEvent(t *testing.T) {
	dir := shortTempDir(t)
	configDir := filepath.Join(dir, "config")
	if err := os.MkdirAll(filepath.Join(configDir, "automations"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(configDir, "main.pkl"), []byte(`amends "switchyard:config"`), 0o644); err != nil {
		t.Fatal(err)
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	metrics := observability.NewMetrics()
	adminPort := freeTCPPort(t)
	tcpPort := freeTCPPort(t)
	d := daemon.New(daemon.Config{
		DataDir:    dir,
		ConfigDir:  configDir,
		LogLevel:   slog.LevelInfo,
		LogFormat:  "json",
		AdminPort:  adminPort,
		TCPPort:    tcpPort,
		SocketPath: fmt.Sprintf("switchyardd-%d.sock", os.Getpid()),
	}, logger, metrics)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- d.Run(ctx) }()

	// Wait for daemon readiness.
	healthURL := fmt.Sprintf("http://127.0.0.1:%d/health", adminPort)
	deadline := time.Now().Add(20 * time.Second)
	ready := false
	for time.Now().Before(deadline) {
		resp, err := http.Get(healthURL)
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				ready = true
				break
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	if !ready {
		t.Fatal("daemon did not report ready within 20s")
	}

	// Open a Subscribe stream over TCP.
	clientHTTP := &http.Client{}
	baseURL := fmt.Sprintf("http://127.0.0.1:%d", tcpPort)
	client := switchyardv1alpha1connect.NewConfigServiceClient(clientHTTP, baseURL)

	streamCtx, streamCancel := context.WithTimeout(ctx, 10*time.Second)
	defer streamCancel()
	stream, err := client.Subscribe(streamCtx, connect.NewRequest(&v1.SubscribeConfigRequest{}))
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}

	// Give the daemon a moment to register the subscriber.
	time.Sleep(200 * time.Millisecond)

	// Write a discovery file under automations/.
	autoFile := filepath.Join(configDir, "automations", "e2e.pkl")
	contents := `amends "switchyard:automation"
import "switchyard:automations" as auto

id = "e2e"
enabled = true
triggers {
  new auto.EventTrigger { kind = "sun.sunset" }
}
actions {}
`
	if err := os.WriteFile(autoFile, []byte(contents), 0o644); err != nil {
		t.Fatal(err)
	}

	// Wait for the ConfigChanged event.
	timeout := time.After(5 * time.Second)
	for {
		select {
		case <-timeout:
			t.Fatal("did not receive ConfigChanged within 5s")
		default:
		}
		if !stream.Receive() {
			t.Fatalf("stream closed: %v", stream.Err())
		}
		msg := stream.Msg()
		if msg.GetChanged() != nil {
			// Got it — done.
			return
		}
		// Heartbeats are fine, keep looping.
	}
}
```

The exact `daemon.Config` field names may differ from what's shown — read `internal/daemon/daemon.go`'s `Config` struct and adjust. The key items: `DataDir`, `ConfigDir` (or whichever field points to the config directory), `AdminPort`, and a TCP port for the gRPC service.

- [ ] **Step 2: Run the test**

Run: `go test -tags integration ./internal/daemon -run TestConfigSubscribe_FilesystemChangeFiresEvent -v`
Expected: PASS within ~3 seconds.

- [ ] **Step 3: Commit**

```bash
git add internal/daemon/config_subscribe_e2e_test.go
git commit -m "test(daemon): E2E config Subscribe over filesystem trigger"
```

---

## Task 10: Front-end Subscribe client wrapper

Add the TS client that opens the Subscribe stream. Mirror the existing `subscribeEntities` in `app/src/data/entities.ts` — likely uses raw fetch + envelope parsing.

**Files:**
- Modify: `app/src/data/config-service.ts`

- [ ] **Step 1: Inspect the existing subscribe pattern**

Read `app/src/data/entities.ts` for `subscribeEntities`. Find the envelope-parsing helper it uses (likely `parseEnvelopeStream` or similar) — note the exact function name and import path.

- [ ] **Step 2: Write the subscribeConfig client**

Add to `app/src/data/config-service.ts`:

```ts
export type ConfigChanged = {
  kind: "changed";
  atUnixMs: number;
  bundleHash: string;
};

export type ConfigHeartbeat = {
  kind: "heartbeat";
  atUnixMs: number;
};

export type ConfigSubscribeEvent = ConfigChanged | ConfigHeartbeat;

/** Server-streaming subscription to config-change events. */
export async function* subscribeConfig(
  opts: { signal?: AbortSignal } = {},
): AsyncIterable<ConfigSubscribeEvent> {
  const url = `${BASE_URL}/${SVC}/Subscribe`;
  // Use whatever the existing pattern is — likely fetch + reader + envelope.
  // The example below assumes parseEnvelopeStream from a shared helper.
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/connect+json", "Connect-Protocol-Version": "1" },
    body: connectFrame(JSON.stringify({})),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`subscribeConfig: ${res.status}`);

  for await (const json of parseEnvelopeStream(res.body)) {
    const msg = JSON.parse(json) as {
      changed?: { atUnixMs?: string | number; bundleHash?: string };
      heartbeat?: { atUnixMs?: string | number };
    };
    if (msg.changed) {
      yield { kind: "changed", atUnixMs: Number(msg.changed.atUnixMs ?? 0), bundleHash: msg.changed.bundleHash ?? "" };
    } else if (msg.heartbeat) {
      yield { kind: "heartbeat", atUnixMs: Number(msg.heartbeat.atUnixMs ?? 0) };
    }
  }
}
```

Adjust `connectFrame`, `parseEnvelopeStream`, `BASE_URL`, `SVC` to match the existing exports/conventions in this codebase. Mirror `subscribeEntities` exactly — if it uses helper `xyz`, use `xyz` here too.

Also update the `reloadConfig` return type to include the new error field:

```ts
export type ReloadConfigResponse = {
  diff?: ConfigDiff;
  correlationId: string;
  error: string;
};
```

And adjust its parsing to read `error` from the response JSON.

- [ ] **Step 3: Quick sanity check**

Run: `cd app && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/config-service.ts
git commit -m "feat(app): subscribeConfig client; surface Reload error"
```

---

## Task 11: configStore singleton

**Files:**
- Create: `app/src/stores/config-store.ts`

- [ ] **Step 1: Write the store**

Mirror `app/src/stores/entity-store.ts`. Create `app/src/stores/config-store.ts`:

```ts
/**
 * Singleton config-change store.
 *
 * Lifecycle: start() opens the Subscribe stream. On stream errors it
 * reconnects with exponential backoff. stop() aborts.
 *
 * Reactivity: changes don't carry data — they signal "config moved on
 * the daemon; if you care about a slice, refetch." Listeners registered
 * via onChanged() are called with the ConfigChanged event.
 *
 * Connection-menu support: tracks lastReloadAt + lastReloadError so the
 * topbar's connection menu can render them.
 */

import { shallowRef, type Ref } from "vue";
import { subscribeConfig, reloadConfig, type ConfigChanged } from "@/data/config-service";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;

export type ConfigChangeListener = (ev: ConfigChanged) => void;

export interface ConfigStore {
  connected: Readonly<Ref<boolean>>;
  lastReloadAt: Readonly<Ref<number | null>>;
  lastReloadError: Readonly<Ref<string | null>>;
  start(): Promise<void>;
  stop(): void;
  onChanged(cb: ConfigChangeListener): () => void;
  triggerReload(): Promise<void>;
}

function createStore(): ConfigStore {
  const connected = shallowRef<boolean>(false);
  const lastReloadAt = shallowRef<number | null>(null);
  const lastReloadError = shallowRef<string | null>(null);

  const listeners = new Set<ConfigChangeListener>();
  let abort: AbortController | null = null;
  let started = false;
  let reconnectAttempt = 0;
  let reconnectTimer: number | null = null;
  let watchdog: number | null = null;
  let lastSeenAt = Date.now();

  function clearReconnect(): void {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function startWatchdog(): void {
    if (watchdog !== null) window.clearInterval(watchdog);
    watchdog = window.setInterval(() => {
      if (!connected.value) return;
      if (Date.now() - lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
        abort?.abort();
      }
    }, 5_000);
  }

  function scheduleReconnect(): void {
    clearReconnect();
    const base = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
    const jitter = base * (0.9 + Math.random() * 0.2);
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => { void runStream(); }, jitter);
  }

  async function runStream(): Promise<void> {
    if (!started) return;
    abort = new AbortController();
    try {
      connected.value = true;
      lastSeenAt = Date.now();
      reconnectAttempt = 0;
      startWatchdog();
      const stream = subscribeConfig({ signal: abort.signal });
      for await (const ev of stream) {
        lastSeenAt = Date.now();
        if (ev.kind === "changed") {
          lastReloadAt.value = ev.atUnixMs;
          for (const cb of listeners) {
            try { cb(ev); } catch { /* listener errors don't kill the stream */ }
          }
        }
      }
      connected.value = false;
      if (started) scheduleReconnect();
    } catch (err) {
      connected.value = false;
      if (!started) return;
      if ((err as Error).name === "AbortError") return;
      scheduleReconnect();
    }
  }

  return {
    connected,
    lastReloadAt,
    lastReloadError,

    async start(): Promise<void> {
      if (started) return;
      started = true;
      reconnectAttempt = 0;
      await runStream();
    },

    stop(): void {
      started = false;
      clearReconnect();
      if (watchdog !== null) {
        window.clearInterval(watchdog);
        watchdog = null;
      }
      abort?.abort();
      abort = null;
      connected.value = false;
    },

    onChanged(cb: ConfigChangeListener): () => void {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },

    async triggerReload(): Promise<void> {
      try {
        const r = await reloadConfig();
        lastReloadError.value = r.error || null;
      } catch (err) {
        lastReloadError.value = err instanceof Error ? err.message : String(err);
      }
    },
  };
}

export const configStore: ConfigStore = createStore();
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/src/stores/config-store.ts
git commit -m "feat(app): configStore singleton mirroring entity-store"
```

---

## Task 12: AppLayout starts/stops configStore

**Files:**
- Modify: `app/src/views/AppLayout.vue`

- [ ] **Step 1: Wire start/stop**

Modify `app/src/views/AppLayout.vue`. Find the existing `entityStore.start()` call in the `onMounted` hook and add `configStore.start()` next to it. Same for `entityStore.stop()` in `onBeforeUnmount`.

```ts
import { configStore } from "@/stores/config-store";

// in onMounted, after entityStore.start():
void configStore.start();

// in onBeforeUnmount, after entityStore.stop():
configStore.stop();
```

Also add a `configStore.onChanged` subscription that refreshes the command-palette catalog:

```ts
onMounted(() => {
  // existing code...
  void configStore.start();
  const unsubscribe = configStore.onChanged(() => { void loadCatalog(); });
  onBeforeUnmount(() => {
    unsubscribe();
    configStore.stop();
  });
});
```

Hmm — `onBeforeUnmount` is a separate hook, can't be called inside `onMounted`. Refactor:

```ts
let unsubChangedFn: (() => void) | null = null;
onMounted(() => {
  // existing code...
  void configStore.start();
  unsubChangedFn = configStore.onChanged(() => { void loadCatalog(); });
});

onBeforeUnmount(() => {
  // existing code...
  unsubChangedFn?.();
  configStore.stop();
});
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/src/views/AppLayout.vue
git commit -m "feat(app): AppLayout starts configStore; refreshes palette on change"
```

---

## Task 13: Wire view re-fetch hooks

`AutomationsView`, `HomeView`, `RoomDetailView` each register a `configStore.onChanged` callback that re-runs their existing `list*` fetch logic.

**Files:**
- Modify: `app/src/views/AutomationsView.vue`
- Modify: `app/src/views/HomeView.vue`
- Modify: `app/src/views/RoomDetailView.vue`

For each file, the pattern is:

```ts
import { configStore } from "@/stores/config-store";

// in <script setup>:
let unsubConfigChanged: (() => void) | null = null;

onMounted(async () => {
  // existing fetch logic...
  unsubConfigChanged = configStore.onChanged(() => {
    // call whatever the existing refetch function is — refresh(),
    // load(), or inline the original fetch logic. Each view names
    // it differently; just call what onMounted calls.
    void refresh();  // adjust to the actual function name
  });
});

onBeforeUnmount(() => {
  unsubConfigChanged?.();
});
```

- [ ] **Step 1: Modify AutomationsView**

Read `app/src/views/AutomationsView.vue`. Identify the function the existing `onMounted` calls to load automations. Add the `configStore.onChanged` subscription as above. Unsubscribe in `onBeforeUnmount` (add the hook if absent).

- [ ] **Step 2: Modify HomeView**

Same pattern. The view fetches both automations and areas; the refresh callback re-runs both.

- [ ] **Step 3: Modify RoomDetailView**

Same pattern. Refresh callback re-runs areas + scenes fetches.

- [ ] **Step 4: Typecheck + smoke**

Run: `cd app && npm run typecheck`
Expected: PASS.

If a Playwright suite exists, run a basic page-load check:

```bash
cd app && npx playwright test --grep "AutomationsView" 2>/dev/null || echo "(no Playwright suite or grep didn't match — fine)"
```

- [ ] **Step 5: Commit**

```bash
git add app/src/views/AutomationsView.vue app/src/views/HomeView.vue app/src/views/RoomDetailView.vue
git commit -m "feat(app): views re-fetch on configStore.onChanged"
```

---

## Task 14: SyConnectionMenu component

The connection menu pops up when the user clicks the status indicator. Shows status, last-reload time, "Reload config" action, last-reload error.

**Files:**
- Create: `app/src/lib/components/topbar/SyConnectionMenu.vue`

- [ ] **Step 1: Write the component**

Create `app/src/lib/components/topbar/SyConnectionMenu.vue`:

```vue
<!--
  SyConnectionMenu — popover content shown when the user clicks the
  daemon-status dot in the topbar. Displays connection state, last
  successful reload timestamp, and a "Reload config" button. If the
  last reload returned an error, it surfaces inline.

  Used as the content slot of a SyMenu trigger in SyTopBar.
-->
<script setup lang="ts">
import { computed } from "vue";
import { SyText, SyButton, SyIcon } from "@/lib";
import { configStore } from "@/stores/config-store";

const props = defineProps<{
  daemonStatus: "ok" | "reconnecting" | "down" | "checking";
}>();

const emit = defineEmits<{
  close: [];
}>();

const lastReloadLabel = computed<string>(() => {
  const at = configStore.lastReloadAt.value;
  if (!at) return "Not yet reloaded this session";
  return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
});

const canReload = computed<boolean>(() => props.daemonStatus === "ok");

async function onReload(): Promise<void> {
  await configStore.triggerReload();
  // Only close on success — error stays visible until the user dismisses.
  if (!configStore.lastReloadError.value) {
    emit("close");
  }
}
</script>

<template>
  <div class="sy-conn-menu">
    <div class="sy-conn-menu__row">
      <SyText variant="label" tone="subtle">Daemon</SyText>
      <SyText variant="body">{{ daemonStatus === "ok" ? "Connected" : daemonStatus === "reconnecting" ? "Reconnecting…" : daemonStatus === "down" ? "Disconnected" : "Checking…" }}</SyText>
    </div>
    <div class="sy-conn-menu__row">
      <SyText variant="label" tone="subtle">Last reload</SyText>
      <SyText variant="body">{{ lastReloadLabel }}</SyText>
    </div>

    <div class="sy-conn-menu__sep" />

    <SyButton intent="ghost" size="sm" :disabled="!canReload" @click="onReload">
      <SyIcon name="refresh" :size="14" /> Reload config
    </SyButton>

    <SyText
      v-if="configStore.lastReloadError.value"
      variant="caption"
      tone="bad"
      class="sy-conn-menu__err"
    >
      {{ configStore.lastReloadError.value }}
    </SyText>
  </div>
</template>

<style scoped>
.sy-conn-menu {
  display: flex;
  flex-direction: column;
  gap: var(--sy-space-2);
  padding: var(--sy-space-3);
  min-width: 240px;
}
.sy-conn-menu__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sy-space-3);
}
.sy-conn-menu__sep {
  height: 1px;
  background: var(--sy-color-line-soft);
  margin: var(--sy-space-1) 0;
}
.sy-conn-menu__err {
  margin-top: var(--sy-space-2);
  white-space: pre-wrap;
}
</style>
```

If `SyIcon name="refresh"` doesn't exist in the icon set, swap for an existing icon name (check `app/src/lib/components/icon/`). Likely candidates: `arrows-clockwise`, `reload`, or just a unicode character `↻` in a span.

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/components/topbar/SyConnectionMenu.vue
git commit -m "feat(app): SyConnectionMenu popover content"
```

---

## Task 15: Wrap SyDot in a click trigger; integrate SyConnectionMenu

**Files:**
- Modify: `app/src/lib/components/topbar/SyTopBar.vue`

- [ ] **Step 1: Convert the status span to a popover trigger**

In `SyTopBar.vue`, replace:

```vue
<span class="sy-topbar__status" :title="dotProps.label">
  <SyDot :intent="dotProps.intent" :pulse="dotProps.pulse" size="sm" :label="dotProps.label" />
</span>
```

with a popover trigger. Use the existing pattern from `SyMenu` if it works for non-list popover content; otherwise inline a small `v-if` popover:

```vue
<div class="sy-topbar__status-wrap">
  <button
    type="button"
    class="sy-topbar__status"
    :title="dotProps.label"
    @click.stop="menuOpen = !menuOpen"
  >
    <SyDot :intent="dotProps.intent" :pulse="dotProps.pulse" size="sm" :label="dotProps.label" />
  </button>
  <div v-if="menuOpen" class="sy-topbar__status-pop" @click.stop>
    <SyConnectionMenu :daemon-status="daemonStatus" @close="menuOpen = false" />
  </div>
</div>
```

Add the script logic:

```ts
import { ref, onBeforeUnmount } from "vue";
import SyConnectionMenu from "./SyConnectionMenu.vue";

const menuOpen = ref<boolean>(false);

function closeOnOutside(): void {
  menuOpen.value = false;
}

watch(menuOpen, (open) => {
  if (open) {
    document.addEventListener("click", closeOnOutside);
  } else {
    document.removeEventListener("click", closeOnOutside);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeOnOutside);
});
```

Add the styles:

```css
.sy-topbar__status-wrap {
  position: relative;
}
.sy-topbar__status {
  /* existing styles */
  cursor: pointer;
  background: transparent;
  border: none;
  padding: 4px;
  border-radius: var(--sy-radius-sm);
}
.sy-topbar__status:hover {
  background: var(--sy-color-surface-2);
}
.sy-topbar__status-pop {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--sy-color-surface-1);
  border: 1px solid var(--sy-color-line);
  border-radius: var(--sy-radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 100;
}
```

The `watch` import needs to be added at the top.

If a richer dismissal pattern is preferred (Escape key, focus-out), copy the pattern from `SyMenu.vue`. For v1 the click-outside listener is sufficient.

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/components/topbar/SyTopBar.vue
git commit -m "feat(app): topbar status indicator opens connection menu on click"
```

---

## Task 16: End-to-end Playwright loop-closure

Save an automation via the form. Assert it appears in the AutomationsView list within 2 seconds without manual reload.

**Files:**
- Create or extend: `app/e2e/config-subscription.spec.ts` (or wherever the project's Playwright specs live)

- [ ] **Step 1: Inspect existing E2E test setup**

Check `app/playwright.config.ts` and existing `.spec.ts` files for the daemon-startup pattern. There may already be a fixture that boots `switchyardd` against a temp config dir.

If no Playwright setup exists in `app/e2e/`, this task can be reduced to a manual checklist (Task 17). Search:

```bash
find /Users/fdatoo/Developer/Switchyard/app -name "*.spec.ts" -o -name "playwright.config.ts" 2>/dev/null
```

- [ ] **Step 2: Write the test**

If Playwright is configured, write:

```ts
// app/e2e/config-subscription.spec.ts
import { test, expect } from "@playwright/test";

test("new automation appears via Subscribe without manual reload", async ({ page }) => {
  await page.goto("/automations");

  // Open the "+ New automation" form.
  await page.getByRole("button", { name: /New automation/i }).click();

  // Fill required fields.
  await page.getByPlaceholder(/^id/).fill("subscribe-test");

  // Add a trigger and an action. Specifics depend on the form layout —
  // mirror whatever an existing form-driven test does.
  await page.getByRole("button", { name: /Save/i }).click();

  // Assert the automation appears in the list within 5s.
  await expect(
    page.getByText("subscribe-test"),
  ).toBeVisible({ timeout: 5_000 });
});
```

If no Playwright suite exists, defer to manual validation (Task 17) and skip this step.

- [ ] **Step 3: Run the test**

```bash
cd app && npx playwright test config-subscription
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/e2e/config-subscription.spec.ts
git commit -m "test(e2e): config Subscribe loop-closure via Playwright"
```

---

## Task 17: Manual validation (if no Playwright)

If Task 16 was skipped because Playwright isn't set up, do a manual validation pass:

- [ ] **Step 1: Start the daemon**

```bash
go run ./cmd/switchyardd --config-dir <some-test-dir>
```

- [ ] **Step 2: Open the web UI**

Navigate to `http://localhost:8080` (or whichever port the daemon serves).

- [ ] **Step 3: Drive the form**

Click "+ New automation". Fill in an id like `manual-subscribe-test`. Add a trigger and an action. Save.

- [ ] **Step 4: Verify**

Without reloading the page, confirm the new automation appears in the AutomationsView list within 2 seconds.

- [ ] **Step 5: Test the manual reload button**

Click the daemon-status dot in the topbar. Verify the connection menu opens. Click "Reload config". Verify the menu closes and the "Last reload" timestamp updates.

- [ ] **Step 6: Test error surfacing**

Manually corrupt one of the automation files (e.g., `echo "broken" >> <configDir>/automations/manual-subscribe-test.pkl`). The watcher should trigger a reload that finds the file broken — but since it's a soft error per the auto-discovery spec, the snapshot still moves and ConfigChanged fires. The corrupted file's automation disappears from the list.

Now corrupt `main.pkl` itself. Apply should fail. Click "Reload config" — the menu's last-reload-error should show the Pkl error message.

No commit for manual validation; just a confidence check.

---

## Final verification

- [ ] **Run the full test suite**

```bash
go test ./... -count=1
go test -tags integration ./internal/... -count=1
cd app && npm run typecheck
```

Expected: all PASS.

- [ ] **Smoke-build the daemon**

```bash
go build ./cmd/switchyardd
```

Expected: clean build.

- [ ] **Update the autodiscovery progress log**

In `docs/design/plans/2026-05-12-pkl-starlark-editors-progress.md`, add a final note in the Decision log:

```
- **2026-05-12 (loop fully closed):** Track A — reactive config
  subscription — landed on top of auto-discovery. Form-driven saves
  now appear in views within seconds without manual reload. Topbar
  status indicator gains a "Reload config" action. Tracks B (scenes
  end-to-end) and C (Starlark LSP) remain.
```

---

## Notes on task ordering

Tasks 1-9 are daemon-side and must run sequentially (1 → 2 → 3 → 4 → 5/6 in parallel → 7 → 8 → 9).

Tasks 10-15 are front-end and depend on Task 1's proto being generated. Otherwise mostly independent — could run in parallel pairs (10 + 11; 12 + 13 + 14; 15).

Tasks 16/17 are validation; pick one based on whether Playwright is set up.

Suggested wave plan for subagent-driven execution:

| Wave | Tasks |
|------|-------|
| 0 | 1 (proto + regen — gate everything) |
| 1 | 2, 3 (pubsub + reloader, disjoint) |
| 2 | 4 (wire reloader into daemon — depends on 2 + 3) |
| 3 | 5, 6 (form trigger + watcher trigger — disjoint) |
| 4 | 7 (Reload-RPC routing) |
| 5 | 8 (Subscribe handler) |
| 6 | 9 (daemon E2E) |
| 7 | 10, 11 (TS client + store — disjoint, both need proto from Wave 0) |
| 8 | 12, 14 (AppLayout + ConnectionMenu — disjoint) |
| 9 | 13, 15 (View hooks + topbar integration — disjoint) |
| 10 | 16/17 (validation) |
