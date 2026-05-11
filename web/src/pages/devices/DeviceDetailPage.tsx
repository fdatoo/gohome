import { useEffect, useState } from "react";
import { ChevronRightIcon, PluginIcon } from "@/shell/icons";

interface DriverDetail {
  name: string;
  pack: string;
  version: string;
  state: "running" | "reconnecting" | "stopped" | "unknown";
  entityCount: number;
  uptime?: string;
  pid?: number;
  socket?: string;
}

async function loadDriver(name: string): Promise<DriverDetail | null> {
  try {
    const res = await fetch(
      "/switchyard.driver.v1.DriverManagementService/Get",
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
        },
        body: JSON.stringify({ name }),
      },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as {
      driver?: {
        name?: string;
        pack?: string;
        version?: string;
        state?: number;
        entity_count?: number;
        entityCount?: number;
        uptime?: string;
        pid?: number;
        socket?: string;
      };
    };
    if (!d.driver) return null;
    return {
      name: d.driver.name ?? name,
      pack: d.driver.pack ?? "",
      version: d.driver.version ?? "",
      state: mapState(d.driver.state),
      entityCount: d.driver.entityCount ?? d.driver.entity_count ?? 0,
      uptime: d.driver.uptime,
      pid: d.driver.pid,
      socket: d.driver.socket,
    };
  } catch {
    return null;
  }
}

function mapState(s: number | undefined): DriverDetail["state"] {
  switch (s) {
    case 1: return "running";
    case 2: return "reconnecting";
    case 3: return "stopped";
    default: return "unknown";
  }
}

interface Props {
  id: string;
}

export function DeviceDetailPage({ id }: Props) {
  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadDriver(id).then((d) => {
      if (!cancelled) {
        setDriver(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--sy-space-4)",
        padding: "var(--sy-space-5) var(--sy-space-6)",
        maxWidth: "880px",
      }}
    >
      <nav style={{ fontSize: "0.8125rem", color: "var(--sy-color-fg-4)" }}>
        <a
          href="/_authed/devices"
          style={{ color: "var(--sy-color-fg-3)", textDecoration: "none" }}
        >
          Devices
        </a>
        <span style={{ margin: "0 var(--sy-space-1)" }}>›</span>
        <span style={{ color: "var(--sy-color-fg-2)" }}>{id}</span>
      </nav>

      {loading && (
        <p style={{ color: "var(--sy-color-fg-3)" }}>Loading driver…</p>
      )}

      {!loading && !driver && (
        <div
          style={{
            background: "var(--sy-color-surface-1)",
            borderRadius: "var(--sy-radius-lg)",
            boxShadow: "var(--sy-shadow)",
            padding: "var(--sy-space-5)",
            color: "var(--sy-color-fg-3)",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "1.25rem",
              color: "var(--sy-color-fg)",
            }}
          >
            Driver not found
          </h1>
          <p>
            No driver named <code>{id}</code> is registered with the daemon.
          </p>
          <p>
            Manage drivers in{" "}
            <a
              href="/_authed/settings/drivers"
              style={{
                color: "var(--sy-color-accent)",
                textDecoration: "none",
              }}
            >
              Settings › Drivers
            </a>
            <ChevronRightIcon
              size={10}
              style={{ verticalAlign: "middle", marginLeft: "2px" }}
            />
          </p>
        </div>
      )}

      {driver && (
        <>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sy-space-3)",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "44px",
                height: "44px",
                borderRadius: "var(--sy-radius-lg)",
                background: "var(--sy-color-accent-soft)",
                color: "var(--sy-color-accent)",
              }}
            >
              <PluginIcon size={22} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: "1.5rem",
                  fontWeight: 600,
                  letterSpacing: "-0.018em",
                }}
              >
                {driver.name}
              </h1>
              <p
                style={{
                  margin: "var(--sy-space-1) 0 0",
                  color: "var(--sy-color-fg-3)",
                  fontSize: "0.875rem",
                  fontFamily: "var(--sy-font-numeric)",
                }}
              >
                {driver.pack || "—"}
                {driver.version && ` · v${driver.version}`}
              </p>
            </div>
            <a
              href={`/_authed/settings/drivers#${encodeURIComponent(id)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--sy-space-1)",
                fontSize: "0.8125rem",
                color: "var(--sy-color-accent)",
                textDecoration: "none",
              }}
            >
              Manage driver <ChevronRightIcon size={12} />
            </a>
          </header>

          <section
            style={{
              background: "var(--sy-color-surface-1)",
              borderRadius: "var(--sy-radius-lg)",
              boxShadow: "var(--sy-shadow)",
              padding: "var(--sy-space-4)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "var(--sy-space-3)",
            }}
          >
            <Stat label="State" value={driver.state} />
            <Stat label="Entities" value={String(driver.entityCount)} />
            {driver.uptime && <Stat label="Uptime" value={driver.uptime} />}
            {driver.pid !== undefined && (
              <Stat label="PID" value={String(driver.pid)} />
            )}
            {driver.socket && <Stat label="Socket" value={driver.socket} />}
          </section>

          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--sy-color-fg-4)",
              margin: 0,
            }}
          >
            Per-entity inspection (logs, last command ack, etc.) lives in{" "}
            <a
              href="/_authed/settings/drivers"
              style={{
                color: "var(--sy-color-accent)",
                textDecoration: "none",
              }}
            >
              Settings › Drivers
            </a>
            .
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.6875rem",
          color: "var(--sy-color-fg-4)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "1rem",
          color: "var(--sy-color-fg)",
          fontFamily: "var(--sy-font-numeric)",
          fontVariantNumeric: "tabular-nums",
          marginTop: "2px",
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}
