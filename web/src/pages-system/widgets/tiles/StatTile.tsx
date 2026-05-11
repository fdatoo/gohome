/**
 * StatTile.tsx — large value + unit + label tile.
 */

import { registerTile } from "../../registry";
import type { TileProps } from "../../registry";

function StatTile({ def }: TileProps) {
  const label = (def.props.label as string) ?? "Stat";
  const unit = def.props.unit as string | undefined;
  const precision = (def.props.precision as number) ?? 1;
  // In a real implementation, value comes from entity state.
  const value = def.props.value as string | number | undefined;
  const displayValue = value !== undefined ? Number(value).toFixed(precision) : "—";

  return (
    <div
      style={{
        background: "var(--sy-color-surface-2)",
        borderRadius: "var(--sy-radius)",
        padding: "var(--sy-space-3)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sy-space-1)",
        minHeight: "100px",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontSize: "0.6875rem",
          color: "var(--sy-color-fg-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.25em" }}>
        <span
          style={{
            fontSize: "1.75rem",
            fontFamily: "var(--sy-font-numeric)",
            color: "var(--sy-color-fg)",
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {displayValue}
        </span>
        {unit && (
          <span
            style={{
              fontSize: "0.875rem",
              color: "var(--sy-color-fg-3)",
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

registerTile("StatTile", StatTile);

export { StatTile };
