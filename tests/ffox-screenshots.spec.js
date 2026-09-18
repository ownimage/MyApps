const { test } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const SCREENSHOT_DIR = path.resolve(__dirname, "..", "screenshots", "ffox");

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
  const config = THEME_CONFIG[themeName] || THEME_CONFIG.superhero;
  await page.evaluate(({ css, bsTheme, name, modeCss, specCss }) => {
    const link = document.getElementById("bootstrap-theme-css");
    document.documentElement.setAttribute("data-bs-theme", bsTheme);
    document.documentElement.setAttribute("data-theme", name);
    if (!link) return;
    // Mirror applyTheme(): swap the light/dark + per-theme override stylesheets.
    const modeLink = document.getElementById("theme-override-mode");
    if (modeLink) modeLink.href = modeCss;
    const specLink = document.getElementById("theme-override-specific");
    if (specLink) specLink.href = specCss;
    window.__themeReady = false;
    const finish = () => { window.__themeReady = true; };
    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", finish, { once: true });
    link.href = css;
  }, { css: config.css, bsTheme: config.bsTheme, name: themeName, modeCss: `${bw}/${config.bsTheme}.css`, specCss: `${bw}/${themeName}/${themeName}.css` });
  try {
    await page.waitForFunction(() => window.__themeReady === true, null, { timeout: 6000 });
  } catch (e) {
    // unreachable theme: carry on and capture whatever style is present
  }
  await page.evaluate(() => {
    if (typeof applySmdVars === "function") applySmdVars();
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

test.describe("FreeFormOX - Screenshots", () => {

  test.describe.configure({ timeout: 180000 });

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