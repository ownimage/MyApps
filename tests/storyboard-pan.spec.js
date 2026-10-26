const { test, expect } = require("@playwright/test");

// Storyboard canvas panning: holding Space turns the board area into a hand
// (grab/grabbing) and dragging slides the scroll view. Pan mode must win over
// the object/group gestures that share the same pointer, without changing the
// selection or touching stored item positions.

const ITEM_ID = "pan-sticker";

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

const PAN_BOARD = {
  id: "pan-board",
  name: "Pan board",
  background: "space",
  items: [sticker(ITEM_ID, 50, 50)],
  connectors: []
};

async function seedBoard(page) {
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
  }, PAN_BOARD);
  await page.goto("/Storyboard/");
  await expect(page.locator('.sb-object[data-id="' + ITEM_ID + '"]')).toBeVisible();
}

function panState(page) {
  return page.evaluate((id) => {
    const scroller = document.getElementById("sbScroller");
    const canvas = document.getElementById("sbCanvas");
    const item = window.sbFindItem(id);
    const el = document.querySelector('.sb-object[data-id="' + id + '"]');
    const r = el ? el.getBoundingClientRect() : null;
    const bar = document.getElementById("sbSelectionBar");
    return {
      panReady: !!window.sbState.panReady,
      panActive: !!window.sbState.pan,
      readyClass: scroller.classList.contains("sb-pan-ready"),
      activeClass: scroller.classList.contains("sb-pan-active"),
      cursor: getComputedStyle(canvas).cursor,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
      selectedId: window.sbState.selectedId || "",
      selectedIds: (window.sbState.selectedIds || []).slice(),
      itemX: item ? item.x : null,
      itemY: item ? item.y : null,
      itemScreenX: r ? r.left + r.width / 2 : null,
      itemScreenY: r ? r.top + r.height / 2 : null,
      barHidden: bar ? bar.classList.contains("d-none") : null
    };
  }, ITEM_ID);
}

async function zoomIn(page, times) {
  const levels = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  const target = levels[levels.indexOf(1) + times];
  for (let i = 0; i < times; i++) await page.locator("#sbZoomIn").click();
  await expect.poll(() => page.evaluate(() => window.sbState.zoom)).toBe(target);
  // The rail button keeps focus after the click; clear it so Space reaches the page.
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
}

async function scrollTo(page, left, top) {
  await page.evaluate(({ left, top }) => {
    const s = document.getElementById("sbScroller");
    s.scrollLeft = left;
    s.scrollTop = top;
  }, { left, top });
}

async function centreScroll(page) {
  await page.evaluate(() => {
    const s = document.getElementById("sbScroller");
    s.scrollLeft = (s.scrollWidth - s.clientWidth) / 2;
    s.scrollTop = (s.scrollHeight - s.clientHeight) / 2;
  });
}

async function scrollerCentre(page, fx, fy) {
  const box = await page.locator("#sbScroller").boundingBox();
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function startPan(page, x, y) {
  await page.keyboard.down("Space");
  await page.mouse.move(x, y);
  await page.mouse.down();
}

test.describe("Storyboard - space pan", () => {
  test("at 100% there is nothing to pan, so Space leaves the cursor alone", async ({ page }) => {
    await seedBoard(page);
    const before = await panState(page);
    expect(before.cursor).not.toBe("grab");

    await page.keyboard.down("Space");
    const armed = await panState(page);
    expect(armed.panReady).toBe(false);
    expect(armed.readyClass).toBe(false);
    expect(armed.cursor).not.toBe("grab");

    // A drag while Space is down still behaves as a normal (non-pan) gesture.
    const centre = await scrollerCentre(page, 0.7, 0.3);
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 80, centre.y + 60, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Space");
    expect((await panState(page)).scrollLeft).toBe(before.scrollLeft);
    expect((await panState(page)).scrollTop).toBe(before.scrollTop);
  });

  test("Space shows the hand and dragging pans the zoomed canvas", async ({ page }) => {
    await seedBoard(page);
    await zoomIn(page, 2); // 1.5
    await centreScroll(page);
    const before = await panState(page);

    const start = await scrollerCentre(page, 0.7, 0.3);
    await page.keyboard.down("Space");
    expect((await panState(page)).cursor).toBe("grab");
    expect((await panState(page)).readyClass).toBe(true);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 120, start.y + 80, { steps: 8 });

    const during = await panState(page);
    expect(during.cursor).toBe("grabbing");
    expect(during.activeClass).toBe(true);
    // Dragging right/down moves the CONTENT right/down, i.e. scrolls back.
    expect(Math.abs(during.scrollLeft - (before.scrollLeft - 120))).toBeLessThan(2);
    expect(Math.abs(during.scrollTop - (before.scrollTop - 80))).toBeLessThan(2);
    // The sticker travels with the canvas...
    expect(Math.abs(during.itemScreenX - before.itemScreenX - 120)).toBeLessThan(2);
    expect(Math.abs(during.itemScreenY - before.itemScreenY - 80)).toBeLessThan(2);

    await page.mouse.up();
    const afterUp = await panState(page);
    expect(afterUp.panActive).toBe(false);
    expect(afterUp.cursor).toBe("grab"); // Space still held

    await page.keyboard.up("Space");
    const released = await panState(page);
    expect(released.panReady).toBe(false);
    expect(released.cursor).not.toBe("grab");
    expect(released.readyClass).toBe(false);

    // ...but its stored position is untouched.
    expect(afterUp.itemX).toBe(50);
    expect(afterUp.itemY).toBe(50);
  });

  test("a pan that starts on a sticker does not select or move it", async ({ page }) => {
    await seedBoard(page);
    await zoomIn(page, 2);
    await centreScroll(page);
    const before = await panState(page);
    expect(before.selectedId).toBe("");
    expect(before.selectedIds).toEqual([]);
    expect(before.barHidden).toBe(true);

    const stickerCentre = { x: before.itemScreenX, y: before.itemScreenY };
    await startPan(page, stickerCentre.x, stickerCentre.y);
    await page.mouse.move(stickerCentre.x + 90, stickerCentre.y + 50, { steps: 6 });

    const during = await panState(page);
    expect(during.cursor).toBe("grabbing");
    expect(during.selectedId).toBe("");
    expect(during.selectedIds).toEqual([]);
    expect(during.barHidden).toBe(true);
    expect(during.itemX).toBe(50);
    expect(during.itemY).toBe(50);
    expect(Math.abs(during.scrollLeft - (before.scrollLeft - 90))).toBeLessThan(2);
    expect(Math.abs(during.scrollTop - (before.scrollTop - 50))).toBeLessThan(2);

    await page.mouse.up();
    await page.keyboard.up("Space");
    const after = await panState(page);
    expect(after.selectedId).toBe("");
    expect(after.itemX).toBe(50);
    expect(after.itemY).toBe(50);
    expect(after.barHidden).toBe(true);
  });

  test("releasing Space mid-drag keeps panning until the button is released", async ({ page }) => {
    await seedBoard(page);
    await zoomIn(page, 2);
    await centreScroll(page);
    const before = await panState(page);

    const start = await scrollerCentre(page, 0.7, 0.3);
    await startPan(page, start.x, start.y);
    await page.mouse.move(start.x + 40, start.y + 30, { steps: 4 });
    await page.keyboard.up("Space");

    const afterKeyUp = await panState(page);
    expect(afterKeyUp.cursor).toBe("grabbing"); // the drag owns the cursor until mouse-up
    expect(afterKeyUp.activeClass).toBe(true);
    expect(afterKeyUp.readyClass).toBe(false);

    await page.mouse.move(start.x + 80, start.y + 60, { steps: 4 });
    const during = await panState(page);
    expect(Math.abs(during.scrollLeft - (before.scrollLeft - 80))).toBeLessThan(2);
    expect(Math.abs(during.scrollTop - (before.scrollTop - 60))).toBeLessThan(2);

    await page.mouse.up();
    const after = await panState(page);
    expect(after.panActive).toBe(false);
    expect(after.cursor).not.toBe("grab");
  });

  test("panning is clamped at the scroll edges", async ({ page }) => {
    await seedBoard(page);
    await zoomIn(page, 2);
    await scrollTo(page, 0, 0);

    const start = await scrollerCentre(page, 0.7, 0.3);
    await startPan(page, start.x, start.y);
    await page.mouse.move(start.x + 90, start.y + 60, { steps: 6 });
    let m = await panState(page);
    expect(m.scrollLeft).toBeLessThanOrEqual(1);
    expect(m.scrollTop).toBeLessThanOrEqual(1);
    await page.mouse.up();

    // The other direction has room again.
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 90, start.y - 60, { steps: 6 });
    m = await panState(page);
    expect(m.scrollLeft).toBeGreaterThan(80);
    expect(m.scrollTop).toBeGreaterThan(50);
    await page.mouse.up();
    await page.keyboard.up("Space");
  });

  test("without Space, dragging a sticker still moves it", async ({ page }) => {
    await seedBoard(page);
    const before = await panState(page);
    const box = await page.locator('.sb-object[data-id="' + ITEM_ID + '"]').boundingBox();
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 40, { steps: 6 });
    await page.mouse.up();

    const after = await panState(page);
    expect(after.itemX).toBeGreaterThan(before.itemX + 1);
    expect(after.itemY).toBeGreaterThan(before.itemY + 1);
    expect(after.selectedIds).toContain(ITEM_ID);
  });

  test("Space in the text editor is just a space", async ({ page }) => {
    await seedBoard(page);
    await page.locator('.sb-rail-btn[data-tool="text"]').click();
    const input = page.locator("#sbTextInput");
    await expect(input).toBeVisible();
    await input.fill("ab");
    await page.keyboard.press("Space");

    await expect(input).toHaveValue("ab ");
    const m = await panState(page);
    expect(m.panReady).toBe(false);
    expect(m.readyClass).toBe(false);
    expect(m.cursor).not.toBe("grab");
  });

  test("Space on a focused button activates the button, not pan mode", async ({ page }) => {
    await seedBoard(page);
    await page.locator("#sbZoomIn button").focus();
    await page.keyboard.press("Space");

    await expect.poll(() => page.evaluate(() => window.sbState.zoom)).toBe(1.25);
    const m = await panState(page);
    expect(m.panReady).toBe(false);
    expect(m.readyClass).toBe(false);
  });

  test("Space is inert while the settings page is open", async ({ page }) => {
    await seedBoard(page);
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");

    await page.keyboard.press("Space");
    const m = await panState(page);
    expect(m.panReady).toBe(false);
    expect(m.readyClass).toBe(false);
    expect(m.cursor).not.toBe("grab");
  });

  test("window blur clears pan mode so the hand cannot stick", async ({ page }) => {
    await seedBoard(page);
    await zoomIn(page, 2);
    await centreScroll(page);

    const start = await scrollerCentre(page, 0.7, 0.3);
    await startPan(page, start.x, start.y);
    await page.mouse.move(start.x + 40, start.y + 20, { steps: 4 });
    expect((await panState(page)).activeClass).toBe(true);

    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    const m = await panState(page);
    expect(m.panActive).toBe(false);
    expect(m.panReady).toBe(false);
    expect(m.readyClass).toBe(false);
    expect(m.activeClass).toBe(false);
    expect(m.cursor).not.toBe("grab");

    await page.mouse.up();
    await page.keyboard.up("Space");
  });
});
