/**
 * CameraGrid.tsx — camera grid section with img placeholders.
 * Stream integration is deferred to Plan 08.
 */

import { registerSection } from "../../registry";
import type { SectionProps } from "../../registry";

interface Camera {
  entityId: string;
  label: string;
}

function CameraGridSection({ def }: SectionProps) {
  const title = def.props.title as string | undefined;
  const cameras = (def.props.cameras ?? []) as Camera[];
  const columns = (def.props.columns as number) ?? 2;

  return (
    <div style={{ padding: "var(--sy-space-4)" }}>
      {title && (
        <h3
          style={{
            margin: 0,
            marginBottom: "var(--sy-space-3)",
            fontSize: "1rem",
            fontWeight: 600,
            color: "var(--sy-color-fg)",
          }}
        >
          {title}
        </h3>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: "var(--sy-space-3)",
        }}
      >
        {cameras.map((cam) => (
          <div
            key={cam.entityId}
            style={{
              background: "var(--sy-color-surface-2)",
              borderRadius: "var(--sy-radius)",
              overflow: "hidden",
              position: "relative",
              aspectRatio: "16/9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={`/api/camera/${cam.entityId}/snapshot`}
              alt={cam.label}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <span
              style={{
                position: "absolute",
                bottom: "var(--sy-space-2)",
                left: "var(--sy-space-2)",
                background: "var(--sy-color-overlay)",
                color: "var(--sy-color-fg)",
                fontSize: "0.75rem",
                padding: "0.125rem 0.375rem",
                borderRadius: "var(--sy-radius-sm)",
              }}
            >
              {cam.label}
            </span>
          </div>
        ))}
        {cameras.length === 0 && (
          <div
            style={{
              gridColumn: `span ${columns}`,
              padding: "var(--sy-space-4)",
              textAlign: "center",
              color: "var(--sy-color-fg-3)",
              fontSize: "0.875rem",
            }}
          >
            No cameras configured.
          </div>
        )}
      </div>
    </div>
  );
}

registerSection("CameraGrid", CameraGridSection);

export { CameraGridSection };
