const { test } = require("@playwright/test");
const { createScreenshotAllThemes } = require("./screenshot-helpers");

const screenshotAllThemes = createScreenshotAllThemes("ffox");

test.describe("FreeFormOX - Screenshots", () => {

  test.describe.configure({ timeout: 300000 });

  test.use({
    viewport: { width: 390, height: 797 },
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    hasTouch: true,
    isMobile: true,
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/FreeFormOX/");
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("#buttonGrid button");
  });

  test("main view", async ({ page }) => {
    await screenshotAllThemes(page, "main-view.png");
  });

  test("main view mid-game", async ({ page }) => {
    await page.locator("#buttonGrid button[data-index='1']").click();
    await page.locator("#buttonGrid button[data-index='7']").click();
    await page.waitForTimeout(200);
    await screenshotAllThemes(page, "main-view-mid-game.png");
  });

  test("game over", async ({ page }) => {
    for (const idx of [1, 7, 2, 8, 3]) {
      await page.locator("#buttonGrid button[data-index='" + idx + "']").click();
    }
    await page.waitForTimeout(200);
    await screenshotAllThemes(page, "game-over.png");
  });

  test("main menu dropdown", async ({ page }) => {
    await page.locator("#btnMainMenu").click();
    await page.locator(".dropdown-menu.show").waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await screenshotAllThemes(page, "main-menu-dropdown.png");
  });

  test("settings", async ({ page }) => {
    await page.evaluate(() => openSettings());
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "settings.png");
  });
});