/**
 * EditChrome.tsx — wraps page content in edit mode with a top bar
 * ("· editing" label, Discard, Save & exit) and 320px settings rail.
 */

import type { ReactNode } from "react";
import { usePageEditor } from "./use-page-editor";
import { SettingsRail } from "./SettingsRail";

interface Props {
  children: ReactNode;
  onSave: () => void;
  onDiscard: () => void;
}

export function EditChrome({ children, onSave, onDiscard }: Props) {
  const dirty = usePageEditor((s) => s.dirty);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Edit top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sy-space-3)",
          padding: "var(--sy-space-2) var(--sy-space-4)",
          background: "var(--sy-color-surface-2)",
          borderBottom: "1px solid var(--sy-color-accent)",
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--sy-color-accent)",
          }}
          data-testid="edit-indicator"
        >
          · editing{dirty ? " *" : ""}
        </span>
        <button
          onClick={onDiscard}
          style={{
            background: "none",
            border: "1px solid var(--sy-color-line)",
            borderRadius: "var(--sy-radius)",
            color: "var(--sy-color-fg-2)",
            padding: "var(--sy-space-1) var(--sy-space-3)",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Discard
        </button>
        <button
          onClick={onSave}
          style={{
            background: "var(--sy-color-accent)",
            border: "none",
            borderRadius: "var(--sy-radius)",
            color: "var(--sy-color-bg)",
            padding: "var(--sy-space-1) var(--sy-space-3)",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Save &amp; exit
        </button>
      </div>

      {/* Content + rail */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 320px", overflow: "hidden" }}>
        <div style={{ overflowY: "auto" }}>{children}</div>
        <SettingsRail />
      </div>
    </div>
  );
}
