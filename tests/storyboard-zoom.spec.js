const { test, expect } = require("@playwright/test");

// Storyboard zoom: the rail's magnifier +/- and Fit controls resize the BOARD
// (not the UI), the scroller supplies scrollbars once the board is bigger than
// the window, and selecting an item always lets you scroll far enough to reach
// its grab handles and action bar.

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

const BG_BOARD = {
  id: "zoom-bg",
  name: "Zoom board",
  background: "space",
  items: [sticker("zoom-bg-sticker", 50, 50)],
  connectors: []
};

const PLAIN_BOARD = {
  id: "zoom-plain",
  name: "Zoom plain",
  background: "",
  items: [sticker("zoom-plain-sticker", 50, 50)],
  connectors: []
};

const EDGE_BOARD = {
  id: "zoom-edge",
  name: "Zoom edge",
  background: "space",
  items: [
    sticker("zoom-edge-top", 50, 2),
    sticker("zoom-edge-corner", 98, 98)
  ],
  connectors: []
};

const OFFSET_BOARD = {
  id: "zoom-offset",
  name: "Zoom offset",
  background: "space",
  items: [sticker("zoom-offset-sticker", 70, 50)],
  connectors: []
};

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

async function seedBoards(page, boards, activeId) {
  await page.goto("/");
  await page.evaluate(({ list, active }) => {
    localStorage.setItem("storyboard_stories", JSON.stringify([{
      id: "story-zoom",
      name: "Story 1",
      scenes: list,
      activeSceneId: active
    }]));
    localStorage.setItem("storyboard_activeStory", "story-zoom");
    localStorage.setItem("storyboard_activeScene", active);
  }, { list: boards, active: activeId || boards[0].id });
  await page.goto("/Storyboard/");
  await expect(page.locator("#sbCanvas")).toBeVisible();
  await expect(page.locator(".sb-object").first()).toBeVisible();
}

// The board fraction currently sitting at the CENTRE of the visible scroller.
// Restoring this (not raw scrollLeft/Top) is what makes the position survive a
// window-size change between visits.
function viewFraction(page) {
  return page.evaluate(() => {
    const s = document.getElementById("sbScroller");
    const c = document.getElementById("sbCanvas");
    const sr = s.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    return {
      fx: (sr.left + s.clientWidth / 2 - cr.left) / cr.width,
      fy: (sr.top + s.clientHeight / 2 - cr.top) / cr.height,
      left: s.scrollLeft,
      top: s.scrollTop
    };
  });
}

function metrics(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById("sbCanvas");
    const scroller = document.getElementById("sbScroller");
    const cr = canvas.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    return {
      x: cr.x,
      y: cr.y,
      w: cr.width,
      h: cr.height,
      viewX: sr.x,
      viewY: sr.y,
      viewW: scroller.clientWidth,
      viewH: scroller.clientHeight,
      scrollW: scroller.scrollWidth,
      scrollH: scroller.scrollHeight,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
      zoom: window.sbState.zoom,
      fitW: window.sbEls.fitW,
      fitH: window.sbEls.fitH
    };
  });
}

async function scrollTo(page, left, top) {
  await page.evaluate(({ left, top }) => {
    const s = document.getElementById("sbScroller");
    s.scrollLeft = left;
    s.scrollTop = top;
  }, { left, top });
}

// Hit-test a grab handle: a clipped handle still reports a rect, so a rect
// assertion alone would pass while the user can see (and grab) nothing.
function hitHandle(page, id, which) {
  return page.evaluate(({ id, which }) => {
    const obj = document.querySelector('.sb-object[data-id="' + id + '"]');
    const handle = obj && obj.querySelector(".sb-handle-" + which);
    if (!handle) return { ok: false, reason: "missing handle" };
    const r = handle.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      ok: !!(hit && (hit === handle || handle.contains(hit))),
      cx,
      cy,
      inViewport: cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight,
      hit: hit ? String(hit.className || hit.tagName) : null
    };
  }, { id, which });
}

function objectCentre(page, id) {
  return page.evaluate((id) => {
    const r = document.querySelector('.sb-object[data-id="' + id + '"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
}

test.describe("Storyboard - zoom", () => {
  test("magnifier buttons sit side by side at the bottom of the rail, above Pin", async ({ page }) => {
    await seedBoard(page, BG_BOARD);

    const zoomOut = page.locator("#sbZoomOut");
    const zoomIn = page.locator("#sbZoomIn");
    const fit = page.locator("#sbZoomFit");
    const pin = page.locator("#sbPinBtn");
    await expect(zoomOut).toBeVisible();
    await expect(zoomIn).toBeVisible();
    await expect(fit).toBeVisible();

    const out = await zoomOut.boundingBox();
    const inn = await zoomIn.boundingBox();
    const fitBox = await fit.boundingBox();
    const pinBox = await pin.boundingBox();

    // Side by side, minus to the left of plus.
    expect(Math.abs(out.y - inn.y)).toBeLessThan(2);
    expect(out.x + out.width).toBeLessThanOrEqual(inn.x + 1);
    // Fit is the next row down, Pin stays last.
    expect(fitBox.y).toBeGreaterThanOrEqual(Math.max(out.y + out.height, inn.y + inn.height) - 1);
    expect(pinBox.y).toBeGreaterThanOrEqual(fitBox.y + fitBox.height - 1);

    // No percentage readout anywhere in the rail (user decision).
    const railText = await page.locator("#sbToolbar .sb-rail").innerText();
    expect(railText).not.toMatch(/\d+\s*%/);
    await expect(page.locator("#sbZoomFit")).toBeDisabled();
  });

  test("zoom in / out scales the board and only then adds scrollbars; Fit restores the fitted view", async ({ page }) => {
    await seedBoard(page, BG_BOARD);
    const fitted = await metrics(page);

    expect(Math.abs(fitted.w - fitted.fitW)).toBeLessThan(1.5);
    expect(Math.abs(fitted.h - fitted.fitH)).toBeLessThan(1.5);
    expect(fitted.scrollW).toBeLessThanOrEqual(fitted.viewW + 1);
    expect(fitted.scrollH).toBeLessThanOrEqual(fitted.viewH + 1);

    await page.locator("#sbZoomIn").click();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1.25);
    let m = await metrics(page);
    expect(Math.abs(m.w - m.fitW * 1.25)).toBeLessThan(2);
    expect(m.scrollW > m.viewW || m.scrollH > m.viewH).toBe(true);
    await expect(page.locator("#sbZoomFit")).toBeEnabled();

    await page.locator("#sbZoomFit").click();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1);
    m = await metrics(page);
    expect(Math.abs(m.w - fitted.fitW)).toBeLessThan(2);
    expect(m.scrollW).toBeLessThanOrEqual(m.viewW + 1);
    expect(m.scrollH).toBeLessThanOrEqual(m.viewH + 1);
    await expect(page.locator("#sbZoomFit")).toBeDisabled();

    await page.locator("#sbZoomOut").click();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(0.75);
    m = await metrics(page);
    expect(Math.abs(m.w - m.fitW * 0.75)).toBeLessThan(2);
    // Smaller than the window: centred with equal visible margins.
    const leftMargin = m.x - m.viewX;
    const rightMargin = m.viewX + m.viewW - (m.x + m.w);
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThan(2.5);
    expect(m.scrollW).toBeLessThanOrEqual(m.viewW + 1);
    expect(m.scrollH).toBeLessThanOrEqual(m.viewH + 1);
  });

  test("zoom buttons stop at the ends of the range", async ({ page }) => {
    await seedBoard(page, PLAIN_BOARD);

    const zoomOut = page.locator("#sbZoomOut");
    for (let i = 0; i < 12 && !(await zoomOut.isDisabled()); i++) {
      await zoomOut.click();
      await page.waitForTimeout(30);
    }
    await expect(zoomOut).toBeDisabled();
    expect((await metrics(page)).zoom).toBe(0.5);

    await page.locator("#sbZoomFit").click();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1);

    const zoomIn = page.locator("#sbZoomIn");
    for (let i = 0; i < 12 && !(await zoomIn.isDisabled()); i++) {
      await zoomIn.click();
      await page.waitForTimeout(30);
    }
    await expect(zoomIn).toBeDisabled();
    expect((await metrics(page)).zoom).toBe(4);
  });

  test("when zoomed in, the edge handles can always be scrolled into view", async ({ page }) => {
    await seedBoard(page, EDGE_BOARD);

    // Zoom FIRST, then select: the handle appears after the pasteboard was
    // already sized, so the selection itself must re-measure it.
    await page.locator("#sbZoomIn").click();
    await page.locator("#sbZoomIn").click();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1.5);
    await page.locator('.sb-object[data-id="zoom-edge-top"]').click();

    await scrollTo(page, 0, 0);
    await page.evaluate(() => {
      const s = document.getElementById("sbScroller");
      s.scrollLeft = (s.scrollWidth - s.clientWidth) / 2;
    });
    const rotate = await hitHandle(page, "zoom-edge-top", "rotate");
    expect(rotate.inViewport, JSON.stringify(rotate)).toBe(true);
    expect(rotate.ok, JSON.stringify(rotate)).toBe(true);

    // Sticker in the bottom-right corner: its scale handle needs the
    // bottom/right pasteboard.
    await page.locator('.sb-object[data-id="zoom-edge-corner"]').click();
    await page.evaluate(() => {
      const s = document.getElementById("sbScroller");
      s.scrollLeft = s.scrollWidth;
      s.scrollTop = s.scrollHeight;
    });
    const scale = await hitHandle(page, "zoom-edge-corner", "scale");
    expect(scale.inViewport, JSON.stringify(scale)).toBe(true);
    expect(scale.ok, JSON.stringify(scale)).toBe(true);

    // The floating action bar is pinned to the viewport, so it stays usable.
    const bar = await page.evaluate(() => {
      const el = document.getElementById("sbSelectionBar");
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        visible: !el.classList.contains("d-none"),
        inViewport: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
        ok: !!(hit && (hit === el || el.contains(hit)))
      };
    });
    expect(bar.visible).toBe(true);
    expect(bar.inViewport, JSON.stringify(bar)).toBe(true);
    expect(bar.ok, JSON.stringify(bar)).toBe(true);
  });

  test("zooming anchors on the selected item so it stays put on screen", async ({ page }) => {
    await seedBoard(page, OFFSET_BOARD);
    await page.locator('.sb-object[data-id="zoom-offset-sticker"]').click();

    const before = await objectCentre(page, "zoom-offset-sticker");
    await page.locator("#sbZoomIn").click();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1.25);
    const after = await objectCentre(page, "zoom-offset-sticker");

    expect(Math.abs(after.x - before.x)).toBeLessThan(3);
    expect(Math.abs(after.y - before.y)).toBeLessThan(3);
  });

  test("dragging an item still follows the pointer when zoomed in", async ({ page }) => {
    await seedBoard(page, BG_BOARD);
    await page.locator("#sbZoomIn").click();
    await page.locator("#sbZoomIn").click();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1.5);

    const box = await page.locator('.sb-object[data-id="zoom-bg-sticker"]').boundingBox();
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const dx = 120;
    const dy = 60;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dx, startY + dy, { steps: 6 });
    await page.mouse.up();

    const state = await page.evaluate(() => {
      const item = sbFindItem("zoom-bg-sticker");
      const c = document.getElementById("sbCanvas").getBoundingClientRect();
      return { x: item.x, y: item.y, w: c.width, h: c.height };
    });
    expect(Math.abs(state.x - (50 + dx / state.w * 100))).toBeLessThan(0.6);
    expect(Math.abs(state.y - (50 + dy / state.h * 100))).toBeLessThan(0.6);
  });

  test("the zoom level is remembered across a reload", async ({ page }) => {
    await seedBoard(page, BG_BOARD);
    await page.locator("#sbZoomIn").click();
    await page.locator("#sbZoomIn").click();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1.5);

    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    const m = await metrics(page);
    expect(m.zoom).toBe(1.5);
    expect(Math.abs(m.w - m.fitW * 1.5)).toBeLessThan(2);
    // Centred on the board, not parked at the scroller's top-left.
    const maxX = m.scrollW - m.viewW;
    const maxY = m.scrollH - m.viewH;
    expect(Math.abs(m.scrollLeft - maxX / 2)).toBeLessThan(2);
    expect(Math.abs(m.scrollTop - maxY / 2)).toBeLessThan(2);
  });

  test("panning is remembered when the page is reopened", async ({ page }) => {
    await seedBoard(page, BG_BOARD);
    await page.locator("#sbZoomIn").click();
    await page.locator("#sbZoomIn").click();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1.5);

    // Pan hard to the top-left, which is nowhere near the centred default.
    await scrollTo(page, 0, 0);
    await page.waitForTimeout(350);
    const before = await viewFraction(page);
    expect(before.fx).toBeLessThan(0.45);

    // The view lives on the SCENE, not in a separate key.
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("storyboard_stories"))[0].scenes[0].view
    );
    expect(stored).toBeTruthy();
    expect(stored.zoom).toBe(1.5);
    expect(Math.abs(stored.fx - before.fx)).toBeLessThan(0.02);
    expect(Math.abs(stored.fy - before.fy)).toBeLessThan(0.02);

    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1.5);
    const after = await viewFraction(page);
    expect(Math.abs(after.fx - before.fx)).toBeLessThan(0.01);
    expect(Math.abs(after.fy - before.fy)).toBeLessThan(0.01);
    expect(Math.abs(after.fx - 0.5)).toBeGreaterThan(0.05);
  });

  test("each board keeps its own zoom and pan position", async ({ page }) => {
    const boardA = {
      ...BG_BOARD,
      id: "view-a",
      name: "View A",
      items: [sticker("view-a-sticker", 50, 50)]
    };
    const boardB = {
      ...BG_BOARD,
      id: "view-b",
      name: "View B",
      items: [sticker("view-b-sticker", 30, 40)]
    };
    await seedBoards(page, [boardA, boardB], "view-a");

    // A: zoom 1.5, panned top-left.
    await page.locator("#sbZoomIn").click();
    await page.locator("#sbZoomIn").click();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1.5);
    await scrollTo(page, 0, 0);
    await page.waitForTimeout(350);
    const viewA = await viewFraction(page);

    // B starts with ITS OWN default view (zoom 1, centred), not A's zoom.
    await page.evaluate(() => sbSetActiveBoard("view-b"));
    await expect.poll(() => page.evaluate(() => sbState.activeId)).toBe("view-b");
    await expect(page.locator('.sb-object[data-id="view-b-sticker"]')).toBeVisible();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1);
    const freshB = await viewFraction(page);
    expect(Math.abs(freshB.left)).toBeLessThan(2);
    expect(Math.abs(freshB.top)).toBeLessThan(2);

    // B: zoom 2, panned bottom-right.
    await page.locator("#sbZoomIn").click();
    await page.locator("#sbZoomIn").click();
    await page.locator("#sbZoomIn").click();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(2);
    await page.evaluate(() => {
      const s = document.getElementById("sbScroller");
      s.scrollLeft = s.scrollWidth;
      s.scrollTop = s.scrollHeight;
    });
    await page.waitForTimeout(350);
    const viewB = await viewFraction(page);
    expect(viewB.fx).toBeGreaterThan(0.55);

    // Back to A: A's zoom AND position come back.
    await page.evaluate(() => sbSetActiveBoard("view-a"));
    await expect.poll(() => page.evaluate(() => sbState.activeId)).toBe("view-a");
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1.5);
    const backA = await viewFraction(page);
    expect(Math.abs(backA.fx - viewA.fx)).toBeLessThan(0.01);
    expect(Math.abs(backA.fy - viewA.fy)).toBeLessThan(0.01);

    // Reload on A: still A's zoom/position ...
    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await expect.poll(async () => (await metrics(page)).zoom).toBe(1.5);
    const reloadA = await viewFraction(page);
    expect(Math.abs(reloadA.fx - viewA.fx)).toBeLessThan(0.01);

    // ... and B still has its own.
    await page.evaluate(() => sbSetActiveBoard("view-b"));
    await expect.poll(() => page.evaluate(() => sbState.activeId)).toBe("view-b");
    await expect.poll(async () => (await metrics(page)).zoom).toBe(2);
    const backB = await viewFraction(page);
    expect(Math.abs(backB.fx - viewB.fx)).toBeLessThan(0.01);
    expect(Math.abs(backB.fy - viewB.fy)).toBeLessThan(0.01);
  });
});
