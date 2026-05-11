# Plan 11 — Pkl ↔ UI Canonical Edit Sessions

> **Depends on:** Plan 01 (token system + shell + IA) merged to main. Every Pkl-editing surface in v2 (automation editor save flow §16.4, in-app Pkl editor §18.4) gates on this plan.

**Goal:** Lock down the full Pkl ↔ UI architecture from §17: UI is canonical during an edit session; on-disk file unchanged until "Save & exit"; external edits mid-session trigger a conflict banner with three resolution options. Delivers `EditSessionService` proto + server, lock manager with TTL, file-watcher push, regenerability analyzer, and the web-side hook + conflict UI primitive.

**Spec refs:** §17 (full Pkl ↔ UI architecture), §16.4 (automation editor save flow).

**Mockup:** `.superpowers/brainstorm/71337-1778492716/screenshots/12-automation-editor-02.png` (conflict UI).

**Branch:** `feat/ui-v2-plan-11-pkl-ui-arch`
**Worktree:** `.claude/worktrees/plan-11-pkl-ui-arch`
**Depends on:** Plan 01 merged to main
**Linear parent:** TBD

---

## Decisions (locked — no ambiguity for the implementer)

1. **UI is canonical during edit.** Mutations stage in memory on the client only. The on-disk Pkl file is not touched until the user explicitly triggers "Save & exit." No background auto-save; no optimistic writes.

2. **New `EditSessionService` — not `ConfigService`.** The three lifecycle RPCs live on a dedicated proto service. `ConfigService` stays focused on config reads and atomic patches (MCP/CLI path). `EditSessionService` owns the long-lived session model.

3. **RPC signatures (five total):**
   - `OpenForEdit(file_path) → { session_id, lock_token, file_hash, ancestor_pkl, ast_json }` — hash is SHA-256 hex; `ancestor_pkl` is the raw Pkl text snapshotted for later 3-way merge; `ast_json` is the parsed AST for the client to hydrate.
   - `CommitEdit(file_path, lock_token, regenerated_pkl, expected_file_hash, force bool) → oneof { CommitSuccess | CommitConflict { disk_hash, disk_pkl, ancestor_pkl } }`
   - `AbandonEdit(file_path, lock_token)` — idempotent; safe to call on page unload.
   - `SessionEvents(session_id) → stream SessionEvent` — carries `ExternalEditDetected { file_path, new_hash, modified_at }` events; future plans may add more event types.
   - `AnalyzeRegenerability(file_path) → RegenerabilityReport { repeated FileOnlyRegion { start_line, end_line, reason } }` — stateless; does not require an open session.

4. **Server-side lock tracking with TTL.** A session holds a soft lock for up to 30 minutes. A heartbeat (sent over the `SessionEvents` stream every 5 minutes) resets the TTL. Multiple sessions on the same file are permitted simultaneously — this is not an exclusive lock. First-to-commit wins; the rest receive `CommitConflict`. Lock manager is in-memory only; server restart clears all sessions and clients receive `LOCK_EXPIRED` on next commit.

5. **File watcher push.** The existing config file watcher already monitors Pkl files under `~/.switchyard/`. Add a `Subscribe` hook so the editsession package can register a callback. When a watched file changes while a session has it open, push `ExternalEditDetected` over that session's `SessionEvents` stream. UI surfaces a non-blocking banner immediately; no auto-merge. Stream reconnect: buffer events for 60 seconds per session; drain on reconnect.

6. **Commit logic (server side):** lock token valid AND `expected_file_hash` matches current disk hash → write file, run `pkl eval --validate`, reload runtime, emit `ConfigApplied`. Lock expired → return `LOCK_EXPIRED` status. Hash mismatch and `force=false` → return `CommitConflict`. `force=true` with valid lock → write unconditionally and log a `ForceOverwrite` audit event.

7. **Conflict UI — three options** (per §17.3): **Discard mine** calls `AbandonEdit` then `OpenForEdit` to reload. **Force overwrite** re-submits with `force=true`; a one-time inline warning is shown first (suppressed after first acknowledgement, tracked in `localStorage` key `sy.conflict.force-warned`). **Open 3-way merge** navigates to Plan 12's Monaco merge route, passing `{ ancestorPkl, diskPkl, stagedPkl }` as route state — this plan defines the navigation contract; Plan 12 implements the Monaco surface.

8. **File-only sections.** A section is "file-only" if its compiled AST contains nodes the regenerator can't round-trip: `starlark(…)` calls, `import` statements, `let` bindings, or any non-literal non-constructor expression. `AnalyzeRegenerability` returns `FileOnlyRegion` entries with `reason` values `starlark_call | import | let_binding | nondeterministic`. The web client disables edit affordances for those regions and renders a "View source" link pointing to the relevant line range in the Pkl editor (Plan 12).

---

## File plan

### Created

```
proto/switchyard/editsession/v1/
  editsession.proto             ← EditSessionService + all messages
  editsession.pb.go             ← buf-generated (do not edit)
  editsession_grpc.pb.go        ← buf-generated

internal/editsession/
  service.go                    ← EditSessionService Connect-RPC implementation
  locks.go                      ← in-memory lock manager with TTL + heartbeat
  locks_test.go                 ← TTL expiry, concurrent sessions, heartbeat reset
  regenerability.go             ← AST walker returning RegenerabilityReport
  regenerability_test.go        ← golden cases per §17.2 (starlark, import, let, literals)
  watcher.go                    ← config watcher → session push integration
  watcher_test.go               ← file write → ExternalEditDetected integration test
  service_integration_test.go   ← open + external edit + commit → conflict end-to-end

web/src/edit-session/
  client.ts                     ← Connect-ES typed wrappers for EditSessionService
  useEditSession.ts             ← React hook: AST state, mutations, dirty count, conflict
  useEditSession.test.ts        ← unit tests: happy path + conflict path (mocked client)
  conflict-ui/
    ConflictBanner.tsx          ← banner with three resolution buttons
    ConflictBanner.test.tsx
    DiffCard.tsx                ← hunk summary card (max 5 lines + "+N more" truncation)
    DiffCard.test.tsx
    index.ts

docs/internals/
  edit-sessions.md              ← protocol reference for plan 12+ implementers (~60 lines)

web/e2e/
  edit-session-conflict.spec.ts ← Playwright: conflict banner appears mid-session
```

### Modified

```
proto/buf.gen.yaml                        ← add editsession/v1 to generation targets
internal/config/watcher.go               ← expose Subscribe hook for editsession
cmd/switchyardd/main.go                  ← register EditSessionService with Connect router
web/src/routes/_authed/automations/
  $slug.tsx                              ← save button wires through useEditSession (replaces stub)
```

---

## Tasks

### Task 11.1 — Define `editsession.proto` + buf generate

Write the proto for `EditSessionService` with all five RPCs and messages as specified in Decision 3. Update `buf.gen.yaml`. Run `buf generate`; commit generated files. `buf lint` must be green.

**Commit:** `feat(proto): EditSessionService proto (UI v2 plan 11)`

---

### Task 11.2 — Lock manager with TTL + heartbeat

**TDD.** Write `locks_test.go` first:
- `Acquire` returns a non-empty token.
- Two sessions on the same file get distinct tokens; both validate.
- After TTL elapses `Validate` returns `expired=true`.
- `Heartbeat` resets expiry; token remains valid past the original TTL.
- `Release` causes `Validate` to return `valid=false`.

Implement `LockManager` in `locks.go`. Background goroutine sweeps expired locks every minute; wired to the daemon's shutdown context.

**Commit:** `feat(editsession): in-memory lock manager with TTL (UI v2 plan 11)`

---

### Task 11.3 — Regenerability analyzer with golden cases

Write five fixture files in `internal/editsession/testdata/`:
- `plain_literal.pkl` → empty report.
- `starlark_call.pkl` → 1 region, reason `starlark_call`.
- `import_stmt.pkl` → 1 region, reason `import`.
- `let_binding.pkl` → 1 region, reason `let_binding`.
- `mixed.pkl` (plain field + starlark field) → exactly 1 region covering only the starlark line.

Implement `AnalyzeFile` in `regenerability.go` using the existing Pkl AST parser in `internal/pkl/`.

**Commit:** `feat(editsession): regenerability analyzer with golden cases (UI v2 plan 11)`

---

### Task 11.4 — `EditSessionService` implementation

Implement all five RPCs in `service.go` against the lock manager (Task 11.2) and the regenerability analyzer (Task 11.3).

`OpenForEdit`: hash the file, acquire a lock, parse AST to JSON, snapshot `ancestor_pkl` and `file_hash` in a side map keyed by `session_id`.

`CommitEdit`: validate lock (expired → `LOCK_EXPIRED`). Compare hashes. Mismatch + `force=false` → load disk content, return `CommitConflict`. Match or `force=true` → write file, `pkl eval --validate` (exec via `internal/pkl/evaluator.go`), reload config, emit `ConfigApplied`.

`AbandonEdit`: release lock, remove from side map.

`SessionEvents`: register session in watcher subscription map; drain event channel; buffer last 60 seconds for reconnect.

`AnalyzeRegenerability`: delegate to `AnalyzeFile`.

Unit tests use a fake filesystem (`afero`) for happy path and conflict path.

**Commit:** `feat(editsession): EditSessionService implementation (UI v2 plan 11)`

---

### Task 11.5 — File watcher → session push integration

Add `Subscribe(fn func(path, hash string, modifiedAt time.Time))` to `internal/config/watcher.go`. Implement `internal/editsession/watcher.go`: maintain `file_path → []chan SessionEvent`; on file event push `ExternalEditDetected` to all sessions watching that path.

Integration test in `watcher_test.go`: write a temp Pkl file, open a session, overwrite the file from outside, assert `ExternalEditDetected` arrives within 500ms.

**Commit:** `feat(editsession): file watcher → session push (UI v2 plan 11)`

---

### Task 11.6 — Register `EditSessionService` with the Connect router

Wire `editsession.NewService(lockManager, watcherSubscriber)` into `cmd/switchyardd/main.go`. The TTL sweep goroutine must respect the daemon shutdown context. `buf` reflection response must list `switchyard.editsession.v1.EditSessionService`.

**Commit:** `feat(cmd): register EditSessionService (UI v2 plan 11)`

---

### Task 11.7 — Web-side `useEditSession` hook + `client.ts`

**TDD — mock the Connect client, write tests first:**
- On mount: calls `openForEdit` + `analyzeRegenerability` in parallel; populates `ast`, `fileHash`, `sessionId`, `fileOnlyRegions`.
- `mutate` increments `dirtyCount`.
- `save` (happy path) calls `commitEdit` with current `fileHash` and `force=false`; clears `dirtyCount`.
- `save` on `CommitConflict` response sets `conflict` state with `diskHash` and `diskPkl`.
- `discard` calls `abandonEdit`, then `openForEdit`; resets `dirtyCount` to 0.
- `resolveConflict({ kind: "force" })` re-calls `commitEdit` with `force=true`; on success clears `conflict`.
- `resolveConflict({ kind: "merge" })` returns merge context; does not call any RPC.
- `beforeunload` calls `abandonEdit`.

Implement `client.ts` (Connect-ES typed wrappers) then `useEditSession.ts` to make tests pass.

**Commit:** `feat(web): useEditSession hook + Connect client (UI v2 plan 11)`

---

### Task 11.8 — Conflict banner + diff cards

**TDD — write tests first:**
- `ConflictBanner` renders all three buttons with correct labels.
- "Discard mine" calls `onDiscard`.
- "Overwrite file" without prior `sy.conflict.force-warned` shows inline confirm step; calls `onForceOverwrite` only after "Confirm."
- "Overwrite file" with `sy.conflict.force-warned` set skips the confirm step.
- "Open 3-way merge →" calls `onOpenMerge`.
- `DiffCard` with 6 changed lines shows 5 and a "+1 more line" label.

Implement `ConflictBanner.tsx` and `DiffCard.tsx`. Banner uses `--sy-color-warn`-accented strip (not a modal). Copy: "External edit detected — `<filename>` changed on disk `<relative time>` after you opened it. You have `<dirtyCount>` unsaved change(s). Choose how to reconcile."

**Commit:** `feat(web): ConflictBanner + DiffCard components (UI v2 plan 11)`

---

### Task 11.9 — Integration test: open + mutate + external write + commit → conflict

Full stack integration test in `service_integration_test.go` using a real temp directory:
1. Write `test.pkl`; call `OpenForEdit` → capture `lock_token`, `file_hash`.
2. Overwrite `test.pkl` from outside (simulates MCP/CLI edit).
3. Assert `ExternalEditDetected` arrives on the `SessionEvents` stream within 1 second.
4. Call `CommitEdit` with original `expected_file_hash`, `force=false`.
5. Assert response is `CommitConflict` with non-empty `disk_pkl`.

**Commit:** `test(editsession): integration test open + external edit + conflict (UI v2 plan 11)`

---

### Task 11.10 — Documentation snippet for plan implementers

Write `docs/internals/edit-sessions.md` (~60 lines) covering: the five RPCs and their invariants; lock semantics (soft lock, TTL, first-to-commit wins); `SessionEvents` reconnect contract; how plan 10 (automation editor) and plan 12 (Pkl editor) consume `useEditSession`; the file-only regions contract (disabled fields + "View source" link).

**Commit:** `docs: edit-sessions protocol reference for plan implementers`

---

### Task 11.11 — Playwright test: conflict banner appears mid-session

`web/e2e/edit-session-conflict.spec.ts` against a live `switchyardd` in test mode (`TEST_SERVER_URL` env var; test is `.skip`-ped if absent):
1. Navigate to the automation editor for a test automation file; make a form change.
2. Overwrite the `.pkl` file on disk via Node `fs`.
3. Assert the `ConflictBanner` appears within 2 seconds.
4. Click "Discard mine"; assert the banner disappears and dirty count returns to 0.

**Commit:** `test(web/e2e): Playwright conflict banner mid-session (UI v2 plan 11)`

---

### Task 11.12 — Wire save flow in automation editor stub

Update `web/src/routes/_authed/automations/$slug.tsx` so that the "Save & exit" button calls `useEditSession.save()` and the "Discard" button calls `useEditSession.discard()`. Render `<ConflictBanner>` when `conflict` state is non-null. This is the first real consumer of the session protocol.

**Commit:** `feat(web): wire automation editor save/discard to useEditSession (UI v2 plan 11)`

---

## Test plan

- `go test ./internal/editsession/...` — lock manager, regenerability golden cases, service unit tests, watcher integration test, end-to-end conflict integration test all pass.
- `task web:test` — `useEditSession` and conflict-ui component tests pass.
- `task web:e2e` — Playwright conflict banner test passes with live server; skipped gracefully without.
- `go build ./...` — no compilation errors.
- `buf generate && buf lint` — proto valid; generated code up to date.

## Acceptance criteria for merging

- All tests + typecheck + lint green locally and in CI.
- `EditSessionService` reachable via Connect reflection on a running `switchyardd`.
- Open → mutate → save writes the correct Pkl to disk and emits `ConfigApplied`.
- External file write while session is open delivers `ExternalEditDetected` within 1 second.
- `CommitEdit` with a stale hash returns `CommitConflict`; the web client shows `ConflictBanner`.
- All three conflict resolutions behave as specified (discard, force, merge navigation contract).
- `docs/internals/edit-sessions.md` is present and accurate.
- Linear parent issue + sub-tasks transition all the way to `Done`.
- Branch merged via `git merge --no-ff` into main.
