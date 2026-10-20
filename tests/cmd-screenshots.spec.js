const { test } = require("@playwright/test");
const { createScreenshotAllThemes } = require("./screenshot-helpers");

const sampleData = require("../CountMyDays/js/sampleData.json");

function refreshCmdAfterTheme() {
  if (typeof renderMain === "function") renderMain();
  const imagesEditor = document.getElementById("imagesEditor");
  if (imagesEditor && !imagesEditor.classList.contains("d-none") && typeof renderImagesEditor === "function") {
    renderImagesEditor();
  }
}

const screenshotAllThemes = createScreenshotAllThemes("cmd", refreshCmdAfterTheme);

test.describe("CountMyDays - Screenshots", () => {

  test.describe.configure({ timeout: 300000 });

  test.use({
    viewport: { width: 390, height: 797 },
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    hasTouch: true,
    isMobile: true,
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/CountMyDays/");
    await page.evaluate(({ images, categories, dates }) => {
      localStorage.clear();
      localStorage.setItem("countmydays_fontSize", "normal");
      localStorage.setItem("countmydays_iconSize", "large");
      localStorage.setItem("countmydays_density", "normal");
      localStorage.setItem("shared-images", JSON.stringify(images));
      localStorage.setItem("countmydays_categories", JSON.stringify(categories));
      localStorage.setItem("countmydays_dates", JSON.stringify(dates));
    }, { images: sampleData.images, categories: sampleData.categories, dates: sampleData.dates });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("cmd-countdown-card");
  });

  test("main view", async ({ page }) => {
    await screenshotAllThemes(page, "main-view.png");
  });

  test("main menu dropdown", async ({ page }) => {
    await page.locator("#btnMainMenu").click();
    await page.locator(".dropdown-menu.show").waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await screenshotAllThemes(page, "main-menu-dropdown.png");
  });

  test("dates editor", async ({ page }) => {
    await page.evaluate(() => openDatesEditor());
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "dates-editor.png");
  });

  test("settings", async ({ page }) => {
    await page.evaluate(() => openSettings());
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "settings.png");
  });

  test("settings - g cal", async ({ page }) => {
    await page.evaluate(() => openSettings());
    await page.waitForTimeout(300);
    await page.locator("#settingsPage").getByRole("tab", { name: "G Cal" }).click();
    await page.locator("#gcalEnabled").check();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "settings-gcal.png");
  });

  test("settings - danger", async ({ page }) => {
    await page.evaluate(() => openSettings());
    await page.waitForTimeout(300);
    await page.locator("#danger-tab").click();
    await page.locator("#showDanger").check();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "settings-danger.png");
  });

  test("image picker", async ({ page }) => {
    await page.evaluate(() => {
      window.__openImagePicker(function () {});
    });
    await page.waitForTimeout(500);
    await screenshotAllThemes(page, "image-picker.png");
  });
});
