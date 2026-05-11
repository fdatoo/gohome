import { useState } from "react";
import { ChevronRightIcon } from "@/shell/icons";

interface FilePreset {
  path: string;
  label: string;
  description: string;
}

const PRESETS: FilePreset[] = [
  {
    path: "main.pkl",
    label: "Main config",
    description: "Top-level Switchyard config — drivers, entities, automations.",
  },
  {
    path: "automations/",
    label: "Automations",
    description: "Browse and edit .pkl automation definitions.",
  },
  {
    path: "pages/",
    label: "Custom pages",
    description: "Pkl-backed Custom Pages and ambient Display layouts.",
  },
  {
    path: "drivers/",
    label: "Driver instances",
    description: "Per-driver configuration (Hue bridge IP, Z2M MQTT URL, …).",
  },
];

export function PklConfig() {
  const [customPath, setCustomPath] = useState("");

  function open(path: string) {
    const trimmed = path.replace(/^\/+/, "");
    window.location.assign(`/_authed/pkl-editor/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "var(--sy-space-4)" }}
    >
      <header>
        <h1
          style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 600,
            color: "var(--sy-color-fg)",
          }}
        >
          Pkl config
        </h1>
        <p
          style={{
            margin: "var(--sy-space-1) 0 0",
            color: "var(--sy-color-fg-3)",
            fontSize: "0.875rem",
          }}
        >
          Open any Pkl file under <code>~/.switchyard/config/</code> in the
          editor. Changes are validated before being applied to the daemon.
        </p>
      </header>

      <section
        style={{
          background: "var(--sy-color-surface-1)",
          borderRadius: "var(--sy-radius-lg)",
          boxShadow: "var(--sy-shadow)",
        }}
      >
        <h2
          style={{
            margin: 0,
            padding: "var(--sy-space-3) var(--sy-space-4) var(--sy-space-2)",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--sy-color-fg-4)",
            fontWeight: 600,
          }}
        >
          Quick open
        </h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {PRESETS.map((p, i) => (
            <li key={p.path}>
              <button
                type="button"
                onClick={() => open(p.path)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  gap: "var(--sy-space-3)",
                  width: "100%",
                  padding: "var(--sy-space-3) var(--sy-space-4)",
                  background: "transparent",
                  border: "none",
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--sy-color-line-soft)",
                  color: "var(--sy-color-fg)",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                    {p.label}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--sy-color-fg-3)",
                      marginTop: "2px",
                    }}
                  >
                    {p.description}
                  </div>
                  <code
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "var(--sy-color-fg-4)",
                      marginTop: "2px",
                    }}
                  >
                    {p.path}
                  </code>
                </div>
                <span style={{ color: "var(--sy-color-fg-4)" }}>
                  <ChevronRightIcon size={16} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section
        style={{
          background: "var(--sy-color-surface-1)",
          borderRadius: "var(--sy-radius-lg)",
          boxShadow: "var(--sy-shadow)",
          padding: "var(--sy-space-4)",
        }}
      >
        <h2
          style={{
            margin: "0 0 var(--sy-space-2)",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--sy-color-fg-4)",
            fontWeight: 600,
          }}
        >
          Open by path
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (customPath.trim()) open(customPath.trim());
          }}
          style={{ display: "flex", gap: "var(--sy-space-2)" }}
        >
          <input
            type="text"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            placeholder="e.g. automations/sunset-lights.pkl"
            style={{
              flex: 1,
              padding: "var(--sy-space-2) var(--sy-space-3)",
              borderRadius: "var(--sy-radius)",
              border: "1px solid var(--sy-color-line)",
              background: "var(--sy-color-bg)",
              color: "var(--sy-color-fg)",
              fontSize: "0.875rem",
              fontFamily: "var(--sy-font-numeric)",
            }}
          />
          <button
            type="submit"
            disabled={!customPath.trim()}
            style={{
              padding: "var(--sy-space-2) var(--sy-space-3)",
              borderRadius: "var(--sy-radius)",
              border: "none",
              background: customPath.trim()
                ? "var(--sy-color-accent)"
                : "var(--sy-color-surface-2)",
              color: customPath.trim()
                ? "var(--sy-color-bg)"
                : "var(--sy-color-fg-4)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: customPath.trim() ? "pointer" : "not-allowed",
            }}
          >
            Open
          </button>
        </form>
      </section>
    </div>
  );
}
