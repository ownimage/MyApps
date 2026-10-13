// SolarControlar — Graph tab: Chart.js time-series graph of power data.
// Mirrors the Flask app's "Graph" tab with date selector and series checkboxes.

var _graphInitialized = false;
var _powerChart = null;

// Series palette: the THEME variables (resolved at draw time by
// resolveSeriesColor - Chart.js needs a concrete colour, not a var()).
var SOLAR_SERIES = {
  solar:         { label: "Solar",         color: "--bs-warning", axis: "power" },
  grid:          { label: "Grid",          color: "--bs-info",    axis: "power" },
  home:          { label: "Home",          color: "--bs-success", axis: "power" },
  battery:       { label: "Battery",       color: "--bs-purple",  axis: "power" },
  battery_level: { label: "Battery Level", color: "--bs-danger",  axis: "soc" }
};

function resolveSeriesColor(name) {
  if (typeof name !== "string" || name.charAt(0) !== "-") return name;
  var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || name;
}

// Re-read the theme palette for the drawn chart (the base theme sheet loads
// asynchronously, so this is also bound to its `load`).
function refreshGraphColors() {
  if (!_powerChart) return;
  var keys = Object.keys(SOLAR_SERIES);
  _powerChart.data.datasets.forEach(function (ds, i) {
    var c = resolveSeriesColor(SOLAR_SERIES[keys[i]].color);
    ds.borderColor = c;
    ds.backgroundColor = c;
  });
  _powerChart.update();
}

function initGraphTab() {
  if (_graphInitialized) return;
  _graphInitialized = true;
  renderGraphTab();
  var base = document.getElementById("bootstrap-theme-css");
  if (base) base.addEventListener("load", refreshGraphColors);
  document.addEventListener("smd-theme-change", refreshGraphColors);
}

function renderGraphTab() {
  var container = $id("tab-graph");
  if (!container) return;

  container.innerHTML =
    '<div class="graph-controls d-flex flex-wrap align-items-center gap-3 mb-3">' +
      '<label class="form-label mb-0" for="graph-date">Day:</label>' +
      '<smd-select id="graph-date" class="form-select w-auto log-select" onchange="loadGraphData()">' +
        '<option value="">Select a day</option>' +
      '</smd-select>' +
      '<div class="graph-checkboxes d-flex flex-wrap align-items-center gap-3">' +
        '<label class="form-check-label d-inline-flex align-items-center gap-1"><input type="checkbox" class="form-check-input graph-series" value="solar" checked onchange="loadGraphData()"> Solar</label>' +
        '<label class="form-check-label d-inline-flex align-items-center gap-1"><input type="checkbox" class="form-check-input graph-series" value="grid" checked onchange="loadGraphData()"> Grid</label>' +
        '<label class="form-check-label d-inline-flex align-items-center gap-1"><input type="checkbox" class="form-check-input graph-series" value="home" checked onchange="loadGraphData()"> Home</label>' +
        '<label class="form-check-label d-inline-flex align-items-center gap-1"><input type="checkbox" class="form-check-input graph-series" value="battery" checked onchange="loadGraphData()"> Battery</label>' +
        '<label class="form-check-label d-inline-flex align-items-center gap-1"><input type="checkbox" class="form-check-input graph-series" value="battery_level" checked onchange="loadGraphData()"> Battery Level</label>' +
      '</div>' +
      '<label class="form-check-label d-inline-flex align-items-center gap-1"><input type="checkbox" class="form-check-input" id="graph-points" onchange="loadGraphData()"> Data Points</label>' +
    '</div>' +
    '<div class="graph-wrap bg-body-tertiary border rounded p-3 position-relative">' +
      '<canvas id="powerChart" class="w-100"></canvas>' +
      '<p id="graph-empty" class="loading text-secondary fst-italic d-none mb-0">No power data available for this day.</p>' +
    '</div>';

  loadGraphDates();
}

function loadGraphDates() {
  var select = $id("graph-date");
  if (!select) return;

  solarApi.getPowerDates()
    .then(function (data) {
      var dates = data.dates || [];
      if (!dates.length) {
        select.options = [{ value: "", label: "No data available" }];
        return;
      }
      select.options = dates.map(function (d) { return { value: d, label: d }; });
      select.value = dates[0];
      loadGraphData();
    })
    .catch(function () {
      select.options = [{ value: "", label: "Error loading dates" }];
    });
}

function loadGraphData() {
  var date = $id("graph-date");
  var empty = $id("graph-empty");
  if (!date || !date.value) return;

  var dateVal = date.value;

  solarApi.getPowerData(dateVal)
    .then(function (data) {
      var times = data.times || [];
      var hasData = times.length > 0;
      if (empty) empty.classList.toggle("d-none", hasData);

      var timestamps = times.map(function (t) {
        return new Date(dateVal + "T" + t);
      });

      var seriesData = {};
      Object.keys(SOLAR_SERIES).forEach(function (key) {
        var values = data[key] || [];
        seriesData[key] = timestamps.map(function (ts, i) {
          var v = values[i];
          return { x: ts, y: (v === null || v === undefined) ? null : v };
        });
      });

var visible = {};
  var graphTab = $id("tab-graph");
  if (graphTab) {
    graphTab.querySelectorAll(".graph-series").forEach(function (cb) {
      visible[cb.value] = cb.checked;
    });
  }

      renderGraph(timestamps, seriesData, visible, dateVal);
    })
    .catch(function () {
      if (empty) {
        empty.classList.remove("d-none");
        empty.textContent = "Error loading data";
      }
    });
}

function renderGraph(timestamps, seriesData, visible, date) {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js not loaded");
    return;
  }

  var ctx = $id("powerChart");
  if (!ctx) return;

  var showPoints = $id("graph-points");
  var showPts = showPoints ? showPoints.checked : false;

  var datasets = [];
  Object.keys(SOLAR_SERIES).forEach(function (key) {
    datasets.push({
      label: SOLAR_SERIES[key].label,
      data: seriesData[key],
      borderColor: resolveSeriesColor(SOLAR_SERIES[key].color),
      backgroundColor: resolveSeriesColor(SOLAR_SERIES[key].color),
      borderWidth: 2,
      pointRadius: showPts ? 2 : 0,
      pointHoverRadius: showPts ? 2 : 0,
      spanGaps: false,
      tension: 0.3,
      yAxisID: SOLAR_SERIES[key].axis === "soc" ? "ySoc" : "yPower",
      hidden: !visible[key]
    });
  });

  if (_powerChart) {
    _powerChart.destroy();
  }

  _powerChart = new Chart(ctx.getContext("2d"), {
    type: "line",
    data: { datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          type: "time",
          min: new Date(date + "T00:00:00"),
          max: new Date(date + "T23:59:59"),
          time: { unit: "hour", stepSize: 1 },
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            callback: function (value) {
              var d = new Date(value);
              return d.getHours() % 3 === 0 ? String(d.getHours()).padStart(2, "0") : "";
            }
          },
          grid: {
            color: function (ctx) {
              var d = new Date(ctx.tick.value);
              return d.getHours() % 3 === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)";
            },
            lineWidth: function (ctx) {
              var d = new Date(ctx.tick.value);
              return d.getHours() % 3 === 0 ? 2 : 1;
            }
          }
        },
        yPower: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          ticks: {
            stepSize: 1000,
            callback: function (value) { return value + " W"; }
          },
          title: { display: true, text: "Power (W)" },
          grid: { color: "rgba(255,255,255,0.08)" }
        },
        ySoc: {
          type: "linear",
          position: "right",
          min: 0,
          max: 100,
          title: { display: true, text: "Battery Level (%)" },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}
