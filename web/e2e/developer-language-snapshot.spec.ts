import { test, expect } from "@playwright/test";

/**
 * Cross-language snapshot: render the Home page in all four language/theme
 * combinations and take full-page screenshots for visual regression detection.
 *
 * Reference images are committed under
 * web/e2e/__screenshots__/developer-language-snapshot/.
 */

const languages = [
  { id: "friendly-light", language: "friendly", mode: "light" as const },
  { id: "friendly-dark", language: "friendly", mode: "dark" as const },
  { id: "ambient", language: "ambient", mode: null },
  { id: "developer", language: "developer", mode: null },
] as const;

for (const { id, language, mode } of languages) {
  test(`Home renders correctly in ${id}`, async ({ page }) => {
    // Inject language/mode preference into localStorage before the page loads
    await page.addInitScript(
      ({ language, mode }) => {
        const value = mode ? { language, mode } : { language };
        window.localStorage.setItem("sy.theme.v2", JSON.stringify(value));
      },
      { language, mode },
    );

    await page.goto("/_authed/home");

    // Wait for content to be visible
    await page.waitForLoadState("networkidle");

    // Take a full-page screenshot for visual regression
    await expect(page).toHaveScreenshot(
      `home-cross-language/home-${id}.png`,
      {
        fullPage: true,
        animations: "disabled",
        threshold: 0.02,
      },
    );
  });
}
