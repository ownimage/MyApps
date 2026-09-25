// Theme engine + generic appearance/shell settings for SmdApp.
// Every function is registered onto SmdApp.prototype at the bottom AND exposed
// as a thin global facade so inline onchange handlers keep working.

const themeConfig = (() => {
  // Theme CSS paths are relative to the shared root; applyTheme() derives the
  // real href from the existing #bootstrap-theme-css link prefix, so this value
  // is informational only (kept relative to stay path-agnostic).
  const bw = "css/themes";
  return {
    brite:     { css: `${bw}/brite/bootstrap.min.css`,      defaultMode: "light", bsTheme: "light" },
    cerulean:  { css: `${bw}/cerulean/bootstrap.min.css`,   defaultMode: "light", bsTheme: "light" },
    cosmo:     { css: `${bw}/cosmo/bootstrap.min.css`,      defaultMode: "light", bsTheme: "light" },
    cyborg:    { css: `${bw}/cyborg/bootstrap.min.css`,     defaultMode: "dark", bsTheme: "dark" },
    darkly:    { css: `${bw}/darkly/bootstrap.min.css`,     defaultMode: "dark", bsTheme: "dark" },
    flatly:    { css: `${bw}/flatly/bootstrap.min.css`,     defaultMode: "light", bsTheme: "light" },
    journal:   { css: `${bw}/journal/bootstrap.min.css`,    defaultMode: "light", bsTheme: "light" },
    litera:    { css: `${bw}/litera/bootstrap.min.css`,     defaultMode: "light", bsTheme: "light" },
    lumen:     { css: `${bw}/lumen/bootstrap.min.css`,      defaultMode: "light", bsTheme: "light" },
    lux:       { css: `${bw}/lux/bootstrap.min.css`,        defaultMode: "light", bsTheme: "light" },
    materia:   { css: `${bw}/materia/bootstrap.min.css`,    defaultMode: "light", bsTheme: "light" },
    minty:     { css: `${bw}/minty/bootstrap.min.css`,      defaultMode: "light", bsTheme: "light" },
    morph:     { css: `${bw}/morph/bootstrap.min.css`,      defaultMode: "light", bsTheme: "light" },
    pulse:     { css: `${bw}/pulse/bootstrap.min.css`,      defaultMode: "light", bsTheme: "light" },
    quartz:    { css: `${bw}/quartz/bootstrap.min.css`,     defaultMode: "light", bsTheme: "light" },
    sandstone: { css: `${bw}/sandstone/bootstrap.min.css`,  defaultMode: "light", bsTheme: "light" },
    simplex:   { css: `${bw}/simplex/bootstrap.min.css`,    defaultMode: "light", bsTheme: "light" },
    sketchy:   { css: `${bw}/sketchy/bootstrap.min.css`,    defaultMode: "light", bsTheme: "light" },
    slate:     { css: `${bw}/slate/bootstrap.min.css`,      defaultMode: "dark", bsTheme: "dark" },
    solar:     { css: `${bw}/solar/bootstrap.min.css`,      defaultMode: "dark", bsTheme: "dark" },
    spacelab:  { css: `${bw}/spacelab/bootstrap.min.css`,   defaultMode: "light", bsTheme: "light" },
    superhero: { css: `${bw}/superhero/bootstrap.min.css`,  defaultMode: "dark", bsTheme: "dark" },
    united:    { css: `${bw}/united/bootstrap.min.css`,     defaultMode: "light", bsTheme: "light" },
    vapor:     { css: `${bw}/vapor/bootstrap.min.css`,      defaultMode: "dark", bsTheme: "dark" },
    yeti:      { css: `${bw}/yeti/bootstrap.min.css`,       defaultMode: "light", bsTheme: "light" },
    zephyr:    { css: `${bw}/zephyr/bootstrap.min.css`,     defaultMode: "light", bsTheme: "light" }
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
const SMD_THEME_MODES = ["default", "light", "dark"];

function normalizeTheme(name) {
  const value = String(name || "");
  return Object.prototype.hasOwnProperty.call(themeConfig, value) ? value : SMD_DEFAULT_THEME;
}

function normalizeThemeMode(mode) {
  return SMD_THEME_MODES.indexOf(mode) !== -1 ? mode : "default";
}

function getStoredTheme() {
  return normalizeTheme(localStorage.getItem(smdKey("theme")));
}

function getStoredThemeMode() {
  return normalizeThemeMode(localStorage.getItem(smdKey("themeMode")));
}

function getThemeDefaultMode(theme) {
  const config = themeConfig[normalizeTheme(theme)] || themeConfig[SMD_DEFAULT_THEME];
  const mode = config.defaultMode || config.bsTheme || "light";
  return mode === "dark" ? "dark" : "light";
}

function resolveThemeMode(theme, mode) {
  const normalized = normalizeThemeMode(mode);
  return normalized === "default" ? getThemeDefaultMode(theme) : normalized;
}

function applyTheme(name, modeOverride) {
  const valid = normalizeTheme(name);
  const hasModeOverride = typeof modeOverride !== "undefined";
  const mode = hasModeOverride ? normalizeThemeMode(modeOverride) : getStoredThemeMode();
  const resolvedMode = resolveThemeMode(valid, mode);
  const link = document.getElementById("bootstrap-theme-css");
  const v = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now();
  const prefix = link
    ? (link.getAttribute("href") || "").replace(/[^/]*\/bootstrap\.min\.css(\?.*)?$/, "")
    : smdAppRoot() + "css/themes/";
  if (link) {
    link.href = prefix + valid + "/bootstrap.min.css?v=" + v;
  }
  document.documentElement.setAttribute("data-bs-theme", resolvedMode);
  document.documentElement.setAttribute("data-theme", valid);
  localStorage.setItem(smdKey("theme"), valid);
  if (!hasModeOverride) localStorage.setItem(smdKey("themeMode"), mode);
  applyThemeOverrides(valid, resolvedMode, prefix, v, true);
}

function applyThemeMode(theme, mode) {
  const valid = normalizeTheme(theme);
  const resolvedMode = resolveThemeMode(valid, mode);
  const link = document.getElementById("bootstrap-theme-css");
  const v = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now();
  const prefix = link
    ? (link.getAttribute("href") || "").replace(/[^/]*\/bootstrap\.min\.css(\?.*)?$/, "")
    : smdAppRoot() + "css/themes/";
  document.documentElement.setAttribute("data-bs-theme", resolvedMode);
  document.documentElement.setAttribute("data-theme", valid);
  applyThemeOverrides(valid, resolvedMode, prefix, v, false);
}

function applyThemeOverrides(theme, mode, prefix, v, updateSpecific) {
  setOverrideLink("theme-override-mode", prefix + mode + ".css?v=" + v);
  if (updateSpecific !== false) {
    setOverrideLink("theme-override-specific", prefix + theme + "/" + theme + ".css?v=" + v);
  }
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

// The shared functional sheet is the anchor for the mode/theme override sheets:
// cascade order is vendor -> theme bootstrap -> shared styles -> mode -> theme.
// Anchoring on #bootstrap-theme-css instead would push shared styles last, so the
// mode/theme sheets would no longer be the final override layer.
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
  const base = document.getElementById("bootstrap-theme-css");
  const mode = document.getElementById("theme-override-mode");
  const specific = document.getElementById("theme-override-specific");
  if (!base || !mode || !base.parentNode) return;
  const parent = base.parentNode;
  const anchor = themeOverrideAnchor();
  if (anchor && anchor.nextElementSibling !== mode) parent.insertBefore(mode, anchor.nextSibling);
  if (specific && mode.nextElementSibling !== specific) parent.insertBefore(specific, mode.nextSibling);
  // Without a shared sheet the overrides still have to follow the theme itself.
  if (!anchor && mode.previousElementSibling !== base) parent.insertBefore(mode, base.nextSibling);
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

// Register every shared setting as an SmdApp method (instance API for apps that
// extend SmdApp). The globals above remain the thin facade used by the app's
// inline onchange handlers and the storybook.
Object.assign(SmdApp.prototype, {
  themeConfig,
  smdAppRoot,
  normalizeTheme,
  normalizeThemeMode,
  getStoredTheme,
  getStoredThemeMode,
  getThemeDefaultMode,
  resolveThemeMode,
  applyTheme,
  applyThemeMode,
  changeTheme,
  changeThemeMode,
  changeFontSize,
  changeIconSize,
  changeDensity,
  changeTouchSize,
  applySlideDuration,
  changeSlideDuration,
  showNav,
  hideNav,
  resetAutoHideTimer,
  bindAutoHideEvents,
  unbindAutoHideEvents,
  changeAutoHideMenu,
  updateScreenResolution
});

// ---- Generic settings-page styles (used by every app's settingsPage) ----
var SETTINGS_STYLES = "";

function injectSettingsStyles() {
  var css = SETTINGS_STYLES;
  // CountMyDays (and future apps) add their own editor styles on top.
  if (typeof CMD_EDITOR_STYLES !== "undefined") css += "\n" + CMD_EDITOR_STYLES;
  injectStyleInto(document.body, css);
}
