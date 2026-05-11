/**
 * ConflictBanner — displayed when an external edit is detected mid-session.
 *
 * Shows three resolution options:
 *   1. Discard mine — calls onDiscard
 *   2. Overwrite file — shows one-time inline confirm (tracked in localStorage)
 *   3. Open 3-way merge → — calls onOpenMerge
 *
 * The banner uses --sy-color-warn accent and is not a modal.
 *
 * localStorage key: sy.conflict.force-warned
 */

import { useState } from "react";

const FORCE_WARNED_KEY = "sy.conflict.force-warned";

export type ConflictBannerProps = {
  filePath: string;
  dirtyCount: number;
  modifiedAt?: Date;
  onDiscard: () => void;
  onForceOverwrite: () => void;
  onOpenMerge: () => void;
};

export function ConflictBanner({
  filePath,
  dirtyCount,
  modifiedAt,
  onDiscard,
  onForceOverwrite,
  onOpenMerge,
}: ConflictBannerProps) {
  const fileName = filePath.split("/").pop() ?? filePath;
  const relTime = modifiedAt ? formatRelTime(modifiedAt) : "recently";

  const [showForceConfirm, setShowForceConfirm] = useState(false);

  function handleForceClick() {
    const alreadyWarned = localStorage.getItem(FORCE_WARNED_KEY) === "true";
    if (alreadyWarned) {
      onForceOverwrite();
    } else {
      setShowForceConfirm(true);
    }
  }

  function handleForceConfirm() {
    localStorage.setItem(FORCE_WARNED_KEY, "true");
    setShowForceConfirm(false);
    onForceOverwrite();
  }

  return (
    <div
      role="alert"
      aria-label="External edit conflict"
      style={{
        borderLeft: "4px solid var(--sy-color-warn)",
        background: "var(--sy-color-surface-1)",
        border: "1px solid var(--sy-color-warn)",
        borderRadius: "var(--sy-radius)",
        padding: "var(--sy-space-3) var(--sy-space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sy-space-2)",
      }}
    >
      {/* Message */}
      <p
        style={{
          margin: 0,
          fontSize: "0.875rem",
          color: "var(--sy-color-fg)",
        }}
      >
        <strong>External edit detected</strong> —{" "}
        <code style={{ fontFamily: "var(--sy-font-body)" }}>{fileName}</code>{" "}
        changed on disk {relTime} after you opened it. You have{" "}
        <strong>{dirtyCount}</strong> unsaved change{dirtyCount !== 1 ? "s" : ""}. Choose how to
        reconcile.
      </p>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: "var(--sy-space-2)",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={onDiscard}
          style={{
            padding: "var(--sy-space-1) var(--sy-space-3)",
            borderRadius: "var(--sy-radius-sm)",
            border: "1px solid var(--sy-color-line)",
            background: "var(--sy-color-surface-2)",
            color: "var(--sy-color-fg)",
            cursor: "pointer",
            fontSize: "0.8125rem",
          }}
        >
          Discard mine
        </button>

        {!showForceConfirm ? (
          <button
            type="button"
            onClick={handleForceClick}
            style={{
              padding: "var(--sy-space-1) var(--sy-space-3)",
              borderRadius: "var(--sy-radius-sm)",
              border: "1px solid var(--sy-color-warn)",
              background: "transparent",
              color: "var(--sy-color-warn)",
              cursor: "pointer",
              fontSize: "0.8125rem",
            }}
          >
            Overwrite file
          </button>
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--sy-space-2)",
              fontSize: "0.8125rem",
              color: "var(--sy-color-fg-3)",
            }}
          >
            This will discard the on-disk version.{" "}
            <button
              type="button"
              onClick={handleForceConfirm}
              style={{
                padding: "2px var(--sy-space-2)",
                borderRadius: "var(--sy-radius-sm)",
                border: "1px solid var(--sy-color-bad)",
                background: "transparent",
                color: "var(--sy-color-bad)",
                cursor: "pointer",
                fontSize: "0.8125rem",
              }}
            >
              Confirm
            </button>
          </span>
        )}

        <button
          type="button"
          onClick={onOpenMerge}
          style={{
            padding: "var(--sy-space-1) var(--sy-space-3)",
            borderRadius: "var(--sy-radius-sm)",
            border: "1px solid var(--sy-color-line)",
            background: "transparent",
            color: "var(--sy-color-accent)",
            cursor: "pointer",
            fontSize: "0.8125rem",
          }}
        >
          Open 3-way merge →
        </button>
      </div>
    </div>
  );
}

function formatRelTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
}
