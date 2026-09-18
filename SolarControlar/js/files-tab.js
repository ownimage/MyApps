// SolarControlar — Files tab: view log files and JSON state files from the
// Flask server. Mirrors the Flask app's "Files" tab.

var SOLAR_FILES = [
  { value: "config_apply", label: "config_apply.log" },
  { value: "minute_poller", label: "minute_poller.log" },
  { value: "forecast_pipeline", label: "forecast_pipeline.log" },
  { value: "minute_poller_state", label: "minute_poller_state.json" },
  { value: "minute_power", label: "minute_power.json" },
  { value: "minute_totals", label: "minute_totals.json" },
  { value: "solar_actuals", label: "solar_actuals.json" },
  { value: "usage_actuals", label: "usage_actuals.json" }
];

function renderFilesTab() {
  var container = $id("tab-files");
  if (!container) return;

  var options = SOLAR_FILES.map(function (f) {
    return '<option value="' + f.value + '">' + f.label + '</option>';
  }).join("");

  container.innerHTML =
    '<div class="log-controls">' +
      '<label for="log-file">Log File:</label>' +
      '<select id="log-file" class="log-select">' + options + '</select>' +
      '<label for="line-count">Lines:</label>' +
      '<input type="number" id="line-count" class="log-input" min="1" max="10000" value="200">' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="fetchLogs()">Fetch</button>' +
    '</div>' +
    '<div id="log-output" class="log-output">Click Fetch to load logs</div>';
}

function fetchLogs() {
  var fileEl = $id("log-file");
  var countEl = $id("line-count");
  var output = $id("log-output");
  if (!fileEl || !output) return;

  var file = fileEl.value;
  var count = countEl ? countEl.value || 200 : 200;

  output.textContent = "Loading...";
  output.classList.add("loading");

  solarApi.getFiles(file, count)
    .then(function (text) {
      output.textContent = text;
      output.classList.remove("loading");
    })
    .catch(function (err) {
      output.textContent = "Error: " + err.message;
      output.classList.remove("loading");
    });
}
