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

async function touchDrag(page, fromLocator, toBox) {
  const fromBox = await fromLocator.boundingBox();
  const startX = fromBox.x + fromBox.width / 2;
  const startY = fromBox.y + fromBox.height / 2;
  const endX = toBox.x + toBox.width / 2;
  const endY = toBox.y + toBox.height * 0.9;
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
      const flatFromPoint = (root, depth = 0) => {
        if (depth > 8) return null;
        let el = root.elementFromPoint(x, y);
        if (!el) return null;
        if (el.shadowRoot && el.shadowRoot !== root) {
          const inner = flatFromPoint(el.shadowRoot, depth + 1);
          if (inner) return inner;
        }
        return el;
      };
      (flatFromPoint(document) || document.body).dispatchEvent(evt);
    }, { type, x, y, buttons });
  await fireOne("pointerdown", startX, startY, 1);
  await page.waitForTimeout(150);
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
      localStorage.setItem("planmydays_images", "[]");
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
    const lastBox = await items.last().boundingBox();
    await touchDrag(page, items.first().locator(".stream-accordion-header .drag-handle"), lastBox);
    await expect(page.locator("#streamEditorList .accordion-collapse.show")).toHaveCount(1);
    await expect(page.locator("#streamEditorList .stream-accordion-item").last().locator(".accordion-collapse.show")).toBeVisible();
    await expect(page.locator("#streamEditorList .accordion-collapse.show")).toContainText("Report");
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
});