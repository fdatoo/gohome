/**
 * Chart.tsx — time-series chart section with window chips.
 * uPlot integration is deferred to Plan 08; shows placeholder SVG area.
 */

import { useState } from "react";
import { registerSection } from "../../registry";
import type { SectionProps } from "../../registry";

const WINDOWS = ["1h", "6h", "24h", "7d"] as const;
type Window = (typeof WINDOWS)[number];

function ChartSection({ def }: SectionProps) {
  const title = def.props.title as string | undefined;
  const subtitle = def.props.subtitle as string | undefined;
  const initialWindow = (def.props.window as Window) ?? "24h";
  const showLegend = (def.props.showLegend as boolean) ?? true;
  const [window, setWindow] = useState<Window>(initialWindow);

  return (
    <div style={{ padding: "var(--sy-space-4)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "var(--sy-space-3)",
          flexWrap: "wrap",
          gap: "var(--sy-space-2)",
        }}
      >
        <div>
          {title && (
            <h3
              style={{
                margin: 0,
                color: "var(--sy-color-fg)",
                fontSize: "1rem",
                fontWeight: 600,
              }}
            >
              {title}
            </h3>
          )}
          {subtitle && (
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--sy-color-fg-3)" }}>
              {subtitle}
            </p>
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--sy-space-1)",
            background: "var(--sy-color-surface-2)",
            borderRadius: "var(--sy-radius-pill)",
            padding: "var(--sy-space-1)",
          }}
        >
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              style={{
                background: window === w ? "var(--sy-color-accent)" : "transparent",
                color: window === w ? "var(--sy-color-bg)" : "var(--sy-color-fg-3)",
                border: "none",
                borderRadius: "var(--sy-radius-pill)",
                padding: "0.25rem 0.625rem",
                fontSize: "0.75rem",
                cursor: "pointer",
                fontWeight: window === w ? 600 : 400,
                transition: "background var(--sy-motion-fast)",
              }}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Chart placeholder — uPlot wired in Plan 08 */}
      <svg
        role="img"
        width="100%"
        height="180"
        aria-label={`Chart placeholder for ${title ?? "chart"}, window: ${window}`}
        style={{ display: "block" }}
      >
        <rect width="100%" height="100%" fill="var(--sy-color-surface-2)" rx="var(--sy-radius)" />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--sy-color-fg-4)"
          fontSize="0.8125rem"
        >
          Chart · {window}
        </text>
      </svg>

      {showLegend && (
        <div
          style={{
            display: "flex",
            gap: "var(--sy-space-3)",
            marginTop: "var(--sy-space-2)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "var(--sy-color-fg-3)" }}>Legend</span>
        </div>
      )}
    </div>
  );
}

registerSection("Chart", ChartSection);

export { ChartSection };
