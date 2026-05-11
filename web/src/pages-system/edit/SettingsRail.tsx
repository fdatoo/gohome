/**
 * SettingsRail.tsx — 320px right rail showing selected section's settings + live Pkl preview.
 */

import { usePageEditor } from "./use-page-editor";
import { serialiseSection } from "./pkl-serialiser";

export function SettingsRail() {
  const selectedId = usePageEditor((s) => s.selectedSectionId);
  const sections = usePageEditor((s) => s.sections);
  const updateProps = usePageEditor((s) => s.updateSectionProps);

  const section = sections.find((s) => s.id === selectedId);

  if (!section) {
    return (
      <div
        style={{
          width: "320px",
          background: "var(--sy-color-surface-2)",
          borderLeft: "1px solid var(--sy-color-line)",
          padding: "var(--sy-space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sy-space-3)",
          overflow: "auto",
        }}
      >
        <p style={{ color: "var(--sy-color-fg-3)", fontSize: "0.875rem", margin: 0 }}>
          Select a section to edit its settings.
        </p>
      </div>
    );
  }

  const pklPreview = serialiseSection(section);

  return (
    <div
      style={{
        width: "320px",
        background: "var(--sy-color-surface-2)",
        borderLeft: "1px solid var(--sy-color-line)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      aria-label="Settings rail"
    >
      <div
        style={{
          padding: "var(--sy-space-4)",
          borderBottom: "1px solid var(--sy-color-line-soft)",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "var(--sy-color-fg)",
          }}
        >
          {section.type} section
        </h3>
        <p style={{ margin: "var(--sy-space-1) 0 0", fontSize: "0.75rem", color: "var(--sy-color-fg-3)" }}>
          {section.id}
        </p>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--sy-space-3) var(--sy-space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sy-space-3)",
        }}
      >
        {/* Generic prop editor — shows all string/number/boolean props */}
        {Object.entries(section.props).map(([key, value]) => {
          if (typeof value === "boolean") {
            return (
              <label
                key={key}
                style={{ display: "flex", alignItems: "center", gap: "var(--sy-space-2)", fontSize: "0.875rem" }}
              >
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => updateProps(section.id, { [key]: e.target.checked })}
                  style={{ accentColor: "var(--sy-color-accent)" }}
                />
                <span style={{ color: "var(--sy-color-fg)" }}>{key}</span>
              </label>
            );
          }
          if (typeof value === "string" || typeof value === "number") {
            return (
              <label
                key={key}
                style={{ display: "flex", flexDirection: "column", gap: "var(--sy-space-1)" }}
              >
                <span style={{ fontSize: "0.75rem", color: "var(--sy-color-fg-3)" }}>{key}</span>
                <input
                  type="text"
                  value={String(value)}
                  onChange={(e) => updateProps(section.id, { [key]: e.target.value })}
                  style={{
                    background: "var(--sy-color-surface-1)",
                    border: "1px solid var(--sy-color-line)",
                    borderRadius: "var(--sy-radius-sm)",
                    color: "var(--sy-color-fg)",
                    fontSize: "0.875rem",
                    padding: "var(--sy-space-2)",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
              </label>
            );
          }
          return null;
        })}
      </div>

      {/* Live Pkl preview */}
      <div
        style={{
          borderTop: "1px solid var(--sy-color-line-soft)",
          padding: "var(--sy-space-3)",
        }}
      >
        <p
          style={{
            margin: "0 0 var(--sy-space-1)",
            fontSize: "0.6875rem",
            color: "var(--sy-color-fg-4)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Pkl preview
        </p>
        {/* eslint-disable switchyard/no-raw-tokens -- Pkl preview uses fixed dark code theme per plan decision */}
        <pre
          data-testid="pkl-preview"
          style={{
            margin: 0,
            borderRadius: "var(--sy-radius-sm)",
            padding: "var(--sy-space-2)",
            fontSize: "0.6875rem",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            // intentional fixed dark theme for code display, not a design token context
            background: "#1c1c24",
            color: "#d4d2cb",
          }}
        >
          {pklPreview}
        </pre>
        {/* eslint-enable switchyard/no-raw-tokens */}
      </div>
    </div>
  );
}
