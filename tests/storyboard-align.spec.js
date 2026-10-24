const { test, expect } = require("@playwright/test");

// Storyboard multi-selection alignment + distribution.
//
// One "Align" button appears in the floating selection bar when 2+ objects are
// selected. Hovering it (or tapping it on touch) expands a second row with the
// six align actions and, with 3+ objects, the two distribute actions. The
// actions work on each selected TOP-LEVEL node (a leaf or a whole group) using
// its rendered AABB. Distribute equalises the gaps between adjacent edges and
// leaves the outer objects where they are.

function sticker(id, x, y, extra) {
  return Object.assign({
    id,
    type: "sticker",
    sticker: "mermaid",
    x,
    y,
    scale: 1,
    rotation: 0,
    z: 1,
    flipX: false,
    flipY: false
  }, extra || {});
}

function makeBoard(id, items) {
  return { id, name: "Align", background: "", items, connectors: [] };
}

const ALIGN_BOARD = () => makeBoard("align", [
  sticker("a", 20, 20, { z: 1, scale: 1 }),
  sticker("b", 50, 50, { z: 2, scale: 1.5 }),
  sticker("c", 80, 80, { z: 3, scale: 0.8 })
]);

async function seedBoard(page, board) {
  await page.goto("/");
  await page.evaluate((b) => {
    localStorage.setItem("storyboard_stories", JSON.stringify([{
      id: "story-" + b.id,
      name: "Story 1",
      scenes: [b],
      activeSceneId: b.id
    }]));
    localStorage.setItem("storyboard_activeStory", "story-" + b.id);
    localStorage.setItem("storyboard_activeScene", b.id);
  }, board);
  await page.goto("/Storyboard/");
  await expect(page.locator("#sbCanvas")).toBeVisible();
  await expect(page.locator('.sb-object[data-id="' + board.items[0].id + '"]')).toBeVisible();
}

// Viewport rects of every rendered object, keyed by id.
function objectRects(page) {
  return page.evaluate(() => {
    const out = {};
    document.querySelectorAll(".sb-object").forEach((el) => {
      const r = el.getBoundingClientRect();
      out[el.dataset.id] = {
        left: r.left, top: r.top, right: r.right, bottom: r.bottom,
        width: r.width, height: r.height,
        cx: r.left + r.width / 2, cy: r.top + r.height / 2
      };
    });
    return out;
  });
}

async function selectAll(page) {
  await page.locator('.sb-object[data-id="a"]').click();
  await page.locator('.sb-object[data-id="b"]').click({ modifiers: ["Control"] });
  await page.locator('.sb-object[data-id="c"]').click({ modifiers: ["Control"] });
  await expect(page.locator("#sbSelAlign")).toBeVisible();
}

// The options live in a row that only expands on hover/click.
async function openAlignMenu(page) {
  await page.locator("#sbSelAlign").hover();
  await expect(page.locator("#sbSelAlignRow")).toBeVisible();
}

function targetFor(mode, rects) {
  const ids = Object.keys(rects);
  const min = (key) => Math.min(...ids.map((id) => rects[id][key]));
  const max = (key) => Math.max(...ids.map((id) => rects[id][key]));
  if (mode === "left") return min("left");
  if (mode === "right") return max("right");
  if (mode === "top") return min("top");
  if (mode === "bottom") return max("bottom");
  if (mode === "midX") return (min("left") + max("right")) / 2;
  return (min("top") + max("bottom")) / 2; // midY
}

function valueFor(mode, rect) {
  if (mode === "left") return rect.left;
  if (mode === "right") return rect.right;
  if (mode === "top") return rect.top;
  if (mode === "bottom") return rect.bottom;
  if (mode === "midX") return rect.cx;
  return rect.cy;
}

const ALIGN_CASES = [
  { button: "sbAlignLeft", mode: "left" },
  { button: "sbAlignCenterH", mode: "midX" },
  { button: "sbAlignRight", mode: "right" },
  { button: "sbAlignTop", mode: "top" },
  { button: "sbAlignMiddleV", mode: "midY" },
  { button: "sbAlignBottom", mode: "bottom" }
];

test.describe("Storyboard - align and distribute", () => {

  test("one Align button lights up for 2+, and expands on hover", async ({ page }) => {
    await seedBoard(page, ALIGN_BOARD());
    const button = page.locator("#sbSelAlign");
    const row = page.locator("#sbSelAlignRow");
    await expect(button).toHaveCount(1);
    await expect(row).toHaveCount(1);
    await expect(button).toBeHidden();
    await expect(row).toBeHidden();

    // one object: nothing to align
    await page.locator('.sb-object[data-id="a"]').click();
    await expect(button).toBeHidden();
    await expect(row).toBeHidden();

    // two objects: the button lights up, but the options are collapsed
    await page.locator('.sb-object[data-id="b"]').click({ modifiers: ["Control"] });
    await expect(button).toBeVisible();
    await expect(row).toBeHidden();

    // hover expands all six align actions; distribute needs 3+
    await page.locator("#sbSelAlign").hover();
    await expect(row).toBeVisible();
    for (const c of ALIGN_CASES) await expect(page.locator("#" + c.button)).toBeVisible();
    await expect(page.locator("#sbDistributeH")).toBeHidden();
    await expect(page.locator("#sbDistributeV")).toBeHidden();

    // 3 objects: distribute lights up too (re-hover after clicking the object)
    await page.locator('.sb-object[data-id="c"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelAlign").hover();
    await expect(row).toBeVisible();
    await expect(page.locator("#sbDistributeH")).toBeVisible();
    await expect(page.locator("#sbDistributeV")).toBeVisible();
  });

  test("the expanded options collapse when the pointer leaves the bar", async ({ page }) => {
    await seedBoard(page, ALIGN_BOARD());
    await selectAll(page);
    const row = page.locator("#sbSelAlignRow");
    await expect(row).toBeHidden();

    await openAlignMenu(page);
    await page.mouse.move(8, 8);
    await expect(row).toBeHidden({ timeout: 2000 });
  });

  for (const align of ALIGN_CASES) {
    test(align.button + " aligns every object on " + align.mode, async ({ page }) => {
      await seedBoard(page, ALIGN_BOARD());
      await selectAll(page);
      const before = await objectRects(page);
      const target = targetFor(align.mode, before);

      await openAlignMenu(page);
      await page.locator("#" + align.button).click();
      const after = await objectRects(page);
      for (const id of Object.keys(after)) {
        expect(Math.abs(valueFor(align.mode, after[id]) - target),
          id + " on " + align.mode).toBeLessThan(1.2);
      }
    });
  }

  test("distribute horizontally equalises the gaps and pins the outer objects", async ({ page }) => {
    await seedBoard(page, ALIGN_BOARD());
    await selectAll(page);
    const before = await objectRects(page);
    const order = ["a", "b", "c"].sort((x, y) => before[x].left - before[y].left);
    const first = before[order[0]];
    const last = before[order[2]];

    await openAlignMenu(page);
    await page.locator("#sbDistributeH").click();
    const after = await objectRects(page);
    const gap1 = after[order[1]].left - after[order[0]].right;
    const gap2 = after[order[2]].left - after[order[1]].right;
    expect(Math.abs(gap1 - gap2)).toBeLessThan(1.2);
    expect(Math.abs(after[order[0]].left - first.left)).toBeLessThan(1.2);
    expect(Math.abs(after[order[2]].right - last.right)).toBeLessThan(1.2);
    for (const id of order) expect(Math.abs(after[id].top - before[id].top)).toBeLessThan(1.2);
  });

  test("distribute vertically equalises the gaps and pins the outer objects", async ({ page }) => {
    await seedBoard(page, ALIGN_BOARD());
    await selectAll(page);
    const before = await objectRects(page);
    const order = ["a", "b", "c"].sort((x, y) => before[x].top - before[y].top);
    const first = before[order[0]];
    const last = before[order[2]];

    await openAlignMenu(page);
    await page.locator("#sbDistributeV").click();
    const after = await objectRects(page);
    const gap1 = after[order[1]].top - after[order[0]].bottom;
    const gap2 = after[order[2]].top - after[order[1]].bottom;
    expect(Math.abs(gap1 - gap2)).toBeLessThan(1.2);
    expect(Math.abs(after[order[0]].top - first.top)).toBeLessThan(1.2);
    expect(Math.abs(after[order[2]].bottom - last.bottom)).toBeLessThan(1.2);
    for (const id of order) expect(Math.abs(after[id].left - before[id].left)).toBeLessThan(1.2);
  });

  test("a group aligns as ONE unit, not member by member", async ({ page }) => {
    await seedBoard(page, makeBoard("align-group", [
      sticker("a", 30, 40, { z: 1 }),
      sticker("b", 70, 60, { z: 2 }),
      sticker("c", 90, 20, { z: 3 })
    ]));
    await page.locator('.sb-object[data-id="a"]').click();
    await page.locator('.sb-object[data-id="b"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();
    await page.locator('.sb-object[data-id="c"]').click({ modifiers: ["Control"] });
    await expect(page.locator("#sbSelAlign")).toBeVisible();

    const before = await objectRects(page);
    const groupLeft = Math.min(before.a.left, before.b.left);
    const target = Math.min(groupLeft, before.c.left);
    await openAlignMenu(page);
    await page.locator("#sbAlignLeft").click();
    const after = await objectRects(page);
    expect(Math.abs(Math.min(after.a.left, after.b.left) - target)).toBeLessThan(1.2);
    expect(Math.abs(after.c.left - target)).toBeLessThan(1.2);
    expect(Math.abs((after.b.left - after.a.left) - (before.b.left - before.a.left))).toBeLessThan(0.05);
  });

  test("alignment is persisted with the items", async ({ page }) => {
    await seedBoard(page, ALIGN_BOARD());
    await selectAll(page);
    await openAlignMenu(page);
    await page.locator("#sbAlignLeft").click();
    const before = await objectRects(page);

    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await expect(page.locator(".sb-object").first()).toBeVisible();
    const after = await objectRects(page);
    expect(Math.abs(after.a.left - after.b.left)).toBeLessThan(1.2);
    expect(Math.abs(after.a.left - after.c.left)).toBeLessThan(1.2);
    expect(Math.abs(after.a.left - before.a.left)).toBeLessThan(2);
  });
});
