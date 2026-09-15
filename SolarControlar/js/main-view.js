// SolarControlar — main view: orchestrates the top tiles and the main tab
// content. Fetches initial power data and updates the tiles.

var _solarMainData = null;
var _autoRefreshTimer = null;

function renderMain() {
  loadPowerDataForTiles();
  renderPowerTab();
  renderSolarSettingsTab();
  renderFilesTab();
  renderConfigTab();
  renderForecastTab();
}

function loadPowerDataForTiles() {
  solarApi.getPowerDates()
    .then(function (data) {
      var dates = data.dates || [];
      if (dates.length === 0) {
        document.getElementById("topTiles").setAttribute("no-data", "");
        return;
      }
      return solarApi.getPowerData(dates[0]);
    })
    .then(function (dayData) {
      if (!dayData || !dayData.times || dayData.times.length === 0) return;
      var times = dayData.times;
      var lastIdx = times.length - 1;
      var lastTime = times[lastIdx];
      var batteryLevel = dayData.battery_level ? dayData.battery_level[lastIdx] : null;

      var tiles = document.getElementById("topTiles");
      tiles.setAttribute("power-date", dayData.date || "");
      tiles.setAttribute("power-time", lastTime || "");
      if (batteryLevel !== null && batteryLevel !== undefined) {
        tiles.setAttribute("battery-level", String(batteryLevel));
      }

      _solarMainData = {
        date: dayData.date,
        time: lastTime,
        solar: dayData.solar ? dayData.solar[lastIdx] : null,
        grid: dayData.grid ? dayData.grid[lastIdx] : null,
        home: dayData.home ? dayData.home[lastIdx] : null,
        battery: dayData.battery ? dayData.battery[lastIdx] : null,
        batteryLevel: batteryLevel,
        status: "ok"
      };
      renderPowerTab();
    })
    .catch(function (err) {
      console.warn("Failed to load power data:", err);
      document.getElementById("topTiles").setAttribute("no-data", "");
    });
}

function switchMainTab(tabName) {
  document.querySelectorAll(".tab-content").forEach(function (el) { el.classList.remove("active"); });
  document.querySelectorAll(".main-tabs .tab-btn").forEach(function (el) { el.classList.remove("active"); });
  var tabEl = document.getElementById("tab-" + tabName);
  if (tabEl) tabEl.classList.add("active");
  var btn = document.querySelector('.main-tabs .tab-btn[data-tab="' + tabName + '"]');
  if (btn) btn.classList.add("active");

  // Lazy-load graph when switching to graph tab
  if (tabName === "graph" && typeof initGraphTab === "function") {
    initGraphTab();
  }
}

function refreshData() {
  showFlash("Refreshing data...", "info");
  loadPowerDataForTiles();
  renderPowerTab();
}

function showFlash(message, category) {
  var container = document.getElementById("flashContainer");
  if (!container) return;
  var div = document.createElement("div");
  div.className = "flash flash-" + (category || "info");
  div.textContent = message;
  container.appendChild(div);
  setTimeout(function () {
    if (div.parentNode) div.parentNode.removeChild(div);
  }, 5000);
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (isAutoRefresh()) {
    _autoRefreshTimer = setInterval(function () {
      loadPowerDataForTiles();
      renderPowerTab();
    }, 60000);
  }
}

function stopAutoRefresh() {
  if (_autoRefreshTimer) {
    clearInterval(_autoRefreshTimer);
    _autoRefreshTimer = null;
  }
}
