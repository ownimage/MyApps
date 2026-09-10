// Theme engine + generic appearance/shell settings for SmdApp.
// Every function is registered onto SmdApp.prototype at the bottom AND exposed
// as a thin global facade so inline onchange handlers keep working.

const themeConfig = (() => {
  // Theme CSS paths are relative to the shared root; applyTheme() derives the
  // real href from the existing #bootstrap-theme-css link prefix, so this value
  // is informational only (kept relative to stay path-agnostic).
  const bw = "css/themes";
  return {
    cerulean:  { css: `${bw}/cerulean/bootstrap.min.css`,   bsTheme: "light" },
    cosmo:     { css: `${bw}/cosmo/bootstrap.min.css`,      bsTheme: "light" },
    cyborg:    { css: `${bw}/cyborg/bootstrap.min.css`,     bsTheme: "dark" },
    darkly:    { css: `${bw}/darkly/bootstrap.min.css`,     bsTheme: "dark" },
    flatly:    { css: `${bw}/flatly/bootstrap.min.css`,     bsTheme: "light" },
    journal:   { css: `${bw}/journal/bootstrap.min.css`,    bsTheme: "light" },
    litera:    { css: `${bw}/litera/bootstrap.min.css`,     bsTheme: "light" },
    lumen:     { css: `${bw}/lumen/bootstrap.min.css`,      bsTheme: "light" },
    lux:       { css: `${bw}/lux/bootstrap.min.css`,        bsTheme: "light" },
    materia:   { css: `${bw}/materia/bootstrap.min.css`,    bsTheme: "light" },
    minty:     { css: `${bw}/minty/bootstrap.min.css`,      bsTheme: "light" },
    morph:     { css: `${bw}/morph/bootstrap.min.css`,      bsTheme: "light" },
    pulse:     { css: `${bw}/pulse/bootstrap.min.css`,      bsTheme: "light" },
    quartz:    { css: `${bw}/quartz/bootstrap.min.css`,     bsTheme: "light" },
    sandstone: { css: `${bw}/sandstone/bootstrap.min.css`,  bsTheme: "light" },
    simplex:   { css: `${bw}/simplex/bootstrap.min.css`,    bsTheme: "light" },
    sketchy:   { css: `${bw}/sketchy/bootstrap.min.css`,    bsTheme: "light" },
    slate:     { css: `${bw}/slate/bootstrap.min.css`,      bsTheme: "dark" },
    solar:     { css: `${bw}/solar/bootstrap.min.css`,      bsTheme: "dark" },
    spacelab:  { css: `${bw}/spacelab/bootstrap.min.css`,   bsTheme: "light" },
    superhero: { css: `${bw}/superhero/bootstrap.min.css`,  bsTheme: "dark" },
    united:    { css: `${bw}/united/bootstrap.min.css`,     bsTheme: "light" },
    vapor:     { css: `${bw}/vapor/bootstrap.min.css`,      bsTheme: "dark" },
    yeti:      { css: `${bw}/yeti/bootstrap.min.css`,       bsTheme: "light" },
    zephyr:    { css: `${bw}/zephyr/bootstrap.min.css`,     bsTheme: "light" }
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

function applyTheme(name) {
  const valid = themeConfig[name] ? name : "darkly";
  const config = themeConfig[valid] || themeConfig.darkly;
  const link = document.getElementById("bootstrap-theme-css");
  if (link) {
    const v = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now();
    // Build the theme URL relative to the page (which may live under a sub-path
    // under a sub-path). Reuse the link's existing relative prefix so that both
    // the app root and /storybook/ resolve css/themes correctly.
    const rel = link.getAttribute("href") || "";
    const prefix = rel.replace(/[^/]*\/bootstrap\.min\.css(\?.*)?$/, "");
    link.href = prefix + valid + "/bootstrap.min.css?v=" + v;
  }
  document.documentElement.setAttribute("data-bs-theme", config.bsTheme);
  document.documentElement.setAttribute("data-theme", name);
  localStorage.setItem(smdKey("theme"), name);
  applySmdVars();
}

function applySmdVars() {
  const root = document.documentElement;
  root.style.setProperty("--smd-primary", "var(--bs-primary, #0d6efd)");
  root.style.setProperty("--smd-secondary", "var(--bs-secondary, #6c757d)");
  root.style.setProperty("--smd-success", "var(--bs-success, #198754)");
  root.style.setProperty("--smd-danger", "var(--bs-danger, #dc3545)");
  root.style.setProperty("--smd-warning", "var(--bs-warning, #ffc107)");
  root.style.setProperty("--smd-primary-text", "#fff");
}

function changeTheme(name) {
  applyTheme(name);
  if (typeof renderMain === "function") renderMain();
  if (typeof renderImagesEditor === "function") {
    const imagesEditor = document.getElementById("imagesEditor");
    if (imagesEditor && !imagesEditor.classList.contains("d-none")) renderImagesEditor();
  }
}

// FONT SIZE
function changeFontSize(value) {
  localStorage.setItem(smdKey("fontSize"), value);
  document.body.classList.remove("font-size-xsmall", "font-size-small", "font-size-normal", "font-size-large", "font-size-xlarge", "font-size-jumbo");
  if (value !== "normal") {
    document.body.classList.add("font-size-" + value);
  }
}

// ICON SIZE
function changeIconSize(value) {
  localStorage.setItem(smdKey("iconSize"), value);
  document.body.classList.remove("icon-size-small", "icon-size-medium", "icon-size-large");
  document.body.classList.add("icon-size-" + value);
}

// TILE DENSITY
function changeDensity(value) {
  localStorage.setItem(smdKey("density"), value);
  document.body.classList.remove("compact", "density-normal");
  if (value !== "normal") {
    document.body.classList.add(value);
  }
}

// DRAG SIZE
function changeDragSize(value) {
  localStorage.setItem(smdKey("dragSize"), value);
  document.body.classList.remove("drag-size-normal", "drag-size-large");
  document.body.classList.add("drag-size-" + value);
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
  if (document.getElementById("settingsPage").classList.contains("d-none") &&
      document.getElementById("streamsEditor").classList.contains("d-none") &&
      document.getElementById("imagesEditor").classList.contains("d-none")) {
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
  if (savedFontSize !== "normal") {
    document.body.classList.add("font-size-" + savedFontSize);
  }

  const savedIconSize = localStorage.getItem(smdKey("iconSize")) || "large";
  document.body.classList.add("icon-size-" + savedIconSize);

  const savedDensity = localStorage.getItem(smdKey("density")) || "normal";
  if (savedDensity !== "normal") {
    document.body.classList.add(savedDensity);
  }

  const savedDragSize = localStorage.getItem(smdKey("dragSize")) || "large";
  document.body.classList.add("drag-size-" + savedDragSize);

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
  applyTheme,
  applySmdVars,
  changeTheme,
  changeFontSize,
  changeIconSize,
  changeDensity,
  changeDragSize,
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