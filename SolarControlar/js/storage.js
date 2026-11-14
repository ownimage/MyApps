// SolarControlar — localStorage helpers. All keys are namespaced through
// smdKey() with the app prefix ("solarcontrolar_").

// Flask injects this marker; static MyApps pages omit it. Never infer the mode
// from location or a saved preference, which could change across deployments.
function isSolarServerMode() {
  return !!document.querySelector('meta[name="solar-server-base"]');
}

if (isSolarServerMode()) {
  document.querySelectorAll('[data-solar-myapps]').forEach(function (el) { el.remove(); });
}

function getFlaskUrl() {
  var context = document.querySelector('meta[name="solar-server-base"]');
  if (context) return context.content;
  return localStorage.getItem(smdKey("flaskUrl")) || "/solar";
}

function setFlaskUrl(url) {
  localStorage.setItem(smdKey("flaskUrl"), url);
}

function getFlaskUser() {
  return (localStorage.getItem(smdKey("flaskUser")) || "").trim();
}

function setFlaskUser(user) {
  localStorage.setItem(smdKey("flaskUser"), user);
}

function getFlaskPass() {
  return localStorage.getItem(smdKey("flaskPass")) || "";
}

function setFlaskPass(pass) {
  localStorage.setItem(smdKey("flaskPass"), pass);
}

// Returns a "Basic <base64>" Authorization header value when credentials are
// configured, otherwise null (no auth header is sent).
function getFlaskAuthHeader() {
  if (isSolarServerMode()) return null;
  var user = getFlaskUser();
  if (!user) return null;
  var cred = user + ":" + getFlaskPass();
  return "Basic " + btoa(unescape(encodeURIComponent(cred)));
}

function isAutoRefresh() {
  return localStorage.getItem(smdKey("autoRefresh")) === "true";
}

function setAutoRefresh(enabled) {
  localStorage.setItem(smdKey("autoRefresh"), enabled);
}

function isShowDanger() {
  return localStorage.getItem(smdKey("showDanger")) === "true";
}

function setShowDanger(enabled) {
  localStorage.setItem(smdKey("showDanger"), enabled);
}
