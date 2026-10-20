// Separate Playwright config for the slow, 27-theme x 2-mode contrast suite.
//
// The main `playwright.config.js` keeps `testDir: "./tests"`, so `npm test`
// (and `playwright test tests`) intentionally does NOT pick these specs up.
// Run them with:
//   npm run test:contrast
// or let the custom runner start them first, concurrently with the main run:
//   npm run test:all
//
// Coverage is collected by the MAIN suite only (these specs do not use it), so
// the coverage setup/teardown is deliberately not inherited here.
const path = require("path");
const base = require("../playwright.config");
const rootDir = path.resolve(__dirname, "..");

module.exports = {
  ...base,
  testDir: __dirname,
  // Playwright resolves a relative webServer command against the CONFIG's
  // directory; this config lives in test-contrast/, so pin it to the repo root.
  webServer: base.webServer
    ? (Array.isArray(base.webServer) ? base.webServer : [base.webServer]).map((s) => ({ ...s, cwd: rootDir }))
    : undefined,
  globalSetup: undefined,
  globalTeardown: undefined,
  // Chromium only: the iphone-12-pro project exists for pmd-touch.spec.js.
  projects: [base.projects[0]]
};
