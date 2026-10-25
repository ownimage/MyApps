const fs = require("fs");
const path = require("path");

const SCREENSHOT_MODES = ["light", "dark"];
const STYLESHEET_IDS = ["bootstrap-theme-css", "theme-override-mode", "theme-override-specific"];
const IMAGE_RE = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i;

// A syntactically valid but fake Azure client ID: the screenshot suites must
// never reach Microsoft, so the OneDrive Graph calls are stubbed in the page.
const SCREENSHOT_ONEDRIVE_CLIENT_ID = "11111111-2222-3333-4444-555555555555";

// Seed the shared OneDrive settings (client ID, signed-in account, per-app
// Enable + Directory) so the FileSync > OneDrive settings tab and the hamburger
// entries have something to show. `prefix` is the app's SmdConfig.storagePrefix.
function seedOneDriveSettings(page, options) {
  return page.evaluate((opts) => {
    localStorage.setItem("smd_onedrive_clientId", opts.clientId);
    localStorage.setItem("smd_onedrive_account", "designer@example.com");
    localStorage.setItem(opts.prefix + "onedrive_enabled", "true");
    localStorage.setItem(opts.prefix + "onedrive_directory", opts.directory);
    if (opts.minio) localStorage.setItem(opts.prefix + "minio_enabled", "true");
    // Opening FileSync > OneDrive asks MSAL for the cached account, and a real
    // (unregistered) client ID would come back with none and clear the seeded
    // name. Stub it so the settings screenshot shows a signed-in account.
    window.oneDriveInit = function () {
      return Promise.resolve({ username: "designer@example.com" });
    };
  }, {
    prefix: options.prefix,
    directory: options.directory,
    minio: options.minio !== false,
    clientId: SCREENSHOT_ONEDRIVE_CLIENT_ID
  });
}

// Stub every Microsoft call the Open-from-OneDrive page makes. `latestName` is
// the app's date-stamped backup name (planmydays-YYYYMMDDHHMM.json, or
// story-YYYYMMDDHHMM.json for Storyboard), used for the top-of-directory
// ":latest" shortcut and for each subfolder's shortcut.
function stubOneDriveBrowser(page, options) {
  return page.evaluate((opts) => {
    window.oneDriveInit = function () {
      return Promise.resolve({ username: "designer@example.com" });
    };
    window.oneDriveListFolder = function (path) {
      return Promise.resolve({
        folders: (opts.folderNames || []).map(function (name) {
          return { name: name, path: path + "/" + name };
        }),
        files: [{
          name: opts.latestName,
          key: opts.directory + "/" + opts.latestName,
          lastModified: "2026-10-25T09:30:00Z"
        }]
      });
    };
    window.oneDriveLatestJson = function (path) {
      var isEmpty = (opts.noBackupFolders || []).some(function (name) {
        return path.indexOf("/" + name) >= 0;
      });
      if (isEmpty) return Promise.resolve(null);
      return Promise.resolve({
        name: opts.latestName,
        key: path + "/" + opts.latestName,
        lastModified: "2026-10-25T08:15:00Z"
      });
    };
  }, {
    directory: options.directory,
    latestName: options.latestName,
    folderNames: options.folderNames || ["Backups", "Older"],
    noBackupFolders: options.noBackupFolders || []
  });
}

function createScreenshotAllThemes(appId, afterTheme) {
  return async function screenshotAllThemes(page, scene, callOptions) {
    // beforeCapture(page, { theme, mode }) runs in Node AFTER the theme/mode has
    // been applied and settled, immediately BEFORE the image-wait + screenshot.
    // Needed for scenes that depend on POINTER state (e.g. :hover): the mouse is
    // placed once before the theme loop, so as each theme re-lays-out the page
    // the pointer no longer sits over the target and the hover is silently lost
    // (different themes ship different Bootstrap padding, so item rects differ).
    const beforeCapture = callOptions && callOptions.beforeCapture;
    // SCREENSHOT_THEME=<theme> runs one theme only (all apps); leave unset for all 27.
    const requestedTheme = process.env.SCREENSHOT_THEME;
    const allThemes = await page.evaluate(() => Object.keys(themeConfig));
    if (allThemes.length !== 27) {
      throw new Error(`Expected 27 themes, found ${allThemes.length}`);
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
        if (beforeCapture) {
          await beforeCapture(page, { theme, mode });
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
            // <smd-image> clears and re-resolves its themed src on EVERY
            // applyTheme(), so a visible img can transiently hold an empty src, or
            // one that is being swapped mid-decode. Wait (up to 3s, polling)
            // for a src that actually decodes, retrying because the src can change
            // under us; a persistently undecodable image is IGNORED rather than
            // aborting the whole screenshot. (This raced as
            // `EncodingError: The source image cannot be decoded` on the Launch
            // Menu tab's image tiles.)
            for (let attempt = 0; attempt < 60; attempt++) {
              const hasSrc = !!(image.currentSrc || image.getAttribute("src"));
              if (hasSrc && image.complete) {
                try { await image.decode(); return; }
                catch (e) { /* src swapped / still re-resolving — retry */ }
              }
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
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

module.exports = { createScreenshotAllThemes, seedOneDriveSettings, stubOneDriveBrowser };
