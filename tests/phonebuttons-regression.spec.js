const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");
const { pickOption } = require("./theme-controls");

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
    window.io = function (url) {
      state.urls = state.urls || [];
      state.urls.push(url === undefined ? null : url);
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

    await page.goto("/remoteHID/PhoneButtons/");

    const cfg = await page.evaluate(() => ({
      prefix: SmdConfig.storagePrefix,
      imagePrefix: SmdConfig.imagePrefix
    }));
    expect(cfg.prefix).toBe("pb_");
    expect(cfg.imagePrefix).toBe("shared-");

    // The main view is just the layout buttons; the connection status/tools/log
    // live on the Settings -> Server tab (inert until Settings is built).
    await expect(page.locator("#connBadge")).toHaveCount(0);
    await expect(page.locator("#commLog")).toHaveCount(0);
    await expect(page.locator("#btnConnect")).toHaveCount(0);
    await expect(page.locator("#layoutButtons")).toBeHidden();

    expect(errors).toEqual([]);
  });

  test("connect, app_change push, ping, test key and disconnect", async ({ page }) => {
    await page.goto("/remoteHID/PhoneButtons/");

    // Boot auto-connect created the socket; flip it connected.
    await page.waitForFunction(() => typeof window.__serverConnect === "function");
    await page.evaluate(() => window.__serverConnect());

    // Server-pushed app shows in the nav bar (to the right of the hamburger).
    await page.evaluate(() => window.__serverEmit("app_change", { name: "Microsoft PowerPoint", icon: "" }));
    await expect(page.locator("#mainNav #serverAppName")).toHaveText("Microsoft PowerPoint");

    // The Server tab holds the connection status + controls + log.
    await page.evaluate(() => openSettings());
    await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Server" }).click();
    await expect(page.locator("#connBadge")).toHaveText("Connected");
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

    // Disconnect shows the danger status.
    await page.locator("#btnDisconnect").click();
    await expect(page.locator("#connBadge")).toHaveText("Disconnected");
    await expect(page.locator("#connBadge")).toHaveAttribute("variant", "danger");
  });

  test("main page renders the app's layout buttons from the app_change push", async ({ page }) => {
    await page.goto("/remoteHID/PhoneButtons/");
    await page.waitForFunction(() => typeof window.__serverConnect === "function");
    await page.evaluate(() => window.__serverConnect());

    await expect(page.locator("#layoutButtons")).toBeHidden();
    await page.evaluate(() => window.__serverEmit("app_change", {
      name: "Microsoft PowerPoint",
      icon: "",
      layout: { key: "powerpoint", rows: 2, cols: 3, buttons: [
        { name: "Next Slide", image1: "", image2: "", key: "right" },
        { name: "Previous", image1: "", image2: "", key: "left" }
      ] }
    }));

    // A 2 x 3 grid of equal cells: 2 filled + 4 spacers.
    await expect(page.locator("#layoutButtons")).toBeVisible();
    await expect(page.locator("#layoutButtons .pb-grid-cell")).toHaveCount(6);
    await expect(page.locator("#layoutButtons .pb-grid-cell:not(.pb-grid-spacer)")).toHaveCount(2);
    await expect(page.locator("#layoutButtons")).toContainText("Next Slide");
    await page.locator("#layoutButtons .pb-grid-cell", { hasText: "Next Slide" }).click();
    const emitted = await page.evaluate(() => window.__ioState.emitted);
    expect(emitted).toContainEqual({ event: "button_press", data: { key: "right" } });

    // A later app_change with no layout hides the buttons again.
    await page.evaluate(() => window.__serverEmit("app_change", { name: "Notepad", icon: "", layout: null }));
    await expect(page.locator("#layoutButtons")).toBeHidden();
  });

  test("Button editor image picker uses the shared search box", async ({ page }) => {
    await page.route("**/api/layouts", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ layouts: [{ key: "sample", displayName: "Sample", image: "", buttons: [] }] })
    }));
    await page.route("**/api/app-icons", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ icons: [] }) }));

    await page.goto("/remoteHID/PhoneButtons/");
    await page.evaluate(() => openManageLayout());
    // The grid now lives on the PhoneButtons tab (General is selected first).
    await page.locator("#manageLayoutTabs").getByRole("tab", { name: "PhoneButtons" }).click();
    await page.locator("#layoutButton1").click();
    await expect(page.locator("#buttonEditPage")).toHaveAttribute("open", "");
    await expect(page.locator("#buttonImage1Select")).toBeVisible();
    await expect(page.locator("#buttonImage2Select")).toBeVisible();
    await page.locator("#buttonImage1Select").getByRole("button", { name: "Edit" }).click();
    await expect(page.locator("#imagePickerPage")).toHaveAttribute("open", "");
    await expect(page.locator("#pickerSearchInput")).toBeVisible();
  });

  test("settings page has Display + Server tabs and persists to pb_ keys", async ({ page }) => {
    await page.goto("/remoteHID/PhoneButtons/");
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");

    // Display tab.
    await expect(page.locator("#themeSelector .smd-theme-select")).toBeVisible();
    await expect(page.locator("#themeSelector .smd-theme-mode-select")).toBeVisible();
    await expect(page.locator("#fontSizeSelector")).toBeVisible();
    await pickOption(page, "#themeSelector .smd-theme-select", "brite");
    await pickOption(page, "#themeSelector .smd-theme-mode-select", "dark");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_theme"))).toBe("brite");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_themeMode"))).toBe("dark");
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");
    await pickOption(page, "#fontSizeSelector", "large");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_fontSize"))).toBe("large");

    // Server tab.
    await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Server" }).click();
    await expect(page.locator("#connBadge")).toBeVisible();
    await expect(page.locator("#btnConnect")).toBeVisible();
    await expect(page.locator("#btnDisconnect")).toBeVisible();
    await expect(page.locator("#btnPing")).toBeVisible();
    await expect(page.locator("#btnTestKey")).toBeVisible();
    await expect(page.locator("#commLog")).toBeVisible();

    // The four buttons are a 2 x 2 grid.
    const cols = await page.evaluate(() =>
      getComputedStyle(document.getElementById("serverButtonGrid")).gridTemplateColumns.split(" ").length);
    expect(cols).toBe(2);

    // The "Show background apps" switch lives on this tab and persists.
    await expect(page.locator("#showBackgroundApps")).toBeVisible();
    await page.locator("#showBackgroundApps").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_showBackgroundApps"))).toBe("true");

    // Danger tab: the switch reveals the Refresh App row.
    await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Danger" }).click();
    await expect(page.locator("#showDanger")).toBeVisible();
    await expect(page.locator("#refreshAppRow")).toHaveClass(/d-none/);
    await page.locator("#showDanger").click();
    await expect(page.locator("#refreshAppRow")).not.toHaveClass(/d-none/);
    await expect(page.locator("#btnRefreshApp")).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_showDanger"))).toBe("true");

    // The share QR encodes this server's own URL. (Asserted BEFORE the clear
    // below, which reloads the page.)
    await expect(page.locator("#shareQrCode")).toHaveAttribute("value", "http://localhost:8080/remoteHID/PhoneButtons/");

    // The Clear local storage button clears ONLY PhoneButtons' own keys - the
    // shared image library and other apps' keys are never touched.
    await expect(page.locator("#btnClearStorage")).toBeVisible();
    await page.evaluate(() => {
      localStorage.setItem("pb_noCache", "true");
      localStorage.setItem("pb_theme", "brite");
      localStorage.setItem("pb_fontSize", "large");
      localStorage.setItem("pb_probeKey", "x");
      localStorage.setItem("shared-images", "[1]");
      localStorage.setItem("planmydays_probe", "keep");
    });
    await page.locator("#btnClearStorage").click();
    await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Clear" }).click();
    await page.waitForLoadState("load");            // the app reloads itself
    const state = await page.evaluate(() => ({
      noCache: localStorage.getItem("pb_noCache"),
      theme: localStorage.getItem("pb_theme"),
      fontSize: localStorage.getItem("pb_fontSize"),
      probe: localStorage.getItem("pb_probeKey"),
      images: localStorage.getItem("shared-images"),
      other: localStorage.getItem("planmydays_probe"),
    }));
    expect(state.noCache).toBeNull();
    expect(state.fontSize).toBeNull();
    expect(state.probe).toBeNull();
    // the planted NON-default theme was cleared; boot re-applies the DEFAULT one
    expect(state.theme).not.toBe("brite");
    // ... and the shared image library + other apps' keys are never touched
    expect(state.images).toBe("[1]");
    expect(state.other).toBe("keep");
  });

  test("settings OK closes the page", async ({ page }) => {
    await page.goto("/remoteHID/PhoneButtons/");
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");
    await page.locator("#settingsPage").getByRole("button", { name: "OK" }).click();
    await expect(page.locator("#settingsPage")).not.toHaveAttribute("open", "");
  });

  test("Manage App: layout follows the selected app; background setting respected", async ({ page }) => {
    let saved = null;
    await page.route("**/api/apps", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ apps: [
        { name: "Microsoft PowerPoint", icon: "", background: false, layout: "powerpoint" },
        { name: "Adobe Photoshop 2026", icon: "", background: false, layout: "" },
        { name: "ApCent", icon: "", background: true, layout: "" }
      ] })
    }));
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

    await page.goto("/remoteHID/PhoneButtons/");
    await page.waitForFunction(() => typeof window.__serverConnect === "function");
    await page.evaluate(() => window.__serverConnect());
    await page.evaluate(() => window.__serverEmit("app_change", { name: "Microsoft PowerPoint", icon: "", layout: null }));

    await page.evaluate(() => openManageApp());
    await expect(page.locator("#manageAppPage .smd-page-header h1")).toHaveText("Manage App");

    // App defaults to the foreground app; its assigned layout is reflected.
    const appDd = page.locator("#manageAppDropdown");
    const layoutDd = page.locator("#manageAppLayoutDropdown");
    await expect(appDd.locator("#pbImageBtnText")).toHaveText("Microsoft PowerPoint");
    await expect(layoutDd.locator("#pbImageBtnText")).toHaveText("PowerPoint");

    // Background apps are hidden by default (the switch is on the Settings
    // Server tab).
    await appDd.locator("#pbImageDropdownBtn").click();
    await expect(appDd.locator("#pbImageDropdownMenu .item")).toHaveCount(2);
    await expect(appDd.locator("#pbImageDropdownMenu")).not.toContainText("ApCent");
    await appDd.locator("#pbImageDropdownMenu .item", { hasText: "Microsoft PowerPoint" }).click();

    // Turning the setting on and reopening reveals them.
    await page.evaluate(() => setShowBackgroundApps(true));
    await page.evaluate(() => openManageApp());
    await appDd.locator("#pbImageDropdownBtn").click();
    await expect(appDd.locator("#pbImageDropdownMenu .item")).toHaveCount(3);
    await expect(appDd.locator("#pbImageDropdownMenu")).toContainText("ApCent");

    // Changing the application changes the layout (Photoshop has none -> Add).
    await appDd.locator("#pbImageDropdownMenu .item", { hasText: "Adobe Photoshop 2026" }).click();
    await expect(appDd.locator("#pbImageBtnText")).toHaveText("Adobe Photoshop 2026");
    await expect(layoutDd.locator("#pbImageBtnText")).toContainText("Add Layout");

    // Pick a layout, then Finish saves the assignment.
    await layoutDd.locator("#pbImageDropdownBtn").click();
    await layoutDd.locator("#pbImageDropdownMenu .item", { hasText: "Sample" }).click();
    await expect(layoutDd.locator("#pbImageBtnText")).toHaveText("Sample");
    await page.locator("#manageAppPage").getByRole("button", { name: "Finish" }).click();
    await expect.poll(() => saved).toEqual({ name: "Adobe Photoshop 2026", layout: "sample" });
    await expect(page.locator("#manageAppPage")).not.toHaveAttribute("open", "");
  });

  test("Manage Layout: select a layout, edit its icon/button and Finish", async ({ page }) => {
    let saved = null;
    let savedButton = null;
    await page.route("**/api/layouts", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ layouts: [
        { key: "sample", displayName: "Sample", image: "PyCharm.png", buttons: [] },
        { key: "reaper", displayName: "REAPER", image: "gone.png", buttons: [{ name: "Next Slide", image: "" }] }
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

    await page.goto("/remoteHID/PhoneButtons/");
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
    await expect(page.locator("#layoutIconDropdown #pbImageBtnText")).toHaveText("gone.png (missing)");
    await expect(page.locator("#layoutIconHint")).toContainText("no longer in the server cache");
    await expect(page.locator("#layoutIconPreview")).toBeHidden();

    // The grid lives on the PhoneButtons tab.
    await page.locator("#manageLayoutTabs").getByRole("tab", { name: "PhoneButtons" }).click();
    await expect(page.locator("#layoutButton1")).toContainText("Next Slide");

    // Edit the button: rename + Ctrl + a special key.
    await page.locator("#layoutButton1").click();
    await expect(page.locator("#buttonEditPage")).toHaveAttribute("open", "");
    await expect(page.locator("#buttonNameInput")).toHaveValue("Next Slide");
    // Key and Special key clear each other (both stay enterable).
    await page.locator("#buttonKeyChar").fill("k");
    await expect(page.locator("#buttonKeyNamed")).toHaveAttribute("value", "");
    await pickOption(page, "#buttonKeyNamed", "MEDIA_NEXT_TRACK");
    await expect(page.locator("#buttonKeyChar")).toHaveValue("");
    await expect(page.locator("#buttonKeyChar")).toBeEnabled();
    await page.locator("#buttonNameInput").fill("Advance");
    await page.locator("#buttonKeyCtrl").click();
    await page.locator("#buttonEditPage").getByRole("button", { name: "OK" }).click();
    await expect.poll(() => savedButton).toEqual({
      layout: "reaper", index: 0, name: "Advance", image1: "", image2: "", key: "ctrl+media_next_track", press: "regular"
    });
    await expect(page.locator("#layoutButton1")).toContainText("Advance");

    // Finish saves the layout WITH its grid dims and buttons.
    await page.locator("#manageLayoutPage").getByRole("button", { name: "Finish" }).click();
    await expect.poll(() => saved).toMatchObject({
      key: "reaper", displayName: "REAPER", image: "gone.png",
      rows: 2, cols: 3,
      buttons: [
        { name: "Advance", image1: "", image2: "", key: "ctrl+media_next_track", press: "regular" },
        {}, {}, {}, {}, {}
      ]
    });
    // The Mouser tab always contributes a complete six-axis block.
    await expect.poll(() => saved && saved.mouser && saved.mouser.enabled).toBe(false);
    await expect.poll(() => Object.keys(saved.mouser.axes).sort().join(",")).toBe("rx,ry,rz,tx,ty,tz");
    await expect.poll(() => saved.mouser.axes.rx).toMatchObject({ positive: "F13", negative: "F14" });
    await expect(page.locator("#manageLayoutPage")).not.toHaveAttribute("open", "");
  });

  test("Manage Layout: Add Layout is the top option and auto-generates a unique key", async ({ page }) => {
    let saved = null;
    await page.route("**/api/layouts", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ layouts: [
        { key: "my-keys", displayName: "My Keys", image: "", buttons: [] }
      ] })
    }));
    await page.route("**/api/app-icons", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ icons: [] }) }));
    await page.route("**/api/save-layout", (route) => {
      saved = route.request().postDataJSON();
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/remoteHID/PhoneButtons/");
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
    await expect.poll(() => saved).toMatchObject({
      key: "my-keys-2", displayName: "My Keys", image: "",
      rows: 2, cols: 3, buttons: [{}, {}, {}, {}, {}, {}]
    });
    await expect.poll(() => saved.mouser.enabled).toBe(false);
    await expect(page.locator("#manageLayoutPage")).not.toHaveAttribute("open", "");
  });

  test("Manage Layout: the Mouser tab saves the six-axis block and shows live state", async ({ page }) => {
    let saved = null;
    await page.route("**/api/layouts", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ layouts: [
        { key: "blender", displayName: "Blender", image: "", rows: 2, cols: 3, buttons: [] }
      ] })
    }));
    await page.route("**/api/app-icons", (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ icons: [] })
    }));
    await page.route("**/api/save-layout", (route) => {
      saved = route.request().postDataJSON();
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/remoteHID/PhoneButtons/");
    await page.evaluate(() => openManageLayout());
    await expect(page.locator("#manageLayoutTabs .smd-tab-btn")).toHaveCount(3);
    await expect(page.locator("#manageLayoutTabs .smd-tab-btn").nth(0)).toHaveText("General");
    await expect(page.locator("#manageLayoutTabs .smd-tab-btn").nth(1)).toHaveText("PhoneButtons");
    await expect(page.locator("#manageLayoutTabs .smd-tab-btn").nth(2)).toHaveText("Mouser");
    await page.locator("#manageLayoutTabs").getByRole("tab", { name: "Mouser" }).click();

    // A layout without a mouser block starts disabled with the F13-F24 defaults.
    expect(await page.locator("#mouserEnabled").evaluate((el) => el.checked)).toBe(false);
    await expect(page.locator("#mouser-rx-positive")).toHaveValue("F13");
    await expect(page.locator("#mouser-ty-positive")).toHaveValue("F21");

    await page.locator("#mouserEnabled").click();
    // Any key and Ctrl/Alt/Shift modifiers can be selected, not just F13-F24.
    await page.fill("#mouser-rx-positive", "k");
    await page.locator("#mouser-rx-positive-ctrl").click();
    await page.locator("#mouser-rx-positive-shift").click();

    // The live readout is driven by the socket event (10 Hz).
    await page.evaluate(() => applyMouserState({
      mode: 1, enabled: true, app: "Blender", layout: "blender", pressesPerSecond: 2,
      axes: { ry: { value: 5.5, presses: 1 } }
    }));
    await expect(page.locator("#mouserLive")).toContainText("Rotate (MB4)");
    await expect(page.locator("#mouserLive")).toContainText("Blender");
    await expect(page.locator("#mouserLive")).toContainText("5.50");

    await page.locator("#manageLayoutPage").getByRole("button", { name: "Finish" }).click();
    await expect.poll(() => saved.mouser.enabled).toBe(true);
    await expect.poll(() => saved.mouser.axes.rx.positive).toBe("ctrl+shift+K");
    await expect.poll(() => saved.mouser.axes.rx.negative).toBe("F14");
    await expect.poll(() => Object.keys(saved.mouser.axes).sort().join(",")).toBe("rx,ry,rz,tx,ty,tz");
  });

  test("main page buttons hold a key down and release it (press-and-hold)", async ({ page }) => {
    await page.goto("/remoteHID/PhoneButtons/");
    await page.waitForFunction(() => typeof window.__serverConnect === "function");
    await page.evaluate(() => window.__serverConnect());
    await page.evaluate(() => window.__serverEmit("app_change", {
      name: "App", icon: "",
      layout: { key: "l", rows: 1, cols: 1, buttons: [{ name: "Ctrl", image1: "", image2: "", key: "ctrl", press: "extended" }] }
    }));

    const cell = page.locator("#layoutButtons .pb-grid-cell").first();
    const box = await cell.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    let emitted = await page.evaluate(() => window.__ioState.emitted);
    expect(emitted).toContainEqual({ event: "key_down", data: { key: "ctrl" } });
    expect(emitted.some((e) => e.event === "key_up")).toBe(false);

    await page.mouse.up();
    emitted = await page.evaluate(() => window.__ioState.emitted);
    expect(emitted).toContainEqual({ event: "key_up", data: { key: "ctrl" } });
  });

  test("Edit Button: No key (modifiers only) saves just the modifiers", async ({ page }) => {
    let savedButton = null;
    await page.route("**/api/layouts", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ layouts: [{ key: "reaper", displayName: "REAPER", image: "", rows: 1, cols: 1, buttons: [{}] }] })
    }));
    await page.route("**/api/app-icons", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ icons: [] }) }));
    await page.route("**/api/save-layout-button", (route) => {
      savedButton = route.request().postDataJSON();
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/remoteHID/PhoneButtons/");
    await page.evaluate(() => openManageLayout());
    await page.locator("#manageLayoutTabs").getByRole("tab", { name: "PhoneButtons" }).click();
    await page.locator("#layoutButton1").click();
    await expect(page.locator("#buttonEditPage")).toHaveAttribute("open", "");
    await page.locator("#buttonKeyCtrl").click();
    await page.locator("#buttonKeyNone").click();
    await page.locator("#buttonEditPage").getByRole("button", { name: "OK" }).click();
    await expect.poll(() => savedButton).toEqual({
      layout: "reaper", index: 0, name: "", image1: "", image2: "", key: "ctrl", press: "regular"
    });
  });

  test("Manage Layout: row/column inputs are clamped to 1..12", async ({ page }) => {
    await page.route("**/api/layouts", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ layouts: [{ key: "sample", displayName: "Sample", image: "", buttons: [] }] })
    }));
    await page.route("**/api/app-icons", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ icons: [] }) }));

    await page.goto("/remoteHID/PhoneButtons/");
    await page.evaluate(() => openManageLayout());
    await page.locator("#manageLayoutTabs").getByRole("tab", { name: "PhoneButtons" }).click();
    await page.locator("#manageLayoutCols").fill("20");
    await expect(page.locator("#manageLayoutCols")).toHaveValue("12");
    await page.locator("#manageLayoutRows").fill("0");
    await expect(page.locator("#manageLayoutRows")).toHaveValue("1");
  });

  test("Manage Layout: drag a cell onto another to swap the buttons", async ({ page }) => {
    const buttonCalls = [];
    await page.route("**/api/layouts", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ layouts: [
        { key: "reaper", displayName: "REAPER", image: "", rows: 2, cols: 3,
          buttons: [{ name: "Next", image1: "", image2: "", key: "right" }] }
      ] })
    }));
    await page.route("**/api/app-icons", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ icons: [] }) }));
    await page.route("**/api/save-layout-button", (route) => {
      buttonCalls.push(route.request().postDataJSON());
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/remoteHID/PhoneButtons/");
    await page.evaluate(() => openManageLayout());
    await page.locator("#manageLayoutTabs").getByRole("tab", { name: "PhoneButtons" }).click();
    await expect(page.locator("#layoutButton1")).toContainText("Next");

    // Drag cell 1 onto cell 2.
    const b0 = await page.locator("#layoutButton1").boundingBox();
    const b1 = await page.locator("#layoutButton2").boundingBox();
    await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
    await page.mouse.down();
    await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2, { steps: 8 });
    await page.mouse.up();

    // The cells swapped.
    await expect(page.locator("#layoutButton2")).toContainText("Next");
    await expect(page.locator("#layoutButton1")).not.toContainText("Next");

    // Both cells were persisted with the swapped data.
    await expect.poll(() => buttonCalls.length).toBeGreaterThanOrEqual(2);
    const byIndex = {};
    buttonCalls.forEach((c) => { byIndex[c.index] = c; });
    expect(byIndex[0]).toEqual({ layout: "reaper", index: 0, name: "", image1: "", image2: "", key: "", press: "regular" });
    expect(byIndex[1]).toEqual({ layout: "reaper", index: 1, name: "Next", image1: "", image2: "", key: "right", press: "regular" });
  });

  // ── Server address (Settings | Server) ──────────────────────

  test.describe("Server address (Settings | Server)", () => {

    test("the address fields drive the request base (IP, DNS, https, empty port)", async ({ page }) => {
      await page.goto("/remoteHID/PhoneButtons/");
      // The fresh default is an incomplete prefix -> not configured -> relative paths.
      expect(await page.evaluate(() => pbServerBase())).toBe("");

      await page.evaluate(() => openSettings());
      await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Server" }).click();
      await expect(page.locator("#serverAddressInput")).toHaveValue("192.168.1.");
      await expect(page.locator("#serverPortInput")).toHaveValue("");
      await expect(page.locator("#serverHttps")).not.toBeChecked();

      // A DNS name + port over http.
      await page.locator("#serverAddressInput").fill("my-pc.local");
      await page.locator("#serverPortInput").fill("5000");
      await expect.poll(() => page.evaluate(() => pbServerBase())).toBe("http://my-pc.local:5000");

      // https + NO port -> the scheme default (what a Cloudflare tunnel needs).
      await page.locator("#serverHttps").click();
      await page.locator("#serverPortInput").fill("");
      await expect.poll(() => page.evaluate(() => pbServerBase())).toBe("https://my-pc.local");
      await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_serverHttps"))).toBe("true");

      // ...and the REST layer uses that base.
      const url = await page.evaluate(() => {
        let seen = null;
        const orig = window.fetch;
        window.fetch = (u) => { seen = u; return Promise.resolve({ ok: true, json: () => Promise.resolve({ layouts: [] }) }); };
        return pbApi.getLayouts().then(() => { window.fetch = orig; return seen; });
      });
      expect(url).toBe("https://my-pc.local/api/layouts");
    });

    test("Scan QR parses a tunnel URL (no port) and an IP:port into the fields", async ({ page }) => {
      await page.goto("/remoteHID/PhoneButtons/");
      const parsed = await page.evaluate(() => [
        pbParseServerUrl("https://calm-river-1234.trycloudflare.com"),
        pbParseServerUrl("https://calm-river-1234.trycloudflare.com/"),
        pbParseServerUrl("http://192.168.1.60:5000/PhoneButtons/"),
        pbParseServerUrl("192.168.1.60:5000"),
        pbParseServerUrl("my-pc.local"),
        pbParseServerUrl("not an address")
      ]);
      expect(parsed[0]).toEqual({ https: true, address: "calm-river-1234.trycloudflare.com", port: "" });
      expect(parsed[1]).toEqual({ https: true, address: "calm-river-1234.trycloudflare.com", port: "" });
      expect(parsed[2]).toEqual({ https: false, address: "192.168.1.60", port: "5000" });
      expect(parsed[3]).toEqual({ https: false, address: "192.168.1.60", port: "5000" });
      expect(parsed[4]).toEqual({ https: false, address: "my-pc.local", port: "" });
      expect(parsed[5]).toBeNull();

      // The scan page hosts the shared importer in raw mode, and a decoded value
      // fills the three controls.
      await page.evaluate(() => openSettings());
      await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Server" }).click();
      await page.locator("#btnScanServerQr").click();
      await expect(page.locator("#serverScanPage")).toHaveAttribute("open", "");
      await expect(page.locator("#serverScanPage smd-qr-import[raw]")).toHaveCount(1);
      await page.evaluate(() => {
        document.querySelector("#serverScanPage smd-qr-import")
          .dispatchEvent(new CustomEvent("smd-qr-import-complete", {
            bubbles: true, composed: true, detail: { data: "https://calm-river-1234.trycloudflare.com" }
          }));
      });
      await expect(page.locator("#serverAddressInput")).toHaveValue("calm-river-1234.trycloudflare.com");
      await expect(page.locator("#serverPortInput")).toHaveValue("");
      await expect(page.locator("#serverHttps")).toBeChecked();
      expect(await page.evaluate(() => pbServerBase())).toBe("https://calm-river-1234.trycloudflare.com");
      await expect(page.locator("#serverScanPage")).not.toHaveAttribute("open", "");
    });

    test("Connect re-targets the socket when the address changes", async ({ page }) => {
      await page.goto("/remoteHID/PhoneButtons/");
      await page.waitForFunction(() => typeof window.__serverConnect === "function");
      // Boot auto-connect used the page origin (no configured address -> undefined).
      let urls = await page.evaluate(() => window.__ioState.urls);
      expect(urls).toEqual([null]);

      await page.evaluate(() => {
        localStorage.setItem("pb_serverAddress", "calm-river-1234.trycloudflare.com");
        localStorage.setItem("pb_serverPort", "");
        localStorage.setItem("pb_serverHttps", "true");
      });
      await page.evaluate(() => connectServer());
      await expect.poll(() => page.evaluate(() => window.__ioState.urls.length)).toBe(2);
      urls = await page.evaluate(() => window.__ioState.urls);
      expect(urls[1]).toBe("https://calm-river-1234.trycloudflare.com");
    });

    test("server-relative asset URLs are resolved against the configured server", async ({ page }) => {
      await page.goto("/remoteHID/PhoneButtons/");
      // Same origin (no configured address) -> paths stay relative.
      expect(await page.evaluate(() => pbServerUrl("/app-icon-cache/x.png"))).toBe("/app-icon-cache/x.png");
      // Absolute / protocol-relative URLs are left alone.
      expect(await page.evaluate(() => pbServerUrl("https://cdn.example/x.png"))).toBe("https://cdn.example/x.png");
      expect(await page.evaluate(() => pbServerUrl("//cdn.example/x.png"))).toBe("//cdn.example/x.png");

      await page.evaluate(() => {
        localStorage.setItem("pb_serverAddress", "calm-river-1234.trycloudflare.com");
        localStorage.setItem("pb_serverPort", "");
        localStorage.setItem("pb_serverHttps", "true");
      });

      // app_change pushes a ROOT-RELATIVE icon path; it must be prefixed, otherwise
      // the image is requested from the APP's host (e.g. ownimage.github.io).
      await page.evaluate(() => window.__serverEmit("app_change", { name: "App", icon: "/app-icon-cache/App.png" }));
      await expect(page.locator("#serverAppIcon"))
        .toHaveAttribute("src", "https://calm-river-1234.trycloudflare.com/app-icon-cache/App.png");

      // The Manage Layout picker builds its URL from a bare NAME.
      expect(await page.evaluate(() => iconCacheUrl("Windows Terminal Host.png")))
        .toBe("https://calm-river-1234.trycloudflare.com/app-icon-cache/Windows%20Terminal%20Host.png");
    });

    test("smd-qr-import raw mode emits the decoded text as-is", async ({ page }) => {
      await page.goto("/remoteHID/PhoneButtons/");
      const decoded = await page.evaluate(() => new Promise((resolve) => {
        const el = document.createElement("smd-qr-import");
        el.setAttribute("raw", "");
        el.addEventListener("smd-qr-import-complete", (e) => resolve(e.detail.data));
        document.body.appendChild(el);
        el._stopped = false; // simulate an active scan
        el._handleDecoded("https://calm-river.trycloudflare.com");
      }));
      expect(decoded).toBe("https://calm-river.trycloudflare.com");
    });
  });
});
