import { render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AmbientRoot } from "./AmbientRoot";
import { usePrimitive } from "@/theme/primitives-provider";

function makeMatchMediaStub() {
  return (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

function makeLsStub() {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    length: 0,
    key: () => null,
  } satisfies Storage;
}

// Consumer that resolves the Surface primitive inside AmbientRoot.
function SurfaceConsumer() {
  const Surface = usePrimitive("Surface");
  return <Surface data-testid="inner-surface">content</Surface>;
}

describe("AmbientRoot", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", makeMatchMediaStub());
    vi.stubGlobal("localStorage", makeLsStub());
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.language;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.language;
  });

  it("renders data-language=ambient on its own root div, not on documentElement", () => {
    const { container } = render(
      <AmbientRoot>
        <p data-testid="child">hello</p>
      </AmbientRoot>,
    );

    // The AmbientRoot's own root element should have data-language="ambient"
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-language", "ambient");

    // documentElement must NOT have been changed by AmbientRoot
    // (it may be set by LanguageProvider to "friendly" by default, but not "ambient")
    expect(document.documentElement.dataset.language).not.toBe("ambient");

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("resolves Surface to the ambient primitive inside AmbientRoot", () => {
    render(
      <AmbientRoot>
        <SurfaceConsumer />
      </AmbientRoot>,
    );

    const surface = screen.getByTestId("inner-surface");
    expect(surface).toBeInTheDocument();
    expect(surface).toHaveAttribute("data-primitive", "ambient-surface");
  });

  it("does not render any Shell chrome (no sidebar, no topbar)", () => {
    render(
      <AmbientRoot>
        <p>ambient page content</p>
      </AmbientRoot>,
    );

    // Shell chrome elements that must NOT be present
    expect(document.querySelector('[data-testid="sidebar"]')).toBeNull();
    expect(document.querySelector('[data-testid="topbar"]')).toBeNull();
    expect(document.querySelector('[data-testid="app-rail"]')).toBeNull();
  });
});
