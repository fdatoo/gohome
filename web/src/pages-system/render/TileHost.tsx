/**
 * TileHost.tsx — CSS grid host for tile-bearing sections.
 * Tiles auto-fill a minimum of 160px each.
 */

import { resolveTile } from "../registry";
import type { TileDef } from "../model";

interface Props {
  tiles: TileDef[];
  editMode?: boolean;
}

export function TileHost({ tiles, editMode = false }: Props) {
  if (tiles.length === 0) {
    return (
      <div
        style={{
          color: "var(--sy-color-fg-3)",
          fontSize: "0.875rem",
          padding: "var(--sy-space-4)",
          textAlign: "center",
        }}
      >
        No tiles configured.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "var(--sy-space-3)",
        padding: "var(--sy-space-3)",
      }}
    >
      {tiles.map((t) => {
        const TileComponent = resolveTile(t.type);
        return <TileComponent key={t.id} def={t} editMode={editMode} />;
      })}
    </div>
  );
}
