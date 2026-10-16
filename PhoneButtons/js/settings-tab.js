// PhoneButtons — Settings page (Display / Server tabs) built on the shared
// smd-page + smd-tabs + smdSettingsPage framework. The Server tab holds the
// server ADDRESS (https / address / port + Scan QR) plus the connection tools and
// log — the app may be served by that server (same origin) or from elsewhere and
// pointed at it here.

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

// ---- Server address (Settings -> Server) ------------------------------------
// The app may be served BY the Flask server (same origin) or elsewhere (GitHub
// Pages, or a Cloudflare-tunnelled https server) and pointed at it here. See
// pbServerBase() in api.js for how these fields become a request URL.

// Mirror the fields into storage. An ACTIVE socket was built for the OLD address,
// so drop it — the next Connect builds one for the new address.
function serverAddressChanged() {
  var addr = document.getElementById("serverAddressInput");
  var port = document.getElementById("serverPortInput");
  var https = document.getElementById("serverHttps");
  if (addr) localStorage.setItem(smdKey("serverAddress"), (addr.value || "").trim());
  if (port) localStorage.setItem(smdKey("serverPort"), (port.value || "").trim());
  if (https) localStorage.setItem(smdKey("serverHttps"), https.checked ? "true" : "false");
  if (pbSocket.isActive()) pbSocket.disconnect();
}

function restoreServerAddress() {
  var addr = document.getElementById("serverAddressInput");
  if (addr) addr.value = pbServerAddress();
  var port = document.getElementById("serverPortInput");
  if (port) port.value = pbServerPort();
  var https = document.getElementById("serverHttps");
  if (https) https.checked = pbServerHttps();
}

// ---- Scan the server QR (shared <smd-qr-import> in raw mode) ----------------

var _serverScanCloseTimer = null;

function openServerScan() {
  var page = document.getElementById("serverScanPage");
  if (!page) return;
  clearTimeout(_serverScanCloseTimer);
  page.classList.remove("d-none");
  page.title = "Scan server QR";
  page.content = '<smd-qr-import id="serverQrImport" raw autostart></smd-qr-import>';
  page.buttons = [{ text: "Cancel", variant: "secondary", action: "cancel", id: "btnServerScanCancel" }];
  if (!page.__serverScanBound) {
    page.__serverScanBound = true;
    page.addEventListener("smd-page-action", function () { hideServerScan(); });
    page.addEventListener("smd-qr-import-complete", function (e) {
      var addr = pbParseServerUrl(e.detail && e.detail.data);
      if (!addr) { _commLine("That QR is not a server address", "error"); hideServerScan(); return; }
      var addrEl = document.getElementById("serverAddressInput");
      if (addrEl) addrEl.value = addr.address;
      var portEl = document.getElementById("serverPortInput");
      if (portEl) portEl.value = addr.port;
      var httpsEl = document.getElementById("serverHttps");
      if (httpsEl) httpsEl.checked = addr.https;
      serverAddressChanged();
      _commLine("server address set from QR: " + (addr.https ? "https" : "http") + "://" + addr.address + (addr.port ? ":" + addr.port : ""), "ok");
      hideServerScan();
    });
  }
  page.show();
}

function hideServerScan() {
  var page = document.getElementById("serverScanPage");
  if (!page) return;
  // The page is hidden (d-none), not removed, so stop the camera explicitly.
  var imp = page.querySelector("smd-qr-import");
  if (imp && imp.stop) imp.stop();
  page.hide();
  clearTimeout(_serverScanCloseTimer);
  _serverScanCloseTimer = setTimeout(function () { page.classList.add("d-none"); }, Math.max(0, (page.slideDuration || 0) + 50));
}

// Runs after the Settings page is (re)built: restore the server address fields,
// refresh the Server tab's button states + log from live state, restore the
// background-apps switch, and point the share QR at this server.
function restoreServerTab() {
  restoreServerAddress();
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
