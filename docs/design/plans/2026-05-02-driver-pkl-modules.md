# Driver Pkl Modules (`driver:<name>`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve `import "driver:hue"` in user Pkl configs via a new `driver:` URI scheme reader backed by per-driver `manifest.pkl` files in `<data-dir>/drivers/<name>/`. Move binary path and lifecycle defaults from per-instance Pkl into per-driver manifests; per-instance Pkl gains `enabled` and a nullable `lifecycle` override.

**Architecture:** A `driverModuleReader` (Pkl `ModuleReader`) reads `<drivers-root>/<name>/manifest.pkl`. A `driverRegistry` in `internal/config/` scans the drivers root at Manager construction (rebuilt on `Manager.Validate`) and caches `name → {binaryPath, lifecycleDefaults}`. `Manager.Apply` resolves each instance's effective binary path and lifecycle (defaults ← manifest ← per-instance) before calling the carport supervisor — the supervisor is unchanged. A new `switchyard:driver` Pkl base module is what each driver's `manifest.pkl` `amends`.

**Tech Stack:** Go 1.23+, Apple `pkl-go` (already a dep), Pkl 0.27+, Cobra (CLI), gRPC/protobuf (existing), standard library only for the new reader/registry.

**Spec:** `docs/design/specs/2026-05-02-driver-pkl-modules-design.md`

---

## File structure

| Path | Status | Responsibility |
|---|---|---|
| `internal/config/pkl/switchyard/driver.pkl` | **new** | Base module each driver's `manifest.pkl` amends. Declares `name`, `version`, `produces`, `lifecycleDefaults`, `binary?`, and the `Instance` mixin that auto-derives `driverName`. |
| `internal/config/driver_reader.go` | **new** | `driverModuleReader` (`pkl.ModuleReader`) for the `driver:` URI scheme; `validDriverName` helper. |
| `internal/config/driver_registry.go` | **new** | `DriverRegistry` — scans `<root>/*/manifest.pkl`, evaluates each, caches name → resolved binary path + lifecycle defaults. Detects directory-name vs `name`-field mismatches. |
| `internal/config/pkl/switchyard/carport.pkl` | **modify** | Drop `binary` from `DriverInstance`; add `enabled`, `lifecycle`; add `LifecycleConfig`/`LifecycleOverride` classes. |
| `internal/config/evaluator.go` | **modify** | `newPklEvaluator(ctx, driversRoot)` registers the new reader. `ValidateOffline(ctx, configDir, driversRoot)`. `parseConfigJSON` no longer reads per-instance `binary`; reads `enabled` + `lifecycle`. |
| `internal/config/manager.go` | **modify** | `NewManager` takes `driversRoot`, builds the registry. `Apply` resolves binary/lifecycle from registry. `CarportManager` interface gains `enabled` + `lifecycle`. |
| `internal/carport/carport.go` | **modify** | New `RegisterInstanceFull` method on `*Host` matching the extended interface; `RegisterInstance`/`RegisterInstanceWithLifecycle` adapters in terms of it. |
| `internal/daemon/config.go` | **modify** | New `DriversDir string` field. |
| `internal/daemon/daemon.go` | **modify** | Resolve `DriversDir` (default `<dataDir>/drivers`); pass to `config.NewManager`; one-shot deprecation log if `<dataDir>/drivers.toml` exists. |
| `cmd/switchyardd/main.go` | **modify** | New `--drivers-dir` flag. |
| `internal/cli/config.go` | **modify** | New `--drivers-dir` flag on `validate`; passed to `ValidateOffline`. |
| `internal/config/testdata/valid/main.pkl` | **modify** | Drop `binary = "..."`; add a corresponding fake driver manifest under a sibling `drivers/fake/manifest.pkl`. |
| `internal/config/testdata/drivers/fake/manifest.pkl` | **new** | Fake-driver manifest used by integration tests. |
| `internal/config/evaluator_integration_test.go` | **modify** | All `newPklEvaluator(ctx)` and `ValidateOffline` call sites pass a `driversRoot`. |
| `internal/config/evaluator_starlark_test.go` | **modify** | Same. |
| `internal/config/manager_test.go` | **modify** | `NewManager` calls take `driversRoot`. |
| `internal/config/driver_reader_test.go` | **new** | Unit tests for the reader. |
| `internal/config/driver_registry_test.go` | **new** | Unit tests for registry scan & resolution. |
| `internal/config/manager_apply_driver_test.go` | **new** | Integration test for Apply's binary + lifecycle resolution. |
| `internal/carport/dynamic_test.go` | **modify** | Adapt to extended `RegisterInstanceFull` (or keep using existing methods if the new method is purely additive). |
| `docs/docs/configuration/drivers.md` | **modify** | Drop the C4-deferred caveat box; document `<data-dir>/drivers/<name>/` layout, `--drivers-dir`, the `enabled` + `lifecycle` fields. |
| `docs/docs/drivers/building/manifest.md` | **modify** | Drop the C4 caveat boxes; document Shape α; show real `switchyard:driver` surface. |

---

## Task 1: Update `switchyard:carport` Pkl base module

**Files:**
- Modify: `internal/config/pkl/switchyard/carport.pkl`
- Modify: `internal/config/testdata/valid/main.pkl`

This task changes the user-facing Pkl class shape. Doing it first means later tasks can rely on the new fields. The fixture update keeps existing tests building.

- [ ] **Step 1: Read the current carport.pkl**

```bash
cat internal/config/pkl/switchyard/carport.pkl
```

Current content (3 lines of class body):

```pkl
abstract class DriverInstance {
  id: String(!isEmpty)
  driverName: String(!isEmpty)
  binary: String(!isEmpty)
}
```

- [ ] **Step 2: Rewrite carport.pkl**

Replace the file with:

```pkl
module switchyard.carport

abstract class DriverInstance {
  id: String(!isEmpty)
  driverName: String(!isEmpty)
  enabled: Boolean = true
  lifecycle: LifecycleOverride? = null
}

class LifecycleConfig {
  handshakeDeadline:       Duration = 5.s
  healthProbeInterval:     Duration = 15.s
  healthProbeTimeout:      Duration = 3.s
  healthFailuresToRestart: Int(this >= 1) = 3
  shutdownGrace:           Duration = 10.s
  restartBackoffInitial:   Duration = 1.s
  restartBackoffMax:       Duration = 60.s
  restartBudgetWindow:     Duration = 10.min
  restartBudgetMax:        Int(this >= 1) = 10
}

// Each field nullable — null means "inherit from manifest.lifecycleDefaults",
// which in turn falls back to LifecycleConfig defaults above.
class LifecycleOverride {
  handshakeDeadline:       Duration? = null
  healthProbeInterval:     Duration? = null
  healthProbeTimeout:      Duration? = null
  healthFailuresToRestart: Int?      = null
  shutdownGrace:           Duration? = null
  restartBackoffInitial:   Duration? = null
  restartBackoffMax:       Duration? = null
  restartBudgetWindow:     Duration? = null
  restartBudgetMax:        Int?      = null
}
```

- [ ] **Step 3: Update the existing fixture so it stops using the dropped `binary` field**

Replace `internal/config/testdata/valid/main.pkl`:

```pkl
amends "switchyard:config"

import "switchyard:entities" as ent
import "switchyard:carport" as carport

local class FakeDriverInstance extends carport.DriverInstance {}

driverInstances {
  new FakeDriverInstance {
    id = "fake-main"
    driverName = "fake"
  }
}

entities {
  new ent.Light {
    id = "light.living_room"
    friendlyName = "Living Room"
    supportsBrightness = true
  }
}
```

- [ ] **Step 4: Run the existing config tests to find any other Pkl fixtures that referenced `binary`**

Run: `go test ./internal/config/... -count=1 -run '.*' -v 2>&1 | head -120`
Expected: tests in `evaluator_integration_test.go` and `manager_test.go` may fail because their assertions still expect `Binary` to round-trip. Note the failures — they get fixed in Task 7. Compilation of the Pkl modules themselves should succeed.

- [ ] **Step 5: Commit**

```bash
git add internal/config/pkl/switchyard/carport.pkl internal/config/testdata/valid/main.pkl
git commit -m "feat(pkl): add LifecycleConfig/Override; drop per-instance binary

Per docs/design/specs/2026-05-02-driver-pkl-modules-design.md.
Test failures in internal/config/ are intentional and fixed in
later tasks."
```

---

## Task 2: Add `switchyard:driver` Pkl base module

**Files:**
- Create: `internal/config/pkl/switchyard/driver.pkl`

Each driver's `manifest.pkl` will `amends` this. No Go consumers yet — purely additive.

- [ ] **Step 1: Create the file**

```pkl
// internal/config/pkl/switchyard/driver.pkl
//
// Base module that every driver's manifest.pkl amends. Provides the typed
// surface for the manifest itself plus the `Instance` mixin that auto-derives
// `driverName` from the module-level `name` field.

module switchyard.driver

import "switchyard:carport" as carport

// Module-level fields populated by each driver's manifest.pkl.
name: String                                    // must equal containing directory name; daemon enforces
version: String
description: String?
produces: Listing<String>                       // entity domain types this driver registers
driverEventTypes: Listing<String> = new {}
binary: String?                                 // null → "<name>-driver" (relative paths resolved against driver dir)
lifecycleDefaults: carport.LifecycleConfig = new {}

// Driver-instance mixin. Every driver's instance class extends this; the
// `driverName = name` default ties the instance to its source manifest so
// consumers never write the string by hand.
abstract class Instance extends carport.DriverInstance {
  driverName = name
}
```

- [ ] **Step 2: Verify the embedded FS picks up the new file**

The `//go:embed pkl` directive in `internal/config/evaluator.go:19-20` recursively embeds the `pkl/` tree, so no Go change needed. Confirm:

Run: `go build ./internal/config/...`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add internal/config/pkl/switchyard/driver.pkl
git commit -m "feat(pkl): add switchyard:driver base module

Provides the typed surface for driver manifest.pkl files and the
Instance mixin that auto-derives driverName from module-level name."
```

---

## Task 3: Add `driverModuleReader`

**Files:**
- Create: `internal/config/driver_reader.go`
- Create: `internal/config/driver_reader_test.go`

The reader serves `driver:<name>` URIs from `<root>/<name>/manifest.pkl`. Validates the name component to keep path traversal out.

- [ ] **Step 1: Write the failing test file**

Create `internal/config/driver_reader_test.go`:

```go
package config

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDriverModuleReader_Scheme(t *testing.T) {
	r := &driverModuleReader{root: "/tmp/whatever"}
	if got := r.Scheme(); got != "driver" {
		t.Fatalf("Scheme() = %q, want %q", got, "driver")
	}
}

func TestDriverModuleReader_ReadValidManifest(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "hue"), 0o755); err != nil {
		t.Fatal(err)
	}
	want := "amends \"switchyard:driver\"\nname = \"hue\"\nversion = \"1.0\"\nproduces = new { \"light\" }\n"
	if err := os.WriteFile(filepath.Join(root, "hue", "manifest.pkl"), []byte(want), 0o644); err != nil {
		t.Fatal(err)
	}
	r := &driverModuleReader{root: root}
	got, err := r.Read(url.URL{Scheme: "driver", Opaque: "hue"})
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if got != want {
		t.Fatalf("Read() = %q, want %q", got, want)
	}
}

func TestDriverModuleReader_ReadMissingManifest(t *testing.T) {
	r := &driverModuleReader{root: t.TempDir()}
	_, err := r.Read(url.URL{Scheme: "driver", Opaque: "ghost"})
	if err == nil {
		t.Fatal("expected error for missing manifest, got nil")
	}
	if !strings.Contains(err.Error(), "ghost") || !strings.Contains(err.Error(), "manifest not found") {
		t.Fatalf("error = %q; want it to mention driver name and 'manifest not found'", err.Error())
	}
}

func TestDriverModuleReader_ReadRejectsInvalidNames(t *testing.T) {
	root := t.TempDir()
	r := &driverModuleReader{root: root}
	bad := []string{
		"",
		"../etc/passwd",
		"a/b",
		"UPPERCASE",
		".hidden",
		"with space",
		strings.Repeat("a", 65),
	}
	for _, name := range bad {
		_, err := r.Read(url.URL{Scheme: "driver", Opaque: name})
		if err == nil {
			t.Errorf("Read(driver:%q) should have failed", name)
		}
	}
}

func TestValidDriverName_Allowed(t *testing.T) {
	good := []string{"hue", "z2m", "zigbee2mqtt", "test-driver", "test_driver", "a", "ab12_3-4"}
	for _, name := range good {
		if !validDriverName(name) {
			t.Errorf("validDriverName(%q) = false, want true", name)
		}
	}
}
```

- [ ] **Step 2: Run the test to verify it fails to compile**

Run: `go test ./internal/config/ -run TestDriverModuleReader -v`
Expected: build error — `driverModuleReader` and `validDriverName` undefined.

- [ ] **Step 3: Create `internal/config/driver_reader.go`**

```go
package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"

	"github.com/apple/pkl-go/pkl"
)

// driverModuleReader serves driver:<name> Pkl modules from
// <root>/<name>/manifest.pkl.
type driverModuleReader struct{ root string }

func (r *driverModuleReader) Scheme() string            { return "driver" }
func (r *driverModuleReader) IsGlobbable() bool         { return false }
func (r *driverModuleReader) HasHierarchicalUris() bool { return false }
func (r *driverModuleReader) IsLocal() bool             { return true }
func (r *driverModuleReader) ListElements(_ url.URL) ([]pkl.PathElement, error) {
	return nil, nil
}

func (r *driverModuleReader) Read(u url.URL) (string, error) {
	name := u.Opaque
	if !validDriverName(name) {
		return "", fmt.Errorf("invalid driver name %q in driver:%s", name, name)
	}
	path := filepath.Join(r.root, name, "manifest.pkl")
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("driver %q: manifest not found at %s", name, path)
	}
	return string(data), nil
}

// validDriverName returns true for non-empty strings of length 1..64 made up
// of lowercase ASCII letters, digits, '-', and '_'. Used to keep arbitrary
// path components out of driver: URIs.
func validDriverName(s string) bool {
	if s == "" || len(s) > 64 {
		return false
	}
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= '0' && r <= '9':
		case r == '-', r == '_':
		default:
			return false
		}
	}
	return true
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `go test ./internal/config/ -run TestDriverModuleReader -v && go test ./internal/config/ -run TestValidDriverName -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/config/driver_reader.go internal/config/driver_reader_test.go
git commit -m "feat(config): driverModuleReader for driver:<name> URI scheme

Reads <root>/<name>/manifest.pkl. Rejects names that contain
path components or non-[a-z0-9_-] characters."
```

---

## Task 4: Plumb `driversRoot` through `newPklEvaluator` and `ValidateOffline`

**Files:**
- Modify: `internal/config/evaluator.go`
- Modify: `internal/config/manager.go`
- Modify: `internal/config/evaluator_integration_test.go`
- Modify: `internal/config/evaluator_starlark_test.go`
- Modify: `internal/config/manager_test.go`
- Modify: `internal/cli/config.go`

Signature change. After this task the evaluator registers the new reader, but no `driver:` imports exist yet so behavior is unchanged. Existing tests that call `newPklEvaluator(ctx)` get a `t.TempDir()` so the registry is empty.

- [ ] **Step 1: Modify `newPklEvaluator` in `internal/config/evaluator.go`**

Replace the function (currently at line 26):

```go
func newPklEvaluator(ctx context.Context, driversRoot string) (*pklEvaluator, error) {
	ev, err := pkl.NewEvaluator(ctx, pkl.PreconfiguredOptions,
		pkl.WithModuleReader(&switchyardModuleReader{}),
		pkl.WithModuleReader(&driverModuleReader{root: driversRoot}),
		pkl.WithResourceReader(&starlarkValidatorReader{}),
	)
	if err != nil {
		return nil, fmt.Errorf("pkl evaluator: %w", err)
	}
	return &pklEvaluator{ev: ev}, nil
}
```

- [ ] **Step 2: Modify `ValidateOffline` in the same file (currently around line 511)**

```go
func ValidateOffline(ctx context.Context, configDir, driversRoot string) (*configpb.ConfigSnapshot, []ValidationError, error) {
	ev, err := newPklEvaluator(ctx, driversRoot)
	if err != nil {
		return nil, nil, err
	}
	defer func() { _ = ev.ev.Close() }()

	snap, err := ev.Evaluate(ctx, configDir)
	if err != nil {
		return nil, nil, err
	}
	errs := Compile(snap, nil)
	return snap, errs, nil
}
```

- [ ] **Step 3: Modify `NewManager` in `internal/config/manager.go` (currently line 50)**

```go
func NewManager(ctx context.Context, configDir, driversRoot string, store eventStore, carportMgr CarportManager) (*Manager, error) {
	ev, err := newPklEvaluator(ctx, driversRoot)
	if err != nil {
		return nil, fmt.Errorf("init pkl evaluator: %w", err)
	}
	return &Manager{
		configDir:   configDir,
		driversRoot: driversRoot,
		ev:          ev,
		store:       store,
		carportMgr:  carportMgr,
	}, nil
}
```

Add the `driversRoot string` field to the `Manager` struct (currently at line 29):

```go
type Manager struct {
	configDir   string
	driversRoot string
	ev          configEvaluator
	store       eventStore
	carportMgr  CarportManager
	keyring     Keyring

	mu           sync.RWMutex
	current      *configpb.ConfigSnapshot
	appliedHooks []func(snap *configpb.ConfigSnapshot)
}
```

- [ ] **Step 4: Update test call sites**

Find every call:

```bash
grep -rn 'newPklEvaluator(ctx)\|ValidateOffline(ctx, ' internal/ cmd/
```

For each, change `newPklEvaluator(ctx)` → `newPklEvaluator(ctx, t.TempDir())`, and `ValidateOffline(ctx, dir)` → `ValidateOffline(ctx, dir, t.TempDir())`. For `NewManager` test call sites change `NewManager(ctx, dir, store, mgr)` → `NewManager(ctx, dir, t.TempDir(), store, mgr)`.

For `internal/cli/config.go`'s `newConfigValidateCmd` (around line 30), update the call inside `RunE`:

```go
_, validationErrs, err := config.ValidateOffline(cmd.Context(), configDir, expandHome(driversDir))
```

(`driversDir` is plumbed in Task 9 — for this task, declare it as a temporary local: `driversDir := filepath.Join(expandHome(gf.DataDir), "drivers")`. Task 9 replaces this with a real flag.)

- [ ] **Step 5: Update the daemon call site in `internal/daemon/daemon.go` (currently line 218)**

```go
cfgMgr, err := config.NewManager(ctx, configDir, driversDir, d.store, d.carport)
```

`driversDir` is computed in Task 8. For this task, add a placeholder near the existing `dataDir` resolution:

```go
driversDir := filepath.Join(dataDir, "drivers")
```

- [ ] **Step 6: Build & test**

Run: `go build ./... && go test ./internal/config/... ./internal/daemon/... ./internal/cli/... -count=1`
Expected: build passes; some tests still fail because Task 1 left them mid-air. That's expected — fixed in Task 7.

- [ ] **Step 7: Commit**

```bash
git add internal/config/evaluator.go internal/config/manager.go \
        internal/config/evaluator_integration_test.go \
        internal/config/evaluator_starlark_test.go \
        internal/config/manager_test.go \
        internal/cli/config.go internal/daemon/daemon.go
git commit -m "feat(config): plumb driversRoot through evaluator and Manager

Registers driverModuleReader on every pkl.Evaluator. Reader has no
content to serve yet (no manifests in the default location for
existing tests); driver: imports will start working once
manifests are placed and Task 5 wires the registry."
```

---

## Task 5: Driver registry

**Files:**
- Create: `internal/config/driver_registry.go`
- Create: `internal/config/driver_registry_test.go`

The registry encapsulates "what drivers are installed." It scans the drivers root, evaluates each `manifest.pkl` through Pkl, validates that the directory name matches the manifest's `name` field, and resolves the binary path. Used by `Manager.Apply` to look up binary + lifecycle for each instance.

- [ ] **Step 1: Write the failing test file**

Create `internal/config/driver_registry_test.go`:

```go
package config

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeManifest(t *testing.T, root, dir, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(root, dir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, dir, "manifest.pkl"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestDriverRegistry_EmptyRoot(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	reg, err := NewDriverRegistry(ctx, t.TempDir())
	if err != nil {
		t.Fatalf("NewDriverRegistry: %v", err)
	}
	if got := reg.Names(); len(got) != 0 {
		t.Fatalf("Names() = %v, want []", got)
	}
}

func TestDriverRegistry_ScansValidDriver(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	writeManifest(t, root, "hue", `
amends "switchyard:driver"
name = "hue"
version = "1.0.0"
produces = new { "light" }
`)
	reg, err := NewDriverRegistry(ctx, root)
	if err != nil {
		t.Fatalf("NewDriverRegistry: %v", err)
	}
	names := reg.Names()
	if len(names) != 1 || names[0] != "hue" {
		t.Fatalf("Names() = %v, want [hue]", names)
	}
	entry, ok := reg.Lookup("hue")
	if !ok {
		t.Fatal("Lookup(hue) not found")
	}
	wantBinary := filepath.Join(root, "hue", "hue-driver")
	if entry.BinaryPath != wantBinary {
		t.Fatalf("BinaryPath = %q, want %q", entry.BinaryPath, wantBinary)
	}
}

func TestDriverRegistry_NameMismatch(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	writeManifest(t, root, "hue", `
amends "switchyard:driver"
name = "wrongname"
version = "1.0.0"
produces = new { "light" }
`)
	_, err := NewDriverRegistry(ctx, root)
	if err == nil {
		t.Fatal("expected name-mismatch error, got nil")
	}
	if !strings.Contains(err.Error(), "wrongname") || !strings.Contains(err.Error(), "hue") {
		t.Fatalf("error = %q; want both directory name and manifest name", err.Error())
	}
}

func TestDriverRegistry_ExplicitBinaryRelative(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	writeManifest(t, root, "z2m", `
amends "switchyard:driver"
name = "z2m"
version = "1.0.0"
produces = new { "light" }
binary = "z2m-driver-bin"
`)
	reg, err := NewDriverRegistry(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	entry, _ := reg.Lookup("z2m")
	want := filepath.Join(root, "z2m", "z2m-driver-bin")
	if entry.BinaryPath != want {
		t.Fatalf("BinaryPath = %q, want %q", entry.BinaryPath, want)
	}
}

func TestDriverRegistry_ExplicitBinaryAbsolute(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	writeManifest(t, root, "x", `
amends "switchyard:driver"
name = "x"
version = "1.0.0"
produces = new { "sensor" }
binary = "/opt/x/bin/x"
`)
	reg, err := NewDriverRegistry(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	entry, _ := reg.Lookup("x")
	if entry.BinaryPath != "/opt/x/bin/x" {
		t.Fatalf("BinaryPath = %q, want absolute", entry.BinaryPath)
	}
}

func TestDriverRegistry_LookupMissing(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	reg, _ := NewDriverRegistry(ctx, t.TempDir())
	if _, ok := reg.Lookup("ghost"); ok {
		t.Fatal("Lookup(ghost) returned ok=true on empty registry")
	}
}
```

- [ ] **Step 2: Run the tests, expect compile failure**

Run: `go test ./internal/config/ -run TestDriverRegistry -v`
Expected: build error — `NewDriverRegistry`, `DriverRegistry`, etc. undefined.

- [ ] **Step 3: Create `internal/config/driver_registry.go`**

```go
package config

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/apple/pkl-go/pkl"
)

// DriverEntry is the resolved view of one driver's manifest.
type DriverEntry struct {
	Name              string
	Version           string
	BinaryPath        string             // absolute, ready to exec
	LifecycleDefaults LifecycleDefaults  // zero-value fields mean "not set in manifest"
}

// LifecycleDefaults mirrors carport.LifecycleConfig but every field is a
// pointer so the registry can distinguish "manifest set this to 5s" from
// "manifest left it at the default 5s." The zero pointer means "inherit
// the Go-side default from carport.defaultLifecycleConfig()".
type LifecycleDefaults struct {
	HandshakeDeadline       *time.Duration
	HealthProbeInterval     *time.Duration
	HealthProbeTimeout      *time.Duration
	HealthFailuresToRestart *int
	ShutdownGrace           *time.Duration
	RestartBackoffInitial   *time.Duration
	RestartBackoffMax       *time.Duration
	RestartBudgetWindow     *time.Duration
	RestartBudgetMax        *int
}

// DriverRegistry indexes the drivers under a single root by name.
type DriverRegistry struct {
	root    string
	entries map[string]DriverEntry
}

// NewDriverRegistry scans <root>/*/manifest.pkl, evaluates each, and returns
// an indexed registry. Returns an error on the first malformed manifest
// (missing required fields, name/dir mismatch, Pkl eval failure).
//
// Empty or non-existent root is not an error — Names() will return nil.
func NewDriverRegistry(ctx context.Context, root string) (*DriverRegistry, error) {
	entries := map[string]DriverEntry{}
	if root == "" {
		return &DriverRegistry{root: root, entries: entries}, nil
	}
	dirs, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return &DriverRegistry{root: root, entries: entries}, nil
		}
		return nil, fmt.Errorf("read drivers root %s: %w", root, err)
	}
	if len(dirs) == 0 {
		return &DriverRegistry{root: root, entries: entries}, nil
	}

	ev, err := newPklEvaluator(ctx, root)
	if err != nil {
		return nil, fmt.Errorf("init pkl evaluator for registry scan: %w", err)
	}
	defer func() { _ = ev.ev.Close() }()

	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		dirName := d.Name()
		if !validDriverName(dirName) {
			continue
		}
		manifestPath := filepath.Join(root, dirName, "manifest.pkl")
		if _, err := os.Stat(manifestPath); err != nil {
			continue
		}
		entry, err := evaluateDriverManifest(ctx, ev, root, dirName)
		if err != nil {
			return nil, err
		}
		entries[dirName] = entry
	}
	return &DriverRegistry{root: root, entries: entries}, nil
}

// Names returns the registered driver names, sorted.
func (r *DriverRegistry) Names() []string {
	out := make([]string, 0, len(r.entries))
	for n := range r.entries {
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

// Lookup returns the DriverEntry for name, ok=false if not present.
func (r *DriverRegistry) Lookup(name string) (DriverEntry, bool) {
	e, ok := r.entries[name]
	return e, ok
}

// driverManifestJSON mirrors the Pkl module fields rendered to JSON.
type driverManifestJSON struct {
	Name              string                  `json:"name"`
	Version           string                  `json:"version"`
	Description       string                  `json:"description"`
	Produces          []string                `json:"produces"`
	DriverEventTypes  []string                `json:"driverEventTypes"`
	Binary            *string                 `json:"binary"`
	LifecycleDefaults lifecycleDefaultsJSON   `json:"lifecycleDefaults"`
}

type lifecycleDefaultsJSON struct {
	HandshakeDeadline       string `json:"handshakeDeadline"`
	HealthProbeInterval     string `json:"healthProbeInterval"`
	HealthProbeTimeout      string `json:"healthProbeTimeout"`
	HealthFailuresToRestart int    `json:"healthFailuresToRestart"`
	ShutdownGrace           string `json:"shutdownGrace"`
	RestartBackoffInitial   string `json:"restartBackoffInitial"`
	RestartBackoffMax       string `json:"restartBackoffMax"`
	RestartBudgetWindow     string `json:"restartBudgetWindow"`
	RestartBudgetMax        int    `json:"restartBudgetMax"`
}

func evaluateDriverManifest(ctx context.Context, ev *pklEvaluator, root, dirName string) (DriverEntry, error) {
	manifestPath := filepath.Join(root, dirName, "manifest.pkl")
	text, err := ev.ev.EvaluateOutputText(ctx, pkl.FileSource(manifestPath))
	if err != nil {
		return DriverEntry{}, fmt.Errorf("driver %q: evaluate manifest: %w", dirName, err)
	}
	var raw driverManifestJSON
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return DriverEntry{}, fmt.Errorf("driver %q: parse manifest JSON: %w", dirName, err)
	}
	if raw.Name != dirName {
		return DriverEntry{}, fmt.Errorf("driver %q: manifest declares name=%q, expected %q (directory name is authoritative)", dirName, raw.Name, dirName)
	}
	binary := dirName + "-driver"
	if raw.Binary != nil && *raw.Binary != "" {
		binary = *raw.Binary
	}
	if !filepath.IsAbs(binary) {
		binary = filepath.Join(root, dirName, binary)
	}
	return DriverEntry{
		Name:              raw.Name,
		Version:           raw.Version,
		BinaryPath:        binary,
		LifecycleDefaults: parseLifecycleDefaults(raw.LifecycleDefaults),
	}, nil
}

// parseLifecycleDefaults converts the Pkl-rendered durations to *time.Duration.
// The Pkl LifecycleConfig has concrete defaults, so every field will round-trip
// with a value — we still wrap in pointers to keep the merge-with-Go-defaults
// logic in Manager.Apply uniform with the per-instance LifecycleOverride.
func parseLifecycleDefaults(j lifecycleDefaultsJSON) LifecycleDefaults {
	out := LifecycleDefaults{}
	if d, err := parsePklDuration(j.HandshakeDeadline); err == nil && d != 0 {
		out.HandshakeDeadline = &d
	}
	if d, err := parsePklDuration(j.HealthProbeInterval); err == nil && d != 0 {
		out.HealthProbeInterval = &d
	}
	if d, err := parsePklDuration(j.HealthProbeTimeout); err == nil && d != 0 {
		out.HealthProbeTimeout = &d
	}
	if j.HealthFailuresToRestart > 0 {
		v := j.HealthFailuresToRestart
		out.HealthFailuresToRestart = &v
	}
	if d, err := parsePklDuration(j.ShutdownGrace); err == nil && d != 0 {
		out.ShutdownGrace = &d
	}
	if d, err := parsePklDuration(j.RestartBackoffInitial); err == nil && d != 0 {
		out.RestartBackoffInitial = &d
	}
	if d, err := parsePklDuration(j.RestartBackoffMax); err == nil && d != 0 {
		out.RestartBackoffMax = &d
	}
	if d, err := parsePklDuration(j.RestartBudgetWindow); err == nil && d != 0 {
		out.RestartBudgetWindow = &d
	}
	if j.RestartBudgetMax > 0 {
		v := j.RestartBudgetMax
		out.RestartBudgetMax = &v
	}
	return out
}
```

- [ ] **Step 4: Run the tests, expect pass**

Run: `go test ./internal/config/ -run TestDriverRegistry -v`
Expected: PASS. (`parsePklDuration` already exists in `evaluator.go`.)

- [ ] **Step 5: Commit**

```bash
git add internal/config/driver_registry.go internal/config/driver_registry_test.go
git commit -m "feat(config): driver registry — scan, eval, index by name

Loads <root>/<name>/manifest.pkl through Pkl, validates dir-name
== manifest name, resolves the binary path (default or override),
and exposes lookup by name."
```

---

## Task 6: Parse `enabled` and `lifecycle` from per-instance Pkl JSON

**Files:**
- Modify: `internal/config/evaluator.go` (the `parseConfigJSON` function around line 309)
- Create: `internal/config/instance_options.go`

After the Pkl carport module change in Task 1, each `DriverInstance` JSON now carries `enabled` and `lifecycle`. The evaluator parses those into a Go struct that lives alongside the existing `Params` raw JSON. Manager.Apply (Task 7) reads it.

- [ ] **Step 1: Create `internal/config/instance_options.go`**

```go
package config

import (
	"encoding/json"
	"fmt"
	"time"
)

// InstanceOptions captures the per-instance fields that aren't part of the
// driver-typed config. Parsed out of the per-instance JSON in parseConfigJSON
// and consumed by Manager.Apply when calling the carport.
type InstanceOptions struct {
	Enabled  bool
	Override LifecycleOverride
}

// LifecycleOverride mirrors the Pkl LifecycleOverride class. Nil pointer ==
// "inherit from manifest default."
type LifecycleOverride struct {
	HandshakeDeadline       *time.Duration
	HealthProbeInterval     *time.Duration
	HealthProbeTimeout      *time.Duration
	HealthFailuresToRestart *int
	ShutdownGrace           *time.Duration
	RestartBackoffInitial   *time.Duration
	RestartBackoffMax       *time.Duration
	RestartBudgetWindow     *time.Duration
	RestartBudgetMax        *int
}

// instanceOptionsJSON is the wire shape of the lifecycle override + enabled.
type instanceOptionsJSON struct {
	Enabled   *bool                  `json:"enabled"`
	Lifecycle *lifecycleOverrideJSON `json:"lifecycle"`
}

type lifecycleOverrideJSON struct {
	HandshakeDeadline       *string `json:"handshakeDeadline"`
	HealthProbeInterval     *string `json:"healthProbeInterval"`
	HealthProbeTimeout      *string `json:"healthProbeTimeout"`
	HealthFailuresToRestart *int    `json:"healthFailuresToRestart"`
	ShutdownGrace           *string `json:"shutdownGrace"`
	RestartBackoffInitial   *string `json:"restartBackoffInitial"`
	RestartBackoffMax       *string `json:"restartBackoffMax"`
	RestartBudgetWindow     *string `json:"restartBudgetWindow"`
	RestartBudgetMax        *int    `json:"restartBudgetMax"`
}

// parseInstanceOptions extracts the enabled/lifecycle fields from the raw
// per-instance JSON. enabled defaults to true when absent.
func parseInstanceOptions(rawInst []byte) (InstanceOptions, error) {
	var raw instanceOptionsJSON
	if err := json.Unmarshal(rawInst, &raw); err != nil {
		return InstanceOptions{}, fmt.Errorf("parse instance options: %w", err)
	}
	out := InstanceOptions{Enabled: true}
	if raw.Enabled != nil {
		out.Enabled = *raw.Enabled
	}
	if raw.Lifecycle != nil {
		out.Override = convertLifecycleOverride(*raw.Lifecycle)
	}
	return out, nil
}

func convertLifecycleOverride(j lifecycleOverrideJSON) LifecycleOverride {
	out := LifecycleOverride{
		HealthFailuresToRestart: j.HealthFailuresToRestart,
		RestartBudgetMax:        j.RestartBudgetMax,
	}
	if j.HandshakeDeadline != nil {
		if d, err := parsePklDuration(*j.HandshakeDeadline); err == nil {
			out.HandshakeDeadline = &d
		}
	}
	if j.HealthProbeInterval != nil {
		if d, err := parsePklDuration(*j.HealthProbeInterval); err == nil {
			out.HealthProbeInterval = &d
		}
	}
	if j.HealthProbeTimeout != nil {
		if d, err := parsePklDuration(*j.HealthProbeTimeout); err == nil {
			out.HealthProbeTimeout = &d
		}
	}
	if j.ShutdownGrace != nil {
		if d, err := parsePklDuration(*j.ShutdownGrace); err == nil {
			out.ShutdownGrace = &d
		}
	}
	if j.RestartBackoffInitial != nil {
		if d, err := parsePklDuration(*j.RestartBackoffInitial); err == nil {
			out.RestartBackoffInitial = &d
		}
	}
	if j.RestartBackoffMax != nil {
		if d, err := parsePklDuration(*j.RestartBackoffMax); err == nil {
			out.RestartBackoffMax = &d
		}
	}
	if j.RestartBudgetWindow != nil {
		if d, err := parsePklDuration(*j.RestartBudgetWindow); err == nil {
			out.RestartBudgetWindow = &d
		}
	}
	return out
}
```

- [ ] **Step 2: Modify `parseConfigJSON` in `internal/config/evaluator.go` (the per-instance loop around line 309)**

Drop the `Binary` field from the local `base` anon struct; it is no longer rendered by Pkl. The block becomes:

```go
for _, rawInst := range raw.DriverInstances {
    var base struct {
        ID         string `json:"id"`
        DriverName string `json:"driverName"`
    }
    if err := json.Unmarshal(rawInst, &base); err != nil {
        return nil, fmt.Errorf("parse driver instance: %w", err)
    }
    h := sha256.Sum256(rawInst)
    snap.DriverInstances = append(snap.DriverInstances, &configpb.DriverInstanceConfig{
        Id:         base.ID,
        DriverName: base.DriverName,
        // Binary is populated server-side in Manager.Apply by looking up the
        // driver registry. ConfigHash already covers Params.
        ConfigHash: h[:],
        Params:     rawInst,
    })
}
```

(The `parseInstanceOptions` call lives in Manager.Apply, not here, to keep this function side-effect-free.)

- [ ] **Step 3: Run the tests**

Run: `go test ./internal/config/... -count=1`
Expected: any test that asserts on `Binary` being populated by Pkl will need updating. If the assertion was `instance.Binary == "/usr/local/bin/fake-driver"`, change it to expect `instance.Binary == ""` for now (Manager.Apply populates it later — these tests run the evaluator standalone). Adjust the failing assertions inline.

- [ ] **Step 4: Re-run, expect pass**

Run: `go test ./internal/config/... -count=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/config/instance_options.go internal/config/evaluator.go internal/config/*_test.go
git commit -m "feat(config): parse enabled/lifecycle from per-instance JSON

Per-instance Binary field is no longer set by the evaluator;
Manager.Apply will resolve it from the driver registry."
```

---

## Task 7: Manager.Apply resolves binary + lifecycle from registry

**Files:**
- Modify: `internal/config/manager.go`
- Create: `internal/config/lifecycle_merge.go`
- Create: `internal/config/manager_apply_driver_test.go`

`CarportManager` interface gains `enabled` + `lifecycle`. `Manager.Apply` now: parses per-instance options, looks up the registry for binary path + lifecycle defaults, merges with the per-instance override, and calls the carport.

- [ ] **Step 1: Define the lifecycle merge helper**

Create `internal/config/lifecycle_merge.go`:

```go
package config

import (
	"time"

	"github.com/fdatoo/switchyard/internal/carport"
)

// MergeLifecycle computes the effective LifecycleConfig for one instance:
//   defaults (Go-side) ← manifest defaults ← per-instance override
// Each layer overrides only the fields it sets. The Go-side defaults come from
// carport.DefaultLifecycleConfig (added in Task 8 — exported renaming of the
// existing carport.defaultLifecycleConfig).
func MergeLifecycle(manifest LifecycleDefaults, override LifecycleOverride) carport.LifecycleConfig {
	lc := carport.DefaultLifecycleConfig()
	applyDur(&lc.HandshakeDeadline, manifest.HandshakeDeadline, override.HandshakeDeadline)
	applyDur(&lc.HealthProbeInterval, manifest.HealthProbeInterval, override.HealthProbeInterval)
	applyDur(&lc.HealthProbeTimeout, manifest.HealthProbeTimeout, override.HealthProbeTimeout)
	applyInt(&lc.HealthFailuresToRestart, manifest.HealthFailuresToRestart, override.HealthFailuresToRestart)
	applyDur(&lc.ShutdownGrace, manifest.ShutdownGrace, override.ShutdownGrace)
	applyDur(&lc.RestartBackoffInitial, manifest.RestartBackoffInitial, override.RestartBackoffInitial)
	applyDur(&lc.RestartBackoffMax, manifest.RestartBackoffMax, override.RestartBackoffMax)
	applyDur(&lc.RestartBudgetWindow, manifest.RestartBudgetWindow, override.RestartBudgetWindow)
	applyInt(&lc.RestartBudgetMax, manifest.RestartBudgetMax, override.RestartBudgetMax)
	return lc
}

func applyDur(dst *time.Duration, fromManifest, fromOverride *time.Duration) {
	if fromManifest != nil {
		*dst = *fromManifest
	}
	if fromOverride != nil {
		*dst = *fromOverride
	}
}

func applyInt(dst *int, fromManifest, fromOverride *int) {
	if fromManifest != nil {
		*dst = *fromManifest
	}
	if fromOverride != nil {
		*dst = *fromOverride
	}
}
```

- [ ] **Step 2: Extend `CarportManager` interface in `internal/config/manager.go`**

Replace lines 17-20 with:

```go
// CarportManager is the subset of carport.Host that config.Manager needs.
type CarportManager interface {
	RegisterInstance(ctx context.Context, id, driverName, binary string, params []byte, enabled bool, lifecycle carport.LifecycleConfig) error
	UnregisterInstance(ctx context.Context, id string) error
}
```

Add the import: `"github.com/fdatoo/switchyard/internal/carport"`.

- [ ] **Step 3: Add the registry to the Manager struct and use it in Apply**

Extend the struct (lines 29-39) to store the registry:

```go
type Manager struct {
	configDir   string
	driversRoot string
	ev          configEvaluator
	registry    *DriverRegistry
	store       eventStore
	carportMgr  CarportManager
	keyring     Keyring

	mu           sync.RWMutex
	current      *configpb.ConfigSnapshot
	appliedHooks []func(snap *configpb.ConfigSnapshot)
}
```

Update `NewManager` (lines 49-61) to build the registry:

```go
func NewManager(ctx context.Context, configDir, driversRoot string, store eventStore, carportMgr CarportManager) (*Manager, error) {
	ev, err := newPklEvaluator(ctx, driversRoot)
	if err != nil {
		return nil, fmt.Errorf("init pkl evaluator: %w", err)
	}
	registry, err := NewDriverRegistry(ctx, driversRoot)
	if err != nil {
		return nil, fmt.Errorf("scan drivers root %s: %w", driversRoot, err)
	}
	return &Manager{
		configDir:   configDir,
		driversRoot: driversRoot,
		ev:          ev,
		registry:    registry,
		store:       store,
		carportMgr:  carportMgr,
	}, nil
}
```

Replace the `for _, id := range diff.DriverInstancesAdded { … }` block (lines 105-110) and the `Changed` block (lines 111-119) so each call resolves binary + lifecycle and respects `enabled`:

```go
	for _, id := range diff.DriverInstancesAdded {
		di := findInstance(snap, id)
		if err := m.registerInstance(ctx, di); err != nil {
			return fmt.Errorf("register %q: %w", id, err)
		}
	}
	for _, id := range diff.DriverInstancesChanged {
		di := findInstance(snap, id)
		if err := m.carportMgr.UnregisterInstance(ctx, id); err != nil {
			return fmt.Errorf("unregister changed %q: %w", id, err)
		}
		if err := m.registerInstance(ctx, di); err != nil {
			return fmt.Errorf("re-register changed %q: %w", id, err)
		}
	}
```

Add the helper at the bottom of the file:

```go
// registerInstance resolves binary path and lifecycle for a single instance
// and forwards to the carport. Skips registration if enabled=false.
func (m *Manager) registerInstance(ctx context.Context, di *configpb.DriverInstanceConfig) error {
	entry, ok := m.registry.Lookup(di.GetDriverName())
	if !ok {
		return fmt.Errorf("driver %q not installed at %s", di.GetDriverName(), m.driversRoot)
	}
	opts, err := parseInstanceOptions(di.GetParams())
	if err != nil {
		return fmt.Errorf("instance %q: %w", di.GetId(), err)
	}
	if !opts.Enabled {
		return nil
	}
	lifecycle := MergeLifecycle(entry.LifecycleDefaults, opts.Override)
	return m.carportMgr.RegisterInstance(ctx, di.GetId(), di.GetDriverName(), entry.BinaryPath, di.GetParams(), opts.Enabled, lifecycle)
}
```

- [ ] **Step 4: Write the integration test**

Create `internal/config/manager_apply_driver_test.go`:

```go
package config

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/fdatoo/switchyard/internal/carport"
	"github.com/fdatoo/switchyard/internal/eventstore"
)

type fakeCarport struct {
	mu          sync.Mutex
	registered  []registeredInst
	unregistered []string
}

type registeredInst struct {
	id, driverName, binary string
	enabled                bool
	lifecycle              carport.LifecycleConfig
}

func (f *fakeCarport) RegisterInstance(_ context.Context, id, driverName, binary string, _ []byte, enabled bool, lc carport.LifecycleConfig) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.registered = append(f.registered, registeredInst{id, driverName, binary, enabled, lc})
	return nil
}
func (f *fakeCarport) UnregisterInstance(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.unregistered = append(f.unregistered, id)
	return nil
}

type fakeStore struct{}

func (fakeStore) Append(_ context.Context, _ eventstore.Event) (uint64, error) { return 0, nil }

func TestManagerApply_ResolvesBinaryFromRegistry(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	driversRoot := t.TempDir()
	configDir := t.TempDir()

	writeManifest(t, driversRoot, "fake", `
amends "switchyard:driver"
name = "fake"
version = "1.0"
produces = new { "light" }
lifecycleDefaults {
  restartBudgetMax = 7
}
class FakeInstance extends Instance {}
`)
	if err := os.WriteFile(filepath.Join(configDir, "main.pkl"), []byte(`
amends "switchyard:config"
import "switchyard:carport" as carport
import "driver:fake" as fake

driverInstances: Listing<carport.DriverInstance> = new {
  new fake.FakeInstance {
    id = "fake_one"
  }
}
`), 0o644); err != nil {
		t.Fatal(err)
	}

	cp := &fakeCarport{}
	mgr, err := NewManager(ctx, configDir, driversRoot, fakeStore{}, cp)
	if err != nil {
		t.Fatal(err)
	}
	if err := mgr.Apply(ctx, false); err != nil {
		t.Fatal(err)
	}
	if len(cp.registered) != 1 {
		t.Fatalf("registered = %d, want 1", len(cp.registered))
	}
	got := cp.registered[0]
	wantBin := filepath.Join(driversRoot, "fake", "fake-driver")
	if got.binary != wantBin {
		t.Errorf("binary = %q, want %q", got.binary, wantBin)
	}
	if got.driverName != "fake" {
		t.Errorf("driverName = %q, want %q", got.driverName, "fake")
	}
	if got.lifecycle.RestartBudgetMax != 7 {
		t.Errorf("restartBudgetMax = %d, want 7 (manifest default)", got.lifecycle.RestartBudgetMax)
	}
}

func TestManagerApply_PerInstanceLifecycleOverride(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	driversRoot := t.TempDir()
	configDir := t.TempDir()

	writeManifest(t, driversRoot, "fake", `
amends "switchyard:driver"
name = "fake"
version = "1.0"
produces = new { "light" }
lifecycleDefaults {
  restartBudgetMax = 7
}
class FakeInstance extends Instance {}
`)
	if err := os.WriteFile(filepath.Join(configDir, "main.pkl"), []byte(`
amends "switchyard:config"
import "switchyard:carport" as carport
import "driver:fake" as fake

driverInstances: Listing<carport.DriverInstance> = new {
  new fake.FakeInstance {
    id = "fake_one"
    lifecycle = new { restartBudgetMax = 99 }
  }
}
`), 0o644); err != nil {
		t.Fatal(err)
	}

	cp := &fakeCarport{}
	mgr, _ := NewManager(ctx, configDir, driversRoot, fakeStore{}, cp)
	if err := mgr.Apply(ctx, false); err != nil {
		t.Fatal(err)
	}
	if cp.registered[0].lifecycle.RestartBudgetMax != 99 {
		t.Errorf("restartBudgetMax = %d, want 99 (per-instance override wins)", cp.registered[0].lifecycle.RestartBudgetMax)
	}
}

func TestManagerApply_DisabledInstanceNotRegistered(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	driversRoot := t.TempDir()
	configDir := t.TempDir()

	writeManifest(t, driversRoot, "fake", `
amends "switchyard:driver"
name = "fake"
version = "1.0"
produces = new { "light" }
class FakeInstance extends Instance {}
`)
	if err := os.WriteFile(filepath.Join(configDir, "main.pkl"), []byte(`
amends "switchyard:config"
import "switchyard:carport" as carport
import "driver:fake" as fake

driverInstances: Listing<carport.DriverInstance> = new {
  new fake.FakeInstance {
    id = "fake_one"
    enabled = false
  }
}
`), 0o644); err != nil {
		t.Fatal(err)
	}

	cp := &fakeCarport{}
	mgr, _ := NewManager(ctx, configDir, driversRoot, fakeStore{}, cp)
	if err := mgr.Apply(ctx, false); err != nil {
		t.Fatal(err)
	}
	if len(cp.registered) != 0 {
		t.Fatalf("registered = %d, want 0 (disabled)", len(cp.registered))
	}
}

func TestManagerApply_MissingDriverErrors(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	driversRoot := t.TempDir()
	configDir := t.TempDir()

	// No manifest written. Reference driver:fake from main.pkl — this should
	// fail at Pkl evaluation (driverModuleReader returns "manifest not found").
	if err := os.WriteFile(filepath.Join(configDir, "main.pkl"), []byte(`
amends "switchyard:config"
import "switchyard:carport" as carport
import "driver:fake" as fake

driverInstances: Listing<carport.DriverInstance> = new {
  new fake.FakeInstance {
    id = "fake_one"
  }
}
`), 0o644); err != nil {
		t.Fatal(err)
	}

	cp := &fakeCarport{}
	mgr, _ := NewManager(ctx, configDir, driversRoot, fakeStore{}, cp)
	err := mgr.Apply(ctx, false)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}
```

- [ ] **Step 5: Run the tests**

Run: `go test ./internal/config/ -run TestManagerApply -v`
Expected: build error initially because `carport.DefaultLifecycleConfig` doesn't exist yet — added in Task 8. If you're working strictly task-by-task, do Task 8 next; if working in parallel, the test will pass once both tasks land. For now, mark this task's commit incomplete and move on.

- [ ] **Step 6: Adapt existing call sites and tests**

Any existing test calling `CarportManager.RegisterInstance(ctx, id, driverName, binary, params)` (4-arg) needs the new 6-arg signature. Search and update:

```bash
grep -rn 'RegisterInstance(ctx' internal/
```

For test fakes, accept the new params and store/check as needed.

- [ ] **Step 7: Commit (after Task 8 also complete)**

```bash
git add internal/config/lifecycle_merge.go internal/config/manager.go \
        internal/config/manager_apply_driver_test.go
git commit -m "feat(config): Manager.Apply resolves binary + lifecycle from registry

- CarportManager interface gains enabled + lifecycle params
- per-instance binary resolved via DriverRegistry lookup
- lifecycle merge: Go defaults ← manifest ← per-instance override
- enabled=false instances skipped"
```

---

## Task 8: Update `*carport.Host` for new interface; export `DefaultLifecycleConfig`

**Files:**
- Modify: `internal/carport/config.go`
- Modify: `internal/carport/carport.go`
- Modify: `internal/carport/dynamic_test.go` (and any other test using the old signatures)

- [ ] **Step 1: Export `defaultLifecycleConfig` as `DefaultLifecycleConfig`**

In `internal/carport/config.go`, rename the function (line 32):

```go
// DefaultLifecycleConfig returns the defaults used when neither a driver
// manifest nor a per-instance override specifies a value.
func DefaultLifecycleConfig() LifecycleConfig {
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

Find every internal call to `defaultLifecycleConfig()` and update to `DefaultLifecycleConfig()`:

```bash
grep -rn 'defaultLifecycleConfig' internal/
```

- [ ] **Step 2: Update `*Host.RegisterInstance` to match the new interface**

In `internal/carport/carport.go`, replace `RegisterInstance` (line 116) with the 6-arg version. Keep `RegisterInstanceWithLifecycle` as a thin wrapper for tests that already use it.

```go
// RegisterInstance adds a new driver instance and begins its lifecycle goroutine.
// Implements config.CarportManager.
func (h *Host) RegisterInstance(_ context.Context, id, driverName, binary string, params []byte, enabled bool, lc LifecycleConfig) error {
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
		Enabled:    enabled,
		ConfigJSON: params,
		Lifecycle:  lc,
	}
	m := &managedInstance{cfg: inst, state: StateDeclared}
	h.instances[id] = m
	h.mu.Unlock()
	h.launchLifecycle(h.ctx, m) //nolint:contextcheck
	return nil
}
```

Then re-implement `RegisterInstanceWithLifecycle` as a thin wrapper:

```go
// RegisterInstanceWithLifecycle is kept for tests that exercise the lifecycle
// override directly. New code should call RegisterInstance with the full args.
func (h *Host) RegisterInstanceWithLifecycle(ctx context.Context, id, driverName, binary string, params []byte, lc LifecycleConfig) error {
	return h.RegisterInstance(ctx, id, driverName, binary, params, true, lc)
}
```

(`driverName` is currently unused at this layer — `Instance` has `Binary` not `DriverName`. That's intentional; it's already used for events via `m.cfg.ID`. Don't add a `DriverName` field unless follow-on work needs it.)

- [ ] **Step 3: Update `internal/carport/dynamic_test.go`**

Find calls to `RegisterInstance` with 4-arg signature; update to pass `true, DefaultLifecycleConfig()`:

```go
err := h.RegisterInstance(ctx, "id", "drv", "/path/to/bin", nil, true, DefaultLifecycleConfig())
```

- [ ] **Step 4: Build & test**

Run: `go test ./internal/carport/... ./internal/config/... -count=1`
Expected: PASS for everything. The Task 7 tests should now compile and pass.

- [ ] **Step 5: Commit**

```bash
git add internal/carport/config.go internal/carport/carport.go internal/carport/dynamic_test.go
git commit -m "feat(carport): RegisterInstance takes enabled + lifecycle

Matches the extended config.CarportManager interface. Exports
DefaultLifecycleConfig so config.MergeLifecycle can seed the merge.
RegisterInstanceWithLifecycle becomes a thin wrapper."
```

(After this task, the Task 7 commit is also valid — if you held off, run `git commit` for that work now.)

---

## Task 9: Daemon `--drivers-dir` flag and drivers.toml deprecation log

**Files:**
- Modify: `internal/daemon/config.go`
- Modify: `internal/daemon/daemon.go`
- Modify: `cmd/switchyardd/main.go`

- [ ] **Step 1: Add the field to `daemon.Config`**

In `internal/daemon/config.go`, after line 19:

```go
DriversDir          string  // resolved against DataDir in Run; empty → "<dataDir>/drivers"
```

- [ ] **Step 2: Resolve & plumb in `internal/daemon/daemon.go`**

Around the existing `dataDir := expandHome(d.cfg.DataDir)` (line 97):

```go
dataDir := expandHome(d.cfg.DataDir)
driversDir := d.cfg.DriversDir
if driversDir == "" {
	driversDir = filepath.Join(dataDir, "drivers")
} else {
	driversDir = expandHome(driversDir)
}

// One-shot deprecation log for users with a leftover drivers.toml.
if _, err := os.Stat(filepath.Join(dataDir, "drivers.toml")); err == nil {
	d.logger.Warn("drivers.toml is no longer read; instances are configured in main.pkl",
		"path", filepath.Join(dataDir, "drivers.toml"),
		"docs", "https://docs.switchyard.dev/configuration/drivers/",
	)
}
```

Replace the placeholder in the `config.NewManager` call:

```go
cfgMgr, err := config.NewManager(ctx, configDir, driversDir, d.store, d.carport)
```

Imports: ensure `"os"` and `"path/filepath"` are imported.

- [ ] **Step 3: Add the flag to `cmd/switchyardd/main.go`**

In `run()` around line 30, alongside `configDir`:

```go
driversDir = flag.String("drivers-dir", "", "directory containing per-driver subdirectories (default <data-dir>/drivers)")
```

In the `daemon.Config` literal (line 51-59):

```go
DriversDir: *driversDir,
```

- [ ] **Step 4: Build & test**

Run: `go build ./... && go test ./internal/daemon/... -count=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/daemon/config.go internal/daemon/daemon.go cmd/switchyardd/main.go
git commit -m "feat(daemon): --drivers-dir flag; drivers.toml deprecation log

Default <data-dir>/drivers/. Daemon emits a one-shot warn-level log
on startup if a leftover drivers.toml is present so the operator
notices it's no longer being read."
```

---

## Task 10: CLI `switchyard config validate --drivers-dir`

**Files:**
- Modify: `internal/cli/config.go`

- [ ] **Step 1: Add the flag to `newConfigValidateCmd`**

Find the existing `configDir` flag declaration (around line 92):

```go
c.Flags().StringVar(&configDir, "config-dir", "", "config directory to validate (default: <data-dir>/config)")
c.Flags().StringVar(&driversDir, "drivers-dir", "", "drivers directory to scan (default: <data-dir>/drivers)")
```

Declare `driversDir` alongside `configDir` at the top of the function (around line 32):

```go
var configDir string
var driversDir string
```

In the `RunE` block, replace the placeholder driversDir from Task 4 with the real one:

```go
RunE: func(cmd *cobra.Command, _ []string) error {
	gf := globalFlagsFromCobra(cmd)
	if configDir == "" {
		configDir = filepath.Join(expandHome(gf.DataDir), "config")
	}
	if driversDir == "" {
		driversDir = filepath.Join(expandHome(gf.DataDir), "drivers")
	} else {
		driversDir = expandHome(driversDir)
	}
	mainPkl := filepath.Join(configDir, "main.pkl")
	if _, err := os.Stat(mainPkl); err != nil {
		return fmt.Errorf("main.pkl not found in %s: %w", configDir, err)
	}
	_, validationErrs, err := config.ValidateOffline(cmd.Context(), configDir, driversDir)
	// … existing handling
},
```

- [ ] **Step 2: Build & smoke**

Run: `go build ./... && go run ./cmd/switchyard config validate --help`
Expected: build passes; `--help` shows `--drivers-dir`.

- [ ] **Step 3: Commit**

```bash
git add internal/cli/config.go
git commit -m "feat(cli): --drivers-dir on switchyard config validate

Plumbs through to ValidateOffline so offline validation finds
manifests in non-default locations (CI, alt installs)."
```

---

## Task 11: End-to-end smoke

**Files:**
- Create: a temporary test fixture inside `internal/cli/config_offline_test.go` (or new `*_test.go`)

This task verifies the whole stack works against a hand-rolled fake driver dir.

- [ ] **Step 1: Add an end-to-end test**

In `internal/cli/config_offline_test.go`, add:

```go
func TestConfigValidate_DriverImport(t *testing.T) {
	driversDir := t.TempDir()
	configDir := t.TempDir()

	// Fake driver manifest.
	if err := os.MkdirAll(filepath.Join(driversDir, "fake"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(driversDir, "fake", "manifest.pkl"), []byte(`
amends "switchyard:driver"
name = "fake"
version = "0.0.1"
produces = new { "light" }
class FakeInstance extends Instance {}
`), 0o644); err != nil {
		t.Fatal(err)
	}
	// Touch a fake binary at the expected path so any future binary-existence
	// warnings stay quiet for this test.
	if err := os.WriteFile(filepath.Join(driversDir, "fake", "fake-driver"), []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(configDir, "main.pkl"), []byte(`
amends "switchyard:config"
import "switchyard:carport" as carport
import "driver:fake" as fake

driverInstances: Listing<carport.DriverInstance> = new {
  new fake.FakeInstance {
    id = "fake_one"
  }
}
`), 0o644); err != nil {
		t.Fatal(err)
	}

	cmd := newRootCmd()
	cmd.SetArgs([]string{
		"config", "validate", "--offline",
		"--config-dir", configDir,
		"--drivers-dir", driversDir,
	})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("validate failed: %v", err)
	}
}
```

If the existing test file uses different scaffolding helpers, mirror them — the goal is one test that runs `switchyard config validate --offline --config-dir … --drivers-dir …` and exits 0.

- [ ] **Step 2: Run the test**

Run: `go test ./internal/cli/ -run TestConfigValidate_DriverImport -v`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add internal/cli/config_offline_test.go
git commit -m "test: end-to-end driver: import via config validate"
```

---

## Task 12: Documentation

**Files:**
- Modify: `docs/docs/configuration/drivers.md`
- Modify: `docs/docs/drivers/building/manifest.md`

- [ ] **Step 1: Rewrite `docs/docs/configuration/drivers.md`**

Drop the alpha caveat box about C4. Update the Hue example so the user-facing config matches the new shape (no `binary`, no `driverName`, optional `lifecycle`):

```pkl
import "switchyard:carport" as carport
import "driver:hue" as hue

driverInstances: Listing<carport.DriverInstance> = new {
  new hue.HueInstance {
    id         = "hue_main"
    bridgeHost = "10.0.0.42"
    apiToken   = read("env:HUE_TOKEN").text
    lifecycle  = new { restartBudgetMax = 20 }   // optional override
  }
}
```

Add a short "Where drivers live" section explaining the `<data-dir>/drivers/<name>/` layout, the `--drivers-dir` flag, and `enabled = false` for temporarily disabling without deleting the block.

- [ ] **Step 2: Rewrite `docs/docs/drivers/building/manifest.md`**

Drop the C4 caveat boxes. Replace the worked example with the actual Shape α flow:

```pkl
// drivers/hue/manifest.pkl
amends "switchyard:driver"

import "switchyard:carport" as carport

name        = "hue"
version     = "0.4.2"
description = "Philips Hue bridge — local CLIP API."
produces    = new { "light"; "scene"; "sensor" }

lifecycleDefaults {
  handshakeDeadline   = 5.s
  healthProbeInterval = 15.s
  restartBudgetMax    = 10
}

class HueInstance extends Instance {
  bridgeHost: String
  apiToken:   String
}
```

Add an "Installation layout" section explaining: directory name == driver name, default binary is `<dir>/<name>-driver`, `binary` field overrides, and the `name`-vs-directory check.

Remove or rewrite the section about embedding the manifest in the binary — that path is a follow-on (mark as such).

- [ ] **Step 3: Commit**

```bash
git add docs/docs/configuration/drivers.md docs/docs/drivers/building/manifest.md
git commit -m "docs: driver Pkl module loader (driver:<name>) is shipped

Removes C4-deferred caveat boxes; documents the side-car layout,
the lifecycle merge, and the consumer-side shape with no driverName
or binary fields."
```

---

## Task 13: Hand-migrate the operator's local install

**Not a code task — a one-shot operator action so the daemon starts.**

- [ ] **Step 1: Create the new driver dir**

```bash
mkdir -p ~/.local/share/switchyard/drivers/hue
mv ~/.local/share/switchyard/bin/hue-driver ~/.local/share/switchyard/drivers/hue/hue-driver
```

- [ ] **Step 2: Hand-write the Hue manifest**

Create `~/.local/share/switchyard/drivers/hue/manifest.pkl`:

```pkl
amends "switchyard:driver"

import "switchyard:carport" as carport

name        = "hue"
version     = "0.1.0"
description = "Philips Hue bridge driver"
produces    = new { "light" }

class HueInstance extends Instance {
  bridgeHost: String
  apiToken:   String
}
```

- [ ] **Step 3: Update `~/.local/share/switchyard/config/main.pkl`**

```pkl
amends "switchyard:config"

import "switchyard:carport" as carport
import "driver:hue" as hue

driverInstances: Listing<carport.DriverInstance> = new {
  new hue.HueInstance {
    id         = "hue_main"
    bridgeHost = "192.168.1.170"
    apiToken   = "MS3Z37j-9O9vcRQxCf-T22tbsitugNkrLDDNUJ13"
  }
}
```

- [ ] **Step 4: Optional cleanup**

```bash
rm ~/.local/share/switchyard/drivers.toml   # silences the deprecation log
```

- [ ] **Step 5: Smoke test**

```bash
go build -o dist/switchyardd ./cmd/switchyardd
./dist/switchyardd
```

Expected: starts cleanly; logs show the Hue driver spawning.

---

## Self-review checklist (run before declaring the plan complete)

- [ ] **Spec coverage:** Every section of `docs/design/specs/2026-05-02-driver-pkl-modules-design.md` has a corresponding task above. Pkl base modules (Tasks 1, 2). `driverModuleReader` (Task 3). Plumbing (Task 4). Registry (Task 5). Per-instance options parsing (Task 6). Manager.Apply resolution (Task 7). Carport interface change (Task 8). Daemon flag + deprecation (Task 9). CLI flag (Task 10). E2E (Task 11). Docs (Task 12). Hand-migration (Task 13).
- [ ] **Placeholders:** No "TBD"/"TODO". The intentional placeholder `driversDir := filepath.Join(dataDir, "drivers")` in Task 4 step 5 is explicitly called out as superseded in Task 9.
- [ ] **Type consistency:** `DriverEntry.LifecycleDefaults` (Task 5), `LifecycleOverride` (Task 6), and `MergeLifecycle` parameters (Task 7) all line up. `CarportManager.RegisterInstance` 6-arg signature (Task 7) matches `*Host.RegisterInstance` (Task 8) and `fakeCarport.RegisterInstance` (Task 7 test).
- [ ] **`carport.DefaultLifecycleConfig`:** referenced in Task 7 step 1, defined in Task 8 step 1. Tests for Task 7 are flagged as not building until Task 8 lands — be explicit if executing strictly task-by-task.
