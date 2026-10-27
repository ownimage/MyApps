// The mouser-capture CONTROL PANEL (remoteHID/Mouser/capture): the JSON management
// API + the QR/address page it serves on loopback.
//
// The configuration UI itself lives in the PhoneButtons app (see
// phonebuttons-mouser.spec.js); this spec pins the API contract the app talks to.
//
// It runs the real published exe with `--simulate`, which needs no Interception
// driver and no mouse filter, so it is safe in CI and on a dev box. When the exe
// has not been built (or the tree is clean and `out/` is absent) every test SKIPS
// with the build command - same pattern as phonebuttons-server.spec.js.
//
// No coverage hooks: there is no browser page in the app under test (the panel
// page belongs to the exe, not to the repo's JS).

const { test, expect } = require("@playwright/test");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const EXE = path.join(REPO_ROOT, "remoteHID", "Mouser", "out", "mouser-capture.exe");
const BUILD_HINT = "remoteHID/Mouser/out/mouser-capture.exe is not built "
  + "(run: powershell -File remoteHID\\Mouser\\build.ps1)";

// Every spawned panel is registered here so a failing assertion can never leak a
// process (a leaked capture exe would keep a config file locked and a port open).
const PANELS = [];

function tempConfig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mouser-panel-"));
  return path.join(dir, "mouser-capture.json");
}

function killPanel(panel) {
  if (!panel || panel.exited) return;
  try { panel.proc.kill(); } catch { /* already gone */ }
}

// Start the panel and resolve once it prints its URL. The line is
//   panel: http://127.0.0.1:<port>/?t=<token>
async function startPanel(configFile, extraArgs = []) {
  const args = [
    "--ui", "--simulate", "--no-tunnel", "--no-qr",
    "--panel-port", "0",
    "--config", configFile,
    ...extraArgs,
  ];
  const proc = spawn(EXE, args, { cwd: path.dirname(EXE), windowsHide: true });
  let output = "";
  let settled = false;

  const panel = { proc, exited: false, url: "", origin: "", token: "", output: () => output };

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("the panel did not print its URL within 25s.\n" + output));
    }, 25000);

    const onData = (chunk) => {
      output += chunk.toString();
      const m = output.match(/panel:\s+(http:\/\/127\.0\.0\.1:(\d+)\/\?t=([0-9a-f]+))/);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        const parsed = new URL(m[1]);
        panel.url = m[1];
        panel.origin = parsed.origin;
        panel.token = parsed.searchParams.get("t");
        resolve();
      }
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", (code) => {
      panel.exited = true;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("the panel exited (" + code + ") before printing its URL.\n" + output));
    });
  });

  PANELS.push(panel);
  return panel;
}

// The reverse of what the panel does: kill it and wait for the OS to reap it, so
// the next start reads a settled config file.
function stopPanel(panel) {
  return new Promise((resolve) => {
    if (!panel || panel.exited) return resolve();
    panel.proc.once("exit", () => { panel.exited = true; resolve(); });
    killPanel(panel);
    setTimeout(resolve, 5000);
  });
}

// API call with the panel's token. `body` may be an object, a raw string or absent.
async function api(panel, route, options = {}) {
  const headers = Object.assign({}, options.headers);
  if (options.token !== null) headers["X-Mouser-Token"] = options.token || panel.token;
  let body;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }
  const res = await fetch(panel.origin + route, {
    method: options.method || "GET",
    headers,
    body,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, text, json };
}

test.describe("mouser-capture control panel", () => {
  test.skip(!fs.existsSync(EXE), BUILD_HINT);

  test.afterEach(async () => {
    while (PANELS.length) await stopPanel(PANELS.pop());
  });

  test("the panel serves its QR/address page and reports live state", async ({ page }) => {
    const panel = await startPanel(tempConfig());

    await page.goto(panel.url);

    // The page is the scan target: a QR plus the address in text. qrcodejs renders
    // BOTH a canvas and an <img> fallback, so assert "something was drawn" rather
    // than an exact count.
    await expect.poll(() => page.locator("#qr canvas, #qr img, #qr table").count(),
      { timeout: 20000 }).toBeGreaterThan(0);
    await expect(page.locator("#address")).toContainText(panel.token);

    const state = await api(panel, "/api/state");
    expect(state.status).toBe(200);
    expect(state.json.build).toBeTruthy();
    expect(state.json.capture.running).toBe(false);
    // --panel-port is a per-run override, so the SAVED port stays the default and
    // only the live panel reports the ephemeral one.
    expect(typeof state.json.config.panelPort).toBe("number");
    expect(state.json.panel.port).toBeGreaterThan(0);
    expect(state.json.panel.port).not.toBe(state.json.config.panelPort);
    expect(state.json.driver.simulated).toBe(true);
    expect(Array.isArray(state.json.devices)).toBe(true);
    expect(state.json.devices.length).toBeGreaterThan(0);
  });

  test("every route refuses a missing or wrong token", async () => {
    const panel = await startPanel(tempConfig());

    const noToken = await api(panel, "/api/state", { token: null });
    expect(noToken.status).toBe(403);

    const wrong = await api(panel, "/api/state", { token: "0".repeat(32) });
    expect(wrong.status).toBe(403);
    // The rejection names the LAST FOUR characters of the token it wants, so the app
    // can tell a stale token from a missing one without ever echoing the secret.
    expect(wrong.json.tokenHint).toMatch(/^[0-9a-f]{4}$/);
    expect(panel.token.endsWith(wrong.json.tokenHint)).toBe(true);

    // The page itself carries the secret too: without it there is no QR to scan.
    const page = await api(panel, "/", { token: null });
    expect(page.status).toBe(403);

    // ...and the token also works in the query string (that is how the page loads
    // its QR library, because a <script src> cannot send a header).
    const viaQuery = await api(panel, "/api/state?t=" + panel.token, { token: null });
    expect(viaQuery.status).toBe(200);
    const script = await api(panel, "/qrcode.min.js?t=" + panel.token, { token: null });
    expect(script.status).toBe(200);
    expect(script.text).toContain("QRCode");
  });

  test("the API is reachable cross-origin (the app is served elsewhere)", async () => {
    const panel = await startPanel(tempConfig());

    const preflight = await fetch(panel.origin + "/api/config", {
      method: "OPTIONS",
      headers: {
        Origin: "https://ownimage.github.io",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-mouser-token",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    const allowHeaders = (preflight.headers.get("access-control-allow-headers") || "").toLowerCase();
    expect(allowHeaders).toContain("x-mouser-token");
    expect(allowHeaders).toContain("content-type");
    expect((preflight.headers.get("access-control-allow-methods") || "").toUpperCase()).toContain("POST");

    const real = await api(panel, "/api/state", { headers: { Origin: "https://ownimage.github.io" } });
    expect(real.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("config is validated and written to the config file", async () => {
    const configFile = tempConfig();
    const panel = await startPanel(configFile);

    const bad = await api(panel, "/api/config", { method: "POST", body: { rotateButton: 9 } });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toContain("rotateButton");

    const unknown = await api(panel, "/api/config", { method: "POST", body: { nope: true } });
    expect(unknown.status).toBe(400);

    const malformed = await api(panel, "/api/config", { method: "POST", body: "{not json" });
    expect(malformed.status).toBe(400);

    const good = await api(panel, "/api/config", {
      method: "POST",
      body: {
        device: "HID\\VID_046D&PID_C52B&MI_01&Col01",
        rotateButton: 3,
        translateButton: 0,
        passModeButtons: true,
        udp: "192.168.1.50:7801",
        autoStart: false,
        panelPort: 0,
        bindLan: false,
        tunnel: false,
      },
    });
    expect(good.status).toBe(200);
    expect(good.json.config.rotateButton).toBe(3);
    expect(good.json.config.device).toContain("VID_046D");

    // It is really on disk: the next process reads it back (asserted separately),
    // and the file is readable JSON with the same values.
    const written = JSON.parse(fs.readFileSync(configFile, "utf8"));
    expect(written.rotateButton).toBe(3);
    expect(written.translateButton).toBe(0);
    expect(written.passModeButtons).toBe(true);
    expect(written.udp).toBe("192.168.1.50:7801");
  });

  test("the mouse list carries friendly names and slots", async () => {
    const panel = await startPanel(tempConfig());

    const devices = await api(panel, "/api/devices");
    expect(devices.status).toBe(200);
    expect(devices.json.devices.length).toBeGreaterThan(0);
    for (const device of devices.json.devices) {
      expect(device.slot).toBeGreaterThan(0);
      expect(device.hardwareId).toBeTruthy();
      expect(device.name).toBeTruthy();
      expect(typeof device.moving).toBe("boolean");
    }
  });

  test("start and stop toggle the capture session", async () => {
    const panel = await startPanel(tempConfig());

    const started = await api(panel, "/api/capture/start", { method: "POST" });
    expect(started.status).toBe(200);

    let state = await api(panel, "/api/state");
    expect(state.json.capture.running).toBe(true);

    // Starting twice is a conflict, not a second filter armed.
    const again = await api(panel, "/api/capture/start", { method: "POST" });
    expect(again.status).toBe(409);

    const stopped = await api(panel, "/api/capture/stop", { method: "POST" });
    expect(stopped.status).toBe(200);
    state = await api(panel, "/api/state");
    expect(state.json.capture.running).toBe(false);
  });

  test("a saved config survives a restart, and auto-start replays the session", async () => {
    const configFile = tempConfig();

    let panel = await startPanel(configFile);
    await api(panel, "/api/config", {
      method: "POST",
      body: {
        device: "HID\\VID_1234&PID_5678&MI_00&Col01",
        rotateButton: 4,
        translateButton: 5,
        passModeButtons: false,
        udp: "127.0.0.1:7801",
        autoStart: true,
        panelPort: 0,
        bindLan: false,
        tunnel: false,
      },
    });
    await stopPanel(panel);

    panel = await startPanel(configFile);
    const state = await api(panel, "/api/state");
    expect(state.json.config.device).toContain("VID_1234");
    expect(state.json.config.udp).toBe("127.0.0.1:7801");
    // autoStart was on when the panel opened, so the session replayed itself.
    expect(state.json.capture.running).toBe(true);

    // Stopping is an explicit "do not do that again", so autoStart is cleared.
    await api(panel, "/api/capture/stop", { method: "POST" });
    const afterStop = await api(panel, "/api/state");
    expect(afterStop.json.config.autoStart).toBe(false);
    await stopPanel(panel);

    panel = await startPanel(configFile);
    const third = await api(panel, "/api/state");
    expect(third.json.capture.running).toBe(false);
  });

  test("learn-button reports the clicked button while the capture is STOPPED", async () => {
    const panel = await startPanel(tempConfig());

    // No capture start: the panel arms a SHORT-LIVED session for the learn (so the
    // click is still swallowed) and releases it afterwards. The user's own capture
    // must not be running - identify/learn are stopped-only.
    const learned = await api(panel, "/api/learn-button", { method: "POST", body: { timeoutMs: 5000 } });
    expect(learned.status).toBe(200);
    expect(learned.json.ok).toBe(true);
    expect(learned.json.button).toBe(4);
    expect(learned.json.ms).toBeLessThan(5000);

    // The temporary session is gone again.
    const state = await api(panel, "/api/state");
    expect(state.json.capture.running).toBe(false);
  });

  test("learn-button times out, and a second concurrent learn is a conflict", async () => {
    const panel = await startPanel(tempConfig());

    // Shorter than the simulated click (300 ms), so nothing is learned in time.
    const timeout = await api(panel, "/api/learn-button", { method: "POST", body: { timeoutMs: 150 } });
    expect(timeout.status).toBe(200);
    expect(timeout.json).toMatchObject({ ok: false, timeout: true });

    const [first, second] = await Promise.all([
      api(panel, "/api/learn-button", { method: "POST", body: { timeoutMs: 1500 } }),
      api(panel, "/api/learn-button", { method: "POST", body: { timeoutMs: 1500 } }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  test("identify/learn are stopped-only: a running capture is a conflict", async () => {
    const panel = await startPanel(tempConfig());
    await api(panel, "/api/capture/start", { method: "POST" });

    const refused = await api(panel, "/api/learn-button", { method: "POST", body: { timeoutMs: 200 } });
    expect(refused.status).toBe(409);
    expect(refused.json.error.toLowerCase()).toContain("stop");
  });

  test("devices report cumulative motion and the key raw input is matched by", async () => {
    const panel = await startPanel(tempConfig());

    const first = await api(panel, "/api/state");
    const second = await api(panel, "/api/state");

    const moving = first.json.devices.find((device) => device.moving) || first.json.devices[0];
    expect(typeof moving.motion).toBe("number");
    // The canonical motion key (VID/PID/MI/Col) is what raw input is matched by -
    // exposed so a mismatch on a real machine is diagnosable.
    expect(typeof moving.motionKey).toBe("string");
    expect(moving.motionKey.length).toBeGreaterThan(0);

    // Diagnostics: what raw input has actually seen, and its total.
    expect(typeof first.json.panel.motion.total).toBe("number");
    expect(Array.isArray(first.json.panel.motion.keys)).toBe(true);

    const later = second.json.devices.find((device) => device.hardwareId === moving.hardwareId);
    // Cumulative, not drained: the app diffs two polls, so another consumer cannot
    // steal the motion it is watching for.
    expect(later.motion).toBeGreaterThan(moving.motion);
  });

  test("ping reports a timeout instead of hanging", async () => {
    const configFile = tempConfig();
    const panel = await startPanel(configFile);

    const started = Date.now();
    const ping = await api(panel, "/api/ping", {
      method: "POST",
      body: { udp: "127.0.0.1:9", attempts: 2, timeoutMs: 200 },
    });
    expect(ping.status).toBe(200);
    expect(ping.json.ok).toBe(false);
    expect(ping.json.replies).toBe(0);
    expect(ping.json.message).toMatch(/timeout/i);
    // Two 200ms attempts plus overhead - a hung socket would blow this out.
    expect(Date.now() - started).toBeLessThan(10000);
  });

  test("the tunnel is off by default and reports why it cannot start", async () => {
    const panel = await startPanel(tempConfig());

    const state = await api(panel, "/api/state");
    expect(state.json.tunnel.state).toBe("off");
    expect(state.json.tunnel.url).toBe(null);
    // Simulate mode never publishes anything.
    const started = await api(panel, "/api/tunnel/start", { method: "POST" });
    expect(started.status).toBe(409);
  });

  test("the command line still works (version + help)", async () => {
    const run = (args) => new Promise((resolve) => {
      const proc = spawn(EXE, args, { cwd: path.dirname(EXE), windowsHide: true });
      let out = "";
      proc.stdout.on("data", (d) => { out += d.toString(); });
      proc.stderr.on("data", (d) => { out += d.toString(); });
      proc.on("exit", (code) => resolve({ code, out }));
    });

    const version = await run(["--version"]);
    expect(version.code).toBe(0);
    expect(version.out.trim()).toMatch(/^0\.4\./);

    const help = await run(["--help"]);
    expect(help.code).toBe(0);
    expect(help.out).toContain("--ui");
    expect(help.out).toContain("--tunnel");
    expect(help.out).toContain("--config");
  });
});
