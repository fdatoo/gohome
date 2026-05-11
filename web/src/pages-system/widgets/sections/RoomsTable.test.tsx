import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test } from "vitest";
import { RoomsTable } from "./RoomsTable";

const rooms = [
  { id: "r1", name: "Living Room", state: "on" as const, scene: "Evening", brightness: 72, sinceMs: 120_000 },
  { id: "r2", name: "Kitchen", state: "off" as const, scene: "—", brightness: 0, sinceMs: 600_000 },
  { id: "r3", name: "Bedroom", state: "on" as const, scene: "Night", brightness: 20, sinceMs: 30_000 },
];

test("renders one row per room", () => {
  render(<RoomsTable rooms={rooms} />);
  expect(screen.getAllByRole("row")).toHaveLength(rooms.length + 1); // +1 header
});

test("renders column headers: Name, State, Scene, Brightness, Since", () => {
  render(<RoomsTable rooms={rooms} />);
  ["Name", "State", "Scene", "Brightness", "Since"].forEach((header) =>
    expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument(),
  );
});

test("clicking Name header sorts ascending then descending", () => {
  render(<RoomsTable rooms={rooms} />);
  const nameHeader = screen.getByRole("columnheader", { name: "Name" });
  fireEvent.click(nameHeader);
  const rowsAsc = screen.getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
  expect(rowsAsc[0]).toContain("Bedroom");

  fireEvent.click(nameHeader);
  const rowsDesc = screen.getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
  expect(rowsDesc[0]).toContain("Living Room");
});

test("brightness column renders numeric value", () => {
  render(<RoomsTable rooms={rooms} />);
  expect(screen.getByText("72")).toBeInTheDocument();
});
