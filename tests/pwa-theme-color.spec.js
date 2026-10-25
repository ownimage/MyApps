const { test, expect } = require("@playwright/test");

// PWA title-bar colour.
//
// Windows 11 paints an installed PWA's title bar from theme_color, and the
// page's <meta name="theme-color"> overrides the manifest value once loaded.
// The app must therefore keep that meta on the SAME surface as its in-app top
// menu bar (--bs-body-bg): that always matches the theme AND flips with the
// light/dark mode (unlike --bs-secondary, which Yeti leaves at #eee in both).

async function metaThemeColor(page) {
  return page.evaluate(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    return meta ? meta.getAttribute("content") : null;
  });
}

function computedBar(page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--bs-body-bg").trim());
}

test.describe("PWA theme-color", () => {
  test("the title-bar colour follows the app's top-bar surface for the chosen theme and mode", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("launch_theme", "cerulean");
      localStorage.setItem("launch_themeMode", "light");
    });
    await page.reload();
    await expect.poll(() => metaThemeColor(page)).toBe(await computedBar(page));
    expect(await metaThemeColor(page)).toBe("#fff");

    // A runtime THEME switch repaints the meta (title bar) without a reload.
    await page.evaluate(() => applyTheme("superhero", "light"));
    await expect.poll(() => metaThemeColor(page)).toBe("#0f2537");
    await expect.poll(() => metaThemeColor(page)).toBe(await computedBar(page));

    // A MODE switch follows the new body surface too.
    await page.evaluate(() => applyThemeMode("superhero", "dark"));
    await expect.poll(() => metaThemeColor(page)).toBe("#212529");

    // Yeti was the regression: its --bs-secondary stays #eee in both modes,
    // which made the dark title bar white. The body surface flips.
    await page.evaluate(() => applyTheme("yeti", "light"));
    await expect.poll(() => metaThemeColor(page)).toBe("#fff");
    await page.evaluate(() => applyThemeMode("yeti", "dark"));
    await expect.poll(() => metaThemeColor(page)).toBe("#222");

    // The installed MyApps title bar must never use the old Android green.
    expect(await metaThemeColor(page)).not.toBe("#3ddc84");
  });

  test("every app shell syncs the meta with its top-bar surface", async ({ page }) => {
    for (const path of ["/PlanMyDay/", "/CountMyDays/", "/ListOfLists/", "/QRLinks/", "/Storyboard/"]) {
      await page.goto(path);
      const bar = await computedBar(page);
      expect(bar, path).toBeTruthy();
      await expect.poll(() => metaThemeColor(page), { message: path }).toBe(bar);
      expect(await metaThemeColor(page), path).not.toBe("#3ddc84");
    }
  });
});
