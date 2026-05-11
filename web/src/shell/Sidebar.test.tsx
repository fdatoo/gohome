import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import { LanguageProvider } from "../theme/language-provider";

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

function makeLsStub(): Storage {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    length: 0,
    key: () => null,
  } satisfies Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeLsStub());
  vi.stubGlobal("matchMedia", makeMatchMediaStub());
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.language;
});

describe("Sidebar", () => {
  it("marks Activity as active when currentPath is /_authed/activity", () => {
    render(<Sidebar currentPath="/_authed/activity" />);

    const nav = screen.getByRole("navigation", { name: /primary navigation/i });

    expect(nav.querySelector('[data-nav-id="activity"][data-active="true"]')).toBeInTheDocument();
    // Others should not be active
    for (const id of ["home", "rooms", "automations", "devices", "settings"]) {
      expect(nav.querySelector(`[data-nav-id="${id}"][data-active="false"]`)).toBeInTheDocument();
    }
  });

  it("shows Sign in link when no user is authenticated", () => {
    render(<Sidebar currentPath="/_authed/home" />);
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("shows all 6 primary nav items", () => {
    render(<Sidebar currentPath="/" />);
    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    for (const id of ["home", "rooms", "activity", "automations", "devices", "settings"]) {
      expect(nav.querySelector(`[data-nav-id="${id}"]`)).toBeInTheDocument();
    }
  });

  it("developer language: sidebar nav item reads 'Overview' for home", () => {
    render(
      <LanguageProvider initialLanguage="developer">
        <Sidebar currentPath="/_authed/home" />
      </LanguageProvider>,
    );
    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    const homeLink = nav.querySelector('[data-nav-id="home"]');
    expect(homeLink).toBeInTheDocument();
    expect(homeLink?.textContent).toContain("Overview");
    expect(homeLink?.textContent).not.toContain("Home");
  });

  it("developer language: sidebar nav item reads 'Events' for activity", () => {
    render(
      <LanguageProvider initialLanguage="developer">
        <Sidebar currentPath="/_authed/activity" />
      </LanguageProvider>,
    );
    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    const activityLink = nav.querySelector('[data-nav-id="activity"]');
    expect(activityLink).toBeInTheDocument();
    expect(activityLink?.textContent).toContain("Events");
  });

  it("kbd-shortcut elements are present in DOM for all six nav items", () => {
    render(
      <LanguageProvider initialLanguage="developer">
        <Sidebar currentPath="/_authed/home" />
      </LanguageProvider>,
    );
    const shortcuts = document.querySelectorAll(".kbd-shortcut");
    expect(shortcuts).toHaveLength(6);
  });
});
