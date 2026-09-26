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
    await expect(page.locator("#storybookThemeSelector .smd-theme-select option")).toHaveCount(26);
    await expect(page.locator("#storybookThemeSelector .smd-theme-mode-select option")).toHaveText(["Default", "Light", "Dark"]);
    await expect(page.locator("#sb-theme .smd-theme-select")).toHaveCount(1);
    await expect(page.locator("#sb-theme .smd-theme-mode-select")).toHaveCount(1);
    await expect(page.locator("#sb-theme .smd-theme-select")).toBeVisible();
    await expect(page.locator("#sb-theme .smd-theme-mode-select")).toBeVisible();
    await expect(page.locator("#sb-theme .smd-theme-mode-select option")).toHaveText(["Default", "Light", "Dark"]);
    await expect(page.locator("#sb-theme .smd-theme-select")).toHaveValue(await page.locator("#storybookThemeSelector .smd-theme-select").inputValue());
    await expect(page.locator("#sb-theme .smd-theme-mode-select")).toHaveValue(await page.locator("#storybookThemeSelector .smd-theme-mode-select").inputValue());
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

  test("component demo hosts render their expected elements", async ({ page }) => {
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
    await page.locator("#storybookThemeSelector .smd-theme-select").selectOption("flatly");
    await page.locator("#storybookThemeSelector .smd-theme-select").selectOption("superhero");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(15, 37, 55)");
    await page.locator("#storybookThemeSelector .smd-theme-mode-select").selectOption("light");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(15, 37, 55)");
  });

  test("theme swap re-renders sections without page errors", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto("/storybook/");
    await page.locator("#storybookThemeSelector .smd-theme-select").selectOption("cerulean");
    await page.waitForTimeout(500);
    await expect(page.locator("#sb-stream-header .editor-title")).toHaveText("Work");
    await page.locator("#storybookThemeSelector .smd-theme-select").selectOption("darkly");
    await page.waitForTimeout(500);
    await expect(page.locator("#sb-stream-header .editor-title")).toHaveText("Work");

    // applyTheme() re-points the theme/override sheets at runtime; the override
    // sheets must stay AFTER the shared functional sheet, or the theme is no
    // longer the final cascade layer.
    const linkOrder = await page.evaluate(() => Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => (link.getAttribute("href") || "").split(/[?#]/)[0]));
    const indexOfShared = linkOrder.findIndex((href) => /shared\/css\/styles\.css$/.test(href));
    const indexOfMode = linkOrder.findIndex((href) => /shared\/css\/themes\/(light|dark)\.css$/.test(href));
    // The per-theme sheet (themes/<name>/<name>.css) must not be confused with the
    // theme's bootstrap.min.css, which also matches themes/<name>/<file>.css.
    const indexOfSpecific = linkOrder.findIndex((href) => /shared\/css\/themes\/[^/]+\/[^/]+\.css$/.test(href) && !/bootstrap\.min\.css$/.test(href));
    const indexOfBase = linkOrder.findIndex((href) => /shared\/css\/themes\/[^/]+\/bootstrap\.min\.css$/.test(href));
    expect(indexOfShared).toBeGreaterThan(-1);
    expect(indexOfBase).toBeGreaterThan(-1);
    expect(indexOfMode).toBeGreaterThan(indexOfShared);
    expect(indexOfSpecific).toBeGreaterThan(indexOfMode);

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

    await expect(page.locator("#storybookThemeSelector .smd-theme-select")).toHaveValue("cerulean");
    await expect(page.locator("#storybookThemeSelector .smd-theme-mode-select")).toHaveValue("dark");
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");
    expect(await page.evaluate(() => ({
      appTheme: localStorage.getItem("planmydays_theme"),
      appMode: localStorage.getItem("planmydays_themeMode")
    }))).toEqual({ appTheme: "flatly", appMode: "light" });

    await page.locator("#storybookThemeSelector .smd-theme-mode-select").selectOption("light");
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
    await expect(page.locator("#cardSelect option")).toHaveText([
      "Job Today Card",
      "Job Stream Card",
      "Job Search Card",
      "Countdown Card",
      "Date Card",
      "Category Card",
      "QR Link Card",
      "Image Card"
    ]);
    await expect(page.locator("#themeSelect")).toHaveValue("all");
    await expect(page.locator("#themeSelect option")).toHaveCount(27);
    await expect(page.locator("#themeSelect option").first()).toHaveText("All themes");

    await page.locator("#themeSelect").selectOption("morph");
    await expect(page.locator(".theme-row")).toHaveCount(1);
    await expect(page.locator("iframe.preview-frame")).toHaveCount(2);
    expect(await page.locator("iframe.preview-frame").evaluateAll((frames) => frames.every((frame) => (
      frame.dataset.theme === "morph"
    )))).toBe(true);
    await expect(page.locator("#viewerStatus")).toContainText("Morph");
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-card-viewer-ready", "true");
    await expect(page.locator("#themeSelect")).toHaveValue("morph");
    await expect(page.locator(".theme-row")).toHaveCount(1);
    await page.locator("#themeSelect").selectOption("all");

    await expect(page.locator(".theme-row")).toHaveCount(26);
    await expect(page.locator("iframe.preview-frame")).toHaveCount(52);
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
    // bootstrap, shared styles, mode override, then theme-specific override.
    const frameRanks = await page.locator("iframe.preview-frame").first().evaluate((frame) => {
      const links = Array.from(frame.contentDocument.querySelectorAll('link[rel="stylesheet"]'));
      return links.map((link) => {
        const href = (link.getAttribute("href") || "").split(/[?#]/)[0];
        if (/shared\/vendor\//.test(href)) return 0;
        if (/shared\/css\/themes\/[^/]+\/bootstrap\.min\.css$/.test(href)) return 1;
        if (/shared\/css\/styles\.css$/.test(href)) return 2;
        if (/shared\/css\/themes\/(?:light|dark)\.css$/.test(href)) return 3;
        if (/shared\/css\/themes\/[^/]+\/[^/]+\.css$/.test(href)) return 4;
        return 5;
      });
    });
    expect(frameRanks.every((rank) => rank < 5)).toBe(true);
    expect(frameRanks).toEqual([...frameRanks].sort((a, b) => a - b));

    const recipes = [
      ["pmd-job-today-card", "pmd-job-today-card > .card"],
      ["pmd-job-stream-card", "pmd-job-stream-card > .card"],
      ["pmd-job-search-card", "pmd-job-search-card > .card"],
      ["cmd-countdown-card", "cmd-countdown-card > .card"],
      ["cmd-date-card", "cmd-date-card > .card"],
      ["cmd-category-card", "cmd-category-card > .card"],
      ["qrlink-card", "qrlink-card > .card"],
      ["smd-image-card", "smd-image-card > .card"]
    ];
    for (const [cardId, selector] of recipes) {
      await page.locator("#cardSelect").selectOption(cardId);
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
