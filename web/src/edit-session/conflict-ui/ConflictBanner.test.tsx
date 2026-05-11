import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictBanner } from "./ConflictBanner";

const FORCE_WARNED_KEY = "sy.conflict.force-warned";

// localStorage polyfill for jsdom (which needs a URL for local storage to work)
const localStorageData: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageData[key] ?? null,
  setItem: (key: string, value: string) => { localStorageData[key] = value; },
  removeItem: (key: string) => { delete localStorageData[key]; },
  clear: () => { Object.keys(localStorageData).forEach((k) => delete localStorageData[k]); },
};

const defaultProps = {
  filePath: "/config/automations/lights.pkl",
  dirtyCount: 3,
  onDiscard: vi.fn(),
  onForceOverwrite: vi.fn(),
  onOpenMerge: vi.fn(),
};

describe("ConflictBanner", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", localStorageMock);
    localStorageMock.removeItem(FORCE_WARNED_KEY);
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorageMock.removeItem(FORCE_WARNED_KEY);
    vi.unstubAllGlobals();
  });

  it("renders all three buttons", () => {
    render(<ConflictBanner {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Discard mine" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Overwrite file" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Open 3-way merge →" })).toBeVisible();
  });

  it("'Discard mine' calls onDiscard", () => {
    render(<ConflictBanner {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Discard mine" }));
    expect(defaultProps.onDiscard).toHaveBeenCalledOnce();
  });

  it("'Overwrite file' without prior warning shows confirm step; calls onForceOverwrite only after Confirm", () => {
    render(<ConflictBanner {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Overwrite file" }));
    // Confirm step appears
    expect(screen.getByRole("button", { name: "Confirm" })).toBeVisible();
    expect(defaultProps.onForceOverwrite).not.toHaveBeenCalled();
    // Click Confirm
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(defaultProps.onForceOverwrite).toHaveBeenCalledOnce();
  });

  it("'Overwrite file' with sy.conflict.force-warned set skips confirm step", () => {
    localStorageMock.setItem(FORCE_WARNED_KEY, "true");
    render(<ConflictBanner {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Overwrite file" }));
    // No confirm step — called immediately
    expect(defaultProps.onForceOverwrite).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("'Open 3-way merge →' calls onOpenMerge", () => {
    render(<ConflictBanner {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Open 3-way merge →" }));
    expect(defaultProps.onOpenMerge).toHaveBeenCalledOnce();
  });

  it("shows dirty count in the message", () => {
    render(<ConflictBanner {...defaultProps} dirtyCount={5} />);
    expect(screen.getByRole("alert")).toHaveTextContent("5 unsaved changes");
  });

  it("shows singular 'change' when dirtyCount is 1", () => {
    render(<ConflictBanner {...defaultProps} dirtyCount={1} />);
    expect(screen.getByRole("alert")).toHaveTextContent("1 unsaved change.");
  });
});
