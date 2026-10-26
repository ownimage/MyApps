const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// Storyboard - undo / redo.
//
// Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) plus two rail buttons. History is a
// snapshot of the STORIES content (items, connectors, groups, names, sizes and
// scene ORDER) - deliberately NOT the per-scene zoom/pan, so undo never moves the
// camera. A burst of edits (typing, a whole drag) is ONE step.

function note(id, text, extra) {
  return Object.assign({ id, type: "note", text, color: "#ffd54f", x: 50, y: 50, scale: 1, rotation: 0, z: 1 }, extra || {});
}

function sticker(id, x, y, extra) {
  return Object.assign({ id, type: "sticker", sticker: "mermaid", stickerName: "mermaid.svg", x, y, scale: 1, rotation: 0, z: 1 }, extra || {});
}

function scene(id, name, items, extra) {
  return Object.assign({
    id, name, background: "", items: items || [], connectors: [], groups: [],
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

function oneScene(items, extra) {
  return story("undo-story", "Undo Story", [scene("undo-scene", "Scene 1", items, extra)]);
}

async function storedStory(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("storyboard_stories"))[0]);
}

async function addNote(page, text) {
  await page.locator('#sbToolbar [data-tool="note"]').click();
  await expect(page.locator("#sbNoteInput")).toBeVisible();
  await page.locator("#sbNoteInput").fill(text);
  await page.locator("#sbPlaceNote").click();
  await expect.poll(() => page.evaluate(() => sbActiveBoard().items.length)).toBeGreaterThan(0);
  // Close the panel so the keyboard belongs to the board again (a focused text
  // field keeps its own Ctrl+Z - the last test asserts exactly that).
  await page.locator("#sbPanelClose").click();
  await expect(page.locator("#sbPanelBody")).toHaveText("");
}

test.describe("Storyboard - undo and redo", () => {
  test("the rail has undo and redo buttons with icons, disabled until there is history", async ({ page }) => {
    await seed(page, oneScene([]));
    const rail = page.locator("#sbToolbar .sb-rail smd-button.sb-rail-btn");
    await expect(rail).toHaveCount(11); // 4 tools + Note + undo/redo + zoom out/in + Fit + Pin

    const undo = page.locator("#sbUndoBtn");
    const redo = page.locator("#sbRedoBtn");
    await expect(undo).toHaveCount(1);
    await expect(redo).toHaveCount(1);
    await expect(undo.locator("button i")).toHaveClass(/fa-rotate-left/);
    await expect(redo.locator("button i")).toHaveClass(/fa-rotate-right/);
    await expect(undo.locator("button")).toHaveAttribute("aria-label", "Undo");
    await expect(redo.locator("button")).toHaveAttribute("aria-label", "Redo");
    await expect(undo.locator("button")).toBeDisabled();
    await expect(redo.locator("button")).toBeDisabled();

    await addNote(page, "first");
    await expect(undo.locator("button")).toBeEnabled();
    await expect(redo.locator("button")).toBeDisabled();
    // Undoing everything disables Undo again (no dead entries).
    await expect(page.locator("#sbUndoBtn button")).toBeEnabled();
    await page.locator("#sbUndoBtn").click();
    await expect(page.locator(".sb-object-note")).toHaveCount(0);
    await expect(undo.locator("button")).toBeDisabled();
    await expect(redo.locator("button")).toBeEnabled();
  });

  test("Ctrl+Z undoes an added item and Ctrl+Y redoes it", async ({ page }) => {
    await seed(page, oneScene([]));
    await addNote(page, "hello");
    await expect(page.locator(".sb-object-note")).toHaveCount(1);

    await page.keyboard.press("Control+z");
    await expect(page.locator(".sb-object-note")).toHaveCount(0);
    await expect.poll(async () => (await storedStory(page)).scenes[0].items).toEqual([]);

    await page.keyboard.press("Control+y");
    await expect(page.locator(".sb-object-note")).toHaveCount(1);
    await expect.poll(async () => (await storedStory(page)).scenes[0].items.map((i) => i.text)).toEqual(["hello"]);
  });

  test("a drag is a single undo step that restores the exact position", async ({ page }) => {
    await seed(page, oneScene([sticker("s1", 30, 50)]));
    const before = await page.evaluate(() => sbFindItem("s1").x);

    const box = await page.locator('.sb-object-sticker[data-id="s1"]').boundingBox();
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 120, from.y, { steps: 12 });
    await page.mouse.up();
    const moved = await page.evaluate(() => sbFindItem("s1").x);
    expect(moved).toBeGreaterThan(before + 3);

    await page.keyboard.press("Control+z");
    await expect.poll(() => page.evaluate(() => sbFindItem("s1").x)).toBeCloseTo(before, 3);

    await page.keyboard.press("Control+y");
    await expect.poll(() => page.evaluate(() => sbFindItem("s1").x)).toBeCloseTo(moved, 3);
  });

  test("deleting a scene can be undone (content and order come back)", async ({ page }) => {
    const second = scene("u2", "Scene 2", [note("n2", "keep me")], { background: "underwater" });
    await seed(page, story("undo-story", "Undo Story", [scene("u1", "Scene 1"), second]));
    await page.locator('.sb-rail-btn[data-tool="boards"]').click();
    await expect(page.locator(".sb-board-row")).toHaveCount(2);

    await page.locator('.sb-board-row[data-board-id="u2"] .sb-board-act[data-act="delete"]').click();
    await expect(page.locator("#smdConfirmModal")).toContainText("Delete scene?");
    await page.locator("#smdConfirmModal").getByRole("button", { name: "Delete" }).click();
    await expect(page.locator(".sb-board-row")).toHaveCount(1);

    await page.keyboard.press("Control+z");
    await expect(page.locator(".sb-board-row")).toHaveCount(2);
    const back = await storedStory(page);
    expect(back.scenes.map((s) => s.name)).toEqual(["Scene 1", "Scene 2"]);
    expect(back.scenes[1].background).toBe("underwater");
    expect(back.scenes[1].items.map((i) => i.text)).toEqual(["keep me"]);
  });

  test("Ctrl+Shift+Z also redoes", async ({ page }) => {
    await seed(page, oneScene([]));
    await addNote(page, "shift redo");
    await page.keyboard.press("Control+z");
    await expect(page.locator(".sb-object-note")).toHaveCount(0);
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator(".sb-object-note")).toHaveCount(1);
  });

  test("typing in a panel text field keeps its own Ctrl+Z (the board is untouched)", async ({ page }) => {
    await seed(page, oneScene([note("n1", "original")]));
    await page.locator('.sb-object-note[data-id="n1"]').click();
    const input = page.locator("#sbNoteInput");
    await expect(input).toBeFocused();
    await input.fill("original plus more");

    await page.keyboard.press("Control+z");
    // The note still exists - the shortcut went to the textarea, not the board.
    await expect(page.locator('.sb-object-note[data-id="n1"]')).toHaveCount(1);
    expect((await storedStory(page)).scenes[0].items).toHaveLength(1);
  });
});
