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
    await expect(page.locator("#pmd-stream pmd-job-stream-card")).toHaveCount(4);

    // Theme selector reflects the saved theme and mode.
    await expect(page.locator("#themeSelect option")).toHaveCount(26);
    await expect(page.locator("#modeSelect option")).toHaveText(["Default", "Light", "Dark"]);
    await expect(page.locator("#sb-theme .smd-theme-select")).toHaveCount(1);
    await expect(page.locator("#sb-theme .smd-theme-mode-select")).toHaveCount(1);
    await expect(page.locator("#sb-theme .smd-theme-select")).toBeVisible();
    await expect(page.locator("#sb-theme .smd-theme-mode-select")).toBeVisible();
    await expect(page.locator("#sb-theme .smd-theme-mode-select option")).toHaveText(["Default", "Light", "Dark"]);
    await expect(page.locator("#sb-theme .smd-theme-select")).toHaveValue(await page.locator("#themeSelect").inputValue());
    await expect(page.locator("#sb-theme .smd-theme-mode-select")).toHaveValue(await page.locator("#modeSelect").inputValue());
    await page.locator("#sb-theme .smd-theme-mode-select").selectOption("light");
    await expect(page.locator("#sb-theme")).toHaveAttribute("mode", "light");
    await expect(page.locator("#log-smd-theme")).toContainText("source=mode");
  });

  test("storybook chrome and controls use Bootstrap utilities", async ({ page }) => {
    await page.goto("/storybook/");

    await expect(page.locator("body")).toHaveClass(/overflow-x-hidden/);
    await expect(page.locator("nav.sb-nav a").first()).toHaveClass(/link-secondary.*border.*rounded-pill/);
    await expect(page.locator("section.sb-section").first()).toHaveClass(/border.*rounded-3.*bg-body.*mb-5/);
    await expect(page.locator(".sb-run, .sb-row, .sb-stack, .sb-frame-wrapper, .sb-placeholder")).toHaveCount(0);

    const storyStyle = await page.locator("head > style").first().textContent();
    expect(storyStyle).not.toMatch(/box-sizing|header\.sb-header|nav\.sb-nav|section\.sb-section|\.sb-controls (?:input|button)/);

    const controls = page.locator(".sb-controls input, .sb-controls select, .sb-controls button");
    expect(await controls.evaluateAll((nodes) => nodes.every((node) => {
      if (node.matches("input[type='checkbox'], input[type='radio']")) return node.classList.contains("form-check-input");
      if (node.matches("input[type='text']")) return node.classList.contains("form-control") && node.classList.contains("form-control-sm");
      if (node.matches("select")) return node.classList.contains("form-select") && node.classList.contains("form-select-sm");
      return node.classList.contains("btn") && node.classList.contains("btn-primary") && node.classList.contains("btn-sm");
    }))).toBe(true);
  });

  test("component demo hosts are block-level and theme-aware", async ({ page }) => {
    await page.goto("/storybook/");

    const hosts = page.locator([
      "main pmd-stream-header",
      "main pmd-job-stream-card",
      "main pmd-job-search-card",
      "main pmd-job-today-card",
      "main cmd-countdown-card",
      "main cmd-date-card",
      "main cmd-category-card",
      "main qrlink-card"
    ].join(", "));
    await expect(hosts).toHaveCount(25);
    expect(await hosts.evaluateAll((nodes) => nodes.every((node) => (
      node.classList.contains("d-block") && getComputedStyle(node).display === "block"
    )))).toBe(true);

    const themeCards = page.locator([
      "main pmd-job-stream-card > .card",
      "main pmd-job-search-card > .card",
      "main pmd-job-today-card > .card",
      "main cmd-countdown-card > .card",
      "main cmd-date-card > .card",
      "main cmd-category-card > .card"
    ].join(", "));
    await expect(themeCards).toHaveCount(20);
    expect(await themeCards.evaluateAll((nodes) => nodes.every((node) => (
      node.classList.contains("bg-body-tertiary") && node.classList.contains("text-body")
    )))).toBe(true);
    await expect(page.locator("main qrlink-card > .card")).toHaveCount(2);
    expect(await page.locator("main qrlink-card > .card").evaluateAll((nodes) => nodes.every((node) => (
      node.classList.contains("bg-dark") && node.classList.contains("text-white")
    )))).toBe(true);

    const hiddenGoogle = page.locator('#cmd-date-card cmd-date-card[data-google-hidden="true"]');
    await expect(hiddenGoogle).toBeVisible();
    await expect(hiddenGoogle.locator(".event-badge-hidden")).toHaveText("Hidden");
    await expect(hiddenGoogle.locator('[data-action="delete"]')).toBeHidden();

    const qrCards = page.locator("#qrlink-card qrlink-card");
    await expect(qrCards).toHaveCount(2);
    await expect(qrCards.first().locator(".qr-btn")).toBeVisible();
    await expect(qrCards.last().locator(".qr-btn")).toBeHidden();
  });

  test("Superhero keeps its dark-blue body surface", async ({ page }) => {
    await page.goto("/storybook/");
    await page.locator("#themeSelect").selectOption("superhero");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(15, 37, 55)");
    await page.locator("#modeSelect").selectOption("light");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(15, 37, 55)");
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

  test("storybook mode storage does not overwrite the app mode", async ({ page }) => {
    await page.goto("/storybook/");
    await page.evaluate(() => {
      localStorage.setItem("storybook_theme", "cerulean");
      localStorage.setItem("storybook_themeMode", "dark");
      localStorage.setItem("planmydays_theme", "flatly");
      localStorage.setItem("planmydays_themeMode", "light");
    });
    await page.reload();

    await expect(page.locator("#themeSelect")).toHaveValue("cerulean");
    await expect(page.locator("#modeSelect")).toHaveValue("dark");
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");
    expect(await page.evaluate(() => ({
      appTheme: localStorage.getItem("planmydays_theme"),
      appMode: localStorage.getItem("planmydays_themeMode")
    }))).toEqual({ appTheme: "flatly", appMode: "light" });

    await page.locator("#modeSelect").selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "light");
    await expect(page.locator("#sb-theme")).toHaveAttribute("mode", "light");
    expect(await page.evaluate(() => ({
      appTheme: localStorage.getItem("planmydays_theme"),
      appMode: localStorage.getItem("planmydays_themeMode"),
      storybookMode: localStorage.getItem("storybook_themeMode")
    }))).toEqual({ appTheme: "flatly", appMode: "light", storybookMode: "light" });
  });

});
