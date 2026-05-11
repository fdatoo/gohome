import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  describe("loading variant", () => {
    it("renders a loading message with the label", () => {
      render(<EmptyState variant="loading" label="diagnostics" />);
      expect(screen.getByText("Loading diagnostics…")).toBeInTheDocument();
    });

    it("has an aria-label for accessibility", () => {
      render(<EmptyState variant="loading" label="widget packs" />);
      expect(screen.getByLabelText("Loading widget packs")).toBeInTheDocument();
    });
  });

  describe("empty variant", () => {
    it("renders the label as a heading", () => {
      render(
        <EmptyState
          variant="empty"
          label="No widget packs installed"
          message="Install one with switchyard widget install <oci-ref>"
        />,
      );
      expect(screen.getByText("No widget packs installed")).toBeInTheDocument();
    });

    it("renders the message body", () => {
      render(
        <EmptyState
          variant="empty"
          label="No events"
          message="No events recorded yet — check the daemon log"
        />,
      );
      expect(
        screen.getByText("No events recorded yet — check the daemon log"),
      ).toBeInTheDocument();
    });

    it("does not render a sign-in link or retry button", () => {
      render(<EmptyState variant="empty" label="Empty" />);
      expect(screen.queryByText(/Sign in/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    });

    it("uses a non-error status role", () => {
      render(<EmptyState variant="empty" label="Empty state" />);
      const el = screen.getByRole("status");
      expect(el).toBeInTheDocument();
    });
  });

  describe("error-auth variant", () => {
    it("renders the label", () => {
      render(<EmptyState variant="error-auth" label="Unauthorised" />);
      expect(screen.getByText("Unauthorised")).toBeInTheDocument();
    });

    it("renders a sign-in link pointing to /login", () => {
      render(<EmptyState variant="error-auth" label="Unauthorised" />);
      const link = screen.getByRole("link", { name: /Sign in to view this/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/login");
    });

    it("does not render a Retry button", () => {
      render(<EmptyState variant="error-auth" label="Unauthorised" />);
      expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    });
  });

  describe("error-server variant", () => {
    it("renders the label", () => {
      render(<EmptyState variant="error-server" label="Service unavailable" onRetry={vi.fn()} />);
      expect(screen.getByText("Service unavailable")).toBeInTheDocument();
    });

    it("renders a Retry button that calls onRetry when clicked", () => {
      const onRetry = vi.fn();
      render(
        <EmptyState variant="error-server" label="Service unavailable" onRetry={onRetry} />,
      );
      const retryBtn = screen.getByRole("button", { name: "Retry" });
      expect(retryBtn).toBeInTheDocument();
      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledOnce();
    });

    it("does not render a sign-in link", () => {
      render(<EmptyState variant="error-server" label="Service unavailable" onRetry={vi.fn()} />);
      expect(screen.queryByRole("link", { name: /Sign in/i })).not.toBeInTheDocument();
    });

    it("renders an optional message", () => {
      render(
        <EmptyState
          variant="error-server"
          label="Failed to load"
          message="Internal server error (500)"
          onRetry={vi.fn()}
        />,
      );
      expect(screen.getByText("Internal server error (500)")).toBeInTheDocument();
    });
  });
});
