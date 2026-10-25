const { test, expect } = require("@playwright/test");

test.describe("Launch - app icons", () => {
  test("fills in a registered app icon missing from an existing sample library", async ({ page }) => {
    await page.goto("/");
    // Wait for the normal first-visit seed to finish, then replace it with the
    // kind of store an existing user has: no Storyboard entry yet, plus one
    // ordinary sample removed on purpose to prove we do not merge everything.
    await page.waitForFunction(() => localStorage.getItem("shared-images") !== null);
    await page.evaluate(async () => {
      const response = await fetch("shared/sampleImages.json?v=" + BUILD_NUMBER);
      const data = await response.json();
      const stale = data.images.filter((img) =>
        img.name !== "Storyboard" && img.name !== "Person 1");
      localStorage.setItem("shared-images", JSON.stringify(stale));
    });
    await page.reload();

    const tile = page.locator("#appGrid .app-tile", { hasText: "Storyboard" });
    await expect(tile).toHaveCount(1);
    await expect.poll(async () => tile.locator("smd-image img").evaluate(
      (el) => el.getAttribute("src") && el.naturalWidth
    )).toBeGreaterThan(0);

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("shared-images")).map((img) => img.name));
    expect(stored).toContain("Storyboard");
    expect(stored).not.toContain("Person 1");
  });
});
