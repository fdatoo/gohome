/**
 * CellHost.tsx — vertical list host for cell-bearing sections.
 */

import { resolveCell } from "../registry";
import type { CellDef } from "../model";

interface Props {
  cells: CellDef[];
  editMode?: boolean;
}

export function CellHost({ cells, editMode = false }: Props) {
  if (cells.length === 0) {
    return (
      <div
        style={{
          color: "var(--sy-color-fg-3)",
          fontSize: "0.875rem",
          padding: "var(--sy-space-4)",
          textAlign: "center",
        }}
      >
        No rows configured.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {cells.map((c) => {
        const CellComponent = resolveCell(c.type);
        return (
          <div
            key={c.id}
            style={{ borderBottom: "1px solid var(--sy-color-line-soft)" }}
          >
            <CellComponent def={c} editMode={editMode} />
          </div>
        );
      })}
    </div>
  );
}
