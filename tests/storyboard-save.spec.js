const { test, expect } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startCoverage, stopCoverage } = require("./coverage");

test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// Storyboard - saving.
//
// The rail's Save action moved onto the SCENE (a button beside the board chip),
// and the STORY gained its own button that downloads <story>.zip containing one
// JPG per scene, numbered and zero padded so the entries sort alphabetically.

function scene(id, name, extra) {
  return Object.assign({
    id,
    name,
    background: "space",
    items: [],
    connectors: [],
    groups: [],
    view: { zoom: 1, fx: 0.5, fy: 0.5 }
  }, extra || {});
}

function story(id, name, scenes, extra) {
  return Object.assign({ id, name, scenes, activeSceneId: scenes[0].id }, extra || {});
}

async function seed(page, theStory) {
  await page.goto("/");
  await page.evaluate((s) => {
    localStorage.setItem("storyboard_stories", JSON.stringify([s]));
    localStorage.setItem("storyboard_activeStory", s.id);
    localStorage.setItem("storyboard_activeScene", s.activeSceneId);
  }, theStory);
  await page.goto("/Storyboard/");
  await expect(page.locator("#sbCanvas")).toBeVisible();
}

// Read a store-only ZIP written by the app: local file headers only.
function readZip(buffer) {
  expect(buffer.readUInt32LE(buffer.length - 22)).toBe(0x06054b50); // EOCD
  const entries = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const crc = buffer.readUInt32LE(offset + 14);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    entries.push({ name, method, crc, size, data: buffer.slice(start, start + size) });
    offset = start + size;
  }
  return entries;
}

async function saveDownload(page, selector) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator(selector).click()
  ]);
  const file = path.join(os.tmpdir(), "sb-save-" + Date.now() + "-" + download.suggestedFilename());
  await download.saveAs(file);
  return { download, file, name: download.suggestedFilename() };
}

test.describe("Storyboard - save scene / save story", () => {
  test("the rail no longer has Save; the scene and story buttons sit by the board chip", async ({ page }) => {
    await seed(page, story("save-story", "Save Me", [scene("save-scene", "Scene 1")]));

    await expect(page.locator("#sbSaveBtn")).toHaveCount(0);
    await expect(page.locator("#sbToolbar .sb-rail smd-button.sb-rail-btn")).toHaveCount(8);

    const sceneBtn = page.locator("#sbSaveSceneBtn");
    const storyBtn = page.locator("#sbSaveStoryBtn");
    await expect(sceneBtn).toBeVisible();
    await expect(storyBtn).toBeVisible();
    expect(await sceneBtn.evaluate((el) => el.tagName)).toBe("SMD-BUTTON");
    expect(await storyBtn.evaluate((el) => el.tagName)).toBe("SMD-BUTTON");
    await expect(sceneBtn.locator("button i")).toHaveClass(/fa-download/);
    await expect(storyBtn.locator("button i")).toHaveClass(/fa-file-zipper/);
    await expect(sceneBtn.locator("button")).toHaveAttribute("aria-label", "Save scene as JPG");
    await expect(storyBtn.locator("button")).toHaveAttribute("aria-label", "Save story as ZIP");

    // They sit on the same row as the board chip (to its left).
    const chip = await page.locator("#sbBoardName").boundingBox();
    const sceneBox = await sceneBtn.boundingBox();
    const storyBox = await storyBtn.boundingBox();
    expect(Math.abs(sceneBox.y + sceneBox.height / 2 - (chip.y + chip.height / 2))).toBeLessThan(4);
    expect(sceneBox.x + sceneBox.width).toBeLessThanOrEqual(storyBox.x + 1);
    expect(storyBox.x + storyBox.width).toBeLessThanOrEqual(chip.x + 1);
  });

  test("Save scene downloads a JPG of the current scene", async ({ page }) => {
    await seed(page, story("save-story", "Save Me", [scene("save-scene", "My Scene")]));

    const saved = await saveDownload(page, "#sbSaveSceneBtn");
    expect(saved.name).toBe("my-scene.jpg");
    const head = fs.readFileSync(saved.file).subarray(0, 2).toString("hex");
    expect(head).toBe("ffd8");
  });

  test("Save story downloads one JPG per scene, zero padded and in order", async ({ page }) => {
    // Ten scenes so the padding is two digits ("01" .. "10").
    const scenes = [];
    for (let i = 1; i <= 10; i++) scenes.push(scene("zip-scene-" + i, i === 3 ? "Middle Part" : "Scene " + i));
    const activeId = "zip-scene-4";
    await seed(page, story("zip-story", "Zip Story", scenes, { activeSceneId: activeId }));

    const saved = await saveDownload(page, "#sbSaveStoryBtn");
    expect(saved.name).toBe("zip-story.zip");

    const entries = readZip(fs.readFileSync(saved.file));
    expect(entries).toHaveLength(10);
    expect(entries.map((entry) => entry.name)).toEqual([
      "01 - Scene 1.jpg",
      "02 - Scene 2.jpg",
      "03 - Middle Part.jpg",
      "04 - Scene 4.jpg",
      "05 - Scene 5.jpg",
      "06 - Scene 6.jpg",
      "07 - Scene 7.jpg",
      "08 - Scene 8.jpg",
      "09 - Scene 9.jpg",
      "10 - Scene 10.jpg"
    ]);
    // Sorted alphabetically == sorted numerically thanks to the padding.
    expect(entries.map((entry) => entry.name)).toEqual(entries.map((entry) => entry.name).slice().sort());

    for (const entry of entries) {
      expect(entry.method).toBe(0); // stored, no compression
      expect(entry.data.subarray(0, 2).toString("hex")).toBe("ffd8");
      expect(entry.data.subarray(-2).toString("hex")).toBe("ffd9");
      expect(entry.size).toBeGreaterThan(1000);
      expect(entry.crc).toBeGreaterThan(0);
    }

    // The scene the user was on is restored afterwards.
    expect(await page.evaluate(() => sbActiveBoard().id)).toBe(activeId);
    expect(await page.evaluate(() => sbActiveStory().activeSceneId)).toBe(activeId);
  });

  test("a single-digit story is not padded (1..9 sort correctly on their own)", async ({ page }) => {
    const scenes = [1, 2, 3].map((i) => scene("tiny-scene-" + i, "Part " + i));
    await seed(page, story("tiny-story", "Tiny", scenes));

    const saved = await saveDownload(page, "#sbSaveStoryBtn");
    const entries = readZip(fs.readFileSync(saved.file));
    expect(entries.map((entry) => entry.name)).toEqual([
      "1 - Part 1.jpg",
      "2 - Part 2.jpg",
      "3 - Part 3.jpg"
    ]);
  });
});
