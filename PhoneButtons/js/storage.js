// PhoneButtons — localStorage helpers. All keys are namespaced through smdKey()
// with the app prefix ("pb"), e.g. `pbserverUrl`, `pbtheme`.

// The configured server origin, or "" to mean "this page's own origin". This is
// the ONE place the rest of the app reads the target from.
function getServerUrl() {
  return (localStorage.getItem(smdKey("serverUrl")) || "").trim();
}

function setServerUrl(url) {
  localStorage.setItem(smdKey("serverUrl"), url || "");
}

// Optional pairing token. Sent to the server as the socket `auth.token` and as
// an `Authorization: Bearer <token>` header on REST calls.
function getServerToken() {
  return (localStorage.getItem(smdKey("serverToken")) || "").trim();
}

function setServerToken(token) {
  localStorage.setItem(smdKey("serverToken"), token || "");
}

function isAutoConnect() {
  return localStorage.getItem(smdKey("autoConnect")) === "true";
}

function setAutoConnect(enabled) {
  localStorage.setItem(smdKey("autoConnect"), enabled ? "true" : "false");
}

// Base server origin with any trailing slashes trimmed, so callers can append
// "/api/..." or pass it straight to the Socket.IO client. Falls back to this
// page's own origin when the setting is blank (useful when the app is served by
// the Flask server itself).
function serverBase() {
  var url = getServerUrl();
  if (!url) {
    return (typeof window !== "undefined" && window.location) ? window.location.origin : "";
  }
  return url.replace(/\/+$/, "");
}
