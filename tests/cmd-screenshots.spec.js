const { test } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const sampleData = require("../CountMyDays/js/sampleData.json");

const SCREENSHOT_DIR = path.resolve(__dirname, "..", "screenshots", "cmd");

const bw = "../shared/css/themes";
const THEME_CONFIG = {
  brite:     { css: `${bw}/brite/bootstrap.min.css`,      bsTheme: "light" },
  cerulean:  { css: `${bw}/cerulean/bootstrap.min.css`,   bsTheme: "light" },
  cosmo:     { css: `${bw}/cosmo/bootstrap.min.css`,      bsTheme: "light" },
  cyborg:    { css: `${bw}/cyborg/bootstrap.min.css`,     bsTheme: "dark" },
  darkly:    { css: `${bw}/darkly/bootstrap.min.css`,     bsTheme: "dark" },
  flatly:    { css: `${bw}/flatly/bootstrap.min.css`,     bsTheme: "light" },
  journal:   { css: `${bw}/journal/bootstrap.min.css`,    bsTheme: "light" },
  litera:    { css: `${bw}/litera/bootstrap.min.css`,     bsTheme: "light" },
  lumen:     { css: `${bw}/lumen/bootstrap.min.css`,      bsTheme: "light" },
  lux:       { css: `${bw}/lux/bootstrap.min.css`,        bsTheme: "light" },
  materia:   { css: `${bw}/materia/bootstrap.min.css`,    bsTheme: "light" },
  minty:     { css: `${bw}/minty/bootstrap.min.css`,      bsTheme: "light" },
  morph:     { css: `${bw}/morph/bootstrap.min.css`,      bsTheme: "light" },
  pulse:     { css: `${bw}/pulse/bootstrap.min.css`,      bsTheme: "light" },
  quartz:    { css: `${bw}/quartz/bootstrap.min.css`,     bsTheme: "light" },
  sandstone: { css: `${bw}/sandstone/bootstrap.min.css`,  bsTheme: "light" },
  simplex:   { css: `${bw}/simplex/bootstrap.min.css`,    bsTheme: "light" },
  sketchy:   { css: `${bw}/sketchy/bootstrap.min.css`,    bsTheme: "light" },
  slate:     { css: `${bw}/slate/bootstrap.min.css`,      bsTheme: "dark" },
  solar:     { css: `${bw}/solar/bootstrap.min.css`,      bsTheme: "dark" },
  spacelab:  { css: `${bw}/spacelab/bootstrap.min.css`,   bsTheme: "light" },
  superhero: { css: `${bw}/superhero/bootstrap.min.css`,  bsTheme: "dark" },
  united:    { css: `${bw}/united/bootstrap.min.css`,     bsTheme: "light" },
  vapor:     { css: `${bw}/vapor/bootstrap.min.css`,      bsTheme: "dark" },
  yeti:      { css: `${bw}/yeti/bootstrap.min.css`,       bsTheme: "light" },
  zephyr:    { css: `${bw}/zephyr/bootstrap.min.css`,     bsTheme: "light" }
};
const THEMES = Object.keys(THEME_CONFIG);

async function setTheme(page, themeName) {
  const config = THEME_CONFIG[themeName] || THEME_CONFIG.darkly;
  await page.evaluate(({ css, bsTheme, name }) => {
    const link = document.getElementById("bootstrap-theme-css");
    document.documentElement.setAttribute("data-bs-theme", bsTheme);
    document.documentElement.setAttribute("data-theme", name);
    if (!link) return;
    window.__themeReady = false;
    const finish = () => { window.__themeReady = true; };
    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", finish, { once: true });
    link.href = css;
  }, { css: config.css, bsTheme: config.bsTheme, name: themeName });
  try {
    await page.waitForFunction(() => window.__themeReady === true, null, { timeout: 6000 });
  } catch (e) {
    // CDN/unreachable theme: carry on and capture whatever style is present
  }
  await page.evaluate(() => {
    if (typeof applySmdVars === "function") applySmdVars();
    if (typeof renderMain === "function") renderMain();
    const imagesEditor = document.getElementById("imagesEditor");
    if (imagesEditor && !imagesEditor.classList.contains("d-none") && typeof renderImagesEditor === "function") {
      renderImagesEditor();
    }
  });
  await page.waitForTimeout(150);
}

async function screenshotAllThemes(page, fileName) {
  for (const theme of THEMES) {
    await setTheme(page, theme);
    const themeDir = path.join(SCREENSHOT_DIR, theme);
    fs.mkdirSync(themeDir, { recursive: true });
    const target = path.join(themeDir, fileName);
    try {
      await page.screenshot({ path: target, fullPage: false });
    } catch (e) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: target, fullPage: false });
    }
  }
}

test.describe("CountMyDays - Screenshots", () => {

  test.describe.configure({ timeout: 180000 });

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
    // The app shows a legacy-migration reminder modal on every startup.
    const reminder = page.locator("#smdConfirmModal");
    await reminder.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    if (await reminder.isVisible()) await reminder.getByRole("button", { name: "OK" }).click();
    await page.waitForSelector("cmd-countdown-card");
  });

  test("main view", async ({ page }) => {
    await screenshotAllThemes(page, "main-view.png");
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

  test("image picker", async ({ page }) => {
    await page.evaluate(() => {
      window.__openImagePicker(function () {});
    });
    await page.waitForTimeout(500);
    await screenshotAllThemes(page, "image-picker.png");
  });
});
