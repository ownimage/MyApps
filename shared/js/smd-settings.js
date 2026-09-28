// Theme engine + generic appearance/shell settings shared by every app.
// The globals below are used directly by the apps (inline onchange handlers and
// the storybook); they were previously also mirrored onto SmdApp.prototype.

const themeConfig = (() => {
  // Theme CSS paths are relative to the shared root; applyTheme() derives the
  // real href from the existing #bootstrap-theme-css link prefix, so this value
  // is informational only (kept relative to stay path-agnostic).
  // Themes carry NO default colour mode: the global Theme Mode (light|dark) is
  // the only mode source.
  const bw = "css/themes";
  return {
    bootstrap: { css: `${bw}/bootstrap/bootstrap.min.css` },
    brite:     { css: `${bw}/brite/bootstrap.min.css` },
    cerulean:  { css: `${bw}/cerulean/bootstrap.min.css` },
    cosmo:     { css: `${bw}/cosmo/bootstrap.min.css` },
    cyborg:    { css: `${bw}/cyborg/bootstrap.min.css` },
    darkly:    { css: `${bw}/darkly/bootstrap.min.css` },
    flatly:    { css: `${bw}/flatly/bootstrap.min.css` },
    journal:   { css: `${bw}/journal/bootstrap.min.css` },
    litera:    { css: `${bw}/litera/bootstrap.min.css` },
    lumen:     { css: `${bw}/lumen/bootstrap.min.css` },
    lux:       { css: `${bw}/lux/bootstrap.min.css` },
    materia:   { css: `${bw}/materia/bootstrap.min.css` },
    minty:     { css: `${bw}/minty/bootstrap.min.css` },
    morph:     { css: `${bw}/morph/bootstrap.min.css` },
    pulse:     { css: `${bw}/pulse/bootstrap.min.css` },
    quartz:    { css: `${bw}/quartz/bootstrap.min.css` },
    sandstone: { css: `${bw}/sandstone/bootstrap.min.css` },
    simplex:   { css: `${bw}/simplex/bootstrap.min.css` },
    sketchy:   { css: `${bw}/sketchy/bootstrap.min.css` },
    slate:     { css: `${bw}/slate/bootstrap.min.css` },
    solar:     { css: `${bw}/solar/bootstrap.min.css` },
    spacelab:  { css: `${bw}/spacelab/bootstrap.min.css` },
    superhero: { css: `${bw}/superhero/bootstrap.min.css` },
    united:    { css: `${bw}/united/bootstrap.min.css` },
    vapor:     { css: `${bw}/vapor/bootstrap.min.css` },
    yeti:      { css: `${bw}/yeti/bootstrap.min.css` },
    zephyr:    { css: `${bw}/zephyr/bootstrap.min.css` }
  };
})();

// Relative path prefix to the shared-app root, derived from the theme <link> so
// it works whether the app lives at the domain root, under a sub-path, or in
// the storybook. All shared-asset loads (vendor/, sampleImages.json, icon sets)
// should resolve through this.
function smdAppRoot() {
  const link = document.getElementById("bootstrap-theme-css");
  if (!link) return "";
  const rel = link.getAttribute("href") || "";
  const m = rel.match(/^(.*?)css\/themes\/.*$/);
  return m ? m[1] : "";
}

const SMD_DEFAULT_THEME = "superhero";

function normalizeTheme(name) {
  const value = String(name || "");
  return Object.prototype.hasOwnProperty.call(themeConfig, value) ? value : SMD_DEFAULT_THEME;
}

// Themes have no inherent light/dark mode any more: only explicit Light/Dark.
function normalizeThemeMode(mode) {
  return mode === "dark" ? "dark" : "light";
}

function getStoredTheme() {
  return normalizeTheme(localStorage.getItem(smdKey("theme")));
}

function getStoredThemeMode() {
  return normalizeThemeMode(localStorage.getItem(smdKey("themeMode")));
}

function resolveThemeMode(theme, mode) {
  return normalizeThemeMode(mode);
}

// The `<theme>.<mode>.css` override is the one theme file that changes with the
// Light/Dark mode, so its directory prefix is derived from the base theme
// <link> (the same source applyTheme uses) rather than passed in. Works at the
// domain root, under a sub-path, and in the storybook.
function smdThemeCssPrefix() {
  const link = document.getElementById("bootstrap-theme-css");
  if (link) {
    return (link.getAttribute("href") || "").replace(/[^/]*\/bootstrap\.min\.css(\?.*)?$/, "");
  }
  return smdAppRoot() + "css/themes/";
}

function smdBuildStamp() {
  return typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now();
}

function applyTheme(name, modeOverride) {
  const valid = normalizeTheme(name);
  const hasModeOverride = typeof modeOverride !== "undefined";
  const mode = hasModeOverride ? normalizeThemeMode(modeOverride) : getStoredThemeMode();
  const link = document.getElementById("bootstrap-theme-css");
  if (link) {
    link.href = smdThemeCssPrefix() + valid + "/bootstrap.min.css?v=" + smdBuildStamp();
  }
  document.documentElement.setAttribute("data-bs-theme", mode);
  document.documentElement.setAttribute("data-theme", valid);
  localStorage.setItem(smdKey("theme"), valid);
  if (!hasModeOverride) localStorage.setItem(smdKey("themeMode"), mode);
  applyThemeOverrides(valid, mode);
}

// A mode switch no longer only flips two attributes: the override sheet is
// per-mode (`<theme>.<mode>.css`), so the link has to be re-pointed. The base
// theme sheet is still untouched (no theme change, no renderMain()).
function applyThemeMode(theme, mode) {
  const valid = normalizeTheme(theme);
  const normalized = normalizeThemeMode(mode);
  document.documentElement.setAttribute("data-bs-theme", normalized);
  document.documentElement.setAttribute("data-theme", valid);
  applyThemeOverrides(valid, normalized);
}

// Per-theme AND per-mode override sheet. The mode is part of the filename
// because the Light/Dark palette lives in the theme's own file now; that also
// means a mode switch swaps this link (see applyThemeMode) instead of relying on
// a `[data-bs-theme="..."]` qualifier inside one shared file.
function applyThemeOverrides(theme, mode) {
  const file = theme + "." + normalizeThemeMode(mode) + ".css";
  setOverrideLink("theme-override-specific", smdThemeCssPrefix() + theme + "/" + file + "?v=" + smdBuildStamp());
  orderThemeOverrideLinks();
}

function setOverrideLink(id, href) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("link");
    el.id = id;
    el.rel = "stylesheet";
    const anchor = themeOverrideAnchor();
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
    else document.head.appendChild(el);
  }
  el.href = href;
  return el;
}

// The shared functional sheet is the anchor for the per-theme override sheet:
// cascade order is vendor -> theme bootstrap -> shared styles -> theme override
// (the per-mode `<theme>.<mode>.css` override).
// Anchoring on #bootstrap-theme-css instead would push shared styles last, so the
// theme override would no longer be the final layer.
function smdSharedStylesLink() {
  const byId = document.getElementById("smd-shared-css");
  if (byId) return byId;
  const links = document.querySelectorAll('link[rel="stylesheet"][href]');
  for (let i = 0; i < links.length; i++) {
    if (/(^|\/)shared\/css\/styles\.css(\?|$)/.test(links[i].getAttribute("href") || "")) return links[i];
  }
  return null;
}

function themeOverrideAnchor() {
  return smdSharedStylesLink() || document.getElementById("bootstrap-theme-css");
}

function orderThemeOverrideLinks() {
  const specific = document.getElementById("theme-override-specific");
  if (!specific) return;
  const anchor = themeOverrideAnchor();
  if (anchor && anchor.parentNode) {
    if (anchor.nextElementSibling !== specific) anchor.parentNode.insertBefore(specific, anchor.nextSibling);
    return;
  }
  // Without a shared sheet the override still has to follow the theme itself.
  const base = document.getElementById("bootstrap-theme-css");
  if (base && base.parentNode && base.nextElementSibling !== specific) {
    base.parentNode.insertBefore(specific, base.nextSibling);
  }
}

function changeTheme(name) {
  applyTheme(name);
  if (typeof renderMain === "function") renderMain();
  if (typeof renderImagesEditor === "function") {
    const imagesEditor = document.getElementById("imagesEditor");
    if (imagesEditor && !imagesEditor.classList.contains("d-none")) renderImagesEditor();
  }
}

function changeThemeMode(mode) {
  const normalized = normalizeThemeMode(mode);
  const theme = getStoredTheme();
  localStorage.setItem(smdKey("theme"), theme);
  localStorage.setItem(smdKey("themeMode"), normalized);
  applyThemeMode(theme, normalized);
}

// FONT SIZE
function changeFontSize(value) {
  localStorage.setItem(smdKey("fontSize"), value);
  document.documentElement.dataset.smdFontSize = value;
  document.body.classList.remove("font-size-xsmall", "font-size-small", "font-size-normal", "font-size-large", "font-size-xlarge", "font-size-jumbo");
  if (value !== "normal") {
    document.body.classList.add("font-size-" + value);
  }
}

// ICON SIZE
function changeIconSize(value) {
  localStorage.setItem(smdKey("iconSize"), value);
  document.documentElement.dataset.smdIconSize = value;
  document.body.classList.remove("icon-size-xsmall", "icon-size-small", "icon-size-medium", "icon-size-large", "icon-size-xlarge", "icon-size-jumbo");
  document.body.classList.add("icon-size-" + value);
  // Optional app hook: push the new value (px) into <smd-image>.
  if (typeof applyImageSize === "function") applyImageSize();
}

// TILE DENSITY
function changeDensity(value) {
  localStorage.setItem(smdKey("density"), value);
  document.documentElement.dataset.smdTileDensity = value;
  document.body.classList.remove("compact", "density-normal");
  if (value !== "normal") {
    document.body.classList.add(value);
  }
}

// TOUCH SIZE (drag handles + checkboxes)
function changeTouchSize(value) {
  localStorage.setItem(smdKey("touchSize"), value);
  document.documentElement.dataset.smdTouchSize = value;
  // Optional app hook: push the new value into <smd-draghandle>/<smd-checkbox>.
  if (typeof applyTouchSize === "function") applyTouchSize();
}

// SLIDE SPEED (smd-page slide-in/out duration in ms)
function applySlideDuration(ms) {
  var value = parseInt(ms, 10);
  if (isNaN(value) || value < 0) value = 0;
  document.querySelectorAll("smd-page").forEach(function(p) {
    p.slideDuration = value;
  });
}

function changeSlideDuration(value) {
  localStorage.setItem(smdKey("slideDuration"), value);
  applySlideDuration(value);
}

// AUTO-HIDE MENU
let autoHideTimer = null;
let autoHideCooldown = false;

function showNav() {
  const nav = document.getElementById("mainNav");
  if (nav) nav.classList.remove("nav-hidden");
}

function hideNav() {
  const nav = document.getElementById("mainNav");
  if (!nav) return;
  // Any open <smd-page> means the user is inside an editor/wizard: keep the nav.
  const anyPageOpen = typeof document.querySelector === "function" && document.querySelector("smd-page:not(.d-none)");
  if (!anyPageOpen) {
    nav.classList.add("nav-hidden");
    autoHideCooldown = true;
    setTimeout(() => { autoHideCooldown = false; }, 600);
  }
}

function resetAutoHideTimer() {
  if (autoHideCooldown) return;
  const enabled = localStorage.getItem(smdKey("autoHideMenu")) === "true";
  if (!enabled) return;
  showNav();
  clearTimeout(autoHideTimer);
  autoHideTimer = setTimeout(hideNav, 4000);
}

let autoHideEventsBound = false;
const autoHideEvents = ["pointerdown", "pointerup", "touchstart", "click", "mousedown"];

function bindAutoHideEvents() {
  if (autoHideEventsBound) return;
  autoHideEvents.forEach(evt => {
    document.addEventListener(evt, resetAutoHideTimer, { passive: true });
    document.body.addEventListener(evt, resetAutoHideTimer, { passive: true });
  });
  window.addEventListener("scroll", resetAutoHideTimer, { passive: true });
  autoHideEventsBound = true;
}

function unbindAutoHideEvents() {
  if (!autoHideEventsBound) return;
  autoHideEvents.forEach(evt => {
    document.removeEventListener(evt, resetAutoHideTimer);
    document.body.removeEventListener(evt, resetAutoHideTimer);
  });
  window.removeEventListener("scroll", resetAutoHideTimer);
  autoHideEventsBound = false;
}

function changeAutoHideMenu(enabled) {
  localStorage.setItem(smdKey("autoHideMenu"), enabled);
  document.body.classList.toggle("auto-hide-menu", enabled);
  if (enabled) {
    bindAutoHideEvents();
    resetAutoHideTimer();
  } else {
    unbindAutoHideEvents();
    clearTimeout(autoHideTimer);
    document.getElementById("mainNav").classList.remove("nav-hidden");
  }
}

function updateScreenResolution() {
  const el = $id("screenResolution");
  if (!el) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  el.textContent = `${w} \u00d7 ${h} (${dpr}x)`;
}

document.addEventListener("DOMContentLoaded", () => {
  const savedFontSize = localStorage.getItem(smdKey("fontSize")) || "xlarge";
  document.documentElement.dataset.smdFontSize = savedFontSize;
  if (savedFontSize !== "normal") {
    document.body.classList.add("font-size-" + savedFontSize);
  }

  const savedIconSize = localStorage.getItem(smdKey("iconSize")) || "medium";
  document.documentElement.dataset.smdIconSize = savedIconSize;
  document.body.classList.add("icon-size-" + savedIconSize);

  const savedTouchSize = localStorage.getItem(smdKey("touchSize")) || "normal";
  document.documentElement.dataset.smdTouchSize = savedTouchSize;

  const savedDensity = localStorage.getItem(smdKey("density")) || "normal";
  document.documentElement.dataset.smdTileDensity = savedDensity;
  if (savedDensity !== "normal") {
    document.body.classList.add(savedDensity);
  }

  const savedSlideDuration = localStorage.getItem(smdKey("slideDuration")) || "0";
  applySlideDuration(savedSlideDuration);

  updateScreenResolution();
  window.addEventListener("resize", updateScreenResolution);

  const autoHide = localStorage.getItem(smdKey("autoHideMenu")) === "true";
  if (autoHide) {
    document.body.classList.add("auto-hide-menu");
    bindAutoHideEvents();
    resetAutoHideTimer();
  }
});

// ---- Service-worker registration (shared by every app shell) ----
// The worker is registered at a STABLE url on purpose. Versioning the script
// url (`../sw.js?v=<BUILD_NUMBER>`) does make every bump install a new worker,
// but it also makes the browser install a SECOND one for the same bump (the
// focus-triggered reg.update() picks up the new bytes under the old url, then
// the reloaded page registers the new url) — the app then "updates twice".
// So the update signal stays a byte change in sw.js, whose inline BUILD_NUMBER
// is bumped together with shared/js/build-number.js, and the page below
// verifies at runtime that the two agree.
function smdRegisterServiceWorker(path) {
  return navigator.serviceWorker.register(path, { updateViaCache: "none" }).then(function(reg) {
    // update via cache is a persisted, per-registration setting; set it on the
    // object too so an existing registration stops reusing an HTTP-cached sw.js.
    reg.updateViaCache = "none";
    // Re-assert the Danger tab's "No Cache" switch on every boot: the worker
    // may have been terminated since the last visit and lost the in-memory
    // half of the setting.
    if (typeof smdPushNoCacheToWorker === "function") {
      smdPushNoCacheToWorker((reg && (reg.active || reg.waiting)) || navigator.serviceWorker.controller);
    }
    smdCheckServiceWorkerBuild(reg);
    return reg;
  });
}

// Ask the worker which build it is, and compare it with the build this page is
// running. The worker mirrors the number inline, so a page that is NEWER than
// its worker means the two files drifted (someone bumped build-number.js
// without sw.js). Nothing would ever replace that worker, because its bytes no
// longer change, so re-register once and reload to get the current sw.js.
// Guarded by a per-build localStorage flag so it can never loop.
function smdCheckServiceWorkerBuild(reg) {
  return new Promise(function(resolve) {
    var pageBuild = (typeof BUILD_NUMBER !== "undefined" ? String(BUILD_NUMBER) : "");
    var worker = (reg && (reg.active || reg.waiting)) || (window.navigator && navigator.serviceWorker.controller);
    if (!worker || !pageBuild) return resolve(null);
    var settled = false;
    var channel = new MessageChannel();
    function finish(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }
    setTimeout(function() { finish(null); }, 1000);
    channel.port1.onmessage = function(event) {
      var data = event.data || {};
      var workerBuild = data.type === "BUILD" ? String(data.build || "") : "";
      if (!workerBuild || workerBuild === pageBuild) return finish(workerBuild);
      var drifted = Number(workerBuild) < Number(pageBuild);
      console.warn("Service worker is on build " + workerBuild + " but this page is on " + pageBuild +
        (drifted ? " — repairing the registration." : " — an update is pending."));
      finish(workerBuild);
      if (!drifted) return;
      var flag = "smdSwDriftReloadedFor";
      var already = "";
      try { already = localStorage.getItem(flag) || ""; } catch (e) {}
      if (already === pageBuild) return;
      try { localStorage.setItem(flag, pageBuild); } catch (e) {}
      Promise.resolve(reg.unregister && reg.unregister()).then(function() {
        window.location.reload();
      }, function() { window.location.reload(); });
    };
    try {
      worker.postMessage({ type: "GET_BUILD" }, [channel.port2]);
    } catch (e) {
      finish(null);
    }
  });
}

// ---- "No Cache" mode (the Danger tab of an app that exposes it) ----
// The page owns the switch (localStorage) and mirrors it into the worker, which
// then serves every file from disk instead of its precache. The mirror is
// needed because a worker is killed between visits: without it the setting
// would be forgotten and the app would go stale again on the next load.
function smdNoCacheEnabled() {
  try {
    return localStorage.getItem(smdKey("noCache")) === "true";
  } catch (e) {
    return false;
  }
}

// The worker that will serve the NEXT request. `controller` is null on a first
// visit (or before the worker claims the page), and dropping the setting then
// would leave the worker in cache-first mode for the reload that follows.
function smdActiveWorker() {
  if (!window.navigator || !navigator.serviceWorker) return Promise.resolve(null);
  if (navigator.serviceWorker.controller) return Promise.resolve(navigator.serviceWorker.controller);
  return navigator.serviceWorker.getRegistration().then(function(reg) {
    return (reg && (reg.active || reg.waiting || reg.installing)) || null;
  }).catch(function() { return null; });
}

function smdTellWorkerNoCache(worker, enabled) {
  return new Promise(function(resolve) {
    if (!worker) return resolve(false);
    var settled = false;
    var timer = setTimeout(function() { finish(false); }, 2000);
    function finish(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }
    var channel = new MessageChannel();
    channel.port1.onmessage = function(event) {
      finish(!!(event.data || {}).enabled);
    };
    try {
      worker.postMessage({ type: "SET_NO_CACHE", enabled: !!enabled }, [channel.port2]);
    } catch (e) {
      finish(false);
    }
  });
}

// Push the stored setting to a worker (idempotent). Called on every boot from
// smdRegisterServiceWorker, so a worker that restarted picks the mode back up.
function smdPushNoCacheToWorker(worker) {
  if (!worker || !smdNoCacheEnabled()) return Promise.resolve(false);
  return smdTellWorkerNoCache(worker, true);
}

// Settings handler: persist, tell the worker, and let the caller reload so the
// new mode applies to the very next load (the current page's own files were
// already fetched before the switch flipped).
function smdSetNoCache(enabled) {
  try { localStorage.setItem(smdKey("noCache"), enabled ? "true" : "false"); } catch (e) { /* ignore */ }
  return smdActiveWorker().then(function(worker) {
    return smdTellWorkerNoCache(worker, enabled);
  });
}

// ---- Generic settings-page styles (used by every app's settingsPage) ----
var SETTINGS_STYLES = "";

function injectSettingsStyles() {
  var css = SETTINGS_STYLES;
  // CountMyDays (and future apps) add their own editor styles on top.
  if (typeof CMD_EDITOR_STYLES !== "undefined") css += "\n" + CMD_EDITOR_STYLES;
  injectStyleInto(document.body, css);
}
