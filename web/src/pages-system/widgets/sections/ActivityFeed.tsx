/**
 * ActivityFeed.tsx — activity feed section with time-window chip + EventRow cells.
 */

import { registerSection } from "../../registry";
import type { SectionProps } from "../../registry";
import { CellHost } from "../../render/CellHost";
import type { CellDef } from "../../model";

function ActivityFeedSection({ def, editMode }: SectionProps) {
  const title = def.props.title as string | undefined;
  const window = def.props.window as string | undefined;
  const cells = (def.cells ?? []) as CellDef[];

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
          {title ?? "Activity"}
        </h3>
        <div style={{ display: "flex", gap: "var(--sy-space-2)", alignItems: "center" }}>
          {window && (
            <span
              style={{
                background: "var(--sy-color-surface-2)",
                color: "var(--sy-color-fg-3)",
                borderRadius: "var(--sy-radius-pill)",
                padding: "0.125rem 0.5rem",
                fontSize: "0.75rem",
              }}
            >
              Last {window}
            </span>
          )}
          <button
            style={{
              background: "none",
              border: "none",
              color: "var(--sy-color-accent)",
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              cursor: "pointer",
              borderRadius: "var(--sy-radius)",
            }}
          >
            Open in Activity
          </button>
        </div>
      </div>
      <CellHost cells={cells} editMode={editMode} />
    </div>
  );
}

registerSection("ActivityFeed", ActivityFeedSection);

export { ActivityFeedSection };
