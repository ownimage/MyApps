const { test } = require("@playwright/test");
const { createScreenshotAllThemes } = require("./screenshot-helpers");

const screenshotAllThemes = createScreenshotAllThemes("launch");

test.describe("Launch - Screenshots", () => {

  test.describe.configure({ timeout: 300000 });

  test.use({
    viewport: { width: 390, height: 797 },
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    hasTouch: true,
    isMobile: true,
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#appGrid .app-tile");
  });

  test("app grid", async ({ page }) => {
    await screenshotAllThemes(page, "app-grid.png");
  });

  test("settings", async ({ page }) => {
    await page.evaluate(() => openSettings());
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "settings.png");
  });

  test("main menu dropdown", async ({ page }) => {
    await page.locator("#btnMainMenu").click();
    await page.locator(".dropdown-menu.show").waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await screenshotAllThemes(page, "main-menu-dropdown.png");
  });
});
