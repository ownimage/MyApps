// PhoneButtons — Settings page (Display / Server tabs) built on the shared
// smd-page + smd-tabs + smdSettingsPage framework.

function updateServerUrl(value) {
  setServerUrl(value);
}

function updateServerToken(value) {
  setServerToken(value);
}

function changeAutoConnect(enabled) {
  setAutoConnect(enabled);
  if (enabled && !pbSocket.isConnected()) connectServer();
}

// Probe the server over plain HTTP (no socket) so the user can tell a bad URL /
// CORS / mixed-content problem apart from a socket problem.
function testServerConnection() {
  var el = document.getElementById("serverTestResult");
  function set(msg, cls) {
    if (!el) return;
    el.textContent = msg;
    el.className = "form-text " + (cls || "");
  }
  set("Testing " + (serverBase() || "(same origin)") + " \u2026");
  pbApi.getHealth().then(function (data) {
    set("OK: " + JSON.stringify(data), "text-success");
    _commLine("REST /api/health OK: " + JSON.stringify(data), "ok");
  }).catch(function (err) {
    set("Failed: " + err.message, "text-danger");
    _commLine("REST /api/health failed: " + err.message, "error");
  });
}

// Restore the app-specific Server fields (the shared framework restores theme,
// mode and font size).
function restoreServerSettings() {
  var url = document.getElementById("serverUrlInput");
  if (url) url.value = getServerUrl();
  var token = document.getElementById("serverTokenInput");
  if (token) token.value = getServerToken();
  var autoConnect = document.getElementById("autoConnect");
  if (autoConnect) autoConnect.checked = isAutoConnect();
  var result = document.getElementById("serverTestResult");
  if (result) {
    result.textContent = "";
    result.className = "form-text";
  }
}

function getSettingsSections() {
  return smdGetSettingsSections();
}

function buildSettingsContent() {
  smdBuildSettingsPage();
}

function openSettings() {
  smdSetupSettingsPage({ restore: restoreServerSettings });
}

function closeSettings() {
  smdHideSettingsPage();
}
