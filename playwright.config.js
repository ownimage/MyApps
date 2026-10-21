const { defineConfig, devices } = require("@playwright/test");

// Set EXTERNAL_SERVERS=1 when the Vite test servers (8080/8081) are already
// running — e.g. you started `npm run dev:test` for a full/sharded run — so
// Playwright neither starts nor owns them (nothing kills the shared server when
// an individual shard exits). With EXTERNAL_SERVERS unset, Playwright runs
// `node tests/serve-tests.mjs` itself (one command starts BOTH origins) and
// reuses an already-listening server instead of racing to start a second one.
const externalServers = !!process.env.EXTERNAL_SERVERS;

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: "50%",
  quiet: true,
  retries: 1,
  // One HTML report for the whole run (all projects); open with
  // `npx playwright show-report`. The console list reporter still streams.
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: require.resolve("./tests/global-setup.js"),
  globalTeardown: require.resolve("./tests/global-teardown.js"),
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
  },
  // SCHEDULING: Playwright has no per-test priority/sequencer. It dispatches
  // test groups in PROJECT ORDER, so the order of this array is the schedule:
  //   contrast -> chromium -> iphone-12-pro -> cache
  // The contrast suite therefore starts first and overlaps the rest of the run;
  // the @cache tests are queued last, so they start once other workers begin to
  // free up (less contention). The two groups are selected by tags in the specs,
  // not by file name, so moving a test between files does not change its phase.
  // Every project shares the one global worker pool, so `--workers=32` is
  // honoured everywhere; project order only decides WHO gets the free workers.
  projects: [
    {
      // 27 themes x 2 modes per test. Fully parallel, so the global worker count
      // applies (up to 11 tests here); it still starts before the main suite.
      name: "contrast",
      grep: /@contrast/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: /pmd-touch\.spec\.js/,
      grepInvert: /@contrast|@cache/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "iphone-12-pro",
      testMatch: /pmd-touch\.spec\.js/,
      use: { ...devices["iPhone 12 Pro"] },
    },
    {
      // Last: the cache-busting/SW tests are the most load-sensitive ones, so
      // they run after the main queue has drained. They are independent browser
      // contexts, so the global pool can still run them in parallel.
      name: "cache",
      grep: /@cache/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Both test origins (8080 repo root, 8081 repo-under-/PlanMyDay/) are started
  // by this one command; Playwright waits on the root origin.
  webServer: externalServers ? undefined : [
    {
      command: "node tests/serve-tests.mjs",
      url: "http://localhost:8080/PlanMyDay/",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
