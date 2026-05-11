import { expect, test } from "@playwright/test";

test("logs in with password and redirects to pages/default", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("username").fill("admin");
  await page.getByPlaceholder("password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  // After login, redirects to /pages/default
  await expect(page).toHaveURL(/\/pages\/default$/);
});

test("visiting /dashboards/* redirects to /pages/*", async ({ page }) => {
  await page.goto("/dashboards/energy-climate");
  await expect(page).toHaveURL(/\/pages\/energy-climate$/);
});
