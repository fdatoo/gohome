# Plan 01 — Token System + Shell + IA

> **Foundation plan.** Every other UI v2 plan inherits this one's tokens, primitives, and shell. Must merge to main before any of plans 02–13 begins.

**Goal:** A unified design-token system that produces friendly (light + dark), ambient, and developer languages; a real app shell (sidebar + top bar) replacing the one-line `Shell.tsx` stub; and a TanStack Router route tree covering the household-first IA with placeholder pages everywhere a v2 page will eventually live.

**Spec refs:** §4 (three-language architecture), §5 (information architecture), §6 (app shell), §20 (token system), §21 (relationship to C10 code).

**Branch:** `feat/ui-v2-plan-01-tokens-shell-ia`
**Worktree:** `.claude/worktrees/plan-01-tokens-shell-ia`
**Depends on:** main
**Linear parent:** TBD (filled in after issue creation)

---

## Decisions (locked — no ambiguity for the implementer)

1. **Token prefix sweep:** `--gh-*` → `--sy-*` across `web/src/**/*.css`, `web/src/**/*.{ts,tsx}`, and the ESLint rule's allow-list. No `--gh-*` remains after this plan.
2. **SDK alias rename:** `@gohome/widget-sdk` → `@switchyard/widget-sdk` in `web/tsconfig.json` `paths` and in `web/src/widget-sdk/package.json`.
3. **Four canonical `data-theme` ids:** `friendly-light`, `friendly-dark`, `ambient`, `developer`. Each owns one block in `tokens.css`. The previous `developer-light`/`developer-dark` from C10 are deleted (developer is dark-only per spec §4.3).
4. **The shell is always rendered**, except on `/login` (per C10) and inside the Ambient renderer (per Plan 7). Render an empty content area where pages haven't been built yet.
5. **Placeholder pages must compile** with the existing strict TS config and pass typecheck. Each one shows the page name + "Coming soon" + the plan that will ship it. Use a single `PlaceholderPage` component.
6. **The `LanguageProvider` accepts `friendly|ambient|developer` plus a `mode` of `light|dark|system`.** It writes both `data-theme` (the resolved theme id) and `data-language` (the language name) onto `documentElement`. Components read CSS custom properties only — never the React context — so no extra subscribers fire on theme switch.
7. **`LanguagePrimitives` provider** ships in this plan with the *friendly* primitive set wired in. Ambient/developer primitive variants are registered as `null` slots; later plans fill them in. The provider's shape must not change in later plans — only its registrations grow.
8. **Sidebar nav items render even when their target route is a placeholder.** `Pages` and `Displays` sections show "No custom pages yet." / "No displays yet." copy.
9. **Mobile responsiveness is out of scope for Plan 1.** The shell may degrade gracefully below 760px wide (sidebar collapses to a drawer toggled by a button in the top bar), but full mobile treatment is Plan 13's job.
10. **No accent color picker, no language switcher UI in Plan 1.** Settings → Theme & language is the place those will live (Plan 9). Plan 1 hardcodes the default to `friendly` + `system`.

---

## File plan

### Created

```
web/src/theme/
  tokens.ts                 ← typed exports: token names, scales, helpers
  languages/
    friendly.css            ← :root[data-theme="friendly-light|dark"]
    ambient.css             ← :root[data-theme="ambient"]
    developer.css           ← :root[data-theme="developer"]
    index.ts                ← exports language registry
  language-provider.tsx     ← LanguageProvider + useLanguage hook
  primitives-provider.tsx   ← LanguagePrimitives + usePrimitive hook
  primitives/
    button.tsx
    chip.tsx
    pill.tsx
    surface.tsx             ← the primitive surface component (used by sidebar / cards)
    index.ts

web/src/shell/
  Shell.tsx                 ← replaces the one-line stub
  Sidebar.tsx               ← rebuilt
  Sidebar.test.tsx
  TopBar.tsx                ← rebuilt
  TopBar.test.tsx
  AppRail.tsx               ← thin always-visible app rail; brand mark + reserved slots
  MobileDrawer.tsx          ← reuses existing drawer; updated for new sidebar contents
  PlaceholderPage.tsx       ← shared component for pages not yet built
  Shell.test.tsx

web/src/routes/
  _authed/index.tsx              ← redirect to /home
  _authed/home.tsx               ← placeholder (Plan 2 owns)
  _authed/rooms/index.tsx        ← placeholder
  _authed/rooms/$slug.tsx        ← placeholder
  _authed/activity.tsx           ← placeholder (Plan 3 owns)
  _authed/automations/index.tsx  ← placeholder (Plan 10 owns)
  _authed/automations/$slug.tsx  ← placeholder
  _authed/devices/index.tsx      ← placeholder
  _authed/devices/$id.tsx        ← placeholder
  _authed/settings/index.tsx     ← placeholder (Plan 9 owns)
  _authed/settings/$section.tsx  ← placeholder
  _authed/pages/$slug.tsx        ← placeholder (Plan 6 owns)
  _authed/displays/$slug.tsx     ← placeholder (Plan 7 owns)
```

### Modified

```
web/src/theme/tokens.css           ← deleted entirely; replaced by the per-language CSS files
web/src/theme/provider.tsx         ← replaced by language-provider.tsx (delete this file)
web/src/theme/types.ts             ← updated: Language, ThemeMode types
web/src/main.tsx                   ← wire LanguageProvider + LanguagePrimitives around the router
web/src/App.tsx                    ← use the new Shell
web/src/routes/__root.tsx          ← drop the inline ThemeProvider; LanguageProvider lives in main.tsx
web/src/routes/_authed/_layout.tsx ← render the Shell as the layout
web/src/eslint/no-raw-tokens.ts    ← update allow-list to include all --sy-* tokens
web/src/eslint/no-raw-tokens.test.ts ← refresh expectations
web/tsconfig.json                  ← rename @gohome/widget-sdk → @switchyard/widget-sdk
web/src/widget-sdk/package.json    ← rename name to "@switchyard/widget-sdk"
web/src/widgets/*.tsx              ← imports updated (one-line refactor each)
web/src/shell/ReconnectingBanner.tsx ← swap --gh-* → --sy-* class/var refs
web/src/dashboard/render/Grid.tsx  ← swap --gh-* → --sy-* (will be deleted by Plan 6 anyway, but token rename is now)
```

### Deleted

```
web/src/theme/provider.tsx     ← replaced by language-provider.tsx
web/src/theme/languages/developer.ts  ← absorbed into the new languages/*.css
```

---

## Token surface (final names)

All tokens use the `--sy-` prefix. Every visual value in v2 must go through a token; raw colors/radii/spacing remain banned by `switchyard/no-raw-tokens`.

```
--sy-color-bg
--sy-color-surface-1
--sy-color-surface-2
--sy-color-surface-3
--sy-color-sidebar
--sy-color-line
--sy-color-line-soft
--sy-color-fg
--sy-color-fg-2
--sy-color-fg-3
--sy-color-fg-4
--sy-color-fg-5
--sy-color-accent
--sy-color-accent-2
--sy-color-accent-soft
--sy-color-good
--sy-color-warn
--sy-color-bad
--sy-color-info
--sy-color-purple

--sy-radius-sm
--sy-radius
--sy-radius-lg
--sy-radius-xl
--sy-radius-pill

--sy-space-1
--sy-space-2
--sy-space-3
--sy-space-4
--sy-space-5
--sy-space-6

--sy-font-display
--sy-font-body
--sy-font-numeric

--sy-motion-fast
--sy-motion
--sy-motion-slow
--sy-motion-spring

--sy-shadow
--sy-shadow-2
--sy-shadow-elevated

--sy-gradient-tod                 ← ambient-language-only; other languages set to none
```

Reference values per language: see the brainstorm mockups at `.superpowers/brainstorm/71337-1778492716/screenshots/03-home-shell-01.png` (friendly light), `03-home-shell-02.png` (friendly dark), `10-ambient-v2-01.png` (ambient), `11-settings-and-developer-02.png` (developer).

---

## Tasks

### Task 1.1 — Rename `--gh-*` to `--sy-*` everywhere

**Files:** sweep across `web/src/**/*.{css,ts,tsx}` + `web/src/eslint/no-raw-tokens.ts`.

**How:** `rg -l "\\-\\-gh-" web/src | xargs sed -i '' 's/--gh-/--sy-/g'`. Then update the ESLint rule's allow-list array. Then `task web:lint` + `task web:test` must pass.

**Acceptance:** zero matches for `rg "--gh-" web/src`. `task web:lint` is green. Existing tests still pass.

**Commit:** `refactor(web): rename --gh-* tokens to --sy-* (UI v2 plan 01)`

### Task 1.2 — Rename `@gohome/widget-sdk` → `@switchyard/widget-sdk`

**Files:** `web/tsconfig.json`, `web/src/widget-sdk/package.json`, every `@gohome/widget-sdk` import.

**Acceptance:** `rg "@gohome" web/src` returns nothing. `task web:test` green.

**Commit:** `refactor(web): rename widget-sdk to @switchyard/widget-sdk`

### Task 1.3 — Author the four canonical language CSS files

Create `web/src/theme/languages/{friendly,ambient,developer}.css`. Each file owns the `:root[data-theme="..."]` block(s) for that language. Delete `web/src/theme/tokens.css` and replace its imports with a barrel: `web/src/theme/index.css` that `@import`s the three language files.

**Friendly light + dark token values:** copy from the mockup CSS in `.superpowers/brainstorm/71337-1778492716/content/home-shell.html` (search for `.light` and `.dark` blocks; transcribe to the official `--sy-*` names).

**Ambient values:** copy from `ambient-v2.html` (the `.display` styles) — the gradient stop colors, surface translucency, accent terracotta-warm.

**Developer values:** copy from `settings-and-developer.html` (the `.dev` block) — cyan accent, monospace numerics, 3–5px radii.

**Acceptance:**
- `web/src/theme/tokens.css` no longer exists.
- `web/src/theme/index.css` imports the three language files.
- `:root[data-theme="friendly-light"]` defines every token in the [Token surface](#token-surface-final-names) list.
- Snapshot test renders a static `<Surface>` component with each `data-theme` and verifies the computed `background-color` matches the language's `--sy-color-bg`.

**Commit:** `feat(web): three-language token surface (UI v2 plan 01)`

### Task 1.4 — Build `LanguageProvider` + `useLanguage`

**File:** `web/src/theme/language-provider.tsx`

**Shape:**

```ts
type Language = "friendly" | "ambient" | "developer";
type ThemeMode = "light" | "dark" | "system";

interface LanguageContextValue {
  language: Language;
  mode: ThemeMode;
  resolvedTheme: "friendly-light" | "friendly-dark" | "ambient" | "developer";
  setLanguage: (l: Language) => void;
  setMode: (m: ThemeMode) => void;
}
```

The provider must:
- Persist `language` and `mode` to `localStorage` under key `sy.theme.v2`.
- React to `prefers-color-scheme` changes when `mode === "system"`.
- Apply `documentElement.dataset.theme = resolvedTheme` and `documentElement.dataset.language = language` on mount and on any change.
- For `ambient` and `developer` languages, ignore `mode` (they're dark-only) — `resolvedTheme` is just the language id.

**TDD:**
1. Write `web/src/theme/language-provider.test.tsx`. Assertions:
   - Initial render with no localStorage sets `data-theme="friendly-light"` (matching the test env's `prefers-color-scheme: light`).
   - Calling `setMode("dark")` updates `documentElement.dataset.theme` to `"friendly-dark"`.
   - Calling `setLanguage("developer")` flips to `"developer"`, ignoring the mode.
   - Refresh: a second provider mount reads the persisted choice.
2. Implement to make the tests pass.

**Acceptance:** tests pass; existing `provider.tsx` is deleted (the new file replaces it functionally).

**Commit:** `feat(web): LanguageProvider with language + mode (UI v2 plan 01)`

### Task 1.5 — Build `LanguagePrimitives` provider + friendly primitive set

**Files:** `web/src/theme/primitives-provider.tsx`, `web/src/theme/primitives/{button,chip,pill,surface,index}.tsx`.

`LanguagePrimitives` selects which React component fills a "primitive slot" based on the active language. Friendly registers all four primitives in this plan. Ambient and developer leave their entries `null` (later plans register their variants).

**Shape:**

```ts
type PrimitiveName = "Button" | "Chip" | "Pill" | "Surface";
type PrimitiveRegistry = Partial<Record<Language, Partial<Record<PrimitiveName, React.ComponentType<any>>>>>;
function usePrimitive(name: PrimitiveName): React.ComponentType<any>;
```

The friendly primitives must use only `--sy-*` tokens and the existing `no-raw-tokens` ESLint rule must accept them.

**TDD:**
- Render `<Surface>` under `LanguagePrimitives` with `language="friendly"` — assert it renders.
- Render with `language="developer"` — assert that `usePrimitive("Surface")` returns a fallback no-op component (renders children inside a plain `<div>` with no styling), since developer hasn't registered yet. The fallback IS the contract; tests later plans add will verify their variants slot in correctly.

**Commit:** `feat(web): LanguagePrimitives provider + friendly primitive set`

### Task 1.6 — Build `Shell`, `Sidebar`, `TopBar`, `AppRail`

**Files:** `web/src/shell/{Shell,Sidebar,TopBar,AppRail}.tsx` and the matching `*.test.tsx`.

Replace `Shell.tsx`'s one-line stub. The shell wraps every page under `/_authed`. Layout reproduces the friendly mockup: `200px Sidebar | flex content`, with `TopBar` as a 14px-padded strip at the top of the content area.

`Sidebar.tsx` contains:
- Brand mark + name (`<Surface>` primitive)
- Primary nav: Home, Rooms, Activity, Automations, Devices, Settings
- "Pages" section header + empty state ("No custom pages yet.")
- "Displays" section header + empty state ("No displays yet.")
- User pill at bottom (read from `auth-store`; show "Sign in" if no user)

`TopBar.tsx` contains:
- Breadcrumb (`useRouterState` for the path)
- ⌘K palette button (renders the search affordance — but the palette itself ships in Plan 5; clicking it does nothing in Plan 1 except focus a hidden input we'll route through later)
- A small status dot (placeholder; Plan 3 will wire it to interestingness)

`AppRail.tsx` is hidden in Plan 1 (only shown in the Pkl editor in Plan 12); ship the component so Plan 12 has it ready, but it's not rendered in the default Shell.

**TDD:**
- `Shell.test.tsx`: render with a `MemoryRouter` to `/_authed/home`. Assert: sidebar has the 6 primary nav items in order; "Pages" and "Displays" sections both show their empty-state copy; `Home` nav item has the active style.
- `Sidebar.test.tsx`: render with `/_authed/activity` as the active path → assert `Activity` carries the active class; others don't.
- `TopBar.test.tsx`: assert the breadcrumb renders the current page name.

**Commit:** `feat(web): Shell + Sidebar + TopBar (UI v2 plan 01)`

### Task 1.7 — Author all v2 routes as placeholders

Create the placeholder pages listed in [File plan / Created](#created). Each placeholder uses a shared `<PlaceholderPage>` component:

```tsx
<PlaceholderPage title="Activity" plan="Plan 03" />
```

The component renders the page title in the friendly type hierarchy and a small subtle "Coming in Plan 03 — Activity v1" line below. Used by tests to confirm the route registers correctly.

`/_authed/index.tsx` should redirect to `/home`. `/_authed/_layout.tsx` wraps every authed child in `<Shell>`.

**Acceptance:** `task web:test` green; `task web:build` succeeds; manually navigating to each route renders the placeholder; the navigation reflects the active route in the sidebar.

**Commit:** `feat(web): v2 route tree with placeholder pages (UI v2 plan 01)`

### Task 1.8 — Update ESLint allow-list + delete the old developer-only token set

**File:** `web/src/eslint/no-raw-tokens.ts` — update the recognized token list to match the [Token surface](#token-surface-final-names). Delete any `--gh-*` entries.

Delete `web/src/theme/languages/developer.ts` (replaced by `developer.css`).

**Acceptance:** `task web:lint` is green with the new rule. `task web:test` green.

**Commit:** `chore(web): refresh no-raw-tokens for the --sy-* surface`

### Task 1.9 — Playwright snapshot test of the empty shell in all four themes

**File:** `web/e2e/shell-snapshot.spec.ts`

For each theme id (`friendly-light`, `friendly-dark`, `ambient`, `developer`), render the empty Home placeholder and take a full-page screenshot. Commit the reference images under `web/e2e/__screenshots__/shell-snapshot/`.

**Acceptance:** the test runs in CI via `task web:test` (vitest) — no, Playwright runs separately via `npm run test:e2e`. Add a task: `task web:e2e` to `Taskfile.yml`. Wire it into the CI matrix only when `web/` changes. Reference images checked in.

**Commit:** `test(web): Playwright snapshot of shell across all four themes`

### Task 1.10 — Update the CI workflow to run web checks on Plan 1 changes

**File:** `.github/workflows/ci.yml`

The existing `web:` change filter already triggers web jobs. Verify:
- `web-lint` runs `task web:lint`
- `web-test` runs `task web:test`
- `web-build` runs `task web:build`
- Add `web-e2e` running `task web:e2e` if not present

**Acceptance:** push the branch; CI is green.

**Commit:** `ci(web): ensure lint, test, build, e2e run for web changes`

---

## Test plan

- `task web:lint` — green (no `--gh-*` left; `switchyard/no-raw-tokens` accepts all new tokens).
- `task web:test` — green; new tests for LanguageProvider, LanguagePrimitives, Shell, Sidebar, TopBar all pass.
- `task web:build` — succeeds; the built bundle includes the three language CSS imports.
- `task web:e2e` — snapshot test of the shell renders correctly in all four themes.
- Manual smoke: `task ui:dev`, visit `/`, verify shell + nav + theme switch works (via dev-tools manually setting `documentElement.dataset.theme`).

## Acceptance criteria for merging

- All tests + typecheck + lint green locally and in CI.
- The shell renders with friendly-light by default; flipping `data-theme` to any of the other three ids produces the expected appearance (compare against the brainstorm screenshots).
- Every v2 route is reachable and renders its placeholder.
- No `--gh-*` token references remain.
- The widget-sdk alias has been renamed.
- The C10 `Shell.tsx` one-liner is replaced.
- Linear parent issue + sub-tasks transition all the way to `Done`.
- Branch is merged via `git merge --no-ff` into main.
