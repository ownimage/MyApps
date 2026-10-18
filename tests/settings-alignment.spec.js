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

// Every shell (the two extra apps exist only for the shape/rhythm tests below).
const ALL_APPS = [
  { name: "PlanMyDay", path: "/PlanMyDay/" },
  { name: "CountMyDays", path: "/CountMyDays/" },
  { name: "FreeFormOX", path: "/FreeFormOX/" },
  { name: "QRLinks", path: "/QRLinks/" },
  { name: "SolarControlar", path: "/SolarControlar/" },
  { name: "ListOfLists", path: "/ListOfLists/" },
  { name: "PhoneButtons", path: "/PhoneButtons/" },
  { name: "Launch", path: "/" }
];

async function openSettingsOnThemeTab(page) {
  await page.evaluate(() => openSettings());
  // The control lives on the Display tab in every app now, but resolve the tab
  // from the host's own panel anyway - a hidden panel measures as all-zero rects,
  // which would make the geometry comparison pass for the wrong reason.
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

  // ONE rhythm per Display tab: every row's bottom gap must match the gap
  // <smd-theme> injects (it is deliberately mb-4 to match the app rows), so the
  // spacing between any two rows on the page is identical. FreeFormOX shipped its
  // Display rows at mb-3 against the theme's 1.5rem gap - exactly this test.
  for (const app of ALL_APPS) {
    test(`${app.name}: the Display tab keeps one uniform vertical rhythm`, async ({ page }) => {
      await page.goto(app.path);
      await openSettingsOnThemeTab(page);
      const gaps = await page.evaluate(() => {
        const panel = document.querySelector("#settingsPage .smd-tab-panel.active");
        const round = (el) => Math.round(parseFloat(getComputedStyle(el).marginBottom) * 100) / 100;
        const theme = Array.from(panel.querySelectorAll("#themeSelector .smd-theme-field")).map(round);
        const rows = Array.from(panel.querySelectorAll("div.row.col-md-8"))
          .filter((row) => row.querySelector("label")).map(round);
        return { theme, rows };
      });
      const all = [...gaps.theme, ...gaps.rows];
      expect(all.length, "theme fields + the settings rows").toBeGreaterThanOrEqual(3);
      expect(new Set(all).size,
        `mixed vertical rhythm - theme: ${gaps.theme.join(",")} | rows: ${gaps.rows.join(",")}`).toBe(1);
    });
  }
});

// ---------------------------------------------------------------------------
// The Settings page is SHARED IN SHAPE across every app (2026-10-18, user rule):
//   * tabs in a fixed order - General, Display, then the app's own;
//   * a tab that would be empty is REMOVED (so the list is asserted exactly);
//   * the Display tab holds the appearance rows in a fixed order:
//       Theme, Theme Mode, Font size, Icon size [where the app renders images],
//       Tile density [where supported], Touch size, Slide speed, Auto-hide menu,
//     followed by any app-specific extras (Screen resolution, Show Gantt).
// The row labels are read from the DOM so the markup is validated, not a copy of
// it; a control moved to the wrong tab (or an extra row inserted) fails.
// ---------------------------------------------------------------------------
test.describe("Settings page shape is consistent across apps", () => {
  const LAYOUT = [
    {
      app: "Launch", path: "/", tabs: ["Display", "Menu"],
      display: ["Theme", "Theme Mode", "Font size", "Icon size", "Touch size", "Slide speed", "Auto-hide menu"],
    },
    {
      app: "PlanMyDay", path: "/PlanMyDay/", tabs: ["General", "Display", "Schedule", "Minio", "Danger"],
      display: ["Theme", "Theme Mode", "Font size", "Icon size", "Touch size", "Tile density", "Slide speed",
        "Auto-hide menu", "Show Gantt", "Screen resolution"],
    },
    {
      app: "CountMyDays", path: "/CountMyDays/", tabs: ["General", "Display", "G Cal", "Minio", "Danger"],
      display: ["Theme", "Theme Mode", "Font size", "Icon size", "Touch size", "Tile density", "Slide speed",
        "Auto-hide menu"],
    },
    {
      app: "QRLinks", path: "/QRLinks/", tabs: ["Display", "Danger"],
      display: ["Theme", "Theme Mode", "Font size", "Icon size", "Touch size", "Tile density", "Slide speed",
        "Auto-hide menu"],
    },
    {
      app: "SolarControlar", path: "/SolarControlar/", tabs: ["General", "Display", "Danger"],
      // no Icon size / Tile density: this app renders no <smd-image> and has no
      // density-aware surfaces, so those controls are deliberately absent.
      display: ["Theme", "Theme Mode", "Font size", "Touch size", "Slide speed", "Auto-hide menu"],
    },
    {
      app: "FreeFormOX", path: "/FreeFormOX/", tabs: ["Display", "Game"],
      display: ["Theme", "Theme Mode", "Font size", "Touch size", "Slide speed", "Auto-hide menu"],
    },
    {
      app: "ListOfLists", path: "/ListOfLists/", tabs: ["Display", "Minio", "Danger"],
      display: ["Theme", "Theme Mode", "Font size", "Icon size", "Touch size", "Tile density", "Slide speed",
        "Auto-hide menu", "Screen resolution"],
    },
    {
      app: "PhoneButtons", path: "/PhoneButtons/", tabs: ["Display", "Server", "Danger"],
      display: ["Theme", "Theme Mode", "Font size", "Icon size", "Touch size", "Slide speed", "Auto-hide menu"],
    },
  ];

  for (const spec of LAYOUT) {
    test(`${spec.app}: tabs and Display rows follow the shared order`, async ({ page }) => {
      await page.goto(spec.path);
      await page.evaluate(() => openSettings());
      await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");
      // Some apps show a startup modal in the test environment (SolarControlar's
      // Flask API is not mocked in THIS spec). Dismiss it - it is unrelated to
      // the Settings page under test - or it intercepts the tab click.
      const dismissed = await page.evaluate(() => {
        const modal = document.getElementById("smdConfirmModal");
        if (!modal || !modal.hasAttribute("open")) return false;
        const btn = modal.querySelector(".smd-footer button");
        if (btn) btn.click();
        return true;
      });
      if (dismissed) await expect(page.locator("#smdConfirmModal")).not.toHaveAttribute("open", "");
      // Exact list, in order: also proves no tab was left empty (an empty tab
      // must be removed, not kept with a blank panel).
      await expect(page.locator("#settingsPage .smd-tab-btn")).toHaveText(spec.tabs);

      await page.locator("#settingsPage .smd-tab-btn").filter({ hasText: "Display" }).click();
      await expect(page.locator("#settingsPage .smd-tab-panel.active")).toHaveCount(1);
      const labels = await page.evaluate(() => {
        const panel = document.querySelector("#settingsPage .smd-tab-panel.active");
        return Array.from(panel.querySelectorAll("label"))
          .map((l) => l.textContent.trim())
          .filter(Boolean);
      });
      expect(labels).toEqual(spec.display);
    });
  }
});
