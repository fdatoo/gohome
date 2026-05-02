# Driver Pkl Modules (`driver:<name>` URI scheme) — Design

| | |
|---|---|
| **Status** | Draft |
| **Date** | 2026-05-02 |
| **Author** | Fynn Datoo |
| **Implements** | DR-7 from `docs/design/specs/2026-04-22-c4-pkl-config-design.md` |
| **Related** | `docs/docs/configuration/drivers.md`, `docs/docs/drivers/building/manifest.md` |

## Problem

`switchyardd`'s Pkl evaluator registers a `switchyard:` module loader (and a `switchyard-validator:` resource loader) but no `driver:` loader. The user-facing configuration docs already describe `import "driver:hue" as hue` as the supported way to bring a driver's typed instance class into `main.pkl`. Today that import fails with:

```
–– Pkl Error ––
No module loader is registered for module `driver:hue`.
```

The C4 design plan (`2026-04-22-c4-pkl-config-design.md`, DR-7) explicitly deferred this work, with the ExternalReader infrastructure already in place to support it. This spec fills in DR-7.

In the same change we retire `drivers.toml`. The supervisor's instance list moves entirely to `main.pkl`'s `driverInstances: Listing<carport.DriverInstance>`, and per-driver metadata that used to live in TOML (binary path, lifecycle tuning) moves into each driver's `manifest.pkl`.

## Goals

- `import "driver:hue"` (and other `driver:<name>` URIs) resolves at config evaluation time without spawning the driver binary.
- `switchyard config validate` and the daemon's startup loader behave identically: same reader, same error messages, same offline guarantee.
- Driver authors describe their driver in a single `manifest.pkl` file alongside the binary; `switchyardd` enforces consistency between the directory layout and that file.
- Operators declare driver instances in `main.pkl` only — no TOML, no second source of truth.
- Lifecycle tuning has a clear ownership model: defaults in code, per-driver overrides in manifest, per-instance overrides in `main.pkl`.

## Non-goals

- A `switchyard driver list` / `driver info` CLI (follow-on).
- Embedding manifest bytes inside the driver binary and exposing them via a `<binary> pkl-manifest` subcommand (follow-on; the option-A path from brainstorming).
- Cross-checking the runtime gRPC `HandshakeResponse.manifest.pkl_module` against the on-disk `manifest.pkl` (follow-on).
- Manifest signing or integrity verification.
- Multi-arch / per-platform binary selection inside one driver dir.
- Automatic migration from `drivers.toml`. The single existing operator (the project author) hand-migrates; new installs never had TOML.

## Architecture

### On-disk layout

One driver = one directory under a single drivers root:

```
<data-dir>/drivers/                  # default; overridable via --drivers-dir
├── hue/
│   ├── hue-driver                   # binary; default name = <dir>-driver
│   └── manifest.pkl
└── zigbee2mqtt/
    ├── z2m-driver                   # overridden via `binary = "z2m-driver"`
    └── manifest.pkl
```

Rules:

- Directory name is **authoritative**. It is the import key (`driver:hue` ↔ `hue/`) and must equal the manifest's `name` field; mismatch is a hard error at evaluation.
- Binary path defaults to `<dir>/<name>-driver`. The manifest may set a `binary` field; absolute paths stay absolute, relative paths resolve against the driver dir.
- Drivers root defaults to `<data-dir>/drivers/`. `switchyardd --drivers-dir <path>` and `switchyard config validate --drivers-dir <path>` override it.

### `switchyard:driver` base module (new, ships with `switchyardd`)

Lives at `internal/config/pkl/switchyard/driver.pkl`, served by the existing `switchyardModuleReader`. Each driver's `manifest.pkl` `amends` it.

```pkl
// internal/config/pkl/switchyard/driver.pkl
module switchyard.driver

import "switchyard:carport" as carport

// Module-level fields populated by each driver's manifest.pkl.
name: String                                    // must equal containing directory name
version: String
description: String?
produces: Listing<String>                       // entity domain types this driver registers
driverEventTypes: Listing<String> = new {}
binary: String?                                 // null → "<name>-driver", relative → resolved against driver dir
lifecycleDefaults: carport.LifecycleConfig = new {}

// Mixin that every driver's instance class extends. Auto-derives driverName
// from the module-level `name` field so consumers never write it.
abstract class Instance extends carport.DriverInstance {
  driverName = name
}
```

Why a mixin (`driver.Instance`) instead of having driver authors extend `carport.DriverInstance` directly: it is the only way to auto-derive `driverName` from the module's `name` field while keeping the consumer-facing call site (`new hue.HueInstance { id = "hue_main" … }`) free of the redundant `driverName` string. It also localises the inheritance contract — driver authors look in one place (`switchyard:driver`).

### `switchyard:carport` changes

Today (`internal/config/pkl/switchyard/carport.pkl`):

```pkl
abstract class DriverInstance {
  id: String(!isEmpty)
  driverName: String(!isEmpty)
  binary: String(!isEmpty)
}
```

New shape:

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

`binary` is removed from `DriverInstance` because binary identity is per-driver, not per-instance. `enabled` and `lifecycle` move in from where they used to live in `drivers.toml`.

### A driver's `manifest.pkl`

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

(`Instance` here is inherited from the amended `switchyard:driver` module.)

### Consumer side: `main.pkl`

```pkl
amends "switchyard:config"

import "switchyard:carport" as carport
import "driver:hue"          as hue

driverInstances: Listing<carport.DriverInstance> = new {
  new hue.HueInstance {
    id         = "hue_main"
    bridgeHost = "192.168.1.170"
    apiToken   = read("env:HUE_TOKEN").text
    lifecycle  = new { restartBudgetMax = 20 }   // optional per-instance override
  }
}
```

The `driverName` field is auto-set to `"hue"` by the `switchyard:driver.Instance` mixin. The user never writes it.

## Daemon plumbing

### `driverModuleReader`

New reader in `internal/config/evaluator.go`, registered by `newPklEvaluator` alongside the existing `switchyardModuleReader`:

```go
type driverModuleReader struct{ root string }

func (r *driverModuleReader) Scheme() string            { return "driver" }
func (r *driverModuleReader) IsGlobbable() bool         { return false }
func (r *driverModuleReader) HasHierarchicalUris() bool { return false }
func (r *driverModuleReader) IsLocal() bool             { return true }
func (r *driverModuleReader) ListElements(_ url.URL) ([]pkl.PathElement, error) { return nil, nil }

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

// validDriverName allows lowercase ASCII alphanumerics, "-", "_". No path
// components, no leading dot, length 1..64.
func validDriverName(s string) bool { /* … */ }
```

`newPklEvaluator(ctx)` becomes `newPklEvaluator(ctx, driversRoot string)`. All call sites (`internal/cli/config.go`, `internal/cli/cmd_mcp.go`, `internal/daemon/daemon.go`, tests) plumb the value through.

### Drivers root resolution

- New field `daemon.Config.DriversDir string`. Empty means "default to `<data-dir>/drivers/`".
- Daemon resolves `expandHome(cfg.DriversDir)` (or the default) at startup.
- New CLI flag `--drivers-dir` on `switchyardd` (defaults to empty/unset, populated from `Config`) and on `switchyard config validate` (defaults to `<data-dir>/drivers/`).

### Driver registry and supervisor changes

There is **no existing `drivers.toml` loader to remove** — the supervisor is already fed entirely by the dynamic-registration path (`internal/config/manager.go:Apply` → `CarportManager.RegisterInstance`). Today the binary path travels through `configpb.DriverInstanceConfig.Binary`, sourced from the Pkl `binary` field on `carport.DriverInstance`. With this change, the binary moves to the manifest, and the resolution becomes:

1. **Driver registry in `internal/config/`** (new, consumed by `Manager.Validate` and `Manager.Apply`). At Manager construction it scans `<drivers-root>/*/manifest.pkl`, evaluates each through the same Pkl evaluator, and caches `name → {binaryPath, lifecycleDefaults, manifestPath}`. The registry is rebuilt on `Manager.Validate` so freshly-installed drivers are picked up on the next config reload without a daemon restart.
2. **Binary path resolution happens server-side in `Manager.Apply`** — after Pkl evaluation, before calling the carport. For each instance: look up `driverName` in the registry, resolve `<drivers-root>/<driverName>/<binary or "<name>-driver">` (absolute `binary` honored as-is), and write that path into `configpb.DriverInstanceConfig.Binary`. The carport supervisor receives a fully-resolved binary path and is unchanged.
3. **`CarportManager` interface gains `enabled` and `lifecycle`** in the registration signature (or a new `RegisterInstanceFull` method — implementer's choice). `Manager.Apply` computes the effective lifecycle (defaults ← manifest ← instance) before the call.
4. **Lifecycle merge** (effective config for an instance, computed in `Manager.Apply`):
   ```
   defaultLifecycleConfig()         // Go-side defaults from internal/carport/config.go
     ← manifest.lifecycleDefaults   // non-default fields override
     ← instance.lifecycle           // non-null fields override
   ```
5. **`enabled = false`** instances are evaluated and tracked in `Manager`'s view of the snapshot but not registered with the carport. They appear in `switchyard config show` / similar surfaces; the carport never sees them. (No new "tracked but not spawned" state in the supervisor.)
6. **`carport.Instance.Binary` field stays.** It's the in-process supervisor model field used by `spawn()` (`internal/carport/supervisor.go:187`). The change is purely about *where the value comes from* (manifest registry, not Pkl per-instance).

### `drivers.toml` deprecation

Daemon emits a one-shot warn-level log if `<data-dir>/drivers.toml` exists at startup, then ignores it. There is no code path that currently reads this file (nothing to remove); the warning is purely operator-facing for users who left an old TOML behind.

## Validation rules

| Condition | Validate-time | Startup-time |
|---|---|---|
| `import "driver:foo"` but `<drivers-root>/foo/manifest.pkl` missing | hard error: `driver "foo": manifest not found at <path>` | hard error |
| `manifest.pkl` evaluates but `name != "foo"` (directory name) | hard error: `driver "foo": manifest declares name="bar"` | hard error |
| `driver:` URI opaque part fails `validDriverName` | hard error: `invalid driver name "…/etc/passwd"` | hard error |
| Binary missing at resolved path | warning: `driver "foo": binary not found at <path>` | hard error for `enabled=true` instances; warning only for `enabled=false` |
| Two drivers' subdirs have colliding `name` field | impossible — directory name is the key |
| Two `DriverInstance`s with same `id` | already covered by existing `Compile` validation |
| Instance's `lifecycle` overrides reference unknown fields | Pkl typing catches this |
| `<data-dir>/drivers.toml` exists | one-shot warn log on daemon startup; no validate-time signal |

The directory-name vs. `name`-field check is performed in Go after Pkl evaluation, not in Pkl itself, because the directory name isn't a value Pkl has access to.

## Files touched

**Added:**

- `internal/config/pkl/switchyard/driver.pkl` — base module described above
- `internal/config/driver_reader.go` — `driverModuleReader` + `validDriverName`
- `internal/config/driver_registry.go` — startup scan of `<drivers-root>/*/manifest.pkl`, cached resolution; binary-path + lifecycle-defaults lookup

**Modified:**

- `internal/config/pkl/switchyard/carport.pkl` — drop `binary` from `DriverInstance`; add `enabled`, `lifecycle`; add `LifecycleConfig` and `LifecycleOverride` classes
- `internal/config/evaluator.go` — `newPklEvaluator` takes `driversRoot`; registers `driverModuleReader`; `ValidateOffline` accepts `driversRoot`
- `internal/config/manager.go` — `NewManager` accepts `driversRoot`; constructs the registry; `Apply` resolves binary path and lifecycle from registry before calling `CarportManager`
- `internal/config/manager.go` — `CarportManager` interface gains `enabled` and `lifecycle` parameters (or new `RegisterInstanceFull`); existing `RegisterInstance` deprecated
- `internal/carport/carport.go` — implements the new `CarportManager` method on `*Host`
- `internal/cli/config.go` — `--drivers-dir` flag on `validate`; plumbed to `ValidateOffline`
- `internal/daemon/config.go` — new `DriversDir string` field
- `internal/daemon/daemon.go` — resolves `DriversDir` (default `<data-dir>/drivers/`); passes to `config.NewManager`; emits one-shot deprecation log if `<data-dir>/drivers.toml` exists
- `cmd/switchyardd/main.go` — new `--drivers-dir` flag
- `docs/docs/configuration/drivers.md` — drop the C4-deferred caveat; document the layout, the `--drivers-dir` flag, and the migration from per-instance binary
- `docs/docs/drivers/building/manifest.md` — drop the C4 caveat boxes; document Shape α; show the actual `switchyard:driver` module surface
- All evaluator-call sites in tests (`internal/config/evaluator_integration_test.go`, `internal/config/evaluator_starlark_test.go`, `internal/config/manager_test.go`) get the extra `driversRoot` argument (typically a `t.TempDir()` with no manifests, plus one or two with hand-written manifests for the new tests below)

**Not in modified files list (verified during planning):**

- `internal/cli/cmd_mcp.go` does not construct an evaluator — talks to the running daemon over RPC
- `internal/config/pkl/PklProject.pkl` does not need updating — module discovery is via `switchyardModuleReader`, not project paths

**Removed:**

- (Nothing — there is no existing TOML loader code path. The `Instance` struct, `defaultLifecycleConfig()`, and supervisor binary-spawn code all stay.)

**One-shot operator action (outside the codebase):**

- Move `~/.local/share/switchyard/bin/hue-driver` to `~/.local/share/switchyard/drivers/hue/hue-driver`
- Hand-write `~/.local/share/switchyard/drivers/hue/manifest.pkl` for the Hue driver
- Delete `~/.local/share/switchyard/drivers.toml`
- Update `~/.local/share/switchyard/config/main.pkl` to the shape shown in the "Consumer side" section above

## Testing

- **`internal/config/evaluator_test.go`** — new tests:
  - `import "driver:foo"` resolves when `<root>/foo/manifest.pkl` exists
  - `import "driver:foo"` errors with the expected message when the manifest is missing
  - Manifest with `name` ≠ directory name errors at the post-eval check
  - `driver:../etc/passwd` and other malformed names rejected by `validDriverName`
  - Auto-derived `driverName` shows up in the JSON output for an instance
- **`internal/carport/driver_registry_test.go`** — new:
  - Scan an empty drivers root → empty registry, no error
  - Scan a drivers root with two valid drivers → both indexed
  - Mixed valid/invalid (one missing manifest, one with name mismatch) → valid one indexed, invalid one reported with line numbers
  - Binary path resolution: default name, explicit relative override, explicit absolute override
- **`internal/carport/supervisor_test.go`** — adapt:
  - Lifecycle merge precedence (defaults ← manifest ← instance) verified through table-driven tests
  - `enabled = false` instances are not spawned but appear in the supervisor's tracked set
  - drivers.toml-related tests deleted
- **End-to-end** (`internal/cli/config_offline_test.go` style):
  - `switchyard config validate` against a testdata fixture that imports a real driver manifest succeeds
  - The same fixture with the manifest dir absent fails with the documented error message

## Risks and open follow-ons

- **Pkl `amends` + new class declarations.** Shape α requires that an `amends`-style module can declare new classes (`class HueInstance extends Instance`). Standard Pkl behavior allows this; if implementation discovers an edge case, fall back to a regular `module driver.<name>` declaration with explicit `import "switchyard:driver" as driver` and a `manifest: driver.Manifest = new { … }` field. The implementer should verify on the first manifest written.
- **Driver-author ergonomics for `lifecycleDefaults`.** Authors writing `lifecycleDefaults { restartBudgetMax = 10 }` rely on Pkl's amends semantics for nested objects — the unset fields keep their `LifecycleConfig` defaults. If this proves confusing, we can switch `lifecycleDefaults` to a `LifecycleOverride` (all-nullable) instead and merge in Go.
- **Cross-checking runtime manifest bytes (`HandshakeResponse.manifest.pkl_module`) against on-disk `manifest.pkl`.** Reserved as a follow-on. Useful as a tampering / staleness check once drivers actually populate the proto field.
- **`switchyard driver list` / `driver info` subcommands.** Reserved as a follow-on. The `driverRegistry` introduced here is the right substrate.
