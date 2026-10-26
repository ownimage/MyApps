const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// Storyboard - OneDrive BACKGROUND libraries.
//
// Same shape as the sticker libraries: with OneDrive enabled AND signed in the
// Background fly-out gains Standard (None/Space/Underwater) plus "Library"
// (<Directory>/Backgrounds) and "Board" (<Directory>/<story>/Backgrounds) tabs -
// each shown only when its folder exists. The GRID uses small Graph thumbnails;
// the full image is downloaded when a background is chosen. eTag changes refresh
// cached art, the scene stores only the id, and story backups embed the used
// background bytes once.

const DIR = "MyApps/Storyboard";
const STORY_NAME = "My Story";
const LIB_FOLDER = DIR + "/Backgrounds";
const BOARD_FOLDER = DIR + "/" + STORY_NAME + "/Backgrounds";

// Distinct real PNGs so a test can prove WHICH bytes are on screen.
const PNG_THUMB = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const PNG_FULL = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAvElEQVR4nOXOMQEAMAzAoMipfz31ssng6MFPO/MuSwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7R0QEsHtHRASwe0dEBLB7QPRuyx/1aAaEoAAAAASUVORK5CYII=";

const THUMB_BYTES = Buffer.from(PNG_THUMB, "base64").length;
const FULL_BYTES = Buffer.from(PNG_FULL, "base64").length;

function scene(id, name, extra) {
  return Object.assign({
    id,
    name,
    background: "",
    items: [],
    connectors: [],
    groups: [],
    view: { zoom: 1, fx: 0.5, fy: 0.5 }
  }, extra || {});
}

function story(id, name, scenes) {
  return { id, name, scenes, activeSceneId: scenes[0].id };
}

const STORY = story("bg-story", STORY_NAME, [
  scene("bg-scene-a", "Scene 1"),
  scene("bg-scene-b", "Scene 2")
]);

async function seed(page, options) {
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
    localStorage.setItem("storyboard_onedrive_directory", "MyApps/Storyboard");
  }, {
    story: opts.story || STORY,
    signedIn: opts.signedIn !== false,
    enabled: opts.enabled !== false
  });
  await page.goto("/Storyboard/");
  await expect(page.locator("#sbCanvas")).toBeVisible();
}

// OneDrive stubs. `folders` maps a folder path to its image file names; a
// missing path rejects with 404 (which is how the app decides a tab is hidden).
async function stubBackgrounds(page, folders, options) {
  const opts = options || {};
  await page.evaluate(({ folders: map, pngThumb, pngFull, failing }) => {
    window.__thumbs = [];
    window.__downloads = [];
    window.__stickerFiles = map;
    window.__bgEtags = window.__bgEtags || {};
    window.__bgFull = window.__bgFull || {};
    window.__bgThumb = window.__bgThumb || {};
    window.__bgFail = failing;
    window.oneDriveInit = function () { return Promise.resolve({ username: "designer@example.com" }); };
    window.oneDriveListFolder = function (path) {
      if (window.__bgFail) return Promise.reject(new Error("Failed to fetch"));
      var names = window.__stickerFiles[path];
      if (!names) { var e = new Error("Not found"); e.status = 404; return Promise.reject(e); }
      return Promise.resolve({
        folders: [],
        files: names.map(function (name, index) {
          var key = path + "/" + name;
          return {
            name: name,
            key: key,
            id: "item-" + path + "-" + index,
            eTag: window.__bgEtags[key] || "{v1}",
            size: 4096,
            lastModified: window.__bgEtags[key] || "2026-10-25T09:00:00Z"
          };
        })
      });
    };
    window.oneDriveDownloadThumbnail = function (path) {
      window.__thumbs.push(path);
      var bytes = Uint8Array.from(atob(window.__bgThumb[path] || pngThumb), function (c) { return c.charCodeAt(0); });
      return Promise.resolve(new Blob([bytes], { type: "image/png" }));
    };
    window.oneDriveDownloadBlob = function (path) {
      window.__downloads.push(path);
      var bytes = Uint8Array.from(atob(window.__bgFull[path] || pngFull), function (c) { return c.charCodeAt(0); });
      return Promise.resolve(new Blob([bytes], { type: "image/png" }));
    };
  }, { folders, pngThumb: PNG_THUMB, pngFull: PNG_FULL, failing: opts.failing === true });
}

async function openBackgrounds(page) {
  await page.locator('#sbToolbar [data-tool="background"]').click();
  await expect(page.locator("#sbPanelBody")).toBeVisible();
}

const ACTIVE_TILES = "#sbBgTabs > .smd-tab-panel.active .sb-bg-option";
const PLAIN_TILES = "#sbPanelBody > .sb-bg-grid .sb-bg-option";
const TILES = ACTIVE_TILES + ", " + PLAIN_TILES;

async function boardBackgroundBytes(page) {
  return page.evaluate(async () => {
    const bg = document.getElementById("sbBackground");
    const image = bg.style.backgroundImage || "";
    const match = image.match(/url\("?(.*?)"?\)/);
    if (!match) return -1;
    const response = await fetch(match[1]);
    return (await response.arrayBuffer()).byteLength;
  });
}

test.describe("Storyboard - OneDrive backgrounds", () => {
  test("with OneDrive off the background panel is unchanged", async ({ page }) => {
    await seed(page, { enabled: false });
    await openBackgrounds(page);

    await expect(page.locator("#sbBgTabs")).toHaveCount(0);
    await expect(page.locator(TILES)).toHaveCount(3); // None, Space, Underwater
    await expect(page.locator(PLAIN_TILES + " > span:not(.sb-bg-preview)")).toHaveText(["None", "Space", "Underwater"]);
  });

  test("Library and Board tabs list their images using thumbnails, not full files", async ({ page }) => {
    await seed(page);
    await stubBackgrounds(page, {
      [LIB_FOLDER]: ["night-sky.png", "forest.jpg", "notes.txt"],
      [BOARD_FOLDER]: ["board-only.png"]
    });
    await openBackgrounds(page);

    const tabs = page.locator("#sbBgTabs > .smd-tab-list .smd-tab-btn");
    await expect(tabs).toHaveText(["Standard", "Library", "Board"]);
    await expect(page.locator(TILES)).toHaveCount(3);

    await tabs.filter({ hasText: "Library" }).click();
    await expect(page.locator("#sbBgTabs > .smd-tab-panel.active .sb-bg-option")).toHaveCount(2);
    await expect(page.locator("#sbBgTabs > .smd-tab-panel.active .sb-bg-option > span:not(.sb-bg-preview)")).toHaveText(["night-sky", "forest"]);
    // Thumbnails only, and they render from a blob URL.
    await expect.poll(() => page.evaluate(() => window.__thumbs.slice().sort()))
      .toEqual([LIB_FOLDER + "/forest.jpg", LIB_FOLDER + "/night-sky.png"]);
    await expect(page.locator("#sbBgTabs > .smd-tab-panel.active .sb-bg-option img").first())
      .toHaveAttribute("src", /^blob:/);
    expect(await page.evaluate(() => window.__downloads)).toEqual([]);

    await tabs.filter({ hasText: "Board" }).click();
    await expect(page.locator("#sbBgTabs > .smd-tab-panel.active .sb-bg-option > span:not(.sb-bg-preview)")).toHaveText(["board-only"]);
  });

  test("choosing a library background downloads the full image and paints the board", async ({ page }) => {
    await seed(page);
    await stubBackgrounds(page, { [LIB_FOLDER]: ["night-sky.png"] });
    await openBackgrounds(page);
    await page.locator("#sbBgTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
    await expect(page.locator("#sbBgTabs > .smd-tab-panel.active .sb-bg-option")).toHaveCount(1);

    await page.locator("#sbBgTabs > .smd-tab-panel.active .sb-bg-option").click();

    const chosen = await page.evaluate(() => sbActiveBoard().background);
    expect(chosen).toMatch(/^od:/);
    await expect.poll(() => page.evaluate(() => window.__downloads)).toEqual([LIB_FOLDER + "/night-sky.png"]);
    await expect.poll(() => boardBackgroundBytes(page)).toBe(FULL_BYTES);
    await expect(page.locator('.sb-bg-option[data-bg="' + chosen + '"]')).toHaveClass(/active/);
  });

  test("a missing folder hides its tab, and signed-out shows Standard only", async ({ page }) => {
    await seed(page);
    await stubBackgrounds(page, { [LIB_FOLDER]: ["night-sky.png"] });
    await openBackgrounds(page);
    await expect(page.locator("#sbBgTabs > .smd-tab-list .smd-tab-btn")).toHaveText(["Standard", "Library"]);

    await seed(page, { signedIn: false });
    await stubBackgrounds(page, { [LIB_FOLDER]: ["night-sky.png"] });
    await openBackgrounds(page);
    await expect(page.locator("#sbBgTabs .smd-tab-btn")).toHaveCount(0);
    await expect(page.locator(TILES)).toHaveCount(3);
  });

  test("a reload paints the chosen background from the cache without OneDrive", async ({ page }) => {
    await seed(page);
    await stubBackgrounds(page, { [LIB_FOLDER]: ["night-sky.png"] });
    await openBackgrounds(page);
    await page.locator("#sbBgTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
    await page.locator("#sbBgTabs > .smd-tab-panel.active .sb-bg-option").click();
    await expect.poll(() => boardBackgroundBytes(page)).toBe(FULL_BYTES);

    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await stubBackgrounds(page, {}, { failing: true });
    await expect.poll(() => boardBackgroundBytes(page)).toBe(FULL_BYTES);
    expect(await page.evaluate(() => window.__downloads)).toEqual([]);

    // The grid still lists the cached library and shows its cached thumbnail.
    await openBackgrounds(page);
    await page.locator("#sbBgTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
    await expect(page.locator("#sbBgTabs > .smd-tab-panel.active .sb-bg-option")).toHaveCount(1);
    await expect(page.locator("#sbBgTabs > .smd-tab-panel.active .sb-bg-option img"))
      .toHaveAttribute("src", /^blob:/);
    expect(await page.evaluate(() => window.__thumbs)).toEqual([]);
  });

  test("re-saving the file on disk refreshes the preview and the board", async ({ page }) => {
    await seed(page);
    await stubBackgrounds(page, { [LIB_FOLDER]: ["night-sky.png"] });
    await openBackgrounds(page);
    await page.locator("#sbBgTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
    await page.locator("#sbBgTabs > .smd-tab-panel.active .sb-bg-option").click();
    // The board shows the thumbnail at once and sharpens when the full image lands.
    await expect.poll(() => boardBackgroundBytes(page)).toBe(FULL_BYTES);

    // New eTag + new bytes for the same item.
    await page.evaluate(({ path, thumb }) => {
      window.__bgEtags[path] = "{v2}";
      window.__bgFull[path] = thumb; // reuse the small PNG as "new" artwork (different size)
    }, { path: LIB_FOLDER + "/night-sky.png", thumb: PNG_THUMB });
    await page.evaluate(() => sbBgRefreshFolders(true));

    await expect.poll(() => boardBackgroundBytes(page)).toBe(THUMB_BYTES);
  });

  test("choosing a background hides the empty-board hint", async ({ page }) => {
    await seed(page);
    // A brand-new board (no background, no items) still coaches the user.
    await expect(page.locator("#sbEmptyHint")).toBeVisible();

    await stubBackgrounds(page, { [LIB_FOLDER]: ["night-sky.png"] });
    await openBackgrounds(page);
    await page.locator("#sbBgTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
    await page.locator("#sbBgTabs > .smd-tab-panel.active .sb-bg-option").click();
    await expect(page.locator("#sbEmptyHint")).toBeHidden();

    // Built-in backgrounds behave the same, and "None" brings the hint back while
    // the board is still empty.
    await page.evaluate(() => sbSetBackground("space"));
    await expect(page.locator("#sbEmptyHint")).toBeHidden();
    await page.evaluate(() => sbSetBackground(""));
    await expect(page.locator("#sbEmptyHint")).toBeVisible();

    // Items hide it too, background or not.
    await page.evaluate(() => { sbAddSticker("mermaid"); });
    await expect(page.locator("#sbEmptyHint")).toBeHidden();
  });
  test("a story backup embeds each used background once and restores it", async ({ page }) => {
    const twoScenes = story("bg-story", STORY_NAME, [
      scene("bg-scene-a", "Scene 1"),
      scene("bg-scene-b", "Scene 2")
    ]);
    await seed(page, { story: twoScenes });
    await stubBackgrounds(page, { [LIB_FOLDER]: ["night-sky.png"] });
    await page.evaluate(() => {
      window.__put = null;
      window.oneDrivePutFile = function (key, text) { window.__put = { key: key, body: text }; return Promise.resolve({}); };
    });
    await openBackgrounds(page);
    await page.locator("#sbBgTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Library" }).click();
    await page.locator("#sbBgTabs > .smd-tab-panel.active .sb-bg-option").click();
    await expect.poll(() => boardBackgroundBytes(page)).toBe(FULL_BYTES);

    // The SAME background used by a SECOND scene is still embedded only once.
    await page.evaluate(() => {
      const activeStory = sbActiveStory();
      activeStory.scenes[1].background = activeStory.scenes[0].background;
      sbSaveState();
    });

    await page.evaluate(() => saveToOneDrive());
    await expect.poll(() => page.evaluate(() => !!window.__put)).toBe(true);
    const saved = await page.evaluate(() => ({
      key: window.__put.key,
      payload: JSON.parse(window.__put.body)
    }));
    const id = await page.evaluate(() => sbActiveStory().scenes[0].background);
    expect(saved.payload.story.scenes[1].background).toBe(id);
    expect(Object.keys(saved.payload.backgrounds)).toEqual([id]);
    expect(saved.payload.backgrounds[id].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(saved.payload.backgrounds[id].dataUrl.length).toBeGreaterThan(100);

    // Load it back where OneDrive is unreachable AND the local cache is empty, so
    // the bytes can only come from the backup.
    await page.evaluate(async () => {
      const cache = await caches.open("myapps-backgrounds");
      for (const request of await cache.keys()) await cache.delete(request);
    });
    await page.addInitScript(() => {
      localStorage.setItem("storyboard_stories", JSON.stringify([{
        id: "fresh", name: "Fresh", activeSceneId: "fresh-scene",
        scenes: [{ id: "fresh-scene", name: "Scene 1", background: "", items: [], connectors: [], groups: [], view: { zoom: 1, fx: 0.5, fy: 0.5 } }]
      }]));
      localStorage.setItem("storyboard_activeStory", "fresh");
      localStorage.setItem("storyboard_activeScene", "fresh-scene");
    });
    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await stubBackgrounds(page, {}, { failing: true });

    const accepted = await page.evaluate(({ payload, key }) => SmdConfig.onFileSyncImport("onedrive", payload, key), {
      payload: saved.payload,
      key: saved.key
    });
    expect(accepted).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const bg = document.getElementById("sbBackground").style.backgroundImage || "";
      return /^url\("?data:image\/png;base64,/.test(bg);
    })).toBe(true);
    expect(await page.evaluate(() => window.__downloads)).toEqual([]);
  });
});
