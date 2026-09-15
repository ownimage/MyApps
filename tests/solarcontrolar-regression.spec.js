const { test, expect } = require("@playwright/test");

// Mock the Flask API so the app works without a live server. The Flask URL
// defaults to "/solar", so route same-origin /solar/api/* paths.
async function mockFlaskApi(page) {
  await page.route("**/solar/api/power_data*", async (route) => {
    const url = new URL(route.request().url());
    const date = url.searchParams.get("date");
    if (!date) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ dates: ["2026-09-15", "2026-09-14"] })
      });
    }
    const day = date === "2026-09-14"
      ? { date, times: ["06:00:00", "07:00:00"], solar: [0, 100], grid: [500, 400], home: [500, 500], battery: [500, 400], battery_level: [40, 45] }
      : { date, times: ["06:00:00", "07:00:00", "08:00:00"], solar: [0, 100, 300], grid: [500, 400, 300], home: [500, 500, 500], battery: [500, 400, 200], battery_level: [40, 45, 50] };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(day) });
  });

  await page.route("**/solar/api/files*", (route) => {
    route.fulfill({ contentType: "text/plain", body: "mock log line 1\nmock log line 2" });
  });

  await page.route("**/solar/api/run_forecast", (route) => {
    route.fulfill({ contentType: "text/html", body: "mock forecast output" });
  });

  // The main Settings tab fetches the server-rendered index page (GET /solar/)
  // for the settings table + CSRF token, then POSTs back.
  await page.route("**/solar/", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ contentType: "text/html", body: "<html>saved</html>" });
    }
    return route.fulfill({
      contentType: "text/html",
      body: '<html><body><form id="settingsForm" method="POST" action="/solar/">' +
        '<input type="hidden" name="csrf_token" value="TESTCSRF">' +
        '<table><tbody>' +
          '<tr data-key="timezone" data-original="Europe/London"><td>Timezone</td>' +
            '<td><input type="text" name="timezone" value="Europe/London" readonly></td>' +
            '<td><span class="access-badge badge badge-ro">Read Only</span></td><td>timezone desc</td></tr>' +
          '<tr data-key="tolerance_percent" data-original="0.5"><td>Tolerance (%)</td>' +
            '<td><div><input type="range" id="slider-tolerance_percent" min="0" max="5" step="0.1" value="0.5"></div>' +
            '<input type="hidden" name="tolerance_percent" id="hidden-tolerance_percent" value="0.5"></td>' +
            '<td><span class="access-badge badge badge-rw">Read/Write</span></td><td>tolerance desc</td></tr>' +
          '<tr data-key="start_discharge_target" data-original="90"><td>Start Discharge Target (%)</td>' +
            '<td><input type="number" name="start_discharge_target" value="90" step="any"></td>' +
            '<td><span class="access-badge badge badge-rw">Read/Write</span></td><td>discharge desc</td></tr>' +
        '</tbody></table></form></body></html>'
    });
  });
}

test.describe("SolarControlar - Regression", () => {

  test("boot: default namespace, no console errors, tiles + tabs render", async ({ page }) => {
    const errors = [];
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await mockFlaskApi(page);

    await page.goto("/SolarControlar/");
    const cfg = await page.evaluate(() => ({
      prefix: SmdConfig.storagePrefix,
      imagePrefix: SmdConfig.imagePrefix,
      flaskUrl: localStorage.getItem("solarcontrolar_flaskUrl")
    }));
    expect(cfg.prefix).toBe("solarcontrolar_");
    expect(cfg.imagePrefix).toBe("shared-");
    expect(cfg.flaskUrl).toBeNull();

    // Top tiles render once power data arrives.
    await expect(page.locator("#topTiles")).not.toHaveAttribute("no-data", "");
    await expect(page.locator("#topTiles")).toHaveAttribute("power-date", "2026-09-15");
    await expect(page.locator("#topTiles")).toHaveAttribute("battery-level", "50");

    await expect(page.locator("#tab-power .power-table")).toBeVisible();
    await expect(page.locator("#tab-power .power-table")).toContainText("Solar");
    await expect(page.locator("#tab-power .power-table")).toContainText("300 W");

    // Main tabs present.
    const tabs = page.locator(".main-tabs .tab-btn");
    await expect(tabs).toHaveCount(6);
    await expect(tabs.nth(0)).toContainText("Power");
    await expect(tabs.nth(1)).toContainText("Settings");
    await expect(tabs.nth(2)).toContainText("Files");
    await expect(tabs.nth(3)).toContainText("Config");
    await expect(tabs.nth(4)).toContainText("Forecast");
    await expect(tabs.nth(5)).toContainText("Graph");

    expect(errors).toEqual([]);
  });

  test("main tabs switch content", async ({ page }) => {
    await mockFlaskApi(page);
    await page.goto("/SolarControlar/");
    await expect(page.locator("#tab-power")).toHaveClass(/active/);

    await page.locator(".main-tabs .tab-btn[data-tab='files']").click();
    await expect(page.locator("#tab-files")).toHaveClass(/active/);
    await expect(page.locator("#log-file")).toBeVisible({ timeout: 5000 });

    await page.locator(".main-tabs .tab-btn[data-tab='config']").click();
    await expect(page.locator("#tab-config")).toHaveClass(/active/);
    await expect(page.locator("#configSlider")).toBeVisible();

    await page.locator(".main-tabs .tab-btn[data-tab='forecast']").click();
    await expect(page.locator("#tab-forecast")).toHaveClass(/active/);
    await expect(page.locator("#btnRunForecast")).toBeVisible();
  });

  test("main settings tab shows the solar control settings from the server", async ({ page }) => {
    await mockFlaskApi(page);
    await page.goto("/SolarControlar/");
    await page.locator(".main-tabs .tab-btn[data-tab='settings']").click();

    const table = page.locator("#tab-settings .settings-table");
    await expect(table).toBeVisible({ timeout: 10000 });
    await expect(table).toContainText("Timezone");
    await expect(table).toContainText("Read Only");
    await expect(table).toContainText("Tolerance (%)");
    await expect(page.locator("#slider-tolerance_percent")).toHaveValue("0.5");
    await expect(page.locator("input[name='start_discharge_target']")).toHaveValue("90");

    // Slider updates the hidden value.
    await page.locator("#slider-tolerance_percent").fill("0.8");
    await expect(page.locator("#hidden-tolerance_percent")).toHaveValue("0.8");
  });

  test("files tab fetches the selected log file", async ({ page }) => {
    await mockFlaskApi(page);
    await page.goto("/SolarControlar/");
    await page.locator(".main-tabs .tab-btn[data-tab='files']").click();
    await expect(page.locator("#tab-files")).toHaveClass(/active/);

    await expect(page.locator("#log-file")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#log-file option")).toHaveCount(8);
    await page.locator("#log-file").selectOption("minute_poller");
    await page.locator(".log-controls button").click();
    await expect(page.locator("#log-output")).toContainText("mock log line 1");
  });

  test("config slider shows the saved value", async ({ page }) => {
    await mockFlaskApi(page);
    await page.goto("/SolarControlar/");
    await page.locator(".main-tabs .tab-btn[data-tab='config']").click();
    await expect(page.locator("#configSlider")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#configOutput")).toContainText("50%");
  });

  test("forecast run fetches output", async ({ page }) => {
    await mockFlaskApi(page);
    await page.goto("/SolarControlar/");
    await page.locator(".main-tabs .tab-btn[data-tab='forecast']").click();
    await page.locator("#btnRunForecast").click();
    await expect(page.locator("#forecastOutput")).toContainText("mock forecast output", { timeout: 10000 });
  });

  test("graph tab loads dates and renders chart", async ({ page }) => {
    await mockFlaskApi(page);
    await page.goto("/SolarControlar/");
    await page.locator(".main-tabs .tab-btn[data-tab='graph']").click();
    await expect(page.locator("#tab-graph")).toHaveClass(/active/);
    await expect(page.locator("#graph-date")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#graph-date option")).toHaveCount(2);
    await expect(page.locator("#graph-date")).toHaveValue("2026-09-15");
    await page.waitForTimeout(500);
  });

  test("settings page has theme, flask URL, auto-refresh, BMC, QR, FA credit", async ({ page }) => {
    await mockFlaskApi(page);
    await page.goto("/SolarControlar/");
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");

    await expect(page.locator("#themeSelector select")).toBeVisible();
    await expect(page.locator("#flaskUrlInput")).toBeVisible();
    await expect(page.locator("#flaskUrlInput")).toHaveValue("/solar");
    await expect(page.locator("#autoRefresh")).toBeVisible();
    await expect(page.locator("#shareQrCode img").first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#settingsPage smd-fontawesome-credit")).toBeVisible();

    // Theme persists in the solarcontrolar_ namespace.
    await page.locator("#themeSelector select").selectOption("brite");
    await expect.poll(async () => page.evaluate(() => localStorage.getItem("solarcontrolar_theme"))).toBe("brite");

    // Flask URL persists.
    await page.locator("#flaskUrlInput").fill("http://localhost:5000/solar");
    await expect.poll(async () => page.evaluate(() => localStorage.getItem("solarcontrolar_flaskUrl"))).toBe("http://localhost:5000/solar");

    // Auto-refresh persists + starts.
    await page.locator("#autoRefresh").click();
    await expect.poll(async () => page.evaluate(() => localStorage.getItem("solarcontrolar_autoRefresh"))).toBe("true");
  });

  test("settings Done closes the page", async ({ page }) => {
    await mockFlaskApi(page);
    await page.goto("/SolarControlar/");
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");
    await page.locator("#settingsPage").getByRole("button", { name: "Done" }).click();
    await expect(page.locator("#settingsPage")).not.toHaveAttribute("open", "");
  });
});