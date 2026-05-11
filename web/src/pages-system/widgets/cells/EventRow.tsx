/**
 * EventRow.tsx — severity dot, who, what, relative timestamp cell.
 */

import { registerCell } from "../../registry";
import type { CellProps } from "../../registry";

type Severity = "good" | "warn" | "bad" | "info";

const severityColors: Record<Severity, string> = {
  good: "var(--sy-color-good)",
  warn: "var(--sy-color-warn)",
  bad: "var(--sy-color-bad)",
  info: "var(--sy-color-info)",
};

function EventRow({ def }: CellProps) {
  const summary = (def.props.summary as string) ?? "Event";
  const severity = ((def.props.severity as string) ?? "info") as Severity;
  const entityId = def.props.entityId as string | undefined;
  const timestamp = def.props.timestamp as string | undefined;

  const relTime = timestamp ? formatRelTime(timestamp) : "";
  const color = severityColors[severity] ?? severityColors.info;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sy-space-3)",
        padding: "var(--sy-space-2) var(--sy-space-4)",
      }}
    >
      {/* Severity dot */}
      <div
        style={{
          width: "0.5rem",
          height: "0.5rem",
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
        aria-label={`Severity: ${severity}`}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.875rem",
            color: "var(--sy-color-fg)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {summary}
        </div>
        {entityId && (
          <div style={{ fontSize: "0.6875rem", color: "var(--sy-color-fg-4)" }}>
            {entityId}
          </div>
        )}
      </div>
      {relTime && (
        <span
          style={{
            fontSize: "0.6875rem",
            color: "var(--sy-color-fg-4)",
            flexShrink: 0,
          }}
        >
          {relTime}
        </span>
      )}
    </div>
  );
}

function formatRelTime(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return ts;
  }
}

registerCell("EventRow", EventRow);

export { EventRow };
