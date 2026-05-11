import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedTab } from "./SavedTab";
import type { SavedQuery } from "../../gen/activity/v1/activity_pb";

const MOCK_QUERIES: SavedQuery[] = [
  {
    id: "q-1",
    name: "Failed commands",
    filter: "kind:cmd.failed",
    cron: "*/5 * * * *",
    lastRun: "2026-05-11T11:00:00Z",
    nextRun: "2026-05-11T11:05:00Z",
    createdAt: "2026-05-01T00:00:00Z",
  },
  {
    id: "q-2",
    name: "All state changes",
    filter: "kind:state_changed",
    cron: "",
    lastRun: null,
    nextRun: null,
    createdAt: "2026-05-02T00:00:00Z",
  },
];

describe("SavedTab", () => {
  it("renders two rows for two mocked queries", () => {
    render(
      <SavedTab
        queries={MOCK_QUERIES}
        onSaveQuery={vi.fn()}
        onDeleteQuery={vi.fn()}
        onRunQuery={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("saved-query-row")).toHaveLength(2);
  });

  it("calls deleteQuery with the correct id when delete row 1 is clicked", async () => {
    const user = userEvent.setup();
    const onDeleteQuery = vi.fn();
    render(
      <SavedTab
        queries={MOCK_QUERIES}
        onSaveQuery={vi.fn()}
        onDeleteQuery={onDeleteQuery}
        onRunQuery={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("delete-btn-q-1"));
    expect(onDeleteQuery).toHaveBeenCalledWith("q-1");
  });

  it("calls saveQuery when form is submitted with valid data", async () => {
    const user = userEvent.setup();
    const onSaveQuery = vi.fn();
    render(
      <SavedTab
        queries={[]}
        currentFilter="kind:cmd.failed"
        onSaveQuery={onSaveQuery}
        onDeleteQuery={vi.fn()}
        onRunQuery={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("save-current-query-btn"));
    await user.type(screen.getByTestId("query-name-input"), "My Query");
    await user.click(screen.getByTestId("confirm-save-btn"));

    expect(onSaveQuery).toHaveBeenCalledWith("My Query", "kind:cmd.failed", "");
  });

  it("shows cron error and does not call saveQuery on invalid cron", async () => {
    const user = userEvent.setup();
    const onSaveQuery = vi.fn();
    render(
      <SavedTab
        queries={[]}
        currentFilter="kind:cmd.failed"
        onSaveQuery={onSaveQuery}
        onDeleteQuery={vi.fn()}
        onRunQuery={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("save-current-query-btn"));
    await user.type(screen.getByTestId("query-name-input"), "My Query");
    await user.type(screen.getByTestId("query-cron-input"), "not-a-valid-cron");
    await user.click(screen.getByTestId("confirm-save-btn"));

    expect(screen.getByTestId("cron-error")).toBeInTheDocument();
    expect(onSaveQuery).not.toHaveBeenCalled();
  });
});
