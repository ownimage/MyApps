// Runs the MyHID SERVER test suite (Python) from the JS suite, so a plain
// `playwright test` covers app.py too. The Python side lives in
// `MyHID/server/test_app.py` and `MyHID/server/test_hid.py` (pytest,
// Flask + Socket.IO + Hid engine/transport) and needs the Python 3.13
// interpreter, where Flask/pywin32/psutil/pytest are installed - see
// MyHID/server/README.md.
//
// It SKIPS (with the reason) when that interpreter or those packages are absent,
// so the JS suite still runs on a machine without them.
//
// No startCoverage/stopCoverage hooks: there is no browser page here, and the
// coverage report only counts JS. app.py's % comes from pytest-cov and is
// asserted below.

const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const PY = process.env.MYHID_PYTHON || "py";
const PY_ARGS = process.env.MYHID_PYTHON ? [] : ["-3.13"];
// Below the current 90%, but high enough to catch a wholesale loss of cover.
const MIN_COVERAGE = 80;

// pytest/coverage colour their output with ANSI escapes even when stdout is a
// pipe, which turns the saved report into control characters. Ask for plain text
// AND strip anything that still gets through (belt and braces).
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007|\u001b[@-Z\\-_]/g;
function plain(text) {
  return String(text == null ? "" : text).replace(ANSI_RE, "");
}

function run(args, extraEnv) {
  return execFileSync(PY, [...PY_ARGS, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 180000,                 // hard ceiling - never hang the suite
    env: { ...process.env, NO_COLOR: "1", PY_COLORS: "0", TERM: "dumb", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test.describe("MyHID server (Python)", () => {

  test.describe.configure({ timeout: 240000 });

  test("server unit tests pass with coverage", () => {
    // Probe the interpreter + packages first so a missing env SKIPS, not FAILS.
    try {
      run(["-c", "import flask, flask_socketio, win32api, psutil, pytest, coverage"]);
    } catch (e) {
      test.skip(true, `python ${PY} ${PY_ARGS.join(" ")} lacks the MyHID server deps `
        + "(flask, flask-socketio, pywin32, psutil, pytest, coverage)");
    }

    // Named artefacts (both inside the gitignored MyHID/server folder, so
    // a run never dirties the repo):
    //   coverage.txt    the full pytest output incl. the app.py table
    //   htmlcov/        the browsable HTML report (open htmlcov/index.html)
    const textReport = path.join(REPO_ROOT, "MyHID", "server", "coverage.txt");
    const htmlReport = path.join(REPO_ROOT, "MyHID", "server", "htmlcov");
    const coverageFile = path.join(os.tmpdir(), "myapps-pb-app.coverage");
    let output;
    try {
      output = plain(run([
        "-m", "pytest", "MyHID/server/test_app.py", "MyHID/server/test_hid.py",
        "--cov=app", "--cov-report=term-missing", `--cov-report=html:${htmlReport}`,
        "--color=no", "-q", "-p", "no:cacheprovider",
      ], { COVERAGE_FILE: coverageFile }));
    } catch (e) {
      output = plain(`${e.stdout || ""}${e.stderr || ""}`);
      fs.writeFileSync(textReport, output);
      // Surface the pytest failure output in the Playwright report.
      expect(output, `pytest failed:\n${output}`).toContain("passed");
      throw e;
    }
    fs.writeFileSync(textReport, output);

    const lines = output.split(/\r?\n/);
    const total = lines.find((l) => /^TOTAL\s/.test(l));
    expect(total, `no coverage TOTAL line in:\n${output}`).toBeTruthy();
    const percent = parseInt(total.trim().split(/\s+/).pop(), 10);
    expect(percent, `app.py coverage ${percent}% is below the ${MIN_COVERAGE}% floor`).toBeGreaterThanOrEqual(MIN_COVERAGE);

    const passed = /(\d+) passed/.exec(output);
    expect(passed, `no "N passed" in:\n${output}`).toBeTruthy();

    // Where to look afterwards: the table is in `coverage.txt` and the browsable
    // per-line report in `htmlcov/index.html` (both gitignored). The list reporter
    // suppresses a PASSING test's stdout, so the paths are also added as
    // annotations (visible in the HTML report); a FAILING run prints the whole
    // pytest output anyway.
    process.stdout.write(
      `\n[myhid-server] ${passed[0]} | app.py ${total.trim()}`
      + `\n[myhid-server] table: ${textReport}\n[myhid-server] html:  ${path.join(htmlReport, "index.html")}\n`,
    );
    test.info().annotations.push({ type: "app.py coverage", description: total.trim() });
    test.info().annotations.push({ type: "app.py tests", description: passed[0] });
    test.info().annotations.push({ type: "app.py coverage files", description: `${textReport} | ${htmlReport}` });
  });

  test("the packaged requirements list matches what the tests need", () => {
    // A cheap guard: the deps the test file imports must be declared in
    // requirements.txt (a missing one only shows up as an ImportError on a
    // fresh install).
    const requirements = fs.readFileSync(
      path.join(REPO_ROOT, "MyHID", "server", "requirements.txt"), "utf8",
    ).toLowerCase();
    for (const dep of ["flask", "flask-socketio", "python-socketio", "pywin32", "psutil", "pillow"]) {
      expect(requirements, `requirements.txt is missing ${dep}`).toContain(dep);
    }
  });
});
