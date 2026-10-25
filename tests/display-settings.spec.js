// Every DISPLAY control must be wired up in EVERY app: present on the Display tab
// and actually doing something. The shared settings layer owns the ids and the
// change*() handlers, so the same interaction works in all eight shells; this spec
// drives the real controls (smd-theme's nested selects, smd-select, smd-checkbox)
// and asserts the observable effect, not the handler.
//
// The six controls every app has: Theme, Theme Mode, Font size, Touch size,
// Slide speed, Auto-hide menu. Icon size (absent in SolarControlar/FreeFormOX -
// no <smd-image>) and Tile density (only the apps that had it) are exercised too
// when the app has the row. "Screen resolution" is deliberately NOT a control: it
// is a read-only <span> that the shared layer fills in.
const { test, expect } = require("@playwright/test");

const APPS = [
  { app: "Launch", path: "/" },
  { app: "PlanMyDay", path: "/PlanMyDay/" },
  { app: "CountMyDays", path: "/CountMyDays/" },
  { app: "QRLinks", path: "/QRLinks/" },
  { app: "SolarControlar", path: "/SolarControlar/" },
  { app: "FreeFormOX", path: "/FreeFormOX/" },
  { app: "ListOfLists", path: "/ListOfLists/" },
  { app: "PhoneButtons", path: "/remoteHID/PhoneButtons/" }
];

const UNIVERSAL = [
  ["Theme", "#themeSelector"],
  ["Theme Mode", "#themeSelector .smd-theme-mode-select"],
  ["Font size", "#fontSizeSelector"],
  ["Touch size", "#touchSizeSelector"],
  ["Slide speed", "#slideDurationSelector"],
  ["Auto-hide menu", "#autoHideMenu"]
];

async function pickOption(page, selector, value) {
  await page.locator(selector).click();
  const item = page.locator(`${selector} .smd-select-item[data-value="${value}"]`);
  await expect(item).toBeVisible();
  await item.click();
}

// SolarControlar talks to a Flask API; without a stub its 404s open an error
// modal that blocks the toolbar (its own spec mocks the same paths).
async function stubSolarApi(page) {
  await page.route("**/solar/api/power_data*", (route) => {
    const date = new URL(route.request().url()).searchParams.get("date");
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(date
        ? { date, times: [], solar: [], grid: [], home: [], battery: [], battery_level: [] }
        : { dates: [] })
    });
  });
  await page.route("**/solar/api/files*", (route) =>
    route.fulfill({ contentType: "text/plain", body: "" }));
  await page.route("**/solar/", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html><body></body></html>" }));
}

// Any boot-time error modal (a failed API fetch, a missing server) would swallow
// the toolbar clicks this spec needs, so clear it first.
async function dismissBootModals(page) {
  const modal = page.locator("#smdConfirmModal[open]");
  if (await modal.count()) {
    await modal.locator("button").last().click();
    await expect(modal).toBeHidden();
  }
}

async function openDisplayTab(page) {
  await dismissBootModals(page);
  await page.locator("#btnMainMenu").click();
  await page.locator("#mainNav .dropdown-menu .dropdown-item").filter({ hasText: "Settings" }).first().click();
  const settings = page.locator("#settingsPage");
  await expect(settings).toHaveAttribute("open", "");
  await settings.locator(".smd-tab-btn").filter({ hasText: "Display" }).click();
  await expect(settings.locator("#settingsTabs > .smd-tab-panel.active")).toBeVisible();
}

const labelFontSize = () => {
  const label = document.querySelector("#settingsTabs > .smd-tab-panel.active .form-label");
  return label ? parseFloat(getComputedStyle(label).fontSize) : null;
};
// The Display tab's own switch (the first checkbox in ANOTHER tab would be
// display:none and measure 0).
const checkboxWidth = () => {
  const input = document.querySelector("#autoHideMenu input");
  return input ? Math.round(input.getBoundingClientRect().width * 100) / 100 : null;
};
const slideDuration = () => {
  const page1 = document.querySelector("smd-page");
  return page1 ? page1.slideDuration : null;
};

test.describe("Display settings are wired up in every app", () => {
  for (const spec of APPS) {
    test(`${spec.app}: Display controls exist and take effect`, async ({ page }) => {
      if (spec.app === "SolarControlar") await stubSolarApi(page);
      await page.goto(spec.path);
      await openDisplayTab(page);

      for (const [name, selector] of UNIVERSAL) {
        await expect(page.locator(selector), `${spec.app}: ${name} control`).toBeVisible();
      }

      // THEME + THEME MODE ---------------------------------------------------
      await pickOption(page, "#themeSelector .smd-theme-select", "cerulean");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "cerulean");
      await expect.poll(() => page.evaluate(() =>
        document.getElementById("bootstrap-theme-css").getAttribute("href")))
        .toContain("/cerulean/");
      await pickOption(page, "#themeSelector .smd-theme-mode-select", "dark");
      await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");

      // FONT SIZE - the attribute, the body class AND the real text size (the
      // bug where form text ignored the setting). ---------------------------
      const labelBefore = await page.evaluate(labelFontSize);
      await pickOption(page, "#fontSizeSelector", "jumbo");
      await expect(page.locator("html")).toHaveAttribute("data-smd-font-size", "jumbo");
      await expect.poll(() => page.evaluate(() =>
        ["font-size-jumbo"].every((c) => document.body.classList.contains(c)))).toBe(true);
      const labelAfter = await page.evaluate(labelFontSize);
      expect(labelAfter, `${spec.app}: the form text follows the Font size setting`).toBeGreaterThan(labelBefore);

      // TOUCH SIZE - the attribute plus the real checkbox size. Some apps
      // deliberately DEFAULT to "large" (PlanMyDay/ListOfLists read the legacy
      // `dragSize` key first), so drive through both values rather than assuming
      // the starting point.
      await pickOption(page, "#touchSizeSelector", "normal");
      const cbNormal = await page.evaluate(checkboxWidth);
      await pickOption(page, "#touchSizeSelector", "large");
      await expect(page.locator("html")).toHaveAttribute("data-smd-touch-size", "large");
      const cbLarge = await page.evaluate(checkboxWidth);
      expect(cbLarge, `${spec.app}: the Touch size setting resizes checkboxes`).toBeGreaterThan(cbNormal);

      // TILE DENSITY (only where the app has the row) -------------------------
      if (await page.locator("#densitySelector").count()) {
        await pickOption(page, "#densitySelector", "compact");
        await expect(page.locator("html")).toHaveAttribute("data-smd-tile-density", "compact");
        await expect.poll(() => page.evaluate(() => document.body.classList.contains("compact"))).toBe(true);
      }

      // SLIDE SPEED - the shared <smd-page> duration. --------------------------
      await pickOption(page, "#slideDurationSelector", "500");
      await expect.poll(() => page.evaluate(slideDuration)).toBe(500);

      // ICON SIZE (only where the app has the row) ----------------------------
      if (await page.locator("#iconSizeSelector").count()) {
        await pickOption(page, "#iconSizeSelector", "jumbo");
        await expect(page.locator("html")).toHaveAttribute("data-smd-icon-size", "jumbo");
        await expect.poll(() => page.evaluate(() =>
          document.body.classList.contains("icon-size-jumbo"))).toBe(true);
      }

      // AUTO-HIDE MENU - the body class toggles. ------------------------------
      await page.locator("#autoHideMenu").check();
      await expect.poll(() => page.evaluate(() =>
        document.body.classList.contains("auto-hide-menu"))).toBe(true);
      await page.locator("#autoHideMenu").uncheck();
      await expect.poll(() => page.evaluate(() =>
        document.body.classList.contains("auto-hide-menu"))).toBe(false);
    });
  }
});
