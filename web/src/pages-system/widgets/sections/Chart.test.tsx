import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChartSection } from "./Chart";
import type { SectionDef } from "../../model";

function makeDef(props: Record<string, unknown>): SectionDef {
  return { id: "test", type: "Chart", props };
}

describe("ChartSection", () => {
  it("renders title and window chips", () => {
    const def = makeDef({ title: "Power Draw", window: "24h" });
    render(<ChartSection def={def} />);
    expect(screen.getByText("Power Draw")).toBeInTheDocument();
    expect(screen.getByText("1h")).toBeInTheDocument();
    expect(screen.getByText("24h")).toBeInTheDocument();
  });

  it("switches window on chip click", () => {
    const def = makeDef({ title: "Power", window: "24h" });
    render(<ChartSection def={def} />);
    fireEvent.click(screen.getByText("7d"));
    const svg = screen.getByRole("img", { hidden: true });
    expect(svg.getAttribute("aria-label")).toMatch(/7d/);
  });
});
