// Theme engine + generic appearance/shell settings for SmdApp.
// Every function is registered onto SmdApp.prototype at the bottom AND exposed
// as a thin global facade so inline onchange handlers keep working.

const themeConfig = (() => {
  // Theme CSS paths are relative to the shared root; applyTheme() derives the
  // real href from the existing #bootstrap-theme-css link prefix, so this value
  // is informational only (kept relative to stay path-agnostic).
  const bw = "css/themes";
  return {
    brite:     { css: `${bw}/brite/bootstrap.min.css`,      bsTheme: "light" },
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
  const valid = themeConfig[name] ? name : "superhero";
  const config = themeConfig[valid] || themeConfig.superhero;
  const link = document.getElementById("bootstrap-theme-css");
  // Build the theme URL relative to the page (which may live under a sub-path
  // under a sub-path). Reuse the link's existing relative prefix so that both
  // the app root and /storybook/ resolve css/themes correctly.
  const v = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now();
  const prefix = link
    ? (link.getAttribute("href") || "").replace(/[^/]*\/bootstrap\.min\.css(\?.*)?$/, "")
    : smdAppRoot() + "css/themes/";
  if (link) {
    link.href = prefix + valid + "/bootstrap.min.css?v=" + v;
    // recompute the shared text colours once the new theme css has loaded
    link.addEventListener("load", applySmdVars, { once: true });
  }
  document.documentElement.setAttribute("data-bs-theme", config.bsTheme);
  document.documentElement.setAttribute("data-theme", name);
  localStorage.setItem(smdKey("theme"), name);
  // Theme override CSS: one shared light/dark file plus one per-theme file.
  // The Bootstrap theme files themselves are never modified.
  applyThemeOverrides(valid, config.bsTheme, prefix, v);
  applySmdVars();
}

// Wire the two theme-override stylesheets: `theme-override-mode` holds the
// light.css OR dark.css file (shared by every light/dark theme), and
// `theme-override-specific` holds css/themes/<theme>/<theme>.css. Links are
// created on demand (e.g. the storybook) right after the theme link so the
// override layering is theme base < overrides < shared/app styles.
function applyThemeOverrides(theme, bsTheme, prefix, v) {
  setOverrideLink("theme-override-mode", prefix + (bsTheme === "dark" ? "dark" : "light") + ".css?v=" + v);
  setOverrideLink("theme-override-specific", prefix + theme + "/" + theme + ".css?v=" + v);
}

function setOverrideLink(id, href) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("link");
    el.id = id;
    el.rel = "stylesheet";
    const themeLink = document.getElementById("bootstrap-theme-css");
    if (themeLink && themeLink.parentNode) themeLink.parentNode.insertBefore(el, themeLink.nextSibling);
    else document.head.appendChild(el);
  }
  el.href = href;
  el.addEventListener("load", applySmdVars, { once: true });
}

// Computed style of a hidden light-DOM probe carrying real Bootstrap classes.
// Theme CSS cannot reach into shadow roots, and Bootstrap's component vars are
// set on the component elements themselves (not on :root), so reading the
// probe's computed style is the only faithful source.
function smdBootstrapStyle(className) {
  if (typeof document === "undefined" || !document.body) return { color: "", backgroundColor: "" };
  const probe = /(^|\s)btn/.test(className) ? document.createElement("button") : document.createElement("span");
  if (probe.tagName === "BUTTON") probe.type = "button";
  probe.className = className;
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe);
  const style = { color: computed.color, backgroundColor: computed.backgroundColor };
  probe.remove();
  return style;
}

// Text colour for a theme-coloured surface — exactly as Bootswatch chose it.
function smdBootstrapColor(className) {
  return smdBootstrapStyle(className).color;
}

const SMD_BADGE_VARIANTS = ["primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];

function applySmdVars() {
  const root = document.documentElement;
  root.style.setProperty("--smd-primary", "var(--bs-primary, #0d6efd)");
  root.style.setProperty("--smd-secondary", "var(--bs-secondary, #6c757d)");
  root.style.setProperty("--smd-success", "var(--bs-success, #198754)");
  root.style.setProperty("--smd-danger", "var(--bs-danger, #dc3545)");
  root.style.setProperty("--smd-warning", "var(--bs-warning, #ffc107)");

  // Per-variant text colours, straight from the loaded Bootstrap theme.
  const secondaryText = smdBootstrapColor("btn btn-secondary") || "#fff";
  root.style.setProperty("--smd-primary-text", smdBootstrapColor("btn btn-primary") || "#fff");
  root.style.setProperty("--smd-secondary-text", secondaryText);
  root.style.setProperty("--smd-success-text", smdBootstrapColor("btn btn-success") || "#fff");
  root.style.setProperty("--smd-danger-text", smdBootstrapColor("btn btn-danger") || "#fff");
  root.style.setProperty("--smd-info-text", smdBootstrapColor("btn btn-info") || "#fff");
  root.style.setProperty("--smd-warning-text", smdBootstrapColor("btn btn-warning") || "#000");
  // Inactive smd-tab buttons sit on the secondary colour.
  root.style.setProperty("--smd-tab-text", secondaryText);

  // Badge background/text, exactly as Bootswatch renders `.badge.text-bg-*`.
  SMD_BADGE_VARIANTS.forEach((variant) => {
    const style = smdBootstrapStyle("badge text-bg-" + variant);
    if (style.backgroundColor) root.style.setProperty("--smd-badge-" + variant + "-bg", style.backgroundColor);
    if (style.color) root.style.setProperty("--smd-badge-" + variant + "-text", style.color);
  });
}

// Back-compat alias (older callers/tests): recompute all shared colour vars.
function updateTabTextColor() {
  applySmdVars();
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
  document.body.classList.remove("icon-size-xsmall", "icon-size-small", "icon-size-medium", "icon-size-large", "icon-size-xlarge", "icon-size-jumbo");
  document.body.classList.add("icon-size-" + value);
  // Optional app hook: push the new value (px) into <smd-image>.
  if (typeof applyImageSize === "function") applyImageSize();
}

// TILE DENSITY
function changeDensity(value) {
  localStorage.setItem(smdKey("density"), value);
  document.body.classList.remove("compact", "density-normal");
  if (value !== "normal") {
    document.body.classList.add(value);
  }
}

// TOUCH SIZE (drag handles + checkboxes)
function changeTouchSize(value) {
  localStorage.setItem(smdKey("touchSize"), value);
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
  if (savedFontSize !== "normal") {
    document.body.classList.add("font-size-" + savedFontSize);
  }

  const savedIconSize = localStorage.getItem(smdKey("iconSize")) || "medium";
  document.body.classList.add("icon-size-" + savedIconSize);

  const savedDensity = localStorage.getItem(smdKey("density")) || "normal";
  if (savedDensity !== "normal") {
    document.body.classList.add(savedDensity);
  }

  const savedSlideDuration = localStorage.getItem(smdKey("slideDuration")) || "0";
  applySlideDuration(savedSlideDuration);

  updateScreenResolution();
  window.addEventListener("resize", updateScreenResolution);

  applySmdVars();
  window.addEventListener("load", applySmdVars);

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

// ---- Generic settings-page shadow styles (used by every app's settingsPage) ----
var SETTINGS_STYLES = `
  .smd-tab-btn {
    padding: 0.5rem 0.25rem;
  }
  .smd-tab-panel *, .smd-tab-panel *::before, .smd-tab-panel *::after,
  #settingsFooter *, #settingsFooter *::before, #settingsFooter *::after {
    box-sizing: border-box;
  }
  .smd-tab-panel .row, #settingsFooter .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    width: 100%;
    max-width: 1040px;
    margin-bottom: 1.5rem;
  }
  .smd-tab-panel .col-md-8, #settingsFooter .col-md-8 { max-width: 1040px; }
  .smd-tab-panel .col-4, #settingsFooter .col-4 {
    flex: 0 0 33.333333%;
    max-width: 33.333333%;
    padding-right: 0.75rem;
  }
  .smd-tab-panel .col-8, #settingsFooter .col-8 {
    flex: 0 0 66.666667%;
    max-width: 66.666667%;
    padding-left: 0.75rem;
  }
  .smd-tab-panel .text-end, #settingsFooter .text-end { text-align: right; }
  .smd-tab-panel .form-label, #settingsFooter .form-label {
    margin-bottom: 0;
    font-weight: 500;
    color: var(--bs-body-color, #f8f9fa);
  }
  .smd-tab-panel .form-select,
  .smd-tab-panel .form-control {
    display: block;
    width: 100%;
    padding: 0.375rem 0.75rem;
    font-size: var(--smd-type-p, 0.95rem);
    font-weight: 400;
    line-height: 1.5;
    color: var(--bs-body-color, #f8f9fa);
    background-color: var(--bs-body-bg, #222222);
    background-clip: padding-box;
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
  }
  .smd-tab-panel .form-control-plaintext {
    display: block;
    width: 100%;
    padding: 0.375rem 0.75rem;
    color: var(--bs-body-color, #f8f9fa);
  }
  .smd-tab-panel .form-switch { padding-left: 0; }
  .smd-tab-panel .form-check-input[type="checkbox"] {
    width: 2.5em;
    height: 1.5em;
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
    vertical-align: middle;
    position: relative;
    background-color: var(--bs-secondary-bg, #495057);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 2em;
    cursor: pointer;
    transition: background-color 0.15s ease-in-out;
  }
  .smd-tab-panel .form-check-input[type="checkbox"]::before {
    content: "";
    position: absolute;
    top: 0.15em;
    left: 0.15em;
    width: 1.2em;
    height: 1.2em;
    border-radius: 50%;
    background-color: #fff;
    transition: transform 0.15s ease-in-out;
  }
  .smd-tab-panel .form-check-input[type="checkbox"]:checked {
    background-color: var(--bs-primary, #0d6efd);
    border-color: var(--bs-primary, #0d6efd);
  }
  .smd-tab-panel .form-check-input[type="checkbox"]:checked::before {
    transform: translateX(1em);
  }
  .smd-tab-panel .input-group {
    display: flex;
    align-items: stretch;
    width: 100%;
  }
  .smd-tab-panel .input-group > .form-control {
    flex: 1 1 auto;
    width: 1%;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .smd-tab-panel .input-group > .btn-outline-secondary {
    flex: 0 0 auto;
    border: 1px solid var(--bs-border-color, #6c757d);
    border-left: 0;
    background: var(--bs-tertiary-bg, #303030);
    color: var(--bs-secondary-color, #adb5bd);
    padding: 0.375rem 0.75rem;
    border-radius: 0 0.375rem 0.375rem 0;
    cursor: pointer;
  }
  .smd-tab-panel .btn {
    display: inline-block;
    padding: 0.375rem 0.75rem;
    font-size: var(--smd-type-h2, 1.25rem);
    line-height: 1.5;
    text-align: center;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    cursor: pointer;
  }
  .smd-tab-panel .btn-danger { background: var(--bs-danger, #e74c3c); color: var(--smd-danger-text, #fff); }
  .smd-tab-panel .btn-warning { background: var(--bs-warning, #f39c12); color: var(--smd-warning-text, #000); }
  .smd-tab-panel .btn-primary { background: var(--bs-primary, #0d6efd); color: var(--smd-primary-text, #fff); }
  .smd-tab-panel .editor-btn, .smd-tab-panel .btn-wide, .smd-tab-panel .w-100 { display: block; width: 100%; }
  .smd-tab-panel .mb-2 { margin-bottom: 0.5rem; }
  .smd-tab-panel .mb-3 { margin-bottom: 1rem; }
  .smd-tab-panel .mb-4 { margin-bottom: 1.5rem; }
  .smd-tab-panel .mt-1 { margin-top: 0.25rem; }
  .smd-tab-panel .mt-3 { margin-top: 1rem; }
  .d-none { display: none !important; }
  #settingsFooter .mt-3 { margin-top: 1rem; }
  #settingsFooter .mt-5 { margin-top: 3rem; }
  #settingsFooter .mb-3 { margin-bottom: 1rem; }
  #settingsFooter .small { font-size: var(--smd-type-p, 0.875em); }
  #settingsFooter .build-number { color: var(--bs-secondary-color, #adb5bd); }
`;

function injectSettingsStyles() {
  var css = SETTINGS_STYLES;
  // CountMyDays (and future apps) add their own editor styles on top.
  if (typeof CMD_EDITOR_STYLES !== "undefined") css += "\n" + CMD_EDITOR_STYLES;
  var sp = document.getElementById("settingsPage");
  if (sp && sp.shadowRoot) {
    injectStyleInto(sp.shadowRoot, css);
  }
  var tabs = $id("settingsTabs");
  if (tabs && tabs.shadowRoot) {
    injectStyleInto(tabs.shadowRoot, css);
  }
}
