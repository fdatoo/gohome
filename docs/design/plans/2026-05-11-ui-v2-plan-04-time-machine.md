# Plan 04 — Time-machine Replay

> **Replay plan.** Requires Plan 03 (Activity + interestingness + ActivityService) merged to main before this branch starts.

**Goal:** A full-screen time-machine for scrubbing the event-store at any event, reconstructing entity state from C1 snapshots, following the causation chain, and surfacing interestingness annotations — backed by a new `ReplayService`.

**Spec refs:** §10 (Time-machine), §9 (interestingness), §3 (event sourcing / C1 snapshots).

**Branch:** `feat/ui-v2-plan-04-time-machine`
**Worktree:** `.claude/worktrees/plan-04-time-machine`
**Depends on:** Plan 03 merged to main
**Linear parent:** TBD

---

## Decisions (locked)

1. **Routes:** `/_authed/time-machine/$eventId` (event pre-selected, causation chain loaded) and `/_authed/time-machine?from=<seq>&to=<seq>` (time window). Same `TimeMachinePage` component; loader distinguishes the two forms. Full-screen takeover — rendered outside the standard Shell via a dedicated `_authed/_tm-layout.tsx` that wraps `<Outlet />` with no sidebar.

2. **`ReplayService` RPCs (new proto module `switchyard.replay.v1`):**
   - `LoadAtSeq(seq)` — find nearest snapshot ≤ seq, replay events forward, return full entity-state map + server-computed `StateDiff` vs seq-1.
   - `CausationChain(event_id)` — walk `causation_id` links and return ordered event list (root first).
   - `Window(from_seq, to_seq)` — return ordered event slice in the range (metadata only; state fetched separately on scrub).

3. **Diffs are server-side.** `StateDiff` proto: `repeated EntityDiff { entity_id; repeated FieldDiff { field, was, now } }`. Client never diffs raw maps.

4. **Scrubber:** transport (⏮ ‹ ▶/⏸ › ⏭), `step N of M · seq XXXXXXX · HH:MM:SS.mmm` position display, speed selector pill (0.25× / 1× / 2× / 4×), dotted track with color-coded event markers (`cmd` = `--sy-color-info`, `state` = `--sy-color-good`, `cfg` = `--sy-color-purple`, `err` = `--sy-color-bad`), accent vertical bar at current position. Auto-play ticks at `1000ms / speed`.

5. **Keyboard shortcuts** (via `useTimeMachineKeys` hook, suppressed when focus is in a form control): `Space` play/pause, `←`/`→` step, `⇧←`/`⇧→` jump 1 s, `f` toggle affected-only, `d` toggle diff, `Esc` exit.

6. **Center pane — three modes** (segment control, default "Affected only"):
   - **All entities:** every entity in snapshot; changed entities get accent ring + "changed this step" label.
   - **Affected only:** only entities in current `StateDiff`; empty state if diff is empty.
   - **Diff from prev:** same as Affected only + inline `<was strikethrough> → <now accent>` per changed field.
   Changed-entity accent ring: `border: 1px solid color-mix(in srgb, var(--sy-color-accent) 35%, transparent); box-shadow: 0 0 0 3px var(--sy-color-accent-soft)`.

7. **"Why interesting?" panel** in center pane below entity list: rendered when `event.tags["interestingness_reason"]` is non-empty (Plan 03 annotates this). Dashed border, `--sy-color-surface-1` background. No markdown parsing.

8. **Right Rail (`EventDetailRail`):** event-kind chip + entity name title; timestamp + seq; Diff section (field rows); Identity (`event_id`, `causation_id`, `correlation_id`); Source (`emitter`, `span_id`); Payload (JSON block with `.json-key` = `--sy-color-purple`, `.json-str` = `--sy-color-good`, `.json-num` = `--sy-color-info`).

9. **Left Causation Rail:** scrollable event list, kind-coded dots, vertical connecting line (CSS `::before`). Click → `onSeek(index)`. Header: "Causation chain" (event mode) or "Event window" (window mode).

10. **Top bar:** back link, title + replay subject subtitle, three right buttons: "Open causation chain in graph" (disabled Plan 04), "Compare to now" (disabled Plan 04), "Export trace" (NDJSON browser download).

11. **Activity "Replay" button:** `EventDetailPanel.tsx` (Plan 03 file) gains a "Replay in Time-machine" button when `event.seq !== 0`, navigating to `/_authed/time-machine/$eventId`. No other entry-points in this plan.

12. **No snapshot writes.** `snapshots.go` reads C1 snapshots only; the write path belongs to C1.

---

## File plan

### Created
```
proto/switchyard/replay/v1/replay.proto
internal/replay/service.go
internal/replay/snapshots.go
internal/replay/service_test.go
internal/replay/snapshots_test.go
web/src/routes/_authed/time-machine.tsx          ← replaces Plan 01 placeholder
web/src/pages/time-machine/TopBar.tsx + .test.tsx
web/src/pages/time-machine/Scrubber.tsx + .test.tsx
web/src/pages/time-machine/CausationRail.tsx + .test.tsx
web/src/pages/time-machine/StatePane.tsx + .test.tsx
web/src/pages/time-machine/EventDetailRail.tsx + .test.tsx
web/src/pages/time-machine/KeyboardHints.tsx
web/src/pages/time-machine/useTimeMachineKeys.ts + .test.ts
web/src/data/replay-client.ts
web/e2e/time-machine-snapshot.spec.ts
```

### Modified
```
web/src/pages/activity/EventDetailPanel.tsx      ← add Replay button
internal/api/server.go                           ← register ReplayService
```

---

## Tasks

### Task 4.1 — Define `replay.proto`

**File:** `proto/switchyard/replay/v1/replay.proto`

Define `ReplayService` with three RPCs: `LoadAtSeq`, `CausationChain`, `Window`. Messages: `EntityState` (entity_id + fields map), `FieldDiff` (field/was/now), `EntityDiff` (entity_id + repeated FieldDiff), `StateDiff` (repeated EntityDiff), plus the three request/response pairs. Import `switchyard/v1alpha1/event.proto` for the `Event` message used in chain and window responses. Follow `dev/proto-hygiene.md` conventions (package naming, field numbering, import ordering).

**Acceptance:** `buf lint` passes with no new suppressions.

**Commit:** `feat(proto): add ReplayService (UI v2 plan 04)`

---

### Task 4.2 — `buf generate`

Run `buf generate` to produce Go and TypeScript stubs from `replay.proto`. Check `buf.gen.yaml` for output directories; verify the generated files land in the right places before committing.

**Acceptance:** `go build ./...` succeeds. `task web:build` succeeds (TS client types compile under strict mode).

**Commit:** `chore(gen): buf generate for replay.proto`

---

### Task 4.3 — Snapshot + forward-replay helpers

**Files:** `internal/replay/snapshots.go`, `internal/replay/snapshots_test.go`

Implement two package-level functions with minimal interfaces (both defined in the same file; wired to C1 in `service.go`):

```go
func nearestSnapshot(ctx context.Context, store SnapshotStore, seq uint64) (Snapshot, error)
func replayForward(ctx context.Context, events EventReader, snap Snapshot, targetSeq uint64) (EntityStateMap, error)
```

`nearestSnapshot` returns the snapshot with the greatest seq ≤ the target, or a zero-value snapshot (seq=0, empty map) if none exists. `replayForward` applies events in `(snap.Seq, targetSeq]` to the snapshot's entity map and returns the result.

**TDD first:** seed a snapshot at seq 100 with `light.kitchen.brightness=18`; seed events at seq 101–105 (seq 103 sets brightness to 64). Assert `replayForward` to seq 103 returns `brightness=64`; to seq 101 returns `brightness=18`. Assert `nearestSnapshot` with seq=50 returns the zero snapshot.

**Acceptance:** `go test ./internal/replay/... -run TestSnapshot` green.

**Commit:** `feat(replay): snapshot + forward-replay helpers`

---

### Task 4.4 — `ReplayService` implementation + integration test

**Files:** `internal/replay/service.go`, `internal/replay/service_test.go`

Implement all three RPCs using the helpers from Task 4.3. `LoadAtSeq` computes the diff by calling `nearestSnapshot` + `replayForward` twice (at seq N and N-1) and diffing the resulting maps. `CausationChain` walks `cause_id` links via eventstore queries until the chain terminates. `Window` issues a range query; no snapshot reconstruction.

Register `ReplayService` in `internal/api/server.go` alongside the existing `EventService`.

**TDD:** in-memory eventstore fixture; assert `LoadAtSeq` at a seq with one brightness change produces a one-field `StateDiff`; assert `CausationChain` for a 2-parent chain returns 3 events root-first; assert `Window` excludes out-of-range events.

**Acceptance:** `go test ./internal/replay/... ./internal/api/...` green.

**Commit:** `feat(replay): ReplayService impl + integration tests`

---

### Task 4.5 — Time-machine route + `TopBar` + `Scrubber`

**Files:** `web/src/routes/_authed/time-machine.tsx`, `web/src/pages/time-machine/TopBar.tsx`, `web/src/pages/time-machine/Scrubber.tsx` (+ test files)

Replace the Plan 01 placeholder. The loader reads either `params.eventId` or `search.from` / `search.to` and calls the appropriate `replayClient` method to seed the initial step list and first state snapshot. The page renders outside the standard sidebar shell via a `_authed/_tm-layout.tsx` that renders only `<Outlet />`.

`Scrubber` is a controlled component: `{ steps, currentIndex, playing, speed, onPlay, onPause, onNext, onPrev, onFirst, onLast, onSeek, onSpeedChange }`. The track renders a dot per step at proportional positions; the accent position bar is a CSS `position: absolute` element.

**TDD (`Scrubber.test.tsx`):** `currentIndex=2` on 5 steps → position label "step 3 of 5"; clicking › fires `onNext`; clicking a speed segment fires `onSpeedChange` with that multiplier.

**Acceptance:** `task web:test` + `task web:build` green; navigating to the route renders without crash.

**Commit:** `feat(web): time-machine route + TopBar + Scrubber`

---

### Task 4.6 — `CausationRail` + click-to-seek

**File:** `web/src/pages/time-machine/CausationRail.tsx` + test

Render a scrollable list of event rows. Each row: kind-coded dot, CSS `::before` vertical connecting line, `HH:MM:SS.mmm` timestamp, event label. Clicking any row calls `onSeek(step.index)`. Active row (matching `currentIndex`) gets `--sy-color-surface-2` background; its dot gets `box-shadow: 0 0 0 3px var(--sy-color-accent-soft)`. Rail header: "Causation chain" in event mode, "Event window" in window mode.

**TDD:** active class on the correct row for `currentIndex=1` (4 events); clicking third row fires `onSeek(2)`; window-mode header is "Event window".

**Commit:** `feat(web): CausationRail with click-to-seek`

---

### Task 4.7 — `StatePane` with three view modes

**File:** `web/src/pages/time-machine/StatePane.tsx` + test

Props: `{ entities, diff, whyInteresting, mode, onModeChange }`. Three-segment mode control. Entity cards: 22×22 icon slot (warm gradient for `light.*`, cool gradient for `climate.*`, muted for others), entity id (monospace), key-value grid (110px key / `1fr` value). Changed entities: accent ring + "changed this step" label (accent color, right-aligned). In Diff mode, changed fields show `<was strikethrough> → <now accent>` inline.

"Why interesting?" panel below entity list when `whyInteresting` is non-empty: `border: 1px dashed var(--sy-color-line)`, `background: var(--sy-color-surface-1)`, plain text (no Markdown).

**TDD:** All mode → 3 entities, 1 changed, all render + changed has ring. Affected only → only 1 entity. Diff mode → changed field shows both `was` and `now`. Panel present/absent per `whyInteresting`. ESLint `switchyard/no-raw-tokens` must accept all values (all via `--sy-*`).

**Commit:** `feat(web): StatePane with All/Affected/Diff modes`

---

### Task 4.8 — `EventDetailRail`

**File:** `web/src/pages/time-machine/EventDetailRail.tsx` + test

Five sections rendered in order: (1) event-kind `<Chip>` + entity name as title, timestamp + seq in monospace; (2) **Diff** — `StateDiff` fields as two-column `was → now` rows; (3) **Identity** — `event_id`, `causation_id`, `correlation_id`; (4) **Source** — `emitter`, `span_id`; (5) **Payload** — 2-space formatted JSON with three CSS highlight classes: `.json-key` → `--sy-color-purple`, `.json-str` → `--sy-color-good`, `.json-num` → `--sy-color-info`. Section headers use `text-transform: uppercase; letter-spacing: 0.08em; color: var(--sy-color-fg-4)`. Rail background `--sy-color-surface-2`, `border-left: 1px solid var(--sy-color-line)`.

**TDD:** all five section headers present; `event_id` value renders in Identity; payload block contains formatted JSON.

**Commit:** `feat(web): EventDetailRail`

---

### Task 4.9 — Keyboard shortcuts + `KeyboardHints`

**Files:** `web/src/pages/time-machine/useTimeMachineKeys.ts` + test, `web/src/pages/time-machine/KeyboardHints.tsx`

`useTimeMachineKeys` attaches a `keydown` listener to `window` on mount and removes it on unmount. Guards: skip when `event.target` is `INPUT | TEXTAREA | [contenteditable]`. Maps: `Space` → play/pause (based on `playing` prop), `ArrowLeft/Right` → step, `Shift+ArrowLeft/Right` → jump 1 s, `f` → toggle affected-only, `d` → toggle diff, `Escape` → exit.

`KeyboardHints` is purely presentational: a bottom bar with `<kbd>` elements for each shortcut, styled with `background: var(--sy-color-surface-3); border: 1px solid var(--sy-color-line)`.

**TDD:** `→` fires `onStepForward`; `⇧→` fires `onJumpForward` not `onStepForward`; `Space` fires `onPause` when `playing=true`; no callback when `document.activeElement` is an `<input>`.

**Commit:** `feat(web): keyboard shortcuts + KeyboardHints`

---

### Task 4.10 — Interestingness annotation wiring

`replay-client.ts`'s `loadAtSeq` return type exposes `whyInteresting: string` sourced from `event.tags["interestingness_reason"]` (Plan 03 populates this field). Pass it through to `StatePane` as the `whyInteresting` prop (Task 4.7 already renders it conditionally). No new proto fields needed.

**TDD:** one additional `StatePane.test.tsx` case: render with `whyInteresting="slow driver ack"`; assert the "Why is this step interesting?" heading and the text are visible.

**Commit:** `feat(web): wire interestingness annotation into StatePane`

---

### Task 4.11 — Activity "Replay" button

**File:** `web/src/pages/activity/EventDetailPanel.tsx` (Plan 03 file)

Add a "Replay in Time-machine" button in the panel's action row. Render only when `event.seq !== 0`. On click: `router.navigate({ to: "/_authed/time-machine/$eventId", params: { eventId: event.id } })`.

**TDD (add to Plan 03's `EventDetailPanel.test.tsx`):** button present for `seq=12345`, absent for `seq=0`; click asserts `mockNavigate` called with `{ to: "/_authed/time-machine/$eventId", params: { eventId: "evt_abc" } }`.

**Commit:** `feat(web): Replay button on Activity detail panel`

---

### Task 4.12 — Playwright snapshot test

**File:** `web/e2e/time-machine-snapshot.spec.ts`

Stub the ReplayService responses with `page.route`. Navigate to `/_authed/time-machine/evt_fixture_001`. Assert: 5 scrubber dots visible; position label shows "step 1 of 5"; center pane defaults to "Affected only". Take screenshot #1. Click › twice (step to 3). Assert position label "step 3 of 5". Take screenshot #2. Commit both reference images under `web/e2e/__screenshots__/time-machine/`.

**Acceptance:** `task web:e2e` passes; both images stable across re-runs.

**Commit:** `test(web): Playwright snapshot for time-machine`

---

## Test plan

- `go test ./internal/replay/... ./internal/api/...` — green.
- `task web:test` — all component + hook tests green.
- `task web:lint` — no raw token violations in any new file.
- `task web:build` — strict TS compile succeeds.
- `task web:e2e` — snapshot tests match.
- Manual smoke: Activity → Replay → time-machine opens; scrubbing updates state pane + event detail rail.

## Acceptance criteria for merging

- All tests + typecheck + lint green locally and in CI.
- `buf lint` green; no suppressions added.
- Both route forms (`/$eventId`, `?from=&to=`) render correctly.
- Three center-pane modes all function without flash/remount.
- Keyboard shortcuts work; suppressed inside form controls.
- "Why interesting?" panel conditional on `interestingness_reason`.
- Activity Replay button navigates to correct URL.
- No raw hex/spacing values in new files — all via `--sy-*` tokens.
- Reference Playwright screenshots committed and stable.
- Linear sub-tasks all `Done`; branch merged via `git merge --no-ff`.
