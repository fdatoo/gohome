/**
 * DiffCard — shows a hunk summary card.
 * Displays up to 5 changed lines with a "+N more" truncation label when the
 * diff exceeds 5 lines.
 */

type DiffCardProps = {
  lines: string[];
  label?: string;
};

export function DiffCard({ lines, label }: DiffCardProps) {
  const MAX_VISIBLE = 5;
  const visible = lines.slice(0, MAX_VISIBLE);
  const overflow = lines.length - MAX_VISIBLE;

  return (
    <div
      style={{
        background: "var(--sy-color-surface-2)",
        border: "1px solid var(--sy-color-line)",
        borderRadius: "var(--sy-radius)",
        padding: "var(--sy-space-2) var(--sy-space-3)",
        fontSize: "0.8125rem",
        fontFamily: "var(--sy-font-body)",
      }}
    >
      {label && (
        <div
          style={{
            color: "var(--sy-color-fg-3)",
            marginBottom: "var(--sy-space-1)",
            fontWeight: 500,
          }}
        >
          {label}
        </div>
      )}
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          color: "var(--sy-color-fg)",
          fontSize: "0.75rem",
        }}
      >
        {visible.join("\n")}
      </pre>
      {overflow > 0 && (
        <div
          style={{
            marginTop: "var(--sy-space-1)",
            color: "var(--sy-color-fg-4)",
            fontSize: "0.75rem",
          }}
        >
          +{overflow} more {overflow === 1 ? "line" : "lines"}
        </div>
      )}
    </div>
  );
}
