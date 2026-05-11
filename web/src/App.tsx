import { lazy, Suspense, type ReactNode } from "react";
import { Login } from "./routes/login";
import { ReconnectingBanner } from "./shell/ReconnectingBanner";
import { Shell } from "./shell/Shell";
import { MobileShell } from "./mobile/MobileShell";
import { useBreakpoint } from "./mobile/breakpoint";

// Eagerly-loaded v2 pages (small enough; loaded on most navigations).
import { HomePage } from "./pages/home";
import { Activity } from "./routes/_authed/activity";
import { Rooms } from "./routes/_authed/rooms/index";
import { RoomSlug } from "./routes/_authed/rooms/$slug";
import { Devices } from "./routes/_authed/devices/index";
import { DeviceDetail } from "./routes/_authed/devices/$id";
import { Automations } from "./routes/_authed/automations/index";
import { AutomationSlug } from "./routes/_authed/automations/$slug";
import { TimeMachineEvent } from "./routes/_authed/time-machine/$eventId";
import { SettingsSection } from "./routes/_authed/settings/$section";
import { PageSlug } from "./routes/_authed/pages/$slug";
import { DisplaysIndex } from "./routes/_authed/displays/index";
import { DisplaySlug } from "./routes/_authed/displays/$slug";
import { DisplayPage } from "./routes/display.$id";
import { PairPage } from "./routes/pair";

// Pkl editor routes — lazy-loaded (Monaco is heavy)
const PklEditorRoute = lazy(() => import("./pkl-editor/route"));
const MergeRoute = lazy(() => import("./pkl-editor/merge-route"));

/**
 * AuthedFrame — wraps an authenticated page in the desktop Shell or
 * mobile shell, with the ReconnectingBanner above it. The corresponding
 * route file in routes/_authed/_layout.tsx is the TanStack Router shape;
 * this component renders the same hierarchy under the hand-rolled
 * pathname-switch router we use today.
 */
function AuthedFrame({ children }: { children: ReactNode }) {
  const { isMobile } = useBreakpoint();
  const ShellComponent = isMobile ? MobileShell : Shell;
  return (
    <>
      <ReconnectingBanner />
      <ShellComponent>{children}</ShellComponent>
    </>
  );
}

/**
 * Resolve a pathname to the authed-frame page to render. Returns null when
 * no v2 route matches so the caller can render the not-found fallback.
 */
function resolveAuthedRoute(path: string): ReactNode | null {
  // /, /home → Home
  if (path === "/" || path === "/home" || path === "/_authed" || path === "/_authed/" || path === "/_authed/home") {
    return <HomePage />;
  }
  if (path === "/rooms" || path === "/_authed/rooms") return <Rooms />;
  if (path.startsWith("/rooms/") || path.startsWith("/_authed/rooms/")) {
    const base = path.startsWith("/_authed/rooms/") ? "/_authed/rooms/" : "/rooms/";
    return <RoomSlug slug={decodeURIComponent(path.slice(base.length))} />;
  }
  if (path === "/activity" || path === "/_authed/activity") return <Activity />;
  if (path === "/devices" || path === "/_authed/devices") return <Devices />;
  if (path.startsWith("/devices/") || path.startsWith("/_authed/devices/")) {
    const base = path.startsWith("/_authed/devices/") ? "/_authed/devices/" : "/devices/";
    return <DeviceDetail id={decodeURIComponent(path.slice(base.length))} />;
  }
  if (path === "/automations" || path === "/_authed/automations") return <Automations />;
  if (path.startsWith("/automations/") || path.startsWith("/_authed/automations/")) {
    const base = path.startsWith("/_authed/automations/") ? "/_authed/automations/" : "/automations/";
    return <AutomationSlug slug={decodeURIComponent(path.slice(base.length))} />;
  }
  if (path.startsWith("/time-machine/") || path.startsWith("/_authed/time-machine/")) {
    const base = path.startsWith("/_authed/time-machine/") ? "/_authed/time-machine/" : "/time-machine/";
    return <TimeMachineEvent eventId={decodeURIComponent(path.slice(base.length))} />;
  }
  if (path === "/settings" || path === "/_authed/settings") {
    if (typeof window !== "undefined") window.location.replace("/settings/account");
    return null;
  }
  if (path.startsWith("/settings/") || path.startsWith("/_authed/settings/")) {
    const base = path.startsWith("/_authed/settings/") ? "/_authed/settings/" : "/settings/";
    return <SettingsSection section={path.slice(base.length)} />;
  }
  if (path === "/pages" || path === "/_authed/pages") {
    // No standalone Pages index in v2 — Pages live in the sidebar; show Home.
    return <HomePage />;
  }
  if (path.startsWith("/pages/") || path.startsWith("/_authed/pages/")) {
    const base = path.startsWith("/_authed/pages/") ? "/_authed/pages/" : "/pages/";
    return <PageSlug slug={decodeURIComponent(path.slice(base.length))} />;
  }
  if (path === "/displays" || path === "/_authed/displays") return <DisplaysIndex />;
  if (path.startsWith("/displays/") || path.startsWith("/_authed/displays/")) {
    const base = path.startsWith("/_authed/displays/") ? "/_authed/displays/" : "/displays/";
    return <DisplaySlug slug={decodeURIComponent(path.slice(base.length))} />;
  }
  return null;
}

export default function App() {
  const path = window.location.pathname;

  if (path === "/login") {
    return (
      <>
        <ReconnectingBanner />
        <Login />
      </>
    );
  }

  // Public: display renderer — no Shell, auth via per-display token.
  if (path.startsWith("/display/")) {
    const id = decodeURIComponent(path.slice("/display/".length));
    return <DisplayPage id={id} />;
  }
  // Public: pair code redemption — no Shell.
  if (path === "/pair") return <PairPage />;

  // Redirect legacy /dashboards/* → /pages/*.
  if (path.startsWith("/dashboards/")) {
    window.location.replace(`/pages/${decodeURIComponent(path.slice("/dashboards/".length))}`);
    return null;
  }

  // Pkl editor — own full-screen layout, no Shell.
  if (path.startsWith("/_authed/pkl-editor/merge/") || path.startsWith("/pkl-editor/merge/")) {
    return (
      <Suspense fallback={null}>
        <ReconnectingBanner />
        <MergeRoute />
      </Suspense>
    );
  }
  if (path.startsWith("/_authed/pkl-editor/") || path.startsWith("/pkl-editor/")) {
    return (
      <Suspense fallback={null}>
        <ReconnectingBanner />
        <PklEditorRoute />
      </Suspense>
    );
  }

  // Authed IA: every other route renders inside Shell (or MobileShell).
  const page = resolveAuthedRoute(path);
  if (page === null) {
    return (
      <AuthedFrame>
        <div
          style={{
            padding: "var(--sy-space-5) var(--sy-space-6)",
            color: "var(--sy-color-fg)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>
            Not found
          </h1>
          <p style={{ color: "var(--sy-color-fg-3)", marginTop: "var(--sy-space-2)" }}>
            No page is registered for <code>{path}</code>.
          </p>
        </div>
      </AuthedFrame>
    );
  }
  return <AuthedFrame>{page}</AuthedFrame>;
}
