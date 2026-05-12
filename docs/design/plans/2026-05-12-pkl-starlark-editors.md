# Pkl + Starlark editors implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship Monaco-based in-browser editors for Pkl + Starlark files (text-only saves via EditSessionService), then a first AST-driven structured form (`SyAutomationForm`) that emits Pkl via the daemon's regenerator. Bookended by extending the regenerator to cover Scene / Area / EntityAreas so future structured forms aren't blocked.

**Architecture:** Three iterations — (1) Go-only regenerator extension; (2) Vue text editor surface using EditSessionService; (3) Vue form using ConfigService.RegenPreview + EditSessionService for round-trip save. Each iteration ships independently. The Monaco runtime is chunked separately by `vite-plugin-monaco-editor` so the rest of the app's bundle is unaffected.

**Tech Stack:** Go (regen, evaluator, service handlers), Pkl (config schema), Vue 3 + TypeScript (UI), Monaco editor, Playwright for E2E validation.

**Reference spec:** `docs/design/specs/2026-05-12-pkl-starlark-editors-design.md`

**Verification strategy:** `go test ./...` for backend changes (TDD per task), `vue-tsc -b --noEmit` for UI typecheck, Playwright for end-to-end on the running daemon.

---

## File structure

### Iteration 1 — Regenerator coverage (Go)

| Path | Action | Responsibility |
|---|---|---|
| `internal/automation/regen/scene.go` | new | `RenderScene(*SceneConfig) ([]byte, error)` |
| `internal/automation/regen/area.go` | new | `RenderArea(*AreaConfig) ([]byte, error)` |
| `internal/automation/regen/entity_areas.go` | new | `RenderEntityAreas(map[string]string) ([]byte, error)` |
| `internal/automation/regen/scene_test.go` | new | Round-trip test for RenderScene |
| `internal/automation/regen/area_test.go` | new | Round-trip test for RenderArea |
| `internal/automation/regen/entity_areas_test.go` | new | Round-trip test for RenderEntityAreas |
| `internal/api/config_edit_handler.go` | modify | Dispatch `"scene"` / `"area"` / `"entity_areas"` in RegenPreview |
| `internal/api/config_edit_handler_test.go` | modify | Service-level tests for new dispatch cases |

### Iteration 2 — Text editor surface (UI)

| Path | Action | Responsibility |
|---|---|---|
| `app/package.json` | modify | Add `monaco-editor` + `vite-plugin-monaco-editor` |
| `app/vite.config.ts` | modify | Wire the Monaco plugin |
| `app/src/data/edit-session.ts` | new | EditSessionService TS client (List, Open, Commit, Abandon, SessionEvents stream) |
| `app/src/data/config-service.ts` | new | ConfigService TS client (Reload) |
| `app/src/data/script-service.ts` | new | ScriptService TS client (RunTests streaming) |
| `app/src/lib/components/code-editor/pkl-grammar.ts` | new | Monaco Monarch grammar for Pkl |
| `app/src/lib/components/code-editor/SyCodeEditor.vue` | new | Monaco wrapper component |
| `app/src/lib/components/file-tree/SyFileTree.vue` | new | Two-level file tree |
| `app/src/lib/components/code-editor-panel/SyTestPanel.vue` | new | Streaming test runner UI |
| `app/src/lib/components/code-editor-panel/SyCodeEditorPanel.vue` | new | Composition: tree + editor + status bar + bottom slot |
| `app/src/lib/index.ts` | modify | Export the new components |
| `app/src/views/settings/sections/PklEditorSection.vue` | new | `/settings/pkl` route component |
| `app/src/views/settings/sections/StarlarkEditorSection.vue` | new | `/settings/starlark` route component |
| `app/src/router/index.ts` | modify | Replace SettingsStub for pkl; add starlark route |
| `app/src/views/AppLayout.vue` | modify | Add /settings/starlark to palette catalog |

### Iteration 3 — `SyAutomationForm` (UI)

| Path | Action | Responsibility |
|---|---|---|
| `app/src/data/regen-preview.ts` | new | `regenPreview({fileType, astJson})` TS client |
| `app/src/views/automations/TriggerEditor.vue` | new | Per-trigger row; dynamic sub-form by kind |
| `app/src/views/automations/ConditionEditor.vue` | new | Per-condition row (recursive for and/or/not) |
| `app/src/views/automations/ActionEditor.vue` | new | Per-action row |
| `app/src/views/automations/SyAutomationForm.vue` | new | Modal hosting the form; emits save/cancel |
| `app/src/views/AutomationsView.vue` | modify | "+ New" button + per-row Edit affordance |

---

# Iteration 1 — Regenerator coverage

## Task 1.1: `RenderArea`

**Files:**
- Create: `internal/automation/regen/area.go`
- Create: `internal/automation/regen/area_test.go`

- [ ] **Step 1: Write the failing test**

Create `internal/automation/regen/area_test.go`:

```go
package regen_test

import (
	"strings"
	"testing"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	"github.com/fdatoo/switchyard/internal/automation/regen"
)

func TestRenderArea_BasicFields(t *testing.T) {
	out, err := regen.RenderArea(&configpb.AreaConfig{
		Id:          "bedroom",
		DisplayName: "Bedroom",
	})
	if err != nil {
		t.Fatalf("RenderArea: %v", err)
	}
	s := string(out)
	for _, want := range []string{
		`import "switchyard:areas" as ar`,
		`new ar.Area {`,
		`id = "bedroom"`,
		`displayName = "Bedroom"`,
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("output missing %q\n----\n%s\n----", want, s)
		}
	}
}

func TestRenderArea_ParentId(t *testing.T) {
	out, err := regen.RenderArea(&configpb.AreaConfig{
		Id:          "kitchenette",
		DisplayName: "Kitchenette",
		ParentId:    "kitchen",
	})
	if err != nil {
		t.Fatalf("RenderArea: %v", err)
	}
	if !strings.Contains(string(out), `parentId = "kitchen"`) {
		t.Fatalf("output missing parentId line\n%s", out)
	}
}

func TestRenderArea_NoParentIdLineWhenAbsent(t *testing.T) {
	out, err := regen.RenderArea(&configpb.AreaConfig{
		Id:          "office",
		DisplayName: "Office",
	})
	if err != nil {
		t.Fatalf("RenderArea: %v", err)
	}
	if strings.Contains(string(out), `parentId`) {
		t.Fatalf("output unexpectedly contains parentId\n%s", out)
	}
}
```

- [ ] **Step 2: Run test — confirm failure**

```bash
go test -run TestRenderArea ./internal/automation/regen/... -v
```
Expected: build error `undefined: regen.RenderArea`.

- [ ] **Step 3: Implement `RenderArea`**

Create `internal/automation/regen/area.go`:

```go
package regen

import (
	"bytes"
	"fmt"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
)

// RenderArea serializes an AreaConfig to canonical .pkl. Deterministic.
func RenderArea(a *configpb.AreaConfig) ([]byte, error) {
	if a.GetId() == "" {
		return nil, fmt.Errorf("area: id required")
	}
	var buf bytes.Buffer
	w := &pklWriter{b: &buf}
	w.line(`import "switchyard:areas" as ar`)
	w.line("")
	w.line("// Auto-generated by switchyardd regen — do not edit manually.")
	w.line("")
	w.line("new ar.Area {")
	w.line(fmt.Sprintf("  id = %q", a.GetId()))
	w.line(fmt.Sprintf("  displayName = %q", a.GetDisplayName()))
	if pid := a.GetParentId(); pid != "" {
		w.line(fmt.Sprintf("  parentId = %q", pid))
	}
	w.line("}")
	return buf.Bytes(), nil
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
go test -run TestRenderArea ./internal/automation/regen/... -v
```
Expected: all three PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/automation/regen/area.go internal/automation/regen/area_test.go
git commit -m "regen: RenderArea — AreaConfig → canonical Pkl"
```

---

## Task 1.2: `RenderScene`

**Files:**
- Create: `internal/automation/regen/scene.go`
- Create: `internal/automation/regen/scene_test.go`

- [ ] **Step 1: Write the failing test**

Create `internal/automation/regen/scene_test.go`:

```go
package regen_test

import (
	"strings"
	"testing"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
	"github.com/fdatoo/switchyard/internal/automation/regen"
)

func TestRenderScene_BasicFields(t *testing.T) {
	out, err := regen.RenderScene(&configpb.SceneConfig{
		Id:          "wind-down",
		DisplayName: "Wind down",
	})
	if err != nil {
		t.Fatalf("RenderScene: %v", err)
	}
	s := string(out)
	for _, want := range []string{
		`import "switchyard:scenes" as sc`,
		`import "switchyard:automations" as auto`,
		`new sc.Scene {`,
		`id = "wind-down"`,
		`displayName = "Wind down"`,
		`actions {`,
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("output missing %q\n----\n%s\n----", want, s)
		}
	}
}

func TestRenderScene_WithCallServiceAction(t *testing.T) {
	out, err := regen.RenderScene(&configpb.SceneConfig{
		Id:          "tv-mode",
		DisplayName: "TV mode",
		Actions: []*configpb.ActionConfig{
			{Kind: &configpb.ActionConfig_CallService{
				CallService: &configpb.CallServiceAction{
					Entity:     "light.tv",
					Capability: "set_brightness",
					Args:       map[string]string{"value": "60"},
				},
			}},
		},
	})
	if err != nil {
		t.Fatalf("RenderScene: %v", err)
	}
	s := string(out)
	for _, want := range []string{
		`new auto.CallServiceAction {`,
		`entity = "light.tv"`,
		`capability = "set_brightness"`,
		`["value"] = "60"`,
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("output missing %q\n----\n%s\n----", want, s)
		}
	}
}
```

- [ ] **Step 2: Run test — confirm failure**

```bash
go test -run TestRenderScene ./internal/automation/regen/... -v
```
Expected: build error `undefined: regen.RenderScene`.

- [ ] **Step 3: Implement `RenderScene`**

Create `internal/automation/regen/scene.go`. The action rendering uses the existing `renderAction` helper from `regen.go` (lowercase = package-private but same package):

```go
package regen

import (
	"bytes"
	"fmt"

	configpb "github.com/fdatoo/switchyard/gen/switchyard/config/v1"
)

// RenderScene serializes a SceneConfig to canonical .pkl. Reuses
// renderAction from regen.go since scene actions are the same ActionConfig
// shape automations use.
func RenderScene(s *configpb.SceneConfig) ([]byte, error) {
	if s.GetId() == "" {
		return nil, fmt.Errorf("scene: id required")
	}
	var buf bytes.Buffer
	w := &pklWriter{b: &buf}
	w.line(`import "switchyard:scenes" as sc`)
	w.line(`import "switchyard:automations" as auto`)
	w.line("")
	w.line("// Auto-generated by switchyardd regen — do not edit manually.")
	w.line("")
	w.line("new sc.Scene {")
	w.line(fmt.Sprintf("  id = %q", s.GetId()))
	w.line(fmt.Sprintf("  displayName = %q", s.GetDisplayName()))
	w.line("  actions {")
	for _, act := range s.GetActions() {
		renderAction(w, act, 2)
	}
	w.line("  }")
	w.line("}")
	return buf.Bytes(), nil
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
go test -run TestRenderScene ./internal/automation/regen/... -v
```
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/automation/regen/scene.go internal/automation/regen/scene_test.go
git commit -m "regen: RenderScene — SceneConfig → canonical Pkl"
```

---

## Task 1.3: `RenderEntityAreas`

**Files:**
- Create: `internal/automation/regen/entity_areas.go`
- Create: `internal/automation/regen/entity_areas_test.go`

- [ ] **Step 1: Write the failing test**

Create `internal/automation/regen/entity_areas_test.go`:

```go
package regen_test

import (
	"strings"
	"testing"

	"github.com/fdatoo/switchyard/internal/automation/regen"
)

func TestRenderEntityAreas_EmittedSorted(t *testing.T) {
	out, err := regen.RenderEntityAreas(map[string]string{
		"light.b": "kitchen",
		"light.a": "bedroom",
		"light.c": "living_room",
	})
	if err != nil {
		t.Fatalf("RenderEntityAreas: %v", err)
	}
	s := string(out)
	// Sorted by key so output is deterministic.
	idxA := strings.Index(s, `["light.a"]`)
	idxB := strings.Index(s, `["light.b"]`)
	idxC := strings.Index(s, `["light.c"]`)
	if !(idxA >= 0 && idxA < idxB && idxB < idxC) {
		t.Fatalf("entries not sorted by key:\n%s", s)
	}
	for _, want := range []string{
		`entityAreas {`,
		`["light.a"] = "bedroom"`,
		`["light.b"] = "kitchen"`,
		`["light.c"] = "living_room"`,
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("output missing %q\n----\n%s\n----", want, s)
		}
	}
}

func TestRenderEntityAreas_EmptyMap(t *testing.T) {
	out, err := regen.RenderEntityAreas(map[string]string{})
	if err != nil {
		t.Fatalf("RenderEntityAreas: %v", err)
	}
	s := string(out)
	if !strings.Contains(s, `entityAreas {`) || !strings.Contains(s, `}`) {
		t.Fatalf("empty entityAreas block missing\n%s", s)
	}
}
```

- [ ] **Step 2: Run test — confirm failure**

```bash
go test -run TestRenderEntityAreas ./internal/automation/regen/... -v
```
Expected: build error `undefined: regen.RenderEntityAreas`.

- [ ] **Step 3: Implement `RenderEntityAreas`**

Create `internal/automation/regen/entity_areas.go`:

```go
package regen

import (
	"bytes"
	"fmt"
	"sort"
)

// RenderEntityAreas serializes an entity-id → area-id mapping into the
// `entityAreas { ... }` Pkl block. Entries are emitted sorted by entity id
// for deterministic output.
func RenderEntityAreas(m map[string]string) ([]byte, error) {
	var buf bytes.Buffer
	w := &pklWriter{b: &buf}
	w.line("// Auto-generated by switchyardd regen — do not edit manually.")
	w.line("")
	w.line("entityAreas {")
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		w.line(fmt.Sprintf("  [%q] = %q", k, m[k]))
	}
	w.line("}")
	return buf.Bytes(), nil
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
go test -run TestRenderEntityAreas ./internal/automation/regen/... -v
```
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/automation/regen/entity_areas.go internal/automation/regen/entity_areas_test.go
git commit -m "regen: RenderEntityAreas — entity→area mapping → canonical Pkl"
```

---

## Task 1.4: `RegenPreview` dispatch for new file types

**Files:**
- Modify: `internal/api/config_edit_handler.go`
- Modify: `internal/api/config_edit_handler_test.go`

- [ ] **Step 1: Write the failing tests**

Append to `internal/api/config_edit_handler_test.go`:

```go
func TestRegenPreview_AreaType_Renders(t *testing.T) {
	s := newConfigService(t)
	// Reuse the helper that builds a ConfigService for these tests — locate
	// it via the existing TestRegenPreview_ValidAutomation function.
	resp, err := s.RegenPreview(context.Background(), connect.NewRequest(&v1.RegenPreviewRequest{
		FileType: "area",
		AstJson:  `{"id":"bedroom","displayName":"Bedroom"}`,
	}))
	if err != nil {
		t.Fatalf("RegenPreview area: %v", err)
	}
	if !strings.Contains(string(resp.Msg.GetPklBytes()), `id = "bedroom"`) {
		t.Fatalf("area pkl bytes missing id line:\n%s", resp.Msg.GetPklBytes())
	}
}

func TestRegenPreview_SceneType_Renders(t *testing.T) {
	s := newConfigService(t)
	resp, err := s.RegenPreview(context.Background(), connect.NewRequest(&v1.RegenPreviewRequest{
		FileType: "scene",
		AstJson:  `{"id":"wind-down","displayName":"Wind down","actions":[]}`,
	}))
	if err != nil {
		t.Fatalf("RegenPreview scene: %v", err)
	}
	if !strings.Contains(string(resp.Msg.GetPklBytes()), `id = "wind-down"`) {
		t.Fatalf("scene pkl bytes missing id line:\n%s", resp.Msg.GetPklBytes())
	}
}

func TestRegenPreview_EntityAreasType_Renders(t *testing.T) {
	s := newConfigService(t)
	resp, err := s.RegenPreview(context.Background(), connect.NewRequest(&v1.RegenPreviewRequest{
		FileType: "entity_areas",
		AstJson:  `{"light.a":"bedroom","light.b":"kitchen"}`,
	}))
	if err != nil {
		t.Fatalf("RegenPreview entity_areas: %v", err)
	}
	out := string(resp.Msg.GetPklBytes())
	if !strings.Contains(out, `["light.a"] = "bedroom"`) {
		t.Fatalf("entity_areas pkl bytes missing line:\n%s", out)
	}
}
```

Add imports if missing in the file (the existing tests already use `context`, `connect`, `v1`, `strings`; check the top of the file).

- [ ] **Step 2: Run tests — confirm failure**

```bash
go test -run "TestRegenPreview_(AreaType|SceneType|EntityAreasType)" ./internal/api/... -v
```
Expected: failures — `RegenPreview` currently returns `InvalidArgument: unknown file_type` for those three values.

- [ ] **Step 3: Extend the dispatch**

Edit `internal/api/config_edit_handler.go`. Replace the `switch` body with:

```go
	switch req.Msg.GetFileType() {
	case "automation":
		var ac configpb.AutomationConfig
		if err := protojson.Unmarshal([]byte(req.Msg.GetAstJson()), &ac); err != nil {
			return nil, grpcToConnect(codes.InvalidArgument, "malformed ast_json: "+err.Error())
		}
		out, err := regen.Render(&ac)
		if err != nil {
			return nil, grpcToConnect(codes.InvalidArgument, "render failed: "+err.Error())
		}
		return connect.NewResponse(&v1.RegenPreviewResponse{PklBytes: out}), nil

	case "area":
		var a configpb.AreaConfig
		if err := protojson.Unmarshal([]byte(req.Msg.GetAstJson()), &a); err != nil {
			return nil, grpcToConnect(codes.InvalidArgument, "malformed ast_json: "+err.Error())
		}
		out, err := regen.RenderArea(&a)
		if err != nil {
			return nil, grpcToConnect(codes.InvalidArgument, "render failed: "+err.Error())
		}
		return connect.NewResponse(&v1.RegenPreviewResponse{PklBytes: out}), nil

	case "scene":
		var sc configpb.SceneConfig
		if err := protojson.Unmarshal([]byte(req.Msg.GetAstJson()), &sc); err != nil {
			return nil, grpcToConnect(codes.InvalidArgument, "malformed ast_json: "+err.Error())
		}
		out, err := regen.RenderScene(&sc)
		if err != nil {
			return nil, grpcToConnect(codes.InvalidArgument, "render failed: "+err.Error())
		}
		return connect.NewResponse(&v1.RegenPreviewResponse{PklBytes: out}), nil

	case "entity_areas":
		var m map[string]string
		if err := json.Unmarshal([]byte(req.Msg.GetAstJson()), &m); err != nil {
			return nil, grpcToConnect(codes.InvalidArgument, "malformed ast_json: "+err.Error())
		}
		out, err := regen.RenderEntityAreas(m)
		if err != nil {
			return nil, grpcToConnect(codes.InvalidArgument, "render failed: "+err.Error())
		}
		return connect.NewResponse(&v1.RegenPreviewResponse{PklBytes: out}), nil

	case "page":
		return nil, grpcToConnect(codes.Unimplemented, "page regen not yet implemented")

	default:
		return nil, grpcToConnect(codes.InvalidArgument, "unknown file_type: "+req.Msg.GetFileType())
	}
```

Add `"encoding/json"` to the imports (for the entity_areas map).

- [ ] **Step 4: Run tests — confirm pass**

```bash
go test -run "TestRegenPreview" ./internal/api/... -v
```
Expected: all RegenPreview tests PASS, including the original ones.

- [ ] **Step 5: Run full repo tests**

```bash
go test ./...
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/api/config_edit_handler.go internal/api/config_edit_handler_test.go
git commit -m "api: RegenPreview dispatches area / scene / entity_areas"
```

---

# Iteration 2 — Text editor surface

## Task 2.1: Install Monaco + Vite plugin

**Files:**
- Modify: `app/package.json`
- Modify: `app/vite.config.ts`

- [ ] **Step 1: Add dependencies**

From `app/`:
```bash
npm install monaco-editor@^0.45.0
npm install --save-dev vite-plugin-monaco-editor@^1.1.0
```

(Use latest patch versions matching these majors. The Monaco major influences API; 0.45 is recent stable as of plan-write.)

- [ ] **Step 2: Wire the plugin in `vite.config.ts`**

Open `app/vite.config.ts`. Add to imports:

```ts
import monacoEditorPlugin from "vite-plugin-monaco-editor";
```

Add to the plugins array (alongside `vue()`):

```ts
plugins: [
  vue(),
  monacoEditorPlugin({
    languageWorkers: ["editorWorkerService"],
  }),
],
```

(We only need the base worker — we use built-in `python` syntax for Starlark and a custom Monarch for Pkl; no separate language worker.)

- [ ] **Step 3: Verify build**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json
```
Expected: clean.

```bash
cd app && npm run build 2>&1 | tail -10
```
Expected: build succeeds (may take longer than before — Monaco is large).

- [ ] **Step 4: Commit**

```bash
git add app/package.json app/package-lock.json app/vite.config.ts
git commit -m "app: install monaco-editor + vite-plugin-monaco-editor"
```

---

## Task 2.2: Pkl Monarch grammar

**Files:**
- Create: `app/src/lib/components/code-editor/pkl-grammar.ts`

- [ ] **Step 1: Create the grammar**

```ts
/**
 * Pkl syntax highlighting for Monaco, as a Monarch grammar.
 * Covers keywords, primitives, strings (including raw multi-line),
 * comments, brackets, and numbers. Tokens here are kept conservative
 * — over-tokenising risks miscoloring valid Pkl, which is more
 * jarring than no color at all.
 *
 * Register once on first use via monaco.languages.register +
 * setMonarchTokensProvider. SyCodeEditor handles registration.
 */

import type { languages } from "monaco-editor";

export const pklLanguageId = "pkl";

export const pklLanguageConfig: languages.LanguageConfiguration = {
  comments: {
    lineComment: "//",
    blockComment: ["/*", "*/"],
  },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
  ],
};

export const pklMonarchTokens: languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".pkl",

  keywords: [
    "module", "amends", "import", "as", "extends", "class", "function",
    "new", "local", "abstract", "open", "hidden", "external",
    "let", "if", "else", "for", "in", "when", "throw", "trace",
    "true", "false", "null",
    "this", "super", "outer",
  ],

  typeKeywords: [
    "String", "Int", "Float", "Number", "Boolean", "Listing", "Mapping",
    "Set", "Dynamic", "Any", "Null", "Duration", "DataSize",
  ],

  operators: ["=", "==", "!=", "<", ">", "<=", ">=", "+", "-", "*", "/", "%", "&&", "||", "!", "?", "??"],

  symbols: /[=><!~?:&|+\-*/%]+/,

  tokenizer: {
    root: [
      // identifiers and keywords
      [/[A-Za-z_]\w*/, {
        cases: {
          "@keywords":     "keyword",
          "@typeKeywords": "type",
          "@default":      "identifier",
        },
      }],

      // whitespace
      { include: "@whitespace" },

      // delimiters
      [/[{}()[\]]/, "@brackets"],
      [/@symbols/, {
        cases: {
          "@operators": "operator",
          "@default":   "",
        },
      }],

      // numbers
      [/\d*\.\d+([eE][-+]?\d+)?/, "number.float"],
      [/0[xX][0-9a-fA-F]+/, "number.hex"],
      [/\d+/, "number"],

      // strings
      [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
    ],

    string: [
      [/[^"\\]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
    ],

    comment: [
      [/[^/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[/*]/, "comment"],
    ],

    whitespace: [
      [/[ \t\r\n]+/, ""],
      [/\/\*/, "comment", "@comment"],
      [/\/\/.*$/, "comment"],
    ],
  },
};
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "pkl-grammar"
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/components/code-editor/pkl-grammar.ts
git commit -m "app: Pkl Monarch grammar for Monaco"
```

---

## Task 2.3: `SyCodeEditor` Monaco wrapper

**Files:**
- Create: `app/src/lib/components/code-editor/SyCodeEditor.vue`

- [ ] **Step 1: Create the wrapper**

```vue
<!--
  SyCodeEditor — a thin Monaco wrapper.

  Props:
    modelValue   string  — editor text (v-model compatible)
    language     "pkl" | "python"  — Monaco language id
    readonly?    boolean — disables edits
    filename?    string  — informational only; not used by Monaco

  Emits:
    update:modelValue  — fires on every keystroke

  Lifecycle:
    - Registers the Pkl language + Monarch grammar once globally
      (idempotent — guarded by a module-scope flag).
    - Creates the editor on mount, disposes on unmount.
    - Watches `modelValue` for external changes; only writes back
      if the new value differs from the current editor value (avoids
      infinite update loops).
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as monaco from "monaco-editor";
import { pklLanguageId, pklLanguageConfig, pklMonarchTokens } from "./pkl-grammar";

const props = defineProps<{
  modelValue: string;
  language: "pkl" | "python";
  readonly?: boolean;
  filename?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const hostEl = ref<HTMLDivElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;

let pklRegistered = false;
function ensurePklRegistered(): void {
  if (pklRegistered) return;
  pklRegistered = true;
  monaco.languages.register({ id: pklLanguageId });
  monaco.languages.setLanguageConfiguration(pklLanguageId, pklLanguageConfig);
  monaco.languages.setMonarchTokensProvider(pklLanguageId, pklMonarchTokens);
}

onMounted(() => {
  if (!hostEl.value) return;
  if (props.language === "pkl") ensurePklRegistered();
  editor = monaco.editor.create(hostEl.value, {
    value: props.modelValue,
    language: props.language,
    readOnly: props.readonly ?? false,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    scrollBeyondLastLine: false,
    tabSize: 2,
  });
  editor.onDidChangeModelContent(() => {
    const v = editor?.getValue() ?? "";
    if (v !== props.modelValue) emit("update:modelValue", v);
  });
});

onBeforeUnmount(() => {
  editor?.dispose();
  editor = null;
});

watch(() => props.modelValue, (next) => {
  if (!editor) return;
  if (editor.getValue() !== next) {
    editor.setValue(next);
  }
});

watch(() => props.language, (lang) => {
  if (!editor) return;
  const model = editor.getModel();
  if (model) monaco.editor.setModelLanguage(model, lang);
});

watch(() => props.readonly, (ro) => {
  editor?.updateOptions({ readOnly: ro ?? false });
});
</script>

<template>
  <div ref="hostEl" class="sy-code-editor" />
</template>

<style scoped>
.sy-code-editor {
  width: 100%;
  height: 100%;
  min-height: 200px;
}
</style>
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "SyCodeEditor"
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/components/code-editor/SyCodeEditor.vue
git commit -m "app: SyCodeEditor Monaco wrapper"
```

---

## Task 2.4: `SyFileTree` component

**Files:**
- Create: `app/src/lib/components/file-tree/SyFileTree.vue`

- [ ] **Step 1: Create the component**

```vue
<!--
  SyFileTree — flat-or-one-level file list. Two-level only in v1:
  root files and files in one optional subdirectory (`handlers/`).

  Props:
    entries: FileEntry[]    — flat list with optional `subdir` path
    selectedPath?: string

  Emits:
    select(path: string)
-->
<script setup lang="ts">
import { computed } from "vue";
import SyText from "@/lib/components/text/SyText.vue";
import SyIcon from "@/lib/components/icon/SyIcon.vue";

export interface FileEntry {
  /** Path relative to the config root, e.g. "main.pkl" or "handlers/ride.star". */
  path: string;
  /** Display name (basename). */
  name: string;
  /** "pkl" | "star" — used for the icon. */
  kind: "pkl" | "star";
}

const props = defineProps<{
  entries: FileEntry[];
  selectedPath?: string;
}>();

const emit = defineEmits<{
  (e: "select", path: string): void;
}>();

const grouped = computed<{ root: FileEntry[]; subdirs: Record<string, FileEntry[]> }>(() => {
  const root: FileEntry[] = [];
  const subdirs: Record<string, FileEntry[]> = {};
  for (const e of props.entries) {
    const slash = e.path.indexOf("/");
    if (slash === -1) {
      root.push(e);
    } else {
      const dir = e.path.slice(0, slash);
      (subdirs[dir] ||= []).push(e);
    }
  }
  return { root, subdirs };
});

function iconFor(kind: FileEntry["kind"]): "plugin" | "automations" {
  return kind === "pkl" ? "plugin" : "automations";
}
</script>

<template>
  <nav class="sy-tree">
    <ul class="sy-tree__list">
      <li
        v-for="e in grouped.root"
        :key="e.path"
        :class="['sy-tree__file', { 'sy-tree__file--active': selectedPath === e.path }]"
        @click="emit('select', e.path)"
      >
        <SyIcon :name="iconFor(e.kind)" :size="14" />
        <SyText as="span" variant="caption">{{ e.name }}</SyText>
      </li>
    </ul>
    <template v-for="(files, dir) in grouped.subdirs" :key="dir">
      <div class="sy-tree__dirhead">
        <SyText as="span" variant="caption" tone="subtle">{{ dir }}/</SyText>
      </div>
      <ul class="sy-tree__list">
        <li
          v-for="e in files"
          :key="e.path"
          :class="['sy-tree__file', 'sy-tree__file--nested', { 'sy-tree__file--active': selectedPath === e.path }]"
          @click="emit('select', e.path)"
        >
          <SyIcon :name="iconFor(e.kind)" :size="14" />
          <SyText as="span" variant="caption">{{ e.name }}</SyText>
        </li>
      </ul>
    </template>
  </nav>
</template>

<style scoped>
.sy-tree { display: flex; flex-direction: column; gap: var(--sy-space-2); padding: var(--sy-space-2); }
.sy-tree__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sy-tree__file {
  display: flex; align-items: center; gap: var(--sy-space-2);
  padding: 4px var(--sy-space-2); cursor: pointer; border-radius: var(--sy-radius-sm);
}
.sy-tree__file:hover { background: var(--sy-color-surface-2); }
.sy-tree__file--active { background: var(--sy-color-surface-3); }
.sy-tree__file--nested { padding-left: var(--sy-space-4); }
.sy-tree__dirhead { padding: 4px var(--sy-space-2) 0; }
</style>
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "SyFileTree"
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/components/file-tree/SyFileTree.vue
git commit -m "app: SyFileTree component"
```

---

## Task 2.5: `EditSessionService` TS client

**Files:**
- Create: `app/src/data/edit-session.ts`

- [ ] **Step 1: Create the client**

```ts
/**
 * EditSessionService client. The daemon owns the on-disk state; sessions
 * are transactional — OpenForEdit locks a file, the UI is canonical until
 * CommitEdit (which checks the hash and writes), AbandonEdit releases.
 *
 * SessionEvents is a server-stream that surfaces ExternalEditDetected
 * when another process modifies the file while a session is open.
 */

import { rpcCall, rpcStream, type RpcOptions } from "./rpc";

const SVC = "switchyard.editsession.v1.EditSessionService";

export interface FileEntry {
  path: string;
  /** "pkl" or "star". */
  kind: "pkl" | "star";
}

interface RawFileEntry {
  path?: string;
  kind?: string;
}

export async function listFiles(opts: RpcOptions = {}): Promise<{ files: FileEntry[] }> {
  const res = await rpcCall<Record<string, never>, { files?: RawFileEntry[] }>(
    `${SVC}/ListFiles`, {}, opts,
  );
  const files: FileEntry[] = [];
  for (const f of res.files ?? []) {
    const path = f.path ?? "";
    if (!path) continue;
    const ext = path.endsWith(".pkl") ? "pkl" : path.endsWith(".star") ? "star" : null;
    if (!ext) continue;
    files.push({ path, kind: (f.kind === "pkl" || f.kind === "star") ? f.kind : ext });
  }
  return { files };
}

export interface OpenForEditResult {
  sessionId: string;
  lockToken: string;
  fileHash: string;
  ancestorPkl: string;
  /** The daemon ships an AST as JSON; raw-text editor flow ignores it. */
  astJson: string;
}

interface RawOpenForEditResponse {
  session_id?: string; sessionId?: string;
  lock_token?: string; lockToken?: string;
  file_hash?: string;  fileHash?: string;
  ancestor_pkl?: string; ancestorPkl?: string;
  ast_json?: string; astJson?: string;
}

export async function openForEdit(filePath: string, opts: RpcOptions = {}): Promise<OpenForEditResult> {
  const res = await rpcCall<{ filePath: string }, RawOpenForEditResponse>(
    `${SVC}/OpenForEdit`, { filePath }, opts,
  );
  return {
    sessionId:   res.sessionId   ?? res.session_id   ?? "",
    lockToken:   res.lockToken   ?? res.lock_token   ?? "",
    fileHash:    res.fileHash    ?? res.file_hash    ?? "",
    ancestorPkl: res.ancestorPkl ?? res.ancestor_pkl ?? "",
    astJson:     res.astJson     ?? res.ast_json     ?? "",
  };
}

export interface CommitEditResult {
  /** New file hash after write, when success. */
  newFileHash: string;
  /** Conflict info if the on-disk hash didn't match. */
  conflict?: { reason: string };
}

interface RawCommitEditResponse {
  result?: {
    success?: { new_file_hash?: string; newFileHash?: string };
    conflict?: { reason?: string };
  };
}

export async function commitEdit(
  args: { filePath: string; lockToken: string; regeneratedPkl: string; expectedFileHash: string; force?: boolean },
  opts: RpcOptions = {},
): Promise<CommitEditResult> {
  const res = await rpcCall<typeof args, RawCommitEditResponse>(
    `${SVC}/CommitEdit`,
    args,
    opts,
  );
  if (res.result?.conflict) {
    return { newFileHash: "", conflict: { reason: res.result.conflict.reason ?? "conflict" } };
  }
  const succ = res.result?.success;
  return { newFileHash: succ?.newFileHash ?? succ?.new_file_hash ?? "" };
}

export async function abandonEdit(args: { filePath: string; lockToken: string }, opts: RpcOptions = {}): Promise<void> {
  await rpcCall<typeof args, Record<string, never>>(
    `${SVC}/AbandonEdit`, args, opts,
  );
}

export interface SessionEvent {
  kind: "heartbeat" | "external_edit_detected" | "unknown";
  filePath?: string;
}

interface RawSessionEvent {
  heartbeat?: Record<string, never>;
  external_edit_detected?: { file_path?: string; filePath?: string };
  externalEditDetected?:   { file_path?: string; filePath?: string };
}

export async function* sessionEvents(
  args: { sessionId: string; lockToken: string },
  opts: RpcOptions = {},
): AsyncGenerator<SessionEvent, void, void> {
  const stream = rpcStream<typeof args, RawSessionEvent>(
    `${SVC}/SessionEvents`, args, opts,
  );
  for await (const raw of stream) {
    if (raw.heartbeat) {
      yield { kind: "heartbeat" };
      continue;
    }
    const ext = raw.external_edit_detected ?? raw.externalEditDetected;
    if (ext) {
      yield { kind: "external_edit_detected", filePath: ext.filePath ?? ext.file_path };
      continue;
    }
    yield { kind: "unknown" };
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "edit-session\.ts"
```
Expected: empty.

- [ ] **Step 3: Playwright probe — confirm ListFiles**

Open `http://localhost:5174` and evaluate:

```js
async () => {
  const m = await import("/src/data/edit-session.ts");
  const r = await m.listFiles();
  return { count: r.files.length, sample: r.files.slice(0, 3) };
}
```

Expected: non-zero count, sample includes `main.pkl`.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/edit-session.ts
git commit -m "app: EditSessionService TS client (list, open, commit, abandon, events stream)"
```

---

## Task 2.6: `ConfigService` + `ScriptService` TS clients

**Files:**
- Create: `app/src/data/config-service.ts`
- Create: `app/src/data/script-service.ts`

- [ ] **Step 1: ConfigService.Reload wrapper**

Create `app/src/data/config-service.ts`:

```ts
/**
 * ConfigService client. v1 surface is just Reload — used after
 * CommitEdit so the daemon picks up the new file immediately
 * (the file watcher would catch it too, but the explicit call is
 * deterministic and lets the UI block on completion).
 */

import { rpcCall, type RpcOptions } from "./rpc";

const SVC = "switchyard.v1alpha1.ConfigService";

export interface ReloadResult {
  correlationId: string;
}

export async function reloadConfig(opts: RpcOptions = {}): Promise<ReloadResult> {
  const res = await rpcCall<Record<string, never>, { correlationId?: string; correlation_id?: string }>(
    `${SVC}/Reload`, {}, opts,
  );
  return { correlationId: res.correlationId ?? res.correlation_id ?? "" };
}
```

- [ ] **Step 2: ScriptService.RunTests streaming wrapper**

Create `app/src/data/script-service.ts`:

```ts
/**
 * ScriptService client. The Starlark editor uses RunTests (server-
 * streaming) to drive its test runner panel.
 */

import { rpcStream, type RpcOptions } from "./rpc";

const SVC = "switchyard.v1alpha1.ScriptService";

export type TestEvent =
  | { kind: "start"; name: string }
  | { kind: "pass";  name: string; durationMs: number }
  | { kind: "fail";  name: string; message: string }
  | { kind: "done";  passed: number; failed: number };

interface RawTestEvent {
  start?: { name?: string };
  pass?:  { name?: string; duration_ms?: number; durationMs?: number };
  fail?:  { name?: string; message?: string };
  done?:  { passed?: number; failed?: number };
}

export async function* runTests(
  scriptId: string,
  opts: RpcOptions = {},
): AsyncGenerator<TestEvent, void, void> {
  const stream = rpcStream<{ scriptId: string }, RawTestEvent>(
    `${SVC}/RunTests`, { scriptId }, opts,
  );
  for await (const raw of stream) {
    if (raw.start) {
      yield { kind: "start", name: raw.start.name ?? "" };
    } else if (raw.pass) {
      yield {
        kind: "pass",
        name: raw.pass.name ?? "",
        durationMs: raw.pass.durationMs ?? raw.pass.duration_ms ?? 0,
      };
    } else if (raw.fail) {
      yield { kind: "fail", name: raw.fail.name ?? "", message: raw.fail.message ?? "" };
    } else if (raw.done) {
      yield { kind: "done", passed: raw.done.passed ?? 0, failed: raw.done.failed ?? 0 };
    }
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -E "config-service|script-service"
```
Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/config-service.ts app/src/data/script-service.ts
git commit -m "app: ConfigService.Reload + ScriptService.RunTests TS clients"
```

---

## Task 2.7: `SyTestPanel` streaming test runner

**Files:**
- Create: `app/src/lib/components/code-editor-panel/SyTestPanel.vue`

- [ ] **Step 1: Create the panel**

```vue
<!--
  SyTestPanel — streaming Starlark test runner. The host component
  starts the run by calling `start(scriptId)`. Stream events
  populate a flat list of rows; cancellation aborts the stream.
-->
<script setup lang="ts">
import { ref } from "vue";
import { SyText, SyButton, SyIcon } from "@/lib";
import { runTests, type TestEvent } from "@/data/script-service";

defineProps<{
  scriptId: string;
}>();

interface Row {
  name: string;
  state: "running" | "pass" | "fail";
  durationMs?: number;
  message?: string;
}

const rows = ref<Row[]>([]);
const running = ref<boolean>(false);
const summary = ref<{ passed: number; failed: number } | null>(null);
let abort: AbortController | null = null;

async function start(scriptId: string): Promise<void> {
  if (running.value) return;
  abort?.abort();
  abort = new AbortController();
  rows.value = [];
  summary.value = null;
  running.value = true;
  try {
    for await (const ev of runTests(scriptId, { signal: abort.signal })) {
      applyEvent(ev);
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      rows.value.push({ name: "error", state: "fail", message: String(err) });
    }
  } finally {
    running.value = false;
  }
}

function applyEvent(ev: TestEvent): void {
  if (ev.kind === "start") {
    rows.value = [...rows.value, { name: ev.name, state: "running" }];
    return;
  }
  if (ev.kind === "pass" || ev.kind === "fail") {
    const idx = rows.value.findIndex((r) => r.name === ev.name && r.state === "running");
    const next = [...rows.value];
    if (idx >= 0) {
      next[idx] = ev.kind === "pass"
        ? { name: ev.name, state: "pass", durationMs: ev.durationMs }
        : { name: ev.name, state: "fail", message: ev.message };
    } else {
      next.push(ev.kind === "pass"
        ? { name: ev.name, state: "pass", durationMs: ev.durationMs }
        : { name: ev.name, state: "fail", message: ev.message });
    }
    rows.value = next;
    return;
  }
  // done
  summary.value = { passed: ev.passed, failed: ev.failed };
}

function cancel(): void {
  abort?.abort();
}

defineExpose({ start, cancel });
</script>

<template>
  <div class="sy-tests">
    <div class="sy-tests__head">
      <SyText variant="label" tone="subtle">Tests</SyText>
      <SyButton
        v-if="!running"
        intent="primary"
        size="sm"
        :disabled="!scriptId"
        @click="start(scriptId)"
      >
        Run tests
      </SyButton>
      <SyButton v-else intent="ghost" size="sm" @click="cancel">Cancel</SyButton>
    </div>

    <div v-if="rows.length === 0 && !running" class="sy-tests__empty">
      <SyText variant="caption" tone="subtle">No runs yet.</SyText>
    </div>

    <ul class="sy-tests__rows">
      <li v-for="r in rows" :key="r.name" :class="['sy-tests__row', `sy-tests__row--${r.state}`]">
        <SyIcon
          :name="r.state === 'pass' ? 'good' : r.state === 'fail' ? 'close' : 'activity'"
          :size="12"
        />
        <SyText as="span" variant="caption" weight="medium">{{ r.name }}</SyText>
        <SyText v-if="r.durationMs != null" as="span" variant="caption" tone="subtle">
          {{ r.durationMs }}ms
        </SyText>
        <SyText v-if="r.message" as="span" variant="caption" tone="bad">
          {{ r.message }}
        </SyText>
      </li>
    </ul>

    <SyText v-if="summary" variant="caption" tone="subtle">
      {{ summary.passed }} passed, {{ summary.failed }} failed
    </SyText>
  </div>
</template>

<style scoped>
.sy-tests { display: flex; flex-direction: column; gap: var(--sy-space-2); padding: var(--sy-space-3); }
.sy-tests__head { display: flex; align-items: center; justify-content: space-between; }
.sy-tests__empty { padding: var(--sy-space-2) 0; }
.sy-tests__rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.sy-tests__row { display: flex; align-items: center; gap: var(--sy-space-2); padding: 2px var(--sy-space-2); border-radius: var(--sy-radius-sm); }
.sy-tests__row--pass :first-child { color: var(--sy-color-good); }
.sy-tests__row--fail :first-child { color: var(--sy-color-bad); }
</style>
```

> **Note for executor:** Check the actual SyIcon names available (`good`, `close`, `activity`) — locate by `grep -nE "\"good\"|\"close\"|\"activity\"" app/src/lib/components/icon/SyIcon.vue`. If any of those three don't exist, substitute the nearest match. The script-service stream's `RunTestsResponse` schema may also differ from the names I assumed (`start`, `pass`, `fail`, `done`) — confirm by reading `proto/switchyard/v1alpha1/script.proto` and adjust the decoder in `script-service.ts` if needed.

- [ ] **Step 2: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "SyTestPanel"
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/components/code-editor-panel/SyTestPanel.vue
git commit -m "app: SyTestPanel — streaming Starlark test runner UI"
```

---

## Task 2.8: `SyCodeEditorPanel` orchestrator

**Files:**
- Create: `app/src/lib/components/code-editor-panel/SyCodeEditorPanel.vue`
- Modify: `app/src/lib/index.ts`

- [ ] **Step 1: Create the panel**

```vue
<!--
  SyCodeEditorPanel — the editor's outer shell. Owns the
  open-edit-commit lifecycle and the file tree.

  Props:
    kind: "pkl" | "starlark"

  Layout: file tree (left), Monaco editor (center), status bar (top
  of the editor pane). Bottom slot for kind-specific panels
  (e.g., SyTestPanel for Starlark).
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  SyText, SyButton, SyEmptyState, SyIcon, SySurface,
  SyCodeEditor, SyFileTree,
} from "@/lib";
import type { FileEntry as TreeEntry } from "@/lib/components/file-tree/SyFileTree.vue";
import {
  listFiles, openForEdit, commitEdit, abandonEdit, sessionEvents,
} from "@/data/edit-session";

const props = defineProps<{
  kind: "pkl" | "starlark";
}>();

const treeEntries = ref<TreeEntry[]>([]);
const treeError = ref<string>("");
const treeLoading = ref<boolean>(true);

const selectedPath = ref<string>("");
const buffer = ref<string>("");
const lastLoaded = ref<string>("");
const sessionId = ref<string>("");
const lockToken = ref<string>("");
const fileHash = ref<string>("");
const banner = ref<string>("");
const saveBusy = ref<boolean>(false);
const saveError = ref<string>("");

const dirty = computed<boolean>(() => buffer.value !== lastLoaded.value);
const language = computed<"pkl" | "python">(() => props.kind === "pkl" ? "pkl" : "python");
const fileExt = computed<"pkl" | "star">(() => props.kind === "pkl" ? "pkl" : "star");

let sessionAbort: AbortController | null = null;

async function loadTree(): Promise<void> {
  treeLoading.value = true;
  treeError.value = "";
  try {
    const r = await listFiles();
    treeEntries.value = r.files
      .filter((f) => f.kind === fileExt.value)
      .map((f): TreeEntry => {
        const name = f.path.split("/").pop() ?? f.path;
        return { path: f.path, name, kind: f.kind };
      });
  } catch (err) {
    treeError.value = err instanceof Error ? err.message : String(err);
  } finally {
    treeLoading.value = false;
  }
}

async function abandonCurrent(): Promise<void> {
  if (!sessionId.value || !lockToken.value || !selectedPath.value) return;
  try {
    await abandonEdit({ filePath: selectedPath.value, lockToken: lockToken.value });
  } catch { /* best-effort */ }
  sessionAbort?.abort();
  sessionAbort = null;
  sessionId.value = "";
  lockToken.value = "";
}

async function openFile(path: string): Promise<void> {
  if (dirty.value && !confirm("Discard unsaved changes?")) return;
  await abandonCurrent();
  banner.value = "";
  saveError.value = "";
  try {
    const r = await openForEdit(path);
    selectedPath.value = path;
    buffer.value = r.ancestorPkl;
    lastLoaded.value = r.ancestorPkl;
    sessionId.value = r.sessionId;
    lockToken.value = r.lockToken;
    fileHash.value = r.fileHash;
    startSessionStream();
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err);
  }
}

function startSessionStream(): void {
  sessionAbort?.abort();
  sessionAbort = new AbortController();
  const args = { sessionId: sessionId.value, lockToken: lockToken.value };
  const ac = sessionAbort;
  (async () => {
    try {
      for await (const ev of sessionEvents(args, { signal: ac.signal })) {
        if (ev.kind === "external_edit_detected") {
          banner.value = "This file changed on disk. Reload to reconcile.";
        }
      }
    } catch { /* reconnects are out of scope for v1 */ }
  })();
}

async function save(): Promise<void> {
  if (!sessionId.value || !lockToken.value || !selectedPath.value) return;
  saveBusy.value = true;
  saveError.value = "";
  try {
    const r = await commitEdit({
      filePath: selectedPath.value,
      lockToken: lockToken.value,
      regeneratedPkl: buffer.value,
      expectedFileHash: fileHash.value,
    });
    if (r.conflict) {
      banner.value = `Conflict: ${r.conflict.reason}. Reload to reconcile.`;
      return;
    }
    fileHash.value = r.newFileHash;
    lastLoaded.value = buffer.value;
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saveBusy.value = false;
  }
}

async function reload(): Promise<void> {
  if (!selectedPath.value) return;
  banner.value = "";
  await openFile(selectedPath.value);
}

function discard(): void {
  buffer.value = lastLoaded.value;
}

onMounted(loadTree);
onBeforeUnmount(() => { void abandonCurrent(); });

watch(() => props.kind, () => {
  selectedPath.value = "";
  buffer.value = "";
  lastLoaded.value = "";
  void loadTree();
});
</script>

<template>
  <div class="sy-panel">
    <!-- Status bar -->
    <header class="sy-panel__bar">
      <SyText as="span" variant="caption" weight="medium">
        {{ selectedPath || "no file selected" }}
      </SyText>
      <SyText v-if="dirty" as="span" variant="caption" tone="warn">● unsaved</SyText>
      <div class="sy-panel__barRight">
        <SyButton
          v-if="selectedPath"
          intent="ghost"
          size="sm"
          :disabled="!dirty || saveBusy"
          @click="discard"
        >Discard</SyButton>
        <SyButton
          v-if="selectedPath"
          intent="primary"
          size="sm"
          :disabled="!dirty || saveBusy"
          @click="save"
        >{{ saveBusy ? "Saving…" : "Save" }}</SyButton>
      </div>
    </header>

    <div v-if="banner" class="sy-panel__banner">
      <SyText variant="caption" tone="warn">{{ banner }}</SyText>
      <SyButton intent="ghost" size="sm" @click="reload">Reload</SyButton>
    </div>

    <div class="sy-panel__body">
      <aside class="sy-panel__tree">
        <SyEmptyState
          v-if="treeLoading"
          loading
          title="Loading files…"
        />
        <SyText v-else-if="treeError" variant="caption" tone="bad">{{ treeError }}</SyText>
        <SyFileTree
          v-else
          :entries="treeEntries"
          :selected-path="selectedPath"
          @select="openFile"
        />
      </aside>

      <main class="sy-panel__editor">
        <SyCodeEditor
          v-if="selectedPath"
          v-model="buffer"
          :language="language"
        />
        <SyEmptyState
          v-else
          title="Select a file"
          description="Pick a file from the tree to start editing."
        >
          <template #icon><SyIcon :name="kind === 'pkl' ? 'plugin' : 'automations'" :size="28" /></template>
        </SyEmptyState>
      </main>
    </div>

    <SyText v-if="saveError" variant="caption" tone="bad" class="sy-panel__saveErr">
      {{ saveError }}
    </SyText>

    <footer v-if="$slots.bottom" class="sy-panel__bottom">
      <slot name="bottom" :selectedPath="selectedPath" />
    </footer>
  </div>
</template>

<style scoped>
.sy-panel {
  display: grid;
  grid-template-rows: auto auto 1fr auto auto;
  height: 100%;
  min-height: 600px;
  gap: 0;
}
.sy-panel__bar {
  display: flex; align-items: center; gap: var(--sy-space-3);
  padding: var(--sy-space-2) var(--sy-space-3);
  border-bottom: 1px solid var(--sy-color-line-soft);
}
.sy-panel__barRight { margin-left: auto; display: flex; gap: var(--sy-space-2); }
.sy-panel__banner {
  display: flex; align-items: center; gap: var(--sy-space-3);
  padding: var(--sy-space-2) var(--sy-space-3);
  background: color-mix(in srgb, var(--sy-color-warn) 10%, transparent);
  border-bottom: 1px solid var(--sy-color-line-soft);
}
.sy-panel__body {
  display: grid; grid-template-columns: 220px 1fr; min-height: 0;
}
.sy-panel__tree {
  border-right: 1px solid var(--sy-color-line-soft);
  overflow-y: auto;
}
.sy-panel__editor { overflow: hidden; }
.sy-panel__saveErr { padding: var(--sy-space-2) var(--sy-space-3); }
.sy-panel__bottom {
  border-top: 1px solid var(--sy-color-line-soft);
  max-height: 240px; overflow-y: auto;
}
</style>
```

- [ ] **Step 2: Export new components from the library**

Edit `app/src/lib/index.ts`. Append:

```ts
export { default as SyCodeEditor } from "./components/code-editor/SyCodeEditor.vue";
export { default as SyFileTree } from "./components/file-tree/SyFileTree.vue";
export { default as SyCodeEditorPanel } from "./components/code-editor-panel/SyCodeEditorPanel.vue";
export { default as SyTestPanel } from "./components/code-editor-panel/SyTestPanel.vue";
```

- [ ] **Step 3: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -E "SyCodeEditorPanel|lib/index"
```
Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/components/code-editor-panel/ app/src/lib/index.ts
git commit -m "app: SyCodeEditorPanel + lib exports"
```

---

## Task 2.9: `PklEditorSection` route component

**Files:**
- Create: `app/src/views/settings/sections/PklEditorSection.vue`

- [ ] **Step 1: Create the section**

```vue
<!--
  PklEditorSection — /settings/pkl. Wraps SyCodeEditorPanel with
  kind="pkl". No bottom slot in v1 (validation diagnostics
  live alongside the save flow as toasts/inline errors).
-->
<script setup lang="ts">
import { SyText } from "@/lib";
import SyCodeEditorPanel from "@/lib/components/code-editor-panel/SyCodeEditorPanel.vue";
</script>

<template>
  <div class="page">
    <header class="page__head">
      <SyText as="h1" variant="display">Pkl config</SyText>
      <SyText variant="body" tone="subtle">
        Edit declarative config. Saves apply on the daemon's next reload.
      </SyText>
    </header>
    <div class="page__panel">
      <SyCodeEditorPanel kind="pkl" />
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: var(--sy-space-5) var(--sy-space-6);
  display: flex; flex-direction: column; gap: var(--sy-space-4);
  height: 100%;
}
.page__head { display: flex; flex-direction: column; gap: var(--sy-space-1); }
.page__panel { flex: 1; min-height: 0; border: 1px solid var(--sy-color-line); border-radius: var(--sy-radius-md); overflow: hidden; }
</style>
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "PklEditorSection"
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add app/src/views/settings/sections/PklEditorSection.vue
git commit -m "app: PklEditorSection route component"
```

---

## Task 2.10: `StarlarkEditorSection` route component

**Files:**
- Create: `app/src/views/settings/sections/StarlarkEditorSection.vue`

- [ ] **Step 1: Create the section**

The Starlark section adds a test panel in the bottom slot.

```vue
<!--
  StarlarkEditorSection — /settings/starlark. Same shell as Pkl
  but bottom slot hosts SyTestPanel that targets the currently-
  open script.
-->
<script setup lang="ts">
import { SyText } from "@/lib";
import SyCodeEditorPanel from "@/lib/components/code-editor-panel/SyCodeEditorPanel.vue";
import SyTestPanel from "@/lib/components/code-editor-panel/SyTestPanel.vue";
</script>

<template>
  <div class="page">
    <header class="page__head">
      <SyText as="h1" variant="display">Starlark</SyText>
      <SyText variant="body" tone="subtle">
        Edit automation handlers. Run tests via the panel below.
      </SyText>
    </header>
    <div class="page__panel">
      <SyCodeEditorPanel kind="starlark">
        <template #bottom="{ selectedPath }">
          <SyTestPanel :path="selectedPath" />
        </template>
      </SyCodeEditorPanel>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: var(--sy-space-5) var(--sy-space-6);
  display: flex; flex-direction: column; gap: var(--sy-space-4);
  height: 100%;
}
.page__head { display: flex; flex-direction: column; gap: var(--sy-space-1); }
.page__panel { flex: 1; min-height: 0; border: 1px solid var(--sy-color-line); border-radius: var(--sy-radius-md); overflow: hidden; }
</style>
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "StarlarkEditorSection"
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add app/src/views/settings/sections/StarlarkEditorSection.vue
git commit -m "app: StarlarkEditorSection route component"
```

---

## Task 2.11: Router + palette wiring

**Files:**
- Modify: `app/src/router/index.ts`
- Modify: `app/src/views/AppLayout.vue`

- [ ] **Step 1: Replace the Pkl stub + add starlark route**

Edit `app/src/router/index.ts`. Find the existing entry:

```ts
{
  path: "pkl",
  name: "settings-pkl",
  component: SettingsStub,
  props: {
    title: "Pkl config",
    icon: "developer",
    description: "An in-app editor for the daemon's Pkl configuration with live validation.",
  },
},
```

Replace it with:

```ts
{ path: "pkl",      name: "settings-pkl",      component: () => import("@/views/settings/sections/PklEditorSection.vue") },
{ path: "starlark", name: "settings-starlark", component: () => import("@/views/settings/sections/StarlarkEditorSection.vue") },
```

- [ ] **Step 2: Add starlark to the palette catalog**

In `app/src/views/AppLayout.vue`, find the `settingsSubs` array. Add an entry after the existing `pkl`:

```ts
{ id: "starlark",     label: "Starlark" },
```

- [ ] **Step 3: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -E "router|AppLayout"
```
Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add app/src/router/index.ts app/src/views/AppLayout.vue
git commit -m "app: /settings/pkl + /settings/starlark routes"
```

---

## Task 2.12: Iteration 2 — end-to-end Playwright

- [ ] **Step 1: Navigate to /settings/pkl**

Open the running UI in Playwright. Visit `http://localhost:5174/settings/pkl`. Confirm:
- Loading spinner appears briefly then the file tree populates with `main.pkl`.
- Clicking `main.pkl` loads it into Monaco; status bar shows the path; no unsaved indicator yet.

Screenshot: `pkl-editor-loaded.png`.

- [ ] **Step 2: Edit + save**

Type a harmless edit (e.g., add a comment line at the top). Status bar shows `● unsaved`. Click Save. Status returns to clean.

Verify on disk:
```bash
head -3 ~/.local/share/switchyard/config/main.pkl
```
Expected: the edit is present.

Screenshot after edit: `pkl-editor-dirty.png`.

- [ ] **Step 3: External-edit detection**

Open a separate shell, append a line to the file:
```bash
echo "// external touch" >> ~/.local/share/switchyard/config/main.pkl
```

In the UI, the banner should appear within ~5 seconds: *"This file changed on disk. Reload to reconcile."*

Click Reload. The banner clears and the file reloads with the external change visible.

- [ ] **Step 4: Conflict path**

With a clean buffer, in the editor type one edit but do NOT save. Externally append another line. Click Save. Expected: banner shows "Conflict: …". The buffer is preserved.

Click Reload. The conflict banner clears, the buffer is replaced with the on-disk content.

- [ ] **Step 5: Visit /settings/starlark**

Confirm:
- File tree filters to `.star` files. (If there are none in the dev config, the tree is empty.)
- Status bar + Monaco render.
- Bottom panel shows "Tests" header + "Run tests" button (disabled until a file is selected).

If a sample `.star` file exists, select it, click Run tests, verify the streaming response renders rows.

Screenshot: `starlark-editor.png`.

- [ ] **Step 6: Cross-page sanity sweep**

Visit /, /rooms, /devices, /activity, /automations, /settings/appearance. Confirm no console errors, no regressions.

- [ ] **Step 7: No commit**

This task is validation-only; the implementation is across the previous tasks.

---

# Iteration 3 — `SyAutomationForm`

## Task 3.1: `regenPreview` TS client

**Files:**
- Create: `app/src/data/regen-preview.ts`

- [ ] **Step 1: Create the client**

```ts
/**
 * ConfigService.RegenPreview client. Takes a typed AST (any of the
 * supported file_types) and returns the daemon's canonical Pkl bytes.
 * The form components use this to transform a structured edit into
 * the Pkl that EditSessionService.CommitEdit accepts.
 */

import { rpcCall, type RpcOptions } from "./rpc";

const SVC = "switchyard.v1alpha1.ConfigService";

export async function regenPreview(
  args: { fileType: "automation" | "page" | "scene" | "area" | "entity_areas"; astJson: string },
  opts: RpcOptions = {},
): Promise<{ pklText: string }> {
  const res = await rpcCall<typeof args, { pklBytes?: string; pkl_bytes?: string }>(
    `${SVC}/RegenPreview`, args, opts,
  );
  // pklBytes is base64-encoded on the wire (proto `bytes`); JSON
  // decoder gives us the string straight if Connect emits it as
  // base64. Either way, the client's job is to convert to plain text.
  const b64 = res.pklBytes ?? res.pkl_bytes ?? "";
  if (!b64) return { pklText: "" };
  // Connect-JSON serializes bytes as base64.
  return { pklText: atob(b64) };
}
```

- [ ] **Step 2: Typecheck + smoke probe**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "regen-preview"
```
Expected: empty.

Playwright probe:
```js
async () => {
  const m = await import("/src/data/regen-preview.ts");
  const r = await m.regenPreview({
    fileType: "area",
    astJson: JSON.stringify({ id: "test", displayName: "Test" }),
  });
  return r.pklText.slice(0, 200);
}
```
Expected: a multi-line Pkl string starting with the `import "switchyard:areas"` line.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/regen-preview.ts
git commit -m "app: regenPreview TS client"
```

---

## Task 3.2: `TriggerEditor` sub-component

**Files:**
- Create: `app/src/views/automations/TriggerEditor.vue`

- [ ] **Step 1: Create the component**

```vue
<!--
  TriggerEditor — a single trigger row. Dynamic sub-form by kind.

  v1 supports state_changed, time, event, webhook. The shape mirrors
  proto TriggerConfig's oneof.
-->
<script setup lang="ts">
import { computed } from "vue";
import { SyText, SyButton, SyInput, SyIcon } from "@/lib";

export type TriggerKind = "state_changed" | "time" | "event" | "webhook";

export interface TriggerValue {
  kind: TriggerKind;
  /** state_changed */ entity?: string;  from?: string; to?: string; holdSeconds?: number;
  /** time */         cron?: string;
  /** event */        eventKind?: string;
  /** webhook */      path?: string;
}

const props = defineProps<{ modelValue: TriggerValue }>();
const emit = defineEmits<{
  (e: "update:modelValue", v: TriggerValue): void;
  (e: "remove"): void;
}>();

const v = computed<TriggerValue>({
  get: () => props.modelValue,
  set: (next) => emit("update:modelValue", next),
});

function setKind(k: TriggerKind): void {
  v.value = { kind: k };
}

function update<K extends keyof TriggerValue>(key: K, val: TriggerValue[K]): void {
  v.value = { ...v.value, [key]: val };
}
</script>

<template>
  <div class="te">
    <div class="te__head">
      <select :value="v.kind" @change="setKind(($event.target as HTMLSelectElement).value as TriggerKind)">
        <option value="state_changed">State changed</option>
        <option value="time">Time</option>
        <option value="event">Event</option>
        <option value="webhook">Webhook</option>
      </select>
      <SyButton intent="ghost" size="sm" @click="emit('remove')">
        <SyIcon name="close" :size="12" />
      </SyButton>
    </div>

    <template v-if="v.kind === 'state_changed'">
      <SyInput
        :model-value="v.entity ?? ''"
        placeholder="entity id (e.g. light.kitchen)"
        @update:model-value="(s: string) => update('entity', s)"
      />
      <SyInput :model-value="v.from ?? ''" placeholder="from (optional)" @update:model-value="(s: string) => update('from', s)" />
      <SyInput :model-value="v.to ?? ''" placeholder="to (optional)" @update:model-value="(s: string) => update('to', s)" />
      <SyInput
        :model-value="String(v.holdSeconds ?? '')"
        placeholder="hold seconds (optional)"
        @update:model-value="(s: string) => update('holdSeconds', s === '' ? undefined : Number(s))"
      />
    </template>

    <template v-else-if="v.kind === 'time'">
      <SyInput
        :model-value="v.cron ?? ''"
        placeholder="cron (e.g. 0 9 * * MON)"
        @update:model-value="(s: string) => update('cron', s)"
      />
    </template>

    <template v-else-if="v.kind === 'event'">
      <SyInput
        :model-value="v.eventKind ?? ''"
        placeholder="event kind"
        @update:model-value="(s: string) => update('eventKind', s)"
      />
    </template>

    <template v-else-if="v.kind === 'webhook'">
      <SyInput
        :model-value="v.path ?? ''"
        placeholder="webhook path"
        @update:model-value="(s: string) => update('path', s)"
      />
    </template>
  </div>
</template>

<style scoped>
.te { display: flex; flex-direction: column; gap: var(--sy-space-2); padding: var(--sy-space-2); border: 1px solid var(--sy-color-line-soft); border-radius: var(--sy-radius-sm); }
.te__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sy-space-2); }
.te__head select { padding: 4px var(--sy-space-2); border: 1px solid var(--sy-color-line); border-radius: var(--sy-radius-sm); background: var(--sy-color-surface-2); color: var(--sy-color-fg); }
</style>
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "TriggerEditor"
```
Expected: empty.

> **Note for executor:** SyInput's API in this codebase emits `update:modelValue`. Confirm by `grep -nE "update:modelValue|emit\(" app/src/lib/components/input/SyInput.vue`. If the input variant emits something else (e.g., bare `input`), update the bindings.

- [ ] **Step 3: Commit**

```bash
git add app/src/views/automations/TriggerEditor.vue
git commit -m "app: TriggerEditor sub-component"
```

---

## Task 3.3: `ActionEditor` sub-component

**Files:**
- Create: `app/src/views/automations/ActionEditor.vue`

- [ ] **Step 1: Create the component**

v1 supports `call_service` only. Other action types render their proto kind as text and a "not supported in v1" message — preserves the row visually but prevents accidental destruction of unsupported actions on edit.

```vue
<!--
  ActionEditor — a single action row. v1 supports call_service;
  other kinds render read-only with a "not yet editable" notice.
-->
<script setup lang="ts">
import { computed } from "vue";
import { SyText, SyButton, SyInput, SyIcon } from "@/lib";

export type ActionKind = "call_service" | "unsupported";

export interface ActionValue {
  kind: ActionKind;
  /** call_service */
  entity?: string;
  capability?: string;
  args?: Record<string, string>;
  /** unsupported */
  rawJson?: string;
}

const props = defineProps<{ modelValue: ActionValue }>();
const emit = defineEmits<{
  (e: "update:modelValue", v: ActionValue): void;
  (e: "remove"): void;
}>();

const v = computed<ActionValue>({
  get: () => props.modelValue,
  set: (next) => emit("update:modelValue", next),
});

function update<K extends keyof ActionValue>(key: K, val: ActionValue[K]): void {
  v.value = { ...v.value, [key]: val };
}

const args = computed<Array<{ k: string; val: string }>>(() => {
  const m = v.value.args ?? {};
  return Object.keys(m).sort().map((k) => ({ k, val: m[k] }));
});

function setArg(k: string, val: string): void {
  v.value = { ...v.value, args: { ...(v.value.args ?? {}), [k]: val } };
}
function addArg(): void {
  v.value = { ...v.value, args: { ...(v.value.args ?? {}), "": "" } };
}
function removeArg(k: string): void {
  const next = { ...(v.value.args ?? {}) };
  delete next[k];
  v.value = { ...v.value, args: next };
}
function renameArgKey(oldKey: string, newKey: string): void {
  const next = { ...(v.value.args ?? {}) };
  const val = next[oldKey] ?? "";
  delete next[oldKey];
  next[newKey] = val;
  v.value = { ...v.value, args: next };
}
</script>

<template>
  <div class="ae">
    <div class="ae__head">
      <SyText variant="caption" weight="medium">{{ v.kind === "call_service" ? "Call service" : "Unsupported action kind" }}</SyText>
      <SyButton intent="ghost" size="sm" @click="emit('remove')">
        <SyIcon name="close" :size="12" />
      </SyButton>
    </div>

    <template v-if="v.kind === 'call_service'">
      <SyInput :model-value="v.entity ?? ''" placeholder="entity id" @update:model-value="(s: string) => update('entity', s)" />
      <SyInput :model-value="v.capability ?? ''" placeholder="capability (e.g. turn_on, set_brightness)" @update:model-value="(s: string) => update('capability', s)" />

      <div v-for="arg in args" :key="arg.k" class="ae__arg">
        <SyInput :model-value="arg.k" placeholder="arg name" @update:model-value="(s: string) => renameArgKey(arg.k, s)" />
        <SyInput :model-value="arg.val" placeholder="value" @update:model-value="(s: string) => setArg(arg.k, s)" />
        <SyButton intent="ghost" size="sm" @click="removeArg(arg.k)">
          <SyIcon name="close" :size="12" />
        </SyButton>
      </div>
      <SyButton intent="ghost" size="sm" @click="addArg">+ Add arg</SyButton>
    </template>

    <SyText v-else variant="caption" tone="subtle">
      This action kind isn't editable yet. It will be preserved as-is when you save.
    </SyText>
  </div>
</template>

<style scoped>
.ae { display: flex; flex-direction: column; gap: var(--sy-space-2); padding: var(--sy-space-2); border: 1px solid var(--sy-color-line-soft); border-radius: var(--sy-radius-sm); }
.ae__head { display: flex; align-items: center; justify-content: space-between; }
.ae__arg { display: grid; grid-template-columns: 1fr 1fr auto; gap: var(--sy-space-2); }
</style>
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "ActionEditor"
git add app/src/views/automations/ActionEditor.vue
git commit -m "app: ActionEditor sub-component (call_service only in v1)"
```

---

## Task 3.4: `ConditionEditor` (minimal v1)

**Files:**
- Create: `app/src/views/automations/ConditionEditor.vue`

- [ ] **Step 1: Create the component**

v1 supports state + numeric only. and/or/not nesting + starlark conditions deferred.

```vue
<!--
  ConditionEditor — single condition row. v1 supports state and numeric.
-->
<script setup lang="ts">
import { computed } from "vue";
import { SyText, SyButton, SyInput, SyIcon } from "@/lib";

export type ConditionKind = "state" | "numeric" | "unsupported";

export interface ConditionValue {
  kind: ConditionKind;
  /** state */
  entity?: string; equals?: string; not?: string;
  /** numeric */
  numericEntity?: string; op?: "<" | "<=" | "=" | ">=" | ">"; value?: number;
}

const props = defineProps<{ modelValue: ConditionValue }>();
const emit = defineEmits<{
  (e: "update:modelValue", v: ConditionValue): void;
  (e: "remove"): void;
}>();

const v = computed<ConditionValue>({
  get: () => props.modelValue,
  set: (next) => emit("update:modelValue", next),
});

function setKind(k: ConditionKind): void { v.value = { kind: k }; }
function update<K extends keyof ConditionValue>(key: K, val: ConditionValue[K]): void {
  v.value = { ...v.value, [key]: val };
}
</script>

<template>
  <div class="ce">
    <div class="ce__head">
      <select :value="v.kind" @change="setKind(($event.target as HTMLSelectElement).value as ConditionKind)">
        <option value="state">State</option>
        <option value="numeric">Numeric</option>
      </select>
      <SyButton intent="ghost" size="sm" @click="emit('remove')">
        <SyIcon name="close" :size="12" />
      </SyButton>
    </div>

    <template v-if="v.kind === 'state'">
      <SyInput :model-value="v.entity ?? ''" placeholder="entity id" @update:model-value="(s: string) => update('entity', s)" />
      <SyInput :model-value="v.equals ?? ''" placeholder="equals (optional)" @update:model-value="(s: string) => update('equals', s)" />
      <SyInput :model-value="v.not ?? ''" placeholder="not (optional)" @update:model-value="(s: string) => update('not', s)" />
    </template>

    <template v-else-if="v.kind === 'numeric'">
      <SyInput :model-value="v.numericEntity ?? ''" placeholder="entity id" @update:model-value="(s: string) => update('numericEntity', s)" />
      <select :value="v.op ?? '='" @change="update('op', ($event.target as HTMLSelectElement).value as ConditionValue['op'])">
        <option value="<">&lt;</option>
        <option value="<=">&le;</option>
        <option value="=">=</option>
        <option value=">=">&ge;</option>
        <option value=">">&gt;</option>
      </select>
      <SyInput
        :model-value="String(v.value ?? '')"
        placeholder="value"
        @update:model-value="(s: string) => update('value', s === '' ? undefined : Number(s))"
      />
    </template>

    <SyText v-else variant="caption" tone="subtle">Unsupported condition kind.</SyText>
  </div>
</template>

<style scoped>
.ce { display: flex; flex-direction: column; gap: var(--sy-space-2); padding: var(--sy-space-2); border: 1px solid var(--sy-color-line-soft); border-radius: var(--sy-radius-sm); }
.ce__head { display: flex; align-items: center; justify-content: space-between; }
.ce__head select { padding: 4px var(--sy-space-2); border: 1px solid var(--sy-color-line); border-radius: var(--sy-radius-sm); background: var(--sy-color-surface-2); color: var(--sy-color-fg); }
</style>
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "ConditionEditor"
git add app/src/views/automations/ConditionEditor.vue
git commit -m "app: ConditionEditor (state + numeric in v1)"
```

---

## Task 3.5: `SyAutomationForm` modal

**Files:**
- Create: `app/src/views/automations/SyAutomationForm.vue`

- [ ] **Step 1: Create the form**

```vue
<!--
  SyAutomationForm — modal that builds an AutomationConfig and writes
  the regenerated Pkl to automations/<id>.pkl via EditSessionService.
-->
<script setup lang="ts">
import { ref, computed } from "vue";
import { SySheet, SyText, SyButton, SyInput, SyIcon } from "@/lib";
import TriggerEditor, { type TriggerValue } from "./TriggerEditor.vue";
import ConditionEditor, { type ConditionValue } from "./ConditionEditor.vue";
import ActionEditor, { type ActionValue } from "./ActionEditor.vue";
import { regenPreview } from "@/data/regen-preview";
import { openForEdit, commitEdit } from "@/data/edit-session";

const props = defineProps<{
  open: boolean;
  /** When set, prefills the form for an existing automation. */
  initial?: {
    id: string;
    displayName?: string;
    triggers: TriggerValue[];
    conditions: ConditionValue[];
    actions: ActionValue[];
    areas: string[];
  };
}>();

const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "saved", id: string): void;
}>();

const id = ref<string>("");
const displayName = ref<string>("");
const triggers = ref<TriggerValue[]>([]);
const conditions = ref<ConditionValue[]>([]);
const actions = ref<ActionValue[]>([]);
const areas = ref<string[]>([]);
const saveBusy = ref<boolean>(false);
const saveError = ref<string>("");

function reset(): void {
  if (props.initial) {
    id.value = props.initial.id;
    displayName.value = props.initial.displayName ?? "";
    triggers.value = props.initial.triggers;
    conditions.value = props.initial.conditions;
    actions.value = props.initial.actions;
    areas.value = props.initial.areas;
  } else {
    id.value = "";
    displayName.value = "";
    triggers.value = [];
    conditions.value = [];
    actions.value = [];
    areas.value = [];
  }
  saveError.value = "";
}

// Reset whenever the modal opens.
import { watch } from "vue";
watch(() => props.open, (o) => { if (o) reset(); });

function close(): void { emit("update:open", false); }

function addTrigger(): void { triggers.value = [...triggers.value, { kind: "state_changed" }]; }
function addCondition(): void { conditions.value = [...conditions.value, { kind: "state" }]; }
function addAction(): void { actions.value = [...actions.value, { kind: "call_service" }]; }

function buildAst(): Record<string, unknown> {
  return {
    id: id.value,
    enabled: true,
    mode: "MODE_SINGLE",
    triggers: triggers.value.map(triggerToProto),
    conditions: conditions.value.map(conditionToProto),
    actions: actions.value.map(actionToProto),
    areas: areas.value,
  };
}

function triggerToProto(t: TriggerValue): Record<string, unknown> {
  switch (t.kind) {
    case "state_changed":
      return { stateChange: { entity: t.entity ?? "", from: t.from ?? "", to: t.to ?? "", holdSeconds: t.holdSeconds ?? 0 } };
    case "time":
      return { time: { cron: t.cron ?? "" } };
    case "event":
      return { event: { kind: t.eventKind ?? "" } };
    case "webhook":
      return { webhook: { path: t.path ?? "" } };
  }
}

function conditionToProto(c: ConditionValue): Record<string, unknown> {
  switch (c.kind) {
    case "state":
      return { state: { entity: c.entity ?? "", equals: c.equals ?? "", not: c.not ?? "" } };
    case "numeric":
      return { numeric: { entity: c.numericEntity ?? "", op: c.op ?? "=", value: c.value ?? 0 } };
    case "unsupported":
      return {};
  }
}

function actionToProto(a: ActionValue): Record<string, unknown> {
  if (a.kind === "call_service") {
    return { callService: { entity: a.entity ?? "", capability: a.capability ?? "", args: a.args ?? {} } };
  }
  return {};
}

async function save(): Promise<void> {
  if (!id.value) {
    saveError.value = "id is required";
    return;
  }
  saveBusy.value = true;
  saveError.value = "";
  try {
    const ast = buildAst();
    const { pklText } = await regenPreview({ fileType: "automation", astJson: JSON.stringify(ast) });

    const filePath = `automations/${id.value}.pkl`;
    const session = await openForEdit(filePath);
    const r = await commitEdit({
      filePath,
      lockToken: session.lockToken,
      regeneratedPkl: pklText,
      expectedFileHash: session.fileHash,
    });
    if (r.conflict) {
      saveError.value = `Conflict: ${r.conflict.reason}`;
      return;
    }
    emit("saved", id.value);
    close();
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saveBusy.value = false;
  }
}
</script>

<template>
  <SySheet :model-value="open" side="right" size="lg" title="Automation" @update:model-value="(v: boolean) => emit('update:open', v)">
    <div class="form">
      <section class="form__section">
        <SyText variant="label" tone="subtle">Identity</SyText>
        <SyInput :model-value="id" placeholder="id (e.g. morning-routine)" @update:model-value="(s: string) => id = s" />
        <SyInput :model-value="displayName" placeholder="displayName (optional)" @update:model-value="(s: string) => displayName = s" />
      </section>

      <section class="form__section">
        <div class="form__sectionHead">
          <SyText variant="label" tone="subtle">Triggers</SyText>
          <SyButton intent="ghost" size="sm" @click="addTrigger"><SyIcon name="plus" :size="12" /> Add</SyButton>
        </div>
        <TriggerEditor
          v-for="(t, i) in triggers" :key="i"
          :model-value="t"
          @update:model-value="(v: TriggerValue) => triggers[i] = v"
          @remove="triggers = triggers.filter((_, j) => j !== i)"
        />
      </section>

      <section class="form__section">
        <div class="form__sectionHead">
          <SyText variant="label" tone="subtle">Conditions</SyText>
          <SyButton intent="ghost" size="sm" @click="addCondition"><SyIcon name="plus" :size="12" /> Add</SyButton>
        </div>
        <ConditionEditor
          v-for="(c, i) in conditions" :key="i"
          :model-value="c"
          @update:model-value="(v: ConditionValue) => conditions[i] = v"
          @remove="conditions = conditions.filter((_, j) => j !== i)"
        />
      </section>

      <section class="form__section">
        <div class="form__sectionHead">
          <SyText variant="label" tone="subtle">Actions</SyText>
          <SyButton intent="ghost" size="sm" @click="addAction"><SyIcon name="plus" :size="12" /> Add</SyButton>
        </div>
        <ActionEditor
          v-for="(a, i) in actions" :key="i"
          :model-value="a"
          @update:model-value="(v: ActionValue) => actions[i] = v"
          @remove="actions = actions.filter((_, j) => j !== i)"
        />
      </section>

      <SyText v-if="saveError" variant="caption" tone="bad">{{ saveError }}</SyText>

      <footer class="form__foot">
        <SyButton intent="ghost" @click="close" :disabled="saveBusy">Cancel</SyButton>
        <SyButton intent="primary" :disabled="saveBusy || !id" @click="save">
          {{ saveBusy ? "Saving…" : "Save" }}
        </SyButton>
      </footer>
    </div>
  </SySheet>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--sy-space-4); padding: var(--sy-space-3); }
.form__section { display: flex; flex-direction: column; gap: var(--sy-space-2); }
.form__sectionHead { display: flex; align-items: center; justify-content: space-between; }
.form__foot { display: flex; gap: var(--sy-space-2); justify-content: flex-end; padding-top: var(--sy-space-3); border-top: 1px solid var(--sy-color-line-soft); }
</style>
```

> **Note for executor:** The exact proto field names (`stateChange` vs `state_change`, etc.) determine whether the AST JSON shape works. Connect-Go's JSON serializer uses lowerCamelCase for oneof field names by default. Check by triggering one save end-to-end and inspecting `RegenPreview`'s error response if the AST is malformed. The fix is local to `triggerToProto` / `conditionToProto` / `actionToProto`.

- [ ] **Step 2: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "SyAutomationForm"
```
Expected: empty (or trivial warnings from the dynamic component imports).

- [ ] **Step 3: Commit**

```bash
git add app/src/views/automations/SyAutomationForm.vue
git commit -m "app: SyAutomationForm modal — builds AST, regens, commits"
```

---

## Task 3.6: Wire `+ New` + `Edit` in `AutomationsView`

**Files:**
- Modify: `app/src/views/AutomationsView.vue`

- [ ] **Step 1: Add the form + buttons**

Find `AutomationsView.vue`. Add imports:

```ts
import SyAutomationForm from "@/views/automations/SyAutomationForm.vue";
import { ref } from "vue";
```

Add reactive state:

```ts
const formOpen = ref<boolean>(false);
const formInitial = ref<undefined | Parameters<InstanceType<typeof SyAutomationForm>["$props"]>[0] extends { initial?: infer I } ? I : never>(undefined);

function openNew(): void {
  formInitial.value = undefined;
  formOpen.value = true;
}

function openEdit(_id: string): void {
  // v1: prefill is deferred. Open the form blank; user re-enters id
  // matching the existing automation. The id-based filename means
  // saving will overwrite the existing automation correctly.
  formInitial.value = undefined;
  formOpen.value = true;
}

async function onSaved(_id: string): Promise<void> {
  await refresh(); // refresh the automations list
}
```

In the template, add a header button:

```vue
<header class="page__head">
  <SyText as="h1" variant="display">Automations</SyText>
  <div class="page__headRight">
    <SyButton intent="primary" @click="openNew">+ New</SyButton>
  </div>
</header>
```

(If the existing header doesn't have a flex layout, adjust the CSS — locate `.page__head` styles and add `display: flex; justify-content: space-between; align-items: center;`.)

On each `SyAutomationCard`, add an Edit affordance — extend the existing `menu-action` emit handler to open the edit modal:

```vue
@menu-action="(id) => id === 'edit' ? openEdit(a.id) : onMenu(a, id)"
```

(Match the existing menu-action handler name — locate it in the current AutomationsView. The id values come from SyAutomationCard's menu definition; `"edit"` is presumably one of them already.)

At the end of the template, add the modal:

```vue
<SyAutomationForm v-model:open="formOpen" :initial="formInitial" @saved="onSaved" />
```

- [ ] **Step 2: Typecheck**

```bash
cd app && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "AutomationsView"
```
Expected: minor errors are OK if they reflect existing pre-existing issues; new errors should be addressed.

- [ ] **Step 3: Commit**

```bash
git add app/src/views/AutomationsView.vue
git commit -m "app: AutomationsView + New / Edit hooks open SyAutomationForm"
```

---

## Task 3.7: Iteration 3 — end-to-end Playwright

- [ ] **Step 1: Open `+ New`**

Navigate to `http://localhost:5174/automations`. Click `+ New`. The form modal opens.

Fill in:
- id: `iter3-test`
- One trigger: state_changed, entity = `light.hue_03593af4` (or another light)
- One action: call_service, entity = same, capability = `turn_on`

Click Save. The modal closes. The new automation appears in the list within ~1 second.

Verify on disk:
```bash
cat ~/.local/share/switchyard/config/automations/iter3-test.pkl
```
Expected: a canonical Pkl file with the trigger + action.

Screenshot: `automation-form-saved.png`.

- [ ] **Step 2: Trigger the automation**

Use the kebab menu's "Run now" on `iter3-test`. The Activity feed picks up the action.

- [ ] **Step 3: Edit existing**

Click the kebab menu on `iter3-test`, choose Edit. Modal opens; in v1 it's blank (prefill deferred). Re-enter the same id with a different action (e.g., `set_brightness` with value 50). Save.

Verify on disk that the file is overwritten with the new action.

- [ ] **Step 4: Test cancel**

Open + New again. Make changes. Click Cancel. Modal closes without writing anything.

- [ ] **Step 5: Cross-page sweep**

Tour /, /rooms, /devices, /activity, /automations, /settings/pkl, /settings/starlark. No console errors.

- [ ] **Step 6: Full Go tests**

```bash
go test ./...
```
Expected: all PASS.

---

## Self-review notes

**Spec coverage:**
- Iteration 1 — Regenerator coverage → Tasks 1.1, 1.2, 1.3, 1.4.
- Iteration 2 — Text editor → Tasks 2.1 (deps), 2.2 (grammar), 2.3 (editor), 2.4 (tree), 2.5 (edit-session), 2.6 (config + script), 2.7 (test panel), 2.8 (panel composition), 2.9 (Pkl section), 2.10 (Starlark section), 2.11 (routes), 2.12 (validation).
- Iteration 3 — Form → Tasks 3.1 (regen-preview client), 3.2 (TriggerEditor), 3.3 (ActionEditor), 3.4 (ConditionEditor), 3.5 (form modal), 3.6 (AutomationsView wiring), 3.7 (validation).

**Placeholder scan:**
- Task 2.7 has a stop-and-look note about SyIcon names + RunTests schema. Acceptable — the alternative is brittle assumptions in the plan.
- Task 3.2 stop-and-look on SyInput's emit name. Acceptable.
- Task 3.5 stop-and-look on proto JSON field names. Acceptable.
- No vague "add error handling" or "test the above" without code.

**Type consistency:**
- `FileEntry` defined in `edit-session.ts` with `{path, kind}` matches the tree component's import.
- `TriggerValue` / `ConditionValue` / `ActionValue` exported from sub-components, imported by the form.
- `runTests` yields `TestEvent` discriminated union; `SyTestPanel`'s state reducer matches each case.

**Open follow-ups (not blocking):**
- Edit prefill in `SyAutomationForm` — currently blank-on-edit. Spec calls out this is v1 simplification.
- StarlarkLS integration is its own future spec.
- Other structured forms (Scene / Area / EntityAreas / Page) reuse the regen-preview client and EditSessionService flow; each is a sibling spec to this plan's Iteration 3.
