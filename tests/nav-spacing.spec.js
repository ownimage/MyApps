const { test, expect } = require("@playwright/test");

test.describe("shared navbar content spacing", () => {
  test("keeps a gap below the navbar and removes it with auto-hide", async ({ page }) => {
    await page.goto("/CountMyDays/");
    await page.evaluate(() => {
      localStorage.setItem("countmydays_theme", "simplex");
      localStorage.setItem("countmydays_themeMode", "dark");
      localStorage.setItem("countmydays_autoHideMenu", "false");
    });
    await page.reload();
    await page.evaluate(() => {
      document.body.classList.remove("auto-hide-menu");
      document.getElementById("mainNav").classList.remove("nav-hidden");
    });

    const normal = await page.evaluate(() => {
      const nav = document.getElementById("mainNav");
      const content = document.querySelector("#mainNav + .container-fluid");
      return {
        navPosition: getComputedStyle(nav).position,
        marginBottom: parseFloat(getComputedStyle(nav).marginBottom),
        contentPaddingTop: parseFloat(getComputedStyle(content).paddingTop)
      };
    });
    expect(normal.navPosition).not.toBe("fixed");
    expect(normal.marginBottom).toBeGreaterThan(0);
    expect(normal.contentPaddingTop).toBe(0);

    await page.evaluate(() => document.body.classList.add("auto-hide-menu"));
    await expect.poll(() => page.evaluate(() => {
      const content = document.querySelector("#mainNav + .container-fluid");
      return parseFloat(getComputedStyle(content).paddingTop);
    })).toBeGreaterThan(0);
    const visible = await page.evaluate(() => {
      const content = document.querySelector("#mainNav + .container-fluid");
      return {
        navPosition: getComputedStyle(document.getElementById("mainNav")).position,
        paddingTop: parseFloat(getComputedStyle(content).paddingTop)
      };
    });
    expect(visible.navPosition).toBe("fixed");

    await page.evaluate(() => document.getElementById("mainNav").classList.add("nav-hidden"));
    await expect.poll(() => page.evaluate(() => {
      const content = document.querySelector("#mainNav + .container-fluid");
      return parseFloat(getComputedStyle(content).paddingTop);
    })).toBeLessThan(visible.paddingTop);
  });
});
