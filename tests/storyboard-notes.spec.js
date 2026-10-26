const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// Storyboard - NOTES.
//
// A note is an editor cue: it renders as a coloured `fa:sticky-note` glyph with
// its text only in the tooltip, opens its panel on a click, scales like a
// sticker but NEVER rotates, is never drawn into a downloaded JPG, and lives in
// the scene JSON (so MinIO / OneDrive story saves carry it).
//
// The same run also covers the shared <smd-color-picker> feeding the TEXT
// colour/background, which is what makes a scene look identical on any theme.

const NOTE_COLOR = "#ffd54f";

function note(id, text, extra) {
  return Object.assign({
    id, type: "note", text, color: NOTE_COLOR,
    x: 50, y: 50, scale: 1, rotation: 0, z: 2
  }, extra || {});
}

function sticker(id, x, y, extra) {
  return Object.assign({
    id, type: "sticker", sticker: "mermaid", stickerName: "mermaid.svg",
    x, y, scale: 1, rotation: 0, z: 1
  }, extra || {});
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
  return story("note-story", "Note Story", [scene("note-scene", "Scene 1", items, extra)]);
}

async function storedScene(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("storyboard_stories"))[0].scenes[0]);
}

// Type a hex into a shared colour picker's text field (it applies on input).
async function setPicker(page, id, hex) {
  const field = page.locator("#" + id + " .smd-color-hex");
  await expect(field).toBeVisible();
  await field.fill(hex);
  await field.blur();
}

async function openNotePanel(page) {
  await page.locator('#sbToolbar [data-tool="note"]').click();
  await expect(page.locator("#sbPanelBody")).toBeVisible();
}

test.describe("Storyboard - notes", () => {
  test("the Note tool adds a sticky-note glyph whose text is only a tooltip", async ({ page }) => {
    await seed(page, oneScene([]));
    const rail = page.locator("#sbToolbar .sb-rail smd-button.sb-rail-btn");
    await expect(rail).toHaveCount(11); // 4 tools + Note + undo/redo + zoom out/in + Fit + Pin

    await openNotePanel(page);
    await expect(page.locator("#sbPanelTitle")).toHaveText("Note");
    // Nothing to add until there is text.
    await expect(page.locator("#sbPlaceNote button")).toBeDisabled();

    await page.locator("#sbNoteInput").fill("Check the moon");
    await expect(page.locator("#sbPlaceNote button")).toBeEnabled();
    await page.locator("#sbPlaceNote").click();

    const object = page.locator(".sb-object-note");
    await expect(object).toHaveCount(1);
    await expect(object.locator("i")).toHaveClass(/fa-sticky-note/);
    // Icon only on the board - the text never renders (it is a tooltip).
    expect(await page.locator("#sbItems").textContent()).not.toContain("Check the moon");
    await expect(object).toHaveAttribute("title", "Check the moon");

    const stored = await storedScene(page);
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]).toMatchObject({ type: "note", text: "Check the moon", color: NOTE_COLOR });
  });

  test("clicking a note opens its editor; multi-line text applies live and persists", async ({ page }) => {
    await seed(page, oneScene([note("n1", "first line")]));
    await page.locator('.sb-object-note[data-id="n1"]').click();

    await expect(page.locator("#sbPanelTitle")).toHaveText("Edit note");
    const input = page.locator("#sbNoteInput");
    await expect(input).toHaveValue("first line");

    await input.fill("line one\nline two\nline three");
    await expect.poll(async () => (await storedScene(page)).items[0].text).toBe("line one\nline two\nline three");

    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await expect.poll(async () => (await storedScene(page)).items[0].text).toBe("line one\nline two\nline three");
    // The tooltip carries the (whole) multi-line text after a reload too.
    await expect(page.locator('.sb-object-note[data-id="n1"]')).toHaveAttribute("title", /line one/);
  });

  test("the colour picker recolours the note and the colour survives a reload", async ({ page }) => {
    await seed(page, oneScene([note("n1", "green note")]));
    await page.locator('.sb-object-note[data-id="n1"]').click();

    await setPicker(page, "sbNoteColor", "#00ff00");
    const glyph = page.locator('.sb-object-note[data-id="n1"] i');
    await expect.poll(() => glyph.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(0, 255, 0)");
    await expect.poll(async () => (await storedScene(page)).items[0].color).toBe("#00ff00");

    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await expect.poll(() => page.locator('.sb-object-note[data-id="n1"] i').evaluate((el) => getComputedStyle(el).color))
      .toBe("rgb(0, 255, 0)");
  });

  test("a note scales but never rotates, even inside a rotated group", async ({ page }) => {
    await seed(page, oneScene([
      note("n1", "handles", { x: 50, y: 50, z: 2 }),
      sticker("s1", 25, 50, { z: 1 })
    ]));

    // Only the scale handle - a note can never be twisted by its own handle.
    await expect(page.locator('.sb-object-note .sb-handle-rotate')).toHaveCount(0);
    await expect(page.locator('.sb-object-sticker .sb-handle-rotate')).toHaveCount(1);
    await expect(page.locator('.sb-object-note .sb-handle-scale')).toHaveCount(1);

    // Drag the scale handle away from the note's centre: it grows.
    await page.locator('.sb-object-note[data-id="n1"]').click();
    const handle = await page.locator('.sb-object-note[data-id="n1"] .sb-handle-scale').boundingBox();
    const centre = await page.locator('.sb-object-note[data-id="n1"]').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(centre.x + centre.width / 2 + 120, centre.y + centre.height / 2 + 120, { steps: 10 });
    await page.mouse.up();
    const scaled = (await storedScene(page)).items.find((i) => i.id === "n1");
    expect(scaled.scale).toBeGreaterThan(1.2);
    expect(scaled.rotation).toBe(0);

    // Grouping it with a sticker and twisting the GROUP leaves the note upright.
    await page.locator('.sb-object-sticker[data-id="s1"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();
    const box = await page.locator("#sbSelectionBox").boundingBox();
    const groupCentre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const rotate = await page.locator("#sbSelectionBox .sb-handle-rotate").boundingBox();
    const start = { x: rotate.x + rotate.width / 2, y: rotate.y + rotate.height / 2 };
    const radius = Math.abs(start.y - groupCentre.y);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(groupCentre.x + radius, groupCentre.y, { steps: 12 });
    await page.mouse.up();

    const items = (await storedScene(page)).items;
    const stickerAfter = items.find((i) => i.id === "s1");
    const noteAfter = items.find((i) => i.id === "n1");
    expect(Math.abs(stickerAfter.rotation - 90)).toBeLessThan(4);
    expect(noteAfter.rotation).toBe(0);
  });

  test("notes are never drawn into the downloaded image", async ({ page }) => {
    await seed(page, oneScene([], { backgroundFit: "stretch" }));

    // A solid magenta painting, painted through the real background path.
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 8; c.height = 8;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ff00ff";
      ctx.fillRect(0, 0, 8, 8);
      const blob = await new Promise((resolve) => c.toBlob(resolve, "image/png"));
      sbRegisterOdBackground({ id: "od:solid", name: "Solid", path: "x/solid.png" });
      sbSetBackground("od:solid");
      sbBgApplyFull("od:solid", blob);
    });

    const sampleCentre = () => page.evaluate(async () => {
      const blob = await sbBoardJpegBlob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const px = ctx.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data;
      return { size: [bitmap.width, bitmap.height], rgb: [px[0], px[1], px[2]] };
    });

    // Control: a GREEN text box at the centre IS exported.
    await page.evaluate(() => {
      sbAddItem({ type: "text", text: " ", bg: "#00ff00", color: "#000000", x: 50, y: 50, scale: 1, rotation: 0 });
      sbRender();
    });
    const withText = await sampleCentre();
    expect(withText.rgb[1]).toBeGreaterThan(150); // green survives the export
    expect(withText.rgb[0]).toBeLessThan(120);

    // The same spot occupied by a GREEN note: nothing green reaches the image.
    await page.evaluate(() => {
      var board = sbActiveBoard();
      board.items = [];
      sbAddItem({ type: "note", text: "editor only", color: "#00ff00", x: 50, y: 50, scale: 3, rotation: 0 });
      sbRender();
    });
    const withNote = await sampleCentre();
    expect(withNote.rgb[0]).toBeGreaterThan(150); // magenta background, not green
    expect(withNote.rgb[1]).toBeLessThan(120);
  });

  test("a note is part of the saved story payload (MinIO / OneDrive)", async ({ page }) => {
    await seed(page, oneScene([note("n1", "backed up", { color: "#123456" })]));
    const payload = await page.evaluate(async () => JSON.stringify(await sbStoryBackupPayload(sbActiveStory())));
    expect(payload).toContain('"type":"note"');
    expect(payload).toContain('"text":"backed up"');
    expect(payload).toContain('"color":"#123456"');
    // and the scene in local storage carries it too
    expect(await page.evaluate(() => localStorage.getItem("storyboard_stories"))).toContain('"text":"backed up"');
  });

  test("text colour and background can be fixed colours, identical in every theme", async ({ page }) => {
    await seed(page, oneScene([
      { id: "t1", type: "text", text: "Fixed", bg: "transparent", color: "auto", border: "none", font: "theme", x: 50, y: 50, scale: 1, rotation: 0, z: 1 }
    ]));

    // Both rows are the shared colour picker now (no theme swatches).
    await page.locator('.sb-object-text[data-id="t1"]').dblclick();
    await expect(page.locator("#sbPanelTitle")).toHaveText("Edit text");
    await expect(page.locator("#sbTextBg")).toHaveCount(1);
    await expect(page.locator("#sbTextColor")).toHaveCount(1);
    await expect(page.locator("#sbPanelBody .sb-swatch")).toHaveCount(0);

    await setPicker(page, "sbTextBg", "#abcdef");
    await setPicker(page, "sbTextColor", "#123456");

    const box = page.locator('.sb-object-text[data-id="t1"] .sb-text');
    await expect.poll(() => box.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(171, 205, 239)");
    await expect.poll(() => box.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(18, 52, 86)");

    await expect.poll(async () => (await storedScene(page)).items[0].bg).toBe("#abcdef");
    await expect.poll(async () => (await storedScene(page)).items[0].color).toBe("#123456");

    // A theme swap cannot repaint a fixed colour.
    await page.evaluate(() => applyTheme("flatly", "light"));
    await page.waitForTimeout(600);
    await page.evaluate(() => sbRender());
    expect(await box.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(171, 205, 239)");
    expect(await box.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(18, 52, 86)");

    // "Automatic" / "Transparent" are still available and go back to the theme.
    await page.locator("#sbTextColor .smd-color-empty").click();
    await page.locator("#sbTextBg .smd-color-empty").click();
    await expect.poll(async () => (await storedScene(page)).items[0].color).toBe("auto");
    await expect.poll(async () => (await storedScene(page)).items[0].bg).toBe("transparent");
  });
});
