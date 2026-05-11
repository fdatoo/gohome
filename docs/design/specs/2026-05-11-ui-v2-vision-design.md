# Switchyard UI v2 — Vision Design

**Date:** 2026-05-11
**Status:** Draft (vision spec, decomposes into multiple implementation plans)
**Supersedes (partially):** [C10 — Web UI Architecture](./2026-04-26-c10-web-ui-architecture-design.md)
**Mockup screenshots:** `.superpowers/brainstorm/71337-1778492716/screenshots/` (paths cited inline)

---

## Table of Contents

1. [Scope](#1-scope)
2. [Background and Relationship to C10](#2-background-and-relationship-to-c10)
3. [Design Principles](#3-design-principles)
4. [Three-Language Architecture](#4-three-language-architecture)
5. [Information Architecture](#5-information-architecture)
6. [The App Shell](#6-the-app-shell)
7. [Home — Curated Overview](#7-home--curated-overview)
8. [Activity — The Event Log as Headline Feature](#8-activity--the-event-log-as-headline-feature)
9. [Interestingness Taxonomy](#9-interestingness-taxonomy)
10. [Time-Machine — Replay Semantics](#10-time-machine--replay-semantics)
11. [Command Palette](#11-command-palette)
12. [Custom Pages and the Three-Tier Widget Contract](#12-custom-pages-and-the-three-tier-widget-contract)
13. [Ambient Language and Displays](#13-ambient-language-and-displays)
14. [Developer Language](#14-developer-language)
15. [Settings Architecture](#15-settings-architecture)
16. [Automation Editor](#16-automation-editor)
17. [Pkl ↔ UI Architecture](#17-pkl--ui-architecture)
18. [In-App Pkl and Starlark Editor](#18-in-app-pkl-and-starlark-editor)
19. [Mobile](#19-mobile)
20. [Token System](#20-token-system)
21. [Migration from C10](#21-migration-from-c10)
22. [Implementation Order](#22-implementation-order)
23. [Decision Record](#23-decision-record)
24. [Explicit Deferrals](#24-explicit-deferrals)

---

## 1. Scope

UI v2 is a comprehensive rethink of the Switchyard web experience now that the platform plumbing (event store, carport, drivers, Pkl config, Connect-RPC, auth, dashboard subsystem) is in place. C10 shipped the *foundation* — embedded SPA, design-token substrate, multiplexer, dashboard render/edit, widget packs, PWA shell. UI v2 keeps the foundation, ships every feature page the master design names, and reshapes parts of C10 that no longer match where the product is going.

### 1.1 In scope

- A new **app shell and IA** that supports the full Switchyard surface: Home, Rooms, Activity, Automations, Devices, Settings, Pages, and Displays.
- **Three first-class language presets** — `friendly` (default, light + dark), `ambient` (wall display / lock screen), `developer` (forcing function for theming-engine expressiveness). All three ship in v2.
- A **curated Home page** (no edit mode) that aggregates rooms, activity, automations, and system status.
- A **full Activity page** with three tabs (Stories / All events / Saved), facets, sparkline, slide-in detail panel, and **Time-machine** for replay.
- An **"interestingness" detector pipeline and taxonomy** that drives Stories prioritization, Time-machine annotations, ambient alerts, and Home-page surfacing.
- A **command palette** (⌘K) with verb + argument parsing, configurable live CLI preview, and context-aware suggestions. Powers CLI parity in the web app.
- **Custom Pages** — repositions the C10 dashboard subsystem as an opt-in power-user surface. Replaces the 12-column grid with stacked typed sections and a three-tier widget contract (Section / Tile / Cell).
- **Displays** — Custom Pages bound to a fixed device, rendered in the ambient language by default. Per-tile fidelity (width × inline-scenes × metric slot).
- A **Settings sub-shell** with sections for Account, Drivers, Pkl config, Widget packs, Displays, Theme & language, Diagnostics, About.
- An **Automation editor** with form-shaped triggers/conditions/actions and Starlark-aware mixed editability.
- The **Pkl ↔ UI architecture**: UI is canonical during edit sessions; non-round-trippable sections render read-only with a "View source" link; conflict resolution surfaces a 3-way merge when external edits land mid-session.
- An **in-app Pkl + Starlark editor** (Monaco-backed) used for direct file editing, conflict resolution, and "View source" navigation from form editors. Starlark inside `starlark("…")` Pkl calls is highlighted as a real embedded language.
- A **mobile experience** that is first-class for daily use: 4-tab bottom bar, top-right search affordance, sheet-based detail throughout, operator surfaces explicitly read-only.
- A **token system architecture** documented well enough to produce all three languages, in light and dark where applicable, with confidence that future language presets are tractable extensions.

### 1.2 Out of scope (deferred — see §24)

- Native mobile apps (PWA remains the only mobile surface).
- Voice / Siri Shortcuts integration for mobile quick-actions.
- Server-side `Dry-run` execution mode (one of the three "replay" semantics; see §10).
- Multi-user real-time collaborative editing (the Pkl-canonical model assumes one editor at a time per file; conflicts are post-hoc).
- Trace flamechart view (the causation-chain timeline inside Time-machine is sufficient for v2).
- Plug-in detectors for the interestingness pipeline (v2 ships a fixed taxonomy; user-defined detectors are deferred).
- A graphical floor-plan section type (mentioned as a section but not implemented in v2).

### 1.3 Inherited from C10

- React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui + Radix + Framer Motion + TanStack Query + TanStack Router + Connect-ES.
- Single binary, single port, embedded assets via `embed.FS`.
- HttpOnly cookie session with Connect interceptor refresh-on-401.
- Two-stream multiplexer (`EntityService.Subscribe` + filtered `EventService.Tail`).
- Pkl as source of truth for layouts; deterministic regenerator with two-file split.
- Widget pack format (OCI artifact with sigstore signing).
- PWA shell-only caching.

---

## 2. Background and Relationship to C10

C10 ("Web UI Architecture") shipped April 2026 as the *foundation + dashboard subsystem*. Its §23 explicitly deferred every feature page beyond Login and `/dashboards/:slug` to follow-on work. UI v2 is that follow-on, plus reshaping decisions C10 made that no longer match the product direction.

What UI v2 keeps from C10:

- The data/RPC layer entirely.
- The design-token substrate and theming-via-tokens approach.
- Pkl-source-of-truth for user-editable surfaces.
- The widget pack distribution model (OCI + cosign + dynamic `import()` with content-hash cache keys).
- The PWA shell, multiplexer, pending-state UX, login flow, and admin recovery-mode surface.

What UI v2 changes from C10:

- **Languages:** C10 ships `developer` as the only preset; `friendly` and `ambient` are listed as deferred extension targets. UI v2 ships all three, makes `friendly` the default, and uses `developer` as a forcing function to verify the theming engine.
- **Dashboard subsystem:** C10 makes WYSIWYG-edited dashboards the home page and the central interaction model. UI v2 reframes this as the *Custom Pages + Displays* opt-in surface, with a curated server-generated Home page as the daily landing.
- **Widget contract:** C10 has one `WidgetInstance` type laid out on a 12-column grid. UI v2 introduces three tiers — Section / Tile / Cell — replacing the grid with stacked typed sections. C10 widget packs migrate to declared tiers (most become Sections).
- **IA:** C10 implies a flat route inventory copied from the master design (`/dashboards`, `/entities`, `/automations`, `/events`, `/config`, `/drivers`, `/auth`, `/settings`). UI v2 adopts a **household-first IA** (Home / Rooms / Activity / Automations / Devices / Settings + Pages + Displays sections), keeping technical surfaces accessible but not as the top-level vocabulary.
- **Event log:** C10 doesn't design the events page in detail. UI v2 treats it as the headline feature, with three tabs, an interestingness pipeline, and Time-machine for replay.

The master design's commitment to event sourcing as the spine, Pkl as the source of truth for user state, and AI agents as first-class API consumers are all preserved and reinforced.

---

## 3. Design Principles

1. **Native, solid, never dinky.** The aesthetic target is Tower / Tailscale / Stripe Dashboard for friendly mode and Apple Home / Things for ambient. The product must feel like a craft tool, not a hobbyist web page.
2. **Friendly is the default; developer earns its keep.** The friendly language is built for the household; developer is the proof that the theming engine can do real work, and ships for users who want it.
3. **CLI parity in the web app.** Every CLI action is reachable through the command palette as a typed verb + args, with a configurable live CLI-equivalent preview.
4. **Event sourcing is visible.** Stories, Time-machine, causation chains, OTel spans, and the All-events explorer all surface that Switchyard *is* an event-sourced system. Users can understand their home by reading what happened.
5. **Pkl is the source of truth.** The UI never invents server-side state; it mutates Pkl through typed RPCs. Anything the UI can do, MCP agents and the CLI can do too.
6. **Operator surfaces don't pretend to be consumer surfaces.** Mobile downgrades Pkl/Automation/Driver editing to read-only with an honest "Editing on a larger screen" banner. The product respects when something needs a desk.
7. **One interaction primitive per problem.** Bottom-sheet detail on mobile, slide-in right rail on desktop, no per-page inventions. Forms render the same way everywhere. The same Monaco editor primitive serves Pkl, Starlark, and 3-way merge.
8. **Interestingness is structured.** A finite, typed detector catalog drives what gets surfaced, where, and how loudly. The UI consumes tags; it does not compute them.

---

## 4. Three-Language Architecture

The `language` system is the central architectural commitment of UI v2. A *language* is a coordinated bundle of design tokens, primitive components, vocabulary defaults, and per-page layout choices. Languages are runtime presets, switchable per-user and per-Display. All three ship in v2.

### 4.1 `friendly` — default

- **Reference points:** Tower, Tailscale, Stripe Dashboard.
- **Aesthetic:** breathable, well-crafted, native-app feel. Generous spacing. Typography hierarchy via Inter weights, not size jumps.
- **Surfaces:** light cream (`#f6f5f1`) or dark warm-tinted (`#14141a`), accented in terracotta (`#d97757` light / `#e89372` dark).
- **Both light and dark mode are first-class.** The user picks light/dark/system in Settings → Theme & language; the language is the same in either mode.
- **Vocabulary:** household-shaped. Rooms, Activity, Devices, Automations. Power-user concepts (entities, events, drivers, Pkl) live one level in.
- **Density:** 10-row entity list in 700px column height (i.e. lower density than developer; higher than ambient).

> Mockup: `screenshots/03-home-shell-01.png` (friendly light) and `screenshots/03-home-shell-02.png` (friendly dark).

### 4.2 `ambient` — wall displays and lock screens

- **Reference points:** Apple Home, Things, fancy Nest Hub displays.
- **Aesthetic:** glanceable from across the room. Big touch targets, generous radii (22–28px), glassmorphic surfaces over a time-of-day gradient background.
- **Surfaces:** dark with a gradient that animates slowly across the day (warm in morning/evening, cool at midday, deep at night). Gradient stops are tokens of the language, not hardcoded.
- **Vocabulary:** ultra-minimal — no labels where icons and color suffice.
- **Chrome:** none. No sidebar, no top bar, no command palette. The page *is* the chrome.
- **Per-tile fidelity:** every room tile is configurable on three axes — `width` (standard / wide), `scenes` (0/2/4 inline chips), `metric` (none / sensor / presence / now-playing / next-automation / last-activity). Defaults are computed by the server from entity count, sensor coverage, and interaction history; users override per-tile in the Display editor.
- **Used for:** wall-mounted tablets, fridge displays, bedside docks, and the phone lock-screen mode.

> Mockups: `screenshots/10-ambient-v2-01.png` (balanced fidelity wall display), `screenshots/10-ambient-v2-02.png` (fidelity comparison), `screenshots/09-ambient-display-02.png` (alert state — interestingness surfaced on a wall display).

### 4.3 `developer` — info-dense, technical, theming proof

- **Reference points:** Linear, Cursor.
- **Aesthetic:** sharp (3–5px radii), info-dense, monospace numerics, dark by default, single cyan accent.
- **Surfaces:** near-black (`#0a0a0c`) with `#111116` surface elevation. Cyan accent `#4cc4ff`.
- **Vocabulary:** technical. Overview / Entities / Events / Automations / Devices / Settings. Rooms render as a sortable table, not as cards.
- **Why it ships in v2:** the developer language exists primarily to *prove the theming engine is expressive enough*. If the same React component tree, fed the same RPCs, can render as a Stripe-grade friendly UI, an Apple-Home-grade ambient display, and a Linear-grade developer tool, the token system is real.

> Mockup: `screenshots/11-settings-and-developer-02.png`.

### 4.4 Architectural shape

A language is a Pkl module that produces:

- A **token override map** (CSS custom properties: colors, radii, spacing, motion durations, font stacks, gradient stops, shadow recipes).
- A **primitive variant map** (which React primitive renders for which slot — `Button` may be a sharp-cornered chip in developer, a pill in friendly, a glassmorphic capsule in ambient).
- A **per-page layout override map** (which Section types are valid for the Home, Activity, etc. — ambient's Home is just a Room Grid; developer's Home is a table).
- A **vocabulary map** (page titles and entity-type labels).

The token map applies via `data-language="<id>"` at the document root (and per-Display element). React components consume tokens via CSS custom properties only; they never read the language ID directly. Primitive variant selection happens via a single `<LanguagePrimitives>` provider in the shell.

---

## 5. Information Architecture

The household-first IA from the friendly language:

```
Home              ⌘1
Rooms             ⌘2
Activity          ⌘3
Automations       ⌘4
Devices           ⌘5
Settings          ⌘,
─── Pages ───
  [user-defined custom pages]
─── Displays ───
  [user-defined ambient pages bound to devices]
```

Notes:

- **Activity** is the rebranded events explorer. The page is gorgeous and queryable; the technical event-store concept is exposed in the All Events tab and in the Pkl editor.
- **Devices** contains entities, grouped by driver. Driver management itself lives in Settings → Drivers.
- **Pages** lists user-created Custom Pages. Empty by default.
- **Displays** lists pages bound to specific devices (wall tablets, fridge screens). Separate from Pages because they have a target, a fixed language (`ambient`), and lifecycle differences (pairing, idle behavior).
- **Settings** is a sub-shell, not a dropdown menu. It contains the operator surfaces (Drivers, Pkl config, Widget packs, Auth, Diagnostics) plus user prefs (Theme & language, Account).

When the active language is `developer`, the same nav renders with technical labels: Overview / Entities / Events / Automations / Devices / Settings. Same routes, same RPCs.

When the active language is `ambient`, nav is hidden entirely. Ambient deployments don't navigate.

---

## 6. The App Shell

A two-column desktop layout: 200px sidebar (nav + Pages + Displays + user pill at bottom), and a flex content area. Above the content area is a thin top bar with breadcrumb and the ⌘K search affordance.

> Mockup: `screenshots/03-home-shell-01.png`.

### 6.1 Sidebar

- Brand mark + name at top.
- Primary nav: Home, Rooms, Activity, Automations, Devices, Settings.
- Activity carries a small alert-count badge fed by the interestingness pipeline (count of unread "interesting" stories in the last hour).
- "Pages" section header with `+` affordance to create a new Custom Page. Lists user-created Pages.
- "Displays" section header with `+` affordance to create a new Display. Lists bound Displays. Each item has a small badge indicating its target device and "ambient" language tag.
- User pill at bottom (avatar, name, role). Click → Account in Settings.

### 6.2 Top bar

- Breadcrumb on the left (e.g., `Activity` or `Settings › Drivers` or `Pages › Energy & Climate · editing`).
- ⌘K command palette button on the right, with an "everything calm" / "1 alert" indicator dot.
- Per-page page-specific actions live below this top bar (e.g., "Edit page," "Save & exit," "Discard"). The top bar itself is global.

### 6.3 Page header

Below the top bar, the page has its own header (page title, secondary status, tabs if applicable). The Home page's hero greeting is *the* page header — no extra title above it.

---

## 7. Home — Curated Overview

Home is server-curated, not user-built. There is no edit mode.

> Mockup: `screenshots/03-home-shell-01.png` (friendly light) and `screenshots/03-home-shell-02.png` (friendly dark).

### 7.1 Sections

1. **Greeting** — "Good afternoon, Fynn · everything looks calm." Time-of-day-aware. Adjusts tone based on system status (calm / 1 alert / multiple alerts).
2. **At-a-glance status row** — three to five status pills, each tied to a structured event (entities online, automations active, driver health). Pills color-encode using the interestingness category palette.
3. **"Right now" strip** — four stat tiles: a primary climate metric (indoor temp), the most interesting sensor of the moment (e.g., office CO₂ if rising), lights on, events/min (proof-of-life for the event spine).
4. **Rooms grid** — up to 8 rooms in a 3-column grid. Each tile shows scene chips for quick action, brightness bar, count badge.
5. **Recent activity** — the top 3 Stories from the last 30 minutes (story title, kind pill, time). "All activity →" link to the Activity page.
6. **Active automations** — automations running now or due in the next hour, with "Run now" buttons.

### 7.2 What's missing on Home (deliberate)

- No widget edit affordances. Customization lives in Custom Pages.
- No raw event tail. That's the Activity page.
- No driver detail. That's Settings → Drivers.

The Home page's responsibility is *to confirm everything is fine in a calm way, or surface what isn't*. Anything that doesn't serve that goal belongs elsewhere.

---

## 8. Activity — The Event Log as Headline Feature

The Activity page is the most ambitious single page in v2. It is also the proof that Switchyard's event-sourced architecture is a user-facing strength, not just an implementation detail.

> Mockups: `screenshots/06-activity-stories-v2-01.png` (Stories), `screenshots/04-activity-full-02.png` (All events).

### 8.1 Three tabs

**Stories** — the default. Server-coalesced "stories" (a command + its state changes + side effects) rendered as cards in a 720px reading-width column with a 380px context rail on the right. Click a story → context rail populates with the story's depth (inner-events timeline + "Why interesting" detector cards + identity/source/causation fields + targeted action buttons).

**All events** — the faceted explorer. Stacked sparkline color-encoded by kind (state / cmd / cfg / err) at the top, facets on the left (Kind, Source, Entity, Issued by — with counts), chip-based query bar (`kind:cmd since:1h`) with free-text input, queryable table, slide-in detail panel showing identity (event_id, command_id, causation_id, correlation_id, OTel span), source, payload JSON, and the full causation chain with "Open story / Replay / Inspect entity / Copy as cURL" actions.

**Saved** — list of saved queries, executable in either Stories or All-events view. Cron-scheduled saved queries can be set up to emit notifications when they match (e.g., "any failure on Saturday after 10pm" → push notification).

### 8.2 Storage strategy

Stories are server-coalesced from the underlying event store using a coalescer pipeline that runs alongside the projection. The story view is therefore not a separate event type; it's a derived view that can be reprocessed if coalescing logic changes. Detail panel data is loaded on click — the list view stays light.

### 8.3 Vocabulary in other languages

- `developer` language calls the tabs *Stories / Stream / Saved*. The All-events tab is the default in developer mode.
- `ambient` language doesn't expose Activity as a navigable page (no nav). Interestingness-triggered alerts appear at the top of the ambient display instead.

---

## 9. Interestingness Taxonomy

Events and Stories carry zero or more typed `interesting_because[]` tags, assigned by a server-side detector pipeline. The UI consumes these tags; it never computes them.

### 9.1 Categories

| Category | Examples |
|----------|----------|
| **Performance** | Slow driver ack (vs SLO), command timeout, retry/reconnect during a command, queue depth spike, projection lag |
| **Anomaly** | Value out of expected band, rate-of-change spike, dormant entity reporting again, new attribute seen for an existing entity |
| **Causation** | High fan-out (caused N downstream events), triggered an automation, command failed but state still changed, state change without preceding command |
| **Failure** | Command failed, driver disconnected, validation error, permission denied, authentication failed |
| **Security** | Command from unknown source/agent, after-hours, repeated failed auth, token-scope-violation attempt, login from new device |
| **Configuration** | Config applied recently, driver restarted, automation deployed, widget pack installed, theme changed |
| **Novelty** | First seen entity/attribute, rare command (last instance > 14 days), new device discovered |

### 9.2 Detector pipeline

A package `internal/interestingness/` houses one detector per category. Each detector:

- Subscribes to the event store via the existing projection infrastructure (C1).
- Maintains its own state (e.g., the Performance detector keeps a rolling SLO; the Novelty detector keeps a "seen entities" set with last-seen timestamps).
- Emits `InterestingnessTagged` events when it determines an event qualifies.

The Activity service joins event records with their tags on read. Stories aggregate their inner events' tags.

### 9.3 Surfacing

- **Stories tab:** small colored chips on each card (`failure`, `slow recovery`, `causation`, `anomaly`, `security`, `rare`, `new entity`, `config change`).
- **Story rail:** each firing detector renders as its own "Why interesting" card with category, name, and prose explanation.
- **Time-machine:** the center pane's "Why is this step interesting?" annotation is generated from this catalog.
- **Home page:** stories with high-severity tags get bumped into the Home recent-activity preview.
- **Ambient displays:** when a `failure` or `causation` tag with sufficient severity fires, the wall display surfaces a quiet pill at the top of the screen and dims affected room tiles (see §13).
- **Filter chips:** queryable as `interesting:performance`, `interesting:security`, etc., in the All-events tab.

### 9.4 Out of scope for v2

User-defined detectors. v2 ships a fixed catalog; extension is post-v2.

---

## 10. Time-Machine — Replay Semantics

"Replay" in an event-sourced system is ambiguous. UI v2 distinguishes three semantics and ships one of them.

> Mockup: `screenshots/05-time-machine-01.png`.

### 10.1 The three semantics

1. **Repeat command.** Re-issue the same command as a new command (new `command_id`, new sequence, fresh execution). This is the "Repeat command" button on the Activity detail panel. *Ships.*
2. **Time-machine.** Reconstruct system state at a specific moment in event-store history. Step through the causation chain one event at a time, watching entity values change. Pure read; no event mutation; no driver calls. *Ships as the "Replay" button's destination.*
3. **Dry-run.** Re-execute the original command against a sandboxed branch where drivers don't act. Useful for testing automation logic without touching real devices. *Deferred to v3 — requires driver-side work (every driver gets a dry-run mode, or a stub-driver layer).*

### 10.2 Time-machine UX

A full-screen takeover (replaces the page content; "← Back to Activity" closes it):

- **Top bar:** title, "Open causation chain in graph," "Compare to now," "Export trace."
- **Scrubber:** transport controls (⏮ ‹ ▶ › ⏭), step position display (`step 3 of 5 · seq 8 423 414 · 14:02:11.412`), playback speed selector (0.25× / 1× / 2× / 4×), and a horizontal track with dotted event markers color-encoded by kind. Draggable "now viewing" marker.
- **Left rail (220px):** the causation chain as a vertical timeline with marker dots, current step highlighted.
- **Center pane:** system state at this step. Toggle between "All entities," "Affected only," "Diff from prev." Entities that changed at this step get an accent ring and inline `was → now` diffs. Below the entities, an auto-generated "Why is this step interesting?" annotation, sourced from the interestingness taxonomy.
- **Right rail (340px):** current event detail — diff first, then identity (event_id, causation_id, correlation_id), source (emitter, OTel span), and JSON payload.
- **Bottom strip:** keyboard hints (`space` play/pause, `←/→` step, `⇧←/→` jump 1s, `f` toggle affected-only, `d` toggle diff, `esc` exit).

### 10.3 Implementation

Rides on C1's existing snapshot infrastructure: load the nearest snapshot before `seq N`, replay events forward to N, render. State diffs are computed by snapshot-N minus snapshot-(N-1). The Time-machine never writes events.

The "Replay" button is one entry point. Other entry points: a sensor history page ("Show me the kitchen state at 14:02:11"), the Time-machine context-menu item in Stories, "Open in Time-machine" actions in the Settings → Drivers expanded view.

---

## 11. Command Palette

A central feature of the desktop experience. Cmd-K (or Ctrl-K) opens a modal palette over any page.

> Mockups: `screenshots/07-command-palette-01.png` (default), `screenshots/07-command-palette-02.png` (active query).

### 11.1 Default state

Categorized sections when the query is empty:

- **Recently used** — last 7 days of palette actions, sorted by recency.
- **Suggested** — context-aware. The current page, current Activity alerts, recent unread interestingness, and "right now" actions feed this. (Example: if there's a `driver.z2m reconnecting` alert on Activity, "Investigate `driver.z2m`" appears here.)
- **Jump to** — page navigation (Activity ⌘3, Rooms › Kitchen ⌘R K, Settings › Drivers).
- **Ask** — handoff to MCP-backed agent chat (⌘'). *Only shown when a MCP backend is configured.*

### 11.2 Active state — verb + argument parsing

The palette has a registered catalog of *verbs* (events tail, light off, automation run, driver restart, page open, …) with typed arguments. Typing parses input into a structured `verb + args` shape, displayed as filled and missing argument chips just below the input.

Example: typing `tail z2m` resolves to:

- Verb: `events tail` (filled)
- `source`: `z2m` (filled)
- `kind`: ? (missing — dashed chip)
- `since`: ? (missing — dashed chip)

Tab fills the next missing arg from suggestions. Enter runs with current args.

### 11.3 CLI preview

A right-aligned, optionally-shown CLI string under the args row: `switchyard event tail --source=z2m`. Operators copy-paste from the palette to learn the CLI; CLI users learn the palette by recognizing their command shape.

**The CLI preview is user-configurable** — toggle in Settings → Theme & language. Off by default for daily users; on by default for operators (detected by usage of operator surfaces, or manual choice in a first-run flow).

### 11.4 Registry

The verb catalog is registered server-side (so the CLI and palette stay in sync) and exposed via a `CommandCatalogService.List()` RPC. Each verb declares: name, description, arg schema (typed), required vs optional args, CLI flag mapping, and a handler ref. The web palette consumes this catalog and renders the parser entirely client-side; server-side parsing handles MCP and CLI.

Built-in verbs at v2 launch (illustrative, not exhaustive): `events tail`, `events query`, `entity get`, `entity call-capability`, `automation run`, `automation enable`, `automation disable`, `driver restart`, `driver logs`, `driver list`, `config apply`, `config validate`, `pkl open`, `page open`, `page create`, `page export`, `widget install`, `widget list`, `token issue`, `passkey enroll`, `display pair`, `display configure`.

### 11.5 Not on mobile

The command palette is desktop-only. See §19.

---

## 12. Custom Pages and the Three-Tier Widget Contract

The biggest break from C10. The 12-column drag-and-drop grid is replaced with stacked typed sections, and the single-tier widget contract is replaced with three tiers.

> Mockups: `screenshots/08-custom-pages-01.png` (render), `screenshots/08-custom-pages-02.png` (edit), `screenshots/08-custom-pages-03.png` (three tiers).

### 12.1 The page model

A Custom Page is a Pkl module that produces an ordered list of typed sections. There is no grid, no row/column system, no resize handles. Sections stack vertically at content width; their internal layout is owned by each section type. The only between-section affordance is "Add section" (an inline plus between any two sections).

### 12.2 The three widget tiers

- **Section** — top-level. Full content-width. Owns its own internal layout. Examples: `Hero`, `Chart`, `EntityList`, `ActivityFeed`, `RoomGrid`, `Markdown`, `CameraGrid`, `Floorplan` (deferred), `StatGrid`, `WebhookButton`. New widget packs default to this tier.
- **Tile** — lives inside section types that host a tile grid (e.g., `RoomGrid`, `StatGrid`). Square-ish, action-oriented. Examples: a room tile, a stat tile, an entity toggle, a scene button.
- **Cell** — lives inside list-shaped section types (`EntityList`, `ActivityFeed`). Row-shaped, dense, often inline-actions. Examples: an entity row, an event row.

Widget packs declare which tier(s) they target in their manifest. A pack can register multiple components targeting different tiers (e.g., a media-server pack might expose a `NowPlayingSection`, a `MediaTile`, and a `RecentlyAddedCell`).

### 12.3 Edit mode

Edit mode (entered via "Edit page" in the top bar) shows section handles on each section: drag handle, settings gear, delete. Hover or selection reveals them.

Selecting a section opens a **right-side settings rail** with typed config for that section. Each section's settings include both a form view (for round-trippable fields) and a **live Pkl source preview** (well-formatted, deterministic). Editing the form mutates the staged Pkl; the preview updates immediately. Hand-editing in the Pkl editor (§18) updates back to the form when the section is reselected.

> Mockup: `screenshots/08-custom-pages-02.png`.

### 12.4 Pkl two-file split

Inherited from C10: each Custom Page is a pair of files — `pages/<slug>.pkl` (user-owned, hand-editable) and `pages/<slug>.layout.pkl` (regenerator-owned, deterministically regenerated). Hand-edits to `<slug>.pkl` always win; the layout file is a regenerator artifact.

### 12.5 Migration from C10 grid widgets

See §21.

---

## 13. Ambient Language and Displays

A Display is a Custom Page bound to a target device, rendered through the `ambient` language. Displays live in their own sidebar section because they have different lifecycle and configuration from Pages.

> Mockups: `screenshots/10-ambient-v2-01.png` (calm), `screenshots/10-ambient-v2-02.png` (fidelity comparison), `screenshots/09-ambient-display-02.png` (alert state).

### 13.1 Pairing model

The operator:

1. Settings → Displays → "Pair new display." A short numeric code appears.
2. On the target device, opens `https://<switchyard-host>/pair` and enters the code.
3. The device is named (Kitchen Wall, Bedside Nightstand, Kid's iPad).
4. The display is now bound to this Switchyard instance and shows the placeholder page until a Page is assigned.

Pairing uses a short-lived (5-minute TTL) one-time code stored in the auth service.

### 13.2 Per-Display configuration

For each Display the operator chooses:

- **Page to render** — an existing Custom Page, or a default ambient template (room grid + scene strip).
- **Per-tile fidelity** — width (standard/wide), inline scene count (0/2/4), metric slot type (none / sensor / presence / now-playing / next-automation / last-activity).
- **Idle behavior** — wake on motion, dim after N minutes, fully off after M minutes.
- **Allowed interactions** — restrict what the display can control (e.g., kid's iPad can only run scenes for the kid's room).

### 13.3 Time-of-day gradient

A first-class language feature. The gradient stops are tokens that animate slowly through the day:

- Pre-sunrise (3–6am): deep cool blue
- Sunrise (6–9am): warm pink to gold
- Midday (9am–4pm): cool cyan-violet
- Sunset (4–8pm): warm orange-gold (as shown in mockup)
- Night (8pm–3am): deep purple to indigo

Implementation: the language registers a `gradient.tod` token whose value is computed client-side based on the local solar table from the same `astro` library that powers Sun Triggers in automations. Animation is via CSS custom property transition, so users see smooth gradient drift rather than jumps.

### 13.4 Alert state

When the interestingness pipeline tags an event with `failure` or `causation` of sufficient severity (configurable threshold per Display), the ambient layer surfaces:

- A small pill at the top center: e.g., "Z2M driver reconnecting · 8 lights stale."
- Affected room tiles dim to 0.55 opacity and show a "stale" badge with last-known state.
- The scene strip trims to safe options (movie/bedtime stay; "Good morning" hides because the lights wouldn't respond).

When the alert clears, everything restores. The display never shows a modal or interactive resolution — the operator handles it from a phone or desktop.

### 13.5 Mobile lock-screen mode

Mobile devices in idle, docked, or "ambient" mode (configurable per device in Settings → Account → This device) render the user's default ambient page. See §19.

---

## 14. Developer Language

The developer language ships specifically as the forcing function for the theming engine.

> Mockup: `screenshots/11-settings-and-developer-02.png`.

Key visual departures from friendly:

- **Radii** drop from 8–14px to 3–5px.
- **Font** stays Inter for prose but monospace (JetBrains Mono / ui-monospace) for numerics, IDs, timestamps, table values.
- **Color palette** is dark-only, near-black surfaces, with a single cyan accent (`#4cc4ff`).
- **Spacing scale** is tightened by ~25%.
- **Rooms** render as a sortable table instead of cards.
- **Vocabulary** swaps to technical (Overview / Entities / Events / Drivers).
- **Keyboard shortcuts** surface inline (⌘1, ⌘2, ⌘K).
- **Tab character** matters: developer favors `code style` for entity names, monospace timestamps, and tabular numerics.

If the same component tree, fed the same RPCs, produces *both* the friendly Home page and the developer Overview page, the engine is real. v2 ships both and continuously tests the regression.

---

## 15. Settings Architecture

Settings is a sub-shell, not a dropdown. Entering Settings replaces the right pane with a two-column inner layout: a settings nav rail (220px) and the settings content pane.

> Mockup: `screenshots/11-settings-and-developer-01.png`.

### 15.1 Sections

- **Account** — passkeys list (enroll/revoke), active sessions, issued tokens (per C9).
- **Drivers** — list of installed drivers with status badges, version, uptime, pid. Expanded view shows identity (pack, version, socket, config), recent logs (monospace dark-on-light), key metrics (entities, events/day, last cmd ack, reconnects today), and actions (Open in Time-machine, Inspect entities, Stop driver, Restart). An "Available" subsection lists registry drivers not yet installed.
- **Pkl config** — opens the in-app Pkl editor (§18).
- **Widget packs** — installed packs with signature status, install button (OCI ref input), update available indicator.
- **Displays** — paired displays with their assigned pages, per-tile fidelity config, idle behavior. New-display pairing flow.
- **Theme & language** — light/dark/system mode, language preset, command-palette CLI-preview toggle, motion-reduction toggle.
- **Diagnostics** — system health summary, event-store stats (size, age, snapshots), support-bundle export (per F-21).
- **About** — version info, signed binary fingerprint, license, build metadata, links to docs.

### 15.2 Inline status

Each nav rail entry can carry an inline status badge — "Drivers · 1 alert" — fed by the interestingness pipeline. Operators see what needs attention before clicking in.

### 15.3 Permission gating

Settings sections respect C9 scopes. A user without `settings.drivers.write` sees Drivers but cannot Restart/Stop; the buttons are visible but disabled with a tooltip.

---

## 16. Automation Editor

The automation editor is the surface where Pkl-canonical edit, form/source duality, and Starlark mixed editability all meet.

> Mockups: `screenshots/12-automation-editor-01.png` (editor), `screenshots/12-automation-editor-02.png` (conflict resolution).

### 16.1 Form layout

An automation has four typed sections:

- **Trigger** — currently a single trigger (Sun event, time, entity state change, webhook, manual). Multi-trigger automation is deferred to v3.
- **When** — conditions tree (All / Any / Not, nested). Each leaf is a typed predicate (`EntityEq`, `EntityGreaterThan`, `TimeInRange`, etc.) or a Starlark expression.
- **Do** — ordered list of actions. Each action is a typed action class (`TurnOn`, `SetBrightness`, `RunScript`, `Notify`, `CallCapability`).
- **On failure** — retry/notify behavior.

Each section renders as a card with typed rows. Per-row "Edit" affordances open inline editors for the relevant field type (entity picker, scene picker, percentage slider, time picker, condition builder, Starlark expression editor in-context).

### 16.2 Mixed editability

When a field uses a Starlark expression or other non-round-trippable construct:

- Properties that *can* be round-tripped (e.g., the entity ID on a `SetBrightness` action) remain editable in the form.
- The expression itself renders as a locked field with the Starlark code preview, a "starlark" pill, and a "View in Pkl editor →" button.
- A banner above the action explains *why* it's partially locked.

This implements the "Render read-only, link to Pkl editor" decision for partial constructs.

### 16.3 Live Pkl source pane

A 380px right-rail shows the staged Pkl source for the file, with line-by-line annotation:

- Orange-tinted lines for dirty (staged-but-unsaved) edits.
- Grey-tinted lines for locked (file-only) regions.
- A "Diff vs disk" tab counter shows the unsaved delta count.

Editing the form mutates the AST; the source pane re-renders deterministically. Hand-editing the source pane is supported via a "Open in Pkl editor" link, which loads the in-app editor (§18) on the file.

### 16.4 Save flow

"Save & exit" triggers `ConfigService.Apply()`, which validates the Pkl, reloads the runtime, and emits a `ConfigApplied` event. If validation fails, the user stays in the editor with errors surfaced in the rail. "Discard" abandons the staged AST and reloads the form from the on-disk file.

### 16.5 Run controls

"Run now" sends a synthetic trigger event and executes the automation against the current state. The user is dropped into Time-machine on the resulting causation chain, so they can verify the behavior immediately.

---

## 17. Pkl ↔ UI Architecture

The decision: **UI is canonical during edit sessions.** Mutations stage locally; the on-disk file is unchanged until "Save & exit."

### 17.1 Lifecycle

1. **Open** — UI calls `ConfigService.OpenForEdit(file_path)`. Server returns the parsed Pkl AST, a lock token, and the current file hash. Server records that an edit session is active.
2. **Mutate** — UI updates a local copy of the AST on every form or palette change. Pkl source is regenerated deterministically and held in memory. The on-disk file is not touched.
3. **External edit detection** — the server's existing file watcher fires on the open file. The server pushes an `ExternalEditDetected` event to the active session over Connect-RPC. The UI shows the conflict banner (§17.3) but does not auto-merge.
4. **Save** — UI sends `ConfigService.CommitEdit(file_path, lock_token, regenerated_pkl, expected_file_hash)`. Server validates:
   - The lock token is still valid.
   - The on-disk file's current hash matches `expected_file_hash` (no external edits since the session opened).
   - If yes: write the file, release the lock, validate, reload, emit `ConfigApplied`.
   - If no: return `CONFLICT`; UI surfaces the 3-way merge.
5. **Discard** — UI sends `ConfigService.AbandonEdit(file_path, lock_token)`. Server releases the lock.

### 17.2 File-only sections

Per the decision: a section using constructs the regenerator can't round-trip (Starlark calls, imports, let-bindings, non-deterministic expressions) renders with edit affordances disabled. A "View source" button opens the in-app Pkl editor at the relevant line range. Other sections in the same file remain fully editable.

### 17.3 Conflict resolution

> Mockup: `screenshots/12-automation-editor-02.png`.

When `CommitEdit` returns `CONFLICT`:

- A banner appears: "External edit detected while you were working. `<file>` was modified on disk at `<time>` — `<gap>` after you opened the editor. You have N unsaved changes here. Choose how to reconcile."
- Three options:
  1. **Discard mine, reload from file** — drops the staged AST, reloads the editor from the new on-disk content.
  2. **Overwrite the file with my changes** — equivalent to a `force=true` flag on `CommitEdit`. Writes the staged AST regardless of disk state. (Warns once if the operator hasn't seen this option before.)
  3. **Open 3-way merge** — opens the in-app Pkl editor in merge mode with three panes: "On disk now" (left), "Common ancestor — when you opened it" (center), "Your unsaved changes" (right). Hunk-level "pick" buttons in the gutter. Save commits the merged result.

The 3-way merge uses the same Monaco editor primitive as the regular Pkl editor; there is no separate merge widget to maintain.

### 17.4 What this means for MCP and CLI

MCP and CLI mutate Pkl through different RPCs (`ConfigService.Patch(file_path, patch)`). They don't hold long-lived edit sessions; they atomically commit. If they collide with an active web edit session, the web session sees an `ExternalEditDetected` event for those files. The web user reconciles via the same conflict UI.

---

## 18. In-App Pkl and Starlark Editor

Monaco-powered. Single editor primitive used for:

- Browsing and editing Pkl files in `~/.switchyard/`
- 3-way merge during conflict resolution
- "View source" navigation from the form editors
- Standalone Starlark file editing (`*.star` in `~/.switchyard/scripts/`)
- Embedded Starlark inside Pkl `starlark("…")` calls

> Mockups: `screenshots/13-pkl-starlark-editor-01.png` (editor), `screenshots/13-pkl-starlark-editor-02.png` (Starlark zoom).

### 18.1 Layout

Three columns:

- **App rail (56px)** at the very left — preserves the global nav identity.
- **File tree (248px)** — Pkl config root with directories (`automations`, `dashboards`, `displays`, `drivers`, `scripts`, `base`). Files show `dirty`/`error` badges.
- **Editor pane (flex)** — file tabs (with dirty-dot indicators), AST breadcrumb (e.g., `automations / sunset-lights.pkl › actions [2] . brightness`), code area with gutter, status bar with action buttons.
- **Inspector (320px)** — context-aware: type info at the cursor, problems list, form-bound regions in this file, embedded-language info, schema links.

### 18.2 Pkl-specific affordances

- **`form-bound` markers** in purple in the gutter and on a tinted background — these are the AST regions the WYSIWYG form editors control. The inspector shows the corresponding form-editor link: "Reveal in form editor →." Edits made here propagate; the form editor sees the new AST when reopened.
- **Dirty line markers** in orange.
- **Error markers** with inline messages.
- **Live validation** against the Pkl schema (the same schema the regenerator validates against). Errors come from the server-side `pkl eval` and appear in the inspector's Problems list.
- **AST breadcrumb** showing the structural path at the cursor.

### 18.3 Starlark as a real embedded language

- Inside `starlark("…")` calls, Monaco switches to the Starlark tokenizer. Token colors differ from regular Pkl strings.
- Type info, autocomplete, "jump to definition" (⌘B), and lint come from a Starlark language server.
- Bindings from the surrounding Pkl context (sun.altitude, now, entities, scenes) are surfaced as readonly inputs in the inspector when the cursor is inside a Starlark region.
- The same Starlark experience appears in standalone `*.star` files and in widget `compute` props.

### 18.4 Status bar

`Pkl 0.27 · 3 unsaved · 1 error · 1 form-bound region · Ln 18, Col 60 · spaces:2 · UTF-8 · LF` plus action buttons: Format (runs `pkl-fmt`), Validate (runs `pkl eval --validate`), Apply changes (⌘S — triggers the §17.4 commit flow).

### 18.5 Implementation notes

- Monaco is loaded lazily — only when the editor is first opened. The base Switchyard bundle stays light.
- Pkl tokenization is via a custom Monaco language definition; the Pkl language server (if any becomes available) is wired in behind a feature flag.
- Starlark tokenization is via a custom Monaco language definition. The Starlark LS is a small Connect-RPC service that runs alongside `switchyardd` and analyzes scripts loaded from disk.

---

## 19. Mobile

PWA-served. Friendly language default, dark or light per system preference. The household-first IA is preserved; operator surfaces are explicitly read-only.

> Mockup: `screenshots/15-mobile-v2-full.png`.

### 19.1 Architectural commitments

- **4-tab bottom bar** — Home / Rooms / Activity / More. Equal-width tabs, native-feeling motion on selection.
- **Top-right search affordance** on every page — a magnifying-glass icon, opens a bottom-sheet search. Results categorize by Rooms, Entities, Automations, Activity. No verb parsing, no CLI preview, no agent handoff — those are desktop features that don't earn their tap targets.
- **Sheet-based detail throughout** — tap a room → bottom sheet with brightness slider + scene chips + entity rows. Tap a story → bottom sheet with "Why interesting" cards + inner events + actions. Tap a notification → same shape. One interaction primitive.
- **Operator surfaces are explicitly read-only** — Automation editor shows "Editing on a larger screen. Run, disable, or view; full editor is desktop-only." Pkl config opens in a read-only viewer with no Apply button. Driver detail can restart/view-logs but not reconfigure.
- **Ambient as lock-screen** — same display engine as wall tablets, rendered on the phone. Auto-activated when the device is docked or after a configurable idle timeout. The user's default ambient page (or a system default) renders.
- **Pull-to-refresh** on Activity, Home, and other live-data pages. Plus the existing C10 multiplexer reconnection banner.
- **One PWA** — service worker shell, IndexedDB cache of the most recent multiplexer cursor (so cold loads have something to render), Web Push for notifications (subscription stored in C9's per-user state).

### 19.2 No command palette

The desktop palette's verb+args parsing is bad on a thumb keyboard. CLI parity isn't a mobile use case. Search-jumping to a room or entity is the relevant pattern; the magnifying-glass affordance covers that.

### 19.3 Voice (deferred)

Siri Shortcuts integration for the "quick action from phone" use case is deferred. The lock-screen ambient view already covers "tap to dim from bedside."

### 19.4 Screens

- **Home** — greeting, 2x2 stat tiles, 2-col rooms grid, recent-activity preview.
- **Rooms** — vertical list of all rooms with state and scene chips.
- **Room sheet** — big brightness slider, 4 scene chips, entity rows with switches.
- **Activity** — Stories feed in compact card form. All-events tab is available but not the default.
- **Story sheet** — title, "Why interesting" cards, inner events list, actions.
- **Automations** — read-only list with Run / View / Enable / Disable buttons.
- **Devices, Pages, Displays, Account, Theme, Pkl config (read-only), Widget packs, Diagnostics, About** — all accessible via More.
- **Ambient lock-screen** — same as the wall display, smaller.

---

## 20. Token System

The token system is the substrate that lets three languages share one component tree.

### 20.1 Token namespaces

- **Color** — `--sy-color-bg`, `--sy-color-surface-1`, `--sy-color-surface-2`, `--sy-color-surface-3`, `--sy-color-sidebar`, `--sy-color-line`, `--sy-color-line-soft`, `--sy-color-fg`, `--sy-color-fg-2`, `--sy-color-fg-3`, `--sy-color-fg-4`, `--sy-color-fg-5`, `--sy-color-accent`, `--sy-color-accent-2`, `--sy-color-accent-soft`, `--sy-color-good`, `--sy-color-warn`, `--sy-color-bad`, `--sy-color-info`, `--sy-color-purple`. The five fg shades cover from primary text to tertiary muted; the three surface shades cover elevation.
- **Radius** — `--sy-radius-sm`, `--sy-radius`, `--sy-radius-lg`, `--sy-radius-xl`, `--sy-radius-pill`.
- **Space** — `--sy-space-1` through `--sy-space-6` (tight to loose).
- **Type** — `--sy-font-display`, `--sy-font-body`, `--sy-font-numeric`. Plus per-element weight and size scales.
- **Motion** — `--sy-motion-fast`, `--sy-motion`, `--sy-motion-slow`, plus easing curves.
- **Shadow** — `--sy-shadow`, `--sy-shadow-2`, `--sy-shadow-elevated`.
- **Gradient** — `--sy-gradient-tod` (time-of-day; ambient-language-specific).
- **Numeric features** — `--sy-numeric-feature` (e.g., `tabular-nums`).

### 20.2 Language override

A language preset is a Pkl module producing a flat token-override map. Loading a language injects a `<style data-language="<id>">:root[data-language="<id>"] { … overrides … }</style>` block. Switching the language toggles `[data-language]` at the document root (or per-element for embedded ambient displays).

### 20.3 Variant components

Some primitives can't express their entire shape via tokens (e.g., a button that's a sharp chip in developer vs a pill in friendly vs a glassmorphic capsule in ambient). For these, the language registers a *variant* — a different React component for the same primitive slot. A `<LanguagePrimitives>` provider in the shell selects variants at render time. Components consume primitives through the provider, never directly.

### 20.4 Light/dark within a language

Light and dark are *two token override sets* within the same language. The active light/dark mode is a separate axis from language. Friendly has both; developer is dark-only by design; ambient is dark-only by design.

### 20.5 ESLint discipline

The existing ESLint rule that bans raw color/radius/spacing utilities (per C10) extends to ban any hardcoded color literal or numeric size in component files. All visual values must reference tokens.

### 20.6 Test strategy

A Playwright snapshot test renders each of the canonical pages (Home, Activity, Custom Page render, Custom Page edit, Settings → Drivers, Automation editor, Pkl editor, the mobile shell, a Display) in each of `(friendly-light, friendly-dark, developer-dark, ambient-dark)` and compares against committed reference images. The matrix is small enough to keep in CI.

---

## 21. Migration from C10

C10 shipped, so v2 is a migration, not a greenfield project. The migration strategy:

### 21.1 What survives

- All RPC services and the Connect-ES generated client.
- The multiplexer.
- The login flow (`/login` page, passkey enrollment via C9).
- The PWA service worker.
- The Pkl mutator and regenerator for dashboards. *But the dashboard concept itself is repositioned — see below.*
- The widget pack distribution mechanism (OCI, cosign, `/widgets/<pack>/<v>/<file>` serving, dynamic `import()`).
- The design-token substrate (renamed `--gh-*` → `--sy-*` if not already done).

### 21.2 What's renamed

- "Dashboards" → "Pages" (in the UI vocabulary; the underlying RPC names can stay `DashboardService` for now, or rename in a follow-up).
- `gohome` → `switchyard` everywhere (this is a separate ongoing migration but converges here).

### 21.3 What's rebuilt

- The shell (`src/shell/Shell.tsx` is currently a one-line stub) is rebuilt to the v2 sidebar + top-bar layout.
- The dashboard render path (`src/dashboard/render/`) is rebuilt around the section-based model. C10 widgets get adapter shims to render as Section, Tile, or Cell.
- The dashboard edit path (`src/dashboard/edit/`) is rebuilt around the section-based edit model with right-rail section settings + Pkl preview.

### 21.4 What's added

- Home page (curated, no edit).
- Activity page with three tabs, Time-machine, interestingness pipeline.
- Command palette.
- Settings sub-shell (all sections).
- Automation editor.
- In-app Pkl + Starlark editor (Monaco integration).
- Displays sidebar section + pairing flow.
- Mobile-specific shell (bottom tab bar, sheets).
- `ambient` and `friendly` language presets (in addition to existing `developer`).
- Token system formalization across all three languages.
- Detector pipeline (`internal/interestingness/`).
- Coalescer pipeline for Stories.

### 21.5 What's deprecated/removed

- `react-grid-layout` dependency (replaced with section stacking).
- The C10 single-tier widget model (replaced with three tiers; existing widgets get shims).
- The C10 Home-page = WYSIWYG-dashboard assumption.

### 21.6 Existing C10 dashboards in the wild

Any user-built C10 dashboards continue to work via a compat layer: the legacy grid layout renders inside a single `LegacyGrid` Section (which internally still uses `react-grid-layout`). The user is gently prompted to migrate to the new section model; the prompt offers a one-click conversion that maps each widget to its closest Section/Tile/Cell equivalent. The `LegacyGrid` Section ships in v2 and is deprecated in v3.

---

## 22. Implementation Order

UI v2 is too large for one plan. The brainstorm decomposes into the following implementation plans, each of which gets its own spec or plan document via the writing-plans skill:

1. **Token system + shell + IA** (foundation). Tokens unified across three languages, shell rebuilt, friendly default ships with both light and dark, sidebar with all sections (some still empty placeholder pages).
2. **Home page** (curated overview). All sections shipped. No edit mode. Becomes the new default landing.
3. **Activity v1** — Stories tab + All Events tab + Saved tab. Detector pipeline (`internal/interestingness/`) with all seven categories. Coalescer for Stories.
4. **Time-machine** — full replay UX riding on C1 snapshots. Causation chain timeline. State-diff rendering.
5. **Command palette** — verb registry RPC, parser, default + active states, recently-used + suggested + jump-to + ask. Configurable CLI preview.
6. **Custom Pages + three-tier widget contract** — section model, edit mode, right-rail settings, Pkl two-file split (reusing C10's regenerator pipeline). Legacy-grid compat Section.
7. **Displays + Ambient language** — pairing flow, per-tile fidelity, time-of-day gradient, alert state.
8. **Developer language** — token override set, primitive variants, table layouts for rooms, technical vocabulary swap.
9. **Settings sub-shell** — all sections (Account, Drivers, Pkl config, Widget packs, Displays, Theme & language, Diagnostics, About). Drivers section with expanded detail panel.
10. **Automation editor** — form + Pkl preview + mixed editability + run-then-time-machine flow.
11. **Pkl ↔ UI architecture** — `OpenForEdit` / `CommitEdit` / `AbandonEdit` RPCs, file watcher → session push, conflict UI, lock tokens.
12. **In-app Pkl + Starlark editor** — Monaco integration, language definitions, Starlark LS service, form-bound markers, AST breadcrumb.
13. **Mobile shell + responsive** — 4-tab bottom bar, top-search sheet, sheet-based detail, operator surfaces read-only.

These can run in roughly the listed order. Plans 1–2 unblock everything visual. Plan 3 (Activity) is the headline ship. Plans 6–7 (Custom Pages + Displays) unblock the dashboard/widget rethink. Plan 11 (Pkl ↔ UI) is a prerequisite for 10 (Automation editor) and 12 (Pkl editor) to ship in a coherent way; the three together close the loop on form/source duality.

---

## 23. Decision Record

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Brainstorm scope = full rethink including dashboards | User-specified. Allows reframing dashboards as Custom Pages. |
| 2 | Friendly default; developer + ambient also ship | User-specified. Three languages enforce theming-engine expressiveness. |
| 3 | Household-first IA (Home / Rooms / Activity / Automations / Devices) | User-specified. Power-user surfaces live one level in. |
| 4 | Home is curated, no edit mode | User-specified. Dashboard subsystem repositions as opt-in Custom Pages. |
| 5 | Activity = Hybrid (Stories + All events + Saved + Time-machine) | User-specified. Calm for daily use; deep for operators. |
| 6 | "Replay" = Time-machine semantics (not re-execute, not dry-run) | Most valuable on existing infra; dry-run deferred to v3 (needs driver work). |
| 7 | Interestingness is a typed server-side detector pipeline | UI consumes tags, never computes; structured surfacing across Stories, Time-machine, Home, ambient. |
| 8 | Command palette: verb + arg parsing with configurable CLI preview | User-specified (CLI preview toggle). |
| 9 | "Ask an agent" affordance only when MCP backend configured | User-specified. |
| 10 | Drop the scope-mode tabs at the bottom of the palette | User-specified — unnecessary chrome. |
| 11 | Kill the 12-column grid; sections + three tiers replace it | User-specified. Native-app shape; widget pack authors target the right tier. |
| 12 | Both form and Pkl editing surfaces in section settings | User-specified. Pkl must be well-formatted (deterministic regenerator). |
| 13 | Sidebar splits into Pages and Displays sections | User-specified. Different lifecycle and configuration. |
| 14 | Ambient time-of-day gradient ships as a language feature | User-specified. |
| 15 | Per-tile fidelity (width × scenes × metric) in ambient | User-specified — tiles earn their canvas based on room role. |
| 16 | UI is canonical during edit; commit on save with conflict detection | User-specified. Matches IDE mental model. |
| 17 | File-only sections render read-only with "View source" link | User-specified. Other sections in the same file remain editable. |
| 18 | Mobile: drop the FAB, 4-tab bar + top-right search | User-specified. CLI-parity doesn't earn a tap target on phones. |
| 19 | Operator surfaces read-only on mobile | Daily/glanceable UX vs desk-class editing. Honest acknowledgment. |
| 20 | Ambient as mobile lock-screen / bedside mode | Same display engine reused; covers idle/dock UX. |

---

## 24. Explicit Deferrals

- **Native mobile apps.** PWA only. iOS/Android shells via Tauri or React Native are post-v2.
- **Voice / Siri Shortcuts integration** for mobile quick-actions.
- **Dry-run replay semantic** (driver dry-run mode required).
- **Multi-user real-time collaborative editing.** v2 assumes one editor per file at a time; conflicts are post-hoc.
- **Trace flamechart view.** Causation chain timeline inside Time-machine is sufficient for v2.
- **User-defined interestingness detectors.** Fixed taxonomy in v2.
- **Floor-plan section type.** Section type slot reserved; implementation deferred.
- **WebRTC for camera streams.** MJPEG remains v2 mechanism (per C10).
- **OIDC login flow.** Passkey + password remain v2 mechanism (per C9).
- **Multi-trigger automations** in the form editor. Single trigger in v2; multi-trigger is Pkl-editable.
- **Iframe sandboxing of widget pack JS.** Same-origin in v2; per C10.
- **Plug-in language presets.** v2 ships three built-in; user-installable language packs are post-v2.
- **Server-side animation of ambient gradient.** Client-side computed in v2.
- **The `LegacyGrid` compatibility section** is deprecated in v3.
