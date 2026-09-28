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

function $id(id, root) {
  root = root || document;
  if (typeof root.getElementById === "function") {
    const el = root.getElementById(id);
    if (el) return el;
  }
  const base = root === document ? (root.body || root) : root;
  if (!base) return null;
  const walker = document.createTreeWalker(base, NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.shadowRoot) {
      const found = $id(id, node.shadowRoot);
      if (found) return found;
    }
  }
  return null;
}

function escapeHtml(str) {
  if (!str && str !== 0) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
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
      { text: "OK", variant: "primary", action: "ok" }
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
