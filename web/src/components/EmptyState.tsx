/**
 * EmptyState — shared component for loading / error / empty slots in
 * settings sections and page routes.
 *
 * Variants:
 *  "loading"      — muted "Loading <label>…" line
 *  "empty"        — Surface card with muted message + optional hint
 *  "error-auth"   — Surface card with bad-colour accent + sign-in link
 *  "error-server" — Surface card with bad-colour accent + Retry button
 *
 * Only design-token colours are used (var(--sy-color-*)), never raw values.
 */

import { Surface } from "@/theme/primitives/surface";
import { Button } from "@/theme/primitives/button";

export type EmptyStateVariant = "loading" | "empty" | "error-auth" | "error-server";

interface EmptyStateProps {
  /** Which visual treatment to render. */
  variant: EmptyStateVariant;
  /** Short label: shown inside loading text, used as card heading. */
  label: string;
  /** Optional body copy below the heading (empty / error variants only). */
  message?: React.ReactNode;
  /** Called when the Retry button is clicked (error-server variant only). */
  onRetry?: () => void;
}

export function EmptyState({ variant, label, message, onRetry }: EmptyStateProps) {
  if (variant === "loading") {
    return (
      <p
        style={{
          margin: 0,
          fontSize: "0.875rem",
          color: "var(--sy-color-fg-3)",
          fontStyle: "italic",
        }}
        aria-label={`Loading ${label}`}
      >
        Loading {label}…
      </p>
    );
  }

  const isError = variant === "error-auth" || variant === "error-server";

  return (
    <Surface
      role="status"
      aria-label={label}
      style={{
        padding: "var(--sy-space-5)",
        border: `1px solid ${isError ? "var(--sy-color-bad)" : "var(--sy-color-line)"}`,
        borderLeft: isError
          ? "3px solid var(--sy-color-bad)"
          : "3px solid var(--sy-color-fg-3)",
      }}
    >
      <p
        style={{
          margin: "0 0 var(--sy-space-2)",
          fontSize: "0.875rem",
          fontWeight: 600,
          color: isError ? "var(--sy-color-bad)" : "var(--sy-color-fg-3)",
        }}
      >
        {label}
      </p>

      {message && (
        <div
          style={{
            fontSize: "0.8125rem",
            color: "var(--sy-color-fg-3)",
            marginBottom: "var(--sy-space-4)",
          }}
        >
          {message}
        </div>
      )}

      {variant === "error-auth" && (
        <a
          href="/login"
          style={{
            fontSize: "0.8125rem",
            color: "var(--sy-color-accent)",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Sign in to view this →
        </a>
      )}

      {variant === "error-server" && onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Surface>
  );
}
