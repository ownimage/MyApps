// Storyboard - Settings | Display.
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
      var area = document.getElementById("storyboardArea");
      if (area) area.classList.add("invisible");
    },
    restore: function () {
      if (typeof loadMinioSettings === "function") loadMinioSettings();
      if (typeof bindMinioSettingsTabBehavior === "function") bindMinioSettingsTabBehavior();
      if (typeof updateScreenResolution === "function") updateScreenResolution();
    }
  });
}

function closeSettings() {
  smdHideSettingsPage();
  var area = document.getElementById("storyboardArea");
  if (area) area.classList.remove("invisible");
  if (typeof sbPositionSelectionBar === "function") sbPositionSelectionBar();
}
