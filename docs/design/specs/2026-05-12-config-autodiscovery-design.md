# Config auto-discovery — design spec

**Date:** 2026-05-12
**Status:** approved, ready for plan
**Closes:** known gap from `docs/design/plans/2026-05-12-pkl-starlark-editors-progress.md` (T3.7 KNOWN GAP)

## Goal

Make `<configDir>/automations/*.pkl` (and parallel directories for areas, scenes, plus the `entity-areas.pkl` singleton) visible to the live config snapshot. Today the form-driven "+ New automation" flow writes `automations/<id>.pkl` correctly, but the daemon never reads those files — the inline `automations = new { ... }` listing in `main.pkl` is the only source. Auto-discovery closes that loop.

## Non-goals

- LSP support for Pkl or Starlark (separate track).
- Form-driven editors for areas/scenes (those forms don't exist yet; auto-discovery is forward-compatible but doesn't require them).
- Reactive UI updates from filesystem changes (existing config watcher handles this).
- Back-compat with the current bare `new auto.Automation { ... }` regen output. Old files get migrated once.

## File format

Each per-kind file is a valid standalone Pkl module that amends a singleton template. Four new modules in the embedded `pkl/switchyard/` FS:

- `switchyard:automation` — amend to produce one `Automation`
- `switchyard:area` — amend to produce one `Area`
- `switchyard:scene` — amend to produce one `Scene`
- `switchyard:entity-areas` — amend to produce a `Mapping<String, String>`

Example post-migration `automations/sunset-lights.pkl`:

```
amends "switchyard:automation"

id = "sunset-lights"
enabled = true

triggers {
  new EventTrigger { kind = "sun.sunset" }
}

actions {
  new CallServiceAction {
    entity = "light.living_room_ceiling"
    capability = "set_brightness"
    args { ["level"] = "40" }
  }
}
```

The amending file inherits scope from `switchyard:automation`. Whether trigger/action/condition class names need the `auto.` prefix or can be unqualified depends on whether the template module re-exports them (e.g. via `local class EventTrigger = auto.EventTrigger`). The implementation should pick whichever idiom Pkl actually permits — the regen output must produce whatever the template makes legal. The example above assumes unqualified names; if Pkl requires prefixes, the regen output and the example both use `auto.EventTrigger` etc. consistently.

### Filename-equals-id invariant

`filepath.Base(path)` minus `.pkl` must equal the `id =` property inside the file. Violation = soft per-file `ValidationError{Code: "filename_id_mismatch"}`; file is dropped from the snapshot but the daemon still starts.

Rationale: the form names files this way; the file picker and palette can identify automations without parsing them; renames map cleanly to file renames; prevents an accidental same-content copy from silently creating two automations.

### `entity-areas.pkl` is a singleton

The proto shape is `map<string, string>` — per-entity files would split a logically atomic mapping. The form writes the whole map at once.

## Directory layout

```
<configDir>/
  main.pkl                       # existing — declares inline lists too
  automations/<id>.pkl           # one Automation per file
  areas/<id>.pkl                 # one Area per file
  scenes/<id>.pkl                # one Scene per file
  entity-areas.pkl               # optional singleton
```

Missing directories are not an error. Non-`.pkl` files inside the directories are ignored. The four directories are reserved names: `<configDir>/automations/` is owned by the discovery mechanism, and users should not put non-Automation Pkl files there.

## Discovery flow

Inside `internal/config/evaluator.go`, the existing `Evaluate(ctx, configDir)` gets an extra phase after `parseConfigJSON`:

```
Evaluate(ctx, configDir):
  snap        = evaluateMain(configDir)         // existing
  discovered  = discoverConfigDir(ctx, configDir)
  merged, errs = mergeDiscovered(snap, discovered)
  return merged, errs
```

`discoverConfigDir` walks the four locations and, for each `.pkl` file found, runs an independent `pkl.FileSource(path)` evaluation through the existing `pklEvaluator`. Discovery is bounded-parallel: `min(runtime.NumCPU(), 8)` workers, since each file is a fresh Pkl eval. On a typical config this is irrelevant; on a 50-automation user it cuts cold-start cost noticeably.

Per-file evaluation failures (Pkl parse errors, schema violations, missing required fields) are captured as `ValidationError{File: relPath, Line: pklErrLine, Message: ...}` and do not abort discovery. The file is dropped; the rest proceed.

## Merge semantics

`mergeDiscovered(snap, discovered)` reconciles the inline declarations from `main.pkl` with the on-disk files. For each kind:

1. Index inline ids: `inlineIds = {x.Id for x in snap.<Kind>}`.
2. For each discovered file:
   - If `id ∈ inlineIds` → **hard error**: append `ValidationError{Code: "duplicate_id", File: relPath, Message: "id 'X' is already declared inline in main.pkl"}` AND return a non-nil `error` from `Evaluate`. The daemon refuses to start.
   - If filename mismatch → soft `ValidationError`, file dropped, continue.
   - Otherwise → append to `snap.<Kind>`.
3. Final order in `snap.<Kind>`: inline entries first (in main.pkl order), then discovered entries sorted by id. Deterministic so downstream diffs are stable.

For `entity-areas.pkl`: merge keys into `snap.EntityAreas`. Duplicate keys across inline + file = hard error.

## Caller changes

`Evaluate` signature changes from `(*ConfigSnapshot, error)` to `(*ConfigSnapshot, []ValidationError, error)`. Daemon callers:

- `internal/daemon` startup + reload paths: log the `[]ValidationError`, expose them via the existing validation report RPC, treat the `error` return as fatal as today.
- `internal/config.ValidateOffline` already returns `([]ValidationError, error)` — it folds the new discovery errors into its existing slice.

## File watcher

`internal/config/watcher.go` already watches `<configDir>` recursively via fsnotify. The new discovered directories (`automations/`, `areas/`, `scenes/`) and `entity-areas.pkl` get picked up automatically since the watcher is tree-recursive. No watcher changes are required; verify on implementation.

## Component boundaries

| Component | Responsibility | Inputs | Outputs |
|-----------|---------------|--------|---------|
| `discoverConfigDir` | Walk filesystem, run per-file Pkl evals, collect per-file errors. | `configDir`, `*pklEvaluator` | `discoveredResults`, `[]ValidationError` |
| `mergeDiscovered` | Reconcile inline + discovered, enforce duplicate-id and filename-id-mismatch rules. | `*ConfigSnapshot`, `discoveredResults` | `*ConfigSnapshot` (merged), `[]ValidationError`, `error` |
| `Evaluate` (existing) | Orchestrate the two phases. | `configDir` | `*ConfigSnapshot`, `[]ValidationError`, `error` |
| `regen.Render*` (existing, modified) | Emit `amends` form instead of bare `new` form. | `*Config` | `[]byte` of Pkl text |
| New `pkl/switchyard/{automation,area,scene,entity-areas}.pkl` modules | Define the amendable singleton templates. | — | Pkl module text via `switchyardModuleReader` |

Each unit testable in isolation: discovery against filesystem fixtures, merge against in-memory inputs, regen against table-driven config protos.

## Testing strategy

### Unit (no Pkl runtime)

- `discoverConfigDir` against `testdata/discovery/` fixtures:
  - happy path: one file per kind, all valid
  - missing `automations/` directory → empty result, no error
  - empty `automations/` directory → empty result
  - non-`.pkl` files (`README.md`) ignored
  - missing `entity-areas.pkl` → empty map, no error
- `mergeDiscovered` against in-memory snaps + discovered slices:
  - inline + discovered, no overlap → both present, inline-first-then-sorted order
  - duplicate id across inline + discovered → returns non-nil `error` AND `ValidationError{Code: "duplicate_id"}`
  - filename mismatch (file `foo.pkl` declares `id = "bar"`) → soft error, file dropped
  - empty inline + only discovered → snap contains discovered

### Integration (real Pkl evaluator)

`testdata/discovery-integration/` — a complete tiny config with `main.pkl` + 3 automations + 2 areas + 1 scene + entity-areas:

- Full `Evaluate` flow produces the expected merged snapshot. Compare against a golden JSON file.
- Broken-file resilience: replace one `automations/<id>.pkl` with intentionally bad Pkl (e.g. `id = unterminated`); assert valid automations still load and the `ValidationError` slice contains the bad file with a real line number from the Pkl error message.
- Hard-error path: `main.pkl` declares an automation inline with the same id as a file; assert `Evaluate` returns a non-nil error.

### Regen migration

- `regen.Render(ac)` emits `amends "switchyard:automation"` as the first non-blank line and does not emit `import "switchyard:automations" as auto` or wrap the body in `new auto.Automation { ... }`.
- Same for `RenderArea`, `RenderScene`.
- Identifier prefixes inside (`new EventTrigger`, not `new auto.EventTrigger`) update accordingly.

### End-to-end loop closure

In the existing `internal/daemon` integration suite:

- Start daemon with a `configDir` whose `main.pkl` has empty `automations: Listing<auto.Automation> = new {}`.
- Drive `OpenForEdit` → `CommitEdit` for `automations/loop-test.pkl` via the EditSessionService RPC, content = `regen.Render(ac)` for a hand-built `AutomationConfig`.
- Trigger config reload (via fsnotify watcher; if test setup makes that flaky, use the explicit `ReloadConfig` RPC).
- Assert the live snapshot now contains the automation under the right id.

This test is the contractual proof that the original gap is closed.

## Migration

One-time pass to rewrite existing automation files into the new format:

- `examples/automations/sunset-lights.pkl` — update to the `amends` form.
- Any leftover dev-config automation files from the editors plan validation — same treatment.

No back-compat reader for the old bare-new form. The format change is enforced by `regen.Render` producing only the new shape; saves from the form automatically produce valid files.

## Open follow-ups (out of scope here)

- A form-driven editor for areas/scenes — auto-discovery covers the reading side, but writing still needs UI surface. Track separately.
- A directory-watcher-driven UI refresh so newly written automations appear in the list immediately without a manual reload. Existing watcher already triggers config reload; this is a UI question, not a discovery one.
