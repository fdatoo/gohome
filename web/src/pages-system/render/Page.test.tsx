import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Page } from "./Page";
import { registerSection } from "../registry";
import type { SectionProps } from "../registry";
import type { PageModel } from "../model";

// Register a simple Hero stub for testing
function HeroStub({ def }: SectionProps) {
  return <div data-testid="hero-section">{(def.props.title as string) ?? "Hero"}</div>;
}
registerSection("Hero", HeroStub);

describe("Page", () => {
  it("renders page title and sections", () => {
    const page: PageModel = {
      slug: "test",
      title: "Energy & Climate",
      sections: [
        {
          id: "hero-1",
          type: "Hero",
          props: { title: "Live Readings" },
        },
      ],
    };

    render(<Page page={page} />);

    expect(screen.getByText("Energy & Climate")).toBeInTheDocument();
    expect(screen.getByTestId("hero-section")).toBeInTheDocument();
    expect(screen.getByText("Live Readings")).toBeInTheDocument();
  });

  it("renders empty sections list without error", () => {
    const page: PageModel = {
      slug: "empty",
      title: "Empty Page",
      sections: [],
    };
    render(<Page page={page} />);
    expect(screen.getByText("Empty Page")).toBeInTheDocument();
  });
});
