// Runs the Blender add-on test suite from the JS suite, so a plain
// `playwright test` covers `remoteHID/blender/mouser_step_controls.py` too - the
// same pattern as tests/phonebuttons-server.spec.js does for the Python server.
//
// The add-on is Blender Python (it needs `bpy`), so it cannot run in Node: this
// spec shells out to `blender -b --python remoteHID/blender/test_step_controls.py`,
// which prints one PASS/FAIL line per check and exits non-zero on failure.
//
// It SKIPS (with the reason) when Blender is not installed, so the JS suite still
// runs on a machine without it. `BLENDER_EXE` overrides the discovery (an
// explicitly set but missing path is a FAILURE, not a skip).
//
// No startCoverage/stopCoverage hooks: there is no browser page here, and the
// coverage report only counts JS.

const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join("remoteHID", "blender", "test_step_controls.py");
// Floor so a truncated/emptied test file cannot pass silently (it currently
// reports 21 checks).
const MIN_CHECKS = 20;

// Blender's own output is plain ASCII, but strip ANSI anyway so a failure message
// is readable in the report.
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007|\u001b[@-Z\\-_]/g;
function plain(text) {
  return String(text == null ? "" : text).replace(ANSI_RE, "");
}

// "C:\Program Files\Blender Foundation\Blender 4.4\blender.exe", newest install
// first, then PATH.
function findBlender() {
  if (process.env.BLENDER_EXE) return process.env.BLENDER_EXE;

  const roots = [
    process.env["ProgramFiles"] && path.join(process.env["ProgramFiles"], "Blender Foundation"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Blender Foundation"),
  ].filter(Boolean);

  const found = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const exe = path.join(root, entry.name, "blender.exe");
      if (fs.existsSync(exe)) found.push({ version: entry.name, exe });
    }
  }
  found.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  if (found.length) return found[0].exe;

  for (const lookup of ["where", "which"]) {
    try {
      const first = execFileSync(lookup, ["blender"], { encoding: "utf8", timeout: 10000 })
        .split(/\r?\n/)[0].trim();
      if (first && fs.existsSync(first)) return first;
    } catch (e) {
      // not on PATH
    }
  }
  return null;
}

function run(exe, args) {
  return execFileSync(exe, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 180000,                 // hard ceiling - never hang the suite
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test.describe("Blender add-on (Mouser Step Controls)", () => {

  test.describe.configure({ timeout: 240000 });

  test("add-on unit tests pass in headless Blender", () => {
    const exe = findBlender();
    if (!exe) {
      test.skip(true, "Blender was not found (install it or set BLENDER_EXE); "
        + "the Mouser Step Controls add-on tests need Blender's bundled Python");
    }
    expect(fs.existsSync(exe), `BLENDER_EXE points at a missing file: ${exe}`).toBeTruthy();
    expect(fs.existsSync(path.join(REPO_ROOT, SCRIPT)), `${SCRIPT} is missing`).toBeTruthy();

    // --factory-startup keeps the run independent of the user's startup file,
    // preferences and enabled add-ons; the test script stubs the add-on's own
    // preference lookup, so nothing of the user's is read or written.
    let output;
    try {
      output = plain(run(exe, ["-b", "--factory-startup", "--python", SCRIPT]));
    } catch (e) {
      const raw = plain(`${e.stdout || ""}${e.stderr || ""}`);
      const failed = raw.split(/\r?\n/).filter((line) => /^(FAIL |FAILED: )/.test(line)).join("\n");
      throw new Error(
        `the Blender add-on tests failed in ${exe} (exit ${e.status}, signal ${e.signal})\n`
        + `${failed || "(no per-check failure lines captured)"}\n\n`
        + `--- blender output ---\n${raw.slice(-6000)}`,
      );
    }

    const summary = /(\d+) checks, (\d+) failed/.exec(output);
    expect(summary, `no "N checks, N failed" summary in the Blender output:\n${output}`).toBeTruthy();
    const [, total, failed] = summary;
    expect(Number(failed), `${failed} Blender add-on check(s) failed:\n${output}`).toBe(0);
    expect(
      Number(total),
      `only ${total} Blender add-on checks ran (expected at least ${MIN_CHECKS})`,
    ).toBeGreaterThanOrEqual(MIN_CHECKS);

    const version = output.split(/\r?\n/).find((line) => /^Blender \d/.test(line)) || "Blender (version line missing)";
    // The list reporter suppresses a PASSING test's stdout, so record the result
    // where it can be seen: annotations show in the HTML report.
    test.info().annotations.push({ type: "blender", description: version.trim() });
    test.info().annotations.push({ type: "blender add-on checks", description: `${total} checks, 0 failed` });
    test.info().annotations.push({
      type: "blender add-on command",
      description: `${exe} -b --factory-startup --python ${SCRIPT}`,
    });
  });
});
