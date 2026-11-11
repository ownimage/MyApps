// SolarControlar — Graph tab: Chart.js time-series graph of power data.
// Mirrors the Flask app's "Graph" tab with date selector and series checkboxes.

var _graphInitialized = false;
var _powerChart = null;

// Series palette: the THEME variables (resolved at draw time by
// resolveSeriesColor - Chart.js needs a concrete colour, not a var()).
var SOLAR_SERIES = {
  solar:         { label: "Solar",         color: "--solar-series-solar", axis: "power" },
  grid:          { label: "Grid",          color: "--solar-series-grid",    axis: "power" },
  home:          { label: "Home",          color: "--solar-series-home", axis: "power" },
  battery:       { label: "Battery",       color: "--solar-series-battery",  axis: "power" },
  battery_level: { label: "Battery Level", color: "--solar-series-battery-level",  axis: "soc" }
};

function resolveSeriesColor(name) {
  if (typeof name !== "string" || name.charAt(0) !== "-") return name;
  var v = getComputedStyle(document.getElementById("tab-graph") || document.body).getPropertyValue(name).trim();
  return v || name;
}

// Both daily charts use wall-clock minutes so every day spans 00:00 to 24:00,
// including partial days and daylight-saving transitions in local history.
function solarTimeLabel(minutes) {
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(Math.floor(minutes % 60)).padStart(2, '0');
}
function solarDayGridColor(context) {
  var color = resolveSeriesColor('--bs-border-color');
  return context.tick && context.tick.value % 60 !== 0
    ? Chart.helpers.color(color).alpha(0.35).rgbString() : color;
}
function solarDayAxis() {
  return {
    type: 'linear', min: 0, max: 1440,
    ticks: {
      stepSize: 30, autoSkip: false, maxRotation: 90,
      color: resolveSeriesColor('--bs-body-color'),
      callback: function (value) { return value % 60 === 0 ? solarTimeLabel(value) : ''; }
    },
    grid: { color: solarDayGridColor },
    title: { display: true, text: 'Time', color: resolveSeriesColor('--bs-body-color') }
  };
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
  var ink = resolveSeriesColor("--bs-body-color");
  _powerChart.options.color = ink;
  _powerChart.options.plugins.legend.labels.color = ink;
  Object.keys(_powerChart.options.scales).forEach(function (key) {
    var scale = _powerChart.options.scales[key];
    scale.ticks.color = ink;
    if (scale.title) scale.title.color = ink;
    scale.grid.color = key === "x" ? solarDayGridColor : resolveSeriesColor("--bs-border-color");
  });
  _powerChart.update("none");
}

function initGraphTab() {
  if (_graphInitialized) return;
  _graphInitialized = true;
  renderGraphTab();
  ["bootstrap-theme-css", "theme-override-mode", "theme-override-specific"].forEach(function (id) {
    var sheet = document.getElementById(id);
    if (sheet) sheet.addEventListener("load", refreshGraphColors);
  });
  // Mode attributes change before the asynchronous override sheets load.
  new MutationObserver(refreshGraphColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-bs-theme", "data-theme"] });
  document.addEventListener("smd-theme-change", refreshGraphColors);
}

function renderGraphTab() {
  var container = $id("tab-graph");
  if (!container) return;

  container.innerHTML =
    '<div class="graph-controls d-flex flex-wrap align-items-center gap-3 mb-3">' +
      '<label class="form-label mb-0" for="graph-date">Day:</label>' +
      '<smd-select id="graph-date" class="w-auto log-select" onchange="loadGraphData()">' +
        '<option value="">Select a day</option>' +
      '</smd-select>' +
      '<div class="graph-checkboxes d-flex flex-wrap align-items-center gap-3">' +
        '<smd-checkbox class="graph-series" value="solar" checked onchange="if (!event.detail) loadGraphData()">Solar</smd-checkbox>' +
        '<smd-checkbox class="graph-series" value="grid" checked onchange="if (!event.detail) loadGraphData()">Grid</smd-checkbox>' +
        '<smd-checkbox class="graph-series" value="home" checked onchange="if (!event.detail) loadGraphData()">Home</smd-checkbox>' +
        '<smd-checkbox class="graph-series" value="battery" checked onchange="if (!event.detail) loadGraphData()">Battery</smd-checkbox>' +
        '<smd-checkbox class="graph-series" value="battery_level" checked onchange="if (!event.detail) loadGraphData()">Battery Level</smd-checkbox>' +
      '</div>' +
      '<smd-checkbox id="graph-points" onchange="if (!event.detail) loadGraphData()">Data Points</smd-checkbox>' +
    '</div>' +
    '<div class="graph-wrap bg-body border rounded p-3 position-relative">' +
      '<canvas id="powerChart" class="w-100"></canvas>' +
      '<p id="graph-empty" class="loading text-body fst-italic d-none mb-0">No power data available for this day.</p>' +
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

      var minutes = times.map(function (t) {
        var parts = t.split(':');
        return Number(parts[0]) * 60 + Number(parts[1]) + Number(parts[2] || 0) / 60;
      });

      var seriesData = {};
      Object.keys(SOLAR_SERIES).forEach(function (key) {
        var values = data[key] || [];
        seriesData[key] = minutes.map(function (minute, i) {
          var v = values[i];
          return { x: minute, y: (v === null || v === undefined) ? null : v };
        });
      });

var visible = {};
  var graphTab = $id("tab-graph");
  if (graphTab) {
    graphTab.querySelectorAll(".graph-series").forEach(function (cb) {
      visible[cb.value] = cb.checked;
    });
  }

      renderGraph(seriesData, visible);
    })
    .catch(function () {
      if (empty) {
        empty.classList.remove("d-none");
        empty.textContent = "Error loading data";
      }
    });
}

function renderGraph(seriesData, visible) {
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
      tension: 0,
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
      color: resolveSeriesColor("--bs-body-color"),
      plugins: {
        legend: { labels: { color: resolveSeriesColor("--bs-body-color") } },
        tooltip: { callbacks: { title: function (items) { return items.length ? solarTimeLabel(items[0].parsed.x) : ''; } } }
      },
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: solarDayAxis(),
        yPower: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          ticks: {
            color: resolveSeriesColor("--bs-body-color"),
            stepSize: 1000,
            callback: function (value) { return value + " W"; }
          },
          title: { color: resolveSeriesColor("--bs-body-color"), display: true, text: "Power (W)" },
          grid: { color: resolveSeriesColor("--bs-border-color") }
        },
        ySoc: {
          type: "linear",
          position: "right",
          min: 0,
          max: 100,
          ticks: { color: resolveSeriesColor("--bs-body-color") },
          title: { color: resolveSeriesColor("--bs-body-color"), display: true, text: "Battery Level (%)" },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}
