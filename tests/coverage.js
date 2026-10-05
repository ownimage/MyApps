const { CoverageReport } = require("monocart-coverage-reports");

const coverageOptions = {
  outputDir: "coverage-report",
  reports: ["v8", "console-summary", "html"],
  name: "MyApps Coverage",
  clean: true,
  cleanCache: false,
};

function createReport() {
  return new CoverageReport(coverageOptions);
}

async function startCoverage(page) {
  try {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
  } catch (e) {
    // JSCoverage may already be enabled from outer beforeEach; ignore
  }
}

async function stopCoverage(page) {
  let data;
  try {
    data = await page.coverage.stopJSCoverage();
  } catch (e) {
    return;
  }
  data = data.filter((entry) => {
    try {
      const url = new URL(entry.url);
      return (url.pathname.startsWith("/PlanMyDay/js/") ||
        url.pathname.startsWith("/CountMyDays/js/") ||
        url.pathname.startsWith("/QRLinks/js/") ||
        url.pathname.startsWith("/FreeFormOX/js/") ||
        url.pathname.startsWith("/SolarControlar/js/") ||
        url.pathname.startsWith("/Launch/js/") ||
        url.pathname.startsWith("/shared/js/")) && url.origin === "http://localhost:8080";
    } catch {
      return false;
    }
  }).map((entry) => {
    // Normalise away the cache-busting query (`?v=BUILD_NUMBER`) so the SAME
    // file loaded both versioned (app shells) and un-versioned (the storybook)
    // merges into ONE coverage entry instead of double-counting every function.
    try {
      const url = new URL(entry.url);
      url.search = "";
      entry.url = url.href;
    } catch { /* keep the original url */ }
    return entry;
  });
  if (data.length > 0) {
    const coverageReport = createReport();
    await coverageReport.add(data);
  }
}

async function cleanCoverageCache() {
  const coverageReport = createReport();
  await coverageReport.cleanCache();
}

async function generateCoverage() {
  try {
    const coverageReport = createReport();
    await coverageReport.generate();
  } catch (e) {
    console.warn("Coverage report generation skipped:", e.message);
  }
}

module.exports = {
  startCoverage,
  stopCoverage,
  generateCoverage,
  cleanCoverageCache,
  coverageOptions,
};
