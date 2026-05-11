import { describe, expect, it, vi } from "vitest";
import { createMultiplexer, type StreamFactory } from "./multiplexer";

describe("createMultiplexer", () => {
  it("reconnects streams from the last cursor", () => {
    vi.useFakeTimers();
    const opened: Parameters<StreamFactory>[0][] = [];
    const openStream: StreamFactory = (args) => {
      opened.push(args);
      return { close: () => undefined };
    };
    const mux = createMultiplexer({ openStream, reconnectDelayMs: 5 });

    mux.subscribe(["light.kitchen"]);
    opened[0].onEvent({ kind: "state", cursor: "state-7", entityId: "light.kitchen", state: "on" });
    opened[0].onClose();
    vi.advanceTimersByTime(5);

    expect(opened[2]).toMatchObject({ kind: "state", cursor: "state-7", entityIds: ["light.kitchen"] });
    mux.shutdown();
    vi.useRealTimers();
  });

  it("joins new subscriptions across state and command streams", () => {
    const opened: Parameters<StreamFactory>[0][] = [];
    const openStream: StreamFactory = (args) => {
      opened.push(args);
      return { close: () => undefined };
    };
    const mux = createMultiplexer({ openStream });

    mux.subscribe(["light.kitchen"]);
    mux.subscribe(["light.kitchen", "switch.porch"]);

    expect(opened[2]).toMatchObject({ kind: "state", entityIds: ["light.kitchen", "switch.porch"] });
    expect(opened[3]).toMatchObject({ kind: "command", entityIds: ["light.kitchen", "switch.porch"] });
    mux.shutdown();
  });
});
