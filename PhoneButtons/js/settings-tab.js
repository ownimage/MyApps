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

// Runs after the Settings page is (re)built: refresh the Server tab's button
// states + log from live state, and point the share QR at this server.
function restoreServerTab() {
  var state = pbSocket.getStatus();
  _renderConnStatus(state.status, state.detail);
  _renderCommLog();
  var qr = document.getElementById("shareQrCode");
  if (qr) qr.setAttribute("value", window.location.origin + "/PhoneButtons/");
}

function openSettings() {
  smdSetupSettingsPage({ restore: restoreServerTab });
}

function closeSettings() {
  smdHideSettingsPage();
}
