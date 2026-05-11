/**
 * /ask — entry point for MCP-agent chat from the command palette.
 *
 * The MCP server runs (internal/mcp); a first-party chat panel is deferred
 * per spec §24. This page surfaces the current MCP configuration status and
 * tells the operator how to point an MCP client at the local endpoint.
 */
import { useEffect, useState } from "react";
import { SparkleIcon } from "@/shell/icons";

interface McpStatus {
  configured: boolean;
  endpoint?: string;
}

async function checkMcp(): Promise<McpStatus> {
  try {
    const res = await fetch("/api/mcp/configured", { credentials: "include" });
    if (!res.ok) return { configured: false };
    const data = (await res.json()) as McpStatus;
    return data;
  } catch {
    return { configured: false };
  }
}

export function AskPage() {
  const [status, setStatus] = useState<McpStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkMcp().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--sy-space-4)",
        padding: "var(--sy-space-5) var(--sy-space-6)",
        maxWidth: "720px",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: "var(--sy-space-3)" }}>
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
          <SparkleIcon size={22} />
        </span>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.018em" }}>
            Ask
          </h1>
          <p style={{ margin: "var(--sy-space-1) 0 0", color: "var(--sy-color-fg-3)", fontSize: "0.875rem" }}>
            Conversational control of Switchyard via MCP.
          </p>
        </div>
      </header>

      <section
        style={{
          background: "var(--sy-color-surface-1)",
          borderRadius: "var(--sy-radius-lg)",
          boxShadow: "var(--sy-shadow)",
          padding: "var(--sy-space-4)",
        }}
      >
        <h2
          style={{
            margin: "0 0 var(--sy-space-2)",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--sy-color-fg-4)",
            fontWeight: 600,
          }}
        >
          Status
        </h2>
        {status === null ? (
          <p style={{ color: "var(--sy-color-fg-3)" }}>Checking…</p>
        ) : status.configured ? (
          <p style={{ color: "var(--sy-color-good)" }}>
            MCP is configured.{" "}
            <span style={{ color: "var(--sy-color-fg-3)" }}>
              Endpoint: <code>{status.endpoint ?? "/mcp"}</code>
            </span>
          </p>
        ) : (
          <p style={{ color: "var(--sy-color-fg-3)" }}>
            No MCP client is connected yet.
          </p>
        )}
      </section>

      <section
        style={{
          background: "var(--sy-color-surface-1)",
          borderRadius: "var(--sy-radius-lg)",
          boxShadow: "var(--sy-shadow)",
          padding: "var(--sy-space-4)",
        }}
      >
        <h2
          style={{
            margin: "0 0 var(--sy-space-2)",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--sy-color-fg-4)",
            fontWeight: 600,
          }}
        >
          How to talk to Switchyard
        </h2>
        <ol style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--sy-color-fg-2)", fontSize: "0.9375rem", lineHeight: 1.6 }}>
          <li>
            Point your MCP-capable assistant (Claude Desktop, Cursor, …) at the local
            endpoint <code>http://localhost:8080/mcp</code>.
          </li>
          <li>
            Issue a token in{" "}
            <a href="/_authed/settings/account" style={{ color: "var(--sy-color-accent)", textDecoration: "none" }}>
              Settings › Account
            </a>{" "}
            and provide it as a bearer credential.
          </li>
          <li>
            Ask the assistant about your home — it has read access to entities, events,
            automations, and (with the right scope) can run commands.
          </li>
        </ol>
        <p style={{ marginTop: "var(--sy-space-3)", fontSize: "0.8125rem", color: "var(--sy-color-fg-4)" }}>
          A first-party chat panel inside the app is on the roadmap (spec §24).
        </p>
      </section>
    </div>
  );
}
