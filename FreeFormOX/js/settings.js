// FreeFormOX app-specific settings handlers. The generic appearance settings
// (theme) come from the shared library (../shared/js/smd-settings.js); this file
// wires up the game settings (names, piece styles, show-undo/redo) and the
// shared smd-page/smd-tabs settings page.

let _settingsSections = null;
let _settingsFooterHtml = null;
let _settingsCloseTimer = null;

function changePieceStyle(symbol, style) {
  localStorage.setItem(smdKey(symbol.toLowerCase() + "PieceStyle"), style);
  refreshPieces();
}

function saveName(symbol, value) {
  localStorage.setItem(smdKey(symbol.toLowerCase() + "Name"), value);
}

function savePlayReplaySetting(checked) {
  localStorage.setItem(smdKey("showGameButtons"), checked);
}

function swapPlayers() {
  const xName = localStorage.getItem(smdKey("xName")) || "Xander";
  const oName = localStorage.getItem(smdKey("oName")) || "Oliver";
  localStorage.setItem(smdKey("xName"), oName);
  localStorage.setItem(smdKey("oName"), xName);

  const xStyle = localStorage.getItem(smdKey("xPieceStyle")) || "classic";
  const oStyle = localStorage.getItem(smdKey("oPieceStyle")) || "classic";
  localStorage.setItem(smdKey("xPieceStyle"), oStyle);
  localStorage.setItem(smdKey("oPieceStyle"), xStyle);

  const xInput = $id("xName");
  const oInput = $id("oName");
  if (xInput) xInput.value = oName;
  if (oInput) oInput.value = xName;
  const xStyleSel = $id("xPieceStyle");
  const oStyleSel = $id("oPieceStyle");
  if (xStyleSel) xStyleSel.value = oStyle;
  if (oStyleSel) oStyleSel.value = xStyle;

  resetGame();
  refreshPieces();
}

function swapPlayersAndRestart() {
  swapPlayers();
  closeSettings();
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
  settingsPage.content = '<smd-tabs id="settingsTabs"></smd-tabs>' + footerHtml;
  settingsPage.buttons = [{ text: "OK", variant: "success", action: "done" }];

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

  const savedTheme = localStorage.getItem(smdKey("theme")) || "superhero";
  const themeSel = $id("themeSelector");
  if (themeSel) themeSel.setAttribute("theme", savedTheme);

  const savedFontSize = localStorage.getItem(smdKey("fontSize")) || "xlarge";
  const fontSizeSel = $id("fontSizeSelector");
  if (fontSizeSel) fontSizeSel.value = savedFontSize;

  ["x", "o"].forEach(s => {
    const nameEl = $id(s + "Name");
    if (nameEl) nameEl.value = localStorage.getItem(smdKey(s + "Name")) || (s === "x" ? "Xander" : "Oliver");
    const styleSel = $id(s + "PieceStyle");
    if (styleSel) styleSel.value = localStorage.getItem(smdKey(s + "PieceStyle")) || "classic";
  });

  const showPlayReplay = $id("showPlayReplay");
  if (showPlayReplay) showPlayReplay.checked = localStorage.getItem(smdKey("showGameButtons")) !== "false";
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
  document.getElementById("mainContent").classList.remove("d-none");
  refreshPieces();
  updateGameButtons();
}