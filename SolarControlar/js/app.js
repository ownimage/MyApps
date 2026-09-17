// SolarControlar app entry point: storage namespace, boot wiring for the
// dashboard, theme engine, auto-refresh and PWA pull-to-refresh.
//
// The app is split into classic scripts (no modules) so every top-level
// function stays global — generated HTML uses inline onclick handlers and
// Playwright tests can call these functions from page.evaluate().

// Storage namespace for all SolarControlar keys.
SmdConfig.storagePrefix = "solarcontrolar_";
SmdConfig.imagePrefix = "shared-";

// Hide every page except one (null hides them all).
function hideMainPages(exceptId) {
  [
    "dashboardContainer",
    "settingsPage"
  ].forEach(function (id) {
    if (id === exceptId) return;
    var el = document.getElementById(id);
    if (el) el.classList.add("d-none");
  });
}

document.addEventListener("DOMContentLoaded", function () {
  applyTheme(localStorage.getItem(smdKey("theme")) || "superhero");

  renderMain();
  startAutoRefresh();

  // Theme selector wiring
  document.addEventListener("smd-theme-change", function (e) {
    var theme = e.detail && e.detail.theme;
    if (theme && typeof changeTheme === "function") changeTheme(theme);
  });
});

// PWA PULL-TO-REFRESH
(function () {
  if (!("serviceWorker" in navigator)) return;
  var THRESHOLD = 80;
  var startY = 0, pulling = false, pullDist = 0;
  var indicator = document.createElement("div");
  indicator.id = "pwa-pull-indicator";
  indicator.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;align-items:center;justify-content:center;height:0;overflow:hidden;background:var(--bs-body-bg);transition:height 0.1s;color:var(--bs-body-color)";
  indicator.textContent = "\u21E9 Pull to refresh";
  document.body.appendChild(indicator);
  var spinner = document.createElement("div");
  spinner.id = "pwa-pull-spinner";
  spinner.style.cssText = "position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);z-index:10000;display:none;width:40px;height:40px;border:4px solid var(--bs-border-color);border-top-color:var(--bs-primary);border-radius:50%;animation:solar-spin 0.6s linear infinite";
  document.body.appendChild(spinner);
  var style = document.createElement("style");
  style.textContent = "@keyframes solar-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}";
  document.head.appendChild(style);
  function adjustIcon(dist) {
    indicator.innerHTML = dist >= THRESHOLD ? "\u21E9 Release to refresh" : "\u21E9 Pull to refresh";
    indicator.style.height = Math.min(dist, 50) + "px";
  }
  document.addEventListener("touchstart", function (e) {
    if (window.scrollY !== 0) return;
    if (e.target.closest(".modal")) return;
    startY = e.touches[0].clientY; pulling = true; pullDist = 0;
  }, { passive: true });
  document.addEventListener("touchmove", function (e) {
    if (!pulling) return;
    if (e.defaultPrevented) { pulling = false; pullDist = 0; indicator.style.height = "0"; return; }
    var dy = e.touches[0].clientY - startY;
    if (dy <= 0) { pullDist = 0; return; }
    pullDist = dy; adjustIcon(dy);
  }, { passive: true });
  document.addEventListener("touchend", function () {
    if (!pulling) return;
    pulling = false; indicator.style.height = "0";
    if (pullDist >= THRESHOLD) { spinner.style.display = "block"; setTimeout(function () { location.reload(); }, 400); }
    pullDist = 0;
  }, { passive: true });
})();
