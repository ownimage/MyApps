// SolarControlar — Power tab: shows the latest power readings in a table.

function renderPowerTab() {
  var container = $id("tab-power");
  if (!container) return;

  if (!_solarMainData) {
    container.innerHTML = '<p class="text-secondary loading">Loading power data...</p>';
    return;
  }

  var d = _solarMainData;
  var batteryVal = (d.batteryLevel !== null && d.batteryLevel !== undefined)
    ? Math.round(d.batteryLevel) + "%"
    : "Unknown";

  container.innerHTML =
    '<table class="power-table">' +
      '<thead><tr><th>Field</th><th>Value</th></tr></thead>' +
      '<tbody>' +
        '<tr><td>Date</td><td>' + escapeHtml(d.date || "-") + '</td></tr>' +
        '<tr><td>Time</td><td>' + escapeHtml(d.time || "-") + '</td></tr>' +
        '<tr><td>Status</td><td>' + escapeHtml(d.status || "-") + '</td></tr>' +
        '<tr><td>Solar</td><td>' + (d.solar !== null ? d.solar + " W" : "-") + '</td></tr>' +
        '<tr><td>Grid</td><td>' + (d.grid !== null ? d.grid + " W" : "-") + '</td></tr>' +
        '<tr><td>Battery</td><td>' + (d.battery !== null ? d.battery + " W" : "-") + '</td></tr>' +
        '<tr><td>Home</td><td>' + (d.home !== null ? d.home + " W" : "-") + '</td></tr>' +
        '<tr><td>Battery Charge</td><td>' + batteryVal + '</td></tr>' +
      '</tbody>' +
    '</table>';
}
