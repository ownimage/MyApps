const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

// Coverage hooks (top-level so every test in this spec is captured).
test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// The settings pages put the grid column on the <smd-theme> HOST (`col-md-8`)
// and the rows inside it, while the app's own settings rows are `row.col-md-8`
// on a single element. Those are not the same geometry: an auto-width `.row`
// inside a fixed-width column has its used width inflated by the row's negative
// margins (+24px), so the 4/12 label split was computed on a 24px-wider box and
// the Theme/Theme Mode labels and selects sat 8px right of Font size & friends -
// but only at >=768px, where `.col-md-8` has a width. It showed up in PlanMyDay
// at 832x688. These tests pin the alignment so it cannot come back.
const APPS = [
  { name: "PlanMyDay", path: "/PlanMyDay/" },
  { name: "CountMyDays", path: "/CountMyDays/" },
  { name: "FreeFormOX", path: "/FreeFormOX/" },
  { name: "QRLinks", path: "/QRLinks/" },
  { name: "SolarControlar", path: "/SolarControlar/" },
  { name: "Launch", path: "/" }
];

// 832 is the reported window (>=md, so the column is sized); 700 is below the md
// breakpoint, where the bug was invisible and must stay that way.
const WIDTHS = [832, 700];

async function openSettingsOnThemeTab(page) {
  await page.evaluate(() => openSettings());
  // Not every app has the control on the default tab (PlanMyDay puts it on
  // Display, the others on General), and a hidden panel measures as all-zero
  // rects - which would make the geometry comparison pass for the wrong reason.
  await page.evaluate(() => {
    const host = document.getElementById("themeSelector");
    const panel = host.closest(".smd-tab-panel");
    const button = document.querySelector('.smd-tab-btn[aria-controls="' + panel.id + '"]');
    if (button) button.click();
  });
  await expect(page.locator("#themeSelector .smd-theme-select")).toBeVisible();
}

// Compares the Theme field's grid cells against the app's own settings row.
// Measured on the `.col-4`/`.col-8` CELLS, not the label: a `<label>` is an
// inline box, so its rect is the text box and shifts with the wording
// ("Theme" vs "Swatch"), which says nothing about alignment.
async function measureAlignment(page) {
  return page.evaluate(() => {
    const host = document.getElementById("themeSelector");
    const field = host.querySelector(".smd-theme-field");
    const sibling = Array.from(host.parentElement.querySelectorAll("div.row"))
      .find((row) => !host.contains(row) && row.classList.contains("col-md-8") && row.querySelector("label"));
    if (!sibling) return { error: "no sibling settings row found" };
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    };
    const t = {
      row: box(field),
      labelCell: box(field.querySelector(".col-4")),
      controlCell: box(field.querySelector(".col-8"))
    };
    const s = {
      row: box(sibling),
      labelCell: box(sibling.querySelector(".col-4")),
      controlCell: box(sibling.querySelector(".col-8"))
    };
    const d = (a, b) => Math.round((a - b) * 10) / 10;
    return {
      error: null,
      labelRightDelta: d(t.labelCell.right, s.labelCell.right),
      labelLeftDelta: d(t.labelCell.left, s.labelCell.left),
      controlLeftDelta: d(t.controlCell.left, s.controlCell.left),
      controlWidthDelta: d(t.controlCell.width, s.controlCell.width),
      rowWidthDelta: d(t.row.width, s.row.width),
      rowLeftDelta: d(t.row.left, s.row.left)
    };
  });
}

test.describe("Settings theme control alignment", () => {
  for (const app of APPS) {
    for (const width of WIDTHS) {
      test(`${app.name} lines the Theme rows up with its own settings rows at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 688 });
        await page.goto(app.path);
        await openSettingsOnThemeTab(page);
        const m = await measureAlignment(page);
        expect(m.error).toBeNull();
        expect(m.labelRightDelta, "label column right edge").toBe(0);
        expect(m.labelLeftDelta, "label column left edge").toBe(0);
        expect(m.controlLeftDelta, "control column left edge").toBe(0);
        expect(m.controlWidthDelta, "control column width").toBe(0);
        expect(m.rowWidthDelta, "row width").toBe(0);
        expect(m.rowLeftDelta, "row left edge").toBe(0);
      });
    }
  }

  test("the Theme field keeps the same bottom gap as the app settings rows", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await openSettingsOnThemeTab(page);
    const gaps = await page.evaluate(() => {
      const host = document.getElementById("themeSelector");
      const fields = host.querySelectorAll(".smd-theme-field");
      const sibling = Array.from(host.parentElement.querySelectorAll("div.row"))
        .find((row) => !host.contains(row) && row.classList.contains("col-md-8") && row.querySelector("label"));
      const nextSibling = sibling.nextElementSibling;
      const gap = (a, b) => Math.round(parseFloat(getComputedStyle(a).marginBottom) * 100) / 100;
      return { themeField: gap(fields[0]), siblingRow: gap(sibling), nextRow: gap(nextSibling) };
    });
    // mb-4 on the app rows; the component used to be mb-3 (1rem) and broke the
    // vertical rhythm between the control and the rows around it.
    expect(gaps.themeField).toBe(gaps.siblingRow);
    expect(gaps.nextRow).toBe(gaps.siblingRow);
  });
});
