// SolarControlar — Power tab: shows the latest power readings in a table.

function renderPowerTab() {
  var container = $id("tab-power");
  if (!container) return;

  if (!_solarMainData) {
    container.innerHTML = '<p class="loading text-secondary fst-italic mb-0">Loading power data...</p>';
    return;
  }

  var d = _solarMainData;
  var batteryVal = (d.batteryLevel !== null && d.batteryLevel !== undefined)
    ? Math.round(d.batteryLevel) + "%"
    : "Unknown";

  container.innerHTML =
    '<div class="table-responsive">' +
      '<table class="table table-striped table-hover align-middle w-100 power-table mb-3">' +
        '<thead><tr><th scope="col">Field</th><th scope="col">Value</th></tr></thead>' +
        '<tbody>' +
          '<tr><td class="fw-semibold">Date</td><td class="text-primary">' + escapeHtml(d.date || "-") + '</td></tr>' +
          '<tr><td class="fw-semibold">Time</td><td class="text-primary">' + escapeHtml(d.time || "-") + '</td></tr>' +
          '<tr><td class="fw-semibold">Status</td><td class="text-primary">' + escapeHtml(d.status || "-") + '</td></tr>' +
          '<tr><td class="fw-semibold">Solar</td><td class="text-primary">' + (d.solar !== null ? d.solar + " W" : "-") + '</td></tr>' +
          '<tr><td class="fw-semibold">Grid</td><td class="text-primary">' + (d.grid !== null ? d.grid + " W" : "-") + '</td></tr>' +
          '<tr><td class="fw-semibold">Battery</td><td class="text-primary">' + (d.battery !== null ? d.battery + " W" : "-") + '</td></tr>' +
          '<tr><td class="fw-semibold">Home</td><td class="text-primary">' + (d.home !== null ? d.home + " W" : "-") + '</td></tr>' +
          '<tr><td class="fw-semibold">Battery Charge</td><td class="text-primary">' + batteryVal + '</td></tr>' +
        '</tbody>' +
      '</table>' +
    '</div>';
}
