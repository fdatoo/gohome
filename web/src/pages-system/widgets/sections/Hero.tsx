/**
 * Hero.tsx — full-width hero section with a 4-column stat grid.
 * Delta color: positive CO₂/energy deltas → bad; negative → good.
 */

import { registerSection } from "../../registry";
import type { SectionProps } from "../../registry";

interface StatItem {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number;
  deltaUnit?: string;
}

function HeroSection({ def }: SectionProps) {
  const title = def.props.title as string | undefined;
  const subtitle = def.props.subtitle as string | undefined;
  const stats = (def.props.stats ?? []) as StatItem[];

  return (
    <div style={{ padding: "var(--sy-space-5)" }}>
      {title && (
        <h2
          style={{
            margin: 0,
            marginBottom: subtitle ? "var(--sy-space-1)" : "var(--sy-space-4)",
            color: "var(--sy-color-fg)",
            font: "var(--sy-font-display)",
            fontSize: "1.5rem",
          }}
        >
          {title}
        </h2>
      )}
      {subtitle && (
        <p
          style={{
            margin: 0,
            marginBottom: "var(--sy-space-4)",
            color: "var(--sy-color-fg-3)",
            fontSize: "0.875rem",
          }}
        >
          {subtitle}
        </p>
      )}
      {stats.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "var(--sy-space-3)",
          }}
        >
          {stats.map((s, i) => (
            <StatCard key={i} stat={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ stat }: { stat: StatItem }) {
  const deltaPositive = stat.delta !== undefined && stat.delta > 0;
  const deltaColor = deltaPositive ? "var(--sy-color-bad)" : "var(--sy-color-good)";

  return (
    <div
      style={{
        background: "var(--sy-color-surface-2)",
        borderRadius: "var(--sy-radius)",
        padding: "var(--sy-space-3)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sy-space-1)",
      }}
    >
      <span
        style={{
          fontSize: "0.75rem",
          color: "var(--sy-color-fg-3)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {stat.label}
      </span>
      <span
        style={{
          fontSize: "1.5rem",
          fontFamily: "var(--sy-font-numeric)",
          color: "var(--sy-color-fg)",
          fontWeight: 600,
        }}
      >
        {stat.value}
        {stat.unit && (
          <span style={{ fontSize: "0.875rem", color: "var(--sy-color-fg-3)", marginLeft: "0.25em" }}>
            {stat.unit}
          </span>
        )}
      </span>
      {stat.delta !== undefined && (
        <span style={{ fontSize: "0.75rem", color: deltaColor }}>
          {stat.delta > 0 ? "+" : ""}
          {stat.delta}
          {stat.deltaUnit}
        </span>
      )}
    </div>
  );
}

registerSection("Hero", HeroSection);

export { HeroSection };
