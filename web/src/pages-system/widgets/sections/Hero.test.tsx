import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { HeroSection } from "./Hero";
import type { SectionDef } from "../../model";

function makeDef(props: Record<string, unknown>): SectionDef {
  return { id: "test", type: "Hero", props };
}

describe("HeroSection", () => {
  it("renders title and subtitle", () => {
    const def = makeDef({ title: "Energy & Climate", subtitle: "Live readings" });
    render(<HeroSection def={def} />);
    expect(screen.getByText("Energy & Climate")).toBeInTheDocument();
    expect(screen.getByText("Live readings")).toBeInTheDocument();
  });

  it("renders stat cards", () => {
    const def = makeDef({
      title: "Stats",
      stats: [
        { label: "Power", value: "3.2", unit: "kW", delta: 0.4 },
        { label: "Indoor temp", value: "21", unit: "°C", delta: -1 },
      ],
    });
    render(<HeroSection def={def} />);
    expect(screen.getByText("Power")).toBeInTheDocument();
    expect(screen.getByText("Indoor temp")).toBeInTheDocument();
  });

  it("positive delta uses bad color (energy up = bad)", () => {
    const def = makeDef({
      title: "CO₂",
      stats: [{ label: "CO₂", value: "420", unit: "ppm", delta: 5 }],
    });
    render(<HeroSection def={def} />);
    const deltaEl = screen.getByText("+5");
    expect(deltaEl).toHaveStyle({ color: "var(--sy-color-bad)" });
  });

  it("negative delta uses good color", () => {
    const def = makeDef({
      title: "CO₂",
      stats: [{ label: "CO₂", value: "415", unit: "ppm", delta: -5 }],
    });
    render(<HeroSection def={def} />);
    const deltaEl = screen.getByText("-5");
    expect(deltaEl).toHaveStyle({ color: "var(--sy-color-good)" });
  });
});
