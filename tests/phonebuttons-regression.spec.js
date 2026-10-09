const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

// Install a fake Socket.IO client before any page script runs. socket.js only
// looks for `window.io` when connect() is called, so this replaces the vendored
// library entirely — the app's boot auto-connect then uses the fake instead of a
// real server. The harness exposes:
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

// Coverage hooks (top-level so every test in this spec is captured) + the fake
// socket for every test (the app auto-connects on boot).
test.beforeEach(async ({ page }) => {
  await startCoverage(page);
  await installFakeSocket(page);
});
test.afterEach(async ({ page }) => { await stopCoverage(page); });

test.describe("PhoneButtons - Regression", () => {

  test("boot: pb namespace, auto-connect starts, no console errors", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/PhoneButtons/");

    const cfg = await page.evaluate(() => ({
      prefix: SmdConfig.storagePrefix,
      imagePrefix: SmdConfig.imagePrefix
    }));
    expect(cfg.prefix).toBe("pb");
    expect(cfg.imagePrefix).toBe("shared-");

    // The app connects to its own origin on boot.
    await expect(page.locator("#connBadge")).toContainText("Connecting");

    // The connection tools + log live on the Settings -> Server tab, NOT the
    // main view (the template's content is inert until Settings is built).
    await expect(page.locator("#commLog")).toHaveCount(0);
    await expect(page.locator("#btnConnect")).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test("connect, app_change push, ping, test key and disconnect", async ({ page }) => {
    await page.goto("/PhoneButtons/");

    // Boot auto-connect created the socket; flip it connected.
    await page.waitForFunction(() => typeof window.__serverConnect === "function");
    await page.evaluate(() => window.__serverConnect());
    await expect(page.locator("#connBadge")).toHaveText("Connected");

    // Server-pushed foreground app shows on the main view.
    await page.evaluate(() => window.__serverEmit("app_change", { name: "Microsoft PowerPoint", icon: "" }));
    await expect(page.locator("#serverAppName")).toHaveText("Microsoft PowerPoint");

    // Open the Server tab, which holds the controls + log.
    await page.evaluate(() => openSettings());
    await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Server" }).click();
    await expect(page.locator("#commLog")).toBeVisible();
    await expect(page.locator("#commLog")).toContainText("app_change");
    await expect(page.locator("#btnPing")).toBeEnabled();

    // Client -> server -> client probe.
    await page.locator("#btnPing").click();
    await expect(page.locator("#commLog")).toContainText("pong");

    // A real key press goes over the wire.
    await page.locator("#btnTestKey").click();
    const emitted = await page.evaluate(() => window.__ioState.emitted);
    expect(emitted).toContainEqual({ event: "button_press", data: { key: "X" } });

    // Disconnect flips the main-view status back.
    await page.locator("#btnDisconnect").click();
    await expect(page.locator("#connBadge")).toHaveText("Disconnected");
  });

  test("settings page has Display + Server tabs and persists to pb_ keys", async ({ page }) => {
    await page.goto("/PhoneButtons/");
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");

    // Display tab.
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

    // Server tab.
    await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Server" }).click();
    await expect(page.locator("#btnConnect")).toBeVisible();
    await expect(page.locator("#btnDisconnect")).toBeVisible();
    await expect(page.locator("#btnPing")).toBeVisible();
    await expect(page.locator("#btnTestKey")).toBeVisible();
    await expect(page.locator("#commLog")).toBeVisible();

    // The share QR encodes this server's own URL.
    await expect(page.locator("#shareQrCode")).toHaveAttribute("value", "http://localhost:8080/PhoneButtons/");
  });

  test("settings OK closes the page", async ({ page }) => {
    await page.goto("/PhoneButtons/");
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");
    await page.locator("#settingsPage").getByRole("button", { name: "OK" }).click();
    await expect(page.locator("#settingsPage")).not.toHaveAttribute("open", "");
  });

  test("Edit App wizard: Select App -> Layout (server layouts), Cancel/Next then Cancel/Finish", async ({ page }) => {
    let saved = null;
    await page.route("**/api/layouts", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ layouts: [
        { key: "sample", displayName: "Sample" },
        { key: "powerpoint", displayName: "PowerPoint" }
      ] })
    }));
    await page.route("**/api/save-app-layout", (route) => {
      saved = route.request().postDataJSON();
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/PhoneButtons/");
    await page.waitForFunction(() => typeof window.__serverConnect === "function");
    await page.evaluate(() => window.__serverConnect());
    await page.evaluate(() => window.__serverEmit("app_change", {
      name: "Adobe Photoshop 2026",
      icon: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
    }));

    // Page 1: Select App.
    await page.evaluate(() => openEditApp());
    await expect(page.locator("#editAppPage")).toHaveAttribute("open", "");
    await expect(page.locator("#editAppPage .smd-page-header h1")).toHaveText("Select App");
    await expect(page.locator("#editAppPage .smd-page-body")).toContainText("Select the App on the PC");
    await expect(page.locator("#editAppPage .smd-page-body")).toContainText("Adobe Photoshop 2026");
    await expect(page.locator("#editAppPage .smd-page-body img")).toBeVisible();
    await expect(page.locator("#editAppPage").getByRole("button", { name: "Cancel" })).toBeVisible();

    // The app icon + name block is centered horizontally in the page body.
    const dx = await page.evaluate(() => {
      const body = document.querySelector("#editAppPage .smd-page-body");
      const center = document.getElementById("editAppCenter");
      const b = body.getBoundingClientRect();
      const c = center.getBoundingClientRect();
      return Math.abs((c.left + c.right) / 2 - (b.left + b.right) / 2);
    });
    expect(dx).toBeLessThan(2);

    // Next -> page 2: Layout, populated from GET /api/layouts into the dropdown.
    await page.locator("#editAppPage").getByRole("button", { name: "Next" }).click();
    await expect(page.locator("#editLayoutPage")).toHaveAttribute("open", "");
    await expect(page.locator("#editLayoutPage .smd-page-header h1")).toHaveText("Layout");
    await expect(page.locator("#editLayoutPage").getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(page.locator("#editLayoutPage").getByRole("button", { name: "Finish" })).toBeVisible();

    // The smd-image-dropdown lists the server layouts.
    const layoutDd = page.locator("#editLayoutDropdown");
    await expect(layoutDd.locator("#pbImageBtnText")).toHaveText("Sample");
    await layoutDd.locator("#pbImageDropdownBtn").click();
    await expect(layoutDd.locator("#pbImageDropdownMenu .item")).toHaveCount(2);
    await layoutDd.locator("#pbImageDropdownMenu .item", { hasText: "PowerPoint" }).click();
    await expect(layoutDd.locator("#pbImageBtnText")).toHaveText("PowerPoint");

    // Finish POSTs the app's chosen layout.
    await page.locator("#editLayoutPage").getByRole("button", { name: "Finish" }).click();
    await expect(page.locator("#editLayoutPage")).not.toHaveAttribute("open", "");
    await expect.poll(() => saved).toEqual({ name: "Adobe Photoshop 2026", layout: "powerpoint" });
  });

  test("Edit Layout editor: icon from the app-icon cache + orientation, saved to the server", async ({ page }) => {
    let saved = null;
    let savedButton = null;
    await page.route("**/api/layouts", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ layouts: [
        { key: "sample", displayName: "Sample", image: "PyCharm.png", orientation: "landscape", buttons: [] },
        { key: "reaper", displayName: "REAPER", image: "gone.png", orientation: "portrait", buttons: [{ name: "Next Slide", image: "" }] }
      ] })
    }));
    await page.route("**/api/app-icons", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ icons: ["PyCharm.png", "Google Chrome.png"] })
    }));
    await page.route("**/app-icon-cache/PyCharm.png", (route) => route.fulfill({
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")
    }));
    await page.route("**/api/save-layout", (route) => {
      saved = route.request().postDataJSON();
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.route("**/api/save-layout-button", (route) => {
      savedButton = route.request().postDataJSON();
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/PhoneButtons/");
    await page.evaluate(() => openEditLayoutWizard());
    await expect(page.locator("#layoutSelectPage")).toHaveAttribute("open", "");
    await expect(page.locator("#layoutSelectPage .smd-page-header h1")).toHaveText("Select Layout");

    // Page 1: the dropdown is populated from the server catalog and shows the
    // layout's server image.
    const dd = page.locator("#layoutDropdown");
    await expect(dd.locator("#pbImageBtnText")).toHaveText("Sample");
    await expect(dd.locator("#pbImageBtnIcon img")).toHaveAttribute("src", /app-icon-cache\/PyCharm\.png/);
    await dd.locator("#pbImageDropdownBtn").click();
    await expect(dd.locator("#pbImageDropdownMenu .item")).toHaveCount(2);
    await dd.locator("#pbImageDropdownMenu .item", { hasText: "REAPER" }).click();
    await expect(dd.locator("#pbImageBtnText")).toHaveText("REAPER");

    // Page 2: the icon picker is a pb-image-dropdown; the saved icon is gone.
    await page.locator("#layoutSelectPage").getByRole("button", { name: "Next" }).click();
    await expect(page.locator("#layoutEditPage")).toHaveAttribute("open", "");
    await expect(page.locator("#layoutEditPage .smd-page-header h1")).toHaveText("Layout");

    const iconDd = page.locator("#layoutIconDropdown");
    await expect(iconDd.locator("#pbImageBtnText")).toHaveText("gone.png (missing)");
    await expect(page.locator("#layoutIconHint")).toContainText("no longer in the server cache");
    await expect(page.locator("#layoutIconPreview")).toBeHidden();
    await expect(page.locator("#layoutOrientationSelect")).toHaveValue("portrait");

    // The menu lists the small cached icons (+ None + the missing one).
    await iconDd.locator("#pbImageDropdownBtn").click();
    await expect(iconDd.locator("#pbImageDropdownMenu .item")).toHaveCount(4);
    await expect(iconDd.locator("#pbImageDropdownMenu")).toContainText("PyCharm.png");
    await expect(iconDd.locator("#pbImageDropdownMenu")).toContainText("gone.png (missing)");

    // Choose a real icon; the large preview shows it.
    await iconDd.locator("#pbImageDropdownMenu .item", { hasText: "PyCharm.png" }).click();
    await expect(page.locator("#layoutIconPreview")).toBeVisible();
    await expect(page.locator("#layoutIconPreview")).toHaveAttribute("src", /app-icon-cache\/PyCharm\.png/);

    // The layout button shows the saved name; clicking opens the editor.
    await expect(page.locator("#layoutButton1")).toContainText("Next Slide");
    await expect(page.locator("#layoutButton2")).toBeVisible();
    await page.locator("#layoutButton1").click();
    await expect(page.locator("#buttonEditPage")).toHaveAttribute("open", "");
    await expect(page.locator("#buttonEditPage .smd-page-header h1")).toHaveText("Edit Button");
    await expect(page.locator("#buttonNameInput")).toHaveValue("Next Slide");
    await expect(page.locator("#buttonImageSelect")).toBeVisible();
    await expect(page.locator("#buttonKeyNamed")).toBeVisible();
    await expect(page.locator("#buttonKeyCtrl")).toBeVisible();
    await expect(page.locator("#buttonEditPage").getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(page.locator("#buttonEditPage").getByRole("button", { name: "OK" })).toBeVisible();

    // Key and Special key are mutually exclusive.
    await page.locator("#buttonKeyNamed").selectOption("MEDIA_NEXT_TRACK");
    await expect(page.locator("#buttonKeyChar")).toBeDisabled();
    await expect(page.locator("#buttonKeyChar")).toHaveValue("");

    // Rename + Ctrl + a special key, then OK -> POST carries the name.
    await page.locator("#buttonNameInput").fill("Advance");
    await page.locator("#buttonKeyCtrl").click();
    await page.locator("#buttonEditPage").getByRole("button", { name: "OK" }).click();
    await expect(page.locator("#buttonEditPage")).not.toHaveAttribute("open", "");
    await expect.poll(() => savedButton).toEqual({
      layout: "reaper", index: 0, name: "Advance", image: "", key: "ctrl+media_next_track"
    });

    // The layout page reflects the new name.
    await expect(page.locator("#layoutButton1")).toContainText("Advance");

    await page.locator("#layoutOrientationSelect").selectOption("landscape");
    await page.locator("#layoutEditPage").getByRole("button", { name: "Finish" }).click();

    // Finish saves the layout WITH its buttons.
    await expect.poll(() => saved).toEqual({
      key: "reaper", displayName: "REAPER", image: "PyCharm.png", orientation: "landscape",
      buttons: [{ name: "Advance", image: "", key: "ctrl+media_next_track" }]
    });
  });
});
