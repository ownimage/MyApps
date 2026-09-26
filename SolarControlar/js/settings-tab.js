// SolarControlar — Settings page (General / Danger tabs). Theme, font size,
// Flask URL, auto-refresh, danger zone. Uses the shared smd-page + smd-tabs.

var _settingsSections = null;
var _settingsFooterHtml = null;
var _settingsCloseTimer = null;

function changeShowDanger(enabled) {
  setShowDanger(enabled);
  toggleDangerRows(enabled);
}

function toggleDangerRows(enabled) {
  ["refreshAppRow"].forEach(function (id) {
    var el = $id(id);
    if (el) el.classList.toggle("d-none", !enabled);
  });
}

function updateFlaskUrl(value) {
  setFlaskUrl(value);
}

function updateFlaskUser(value) {
  setFlaskUser(value);
}

function updateFlaskPass(value) {
  setFlaskPass(value);
}

function changeAutoRefresh(enabled) {
  setAutoRefresh(enabled);
  if (enabled) startAutoRefresh();
  else stopAutoRefresh();
}

function getSettingsSections() {
  if (_settingsSections) return { sections: _settingsSections, footerHtml: _settingsFooterHtml };
  var template = document.getElementById("settingsTemplate");
  if (!template) return { sections: [], footerHtml: "" };
  var clone = template.content.cloneNode(true);
  _settingsSections = Array.from(clone.querySelectorAll(".smd-settings-tab")).map(function (sec) {
    return {
      id: sec.dataset.tabId || null,
      title: sec.dataset.tab,
      content: sec.innerHTML
    };
  });
  var footer = clone.querySelector("#settingsFooter");
  _settingsFooterHtml = (footer ? footer.outerHTML : "").replace(
    'id="buildNumber"></span>',
    'id="buildNumber">' + (typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "") + '</span>'
  );
  template.remove();
  return { sections: _settingsSections, footerHtml: _settingsFooterHtml };
}

function buildSettingsContent() {
  var settingsPage = document.getElementById("settingsPage");
  if (!settingsPage) return;
  var parts = getSettingsSections();
  var sections = parts.sections;
  var footerHtml = parts.footerHtml;

  settingsPage.title = "Settings";
  settingsPage.content = '<smd-tabs id="settingsTabs" narrow></smd-tabs>' + footerHtml;
  settingsPage.buttons = [{ text: "OK", variant: "success", action: "done" }];

  var tabsEl = $id("settingsTabs");
  if (tabsEl) {
    tabsEl.tabs = sections;
    tabsEl.bottomline = true;
  }
  injectSettingsStyles();
}

function openSettings() {
  var page = document.getElementById("settingsPage");
  if (!page) return;
  if (_settingsCloseTimer) {
    clearTimeout(_settingsCloseTimer);
    _settingsCloseTimer = null;
  }
  page.classList.remove("d-none");
  if (!page.__bound) {
    page.__bound = true;
    page.addEventListener("smd-page-action", function (e) {
      var action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "done") closeSettings();
    });
  }
  buildSettingsContent();
  page.show();

  // Theme selector
  var savedTheme = getStoredTheme();
  var savedThemeMode = getStoredThemeMode();
  var themeSel = $id("themeSelector");
  if (themeSel) {
    themeSel.setAttribute("theme", savedTheme);
    themeSel.setAttribute("mode", savedThemeMode);
  }

  // Font size
  var savedFontSize = localStorage.getItem(smdKey("fontSize")) || "normal";
  var fontSizeSel = $id("fontSizeSelector");
  if (fontSizeSel) fontSizeSel.value = savedFontSize;

  // Flask URL
  var flaskUrlInput = $id("flaskUrlInput");
  if (flaskUrlInput) flaskUrlInput.value = getFlaskUrl();

  // Flask basic-auth credentials
  var flaskUserInput = $id("flaskUserInput");
  if (flaskUserInput) flaskUserInput.value = getFlaskUser();
  var flaskPassInput = $id("flaskPassInput");
  if (flaskPassInput) flaskPassInput.value = getFlaskPass();

  // Auto refresh
  var autoRefreshCb = $id("autoRefresh");
  if (autoRefreshCb) autoRefreshCb.checked = isAutoRefresh();

  // Show danger
  var showDangerCb = $id("showDanger");
  if (showDangerCb) showDangerCb.checked = isShowDanger();
  toggleDangerRows(isShowDanger());
}

function closeSettings() {
  var page = document.getElementById("settingsPage");
  if (page) {
    page.hide();
    if (_settingsCloseTimer) clearTimeout(_settingsCloseTimer);
    _settingsCloseTimer = setTimeout(function () {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
}
