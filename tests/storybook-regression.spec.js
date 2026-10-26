const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");
const { pickOption } = require("./theme-controls");

// Coverage hooks (top-level so every test in this spec is captured).
test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

test.describe("Storybook - Regression", () => {

  test("boots with no console/page errors and no failed requests", async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    const failed = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    page.on("requestfailed", (req) => failed.push(req.url()));

    await page.goto("/storybook/");
    await expect(page.locator("nav.sb-nav a")).toHaveCount(32);

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
    await expect(page.locator("#pmd-stream pmd-job-summary-card")).toHaveCount(4);

    // pmd-tasks demo renders one row per seeded task (+ its note row).
    await expect(page.locator("#sb-pmd-tasks .task-row")).toHaveCount(2);
    await expect(page.locator("#sb-pmd-tasks .task-note-row")).toHaveCount(2);

    // Theme selector reflects the saved theme and mode.
    await expect(page.locator("#storybookThemeSelector .smd-theme-select .smd-select-item")).toHaveCount(27);
    await expect(page.locator("#storybookThemeSelector .smd-theme-mode-select .smd-select-item")).toHaveText(["Light", "Dark"]);
    await expect(page.locator("#sb-theme .smd-theme-select")).toHaveCount(1);
    await expect(page.locator("#sb-theme .smd-theme-mode-select")).toHaveCount(1);
    await expect(page.locator("#sb-theme .smd-theme-select")).toBeVisible();
    await expect(page.locator("#sb-theme .smd-theme-mode-select")).toBeVisible();
    await expect(page.locator("#sb-theme .smd-theme-mode-select .smd-select-item")).toHaveText(["Light", "Dark"]);
    await expect(page.locator("#sb-theme .smd-theme-select")).toHaveAttribute("value", await page.locator("#storybookThemeSelector .smd-theme-select").getAttribute("value"));
    await expect(page.locator("#sb-theme .smd-theme-mode-select")).toHaveAttribute("value", await page.locator("#storybookThemeSelector .smd-theme-mode-select").getAttribute("value"));
    await pickOption(page, "#sb-theme .smd-theme-mode-select", "light");
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

    const controls = page.locator(".sb-controls input, .sb-controls select, .sb-controls smd-select, .sb-controls button:not(.smd-select-btn)");
    expect(await controls.evaluateAll((nodes) => nodes.every((node) => {
      if (node.matches("input[type='checkbox'], input[type='radio']")) return node.classList.contains("form-check-input");
      if (node.matches("input[type='text']")) return node.classList.contains("form-control") && node.classList.contains("form-control-sm");
      if (node.matches("smd-select")) {
        const b = node.querySelector(".smd-select-btn");
        return !!b && b.classList.contains("form-select") && b.classList.contains("form-select-sm");
      }
      if (node.matches("select")) return node.classList.contains("form-select") && node.classList.contains("form-select-sm");
      return node.classList.contains("btn") && node.classList.contains("btn-primary") && node.classList.contains("btn-sm");
    }))).toBe(true);
  });

  test("component demo hosts render their expected elements", async ({ page }) => {
    await page.goto("/storybook/");

    const hosts = page.locator([
      "main pmd-stream-header",
      "main pmd-job-summary-card",
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
    await pickOption(page, "#storybookThemeSelector .smd-theme-select", "flatly");
    await pickOption(page, "#storybookThemeSelector .smd-theme-select", "superhero");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(15, 37, 55)");
    await pickOption(page, "#storybookThemeSelector .smd-theme-mode-select", "light");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(15, 37, 55)");
  });

  test("theme swap re-renders sections without page errors", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto("/storybook/");
    await pickOption(page, "#storybookThemeSelector .smd-theme-select", "cerulean");
    await page.waitForTimeout(500);
    await expect(page.locator("#sb-stream-header .editor-title")).toHaveText("Work");
    await pickOption(page, "#storybookThemeSelector .smd-theme-select", "darkly");
    await page.waitForTimeout(500);
    await expect(page.locator("#sb-stream-header .editor-title")).toHaveText("Work");

    // applyTheme() re-points the theme/override sheets at runtime; the per-theme
    // override sheet must stay AFTER the shared functional sheet, or the theme is
    // no longer the final cascade layer.
    const linkOrder = await page.evaluate(() => Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => (link.getAttribute("href") || "").split(/[?#]/)[0]));
    const indexOfShared = linkOrder.findIndex((href) => /shared\/css\/styles\.css$/.test(href));
    // The per-theme sheet (themes/<name>/<name>.css) must not be confused with the
    // theme's bootstrap.min.css, which also matches themes/<name>/<file>.css.
    const indexOfSpecific = linkOrder.findIndex((href) => /shared\/css\/themes\/[^/]+\/[^/]+\.css$/.test(href) && !/bootstrap\.min\.css$/.test(href));
    const indexOfBase = linkOrder.findIndex((href) => /shared\/css\/themes\/[^/]+\/bootstrap\.min\.css$/.test(href));
    expect(indexOfShared).toBeGreaterThan(-1);
    expect(indexOfBase).toBeGreaterThan(-1);
    expect(indexOfShared).toBeGreaterThan(indexOfBase);
    expect(indexOfSpecific).toBeGreaterThan(indexOfShared);

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

    await expect(page.locator("#storybookThemeSelector .smd-theme-select")).toHaveAttribute("value", "cerulean");
    await expect(page.locator("#storybookThemeSelector .smd-theme-mode-select")).toHaveAttribute("value", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");
    expect(await page.evaluate(() => ({
      appTheme: localStorage.getItem("planmydays_theme"),
      appMode: localStorage.getItem("planmydays_themeMode")
    }))).toEqual({ appTheme: "flatly", appMode: "light" });

    await pickOption(page, "#storybookThemeSelector .smd-theme-mode-select", "light");
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "light");
    await expect(page.locator("#sb-theme")).toHaveAttribute("mode", "light");
    expect(await page.evaluate(() => ({
      appTheme: localStorage.getItem("planmydays_theme"),
      appMode: localStorage.getItem("planmydays_themeMode"),
      storybookMode: localStorage.getItem("storybook_themeMode")
    }))).toEqual({ appTheme: "flatly", appMode: "light", storybookMode: "light" });
  });

  test("card viewer renders one card across every theme and both modes", async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    const failed = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    page.on("requestfailed", (req) => {
      const expectedFrameAbort = req.failure()?.errorText === "net::ERR_ABORTED" && req.url().includes("/shared/vendor/fonts/");
      if (!expectedFrameAbort) failed.push(req.url());
    });

    await page.goto("/storybook/cardViewer.html");
    await expect(page.locator("body")).toHaveAttribute("data-card-viewer-ready", "true");
    await expect(page.locator("#cardSelect .smd-select-item")).toHaveText([
      "Job Today Card",
      "Job Summary Card (stream)",
      "Job Summary Card (search)",
      "Edit Stream Header (collapsed + expanded)",
      "Countdown Card",
      "Date Card",
      "Category Card",
      "QR Link Card",
      "Image Card"
    ]);
    await expect(page.locator("#themeSelect")).toHaveAttribute("value", "all");
    await expect(page.locator("#themeSelect .smd-select-item")).toHaveCount(28);
    await expect(page.locator("#themeSelect .smd-select-item").first()).toHaveText("All themes");

    await pickOption(page, "#themeSelect", "morph");
    await expect(page.locator(".theme-row")).toHaveCount(1);
    await expect(page.locator("iframe.preview-frame")).toHaveCount(2);
    expect(await page.locator("iframe.preview-frame").evaluateAll((frames) => frames.every((frame) => (
      frame.dataset.theme === "morph"
    )))).toBe(true);
    await expect(page.locator("#viewerStatus")).toContainText("Morph");
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-card-viewer-ready", "true");
    await expect(page.locator("#themeSelect")).toHaveAttribute("value", "morph");
    await expect(page.locator(".theme-row")).toHaveCount(1);
    await pickOption(page, "#themeSelect", "all");

    await expect(page.locator(".theme-row")).toHaveCount(27);
    await expect(page.locator("iframe.preview-frame")).toHaveCount(54);
    expect(await page.locator("iframe.preview-frame").evaluateAll((frames) => frames.every((frame) => (
      frame.dataset.card === "pmd-job-today-card" &&
      ["light", "dark"].includes(frame.dataset.mode) &&
      frame.dataset.theme
    )))).toBe(true);

    const lightFrame = page.frameLocator('iframe[data-theme="superhero"][data-mode="light"]');
    const darkFrame = page.frameLocator('iframe[data-theme="superhero"][data-mode="dark"]');
    const lightCard = lightFrame.locator("pmd-job-today-card .smd-card");
    const darkCard = darkFrame.locator("pmd-job-today-card .smd-card");
    await expect(lightCard).toBeVisible();
    await expect(darkCard).toBeVisible();

    // Preview frames must use the same cascade as the app shells: vendor, theme
    // bootstrap, shared styles, the shared mode layer, then the theme-specific
    // override. Keep the ranks in step with cascadeRank() in launch-regression.spec.js.
    const frameRanks = await page.locator("iframe.preview-frame").first().evaluate((frame) => {
      const links = Array.from(frame.contentDocument.querySelectorAll('link[rel="stylesheet"]'));
      return links.map((link) => {
        const href = (link.getAttribute("href") || "").split(/[?#]/)[0];
        if (/shared\/vendor\//.test(href)) return 0;
        if (/shared\/css\/themes\/[^/]+\/bootstrap\.min\.css$/.test(href)) return 1;
        if (/shared\/css\/styles\.css$/.test(href)) return 2;
        // Shared MODE layer: shared/css/themes/<mode>.css (one file per mode).
        if (/shared\/css\/themes\/(light|dark)\.css$/.test(href)) return 3;
        // Per-theme + per-mode layer: shared/css/themes/<theme>/<theme>.<mode>.css.
        if (/shared\/css\/themes\/[^/]+\/[^/]+\.css$/.test(href)) return 4;
        return 5;
      });
    });
    expect(frameRanks.every((rank) => rank < 5)).toBe(true);
    expect(frameRanks).toEqual([...frameRanks].sort((a, b) => a - b));

    const recipes = [
      ["pmd-job-today-card", "pmd-job-today-card > .card"],
      ["pmd-job-summary-card", "pmd-job-summary-card > .d-flex"],
      ["pmd-job-summary-card-search", "pmd-job-summary-card > .d-flex"],
      ["cmd-countdown-card", "cmd-countdown-card > .card"],
      ["cmd-date-card", "cmd-date-card > .card"],
      ["cmd-category-card", "cmd-category-card > .card"],
      ["qrlink-card", "qrlink-card > .card"],
      ["smd-image-card", "smd-image-card > .card"]
    ];
    for (const [cardId, selector] of recipes) {
      await pickOption(page, "#cardSelect", cardId);
      const firstFrame = page.frameLocator('iframe[data-theme="brite"][data-mode="light"]');
      await expect(firstFrame.locator(selector)).toBeVisible();
    }
    await expect(page.frameLocator('iframe[data-theme="brite"][data-mode="light"]').locator("smd-image-card .editor-title")).toHaveText("Calendar");
    await page.waitForTimeout(500);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failed).toEqual([]);
  });

});
