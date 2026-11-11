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

module.exports = { mockFlaskApi };
