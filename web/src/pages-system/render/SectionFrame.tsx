/**
 * SectionFrame.tsx — surface wrapper + section heading bar.
 * Resolves the section component from the registry and wraps it in a card.
 */

import { resolveSection } from "../registry";
import type { SectionDef } from "../model";

interface Props {
  def: SectionDef;
  editMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
}

export function SectionFrame({ def, editMode = false, selected = false, onSelect, onDelete }: Props) {
  const SectionComponent = resolveSection(def.type);

  return (
    <div
      style={{
        background: "var(--sy-color-surface-1)",
        borderRadius: "var(--sy-radius-lg)",
        boxShadow: selected
          ? "0 0 0 2px var(--sy-color-accent), 0 0 0 5px var(--sy-color-accent-soft)"
          : "var(--sy-shadow)",
        border: selected ? "2px solid var(--sy-color-accent)" : "none",
        overflow: "hidden",
        position: "relative",
        transition: "box-shadow var(--sy-motion-fast)",
      }}
      onClick={editMode ? onSelect : undefined}
      data-section-id={def.id}
    >
      {editMode && selected && (
        <div
          style={{
            position: "absolute",
            top: "-1.5rem",
            left: "0",
            background: "var(--sy-color-accent)",
            color: "var(--sy-color-bg)",
            fontSize: "0.625rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            padding: "0.125rem 0.5rem",
            borderRadius: "var(--sy-radius-sm) var(--sy-radius-sm) 0 0",
          }}
        >
          {def.type.toUpperCase()} · SELECTED
        </div>
      )}
      {editMode && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--sy-space-2)",
            padding: "var(--sy-space-2) var(--sy-space-3)",
            borderBottom: "1px solid var(--sy-color-line-soft)",
            background: "var(--sy-color-surface-2)",
          }}
        >
          <span
            style={{ cursor: "grab", color: "var(--sy-color-fg-3)", fontSize: "1rem" }}
            title="Drag to reorder"
            aria-label="Drag handle"
          >
            ⠿
          </span>
          <span style={{ flex: 1, fontSize: "0.75rem", color: "var(--sy-color-fg-3)" }}>
            {def.type}
          </span>
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--sy-color-fg-3)",
              fontSize: "0.875rem",
              padding: "var(--sy-space-1)",
              borderRadius: "var(--sy-radius-sm)",
            }}
            title="Section settings"
            aria-label="Section settings"
          >
            ⚙
          </button>
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--sy-color-bad)",
              fontSize: "0.875rem",
              padding: "var(--sy-space-1)",
              borderRadius: "var(--sy-radius-sm)",
            }}
            title="Delete section"
            aria-label="Delete section"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
          >
            ×
          </button>
        </div>
      )}
      <SectionComponent def={def} editMode={editMode} />
    </div>
  );
}
