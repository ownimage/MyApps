const { test, expect } = require("@playwright/test");

test.describe("Launch - Regression", () => {

  test("root shows the grid of available apps", async ({ page }) => {
    const errors = [];
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/");
    await expect(page.locator("#appGrid .app-tile")).toHaveCount(5);

    const tiles = page.locator("#appGrid .app-tile");
    await expect(tiles.nth(0)).toContainText("Plan My Day");
    await expect(tiles.nth(1)).toContainText("Count My Days");
    await expect(tiles.nth(2)).toContainText("QR Links");
    await expect(tiles.nth(3)).toContainText("Solar Controlar");
    await expect(tiles.nth(4)).toContainText("FreeFormOX");
    await expect(tiles.nth(0)).toHaveAttribute("href", "PlanMyDay/");
    await expect(tiles.nth(1)).toHaveAttribute("href", "CountMyDays/");
    await expect(tiles.nth(2)).toHaveAttribute("href", "QRLinks/");
    await expect(tiles.nth(3)).toHaveAttribute("href", "SolarControlar/");
    await expect(tiles.nth(4)).toHaveAttribute("href", "FreeFormOX/");

    // App icons load via <smd-image> from the shared sample library (the SVGs are
    // 512x512; the Solar Controlar icon is the unpacked 256px PNG, rendered at
    // the tile's data80 thumbnail when the 80px size sheet applies).
    for (let i = 0; i < 5; i++) {
      await expect.poll(async () => tiles.nth(i).locator("smd-image img").evaluate(el => el.getAttribute("src") && el.naturalWidth)).toBeGreaterThan(0);
    }
    expect(await tiles.nth(3).locator("smd-image img").evaluate(async (imgEl) => {
      const src = imgEl.getAttribute("src");
      if (!src) return false;
      const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
      return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    })).toBe(true);
    expect(errors).toEqual([]);
  });

  test("Launch uses its own settings namespace and the shared image library", async ({ page }) => {
    await page.goto("/");
    const cfg = await page.evaluate(() => ({
      prefix: SmdConfig.storagePrefix,
      imagePrefix: SmdConfig.imagePrefix,
      imageKey: smdImagePrefix() + "images"
    }));
    expect(cfg.prefix).toBe("launch_");
    expect(cfg.imagePrefix).toBe("shared-");
    expect(cfg.imageKey).toBe("shared-images");
  });

  test("settings has theme, image size, share QR and Font Awesome credit", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");

    await expect(page.locator("#themeSelector select")).toBeVisible();
    expect(await page.locator("#themeSelector select option").count()).toBe(26);
    await expect(page.locator("#iconSizeSelector")).toBeVisible();
    await expect(page.locator("#shareQrCode img").first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#settingsPage smd-fontawesome-credit")).toBeVisible();

    // Theme + image size persist in the launch_ namespace.
    await page.locator("#themeSelector select").selectOption("brite");
    await expect.poll(async () => page.evaluate(() => localStorage.getItem("launch_theme"))).toBe("brite");
    await page.locator("#iconSizeSelector").selectOption("small");
    await expect.poll(async () => page.evaluate(() => localStorage.getItem("launch_iconSize"))).toBe("small");
  });

  test("every app's menu links to the Launch app", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await page.locator("#btnMainMenu").click();
    const pmdLaunch = page.locator(".dropdown-menu .dropdown-item").filter({ hasText: "Launch" });
    await expect(pmdLaunch).toBeVisible();
    await expect(pmdLaunch).toHaveAttribute("href", "../");
    expect(await pmdLaunch.evaluate(el => new URL(el.href).pathname)).toBe("/");

    await page.goto("/CountMyDays/");
    await page.locator("#btnMainMenu").click();
    const cmdLaunch = page.locator(".dropdown-menu .dropdown-item").filter({ hasText: "Launch" });
    await expect(cmdLaunch).toBeVisible();
    await expect(cmdLaunch).toHaveAttribute("href", "../");

    await page.goto("/QRLinks/");
    await page.locator("#btnMainMenu").click();
    const qrLaunch = page.locator(".dropdown-menu .dropdown-item").filter({ hasText: "Launch" });
    await expect(qrLaunch).toBeVisible();
    await expect(qrLaunch).toHaveAttribute("href", "../");

    await page.goto("/FreeFormOX/");
    await page.locator("#btnMainMenu").click();
    const ffoxLaunch = page.locator(".dropdown-menu .dropdown-item").filter({ hasText: "Launch" });
    await expect(ffoxLaunch).toBeVisible();
    await expect(ffoxLaunch).toHaveAttribute("href", "../");
    await expect(ffoxLaunch).toHaveText("Launch");

    await page.goto("/SolarControlar/");
    await page.locator("#btnMainMenu").click();
    const solarLaunch = page.locator(".dropdown-menu .dropdown-item").filter({ hasText: "Launch" });
    await expect(solarLaunch).toBeVisible();
    await expect(solarLaunch).toHaveAttribute("href", "../");
  });

  test("every app reads the same shared image library", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("shared-images", JSON.stringify([
        { name: "shared-one", data: "data:image/svg+xml,%3Csvg/%3E" },
        { name: "shared-two", data: "data:image/svg+xml,%3Csvg/%3E" }
      ]));
    });

    await page.goto("/PlanMyDay/");
    await expect.poll(async () => page.evaluate(() => loadImages().map(i => i.name))).toEqual(["shared-one", "shared-two"]);

    await page.goto("/CountMyDays/");
    await expect.poll(async () => page.evaluate(() => loadImages().map(i => i.name))).toEqual(["shared-one", "shared-two"]);

    await page.goto("/QRLinks/");
    await expect.poll(async () => page.evaluate(() => loadImages().map(i => i.name))).toEqual(["shared-one", "shared-two"]);
  });

  test("legacy per-app image lists migrate into the shared library", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await page.waitForLoadState("domcontentloaded");
    // Let the first-visit sample seeding settle before clearing storage, so the
    // async seedSampleImages fetch cannot re-write shared-images over our legacy
    // keys (Launch and PlanMyDay both seed samples at boot now).
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("shared-images") || "[]").length)).toBeGreaterThan(0);
    await page.evaluate(() => {
      localStorage.removeItem("shared-images");
      localStorage.setItem("planmydays_images", JSON.stringify([{ name: "pmd-img", data: "" }]));
      localStorage.setItem("countmydays_images", JSON.stringify([{ name: "cmd-img", data: "" }]));
    });

    await page.reload();
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("shared-images") || "[]").map(i => i.name))).toEqual(["pmd-img", "cmd-img"]);
    const leftovers = await page.evaluate(() => ({
      pmd: localStorage.getItem("planmydays_images"),
      cmd: localStorage.getItem("countmydays_images")
    }));
    expect(leftovers.pmd).toBeNull();
    expect(leftovers.cmd).toBeNull();
  });
});
