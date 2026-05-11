import styles from "./Sparkline.module.css";

export interface SparklineBucket {
  ts: number; // Unix ms, start of bucket
  cmd: number;
  state: number;
  cfg: number;
  err: number;
}

export interface SparklineProps {
  buckets: SparklineBucket[];
  height?: number;
}

const BUCKET_COLORS = {
  cmd: "var(--sy-color-info)",
  state: "var(--sy-color-good)",
  cfg: "var(--sy-color-purple)",
  err: "var(--sy-color-bad)",
} as const;

type BucketKind = keyof typeof BUCKET_COLORS;
const KINDS: BucketKind[] = ["err", "cfg", "state", "cmd"];

/**
 * Sparkline renders a stacked SVG bar chart for event counts by kind.
 * Each bar represents a 5-minute bucket. Colors:
 *   cmd   = --sy-color-info
 *   state = --sy-color-good
 *   cfg   = --sy-color-purple
 *   err   = --sy-color-bad
 *
 * No third-party charting library is used; the SVG is built directly.
 */
export function Sparkline({ buckets, height = 48 }: SparklineProps) {
  if (buckets.length === 0) {
    return <div className={styles.empty} aria-label="No event data" data-testid="sparkline-empty" />;
  }

  const maxTotal = Math.max(1, ...buckets.map((b) => b.cmd + b.state + b.cfg + b.err));
  const barWidth = 8;
  const gap = 2;
  const totalWidth = buckets.length * (barWidth + gap);
  const svgH = height;

  return (
    <svg
      className={styles.sparkline}
      role="img"
      aria-label="Event counts sparkline"
      width={totalWidth}
      height={svgH}
      viewBox={`0 0 ${totalWidth} ${svgH}`}
      data-testid="sparkline-svg"
    >
      {buckets.map((bucket, i) => {
        const x = i * (barWidth + gap);
        let yOffset = svgH;

        return (
          <g key={bucket.ts} role="img" aria-label={`Bucket ${i + 1}`}>
            {KINDS.map((kind) => {
              const count = bucket[kind];
              if (count === 0) return null;
              const barH = Math.max(1, (count / maxTotal) * svgH);
              yOffset -= barH;
              return (
                <rect
                  key={kind}
                  x={x}
                  y={yOffset}
                  width={barWidth}
                  height={barH}
                  fill={BUCKET_COLORS[kind]}
                  aria-label={`${kind}: ${count}`}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
