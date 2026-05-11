/**
 * EntityRow.tsx — dense entity row with icon gradient, name, ID, value, sparkline.
 */

import { registerCell } from "../../registry";
import type { CellProps } from "../../registry";

function EntityRow({ def }: CellProps) {
  const entityId = (def.props.entityId as string) ?? "";
  const label = (def.props.label as string) ?? entityId;
  const unit = def.props.unit as string | undefined;
  const value = def.props.value as string | number | undefined;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sy-space-3)",
        padding: "var(--sy-space-2) var(--sy-space-4)",
      }}
    >
      {/* Icon gradient placeholder */}
      <div
        style={{
          width: "2rem",
          height: "2rem",
          borderRadius: "var(--sy-radius-sm)",
          background:
            "linear-gradient(135deg, var(--sy-color-accent) 0%, var(--sy-color-accent-2) 100%)",
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "var(--sy-color-fg)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: "0.6875rem",
            color: "var(--sy-color-fg-4)",
            fontFamily: "var(--sy-font-numeric)",
          }}
          data-entity-id={entityId}
        >
          {entityId}
        </div>
      </div>
      {value !== undefined && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "0.25em",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: "0.9375rem",
              fontFamily: "var(--sy-font-numeric)",
              color: "var(--sy-color-fg)",
              fontWeight: 600,
            }}
          >
            {value}
          </span>
          {unit && (
            <span style={{ fontSize: "0.75rem", color: "var(--sy-color-fg-3)" }}>{unit}</span>
          )}
        </div>
      )}
      {/* Sparkline placeholder */}
      <svg
        width="48"
        height="24"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <polyline
          points="0,20 12,14 24,16 36,8 48,12"
          fill="none"
          stroke="var(--sy-color-accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

registerCell("EntityRow", EntityRow);

export { EntityRow };
