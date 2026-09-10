// SmdApp — the shared application base class. Apps built on the shared library
// (the sibling `shared/` folder) extend this class (e.g. an app's js/app.js).
//
// The shared SERVICE FILES (smd-settings.js, smd-images.js, smd-minio.js) attach
// their methods onto SmdApp.prototype, so an app instance inherits them all.
// Every service reads its storage keys through smdKey(name) below, so the
// per-app storage prefix in SmdConfig is honoured everywhere.
//
// CONSUMER CONFIG (passed to the constructor / super()):
//   storagePrefix   — localStorage key namespace (e.g. "planmydays_")
//   themeDefault    — bootswatch theme name applied at boot
//   appName         — human app name
//   styles          — ["css/path", ...] stylesheets injected at boot (app + shared)
//   components      — ["button", "tabs", "page", ...] smd-* component names this
//                     app needs; each maps to SMD_SHARED_ROOT + "js/components/smd-<n>.js"
//   services        — ["smd-settings", ...] service file names this app needs;
//                     each maps to SMD_SHARED_ROOT + "js/<n>.js"
//   appScripts      — ["js/components/foo.js", ...] additional app scripts
//   menuItems       — menu items (label/action/page/select/divider/minio/button)
//   pages           — { id: { title, contentFn?/content, buttons?, onAction? } }
//   settingsSections / settingsFooterHtml — settings page tabs (+ footer)
//
// BOOT / LAZY LOADING
//   The consumer's index.html only needs ONE script tag (js/app.js). boot()
//   injects the declared stylesheet <link>s and <script> tags (styles.js first,
//   then services, components, app scripts) lazily + asynchronously, so an app
//   only ever fetches the pieces it declares. ONE build number is honoured:
//   BUILD_NUMBER comes from shared/js/build-number.js and cache-busts every
//   asset (app + shared alike).

"use strict";

// Absolute URL of the shared library root, derived from THIS script's own
// location (.../shared/js/smd-app.js -> .../shared/). This keeps the loader
// path-agnostic: it works from any app depth / sub-path without hardcoding a
// folder name. `document.currentScript` is valid for classic scripts (the
// library is always loaded via a classic <script>).
var SMD_SHARED_ROOT = (function () {
  var s = document.currentScript;
  if (s && s.src) {
    try { return new URL("../", s.src).href; } catch (e) { /* ignore */ }
  }
  return "shared/";
})();

// ---- App-level config (mutated by the app's constructor) -------
var SmdConfig = {
  storagePrefix: "planmydays_", // default keeps existing apps' data intact
  themeDefault: "darkly",
  appName: "Application"
};

// Namespace-string helper: `<prefix><name>`. All shared services read/write
// localStorage through this instead of hardcoding a vendor prefix.
function smdKey(name) {
  return SmdConfig.storagePrefix + (name || "");
}

// ---- Generic helpers exposed on SmdApp.prototype (and as globals) ----

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

// MODAL HELPERS
// Bootstrap ignores hide() while a modal's show transition is running, so track
// the fully-shown state and defer hide() until the "shown" event fires.
document.addEventListener("shown.bs.modal", function(e) { e.target.dataset.bsShown = "true"; });
document.addEventListener("hidden.bs.modal", function(e) { e.target.dataset.bsShown = "false"; });
function safeHideModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  const hide = () => bootstrap.Modal.getOrCreateInstance(el).hide();
  if (el.dataset.bsShown === "true") hide();
  else el.addEventListener("shown.bs.modal", hide, { once: true });
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

function injectStyleInto(root, css) {
  if (!root) return;
  css = css || SETTINGS_STYLES;
  SmdStyles.adoptStyles(root, css);
}

// ---- The base class ----
class SmdApp {
  constructor(config) {
    config = config || {};
    if (typeof config.storagePrefix !== "undefined") SmdConfig.storagePrefix = config.storagePrefix;
    if (typeof config.themeDefault !== "undefined") SmdConfig.themeDefault = config.themeDefault;
    if (typeof config.appName !== "undefined") SmdConfig.appName = config.appName;
    this.config = Object.assign({}, SmdConfig, config);
    this.menuItems = config.menuItems || [];
    this.settingsSections = config.settingsSections || [];
    this.settingsFooterHtml = config.settingsFooterHtml || "";
    this.styles = config.styles || [];
    this.components = config.components || [];
    this.services = config.services || [];
    this.appScripts = config.appScripts || [];
    this.pages = config.pages || {};
    this._booted = false;
    SmdApp.current = this;
    window.SMD = this;
  }

  // Storage key helper (prefix-aware): this.key("theme") -> "planmydays_theme".
  key(name) { return smdKey(name); }

  // ---------------------------------------------------------------------------
  // Asset loading (lazy, ordered, cache-busted with the single build number)
  // ---------------------------------------------------------------------------

  // Build the cache-busting query for a URL using the one BUILD_NUMBER global.
  buildNumberFor(url) {
    const v = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "";
    if (!v) return url;
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + v;
  }

  // Inject a stylesheet <link>. Bootswatch theme stylesheets automatically get
  // id="bootstrap-theme-css" so applyTheme()/smdAppRoot() can find them.
  loadCss(path, id) {
    const autoThemeId = path.indexOf("css/themes/") !== -1 && /bootstrap\.min\.css/.test(path);
    id = id || (autoThemeId ? "bootstrap-theme-css" : "");
    if (id && document.getElementById(id)) { document.getElementById(id).href = this.buildNumberFor(path); return Promise.resolve(); }
    if (document.querySelector('link[href="' + path + '"]')) return Promise.resolve();
    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = this.buildNumberFor(path);
      if (id) link.id = id;
      link.onload = () => resolve();
      link.onerror = () => resolve(); // don't block boot on a missing sheet
      document.head.appendChild(link);
    });
  }

  // Inject a <script> asynchronously, resolving once it has executed.
  loadScript(path) {
    const src = this.buildNumberFor(path);
    if (document.querySelector('script[src="' + src + '"]')) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load " + path));
      document.head.appendChild(s);
    });
  }

  // Load many scripts strictly in order (dependencies like styles.js first).
  loadScriptsOrdered(paths) {
    return paths.reduce((p, path) => p.then(() => this.loadScript(path)), Promise.resolve());
  }

  // Inject all declared stylesheets (shared styles + app styles).
  loadStyles() {
    return Promise.all(this.styles.map((path) => this.loadCss(path)));
  }

  // Inject styles.js + the declared smd-* components (in order).
  loadComponents() {
    const paths = [];
    if (this.components.indexOf("styles") === -1) paths.push(SMD_SHARED_ROOT + "js/components/styles.js");
    this.components.forEach((name) => {
      paths.push(SMD_SHARED_ROOT + "js/components/" + (name.indexOf("smd-") === 0 ? name : "smd-" + name) + ".js");
    });
    return this.loadScriptsOrdered(paths);
  }

  // Inject the declared shared service files.
  loadServices() {
    const paths = this.services.map((name) => SMD_SHARED_ROOT + "js/" + name + ".js");
    return this.loadScriptsOrdered(paths);
  }

  // Inject the app's own scripts.
  loadAppScripts() {
    return this.loadScriptsOrdered(this.appScripts || []);
  }

  // Lazy-load a single shared component on demand (after boot).
  ensureComponent(name) {
    const path = SMD_SHARED_ROOT + "js/components/" + (name.indexOf("smd-") === 0 ? name : "smd-" + name) + ".js";
    return this.loadScript(path);
  }

  // ---- Boot: inject everything, then render the shell + first page ----
  boot() {
    if (this._booted) return Promise.resolve();
    this._booted = true;
    return Promise.resolve()
      .then(() => this.loadScriptsOrdered([SMD_SHARED_ROOT + "js/build-number.js"]))
      .then(() => this.loadStyles())
      .then(() => this.loadComponents())
      .then(() => this.loadServices())
      .then(() => this.loadAppScripts())
      .then(() => this.init());
  }

  init() {
    // Apply the saved (or default) theme.
    const savedTheme = localStorage.getItem(this.key("theme")) || this.config.themeDefault || "darkly";
    if (typeof applyTheme === "function") applyTheme(savedTheme);

    this.renderShell();
    this.renderMenu();
    if (typeof this.configure === "function") this.configure();
    if (typeof this.onReady === "function") this.onReady();
  }

  // Build the app shell: nav + main host. Override renderMain() for the
  // initial page content; registerPage()/openPage() manage smd-page overlays.
  renderShell() {
    if (!document.getElementById("main")) {
      const div = document.createElement("div");
      div.id = "main";
      document.body.appendChild(div);
    }
    if (!document.getElementById("mainNav")) {
      const nav = document.createElement("nav");
      nav.id = "mainNav";
      nav.className = "navbar navbar-expand px-3 py-2 gap-1 flex-wrap";
      nav.innerHTML =
        '<div class="dropdown">' +
          '<button id="btnMainMenu" class="btn p-1" data-bs-toggle="dropdown" title="Menu" aria-label="Menu">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 16 16">' +
              '<path fill-rule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/>' +
            '</svg>' +
          '</button>' +
          '<ul class="dropdown-menu"></ul>' +
        '</div>';
      document.body.insertBefore(nav, document.body.firstChild);
    }
    // Page hosts are appended to #main; registerPage/openPage lazily create them.
    return this;
  }

  // Build the main menu from this.menuItems. Each item:
  //   { label, action: "fn()" } | { label, page: "pageId" } | { label, select: fn }
  //   { divider?, minio?, button? }
  renderMenu(root) {
    root = root || document.getElementById("mainNav");
    if (!root) return null;
    const ul = root.querySelector(".dropdown-menu");
    if (!ul) return root;
    ul.innerHTML = this.menuItems.map(function (item, i) {
      if (item.divider) {
        return '<li><hr class="dropdown-divider' + (item.minio ? ' minio-menu-item' : '') + '"' + (item.minio ? ' style="display:none"' : '') + '></li>';
      }
      const cls = "dropdown-item" + (item.minio ? " minio-menu-item" : "");
      const style = item.minio ? ' style="display:none"' : '';
      const tag = item.button ? "button" : "a";
      const type = item.button ? ' type="button"' : "";
      if (item.page) {
        return '<li><' + tag + classAndMore(cls, style) + type + ' data-page="' + escAttr(item.page) + '">' + escapeHtml(item.label) + '</' + tag + '></li>';
      }
      if (typeof item.select === "function") {
        return '<li><' + tag + classAndMore(cls, style) + type + ' data-select="' + i + '">' + escapeHtml(item.label) + '</' + tag + '></li>';
      }
      return '<li><' + tag + classAndMore(cls, style) + type + ' onclick="' + item.action + '">' + escapeHtml(item.label) + '</' + tag + '></li>';
    }).join("");
    ul.querySelectorAll("[data-page]").forEach(function (el) {
      el.addEventListener("click", function () {
        const id = el.getAttribute("data-page");
        if (window.SMD && window.SMD.openPage) window.SMD.openPage(id);
      });
    });
    ul.querySelectorAll("[data-select]").forEach(function (el) {
      el.addEventListener("click", function () {
        const fn = window.SMD.menuItems[parseInt(el.getAttribute("data-select"), 10)];
        if (fn && typeof fn.select === "function") fn.select();
      });
    });
    return root;
  }

  // Register an smd-page overlay. cfg: { title?, content?|contentFn?, buttons?, onAction? }
  registerPage(id, cfg) {
    this.pages[id] = cfg || {};
    return this;
  }

  // Lazily create the <smd-page id="..."> host (once) and show it.
  // cfg options:
  //   open: fn(page) OR "methodName" — full-page builder (sets title/content/buttons itself)
  //   title / content / buttons — applied when `open` is absent
  //   afterOpen: fn(page) OR "methodName" — runs after the page is shown (e.g. restore form state)
  //   onAction(detail, page) OR "methodName" — handles smd-page-action
  openPage(id) {
    const cfg = this.pages[id];
    if (!cfg) return;
    let page = document.getElementById(id) || this._createPageHost(id);

    if (typeof cfg.open === "string") {
      if (typeof this[cfg.open] === "function") this[cfg.open](page);
    } else if (typeof cfg.open === "function") {
      cfg.open.call(this, page);
    } else {
      if (cfg.content !== undefined) page.content = cfg.content;
      if (cfg.title) page.title = cfg.title;
      if (cfg.buttons) page.buttons = cfg.buttons;
    }

    page.classList.remove("d-none");
    page.show();
    this._bindPageAction(page, id);

    if (typeof cfg.afterOpen === "string" && typeof this[cfg.afterOpen] === "function") this[cfg.afterOpen](page);
    else if (typeof cfg.afterOpen === "function") cfg.afterOpen.call(this, page);
    return page;
  }

  closePage(id) {
    const page = document.getElementById(id);
    if (!page) return;
    page.hide();
    setTimeout(() => page.classList.add("d-none"), 150);
  }

  closePages() {
    // Page hosts live on <body>, NOT inside #main (renderMain replaces #main's
    // innerHTML and would destroy hosts appended there).
    document.querySelectorAll("smd-page:not([hidden])").forEach((page) => {
      page.hide();
      page.classList.add("d-none");
    });
  }

  _createPageHost(id) {
    const page = document.createElement("smd-page");
    page.id = id;
    page.classList.add("d-none");
    // Append to <body>: `openPage`/`renderMain` re-write #main.innerHTML, which
    // would wipe hosts nested inside it.
    document.body.appendChild(page);
    // Lazily-created hosts must honour the persisted slide speed too (smd-settings
    // only applies it to pages present at boot).
    const ms = parseInt(localStorage.getItem(smdKey("slideDuration")) || "0", 10);
    page.slideDuration = isNaN(ms) ? 0 : ms;
    return page;
  }

  _bindPageAction(page, id) {
    if (page.__smdPageActionBound) return;
    page.__smdPageActionBound = true;
    page.addEventListener("smd-page-action", (e) => {
      const cfg = this.pages[id] || {};
      const detail = e.detail || {};
      if (typeof cfg.onAction === "string" && typeof this[cfg.onAction] === "function") this[cfg.onAction](detail, page);
      else if (typeof cfg.onAction === "function") cfg.onAction.call(this, detail, page);
      else if (detail.action && typeof this["on" + detail.action] === "function") this["on" + detail.action](detail);
    });
  }

  // Build the settings page content from this.settingsSections (+ footer).
  buildSettingsContent() {
    const settingsPage = document.getElementById("settingsPage");
    if (!settingsPage) return;
    const sections = this.settingsSections;
    const footerHtml = this.settingsFooterHtml;

    settingsPage.title = "Settings";
    settingsPage.content = '<smd-tabs id="settingsTabs"></smd-tabs>' + footerHtml;
    settingsPage.buttons = [{ text: "Done", variant: "success", action: "done" }];

    const tabsEl = $id("settingsTabs");
    if (tabsEl) {
      tabsEl.tabs = sections;
      tabsEl.bottomline = true;
    }
    if (typeof injectSettingsStyles === "function") injectSettingsStyles();
  }
}

function classAndMore(cls, style) {
  return ' class="' + cls + '"' + style;
}