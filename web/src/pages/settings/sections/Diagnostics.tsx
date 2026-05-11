import { useEffect, useState, useCallback } from "react";
import { systemClient } from "@/data/system-client";
import { ConnectHTTPError } from "@/data/system-client";
import type { HealthSummary, EventStoreStats } from "@/data/system-client";
import { Button } from "@/theme/primitives/button";
import { Chip } from "@/theme/primitives/chip";
import { Surface } from "@/theme/primitives/surface";
import { EmptyState } from "@/components/EmptyState";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatAge(seconds: number): string {
  if (seconds === 0) return "unknown";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

interface HealthCardProps {
  health: HealthSummary;
}

function HealthCard({ health }: HealthCardProps) {
  return (
    <Surface
      style={{
        padding: "var(--sy-space-5)",
        border: "1px solid var(--sy-color-line)",
        marginBottom: "var(--sy-space-4)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sy-space-3)",
          marginBottom: "var(--sy-space-3)",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "1rem",
            fontWeight: 600,
            color: "var(--sy-color-fg)",
          }}
        >
          System health
        </h2>
        <Chip
          style={{
            background: "transparent",
            border: `1px solid ${health.ok ? "var(--sy-color-good)" : "var(--sy-color-bad)"}`,
            color: health.ok ? "var(--sy-color-good)" : "var(--sy-color-bad)",
          }}
        >
          {health.ok ? "healthy" : "degraded"}
        </Chip>
      </div>
      <p
        style={{
          margin: "0 0 var(--sy-space-3)",
          fontSize: "0.875rem",
          color: "var(--sy-color-fg-3)",
        }}
      >
        {health.summary}
      </p>
      {health.subsystems.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {health.subsystems.map((sub) => (
              <tr key={sub.name}>
                <td
                  style={{
                    padding: "var(--sy-space-1) var(--sy-space-3) var(--sy-space-1) 0",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "var(--sy-color-fg)",
                    width: "40%",
                  }}
                >
                  {sub.name}
                </td>
                <td
                  style={{
                    padding: "var(--sy-space-1) 0",
                    fontSize: "0.8125rem",
                    color: sub.ok ? "var(--sy-color-good)" : "var(--sy-color-bad)",
                  }}
                >
                  {sub.ok ? "ok" : sub.detail || "degraded"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Surface>
  );
}

interface StatsCardProps {
  stats: EventStoreStats;
}

function StatsCard({ stats }: StatsCardProps) {
  return (
    <Surface
      style={{
        padding: "var(--sy-space-5)",
        border: "1px solid var(--sy-color-line)",
        marginBottom: "var(--sy-space-4)",
      }}
    >
      <h2
        style={{
          margin: "0 0 var(--sy-space-3)",
          fontSize: "1rem",
          fontWeight: 600,
          color: "var(--sy-color-fg)",
        }}
      >
        Event store
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td
              style={{
                padding: "var(--sy-space-2) var(--sy-space-3) var(--sy-space-2) 0",
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: "var(--sy-color-fg-4)",
                width: "40%",
              }}
            >
              Size
            </td>
            <td
              style={{
                fontSize: "0.8125rem",
                fontFamily: "var(--sy-font-numeric)",
                color: "var(--sy-color-fg)",
              }}
            >
              {formatBytes(stats.sizeBytes)}
            </td>
          </tr>
          <tr>
            <td
              style={{
                padding: "var(--sy-space-2) var(--sy-space-3) var(--sy-space-2) 0",
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: "var(--sy-color-fg-4)",
              }}
            >
              Oldest event age
            </td>
            <td
              style={{
                fontSize: "0.8125rem",
                fontFamily: "var(--sy-font-numeric)",
                color: "var(--sy-color-fg)",
              }}
            >
              {formatAge(stats.oldestEventAgeSeconds)}
            </td>
          </tr>
          <tr>
            <td
              style={{
                padding: "var(--sy-space-2) var(--sy-space-3) var(--sy-space-2) 0",
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: "var(--sy-color-fg-4)",
              }}
            >
              Snapshots
            </td>
            <td
              style={{
                fontSize: "0.8125rem",
                fontFamily: "var(--sy-font-numeric)",
                color: "var(--sy-color-fg)",
              }}
            >
              {stats.snapshotCount}
            </td>
          </tr>
        </tbody>
      </table>
    </Surface>
  );
}

type DiagnosticsStatus = "loading" | "ready" | "empty" | "error-auth" | "error-server";

/**
 * Diagnostics section — system health summary, event-store stats, and
 * an Export support bundle button.
 */
export function Diagnostics() {
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [stats, setStats] = useState<EventStoreStats | null>(null);
  const [status, setStatus] = useState<DiagnosticsStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setStatus("loading");
    setErrorMessage(null);
    Promise.all([systemClient.health(), systemClient.eventStoreStats()])
      .then(([h, s]) => {
        setHealth(h);
        setStats(s);
        // Both are "empty" if health is ok with no subsystems and event store is zero
        const isEmpty =
          h.subsystems.length === 0 && s.sizeBytes === 0 && s.snapshotCount === 0;
        setStatus(isEmpty ? "empty" : "ready");
      })
      .catch((err: unknown) => {
        if (err instanceof ConnectHTTPError && err.status === 401) {
          setStatus("error-auth");
        } else {
          setErrorMessage(err instanceof Error ? err.message : "Failed to load diagnostics");
          setStatus("error-server");
        }
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);
    Promise.all([systemClient.health(), systemClient.eventStoreStats()])
      .then(([h, s]) => {
        if (cancelled) return;
        setHealth(h);
        setStats(s);
        const isEmpty =
          h.subsystems.length === 0 && s.sizeBytes === 0 && s.snapshotCount === 0;
        setStatus(isEmpty ? "empty" : "ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ConnectHTTPError && err.status === 401) {
          setStatus("error-auth");
        } else {
          setErrorMessage(err instanceof Error ? err.message : "Failed to load diagnostics");
          setStatus("error-server");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const { blob, filename } = await systemClient.exportSupportBundle();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <div>
      <h1
        style={{
          margin: "0 0 var(--sy-space-5)",
          fontSize: "1.25rem",
          fontWeight: 600,
          color: "var(--sy-color-fg)",
        }}
      >
        Diagnostics
      </h1>

      {status === "loading" && (
        <EmptyState variant="loading" label="diagnostics" />
      )}

      {status === "error-auth" && (
        <EmptyState
          variant="error-auth"
          label="Authentication required"
          message="You must be signed in to view diagnostic information."
        />
      )}

      {status === "error-server" && (
        <EmptyState
          variant="error-server"
          label="Failed to load diagnostics"
          message={errorMessage ?? undefined}
          onRetry={loadData}
        />
      )}

      {status === "empty" && (
        <EmptyState
          variant="empty"
          label="No diagnostics available yet"
          message="No events recorded yet — check the daemon log for startup information."
        />
      )}

      {status === "ready" && health && <HealthCard health={health} />}
      {status === "ready" && stats && <StatsCard stats={stats} />}

      {exportError && (
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--sy-color-bad)",
            margin: "0 0 var(--sy-space-3)",
          }}
        >
          {exportError}
        </p>
      )}

      <Button
        variant="secondary"
        onClick={() => void handleExport()}
        disabled={exporting || status === "loading"}
      >
        {exporting ? "Exporting…" : "Export support bundle"}
      </Button>
    </div>
  );
}
