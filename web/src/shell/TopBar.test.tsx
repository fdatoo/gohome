import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";

// Mock the palette hook so TopBar tests don't need the full PaletteProvider stack.
vi.mock("@/palette/use-palette", () => ({
  usePalette: () => ({
    openPalette: vi.fn(),
    closePalette: vi.fn(),
    isOpen: false,
  }),
}));

describe("TopBar", () => {
  it("renders the breadcrumb with the current page name derived from the path", () => {
    render(<TopBar currentPath="/_authed/activity" />);

    const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(breadcrumb).toBeInTheDocument();
    expect(breadcrumb).toHaveTextContent("Activity");
  });

  it("renders Home when the path is /_authed/home", () => {
    render(<TopBar currentPath="/_authed/home" />);
    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toHaveTextContent("Home");
  });

  it("renders the command palette button", () => {
    render(<TopBar currentPath="/_authed/home" />);
    expect(screen.getByRole("button", { name: /open command palette/i })).toBeInTheDocument();
  });
});
