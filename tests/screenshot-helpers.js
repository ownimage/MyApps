const fs = require("fs");
const path = require("path");

const SCREENSHOT_MODES = ["light", "dark"];
const STYLESHEET_IDS = ["bootstrap-theme-css", "theme-override-mode", "theme-override-specific"];
const IMAGE_RE = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i;

function createScreenshotAllThemes(appId, afterTheme) {
  return async function screenshotAllThemes(page, scene) {
    // SCREENSHOT_THEME=<theme> runs one theme only (all apps); leave unset for all 26.
    const requestedTheme = process.env.SCREENSHOT_THEME;
    const allThemes = await page.evaluate(() => Object.keys(themeConfig));
    if (allThemes.length !== 26) {
      throw new Error(`Expected 26 themes, found ${allThemes.length}`);
    }
    const themes = requestedTheme
      ? (() => {
          const match = allThemes.filter((name) => name === requestedTheme);
          if (match.length === 0) {
            throw new Error(`SCREENSHOT_THEME "${requestedTheme}" is not a known theme (${allThemes.join(", ")})`);
          }
          return match;
        })()
      : allThemes;

    for (const theme of themes) {
      const themeDir = path.resolve(__dirname, "..", "screenshots", appId, theme);
      fs.mkdirSync(themeDir, { recursive: true });
      for (const entry of fs.readdirSync(themeDir)) {
        if (IMAGE_RE.test(entry)) fs.rmSync(path.join(themeDir, entry), { force: true });
      }
      for (const mode of SCREENSHOT_MODES) {
        await page.emulateMedia({ colorScheme: mode });
        await page.evaluate(async ({ theme, mode, stylesheetIds }) => {
          const preparedStylesheets = stylesheetIds.map((id) => {
            const link = document.getElementById(id);
            if (!link) throw new Error(`Missing stylesheet link: ${id}`);

            const previousHref = link.href;
            let finish;
            const ready = new Promise((resolve, reject) => {
              const cleanup = () => {
                link.removeEventListener("load", onLoad);
                link.removeEventListener("error", onError);
              };
              const onLoad = () => {
                cleanup();
                if (link.sheet) resolve();
                else reject(new Error(`Stylesheet loaded without a sheet: ${id}`));
              };
              const onError = () => {
                cleanup();
                reject(new Error(`Stylesheet failed to load: ${id}`));
              };
              finish = onLoad;
              link.addEventListener("load", onLoad, { once: true });
              link.addEventListener("error", onError, { once: true });
            });

            return { link, previousHref, ready, finish };
          });

          applyTheme(theme, mode);
          for (const stylesheet of preparedStylesheets) {
            if (stylesheet.link.href === stylesheet.previousHref && stylesheet.link.sheet) {
              stylesheet.finish();
            }
          }
          await Promise.all(preparedStylesheets.map((stylesheet) => stylesheet.ready));
        }, { theme, mode, stylesheetIds: STYLESHEET_IDS });

        await page.waitForFunction(({ theme, mode }) => {
          const root = document.documentElement;
          return root.getAttribute("data-theme") === theme && root.getAttribute("data-bs-theme") === mode;
        }, { theme, mode });

        if (afterTheme) {
          await page.evaluate(afterTheme, { theme, mode });
        }
        await page.evaluate(async () => {
          await document.fonts.ready;
          const images = new Set();
          const collectImages = (root) => {
            for (const image of root.querySelectorAll("img")) images.add(image);
            for (const element of root.querySelectorAll("*")) {
              if (element.shadowRoot) collectImages(element.shadowRoot);
            }
          };
          collectImages(document);
          const visibleImages = Array.from(images).filter((image) => {
            const style = getComputedStyle(image);
            const rect = image.getBoundingClientRect();
            return image.isConnected && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          });
          await Promise.all(visibleImages.map(async (image) => {
            if (!image.complete) {
              await new Promise((resolve, reject) => {
                image.addEventListener("load", resolve, { once: true });
                image.addEventListener("error", () => reject(new Error(`Image failed to load: ${image.currentSrc || image.src}`)), { once: true });
              });
            }
            await image.decode();
          }));
          document.documentElement.getBoundingClientRect();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });

        const modeDir = path.resolve(__dirname, "..", "screenshots", appId, theme, mode);
        fs.mkdirSync(modeDir, { recursive: true });
        const target = path.join(modeDir, scene);
        try {
          await page.screenshot({ path: target, fullPage: false });
        } catch (error) {
          await page.waitForTimeout(500);
          await page.screenshot({ path: target, fullPage: false });
        }
      }
    }
  };
}

module.exports = { createScreenshotAllThemes };
