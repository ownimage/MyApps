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
    expect(cfg.prefix).toBe("pb_");
    expect(cfg.imagePrefix).toBe("shared-");

    // The app connects to its own origin on boot.
    await expect(page.locator("#connBadge")).toContainText("Connecting");

    // The connection tools + log live on the Settings -> Server tab, NOT the
    // main view (the template's content is inert until Settings is built).
    await expect(page.locator("#commLog")).toHaveCount(0);
    await expect(page.locator("#btnConnect")).toHaveCount(0);
    await expect(page.locator("#layoutButtons")).toBeHidden();

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

  test("main page renders the app's layout buttons from the app_change push", async ({ page }) => {
    await page.goto("/PhoneButtons/");
    await page.waitForFunction(() => typeof window.__serverConnect === "function");
    await page.evaluate(() => window.__serverConnect());

    await expect(page.locator("#layoutButtons")).toBeHidden();
    await page.evaluate(() => window.__serverEmit("app_change", {
      name: "Microsoft PowerPoint",
      icon: "",
      layout: { key: "powerpoint", orientation: "landscape", buttons: [
        { name: "Next Slide", image: "", key: "right" },
        { name: "Previous", image: "", key: "left" }
      ] }
    }));

    await expect(page.locator("#layoutButtons")).toBeVisible();
    await expect(page.locator("#layoutButtons button")).toHaveCount(2);
    await expect(page.locator("#layoutButtons")).toContainText("Next Slide");
    await page.locator("#layoutButtons button", { hasText: "Next Slide" }).click();
    const emitted = await page.evaluate(() => window.__ioState.emitted);
    expect(emitted).toContainEqual({ event: "button_press", data: { key: "right" } });

    // A later app_change with no layout hides the buttons again.
    await page.evaluate(() => window.__serverEmit("app_change", { name: "Notepad", icon: "", layout: null }));
    await expect(page.locator("#layoutButtons")).toBeHidden();
  });

  test("Button editor image picker uses the shared search box", async ({ page }) => {
    await page.route("**/api/layouts", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ layouts: [{ key: "sample", displayName: "Sample", image: "", orientation: "landscape", buttons: [] }] })
    }));
    await page.route("**/api/app-icons", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ icons: [] }) }));

    await page.goto("/PhoneButtons/");
    await page.evaluate(() => openManageLayout());
    await page.locator("#layoutButton1").click();
    await expect(page.locator("#buttonEditPage")).toHaveAttribute("open", "");
    await page.locator("#buttonImageSelect").getByRole("button", { name: "Edit" }).click();
    await expect(page.locator("#imagePickerPage")).toHaveAttribute("open", "");
    await expect(page.locator("#pickerSearchInput")).toBeVisible();
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
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_theme"))).toBe("brite");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_themeMode"))).toBe("dark");
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");
    await page.locator("#fontSizeSelector").selectOption("large");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_fontSize"))).toBe("large");

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

  test("Manage Layout: select a layout, edit its icon/orientation/button and Finish", async ({ page }) => {
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
    await page.evaluate(() => openManageLayout());
    await expect(page.locator("#manageLayoutPage")).toHaveAttribute("open", "");
    await expect(page.locator("#manageLayoutPage .smd-page-header h1")).toHaveText("Manage Layout");

    // The dropdown is populated from the server catalog (+ Add Layout…).
    const dd = page.locator("#manageLayoutDropdown");
    await expect(dd.locator("#pbImageBtnText")).toHaveText("Sample");
    await expect(dd.locator("#pbImageBtnIcon img")).toHaveAttribute("src", /app-icon-cache\/PyCharm\.png/);
    await dd.locator("#pbImageDropdownBtn").click();
    await expect(dd.locator("#pbImageDropdownMenu .item")).toHaveCount(3);
    await dd.locator("#pbImageDropdownMenu .item", { hasText: "REAPER" }).click();

    // Selecting REAPER fills the fields on the SAME page.
    await expect(page.locator("#manageLayoutNameInput")).toHaveValue("REAPER");
    await expect(page.locator("#layoutOrientationSelect")).toHaveValue("portrait");
    await expect(page.locator("#layoutIconDropdown #pbImageBtnText")).toHaveText("gone.png (missing)");
    await expect(page.locator("#layoutIconHint")).toContainText("no longer in the server cache");
    await expect(page.locator("#layoutIconPreview")).toBeHidden();
    await expect(page.locator("#layoutButton1")).toContainText("Next Slide");

    // Edit the button: rename + Ctrl + a special key.
    await page.locator("#layoutButton1").click();
    await expect(page.locator("#buttonEditPage")).toHaveAttribute("open", "");
    await expect(page.locator("#buttonNameInput")).toHaveValue("Next Slide");
    await page.locator("#buttonKeyNamed").selectOption("MEDIA_NEXT_TRACK");
    await expect(page.locator("#buttonKeyChar")).toBeDisabled();
    await page.locator("#buttonNameInput").fill("Advance");
    await page.locator("#buttonKeyCtrl").click();
    await page.locator("#buttonEditPage").getByRole("button", { name: "OK" }).click();
    await expect.poll(() => savedButton).toEqual({
      layout: "reaper", index: 0, name: "Advance", image: "", key: "ctrl+media_next_track"
    });
    await expect(page.locator("#layoutButton1")).toContainText("Advance");

    // Finish saves the layout WITH its buttons.
    await page.locator("#manageLayoutPage").getByRole("button", { name: "Finish" }).click();
    await expect.poll(() => saved).toEqual({
      key: "reaper", displayName: "REAPER", image: "gone.png", orientation: "portrait",
      buttons: [{ name: "Advance", image: "", key: "ctrl+media_next_track" }]
    });
    await expect(page.locator("#manageLayoutPage")).not.toHaveAttribute("open", "");
  });

  test("Manage Layout: Add Layout is the top option and auto-generates a unique key", async ({ page }) => {
    let saved = null;
    await page.route("**/api/layouts", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ layouts: [
        { key: "my-keys", displayName: "My Keys", image: "", orientation: "landscape", buttons: [] }
      ] })
    }));
    await page.route("**/api/app-icons", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ icons: [] }) }));
    await page.route("**/api/save-layout", (route) => {
      saved = route.request().postDataJSON();
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/PhoneButtons/");
    await page.evaluate(() => openManageLayout());

    // There is no key field, and "Add Layout…" is the FIRST dropdown option.
    await expect(page.locator("#manageLayoutKeyInput")).toHaveCount(0);
    const dd = page.locator("#manageLayoutDropdown");
    await expect(dd.locator("#pbImageBtnText")).toHaveText("My Keys");
    await dd.locator("#pbImageDropdownBtn").click();
    await expect(dd.locator("#pbImageDropdownMenu .item").first()).toContainText("Add Layout");
    await dd.locator("#pbImageDropdownMenu .item", { hasText: "Add Layout" }).click();

    // Enter a display name; Finish auto-generates a UNIQUE key from it
    // ("My Keys" -> "my-keys", but that is taken, so "my-keys-2").
    await page.locator("#manageLayoutNameInput").fill("My Keys");
    await page.locator("#manageLayoutPage").getByRole("button", { name: "Finish" }).click();
    await expect.poll(() => saved).toEqual({
      key: "my-keys-2", displayName: "My Keys", image: "", orientation: "landscape", buttons: []
    });
    await expect(page.locator("#manageLayoutPage")).not.toHaveAttribute("open", "");
  });
});
