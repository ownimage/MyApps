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

// ---- Server address (Settings -> Server) ----------------------------------
// The app may be served by the server it controls (same origin) or run as an
// installed PWA pointed at a LAN server. These keys hold that address; see
// pbServerBase() in api.js for how it becomes a request URL.

// The address this page was served from when it looks like the server (a
// non-default port), else the fresh-install default.
function defaultServerAddress() {
  if (location.port && location.port !== "80" && location.port !== "443") {
    return { ip: location.hostname, port: location.port };
  }
  return { ip: PB_DEFAULT_IP, port: PB_DEFAULT_PORT };
}

// Seed the two keys on first run only (a stored value always wins).
function ensureServerDefaults() {
  if (localStorage.getItem(smdKey("serverIp")) === null) {
    localStorage.setItem(smdKey("serverIp"), defaultServerAddress().ip);
  }
  if (localStorage.getItem(smdKey("serverPort")) === null) {
    localStorage.setItem(smdKey("serverPort"), defaultServerAddress().port);
  }
}

// Mirror the inputs into storage as they are typed. An existing connection was to
// the OLD address, so drop it and let the user (or a QR scan) reconnect.
function serverAddressChanged() {
  var ipEl = document.getElementById("serverIpInput");
  var portEl = document.getElementById("serverPortInput");
  if (ipEl) localStorage.setItem(smdKey("serverIp"), (ipEl.value || "").trim());
  if (portEl) localStorage.setItem(smdKey("serverPort"), (portEl.value || "").trim());
  // Tear down whatever socket exists (even a failing one) so the next Connect
  // builds one for the NEW address.
  if (pbSocket.isActive()) pbSocket.disconnect();
}

// The "HTTPS" switch (Settings -> Server): the server may be served over TLS.
// An existing connection was to the old scheme, so drop it.
function changeServerHttps(enabled) {
  localStorage.setItem(smdKey("serverHttps"), enabled ? "true" : "false");
  if (pbSocket.isActive()) pbSocket.disconnect();
}

// Parse a scanned server address (URL, host:port or bare host) into
// { ip, port, https }. The Share-app QR already encodes the server URL.
function parseServerAddress(text) {
  text = String(text || "").trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = "http://" + text;
  try {
    var u = new URL(text);
    var host = u.hostname;
    // A real host: dot-separated labels (IPv4 or a name) — rejects the
    // percent-encoded junk `new URL()` would otherwise accept from free text.
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i.test(host)) return null;
    var port = u.port || (u.protocol === "https:" ? "443" : PB_DEFAULT_PORT);
    if (!/^\d{1,5}$/.test(port) || +port < 1 || +port > 65535) return null;
    return { ip: host, port: String(port), https: u.protocol === "https:" };
  } catch (e) {
    return null;
  }
}

function applyServerAddress(addr) {
  localStorage.setItem(smdKey("serverIp"), addr.ip);
  localStorage.setItem(smdKey("serverPort"), addr.port);
  localStorage.setItem(smdKey("serverHttps"), addr.https ? "true" : "false");
  var ipEl = document.getElementById("serverIpInput");
  if (ipEl) ipEl.value = addr.ip;
  var portEl = document.getElementById("serverPortInput");
  if (portEl) portEl.value = addr.port;
  var httpsEl = document.getElementById("serverHttps");
  if (httpsEl) httpsEl.checked = !!addr.https;
}

// ---- Scan the Share-app QR (shared <smd-qr-import> in raw mode) ------------

var _serverScanCloseTimer = null;

function openServerScanPage() {
  var page = document.getElementById("serverScanPage");
  if (!page) return;
  clearTimeout(_serverScanCloseTimer);
  page.classList.remove("d-none");
  page.title = "Scan server QR";
  page.content = '<smd-qr-import id="serverQrImport" raw autostart></smd-qr-import>';
  page.buttons = [{ text: "Cancel", variant: "secondary", action: "cancel", id: "btnServerScanCancel" }];
  if (!page.__pbServerScanBound) {
    page.__pbServerScanBound = true;
    page.addEventListener("smd-page-action", function () { hideServerScanPage(); });
    page.addEventListener("smd-qr-import-complete", function (e) {
      var addr = parseServerAddress(e.detail && e.detail.data);
      if (!addr) {
        _commLine("scanned code is not a server address", "error");
        return;
      }
      applyServerAddress(addr);
      _commLine("server set from QR: " + addr.ip + ":" + addr.port, "ok");
      hideServerScanPage();
      if (pbSocket.isActive()) pbSocket.disconnect();
      connectServer();
    });
  }
  page.show();
}

function hideServerScanPage() {
  var page = document.getElementById("serverScanPage");
  if (!page) return;
  // The page is hidden (d-none), not removed, so stop the camera explicitly.
  var imp = page.querySelector("smd-qr-import");
  if (imp && imp.stop) imp.stop();
  page.hide();
  clearTimeout(_serverScanCloseTimer);
  _serverScanCloseTimer = setTimeout(function () {
    page.classList.add("d-none");
  }, Math.max(0, (page.slideDuration || 0) + 50));
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
  ensureServerDefaults();
  var ipEl = document.getElementById("serverIpInput");
  if (ipEl) ipEl.value = pbServerIp();
  var portEl = document.getElementById("serverPortInput");
  if (portEl) portEl.value = pbServerPort();
  var httpsEl = document.getElementById("serverHttps");
  if (httpsEl) httpsEl.checked = pbServerHttps();
  var qr = document.getElementById("shareQrCode");
  if (qr) qr.setAttribute("value", window.location.origin + "/PhoneButtons/");
}

function openSettings() {
  smdSetupSettingsPage({ restore: restoreServerTab, dangerIds: ["refreshAppRow", "clearStorageRow"] });
}

function closeSettings() {
  smdHideSettingsPage();
}
