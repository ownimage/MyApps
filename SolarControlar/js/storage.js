// SolarControlar — localStorage helpers. All keys are namespaced through
// smdKey() with the app prefix ("solarcontrolar_").

function getFlaskUrl() {
  return localStorage.getItem(smdKey("flaskUrl")) || "/solar";
}

function setFlaskUrl(url) {
  localStorage.setItem(smdKey("flaskUrl"), url);
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
