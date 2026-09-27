// SolarControlar — Forecast tab: run the forecast pipeline and display output.

var _forecastOutput = null;

function renderForecastTab() {
  var container = $id("tab-forecast");
  if (!container) return;

  container.innerHTML =
    '<div class="mt-2">' +
      '<p>Run the forecast pipeline: fetch the solar forecast, compare it with recent actuals ' +
      'to update the solar forecast multiplier, and recompute the battery charge target. ' +
      'This may take up to a few minutes.</p>' +
      '<div class="mt-3">' +
        '<button type="button" class="btn btn-primary" id="btnRunForecast" onclick="runForecast()">Run Forecast Pipeline</button>' +
      '</div>' +
    '</div>' +
    '<div id="forecastOutput" class="forecast-output bg-body-tertiary border rounded p-3 font-monospace overflow-auto mt-3 d-none"></div>' +
    '<div id="forecastLoading" class="loading text-secondary fst-italic mt-3 d-none">Forecast pipeline is running...</div>';

  if (_forecastOutput) {
    var outputEl = $id("forecastOutput");
    if (outputEl) {
      outputEl.textContent = _forecastOutput;
      outputEl.classList.remove("d-none");
    }
  }
}

function runForecast() {
  var btn = $id("btnRunForecast");
  var loading = $id("forecastLoading");
  var output = $id("forecastOutput");

  if (btn) btn.disabled = true;
  if (loading) loading.classList.remove("d-none");
  if (output) output.classList.add("d-none");

  solarApi.runForecast()
    .then(function (text) {
      _forecastOutput = text;
      if (loading) loading.classList.add("d-none");
      if (output) {
        output.textContent = text;
        output.classList.remove("d-none");
      }
      if (btn) btn.disabled = false;
      showFlash("Forecast pipeline completed.", "success");
    })
    .catch(function (err) {
      _forecastOutput = "Error: " + err.message;
      if (loading) loading.classList.add("d-none");
      if (output) {
        output.textContent = _forecastOutput;
        output.classList.remove("d-none");
      }
      if (btn) btn.disabled = false;
      showFlash("Error running forecast: " + err.message, "error");
    });
}
