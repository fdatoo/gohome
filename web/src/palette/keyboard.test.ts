import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGlobalPaletteShortcut, useMcpAskShortcut } from "./keyboard";

// The test setup already provides a default matchMedia mock that returns matches: false.
// We override it per test to control the breakpoint.

function setBreakpoint(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// In jsdom, navigator.platform is "". isMacOS() returns false → ctrlKey is the modifier.
function fireCmdK(): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
  );
}

function fireCtrlApostrophe(): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "'", ctrlKey: true, bubbles: true }),
  );
}

describe("useGlobalPaletteShortcut", () => {
  afterEach(() => {
    // Restore default matchMedia mock (matches: false).
    setBreakpoint(false);
  });

  it("calls open when Cmd+K is fired at desktop breakpoint (>= 1024px)", () => {
    setBreakpoint(true); // 1280px-like
    const open = vi.fn();
    renderHook(() => useGlobalPaletteShortcut(open));
    fireCmdK();
    expect(open).toHaveBeenCalledOnce();
  });

  it("does NOT call open when Cmd+K is fired at narrow viewport (< 1024px)", () => {
    setBreakpoint(false); // 800px-like
    const open = vi.fn();
    renderHook(() => useGlobalPaletteShortcut(open));
    fireCmdK();
    expect(open).not.toHaveBeenCalled();
  });

  it("unregisters the listener on unmount", () => {
    setBreakpoint(true);
    const open = vi.fn();
    const { unmount } = renderHook(() => useGlobalPaletteShortcut(open));
    unmount();
    fireCmdK();
    expect(open).not.toHaveBeenCalled();
  });
});

describe("useMcpAskShortcut", () => {
  afterEach(() => {
    setBreakpoint(false);
  });

  it("calls openAsk when Cmd+apostrophe is fired and MCP is configured", () => {
    setBreakpoint(true);
    const openAsk = vi.fn();
    renderHook(() => useMcpAskShortcut(openAsk, true));
    fireCtrlApostrophe();
    expect(openAsk).toHaveBeenCalledOnce();
  });

  it("does NOT call openAsk when MCP is not configured", () => {
    setBreakpoint(true);
    const openAsk = vi.fn();
    renderHook(() => useMcpAskShortcut(openAsk, false));
    fireCtrlApostrophe();
    expect(openAsk).not.toHaveBeenCalled();
  });
});
