import { usePalette } from "@/palette/use-palette";
import { useVocab, type RouteId } from "../theme/vocab";

interface TopBarProps {
  currentPath?: string;
}

/**
 * Extract the route segment from a pathname and cast to RouteId.
 * e.g. "/_authed/activity" → "activity"
 * Falls back to "home" for unknown segments.
 */
function pathToRouteId(path: string): RouteId {
  const segments = path.replace(/\/_authed/, "").split("/").filter(Boolean);
  const segment = segments[segments.length - 1] ?? "home";
  const knownRoutes: RouteId[] = ["home", "rooms", "activity", "automations", "devices", "settings"];
  return (knownRoutes.includes(segment as RouteId) ? segment : "home") as RouteId;
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.platform.toLowerCase().includes("mac");
}

export function TopBar({
  currentPath = typeof window !== "undefined" ? window.location.pathname : "/",
}: TopBarProps) {
  const vocab = useVocab();
  const routeId = pathToRouteId(currentPath);
  const label = vocab.label(routeId);
  const { openPalette } = usePalette();
  const shortcutLabel = isMac() ? "⌘K" : "Ctrl+K";

  return (
    <header
      data-testid="topbar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 24px",
        borderBottom: "1px solid var(--sy-color-line)",
        background: "var(--sy-color-bg)",
      }}
    >
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" data-testid="breadcrumb">
        <span
          style={{
            fontSize: "13px",
            color: "var(--sy-color-fg-3)",
          }}
        >
          <b
            style={{
              color: "var(--sy-color-fg)",
              fontWeight: 500,
            }}
          >
            {label}
          </b>
        </span>
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Status dot — placeholder (Plan 3 will wire to interestingness) */}
      <div
        aria-label="Status indicator"
        title="Status (coming in Plan 03)"
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "var(--sy-radius-pill)",
          background: "var(--sy-color-good)",
        }}
      />

      {/* Command palette button */}
      <button
        data-testid="topbar-palette-btn"
        aria-label="Open command palette"
        onClick={openPalette}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          background: "var(--sy-color-surface-1)",
          border: "1px solid var(--sy-color-line)",
          borderRadius: "var(--sy-radius-pill)",
          color: "var(--sy-color-fg-4)",
          fontSize: "12.5px",
          cursor: "pointer",
          minWidth: "160px",
          boxShadow: "var(--sy-shadow)",
        }}
      >
        <span style={{ flex: 1, textAlign: "left" }}>Search...</span>
        <kbd
          style={{
            fontFamily: "var(--sy-font-numeric)",
            fontSize: "10.5px",
            padding: "1px 5px",
            background: "var(--sy-color-surface-2)",
            borderRadius: "var(--sy-radius-sm)",
            color: "var(--sy-color-fg-4)",
            border: "1px solid var(--sy-color-line)",
          }}
        >
          {shortcutLabel}
        </kbd>
      </button>
    </header>
  );
}
