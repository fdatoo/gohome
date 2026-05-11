# Plan 02 — Home Page (Curated Overview)

> **Depends on Plan 01 merged to main.** Replaces the `home.tsx` placeholder with the real curated Home implementation. No edit mode; the Home page is server-curated.

**Goal:** Ship the six-section curated Home page in the friendly language (light + dark), wired to mock data that future plans will replace with live RPCs.

**Spec refs:** §7 (Home), §3 (design principles), §9 (interestingness — Home surfaces high-severity stories), §20 (token system; consume tokens only).

**Branch:** `feat/ui-v2-plan-02-home-page`
**Worktree:** `.claude/worktrees/plan-02-home-page`
**Depends on:** Plan 01 (`feat/ui-v2-plan-01-tokens-shell-ia`) merged to main
**Linear parent:** TBD (filled in after issue creation)

---

## Decisions (locked — no ambiguity for the implementer)

1. **Greeting time bands:** "Good morning" 05:00–11:59, "Good afternoon" 12:00–17:29, "Good evening" 17:30–20:59, "Good night" 21:00–04:59. Computed from `Date` in the browser; no server round-trip.
2. **Greeting calm/alert copy:** calm → "· everything looks calm." · 1 alert → "· 1 thing needs attention." · N alerts → "· N things need attention." The dot is U+00B7 (mid-dot) with a surrounding space, matching the mockup.
3. **Status row shows exactly four pills in this order:** entities online (`87 of N online`), automations active (`N automations active`), driver health (only shown when a driver is reconnecting — e.g., "Z2M driver reconnecting" in `--sy-color-warn`). If no driver alert exists the third pill is omitted; a fourth pill for last-config-applied is shown instead. Pills color-code with `--sy-color-good`, `--sy-color-warn`, `--sy-color-bad` per their category.
4. **"Right now" strip shows exactly four stat tiles:** Indoor temp (primary climate metric), Office CO₂ (most interesting sensor), Lights on (e.g., "6 / 23"), Events/min (avg 128). Labels and units are hard-coded in Plan 02 mock data; Plan 03 (Activity) will wire events/min to live data via `// TODO(plan-03)`.
5. **Rooms grid:** 3-column CSS grid, up to 8 rooms, each tile shows room name, entity count subtitle, up to 3 inline scene chips, and a state pill (e.g., "Off" / "Bright"). "View all →" link to `/rooms`.
6. **Recent activity:** top 3 stories only, filtered from mock data tagged with any interestingness category. Each row: colored left-edge indicator using the category's token color, story title, relative timestamp. "All activity →" link to `/activity`.
7. **Active automations:** automations whose `next_run_at` is ≤ now+3600s or whose `last_run_at` is ≤ now+60s (i.e., recently fired or due within the hour). Shows automation name and a "Run now" button (no-op in Plan 02; Plan 10 wires it). "All automations →" link.
8. **Section ordering is fixed** as shown in the mockup: Greeting → Status row → Right Now strip → Rooms grid → Recent activity → Active automations. No user reordering.
9. **No skeleton loaders in Plan 02.** Mock hooks return data synchronously. Plan 03 will introduce suspense/loading states when real RPCs land.
10. **The `home.tsx` route file stays thin** — it imports and composes the six section components; no logic lives in the route file itself.
11. **Token consumption only:** every color, spacing, radius, and font value in the new components must use `--sy-*` tokens. The `switchyard/no-raw-tokens` ESLint rule must stay green.
12. **No `ActiveAutomationsSection` "Run now" RPC call in Plan 02.** The button renders and is enabled but calls a `console.warn("TODO(plan-10): wire Run now")` stub.

---

## File plan

### Created

```
web/src/pages/home/
  GreetingSection.tsx
  GreetingSection.test.tsx
  StatusRowSection.tsx
  StatusRowSection.test.tsx
  RightNowStripSection.tsx
  RightNowStripSection.test.tsx
  RoomsGridSection.tsx
  RoomsGridSection.test.tsx
  RecentActivitySection.tsx
  RecentActivitySection.test.tsx
  ActiveAutomationsSection.tsx
  ActiveAutomationsSection.test.tsx
  index.ts                          ← barrel: re-exports all six sections

  hooks/
    useHomeGreeting.ts              ← derives greeting string + calm/alert copy from time + alert count
    useHomeGreeting.test.ts
    useHomeStatus.ts                ← returns status pill data (mock; TODO(plan-03))
    useHomeRightNow.ts              ← returns four stat tiles (mock; TODO(plan-03))
    useHomeRooms.ts                 ← returns up to 8 room summaries (mock; TODO(plan-02-rooms))
    useHomeActivity.ts              ← returns top-3 recent stories (mock; TODO(plan-03))
    useHomeAutomations.ts           ← returns active/due automations (mock; TODO(plan-10))

web/e2e/home-snapshot.spec.ts       ← Playwright snapshot in friendly-light + friendly-dark
```

### Modified

```
web/src/routes/_authed/home.tsx     ← replace PlaceholderPage with the real Home composition
```

### Deleted

_(none — the Plan 01 placeholder is replaced in-place, not deleted separately)_

---

## Tasks

### Task 2.1 — `useHomeGreeting` hook

**Files:** `web/src/pages/home/hooks/useHomeGreeting.ts`, `useHomeGreeting.test.ts`

**How:** The hook accepts `{ alertCount: number }` and returns `{ greeting: string; statusLine: string }`. `greeting` is derived from `new Date()` using the time-band decision above. `statusLine` is the calm / 1 alert / N alerts string.

**TDD:**
1. `it('returns "Good morning" between 05:00 and 11:59')` — mock `Date` to 08:30; assert `greeting === "Good morning"`.
2. `it('returns "Good afternoon" at noon')` — mock to 12:00.
3. `it('returns calm copy when alertCount is 0')` — assert `statusLine === "· everything looks calm."`.
4. `it('returns singular alert copy when alertCount is 1')` — assert `statusLine === "· 1 thing needs attention."`.
5. `it('returns plural copy when alertCount is 3')` — assert `statusLine === "· 3 things need attention."`.

**Acceptance:** All five tests pass; hook has no side effects.

**Commit:** `feat(web): useHomeGreeting hook (UI v2 plan 02)`

---

### Task 2.2 — `GreetingSection` component

**Files:** `web/src/pages/home/GreetingSection.tsx`, `GreetingSection.test.tsx`

**How:** Renders a single `<h1>` using `--sy-font-display` that concatenates the greeting and status line. Calls `useHomeGreeting` with an `alertCount` prop passed in. No interaction affordances.

**TDD:**
1. `it('renders the greeting and calm status together')` — render `<GreetingSection alertCount={0} />` with a mocked time of 14:00; assert the element text includes "Good afternoon" and "everything looks calm".
2. `it('applies no edit affordances — no buttons rendered')` — assert `queryByRole('button')` returns null.

**Acceptance:** Tests pass; the `<h1>` text matches the mockup exactly for a 14:00 render with 0 alerts.

**Commit:** `feat(web): GreetingSection (UI v2 plan 02)`

---

### Task 2.3 — `StatusRowSection` + `RightNowStripSection`

**Files:** `StatusRowSection.tsx`, `StatusRowSection.test.tsx`, `RightNowStripSection.tsx`, `RightNowStripSection.test.tsx`, `hooks/useHomeStatus.ts`, `hooks/useHomeRightNow.ts`

**How:** `useHomeStatus` returns a static array of `{ label: string; severity: 'good' | 'warn' | 'bad' | 'neutral' }` items (mock; `// TODO(plan-03): replace with real EntityService + interestingness data`). `StatusRowSection` maps these to pill components using `--sy-color-good` / `--sy-color-warn` / `--sy-color-bad`. `useHomeRightNow` returns four `{ label, value, unit, sublabel }` objects (mock). `RightNowStripSection` renders them in a 4-column flex row of stat tiles.

**TDD:**
1. `it('renders four stat tiles')` — render `<RightNowStripSection />` and assert exactly 4 tiles appear.
2. `it('StatusRowSection renders a warn pill for reconnecting drivers')` — pass mock data with `severity: 'warn'`; assert the pill uses the warn color class/token.
3. `it('StatusRowSection omits driver pill when no driver alert')` — pass mock with no warn items; assert no warn-colored pill is present.

**Acceptance:** Tests pass; no raw color literals in either component file.

**Commit:** `feat(web): StatusRowSection + RightNowStripSection (UI v2 plan 02)`

---

### Task 2.4 — `RoomsGridSection`

**Files:** `RoomsGridSection.tsx`, `RoomsGridSection.test.tsx`, `hooks/useHomeRooms.ts`

**How:** `useHomeRooms` returns an array of up to 8 `{ id, name, entityCount, scenes: string[], statePill: string }` objects (mock; `// TODO(plan-02-rooms): replace with EntityService.Subscribe room entities`). `RoomsGridSection` renders a 3-column CSS grid. Each tile: room name (bold), entity count subtitle, up to 3 scene chips using the `Chip` primitive from `LanguagePrimitives`, and a state pill. "View all →" links to `/rooms`.

**TDD:**
1. `it('renders up to 8 room tiles')` — pass 10 mock rooms; assert exactly 8 tiles are rendered (first 8 only).
2. `it('renders a "View all" link pointing to /rooms')` — assert `getByRole('link', { name: /View all/i }).getAttribute('href')` equals `/rooms`.
3. `it('each tile shows room name and entity count')` — assert first tile has text "Kitchen" and "3 lights".

**Acceptance:** Tests pass; scene chips use the `Chip` primitive (not a raw `<button>`).

**Commit:** `feat(web): RoomsGridSection (UI v2 plan 02)`

---

### Task 2.5 — `RecentActivitySection` + `ActiveAutomationsSection`

**Files:** `RecentActivitySection.tsx`, `RecentActivitySection.test.tsx`, `ActiveAutomationsSection.tsx`, `ActiveAutomationsSection.test.tsx`, `hooks/useHomeActivity.ts`, `hooks/useHomeAutomations.ts`

**How:** `useHomeActivity` returns 3 `{ id, title, kindPill, relativeTime, severityColor }` objects (mock; `// TODO(plan-03): replace with EventService.Tail stories coalescer`). `RecentActivitySection` renders each as a row with a colored left-edge indicator, story title, and relative timestamp. "All activity →" links to `/activity`.

`useHomeAutomations` returns automations due/recently-run (mock; `// TODO(plan-10): replace with AutomationService.List`). `ActiveAutomationsSection` renders each with name, time label ("in 47 min" / "10:30 PM"), and a "Run now" `<Button>` primitive that calls `console.warn("TODO(plan-10): wire Run now to AutomationService")`. "All automations →" links to `/automations`.

**TDD:**
1. `it('RecentActivitySection renders exactly 3 activity rows')` — assert 3 rows.
2. `it('RecentActivitySection "All activity" link points to /activity')` — assert href.
3. `it('ActiveAutomationsSection renders "Run now" buttons')` — render with 2 mock automations; assert 2 buttons with text "Run now".
4. `it('ActiveAutomationsSection "Run now" button does not throw')` — fire click; assert no thrown errors (console.warn is the only side effect).

**Acceptance:** Tests pass; `RecentActivitySection` left-edge indicator uses `--sy-color-bad` / `--sy-color-warn` tokens (not raw hex) keyed from `severityColor`.

**Commit:** `feat(web): RecentActivitySection + ActiveAutomationsSection (UI v2 plan 02)`

---

### Task 2.6 — Wire `home.tsx` route + barrel export

**Files:** `web/src/routes/_authed/home.tsx`, `web/src/pages/home/index.ts`

**How:** Replace the `<PlaceholderPage title="Home" plan="Plan 02" />` stub with a `<HomePage />` component that composes all six sections in order: `GreetingSection`, `StatusRowSection`, `RightNowStripSection`, `RoomsGridSection`, `RecentActivitySection`, `ActiveAutomationsSection`. The `<HomePage>` component lives in `web/src/pages/home/index.ts` (or alongside); `home.tsx` is a thin route that just renders `<HomePage />`. No `alertCount` plumbing yet — `GreetingSection` derives alert count from the status hook internally.

**TDD:**
1. `it('home route renders all six sections')` — render `<HomePage />` inside a `MemoryRouter`; assert presence of the greeting `<h1>`, a stat tile, a room tile, an activity row, and a "Run now" button.
2. `it('home route has no edit button')` — assert `queryByRole('button', { name: /edit/i })` returns null.

**Acceptance:** `task web:test` green. `task web:build` succeeds. Navigating to `/home` in the dev server shows the full curated page in both friendly-light and friendly-dark (verified by manually toggling `document.documentElement.dataset.theme`).

**Commit:** `feat(web): wire Home route to real curated page (UI v2 plan 02)`

---

### Task 2.7 — Playwright snapshot test for Home in friendly-light and friendly-dark

**Files:** `web/e2e/home-snapshot.spec.ts`

**How:** For each of `['friendly-light', 'friendly-dark']`, navigate to `/home`, set `document.documentElement.dataset.theme` via `page.evaluate`, wait for the greeting heading to be visible, take a full-page screenshot. Commit reference images to `web/e2e/__screenshots__/home-snapshot/`.

**TDD:**
1. `it('Home renders in friendly-light without visual regressions')` — `toHaveScreenshot('home-friendly-light.png')`.
2. `it('Home renders in friendly-dark without visual regressions')` — `toHaveScreenshot('home-friendly-dark.png')`.

**Acceptance:** `task web:e2e` passes. Reference images checked in. The greeting heading is visible in both screenshots.

**Commit:** `test(web): Playwright snapshot of Home in friendly-light and friendly-dark`

---

## Test plan

- **`task web:lint`** — green; no raw color/spacing literals in any new `web/src/pages/home/**` file; `switchyard/no-raw-tokens` accepts all `--sy-*` references.
- **`task web:test`** — green; 14 unit/component tests pass across the seven new test files (`useHomeGreeting`, `GreetingSection`, `StatusRowSection`, `RightNowStripSection`, `RoomsGridSection`, `RecentActivitySection`, `ActiveAutomationsSection`, `home route`).
- **`task web:build`** — succeeds; the bundle includes the Home page split.
- **`task web:e2e`** — both Playwright snapshot tests pass against committed reference images.
- **Manual smoke:** `task ui:dev` → visit `/home` → verify greeting reflects current time of day, stat tiles render, rooms grid shows 6 tiles, recent activity shows 3 rows, active automations section visible. Toggle `document.documentElement.dataset.theme` between `friendly-light` and `friendly-dark`; verify appearance matches the mockup screenshots `03-home-shell-01.png` and `03-home-shell-02.png`.

---

## Acceptance criteria for merging

- All tests, typecheck, and lint are green locally and in CI.
- The Home route at `/home` renders the full curated page with all six sections.
- There is no "Edit page" button or any edit affordance anywhere on the page.
- The greeting reflects the correct time band at the time the page loads.
- Playwright reference images for `friendly-light` and `friendly-dark` are committed and match the brainstorm mockups.
- No `--gh-*` token references introduced. No raw color or spacing literals in new files.
- All mock hooks have `// TODO(plan-N): replace with real …` comments naming the plan that will wire them up.
- `task web:build` produces no type errors.
- Linear parent issue + sub-tasks transition all the way to `Done`.
- Branch is merged via `git merge --no-ff` into main.
