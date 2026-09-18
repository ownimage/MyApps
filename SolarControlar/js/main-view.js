// SolarControlar — main view: orchestrates the top tiles and the main tab
// content. Fetches initial power data and updates the tiles.

var _solarMainData = null;
var _autoRefreshTimer = null;
var _lastRefreshErrorShown = "";

// Main dashboard tabs, rendered by the shared <smd-tabs> component (which owns
// the panels in its shadow root). Each panel wraps a light-DOM-style content
// div so the per-tab render functions and existing locators keep working.
var MAIN_TAB_DEFS = [
  { title: "Power", id: "power", content: '<div id="tab-power" class="tab-content"></div>' },
  { title: "Settings", id: "settings", content: '<div id="tab-settings" class="tab-content"></div>' },
  { title: "Files", id: "files", content: '<div id="tab-files" class="tab-content"></div>' },
  { title: "Config", id: "config", content: '<div id="tab-config" class="tab-content"></div>' },
  { title: "Forecast", id: "forecast", content: '<div id="tab-forecast" class="tab-content"></div>' },
  { title: "Graph", id: "graph", content: '<div id="tab-graph" class="tab-content"></div>' }
];

function configureMainTabs() {
  var tabsEl = document.getElementById("mainTabs");
  if (!tabsEl || tabsEl.__solarTabsConfigured) return;
  tabsEl.__solarTabsConfigured = true;

  // Setting .tabs re-renders the shadow tree, so do it exactly once. Panel
  // visibility afterwards is driven by activeIndex (no DOM overwrite).
  tabsEl.tabs = MAIN_TAB_DEFS.map(function (t) {
    return { title: t.title, id: t.id, content: t.content };
  });

  // Panel content lives in a shadow root: adopt the form/btn utilities plus the
  // main-tab content styles so Bootstrap's document stylesheet is not needed.
  injectStyleInto(tabsEl.shadowRoot, JOBS_EDITOR_STYLES + MAIN_TAB_STYLES);

  tabsEl.addEventListener("smd-tabs-change", function (e) {
    var tab = e.detail && e.detail.tab;
    if (tab && tab.id) switchMainTab(tab.id);
  });
}

function renderMain() {
  configureMainTabs();
  loadPowerDataForTiles();
  renderPowerTab();
  renderSolarSettingsTab();
  renderFilesTab();
  renderConfigTab();
  renderForecastTab();
}

function showRefreshErrorModal(err) {
  var detail = (err && err.serverMessage) ? err.serverMessage : (err && err.message ? err.message : String(err));
  // Don't re-pop the same error modal on every auto-refresh tick.
  if (detail === _lastRefreshErrorShown) return;
  _lastRefreshErrorShown = detail;

  showSmdModal({
    title: "Failed to refresh data",
    content: '<div class="flash flash-error" style="white-space:pre-wrap;margin-bottom:0;">' +
              escapeHtml(detail) + '</div>',
    buttons: [
      { text: "OK", variant: "primary", action: "ok" }
    ]
  });
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
      showRefreshErrorModal(err);
    });
}

function switchMainTab(tabName) {
  var tabsEl = document.getElementById("mainTabs");
  if (!tabsEl) return;
  for (var i = 0; i < MAIN_TAB_DEFS.length; i++) {
    if (MAIN_TAB_DEFS[i].id === tabName) {
      tabsEl.activeIndex = i;
      break;
    }
  }

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
