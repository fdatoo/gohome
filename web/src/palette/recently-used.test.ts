import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  getPaletteCliPreview,
  setPaletteCliPreview,
  recordRecentlyUsed,
  useRecentlyUsed,
} from "./recently-used";

// ─── CLI preview pref ────────────────────────────────────────────────────────

describe("getPaletteCliPreview", () => {
  beforeEach(() => {
    localStorage.removeItem("sy.palette.cliPreview");
  });

  it("returns false when key is absent", () => {
    expect(getPaletteCliPreview()).toBe(false);
  });

  it('returns true when key is "on"', () => {
    localStorage.setItem("sy.palette.cliPreview", "on");
    expect(getPaletteCliPreview()).toBe(true);
  });

  it('returns false when key is "off"', () => {
    localStorage.setItem("sy.palette.cliPreview", "off");
    expect(getPaletteCliPreview()).toBe(false);
  });

  it('setPaletteCliPreview(true) writes "on"', () => {
    setPaletteCliPreview(true);
    expect(localStorage.getItem("sy.palette.cliPreview")).toBe("on");
  });

  it('setPaletteCliPreview(false) writes "off"', () => {
    setPaletteCliPreview(true);
    setPaletteCliPreview(false);
    expect(localStorage.getItem("sy.palette.cliPreview")).toBe("off");
  });
});

// ─── Recently-used records ───────────────────────────────────────────────────

describe("recordRecentlyUsed", () => {
  beforeEach(() => {
    localStorage.removeItem("sy.palette.recentlyUsed");
  });

  it("records a command and reads it back", () => {
    recordRecentlyUsed("events tail", { source: "z2m" });
    const raw = JSON.parse(
      localStorage.getItem("sy.palette.recentlyUsed") ?? "[]",
    ) as Array<{ verbName: string; args: Record<string, string>; ranAt: string }>;
    expect(raw).toHaveLength(1);
    expect(raw[0].verbName).toBe("events tail");
    expect(raw[0].args).toEqual({ source: "z2m" });
  });

  it("deduplicates by exact verb+args (most recent wins)", () => {
    recordRecentlyUsed("events tail", { source: "z2m" });
    recordRecentlyUsed("entity get", { id: "abc" });
    recordRecentlyUsed("events tail", { source: "z2m" }); // duplicate
    const raw = JSON.parse(
      localStorage.getItem("sy.palette.recentlyUsed") ?? "[]",
    ) as Array<{ verbName: string }>;
    // Should have 2 entries (the duplicate is removed and re-added at the front)
    expect(raw).toHaveLength(2);
    expect(raw[0].verbName).toBe("events tail"); // most recent
  });
});

// ─── useRecentlyUsed snapshot stability ─────────────────────────────────────
// Regression test: the snapshot returned by useSyncExternalStore must be a
// stable reference across calls when the underlying data hasn't changed.
// Without caching, React enters an infinite render loop (see browser
// "getSnapshot should be cached to avoid an infinite loop" warning).

describe("useRecentlyUsed", () => {
  beforeEach(() => {
    localStorage.removeItem("sy.palette.recentlyUsed");
  });

  it("renders without entering an infinite loop", () => {
    // If the snapshot is unstable, renderHook will throw "Maximum update depth
    // exceeded". A clean render is the actual assertion.
    const { result } = renderHook(() => useRecentlyUsed());
    expect(result.current).toEqual([]);
  });

  it("returns recorded entries", () => {
    recordRecentlyUsed("events tail", { source: "z2m" });
    const { result } = renderHook(() => useRecentlyUsed());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].verbName).toBe("events tail");
  });

  it("survives many re-renders without React's infinite-loop guard tripping", () => {
    // This is the actual repro of the production bug: prior to caching the
    // getSnapshot result, React would throw "Maximum update depth exceeded"
    // on the second render. Twenty rerenders is comfortably past that.
    const { rerender } = renderHook(() => useRecentlyUsed());
    for (let i = 0; i < 20; i++) {
      rerender();
    }
  });
});
