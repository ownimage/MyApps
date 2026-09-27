const { test } = require("@playwright/test");
const { createScreenshotAllThemes } = require("./screenshot-helpers");

const sampleImages = require("../shared/sampleImages.json");
const sampleLinks = require("../QRLinks/sampleLinks.json");

function refreshQrlinksAfterTheme() {
  if (typeof renderMain === "function") renderMain();
}

const screenshotAllThemes = createScreenshotAllThemes("qrlinks", refreshQrlinksAfterTheme);

test.describe("QRLinks - Screenshots", () => {

  test.describe.configure({ timeout: 300000 });

  test.use({
    viewport: { width: 390, height: 797 },
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    hasTouch: true,
    isMobile: true,
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/QRLinks/");
    await page.evaluate(({ images, links }) => {
      localStorage.clear();
      localStorage.setItem("qrlinks_fontSize", "normal");
      localStorage.setItem("qrlinks_iconSize", "large");
      localStorage.setItem("qrlinks_density", "normal");
      localStorage.setItem("shared-images", JSON.stringify(images));
      localStorage.setItem("qrlinks_links", JSON.stringify(links));
    }, { images: sampleImages.images, links: sampleLinks.streams });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("qrlink-card");
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

  test("links editor", async ({ page }) => {
    await page.evaluate(() => openLinksEditor());
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "links-editor.png");
  });

  test("settings", async ({ page }) => {
    await page.evaluate(() => openSettings());
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "settings.png");
  });

  test("QR dialog", async ({ page }) => {
    await page.locator("qrlink-card").first().locator("button.qr-btn").click();
    await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
    // smd-qrcode lazily loads qrcode.js; under the first-install SW precache
    // that can take a while, so wait for the QR itself before the theme sweep.
    await page.locator("#smdConfirmModal smd-qrcode canvas, #smdConfirmModal smd-qrcode img")
      .first().waitFor({ state: "visible", timeout: 45000 });
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "qr-dialog.png");
  });
});
