/**
 * RoomTile.tsx — room name, icon placeholder, entity-count badge.
 */

import { registerTile } from "../../registry";
import type { TileProps } from "../../registry";

function RoomTile({ def }: TileProps) {
  const label = (def.props.label as string) ?? def.props.roomSlug ?? "Room";
  const entityCount = (def.props.entityCount as number) ?? 0;

  return (
    <div
      style={{
        background: "var(--sy-color-surface-2)",
        borderRadius: "var(--sy-radius)",
        padding: "var(--sy-space-3)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sy-space-2)",
        minHeight: "100px",
        position: "relative",
        cursor: "pointer",
        transition: "background var(--sy-motion-fast)",
      }}
    >
      <div
        style={{
          width: "2rem",
          height: "2rem",
          background: "var(--sy-color-accent-soft)",
          borderRadius: "var(--sy-radius-sm)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.25rem",
        }}
      >
        🏠
      </div>
      <span
        style={{
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--sy-color-fg)",
        }}
      >
        {String(label)}
      </span>
      {entityCount > 0 && (
        <span
          style={{
            position: "absolute",
            top: "var(--sy-space-2)",
            right: "var(--sy-space-2)",
            background: "var(--sy-color-accent)",
            color: "var(--sy-color-bg)",
            borderRadius: "var(--sy-radius-pill)",
            fontSize: "0.625rem",
            fontWeight: 700,
            padding: "0.125rem 0.375rem",
          }}
        >
          {entityCount}
        </span>
      )}
    </div>
  );
}

registerTile("RoomTile", RoomTile);

export { RoomTile };
