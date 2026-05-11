import { describe, expect, it, vi } from "vitest";
import { CommandTracker } from "./command-tracker";

describe("CommandTracker", () => {
  it("tracks idle, pending, and settled states by command_id", () => {
    vi.useFakeTimers();
    const tracker = new CommandTracker();
    const seen = vi.fn();

    tracker.subscribe("light.kitchen", seen);
    expect(tracker.current("light.kitchen")).toEqual({ state: "idle" });

    tracker.issued("command-1", "light.kitchen");
    expect(tracker.current("light.kitchen")).toMatchObject({ state: "pending", commandId: "command-1" });

    tracker.acked("command-1");
    expect(tracker.current("light.kitchen")).toMatchObject({ state: "settled", commandId: "command-1", ok: true });

    vi.advanceTimersByTime(3000);
    expect(tracker.current("light.kitchen")).toEqual({ state: "idle" });
    expect(seen).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
