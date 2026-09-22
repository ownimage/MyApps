const { test, expect } = require("@playwright/test");

test.describe("Storybook - Regression", () => {

  test("boots with no console/page errors and no failed requests", async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    const failed = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    page.on("requestfailed", (req) => failed.push(req.url()));

    await page.goto("/storybook/");
    await expect(page.locator("nav.sb-nav a")).toHaveCount(30);

    // Settle window (section init code runs synchronously after renderAll).
    await page.waitForTimeout(1000);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failed).toEqual([]);
  });

  test("component demos render their host elements", async ({ page }) => {
    await page.goto("/storybook/");

    // pmd-stream-header demo renders via the checkbox-driven innerHTML re-parse
    // that previously threw "Cannot set properties of null" during upgrade.
    await expect(page.locator("#sb-stream-header pmd-stream-header")).toHaveCount(1);
    await expect(page.locator("#sb-stream-header .editor-title")).toHaveText("Work");

    // Combined pmd-stream section renders both headers + all four job cards.
    await expect(page.locator("#pmd-stream pmd-stream-header")).toHaveCount(2);
    await expect(page.locator("#pmd-stream pmd-stream-job-card")).toHaveCount(4);

    // Theme selector reflects the saved theme.
    await expect(page.locator("#themeSelect option")).toHaveCount(26);
  });

  test("theme swap re-renders sections without page errors", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto("/storybook/");
    await page.locator("#themeSelect").selectOption("cerulean");
    await page.waitForTimeout(500);
    await expect(page.locator("#sb-stream-header .editor-title")).toHaveText("Work");
    await page.locator("#themeSelect").selectOption("darkly");
    await page.waitForTimeout(500);
    await expect(page.locator("#sb-stream-header .editor-title")).toHaveText("Work");

    expect(pageErrors).toEqual([]);
  });

});