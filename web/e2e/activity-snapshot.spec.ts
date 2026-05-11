import { expect, test } from "@playwright/test";

/**
 * Snapshot test: render the Activity page (Stories, All Events, Saved tabs)
 * in friendly-light and friendly-dark themes.
 *
 * The test authenticates against the switchyardd daemon (which should be
 * started with SY_ACTIVITY_MOCK=1 to ensure deterministic story data).
 * When mock mode is enabled, the Stories tab is populated with synthetic
 * story cards covering all seven interestingness categories.
 *
 * Run `task web:e2e -- --update-snapshots` once to generate reference images;
 * subsequent runs perform pixel-comparison regression detection.
 *
 * Reference screenshots: web/e2e/__screenshots__/activity-snapshot/
 */

async function loginAs(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("username").fill("admin");
  await page.getByPlaceholder("password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for redirect away from login.
  await page.waitForURL(/\/_authed|\/dashboards/, { timeout: 15_000 });
}

const ACTIVITY_THEMES = ["friendly-light", "friendly-dark"] as const;

for (const theme of ACTIVITY_THEMES) {
  test.describe(`Activity page — ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => {
        const mode = t === "friendly-dark" ? "dark" : "light";
        window.localStorage.setItem(
          "sy.theme.v2",
          JSON.stringify({ language: "friendly", mode }),
        );
      }, theme);
    });

    test(`Stories tab renders correctly in ${theme}`, async ({ page }) => {
      await loginAs(page);
      await page.goto("/_authed/activity");

      // Wait for the activity page and Stories tab panel to render.
      const activityPage = page.getByTestId("activity-page");
      await expect(activityPage).toBeVisible({ timeout: 10_000 });

      const storiesTab = page.getByTestId("stories-tab");
      await expect(storiesTab).toBeVisible({ timeout: 5_000 });

      // Verify the correct theme is applied.
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      // If there are story cards, click the first one so the ContextRail is populated.
      const storyCards = page.getByTestId("story-card");
      const cardCount = await storyCards.count();
      if (cardCount > 0) {
        await storyCards.first().click();
        // Assert ContextRail is populated with a title.
        await expect(page.getByTestId("context-rail")).toBeVisible({ timeout: 3_000 });
      }

      // Take a full-page screenshot for visual regression.
      await expect(page).toHaveScreenshot(`activity-snapshot/stories-${theme}.png`, {
        fullPage: true,
        animations: "disabled",
      });
    });

    test(`All Events tab renders correctly in ${theme}`, async ({ page }) => {
      await loginAs(page);
      await page.goto("/_authed/activity");

      const activityPage = page.getByTestId("activity-page");
      await expect(activityPage).toBeVisible({ timeout: 10_000 });

      // Verify the correct theme is applied.
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      // Click "All Events" tab.
      await page.getByRole("tab", { name: "All Events" }).click();

      // Assert FacetRail is visible and Sparkline SVG is present.
      await expect(page.getByTestId("facet-rail")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("sparkline-svg")).toBeVisible({ timeout: 5_000 });

      // Take a full-page screenshot.
      await expect(page).toHaveScreenshot(`activity-snapshot/all-events-${theme}.png`, {
        fullPage: true,
        animations: "disabled",
      });
    });

    test(`Saved tab renders correctly in ${theme}`, async ({ page }) => {
      await loginAs(page);
      await page.goto("/_authed/activity");

      const activityPage = page.getByTestId("activity-page");
      await expect(activityPage).toBeVisible({ timeout: 10_000 });

      // Verify the correct theme is applied.
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      // Click "Saved" tab.
      await page.getByRole("tab", { name: "Saved" }).click();

      // Assert the "Save current query" button is visible.
      await expect(page.getByTestId("save-current-query-btn")).toBeVisible({ timeout: 5_000 });

      // Take a full-page screenshot.
      await expect(page).toHaveScreenshot(`activity-snapshot/saved-${theme}.png`, {
        fullPage: true,
        animations: "disabled",
      });
    });
  });
}
