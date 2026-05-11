/**
 * StatGrid.tsx — stat grid section with TileHost for StatTile children.
 */

import { registerSection } from "../../registry";
import type { SectionProps } from "../../registry";
import { TileHost } from "../../render/TileHost";
import type { TileDef } from "../../model";

function StatGridSection({ def, editMode }: SectionProps) {
  const title = def.props.title as string | undefined;
  const tiles = (def.tiles ?? []) as TileDef[];

  return (
    <div>
      {title && (
        <div
          style={{
            padding: "var(--sy-space-3) var(--sy-space-4)",
            borderBottom: "1px solid var(--sy-color-line-soft)",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--sy-color-fg)",
            }}
          >
            {title}
          </h3>
        </div>
      )}
      <TileHost tiles={tiles} editMode={editMode} />
    </div>
  );
}

registerSection("StatGrid", StatGridSection);

export { StatGridSection };
