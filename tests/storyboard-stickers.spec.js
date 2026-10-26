const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// Storyboard - the Stickers fly-out's OneDrive tabs.
//
// With OneDrive enabled AND signed in the panel shows three tabs:
//   Standard - the five built-in SVG stickers (unchanged)
//   Library  - images from <Directory>/Stickers
//   Board    - images from <Directory>/<story name>/Stickers
// A tab is shown only when its folder exists, so a Storyboard with no OneDrive
// (or a signed-out one) keeps exactly the old single list.
//
// Every Microsoft call is stubbed at the page level (oneDriveListFolder /
// oneDriveDownloadBlob / oneDrivePutFile / oneDriveInit), so the suite needs no
// Azure app registration, Microsoft account or internet access. The stickers
// are cached in Cache Storage, so the same suite also proves the offline path.

const DIR = "MyApps/Storyboard";
const STORY_NAME = "My Story";
const LIB_FOLDER = DIR + "/Stickers";
const BOARD_FOLDER = DIR + "/" + STORY_NAME + "/Stickers";

// Two real PNGs (64x64 red, 48x80 blue).
const PNG_1 = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAvElEQVR4nOXOMQEAMAzAoMipfz31ssng6MFPO/MuSwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7QPRuyx/1aAaEoAAAAASUVORK5CYII=";
const PNG_2 = "iVBORw0KGgoAAAANSUhEUgAAADAAAABQCAYAAABf9vbdAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAw0lEQVRoge2TQQ0DUBSDnhwkInZeNhnkZz30Xkh7+Pm+nKsLMAB7i2xC9ibZiX0zVxdgAPYW2YTsTbIT+2auLsAA7C2yCdmbZCf2zVxdgAHYW2QTsjfJTuybuboAA7C3yCZkb5Kd2DdzdQEGYG+RTcjeJDuxb+bqAgzA3iKbkL1JdmLfzNUFGIC9RTYhe5PsxL6ZqwswAHuLbEL2JtmJfTNXF2AA9hbZhOxNshP7Zq4uwADsLbIJ2ZtkJ/bNXF2Afwf4AXG+Nyw0iM5ZAAAAAElFTkSuQmCC";

const SCENE = {
  id: "sticker-scene",
  name: "Scene 1",
  background: "space",
  items: [],
  connectors: [],
  groups: [],
  view: { zoom: 1, fx: 0.5, fy: 0.5 }
};
const STORY = {
  id: "sticker-story",
  name: STORY_NAME,
  scenes: [SCENE],
  activeSceneId: SCENE.id
};

// Seed the story + the shared OneDrive settings from the Launch page (reloading
// the Storyboard page would overwrite the seeded value via its pagehide save).
async function seedPanel(page, options) {
  const opts = options || {};
  await page.goto("/");
  await page.evaluate((o) => {
    localStorage.setItem("storyboard_stories", JSON.stringify([o.story]));
    localStorage.setItem("storyboard_activeStory", o.story.id);
    localStorage.setItem("storyboard_activeScene", o.story.activeSceneId);
    localStorage.setItem("smd_onedrive_clientId", "11111111-2222-3333-4444-555555555555");
    if (o.signedIn) localStorage.setItem("smd_onedrive_account", "designer@example.com");
    else localStorage.removeItem("smd_onedrive_account");
    localStorage.setItem("storyboard_onedrive_enabled", o.enabled ? "true" : "false");
    localStorage.setItem("storyboard_onedrive_directory", o.directory || "MyApps/Storyboard");
  }, {
    story: opts.story || STORY,
    signedIn: opts.signedIn !== false,
    enabled: opts.enabled !== false,
    directory: opts.directory
  });
  await page.goto("/Storyboard/");
  await expect(page.locator("#sbCanvas")).toBeVisible();
}

// Stub the OneDrive surface the sticker library uses.
//
// `folders` maps a folder path to its image file names (a missing path rejects
// with 404, which is how the app decides whether the tab exists). The stubs read
// MUTABLE globals, so a test can change a file's eTag/bytes and then trigger a
// refresh - that is how "edit the PNG on disk and watch the board update" is
// exercised. `installStickerStubs` is also usable from page.addInitScript, which
// is how the boot-refresh test seeds the state BEFORE the app starts.
function stickerStubState(options) {
  const opts = options || {};
  return {
    folders: opts.folders || {},
    etags: opts.etags || {},
    bytes: opts.bytes || {},
    defaultBytes: opts.defaultBytes || PNG_1,
    failing: opts.failing === true
  };
}

/* eslint-disable no-undef */
function installStickerStubs(state) {
  function install() {
    window.__stickerFiles = state.folders;
    window.__stickerEtags = state.etags;
    window.__stickerBytes = state.bytes;
    window.__stickerDefaultBytes = state.defaultBytes;
    window.__stickerFail = state.failing;
    if (!window.__downloads) window.__downloads = [];

    window.oneDriveInit = function () {
      return Promise.resolve({ username: "designer@example.com" });
    };
    window.oneDriveListFolder = function (path) {
      if (window.__stickerFail) return Promise.reject(new Error("Failed to fetch"));
      var names = window.__stickerFiles[path];
      if (!names) {
        var missing = new Error("Not found");
        missing.status = 404;
        return Promise.reject(missing);
      }
      return Promise.resolve({
        folders: [],
        files: names.map(function (name, index) {
          var key = path + "/" + name;
          return {
            name: name,
            key: key,
            id: "item-" + path + "-" + index,
            eTag: window.__stickerEtags[key] || "{v1}",
            size: 300,
            lastModified: window.__stickerEtags[key] || "2026-10-25T09:00:00Z"
          };
        })
      });
    };
    window.oneDriveDownloadBlob = function (path) {
      window.__downloads.push(path);
      var base64 = window.__stickerBytes[path] || window.__stickerDefaultBytes;
      var bytes = Uint8Array.from(atob(base64), function (c) { return c.charCodeAt(0); });
      return Promise.resolve(new Blob([bytes], { type: "image/png" }));
    };
  }

  install();
  // Through page.addInitScript the stubs are installed BEFORE smd-onedrive.js
  // parses, and its global `function oneDriveListFolder(){}` declarations would
  // overwrite them. Re-install first thing at DOMContentLoaded (capture runs
  // before the app's own boot listener), so the startup refresh sees the stubs.
  window.addEventListener("DOMContentLoaded", install, true);
}
/* eslint-enable no-undef */

async function stubStickerFolders(page, folders, options) {
  await page.evaluate(installStickerStubs, stickerStubState(Object.assign({}, options, { folders })));
}

// Point one folder file at new bytes + a new eTag (what saving the PNG again
// looks like through Graph).
async function changeStickerFile(page, filePath, etag, base64) {
  await page.evaluate(({ filePath: p, etag: tag, base64: bytes }) => {
    window.__stickerEtags[p] = tag;
    window.__stickerBytes[p] = bytes;
  }, { filePath, etag, base64 });
}

// Byte length of the image the board is currently painting (a blob: URL), which
// proves WHICH artwork is on screen without depending on the blob URL string.
async function boardStickerByteLength(page, selector) {
  return page.evaluate(async (sel) => {
    const img = document.querySelector(sel || "#sbItems .sb-object-sticker img.sb-sticker");
    if (!img) return -1;
    const response = await fetch(img.src);
    return (await response.arrayBuffer()).byteLength;
  }, selector);
}

// Place the single sticker of a one-file Library folder on the active scene.
async function placeLibrarySticker(page) {
  await openStickerPanel(page);
  await page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
  await expect(page.locator(TILES)).toHaveCount(1);
  await page.locator(TILE_BUTTONS).click();
  await expect(page.locator('#sbItems .sb-object-sticker img.sb-sticker')).toHaveCount(1);
}

const PNG_1_BYTES = Buffer.from(PNG_1, "base64").length;
const PNG_2_BYTES = Buffer.from(PNG_2, "base64").length;

async function openStickerPanel(page) {
  await page.locator('#sbToolbar [data-tool="stickers"]').click();
  await expect(page.locator("#sbPanelBody")).toBeVisible();
}

const STANDARD_NAMES = ["Mermaid", "Shark", "Seaweed", "Spaceman", "Spaceship"];

// The three galleries all live in the panel DOM (hidden panels included), so
// assertions target the ACTIVE tab's tiles - or the single gallery directly in
// the panel body when there are no tabs.
const ACTIVE_TILES = "#sbStickerTabs > .smd-tab-panel.active sb-sticker";
const PLAIN_TILES = "#sbPanelBody > sb-sticker-gallery sb-sticker";
const TILES = ACTIVE_TILES + ", " + PLAIN_TILES;
const TILE_LABELS = ACTIVE_TILES + " .sb-sticker-option span, " + PLAIN_TILES + " .sb-sticker-option span";
const TILE_IMAGES = ACTIVE_TILES + " .sb-sticker-option img, " + PLAIN_TILES + " .sb-sticker-option img";
const TILE_BUTTONS = ACTIVE_TILES + " .sb-sticker-option, " + PLAIN_TILES + " .sb-sticker-option";

test.describe("Storyboard - Stickers library", () => {
  test("with OneDrive off the panel is unchanged (no tabs, five standard stickers)", async ({ page }) => {
    await seedPanel(page, { enabled: false });
    await openStickerPanel(page);

    await expect(page.locator("#sbStickerTabs")).toHaveCount(0);
    await expect(page.locator("#sbPanelBody sb-sticker-gallery")).toHaveCount(1);
    await expect(page.locator(TILES)).toHaveCount(5);
    await expect(page.locator(TILE_LABELS)).toHaveText(STANDARD_NAMES);
  });

  test("Standard, Library and Board tabs list their own images", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, {
      [LIB_FOLDER]: ["shark.png", "boat.jpg", "notes.txt"],
      [BOARD_FOLDER]: ["rocket.png"]
    });
    await openStickerPanel(page);

    const tabs = page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn");
    await expect(tabs).toHaveText(["Standard", "Library", "Board"]);
    // Standard is the panel's default tab.
    await expect(page.locator(TILE_LABELS)).toHaveText(STANDARD_NAMES);

    await tabs.filter({ hasText: "Library" }).click();
    await expect(page.locator(TILE_LABELS)).toHaveText(["shark", "boat"]);
    // Only images are listed (notes.txt is filtered out) and each shows its file name.
    await expect(page.locator(TILE_IMAGES).first())
      .toHaveAttribute("src", /^blob:/);

    await tabs.filter({ hasText: "Board" }).click();
    await expect(page.locator(TILE_LABELS)).toHaveText(["rocket"]);
  });

  test("a folder that does not exist hides its tab", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, { [LIB_FOLDER]: ["shark.png"] });
    await openStickerPanel(page);

    await expect(page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn")).toHaveText(["Standard", "Library"]);
  });

  test("only the Board folder shows Standard and Board", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, { [BOARD_FOLDER]: ["rocket.png"] });
    await openStickerPanel(page);

    await expect(page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn")).toHaveText(["Standard", "Board"]);
  });

  test("neither folder means no tabs at all", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, {});
    await openStickerPanel(page);

    await expect(page.locator("#sbStickerTabs .smd-tab-btn")).toHaveCount(0);
    await expect(page.locator(TILES)).toHaveCount(5);
  });

  test("enabled but signed out shows only the standard stickers", async ({ page }) => {
    await seedPanel(page, { signedIn: false });
    await stubStickerFolders(page, {
      [LIB_FOLDER]: ["shark.png"],
      [BOARD_FOLDER]: ["rocket.png"]
    });
    await openStickerPanel(page);

    await expect(page.locator("#sbStickerTabs .smd-tab-btn")).toHaveCount(0);
    await expect(page.locator(TILES)).toHaveCount(5);
    // No OneDrive listing was attempted while signed out.
    expect(await page.evaluate(() => window.__downloads.length)).toBe(0);
  });

  test("only the tab that is opened downloads its images", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, {
      [LIB_FOLDER]: ["shark.png", "boat.jpg"],
      [BOARD_FOLDER]: ["rocket.png"]
    });
    await openStickerPanel(page);
    await expect(page.locator("#sbStickerTabs .smd-tab-btn")).toHaveCount(3);

    // Standard is active: nothing has been fetched yet.
    expect(await page.evaluate(() => window.__downloads)).toEqual([]);

    await page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
    await expect(page.locator(TILES)).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => window.__downloads.slice().sort()))
      .toEqual([LIB_FOLDER + "/boat.jpg", LIB_FOLDER + "/shark.png"]);
  });

  test("clicking a library sticker places it on the active scene", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, { [LIB_FOLDER]: ["shark.png"] });
    await openStickerPanel(page);
    await page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
    await expect(page.locator(TILES)).toHaveCount(1);

    await page.locator(TILE_BUTTONS).click();

    await expect(page.locator('#sbItems .sb-object-sticker img.sb-sticker')).toHaveCount(1);
    await expect(page.locator('#sbItems .sb-object-sticker img.sb-sticker')).toHaveAttribute("src", /^blob:/);
    const item = await page.evaluate(() => sbActiveBoard().items[0]);
    expect(item.type).toBe("sticker");
    expect(item.sticker).toMatch(/^od:/);
    expect(item.stickerName).toBe("shark.png");
  });

  test("cached stickers still show when OneDrive cannot be reached", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, {
      [LIB_FOLDER]: ["shark.png", "boat.jpg"],
      [BOARD_FOLDER]: ["rocket.png"]
    });
    await openStickerPanel(page);
    await page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
    await expect(page.locator(TILES)).toHaveCount(2);
    await expect(page.locator(TILE_IMAGES).first()).toHaveAttribute("src", /^blob:/);

    // Reload WITHOUT OneDrive: the listing fails and every download would fail.
    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await stubStickerFolders(page, {}, { failing: true });
    await openStickerPanel(page);

    await expect(page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn")).toHaveText(["Standard", "Library", "Board"]);
    await page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
    await expect(page.locator(TILES)).toHaveCount(2);
    await expect(page.locator(TILE_IMAGES).first()).toHaveAttribute("src", /^blob:/);
    expect(await page.evaluate(() => window.__downloads)).toEqual([]);
  });

  test("a saved scene shows its library stickers after a reload without opening the tab", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, { [LIB_FOLDER]: ["shark.png"] });
    await openStickerPanel(page);
    await page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
    await expect(page.locator(TILES)).toHaveCount(1);
    await page.locator(TILE_BUTTONS).click();
    await expect(page.locator('#sbItems .sb-object-sticker img.sb-sticker')).toHaveAttribute("src", /^blob:/);

    // Reload with OneDrive unreachable AND the panel never opened: the board must
    // still paint the sticker from the cache.
    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await stubStickerFolders(page, {}, { failing: true });
    await expect(page.locator('#sbItems .sb-object-sticker img.sb-sticker')).toHaveAttribute("src", /^blob:/);
    expect(await page.evaluate(() => window.__downloads)).toEqual([]);
  });

  test("saving the PNG again updates the board without a reload", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, { [LIB_FOLDER]: ["shark.png"] });
    await placeLibrarySticker(page);
    expect(await boardStickerByteLength(page)).toBe(PNG_1_BYTES);

    // Re-saving shark.png on disk keeps the item (same id) but changes its bytes.
    await changeStickerFile(page, LIB_FOLDER + "/shark.png", "{v2}", PNG_2);
    await page.evaluate(() => sbStickerRefreshFolders(true));

    await expect.poll(() => boardStickerByteLength(page)).toBe(PNG_2_BYTES);
  });

  test("refreshing an unchanged folder keeps the cached artwork", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, { [LIB_FOLDER]: ["shark.png"] });
    await placeLibrarySticker(page);
    const downloadsBefore = await page.evaluate(() => window.__downloads.length);
    const srcBefore = await page.evaluate(() => document.querySelector("#sbItems .sb-object-sticker img.sb-sticker").src);

    await page.evaluate(() => sbStickerRefreshFolders(true));
    await page.waitForTimeout(400);

    expect(await page.evaluate(() => window.__downloads.length)).toBe(downloadsBefore);
    expect(await page.evaluate(() => document.querySelector("#sbItems .sb-object-sticker img.sb-sticker").src)).toBe(srcBefore);
    expect(await boardStickerByteLength(page)).toBe(PNG_1_BYTES);
  });

  test("a reload picks up changed sticker bytes without opening the panel", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, { [LIB_FOLDER]: ["shark.png"] });
    await placeLibrarySticker(page);
    expect(await boardStickerByteLength(page)).toBe(PNG_1_BYTES);

    // Replace the file, then reload with the stubs in place BEFORE the app boots:
    // the startup refresh must notice the new eTag and repaint the scene.
    await page.addInitScript(installStickerStubs, stickerStubState({
      folders: { [LIB_FOLDER]: ["shark.png"] },
      etags: { [LIB_FOLDER + "/shark.png"]: "{v2}" },
      bytes: { [LIB_FOLDER + "/shark.png"]: PNG_2 }
    }));
    await page.reload();
    await expect(page.locator('#sbItems .sb-object-sticker img.sb-sticker')).toHaveCount(1);
    await expect.poll(() => boardStickerByteLength(page)).toBe(PNG_2_BYTES);
    // Proves the artwork came from the startup refresh, not from opening the tabs.
    await expect(page.locator("#sbPanelBody sb-sticker")).toHaveCount(0);
  });

  test("returning to the tab refreshes artwork changed on disk", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, { [LIB_FOLDER]: ["shark.png"] });
    await placeLibrarySticker(page);
    expect(await boardStickerByteLength(page)).toBe(PNG_1_BYTES);

    await changeStickerFile(page, LIB_FOLDER + "/shark.png", "{v3}", PNG_2);
    await page.evaluate(() => {
      SB_STICKER_FOCUS_GUARD_MS = 0;
      window.dispatchEvent(new Event("focus"));
    });

    await expect.poll(() => boardStickerByteLength(page)).toBe(PNG_2_BYTES);
  });

  test("a sticker library that cannot be read explains why instead of vanishing", async ({ page }) => {
    await seedPanel(page);
    await page.evaluate(() => {
      window.__downloads = [];
      window.oneDriveInit = function () { return Promise.resolve({ username: "designer@example.com" }); };
      window.oneDriveListFolder = function () {
        var err = new Error("OneDrive sign-in expired. Sign in again from Settings > FileSync > OneDrive.");
        err.code = "sign_in_required";
        return Promise.reject(err);
      };
    });
    await openStickerPanel(page);

    const status = page.locator("#sbPanelBody .sb-sticker-status");
    await expect(status).toBeVisible();
    await expect(status).toContainText("sign-in has expired");
    // It names the folders it tried, so the user can compare with OneDrive.
    await expect(status).toContainText(DIR + "/Stickers");
    await expect(status).toContainText(DIR + "/" + STORY_NAME + "/Stickers");
    await expect(page.locator("#sbStickerTabs .smd-tab-btn")).toHaveCount(0);
  });

  test("a folder that simply does not exist shows no error", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, {});
    await openStickerPanel(page);
    await expect(page.locator("#sbPanelBody .sb-sticker-status")).toHaveCount(0);
    await expect(page.locator("#sbPanelBody sb-sticker")).toHaveCount(5);
  });

  test("Retry re-lists the folders and shows the tabs once OneDrive answers", async ({ page }) => {
    await seedPanel(page);
    await page.evaluate(() => {
      window.__downloads = [];
      window.oneDriveInit = function () { return Promise.resolve({ username: "designer@example.com" }); };
      window.oneDriveListFolder = function (path) {
        if (!window.__stickerRecovered) return Promise.reject(new Error("Failed to fetch"));
        var names = path === "MyApps/Storyboard/Stickers" ? ["shark.png"] : null;
        if (!names) { var e = new Error("Not found"); e.status = 404; return Promise.reject(e); }
        return Promise.resolve({ folders: [], files: names.map(function (n, i) {
          return { name: n, key: path + "/" + n, id: "item-" + i, eTag: "{v1}", size: 300, lastModified: "" };
        }) });
      };
      window.oneDriveDownloadBlob = function () {
        return Promise.resolve(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
      };
    });
    await openStickerPanel(page);
    await expect(page.locator("#sbPanelBody .sb-sticker-status")).toContainText("Cannot reach OneDrive");

    await page.evaluate(() => { window.__stickerRecovered = true; });
    await page.locator("#sbPanelBody .sb-sticker-status button").click();
    await expect(page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn")).toHaveText(["Standard", "Library"]);
    await expect(page.locator("#sbPanelBody .sb-sticker-status")).toHaveCount(0);
  });

  test("sbStickerDebug reports the resolved folders and any error", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, { [LIB_FOLDER]: ["shark.png"] });
    await openStickerPanel(page);
    const info = await page.evaluate(() => sbStickerDebug());
    expect(info.enabled).toBe(true);
    expect(info.signedIn).toBe(true);
    expect(info.directory).toBe(DIR);
    expect(info.paths.library).toBe(LIB_FOLDER);
    expect(info.paths.board).toBe(BOARD_FOLDER);
    expect(info.story).toBe(STORY_NAME);
    expect(info.tabs).toEqual(["standard", "library"]);
    expect(info.library.count).toBe(1);
  });

  test("an expired sign-in offers a Sign in button that re-lists afterwards", async ({ page }) => {
    await seedPanel(page);
    await page.evaluate(() => {
      window.__downloads = [];
      window.__stickerSignedIn = false;
      window.oneDriveInit = function () { return Promise.resolve({ username: "designer@example.com" }); };
      window.oneDriveListFolder = function (path) {
        if (!window.__stickerSignedIn) {
          var err = new Error("OneDrive sign-in expired.");
          err.code = "sign_in_required";
          return Promise.reject(err);
        }
        var names = path === "MyApps/Storyboard/Stickers" ? ["shark.png"] : null;
        if (!names) { var e = new Error("Not found"); e.status = 404; return Promise.reject(e); }
        return Promise.resolve({ folders: [], files: names.map(function (n, i) {
          return { name: n, key: path + "/" + n, id: "item-" + i, eTag: "{v1}", size: 300, lastModified: "" };
        }) });
      };
      window.signInToOneDrive = function () {
        window.__stickerSignedIn = true;
        return Promise.resolve("designer@example.com");
      };
    });
    await openStickerPanel(page);
    const status = page.locator("#sbPanelBody .sb-sticker-status");
    await expect(status).toContainText("sign-in has expired");

    // Signing in from the panel re-lists and reveals the library.
    await status.locator(".sb-sticker-signin").click();
    await expect(page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn")).toHaveText(["Standard", "Library"]);
    await expect(page.locator("#sbPanelBody .sb-sticker-status")).toHaveCount(0);
  });

  test("the status names the underlying Microsoft reason when there is one", async ({ page }) => {
    await seedPanel(page);
    await page.evaluate(() => {
      window.oneDriveInit = function () { return Promise.resolve({ username: "designer@example.com" }); };
      window.oneDriveListFolder = function () {
        var err = new Error("OneDrive sign-in expired.");
        err.code = "sign_in_required";
        err.authError = { errorCode: "consent_required" };
        return Promise.reject(err);
      };
    });
    await openStickerPanel(page);
    await expect(page.locator("#sbPanelBody .sb-sticker-status")).toContainText("consent_required");
  });

  test("a story backup embeds each used sticker once", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, { [LIB_FOLDER]: ["shark.png"] });
    await page.evaluate(() => { window.__put = null; window.oneDrivePutFile = function (key, text) { window.__put = { key: key, body: text }; return Promise.resolve({}); }; });
    await openStickerPanel(page);
    await page.locator("#sbStickerTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
    await expect(page.locator(TILES)).toHaveCount(1);

    // Two placements of the SAME sticker must still embed one copy of the bytes.
    await page.locator(TILE_BUTTONS).click();
    await page.locator(TILE_BUTTONS).click();
    await expect(page.locator("#sbItems .sb-object-sticker")).toHaveCount(2);

    await page.evaluate(() => saveToOneDrive());
    await expect.poll(() => page.evaluate(() => !!window.__put)).toBe(true);

    const saved = await page.evaluate(() => ({
      key: window.__put.key,
      payload: JSON.parse(window.__put.body)
    }));

    const items = saved.payload.story.scenes[0].items;
    expect(items).toHaveLength(2);
    expect(items[0].sticker).toBe(items[1].sticker);
    expect(Object.keys(saved.payload.stickers)).toEqual([items[0].sticker]);
    expect(saved.payload.stickers[items[0].sticker].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(saved.payload.stickers[items[0].sticker].dataUrl.length).toBeGreaterThan(100);
    expect(saved.key.startsWith(DIR + "/")).toBe(true);
    expect(saved.key).toMatch(/\/My Story\/story-\d{12}\.json$/);
  });

  test("loading a backup restores its sticker bytes without OneDrive", async ({ page }) => {
    await seedPanel(page);
    await stubStickerFolders(page, {}, { failing: true });

    const imported = await page.evaluate(({ png, dir }) => {
      var id = "od:1234567890abcdef";
      var payload = {
        version: 1,
        app: "storyboard",
        exportedAt: "2026-10-25T09:00:00.000Z",
        story: {
          id: "saved-story",
          name: "Library Story",
          scenes: [{
            id: "saved-scene",
            name: "Scene 1",
            background: "space",
            items: [{ id: "saved-item", type: "sticker", sticker: id, stickerName: "rocket.png", x: 50, y: 50, scale: 1, rotation: 0, z: 1 }],
            connectors: [],
            groups: [],
            view: { zoom: 1, fx: 0.5, fy: 0.5 }
          }],
          activeSceneId: "saved-scene"
        },
        stickers: {}
      };
      payload.stickers[id] = { name: "rocket", fileName: "rocket.png", dataUrl: "data:image/png;base64," + png };
      var accepted = SmdConfig.onFileSyncImport("onedrive", payload, dir + "/Library Story/story-202610250900.json");
      return { accepted: accepted, id: id };
    }, { png: PNG_1, dir: DIR });

    expect(imported.accepted).toBe(true);
    await expect(page.locator('#sbItems .sb-object-sticker img.sb-sticker')).toHaveCount(1);
    await expect(page.locator('#sbItems .sb-object-sticker img.sb-sticker'))
      .toHaveAttribute("src", /^data:image\/png;base64,/);
    const item = await page.evaluate(() => sbActiveBoard().items[0]);
    expect(item.sticker).toBe(imported.id);
    expect(await page.evaluate(() => window.__downloads)).toEqual([]);
  });

  test("the sticker gallery and sticker are real web components", async ({ page }) => {
    await seedPanel(page);
    await openStickerPanel(page);
    expect(await page.evaluate(() => !!customElements.get("sb-sticker"))).toBe(true);
    expect(await page.evaluate(() => !!customElements.get("sb-sticker-gallery"))).toBe(true);
  });
});
