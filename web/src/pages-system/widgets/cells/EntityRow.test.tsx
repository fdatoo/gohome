import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EntityRow } from "./EntityRow";
import type { CellDef } from "../../model";

describe("EntityRow cell", () => {
  it("renders entity name and ID", () => {
    const def: CellDef = {
      id: "c1",
      type: "EntityRow",
      props: {
        entityId: "sensor.indoor_temp",
        label: "Indoor Temperature",
        unit: "°C",
        value: 21.5,
      },
    };
    render(<EntityRow def={def} />);
    expect(screen.getByText("Indoor Temperature")).toBeInTheDocument();
    expect(screen.getByText("sensor.indoor_temp")).toBeInTheDocument();
  });

  it("renders value and unit", () => {
    const def: CellDef = {
      id: "c2",
      type: "EntityRow",
      props: { entityId: "sensor.power", label: "Power", value: "3.2", unit: "kW" },
    };
    render(<EntityRow def={def} />);
    expect(screen.getByText("3.2")).toBeInTheDocument();
    expect(screen.getByText("kW")).toBeInTheDocument();
  });
});
