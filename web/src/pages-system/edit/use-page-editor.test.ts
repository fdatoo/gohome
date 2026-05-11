import { describe, it, expect, beforeEach } from "vitest";
import { usePageEditor } from "./use-page-editor";
import type { SectionDef } from "../model";

function makeSection(id: string, type = "Hero"): SectionDef {
  return { id, type, props: { title: id } };
}

// Reset store between tests
beforeEach(() => {
  usePageEditor.setState({
    sections: [],
    selectedSectionId: null,
    dirty: false,
  });
});

describe("usePageEditor", () => {
  it("setSections initialises and resets dirty", () => {
    usePageEditor.getState().setSections([makeSection("a"), makeSection("b")]);
    const state = usePageEditor.getState();
    expect(state.sections).toHaveLength(2);
    expect(state.dirty).toBe(false);
  });

  it("moveSection swaps order and marks dirty", () => {
    usePageEditor.getState().setSections([makeSection("a"), makeSection("b"), makeSection("c")]);
    usePageEditor.getState().moveSection(0, 2);
    const ids = usePageEditor.getState().sections.map((s) => s.id);
    expect(ids).toEqual(["b", "c", "a"]);
    expect(usePageEditor.getState().dirty).toBe(true);
  });

  it("deleteSection removes section and clears selection", () => {
    usePageEditor.getState().setSections([makeSection("a"), makeSection("b")]);
    usePageEditor.getState().selectSection("a");
    usePageEditor.getState().deleteSection("a");
    const state = usePageEditor.getState();
    expect(state.sections.map((s) => s.id)).toEqual(["b"]);
    expect(state.selectedSectionId).toBeNull();
    expect(state.dirty).toBe(true);
  });

  it("addSection appends after specified section", () => {
    usePageEditor.getState().setSections([makeSection("a"), makeSection("b")]);
    usePageEditor.getState().addSection("a", makeSection("new"));
    const ids = usePageEditor.getState().sections.map((s) => s.id);
    expect(ids).toEqual(["a", "new", "b"]);
  });

  it("addSection with null appends at end", () => {
    usePageEditor.getState().setSections([makeSection("a")]);
    usePageEditor.getState().addSection(null, makeSection("tail"));
    expect(usePageEditor.getState().sections.map((s) => s.id)).toEqual(["a", "tail"]);
  });

  it("updateSectionProps merges props and marks dirty", () => {
    usePageEditor.getState().setSections([makeSection("a")]);
    usePageEditor.getState().updateSectionProps("a", { title: "Updated" });
    const s = usePageEditor.getState().sections[0];
    expect(s.props.title).toBe("Updated");
    expect(usePageEditor.getState().dirty).toBe(true);
  });
});
