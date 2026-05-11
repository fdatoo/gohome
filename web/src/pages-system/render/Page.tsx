/**
 * Page.tsx — renders a PageModel as a stack of SectionFrames.
 */

import type { PageModel } from "../model";
import { SectionFrame } from "./SectionFrame";

interface Props {
  page: PageModel;
  editMode?: boolean;
}

export function Page({ page, editMode = false }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--sy-space-4)",
        padding: "var(--sy-space-4)",
        maxWidth: "1280px",
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          font: "var(--sy-font-display)",
          color: "var(--sy-color-fg)",
          margin: 0,
        }}
      >
        {page.title}
      </h1>
      {page.sections.map((s) => (
        <SectionFrame key={s.id} def={s} editMode={editMode} />
      ))}
    </div>
  );
}
