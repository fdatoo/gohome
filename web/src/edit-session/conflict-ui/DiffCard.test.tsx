import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffCard } from "./DiffCard";

describe("DiffCard", () => {
  it("renders all lines when 5 or fewer", () => {
    const lines = ["line 1", "line 2", "line 3", "line 4", "line 5"];
    render(<DiffCard lines={lines} />);
    // All 5 lines visible in the pre element
    const pre = document.querySelector("pre");
    expect(pre?.textContent).toContain("line 1");
    expect(pre?.textContent).toContain("line 5");
  });

  it("shows '+1 more line' when 6 lines given", () => {
    const lines = ["l1", "l2", "l3", "l4", "l5", "l6"];
    render(<DiffCard lines={lines} />);
    expect(screen.getByText("+1 more line")).toBeVisible();
    // The 6th line should not appear in the pre
    const pre = document.querySelector("pre");
    expect(pre?.textContent).not.toContain("l6");
  });

  it("shows '+N more lines' (plural) when overflow > 1", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    render(<DiffCard lines={lines} />);
    expect(screen.getByText("+5 more lines")).toBeVisible();
  });

  it("renders the label when provided", () => {
    render(<DiffCard lines={["a"]} label="Disk version" />);
    expect(screen.getByText("Disk version")).toBeVisible();
  });
});
