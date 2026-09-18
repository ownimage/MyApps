const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

async function gotoGame(page) {
  await page.goto("/FreeFormOX/");
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("#buttonGrid button")).toHaveCount(25);
}

test.describe("FreeFormOX - Regression", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto("/FreeFormOX/");
    await startCoverage(page);
  });

  test.afterEach(async ({ page }) => {
    await stopCoverage(page);
  });

  test.describe("Boot + board", () => {

    test("boots with no console errors and renders the board", async ({ page }) => {
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
      page.on("pageerror", (err) => pageErrors.push(String(err)));

      await gotoGame(page);

      await expect(page.locator("#turnIndicator")).toContainText("to go");
      // The centre cell (13) is pre-filled as out-of-bounds O.
      const mid = page.locator("#buttonGrid button[data-index='13']");
      await expect(mid).toHaveClass(/cell-oob/);
      await expect(mid.locator("img")).toBeVisible();
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test("uses the ffox_ storage namespace", async ({ page }) => {
      await gotoGame(page);
      const cfg = await page.evaluate(() => ({
        prefix: SmdConfig.storagePrefix,
        themeKey: smdKey("theme")
      }));
      expect(cfg.prefix).toBe("ffox_");
      expect(cfg.themeKey).toBe("ffox_theme");
    });
  });

  test.describe("Gameplay", () => {

    test("a move places a piece and flips the turn indicator", async ({ page }) => {
      await gotoGame(page);
      const cell = page.locator("#buttonGrid button[data-index='1']");
      await cell.click();
      await expect(cell).toHaveClass(/cell-placed/);
      await expect(cell.locator("img")).toBeVisible();
      await expect(page.locator("#turnIndicator")).toContainText("Oliver to go");
      await expect(page.locator("#playBtns")).toBeVisible();
    });

    test("undo removes the move and redo replays it", async ({ page }) => {
      await gotoGame(page);
      const cell = page.locator("#buttonGrid button[data-index='1']");
      await cell.click();
      await expect(page.locator("#playBtns")).toBeVisible();

      await page.locator("#undoBtn").click();
      await expect(cell).toHaveClass(/cell-available/);
      await expect(page.locator("#turnIndicator")).toContainText("Xander to go");

      await page.locator("#redoBtn").click();
      await expect(cell).toHaveClass(/cell-placed/);
      await expect(page.locator("#turnIndicator")).toContainText("Oliver to go");
    });

    test("three in a row ends the game and shows the replay buttons", async ({ page }) => {
      await gotoGame(page);
      // X plays 1,2,3; O interleaves at 7,8 (both fit the 3x3 constraint).
      for (const idx of [1, 7, 2, 8, 3]) {
        await page.locator("#buttonGrid button[data-index='" + idx + "']").click();
      }
      await expect(page.locator("#turnIndicator")).toContainText("wins!");
      await expect(page.locator("#endBtns")).toBeVisible();
      await expect(page.locator("#playBtns")).toBeHidden();
      const winning = page.locator("#buttonGrid button[data-index='1']");
      await expect(winning).toHaveClass(/cell-winner/);

      await page.locator("#replayBtn").click();
      await expect(page.locator("#turnIndicator")).toContainText("Xander to go");
      await expect(page.locator("#buttonGrid button[data-index='1']")).toHaveClass(/cell-available/);
    });

    test("swap players from the menu swaps the stored names", async ({ page }) => {
      await gotoGame(page);
      await page.evaluate(() => {
        localStorage.setItem("ffox_xName", "Alice");
        localStorage.setItem("ffox_oName", "Bob");
      });
      await page.locator("#btnMainMenu").click();
      await page.locator(".dropdown-menu .dropdown-item").filter({ hasText: "Swap Players" }).click();
      expect(await page.evaluate(() => localStorage.getItem("ffox_xName"))).toBe("Bob");
      expect(await page.evaluate(() => localStorage.getItem("ffox_oName"))).toBe("Alice");
    });
  });

  test.describe("Settings", () => {

    test("opens with theme, names, styles and current settings", async ({ page }) => {
      await gotoGame(page);
      await page.evaluate(() => openSettings());
      await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");
      await expect(page.locator("#themeSelector select")).toBeVisible();
      expect(await page.locator("#themeSelector select option").count()).toBe(26);
      await expect(page.locator("#xName")).toBeVisible();
      await expect(page.locator("#xPieceStyle")).toBeVisible();
      await expect(page.locator("#oName")).toBeVisible();
      await expect(page.locator("#oPieceStyle")).toBeVisible();
      await expect(page.locator("#showPlayReplay")).toBeVisible();
      await page.locator("#settingsPage").getByRole("button", { name: "OK" }).click();
      await expect(page.locator("#settingsPage")).not.toHaveAttribute("open", "");
    });

    test("theme change persists and swaps the stylesheet", async ({ page }) => {
      await gotoGame(page);
      await page.evaluate(() => openSettings());
      await page.locator("#themeSelector select").selectOption("brite");
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("ffox_theme"))).toBe("brite");
      const href = await page.locator("#bootstrap-theme-css").getAttribute("href");
      expect(href).toContain("css/themes/brite/bootstrap.min.css");
      await expect.poll(async () => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("brite");
    });

    test("names and piece styles persist in the ffox_ namespace", async ({ page }) => {
      await gotoGame(page);
      await page.evaluate(() => openSettings());
      await page.locator("#xName").fill("Alpha");
      await page.locator("#xName").press("Tab");
      await page.locator("#xPieceStyle").selectOption("dino");
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("ffox_xName"))).toBe("Alpha");
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("ffox_xPieceStyle"))).toBe("dino");
    });

    test("share QR renders in the settings footer", async ({ page }) => {
      await gotoGame(page);
      await page.evaluate(() => openSettings());
      await expect(page.locator("#shareQrCode img").first()).toBeVisible({ timeout: 30000 });
      expect(await page.locator("#shareQrCode canvas, #shareQrCode img").count()).toBeGreaterThan(0);
    });

    test("settings footer uses the shared Buy Me A Coffee component", async ({ page }) => {
      await gotoGame(page);
      const consoleErrors = [];
      page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
      await page.evaluate(() => openSettings());
      const bmc = page.locator("#settingsPage smd-buymeacoffee");
      await expect(bmc).toBeVisible();
      await expect(bmc).toHaveAttribute("username", "ownimage");
      const img = bmc.locator("img").first();
      await expect(img).toBeVisible();
      await expect(img).toHaveAttribute("alt", "Buy Me A Coffee");
      await expect.poll(async () => page.locator("#settingsPage smd-buymeacoffee a").first().evaluate(a => a.href)).toBe("https://buymeacoffee.com/ownimage");
      expect(consoleErrors).toEqual([]);
    });
  });
});