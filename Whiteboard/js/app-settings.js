// Whiteboard — Settings | Display.
//
// The app deliberately has ONE settings tab. Every row here drives something in
// the app: theme/mode recolours the board chrome and text frames, Font size
// scales text boxes, Touch size enlarges the selection handles, Slide speed
// drives <smd-page>, Auto-hide menu is the shared shell behaviour, and Screen
// resolution is the shared last row.

function getSettingsSections() {
  return smdGetSettingsSections();
}

function buildSettingsContent() {
  smdBuildSettingsPage();
}

function openSettings() {
  smdSetupSettingsPage({
    onBeforeOpen: function () {
      var area = document.getElementById("whiteboardArea");
      if (area) area.classList.add("invisible");
    },
    restore: function () {
      if (typeof updateScreenResolution === "function") updateScreenResolution();
    }
  });
}

function closeSettings() {
  smdHideSettingsPage();
  var area = document.getElementById("whiteboardArea");
  if (area) area.classList.remove("invisible");
  if (typeof wbPositionSelectionBar === "function") wbPositionSelectionBar();
}
