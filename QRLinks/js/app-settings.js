// QRLinks — the settings page (General / Danger tabs) plus the app-specific
// settings handlers. Generic appearance settings (theme, font size, icon size,
// density, auto-hide) live in shared/js/smd-settings.js.

let _settingsSections = null;
let _settingsFooterHtml = null;
let _settingsCloseTimer = null;

function changeShowDanger(enabled) {
  localStorage.setItem(smdKey("showDanger"), enabled);
  toggleDangerRows(enabled);
}

function toggleDangerRows(enabled) {
  ["loadSampleLinksRow", "uploadStandardImagesRow", "clearAllDataRow", "refreshAppRow"].forEach(id => {
    const el = $id(id);
    if (el) el.classList.toggle("d-none", !enabled);
  });
}

// Icon size setting -> the shared <smd-image> render size (px), wired as a
// VALUE; narrow screens cap the size.
function applyImageSize() {
  const value = localStorage.getItem(smdKey("iconSize")) || "medium";
  let px = { xsmall: 32, small: 40, medium: 50, large: 64, xlarge: 80, jumbo: 100 }[value] || 50;
  if (window.innerWidth <= 480) px = Math.min(px, 64);
  if (typeof SmdImage !== "undefined" && SmdImage.setDefaultSize) {
    SmdImage.setDefaultSize(px);
  }
}

function getSettingsSections() {
  if (_settingsSections) return { sections: _settingsSections, footerHtml: _settingsFooterHtml };
  const template = document.getElementById("settingsTemplate");
  if (!template) return { sections: [], footerHtml: "" };
  const clone = template.content.cloneNode(true);
  _settingsSections = Array.from(clone.querySelectorAll(".smd-settings-tab")).map(sec => ({
    id: sec.dataset.tabId || null,
    title: sec.dataset.tab,
    content: sec.innerHTML
  }));
  const footer = clone.querySelector("#settingsFooter");
  _settingsFooterHtml = (footer ? footer.outerHTML : "").replace(
    'id="buildNumber"></span>',
    'id="buildNumber">' + (typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "") + '</span>'
  );
  template.remove();
  return { sections: _settingsSections, footerHtml: _settingsFooterHtml };
}

function buildSettingsContent() {
  const settingsPage = document.getElementById("settingsPage");
  if (!settingsPage) return;
  const { sections, footerHtml } = getSettingsSections();

  settingsPage.title = "Settings";
  settingsPage.content = '<smd-tabs id="settingsTabs" narrow></smd-tabs>' + footerHtml;
  settingsPage.buttons = [{ text: "OK", variant: "success", action: "done" }];

  const tabsEl = $id("settingsTabs");
  if (tabsEl) {
    tabsEl.tabs = sections;
    tabsEl.bottomline = true;
  }
  injectSettingsStyles();
  // App extras (full-width smd-buttons in the Danger tab, …) for the settings
  // pages, on top of the shared SETTINGS_STYLES.
  if (typeof QRLINK_EDITOR_STYLES !== "undefined") {
    injectStyleInto(QRLINK_EDITOR_STYLES);
  }
}

function openSettings() {
  hideMainPages("settingsPage");
  const page = document.getElementById("settingsPage");
  if (!page) return;
  if (_settingsCloseTimer) {
    clearTimeout(_settingsCloseTimer);
    _settingsCloseTimer = null;
  }
  page.classList.remove("d-none");
  if (!page.__bound) {
    page.__bound = true;
    page.addEventListener("smd-page-action", e => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "done") closeSettings();
    });
  }
  buildSettingsContent();
  page.show();

  const savedTheme = getStoredTheme();
  const savedThemeMode = getStoredThemeMode();
  const themeSel = $id("themeSelector");
  if (themeSel) {
    themeSel.setAttribute("theme", savedTheme);
    themeSel.setAttribute("mode", savedThemeMode);
  }

  const savedFontSize = localStorage.getItem(smdKey("fontSize")) || "xlarge";
  const fontSizeSel = $id("fontSizeSelector");
  if (fontSizeSel) fontSizeSel.value = savedFontSize;

  const savedIconSize = localStorage.getItem(smdKey("iconSize")) || "medium";
  const iconSel = $id("iconSizeSelector");
  if (iconSel) iconSel.value = savedIconSize;

  const savedDensity = localStorage.getItem(smdKey("density")) || "normal";
  const densitySel = $id("densitySelector");
  if (densitySel) densitySel.value = savedDensity;

  const autoHide = localStorage.getItem(smdKey("autoHideMenu")) === "true";
  const autoHideCb = $id("autoHideMenu");
  if (autoHideCb) autoHideCb.checked = autoHide;

  const showDanger = localStorage.getItem(smdKey("showDanger")) === "true";
  const showDangerCb = $id("showDanger");
  if (showDangerCb) showDangerCb.checked = showDanger;
  toggleDangerRows(showDanger);
}

function closeSettings() {
  const page = document.getElementById("settingsPage");
  if (page) {
    page.hide();
    if (_settingsCloseTimer) clearTimeout(_settingsCloseTimer);
    _settingsCloseTimer = setTimeout(() => {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
  document.getElementById("countdownContainer").classList.remove("d-none");
  renderMain();
}

// Danger tab: replace the current links with the bundled sample set.
function loadSampleLinks() {
  const v = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now();
  fetch("sampleLinks.json?v=" + v)
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(data => {
      const links = (data && data.streams) || data.links || [];
      links.forEach((link, i) => { link.sequence = i + 1; });
      saveLinks(links);
      closeSettings();
      renderMain();
      showSmdModal({
        title: "Sample Links",
        content: "Sample links loaded.",
        buttons: [{ text: "OK", variant: "primary", action: "ok" }]
      });
    })
    .catch(err => {
      showSmdModal({
        title: "Sample Links",
        content: "Failed to load sample links: " + escapeHtml(err.message),
        buttons: [{ text: "OK", variant: "primary", action: "ok" }]
      });
    });
}

// Clear this app's own data. The shared image library is NOT touched (other
// apps use it too).
function confirmClearAllData() {
  showSmdModal({
    title: "Clear All Data?",
    content: "Clear ALL QRLinks data (links and settings)? This cannot be undone.",
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
