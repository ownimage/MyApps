const { test, expect } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startCoverage, stopCoverage } = require("./coverage");

test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// Storyboard - saving.
//
// Saving lives at the END of the hamburger menu ("Download Story" then
// "Download Scene"): the rail's Save action and the floating board pills were
// both removed. "Download Story" writes <story>.zip with one JPG per scene,
// numbered and zero padded so the entries sort alphabetically.

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

function menu(page) {
  return page.locator("#mainNav > .dropdown > .dropdown-menu");
}

async function downloadFromMenu(page, label) {
  await page.locator("#btnMainMenu").click();
  await expect(menu(page)).toBeVisible();
  const item = menu(page).locator(".dropdown-item").filter({ hasText: label });
  await expect(item).toHaveCount(1);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    item.click()
  ]);
  const file = path.join(os.tmpdir(), "sb-save-" + Date.now() + "-" + download.suggestedFilename());
  await download.saveAs(file);
  return { download, file, name: download.suggestedFilename() };
}

test.describe("Storyboard - download scene / download story", () => {
  test("no save controls on the rail or board; both downloads end the hamburger menu", async ({ page }) => {
    await seed(page, story("save-story", "Save Me", [scene("save-scene", "My Scene")]));

    // Nothing save-shaped left on the rail, and the floating pills are gone.
    await expect(page.locator("#sbSaveBtn")).toHaveCount(0);
    await expect(page.locator("#sbSaveSceneBtn")).toHaveCount(0);
    await expect(page.locator("#sbSaveStoryBtn")).toHaveCount(0);
    await expect(page.locator("#sbBoardActions")).toHaveCount(0);
    await expect(page.locator("#sbToolbar .sb-rail smd-button.sb-rail-btn")).toHaveCount(9); // 4 tools + Note + zoom out/in + Fit + Pin

    // The board chip is gone too: the story/scene readout is the nav bar title.
    await expect(page.locator("#sbBoardName")).toHaveCount(0);
    await expect(page.locator("#mainNav #appNavTitle")).toHaveText("Storyboard - Save Me/My Scene");

    // Two menu items at the very end, after their own separator.
    await page.locator("#btnMainMenu").click();
    await expect(menu(page)).toBeVisible();
    const tail = await menu(page).evaluate((el) => Array.prototype.slice.call(el.children).slice(-3).map((li) => {
      if (li.querySelector(".dropdown-divider")) return "---";
      return (li.textContent || "").trim();
    }));
    expect(tail).toEqual(["---", "Download Story", "Download Scene"]);
  });

  test("Download Scene downloads a JPG of the current scene", async ({ page }) => {
    await seed(page, story("save-story", "Save Me", [scene("save-scene", "My Scene")]));

    const saved = await downloadFromMenu(page, "Download Scene");
    expect(saved.name).toBe("my-scene.jpg");
    const head = fs.readFileSync(saved.file).subarray(0, 2).toString("hex");
    expect(head).toBe("ffd8");
  });

  test("Download Story downloads one JPG per scene, zero padded and in order", async ({ page }) => {
    // Ten scenes so the padding is two digits ("01" .. "10").
    const scenes = [];
    for (let i = 1; i <= 10; i++) scenes.push(scene("zip-scene-" + i, i === 3 ? "Middle Part" : "Scene " + i));
    const activeId = "zip-scene-4";
    await seed(page, story("zip-story", "Zip Story", scenes, { activeSceneId: activeId }));

    const saved = await downloadFromMenu(page, "Download Story");
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

    const saved = await downloadFromMenu(page, "Download Story");
    const entries = readZip(fs.readFileSync(saved.file));
    expect(entries.map((entry) => entry.name)).toEqual([
      "1 - Part 1.jpg",
      "2 - Part 2.jpg",
      "3 - Part 3.jpg"
    ]);
  });
});
