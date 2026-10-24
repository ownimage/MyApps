const { test, expect } = require("@playwright/test");

// PWA title-bar colour.
//
// Windows 11 paints an installed PWA's title bar from theme_color, and the
// page's <meta name="theme-color"> overrides the manifest value once loaded.
// The app must therefore keep that meta in sync with the CHOSEN theme's
// secondary colour (the user's fallback when the OS accent is unavailable).

async function metaThemeColor(page) {
  return page.evaluate(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    return meta ? meta.getAttribute("content") : null;
  });
}

function computedSecondary(page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--bs-secondary").trim());
}

test.describe("PWA theme-color", () => {
  test("the title-bar colour follows the chosen theme's secondary colour", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("launch_theme", "cerulean");
      localStorage.setItem("launch_themeMode", "light");
    });
    await page.reload();
    await expect.poll(() => metaThemeColor(page)).toBe(await computedSecondary(page));
    expect(await metaThemeColor(page)).toBe("#e9ecef");

    // A runtime THEME switch repaints the meta (title bar) without a reload.
    await page.evaluate(() => applyTheme("superhero", "light"));
    await expect.poll(() => metaThemeColor(page)).toBe("#4e5d6c");
    await expect.poll(() => metaThemeColor(page)).toBe(await computedSecondary(page));

    // A MODE switch re-points the sheets but keeps the secondary colour.
    await page.evaluate(() => applyThemeMode("superhero", "dark"));
    await expect.poll(() => metaThemeColor(page)).toBe("#4e5d6c");

    // The installed MyApps title bar must never use the old Android green.
    expect(await metaThemeColor(page)).not.toBe("#3ddc84");
  });

  test("every app shell syncs the meta with its theme secondary colour", async ({ page }) => {
    for (const path of ["/PlanMyDay/", "/CountMyDays/", "/ListOfLists/", "/QRLinks/", "/Storyboard/"]) {
      await page.goto(path);
      const secondary = await computedSecondary(page);
      expect(secondary, path).toBeTruthy();
      await expect.poll(() => metaThemeColor(page), { message: path }).toBe(secondary);
      expect(await metaThemeColor(page), path).not.toBe("#3ddc84");
    }
  });
});
