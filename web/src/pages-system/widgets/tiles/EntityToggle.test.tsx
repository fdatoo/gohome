import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntityToggle } from "./EntityToggle";
import type { TileDef } from "../../model";

describe("EntityToggle tile", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
  });

  it("renders entity label", () => {
    const def: TileDef = {
      id: "t1",
      type: "EntityToggle",
      props: { entityId: "light.living_room", label: "Living Room Light" },
    };
    render(<EntityToggle def={def} />);
    expect(screen.getByText("Living Room Light")).toBeInTheDocument();
  });

  it("calls SetState with correct entity ID when toggled", async () => {
    const def: TileDef = {
      id: "t2",
      type: "EntityToggle",
      props: { entityId: "switch.fan", label: "Fan" },
    };
    render(<EntityToggle def={def} />);
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("SetState"),
        expect.objectContaining({
          body: expect.stringContaining("switch.fan"),
        }),
      );
    });
  });
});
