const { test, expect } = require("@playwright/test");

test.describe("Plan My Day", () => {
  test("page loads with date heading", async ({ page }) => {
    await page.goto("/PlanMyDay/");

    const heading = page.locator("h2").first();
    await expect(heading).toBeVisible();
    await expect(heading).not.toBeEmpty();
  });

  test("settings page opens and shows theme selector", async ({ page }) => {
    await page.goto("/PlanMyDay/");

    await page.locator("#btnMainMenu").click();

    await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
    await expect(page.locator("#settingsPage")).toBeVisible();
    await page.locator("smd-tabs#settingsTabs .smd-tab-btn", { hasText: "Display" }).click();
    await expect(page.locator("#themeSelector")).toBeVisible();
  });

  test("can toggle split list setting", async ({ page }) => {
    await page.goto("/PlanMyDay/");

    await page.locator("#btnMainMenu").click();

    await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
    const toggle = page.locator("#splitList");
    await toggle.check();
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
  });
});
