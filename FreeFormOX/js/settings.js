// FreeFormOX app-specific settings handlers. The generic appearance settings
// (theme) come from the shared library (../shared/js/smd-settings.js); this file
// wires up the game settings (names, piece styles, show-undo/redo) and the
// shared smd-page/smd-tabs settings page.

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
  return smdGetSettingsSections();
}

function buildSettingsContent() {
  smdBuildSettingsPage();
}

function openSettings() {
  hideMainPages("settingsPage");
  smdSetupSettingsPage({
    restore: function () {
      ["x", "o"].forEach(s => {
        const nameEl = $id(s + "Name");
        if (nameEl) nameEl.value = localStorage.getItem(smdKey(s + "Name")) || (s === "x" ? "Xander" : "Oliver");
        const styleSel = $id(s + "PieceStyle");
        if (styleSel) styleSel.value = localStorage.getItem(smdKey(s + "PieceStyle")) || "classic";
      });
      const showPlayReplay = $id("showPlayReplay");
      if (showPlayReplay) showPlayReplay.checked = localStorage.getItem(smdKey("showGameButtons")) !== "false";
    }
  });
}

function closeSettings() {
  smdHideSettingsPage();
  document.getElementById("mainContent").classList.remove("d-none");
  refreshPieces();
  updateGameButtons();
}