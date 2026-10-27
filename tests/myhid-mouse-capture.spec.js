// MyHID -> "Manage mouse-capture": the page that configures the capture
// client (MyHID/mouse-capture) over its management API.
//
// The capture panel itself is covered by mouse-capture-ui.spec.js (it spawns the
// real exe with --simulate). Here the panel is STUBBED with page.route so the app's
// behaviour - menu entry, QR/address handling, configuration round-trips, error
// messages and the same-box auto-discovery - is tested without a driver, a tunnel
// or a second machine.
//
// The stub answers CORS preflights too: the capture panel is a DIFFERENT ORIGIN
// (that is the whole point of the tunnel), so a stub that skipped ACAO would hide
// a real cross-origin bug.

const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");
const { pickOption } = require("./theme-controls");

const CAPTURE_ORIGIN = "http://127.0.0.1:7802";
const ADDRESS = CAPTURE_ORIGIN + "/?t=deadbeefdeadbeef";
const TOKEN = "deadbeefdeadbeef";

// app.js auto-connects on boot, so the Socket.IO client must exist before load.
async function installFakeSocket(page) {
  await page.addInitScript(() => {
    const state = { handlers: {}, emitted: [] };
    window.__ioState = state;
    window.io = function () {
      const socket = {
        connected: false,
        id: "test-socket",
        on(event, cb) { (state.handlers[event] = state.handlers[event] || []).push(cb); return socket; },
        once(event, cb) { (state.handlers[event] = state.handlers[event] || []).push(cb); return socket; },
        emit(event, data) {
          state.emitted.push({ event, data });
          if (event === "ping") (state.handlers.pong || []).forEach((cb) => cb({ t: data && data.t }));
        },
        disconnect() { socket.connected = false; },
      };
      return socket;
    };
  });
}

function storedAddress(page) {
  return page.evaluate(() => ({
    url: localStorage.getItem("myhid_mouseCaptureUrl"),
    token: localStorage.getItem("myhid_mouseCaptureToken"),
  }));
}

async function seedAddress(page, url = CAPTURE_ORIGIN, token = TOKEN) {
  await page.addInitScript(([u, t]) => {
    localStorage.setItem("myhid_mouseCaptureUrl", u);
    localStorage.setItem("myhid_mouseCaptureToken", t);
  }, [url, token]);
}

// A capture-state payload shaped exactly like the exe's /api/state.
function captureState(overrides = {}) {
  return Object.assign({
    build: "0.4.0+test",
    simulate: false,
    elevated: true,
    canStart: true,
    blockReason: null,
    driver: { available: true, simulated: false, disabled: false, error: null },
    capture: {
      running: false, mode: 0, modeName: "off", target: null,
      strokes: 0, gated: 0, strokesPerSecond: 0, gatedPerSecond: 0,
      sendErrors: 0, loopP50Ms: 0, loopP99Ms: 0,
      udp: "192.168.1.50:7801", error: null, stopReason: null, restartRequired: false,
    },
    config: {
      device: "HID\\VID_046D&PID_C52B&MI_01&Col01",
      filter: null, rotateButton: 4, translateButton: 5, passModeButtons: false,
      udp: "192.168.1.50:7801", autoStart: false, panelPort: 7802,
      bindLan: false, tunnel: false, publicUrl: null, authToken: TOKEN,
    },
    devices: [
      { slot: 11, hardwareId: "HID\\VID_046D&PID_C52B&MI_01&Col01", name: "Logitech Receiver", moving: true, simulated: false },
      { slot: 12, hardwareId: "HID\\VID_046D&PID_C52B&MI_02&Col02", name: "Logitech MX Master", moving: false, simulated: false },
    ],
    tunnel: { state: "off", url: null, error: null, enabled: false, available: true, cloudflared: "cloudflared.exe", requested: false, publicUrl: null },
    panel: { port: 7802, bind: "127.0.0.1", urls: {}, publicUrl: ADDRESS, configPath: "x", configWarning: null },
    hotkey: { keys: "Ctrl+Alt+Shift+Q", registered: true },
    warnings: [],
  }, overrides);
}

// Stub the capture panel. Returns the recorded calls so the test can assert what
// the app sent (route, method, body, token header).
//   options.onState(state, callIndex)  mutate the payload before each /api/state
//   options.learn                      what /api/learn-button answers
async function stubCapture(page, state, options = {}) {
  const seen = { calls: [], tokens: [] };
  let stateCalls = 0;
  const learn = options.learn || { ok: true, button: 4, ms: 300 };

  await page.route(CAPTURE_ORIGIN + "/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Content-Type, X-HID-Token",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    };

    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors, body: "" });
    }

    seen.calls.push({
      method: request.method(),
      path: url.pathname,
      body: request.postData() ? JSON.parse(request.postData()) : null,
    });
    seen.tokens.push(request.headers()["x-hid-token"] || "");

    const json = (payload, status = 200) => route.fulfill({
      status,
      headers: Object.assign({ "content-type": "application/json" }, cors),
      body: JSON.stringify(payload),
    });

    switch (url.pathname) {
      case "/api/state":
        if (options.onState) options.onState(state, stateCalls++);
        return json(state);
      case "/api/devices": return json({ devices: state.devices });
      case "/api/config": {
        if (options.saveError) {
          return json({ ok: false, error: options.saveError }, 400);
        }
        // Persist like the real panel: the next poll must return the NEW config, or
        // the app would render the old value straight back over the change.
        const body = JSON.parse(request.postData() || "{}");
        Object.assign(state.config, body);
        return json({ ok: true, config: state.config });
      }
      // Stateful, like the real panel: the app's Stop button is disabled while the
      // capture is stopped, so a stub that never starts would never let it click.
      case "/api/capture/start":
        state.capture.running = true;
        return json({ ok: true });
      case "/api/capture/stop":
        state.capture.running = false;
        return json({ ok: true });
      case "/api/learn-button": return json(learn);
      case "/api/ping": return json({ ok: true, target: "192.168.1.50:7801", attempts: 5, replies: 5, rttMs: 12.4, message: null });
      default: return json({ ok: false, error: "no such route" }, 404);
    }
  });

  return seen;
}

test.beforeEach(async ({ page }) => {
  await startCoverage(page);
  await installFakeSocket(page);
});
test.afterEach(async ({ page }) => { await stopCoverage(page); });

test.describe("MyHID - Manage mouse-capture", () => {

  test("the menu carries Manage mouse-capture after Manage Layout", async ({ page }) => {
    await page.goto("/MyHID/");
    await page.locator("#btnMainMenu").click();

    // The hamburger menu is the app's own list - not the nested Launch flyout.
    const items = await page
      .locator("#mainNav > .dropdown > .dropdown-menu > li > a.dropdown-item")
      .allTextContents();

    expect(items).toEqual([
      "Settings", "Launch", "Manage App", "Manage Layout", "Manage mouse-capture",
      "Connect", "Disconnect",
    ]);
  });

  test("the page builds every control and starts from the saved address", async ({ page }) => {
    await seedAddress(page);
    await stubCapture(page, captureState());
    await page.goto("/MyHID/");

    await page.evaluate(() => openMouseCapture());
    await expect(page.locator("#mouseCapturePage")).toHaveAttribute("open", "");

    await expect(page.locator("#mouseCapturePage .smd-page-header h1")).toHaveText("Manage mouse-capture");
    // The field shows the FULL address, token included, so copying it out of the app
    // gives the next device everything (the token is stored as its own key).
    await expect(page.locator("#mouseCaptureUrlInput")).toHaveValue(ADDRESS);
    await expect(page.locator("#btnHidScan")).toBeVisible();
    await expect(page.locator("#btnHidSave")).toBeVisible();
    await expect(page.locator("#btnHidIdentify")).toBeVisible();
    await expect(page.locator("#btnHidLearnRotate")).toBeVisible();
    await expect(page.locator("#btnHidLearnTranslate")).toBeVisible();
    await expect(page.locator("#mouseCaptureRotate")).toHaveCount(1);
    await expect(page.locator("#mouseCaptureTranslate")).toHaveCount(1);
    await expect(page.locator("#mouseCapturePassMode")).toHaveCount(1);
    await expect(page.locator("#mouseCaptureAutoStart")).toHaveCount(1);
    await expect(page.locator("#btnHidStart")).toBeVisible();
    await expect(page.locator("#btnHidStop")).toBeVisible();
    await expect(page.locator("#btnHidPing")).toBeVisible();
  });

  test("a panel address (or its QR text) splits into base + token", async ({ page }) => {
    await page.goto("/MyHID/");

    const parsed = await page.evaluate(() => [
      myhidParseHidUrl("https://quiet-fox-mouse.trycloudflare.com/?t=abc123"),
      myhidParseHidUrl("http://192.168.1.60:7802/?t=def456"),
      myhidParseHidUrl("192.168.1.60:7802"),
      myhidParseHidUrl("https://example.com/"),
      myhidParseHidUrl("not a url"),
      myhidParseHidUrl(""),
    ]);

    expect(parsed[0]).toEqual({ base: "https://quiet-fox-mouse.trycloudflare.com", token: "abc123" });
    expect(parsed[1]).toEqual({ base: "http://192.168.1.60:7802", token: "def456" });
    expect(parsed[2]).toEqual({ base: "http://192.168.1.60:7802", token: "" });
    expect(parsed[3]).toEqual({ base: "https://example.com", token: "" });
    expect(parsed[4]).toBe(null);
    expect(parsed[5]).toBe(null);
  });

  test("saving the address stores the base and the token separately", async ({ page }) => {
    await page.goto("/MyHID/");
    await stubCapture(page, captureState());
    await page.evaluate(() => openMouseCapture());

    await page.fill("#mouseCaptureUrlInput", CAPTURE_ORIGIN + "/?t=abc123");
    await page.locator("#btnHidSave").click();

    await expect.poll(() => storedAddress(page)).toEqual({
      url: CAPTURE_ORIGIN,
      token: "abc123",
    });
    // The field keeps the full address, so it can be copied to another device.
    await expect(page.locator("#mouseCaptureUrlInput")).toHaveValue(CAPTURE_ORIGIN + "/?t=abc123");
  });

  test("leaving the address field applies it without pressing Save", async ({ page }) => {
    await seedAddress(page);
    const seen = await stubCapture(page, captureState());
    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());

    await page.fill("#mouseCaptureUrlInput", CAPTURE_ORIGIN + "/?t=abc123");
    // Blur the way a user does (tap elsewhere) - no Save button involved.
    await page.locator("#mouseCaptureStatus").click();

    await expect.poll(() => storedAddress(page)).toEqual({
      url: CAPTURE_ORIGIN,
      token: "abc123",
    });
    await expect(page.locator("#mouseCaptureAddressHint")).toContainText("c123");
    // ...and the page is polling with the new token straight away.
    await expect.poll(() => seen.calls.some((call) => call.path === "/api/state")).toBe(true);
    expect(seen.tokens).toContain("abc123");
  });

  test("the panel's state renders the mice, the settings and the telemetry", async ({ page }) => {
    await seedAddress(page);
    const seen = await stubCapture(page, captureState());
    await page.goto("/MyHID/");

    await page.evaluate(() => openMouseCapture());

    // Two mice, with the one that is moving highlighted.
    await expect(page.locator('#mouseCaptureDevices input[name="myhidCaptureDevice"]')).toHaveCount(2);
    await expect(page.locator("#mouseCaptureDevices")).toContainText("Logitech Receiver");
    await expect(page.locator("#mouseCaptureDevices")).toContainText("moving");

    // Saved settings are reflected in the controls.
    await expect(page.locator("#mouseCaptureRotate")).toHaveAttribute("value", "4");
    await expect(page.locator("#mouseCaptureTranslate")).toHaveAttribute("value", "5");
    await expect(page.locator("#mouseCaptureUdp")).toHaveValue("192.168.1.50:7801");

    // Every request carried the token, and no request was left unauthenticated.
    expect(seen.calls.some((call) => call.path === "/api/state")).toBe(true);
    expect(seen.tokens.every((token) => token === TOKEN)).toBe(true);
  });

  test("changing the mode button saves only that setting", async ({ page }) => {
    await seedAddress(page);
    const seen = await stubCapture(page, captureState());
    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());
    await expect(page.locator("#mouseCaptureRotate")).toHaveAttribute("value", "4");

    await pickOption(page, "#mouseCaptureRotate", "3");

    await expect.poll(() => seen.calls.filter((call) => call.path === "/api/config").length).toBeGreaterThan(0);
    const save = seen.calls.filter((call) => call.path === "/api/config").pop();
    expect(save.method).toBe("POST");
    expect(save.body.rotateButton).toBe(3);
    // The rest of the config is carried through untouched.
    expect(save.body.translateButton).toBe(5);
    expect(save.body.device).toContain("VID_046D");
    expect(save.body.udp).toBe("192.168.1.50:7801");
    expect(save.body.authToken).toBeUndefined();
  });

  test("start, stop and ping hit the panel's routes", async ({ page }) => {
    await seedAddress(page);
    const seen = await stubCapture(page, captureState());
    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());

    await page.locator("#btnHidStart").click();
    await expect.poll(() => seen.calls.some((call) => call.path === "/api/capture/start" && call.method === "POST")).toBe(true);

    await page.locator("#btnHidStop").click();
    await expect.poll(() => seen.calls.some((call) => call.path === "/api/capture/stop" && call.method === "POST")).toBe(true);

    await page.locator("#btnHidPing").click();
    await expect.poll(() => seen.calls.some((call) => call.path === "/api/ping")).toBe(true);
    const ping = seen.calls.find((call) => call.path === "/api/ping");
    expect(ping.body.udp).toBe("192.168.1.50:7801");
    await expect(page.locator("#mouseCapturePingResult")).toContainText("12");
  });

  test("Identify selects the mouse that is being moved", async ({ page }) => {
    await seedAddress(page);
    let call = 0;
    const seen = await stubCapture(page, captureState(), {
      onState: (state) => {
        call++;
        // Only the FIRST mouse moves; the second stays still.
        state.devices[0].motion = call * 25;
        state.devices[1].motion = 0;
      },
    });

    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());
    await expect(page.locator('#mouseCaptureDevices input[name="myhidCaptureDevice"]')).toHaveCount(2);

    await page.locator("#btnHidIdentify").click();

    await expect(page.locator("#mouseCaptureAddressHint")).toContainText("Selected", { timeout: 15000 });
    await expect(page.locator("#mouseCaptureAddressHint")).toContainText("Logitech Receiver");
    await expect.poll(() => seen.calls.filter((call) => call.path === "/api/config").length).toBeGreaterThan(0);
    const save = seen.calls.filter((call) => call.path === "/api/config").pop();
    expect(save.body.device).toBe("HID\\VID_046D&PID_C52B&MI_01&Col01");
  });

  test("Learn fills the mode button from the clicked mouse button", async ({ page }) => {
    await seedAddress(page);
    const state = captureState();
    // Identify/Learn are stopped-only, so the capture must NOT be running.
    const seen = await stubCapture(page, state, { learn: { ok: true, button: 3, ms: 420 } });

    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());
    // The first poll has to land before the page has a state to learn from.
    await expect(page.locator('#mouseCaptureDevices input[name="myhidCaptureDevice"]')).toHaveCount(2);

    await page.locator("#btnHidLearnRotate").click();

    await expect(page.locator("#mouseCaptureAddressHint")).toContainText("MB3");
    const save = seen.calls.filter((call) => call.path === "/api/config").pop();
    expect(save.body.rotateButton).toBe(3);
    await expect(page.locator("#mouseCaptureRotate")).toHaveAttribute("value", "3");
  });

  test("Learn refuses the left/right button instead of saving something invalid", async ({ page }) => {
    await seedAddress(page);
    const state = captureState();
    const seen = await stubCapture(page, state, { learn: { ok: true, button: 1, ms: 200 } });

    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());
    await expect(page.locator('#mouseCaptureDevices input[name="myhidCaptureDevice"]')).toHaveCount(2);

    await page.locator("#btnHidLearnRotate").click();

    await expect(page.locator("#mouseCaptureAddressHint")).toContainText("left");
    // Nothing saved, and the select still shows the previous button.
    expect(seen.calls.some((call) => call.path === "/api/config")).toBe(false);
    await expect(page.locator("#mouseCaptureRotate")).toHaveAttribute("value", "4");
  });

  test("Identify and Learn are disabled while the capture is running", async ({ page }) => {
    await seedAddress(page);
    const state = captureState();
    state.capture.running = true;
    const seen = await stubCapture(page, state);

    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());
    await expect(page.locator('#mouseCaptureDevices input[name="myhidCaptureDevice"]')).toHaveCount(2);

    // The inner <button> is the real control, so assert there.
    await expect(page.locator("#btnHidIdentify button")).toBeDisabled();
    await expect(page.locator("#btnHidLearnRotate button")).toBeDisabled();
    await expect(page.locator("#btnHidLearnTranslate button")).toBeDisabled();
    await expect(page.locator("#btnHidIdentify")).toHaveAttribute("title", "Stop the capture first");

    // Calling the handlers directly is guarded too, and says why.
    await page.evaluate(() => mouseCaptureToggleIdentify());
    await expect(page.locator("#mouseCaptureAddressHint")).toContainText("Stop the capture first");
    await page.evaluate(() => mouseCaptureLearnButton("rotate"));
    await expect(page.locator("#mouseCaptureAddressHint")).toContainText("Stop the capture first");

    expect(seen.calls.some((call) => call.path === "/api/learn-button")).toBe(false);
  });

  test("the moving badge sits at the left of the hardware-id line", async ({ page }) => {
    await seedAddress(page);
    await stubCapture(page, captureState());
    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());

    const row = page.locator("#mouseCaptureDevices label").first();
    const nameLine = row.locator(".fw-semibold").first();
    const idLine = row.locator(".text-body-secondary").first();
    const badge = row.locator("smd-badge").first();

    const nameBox = await nameLine.boundingBox();
    const idBox = await idLine.boundingBox();
    const badgeBox = await badge.boundingBox();

    // The id is the SECOND line, under the name.
    expect(idBox.y).toBeGreaterThan(nameBox.y + nameBox.height - 3);

    // The badge is vertically inside that second line...
    const badgeCentre = badgeBox.y + badgeBox.height / 2;
    expect(badgeCentre).toBeGreaterThan(idBox.y);
    expect(badgeCentre).toBeLessThan(idBox.y + idBox.height);

    // ...and at its LEFT edge, before the id text (it used to sit on the name line
    // and push itself onto a line of its own).
    expect(badgeBox.x - idBox.x).toBeLessThan(4);
    expect(badgeBox.y).toBeGreaterThanOrEqual(idBox.y - 2);
  });

  test("the moving badge does not move the layout when the mouse moves", async ({ page }) => {
    await seedAddress(page);
    const flag = { moving: false };
    await stubCapture(page, captureState(), {
      onState: (state) => { state.devices[0].moving = flag.moving; },
    });

    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());
    await expect(page.locator('#mouseCaptureDevices input[name="myhidCaptureDevice"]')).toHaveCount(2);

    const row = page.locator("#mouseCaptureDevices label").first();
    const idText = row.locator(".myhid-id");
    const badge = row.locator(".myhid-moving");

    // The badge is always in the DOM (reserving its space) - just invisible.
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveCSS("visibility", "hidden");

    const before = { id: await idText.boundingBox(), row: await row.boundingBox() };

    // The mouse starts moving: the badge appears, and NOTHING re-flows.
    flag.moving = true;
    await expect(badge).toHaveCSS("visibility", "visible");

    const after = { id: await idText.boundingBox(), row: await row.boundingBox() };
    expect(Math.abs(after.id.x - before.id.x)).toBeLessThan(1);
    expect(Math.abs(after.id.y - before.id.y)).toBeLessThan(1);
    expect(Math.abs(after.row.height - before.row.height)).toBeLessThan(1);
  });

  test("a rejected save is reported instead of a false success", async ({ page }) => {
    await seedAddress(page);
    const seen = await stubCapture(page, captureState(), {
      learn: { ok: true, button: 5, ms: 200 },
      saveError: "rotateButton and translateButton cannot be the same button",
    });

    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());
    await expect(page.locator('#mouseCaptureDevices input[name="myhidCaptureDevice"]')).toHaveCount(2);

    await page.locator("#btnHidLearnRotate").click();

    // The panel's reason wins over the "learned MB5" message, which used to mask it.
    await expect(page.locator("#mouseCaptureAddressHint")).toContainText("cannot be the same button");
    await expect(page.locator("#mouseCaptureAddressHint")).not.toContainText("MB5");
    await expect(page.locator("#mouseCaptureRotate")).toHaveAttribute("value", "4");
    expect(seen.calls.some((call) => call.path === "/api/config")).toBe(true);
  });

  test("Server (UDP) defaults to the Settings | Server address", async ({ page }) => {
    await seedAddress(page);
    await page.addInitScript(() => {
      localStorage.setItem("myhid_serverAddress", "192.168.1.50");
      localStorage.setItem("myhid_serverPort", "5000");
      localStorage.setItem("myhid_serverHttps", "false");
    });

    const state = captureState();
    state.config.udp = null;   // the capture has never been given a target
    const seen = await stubCapture(page, state);

    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());

    // Telemetry always goes to the server's UDP receiver (7801), not its HTTP port.
    await expect(page.locator("#mouseCaptureUdp")).toHaveValue("192.168.1.50:7801");
    // ...and it is SAVED, or the field would look configured while nothing is sent.
    await expect.poll(() => seen.calls.some((call) =>
      call.path === "/api/config" && call.body && call.body.udp === "192.168.1.50:7801")).toBe(true);
  });

  test("a rejected token is explained instead of showing a blank panel", async ({ page }) => {
    await seedAddress(page, CAPTURE_ORIGIN, "aaaabbbbccccddddeeeeffff0000b1c2");
    await page.route(CAPTURE_ORIGIN + "/**", (route) => {
      if (route.request().method() === "OPTIONS") {
        return route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "Content-Type, X-HID-Token",
            "access-control-allow-methods": "GET, POST, OPTIONS",
          },
          body: "",
        });
      }
      return route.fulfill({
        status: 403,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        body: JSON.stringify({ ok: false, error: "missing or invalid token", tokenHint: "3e32" }),
      });
    });

    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());

    // Both sides are named: the panel's token suffix and the one the app holds, so a
    // stale QR is obvious instead of a bare "403".
    const status = page.locator("#mouseCaptureStatus");
    await expect(status).toContainText("token");
    await expect(status).toContainText("3e32");
    await expect(status).toContainText("b1c2");
  });

  test("a capture started by this server is adopted without scanning", async ({ page }) => {
    // No stored address: the page must ask the server where the local capture is.
    await page.route("**/api/mouse-capture", (route) => route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        state: "ready",
        url: "http://192.168.1.60:7802/?t=cafebabecafebabe",
        token: "cafebabecafebabe",
        tunnelUrl: null,
        build: "0.4.0+test",
        error: null,
      }),
    }));
    await stubCapture(page, captureState());

    await page.goto("/MyHID/");
    await page.evaluate(() => openMouseCapture());

    await expect.poll(() => storedAddress(page)).toEqual({
      url: "http://192.168.1.60:7802",
      token: "cafebabecafebabe",
    });
    // The field shows the whole thing, token included (it is what you would copy).
    await expect(page.locator("#mouseCaptureUrlInput"))
      .toHaveValue("http://192.168.1.60:7802/?t=cafebabecafebabe");
  });
});
