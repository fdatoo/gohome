/**
 * AutomationSlug — automation editor with Pkl edit session integration.
 *
 * Wires "Save & exit" and "Discard" through useEditSession, and renders
 * ConflictBanner when an external edit is detected mid-session.
 *
 * The actual WYSIWYG editor surface is Plan 10. This stub satisfies the
 * Plan 11 requirement: conflict UI + session save/discard wiring.
 */

import { useState } from "react";
import { ConflictBanner } from "@/edit-session/conflict-ui";
import { editSessionClient } from "@/edit-session/client";
import { useEditSession } from "@/edit-session/useEditSession";
import { PlaceholderPage } from "@/shell/PlaceholderPage";

interface Props {
  slug?: string;
}

/**
 * Derives the Pkl file path for an automation slug.
 * In production this would come from a config resolver; here we use a
 * convention-based path that matches the switchyard config directory layout.
 */
function automationFilePath(slug: string): string {
  return `/automations/${slug}.pkl`;
}

export function AutomationSlug({ slug = "unknown" }: Props) {
  const filePath = automationFilePath(slug);
  const session = useEditSession(filePath, editSessionClient);

  // Staged Pkl — in plan 10 this would come from the form/editor state.
  const [stagedPkl, setStagedPkl] = useState<string>("");

  function handleSave() {
    void session.save(stagedPkl);
  }

  function handleDiscard() {
    void session.discard();
  }

  function handleForceOverwrite() {
    void session.resolveConflict({ kind: "force", stagedPkl }, stagedPkl);
  }

  function handleOpenMerge() {
    // TODO(plan-12): navigate to the real Monaco merge route.
    const searchParams = new URLSearchParams({ session: session.sessionId ?? "" });
    const encodedPath = encodeURIComponent(filePath);
    window.location.href = `/_authed/pkl-editor/merge/${encodedPath}?${searchParams.toString()}`;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--sy-space-3)",
        padding: "var(--sy-space-5) var(--sy-space-6)",
      }}
    >
      {/* Conflict banner — rendered when an external edit is detected */}
      {session.conflict && (
        <ConflictBanner
          filePath={filePath}
          dirtyCount={session.dirtyCount}
          onDiscard={handleDiscard}
          onForceOverwrite={handleForceOverwrite}
          onOpenMerge={handleOpenMerge}
        />
      )}

      {/* Editor placeholder — Plan 10 implements the real WYSIWYG surface */}
      <PlaceholderPage title={`Automation: ${slug}`} plan="Plan 10" />

      {/* Session status */}
      {session.status === "open" && (
        <div
          style={{
            display: "flex",
            gap: "var(--sy-space-2)",
            alignItems: "center",
            fontSize: "0.8125rem",
          }}
        >
          <button
            type="button"
            onClick={handleSave}
            disabled={session.dirtyCount === 0}
            style={{
              padding: "var(--sy-space-1) var(--sy-space-3)",
              borderRadius: "var(--sy-radius-sm)",
              border: "1px solid var(--sy-color-accent)",
              background: "var(--sy-color-accent)",
              color: "var(--sy-color-bg)",
              cursor: "pointer",
              fontSize: "0.8125rem",
              opacity: session.dirtyCount === 0 ? 0.5 : 1,
            }}
          >
            Save &amp; exit
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            style={{
              padding: "var(--sy-space-1) var(--sy-space-3)",
              borderRadius: "var(--sy-radius-sm)",
              border: "1px solid var(--sy-color-line)",
              background: "transparent",
              color: "var(--sy-color-fg-3)",
              cursor: "pointer",
              fontSize: "0.8125rem",
            }}
          >
            Discard
          </button>
          {session.dirtyCount > 0 && (
            <span style={{ color: "var(--sy-color-fg-4)" }}>
              {session.dirtyCount} unsaved change{session.dirtyCount !== 1 ? "s" : ""}
            </span>
          )}
          {/* Expose staged pkl setter for testing — Plan 10 wires this to form state */}
          <input
            type="hidden"
            data-testid="staged-pkl-sink"
            onChange={(e) => setStagedPkl(e.target.value)}
          />
        </div>
      )}

      {session.status === "error" && (
        <p style={{ color: "var(--sy-color-bad)", fontSize: "0.8125rem" }}>
          Error opening session: {session.error}
        </p>
      )}
    </div>
  );
}
