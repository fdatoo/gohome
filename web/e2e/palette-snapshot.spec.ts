import { expect, test } from "@playwright/test";

/**
 * Snapshot test: render the command palette in default and active states.
 * Both scenarios run in friendly-dark theme.
 *
 * The test authenticates against the in-process switchyardd daemon that
 * the global-setup.ts spins up, so the CommandCatalogService returns real verbs.
 *
 * Run `task web:e2e` once to generate the reference images; subsequent runs
 * perform pixel-comparison regression detection.
 */

async function loginAs(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("username").fill("admin");
  await page.getByPlaceholder("password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for redirect away from login.
  await page.waitForURL(/\/_authed|\/dashboards/, { timeout: 15_000 });
}

test.describe("command palette snapshots", () => {
  test.beforeEach(async ({ page }) => {
    // Set friendly-dark theme before the page loads.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "sy.theme.v2",
        JSON.stringify({ language: "friendly", mode: "dark" }),
      );
    });
  });

  test("default state snapshot", async ({ page }) => {
    await loginAs(page);
    await page.goto("/_authed/home");
    await expect(page.getByTestId("shell")).toBeVisible({ timeout: 10_000 });

    // Set theme on document element.
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "friendly-dark";
    });

    // Open the palette via the TopBar button.
    await page.click('[data-testid="topbar-palette-btn"]');

    // Palette modal should be visible.
    const modal = page.getByTestId("palette-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Assert no input text in default state.
    const input = page.getByRole("textbox");
    await expect(input).toHaveValue("");

    // Take component screenshot of the palette.
    await expect(modal).toHaveScreenshot("palette/default-state.png", {
      animations: "disabled",
    });
  });

  test("active state snapshot (tail z2m)", async ({ page }) => {
    await loginAs(page);
    await page.goto("/_authed/home");
    await expect(page.getByTestId("shell")).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      document.documentElement.dataset.theme = "friendly-dark";
    });

    // Open the palette.
    await page.click('[data-testid="topbar-palette-btn"]');
    const modal = page.getByTestId("palette-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Type the query.
    const input = page.getByRole("textbox");
    await input.fill("tail z2m");

    // Wait for the resolved-as row to appear.
    await expect(page.getByTestId("palette-resolved-verb")).toBeVisible({
      timeout: 5_000,
    });

    // Take component screenshot.
    await expect(modal).toHaveScreenshot("palette/active-state-tail-z2m.png", {
      animations: "disabled",
    });
  });
});
