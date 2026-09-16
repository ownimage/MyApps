// SolarControlar — localStorage helpers. All keys are namespaced through
// smdKey() with the app prefix ("solarcontrolar_").

function getFlaskUrl() {
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
