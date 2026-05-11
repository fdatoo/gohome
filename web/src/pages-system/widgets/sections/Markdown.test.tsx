import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarkdownSection } from "./Markdown";
import type { SectionDef } from "../../model";

describe("MarkdownSection", () => {
  it("renders heading from markdown content", () => {
    const def: SectionDef = {
      id: "md-1",
      type: "Markdown",
      props: { content: "# Hello World\nThis is a paragraph." },
    };
    render(<MarkdownSection def={def} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toBe("Hello World");
  });

  it("renders paragraph text", () => {
    const def: SectionDef = {
      id: "md-2",
      type: "Markdown",
      props: { content: "Simple paragraph text." },
    };
    render(<MarkdownSection def={def} />);
    expect(screen.getByText("Simple paragraph text.")).toBeInTheDocument();
  });

  it("renders empty without error", () => {
    const def: SectionDef = {
      id: "md-3",
      type: "Markdown",
      props: {},
    };
    const { container } = render(<MarkdownSection def={def} />);
    expect(container).toBeTruthy();
  });
});
