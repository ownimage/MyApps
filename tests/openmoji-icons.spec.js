// OpenMoji — the vendored colour emoji library (CC BY-SA 4.0).
//
// Covers the contract:
//   * an "OpenMoji" tab on the shared image picker (<smd-image-picker>), after
//     FA Brands, listing the whole library with the OpenMoji colour font;
//   * picking one stores "om:<name>" in the target's image field;
//   * <smd-image image="om:<name>"> paints the colour glyph, including
//     multi-codepoint emoji (flags / skin tones / ZWJ families) joined into ONE
//     glyph by the font's ligature lookup;
//   * every app shell loads the vendored font stylesheet and shows the
//     attribution (CC BY-SA 4.0 requires it).
const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

const SHELLS = [
  "/",
  "/PlanMyDay/",
  "/CountMyDays/",
  "/QRLinks/",
  "/SolarControlar/",
  "/FreeFormOX/",
  "/ListOfLists/",
  "/MyHID/",
  "/Storyboard/",
  "/storybook/"
];

// Unicode code points for an OpenMoji hexcode ("1F1FA-1F1F8" -> the two chars).
function hexChars(hex) {
  return hex.split("-").map((h) => String.fromCodePoint(parseInt(h, 16))).join("");
}

async function openPicker(page) {
  await page.goto("/PlanMyDay/");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => typeof window.__openImagePicker === "function");
  await page.evaluate(() => {
    window.__omPicked = "unset";
    window.__openImagePicker((name) => { window.__omPicked = name; });
  });
  await page.locator("#imagePickerPage").waitFor({ state: "visible" });
  await page.locator("#imagePickerPage smd-image-picker").waitFor({ state: "attached" });
}

async function openTab(page, label) {
  await page.locator("#imagePickerPage smd-image-picker .smd-tab-btn").filter({ hasText: label }).click();
}

const items = (page) => page.locator("#imagePickerPage smd-image-picker .item");

test.describe("OpenMoji - picker tab", () => {

  test("the picker lists an OpenMoji tab after FA Brands", async ({ page }) => {
    await openPicker(page);
    const labels = (await page.locator("#imagePickerPage smd-image-picker .smd-tab-btn").allTextContents())
      .map((t) => t.trim());
    expect(labels).toEqual(["Local", "Bootstrap", "FontAwesome", "FABrands", "OpenMoji"]);
  });

  test("the OpenMoji tab lists the whole library with the colour emoji font", async ({ page }) => {
    test.setTimeout(90000);
    await openPicker(page);
    await openTab(page, "OpenMoji");
    await expect(items(page).first()).toBeVisible({ timeout: 30000 });
    await expect.poll(async () => items(page).count(), { timeout: 30000 }).toBeGreaterThan(4000);

    const glyph = await page.locator("#imagePickerPage smd-image-picker .glyph").first()
      .evaluate((el) => ({
        family: getComputedStyle(el).fontFamily,
        text: el.textContent,
        // Every emoji glyph is a real character from the Unicode emoji planes.
        codePoint: el.textContent.codePointAt(0)
      }));
    expect(glyph.family).toContain("OpenMoji");
    expect(glyph.codePoint).toBeGreaterThan(0);
    expect(glyph.text.length).toBeGreaterThan(0);

    // The vendored colour font is really being used (not the system emoji font).
    await expect.poll(() => page.evaluate(
      () => [...document.fonts].some((f) => f.family.replace(/"/g, "") === "OpenMoji" && f.status === "loaded")
    ), { timeout: 30000 }).toBe(true);

    // Labels are the generated kebab-case names, so the search box can match them.
    const first = (await page.locator("#imagePickerPage smd-image-picker .label").first().textContent()).trim();
    expect(first).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test("the search box filters the emoji library by name", async ({ page }) => {
    test.setTimeout(90000);
    await openPicker(page);
    await openTab(page, "OpenMoji");
    await expect(items(page).first()).toBeVisible({ timeout: 30000 });
    await expect.poll(async () => items(page).count(), { timeout: 30000 }).toBeGreaterThan(4000);
    const total = await items(page).count();

    await page.locator("#imagePickerPage smd-image-picker input[type=search]").fill("grinning");
    await expect.poll(async () => items(page).count(), { timeout: 15000 }).toBeGreaterThan(0);
    const filtered = await items(page).count();
    expect(filtered).toBeLessThan(total);
    const labels = (await page.locator("#imagePickerPage smd-image-picker .label").allTextContents())
      .map((t) => t.trim());
    expect(labels.every((l) => l.includes("grinning"))).toBe(true);

    await page.locator("#imagePickerPage smd-image-picker smd-search button").click();
    await expect.poll(async () => items(page).count(), { timeout: 15000 }).toBe(total);
  });

  test("picking an emoji stores an om: name and renders it with the OpenMoji font", async ({ page }) => {
    test.setTimeout(90000);
    await openPicker(page);
    await openTab(page, "OpenMoji");
    await expect(items(page).first()).toBeVisible({ timeout: 30000 });

    const label = (await page.locator("#imagePickerPage smd-image-picker .label").first().textContent()).trim();
    await items(page).first().click();
    await page.locator("#imagePickerPage").waitFor({ state: "hidden" });
    const picked = await page.evaluate(() => window.__omPicked);
    expect(picked).toBe("om:" + label);

    // The stored name renders through <smd-image> with the vendored font.
    await page.evaluate((name) => {
      document.getElementById("countdownContainer").innerHTML =
        '<smd-image id="omProbe" size="64" image="' + name + '"></smd-image>';
    }, picked);
    await expect(page.locator("#omProbe .smd-bi")).toBeVisible();
    const glyph = await page.locator("#omProbe .smd-bi").evaluate((el) => ({
      family: getComputedStyle(el).fontFamily,
      text: el.textContent.trim()
    }));
    expect(glyph.family).toContain("OpenMoji");
    expect(glyph.text.length).toBeGreaterThan(0);
  });

  test("a multi-codepoint emoji (flag) joins into one glyph, not two", async ({ page }) => {
    test.setTimeout(90000);
    await openPicker(page);
    await openTab(page, "OpenMoji");
    await expect(items(page).first()).toBeVisible({ timeout: 30000 });
    // Make sure the font is actually downloaded before measuring advances.
    await page.evaluate(() => document.fonts.load("48px OpenMoji", "\u{1F600}\u{1F1FA}\u{1F1F8}"));
    await page.evaluate(() => document.fonts.ready);

    const measured = await page.evaluate((flagChars) => {
      const chars = (hex) => hex.split("-").map((h) => String.fromCodePoint(parseInt(h, 16))).join("");
      const measure = (text) => {
        const d = document.createElement("div");
        d.style.cssText = "position:absolute;left:-9999px;top:0;font-family:OpenMoji;font-size:48px;white-space:nowrap;width:max-content;line-height:1";
        d.textContent = text;
        document.body.appendChild(d);
        const w = d.getBoundingClientRect().width;
        d.remove();
        return w;
      };
      return {
        single: measure(chars("1F600")),
        flag: measure(chars("1F1FA-1F1F8")),
        flagText: chars("1F1FA-1F1F8"),
        check: document.fonts.check("48px OpenMoji", chars("1F600"))
      };
    }, hexChars("1F1FA-1F1F8"));

    expect(measured.check).toBe(true);
    expect(measured.flagText).toBe("\u{1F1FA}\u{1F1F8}");
    // Two unligated glyphs would be ~2x the single advance; the ligature is ~1x.
    expect(measured.flag).toBeLessThan(measured.single * 1.4);
  });

  test("the picker tabs wrap instead of overflowing on a phone width", async ({ page }) => {
    await openPicker(page);
    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => {
      const list = document.querySelector("#imagePickerPage smd-image-picker .smd-tab-list");
      const btns = Array.from(document.querySelectorAll("#imagePickerPage smd-image-picker .smd-tab-btn"));
      return {
        scrollWidth: list.scrollWidth,
        clientWidth: list.clientWidth,
        rows: new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top))).size,
        count: btns.length
      };
    });
    expect(box.count).toBe(5);
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
    expect(box.rows).toBeGreaterThan(1);
  });
});

test.describe("OpenMoji - vendoring + attribution", () => {

  test("every app shell loads the OpenMoji font stylesheet and the credit element", async ({ request }) => {
    for (const shell of SHELLS) {
      const res = await request.get(shell);
      expect(res.ok(), shell).toBeTruthy();
      const html = await res.text();
      expect(html, shell).toContain("vendor/openmoji/openmoji.css");
      expect(html, shell).toContain("<smd-openmoji-credit");
      expect(html, shell).toContain("components/smd-openmoji-credit.js");
    }
  });

  test("the settings footer shows the OpenMoji attribution next to the Font Awesome credit", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("#btnMainMenu").click();
    await page.locator("#mainNav .dropdown-item").filter({ hasText: "Settings" }).first().click();
    await page.locator("#settingsPage").waitFor({ state: "visible" });
    const credit = page.locator("#settingsPage smd-openmoji-credit");
    await expect(credit).toBeVisible();
    await expect(credit).toContainText("OpenMoji");
    await expect(credit).toContainText("CC BY-SA 4.0");
    const links = await credit.evaluate((el) => Array.from(el.querySelectorAll("a")).map((a) => a.href));
    expect(links.some((h) => h === "https://openmoji.org/")).toBe(true);
    expect(links.some((h) => h === "https://creativecommons.org/licenses/by-sa/4.0/")).toBe(true);
    // The existing Font Awesome attribution is still there, directly above it.
    await expect(page.locator("#settingsPage smd-fontawesome-credit")).toBeVisible();
  });
});
