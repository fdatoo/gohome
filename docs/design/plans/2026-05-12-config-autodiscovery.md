# Config auto-discovery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `<configDir>/{automations,areas,scenes}/*.pkl` and `<configDir>/entity-areas.pkl` visible to the live config snapshot, closing the gap where form-driven saves write files the daemon never reads.

**Architecture:** Each per-kind file is a valid standalone Pkl module amending a new singular template module (`switchyard:automation`, `switchyard:area`, `switchyard:scene`, `switchyard:entity-areas`). The config evaluator gains a `discoverConfigDir` + `mergeDiscovered` phase that runs after `main.pkl` evaluation, evaluates each discovered file via the existing Pkl evaluator, and folds results into the snapshot. Per-file Pkl errors are soft (file dropped, surfaced as `ValidationError`); duplicate ids across inline + discovered are hard errors.

**Tech Stack:** Go, Pkl (apple/pkl-go), embedded FS for Pkl modules, existing `pklEvaluator` + `parseConfigJSON` pipeline.

**Spec:** `docs/design/specs/2026-05-12-config-autodiscovery-design.md`

---

## File map

| File | Status | Responsibility |
|------|--------|----------------|
| `internal/config/pkl/switchyard/scenes.pkl` | NEW | Plural `Scene` class definition (missing today) |
| `internal/config/pkl/switchyard/automation.pkl` | NEW | Singular amendable template, produces one `Automation` |
| `internal/config/pkl/switchyard/area.pkl` | NEW | Singular amendable template, produces one `Area` |
| `internal/config/pkl/switchyard/scene.pkl` | NEW | Singular amendable template, produces one `Scene` |
| `internal/config/pkl/switchyard/entity-areas.pkl` | NEW | Singleton template for `Mapping<String, String>` |
| `internal/config/errors.go` | MOD | Extend `ValidationError` with `Code`, `File`, `Line` |
| `internal/config/evaluator_decode.go` | NEW | Extract `automationFromJSON`, `areaFromJSON`; add `sceneJSON` + `sceneFromJSON` |
| `internal/config/evaluator.go` | MOD | Add `Scenes` to `configJSON`; populate `snap.Scenes`; wire `Evaluate` to discovery + merge; signature change |
| `internal/config/discovery.go` | NEW | `discoverConfigDir(ctx, ev, configDir)` walks directories, runs per-file Pkl evals |
| `internal/config/discovery_test.go` | NEW | Unit tests for discovery (filesystem fixtures, no Pkl) |
| `internal/config/merge.go` | NEW | `mergeDiscovered(snap, discovered)` enforces duplicate-id + filename-id-mismatch |
| `internal/config/merge_test.go` | NEW | Unit tests for merge (in-memory inputs) |
| `internal/config/evaluator_integration_test.go` | MOD | Add integration tests for full `Evaluate` w/ discovery |
| `internal/config/manager.go` | MOD | Update `Validate` for new `Evaluate` signature |
| `internal/automation/regen/regen.go` | MOD | `Render` emits `amends "switchyard:automation"` form |
| `internal/automation/regen/area.go` | MOD | `RenderArea` emits `amends "switchyard:area"` form |
| `internal/automation/regen/scene.go` | MOD | `RenderScene` emits `amends "switchyard:scene"` form |
| `internal/automation/regen/regen_test.go` | MOD | Update assertions for new format |
| `internal/automation/regen/area_test.go` | MOD | Same |
| `internal/automation/regen/scene_test.go` | MOD | Same |
| `examples/automations/sunset-lights.pkl` | MOD | Migrate to new amends form |
| `internal/config/testdata/discovery/` | NEW | Fixture configs for unit/integration tests |
| `internal/daemon/autodiscovery_e2e_test.go` | NEW | E2E loop-closure test (RPC + watcher + snapshot assert) |

---

## Task 1: Add the `scenes.pkl` Pkl class definition

`SceneConfig` exists in the proto but no Pkl class to instantiate. Without this, `switchyard:scene` (singular template) has no `Scene` class to amend.

**Files:**
- Create: `internal/config/pkl/switchyard/scenes.pkl`
- Test: `internal/config/evaluator_test.go` (extend an existing test or add a new one verifying a `main.pkl` declaring `scenes: Listing<sc.Scene> = new { ... }` parses)

- [ ] **Step 1: Write the failing test**

Add to `internal/config/evaluator_test.go`:

```go
func TestEvaluate_ScenesDeclaredInline(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "main.pkl"), `
module switchyard.config

import "switchyard:scenes" as sc
import "switchyard:automations" as auto

entities: Listing = new {}
driverInstances: Listing = new {}
automations: Listing = new {}
scripts: Listing = new {}
dashboards: Listing = new {}
users: Listing = new {}
roles: Listing = new {}
policies: Listing = new {}
scenes: Listing<sc.Scene> = new {
  new {
    id = "movie-night"
    displayName = "Movie Night"
    actions {
      new auto.CallServiceAction {
        entity = "light.living_room"
        capability = "turn_off"
        args {}
      }
    }
  }
}

mcp = new { evalResultMaxBytes = 0; readFileMaxBytes = 0; entitySubscriptionBuffer = 0; traceSubscriptionBuffer = 0; tailDefaultWaitSeconds = 0; tailMaxWaitSeconds = 0 }
listener = new { uds = new {}; tcp = new {}; webhooks = new {}; streamHeartbeatInterval = 30.s }

output { renderer = new JsonRenderer {} }
`)

	ev, err := newPklEvaluator(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ev.ev.Close() }()
	snap, err := ev.Evaluate(context.Background(), dir)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if len(snap.GetScenes()) != 1 {
		t.Fatalf("want 1 scene, got %d", len(snap.GetScenes()))
	}
	if snap.GetScenes()[0].GetId() != "movie-night" {
		t.Errorf("scene id = %q, want movie-night", snap.GetScenes()[0].GetId())
	}
}
```

If `writeFile` helper doesn't exist in this package, add it next to the test:

```go
func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/config -run TestEvaluate_ScenesDeclaredInline -v`
Expected: FAIL — Pkl evaluation error about missing `switchyard:scenes` module.

- [ ] **Step 3: Create `internal/config/pkl/switchyard/scenes.pkl`**

```pkl
module switchyard.scenes

import "switchyard:automations" as auto

/// Scene is a named collection of actions that can be invoked atomically
/// (e.g. "movie night" turns off lights, dims TV bias light, lowers blinds).
class Scene {
  /// Stable identifier; appears in URLs and from `SceneAction.slug` calls.
  id:          String(!isEmpty)

  /// Human-readable name shown in the UI.
  displayName: String

  /// Actions executed when the scene is invoked. Reuses the Action type
  /// from switchyard:automations so any automation action is a valid
  /// scene action.
  actions:     Listing<auto.Action>
}
```

- [ ] **Step 4: Add `Scenes` field to `configJSON` and decode into `snap.Scenes`**

Modify `internal/config/evaluator.go`. Find the `type configJSON struct` block (around line 215) and add:

```go
type configJSON struct {
	DriverInstances  []json.RawMessage    `json:"driverInstances"`
	Areas            []areaJSON           `json:"areas"`
	Entities         []entityJSON         `json:"entities"`
	EntityAreas      map[string]string    `json:"entityAreas"`
	Automations      []automationJSON     `json:"automations"`
	Scripts          []scriptJSON         `json:"scripts"`
	Scenes           []sceneJSON          `json:"scenes"` // NEW
	Dashboards       []dashboardJSON      `json:"dashboards"`
	Users            []userJSON           `json:"users"`
	Roles            []roleJSON           `json:"roles"`
	Policies         []policyJSON         `json:"policies"`
	WidgetPackPolicy widgetPackPolicyJSON `json:"widgetPackPolicy"`
	AuthSettings     *authSettingsJSON    `json:"auth_settings"`
	Listener         listenerJSON         `json:"listener"`
	MCP              mcpConfigJSON        `json:"mcp"`
}
```

Add the `sceneJSON` type definition near `automationJSON`:

```go
type sceneJSON struct {
	ID          string            `json:"id"`
	DisplayName string            `json:"displayName"`
	Actions     []json.RawMessage `json:"actions"`
}
```

In `parseConfigJSON`, after the automations loop (around line 480), add scene decoding:

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

- [ ] **Step 5: Run test to verify it passes**

Run: `go test ./internal/config -run TestEvaluate_ScenesDeclaredInline -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/config/pkl/switchyard/scenes.pkl internal/config/evaluator.go internal/config/evaluator_test.go
git commit -m "feat(config): add scenes.pkl + inline scene decoding"
```

---

## Task 2: Extend `ValidationError` with `Code`, `File`, `Line`

Discovery surfaces per-file errors with file paths and Pkl line numbers; merge surfaces structured codes like `duplicate_id`. The existing struct can't carry that info.

**Files:**
- Modify: `internal/config/errors.go`
- Test: `internal/config/errors_test.go` (create if absent)

- [ ] **Step 1: Write the failing test**

Create `internal/config/errors_test.go`:

```go
package config

import "testing"

func TestValidationError_FormatsWithCode(t *testing.T) {
	e := ValidationError{
		Code:    "duplicate_id",
		File:    "automations/foo.pkl",
		Line:    0,
		Field:   "automations[foo]",
		Message: "id 'foo' already declared inline",
	}
	got := e.Error()
	want := "automations/foo.pkl: [duplicate_id] automations[foo]: id 'foo' already declared inline"
	if got != want {
		t.Errorf("Error() = %q, want %q", got, want)
	}
}

func TestValidationError_FormatsWithFileAndLine(t *testing.T) {
	e := ValidationError{
		Code:    "pkl_eval",
		File:    "automations/bad.pkl",
		Line:    12,
		Message: "unexpected token",
	}
	got := e.Error()
	want := "automations/bad.pkl:12: [pkl_eval] unexpected token"
	if got != want {
		t.Errorf("Error() = %q, want %q", got, want)
	}
}

func TestValidationError_FormatsLegacyFieldOnly(t *testing.T) {
	e := ValidationError{
		Field:   "automations[foo]",
		Message: "duplicate automation id",
	}
	got := e.Error()
	want := "automations[foo]: duplicate automation id"
	if got != want {
		t.Errorf("Error() = %q, want %q", got, want)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/config -run TestValidationError -v`
Expected: FAIL — `Code`/`File`/`Line` fields don't exist.

- [ ] **Step 3: Update `internal/config/errors.go`**

```go
package config

import (
	"fmt"
	"strings"
)

type EvalError struct {
	File    string
	Line    int
	Column  int
	Message string
}

func (e *EvalError) Error() string {
	if e.File != "" {
		return fmt.Sprintf("%s:%d:%d: %s", e.File, e.Line, e.Column, e.Message)
	}
	return e.Message
}

// ValidationError describes a non-fatal config issue. Compile-time checks
// produce these with Field+Message; discovery produces them with File and
// optionally Code/Line populated.
type ValidationError struct {
	Code    string // machine-readable category, e.g. "duplicate_id", "pkl_eval"
	File    string // path relative to configDir, e.g. "automations/foo.pkl"
	Line    int    // 1-based line number when known (Pkl errors); 0 otherwise
	Field   string // legacy locator, e.g. "automations[foo]"
	Message string
}

func (e *ValidationError) Error() string {
	var b strings.Builder
	if e.File != "" {
		b.WriteString(e.File)
		if e.Line > 0 {
			fmt.Fprintf(&b, ":%d", e.Line)
		}
		b.WriteString(": ")
	}
	if e.Code != "" {
		fmt.Fprintf(&b, "[%s] ", e.Code)
	}
	if e.Field != "" {
		b.WriteString(e.Field)
		b.WriteString(": ")
	}
	b.WriteString(e.Message)
	return b.String()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/config -run TestValidationError -v`
Expected: PASS, all three cases.

- [ ] **Step 5: Verify existing tests still pass**

Run: `go test ./internal/config -count=1`
Expected: PASS (existing Compile tests use only `Field`+`Message`; new fields default to zero values so legacy behavior is unchanged).

- [ ] **Step 6: Commit**

```bash
git add internal/config/errors.go internal/config/errors_test.go
git commit -m "feat(config): extend ValidationError with Code/File/Line"
```

---

## Task 3: Add the four singular Pkl template modules

Each is a thin amendable template. Files amending them inherit the property shape but must re-import `switchyard:automations`/`switchyard:areas`/`switchyard:scenes` to reference the trigger/action/class types inside `new { ... }` blocks.

**Files:**
- Create: `internal/config/pkl/switchyard/automation.pkl`
- Create: `internal/config/pkl/switchyard/area.pkl`
- Create: `internal/config/pkl/switchyard/scene.pkl`
- Create: `internal/config/pkl/switchyard/entity-areas.pkl`
- Test: `internal/config/templates_test.go` (new)

- [ ] **Step 1: Write the failing tests**

Create `internal/config/templates_test.go`:

```go
package config

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/apple/pkl-go/pkl"
)

// amendsFile returns the JSON output produced by evaluating `content`
// as an .pkl file in a temp dir against a fresh evaluator.
func evalPklText(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "test.pkl")
	writeFile(t, path, content)

	ev, err := newPklEvaluator(context.Background(), "")
	if err != nil {
		t.Fatalf("evaluator: %v", err)
	}
	defer func() { _ = ev.ev.Close() }()

	text, err := ev.ev.EvaluateOutputText(context.Background(), pkl.FileSource(path))
	if err != nil {
		t.Fatalf("evaluate: %v", err)
	}
	return text
}

func TestTemplate_AutomationAmends(t *testing.T) {
	out := evalPklText(t, `
amends "switchyard:automation"
import "switchyard:automations" as auto

id = "test-auto"
enabled = true
triggers {
  new auto.EventTrigger { kind = "sun.sunset" }
}
actions {
  new auto.CallServiceAction {
    entity = "light.x"
    capability = "turn_on"
    args {}
  }
}
`)
	if !contains(out, `"id":"test-auto"`) {
		t.Errorf("missing id in output: %s", out)
	}
	if !contains(out, `"kind":"sun.sunset"`) {
		t.Errorf("missing trigger kind: %s", out)
	}
}

func TestTemplate_AreaAmends(t *testing.T) {
	out := evalPklText(t, `
amends "switchyard:area"

id = "kitchen"
displayName = "Kitchen"
`)
	if !contains(out, `"id":"kitchen"`) {
		t.Errorf("missing id: %s", out)
	}
	if !contains(out, `"displayName":"Kitchen"`) {
		t.Errorf("missing displayName: %s", out)
	}
}

func TestTemplate_SceneAmends(t *testing.T) {
	out := evalPklText(t, `
amends "switchyard:scene"
import "switchyard:automations" as auto

id = "movie-night"
displayName = "Movie Night"
actions {
  new auto.CallServiceAction {
    entity = "light.x"
    capability = "turn_off"
    args {}
  }
}
`)
	if !contains(out, `"id":"movie-night"`) {
		t.Errorf("missing id: %s", out)
	}
}

func TestTemplate_EntityAreasAmends(t *testing.T) {
	out := evalPklText(t, `
amends "switchyard:entity-areas"

entityAreas {
  ["light.living_room"] = "living-room"
  ["sensor.kitchen"] = "kitchen"
}
`)
	if !contains(out, `"light.living_room":"living-room"`) {
		t.Errorf("missing mapping: %s", out)
	}
}

func contains(haystack, needle string) bool {
	return len(haystack) > 0 && len(needle) > 0 && indexOf(haystack, needle) >= 0
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/config -run TestTemplate -v`
Expected: FAIL — `switchyard:automation` (singular) module not found.

- [ ] **Step 3: Create `internal/config/pkl/switchyard/automation.pkl`**

```pkl
module switchyard.automation

import "switchyard:automations" as auto

/// Single-Automation template. Files that own one automation amend this
/// module. The amending file provides `id`, optionally overrides defaults,
/// and fills `triggers`/`conditions`/`actions` blocks.
///
/// Note: amending modules must re-import `switchyard:automations` to
/// reference Trigger/Condition/Action subclasses (e.g. `auto.EventTrigger`).

id:         String(!isEmpty)
enabled:    Boolean             = true
mode:       String              = "single"
maxQueued:  UInt                = 10
triggers:   Listing<auto.Trigger> = new {}
conditions: Listing<auto.Condition>? = null
actions:    Listing<auto.Action> = new {}
areas:      Listing<String>     = new {}
onFailure:  auto.FailureStrategy? = null

output {
  renderer = new JsonRenderer {
    converters {
      [Duration] = (it) -> "\(it.value).\(it.unit)"
    }
  }
}
```

- [ ] **Step 4: Create `internal/config/pkl/switchyard/area.pkl`**

```pkl
module switchyard.area

/// Single-Area template. Files that own one area amend this module.

id:          String(!isEmpty)
displayName: String
parentId:    String?

output {
  renderer = new JsonRenderer {}
}
```

- [ ] **Step 5: Create `internal/config/pkl/switchyard/scene.pkl`**

```pkl
module switchyard.scene

import "switchyard:automations" as auto

/// Single-Scene template. Files that own one scene amend this module.
/// Amending files must re-import `switchyard:automations` to reference
/// action subclasses.

id:          String(!isEmpty)
displayName: String
actions:     Listing<auto.Action> = new {}

output {
  renderer = new JsonRenderer {}
}
```

- [ ] **Step 6: Create `internal/config/pkl/switchyard/entity-areas.pkl`**

```pkl
module switchyard.entityAreas

/// Singleton template for the entity → area mapping. Files amending this
/// module provide an `entityAreas` block that the daemon merges into the
/// config snapshot's entity-areas map.

entityAreas: Mapping<String, String> = new {}

output {
  renderer = new JsonRenderer {}
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `go test ./internal/config -run TestTemplate -v`
Expected: PASS, all four template tests.

- [ ] **Step 8: Commit**

```bash
git add internal/config/pkl/switchyard/automation.pkl internal/config/pkl/switchyard/area.pkl internal/config/pkl/switchyard/scene.pkl internal/config/pkl/switchyard/entity-areas.pkl internal/config/templates_test.go
git commit -m "feat(config): add singular amendable template modules"
```

---

## Task 4: Migrate `regen.Render` (automation) to emit amends-form

**Files:**
- Modify: `internal/automation/regen/regen.go:16-64`
- Modify: `internal/automation/regen/regen_test.go` (assertions)

- [ ] **Step 1: Update the existing happy-path test to expect new format**

Find the existing first test in `regen_test.go` and update the expected output. Read the file first (`internal/automation/regen/regen_test.go`) to find the test that asserts on the rendered text. Update the `want` string to start with:

```
amends "switchyard:automation"
import "switchyard:automations" as auto

// Auto-generated by switchyardd regen — do not edit manually.

id = "..."
enabled = ...
```

Instead of the old `new auto.Automation { ... }` wrapper.

If the test uses `strings.HasPrefix` or substring matching, update the assertions to match the new prefix `amends "switchyard:automation"` and verify the absence of `new auto.Automation {`.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/automation/regen -run TestRender -v`
Expected: FAIL — output still uses old `new auto.Automation { ... }` shape.

- [ ] **Step 3: Update `Render` in `internal/automation/regen/regen.go`**

Replace lines 16-64 with:

```go
// Render serializes an AutomationConfig to its canonical .pkl representation.
// The output is deterministic across calls with equal input. The emitted file
// is a valid standalone Pkl module that amends switchyard:automation, suitable
// for the daemon's auto-discovery (one file per automation in
// `<configDir>/automations/<id>.pkl`).
func Render(ac *configpb.AutomationConfig) ([]byte, error) {
	var buf bytes.Buffer
	w := &pklWriter{b: &buf}
	w.line(`amends "switchyard:automation"`)
	w.line(`import "switchyard:automations" as auto`)
	w.line("")
	w.line("// Auto-generated by switchyardd regen — do not edit manually.")
	w.line("")
	w.line(fmt.Sprintf("id = %q", ac.GetId()))
	w.line(fmt.Sprintf("enabled = %v", ac.GetEnabled()))
	modeStr := automationModeStr(ac.GetMode())
	if modeStr != "single" {
		w.line(fmt.Sprintf("mode = %q", modeStr))
	}
	if ac.GetMaxQueued() > 0 && ac.GetMaxQueued() != 10 {
		w.line(fmt.Sprintf("maxQueued = %d", ac.GetMaxQueued()))
	}

	w.line("triggers {")
	for _, tc := range ac.GetTriggers() {
		renderTrigger(w, tc)
	}
	w.line("}")

	if len(ac.GetConditions()) > 0 {
		w.line("conditions {")
		for _, cc := range ac.GetConditions() {
			renderCondition(w, cc, 1)
		}
		w.line("}")
	}

	w.line("actions {")
	for _, act := range ac.GetActions() {
		renderAction(w, act, 1)
	}
	w.line("}")

	if ac.GetOnFailure() != nil {
		renderOnFailure(w, ac.GetOnFailure())
	}

	return buf.Bytes(), nil
}
```

**Indent rationale (read this before editing the inner render fns):**

In the old format, the structure was:

```
new auto.Automation {       (col 0)
  triggers {                (col 2)
    new auto.EventTrigger { (col 4 — depth=2)
      kind = "..."          (col 6)
    }
  }
}
```

So `renderCondition`/`renderAction` were called with `depth=2`, and `renderTrigger` had hardcoded 4-space indent. In the new format:

```
triggers {                  (col 0)
  new auto.EventTrigger {   (col 2 — depth=1)
    kind = "..."            (col 4)
  }
}
```

Calls become `depth=1`. `renderTrigger`, which does not take a depth parameter, uses hardcoded `"    "` (4-space) prefixes — find every `w.line("    new auto.<TriggerSubclass> {")` in `regen.go:79-140` and change `"    "` to `"  "` (drop one indent level). Similarly, lines inside trigger bodies (like `"      entities {"`) drop from 6-space to 4-space. The simplest mechanical edit: every literal indent string inside `renderTrigger` (and its sibling renderers if they hardcode) loses 2 leading spaces.

If your test expectations from Step 1 are right, running them after the implementation surfaces any indent miscount as a literal string diff — fix as needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/automation/regen -run TestRender -v`
Expected: PASS.

- [ ] **Step 5: Run the full regen test suite**

Run: `go test ./internal/automation/regen -count=1`
Expected: PASS (other render tests for area/scene may fail — that's Task 5, address those failures there).

If any other automation-related tests fail because of indentation changes, fix them inline (update the `want` strings).

- [ ] **Step 6: Commit**

```bash
git add internal/automation/regen/regen.go internal/automation/regen/regen_test.go
git commit -m "feat(regen): emit amends form for automations"
```

---

## Task 5: Migrate `RenderArea` and `RenderScene` to amends-form

**Files:**
- Modify: `internal/automation/regen/area.go`
- Modify: `internal/automation/regen/scene.go`
- Modify: `internal/automation/regen/area_test.go`
- Modify: `internal/automation/regen/scene_test.go`

- [ ] **Step 1: Update area tests to expect new format**

Read `internal/automation/regen/area_test.go`. Update each test's `want` to expect:

```
amends "switchyard:area"

// Auto-generated by switchyardd regen — do not edit manually.

id = "..."
displayName = "..."
```

Drop expectations of `import "switchyard:areas" as ar` and `new ar.Area { ... }` wrapper.

- [ ] **Step 2: Update scene tests to expect new format**

Read `internal/automation/regen/scene_test.go`. Update each test's `want` to expect:

```
amends "switchyard:scene"
import "switchyard:automations" as auto

// Auto-generated by switchyardd regen — do not edit manually.

id = "..."
displayName = "..."
actions {
  new auto.CallServiceAction { ... }
}
```

Drop expectations of `import "switchyard:scenes" as sc` and the `new sc.Scene { ... }` wrapper.

- [ ] **Step 3: Run tests to verify they fail**

Run: `go test ./internal/automation/regen -run "TestRenderArea|TestRenderScene" -v`
Expected: FAIL.

- [ ] **Step 4: Update `RenderArea` in `internal/automation/regen/area.go`**

```go
package regen

import (
	"bytes"
	"fmt"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
)

func RenderArea(a *configpb.AreaConfig) ([]byte, error) {
	if a.GetId() == "" {
		return nil, fmt.Errorf("area: id required")
	}
	var buf bytes.Buffer
	w := &pklWriter{b: &buf}
	w.line(`amends "switchyard:area"`)
	w.line("")
	w.line("// Auto-generated by switchyardd regen — do not edit manually.")
	w.line("")
	w.line(fmt.Sprintf("id = %q", a.GetId()))
	w.line(fmt.Sprintf("displayName = %q", a.GetDisplayName()))
	if pid := a.GetParentId(); pid != "" {
		w.line(fmt.Sprintf("parentId = %q", pid))
	}
	return buf.Bytes(), nil
}
```

- [ ] **Step 5: Update `RenderScene` in `internal/automation/regen/scene.go`**

```go
package regen

import (
	"bytes"
	"fmt"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
)

func RenderScene(s *configpb.SceneConfig) ([]byte, error) {
	if s.GetId() == "" {
		return nil, fmt.Errorf("scene: id required")
	}
	var buf bytes.Buffer
	w := &pklWriter{b: &buf}
	w.line(`amends "switchyard:scene"`)
	w.line(`import "switchyard:automations" as auto`)
	w.line("")
	w.line("// Auto-generated by switchyardd regen — do not edit manually.")
	w.line("")
	w.line(fmt.Sprintf("id = %q", s.GetId()))
	w.line(fmt.Sprintf("displayName = %q", s.GetDisplayName()))
	w.line("actions {")
	for _, act := range s.GetActions() {
		renderAction(w, act, 0)
	}
	w.line("}")
	return buf.Bytes(), nil
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `go test ./internal/automation/regen -run "TestRenderArea|TestRenderScene" -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/automation/regen/area.go internal/automation/regen/scene.go internal/automation/regen/area_test.go internal/automation/regen/scene_test.go
git commit -m "feat(regen): emit amends form for areas and scenes"
```

---

## Task 6: Migrate `examples/automations/sunset-lights.pkl`

**Files:**
- Modify: `examples/automations/sunset-lights.pkl`

- [ ] **Step 1: Rewrite the file to new format**

Replace the entire file with:

```pkl
amends "switchyard:automation"
import "switchyard:automations" as auto

// Auto-generated by switchyardd regen — do not edit manually.

id = "sunset-lights"
enabled = true

triggers {
  new auto.EventTrigger {
    kind = "sun.sunset"
  }
}

conditions {
  new auto.StateCondition {
    entity = "light.living_room_ceiling"
    not = "on"
  }
}

actions {
  new auto.CallServiceAction {
    entity = "light.living_room_ceiling"
    capability = "set_brightness"
    args {
      ["level"] = "40"
    }
  }
  new auto.CallServiceAction {
    entity = "notify.phone"
    capability = "notify"
    args {
      ["message"] = "Sunset lights activated"
    }
  }
}

onFailure = new auto.IgnoreStrategy {}
```

- [ ] **Step 2: Verify the file parses standalone**

Run:

```bash
go test ./internal/config -run TestTemplate_AutomationAmends -v
```

Then a smoke check with an ad-hoc script (no commit needed):

```bash
go run -mod=mod ./cmd/switchyardd-validate examples/automations/sunset-lights.pkl 2>/dev/null || echo "(skip: no standalone validator binary)"
```

If no validator binary exists, skip the smoke check — Task 11's integration test will exercise this file.

- [ ] **Step 3: Commit**

```bash
git add examples/automations/sunset-lights.pkl
git commit -m "chore(examples): migrate sunset-lights.pkl to amends form"
```

---

## Task 7: Extract decode helpers and add `automationFromJSON`/`areaFromJSON`/`sceneFromJSON`

Discovery will need to convert a single `automationJSON`/`areaJSON`/`sceneJSON` (parsed from a single file's output) into the proto type. Today the inline loop does this directly in `parseConfigJSON`. Extract helpers so both inline and discovery can call them.

**Files:**
- Create: `internal/config/evaluator_decode.go` (new file, helpers grouped here)
- Modify: `internal/config/evaluator.go` (inline loops use helpers)

- [ ] **Step 1: Write failing tests**

Add to `internal/config/evaluator_test.go`:

```go
func TestAutomationFromJSON_BuildsProto(t *testing.T) {
	a := automationJSON{
		ID:      "test",
		Enabled: true,
		Mode:    "single",
		Triggers: []json.RawMessage{
			json.RawMessage(`{"_type":"switchyard.automations#EventTrigger","kind":"sun.sunset"}`),
		},
		Actions: []json.RawMessage{
			json.RawMessage(`{"_type":"switchyard.automations#CallServiceAction","entity":"light.x","capability":"turn_on","args":{}}`),
		},
	}
	got, err := automationFromJSON(a)
	if err != nil {
		t.Fatalf("automationFromJSON: %v", err)
	}
	if got.GetId() != "test" {
		t.Errorf("id = %q, want test", got.GetId())
	}
	if len(got.GetTriggers()) != 1 || got.GetTriggers()[0].GetEvent() == nil {
		t.Errorf("trigger not decoded: %+v", got.GetTriggers())
	}
}

func TestAreaFromJSON_BuildsProto(t *testing.T) {
	pid := "parent"
	a := areaJSON{ID: "kitchen", DisplayName: "Kitchen", ParentID: &pid}
	got := areaFromJSON(a)
	if got.GetId() != "kitchen" || got.GetParentId() != "parent" {
		t.Errorf("got %+v", got)
	}
}

func TestSceneFromJSON_BuildsProto(t *testing.T) {
	s := sceneJSON{
		ID:          "movie",
		DisplayName: "Movie",
		Actions: []json.RawMessage{
			json.RawMessage(`{"_type":"switchyard.automations#CallServiceAction","entity":"light.x","capability":"turn_off","args":{}}`),
		},
	}
	got, err := sceneFromJSON(s)
	if err != nil {
		t.Fatalf("sceneFromJSON: %v", err)
	}
	if got.GetId() != "movie" || len(got.GetActions()) != 1 {
		t.Errorf("got %+v", got)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/config -run "TestAutomationFromJSON|TestAreaFromJSON|TestSceneFromJSON" -v`
Expected: FAIL — helpers don't exist.

- [ ] **Step 3: Create `internal/config/evaluator_decode.go`**

```go
package config

import (
	"fmt"
	"strings"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
)

func automationFromJSON(a automationJSON) (*configpb.AutomationConfig, error) {
	acfg := &configpb.AutomationConfig{
		Id:        strings.TrimSpace(a.ID),
		Enabled:   a.Enabled,
		Mode:      parseAutomationMode(a.Mode),
		MaxQueued: a.MaxQueued,
		Areas:     append([]string(nil), a.Areas...),
	}
	for _, rawT := range a.Triggers {
		tc, err := decodeTrigger(rawT)
		if err != nil {
			return nil, fmt.Errorf("trigger: %w", err)
		}
		acfg.Triggers = append(acfg.Triggers, tc)
	}
	for _, rawC := range a.Conditions {
		cc, err := decodeCondition(rawC)
		if err != nil {
			return nil, fmt.Errorf("condition: %w", err)
		}
		acfg.Conditions = append(acfg.Conditions, cc)
	}
	for _, rawA := range a.Actions {
		ac, err := decodeAction(rawA)
		if err != nil {
			return nil, fmt.Errorf("action: %w", err)
		}
		acfg.Actions = append(acfg.Actions, ac)
	}
	return acfg, nil
}

func areaFromJSON(a areaJSON) *configpb.AreaConfig {
	parent := ""
	if a.ParentID != nil {
		parent = *a.ParentID
	}
	return &configpb.AreaConfig{
		Id:          strings.TrimSpace(a.ID),
		DisplayName: a.DisplayName,
		ParentId:    parent,
	}
}

func sceneFromJSON(s sceneJSON) (*configpb.SceneConfig, error) {
	scfg := &configpb.SceneConfig{
		Id:          strings.TrimSpace(s.ID),
		DisplayName: s.DisplayName,
	}
	for _, rawA := range s.Actions {
		ac, err := decodeAction(rawA)
		if err != nil {
			return nil, fmt.Errorf("action: %w", err)
		}
		scfg.Actions = append(scfg.Actions, ac)
	}
	return scfg, nil
}
```

- [ ] **Step 4: Replace inline loops in `parseConfigJSON` with helper calls**

In `internal/config/evaluator.go`, replace the area loop (around line 401-411) with:

```go
for _, a := range raw.Areas {
	snap.Areas = append(snap.Areas, areaFromJSON(a))
}
```

Replace the automations loop (around line 449-479) with:

```go
for _, a := range raw.Automations {
	acfg, err := automationFromJSON(a)
	if err != nil {
		return nil, fmt.Errorf("automation %q: %w", a.ID, err)
	}
	snap.Automations = append(snap.Automations, acfg)
}
```

Replace the scenes loop (added in Task 1) with:

```go
for _, s := range raw.Scenes {
	scfg, err := sceneFromJSON(s)
	if err != nil {
		return nil, fmt.Errorf("scene %q: %w", s.ID, err)
	}
	snap.Scenes = append(snap.Scenes, scfg)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `go test ./internal/config -count=1`
Expected: PASS (new helpers pass; existing inline tests still pass since behavior is unchanged).

- [ ] **Step 6: Commit**

```bash
git add internal/config/evaluator_decode.go internal/config/evaluator.go internal/config/evaluator_test.go
git commit -m "refactor(config): extract automation/area/scene JSON-to-proto helpers"
```

---

## Task 8: Implement `discoverConfigDir`

Walks the configDir for `automations/*.pkl`, `areas/*.pkl`, `scenes/*.pkl`, and `entity-areas.pkl`. Runs an independent `pkl.FileSource(path)` eval for each via the shared evaluator. Returns the parsed JSON results + a slice of per-file ValidationErrors. Missing directories/files are non-errors.

**Files:**
- Create: `internal/config/discovery.go`
- Create: `internal/config/discovery_test.go`
- Create: `internal/config/testdata/discovery/` fixtures (see step 1)

- [ ] **Step 1: Set up test fixtures**

Create the directory structure:

```
internal/config/testdata/discovery/happy/
  automations/morning.pkl
  automations/sunset.pkl
  areas/kitchen.pkl
  scenes/movie.pkl
  entity-areas.pkl
internal/config/testdata/discovery/missing-dirs/
  automations/only-one.pkl
internal/config/testdata/discovery/empty-dirs/
  automations/   (empty)
internal/config/testdata/discovery/bad-file/
  automations/good.pkl
  automations/bad.pkl
internal/config/testdata/discovery/non-pkl-files/
  automations/morning.pkl
  automations/README.md
```

Contents:

`testdata/discovery/happy/automations/morning.pkl`:

```pkl
amends "switchyard:automation"
import "switchyard:automations" as auto

id = "morning"
enabled = true
triggers {
  new auto.TimeTrigger { cron = "0 7 * * *" }
}
actions {
  new auto.CallServiceAction {
    entity = "light.bedroom"
    capability = "turn_on"
    args {}
  }
}
```

`testdata/discovery/happy/automations/sunset.pkl`:

```pkl
amends "switchyard:automation"
import "switchyard:automations" as auto

id = "sunset"
enabled = true
triggers {
  new auto.EventTrigger { kind = "sun.sunset" }
}
actions {
  new auto.CallServiceAction {
    entity = "light.living_room"
    capability = "turn_on"
    args {}
  }
}
```

`testdata/discovery/happy/areas/kitchen.pkl`:

```pkl
amends "switchyard:area"

id = "kitchen"
displayName = "Kitchen"
```

`testdata/discovery/happy/scenes/movie.pkl`:

```pkl
amends "switchyard:scene"
import "switchyard:automations" as auto

id = "movie"
displayName = "Movie Night"
actions {
  new auto.CallServiceAction {
    entity = "light.living_room"
    capability = "turn_off"
    args {}
  }
}
```

`testdata/discovery/happy/entity-areas.pkl`:

```pkl
amends "switchyard:entity-areas"

entityAreas {
  ["light.bedroom"] = "bedroom"
  ["light.living_room"] = "living-room"
}
```

`testdata/discovery/missing-dirs/automations/only-one.pkl`:

```pkl
amends "switchyard:automation"
import "switchyard:automations" as auto

id = "only-one"
enabled = true
triggers {
  new auto.EventTrigger { kind = "sun.sunset" }
}
actions {}
```

`testdata/discovery/bad-file/automations/good.pkl`: same shape as `only-one.pkl` but `id = "good"`.

`testdata/discovery/bad-file/automations/bad.pkl`:

```pkl
amends "switchyard:automation"

id = unterminated_string_literal
```

(Intentionally invalid Pkl.)

`testdata/discovery/non-pkl-files/automations/morning.pkl`: same shape as `only-one.pkl`, `id = "morning"`.

`testdata/discovery/non-pkl-files/automations/README.md`: any text.

Create the empty-dirs `automations/` directory with a `.gitkeep` (`testdata/discovery/empty-dirs/automations/.gitkeep`) so it persists in git.

- [ ] **Step 2: Write the failing tests**

Create `internal/config/discovery_test.go`:

```go
package config

import (
	"context"
	"path/filepath"
	"testing"
)

func newDiscoveryEvaluator(t *testing.T) *pklEvaluator {
	t.Helper()
	ev, err := newPklEvaluator(context.Background(), "")
	if err != nil {
		t.Fatalf("evaluator: %v", err)
	}
	t.Cleanup(func() { _ = ev.ev.Close() })
	return ev
}

func TestDiscoverConfigDir_HappyPath(t *testing.T) {
	ev := newDiscoveryEvaluator(t)
	got, errs := discoverConfigDir(context.Background(), ev, "testdata/discovery/happy")
	if len(errs) != 0 {
		t.Fatalf("unexpected errors: %+v", errs)
	}
	if len(got.Automations) != 2 {
		t.Errorf("automations: want 2, got %d", len(got.Automations))
	}
	if len(got.Areas) != 1 {
		t.Errorf("areas: want 1, got %d", len(got.Areas))
	}
	if len(got.Scenes) != 1 {
		t.Errorf("scenes: want 1, got %d", len(got.Scenes))
	}
	if len(got.EntityAreas) != 2 {
		t.Errorf("entityAreas: want 2, got %d", len(got.EntityAreas))
	}
}

func TestDiscoverConfigDir_MissingDirsAreFine(t *testing.T) {
	ev := newDiscoveryEvaluator(t)
	got, errs := discoverConfigDir(context.Background(), ev, "testdata/discovery/missing-dirs")
	if len(errs) != 0 {
		t.Fatalf("unexpected errors: %+v", errs)
	}
	if len(got.Automations) != 1 {
		t.Errorf("automations: want 1, got %d", len(got.Automations))
	}
	if len(got.Areas) != 0 || len(got.Scenes) != 0 || len(got.EntityAreas) != 0 {
		t.Errorf("expected empty areas/scenes/entityAreas, got %+v", got)
	}
}

func TestDiscoverConfigDir_EmptyDirsAreFine(t *testing.T) {
	ev := newDiscoveryEvaluator(t)
	got, errs := discoverConfigDir(context.Background(), ev, "testdata/discovery/empty-dirs")
	if len(errs) != 0 {
		t.Fatalf("unexpected errors: %+v", errs)
	}
	if len(got.Automations) != 0 {
		t.Errorf("want empty, got %d automations", len(got.Automations))
	}
}

func TestDiscoverConfigDir_NonPklFilesIgnored(t *testing.T) {
	ev := newDiscoveryEvaluator(t)
	got, errs := discoverConfigDir(context.Background(), ev, "testdata/discovery/non-pkl-files")
	if len(errs) != 0 {
		t.Fatalf("unexpected errors: %+v", errs)
	}
	if len(got.Automations) != 1 || got.Automations[0].Path != filepath.Join("automations", "morning.pkl") {
		t.Errorf("got %+v", got.Automations)
	}
}

func TestDiscoverConfigDir_BadFileSurfacesValidationError(t *testing.T) {
	ev := newDiscoveryEvaluator(t)
	got, errs := discoverConfigDir(context.Background(), ev, "testdata/discovery/bad-file")
	if len(got.Automations) != 1 || got.Automations[0].Config.GetId() != "good" {
		t.Errorf("expected the good automation to survive, got %+v", got.Automations)
	}
	if len(errs) != 1 {
		t.Fatalf("want 1 validation error, got %d: %+v", len(errs), errs)
	}
	if errs[0].Code != "pkl_eval" {
		t.Errorf("code = %q, want pkl_eval", errs[0].Code)
	}
	if errs[0].File != filepath.Join("automations", "bad.pkl") {
		t.Errorf("file = %q", errs[0].File)
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `go test ./internal/config -run TestDiscoverConfigDir -v`
Expected: FAIL — `discoverConfigDir` does not exist.

- [ ] **Step 4: Create `internal/config/discovery.go`**

```go
package config

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"

	"github.com/apple/pkl-go/pkl"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
)

// discoveredAutomation pairs a discovered AutomationConfig with the source
// file (relative to configDir) so merge-time errors can attribute back to
// the originating file.
type discoveredAutomation struct {
	Path   string
	Config *configpb.AutomationConfig
}

type discoveredArea struct {
	Path   string
	Config *configpb.AreaConfig
}

type discoveredScene struct {
	Path   string
	Config *configpb.SceneConfig
}

type discoveryResult struct {
	Automations []discoveredAutomation
	Areas       []discoveredArea
	Scenes      []discoveredScene
	EntityAreas map[string]string
}

// discoverConfigDir walks <configDir>/{automations,areas,scenes}/*.pkl and
// <configDir>/entity-areas.pkl, evaluates each via the shared Pkl evaluator,
// and decodes the JSON results into proto types. Per-file errors (missing
// directory, Pkl eval failure, JSON decode failure) are returned as
// ValidationErrors with File set relative to configDir; the corresponding
// file is dropped from the result. Missing directories produce no error.
func discoverConfigDir(ctx context.Context, ev *pklEvaluator, configDir string) (discoveryResult, []ValidationError) {
	var (
		mu     sync.Mutex
		result = discoveryResult{EntityAreas: map[string]string{}}
		errs   []ValidationError
	)

	maxWorkers := 8
	sem := make(chan struct{}, maxWorkers)
	var wg sync.WaitGroup

	addErr := func(e ValidationError) {
		mu.Lock()
		errs = append(errs, e)
		mu.Unlock()
	}

	type job struct {
		relPath string
		absPath string
		kind    string // "automation" | "area" | "scene"
	}

	jobs := collectJobs(configDir, &result, addErr)

	for _, j := range jobs {
		j := j
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			runJob(ctx, ev, configDir, j, &mu, &result, addErr)
		}()
	}

	// entity-areas.pkl is a singleton — run inline (no parallelism needed).
	loadEntityAreas(ctx, ev, configDir, &result, addErr)

	wg.Wait()

	// Deterministic ordering: sort each kind by id.
	sort.Slice(result.Automations, func(i, j int) bool {
		return result.Automations[i].Config.GetId() < result.Automations[j].Config.GetId()
	})
	sort.Slice(result.Areas, func(i, j int) bool {
		return result.Areas[i].Config.GetId() < result.Areas[j].Config.GetId()
	})
	sort.Slice(result.Scenes, func(i, j int) bool {
		return result.Scenes[i].Config.GetId() < result.Scenes[j].Config.GetId()
	})

	return result, errs
}

type discoveryJob struct {
	relPath string
	absPath string
	kind    string
}

func collectJobs(configDir string, result *discoveryResult, addErr func(ValidationError)) []discoveryJob {
	kinds := []struct {
		dir  string
		kind string
	}{
		{"automations", "automation"},
		{"areas", "area"},
		{"scenes", "scene"},
	}

	var jobs []discoveryJob
	for _, k := range kinds {
		absDir := filepath.Join(configDir, k.dir)
		entries, err := os.ReadDir(absDir)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				continue
			}
			addErr(ValidationError{
				Code:    "discovery_read_dir",
				File:    k.dir,
				Message: err.Error(),
			})
			continue
		}
		for _, ent := range entries {
			if ent.IsDir() || !strings.HasSuffix(ent.Name(), ".pkl") {
				continue
			}
			jobs = append(jobs, discoveryJob{
				relPath: filepath.Join(k.dir, ent.Name()),
				absPath: filepath.Join(absDir, ent.Name()),
				kind:    k.kind,
			})
		}
	}
	return jobs
}

var pklErrLineRE = regexp.MustCompile(`(?m)^\s*at line (\d+)`)

func pklErrorLine(msg string) int {
	m := pklErrLineRE.FindStringSubmatch(msg)
	if len(m) < 2 {
		return 0
	}
	var n int
	fmt.Sscanf(m[1], "%d", &n)
	return n
}

func runJob(ctx context.Context, ev *pklEvaluator, configDir string, j discoveryJob, mu *sync.Mutex, result *discoveryResult, addErr func(ValidationError)) {
	text, err := ev.ev.EvaluateOutputText(ctx, pkl.FileSource(j.absPath))
	if err != nil {
		addErr(ValidationError{
			Code:    "pkl_eval",
			File:    j.relPath,
			Line:    pklErrorLine(err.Error()),
			Message: err.Error(),
		})
		return
	}

	switch j.kind {
	case "automation":
		var aj automationJSON
		if err := json.Unmarshal([]byte(text), &aj); err != nil {
			addErr(ValidationError{Code: "json_decode", File: j.relPath, Message: err.Error()})
			return
		}
		cfg, err := automationFromJSON(aj)
		if err != nil {
			addErr(ValidationError{Code: "decode", File: j.relPath, Message: err.Error()})
			return
		}
		mu.Lock()
		result.Automations = append(result.Automations, discoveredAutomation{Path: j.relPath, Config: cfg})
		mu.Unlock()
	case "area":
		var aj areaJSON
		if err := json.Unmarshal([]byte(text), &aj); err != nil {
			addErr(ValidationError{Code: "json_decode", File: j.relPath, Message: err.Error()})
			return
		}
		cfg := areaFromJSON(aj)
		mu.Lock()
		result.Areas = append(result.Areas, discoveredArea{Path: j.relPath, Config: cfg})
		mu.Unlock()
	case "scene":
		var sj sceneJSON
		if err := json.Unmarshal([]byte(text), &sj); err != nil {
			addErr(ValidationError{Code: "json_decode", File: j.relPath, Message: err.Error()})
			return
		}
		cfg, err := sceneFromJSON(sj)
		if err != nil {
			addErr(ValidationError{Code: "decode", File: j.relPath, Message: err.Error()})
			return
		}
		mu.Lock()
		result.Scenes = append(result.Scenes, discoveredScene{Path: j.relPath, Config: cfg})
		mu.Unlock()
	}
}

func loadEntityAreas(ctx context.Context, ev *pklEvaluator, configDir string, result *discoveryResult, addErr func(ValidationError)) {
	path := filepath.Join(configDir, "entity-areas.pkl")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return
		}
		addErr(ValidationError{Code: "discovery_stat", File: "entity-areas.pkl", Message: err.Error()})
		return
	}
	text, err := ev.ev.EvaluateOutputText(ctx, pkl.FileSource(path))
	if err != nil {
		addErr(ValidationError{
			Code:    "pkl_eval",
			File:    "entity-areas.pkl",
			Line:    pklErrorLine(err.Error()),
			Message: err.Error(),
		})
		return
	}
	var raw struct {
		EntityAreas map[string]string `json:"entityAreas"`
	}
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		addErr(ValidationError{Code: "json_decode", File: "entity-areas.pkl", Message: err.Error()})
		return
	}
	for k, v := range raw.EntityAreas {
		result.EntityAreas[k] = v
	}
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `go test ./internal/config -run TestDiscoverConfigDir -v`
Expected: PASS — all five discovery test cases.

- [ ] **Step 6: Commit**

```bash
git add internal/config/discovery.go internal/config/discovery_test.go internal/config/testdata/discovery
git commit -m "feat(config): add discoverConfigDir for per-file Pkl modules"
```

---

## Task 9: Implement `mergeDiscovered`

Takes the snapshot from `main.pkl` eval + the discovery result. Enforces duplicate-id (hard error) and filename-id-mismatch (soft, file dropped). Returns merged snapshot, soft errors, and a hard error if any duplicates were found.

**Files:**
- Create: `internal/config/merge.go`
- Create: `internal/config/merge_test.go`

- [ ] **Step 1: Write failing tests**

Create `internal/config/merge_test.go`:

```go
package config

import (
	"strings"
	"testing"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
)

func TestMergeDiscovered_AppendsNonOverlapping(t *testing.T) {
	snap := &configpb.ConfigSnapshot{
		Automations: []*configpb.AutomationConfig{{Id: "inline-one"}},
	}
	disc := discoveryResult{
		Automations: []discoveredAutomation{
			{Path: "automations/disk-one.pkl", Config: &configpb.AutomationConfig{Id: "disk-one"}},
		},
	}
	merged, errs, err := mergeDiscovered(snap, disc)
	if err != nil {
		t.Fatalf("unexpected hard error: %v", err)
	}
	if len(errs) != 0 {
		t.Errorf("unexpected soft errors: %+v", errs)
	}
	if len(merged.Automations) != 2 {
		t.Fatalf("want 2 automations, got %d", len(merged.Automations))
	}
	// Inline first, then discovered.
	if merged.Automations[0].GetId() != "inline-one" || merged.Automations[1].GetId() != "disk-one" {
		t.Errorf("order wrong: %+v", merged.Automations)
	}
}

func TestMergeDiscovered_DuplicateIdIsHardError(t *testing.T) {
	snap := &configpb.ConfigSnapshot{
		Automations: []*configpb.AutomationConfig{{Id: "dup"}},
	}
	disc := discoveryResult{
		Automations: []discoveredAutomation{
			{Path: "automations/dup.pkl", Config: &configpb.AutomationConfig{Id: "dup"}},
		},
	}
	_, errs, err := mergeDiscovered(snap, disc)
	if err == nil {
		t.Fatal("expected hard error for duplicate id")
	}
	if len(errs) != 1 || errs[0].Code != "duplicate_id" {
		t.Errorf("want one duplicate_id soft error too, got %+v", errs)
	}
	if !strings.Contains(errs[0].Message, "dup") {
		t.Errorf("message should mention 'dup': %s", errs[0].Message)
	}
}

func TestMergeDiscovered_FilenameMismatchIsSoftDrop(t *testing.T) {
	snap := &configpb.ConfigSnapshot{}
	disc := discoveryResult{
		Automations: []discoveredAutomation{
			{Path: "automations/expected-name.pkl", Config: &configpb.AutomationConfig{Id: "actual-id"}},
		},
	}
	merged, errs, err := mergeDiscovered(snap, disc)
	if err != nil {
		t.Fatalf("unexpected hard error: %v", err)
	}
	if len(merged.Automations) != 0 {
		t.Errorf("want file dropped, got %d", len(merged.Automations))
	}
	if len(errs) != 1 || errs[0].Code != "filename_id_mismatch" {
		t.Errorf("want filename_id_mismatch, got %+v", errs)
	}
}

func TestMergeDiscovered_EntityAreasDuplicateKeyIsHardError(t *testing.T) {
	snap := &configpb.ConfigSnapshot{
		EntityAreas: map[string]string{"light.x": "living-room"},
	}
	disc := discoveryResult{
		EntityAreas: map[string]string{"light.x": "kitchen"},
	}
	_, errs, err := mergeDiscovered(snap, disc)
	if err == nil {
		t.Fatal("expected hard error for duplicate entity-area key")
	}
	if len(errs) != 1 || errs[0].Code != "duplicate_entity_area" {
		t.Errorf("want duplicate_entity_area, got %+v", errs)
	}
}

func TestMergeDiscovered_AreaAndSceneSamePath(t *testing.T) {
	snap := &configpb.ConfigSnapshot{
		Areas:  []*configpb.AreaConfig{{Id: "inline-area"}},
		Scenes: []*configpb.SceneConfig{{Id: "inline-scene"}},
	}
	disc := discoveryResult{
		Areas:  []discoveredArea{{Path: "areas/disk-area.pkl", Config: &configpb.AreaConfig{Id: "disk-area"}}},
		Scenes: []discoveredScene{{Path: "scenes/disk-scene.pkl", Config: &configpb.SceneConfig{Id: "disk-scene"}}},
	}
	merged, errs, err := mergeDiscovered(snap, disc)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if len(errs) != 0 {
		t.Errorf("soft errs: %+v", errs)
	}
	if len(merged.Areas) != 2 || len(merged.Scenes) != 2 {
		t.Errorf("got %d areas %d scenes", len(merged.Areas), len(merged.Scenes))
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/config -run TestMergeDiscovered -v`
Expected: FAIL — `mergeDiscovered` does not exist.

- [ ] **Step 3: Create `internal/config/merge.go`**

```go
package config

import (
	"fmt"
	"path/filepath"
	"strings"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
)

// mergeDiscovered folds discovered per-file configs into snap. Returns the
// merged snapshot, a slice of non-fatal ValidationErrors, and a non-nil
// error iff any duplicate-id conflicts were detected. On hard error, the
// returned snapshot is the partial merge — callers should treat it as
// untrustworthy.
func mergeDiscovered(snap *configpb.ConfigSnapshot, disc discoveryResult) (*configpb.ConfigSnapshot, []ValidationError, error) {
	var errs []ValidationError
	hardErr := false

	// Automations
	inlineAutos := map[string]bool{}
	for _, a := range snap.GetAutomations() {
		inlineAutos[a.GetId()] = true
	}
	for _, d := range disc.Automations {
		expectedID := strings.TrimSuffix(filepath.Base(d.Path), ".pkl")
		if d.Config.GetId() != expectedID {
			errs = append(errs, ValidationError{
				Code:    "filename_id_mismatch",
				File:    d.Path,
				Field:   fmt.Sprintf("automations[%s]", d.Config.GetId()),
				Message: fmt.Sprintf("filename %q does not match id %q", expectedID, d.Config.GetId()),
			})
			continue
		}
		if inlineAutos[d.Config.GetId()] {
			errs = append(errs, ValidationError{
				Code:    "duplicate_id",
				File:    d.Path,
				Field:   fmt.Sprintf("automations[%s]", d.Config.GetId()),
				Message: fmt.Sprintf("id %q is already declared inline in main.pkl", d.Config.GetId()),
			})
			hardErr = true
			continue
		}
		snap.Automations = append(snap.Automations, d.Config)
	}

	// Areas
	inlineAreas := map[string]bool{}
	for _, a := range snap.GetAreas() {
		inlineAreas[a.GetId()] = true
	}
	for _, d := range disc.Areas {
		expectedID := strings.TrimSuffix(filepath.Base(d.Path), ".pkl")
		if d.Config.GetId() != expectedID {
			errs = append(errs, ValidationError{
				Code:    "filename_id_mismatch",
				File:    d.Path,
				Field:   fmt.Sprintf("areas[%s]", d.Config.GetId()),
				Message: fmt.Sprintf("filename %q does not match id %q", expectedID, d.Config.GetId()),
			})
			continue
		}
		if inlineAreas[d.Config.GetId()] {
			errs = append(errs, ValidationError{
				Code:    "duplicate_id",
				File:    d.Path,
				Field:   fmt.Sprintf("areas[%s]", d.Config.GetId()),
				Message: fmt.Sprintf("id %q is already declared inline in main.pkl", d.Config.GetId()),
			})
			hardErr = true
			continue
		}
		snap.Areas = append(snap.Areas, d.Config)
	}

	// Scenes
	inlineScenes := map[string]bool{}
	for _, s := range snap.GetScenes() {
		inlineScenes[s.GetId()] = true
	}
	for _, d := range disc.Scenes {
		expectedID := strings.TrimSuffix(filepath.Base(d.Path), ".pkl")
		if d.Config.GetId() != expectedID {
			errs = append(errs, ValidationError{
				Code:    "filename_id_mismatch",
				File:    d.Path,
				Field:   fmt.Sprintf("scenes[%s]", d.Config.GetId()),
				Message: fmt.Sprintf("filename %q does not match id %q", expectedID, d.Config.GetId()),
			})
			continue
		}
		if inlineScenes[d.Config.GetId()] {
			errs = append(errs, ValidationError{
				Code:    "duplicate_id",
				File:    d.Path,
				Field:   fmt.Sprintf("scenes[%s]", d.Config.GetId()),
				Message: fmt.Sprintf("id %q is already declared inline in main.pkl", d.Config.GetId()),
			})
			hardErr = true
			continue
		}
		snap.Scenes = append(snap.Scenes, d.Config)
	}

	// EntityAreas
	if snap.EntityAreas == nil && len(disc.EntityAreas) > 0 {
		snap.EntityAreas = make(map[string]string, len(disc.EntityAreas))
	}
	for k, v := range disc.EntityAreas {
		if existing, ok := snap.EntityAreas[k]; ok && existing != v {
			errs = append(errs, ValidationError{
				Code:    "duplicate_entity_area",
				File:    "entity-areas.pkl",
				Field:   fmt.Sprintf("entityAreas[%s]", k),
				Message: fmt.Sprintf("key %q is already mapped to %q inline; file maps it to %q", k, existing, v),
			})
			hardErr = true
			continue
		}
		snap.EntityAreas[k] = v
	}

	if hardErr {
		return snap, errs, fmt.Errorf("config merge failed: duplicate id(s) — see validation errors")
	}
	return snap, errs, nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/config -run TestMergeDiscovered -v`
Expected: PASS, all five test cases.

- [ ] **Step 5: Commit**

```bash
git add internal/config/merge.go internal/config/merge_test.go
git commit -m "feat(config): merge discovered configs with duplicate-id enforcement"
```

---

## Task 10: Wire discovery + merge into `Evaluate`, update callers

Changes `Evaluate` signature from `(*ConfigSnapshot, error)` to `(*ConfigSnapshot, []ValidationError, error)`. Updates `manager.go` and `ValidateOffline`.

**Files:**
- Modify: `internal/config/evaluator.go:124-131` (Evaluate)
- Modify: `internal/config/evaluator.go:635` (ValidateOffline)
- Modify: `internal/config/manager.go:112` (Validate)

- [ ] **Step 1: Write a failing integration test**

Add to `internal/config/evaluator_test.go` (or new `evaluator_discovery_test.go` if cleaner):

```go
func TestEvaluate_WithDiscoveryHappyPath(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "main.pkl"), minimalMainPkl())
	if err := os.MkdirAll(filepath.Join(dir, "automations"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(dir, "automations", "discovered.pkl"), `
amends "switchyard:automation"
import "switchyard:automations" as auto

id = "discovered"
enabled = true
triggers {
  new auto.EventTrigger { kind = "sun.sunset" }
}
actions {
  new auto.CallServiceAction { entity = "light.x"; capability = "turn_on"; args {} }
}
`)

	ev, err := newPklEvaluator(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ev.ev.Close() }()

	snap, validationErrs, err := ev.Evaluate(context.Background(), dir)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if len(validationErrs) != 0 {
		t.Errorf("unexpected validation errors: %+v", validationErrs)
	}
	found := false
	for _, a := range snap.GetAutomations() {
		if a.GetId() == "discovered" {
			found = true
		}
	}
	if !found {
		t.Errorf("discovered automation missing from snapshot")
	}
}

// minimalMainPkl returns a valid main.pkl with empty top-level lists.
func minimalMainPkl() string {
	return `
module switchyard.config

import "switchyard:entities" as ent
import "switchyard:automations" as auto
import "switchyard:scripts" as scr
import "switchyard:dashboards" as dash
import "switchyard:auth" as authmod
import "switchyard:mcp" as mcpmod
import "switchyard:scenes" as sc
import "switchyard:carport" as cp

entities: Listing<ent.Entity> = new {}
driverInstances: Listing<cp.DriverInstance> = new {}
automations: Listing<auto.Automation> = new {}
scripts: Listing<scr.Script> = new {}
scenes: Listing<sc.Scene> = new {}
dashboards: Listing<dash.Dashboard> = new {}
users: Listing<authmod.User> = new {}
roles: Listing<authmod.Role> = new {}
policies: Listing<authmod.Policy> = new {}
mcp: mcpmod.MCPConfig = new mcpmod.MCPConfig {}
listener = new { uds = new {}; tcp = new {}; webhooks = new {}; streamHeartbeatInterval = 30.s }

output { renderer = new JsonRenderer { converters { [Duration] = (it) -> "\(it.value).\(it.unit)" } } }
`
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/config -run TestEvaluate_WithDiscoveryHappyPath -v`
Expected: FAIL — `Evaluate` returns only `(*ConfigSnapshot, error)`, signature mismatch.

- [ ] **Step 3: Update `Evaluate` in `internal/config/evaluator.go`**

Replace the existing `Evaluate` method (lines 124-131):

```go
func (e *pklEvaluator) Evaluate(ctx context.Context, configDir string) (*configpb.ConfigSnapshot, []ValidationError, error) {
	mainPath := configDir + "/main.pkl"
	text, err := e.ev.EvaluateOutputText(ctx, pkl.FileSource(mainPath))
	if err != nil {
		return nil, nil, &EvalError{Message: err.Error()}
	}
	snap, err := parseConfigJSON(text, configDir)
	if err != nil {
		return nil, nil, err
	}
	disc, discErrs := discoverConfigDir(ctx, e, configDir)
	merged, mergeErrs, mergeErr := mergeDiscovered(snap, disc)
	allErrs := append(discErrs, mergeErrs...)
	if mergeErr != nil {
		return merged, allErrs, mergeErr
	}
	return merged, allErrs, nil
}
```

Update `configEvaluator` interface (around line 46) to match:

```go
type configEvaluator interface {
	Evaluate(ctx context.Context, configDir string) (*configpb.ConfigSnapshot, []ValidationError, error)
}
```

- [ ] **Step 4: Update `ValidateOffline` in `internal/config/evaluator.go:628-641`**

```go
func ValidateOffline(ctx context.Context, configDir, driversRoot string) (*configpb.ConfigSnapshot, []ValidationError, error) {
	ev, err := newPklEvaluator(ctx, driversRoot)
	if err != nil {
		return nil, nil, err
	}
	defer func() { _ = ev.ev.Close() }()

	snap, discErrs, err := ev.Evaluate(ctx, configDir)
	if err != nil {
		// Even on hard error, propagate any soft errors we collected
		// so callers can surface partial diagnostics.
		return nil, discErrs, err
	}
	compileErrs := Compile(snap, nil)
	return snap, append(discErrs, compileErrs...), nil
}
```

- [ ] **Step 5: Update `Manager.Validate` in `internal/config/manager.go`**

Find the call site at line 112 (`snap, err := m.ev.Evaluate(ctx, m.configDir)`) and update:

```go
snap, discErrs, err := m.ev.Evaluate(ctx, m.configDir)
if err != nil {
	return nil, nil, err
}
if errs := Compile(snap, nil); len(errs) != 0 {
	return nil, nil, &compileErrors{errs: append(discErrs, errs...)}
}
// discErrs that are not hard errors (we already returned on err above)
// are still informational; for now we log via the existing error path
// only if Compile produced any. If Compile is clean, drop the discErrs
// for parity with prior behavior — they'll surface via ValidateOffline.
_ = discErrs
```

(The `_ = discErrs` is intentional for v1: surfacing soft warnings through `Manager.Validate` requires plumbing they don't have today. The hard-error path is the critical contract. A future follow-up can route soft warnings into a structured log channel.)

- [ ] **Step 6: Update other Evaluate callers and tests**

Run: `go build ./...`

Address each compile error. Common patterns:
- Tests that call `ev.Evaluate(ctx, dir)` and expect `(snap, err)` — change to `(snap, _, err)`.
- Mock evaluators implementing `configEvaluator` — update their signature.

Search for callers:

```bash
grep -rn "\.Evaluate(ctx" internal/ --include="*.go"
```

Fix each.

- [ ] **Step 7: Run the integration test + the broader suite**

Run:

```bash
go test ./internal/config -run TestEvaluate_WithDiscoveryHappyPath -v
go test ./internal/config -count=1
go test ./internal/... -count=1
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add internal/config/evaluator.go internal/config/manager.go internal/config/evaluator_test.go
# plus any test files updated for the new signature
git commit -m "feat(config): wire discovery+merge into Evaluate; signature now (snap, []ValidationError, error)"
```

---

## Task 11: Integration tests for discovery + merge resilience

Two integration tests against real Pkl evaluator:
1. Broken file in `automations/` doesn't take down the rest.
2. Duplicate id (inline + file) is a hard error.

**Files:**
- Modify: `internal/config/evaluator_test.go` (or new `evaluator_discovery_integration_test.go`)
- Reuse: `testdata/discovery/bad-file/` (already created in Task 8)

- [ ] **Step 1: Write the failing tests**

Add to `internal/config/evaluator_test.go`:

```go
func TestEvaluate_BrokenDiscoveryFileIsSoft(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "main.pkl"), minimalMainPkl())
	if err := os.MkdirAll(filepath.Join(dir, "automations"), 0o755); err != nil {
		t.Fatal(err)
	}
	// Good automation
	writeFile(t, filepath.Join(dir, "automations", "good.pkl"), `
amends "switchyard:automation"
import "switchyard:automations" as auto

id = "good"
enabled = true
triggers {
  new auto.EventTrigger { kind = "sun.sunset" }
}
actions {}
`)
	// Intentionally broken Pkl
	writeFile(t, filepath.Join(dir, "automations", "bad.pkl"), `
amends "switchyard:automation"
id = unterminated_token
`)

	ev, err := newPklEvaluator(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ev.ev.Close() }()

	snap, validationErrs, err := ev.Evaluate(context.Background(), dir)
	if err != nil {
		t.Fatalf("Evaluate should not hard-fail on a single bad file: %v", err)
	}

	foundGood := false
	for _, a := range snap.GetAutomations() {
		if a.GetId() == "good" {
			foundGood = true
		}
	}
	if !foundGood {
		t.Error("expected 'good' automation to be loaded despite bad sibling")
	}

	if len(validationErrs) < 1 {
		t.Fatalf("expected at least 1 validation error for bad.pkl, got %+v", validationErrs)
	}
	badErr := validationErrs[0]
	if badErr.Code != "pkl_eval" {
		t.Errorf("err code = %q, want pkl_eval", badErr.Code)
	}
	if badErr.File != filepath.Join("automations", "bad.pkl") {
		t.Errorf("err file = %q", badErr.File)
	}
}

func TestEvaluate_DuplicateIdIsHardError(t *testing.T) {
	dir := t.TempDir()
	// main.pkl declares inline automation with id="dup"
	writeFile(t, filepath.Join(dir, "main.pkl"), `
module switchyard.config

import "switchyard:entities" as ent
import "switchyard:automations" as auto
import "switchyard:scripts" as scr
import "switchyard:dashboards" as dash
import "switchyard:auth" as authmod
import "switchyard:mcp" as mcpmod
import "switchyard:scenes" as sc
import "switchyard:carport" as cp

entities: Listing<ent.Entity> = new {}
driverInstances: Listing<cp.DriverInstance> = new {}
automations: Listing<auto.Automation> = new {
  new {
    id = "dup"
    enabled = true
    triggers { new auto.EventTrigger { kind = "sun.sunset" } }
    actions {}
  }
}
scripts: Listing<scr.Script> = new {}
scenes: Listing<sc.Scene> = new {}
dashboards: Listing<dash.Dashboard> = new {}
users: Listing<authmod.User> = new {}
roles: Listing<authmod.Role> = new {}
policies: Listing<authmod.Policy> = new {}
mcp: mcpmod.MCPConfig = new mcpmod.MCPConfig {}
listener = new { uds = new {}; tcp = new {}; webhooks = new {}; streamHeartbeatInterval = 30.s }

output { renderer = new JsonRenderer { converters { [Duration] = (it) -> "\(it.value).\(it.unit)" } } }
`)
	if err := os.MkdirAll(filepath.Join(dir, "automations"), 0o755); err != nil {
		t.Fatal(err)
	}
	// Disk file with same id
	writeFile(t, filepath.Join(dir, "automations", "dup.pkl"), `
amends "switchyard:automation"
import "switchyard:automations" as auto

id = "dup"
enabled = true
triggers {
  new auto.EventTrigger { kind = "sun.sunset" }
}
actions {}
`)

	ev, err := newPklEvaluator(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ev.ev.Close() }()

	_, validationErrs, err := ev.Evaluate(context.Background(), dir)
	if err == nil {
		t.Fatal("expected hard error for duplicate id")
	}
	found := false
	for _, e := range validationErrs {
		if e.Code == "duplicate_id" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected duplicate_id soft error alongside hard error, got %+v", validationErrs)
	}
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `go test ./internal/config -run "TestEvaluate_BrokenDiscoveryFileIsSoft|TestEvaluate_DuplicateIdIsHardError" -v`
Expected: PASS — the implementation from Tasks 8-10 already covers these. If a test fails, debug per `superpowers:systematic-debugging` (don't patch the test to fit a buggy implementation).

- [ ] **Step 3: Commit**

```bash
git add internal/config/evaluator_test.go
git commit -m "test(config): integration tests for discovery resilience + duplicate-id"
```

---

## Task 12: End-to-end loop-closure test through the daemon

Drives the original failing scenario: form-driven `OpenForEdit` → `CommitEdit` writes `automations/<id>.pkl`; daemon reload picks it up; live snapshot contains the automation.

**Files:**
- Create: `internal/daemon/autodiscovery_e2e_test.go`

This test depends on existing test helpers in the `internal/daemon` package. Read `internal/daemon` test files first to learn the helper conventions (e.g. `newTestDaemon`, `daemon.ReloadConfig` RPC name). The skeleton below assumes the conventions; adjust to match the package's actual idioms.

- [ ] **Step 1: Write the failing test**

Create `internal/daemon/autodiscovery_e2e_test.go`:

```go
package daemon

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/fdatoo/switchyard/internal/automation/regen"
	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
)

// TestAutoDiscovery_LoopClosure proves the originally-broken end-to-end:
// form writes automations/<id>.pkl, daemon reloads, live snapshot reflects it.
func TestAutoDiscovery_LoopClosure(t *testing.T) {
	// Use the package's existing test daemon helper. The exact name may
	// differ — check `internal/daemon/*_test.go` for the local convention.
	// We need a daemon with a writable configDir whose main.pkl declares
	// `automations: Listing<auto.Automation> = new {}`.
	td := newTestDaemonWithMinimalConfig(t)
	defer td.cleanup()

	// Build an AutomationConfig in memory and render it.
	ac := &configpb.AutomationConfig{
		Id:      "loop-test",
		Enabled: true,
		Triggers: []*configpb.TriggerConfig{
			{Kind: &configpb.TriggerConfig_Event{Event: &configpb.EventTrigger{Kind: "sun.sunset"}}},
		},
	}
	pklBytes, err := regen.Render(ac)
	if err != nil {
		t.Fatalf("regen.Render: %v", err)
	}

	// Write it directly to disk (bypassing EditSessionService for test
	// simplicity — EditSessionService is exercised in the editsession
	// package; here we focus on the discovery → snapshot loop).
	autoDir := filepath.Join(td.configDir, "automations")
	if err := os.MkdirAll(autoDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(autoDir, "loop-test.pkl"), pklBytes, 0o644); err != nil {
		t.Fatal(err)
	}

	// Trigger config reload.
	if err := td.reloadConfig(context.Background()); err != nil {
		t.Fatalf("reloadConfig: %v", err)
	}

	// Assert the live snapshot has the automation.
	snap := td.currentSnapshot()
	found := false
	for _, a := range snap.GetAutomations() {
		if a.GetId() == "loop-test" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected 'loop-test' in live snapshot, got %d automations", len(snap.GetAutomations()))
	}
}
```

If `newTestDaemonWithMinimalConfig`, `td.reloadConfig`, or `td.currentSnapshot` don't exist as named, find the closest equivalents in `internal/daemon/*_test.go` and adapt the test to use them. Common patterns: `newTestServer`, `s.cfgMgr.Apply()`, `s.cfgMgr.Current()`.

If the package uses fsnotify-driven reload instead of an explicit RPC and the test is flaky, prefer the explicit `Apply` call — that's the deterministic path.

- [ ] **Step 2: Run test to verify it passes**

Run: `go test ./internal/daemon -run TestAutoDiscovery_LoopClosure -v`
Expected: PASS.

If the test fails with a `helper missing` error, fix the helper invocation before fixing the code. If it fails with a real auto-discovery bug, debug systematically — don't paper over with retries.

- [ ] **Step 3: Commit**

```bash
git add internal/daemon/autodiscovery_e2e_test.go
git commit -m "test(daemon): E2E loop-closure proving form-saved automations reach live snapshot"
```

---

## Final verification

After all 12 tasks land:

- [ ] **Run the full test suite**

```bash
go test ./... -count=1
```

Expected: PASS.

- [ ] **Build the daemon and CLI**

```bash
go build ./cmd/...
```

Expected: clean build.

- [ ] **Smoke check via the dev config**

Locate the dev config dir (search `internal/daemon` startup defaults for `defaultConfigDir`). Place a single-file automation under `<configDir>/automations/` using the new format, restart the daemon (or invoke its reload mechanism), and confirm the automation appears in the snapshot via `switchyard config show` (or whichever existing CLI command surfaces the snapshot). If no CLI command surfaces the snapshot, this step can be skipped — the E2E test in Task 12 provides equivalent coverage.

- [ ] **Update the progress log**

Edit `docs/design/plans/2026-05-12-pkl-starlark-editors-progress.md`'s Decision log to record:

> **2026-05-12 (resolved):** The T3.7 KNOWN GAP for `automations/*.pkl` auto-discovery is now closed by the implementation in `docs/design/plans/2026-05-12-config-autodiscovery.md`. The form-driven flow is now wired end-to-end.

---

## Notes on execution order and parallelism

Tasks 1, 2, 3, and 6 are file-disjoint and can execute in parallel safely.

Task 4 must run before Task 7 (since `Render` produces test fixtures for downstream tests). Task 5 likewise before Task 8 (area/scene fixtures).

Tasks 8 and 9 can run in parallel (different files, no compile-time dependency between `discovery.go` and `merge.go`).

Task 10 must run sequentially after 7, 8, 9 (it ties them together via `Evaluate`).

Tasks 11 and 12 run after Task 10.

Suggested wave plan if subagent-driven:

| Wave | Tasks | Notes |
|------|-------|-------|
| 0 | 2, 3 | Add ValidationError fields + Pkl templates. Disjoint. |
| 1 | 1 | Adds scenes.pkl. Depends on nothing but easy to combine with Wave 0 if parallelism budget allows. |
| 2 | 4, 5 | Migrate regen. Disjoint from each other. |
| 3 | 6 | Migrate example file. Fast. |
| 4 | 7 | Extract helpers. Depends on Task 1 (scene types). |
| 5 | 8, 9 | Discovery + merge. Disjoint. |
| 6 | 10 | Wire it all together. |
| 7 | 11, 12 | Integration + E2E tests. |
