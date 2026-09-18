// CountMyDays — the settings page (General / G Cal / Danger tabs) plus the
// app-specific settings handlers. Generic appearance settings (theme, font
// size, icon size, density, auto-hide) live in shared/js/smd-settings.js.

let _cmdSettingsSections = null;
let _cmdSettingsFooterHtml = null;
let _cmdSettingsCloseTimer = null;

function changeFormat(value) {
  localStorage.setItem(smdKey("countdownFormat"), value);
}

// -------------------------------
// GOOGLE CALENDAR SETTINGS
// -------------------------------

function changeGCalEnabled(enabled) {
  localStorage.setItem(smdKey("gcal_enabled"), enabled);
  setGCalVisible(enabled);
}

function saveGCalSettings() {
  const nameInput = $id("gcalName");
  const clientIdInput = $id("gcalClientId");
  const calIdInput = $id("gcalCalendarId");
  if (nameInput) localStorage.setItem(smdKey("gcal_name"), nameInput.value.trim());
  if (clientIdInput) localStorage.setItem(smdKey("gcal_client_id"), clientIdInput.value.trim());
  if (calIdInput) localStorage.setItem(smdKey("gcal_calendar_id"), calIdInput.value.trim() || "primary");
}

function setGCalVisible(enabled) {
  const options = $id("gcalOptions");
  if (options) options.classList.toggle("d-none", !enabled);
  document.querySelectorAll(".google-menu-item").forEach(el => {
    el.style.display = enabled ? "" : "none";
  });
}

function changeMaxCountdowns(value) {
  localStorage.setItem(smdKey("maxCountdowns"), value);
}

function changeShowDanger(enabled) {
  localStorage.setItem(smdKey("showDanger"), enabled);
  toggleDangerRows(enabled);
}

function toggleDangerRows(enabled) {
  ["gcalDangerRow", "clearAllDataRow", "refreshAppRow"].forEach(id => {
    const el = $id(id);
    if (el) el.classList.toggle("d-none", !enabled);
  });
}

// Icon size setting -> the shared <smd-image> render size (px). CountMyDays
// uses the same six sizes as every other app (32/40/50/64/80/100); narrow
// screens cap the size (the original app shrank its thumbnails in a
// max-width:480px media query).
function applyImageSize() {
  const value = localStorage.getItem(smdKey("iconSize")) || "medium";
  let px = { xsmall: 32, small: 40, medium: 50, large: 64, xlarge: 80, jumbo: 100 }[value] || 50;
  if (window.innerWidth <= 480) px = Math.min(px, 64);
  if (typeof SmdImage !== "undefined" && SmdImage.setDefaultSize) {
    SmdImage.setDefaultSize(px);
  }
}

function getSettingsSections() {
  if (_cmdSettingsSections) return { sections: _cmdSettingsSections, footerHtml: _cmdSettingsFooterHtml };
  const template = document.getElementById("settingsTemplate");
  if (!template) return { sections: [], footerHtml: "" };
  const clone = template.content.cloneNode(true);
  _cmdSettingsSections = Array.from(clone.querySelectorAll(".smd-settings-tab")).map(sec => ({
    id: sec.dataset.tabId || null,
    title: sec.dataset.tab,
    content: sec.innerHTML
  }));
  const footer = clone.querySelector("#settingsFooter");
  _cmdSettingsFooterHtml = (footer ? footer.outerHTML : "").replace(
    'id="buildNumber"></span>',
    'id="buildNumber">' + (typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "") + '</span>'
  );
  template.remove();
  return { sections: _cmdSettingsSections, footerHtml: _cmdSettingsFooterHtml };
}

function buildSettingsContent() {
  const settingsPage = document.getElementById("settingsPage");
  if (!settingsPage) return;
  const { sections, footerHtml } = getSettingsSections();

  settingsPage.title = "Settings";
  settingsPage.content = '<smd-tabs id="settingsTabs"></smd-tabs>' + footerHtml;
  settingsPage.buttons = [{ text: "Done", variant: "success", action: "done" }];

  const tabsEl = $id("settingsTabs");
  if (tabsEl) {
    tabsEl.tabs = sections;
    tabsEl.bottomline = true;
  }
  injectSettingsStyles();
}

function openSettings() {
  hideMainPages("settingsPage");
  const page = document.getElementById("settingsPage");
  if (!page) return;
  if (_cmdSettingsCloseTimer) {
    clearTimeout(_cmdSettingsCloseTimer);
    _cmdSettingsCloseTimer = null;
  }
  page.classList.remove("d-none");
  if (!page.__cmdBound) {
    page.__cmdBound = true;
    page.addEventListener("smd-page-action", e => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "done") closeSettings();
    });
  }
  buildSettingsContent();
  page.show();

  const savedTheme = localStorage.getItem(smdKey("theme")) || "superhero";
  const themeSel = $id("themeSelector");
  if (themeSel) themeSel.setAttribute("theme", savedTheme);

  const savedFormat = localStorage.getItem(smdKey("countdownFormat")) || "days";
  const formatSel = $id("formatSelector");
  if (formatSel) formatSel.value = savedFormat;

  const savedFontSize = localStorage.getItem(smdKey("fontSize")) || "xlarge";
  const fontSizeSel = $id("fontSizeSelector");
  if (fontSizeSel) fontSizeSel.value = savedFontSize;

  const autoHide = localStorage.getItem(smdKey("autoHideMenu")) === "true";
  const autoHideCb = $id("autoHideMenu");
  if (autoHideCb) autoHideCb.checked = autoHide;

  const savedIconSize = localStorage.getItem(smdKey("iconSize")) || "medium";
  const iconSel = $id("iconSizeSelector");
  if (iconSel) iconSel.value = savedIconSize;

  const savedDensity = localStorage.getItem(smdKey("density")) || "normal";
  const densitySel = $id("densitySelector");
  if (densitySel) densitySel.value = savedDensity;

  const savedMax = localStorage.getItem(smdKey("maxCountdowns")) || "10";
  const maxSel = $id("maxCountdownsSelector");
  if (maxSel) maxSel.value = savedMax;

  const showDanger = localStorage.getItem(smdKey("showDanger")) === "true";
  const showDangerCb = $id("showDanger");
  if (showDangerCb) showDangerCb.checked = showDanger;
  toggleDangerRows(showDanger);

  // Google Calendar settings
  const gcalName = $id("gcalName");
  if (gcalName) gcalName.value = localStorage.getItem(smdKey("gcal_name")) || "";

  const gcalClientId = $id("gcalClientId");
  if (gcalClientId) gcalClientId.value = localStorage.getItem(smdKey("gcal_client_id")) || "";

  const gcalCalId = $id("gcalCalendarId");
  if (gcalCalId) gcalCalId.value = localStorage.getItem(smdKey("gcal_calendar_id")) || "primary";

  const gcalEnabled = isGCalEnabled();
  const gcalEnabledCb = $id("gcalEnabled");
  if (gcalEnabledCb) gcalEnabledCb.checked = gcalEnabled;
  setGCalVisible(gcalEnabled);
}

function closeSettings() {
  const page = document.getElementById("settingsPage");
  if (page) {
    page.hide();
    if (_cmdSettingsCloseTimer) clearTimeout(_cmdSettingsCloseTimer);
    _cmdSettingsCloseTimer = setTimeout(() => {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
  document.getElementById("countdownContainer").classList.remove("d-none");
  resetShowAll();
  renderMain();
}

function confirmClearAllData() {
  showSmdModal({
    title: "Clear All Data?",
    content: "Clear ALL Count My Days data? This cannot be undone.",
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Clear", variant: "danger", action: "clear" }
    ],
    onAction: function (detail) {
      if (detail.action !== "clear") return;
      const prefix = SmdConfig.storagePrefix;
      Object.keys(localStorage).forEach(key => {
        if (key.indexOf(prefix) === 0) localStorage.removeItem(key);
      });
      closeSettings();
    }
  });
}
