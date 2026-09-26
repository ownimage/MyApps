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
  retries: process.env.CI ? 2 : 0,
  workers: "50%",
  quiet: true,
  retries: 1,
  reporter: "list",
  globalSetup: require.resolve("./tests/global-setup.js"),
  globalTeardown: require.resolve("./tests/global-teardown.js"),
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /pmd-touch\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "iphone-12-pro",
      testMatch: /pmd-touch\.spec\.js/,
      use: { ...devices["iPhone 12 Pro"] },
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
