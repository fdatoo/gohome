import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WidgetPacks } from "./WidgetPacks";

// Mock the widget-pack-client module
vi.mock("@/data/widget-pack-client", () => ({
  useInstalledPacks: vi.fn(),
  widgetPackClient: {
    listInstalledPacks: vi.fn().mockResolvedValue([]),
    installPack: vi.fn().mockResolvedValue({}),
  },
  ConnectHTTPError: class ConnectHTTPError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "ConnectHTTPError";
      this.status = status;
    }
  },
}));

import * as widgetPackClientModule from "@/data/widget-pack-client";

const mockInstallPack = vi.fn();
const mockRefresh = vi.fn();

const baseMock = {
  packs: [],
  loading: false,
  error: null,
  errorStatus: null,
  installPack: mockInstallPack,
  refresh: mockRefresh,
};

describe("WidgetPacks section", () => {
  beforeEach(() => {
    vi.mocked(widgetPackClientModule.useInstalledPacks).mockReturnValue({
      ...baseMock,
      packs: [
        {
          name: "sy-core",
          version: "1.0.0",
          sha256: "abc123",
          signature: "verified",
          signerIdentity: "switchyard@example.com",
          ociRef: "ghcr.io/switchyard/core:1.0.0",
        },
        {
          name: "sy-dashboard",
          version: "2.1.0",
          sha256: "def456",
          signature: "unverified",
          signerIdentity: "",
          ociRef: "ghcr.io/user/dashboard:2.1.0",
        },
      ],
    });
  });

  it("renders OCI ref for each pack", () => {
    render(<WidgetPacks />);
    expect(screen.getByText("ghcr.io/switchyard/core:1.0.0")).toBeInTheDocument();
    expect(screen.getByText("ghcr.io/user/dashboard:2.1.0")).toBeInTheDocument();
  });

  it("renders verified chip for verified pack", () => {
    render(<WidgetPacks />);
    expect(screen.getByText("verified")).toBeInTheDocument();
  });

  it("opens the install dialog when + Install is clicked", () => {
    render(<WidgetPacks />);
    fireEvent.click(screen.getByRole("button", { name: "+ Install" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the OCI ref input inside the dialog", () => {
    render(<WidgetPacks />);
    fireEvent.click(screen.getByRole("button", { name: "+ Install" }));
    const input = screen.getByPlaceholderText("ghcr.io/owner/pack:version");
    expect(input).toBeInTheDocument();
  });

  it("shows loading state while packs are loading", () => {
    vi.mocked(widgetPackClientModule.useInstalledPacks).mockReturnValue({
      ...baseMock,
      loading: true,
    });
    render(<WidgetPacks />);
    expect(screen.getByText("Loading widget packs…")).toBeInTheDocument();
  });

  it("shows empty state when no packs are installed", () => {
    vi.mocked(widgetPackClientModule.useInstalledPacks).mockReturnValue({
      ...baseMock,
      packs: [],
      loading: false,
      error: null,
      errorStatus: null,
    });
    render(<WidgetPacks />);
    expect(screen.getByText("No widget packs installed")).toBeInTheDocument();
  });

  it("shows sign-in CTA on 401 error", () => {
    vi.mocked(widgetPackClientModule.useInstalledPacks).mockReturnValue({
      ...baseMock,
      error: "401 Unauthorized",
      errorStatus: 401,
    });
    render(<WidgetPacks />);
    expect(screen.getByText("Authentication required")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Sign in to view this/i });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("shows retry button on 5xx error", () => {
    vi.mocked(widgetPackClientModule.useInstalledPacks).mockReturnValue({
      ...baseMock,
      error: "Internal server error",
      errorStatus: 500,
    });
    render(<WidgetPacks />);
    expect(screen.getByText("Failed to load widget packs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("calls refresh when Retry is clicked on server error", () => {
    vi.mocked(widgetPackClientModule.useInstalledPacks).mockReturnValue({
      ...baseMock,
      error: "Internal server error",
      errorStatus: 500,
    });
    render(<WidgetPacks />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRefresh).toHaveBeenCalledOnce();
  });
});
