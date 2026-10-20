#!/usr/bin/env node
// Custom Playwright runner.
//
// The contrast suite (27 themes x 2 modes, several minutes) lives OUTSIDE the
// main test dir (`test-contrast/`), so it never holds up the end of a normal
// run. This runner starts it FIRST, concurrently with the main suite, so its
// long theme loops overlap the rest of the tests.
//
//   node run-tests.mjs                  contrast (if present) + main, concurrently
//   node run-tests.mjs --no-contrast    main suite only
//   node run-tests.mjs --contrast-only  contrast suite only
//   node run-tests.mjs --grep "foo"     extra args go to the MAIN run
//   SMD_CONTRAST_FIX=1 node run-tests.mjs
//                                       contrast only; regenerates the theme CSS
//                                       (use `npm run test:contrast` on PowerShell:
//                                        $env:SMD_CONTRAST_FIX=1; npm run test:contrast)
//
// The runner owns the shared test server unless EXTERNAL_SERVERS=1 (or the
// legacy EXTERNAL_SERVER=1) is already set.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const contrastDir = path.join(root, "test-contrast");
const contrastConfig = path.join(contrastDir, "playwright.config.js");
const serverScript = path.join(root, "tests", "serve-tests.mjs");
const probeUrl = "http://localhost:8080/PlanMyDay/";

const args = process.argv.slice(2);
const noContrast = args.includes("--no-contrast");
const contrastOnly = args.includes("--contrast-only");
const mainArgs = args.filter((a) => a !== "--no-contrast" && a !== "--contrast-only");
const fix = process.env.SMD_CONTRAST_FIX === "1";

const hasContrast = existsSync(contrastConfig) &&
  readdirSync(contrastDir).some((f) => /\.(spec|test)\.[cm]?[jt]sx?$/.test(f));
const runContrast = hasContrast && !noContrast;
const runMain = !contrastOnly && !fix;

if (!hasContrast && (contrastOnly || fix)) {
  console.error("No contrast tests found in test-contrast/.");
  process.exit(1);
}

function spawnPlaywright(label, extra) {
  const child = spawn(
    process.execPath,
    [cli, "test", ...extra],
    {
      cwd: root,
      stdio: "inherit",
      // Both suites share the one server started below.
      env: { ...process.env, EXTERNAL_SERVERS: "1" }
    }
  );
  child.on("error", (err) => console.error(`[${label}] failed to start: ${err.message}`));
  return child;
}

async function serverUp() {
  try {
    const res = await fetch(probeUrl, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await serverUp()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

const external = process.env.EXTERNAL_SERVERS === "1" || process.env.EXTERNAL_SERVER === "1";
let server = null;
const children = [];

function stopAll() {
  children.forEach((child) => { try { child.kill(); } catch { /* ignore */ } });
  if (server) { try { server.kill(); } catch { /* ignore */ } }
}

process.on("SIGINT", () => { stopAll(); process.exit(130); });
process.on("SIGTERM", () => { stopAll(); process.exit(143); });

if (!external) {
  if (!(await waitForServer(500))) {
    server = spawn(process.execPath, [serverScript], { cwd: root, stdio: "inherit", env: process.env });
    server.on("error", (err) => console.error("[server] failed to start: " + err.message));
    if (!(await waitForServer(120000))) {
      console.error("Test server did not become ready: " + probeUrl);
      stopAll();
      process.exit(1);
    }
  }
}

// Start contrast FIRST so its long theme loops run alongside the main suite.
if (runContrast) {
  children.push(spawnPlaywright("contrast", [
    "--config", contrastConfig,
    // The FIX generator is a single test; use one worker so it cannot race
    // itself. Normal runs inherit the config's 50% so both suites share the CPU.
    ...(fix ? ["--workers", "1"] : []),
    "--reporter", "line"
  ]));
}
if (runMain) {
  children.push(spawnPlaywright("main", mainArgs));
}

if (!children.length) {
  stopAll();
  process.exit(0);
}

const codes = await Promise.all(children.map((child) => new Promise((resolve) => {
  child.on("close", (code, signal) => resolve(code == null ? (signal ? 1 : 0) : code));
})));

if (server) { try { server.kill(); } catch { /* ignore */ } }
process.exit(Math.max(...codes));
