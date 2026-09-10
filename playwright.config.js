const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 16,
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
      testIgnore: /touch\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "iphone-12-pro",
      testMatch: /touch\.spec\.js/,
      use: { ...devices["iPhone 12 Pro"] },
    },
  ],
  webServer: [
    {
      command: 'python tests/http-server.py',
      url: "http://localhost:8080",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'python tests/subpath-server.py',
      url: "http://localhost:8081/PlanMyDay/PlanMyDay/",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
