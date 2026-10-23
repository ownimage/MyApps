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
  { name: "PhoneButtons", path: "/remoteHID/PhoneButtons/" },
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
// ---------------------------------------------------------------------------
// The DANGER tab is shared in shape too (2026-10-18, user rule). One canonical
// order, using only the rows an app actually has:
//   Show danger / No Cache
//   <gap> Regenerate Main Tiles / Sort <existing name>
//   <gap> Refresh App / Clear local storage <APP> / Clear Google cache (CMD)
//   <gap> Load Sample Data / Upload Standard Images / Load Sample Links/Images
// A gap is `mt-4` on a group's FIRST row, so a group that is empty for an app
// contributes nothing and there is never a gap after a gap. Colours: destructive
// (Clear *) = danger, bulk maintenance (Regenerate/Sort) = warning, everything
// else = secondary (loaders are NOT success - user decision).
// ---------------------------------------------------------------------------
async function dismissStartupModal(page) {
  // SolarControlar shows a server error here (its Flask API is not mocked in this
  // spec), and the overlay would intercept the tab click.
  const dismissed = await page.evaluate(() => {
    const modal = document.getElementById("smdConfirmModal");
    if (!modal || !modal.hasAttribute("open")) return false;
    const btn = modal.querySelector(".smd-footer button");
    if (btn) btn.click();
    return true;
  });
  if (dismissed) await expect(page.locator("#smdConfirmModal")).not.toHaveAttribute("open", "");
}

// That startup modal appears ASYNCHRONOUSLY (the API 404 resolves after boot), so
// dismissing once can still race it. Dismiss-then-click with a short timeout and
// retry: the overlay either clears or the next attempt waits on the real thing.
async function openDangerTab(page) {
  const tab = page.locator("#settingsPage .smd-tab-btn").filter({ hasText: "Danger" });
  for (let attempt = 0; attempt < 4; attempt++) {
    await dismissStartupModal(page);
    try {
      await tab.click({ timeout: 2500 });
      return;
    } catch (e) {
      if (attempt === 3) throw e;
    }
  }
}

test.describe("Danger tab shape is consistent across apps", () => {
  const DANGER = [
    {
      app: "PlanMyDay", path: "/PlanMyDay/",
      rows: ["Show danger", "No Cache", "Regenerate Main Tiles", "Sort Jobs in Streams", "Refresh App",
        "Clear local storage PMD", "Upload Standard Images"],
    },
    {
      app: "CountMyDays", path: "/CountMyDays/",
      rows: ["Show danger", "No Cache", "Refresh App", "Clear local storage CMD", "Clear Google cache",
        "Load Sample Data", "Upload Standard Images"],
    },
    {
      app: "QRLinks", path: "/QRLinks/",
      rows: ["Show danger", "No Cache", "Refresh App", "Clear local storage QR", "Load Sample Links",
        "Load Sample Images"],
    },
    {
      app: "SolarControlar", path: "/SolarControlar/",
      rows: ["Show danger", "No Cache", "Refresh App", "Clear local storage Solar"],
    },
    {
      app: "ListOfLists", path: "/ListOfLists/",
      rows: ["Show danger", "No Cache", "Regenerate Main Tiles", "Sort Lists in Categories", "Refresh App",
        "Clear local storage LoL", "Upload Standard Images"],
    },
    {
      app: "PhoneButtons", path: "/remoteHID/PhoneButtons/",
      rows: ["Show danger", "No Cache", "Refresh App", "Clear local storage PB"],
    },
    {
      app: "Launch", path: "/",
      rows: ["Show danger", "No Cache", "Refresh App", "Clear local storage Launch", "Upload Standard Images"],
    },
    {
      app: "FreeFormOX", path: "/FreeFormOX/",
      rows: ["Show danger", "No Cache", "Refresh App", "Clear local storage FFOX", "Upload Standard Images"],
    },
  ];

  // Colours (user rule, 2026-10-18): destructive = danger; bulk maintenance
  // (Regenerate/Sort) = SECONDARY; Refresh App and every data LOADER = WARNING.
  // The two switches have no colour.
  const colourFor = (name) => {
    if (name.startsWith("Clear ")) return "danger";
    if (name.startsWith("Regenerate") || name.startsWith("Sort ")) return "secondary";
    if (name === "Refresh App" || name.startsWith("Load ") || name.startsWith("Upload ")) return "warning";
    return null;
  };

  for (const spec of DANGER) {
    test(`${spec.app}: Danger rows are ordered, grouped and coloured consistently`, async ({ page }) => {
      await page.goto(spec.path);
      await page.evaluate(() => openSettings());
      await dismissStartupModal(page);
      await openDangerTab(page);
      await page.locator("#showDanger").check();
      await expect(page.locator("#settingsPage .smd-tab-panel.active")).toHaveCount(1);
      const rows = await page.evaluate(() => {
        const panel = document.querySelector("#settingsPage .smd-tab-panel.active");
        // Every Danger row is a `div.row`; the ACTION rows are full width (no
        // `col-md-8`), so the button starts where the label column ends and runs to
        // the right edge - the switch rows keep the narrower `col-md-8` control
        // column. (Before 2026-10-19 the action rows were `col-md-8` too, which
        // made every Danger button ~44% of the page: the reported "too narrow".)
        return Array.from(panel.querySelectorAll("div.row"))
          .filter((row) => !row.classList.contains("d-none"))
          .map((row) => {
            const label = row.querySelector("label");
            // Every action button is an <smd-button block> now (the user asked for
            // the shared component, full width); read its variant ATTRIBUTE.
            const host = row.querySelector("smd-button, button");
            const btn = host && host.tagName === "SMD-BUTTON" ? host.querySelector("button") : host;
            const colour = host
              ? (host.getAttribute("variant") || (host.className.match(/btn-([a-z]+)/) || [])[1] || null)
              : null;
            const box = btn ? btn.getBoundingClientRect() : null;
            const rowBox = row.getBoundingClientRect();
            return {
              name: (label ? label.textContent : (host ? host.textContent : "")).trim(),
              gapAbove: row.classList.contains("mt-4"),
              colour: colour,
              width: box ? Math.round(box.width) : null,
              height: box ? Math.round(box.height) : null,
              tag: host ? host.tagName : null,
              // geometry, to pin the "starts after the label column, runs full
              // width" rule
              rowLeft: Math.round(rowBox.left),
              rowRight: Math.round(rowBox.right),
              rowWidth: Math.round(rowBox.width),
              btnLeft: box ? Math.round(box.left) : null,
              btnRight: box ? Math.round(box.right) : null,
            };
          });
      });
      expect(rows.map((r) => r.name)).toEqual(spec.rows);
      expect(rows[0].gapAbove, "the first row never starts with a gap").toBe(false);
      const buttons = rows.filter((r) => r.tag);
      expect(buttons.length, "the app has action buttons").toBeGreaterThan(1);
      for (let i = 0; i < rows.length; i++) {
        expect(rows[i].colour, `${rows[i].name} colour`).toBe(colourFor(rows[i].name));
        if (rows[i].tag) {
          // every Danger action button is the shared component at ONE size ...
          expect(rows[i].tag, rows[i].name).toBe("SMD-BUTTON");
          expect(rows[i].width, `${rows[i].name} width`).toBe(buttons[0].width);
          expect(rows[i].height, `${rows[i].name} height`).toBe(buttons[0].height);
          // ... and it runs to the right edge of the settings container, starting
          // at the label column (col-4), not inside a narrower `col-md-8` row.
          expect(rows[i].rowRight - rows[i].btnRight, `${rows[i].name} reaches the row's right edge`)
            .toBeLessThanOrEqual(24);          // gutters/padding only
          expect(rows[i].btnLeft - rows[i].rowLeft, `${rows[i].name} starts after the label column`)
            .toBeGreaterThanOrEqual(rows[i].rowWidth / 3 - 24);
          expect(rows[i].width, `${rows[i].name} uses the full width`).toBeGreaterThan(rows[i].rowWidth * 0.55);
        }
        if (i > 0) {
          expect(rows[i].gapAbove && rows[i - 1].gapAbove,
            `two gaps in a row before "${rows[i].name}"`).toBe(false);
        }
      }
    });
  }

  // The rows above only prove the MARKUP. A Danger action also has to run: its
  // handler must exist AND the shared <smd-modal> component must be loaded, or
  // `showSmdModal()` throws `modal.show is not a function` and the confirm never
  // appears (FreeFormOX shipped exactly that: `confirmClearAllData()` and the new
  // Upload Standard Images button both died silently because the shell never
  // loaded shared/js/components/smd-modal.js).
  test("every app's Danger actions open their confirm modal", async ({ page }) => {
    for (const spec of DANGER) {
      await page.goto(spec.path);
      await page.evaluate(() => openSettings());
      await openDangerTab(page);
      await page.locator("#showDanger").check();
      const modal = page.locator("#smdConfirmModal");

      // Clear local storage <APP> - asks first, and Cancel leaves the data alone.
      // PhoneButtons' row keeps its own id (#btnClearStorage).
      const clearButton = page.locator("#btnClearAllData, #btnClearStorage");
      await clearButton.click();
      await expect(modal, spec.app + ": Clear local storage opens a confirm").toBeVisible();
      await expect(modal.getByRole("button", { name: "Clear" })).toBeVisible();
      await modal.getByRole("button", { name: "Cancel" }).click();
      await expect(modal).toBeHidden();

      // Upload Standard Images (only the apps that have the row).
      if (await page.locator("#btnUploadImages").count()) {
        await page.locator("#btnUploadImages").click();
        await expect(modal, spec.app + ": Upload Standard Images opens its dialog").toBeVisible();
        await expect(modal.getByRole("button", { name: "Add" })).toBeVisible();
        await modal.getByRole("button", { name: "Cancel" }).click();
        await expect(modal).toBeHidden();
      }
    }
  });
});

test.describe("Settings page shape is consistent across apps", () => {
  const LAYOUT = [
    {
      app: "Launch", path: "/", tabs: ["Display", "Menu", "Danger"],
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
      app: "FreeFormOX", path: "/FreeFormOX/", tabs: ["Display", "Game", "Danger"],
      display: ["Theme", "Theme Mode", "Font size", "Touch size", "Slide speed", "Auto-hide menu"],
    },
    {
      app: "ListOfLists", path: "/ListOfLists/", tabs: ["Display", "Minio", "Danger"],
      display: ["Theme", "Theme Mode", "Font size", "Icon size", "Touch size", "Tile density", "Slide speed",
        "Auto-hide menu", "Screen resolution"],
    },
    {
      app: "PhoneButtons", path: "/remoteHID/PhoneButtons/", tabs: ["Display", "Server", "Danger"],
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
