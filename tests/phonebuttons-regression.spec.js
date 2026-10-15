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

    await page.goto("/PhoneButtons/");

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
    await page.goto("/PhoneButtons/");

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
    await page.goto("/PhoneButtons/");
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

    await page.goto("/PhoneButtons/");
    await page.evaluate(() => openManageLayout());
    await page.locator("#layoutButton1").click();
    await expect(page.locator("#buttonEditPage")).toHaveAttribute("open", "");
    await expect(page.locator("#buttonImage1Select")).toBeVisible();
    await expect(page.locator("#buttonImage2Select")).toBeVisible();
    await page.locator("#buttonImage1Select").getByRole("button", { name: "Edit" }).click();
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

    // The Clear Local Storage danger button keeps shared images/theme/font size.
    await expect(page.locator("#btnClearStorage")).toBeVisible();
    const kept = await page.evaluate(() => {
      localStorage.setItem("pb_noCache", "true");
      localStorage.setItem("shared-images", "[1]");
      clearLocalStorageExcept();
      return {
        noCache: localStorage.getItem("pb_noCache"),
        theme: localStorage.getItem("pb_theme"),
        fontSize: localStorage.getItem("pb_fontSize"),
        images: localStorage.getItem("shared-images")
      };
    });
    expect(kept.noCache).toBeNull();
    expect(kept.theme).toBe("brite");
    expect(kept.fontSize).toBe("large");
    expect(kept.images).toBe("[1]");

    // The share QR encodes this server's own URL.
    await expect(page.locator("#shareQrCode")).toHaveAttribute("value", "http://localhost:8080/PhoneButtons/");
  });

  test("Server tab: IP/port fields default, persist and drive the server base", async ({ page }) => {
    await page.goto("/PhoneButtons/");

    // Fresh install: the address is seeded from the page origin when it looks
    // like the server (a non-default port), and that origin stays same-origin.
    const seeded = await page.evaluate(() => ({
      ip: localStorage.getItem("pb_serverIp"),
      port: localStorage.getItem("pb_serverPort"),
      base: pbServerBase()
    }));
    expect(seeded.ip).toBe("localhost");
    expect(seeded.port).toBe("8080");
    expect(seeded.base).toBe("");

    await page.evaluate(() => openSettings());
    await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Server" }).click();
    await expect(page.locator("#serverIpInput")).toHaveValue("localhost");
    await expect(page.locator("#serverPortInput")).toHaveValue("8080");

    // A complete LAN address persists and becomes an absolute base...
    await page.locator("#serverIpInput").fill("192.168.1.42");
    await page.locator("#serverPortInput").fill("5000");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_serverIp"))).toBe("192.168.1.42");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_serverPort"))).toBe("5000");
    expect(await page.evaluate(() => pbServerBase())).toBe("http://192.168.1.42:5000");
    // ...and an ACTIVE socket is torn down so the next Connect re-targets.
    expect(await page.evaluate(() => pbSocket.isActive())).toBe(false);

    // ...which the REST layer actually uses.
    const url = await page.evaluate(() => {
      let seen = null;
      const orig = window.fetch;
      window.fetch = (u) => { seen = u; return Promise.resolve({ ok: true, json: () => Promise.resolve({ layouts: [] }) }); };
      return pbApi.getLayouts().then(() => { window.fetch = orig; return seen; });
    });
    expect(url).toBe("http://192.168.1.42:5000/api/layouts");

    // The HTTPS switch selects the scheme.
    await page.locator("#serverHttps").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_serverHttps"))).toBe("true");
    expect(await page.evaluate(() => pbServerBase())).toBe("https://192.168.1.42:5000");

    // The "192.168.1." default is an incomplete PREFIX -> same origin again.
    await page.locator("#serverIpInput").fill("192.168.1.");
    expect(await page.evaluate(() => pbServerBase())).toBe("");
  });

  test("Scan QR parses the Share-app URL into the IP/port fields", async ({ page }) => {
    await page.goto("/PhoneButtons/");

    // The parser accepts a full URL, host:port and a bare host, and carries the
    // scheme through.
    const parsed = await page.evaluate(() => [
      parseServerAddress("http://192.168.1.99:5000/PhoneButtons/"),
      parseServerAddress("192.168.1.99:5000"),
      parseServerAddress("192.168.1.99"),
      parseServerAddress("https://192.168.1.50/PhoneButtons/"),
      parseServerAddress("not an address")
    ]);
    expect(parsed[0]).toEqual({ ip: "192.168.1.99", port: "5000", https: false });
    expect(parsed[1]).toEqual({ ip: "192.168.1.99", port: "5000", https: false });
    expect(parsed[2]).toEqual({ ip: "192.168.1.99", port: "5000", https: false });
    expect(parsed[3]).toEqual({ ip: "192.168.1.50", port: "443", https: true });
    expect(parsed[4]).toBeNull();

    // The scan page hosts the shared importer in raw mode; a decoded value feeds
    // the fields and is persisted.
    await page.evaluate(() => openSettings());
    await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Server" }).click();
    await page.locator("#btnScanServerQr").click();
    await expect(page.locator("#serverScanPage")).toHaveAttribute("open", "");
    await expect(page.locator("#serverScanPage smd-qr-import[raw]")).toHaveCount(1);
    await page.evaluate(() => {
      document.querySelector("#serverScanPage smd-qr-import")
        .dispatchEvent(new CustomEvent("smd-qr-import-complete", {
          bubbles: true, composed: true, detail: { data: "https://192.168.1.77:5000/PhoneButtons/" }
        }));
    });
    await expect(page.locator("#serverIpInput")).toHaveValue("192.168.1.77");
    await expect(page.locator("#serverPortInput")).toHaveValue("5000");
    await expect(page.locator("#serverHttps")).toBeChecked();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_serverIp"))).toBe("192.168.1.77");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pb_serverHttps"))).toBe("true");
    expect(await page.evaluate(() => pbServerBase())).toBe("https://192.168.1.77:5000");
    await expect(page.locator("#serverScanPage")).not.toHaveAttribute("open", "");
  });

  test("Connect re-targets the socket when the server address changes", async ({ page }) => {
    await page.goto("/PhoneButtons/");
    await page.waitForFunction(() => typeof window.__serverConnect === "function");

    // Boot auto-connect (same origin) passed no URL.
    let urls = await page.evaluate(() => window.__ioState.urls);
    expect(urls).toEqual([null]);

    // Configure a LAN server, then Connect: the socket is rebuilt for the new
    // address (previously connect() returned the stale same-origin socket, so the
    // request kept going to the page origin).
    await page.evaluate(() => {
      localStorage.setItem("pb_serverIp", "192.168.1.42");
      localStorage.setItem("pb_serverPort", "5000");
      localStorage.setItem("pb_serverHttps", "true");
    });
    await page.evaluate(() => connectServer());
    await expect.poll(() => page.evaluate(() => window.__ioState.urls.length)).toBe(2);
    urls = await page.evaluate(() => window.__ioState.urls);
    expect(urls[1]).toBe("https://192.168.1.42:5000");
    // The log names the target it is dialling.
    expect(await page.evaluate(() => _pbCommLogLines.map((l) => l.text).join("\n")))
      .toContain("connecting to https://192.168.1.42:5000");

    // A socket stuck on a connect_error still offers Disconnect (it used to be
    // disabled unless status was connected/connecting).
    await page.evaluate(() => window.__serverEmit("connect_error", { message: "xhr poll error" }));
    await page.evaluate(() => openSettings());
    await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Server" }).click();
    await expect(page.locator("#btnDisconnect")).toBeEnabled();
    await page.locator("#btnDisconnect").click();
    expect(await page.evaluate(() => pbSocket.isActive())).toBe(false);
  });

  test("smd-qr-import raw mode emits the decoded text as-is", async ({ page }) => {
    await page.goto("/PhoneButtons/");
    const decoded = await page.evaluate(() => new Promise((resolve) => {
      const el = document.createElement("smd-qr-import");
      el.setAttribute("raw", "");
      el.addEventListener("smd-qr-import-complete", (e) => resolve(e.detail.data));
      document.body.appendChild(el);
      el._stopped = false; // simulate an active scan
      el._handleDecoded("http://10.0.0.5:5000/PhoneButtons/");
    }));
    expect(decoded).toBe("http://10.0.0.5:5000/PhoneButtons/");
  });

  test("settings OK closes the page", async ({ page }) => {
    await page.goto("/PhoneButtons/");
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

    await page.goto("/PhoneButtons/");
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
    await expect(page.locator("#layoutIconDropdown #pbImageBtnText")).toHaveText("gone.png (missing)");
    await expect(page.locator("#layoutIconHint")).toContainText("no longer in the server cache");
    await expect(page.locator("#layoutIconPreview")).toBeHidden();
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
    await expect.poll(() => saved).toEqual({
      key: "reaper", displayName: "REAPER", image: "gone.png",
      rows: 2, cols: 3,
      buttons: [
        { name: "Advance", image1: "", image2: "", key: "ctrl+media_next_track", press: "regular" },
        {}, {}, {}, {}, {}
      ]
    });
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
      key: "my-keys-2", displayName: "My Keys", image: "",
      rows: 2, cols: 3, buttons: [{}, {}, {}, {}, {}, {}]
    });
    await expect(page.locator("#manageLayoutPage")).not.toHaveAttribute("open", "");
  });

  test("main page buttons hold a key down and release it (press-and-hold)", async ({ page }) => {
    await page.goto("/PhoneButtons/");
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

    await page.goto("/PhoneButtons/");
    await page.evaluate(() => openManageLayout());
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

    await page.goto("/PhoneButtons/");
    await page.evaluate(() => openManageLayout());
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

    await page.goto("/PhoneButtons/");
    await page.evaluate(() => openManageLayout());
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
});
