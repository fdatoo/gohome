import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SectionFrame } from "./SectionFrame";
import type { SectionDef } from "../model";

describe("SectionFrame", () => {
  it("renders unknown type with stub showing type name", () => {
    const def: SectionDef = {
      id: "mystery-1",
      type: "NonExistentSection",
      props: {},
    };

    render(<SectionFrame def={def} />);

    expect(screen.getByText(/NonExistentSection/i)).toBeInTheDocument();
    expect(screen.getByText(/Unknown section type/i)).toBeInTheDocument();
  });

  it("shows edit overlay controls in edit mode", () => {
    const def: SectionDef = {
      id: "test-section",
      type: "SomeUnknown",
      props: {},
    };

    render(<SectionFrame def={def} editMode />);

    expect(screen.getByLabelText("Drag handle")).toBeInTheDocument();
    expect(screen.getByLabelText("Section settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete section")).toBeInTheDocument();
  });

  it("shows selected pill when selected in edit mode", () => {
    const def: SectionDef = {
      id: "chart-1",
      type: "Chart",
      props: {},
    };

    render(<SectionFrame def={def} editMode selected />);

    expect(screen.getByText(/CHART · SELECTED/i)).toBeInTheDocument();
  });
});
