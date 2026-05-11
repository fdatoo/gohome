/**
 * keyboard.ts
 * Global keyboard shortcut hooks for the command palette.
 * - useGlobalPaletteShortcut: handles Cmd/Ctrl+K (desktop only, >= 1024px).
 * - useMcpAskShortcut: handles Cmd/Ctrl+' (only when MCP is configured).
 * UI v2 Plan 05.
 */
import { useEffect } from "react";

function isDesktopBreakpoint(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 1024px)").matches;
}

function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.platform.toLowerCase().includes("mac");
}

/**
 * useGlobalPaletteShortcut registers a global keydown listener for Cmd+K (Mac)
 * or Ctrl+K (Windows/Linux). The listener is a no-op on viewports narrower than
 * 1024px (per plan decision §3 — desktop-only).
 */
export function useGlobalPaletteShortcut(open: () => void): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!isDesktopBreakpoint()) return;
      const isMac = isMacOS();
      const modifierHeld = isMac ? e.metaKey : e.ctrlKey;
      if (modifierHeld && e.key === "k") {
        e.preventDefault();
        open();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);
}

/**
 * useMcpAskShortcut registers Cmd/' / Ctrl+' to open the Ask panel.
 * Is a no-op (does not register the listener) when mcpConfigured is false.
 */
export function useMcpAskShortcut(
  openAsk: () => void,
  mcpConfigured: boolean,
): void {
  useEffect(() => {
    if (!mcpConfigured) return;

    function handleKeyDown(e: KeyboardEvent): void {
      if (!isDesktopBreakpoint()) return;
      const isMac = isMacOS();
      const modifierHeld = isMac ? e.metaKey : e.ctrlKey;
      if (modifierHeld && e.key === "'") {
        e.preventDefault();
        openAsk();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openAsk, mcpConfigured]);
}
