const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// Storyboard - story properties (size + background fit).
//
// The Stories fly-out row has a cog that opens an INLINE form under the row:
//   Size         HD / Full HD / QHD / UWQHD / 4K presets, plus "Other" with
//                free width + height entry
//   Background   Fit (whole image visible, letterboxed) or Stretch (fills)
// The size belongs to the STORY, so every scene in it shares the same canvas
// shape, and the JPG export uses that size and fit mode.

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

function story(id, name, scenes, extra) {
  return Object.assign({ id, name, scenes, activeSceneId: scenes[0].id }, extra || {});
}

const STORY = story("props-story", "Properties", [
  scene("props-scene-a", "Scene 1", { background: "space" }),
  scene("props-scene-b", "Scene 2", { background: "underwater" })
]);

async function seed(page, list) {
  const stories = list || [STORY];
  await page.goto("/");
  await page.evaluate(({ list }) => {
    localStorage.setItem("storyboard_stories", JSON.stringify(list));
    localStorage.setItem("storyboard_activeStory", list[0].id);
    localStorage.setItem("storyboard_activeScene", list[0].activeSceneId);
  }, { list: stories });
  await page.goto("/Storyboard/");
  await expect(page.locator("#sbCanvas")).toBeVisible();
}

async function openStories(page) {
  await page.locator('.sb-rail-btn[data-tool="boards"]').click();
  await expect(page.locator("#sbPanelTitle")).toHaveText("Stories");
}

async function openProps(page, storyId) {
  await openStories(page);
  await page.locator('.sb-story-row[data-story-id="' + storyId + '"] .sb-story-act[data-act="story-props"]').click();
  await expect(page.locator(".sb-story-props")).toBeVisible();
}

async function activeStory(page) {
  return page.evaluate(() => {
    const story = sbActiveStory();
    return { width: story.width, height: story.height, fit: story.backgroundFit };
  });
}

async function choosePreset(page, value) {
  await page.locator("#sbStoryPreset .smd-select-btn").click();
  await page.locator('#sbStoryPreset .smd-select-item[data-value="' + value + '"]').click();
}

async function chooseFit(page, value) {
  await page.locator("#sbStoryFit .smd-select-btn").click();
  await page.locator('#sbStoryFit .smd-select-item[data-value="' + value + '"]').click();
}

async function backgroundSize(page) {
  return page.evaluate(() => getComputedStyle(document.getElementById("sbBackground")).backgroundSize);
}

async function boardBox(page) {
  const box = await page.locator("#sbCanvas").boundingBox();
  return { width: box.width, height: box.height, ratio: box.width / box.height };
}

// Record the JPG export's canvas size and the FIRST drawImage (the background)
// without actually encoding or downloading anything. The toBlob patch restores
// itself on first use, so this can be re-armed between saves.
async function captureExport(page) {
  await page.evaluate(() => {
    window.__exportCanvases = [];
    window.__bgDraws = [];
    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb) {
      window.__exportCanvases.push({ width: this.width, height: this.height });
      HTMLCanvasElement.prototype.toBlob = origToBlob;
      cb(null);
    };
    const origDraw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function () {
      const args = Array.prototype.slice.call(arguments);
      if (args.length === 5 && window.__bgDraws.length === 0) {
        window.__bgDraws.push({ dx: args[1], dy: args[2], dw: args[3], dh: args[4] });
      }
      return origDraw.apply(this, arguments);
    };
  });
}

async function saveJpg(page) {
  await page.locator("#sbSaveSceneBtn").click();
  await expect.poll(() => page.evaluate(() => window.__exportCanvases.length)).toBeGreaterThan(0);
  return page.evaluate(() => ({
    canvas: window.__exportCanvases[0],
    background: window.__bgDraws[0] || null
  }));
}

test.describe("Storyboard - story properties", () => {
  test("a story row has a cog that opens an inline size/background form", async ({ page }) => {
    await seed(page);
    await openStories(page);
    const row = page.locator('.sb-story-row[data-story-id="props-story"]');
    const cog = row.locator('.sb-story-act[data-act="story-props"]');
    await expect(cog).toBeVisible();
    await expect(cog.locator("i")).toHaveClass(/fa-cog/);

    await cog.click();
    const props = page.locator(".sb-story-props");
    await expect(props).toBeVisible();
    await expect(props.locator("#sbStoryPreset")).toBeVisible();
    await expect(props.locator("#sbStoryFit")).toBeVisible();
    // Free width/height only appear for "Other".
    await expect(props.locator("#sbStoryWidth")).toHaveCount(0);

    // The cog toggles the form away again.
    await cog.click();
    await expect(page.locator(".sb-story-props")).toHaveCount(0);
  });

  test("a preset sets the story size, the board shape and persists", async ({ page }) => {
    await seed(page);
    await openProps(page, "props-story");

    // Default is the QHD preset (the bundled backgrounds' natural size).
    expect(await page.locator("#sbStoryPreset").getAttribute("value")).toBe("qhd");
    expect(await activeStory(page)).toEqual({ width: 2560, height: 1440, fit: "fit" });

    await choosePreset(page, "fhd");
    await expect.poll(() => activeStory(page)).toEqual({ width: 1920, height: 1080, fit: "fit" });

    const box = await boardBox(page);
    expect(box.ratio).toBeGreaterThan(16 / 9 - 0.05);
    expect(box.ratio).toBeLessThan(16 / 9 + 0.05);

    // Survives a reload (saved with the story).
    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    expect(await activeStory(page)).toEqual({ width: 1920, height: 1080, fit: "fit" });
    const afterReload = await boardBox(page);
    expect(afterReload.ratio).toBeCloseTo(box.ratio, 1);
  });

  test("Other reveals width and height and accepts a portrait board", async ({ page }) => {
    await seed(page);
    await openProps(page, "props-story");

    await choosePreset(page, "other");
    await expect(page.locator("#sbStoryWidth")).toBeVisible();
    await expect(page.locator("#sbStoryHeight")).toBeVisible();

    await page.locator("#sbStoryWidth").fill("900");
    await page.locator("#sbStoryWidth").blur();
    await page.locator("#sbStoryHeight").fill("1600");
    await page.locator("#sbStoryHeight").blur();

    await expect.poll(() => activeStory(page)).toEqual({ width: 900, height: 1600, fit: "fit" });
    const box = await boardBox(page);
    expect(box.height).toBeGreaterThan(box.width);
    expect(box.ratio).toBeLessThan(1);

    // A size that matches no preset keeps "Other" selected.
    expect(await page.locator("#sbStoryPreset").getAttribute("value")).toBe("other");
  });

  test("Fit letterboxes the background, Stretch fills it", async ({ page }) => {
    await seed(page, [story("props-story", "Properties", [scene("only", "Scene 1", { background: "space" })], {
      width: 1280, height: 1280, backgroundFit: "fit"
    })]);
    await openProps(page, "props-story");

    // A 16:9 image on a square board is contained, not stretched.
    expect(await backgroundSize(page)).toBe("contain");

    await chooseFit(page, "stretch");
    await expect.poll(() => activeStory(page)).toEqual({ width: 1280, height: 1280, fit: "stretch" });

    // Stretch keeps the specified 100% 100% (Chromium does not resolve the
    // percentages in getComputedStyle, so assert the declared pairing).
    expect(await backgroundSize(page)).toBe("100% 100%");
  });

  test("the size is shared by every scene in the story", async ({ page }) => {
    await seed(page);
    await openProps(page, "props-story");
    await choosePreset(page, "uwqhd");
    await expect.poll(() => activeStory(page)).toEqual({ width: 3440, height: 1440, fit: "fit" });

    // Scene 2 of the SAME story uses the same canvas shape.
    await page.locator('.sb-board-row[data-board-id="props-scene-b"] .sb-board-pick').click();
    await expect.poll(() => page.evaluate(() => sbActiveBoard().id)).toBe("props-scene-b");
    const box = await boardBox(page);
    expect(box.ratio).toBeGreaterThan(3440 / 1440 - 0.05);
    expect(box.ratio).toBeLessThan(3440 / 1440 + 0.05);
    // Scenes carry no size of their own.
    expect(await page.evaluate(() => Object.prototype.hasOwnProperty.call(sbActiveBoard(), "width"))).toBe(false);
    expect(await activeStory(page)).toEqual({ width: 3440, height: 1440, fit: "fit" });
  });

  test("the exported JPG uses the story size and fit mode", async ({ page }) => {
    await seed(page, [story("props-story", "Properties", [scene("only", "Scene 1", { background: "space" })], {
      width: 1280, height: 1280, backgroundFit: "fit"
    })]);
    await openProps(page, "props-story");

    await captureExport(page);
    const fit = await saveJpg(page);
    expect(fit.canvas).toEqual({ width: 1280, height: 1280 });
    // The 2560x1440 artwork is contained: 1280 wide, 720 tall, centred vertically.
    expect(fit.background).not.toBeNull();
    expect(fit.background.dw).toBe(1280);
    expect(fit.background.dh).toBe(720);
    expect(fit.background.dy).toBe(280);

    await chooseFit(page, "stretch");
    await expect.poll(() => activeStory(page)).toEqual({ width: 1280, height: 1280, fit: "stretch" });

    await captureExport(page);
    const stretch = await saveJpg(page);
    expect(stretch.canvas).toEqual({ width: 1280, height: 1280 });
    expect(stretch.background).toEqual({ dx: 0, dy: 0, dw: 1280, dh: 1280 });
  });
});
