const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

// Coverage hooks (top-level so every test in this spec is captured).
test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// Install a fake Socket.IO client before any page script runs. socket.js only
// looks for `window.io` when connect() is called, so this replaces the vendored
// library entirely. The harness exposes two test hooks:
//   window.__serverConnect()        -> flips connected + fires the `connect` event
//   window.__serverEmit(evt, data)  -> fires a server -> client event
//   window.__ioState.emitted        -> every client -> server emit
async function installFakeSocket(page) {
  await page.addInitScript(() => {
    const state = { handlers: {}, emitted: [] };
    window.__ioState = state;
    window.__serverEmit = function (event, data) {
      (state.handlers[event] || []).forEach((cb) => cb(data));
    };
    window.io = function () {
      const socket = {
        connected: false,
        id: "test-socket",
        on(event, cb) { (state.handlers[event] = state.handlers[event] || []).push(cb); return socket; },
        once(event, cb) { (state.handlers[event] = state.handlers[event] || []).push(cb); return socket; },
        emit(event, data) {
          state.emitted.push({ event, data });
          // Auto-answer the round-trip probe so ping() resolves.
          if (event === "ping") window.__serverEmit("pong", { t: data && data.t, service: "phonebuttons" });
        },
        disconnect() {
          socket.connected = false;
          window.__serverEmit("disconnect", "io client disconnect");
        }
      };
      window.__serverConnect = function () {
        socket.connected = true;
        window.__serverEmit("connect");
      };
      return socket;
    };
  });
}

test.describe("PhoneButtons - Regression", () => {

  test("boot: pb namespace, disconnected status, no console errors", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/PhoneButtons/");

    const cfg = await page.evaluate(() => ({
      prefix: SmdConfig.storagePrefix,
      imagePrefix: SmdConfig.imagePrefix,
      serverUrl: localStorage.getItem("pbserverUrl")
    }));
    expect(cfg.prefix).toBe("pb");
    expect(cfg.imagePrefix).toBe("shared-");
    expect(cfg.serverUrl).toBeNull();

    await expect(page.locator("#connBadge")).toHaveText("Disconnected");
    await expect(page.locator("#btnConnect")).toBeEnabled();
    await expect(page.locator("#btnDisconnect")).toBeDisabled();
    await expect(page.locator("#btnPing")).toBeDisabled();
    await expect(page.locator("#btnTestKey")).toBeDisabled();
    await expect(page.locator("#commLog")).toContainText("Phone Buttons ready");

    expect(errors).toEqual([]);
  });

  test("connect, app_change push, ping round-trip and a key emit", async ({ page }) => {
    await installFakeSocket(page);
    await page.goto("/PhoneButtons/");

    await page.locator("#btnConnect").click();
    await page.evaluate(() => window.__serverConnect());

    await expect(page.locator("#connBadge")).toHaveText("Connected");
    await expect(page.locator("#btnPing")).toBeEnabled();

    // Server-pushed foreground app.
    await page.evaluate(() => window.__serverEmit("app_change", { name: "Microsoft PowerPoint", icon: "" }));
    await expect(page.locator("#serverAppName")).toHaveText("Microsoft PowerPoint");
    await expect(page.locator("#commLog")).toContainText("app_change");

    // Client -> server -> client probe.
    await page.locator("#btnPing").click();
    await expect(page.locator("#commLog")).toContainText("pong");

    // A real key press goes over the wire.
    await page.locator("#btnTestKey").click();
    const emitted = await page.evaluate(() => window.__ioState.emitted);
    expect(emitted).toContainEqual({ event: "button_press", data: { key: "MEDIA_NEXT_TRACK" } });

    // Disconnect flips the status back.
    await page.locator("#btnDisconnect").click();
    await expect(page.locator("#connBadge")).toHaveText("Disconnected");
  });

  test("settings page has display + server configuration and persists to pb_ keys", async ({ page }) => {
    await page.goto("/PhoneButtons/");
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");

    await expect(page.locator("#themeSelector .smd-theme-select")).toBeVisible();
    await expect(page.locator("#themeSelector .smd-theme-mode-select")).toBeVisible();
    await expect(page.locator("#fontSizeSelector")).toBeVisible();

    await page.locator("#themeSelector .smd-theme-select").selectOption("brite");
    await page.locator("#themeSelector .smd-theme-mode-select").selectOption("dark");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pbtheme"))).toBe("brite");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pbthemeMode"))).toBe("dark");
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");

    await page.locator("#fontSizeSelector").selectOption("large");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pbfontSize"))).toBe("large");

    // The Server tab is not the default tab, so activate it before touching its
    // fields (a hidden panel measures as invisible).
    await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Server" }).click();
    await expect(page.locator("#serverUrlInput")).toBeVisible();
    await expect(page.locator("#serverTokenInput")).toBeVisible();
    await expect(page.locator("#autoConnect")).toBeVisible();

    await page.locator("#serverUrlInput").fill("http://192.168.1.50:5000");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pbserverUrl"))).toBe("http://192.168.1.50:5000");

    await page.locator("#serverTokenInput").fill("sekrit");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pbserverToken"))).toBe("sekrit");

    await page.locator("#autoConnect").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pbautoConnect"))).toBe("true");
  });

  test("Test connection probes /api/health over REST", async ({ page }) => {
    await page.route("**/api/health", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, service: "phonebuttons", applications: 3, templates: 2, foreground: "PowerPoint" })
    }));

    await page.goto("/PhoneButtons/");
    await page.evaluate(() => openSettings());
    await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Server" }).click();
    await page.locator("#settingsPage").getByRole("button", { name: "Test connection" }).click();

    await expect(page.locator("#serverTestResult")).toContainText("OK", { timeout: 5000 });
    await expect(page.locator("#serverTestResult")).toContainText("phonebuttons");
    await expect(page.locator("#commLog")).toContainText("REST /api/health OK");
  });

  test("settings OK closes the page", async ({ page }) => {
    await page.goto("/PhoneButtons/");
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");
    await page.locator("#settingsPage").getByRole("button", { name: "OK" }).click();
    await expect(page.locator("#settingsPage")).not.toHaveAttribute("open", "");
  });

  test("network diagnostics explain common failure causes", async ({ page }) => {
    await page.goto("/PhoneButtons/");
    const diag = await page.evaluate(() => ({
      localhost: networkDiagnostics("http://localhost:5000"),
      clean: networkDiagnostics("https://pb.example.com"),
      err: serverError(0, "Network error", "http://localhost:5000").message
    }));
    expect(diag.localhost).toContain("localhost");
    expect(diag.clean).toBe("");
    expect(diag.err).toContain("Likely cause(s):");
  });
});
