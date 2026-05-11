/**
 * AddSectionAffordance.tsx — "+ Add section" pill between section pairs.
 * On click it opens a section-type picker modal.
 */

import { useState } from "react";
import { registerSection } from "../registry";
import { usePageEditor } from "./use-page-editor";
import type { SectionDef } from "../model";

// All built-in section types (must match server BuiltinSectionIDs)
const SECTION_TYPES = [
  "Hero",
  "Chart",
  "EntityList",
  "ActivityFeed",
  "RoomGrid",
  "Markdown",
  "CameraGrid",
  "StatGrid",
  "WebhookButton",
];

let counter = 0;
function generateId(type: string): string {
  return `${type.toLowerCase()}-${++counter}`;
}

interface Props {
  afterId: string | null;
}

export function AddSectionAffordance({ afterId }: Props) {
  const [open, setOpen] = useState(false);
  const addSection = usePageEditor((s) => s.addSection);

  function handleAdd(type: string) {
    const section: SectionDef = {
      id: generateId(type),
      type,
      props: {},
    };
    addSection(afterId, section);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "block",
          width: "100%",
          background: "none",
          border: "1px dashed var(--sy-color-line)",
          borderRadius: "var(--sy-radius)",
          padding: "var(--sy-space-2) 0",
          color: "var(--sy-color-fg-4)",
          fontSize: "0.8125rem",
          cursor: "pointer",
          transition: "border-color var(--sy-motion-fast), color var(--sy-motion-fast)",
        }}
        aria-label="Add section"
      >
        + Add section
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--sy-color-overlay)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              background: "var(--sy-color-surface-1)",
              borderRadius: "var(--sy-radius-lg)",
              boxShadow: "var(--sy-shadow-elevated)",
              padding: "var(--sy-space-4)",
              minWidth: "320px",
              maxWidth: "480px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: "var(--sy-space-3)", color: "var(--sy-color-fg)" }}>
              Add section
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "var(--sy-space-2)",
              }}
            >
              {SECTION_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => handleAdd(type)}
                  style={{
                    background: "var(--sy-color-surface-2)",
                    border: "1px solid var(--sy-color-line)",
                    borderRadius: "var(--sy-radius)",
                    padding: "var(--sy-space-3)",
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                    color: "var(--sy-color-fg)",
                    textAlign: "center",
                    transition: "background var(--sy-motion-fast)",
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Register a no-op to keep consistent with section registry pattern
// (AddSectionAffordance is not itself a section; this is just the UI)
void registerSection; // used in imports
