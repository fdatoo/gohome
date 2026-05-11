/**
 * Markdown.tsx — sanitised markdown section via react-markdown.
 */

import ReactMarkdown from "react-markdown";
import { registerSection } from "../../registry";
import type { SectionProps } from "../../registry";

function MarkdownSection({ def }: SectionProps) {
  const content = (def.props.content as string) ?? "";

  return (
    <div
      style={{
        padding: "var(--sy-space-4)",
        fontFamily: "var(--sy-font-body)",
        color: "var(--sy-color-fg)",
        lineHeight: 1.6,
      }}
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

registerSection("Markdown", MarkdownSection);

export { MarkdownSection };
