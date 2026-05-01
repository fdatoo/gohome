# Dynamic Carport Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `RegisterInstance`/`UnregisterInstance` on `carport.Host` and wire it as the real `CarportManager` in the daemon, so driver instances declared in `main.pkl` are spawned and supervised at runtime.

**Architecture:** Add a `binary` field to the Pkl `DriverInstance` base class and `DriverInstanceConfig` proto so the executable path flows through the evaluation pipeline. Implement `RegisterInstance`/`UnregisterInstance` on `carport.Host` using the existing `launchLifecycle`/`shutdownInstance` machinery. Replace the `nopCarportManager` stub in `daemon.go` with the real `d.carport`. Drivers from `drivers.toml` and `main.pkl` coexist; IDs must not overlap — `RegisterInstance` returns an error on duplicate.

**Tech Stack:** Go, `internal/carport`, `internal/config`, `proto/gohome/config/v1`; `task proto` for codegen; `task build` / `task test` throughout.

---

## Codebase orientation

Read these files before starting:

| File | Why |
|---|---|
| `internal/carport/carport.go` | `Host` struct + `Start`/`Stop` — new methods go here |
| `internal/carport/supervisor.go` | `launchLifecycle(ctx, m)` and `shutdownInstance(ctx, m)` — reused unchanged |
| `internal/carport/config.go` | `Instance` struct and lifecycle defaults — extract `defaultLifecycleConfig()` here |
| `internal/config/manager.go` | `CarportManager` interface — adding `binary` param to `RegisterInstance` |
| `internal/config/evaluator.go` | JSON parsing of driver instances — add `binary` extraction |
| `internal/daemon/daemon.go` | Phase 4.5 (carport) then 4.6 (config) — swap nop for real carport at line ~220 |

---

## File map

### Modified files

| File | Change |
|---|---|
| `internal/config/pkl/gohome/carport.pkl` | Add `binary: String(!isEmpty)` to `DriverInstance` |
| `proto/gohome/config/v1/snapshot.proto` | Add `string binary = 5` to `DriverInstanceConfig` |
| `internal/config/evaluator.go` | Extract `binary` from driver instance JSON; populate proto field |
| `internal/config/manager.go` | Add `binary string` to `CarportManager.RegisterInstance`; pass it in `Apply` |
| `internal/config/manager_test.go` | Update `fakeCarport.RegisterInstance` signature |
| `internal/carport/config.go` | Add `defaultLifecycleConfig()` helper |
| `internal/carport/carport.go` | Add `ctx` field; implement `RegisterInstance` + `UnregisterInstance` |
| `internal/daemon/daemon.go` | Pass `d.carport` to `config.NewManager`; remove `nopCarportManager`; add compile-time assertion |
| `internal/cli/config.go` | Update `nopCarportManager.RegisterInstance` signature |

### New files

| File | Responsibility |
|---|---|
| `internal/carport/dynamic_test.go` | Unit tests for `RegisterInstance`/`UnregisterInstance` error cases |

---

## Task 1: Add `binary` to Pkl schema, proto, and evaluator

**Files:**
- Modify: `internal/config/pkl/gohome/carport.pkl`
- Modify: `proto/gohome/config/v1/snapshot.proto`
- Modify: `internal/config/evaluator.go`

- [ ] **Step 1: Add `binary` to `DriverInstance` in carport.pkl**

Full file content for `internal/config/pkl/gohome/carport.pkl`:

```pkl
module gohome.carport

// DriverInstance is the base class for all driver instance configs.
// Driver authors extend this with their own typed fields.
abstract class DriverInstance {
  id: String(!isEmpty)
  driverName: String(!isEmpty)
  binary: String(!isEmpty)
}
```

- [ ] **Step 2: Add `binary` to `DriverInstanceConfig` proto**

In `proto/gohome/config/v1/snapshot.proto`, update `DriverInstanceConfig`:

```protobuf
message DriverInstanceConfig {
  string id          = 1;
  string driver_name = 2;
  bytes  config_hash = 3;
  bytes  params      = 4;
  string binary      = 5;
}
```

- [ ] **Step 3: Regenerate proto**

```bash
task proto
```

Expected: `gen/gohome/config/v1/snapshot.pb.go` updated, `GetBinary()` accessor present.

- [ ] **Step 4: Extract `binary` in evaluator.go**

In `internal/config/evaluator.go`, find the anonymous struct inside `parseConfigJSON` that extracts per-instance fields:

```go
var base struct {
    ID         string `json:"id"`
    DriverName string `json:"driverName"`
}
```

Replace with:

```go
var base struct {
    ID         string `json:"id"`
    DriverName string `json:"driverName"`
    Binary     string `json:"binary"`
}
```

In the same block where the proto struct is constructed, add `Binary`:

```go
snap.DriverInstances = append(snap.DriverInstances, &configpb.DriverInstanceConfig{
    Id:         base.ID,
    DriverName: base.DriverName,
    Binary:     base.Binary,
    ConfigHash: h[:],
    Params:     rawInst,
})
```

- [ ] **Step 5: Build and test**

```bash
task build && task test
```

Expected: compiles; all tests pass. No behaviour change yet.

- [ ] **Step 6: Commit**

```bash
git add internal/config/pkl/gohome/carport.pkl proto/gohome/config/v1/snapshot.proto gen/ internal/config/evaluator.go
git commit -m "feat(carport,config): add binary field to DriverInstance and DriverInstanceConfig proto"
```

---

## Task 2: Update CarportManager interface and all call sites

**Files:**
- Modify: `internal/config/manager.go`
- Modify: `internal/config/manager_test.go`
- Modify: `internal/daemon/daemon.go`
- Modify: `internal/cli/config.go`

- [ ] **Step 1: Update the interface in manager.go**

In `internal/config/manager.go`, change `CarportManager`:

```go
type CarportManager interface {
    RegisterInstance(ctx context.Context, id, driverName, binary string, params []byte) error
    UnregisterInstance(ctx context.Context, id string) error
}
```

- [ ] **Step 2: Pass binary in Apply**

Still in `manager.go`, in the `Apply` method update both `RegisterInstance` calls:

```go
// In DriverInstancesAdded loop:
if err := m.carportMgr.RegisterInstance(ctx, di.GetId(), di.GetDriverName(), di.GetBinary(), di.GetParams()); err != nil {
    return fmt.Errorf("register %q: %w", id, err)
}

// In DriverInstancesChanged loop (re-register after unregister):
if err := m.carportMgr.RegisterInstance(ctx, di.GetId(), di.GetDriverName(), di.GetBinary(), di.GetParams()); err != nil {
    return fmt.Errorf("re-register changed %q: %w", id, err)
}
```

- [ ] **Step 3: Update fakeCarport in manager_test.go**

In `internal/config/manager_test.go`, update `fakeCarport`:

```go
type fakeCarport struct {
    registered   []string
    unregistered []string
}

func (f *fakeCarport) RegisterInstance(_ context.Context, id, _, _ string, _ []byte) error {
    f.registered = append(f.registered, id)
    return nil
}

func (f *fakeCarport) UnregisterInstance(_ context.Context, id string) error {
    f.unregistered = append(f.unregistered, id)
    return nil
}
```

- [ ] **Step 4: Update nopCarportManager in daemon.go**

In `internal/daemon/daemon.go`, update the method signature:

```go
func (n *nopCarportManager) RegisterInstance(_ context.Context, _, _, _ string, _ []byte) error {
    return nil
}
```

- [ ] **Step 5: Update nopCarportManager in cli/config.go**

In `internal/cli/config.go`:

```go
func (n *nopCarportManager) RegisterInstance(_ context.Context, _, _, _ string, _ []byte) error {
    return nil
}
```

- [ ] **Step 6: Build and test**

```bash
task build && task test
```

Expected: compiles; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add internal/config/manager.go internal/config/manager_test.go internal/daemon/daemon.go internal/cli/config.go
git commit -m "feat(config): add binary param to CarportManager.RegisterInstance"
```

---

## Task 3: Add defaultLifecycleConfig helper to carport/config.go

**Files:**
- Modify: `internal/carport/config.go`

- [ ] **Step 1: Add the helper**

In `internal/carport/config.go`, add `defaultLifecycleConfig()` after the `intd` helper at the bottom of the file:

```go
// defaultLifecycleConfig returns the defaults used for dynamically registered
// instances (those coming from main.pkl rather than drivers.toml).
func defaultLifecycleConfig() LifecycleConfig {
    return LifecycleConfig{
        HandshakeDeadline:       5 * time.Second,
        HealthProbeInterval:     15 * time.Second,
        HealthProbeTimeout:      3 * time.Second,
        HealthFailuresToRestart: 3,
        ShutdownGrace:           10 * time.Second,
        RestartBackoffInitial:   time.Second,
        RestartBackoffMax:       60 * time.Second,
        RestartBudgetWindow:     10 * time.Minute,
        RestartBudgetMax:        10,
    }
}
```

- [ ] **Step 2: Build and test**

```bash
task build && task test
```

Expected: passes. `LoadConfig` behaviour is unchanged.

- [ ] **Step 3: Commit**

```bash
git add internal/carport/config.go
git commit -m "refactor(carport): extract defaultLifecycleConfig helper"
```

---

## Task 4: Implement RegisterInstance and UnregisterInstance on carport.Host

**Files:**
- Modify: `internal/carport/carport.go`
- Create: `internal/carport/dynamic_test.go`

- [ ] **Step 1: Write failing tests**

Create `internal/carport/dynamic_test.go`:

```go
package carport

import (
    "context"
    "testing"
)

func TestRegisterInstance_HostNotStarted(t *testing.T) {
    h := &Host{
        instances: map[string]*managedInstance{},
        stopped:   make(chan struct{}),
        // ctx is nil — host not started
    }
    err := h.RegisterInstance(context.Background(), "new", "fake", "/bin/fake", nil)
    if err == nil {
        t.Fatal("expected error when host not started (ctx nil)")
    }
}

func TestRegisterInstance_DuplicateID(t *testing.T) {
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()
    h := &Host{
        instances: map[string]*managedInstance{
            "existing": {cfg: Instance{ID: "existing"}},
        },
        stopped: make(chan struct{}),
        ctx:     ctx,
    }
    err := h.RegisterInstance(context.Background(), "existing", "fake", "/bin/fake", nil)
    if err == nil {
        t.Fatal("expected error for duplicate instance ID")
    }
}

func TestRegisterInstance_HostStopped(t *testing.T) {
    stopped := make(chan struct{})
    close(stopped) // host is already stopped
    h := &Host{
        instances: map[string]*managedInstance{},
        stopped:   stopped,
        ctx:       context.Background(),
    }
    err := h.RegisterInstance(context.Background(), "new", "fake", "/bin/fake", nil)
    if err == nil {
        t.Fatal("expected error when host is stopped")
    }
}

func TestUnregisterInstance_NotFound(t *testing.T) {
    h := &Host{
        instances: map[string]*managedInstance{},
        stopped:   make(chan struct{}),
    }
    err := h.UnregisterInstance(context.Background(), "missing")
    if err == nil {
        t.Fatal("expected error for missing instance")
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/carport/... -run "TestRegisterInstance|TestUnregisterInstance" -v
```

Expected: FAIL — `RegisterInstance` and `UnregisterInstance` undefined; `ctx` field missing.

- [ ] **Step 3: Add ctx field to Host**

In `internal/carport/carport.go`, add `ctx` to the `Host` struct (after `metrics`):

```go
type Host struct {
    cfg     HostConfig
    cfgData *Config

    db      *sql.DB
    store   *eventstore.Store
    router  *Router
    logger  *slog.Logger
    metrics *observability.Metrics

    ctx context.Context // root context for lifecycle goroutines; set by Start

    mu        sync.RWMutex
    instances map[string]*managedInstance

    stopOnce sync.Once
    stopped  chan struct{}
}
```

- [ ] **Step 4: Store ctx in Start**

In `carport.go`, update `Start` to store the context:

```go
func (h *Host) Start(ctx context.Context) error {
    h.ctx = ctx
    for _, inst := range h.cfgData.Instances {
        if !inst.Enabled {
            continue
        }
        m := &managedInstance{cfg: inst, state: StateDeclared}
        h.mu.Lock()
        h.instances[inst.ID] = m
        h.mu.Unlock()
        h.launchLifecycle(ctx, m)
    }
    return nil
}
```

- [ ] **Step 5: Implement RegisterInstance and UnregisterInstance**

In `internal/carport/carport.go`, add these methods after `Stop` (and before the `// launchLifecycle and shutdownInstance are implemented in supervisor.go` comment):

```go
// RegisterInstance adds a new driver instance and begins its lifecycle goroutine.
// Returns an error if an instance with that ID is already registered, if the host
// has not been started, or if the host has been stopped.
// IDs must not conflict with instances already running from drivers.toml.
func (h *Host) RegisterInstance(_ context.Context, id, driverName, binary string, params []byte) error {
    if h.ctx == nil {
        return fmt.Errorf("carport host not started")
    }
    select {
    case <-h.stopped:
        return fmt.Errorf("carport host is stopped")
    default:
    }
    h.mu.Lock()
    if _, exists := h.instances[id]; exists {
        h.mu.Unlock()
        return fmt.Errorf("instance %q already registered", id)
    }
    inst := Instance{
        ID:         id,
        Binary:     binary,
        Enabled:    true,
        ConfigJSON: params,
        Lifecycle:  defaultLifecycleConfig(),
    }
    m := &managedInstance{cfg: inst, state: StateDeclared}
    h.instances[id] = m
    h.mu.Unlock()
    h.launchLifecycle(h.ctx, m)
    return nil
}

// UnregisterInstance stops and removes a driver instance by ID.
// Returns an error if the instance is not found.
func (h *Host) UnregisterInstance(_ context.Context, id string) error {
    h.mu.Lock()
    m, exists := h.instances[id]
    if !exists {
        h.mu.Unlock()
        return fmt.Errorf("instance %q not found", id)
    }
    delete(h.instances, id)
    h.mu.Unlock()
    // Use Background context so shutdown isn't cut short by the caller's deadline.
    // Shutdown duration is bounded by m.cfg.Lifecycle.ShutdownGrace.
    h.shutdownInstance(context.Background(), m)
    return nil
}
```

`fmt` is already imported in `carport.go`. `context` is already imported.

- [ ] **Step 6: Run tests to verify they pass**

```bash
go test ./internal/carport/... -run "TestRegisterInstance|TestUnregisterInstance" -v
```

Expected: all four tests PASS.

- [ ] **Step 7: Full build and test**

```bash
task build && task test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add internal/carport/carport.go internal/carport/dynamic_test.go
git commit -m "feat(carport): implement RegisterInstance and UnregisterInstance on Host"
```

---

## Task 5: Wire real carport into daemon

**Files:**
- Modify: `internal/daemon/daemon.go`

- [ ] **Step 1: Replace nopCarportManager with d.carport**

In `internal/daemon/daemon.go`, find the config manager construction at phase 4.6 (search for `nopCarportManager`):

```go
cfgMgr, err := config.NewManager(ctx, configDir, d.store, &nopCarportManager{})
```

Replace with:

```go
cfgMgr, err := config.NewManager(ctx, configDir, d.store, d.carport)
```

- [ ] **Step 2: Remove the nopCarportManager type**

Delete the entire `nopCarportManager` block (the comment, struct, and two methods):

```go
// DELETE this entire block:
// nopCarportManager satisfies config.CarportManager until carport.Host gains
// RegisterInstance/UnregisterInstance methods (C5+).
type nopCarportManager struct{}

func (n *nopCarportManager) RegisterInstance(_ context.Context, _, _, _ string, _ []byte) error {
    return nil
}
func (n *nopCarportManager) UnregisterInstance(_ context.Context, _ string) error {
    return nil
}
```

- [ ] **Step 3: Add compile-time interface assertion**

In `internal/daemon/daemon.go`, add after the `import` block:

```go
// Compile-time assertion: *carport.Host must satisfy config.CarportManager.
var _ config.CarportManager = (*carport.Host)(nil)
```

- [ ] **Step 4: Build**

```bash
task build
```

Expected: compiles. The assertion confirms the interface is satisfied. If it fails, the missing method will be named in the error.

- [ ] **Step 5: Full test suite with race detector**

```bash
task test && task test:race
```

Expected: all pass, no races.

- [ ] **Step 6: Commit**

```bash
git add internal/daemon/daemon.go
git commit -m "feat(daemon): wire carport.Host as real CarportManager, remove nop stub"
```

---

## Task 6: Remove drivers.toml support

Now that `main.pkl` is the canonical driver source, remove the static TOML loading path entirely.

**Files:**
- Modify: `internal/carport/config.go` — delete `Config` struct and `LoadConfig()`
- Delete: `internal/carport/config_test.go` — only tested `LoadConfig`
- Modify: `internal/carport/carport.go` — remove `cfgData` field and TOML loop from `Start`; remove `DriversTOMLPath` from `HostConfig`
- Modify: `internal/daemon/config.go` — remove `DriversTOMLPath` field and its default
- Modify: `internal/daemon/daemon.go` — remove `driversTOML` resolution block and flag passthrough
- Modify: `cmd/gohomed/main.go` — remove `--drivers-toml` flag

- [ ] **Step 1: Prune config.go — delete LoadConfig and Config**

In `internal/carport/config.go`, delete the `Config` struct and `LoadConfig` function. Keep `LifecycleConfig`, `Instance`, `defaultLifecycleConfig`, `dur`, and `intd`. The file should look like this after the edit:

```go
package carport

import (
	"time"
)

// LifecycleConfig tunes per-instance timing and restart policy.
// Zero values get replaced by defaults during load.
type LifecycleConfig struct {
	HandshakeDeadline       time.Duration
	HealthProbeInterval     time.Duration
	HealthProbeTimeout      time.Duration
	HealthFailuresToRestart int
	ShutdownGrace           time.Duration
	RestartBackoffInitial   time.Duration
	RestartBackoffMax       time.Duration
	RestartBudgetWindow     time.Duration
	RestartBudgetMax        int
}

// Instance is a single driver instance declaration.
type Instance struct {
	ID         string
	Binary     string
	Enabled    bool
	ConfigJSON []byte
	Lifecycle  LifecycleConfig
}

// defaultLifecycleConfig returns the defaults used for dynamically registered
// instances (those coming from main.pkl rather than drivers.toml).
func defaultLifecycleConfig() LifecycleConfig {
	return LifecycleConfig{
		HandshakeDeadline:       5 * time.Second,
		HealthProbeInterval:     15 * time.Second,
		HealthProbeTimeout:      3 * time.Second,
		HealthFailuresToRestart: 3,
		ShutdownGrace:           10 * time.Second,
		RestartBackoffInitial:   time.Second,
		RestartBackoffMax:       60 * time.Second,
		RestartBudgetWindow:     10 * time.Minute,
		RestartBudgetMax:        10,
	}
}

func dur(ms int, def time.Duration) time.Duration {
	if ms <= 0 {
		return def
	}
	return time.Duration(ms) * time.Millisecond
}

func intd(v, def int) int {
	if v <= 0 {
		return def
	}
	return v
}
```

- [ ] **Step 2: Delete config_test.go**

```bash
rm internal/carport/config_test.go
```

- [ ] **Step 3: Update HostConfig and Host in carport.go**

In `internal/carport/carport.go`, remove `DriversTOMLPath` from `HostConfig`:

```go
type HostConfig struct {
	// SocketDir is where per-instance UDS files are created. Defaults to
	// <data_dir>/carport/ in the daemon wiring; required for any instance to be spawned.
	SocketDir string
}
```

Remove the `cfgData *Config` field from `Host`:

```go
type Host struct {
	cfg     HostConfig

	db      *sql.DB
	store   *eventstore.Store
	router  *Router
	logger  *slog.Logger
	metrics *observability.Metrics

	ctx context.Context

	mu        sync.RWMutex
	instances map[string]*managedInstance

	stopOnce sync.Once
	stopped  chan struct{}
}
```

Simplify `New` — no more TOML loading:

```go
func New(cfg HostConfig, db *sql.DB, store *eventstore.Store, reg *registry.Registry, logger *slog.Logger, metrics *observability.Metrics) (*Host, error) {
	return &Host{
		cfg:       cfg,
		db:        db,
		store:     store,
		router:    NewRouter(reg),
		logger:    logger.With("subsystem", "carport"),
		metrics:   metrics,
		instances: map[string]*managedInstance{},
		stopped:   make(chan struct{}),
	}, nil
}
```

Simplify `Start` — remove the TOML instance loop (keep the `h.ctx = ctx` line added in Task 4):

```go
func (h *Host) Start(ctx context.Context) error {
	h.ctx = ctx
	return nil
}
```

- [ ] **Step 4: Build to catch compile errors**

```bash
task build
```

Expected: compile errors pointing to the `DriversTOMLPath` references in daemon. Fix them in the next steps.

- [ ] **Step 5: Remove DriversTOMLPath from daemon/config.go**

In `internal/daemon/config.go`, remove the `DriversTOMLPath` field and its default:

```go
type Config struct {
	DataDir             string
	LogLevel            slog.Level
	LogFormat           string
	AdminPort           int
	SocketPath          string
	SnapshotEveryEvents int
	SnapshotEveryPeriod time.Duration
	CarportSocketDir    string
	ConfigDir           string
}

func (c *Config) WithDefaults() {
	if c.DataDir == "" {
		c.DataDir = "~/.local/share/gohome"
	}
	if c.LogFormat == "" {
		c.LogFormat = "auto"
	}
	if c.AdminPort == 0 {
		c.AdminPort = 9190
	}
	if c.SocketPath == "" {
		c.SocketPath = "gohomed.sock"
	}
	if c.SnapshotEveryEvents == 0 {
		c.SnapshotEveryEvents = 10_000
	}
	if c.SnapshotEveryPeriod == 0 {
		c.SnapshotEveryPeriod = time.Hour
	}
	if c.CarportSocketDir == "" {
		c.CarportSocketDir = "@data/carport"
	}
	if c.ConfigDir == "" {
		c.ConfigDir = "@data/config"
	}
}
```

- [ ] **Step 6: Remove driversTOML resolution from daemon.go**

In `internal/daemon/daemon.go`, find the phase 4.5 carport block (around line 186) and remove the `driversTOML` resolution. The block should become:

```go
// Phase 4.5: carport — driver supervisor
socketDir := d.cfg.CarportSocketDir
if socketDir == "@data/carport" {
    socketDir = filepath.Join(dataDir, "carport")
}
cport, err := carport.New(carport.HostConfig{
    SocketDir: socketDir,
}, d.db, d.store, d.registry, d.logger, d.metrics)
if err != nil {
    return fmt.Errorf("carport: %w", err)
}
d.carport = cport
if err := d.carport.Start(ctx); err != nil {
    return fmt.Errorf("carport start: %w", err)
}
```

- [ ] **Step 7: Remove --drivers-toml flag from cmd/gohomed/main.go**

In `cmd/gohomed/main.go`, delete the flag declaration:

```go
// DELETE:
driversTOML = flag.String("drivers-toml", "", "path to drivers.toml (default <data-dir>/drivers.toml)")
```

And remove `DriversTOMLPath` from the `daemon.Config` construction:

```go
cfg := daemon.Config{
    DataDir:             *dataDir,
    LogLevel:            level,
    LogFormat:           *logFormat,
    AdminPort:           *adminPort,
    SnapshotEveryEvents: *snapshotEveryEvt,
    SnapshotEveryPeriod: *snapshotEveryDur,
    ConfigDir:           *configDir,
}
```

- [ ] **Step 8: Build and full test suite**

```bash
task build && task test
```

Expected: compiles and all tests pass.

- [ ] **Step 9: Commit**

```bash
git add internal/carport/config.go internal/carport/carport.go internal/daemon/config.go internal/daemon/daemon.go cmd/gohomed/main.go
git rm internal/carport/config_test.go
git commit -m "feat(carport): remove drivers.toml — main.pkl is now the sole driver config source"
```

---

## Task 7: Definition of done

- [ ] **Step 1: Build**

```bash
task build
```

Expected: no errors.

- [ ] **Step 2: All tests**

```bash
task test && task test:race
```

Expected: PASS, no races.

- [ ] **Step 3: Integration tests**

```bash
task test:integration
```

Expected: PASS (requires `pkl` on PATH).

- [ ] **Step 4: Smoke test — driver from main.pkl launches**

```bash
mkdir -p /tmp/gohome-smoke/config
cat > /tmp/gohome-smoke/config/main.pkl << 'EOF'
amends "gohome:config"

import "gohome:carport" as cp

local class SmokeDriver extends cp.DriverInstance {}

driverInstances {
  new SmokeDriver {
    id = "smoke-1"
    driverName = "fake"
    binary = "/nonexistent-binary"
  }
}
EOF
./dist/gohomed --data-dir /tmp/gohome-smoke --log-level debug 2>&1 | head -40
```

Expected log lines (in order):
1. `config applied` — confirms `Apply` ran and called `RegisterInstance`
2. `spawn_error` or similar for `smoke-1` — confirms `launchLifecycle` ran (binary doesn't exist)

- [ ] **Step 5: Verify --drivers-toml is gone**

```bash
./dist/gohomed --help 2>&1 | grep drivers-toml
```

Expected: no output.

- [ ] **Step 6: Verify duplicate ID error**

Declare the same `id` twice in `main.pkl` and confirm the daemon exits with a clear error during `Apply`.

---

## Known limitations (follow-up work)

- **No lifecycle tuning from Pkl**: dynamically registered instances always use `defaultLifecycleConfig()`. Add lifecycle fields to `DriverInstance` in a follow-up.
- **Migration**: existing `drivers.toml` entries must be moved to `main.pkl` before upgrading. The `--drivers-toml` flag is gone.
