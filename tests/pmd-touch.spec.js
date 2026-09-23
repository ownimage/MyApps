const { test, expect } = require("@playwright/test");

const STREAMS = [
  {
    id: "stream_1",
    title: "Work",
    description: "Work tasks",
    tab: "progress",
    image: "",
    sequence: 1,
    jobs: [
      { id: "job_1", title: "Report", description: "Weekly report", active: true, frequency: "daily", sequence: 1, suffix: true, dayType: "dayOfYear", mod: "", tasks: [] },
      { id: "job_2", title: "Meeting", description: "Standup", active: true, frequency: "weekdays", sequence: 2, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }
    ]
  },
  {
    id: "stream_2",
    title: "Chores",
    description: "",
    tab: "maintenance",
    image: "",
    sequence: 2,
    jobs: [
      { id: "job_3", title: "Laundry", description: "", active: true, frequency: "weekly", sequence: 1, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }
    ]
  }
];

async function touchDrag(page, fromLocator, toBoxOrLocator) {
  const fromBox = await fromLocator.boundingBox();
  const startX = fromBox.x + fromBox.width / 2;
  const startY = fromBox.y + fromBox.height / 2;
  const steps = 20;
  const fireOne = (type, x, y, buttons) =>
    page.evaluate(({ type, x, y, buttons }) => {
      const evt = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        clientX: x, clientY: y, pageX: x, pageY: y,
        width: 20, height: 20,
        pressure: type === "pointerup" ? 0 : 0.7,
        buttons,
      });
      const flatFromPoint = (root) => {
        // Light DOM: elementFromPoint already returns the deepest element.
        return root.elementFromPoint(x, y);
      };
      (flatFromPoint(document) || document.body).dispatchEvent(evt);
    }, { type, x, y, buttons });
  await fireOne("pointerdown", startX, startY, 1);
  await page.waitForTimeout(150);
  const toBox = typeof toBoxOrLocator === "function"
    ? await toBoxOrLocator()
    : toBoxOrLocator;
  const endX = toBox.x + toBox.width / 2;
  const endY = toBox.y + toBox.height * 0.9;
  for (let i = 1; i <= steps; i++) {
    const r = i / steps;
    await fireOne("pointermove", startX + (endX - startX) * r, startY + (endY - startY) * r, 1);
    await page.waitForTimeout(120);
  }
  await fireOne("pointerup", endX, endY, 0);
  await page.waitForTimeout(250);
}

async function openStreamsEditor(page) {
  await page.locator("#btnMainMenu").tap();
  await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).tap();
  await page.waitForTimeout(300);
}

test.describe("PlanMyDay - iPhone 12 Pro touch", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await page.evaluate((data) => {
      localStorage.setItem("planmydays_streams", JSON.stringify(data));
      localStorage.setItem("shared-images", "[]");
    }, STREAMS);
    await page.reload();
  });

  test("streams can be reordered with a touch drag", async ({ page }) => {
    await openStreamsEditor(page);
    const items = page.locator("#streamEditorList .stream-accordion-item");
    await expect(items).toHaveCount(2);
    const lastBox = await items.last().boundingBox();
    await touchDrag(page, items.first().locator(".stream-accordion-header .drag-handle"), lastBox);
    await expect.poll(() =>
      page.evaluate(() => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        return streams.map(s => s.title + ":" + s.sequence);
      })
    ).toEqual(["Chores:1", "Work:2"]);
    await expect(items.first()).toContainText("Chores");
    await expect(items.last()).toContainText("Work");
  });

  test("dragging an expanded stream keeps the same stream expanded", async ({ page }) => {
    await openStreamsEditor(page);
    // expand the first stream (Work) with a tap
    await page.locator("#streamEditorList .stream-header-main").first().tap();
    await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
    const items = page.locator("#streamEditorList .stream-accordion-item");
    await touchDrag(page, items.first().locator(".stream-accordion-header .drag-handle"), () => items.last().boundingBox());
    await expect(page.locator("#streamEditorList .accordion-collapse.show")).toHaveCount(1);
    await expect(page.locator("#streamEditorList .stream-accordion-item").last().locator(".accordion-collapse.show")).toBeVisible();
    await expect(page.locator("#streamEditorList .accordion-collapse.show")).toContainText("Report");
  });

  test("display font size and density settings scale the today card title", async ({ page }) => {
    await page.evaluate(() => {
      const d = new Date();
      const ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1", "job_2", "job_3"]));
      localStorage.setItem("planmydays_last_gen", ds);
      localStorage.setItem("planmydays_completed", "[]");
    });
    await page.reload();
    await expect(page.locator("#todayCardList pmd-job-today-card").first()).toBeVisible();
    const titleFontSize = () => page
      .locator("#todayCardList pmd-job-today-card .job-title").first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const bodyFontSize = () => page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    // Exact sizes are not pinned — what matters is that the card title SCALES
    // with the body font-size setting and with the compact density hook.
    // default saved font size is xlarge -> title = 1.25em of body font-size
    const xBase = await bodyFontSize();
    const xTitle = await titleFontSize();
    expect(xTitle).toBeGreaterThan(xBase);
    expect(xTitle / xBase).toBeCloseTo(1.25, 1);
    await page.evaluate(() => changeFontSize("jumbo"));
    // bigger font size -> bigger title, body moved but the em ratio is unchanged
    const jBase = await bodyFontSize();
    const jTitle = await titleFontSize();
    expect(jBase).toBeGreaterThan(xBase);
    expect(jTitle).toBeGreaterThan(xTitle);
    expect(jTitle / jBase).toBeCloseTo(1.25, 1);
    await page.evaluate(() => changeDensity("compact"));
    // compact hooks --pmd-today-title-size to the p token (1em) in the app sheet
    const cTitle = await titleFontSize();
    expect(cTitle).toBeLessThan(jTitle);
    expect(cTitle / jBase).toBeCloseTo(1, 1);
  });

  test("task rows can be reordered with a touch drag", async ({ page }) => {
    await page.evaluate(() => {
      const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
      streams[0].jobs[0].tasks = [{ description: "First task", done: false }, { description: "Second task", done: false }];
      localStorage.setItem("planmydays_streams", JSON.stringify(streams));
    });
    await page.reload();
    await openStreamsEditor(page);
    // open the first stream's jobs and edit the first job
    await page.locator("#streamEditorList .stream-header-main").first().tap();
    await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().tap();
    await page.locator("#jobEditPage").waitFor({ state: "visible" });
    await page.locator("#jobTasks-tab").tap();
    await page.locator("#jobAddTaskBottomBtn").waitFor({ state: "visible" });
    const rows = page.locator("#jobTasksList .task-row");
    await expect(rows).toHaveCount(2);
    const lastBox = await rows.last().boundingBox();
    await touchDrag(page, rows.first().locator(".drag-handle"), lastBox);
    await expect.poll(() =>
      page.evaluate(() => (jobsBuffer?.tasks || []).map(t => t.description))
    ).toEqual(["Second task", "First task"]);
    await expect(page.locator("#jobTasksList .task-note-row")).toHaveCount(2);
  });

  test("swipe right on a today card snoozes the job until tomorrow", async ({ page }) => {
    await page.evaluate(() => {
      const d = new Date();
      const ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1", "job_3"]));
      localStorage.setItem("planmydays_last_gen", ds);
      localStorage.setItem("planmydays_completed", "[]");
    });
    await page.reload();
    await expect(page.locator("#todayCardList .today-drag-card")).toHaveCount(2);
    const card = page.locator('#todayCardList .today-drag-card[data-job-id="job_1"]');
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const dist = Math.max(150, Math.round(box.width * 0.45));
    const steps = 8;
    await card.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: cx, clientY: cy, button: 0, buttons: 1, bubbles: true, cancelable: true });
    for (let i = 1; i <= steps; i++) {
      const r = i / steps;
      await card.dispatchEvent("pointermove", { pointerId: 1, pointerType: "touch", clientX: cx + dist * r, clientY: cy, button: 0, buttons: 1, bubbles: true, cancelable: true });
    }
    await card.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", clientX: cx + dist, clientY: cy, button: 0, buttons: 0, bubbles: true, cancelable: true });
    await expect(page.locator('#todayCardList .today-drag-card[data-job-id="job_1"]')).toHaveCount(0);
    await expect(page.locator("#todayCardList .today-drag-card")).toHaveCount(1);
    const tomorrow = await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    });
    await expect.poll(() =>
      page.evaluate(() => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        const job = streams.flatMap(function (s) { return s.jobs || []; }).find(function (j) { return j.id === "job_1"; });
        return job ? job.sleepUntil : null;
      })
    ).toBe(tomorrow);
  });
});