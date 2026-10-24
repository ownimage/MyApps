const { test, expect } = require("@playwright/test");

// Storyboard multi-select + groups.
//
// A group is PERSISTED as board.groups = [{ id, children: [leafId | groupId] }]
// (a forest; a group can contain other groups). There is no group transform of
// its own: move/scale/rotate COMPOSE the result into every leaf under it, so the
// flat item list, connectors and the JPG export keep working unchanged.
//
// Selection UI: the floating action bar gains #sbSelGroup (2+ selected nodes) and
// #sbSelUngroup (exactly one group). A multi/group selection gets ONE
// #sbSelectionBox with scale/rotate handles instead of per-object handles.

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
  return { id, name: "Groups", background: "", items, connectors: [] };
}

async function seedBoard(page, b) {
  await page.goto("/");
  await page.evaluate((seed) => {
    localStorage.setItem("storyboard_boards", JSON.stringify([seed]));
    localStorage.setItem("storyboard_activeBoard", seed.id);
    localStorage.removeItem("storyboard_zoom");
  }, b);
  await page.goto("/Storyboard/");
  await expect(page.locator("#sbCanvas")).toBeVisible();
  await expect(page.locator('.sb-object[data-id="' + b.items[0].id + '"]')).toBeVisible();
}

function storedBoard(page) {
  return page.evaluate(() => {
    const boards = JSON.parse(localStorage.getItem("storyboard_boards"));
    return boards.find((b) => b.id === sbState.activeId) || boards[0];
  });
}

function itemState(page, id) {
  return page.evaluate((itemId) => {
    const it = sbFindItem(itemId);
    return it ? { x: it.x, y: it.y, scale: it.scale, rotation: it.rotation } : null;
  }, id);
}

function selectionState(page) {
  return page.evaluate(() => ({
    ids: (sbState.selectedIds || []).slice(),
    selectedId: sbState.selectedId || ""
  }));
}

function canvasMetrics(page) {
  return page.evaluate(() => {
    const r = document.getElementById("sbCanvas").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
}

function objectBox(page, id) {
  return page.locator('.sb-object[data-id="' + id + '"]').boundingBox();
}

async function dragObject(page, id, dx, dy) {
  const b = await objectBox(page, id);
  const sx = b.x + b.width / 2;
  const sy = b.y + b.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + dx, sy + dy, { steps: 8 });
  await page.mouse.up();
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const AB = () => makeBoard("groups-ab", [
  sticker("ga", 40, 50, { z: 1 }),
  sticker("gb", 60, 50, { z: 2 })
]);

const ABC = () => makeBoard("groups-abc", [
  sticker("ga", 30, 40, { z: 1 }),
  sticker("gb", 70, 60, { z: 2 }),
  sticker("gc", 50, 80, { z: 3 })
]);

test.describe("Storyboard - multi-select and groups", () => {

  test("Group is only offered with 2+ selected nodes and creates a persisted group", async ({ page }) => {
    await seedBoard(page, ABC());

    const groupBtn = page.locator("#sbSelGroup");
    const ungroupBtn = page.locator("#sbSelUngroup");
    await expect(groupBtn).toHaveCount(1);
    await expect(ungroupBtn).toHaveCount(1);

    // nothing selected
    await expect(groupBtn).toBeHidden();
    await expect(ungroupBtn).toBeHidden();

    // one selected
    await page.locator('.sb-object[data-id="ga"]').click();
    await expect(groupBtn).toBeHidden();
    await expect(ungroupBtn).toBeHidden();

    // two selected (Ctrl+click toggles in)
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await expect(page.locator(".sb-object.sb-member")).toHaveCount(2);
    await expect(groupBtn).toBeVisible();
    await expect(ungroupBtn).toBeHidden();

    await groupBtn.click();
    const board = await storedBoard(page);
    expect(board.groups).toHaveLength(1);
    expect(board.groups[0].children.slice().sort()).toEqual(["ga", "gb"]);

    // the group is now the selection: Ungroup appears, Group does not
    await expect(ungroupBtn).toBeVisible();
    await expect(groupBtn).toBeHidden();
    await expect(page.locator("#sbSelectionBox")).toBeVisible();
    const sel = await selectionState(page);
    expect(sel.ids).toEqual([board.groups[0].id]);
    expect(sel.selectedId).toBe("");
  });

  test("Ctrl+click toggles an object back out of the selection", async ({ page }) => {
    await seedBoard(page, ABC());
    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await expect(page.locator(".sb-object.sb-member")).toHaveCount(2);
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await expect(page.locator(".sb-object.sb-member")).toHaveCount(0);
    expect((await selectionState(page)).ids).toEqual(["ga"]);
    await expect(page.locator("#sbSelGroup")).toBeHidden();
  });

  test("clicking a grouped object selects the group and shows one handle box", async ({ page }) => {
    await seedBoard(page, ABC());
    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();

    await page.locator('.sb-object[data-id="gc"]').click();
    await expect(page.locator("#sbSelectionBox")).toBeHidden();
    // a single object keeps its own per-object handles
    await expect(page.locator('.sb-object[data-id="gc"].selected .sb-handle-scale')).toBeVisible();

    await page.locator('.sb-object[data-id="ga"]').click();
    await expect(page.locator("#sbSelectionBox")).toBeVisible();
    await expect(page.locator("#sbSelectionBox .sb-handle-scale")).toBeVisible();
    await expect(page.locator("#sbSelectionBox .sb-handle-rotate")).toBeVisible();
    await expect(page.locator('.sb-object[data-id="ga"].selected')).toHaveCount(0);
    await expect(page.locator("#sbSelUngroup")).toBeVisible();
  });

  test("moving a group moves every member by the same delta", async ({ page }) => {
    await seedBoard(page, AB());
    const before = { a: await itemState(page, "ga"), b: await itemState(page, "gb") };
    const canvas = await canvasMetrics(page);

    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();

    const dx = 90;
    const dy = 45;
    await dragObject(page, "ga", dx, dy);

    const after = { a: await itemState(page, "ga"), b: await itemState(page, "gb") };
    const expectDx = dx / canvas.w * 100;
    const expectDy = dy / canvas.h * 100;
    expect(Math.abs((after.a.x - before.a.x) - expectDx)).toBeLessThan(0.8);
    expect(Math.abs((after.b.x - before.b.x) - expectDx)).toBeLessThan(0.8);
    expect(Math.abs((after.a.y - before.a.y) - expectDy)).toBeLessThan(0.8);
    expect(Math.abs((after.b.y - before.b.y) - expectDy)).toBeLessThan(0.8);
    // the members keep their relative offsets
    expect(Math.abs((after.b.x - after.a.x) - (before.b.x - before.a.x))).toBeLessThan(0.05);
  });

  test("scaling a group scales the members and their offsets from its centre", async ({ page }) => {
    await seedBoard(page, AB());
    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();

    const box = await page.locator("#sbSelectionBox").boundingBox();
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const handle = await page.locator("#sbSelectionBox .sb-handle-scale").boundingBox();
    const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    const factor = 1.5;
    const target = {
      x: centre.x + (start.x - centre.x) * factor,
      y: centre.y + (start.y - centre.y) * factor
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 10 });
    await page.mouse.up();

    const a = await itemState(page, "ga");
    const b = await itemState(page, "gb");
    expect(Math.abs(a.scale - factor)).toBeLessThan(0.08);
    expect(Math.abs(b.scale - factor)).toBeLessThan(0.08);
    // offsets from the centre (50,50) scale by the same factor: 40/60 -> 35/65
    expect(Math.abs(a.x - (50 - 10 * factor))).toBeLessThan(0.8);
    expect(Math.abs(b.x - (50 + 10 * factor))).toBeLessThan(0.8);
    // the group centre did not drift
    expect(Math.abs((a.y + b.y) / 2 - 50)).toBeLessThan(0.8);
  });

  test("rotating a group rotates the members around its centre and keeps their distance", async ({ page }) => {
    await seedBoard(page, AB());
    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();

    const box = await page.locator("#sbSelectionBox").boundingBox();
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const rotate = await page.locator("#sbSelectionBox .sb-handle-rotate").boundingBox();
    const start = { x: rotate.x + rotate.width / 2, y: rotate.y + rotate.height / 2 };
    const radius = Math.abs(start.y - centre.y);
    // start is above the centre (-90deg); move to the right of it (0deg) -> +90
    const target = { x: centre.x + radius, y: centre.y };

    const aBefore = await objectBox(page, "ga");
    const bBefore = await objectBox(page, "gb");
    const centrePx = { x: centre.x, y: centre.y };
    const aDistBefore = dist({ x: aBefore.x + aBefore.width / 2, y: aBefore.y + aBefore.height / 2 }, centrePx);
    const bDistBefore = dist({ x: bBefore.x + bBefore.width / 2, y: bBefore.y + bBefore.height / 2 }, centrePx);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await page.mouse.up();

    const a = await itemState(page, "ga");
    const b = await itemState(page, "gb");
    expect(Math.abs(a.rotation - 90)).toBeLessThan(3);
    expect(Math.abs(b.rotation - 90)).toBeLessThan(3);

    const aAfter = await objectBox(page, "ga");
    const bAfter = await objectBox(page, "gb");
    const aDistAfter = dist({ x: aAfter.x + aAfter.width / 2, y: aAfter.y + aAfter.height / 2 }, centrePx);
    const bDistAfter = dist({ x: bAfter.x + bAfter.width / 2, y: bAfter.y + bAfter.height / 2 }, centrePx);
    expect(Math.abs(aDistAfter - aDistBefore)).toBeLessThan(4);
    expect(Math.abs(bDistAfter - bDistBefore)).toBeLessThan(4);
    // the left/right pair is now an above/below pair
    expect(aAfter.y + aAfter.height / 2).toBeLessThan(centrePx.y);
    expect(bAfter.y + bAfter.height / 2).toBeGreaterThan(centrePx.y);
  });

  test("a loose multi-selection can be moved before it is grouped", async ({ page }) => {
    await seedBoard(page, AB());
    const canvas = await canvasMetrics(page);
    const before = { a: await itemState(page, "ga"), b: await itemState(page, "gb") };
    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    expect((await storedBoard(page)).groups || []).toHaveLength(0);

    await dragObject(page, "ga", 60, 0);
    const after = { a: await itemState(page, "ga"), b: await itemState(page, "gb") };
    expect(Math.abs((after.a.x - before.a.x) - 60 / canvas.w * 100)).toBeLessThan(0.8);
    expect(Math.abs((after.b.x - before.b.x) - 60 / canvas.w * 100)).toBeLessThan(0.8);
  });

  test("groups nest and Ungroup peels one level at a time", async ({ page }) => {
    await seedBoard(page, ABC());
    // group A+B
    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();
    const inner = (await storedBoard(page)).groups[0].id;

    // add C and group again -> outer group contains [inner, C]
    await page.locator('.sb-object[data-id="gc"]').click({ modifiers: ["Control"] });
    expect((await selectionState(page)).ids).toHaveLength(2);
    await page.locator("#sbSelGroup").click();
    const board = await storedBoard(page);
    expect(board.groups).toHaveLength(2);
    const outer = board.groups.find((g) => g.id !== inner);
    expect(outer.children.slice().sort()).toEqual([inner, "gc"].sort());

    // selecting a member selects the OUTER group
    await page.locator('.sb-object[data-id="ga"]').click();
    expect((await selectionState(page)).ids).toEqual([outer.id]);

    // ungroup once: inner group + C stay, inner is intact
    await page.locator("#sbSelUngroup").click();
    let mid = await storedBoard(page);
    expect(mid.groups.map((g) => g.id)).toEqual([inner]);
    expect(mid.groups[0].children.slice().sort()).toEqual(["ga", "gb"]);
    expect((await selectionState(page)).ids.slice().sort()).toEqual([inner, "gc"].sort());

    // select the inner group and ungroup it too
    await page.locator('.sb-object[data-id="ga"]').click();
    await expect(page.locator("#sbSelUngroup")).toBeVisible();
    await page.locator("#sbSelUngroup").click();
    const flat = await storedBoard(page);
    expect(flat.groups).toHaveLength(0);
    expect(flat.items.map((i) => i.id).sort()).toEqual(["ga", "gb", "gc"]);
  });

  test("moving a nested group moves every leaf inside it", async ({ page }) => {
    await seedBoard(page, ABC());
    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();
    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gc"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();

    const before = {
      a: await itemState(page, "ga"),
      b: await itemState(page, "gb"),
      c: await itemState(page, "gc")
    };
    await dragObject(page, "ga", 50, 25);
    const after = {
      a: await itemState(page, "ga"),
      b: await itemState(page, "gb"),
      c: await itemState(page, "gc")
    };
    for (const id of ["a", "b", "c"]) {
      expect(Math.abs((after[id].x - before[id].x) - (after.a.x - before.a.x))).toBeLessThan(0.05);
      expect(Math.abs((after[id].y - before[id].y) - (after.a.y - before.a.y))).toBeLessThan(0.05);
    }
  });

  test("deleting a group deletes all of its members", async ({ page }) => {
    await seedBoard(page, ABC());
    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();
    await page.keyboard.press("Delete");
    const board = await storedBoard(page);
    expect(board.items.map((i) => i.id)).toEqual(["gc"]);
    expect(board.groups).toHaveLength(0);
    await expect(page.locator('.sb-object[data-id="ga"]')).toHaveCount(0);
  });

  test("duplicating a group clones its nesting and selects the copy", async ({ page }) => {
    await seedBoard(page, AB());
    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();
    const original = (await storedBoard(page)).groups[0];

    await page.locator("#sbSelDuplicate").click();
    const board = await storedBoard(page);
    expect(board.items).toHaveLength(4);
    expect(board.groups).toHaveLength(2);
    const copy = board.groups.find((g) => g.id !== original.id);
    expect(copy.children).toHaveLength(2);
    expect(copy.children.slice().sort()).not.toEqual(original.children.slice().sort());
    expect((await selectionState(page)).ids).toEqual([copy.id]);
    // the copy is offset by +4% and above the originals in z
    const byId = Object.fromEntries(board.items.map((i) => [i.id, i]));
    const originalA = byId[original.children[0]];
    const copyA = byId[copy.children.find((id) => byId[id].sticker === originalA.sticker && byId[id].x !== originalA.x)];
    expect(copyA).toBeTruthy();
  });

  test("groups and their transforms survive a reload", async ({ page }) => {
    await seedBoard(page, AB());
    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();
    await dragObject(page, "ga", 40, 20);
    const before = await storedBoard(page);
    const groupId = before.groups[0].id;
    const moved = { a: await itemState(page, "ga"), b: await itemState(page, "gb") };

    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    const after = await storedBoard(page);
    expect(after.groups.map((g) => g.id)).toEqual([groupId]);
    expect((await itemState(page, "ga")).x).toBeCloseTo(moved.a.x, 5);
    expect((await itemState(page, "gb")).x).toBeCloseTo(moved.b.x, 5);
    // and the page can still select the group from a member
    await page.locator('.sb-object[data-id="ga"]').click();
    expect((await selectionState(page)).ids).toEqual([groupId]);
  });

  test("long-press on touch adds an object to the selection", async ({ page }) => {
    await seedBoard(page, AB());
    await page.locator('.sb-object[data-id="ga"]').click();
    expect((await selectionState(page)).ids).toEqual(["ga"]);

    const box = await objectBox(page, "gb");
    const init = await page.evaluate(({ id, x, y }) => {
      const el = document.querySelector('.sb-object[data-id="' + id + '"]');
      el.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, pointerId: 77, pointerType: "touch",
        isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y
      }));
      return true;
    }, { id: "gb", x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(init).toBe(true);
    await page.waitForTimeout(600);
    await page.evaluate(({ id, x, y }) => {
      const el = document.querySelector('.sb-object[data-id="' + id + '"]');
      el.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true, cancelable: true, pointerId: 77, pointerType: "touch",
        isPrimary: true, button: 0, buttons: 0, clientX: x, clientY: y
      }));
    }, { id: "gb", x: box.x + box.width / 2, y: box.y + box.height / 2 });

    expect((await selectionState(page)).ids.slice().sort()).toEqual(["ga", "gb"]);
    await expect(page.locator("#sbSelGroup")).toBeVisible();
  });

  test("a group can mix a text box and a sticker and still transform as one", async ({ page }) => {
    const mixed = makeBoard("groups-mixed", [
      {
        id: "gt", type: "text", text: "Hi", bg: "transparent", color: "auto",
        border: "none", font: "theme", x: 40, y: 50, scale: 1, rotation: 0, z: 1
      },
      sticker("gs", 60, 50, { z: 2 })
    ]);
    await seedBoard(page, mixed);
    const canvas = await canvasMetrics(page);
    const beforeT = await itemState(page, "gt");
    const beforeS = await itemState(page, "gs");

    await page.locator('.sb-object[data-id="gt"]').click();
    await page.locator('.sb-object[data-id="gs"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();
    expect((await storedBoard(page)).groups[0].children.slice().sort()).toEqual(["gs", "gt"]);

    await dragObject(page, "gs", 50, 30);
    const afterT = await itemState(page, "gt");
    const afterS = await itemState(page, "gs");
    expect(Math.abs((afterT.x - beforeT.x) - 50 / canvas.w * 100)).toBeLessThan(0.8);
    expect(Math.abs((afterS.x - beforeS.x) - 50 / canvas.w * 100)).toBeLessThan(0.8);
    expect(Math.abs((afterT.y - beforeT.y) - (afterS.y - beforeS.y))).toBeLessThan(0.05);
    // the text is still a normal text leaf (grouping is only metadata)
    expect(await page.evaluate(() => sbFindItem("gt").type)).toBe("text");
    expect(await page.locator(".sb-text").count()).toBe(1);
  });

  test("duplicating a nested group copies both levels", async ({ page }) => {
    await seedBoard(page, ABC());
    await page.locator('.sb-object[data-id="ga"]').click();
    await page.locator('.sb-object[data-id="gb"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();
    await page.locator('.sb-object[data-id="gc"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();

    const before = await storedBoard(page);
    expect(before.groups).toHaveLength(2);
    await page.locator("#sbSelDuplicate").click();
    const after = await storedBoard(page);
    expect(after.items).toHaveLength(6);
    expect(after.groups).toHaveLength(4);
    // two of the groups contain another GROUP as a child (the original inner +
    // its copy), so the nesting was cloned, not flattened.
    const groupIds = after.groups.map((g) => g.id);
    const nested = after.groups.filter((g) => g.children.some((c) => groupIds.indexOf(c) !== -1));
    expect(nested).toHaveLength(2);
    const sel = await selectionState(page);
    expect(sel.ids).toHaveLength(1);
    expect(groupIds).toContain(sel.ids[0]);
  });

  test("a group's handles can be scrolled into view when the board is zoomed", async ({ page }) => {
    await seedBoard(page, makeBoard("groups-zoom", [
      sticker("za", 78, 45, { z: 1 }),
      sticker("zb", 97, 60, { z: 2 })
    ]));
    await page.locator("#sbZoomIn").click();
    await page.locator("#sbZoomIn").click();
    await expect.poll(() => page.evaluate(() => sbZoom())).toBe(1.5);

    await page.locator('.sb-object[data-id="za"]').click();
    await page.locator('.sb-object[data-id="zb"]').click({ modifiers: ["Control"] });
    await page.locator("#sbSelGroup").click();

    // Centre the selection box in the scroller (clamped): at max scroll the group
    // sits under the fixed nav, which is not what "can be scrolled into view"
    // means. The right-edge pasteboard still has to exist for the scale handle.
    await page.evaluate(() => {
      const s = document.getElementById("sbScroller");
      const box = document.getElementById("sbSelectionBox");
      const sr = s.getBoundingClientRect();
      const br = box.getBoundingClientRect();
      s.scrollLeft += (br.left + br.width / 2) - (sr.left + s.clientWidth / 2);
      s.scrollTop += (br.top + br.height / 2) - (sr.top + s.clientHeight / 2);
    });
    const probe = await page.evaluate(() => {
      const box = document.getElementById("sbSelectionBox");
      const out = {};
      ["scale", "rotate"].forEach((which) => {
        const handle = box.querySelector(".sb-handle-" + which);
        const r = handle.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        out[which] = {
          inViewport: cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight,
          ok: !!(hit && (hit === handle || handle.contains(hit))),
          hit: hit ? (hit.id || String(hit.className || hit.tagName)) : null
        };
      });
      return out;
    });
    expect(probe.scale.inViewport, JSON.stringify(probe)).toBe(true);
    expect(probe.scale.ok, JSON.stringify(probe)).toBe(true);
    expect(probe.rotate.inViewport, JSON.stringify(probe)).toBe(true);
    expect(probe.rotate.ok, JSON.stringify(probe)).toBe(true);
  });
});
