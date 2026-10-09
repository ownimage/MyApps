// PhoneButtons — Settings page (Display / Server tabs) built on the shared
// smd-page + smd-tabs + smdSettingsPage framework. The app is served by the
// very server it controls (same origin), so the Server tab holds only the
// connection tools + log (no URL/token to configure).

function getSettingsSections() {
  return smdGetSettingsSections();
}

function buildSettingsContent() {
  smdBuildSettingsPage();
}

// "Show background apps" is a global setting (Server tab); the Manage App page
// reads it when building its app dropdown.
function getShowBackgroundApps() {
  return localStorage.getItem(smdKey("showBackgroundApps")) === "true";
}

function setShowBackgroundApps(enabled) {
  localStorage.setItem(smdKey("showBackgroundApps"), enabled ? "true" : "false");
}

function changeShowBackgroundApps(enabled) {
  setShowBackgroundApps(enabled);
}

// Danger tab: the "Show danger" switch reveals the danger rows.
function changeShowDanger(enabled) {
  smdChangeShowDanger(enabled, ["refreshAppRow", "clearStorageRow"]);
}

// Clear localStorage EXCEPT the shared image library, theme, theme mode and
// font size.
function clearLocalStorageExcept() {
  var keep = ["shared-images", smdKey("theme"), smdKey("themeMode"), smdKey("fontSize")];
  Object.keys(localStorage).forEach(function (key) {
    if (keep.indexOf(key) === -1) localStorage.removeItem(key);
  });
}

function clearLocalStorage() {
  showSmdModal({
    title: "Clear local storage?",
    content: "Clears all PhoneButtons settings. Keeps the shared image library, theme, theme mode and font size.",
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Clear", variant: "danger", action: "clear" }
    ],
    onAction: function (detail) {
      if (detail.action !== "clear") return;
      clearLocalStorageExcept();
      location.reload();
    }
  });
}

// Runs after the Settings page is (re)built: refresh the Server tab's button
// states + log from live state, restore the background-apps switch, and point
// the share QR at this server.
function restoreServerTab() {
  var state = pbSocket.getStatus();
  _renderConnStatus(state.status, state.detail);
  _renderCommLog();
  var cb = document.getElementById("showBackgroundApps");
  if (cb) cb.checked = getShowBackgroundApps();
  var qr = document.getElementById("shareQrCode");
  if (qr) qr.setAttribute("value", window.location.origin + "/PhoneButtons/");
}

function openSettings() {
  smdSetupSettingsPage({ restore: restoreServerTab, dangerIds: ["refreshAppRow", "clearStorageRow"] });
}

function closeSettings() {
  smdHideSettingsPage();
}
