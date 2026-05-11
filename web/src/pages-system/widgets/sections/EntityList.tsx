/**
 * EntityList.tsx — entity list section with tag-filter chip + CellHost for EntityRow cells.
 */

import { registerSection } from "../../registry";
import type { SectionProps } from "../../registry";
import { CellHost } from "../../render/CellHost";
import type { CellDef } from "../../model";

function EntityListSection({ def, editMode }: SectionProps) {
  const title = def.props.title as string | undefined;
  const cells = (def.cells ?? []) as CellDef[];
  const filter = def.props.filter as { tag?: string } | undefined;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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
          {title ?? "Entities"}
        </h3>
        <div style={{ display: "flex", gap: "var(--sy-space-2)", alignItems: "center" }}>
          {filter?.tag && (
            <span
              style={{
                background: "var(--sy-color-accent-soft)",
                color: "var(--sy-color-accent)",
                borderRadius: "var(--sy-radius-pill)",
                padding: "0.125rem 0.5rem",
                fontSize: "0.75rem",
                fontWeight: 500,
              }}
            >
              #{filter.tag}
            </span>
          )}
          <button
            style={{
              background: "none",
              border: "1px solid var(--sy-color-line)",
              borderRadius: "var(--sy-radius)",
              color: "var(--sy-color-fg-3)",
              padding: "0.25rem 0.625rem",
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
          >
            Configure filter
          </button>
        </div>
      </div>
      <CellHost cells={cells} editMode={editMode} />
    </div>
  );
}

registerSection("EntityList", EntityListSection);

export { EntityListSection };
