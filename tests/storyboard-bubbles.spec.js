const { test, expect } = require("@playwright/test");
const sharp = require("sharp");
const { startCoverage, stopCoverage } = require("./coverage");

test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// Storyboard - SPEECH BUBBLES (text boxes with a movable tail).
//
// A bubble text keeps `bubble` ("round" | "oval") plus a tail tip offset, a LINE
// colour and its line width / space (the gap between the line and the bubble's
// outer fill edge). The fill reuses the text box's `bg`.
//
// Everything here asserts the RENDERED result: one generated SVG path carries the
// fill AND the stroke (so the border flows round the tail), the line is inset by
// `lineGap + lineWidth/2`, and the exported JPG paints the same shape.

const FILL = "#ffffff";
const LINE = "#000000";

function textBox(id, value, x, y, extra) {
  return Object.assign({
    id, type: "text", text: value,
    bg: "transparent", color: "auto", border: "none", font: "theme",
    x, y, scale: 1, rotation: 0, z: 1
  }, extra || {});
}

function bubble(id, value, x, y, extra) {
  return textBox(id, value, x, y, Object.assign({
    bg: FILL, stroke: LINE, bubble: "round", lineWidth: 2, lineGap: 0,
    tail: { dx: 0, dy: 26 }
  }, extra || {}));
}

function sticker(id, name, x, y, extra) {
  return Object.assign({
    id, type: "sticker", sticker: name, stickerName: name + ".svg",
    x, y, scale: 1, rotation: 0, z: 2
  }, extra || {});
}

function scene(id, name, items, extra) {
  return Object.assign({
    id, name, background: "", items: items || [], connectors: [], groups: [],
    view: { zoom: 1, fx: 0.5, fy: 0.5 }
  }, extra || {});
}

function story(scenes) {
  return { id: "bub-story", name: "Bubbles", scenes, activeSceneId: scenes[0].id };
}

async function seed(page, items) {
  await page.goto("/");
  await page.evaluate((s) => {
    localStorage.setItem("storyboard_stories", JSON.stringify([s]));
    localStorage.setItem("storyboard_activeStory", s.id);
    localStorage.setItem("storyboard_activeScene", s.activeSceneId);
  }, story([scene("bub-scene", "Scene 1", items)]));
  await page.goto("/Storyboard/");
  await expect(page.locator("#sbCanvas")).toBeVisible();
}

async function storedScene(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("storyboard_stories"))[0].scenes[0]);
}

async function toggleBubble(page, on) {
  const box = page.locator("#sbBubbleToggle");
  if (on) await box.check();
  else await box.uncheck();
}

async function pickBubbleType(page, value) {
  await page.locator("#sbBubbleType .smd-select-btn").click();
  await page.locator('#sbBubbleType .smd-select-item[data-value="' + value + '"]').click();
}

async function setPicker(page, id, hex) {
  const field = page.locator("#" + id + " .smd-color-hex");
  await field.fill(hex);
  await field.blur();
}

async function setNumber(page, id, value) {
  const input = page.locator("#" + id);
  await input.fill(String(value));
  await input.blur();
}

// Sample the rendered colour at local-centred px of a text box (the paths are
// drawn in those coordinates, so this hits exactly what the shape paints).
async function colourAt(page, itemId, local) {
  const box = await page.locator('.sb-object-text[data-id="' + itemId + '"] .sb-text').boundingBox();
  const buf = await page.screenshot({
    clip: { x: Math.round(box.x + box.width / 2 + local.x), y: Math.round(box.y + box.height / 2 + local.y), width: 1, height: 1 }
  });
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2], ch: info.channels };
}

// Rasterise a bubble once (its SVG box, which covers the tail) and return a
// sampler taking the text box's LOCAL CENTRED coordinates.
async function bubbleSampler(page, itemId) {
  const locator = page.locator('.sb-object-text[data-id="' + itemId + '"] .sb-bubble');
  const rect = await locator.boundingBox();
  // Map through the SVG's OWN viewBox: the element may be scaled by the design
  // scale/touch size, so local px are not page px.
  const vb = await locator.evaluate((n) => {
    const v = n.viewBox.baseVal;
    return { x: v.x, y: v.y, w: v.width, h: v.height };
  });
  const clip = {
    x: Math.round(rect.x), y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height))
  };
  const buf = await page.screenshot({ clip });
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const sx = rect.width / vb.w, sy = rect.height / vb.h;
  const ch = info.channels;
  return function sample(local) {
    const px = Math.round((local.x - vb.x) * sx);
    const py = Math.round((local.y - vb.y) * sy);
    if (px < 0 || py < 0 || px >= info.width || py >= info.height) return null;
    const i = (py * info.width + px) * ch;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
}

const isWhite = (c) => !!c && c.r > 200 && c.g > 200 && c.b > 200;
// The line is drawn RED in these tests: the board behind a bubble is nearly the
// same colour as a black line, so the two cannot be told apart by brightness.
const isLine = (c) => !!c && c.r > 140 && c.g < 110 && c.b < 110;

// The tail tip of a path: the end point of its FIRST quadratic curve.
function pathTip(d) {
  const m = String(d).match(/Q\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)/);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

// Screenshot one text box and return the bright-pixel rows (white glyphs).
async function inkRows(page, itemId) {
  const buf = await page.locator('.sb-object-text[data-id="' + itemId + '"] .sb-text').screenshot();
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let top = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * ch;
      if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  return { height: info.height, width: info.width, top, bottom, topGap: top, bottomGap: info.height - 1 - bottom };
}

// The fill and line are two <path> elements inside the bubble's <svg>.
async function bubbleInfo(page, itemId) {
  return page.evaluate((id) => {
    const el = document.querySelector('.sb-object[data-id="' + id + '"] .sb-text');
    if (!el) return null;
    const svg = el.querySelector(".sb-bubble");
    if (!svg) return { bubble: false };
    const fill = svg.querySelector(".sb-bubble-fill");
    const line = svg.querySelector(".sb-bubble-line");
    const fb = fill.getBBox();
    const lb = line.getBBox();
    const cs = getComputedStyle(line);
    return {
      bubble: true,
      fillD: fill.getAttribute("d"),
      lineD: line.getAttribute("d"),
      fillColour: getComputedStyle(fill).fill,
      lineColour: cs.stroke,
      lineWidth: parseFloat(cs.strokeWidth),
      lineClip: line.getAttribute("clip-path"),
      lineMask: line.getAttribute("mask"),
      fillBox: { w: Math.round(fb.width), h: Math.round(fb.height), x: Math.round(fb.x), y: Math.round(fb.y) },
      lineBox: { w: Math.round(lb.width), h: Math.round(lb.height), x: Math.round(lb.x), y: Math.round(lb.y) },
      textBackground: getComputedStyle(el).backgroundColor
    };
  }, itemId);
}

test.describe("Storyboard - speech bubbles", () => {
  test("the Text panel makes a round bubble: fill, line, and a tail on ONE path", async ({ page }) => {
    await seed(page, []);
    await page.locator('.sb-rail-btn[data-tool="text"]').click();
    await page.locator("#sbTextInput").fill("Hello there");
    await toggleBubble(page, true);
    await page.locator("#sbPlaceText").click();

    const info = await bubbleInfo(page, await page.evaluate(() => sbActiveBoard().items[0].id));
    expect(info.bubble).toBe(true);
    expect(info.fillD).toContain("Z");            // one closed shape
    expect(info.lineD).toContain("Z");
    expect(info.fillColour).toBe("rgb(255, 255, 255)");
    expect(info.lineColour).toBe("rgb(0, 0, 0)");
    expect(info.lineWidth).toBeGreaterThan(0);
    // The fill is the BUBBLE, not the text box.
    expect(info.textBackground).toBe("rgba(0, 0, 0, 0)");
    // The tail sticks out below the body: the shape is taller than the text box.
    expect(info.fillBox.h).toBeGreaterThan(40);

    const stored = (await storedScene(page)).items[0];
    expect(stored).toMatchObject({ bubble: "round", bg: "white", stroke: LINE, lineWidth: 2 });
    expect(stored.tail.dy).toBeGreaterThan(0);
  });

  test("dragging the tail handle moves the point and the border follows it", async ({ page }) => {
    await seed(page, [bubble("b1", "Point me", 40, 40)]);
    await page.locator('.sb-object-text[data-id="b1"]').click();
    const handle = page.locator('.sb-object-text[data-id="b1"] .sb-handle-tail');
    await expect(handle).toHaveCount(1);

    const before = await bubbleInfo(page, "b1");
    const box = await handle.boundingBox();
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 90, start.y + 30, { steps: 12 });
    await page.mouse.up();

    const stored = (await storedScene(page)).items[0];
    expect(stored.tail.dx).toBeGreaterThan(2);
    const after = await bubbleInfo(page, "b1");
    expect(after.fillD).not.toBe(before.fillD);
    expect(after.lineD).not.toBe(before.lineD);
    // The handle still sits on the drawn tip (inside the line path's bounds).
    const moved = await handle.boundingBox();
    expect(moved.x).toBeGreaterThan(box.x + 60);
  });

  test("line width and the space outside the line are configurable and persist", async ({ page }) => {
    await seed(page, [bubble("b1", "Widths", 45, 40)]);
    await page.locator('.sb-object-text[data-id="b1"]').dblclick();
    await setNumber(page, "sbLineWidth", 6);
    await setNumber(page, "sbLineGap", 10);
    await setPicker(page, "sbTextLine", "#ff0000");

    const info = await bubbleInfo(page, "b1");
    const scale = await page.evaluate(() => parseFloat(sbEls.canvas.style.getPropertyValue("--sb-design-scale")));
    // The ring stroke spans 2 x (space + width); the clip/mask carve the visible
    // band out of it (the band itself is measured in the margin test).
    expect(info.lineWidth).toBeCloseTo((10 + 6) * 2 * scale, 0);
    expect(info.lineColour).toBe("rgb(255, 0, 0)");
    expect(info.lineClip).toContain("url(#");
    expect(info.lineMask).toContain("url(#");
    await expect.poll(async () => (await storedScene(page)).items[0].lineWidth).toBe(6);
    await expect.poll(async () => (await storedScene(page)).items[0].lineGap).toBe(10);
    await expect.poll(async () => (await storedScene(page)).items[0].stroke).toBe("#ff0000");
  });

  test("the oval is a filled body with a single line just inside it", async ({ page }) => {
    await seed(page, [bubble("b1", "Oval", 45, 40, { bubble: "oval", lineWidth: 2, lineGap: 6 })]);
    const info = await bubbleInfo(page, "b1");
    expect(info.bubble).toBe(true);
    // ONE shape: the fill and the line share the same path, and the line is an
    // inner ring (clipped to the shape, masked back by the space) rather than a
    // separately generated inset outline that would drift at the tail.
    expect(info.lineD).toBe(info.fillD);
    expect(info.lineClip).toContain("url(#");
    expect(info.lineMask).toContain("url(#");
    // The ring's stroke reaches space + width in from the edge on BOTH sides.
    expect(info.lineWidth).toBeGreaterThan(2 * 6);
    expect(info.lineColour).toBe("rgb(0, 0, 0)");
  });

  test("a speech bubble and a border style are mutually exclusive", async ({ page }) => {
    await seed(page, [{ ...bubble("b1", "Framed", 45, 40, { border: "stamp" }) }]);
    // A stored bubble wins: the frame is dropped, so the panel can hide the tiles.
    await expect(page.locator('.sb-object-text[data-id="b1"] .sb-text')).toHaveAttribute("data-frame", "none");
    await page.locator('.sb-object-text[data-id="b1"]').dblclick();
    await expect(page.locator("#sbBubbleToggle")).toBeChecked();
    await expect(page.locator("#sbPanelBody .sb-border-option")).toHaveCount(0);
    // Switching the bubble off brings the border tiles back.
    await toggleBubble(page, false);
    await expect(page.locator("#sbBubbleToggle")).not.toBeChecked();
    await expect(page.locator("#sbPanelBody .sb-border-option").first()).toBeVisible();
  });

  test("a border frame uses the line width and space too", async ({ page }) => {
    await seed(page, [textBox("t1", "Framed", 45, 40, { border: "stamp", lineWidth: 18, lineGap: 0 })]);
    await page.locator('.sb-object-text[data-id="t1"]').dblclick();
    await expect(page.locator("#sbBubbleToggle")).not.toBeChecked();
    // The thickness/space controls are there for a frame as well.
    await setNumber(page, "sbLineWidth", 26);
    await setNumber(page, "sbLineGap", 6);
    const geom = await page.evaluate(() => {
      const el = document.querySelector('.sb-object-text[data-id="t1"] .sb-text');
      const cs = getComputedStyle(el);
      const scale = parseFloat(sbEls.canvas.style.getPropertyValue("--sb-design-scale"));
      return {
        border: parseFloat(cs.borderTopWidth),
        padTop: parseFloat(cs.paddingTop),
        padBase: 8 * scale,
        scale
      };
    });
    expect(geom.border).toBeCloseTo(26 * geom.scale, 0);
    // The space adds to the frame's inner padding.
    expect(geom.padTop - geom.padBase).toBeCloseTo(6 * geom.scale, 0);
    await expect.poll(async () => (await storedScene(page)).items[0].lineWidth).toBe(26);
    await expect.poll(async () => (await storedScene(page)).items[0].lineGap).toBe(6);
  });

  test("no Theme font: text uses a concrete family so the scene is theme-independent", async ({ page }) => {
    await seed(page, [{ ...textBox("t1", "Plain", 45, 40) }]);
    await page.locator('.sb-object-text[data-id="t1"]').dblclick();
    const labels = await page.evaluate(() => Array.prototype.map.call(
      document.querySelectorAll("#sbFontSelector .smd-select-item"), (n) => n.textContent.trim()
    ));
    expect(labels).not.toContain("Theme font");
    expect(labels).toContain("Lato");
    // A legacy `theme` font normalises to the concrete default and renders it.
    const info = await page.evaluate(() => {
      const el = document.querySelector('.sb-object-text[data-id="t1"] .sb-text');
      return { font: sbFindItem("t1").font, family: getComputedStyle(el).fontFamily };
    });
    expect(info.font).toBe("lato");
    expect(info.family.toLowerCase()).toContain("lato");
  });

  test("a tail just below a corner stays on that edge and does not fold", async ({ page }) => {
    // Tip 4px past the right edge but 22px BELOW the bottom edge: a perpendicular
    // edge pick chose the RIGHT side and the tail folded over the corner.
    await seed(page, [bubble("b1", "Corner", 45, 40, { tail: { dx: 0, dy: 0 } })]);
    await page.evaluate(() => {
      const item = sbFindItem("b1");
      const el = document.querySelector('.sb-object-text[data-id="b1"] .sb-text');
      const cw = sbEls.canvas.clientWidth, ch = sbEls.canvas.clientHeight;
      const m = sbBubbleMetrics(item, el.offsetWidth, el.offsetHeight, cw, ch);
      const right = (m.body.x + m.body.w) + 4;         // 4px past the right edge
      const bottom = (m.body.y + m.body.h) + 40;       // well below the bottom edge
      item.tail = { dx: right / cw * 100, dy: bottom / ch * 100 };
      sbRender();
    });
    const geom = await page.evaluate(() => {
      const el = document.querySelector('.sb-object-text[data-id="b1"] .sb-text');
      const fill = el.querySelector(".sb-bubble-fill");
      const nums = (fill.getAttribute("d").match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      const item = sbFindItem("b1");
      const m = sbBubbleMetrics(item, el.offsetWidth, el.offsetHeight,
        sbEls.canvas.clientWidth, sbEls.canvas.clientHeight);
      const b = fill.getBBox();
      return {
        baseEnd: { x: nums[0], y: nums[1] },
        edgeEnd: { x: nums[2], y: nums[3] },
        body: { right: m.body.x + m.body.w, bottom: m.body.y + m.body.h, top: m.body.y },
        tip: sbBubbleTipPoint(m, 0),
        bbox: { right: b.x + b.width, top: b.y, bottom: b.y + b.height }
      };
    });
    // The tail comes out of the BOTTOM edge (both points share its y)...
    expect(Math.abs(geom.baseEnd.y - geom.edgeEnd.y)).toBeLessThan(1);
    expect(geom.baseEnd.y).toBeGreaterThan(geom.body.bottom - 20);
    // ...so it cannot wrap the corner: its x never leaves the body's right edge.
    expect(geom.baseEnd.x).toBeLessThanOrEqual(geom.body.right + 1);
    expect(geom.edgeEnd.x).toBeLessThanOrEqual(geom.body.right + 1);
    // The drawn shape never reaches past the tip on the right, and never above the
    // body: a fold around the corner would do either.
    expect(geom.bbox.right).toBeLessThanOrEqual(Math.max(geom.body.right, geom.tip.x) + 3);
    expect(geom.bbox.top).toBeGreaterThanOrEqual(geom.body.top - 2);
    expect(geom.bbox.bottom).toBeGreaterThan(geom.body.bottom + 10);
  });

  test("dropping the tail on a sticker offers to group them, and the prompt expires", async ({ page }) => {
    await seed(page, [
      bubble("b1", "Talk to me", 40, 30, { tail: { dx: 0, dy: 10 } }),
      sticker("s1", "spaceman", 40, 55)
    ]);
    const target = await page.locator('.sb-object-sticker[data-id="s1"]').boundingBox();

    async function dropOnSticker() {
      await page.locator('.sb-object-text[data-id="b1"]').click();
      const handle = page.locator('.sb-object-text[data-id="b1"] .sb-handle-tail');
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
      await page.mouse.up();
    }

    await dropOnSticker();
    const prompt = page.locator("#sbGroupPrompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/spaceman/i);
    // Ignorable: it disappears on its own.
    await expect(prompt).toBeHidden({ timeout: 8000 });

    await dropOnSticker();
    await expect(prompt).toBeVisible();
    await page.locator("#sbGroupPromptYes").click();
    await expect(prompt).toBeHidden();
    const groups = (await storedScene(page)).groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].children.slice().sort()).toEqual(["b1", "s1"]);
  });

  test("Set as default gives the next text box the same look", async ({ page }) => {
    await seed(page, [bubble("b1", "Source", 40, 40)]);
    await page.locator('.sb-object-text[data-id="b1"]').dblclick();
    await toggleBubble(page, true);
    await pickBubbleType(page, "oval");
    await setNumber(page, "sbLineGap", 7);
    await setPicker(page, "sbTextLine", "#123456");
    // "Set as default" lives on the floating selection bar now.
    await page.locator("#sbSelSetDefault").click();

    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await page.locator('.sb-rail-btn[data-tool="text"]').click();
    await expect(page.locator("#sbBubbleToggle")).toBeChecked();
    await expect(page.locator("#sbBubbleType")).toHaveAttribute("value", "oval");
    await expect(page.locator("#sbLineGap")).toHaveValue("7");
    await page.locator("#sbTextInput").fill("Second");
    await page.locator("#sbPlaceText").click();

    const items = (await storedScene(page)).items;
    const created = items.find((i) => i.text === "Second");
    expect(created).toMatchObject({ bubble: "oval", stroke: "#123456", lineGap: 7 });
  });

  test("Copy style pastes one box's look onto another", async ({ page }) => {
    await seed(page, [
      bubble("b1", "Source", 30, 30, { bubble: "oval", stroke: "#abcdef", lineGap: 8 }),
      textBox("t2", "Target", 70, 60)
    ]);
    await page.locator('.sb-object-text[data-id="b1"]').click();
    await page.locator("#sbSelCopyStyle").click();

    await page.locator('.sb-object-text[data-id="t2"]').click();
    await page.locator("#sbSelPasteStyle").click();

    await expect.poll(async () => (await storedScene(page)).items.find((i) => i.id === "t2").bubble).toBe("oval");
    const target = (await storedScene(page)).items.find((i) => i.id === "t2");
    expect(target.stroke).toBe("#abcdef");
    expect(target.lineGap).toBe(8);
    // The text itself and its position are NOT copied.
    expect(target.text).toBe("Target");
    expect(target.x).toBe(70);
    await expect(page.locator('.sb-object-text[data-id="t2"] .sb-bubble')).toHaveCount(1);
  });

  test("the bubble and its tail are drawn into the exported JPG", async ({ page }) => {
    await seed(page, [bubble("b1", "Export me", 50, 45, { bg: "#00ff00", stroke: "#000000", tail: { dx: 0, dy: 22 } })]);
    const sample = await page.evaluate(async () => {
      const blob = await sbBoardJpegBlob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      // How many GREEN pixels are on one artwork row? (The fill is #00ff00.)
      const greenRow = (fy) => {
        const data = ctx.getImageData(0, Math.round(bitmap.height * fy), bitmap.width, 1).data;
        let green = 0;
        for (let x = 0; x < bitmap.width; x++) {
          const i = x * 4;
          if (data[i + 1] > 150 && data[i] < 120 && data[i + 2] < 120) green++;
        }
        return green;
      };
      // The bubble body sits on the item's row; the tail is half way to the tip.
      return { body: greenRow(0.45), tail: greenRow(0.56), size: [bitmap.width, bitmap.height] };
    });
    expect(sample.size[0]).toBeGreaterThan(100);
    expect(sample.body).toBeGreaterThan(100);   // the body is filled
    expect(sample.tail).toBeGreaterThan(2);     // and so is the tail
 
  });

  test("the text is vertically centred in its box, with or without descenders", async ({ page }) => {
    // White glyphs on a black box: the bright rows ARE the ink, so the gaps above
    // and below it can be measured. Before the trim the box kept the font's line
    // box, which reserves descender space, so the ink sat high.
    await seed(page, [
      textBox("t1", "HELLO", 40, 25, { bg: "black", color: "white" }),
      textBox("t2", "Aggy", 40, 45, { bg: "black", color: "white" }),
      textBox("t3", "Two\nlines", 40, 68, { bg: "black", color: "white" })
    ]);
    for (const id of ["t1", "t2", "t3"]) {
      const ink = await inkRows(page, id);
      expect(ink.top, id + " has ink").toBeGreaterThanOrEqual(0);
      expect(ink.topGap, id + " top gap").toBeGreaterThan(4);
      expect(ink.bottomGap, id + " bottom gap").toBeGreaterThan(4);
      // Centred: the two gaps match within a pixel of anti-aliasing.
      expect(Math.abs(ink.topGap - ink.bottomGap), id + " is centred").toBeLessThanOrEqual(2);
    }
    // The same holds for the exported JPG (the exporter draws from the same
    // baseline the trimmed box uses).
    const exportInk = await page.evaluate(async () => {
      const blob = await sbBoardJpegBlob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const item = sbFindItem("t1");
      const el = document.querySelector('.sb-object-text[data-id="t1"] .sb-text');
      const rect = el.getBoundingClientRect();
      const board = sbEls.canvas.getBoundingClientRect();
      const sx = bitmap.width / board.width;
      const sy = bitmap.height / board.height;
      const x0 = Math.round((rect.left - board.left) * sx);
      const y0 = Math.round((rect.top - board.top) * sy);
      const w = Math.round(rect.width * sx);
      const h = Math.round(rect.height * sy);
      const data = ctx.getImageData(x0, y0, w, h).data;
      let top = -1, bottom = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) {
            if (top < 0) top = y;
            bottom = y;
            break;
          }
        }
      }
      return { height: h, topGap: top, bottomGap: h - 1 - bottom, text: item.text };
    });
    expect(Math.abs(exportInk.topGap - exportInk.bottomGap), "JPG is centred too").toBeLessThanOrEqual(3);
  });

  test("the rectangular bubble is called Rectangle and keeps a radius", async ({ page }) => {
    await seed(page, [bubble("b1", "Boxy", 45, 40)]);
    await page.locator('.sb-object-text[data-id="b1"]').dblclick();
    await expect(page.locator("#sbBubbleToggle")).toBeChecked();
    const labels = await page.evaluate(() => Array.prototype.map.call(
      document.querySelectorAll("#sbBubbleType .smd-select-item"), (n) => n.textContent.trim()
    ));
    expect(labels).toEqual(["Rectangle", "Oval"]);
    // The stored type is unchanged ("round"), so old scenes keep working.
    expect((await storedScene(page)).items[0].bubble).toBe("round");
    await expect(page.locator("#sbBubbleType")).toHaveAttribute("value", "round");

    // The corner radius shapes the bubble body: a bigger radius rounds it more.
    const before = await page.evaluate(() => {
      const el = document.querySelector('.sb-object-text[data-id="b1"] .sb-text');
      return sbBubbleMetrics(sbFindItem("b1"), el.offsetWidth, el.offsetHeight,
        sbEls.canvas.clientWidth, sbEls.canvas.clientHeight).body.r;
    });
    await setNumber(page, "sbTextRadius", 40);
    const after = await page.evaluate(() => {
      const el = document.querySelector('.sb-object-text[data-id="b1"] .sb-text');
      return sbBubbleMetrics(sbFindItem("b1"), el.offsetWidth, el.offsetHeight,
        sbEls.canvas.clientWidth, sbEls.canvas.clientHeight).body.r;
    });
    expect(after).toBeGreaterThan(before);
    await expect.poll(async () => (await storedScene(page)).items[0].radius).toBe(40);
  });

  test("Copy/Paste/Set-as-default sit on the selection bar, not in the panel", async ({ page }) => {
    await seed(page, [
      bubble("b1", "Source", 30, 40, { bubble: "oval", stroke: "#abcdef", lineGap: 8 }),
      sticker("s1", "shark", 75, 40),
      textBox("t2", "Target", 30, 70)
    ]);
    const copy = page.locator("#sbSelCopyStyle");
    const paste = page.locator("#sbSelPasteStyle");
    const dflt = page.locator("#sbSelSetDefault");

    await page.locator('.sb-object-text[data-id="b1"]').click();
    await expect(copy).toBeVisible();
    await expect(paste).toBeVisible();
    await expect(dflt).toBeVisible();
    // Nothing copied yet: paste is offered but disabled.
    await expect(paste).toBeDisabled();
    await copy.click();
    await expect(paste).toBeEnabled();

    // Only a TEXT box offers them.
    await page.locator('.sb-object-sticker[data-id="s1"]').click();
    await expect(copy).toBeHidden();
    await expect(paste).toBeHidden();
    await expect(dflt).toBeHidden();

    // The panel keeps only "Reset default style".
    await page.locator('.sb-object-text[data-id="t2"]').dblclick();
    await expect(page.locator("#sbCopyStyle")).toHaveCount(0);
    await expect(page.locator("#sbPasteStyle")).toHaveCount(0);
    await expect(page.locator("#sbSetTextDefault")).toHaveCount(0);
    await expect(page.locator("#sbResetTextDefault")).toHaveCount(1);
  });

  test("a framed box paints its background UNDER the border", async ({ page }) => {
    await seed(page, [textBox("t1", "Framed", 45, 40, {
      bg: "white", color: "black", border: "stamp", lineWidth: 24, lineGap: 6, radius: 30
    })]);
    const geom = await page.evaluate(() => {
      const el = document.querySelector('.sb-object-text[data-id="t1"] .sb-text');
      const cs = getComputedStyle(el);
      return {
        backgroundClip: cs.backgroundClip,
        radius: parseFloat(cs.borderRadius),
        border: parseFloat(cs.borderTopWidth),
        scale: parseFloat(sbEls.canvas.style.getPropertyValue("--sb-design-scale")) || 1
      };
    });
    // The background is no longer clipped to the padding box, so it runs under
    // the frame, and the soft rectangle follows the radius control.
    expect(geom.backgroundClip).not.toContain("padding-box");
    expect(geom.border).toBeGreaterThan(10);
    expect(geom.radius).toBeCloseTo(30 * geom.scale, 0);

    // And the rendered border band shows the background between the stamp marks
    // (with the old padding-box clip the band was a hole onto the board).
    const buf = await page.locator('.sb-object-text[data-id="t1"] .sb-text').screenshot();
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    const bandBottom = Math.max(2, Math.round(geom.border * 0.75));
    let white = 0, total = 0;
    for (let y = 2; y < bandBottom; y++) {
      for (let x = Math.round(info.width * 0.3); x < Math.round(info.width * 0.7); x++) {
        const i = (y * info.width + x) * ch;
        total++;
        if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) white++;
      }
    }
    expect(total).toBeGreaterThan(50);
    expect(white / total, "background shows between the frame marks").toBeGreaterThan(0.2);

    // The radius control is honoured in the export too.
    const corner = await page.evaluate(async () => {
      const blob = await sbBoardJpegBlob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const el = document.querySelector('.sb-object-text[data-id="t1"] .sb-text');
      const rect = el.getBoundingClientRect();
      const board = sbEls.canvas.getBoundingClientRect();
      const sx = bitmap.width / board.width;
      const sy = bitmap.height / board.height;
      const px = Math.round((rect.left - board.left + 1) * sx);
      const py = Math.round((rect.top - board.top + 1) * sy);
      const d = ctx.getImageData(px, py, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    });
    // The very corner pixel is OUTSIDE the rounded background, so it is not white.
    expect(corner.r < 250 || corner.g < 250 || corner.b < 250).toBe(true);
  });

  test("a tail pulled diagonally past a corner stays a solid tail", async ({ page }) => {
    await seed(page, [
      bubble("d1", "Corner", 20, 22),
      bubble("d2", "Far", 50, 22),
      bubble("d3", "Lean", 80, 22)
    ]);
    // Put the tips on the CORNER ray (and one plain 45-degree pull): that is the
    // direction that used to make the two sides cross and the fill collapse to a
    // sliver at the corner.
    const geom = await page.evaluate(() => {
      const cw = sbEls.canvas.clientWidth, ch = sbEls.canvas.clientHeight;
      const bodyOf = (id) => {
        const el = document.querySelector('.sb-object-text[data-id="' + id + '"] .sb-text');
        return sbBubbleMetrics(sbFindItem(id), el.offsetWidth, el.offsetHeight, cw, ch);
      };
      const put = (id, tipPx) => {
        const item = sbFindItem(id);
        item.tail = { dx: tipPx.x / cw * 100, dy: tipPx.y / ch * 100 };
        sbUpdateBubble(item);
      };
      const alongCorner = (id, dist) => {
        const m = bodyOf(id);
        const c = { x: m.body.x + m.body.w, y: m.body.y + m.body.h };
        const d = { x: m.body.w / 2, y: m.body.h / 2 };
        const L = Math.hypot(d.x, d.y);
        put(id, { x: c.x + d.x / L * dist, y: c.y + d.y / L * dist });
      };
      alongCorner("d1", 40);
      alongCorner("d2", 120);
      const m3 = bodyOf("d3");
      put("d3", { x: m3.body.x + m3.body.w + 50, y: m3.body.y + m3.body.h + 50 });

      const out = {};
      ["d1", "d2", "d3"].forEach((id) => {
        const el = document.querySelector('.sb-object-text[data-id="' + id + '"] .sb-text');
        const d = String(el.querySelector(".sb-bubble-fill").getAttribute("d"));
        // "M <baseEnd> ... <baseStart> Q <tip> ...": the mouth's two points are the
        // first pair and the LAST pair before the tail curve (that end can be an
        // arc endpoint now, so no assumption about L vs A).
        const head = d.split(" Q ")[0];
        const nums = (head.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        const hit = d.match(/Q\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)/);
        out[id] = {
          tip: hit ? { x: Number(hit[1]), y: Number(hit[2]) } : null,
          mouth: nums.length >= 4
            ? { x: (nums[0] + nums[nums.length - 2]) / 2, y: (nums[1] + nums[nums.length - 1]) / 2 }
            : null
        };
      });
      return out;
    });

    expect(geom.d1.mouth).not.toBeNull();
    for (const id of ["d1", "d2", "d3"]) {
      const g = geom[id];
      // Walk the tail's OWN axis and check it is FILLED at 50% and 70% of the way
      // out (a self-intersecting path leaves it hollow there).
      const base = g.mouth;
      expect(Math.hypot(g.tip.x - base.x, g.tip.y - base.y)).toBeGreaterThan(20);
      for (const f of [0.5, 0.7]) {
        const px = { x: base.x + (g.tip.x - base.x) * f, y: base.y + (g.tip.y - base.y) * f };
        const c = await colourAt(page, id, px);
        expect(c.r, id + " tail filled at " + f).toBeGreaterThan(220);
        expect(c.g, id + " tail filled at " + f).toBeGreaterThan(220);
        expect(c.b, id + " tail filled at " + f).toBeGreaterThan(220);
      }
    }
  });

  test("the tail's mouth straddles a corner instead of squashing into it", async ({ page }) => {
    await seed(page, [
      bubble("c1", "Straight", 45, 25),
      bubble("c2", "Corner", 45, 70)
    ]);
    const geom = await page.evaluate(() => {
      const cw = sbEls.canvas.clientWidth, ch = sbEls.canvas.clientHeight;
      const bodyOf = (id) => {
        const el = document.querySelector('.sb-object-text[data-id="' + id + '"] .sb-text');
        return sbBubbleMetrics(sbFindItem(id), el.offsetWidth, el.offsetHeight, cw, ch);
      };
      const put = (id, tipPx) => {
        const item = sbFindItem(id);
        item.tail = { dx: tipPx.x / cw * 100, dy: tipPx.y / ch * 100 };
        sbUpdateBubble(item);
      };
      // c1: straight down from the bottom edge (no corner involved).
      let m = bodyOf("c1");
      put("c1", { x: 0, y: m.body.y + m.body.h + 100 });
      // c2: the same length, but along the BOTTOM-RIGHT corner ray.
      m = bodyOf("c2");
      const corner = { x: m.body.x + m.body.w, y: m.body.y + m.body.h };
      const dir = { x: m.body.w / 2, y: m.body.h / 2 };
      const dl = Math.hypot(dir.x, dir.y);
      put("c2", { x: corner.x + dir.x / dl * 100, y: corner.y + dir.y / dl * 100 });

      const out = {};
      ["c1", "c2"].forEach((id) => {
        const el = document.querySelector('.sb-object-text[data-id="' + id + '"] .sb-text');
        const mm = sbBubbleMetrics(sbFindItem(id), el.offsetWidth, el.offsetHeight, cw, ch);
        const d = String(el.querySelector(".sb-bubble-fill").getAttribute("d"));
        // The path is "M <baseEnd> ... <baseStart> Q <tip> ...", so the mouth's
        // two points are the first pair and the LAST pair before the tail curve.
        const head = d.split(" Q ")[0];
        const nums = (head.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        out[id] = {
          body: mm.body,
          end: { x: nums[0], y: nums[1] },
          start: { x: nums[nums.length - 2], y: nums[nums.length - 1] }
        };
      });
      return out;
    });

    const near = (a, b) => Math.abs(a - b) <= 2;
    const b = geom.c2.body;
    const right = b.x + b.w, bottom = b.y + b.h;
    const pts = [geom.c2.start, geom.c2.end];
    // ONE mouth point on the bottom edge, the OTHER on the right edge: the mouth
    // wraps the corner. Both on one edge means the mouth was squashed there.
    expect(pts.filter((p) => near(p.y, bottom) && p.x < right - 2).length, "one point on the bottom").toBe(1);
    expect(pts.filter((p) => near(p.x, right) && p.y < bottom - 2).length, "one point on the right").toBe(1);

    // And the mouth is as wide at the corner as it is for a straight-down tail of
    // the same length (it used to be squeezed against the corner).
    const chord = (g) => Math.hypot(g.start.x - g.end.x, g.start.y - g.end.y);
    expect(chord(geom.c2)).toBeGreaterThan(chord(geom.c1) * 0.7);
  });

  test("the white margin round the line is the same everywhere, the tail included", async ({ page }) => {
    const GAP = 9, LINE = 3;
    await seed(page, [bubble("b1", "Hello 2", 40, 40, {
      bubble: "round", bg: "#ffffff", stroke: "#ff0000",
      lineWidth: LINE, lineGap: GAP, tail: { dx: 0, dy: 34 }
    })]);
    const geom = await page.evaluate(() => {
      const el = document.querySelector('.sb-object-text[data-id="b1"] .sb-text');
      const d = el.querySelector(".sb-bubble-fill").getAttribute("d");
      const start = String(d).match(/^M\s+([-\d.]+)\s+([-\d.]+)/);
      const before = String(d).match(/L\s+([-\d.]+)\s+([-\d.]+)\s+Q/);
      const hit = String(d).match(/Q\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)/);
      const m = sbBubbleMetrics(sbFindItem("b1"), el.offsetWidth, el.offsetHeight,
        sbEls.canvas.clientWidth, sbEls.canvas.clientHeight);
      return {
        mouth: { x: (Number(start[1]) + Number(before[1])) / 2, y: (Number(start[2]) + Number(before[2])) / 2 },
        tip: { x: Number(hit[1]), y: Number(hit[2]) },
        body: m.body
      };
    });

    // Walk a ray from the middle of the tail (and from the middle of the body's
    // left side) outwards and describe the paint: fill, then the LINE, then the
    // margin, then the board. The margin must be lineGap on BOTH sides of the tail
    // and the band must be lineWidth - a shape-hugging line has no margin where it
    // meets the corner.
    const sample = await bubbleSampler(page, "b1");
    async function profile(from, dir, reach) {
      const flags = [];
      for (let i = 0; i <= reach; i++) {
        const c = sample({ x: from.x + dir.x * i, y: from.y + dir.y * i });
        flags.push(isLine(c) ? "r" : isWhite(c) ? "w" : ".");
      }
      // Walking OUT of the shape: fill/nothing, then the red line, then the white
      // margin, then the board. `edge` is the outermost white pixel (the shape's
      // own edge - the margin is white too).
      let edge = -1;
      for (let i = flags.length - 1; i >= 0; i--) if (flags[i] === "w") { edge = i; break; }
      let b1 = -1;
      for (let i = edge; i >= 0; i--) if (flags[i] === "r") { b1 = i; break; }
      let b0 = b1;
      while (b0 - 1 >= 0 && flags[b0 - 1] === "r") b0--;
      return { flags: flags.join(""), edge, margin: b1 < 0 ? -1 : edge - b1, width: b1 < 0 ? 0 : b1 - b0 + 1 };
    }

    const ax = { x: geom.tip.x - geom.mouth.x, y: geom.tip.y - geom.mouth.y };
    const len = Math.hypot(ax.x, ax.y);
    const u = { x: ax.x / len, y: ax.y / len };
    const n = { x: -u.y, y: u.x };
    const mid = { x: geom.mouth.x + ax.x * 0.5, y: geom.mouth.y + ax.y * 0.5 };
    const sides = [];
    for (const sign of [1, -1]) {
      sides.push(await profile(mid, { x: n.x * sign, y: n.y * sign }, 40));
    }
    for (const p of sides) {
      expect(p.margin, "tail margin (" + p.flags + ")").toBeGreaterThan(GAP - 2.5);
      expect(p.margin, "tail margin (" + p.flags + ")").toBeLessThan(GAP + 2.5);
      expect(p.width, "line width (" + p.flags + ")").toBeGreaterThan(LINE - 2);
      expect(p.width, "line width (" + p.flags + ")").toBeLessThan(LINE + 2);
    }
    // Both sides of the tail have the SAME margin (the line is parallel to the
    // bubble's edge, not pinched against it on one side).
    expect(Math.abs(sides[0].margin - sides[1].margin)).toBeLessThanOrEqual(1.5);

    // The body's left side keeps the same margin, so the ring is uniform.
    const bodyMidY = (geom.body.y + geom.body.y + geom.body.h) / 2;
    const body = await profile(
      { x: geom.body.x + 12, y: bodyMidY },
      { x: -1, y: 0 },
      40
    );
    expect(body.margin, "body margin (" + body.flags + ")").toBeGreaterThan(GAP - 2.5);
    expect(body.margin, "body margin (" + body.flags + ")").toBeLessThan(GAP + 2.5);
    expect(body.width, "body line width (" + body.flags + ")").toBeGreaterThan(LINE - 2);
    expect(body.width, "body line width (" + body.flags + ")").toBeLessThan(LINE + 2);
  });

  test("the bubble fields travel with the scene (MinIO / OneDrive payload)", async ({ page }) => {
    await seed(page, [bubble("b1", "Backed up", 40, 40, { bubble: "oval", stroke: "#112233", lineGap: 4 })]);
    const payload = await page.evaluate(async () => JSON.stringify(await sbStoryBackupPayload(sbActiveStory())));
    expect(payload).toContain('"bubble":"oval"');
    expect(payload).toContain('"stroke":"#112233"');
    expect(payload).toContain('"lineGap":4');
    expect(payload).toContain('"radius":');
    expect(payload).toContain('"tail":{"dx":0,"dy":26}');
  });
});
