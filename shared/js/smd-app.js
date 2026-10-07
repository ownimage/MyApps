// Shared application config + generic helpers for the MyApps shared library.
//
// NOTE: this file used to also define an SmdApp base class (boot-time asset
// loading, shell/menu rendering, page registry). No app ever instantiated it:
// every app uses a static index.html shell (document.write cache-busting) and
// drives <smd-page> directly, so the class and the SmdApp.prototype exports
// were removed as dead code. What remains are the globals every app + service
// relies on: SmdConfig, smdKey(), smdImagePrefix(), the <smd-modal> helper
// (showSmdModal/showInfoConfirm), the menu-visibility observer, $id/escapeHtml/
// escAttr, injectSmdComponentStyle() and injectStyleInto().

"use strict";

// ---- App-level config (mutated by the app's constructor) -------
var SmdConfig = {
  storagePrefix: "planmydays_", // default keeps existing apps' data intact
  imagePrefix: "",              // image-list namespace; "" = storagePrefix
  themeDefault: "superhero",
  appName: "Application"
};

// Namespace-string helper: `<prefix><name>`. All shared services read/write
// localStorage through this instead of hardcoding a vendor prefix.
function smdKey(name) {
  return SmdConfig.storagePrefix + (name || "");
}

// Namespace for the IMAGE LIST. All apps on the origin share one image library
// by setting SmdConfig.imagePrefix = "shared-" (key `shared-images`); apps that
// leave it "" keep their own `<storagePrefix>images` list.
function smdImagePrefix() {
  return SmdConfig.imagePrefix || SmdConfig.storagePrefix;
}

// Component-owned light-DOM mechanics. Keeping these rules next to the
// component avoids making shared/css/styles.css a second component stylesheet.
function injectSmdComponentStyle(id, css) {
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

// ---- Generic helpers (globals used by every app and shared service) ----
// The implementations live in shared/js/library.js (window.SmdLib); these thin
// global facades keep inline onclick handlers, app code and tests working.

function $id(id, root) {
  return SmdLib.$id(id, root);
}

function escapeHtml(str) {
  return SmdLib.escapeHtml(str);
}

function escAttr(str) {
  return SmdLib.escAttr(str);
}

// Single shared <smd-modal> host, driven by set option objects; resolves via
// the smd-modal-action event. Every app/modal flow uses showSmdModal.
let _smdModalHost = null;
function showSmdModal(options) {
  if (!_smdModalHost) {
    _smdModalHost = document.createElement("smd-modal");
    _smdModalHost.id = "smdConfirmModal";
    document.body.appendChild(_smdModalHost);
  }
  const modal = _smdModalHost;
  modal.title = options.title || "";
  modal.content = options.content || "";
  modal.buttons = options.buttons || [{ text: "OK", variant: "primary", action: "ok" }];
  const onAction = options.onAction;
  const handler = function(e) {
    modal.removeEventListener("smd-modal-action", handler);
    if (onAction) onAction(e.detail);
  };
  modal.addEventListener("smd-modal-action", handler);
  modal.show();
}

function showInfoConfirm(message) {
  showSmdModal({
    title: "Sample images loaded",
    content: escapeHtml(message).replace(/\n/g, "<br>"),
    buttons: [
      { text: "OK", variant: "success", action: "ok" }
    ]
  });
}

function updateNavState() {
  const nav = document.getElementById("mainNav");
  if (nav) nav.classList.toggle("nav-inactive", false);
}

function updateMainMenuVisibility() {
  const menu = document.getElementById("btnMainMenu");
  if (!menu) return;
  const pageIsOpen = Array.from(document.querySelectorAll("smd-page[open]")).length > 0;
  if (menu.hidden !== pageIsOpen) menu.hidden = pageIsOpen;
}

function observeMainMenuVisibility() {
  updateMainMenuVisibility();
  if (window.__smdMainMenuObserver || !document.body) return;
  window.__smdMainMenuObserver = new MutationObserver(updateMainMenuVisibility);
  window.__smdMainMenuObserver.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open", "class", "hidden"]
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observeMainMenuVisibility, { once: true });
} else {
  observeMainMenuVisibility();
}

// Light-DOM style injection: components render in the light DOM now, so page
// chrome styles are appended as plain <style> tags on document.head (deduped by
// text). The `root` argument is accepted for back-compat with callers that used
// to pass a shadow root; it is ignored. A single string argument is the css
// (this is how the editors call it: `injectStyleInto(JOBS_EDITOR_STYLES)`).
// With no css the SETTINGS_STYLES default applies.
function injectStyleInto(root, css) {
  if (css === undefined && typeof root === "string") {
    css = root;
  }
  css = css || (typeof SETTINGS_STYLES !== "undefined" ? SETTINGS_STYLES : "");
  if (!css) return;
  const text = css.replace(/^\s+|\s+$/g, "");
  const existing = Array.from(document.head.querySelectorAll("style")).some(
    (sheet) => sheet.textContent.replace(/^\s+|\s+$/g, "") === text
  );
  if (existing) return;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

// ---- Shared app-shell wiring (used by several apps) -------------------------
// These were copy-pasted into each app's js/app.js; they live here so the app
// entry points only keep their app-specific bits.

// The settings <smd-theme> component emits smd-theme-change; apply the chosen
// theme (and mode) through the shared theme engine.
function smdBindThemeChange() {
  if (window.__smdThemeChangeBound) return;
  window.__smdThemeChangeBound = true;
  document.addEventListener("smd-theme-change", function (e) {
    const detail = e.detail || {};
    if (detail.source === "mode" && typeof changeThemeMode === "function") {
      changeThemeMode(detail.mode);
    } else if (detail.theme && typeof changeTheme === "function") {
      changeTheme(detail.theme);
    }
  });
}

// Shared image-picker plumbing: an app calls window.__openImagePicker(cb) (from
// an <smd-image-select> Edit button); selecting/no-image/cancel resolves cb with
// the image name ("" / null for none) and hides #imagePickerPage.
// opts.manageBackground: also hide any open smd-pages (+ the main container)
// behind the picker and restore them on finish (PlanMyDay stacks editors).
function smdBindImagePicker(opts) {
  opts = opts || {};
  if (window.__smdImagePickerBound) return;
  window.__smdImagePickerBound = true;
  let pickerCallback = null;
  let pickerHost = null;
  let pickerCloseTimer = null;
  let pickerBackground = [];

  function hideBackground() {
    if (!opts.manageBackground || pickerBackground.length) return;
    const picker = document.getElementById("imagePickerPage");
    document.querySelectorAll("smd-page").forEach(function (page) {
      if (page === picker || !page.hasAttribute("open")) return;
      page.hide();
      page.classList.add("d-none");
      pickerBackground.push({ element: page, isPage: true });
    });
    const main = document.getElementById("countdownContainer");
    if (main && !main.classList.contains("d-none")) {
      main.classList.add("d-none");
      pickerBackground.push({ element: main, isPage: false });
    }
  }

  function restoreBackground() {
    if (!opts.manageBackground) return;
    pickerBackground.forEach(function (entry) {
      entry.element.classList.remove("d-none");
      if (entry.isPage) entry.element.show();
    });
    pickerBackground = [];
  }

  window.__openImagePicker = function (callback) {
    pickerCallback = callback || null;
    pickerHost = document.getElementById("imagePickerPage");
    if (!pickerHost) return;
    pickerHost.title = "Choose Image";
    pickerHost.content = '<smd-image-picker id="pickerHost" key-prefix="' + escAttr(smdImagePrefix()) + '"></smd-image-picker>';
    pickerHost.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "No Image", variant: "primary", action: "no-image" }
    ];
    if (!pickerHost.__pickerBound) {
      pickerHost.__pickerBound = true;
      pickerHost.addEventListener("smd-page-action", function (e) {
        const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
        if (action === "cancel" || action === "no-image") window.__finishImagePick(null);
      });
    }
    if (pickerCloseTimer) { clearTimeout(pickerCloseTimer); pickerCloseTimer = null; }
    hideBackground();
    pickerHost.classList.remove("d-none");
    pickerHost.show();
  };

  window.__finishImagePick = function (name) {
    if (pickerCallback) {
      const cb = pickerCallback;
      pickerCallback = null;
      cb(name);
    }
    if (pickerHost) {
      pickerHost.hide();
      restoreBackground();
      // The page slides off-screen on hide(), but Playwright counts an off-canvas
      // element as visible. Add d-none (after the slide for UI; immediately in tests).
      const ms = pickerHost.slideDuration || 0;
      if (pickerCloseTimer) clearTimeout(pickerCloseTimer);
      pickerCloseTimer = setTimeout(function () {
        pickerHost.classList.add("d-none");
        pickerCloseTimer = null;
      }, ms > 0 ? ms + 50 : 0);
    }
  };

  document.addEventListener("smd-image-picker-select", function (e) {
    window.__finishImagePick(e.detail ? e.detail.name : null);
  });
}

// Bind an app's <smd-image-select> Edit buttons to the shared picker. `routes`
// maps the element's id to a function that stores the picked name, e.g.
//   smdBindImageSelectActions({ jobImageSelect: (name) => { jobField("image", name); updateJobImagePreview(name); } });
function smdBindImageSelectActions(routes) {
  document.addEventListener("smd-image-select-action", function (e) {
    const path = e.composedPath ? e.composedPath() : [];
    const sel = (path && path.find(function (el) { return el && el.tagName === "SMD-IMAGE-SELECT"; })) || null;
    if (!sel || !sel.id || !routes[sel.id]) return;
    window.__openImagePicker(function (name) { routes[sel.id](name || ""); });
  });
}

// Images editor (shared smd-images.js) page + card-action wiring.
function smdBindImagesEditor() {
  const page = document.getElementById("imagesEditor");
  if (!page || page.__smdImagesEditorBound) return;
  page.__smdImagesEditorBound = true;
  page.addEventListener("smd-page-action", function (e) {
    const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
    if (action === "add") addNewImage();
    else if (action === "done") closeImagesEditor();
  });
  page.addEventListener("smd-image-card-action", function (e) {
    const action = e.detail && e.detail.action;
    const idx = e.detail && e.detail.index;
    if (action === "delete") confirmDeleteImage(idx);
    else if (action === "duplicate") duplicateImage(idx);
    else if (action === "edit") startEditImage(idx);
  });
}

// PWA pull-to-refresh: drag down from the top to reload. No-op without service
// workers (installed PWAs only) and binds once.
function smdEnablePullToRefresh() {
  if (!("serviceWorker" in navigator)) return;
  if (window.__smdPullToRefreshBound) return;
  window.__smdPullToRefreshBound = true;
  const THRESHOLD = 80;
  let startY = 0, pulling = false, pullDist = 0;
  const indicator = document.createElement("div");
  indicator.id = "pwa-pull-indicator";
  indicator.className = "position-fixed top-0 start-0 end-0 d-flex align-items-center justify-content-center overflow-hidden bg-body text-body";
  indicator.style.height = "0px";
  indicator.style.zIndex = "9999";
  indicator.style.transition = "height 0.1s";
  indicator.textContent = "\u21E9 Pull to refresh";
  document.body.appendChild(indicator);
  const spinner = document.createElement("div");
  spinner.id = "pwa-pull-spinner";
  spinner.className = "spinner-border text-primary position-fixed top-50 start-50 translate-middle d-none";
  document.body.appendChild(spinner);
  function adjustIcon(dist) {
    indicator.innerHTML = dist >= THRESHOLD ? "\u21E9 Release to refresh" : "\u21E9 Pull to refresh";
    indicator.style.height = Math.min(dist, 50) + "px";
  }
  document.addEventListener("touchstart", e => {
    if (window.scrollY !== 0) return;
    if (e.target.closest(".modal")) return;
    startY = e.touches[0].clientY; pulling = true; pullDist = 0;
  }, { passive: true });
  document.addEventListener("touchmove", e => {
    if (!pulling) return;
    if (e.defaultPrevented) { pulling = false; pullDist = 0; indicator.style.height = "0"; return; }
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { pullDist = 0; return; }
    pullDist = dy; adjustIcon(dy);
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (!pulling) return;
    pulling = false; indicator.style.height = "0";
    if (pullDist >= THRESHOLD) { spinner.classList.remove("d-none"); setTimeout(() => { location.reload(); }, 400); }
    pullDist = 0;
  }, { passive: true });
}

// ---- Shared settings-page framework ----------------------------------------
// Every app's js/app-settings.js (or js/settings.js) used to copy this
// #settingsTemplate -> smd-tabs/smd-page build, the open/close slide dance and
// the danger-row toggling. The apps keep their app-specific handlers and select
// restores; the shared machinery lives here.

let _smdSettingsSections = null;
let _smdSettingsFooterHtml = null;
let _smdSettingsCloseTimer = null;

// Parse #settingsTemplate ONCE into { sections, footerHtml } (buildNumber stamped).
function smdGetSettingsSections() {
  if (_smdSettingsSections) return { sections: _smdSettingsSections, footerHtml: _smdSettingsFooterHtml };
  const template = document.getElementById("settingsTemplate");
  if (!template) return { sections: [], footerHtml: "" };
  const clone = template.content.cloneNode(true);
  _smdSettingsSections = Array.from(clone.querySelectorAll(".smd-settings-tab")).map(sec => ({
    id: sec.dataset.tabId || null,
    title: sec.dataset.tab,
    content: sec.innerHTML
  }));
  const footer = clone.querySelector("#settingsFooter");
  _smdSettingsFooterHtml = (footer ? footer.outerHTML : "").replace(
    'id="buildNumber"></span>',
    'id="buildNumber">' + (typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "") + '</span>'
  );
  template.remove();
  return { sections: _smdSettingsSections, footerHtml: _smdSettingsFooterHtml };
}

// Build the #settingsPage content (tabs + footer + OK button). `extraStyles` is
// an optional app-specific CSS string injected after the shared settings styles.
function smdBuildSettingsPage(extraStyles) {
  const settingsPage = document.getElementById("settingsPage");
  if (!settingsPage) return;
  const { sections, footerHtml } = smdGetSettingsSections();
  settingsPage.title = "Settings";
  settingsPage.content = '<smd-tabs id="settingsTabs" narrow></smd-tabs>' + footerHtml;
  settingsPage.buttons = [{ text: "OK", variant: "success", action: "done" }];
  const tabsEl = $id("settingsTabs");
  if (tabsEl) { tabsEl.tabs = sections; tabsEl.bottomline = true; }
  injectSettingsStyles();
  if (extraStyles) injectStyleInto(extraStyles);
}

// Open #settingsPage: run onBeforeOpen (app hide-the-background), rebuild the
// content, show it, restore the SHARED select values (theme/mode, font/icon/
// density/touch-ish, auto-hide, show-danger + danger rows), then run the app's
// `restore()` for its own fields. `onDone` defaults to the app's closeSettings.
function smdSetupSettingsPage(opts) {
  opts = opts || {};
  if (opts.onBeforeOpen) opts.onBeforeOpen();
  const page = document.getElementById("settingsPage");
  if (!page) return;
  if (_smdSettingsCloseTimer) { clearTimeout(_smdSettingsCloseTimer); _smdSettingsCloseTimer = null; }
  page.classList.remove("d-none");
  if (opts.bindDone !== false && !page.__smdSettingsDoneBound) {
    page.__smdSettingsDoneBound = true;
    page.addEventListener("smd-page-action", function (e) {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "done") (opts.onDone || closeSettings)();
    });
  }
  smdBuildSettingsPage(opts.extraStyles);
  page.show();

  const savedTheme = getStoredTheme();
  const savedThemeMode = getStoredThemeMode();
  const themeSel = $id("themeSelector");
  if (themeSel) { themeSel.setAttribute("theme", savedTheme); themeSel.setAttribute("mode", savedThemeMode); }

  const savedFontSize = localStorage.getItem(smdKey("fontSize")) || "xlarge";
  const fontSizeSel = $id("fontSizeSelector");
  if (fontSizeSel) fontSizeSel.value = savedFontSize;

  const savedIconSize = localStorage.getItem(smdKey("iconSize")) || "medium";
  const iconSel = $id("iconSizeSelector");
  if (iconSel) iconSel.value = savedIconSize;

  const savedDensity = localStorage.getItem(smdKey("density")) || "normal";
  const densitySel = $id("densitySelector");
  if (densitySel) densitySel.value = savedDensity;

  const autoHide = localStorage.getItem(smdKey("autoHideMenu")) === "true";
  const autoHideCb = $id("autoHideMenu");
  if (autoHideCb) autoHideCb.checked = autoHide;

  const showDanger = localStorage.getItem(smdKey("showDanger")) === "true";
  const showDangerCb = $id("showDanger");
  if (showDangerCb) showDangerCb.checked = showDanger;
  if (opts.dangerIds) smdToggleDangerRows(showDanger, opts.dangerIds);

  if (opts.restore) opts.restore();
}

// Hide #settingsPage immediately and add d-none once the slide finishes (the
// off-canvas page would otherwise still be "visible" to tests).
function smdHideSettingsPage() {
  const page = document.getElementById("settingsPage");
  if (page) {
    page.hide();
    if (_smdSettingsCloseTimer) clearTimeout(_smdSettingsCloseTimer);
    _smdSettingsCloseTimer = setTimeout(function () {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
}

// Show/hide a list of danger rows (ids) from the "Show danger" switch.
function smdToggleDangerRows(enabled, ids) {
  (ids || []).forEach(function (id) {
    const el = $id(id);
    if (el) el.classList.toggle("d-none", !enabled);
  });
}

// Persist + apply the "Show danger" switch for the given danger-row ids.
function smdChangeShowDanger(enabled, ids) {
  localStorage.setItem(smdKey("showDanger"), enabled);
  smdToggleDangerRows(enabled, ids);
}

// Icon size setting -> shared <smd-image> render size (px). `capSmall` also caps
// the size to 64px on <=480px screens (the apps whose original code did).
function smdApplyImageSize(capSmall) {
  const value = localStorage.getItem(smdKey("iconSize")) || "medium";
  let px = { xsmall: 32, small: 40, medium: 50, large: 64, xlarge: 80, jumbo: 100 }[value] || 50;
  if (capSmall && window.innerWidth <= 480) px = Math.min(px, 64);
  if (typeof SmdImage !== "undefined" && SmdImage.setDefaultSize) SmdImage.setDefaultSize(px);
}

// "Clear all data?" confirm. Clears ONLY this app's prefixed keys (the shared
// image library is left alone); `onClear` defaults to the app's closeSettings.
function smdConfirmClearAllData(opts) {
  opts = opts || {};
  showSmdModal({
    title: opts.title || "Clear All Data?",
    content: opts.content || "Clear all data? This cannot be undone.",
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Clear", variant: "danger", action: "clear" }
    ],
    onAction: function (detail) {
      if (detail.action !== "clear") return;
      const prefix = SmdConfig.storagePrefix;
      Object.keys(localStorage).forEach(function (key) {
        if (key.indexOf(prefix) === 0) localStorage.removeItem(key);
      });
      if (opts.onClear) opts.onClear();
      else if (typeof closeSettings === "function") closeSettings();
    }
  });
}

// Download `data` as pretty-printed JSON named `<baseName>-YYYYMMDDHHMM.json`.
function smdDownloadJson(data, baseName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const d = new Date();
  const ts = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") +
    String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
  a.download = baseName + "-" + ts + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

// Prompt for a .json file and hand the parsed value to onJson. On a parse error
// onJson is called with `undefined` so the caller can show its own message.
function smdReadJsonFile(onJson) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      let data;
      try { data = JSON.parse(evt.target.result); } catch (err) { data = undefined; }
      onJson(data);
    };
    reader.readAsText(file);
  };
  input.click();
}
