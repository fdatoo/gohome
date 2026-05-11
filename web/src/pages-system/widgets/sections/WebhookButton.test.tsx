import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebhookButtonSection } from "./WebhookButton";
import type { SectionDef } from "../../model";

describe("WebhookButtonSection", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
  });

  it("renders label", () => {
    const def: SectionDef = {
      id: "wh-1",
      type: "WebhookButton",
      props: { label: "Deploy Now", webhookId: "deploy-prod" },
    };
    render(<WebhookButtonSection def={def} />);
    expect(screen.getByText("Deploy Now")).toBeInTheDocument();
  });

  it("calls RunWebhook on click", async () => {
    const def: SectionDef = {
      id: "wh-2",
      type: "WebhookButton",
      props: { label: "Run", webhookId: "test-hook" },
    };
    render(<WebhookButtonSection def={def} />);
    fireEvent.click(screen.getByText("Run"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("RunWebhook"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("test-hook"),
        }),
      );
    });
  });

  it("shows confirmation prompt when confirm=true", () => {
    const def: SectionDef = {
      id: "wh-3",
      type: "WebhookButton",
      props: { label: "Dangerous Action", webhookId: "danger", confirm: true, confirmText: "Are you sure?" },
    };
    render(<WebhookButtonSection def={def} />);
    fireEvent.click(screen.getByText("Dangerous Action"));
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    expect(screen.getByText("Confirm?")).toBeInTheDocument();
  });
});
