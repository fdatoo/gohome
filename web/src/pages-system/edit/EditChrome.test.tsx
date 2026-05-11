import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditChrome } from "./EditChrome";
import { usePageEditor } from "./use-page-editor";
import type { SectionDef } from "../model";

function makeSection(id: string): SectionDef {
  return { id, type: "Hero", props: { title: id } };
}

beforeEach(() => {
  usePageEditor.setState({ sections: [], selectedSectionId: null, dirty: false });
});

describe("EditChrome", () => {
  it("renders editing indicator and action buttons", () => {
    render(
      <EditChrome onSave={vi.fn()} onDiscard={vi.fn()}>
        <div>content</div>
      </EditChrome>,
    );
    expect(screen.getByTestId("edit-indicator")).toBeInTheDocument();
    expect(screen.getByText("Discard")).toBeInTheDocument();
    expect(screen.getByText("Save & exit")).toBeInTheDocument();
  });

  it("shows settings rail", () => {
    usePageEditor.setState({
      sections: [makeSection("hero-1")],
      selectedSectionId: "hero-1",
      dirty: false,
    });
    render(
      <EditChrome onSave={vi.fn()} onDiscard={vi.fn()}>
        <div>content</div>
      </EditChrome>,
    );
    expect(screen.getByLabelText("Settings rail")).toBeInTheDocument();
  });

  it("shows dirty indicator when changes are pending", () => {
    usePageEditor.setState({ sections: [], selectedSectionId: null, dirty: true });
    render(
      <EditChrome onSave={vi.fn()} onDiscard={vi.fn()}>
        <div />
      </EditChrome>,
    );
    expect(screen.getByTestId("edit-indicator").textContent).toContain("*");
  });
});
