/**
 * WebhookButton.tsx — prominent webhook trigger button section.
 * Calls ScriptService.RunWebhook RPC on click; shows confirmation modal if confirm=true.
 */

import { useState } from "react";
import { registerSection } from "../../registry";
import type { SectionProps } from "../../registry";

// Lightweight Connect-style webhook caller
async function runWebhook(webhookId: string): Promise<void> {
  const res = await fetch("/switchyard.v1alpha1.ScriptService/RunWebhook", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    },
    body: JSON.stringify({ webhook_id: webhookId }),
  });
  if (!res.ok) {
    throw new Error(`RunWebhook failed: ${res.status}`);
  }
}

function WebhookButtonSection({ def }: SectionProps) {
  const label = (def.props.label as string) ?? "Trigger Webhook";
  const webhookId = def.props.webhookId as string;
  const requireConfirm = (def.props.confirm as boolean) ?? false;
  const confirmText =
    (def.props.confirmText as string) ?? `Run "${label}"?`;
  const [status, setStatus] = useState<"idle" | "confirming" | "running" | "done" | "error">("idle");

  async function handleClick() {
    if (requireConfirm && status !== "confirming") {
      setStatus("confirming");
      return;
    }
    setStatus("running");
    try {
      await runWebhook(webhookId);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  return (
    <div
      style={{
        padding: "var(--sy-space-5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--sy-space-3)",
      }}
    >
      {status === "confirming" && (
        <p style={{ color: "var(--sy-color-warn)", fontSize: "0.9375rem", margin: 0 }}>
          {confirmText}
        </p>
      )}
      <button
        onClick={handleClick}
        disabled={status === "running"}
        data-webhook-id={webhookId}
        style={{
          background:
            status === "done"
              ? "var(--sy-color-good)"
              : status === "error"
                ? "var(--sy-color-bad)"
                : "var(--sy-color-accent)",
          color: "var(--sy-color-bg)",
          border: "none",
          borderRadius: "var(--sy-radius)",
          padding: "var(--sy-space-3) var(--sy-space-5)",
          fontSize: "1rem",
          fontWeight: 600,
          cursor: status === "running" ? "wait" : "pointer",
          transition: "background var(--sy-motion-fast)",
          minWidth: "200px",
        }}
      >
        {status === "running"
          ? "Running…"
          : status === "done"
            ? "Done ✓"
            : status === "error"
              ? "Error ✗"
              : status === "confirming"
                ? "Confirm?"
                : label}
      </button>
    </div>
  );
}

registerSection("WebhookButton", WebhookButtonSection);

export { WebhookButtonSection };
