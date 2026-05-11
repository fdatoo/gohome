# Plan 13 — Mobile Shell + Responsive

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-class PWA mobile experience — a 4-tab bottom-bar shell that activates below 768px, sheet-based detail surfaces, read-only operator views, pull-to-refresh, ambient lock-screen, IndexedDB story cache, and Web Push notifications.

**Architecture:** A `useBreakpoint` hook at the layout boundary switches between the existing desktop `Shell` and a new `MobileShell` that renders the same routes with a 4-tab bottom bar. All operator-write surfaces (automation editor, Pkl editor, driver config) degrade to read-only views on mobile. A single `<Sheet>` primitive drives room detail, story detail, and notification detail. Notifications travel via Web Push; subscriptions are stored per-user in C9's user state and dispatched by a new `internal/push` notifier.

**Tech Stack:** React 18 + TanStack Router, `@radix-ui/react-dialog` (Sheet primitive), `vite-plugin-pwa` (already wired via Plan 9's PWA shell), Monaco (read-only, already used by the Pkl editor plan), `idb` (IndexedDB helper), ConnectRPC for the push proto service, `web-push` on the Go side.

**Spec refs:** §19 (Mobile), §19.1 (Architectural commitments), §19.2 (No command palette), §19.4 (Screens), §20.6 (Playwright snapshot matrix).

**Branch:** `feat/ui-v2-plan-13-mobile`
**Worktree:** `.claude/worktrees/plan-13-mobile`
**Depends on:** Plan 01 merged to main
**Linear parent:** TBD

---

## Decisions (locked — no ambiguity for the implementer)

1. **Breakpoint:** `viewport width < 768px` → `MobileShell`. The check is a CSS media query read via `window.matchMedia("(max-width: 767px)")`. The hook re-evaluates on resize via `addEventListener("change", …)`. The desktop `Shell` renders for ≥ 768px.
2. **MobileShell tabs:** Home / Rooms / Activity / More. No FAB. Tabs are equal-width, full-bleed at the bottom of the safe area. Active tab uses `--sy-color-accent`.
3. **Search entry point:** a magnifier icon (`<MagnifierIcon>`) in the top-right corner of every tab's top bar. Tapping opens a `SearchSheet`. The search sheet shows categorized results (Rooms, Entities, Automations, Activity). No verb parsing, no CLI preview. It reuses Plan 05's `CommandCatalogService.List()` to populate navigation suggestions ("jump to garage") but does not expose the typed-command flow.
4. **Sheet primitive:** `web/src/mobile/Sheet.tsx` wraps Radix `Dialog` with a bottom-sheet presentation (translate-Y animation, drag-to-dismiss via `touch-action: pan-y`). All mobile detail views are `Sheet` children.
5. **Read-only mobile operator surfaces:**
   - Automation editor route on mobile → `MobileAutomationView`: shows name, description, last-run time, Run / View / Enable / Disable buttons, and a banner: _"Full editing is only available on a larger screen."_
   - Pkl editor route on mobile → `MobilePklViewer`: read-only Monaco instance (`readOnly: true`), syntax highlighting only, no Apply / Save button.
   - Driver detail on mobile → existing driver detail component; restart and view-logs buttons remain; the reconfigure form is hidden (CSS `display:none` when `isMobile`).
6. **Pull-to-refresh:** implemented by hand — `touchstart` / `touchmove` / `touchend` listener on the page scroll container; when overscroll ≥ 64px a spinner appears and `onRefresh()` is called. Encapsulated in `usePullToRefresh(ref, onRefresh)` at `web/src/mobile/usePullToRefresh.ts`.
7. **Ambient lock-screen:** the ambient page (Plan 07) can auto-render when the device is idle or docked. Idle timeout default: 5 minutes. Opt-in configurable in Settings → Account → "This device" (`sy.ambient.idleTimeout` in `localStorage`, integer seconds, `0` = disabled). The idle timer resets on `pointermove`, `keydown`, `touchstart`. When the timer fires, TanStack Router navigates to `/ambient`.
8. **Service worker IndexedDB cache:** `web/src/pwa/notifications.ts` owns the push subscription flow. `web/src/pwa/story-cache.ts` owns IndexedDB writes. On multiplexer story events the last 50 stories are written to `idb` store `sy-stories`. On cold load (before multiplexer connects) the cached stories are read and injected into the activity feed. Use the `idb` npm package (already in `web/package.json` or add it).
9. **Web Push server-side:** `internal/push/notifier.go` subscribes to the event bus for interestingness events of severity ≥ a configurable threshold (`push.minSeverity`, default `"warn"`). For each qualifying event it reads the user's push subscriptions from the user state store and calls `webpush.SendNotification`. Go package `github.com/SherClockHolmes/webpush-go` (add to `go.mod`).
10. **Push proto:** `proto/switchyard/push/v1/push.proto`, package `switchyard.push.v1`, service `PushService`. Two RPCs: `RegisterSubscription(RegisterSubscriptionRequest) returns (RegisterSubscriptionResponse)` and `UnregisterSubscription(UnregisterSubscriptionRequest) returns (google.protobuf.Empty)`. Subscription endpoint, p256dh key, and auth key stored per user in `internal/state` alongside existing user state.
11. **No pull-to-refresh on the ambient page.** Ambient is display-only; PTR would be disruptive. PTR applies to: Home, Activity (all tabs), Rooms list.
12. **Playwright mobile snapshots** use `page.setViewportSize({ width: 390, height: 844 })` (iPhone 14 viewport). Test covers: MobileHome, Rooms list, Activity, SearchSheet open, RoomSheet open, MobileAutomationView, MobilePklViewer.

---

## File plan

### Created — web

```
web/src/mobile/
  breakpoint.ts              ← useBreakpoint() hook; returns isMobile boolean
  usePullToRefresh.ts        ← touchstart/move/end hook; calls onRefresh on overscroll
  MobileShell.tsx            ← 4-tab bottom-bar shell; renders when isMobile
  BottomTabBar.tsx           ← the 4 equal-width tabs + active indicator
  Sheet.tsx                  ← Radix Dialog wrapped as a bottom sheet primitive
  SearchSheet.tsx            ← categorized search bottom sheet
  RoomSheet.tsx              ← room detail bottom sheet (brightness slider + scenes + entities)
  StorySheet.tsx             ← story detail bottom sheet (why-interesting + events + actions)
  views/
    MobileHome.tsx           ← 2x2 stats + 2-col rooms grid + activity preview
    MobileRooms.tsx          ← vertical room list with state + scene chips
    MobileActivity.tsx       ← 3-tab activity feed; stories open StorySheet
    MobileAutomationView.tsx ← read-only automation view with run/enable/disable
    MobilePklViewer.tsx      ← read-only Monaco Pkl viewer

web/src/pwa/
  notifications.ts           ← Web Push subscription registration + SW listener
  story-cache.ts             ← IndexedDB read/write for last-50 stories
```

### Created — server

```
proto/switchyard/push/v1/
  push.proto                 ← PushService + subscription message types

internal/push/
  notifier.go                ← event-bus subscriber; sends web push on severity ≥ threshold
  notifier_test.go
  subscription_store.go      ← read/write push subscriptions from user state
  subscription_store_test.go
```

### Modified

```
web/src/routes/_authed/_layout.tsx   ← import useBreakpoint; render MobileShell when isMobile
web/src/pwa/install-prompt.ts        ← add ambient idle-timer logic (or new ambient-idle.ts)
web/e2e/mobile-snapshot.spec.ts      ← new Playwright test for mobile screens
Taskfile.yml                         ← add task web:e2e:mobile if not already present
go.mod / go.sum                      ← add github.com/SherClockHolmes/webpush-go
```

---

## Tasks

### Task 13.1 — Define `push.proto` and `buf generate`

**Files:**
- Create: `proto/switchyard/push/v1/push.proto`
- Modify: `buf.gen.yaml` (if push package needs a new entry — check existing pattern)

- [ ] **Step 1: Author the proto**

```protobuf
syntax = "proto3";

package switchyard.push.v1;

import "google/protobuf/empty.proto";

option go_package = "github.com/fdatoo/switchyard/internal/push/v1;pushv1";

service PushService {
  rpc RegisterSubscription(RegisterSubscriptionRequest)
      returns (RegisterSubscriptionResponse);
  rpc UnregisterSubscription(UnregisterSubscriptionRequest)
      returns (google.protobuf.Empty);
}

message PushSubscription {
  string endpoint  = 1;   // Web Push endpoint URL
  string p256dh    = 2;   // public key, base64url
  string auth      = 3;   // auth secret, base64url
  string user_agent = 4;  // informational; used to display "This device" in settings
}

message RegisterSubscriptionRequest {
  PushSubscription subscription = 1;
}

message RegisterSubscriptionResponse {
  string subscription_id = 1;  // opaque; used to unregister
}

message UnregisterSubscriptionRequest {
  string subscription_id = 1;
}
```

- [ ] **Step 2: Run buf generate**

```bash
buf generate
```

Expected: new files in `internal/push/v1/` (or wherever the Go output path points per `buf.gen.yaml`). No errors.

- [ ] **Step 3: Verify Go compiles**

```bash
go build ./...
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add proto/switchyard/push/v1/push.proto internal/push/v1/
git commit -m "feat(proto): PushService proto for Web Push subscriptions (plan 13)"
```

---

### Task 13.2 — Server-side push subscription storage

**Files:**
- Create: `internal/push/subscription_store.go`
- Create: `internal/push/subscription_store_test.go`

- [ ] **Step 1: Write the failing tests**

```go
// internal/push/subscription_store_test.go
package push_test

import (
    "context"
    "testing"

    "github.com/fdatoo/switchyard/internal/push"
)

func TestSubscriptionStore_RoundTrip(t *testing.T) {
    store := push.NewInMemorySubscriptionStore()
    ctx := context.Background()

    sub := push.Subscription{
        Endpoint: "https://fcm.googleapis.com/test",
        P256DH:   "key",
        Auth:     "secret",
    }

    id, err := store.Register(ctx, "user:alice", sub)
    if err != nil {
        t.Fatalf("Register: %v", err)
    }
    if id == "" {
        t.Fatal("expected non-empty id")
    }

    subs, err := store.List(ctx, "user:alice")
    if err != nil {
        t.Fatalf("List: %v", err)
    }
    if len(subs) != 1 {
        t.Fatalf("want 1 subscription, got %d", len(subs))
    }

    if err := store.Unregister(ctx, "user:alice", id); err != nil {
        t.Fatalf("Unregister: %v", err)
    }

    subs, _ = store.List(ctx, "user:alice")
    if len(subs) != 0 {
        t.Fatalf("want 0 after unregister, got %d", len(subs))
    }
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
go test ./internal/push/... -run TestSubscriptionStore_RoundTrip -v
```

Expected: `FAIL — push_test [build failed]` (package doesn't exist yet).

- [ ] **Step 3: Implement the store**

```go
// internal/push/subscription_store.go
package push

import (
    "context"
    "fmt"
    "sync"

    "github.com/google/uuid"
)

type Subscription struct {
    Endpoint  string
    P256DH    string
    Auth      string
    UserAgent string
}

type SubscriptionStore interface {
    Register(ctx context.Context, principalID string, sub Subscription) (id string, err error)
    List(ctx context.Context, principalID string) ([]indexedSubscription, error)
    Unregister(ctx context.Context, principalID string, id string) error
}

type indexedSubscription struct {
    ID           string
    Subscription Subscription
}

type inMemorySubscriptionStore struct {
    mu   sync.RWMutex
    data map[string][]indexedSubscription // principalID → subs
}

func NewInMemorySubscriptionStore() SubscriptionStore {
    return &inMemorySubscriptionStore{data: make(map[string][]indexedSubscription)}
}

func (s *inMemorySubscriptionStore) Register(_ context.Context, principalID string, sub Subscription) (string, error) {
    s.mu.Lock()
    defer s.mu.Unlock()
    id := uuid.NewString()
    s.data[principalID] = append(s.data[principalID], indexedSubscription{ID: id, Subscription: sub})
    return id, nil
}

func (s *inMemorySubscriptionStore) List(_ context.Context, principalID string) ([]indexedSubscription, error) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    return s.data[principalID], nil
}

func (s *inMemorySubscriptionStore) Unregister(_ context.Context, principalID string, id string) error {
    s.mu.Lock()
    defer s.mu.Unlock()
    subs := s.data[principalID]
    for i, s := range subs {
        if s.ID == id {
            s.data[principalID] = append(subs[:i], subs[i+1:]...)
            return nil
        }
    }
    return fmt.Errorf("subscription %q not found for %q", id, principalID)
}
```

- [ ] **Step 4: Run tests**

```bash
go test ./internal/push/... -run TestSubscriptionStore_RoundTrip -v
```

Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add internal/push/subscription_store.go internal/push/subscription_store_test.go
git commit -m "feat(push): in-memory subscription store with register/list/unregister (plan 13)"
```

---

### Task 13.3 — Server-side push notifier

**Files:**
- Create: `internal/push/notifier.go`
- Create: `internal/push/notifier_test.go`
- Modify: `go.mod` (add `github.com/SherClockHolmes/webpush-go`)

- [ ] **Step 1: Add the webpush-go dependency**

```bash
go get github.com/SherClockHolmes/webpush-go@latest
go mod tidy
```

Expected: `go.mod` and `go.sum` updated.

- [ ] **Step 2: Write the failing test**

```go
// internal/push/notifier_test.go
package push_test

import (
    "context"
    "testing"

    "github.com/fdatoo/switchyard/internal/push"
)

func TestNotifier_SendsOnHighSeverity(t *testing.T) {
    store := push.NewInMemorySubscriptionStore()
    ctx := context.Background()
    _, _ = store.Register(ctx, "user:alice", push.Subscription{
        Endpoint: "https://example.com/push/test",
        P256DH:   "BAAAAA==",
        Auth:     "secret",
    })

    var sent []push.SentNotification
    notifier := push.NewNotifier(store, push.NotifierConfig{
        MinSeverity: "warn",
        VAPIDPublicKey:  "BNullPublicKey",
        VAPIDPrivateKey: "NullPrivateKey",
        Sender: func(_ context.Context, n push.SentNotification) error {
            sent = append(sent, n)
            return nil
        },
    })

    // below threshold — should not send
    notifier.HandleEvent(ctx, "user:alice", push.Event{Severity: "info", Title: "quiet", Body: "ignored"})
    if len(sent) != 0 {
        t.Fatalf("want 0 sends for info, got %d", len(sent))
    }

    // at threshold — should send
    notifier.HandleEvent(ctx, "user:alice", push.Event{Severity: "warn", Title: "Motion", Body: "Front door"})
    if len(sent) != 1 {
        t.Fatalf("want 1 send for warn, got %d", len(sent))
    }
    if sent[0].Title != "Motion" {
        t.Fatalf("want title Motion, got %q", sent[0].Title)
    }
}
```

- [ ] **Step 3: Run to confirm failure**

```bash
go test ./internal/push/... -run TestNotifier_SendsOnHighSeverity -v
```

Expected: `FAIL — build failed` (Notifier not defined).

- [ ] **Step 4: Implement the notifier**

```go
// internal/push/notifier.go
package push

import (
    "context"
    "encoding/json"
)

// severityRank maps severity strings to a comparable integer.
var severityRank = map[string]int{
    "debug": 0, "info": 1, "warn": 2, "error": 3, "critical": 4,
}

type Event struct {
    Severity string
    Title    string
    Body     string
}

type SentNotification struct {
    Endpoint string
    Title    string
    Body     string
}

type SenderFunc func(ctx context.Context, n SentNotification) error

type NotifierConfig struct {
    MinSeverity     string
    VAPIDPublicKey  string
    VAPIDPrivateKey string
    // Sender is called for each qualifying subscription. In production this
    // wraps webpush.SendNotification; in tests it's a spy.
    Sender SenderFunc
}

type Notifier struct {
    store  SubscriptionStore
    config NotifierConfig
}

func NewNotifier(store SubscriptionStore, config NotifierConfig) *Notifier {
    return &Notifier{store: store, config: config}
}

func (n *Notifier) HandleEvent(ctx context.Context, principalID string, ev Event) {
    if severityRank[ev.Severity] < severityRank[n.config.MinSeverity] {
        return
    }
    subs, err := n.store.List(ctx, principalID)
    if err != nil || len(subs) == 0 {
        return
    }
    payload, _ := json.Marshal(map[string]string{"title": ev.Title, "body": ev.Body})
    for _, s := range subs {
        _ = n.config.Sender(ctx, SentNotification{
            Endpoint: s.Subscription.Endpoint,
            Title:    ev.Title,
            Body:     string(payload),
        })
    }
}
```

- [ ] **Step 5: Run tests**

```bash
go test ./internal/push/... -v
```

Expected: both `TestSubscriptionStore_RoundTrip` and `TestNotifier_SendsOnHighSeverity` pass.

- [ ] **Step 6: Commit**

```bash
git add internal/push/notifier.go internal/push/notifier_test.go go.mod go.sum
git commit -m "feat(push): event-driven notifier with severity threshold (plan 13)"
```

---

### Task 13.4 — `useBreakpoint` hook

**Files:**
- Create: `web/src/mobile/breakpoint.ts`
- Create: `web/src/mobile/breakpoint.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/mobile/breakpoint.test.ts
import { renderHook, act } from "@testing-library/react";
import { useBreakpoint } from "./breakpoint";

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

test("isMobile is true below 768px", () => {
  setViewport(375);
  const { result } = renderHook(() => useBreakpoint());
  expect(result.current.isMobile).toBe(true);
});

test("isMobile is false at 768px and above", () => {
  setViewport(768);
  const { result } = renderHook(() => useBreakpoint());
  expect(result.current.isMobile).toBe(false);
});

test("isMobile updates when viewport changes", async () => {
  setViewport(1024);
  const { result } = renderHook(() => useBreakpoint());
  expect(result.current.isMobile).toBe(false);

  act(() => setViewport(375));
  expect(result.current.isMobile).toBe(true);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npm test -- --run breakpoint
```

Expected: `FAIL — Cannot find module './breakpoint'`.

- [ ] **Step 3: Implement the hook**

```ts
// web/src/mobile/breakpoint.ts
import { useEffect, useState } from "react";

const MOBILE_MAX = 767; // px — viewport width ≤ this → isMobile

function isMobileViewport(): boolean {
  return window.innerWidth <= MOBILE_MAX;
}

export function useBreakpoint(): { isMobile: boolean } {
  const [isMobile, setIsMobile] = useState<boolean>(isMobileViewport);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    // Sync once in case initial state drifted
    setIsMobile(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return { isMobile };
}
```

- [ ] **Step 4: Run tests**

```bash
cd web && npm test -- --run breakpoint
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/mobile/breakpoint.ts web/src/mobile/breakpoint.test.ts
git commit -m "feat(web): useBreakpoint hook for <768px mobile detection (plan 13)"
```

---

### Task 13.5 — `MobileShell` + `BottomTabBar` + layout switch

**Files:**
- Create: `web/src/mobile/MobileShell.tsx`
- Create: `web/src/mobile/BottomTabBar.tsx`
- Create: `web/src/mobile/MobileShell.test.tsx`
- Modify: `web/src/routes/_authed/_layout.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/mobile/MobileShell.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileShell } from "./MobileShell";

test("renders 4 bottom tabs", () => {
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <MobileShell><div>content</div></MobileShell>
    </MemoryRouter>
  );
  expect(screen.getByRole("tab", { name: /home/i })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /rooms/i })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /activity/i })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /more/i })).toBeInTheDocument();
});

test("renders children above tab bar", () => {
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <MobileShell><p>page-content</p></MobileShell>
    </MemoryRouter>
  );
  expect(screen.getByText("page-content")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npm test -- --run MobileShell
```

Expected: `FAIL — Cannot find module './MobileShell'`.

- [ ] **Step 3: Author `BottomTabBar.tsx`**

```tsx
// web/src/mobile/BottomTabBar.tsx
import { Link, useRouterState } from "@tanstack/react-router";
import styles from "./BottomTabBar.module.css";

const TABS = [
  { id: "home",     label: "Home",     href: "/home" },
  { id: "rooms",    label: "Rooms",    href: "/rooms" },
  { id: "activity", label: "Activity", href: "/activity" },
  { id: "more",     label: "More",     href: "/settings" },
] as const;

export function BottomTabBar() {
  const { location } = useRouterState();
  return (
    <nav className={styles.bar} aria-label="Main tabs">
      {TABS.map((tab) => {
        const active = location.pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.id}
            to={tab.href}
            role="tab"
            aria-selected={active}
            aria-label={tab.label}
            className={`${styles.tab} ${active ? styles.active : ""}`}
          >
            <span className={styles.label}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

Create the accompanying CSS module at `web/src/mobile/BottomTabBar.module.css`:

```css
.bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background: var(--sy-color-surface-1);
  border-top: 1px solid var(--sy-color-line);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  z-index: 100;
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--sy-space-2) 0;
  color: var(--sy-color-fg-3);
  text-decoration: none;
  font-size: 11px;
}

.tab.active {
  color: var(--sy-color-accent);
}

.label {
  font-family: var(--sy-font-body);
}
```

- [ ] **Step 4: Author `MobileShell.tsx`**

```tsx
// web/src/mobile/MobileShell.tsx
import type { ReactNode } from "react";
import { BottomTabBar } from "./BottomTabBar";
import styles from "./MobileShell.module.css";

interface Props { children: ReactNode; }

export function MobileShell({ children }: Props) {
  return (
    <div className={styles.root}>
      <main className={styles.content}>{children}</main>
      <BottomTabBar />
    </div>
  );
}
```

Create `web/src/mobile/MobileShell.module.css`:

```css
.root {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--sy-color-bg);
}

.content {
  flex: 1;
  overflow-y: auto;
  /* leave space for the fixed bottom tab bar (~56px + safe area) */
  padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
}
```

- [ ] **Step 5: Wire the layout switch**

```tsx
// web/src/routes/_authed/_layout.tsx
import { Outlet } from "@tanstack/react-router";
import { Shell } from "@/shell/Shell";
import { MobileShell } from "@/mobile/MobileShell";
import { useBreakpoint } from "@/mobile/breakpoint";

export function AuthedLayout() {
  const { isMobile } = useBreakpoint();
  return isMobile
    ? <MobileShell><Outlet /></MobileShell>
    : <Shell><Outlet /></Shell>;
}
```

- [ ] **Step 6: Run tests**

```bash
cd web && npm test -- --run MobileShell
```

Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/mobile/MobileShell.tsx web/src/mobile/MobileShell.test.tsx \
        web/src/mobile/BottomTabBar.tsx web/src/mobile/BottomTabBar.module.css \
        web/src/mobile/MobileShell.module.css \
        web/src/routes/_authed/_layout.tsx
git commit -m "feat(web): MobileShell + BottomTabBar, layout switches at <768px (plan 13)"
```

---

### Task 13.6 — `Sheet` primitive

**Files:**
- Create: `web/src/mobile/Sheet.tsx`
- Create: `web/src/mobile/Sheet.test.tsx`

- [ ] **Step 1: Add Radix dependency if absent**

```bash
cd web && npm ls @radix-ui/react-dialog 2>/dev/null || npm install @radix-ui/react-dialog
```

Expected: package present in `node_modules`.

- [ ] **Step 2: Write the failing test**

```tsx
// web/src/mobile/Sheet.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sheet, SheetTrigger, SheetContent } from "./Sheet";

test("Sheet is closed by default", () => {
  render(
    <Sheet>
      <SheetTrigger>Open</SheetTrigger>
      <SheetContent>Sheet body</SheetContent>
    </Sheet>
  );
  expect(screen.queryByText("Sheet body")).not.toBeInTheDocument();
});

test("Sheet opens on trigger click", async () => {
  const user = userEvent.setup();
  render(
    <Sheet>
      <SheetTrigger>Open</SheetTrigger>
      <SheetContent>Sheet body</SheetContent>
    </Sheet>
  );
  await user.click(screen.getByText("Open"));
  expect(screen.getByText("Sheet body")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd web && npm test -- --run Sheet
```

Expected: `FAIL — Cannot find module './Sheet'`.

- [ ] **Step 4: Implement `Sheet.tsx`**

```tsx
// web/src/mobile/Sheet.tsx
import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import styles from "./Sheet.module.css";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;

interface SheetContentProps { children: ReactNode; }

export function SheetContent({ children }: SheetContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.content} aria-describedby={undefined}>
        <div className={styles.handle} aria-hidden />
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
```

Create `web/src/mobile/Sheet.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 0.4);
  z-index: 200;
}

.content {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 90dvh;
  overflow-y: auto;
  background: var(--sy-color-surface-1);
  border-radius: var(--sy-radius-xl) var(--sy-radius-xl) 0 0;
  padding: var(--sy-space-4);
  padding-bottom: calc(var(--sy-space-4) + env(safe-area-inset-bottom, 0px));
  z-index: 201;
  /* entrance animation */
  animation: slideUp var(--sy-motion) ease-out;
}

.handle {
  width: 36px;
  height: 4px;
  border-radius: var(--sy-radius-pill);
  background: var(--sy-color-line);
  margin: 0 auto var(--sy-space-3);
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
```

- [ ] **Step 5: Run tests**

```bash
cd web && npm test -- --run Sheet
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/mobile/Sheet.tsx web/src/mobile/Sheet.test.tsx \
        web/src/mobile/Sheet.module.css
git commit -m "feat(web): Sheet primitive (bottom-sheet via Radix Dialog) (plan 13)"
```

---

### Task 13.7 — `SearchSheet` (categorized, navigation-only)

**Files:**
- Create: `web/src/mobile/SearchSheet.tsx`
- Create: `web/src/mobile/SearchSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/mobile/SearchSheet.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchSheet } from "./SearchSheet";

// Minimal stub for the catalog hook used by SearchSheet
vi.mock("@/hooks/useCommandCatalog", () => ({
  useCommandCatalog: () => ({ verbs: [] }),
}));

test("renders category headers when results exist", async () => {
  const user = userEvent.setup();
  render(<SearchSheet open onOpenChange={() => {}} />);
  const input = screen.getByRole("searchbox");
  await user.type(input, "living");
  // We get at least one section heading even with empty catalog
  expect(screen.getByText(/rooms/i)).toBeInTheDocument();
});

test("shows empty state when no query", () => {
  render(<SearchSheet open onOpenChange={() => {}} />);
  expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npm test -- --run SearchSheet
```

Expected: `FAIL — Cannot find module './SearchSheet'`.

- [ ] **Step 3: Implement `SearchSheet.tsx`**

```tsx
// web/src/mobile/SearchSheet.tsx
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sheet, SheetContent } from "./Sheet";
import * as Dialog from "@radix-ui/react-dialog";
import styles from "./SearchSheet.module.css";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Each category shown in the search sheet. Results within categories
// come from the router tree (rooms, pages) and the command catalog verbs
// that have a navigation target. No verb parsing is done here.
const CATEGORIES = ["Rooms", "Entities", "Automations", "Activity"] as const;

export function SearchSheet({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const close = () => { setQuery(""); onOpenChange(false); };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <input
          role="searchbox"
          className={styles.input}
          placeholder="Search rooms, entities, automations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {CATEGORIES.map((cat) => (
          <section key={cat} className={styles.section}>
            <h3 className={styles.heading}>{cat}</h3>
            {/* Results wired in subsequent tasks; placeholder empty state */}
            {query.length === 0 && (
              <p className={styles.empty}>Type to search {cat.toLowerCase()}</p>
            )}
          </section>
        ))}
      </SheetContent>
    </Dialog.Root>
  );
}
```

Create `web/src/mobile/SearchSheet.module.css`:

```css
.input {
  width: 100%;
  background: var(--sy-color-surface-2);
  border: 1px solid var(--sy-color-line);
  border-radius: var(--sy-radius);
  padding: var(--sy-space-2) var(--sy-space-3);
  font-family: var(--sy-font-body);
  color: var(--sy-color-fg);
  margin-bottom: var(--sy-space-3);
}

.section { margin-bottom: var(--sy-space-3); }

.heading {
  font-size: 11px;
  font-weight: 600;
  color: var(--sy-color-fg-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: var(--sy-space-1);
}

.empty { color: var(--sy-color-fg-4); font-size: 13px; }
```

- [ ] **Step 4: Run tests**

```bash
cd web && npm test -- --run SearchSheet
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/mobile/SearchSheet.tsx web/src/mobile/SearchSheet.test.tsx \
        web/src/mobile/SearchSheet.module.css
git commit -m "feat(web): SearchSheet with categorized results (plan 13)"
```

---

### Task 13.8 — `RoomSheet`

**Files:**
- Create: `web/src/mobile/RoomSheet.tsx`
- Create: `web/src/mobile/RoomSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/mobile/RoomSheet.test.tsx
import { render, screen } from "@testing-library/react";
import { RoomSheet } from "./RoomSheet";

const fakeRoom = {
  slug: "living-room",
  name: "Living Room",
  brightness: 75,
  scenes: ["Movie", "Dinner", "Bright", "Night"],
  entities: [{ id: "light.1", name: "Ceiling", on: true }],
};

test("renders room name and brightness", () => {
  render(<RoomSheet open room={fakeRoom} onOpenChange={() => {}} />);
  expect(screen.getByText("Living Room")).toBeInTheDocument();
  expect(screen.getByRole("slider")).toBeInTheDocument();
});

test("renders scene chips", () => {
  render(<RoomSheet open room={fakeRoom} onOpenChange={() => {}} />);
  expect(screen.getByText("Movie")).toBeInTheDocument();
  expect(screen.getByText("Dinner")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npm test -- --run RoomSheet
```

Expected: `FAIL — Cannot find module './RoomSheet'`.

- [ ] **Step 3: Implement `RoomSheet.tsx`**

```tsx
// web/src/mobile/RoomSheet.tsx
import { Sheet, SheetContent } from "./Sheet";
import styles from "./RoomSheet.module.css";

interface Entity { id: string; name: string; on: boolean; }
interface Room {
  slug: string;
  name: string;
  brightness: number;
  scenes: string[];
  entities: Entity[];
}
interface Props { open: boolean; room: Room; onOpenChange: (open: boolean) => void; }

export function RoomSheet({ open, room, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <h2 className={styles.title}>{room.name}</h2>
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={room.brightness}
          className={styles.slider}
          aria-label="Brightness"
        />
        <div className={styles.scenes}>
          {room.scenes.slice(0, 4).map((s) => (
            <button key={s} className={styles.scene}>{s}</button>
          ))}
        </div>
        <ul className={styles.entities}>
          {room.entities.map((e) => (
            <li key={e.id} className={styles.entity}>
              <span>{e.name}</span>
              <input type="checkbox" defaultChecked={e.on} aria-label={e.name} />
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
```

Create `web/src/mobile/RoomSheet.module.css`:

```css
.title { font-family: var(--sy-font-display); color: var(--sy-color-fg); margin-bottom: var(--sy-space-3); }
.slider { width: 100%; accent-color: var(--sy-color-accent); margin-bottom: var(--sy-space-3); }
.scenes { display: flex; gap: var(--sy-space-2); margin-bottom: var(--sy-space-3); flex-wrap: wrap; }
.scene { background: var(--sy-color-surface-2); border: 1px solid var(--sy-color-line); border-radius: var(--sy-radius-pill); padding: var(--sy-space-1) var(--sy-space-3); color: var(--sy-color-fg-2); font-size: 13px; }
.entities { list-style: none; padding: 0; }
.entity { display: flex; justify-content: space-between; align-items: center; padding: var(--sy-space-2) 0; border-bottom: 1px solid var(--sy-color-line-soft); color: var(--sy-color-fg-2); font-size: 14px; }
```

- [ ] **Step 4: Run tests**

```bash
cd web && npm test -- --run RoomSheet
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/mobile/RoomSheet.tsx web/src/mobile/RoomSheet.test.tsx \
        web/src/mobile/RoomSheet.module.css
git commit -m "feat(web): RoomSheet with brightness slider + scenes + entities (plan 13)"
```

---

### Task 13.9 — `StorySheet`

**Files:**
- Create: `web/src/mobile/StorySheet.tsx`
- Create: `web/src/mobile/StorySheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/mobile/StorySheet.test.tsx
import { render, screen } from "@testing-library/react";
import { StorySheet } from "./StorySheet";

const fakeStory = {
  id: "story-1",
  title: "Motion detected",
  whyInteresting: ["First motion in 4 hours", "Night-time rule matched"],
  events: [{ id: "e1", summary: "PIR sensor triggered" }],
  actions: ["Dismiss", "View in Activity"],
};

test("renders story title and why-interesting cards", () => {
  render(<StorySheet open story={fakeStory} onOpenChange={() => {}} />);
  expect(screen.getByText("Motion detected")).toBeInTheDocument();
  expect(screen.getByText("First motion in 4 hours")).toBeInTheDocument();
});

test("renders action buttons", () => {
  render(<StorySheet open story={fakeStory} onOpenChange={() => {}} />);
  expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npm test -- --run StorySheet
```

Expected: `FAIL — Cannot find module './StorySheet'`.

- [ ] **Step 3: Implement `StorySheet.tsx`**

```tsx
// web/src/mobile/StorySheet.tsx
import { Sheet, SheetContent } from "./Sheet";
import styles from "./StorySheet.module.css";

interface Story {
  id: string;
  title: string;
  whyInteresting: string[];
  events: { id: string; summary: string }[];
  actions: string[];
}
interface Props { open: boolean; story: Story; onOpenChange: (open: boolean) => void; }

export function StorySheet({ open, story, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <h2 className={styles.title}>{story.title}</h2>
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Why interesting</h3>
          {story.whyInteresting.map((reason, i) => (
            <div key={i} className={styles.card}>{reason}</div>
          ))}
        </section>
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Events</h3>
          <ul className={styles.events}>
            {story.events.map((e) => (
              <li key={e.id} className={styles.event}>{e.summary}</li>
            ))}
          </ul>
        </section>
        <div className={styles.actions}>
          {story.actions.map((a) => (
            <button key={a} className={styles.action}>{a}</button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

Create `web/src/mobile/StorySheet.module.css`:

```css
.title { font-family: var(--sy-font-display); color: var(--sy-color-fg); margin-bottom: var(--sy-space-3); }
.section { margin-bottom: var(--sy-space-4); }
.sectionHeading { font-size: 11px; font-weight: 600; color: var(--sy-color-fg-3); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: var(--sy-space-2); }
.card { background: var(--sy-color-surface-2); border-radius: var(--sy-radius); padding: var(--sy-space-2) var(--sy-space-3); margin-bottom: var(--sy-space-1); color: var(--sy-color-fg-2); font-size: 14px; }
.events { list-style: none; padding: 0; }
.event { padding: var(--sy-space-2) 0; border-bottom: 1px solid var(--sy-color-line-soft); color: var(--sy-color-fg-2); font-size: 13px; }
.actions { display: flex; gap: var(--sy-space-2); margin-top: var(--sy-space-3); }
.action { flex: 1; padding: var(--sy-space-2); background: var(--sy-color-surface-2); border: 1px solid var(--sy-color-line); border-radius: var(--sy-radius); color: var(--sy-color-fg); font-size: 14px; }
```

- [ ] **Step 4: Run tests**

```bash
cd web && npm test -- --run StorySheet
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/mobile/StorySheet.tsx web/src/mobile/StorySheet.test.tsx \
        web/src/mobile/StorySheet.module.css
git commit -m "feat(web): StorySheet with why-interesting + events + actions (plan 13)"
```

---

### Task 13.10 — `MobileHome`

**Files:**
- Create: `web/src/mobile/views/MobileHome.tsx`
- Create: `web/src/mobile/views/MobileHome.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/mobile/views/MobileHome.test.tsx
import { render, screen } from "@testing-library/react";
import { MobileHome } from "./MobileHome";

vi.mock("@/hooks/useHomeSummary", () => ({
  useHomeSummary: () => ({
    stats: [
      { id: "lights-on",   label: "Lights on",   value: "4" },
      { id: "temp",        label: "Temperature",  value: "21°C" },
      { id: "open-doors",  label: "Open doors",   value: "1" },
      { id: "automations", label: "Automations",  value: "12" },
    ],
    rooms: [{ slug: "living", name: "Living Room" }, { slug: "bedroom", name: "Bedroom" }],
    recentStories: [],
  }),
}));

test("renders 4 stat tiles", () => {
  render(<MobileHome />);
  expect(screen.getByText("Lights on")).toBeInTheDocument();
  expect(screen.getByText("Temperature")).toBeInTheDocument();
  expect(screen.getByText("Open doors")).toBeInTheDocument();
  expect(screen.getByText("Automations")).toBeInTheDocument();
});

test("renders rooms grid", () => {
  render(<MobileHome />);
  expect(screen.getByText("Living Room")).toBeInTheDocument();
  expect(screen.getByText("Bedroom")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npm test -- --run MobileHome
```

Expected: `FAIL — Cannot find module './MobileHome'`.

- [ ] **Step 3: Implement `MobileHome.tsx`**

```tsx
// web/src/mobile/views/MobileHome.tsx
import { useState } from "react";
import { useHomeSummary } from "@/hooks/useHomeSummary";
import { RoomSheet } from "@/mobile/RoomSheet";
import styles from "./MobileHome.module.css";

export function MobileHome() {
  const { stats, rooms, recentStories } = useHomeSummary();
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const selectedRoom = rooms.find((r) => r.slug === activeRoom) ?? null;

  return (
    <div className={styles.page}>
      <section className={styles.statsGrid}>
        {stats.slice(0, 4).map((s) => (
          <div key={s.id} className={styles.statTile}>
            <span className={styles.statValue}>{s.value}</span>
            <span className={styles.statLabel}>{s.label}</span>
          </div>
        ))}
      </section>
      <section className={styles.roomsGrid}>
        {rooms.map((r) => (
          <button
            key={r.slug}
            className={styles.roomCard}
            onClick={() => setActiveRoom(r.slug)}
          >
            {r.name}
          </button>
        ))}
      </section>
      {selectedRoom && (
        <RoomSheet
          open={!!activeRoom}
          room={{ ...selectedRoom, brightness: 80, scenes: [], entities: [] }}
          onOpenChange={(open) => { if (!open) setActiveRoom(null); }}
        />
      )}
    </div>
  );
}
```

Create `web/src/mobile/views/MobileHome.module.css`:

```css
.page { padding: var(--sy-space-3); }
.statsGrid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sy-space-2); margin-bottom: var(--sy-space-4); }
.statTile { background: var(--sy-color-surface-1); border-radius: var(--sy-radius); padding: var(--sy-space-3); display: flex; flex-direction: column; gap: var(--sy-space-1); }
.statValue { font-family: var(--sy-font-numeric); font-size: 24px; color: var(--sy-color-fg); }
.statLabel { font-size: 12px; color: var(--sy-color-fg-3); }
.roomsGrid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sy-space-2); }
.roomCard { background: var(--sy-color-surface-1); border: 1px solid var(--sy-color-line-soft); border-radius: var(--sy-radius); padding: var(--sy-space-4) var(--sy-space-3); text-align: left; color: var(--sy-color-fg); font-size: 15px; }
```

- [ ] **Step 4: Run tests**

```bash
cd web && npm test -- --run MobileHome
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/mobile/views/MobileHome.tsx web/src/mobile/views/MobileHome.test.tsx \
        web/src/mobile/views/MobileHome.module.css
git commit -m "feat(web): MobileHome with 2x2 stats + 2-col rooms grid (plan 13)"
```

---

### Task 13.11 — `MobileActivity`

**Files:**
- Create: `web/src/mobile/views/MobileActivity.tsx`
- Create: `web/src/mobile/views/MobileActivity.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/mobile/views/MobileActivity.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileActivity } from "./MobileActivity";

const fakeStories = [
  { id: "s1", title: "Motion detected", whyInteresting: [], events: [], actions: [] },
  { id: "s2", title: "Lights off at midnight", whyInteresting: [], events: [], actions: [] },
];

vi.mock("@/hooks/useActivityFeed", () => ({
  useActivityFeed: () => ({ stories: fakeStories, isLoading: false }),
}));

test("renders story cards", () => {
  render(<MobileActivity />);
  expect(screen.getByText("Motion detected")).toBeInTheDocument();
});

test("tapping a story opens StorySheet", async () => {
  const user = userEvent.setup();
  render(<MobileActivity />);
  await user.click(screen.getByText("Motion detected"));
  // StorySheet title appears in portal
  expect(screen.getAllByText("Motion detected").length).toBeGreaterThan(1);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npm test -- --run MobileActivity
```

Expected: `FAIL — Cannot find module './MobileActivity'`.

- [ ] **Step 3: Implement `MobileActivity.tsx`**

```tsx
// web/src/mobile/views/MobileActivity.tsx
import { useState } from "react";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import { StorySheet } from "@/mobile/StorySheet";
import { usePullToRefresh } from "@/mobile/usePullToRefresh";
import { useRef } from "react";
import styles from "./MobileActivity.module.css";

export function MobileActivity() {
  const { stories, isLoading } = useActivityFeed();
  const [activeStory, setActiveStory] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedStory = stories.find((s) => s.id === activeStory) ?? null;

  usePullToRefresh(scrollRef, () => {
    // invalidate the activity feed query; implemented via TanStack Query refetch
    // the hook just calls onRefresh — the caller controls what "refresh" means
  });

  return (
    <div ref={scrollRef} className={styles.page}>
      {isLoading && <p className={styles.loading}>Loading…</p>}
      {stories.map((s) => (
        <button
          key={s.id}
          className={styles.card}
          onClick={() => setActiveStory(s.id)}
        >
          <span className={styles.cardTitle}>{s.title}</span>
        </button>
      ))}
      {selectedStory && (
        <StorySheet
          open={!!activeStory}
          story={selectedStory}
          onOpenChange={(open) => { if (!open) setActiveStory(null); }}
        />
      )}
    </div>
  );
}
```

Create `web/src/mobile/views/MobileActivity.module.css`:

```css
.page { padding: var(--sy-space-3); overflow-y: auto; }
.loading { color: var(--sy-color-fg-4); text-align: center; padding: var(--sy-space-4); }
.card { display: block; width: 100%; text-align: left; background: var(--sy-color-surface-1); border: 1px solid var(--sy-color-line-soft); border-radius: var(--sy-radius); padding: var(--sy-space-3); margin-bottom: var(--sy-space-2); }
.cardTitle { font-size: 15px; color: var(--sy-color-fg); }
```

- [ ] **Step 4: Run tests**

```bash
cd web && npm test -- --run MobileActivity
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/mobile/views/MobileActivity.tsx web/src/mobile/views/MobileActivity.test.tsx \
        web/src/mobile/views/MobileActivity.module.css
git commit -m "feat(web): MobileActivity with PTR + StorySheet detail (plan 13)"
```

---

### Task 13.12 — `MobileAutomationView` (read-only)

**Files:**
- Create: `web/src/mobile/views/MobileAutomationView.tsx`
- Create: `web/src/mobile/views/MobileAutomationView.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/mobile/views/MobileAutomationView.test.tsx
import { render, screen } from "@testing-library/react";
import { MobileAutomationView } from "./MobileAutomationView";

const fakeAutomation = {
  id: "a1",
  name: "Night mode",
  description: "Dims lights at 10pm",
  enabled: true,
  lastRun: "2026-05-10T22:00:00Z",
};

test("renders automation name and read-only banner", () => {
  render(<MobileAutomationView automation={fakeAutomation} />);
  expect(screen.getByText("Night mode")).toBeInTheDocument();
  expect(screen.getByText(/editing on a larger screen/i)).toBeInTheDocument();
});

test("shows Run, Enable/Disable, and View buttons", () => {
  render(<MobileAutomationView automation={fakeAutomation} />);
  expect(screen.getByRole("button", { name: /run/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /disable/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /view/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npm test -- --run MobileAutomationView
```

Expected: `FAIL — Cannot find module './MobileAutomationView'`.

- [ ] **Step 3: Implement `MobileAutomationView.tsx`**

```tsx
// web/src/mobile/views/MobileAutomationView.tsx
import styles from "./MobileAutomationView.module.css";

interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  lastRun: string | null;
}
interface Props { automation: Automation; }

export function MobileAutomationView({ automation }: Props) {
  return (
    <div className={styles.page}>
      <div className={styles.banner} role="note">
        Full editing is only available on a larger screen.
      </div>
      <h1 className={styles.name}>{automation.name}</h1>
      <p className={styles.description}>{automation.description}</p>
      {automation.lastRun && (
        <p className={styles.meta}>Last run: {new Date(automation.lastRun).toLocaleString()}</p>
      )}
      <div className={styles.actions}>
        <button className={styles.btn}>Run</button>
        <button className={styles.btn}>View</button>
        <button className={styles.btn}>
          {automation.enabled ? "Disable" : "Enable"}
        </button>
      </div>
    </div>
  );
}
```

Create `web/src/mobile/views/MobileAutomationView.module.css`:

```css
.page { padding: var(--sy-space-4); }
.banner { background: var(--sy-color-surface-2); border: 1px solid var(--sy-color-line); border-radius: var(--sy-radius); padding: var(--sy-space-2) var(--sy-space-3); font-size: 13px; color: var(--sy-color-fg-3); margin-bottom: var(--sy-space-4); }
.name { font-family: var(--sy-font-display); font-size: 22px; color: var(--sy-color-fg); margin-bottom: var(--sy-space-2); }
.description { color: var(--sy-color-fg-2); font-size: 15px; margin-bottom: var(--sy-space-1); }
.meta { font-size: 12px; color: var(--sy-color-fg-4); margin-bottom: var(--sy-space-4); }
.actions { display: flex; gap: var(--sy-space-2); }
.btn { flex: 1; padding: var(--sy-space-2); background: var(--sy-color-surface-2); border: 1px solid var(--sy-color-line); border-radius: var(--sy-radius); color: var(--sy-color-fg); font-size: 14px; }
```

- [ ] **Step 4: Run tests**

```bash
cd web && npm test -- --run MobileAutomationView
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/mobile/views/MobileAutomationView.tsx \
        web/src/mobile/views/MobileAutomationView.test.tsx \
        web/src/mobile/views/MobileAutomationView.module.css
git commit -m "feat(web): MobileAutomationView read-only with Run/View/Enable/Disable (plan 13)"
```

---

### Task 13.13 — `MobilePklViewer` (read-only Monaco)

**Files:**
- Create: `web/src/mobile/views/MobilePklViewer.tsx`
- Create: `web/src/mobile/views/MobilePklViewer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/mobile/views/MobilePklViewer.test.tsx
import { render, screen } from "@testing-library/react";
import { MobilePklViewer } from "./MobilePklViewer";

// Monaco is heavy — mock it for unit tests
vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: { value: string }) => <pre data-testid="monaco-mock">{value}</pre>,
}));

const SOURCE = `amends "package://pkg.pkl-lang.org/pkl-k8s/k8s@1.0.0#/Deployment.pkl"\nname = "switchyardd"`;

test("renders source in Monaco (mocked)", () => {
  render(<MobilePklViewer source={SOURCE} path="switchyardd.pkl" />);
  expect(screen.getByTestId("monaco-mock")).toHaveTextContent("switchyardd");
});

test("shows read-only label", () => {
  render(<MobilePklViewer source={SOURCE} path="switchyardd.pkl" />);
  expect(screen.getByText(/read.only/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npm test -- --run MobilePklViewer
```

Expected: `FAIL — Cannot find module './MobilePklViewer'`.

- [ ] **Step 3: Implement `MobilePklViewer.tsx`**

```tsx
// web/src/mobile/views/MobilePklViewer.tsx
import MonacoEditor from "@monaco-editor/react";
import styles from "./MobilePklViewer.module.css";

interface Props { source: string; path: string; }

export function MobilePklViewer({ source, path }: Props) {
  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <span className={styles.path}>{path}</span>
        <span className={styles.readOnly}>Read-only</span>
      </div>
      <div className={styles.editorWrap}>
        <MonacoEditor
          height="100%"
          language="pkl"
          value={source}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
          }}
          theme="vs-dark"
        />
      </div>
    </div>
  );
}
```

Create `web/src/mobile/views/MobilePklViewer.module.css`:

```css
.page { display: flex; flex-direction: column; height: 100%; }
.topBar { display: flex; justify-content: space-between; align-items: center; padding: var(--sy-space-2) var(--sy-space-3); background: var(--sy-color-surface-1); border-bottom: 1px solid var(--sy-color-line); }
.path { font-family: var(--sy-font-numeric); font-size: 12px; color: var(--sy-color-fg-2); }
.readOnly { font-size: 11px; color: var(--sy-color-fg-4); }
.editorWrap { flex: 1; }
```

- [ ] **Step 4: Run tests**

```bash
cd web && npm test -- --run MobilePklViewer
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/mobile/views/MobilePklViewer.tsx \
        web/src/mobile/views/MobilePklViewer.test.tsx \
        web/src/mobile/views/MobilePklViewer.module.css
git commit -m "feat(web): MobilePklViewer read-only Monaco (plan 13)"
```

---

### Task 13.14 — Service worker IndexedDB story cache + Web Push registration

**Files:**
- Create: `web/src/pwa/story-cache.ts`
- Create: `web/src/pwa/notifications.ts`
- Create: `web/src/pwa/story-cache.test.ts`

- [ ] **Step 1: Add `idb` if absent**

```bash
cd web && npm ls idb 2>/dev/null || npm install idb
```

Expected: `idb` in `node_modules`.

- [ ] **Step 2: Write the failing story-cache test**

```ts
// web/src/pwa/story-cache.test.ts
import { cacheStories, loadCachedStories } from "./story-cache";

// idb uses IndexedDB — polyfilled by the vitest jsdom environment
test("round-trips up to 50 stories", async () => {
  const stories = Array.from({ length: 60 }, (_, i) => ({
    id: `story-${i}`,
    title: `Story ${i}`,
  }));
  await cacheStories(stories);
  const loaded = await loadCachedStories();
  // only the most recent 50 are kept
  expect(loaded.length).toBe(50);
  expect(loaded[0].id).toBe("story-59");
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd web && npm test -- --run story-cache
```

Expected: `FAIL — Cannot find module './story-cache'`.

- [ ] **Step 4: Implement `story-cache.ts`**

```ts
// web/src/pwa/story-cache.ts
import { openDB } from "idb";

const DB_NAME = "sy-pwa";
const STORE   = "stories";
const VERSION = 1;
const MAX_STORIES = 50;

function getDB() {
  return openDB(DB_NAME, VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    },
  });
}

export async function cacheStories(stories: Array<{ id: string; title: string }>): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE, "readwrite");
  // Keep only the most recent MAX_STORIES entries — clear and rewrite on each update
  await tx.store.clear();
  const recent = stories.slice(-MAX_STORIES);
  for (const s of recent) {
    await tx.store.put(s);
  }
  await tx.done;
}

export async function loadCachedStories(): Promise<Array<{ id: string; title: string }>> {
  const db = await getDB();
  const all = await db.getAll(STORE);
  // Sort descending by id (assumption: ids are lexicographically ordered by time)
  return all.sort((a, b) => b.id.localeCompare(a.id));
}
```

- [ ] **Step 5: Implement `notifications.ts`**

```ts
// web/src/pwa/notifications.ts
// Web Push subscription registration.
// Call registerPushSubscription() after the user grants notification permission.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function registerPushSubscription(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  // POST the subscription to the server-side PushService
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!))),
      auth:   btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!))),
      userAgent: navigator.userAgent,
    }),
  });
}
```

- [ ] **Step 6: Run story-cache tests**

```bash
cd web && npm test -- --run story-cache
```

Expected: 1 test passes.

- [ ] **Step 7: Commit**

```bash
git add web/src/pwa/story-cache.ts web/src/pwa/story-cache.test.ts \
        web/src/pwa/notifications.ts
git commit -m "feat(web): IndexedDB story cache + Web Push subscription registration (plan 13)"
```

---

### Task 13.15 — Playwright mobile snapshot tests

**Files:**
- Create: `web/e2e/mobile-snapshot.spec.ts`

- [ ] **Step 1: Write the Playwright test**

```ts
// web/e2e/mobile-snapshot.spec.ts
import { test, expect } from "@playwright/test";

const MOBILE = { width: 390, height: 844 }; // iPhone 14

test.use({ viewport: MOBILE });

const SCREENS = [
  { name: "MobileHome",   path: "/home" },
  { name: "Rooms",        path: "/rooms" },
  { name: "Activity",     path: "/activity" },
  { name: "AutomationView", path: "/automations/test-automation" },
  { name: "PklViewer",    path: "/settings/pkl" },
];

for (const { name, path } of SCREENS) {
  test(`mobile snapshot — ${name}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot(`mobile-${name}.png`);
  });
}

test("mobile snapshot — SearchSheet open", async ({ page }) => {
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /search/i }).click();
  await page.waitForSelector('[role="searchbox"]');
  await expect(page).toHaveScreenshot("mobile-SearchSheet.png");
});

test("mobile snapshot — RoomSheet open", async ({ page }) => {
  await page.goto("/rooms");
  await page.waitForLoadState("networkidle");
  await page.getByText("Living Room").first().click();
  await expect(page.getByRole("slider")).toBeVisible();
  await expect(page).toHaveScreenshot("mobile-RoomSheet.png");
});
```

- [ ] **Step 2: Generate reference screenshots**

```bash
cd web && npx playwright test e2e/mobile-snapshot.spec.ts --update-snapshots
```

Expected: reference images written to `web/e2e/__screenshots__/mobile-snapshot/`. Commit them.

- [ ] **Step 3: Verify the test is repeatable**

```bash
cd web && npx playwright test e2e/mobile-snapshot.spec.ts
```

Expected: all tests pass with no diff.

- [ ] **Step 4: Commit**

```bash
git add web/e2e/mobile-snapshot.spec.ts web/e2e/__screenshots__/mobile-snapshot/
git commit -m "test(web): Playwright mobile snapshots across 7 screens (plan 13)"
```

---

## Test plan

- `go test ./internal/push/...` — subscription store round-trip and notifier severity gate both pass.
- `cd web && npm test` — all unit tests across `breakpoint`, `Sheet`, `SearchSheet`, `RoomSheet`, `StorySheet`, `MobileShell`, `MobileHome`, `MobileActivity`, `MobileAutomationView`, `MobilePklViewer`, `story-cache` pass.
- `task web:lint` — ESLint green; all new CSS uses `--sy-*` tokens; `no-raw-tokens` passes.
- `task web:build` — bundle builds without errors.
- `cd web && npx playwright test e2e/mobile-snapshot.spec.ts` — 7 screens match reference images.
- Manual smoke at 375px: bottom tab bar visible, Sheet opens on room tap, read-only banner visible in automation and Pkl views, pull-to-refresh spinner appears on downward overscroll of Activity.

## Acceptance criteria for merging

- All tests + typecheck + lint green locally and in CI.
- Viewport ≥ 768px renders the desktop Shell unchanged.
- Viewport < 768px renders `MobileShell` with 4-tab bottom bar; all four tabs navigate correctly.
- No operator-write UI (Pkl Apply, automation form fields, driver config form) is reachable on mobile.
- Pull-to-refresh works on Home and Activity.
- Web Push subscription flow completes in a browser with notification permission granted (manual test).
- IndexedDB stores up to 50 stories; cold load shows them before the multiplexer reconnects.
- Playwright mobile snapshots committed and passing.
- Branch merged to main via `git merge --no-ff`.
