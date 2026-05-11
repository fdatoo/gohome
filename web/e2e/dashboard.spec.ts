import { expect, test } from "@playwright/test";

test("logs in with password and renders a dashboard widget", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("username").fill("admin");
  await page.getByPlaceholder("password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboards\/default$/);
  await expect(page.getByRole("heading", { name: "Dashboard: default" })).toBeVisible();
  await expect(page.getByTestId("widget-entity-toggle")).toBeVisible();
});
