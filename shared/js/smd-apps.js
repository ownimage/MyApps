// shared/js/smd-apps.js — the app registry and the Launch menu configuration.
//
// The Launch grid, the Launch settings "Menu" tab and the per-app "Launch"
// flyout submenu all read this ONE shared source. Every app on the origin shares
// localStorage, so the config the Launch app writes is visible everywhere.
//
// Config key: "launch_appMenu" (origin-wide) = an ordered array of
//   { path, onLaunch, onMenu }.
// Unknown paths are dropped and newly registered apps are appended with both
// ticks ON, so the stored list self-heals whenever `APPS` changes.
//
// `path` is relative to the repo root; Launch itself is "" (the root index).
// `icon` is the NAME of a shared sample image (the `shared-images` store).
(function (global) {
  "use strict";

  var MENU_KEY = "launch_appMenu";

  var APPS = [
    { name: "Plan My Day", description: "Plan your day and track important events", path: "PlanMyDay/", icon: "Plan My Day" },
    { name: "Count My Days", description: "Track countdowns to important events", path: "CountMyDays/", icon: "Count My Days" },
    { name: "QR Links", description: "Share links as QR codes", path: "QRLinks/", icon: "QR Links" },
    { name: "Solar Controlar", description: "Solar energy monitoring dashboard", path: "SolarControlar/", icon: "Solar Controlar" },
    { name: "FreeFormOX", description: "A tactical 5x5 Tic-Tac-Toe game", path: "FreeFormOX/", icon: "Noughts & Crosses" },
    { name: "List of Lists", description: "Organise anything into categories, lists and list items", path: "ListOfLists/", icon: "List of Lists" },
    // `navTitle` overrides the name shown in the nav bar (see mountAppTitle):
    //   - a string replaces `name` (Launch's page is titled "My Apps"),
    //   - `false` opts OUT of a nav title entirely (My HID already shows
    //     the running server app's name next to the hamburger).
    { name: "My HID", description: "Remote control buttons for this computer", path: "MyHID/", icon: "My HID", navTitle: false },
    { name: "Storyboard", description: "Place stickers and text anywhere on a storyboard", path: "Storyboard/", icon: "Storyboard" },
    { name: "Launch", description: "Open the app launcher", path: "", icon: "Launch", navTitle: "My Apps" }
  ];

  function appByPath(path) {
    for (var i = 0; i < APPS.length; i++) if (APPS[i].path === path) return APPS[i];
    return null;
  }

  // Stored order (known paths only), then any registered app that is missing,
  // in registry order, with both ticks on.
  function loadConfig() {
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem(MENU_KEY) || "null"); } catch (e) { stored = null; }
    var out = [], seen = {};
    if (Array.isArray(stored)) {
      stored.forEach(function (s) {
        if (!s || typeof s.path !== "string" || seen[s.path] || !appByPath(s.path)) return;
        seen[s.path] = true;
        out.push({ path: s.path, onLaunch: s.onLaunch !== false, onMenu: s.onMenu !== false });
      });
    }
    APPS.forEach(function (a) {
      if (seen[a.path]) return;
      out.push({ path: a.path, onLaunch: true, onMenu: true });
    });
    return out;
  }

  function saveConfig(cfg) {
    try { localStorage.setItem(MENU_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  // Config joined with the registry metadata, in display order.
  function entries() {
    return loadConfig().map(function (s) {
      var app = appByPath(s.path) || { name: s.path, description: "", icon: "" };
      return {
        path: s.path, name: app.name, description: app.description, icon: app.icon,
        onLaunch: s.onLaunch, onMenu: s.onMenu
      };
    });
  }

  function launchApps() { return entries().filter(function (e) { return e.onLaunch; }); }
  function menuApps() { return entries().filter(function (e) { return e.onMenu; }); }

  function setFlag(path, field, value) {
    var cfg = loadConfig();
    cfg.forEach(function (s) { if (s.path === path) s[field] = !!value; });
    saveConfig(cfg);
  }

  // Persist a new display order. `paths` is the new ordered list of app paths;
  // any config entry not mentioned is appended so nothing is ever lost.
  function reorder(paths) {
    var byPath = {};
    loadConfig().forEach(function (s) { byPath[s.path] = s; });
    var out = [], seen = {};
    (paths || []).forEach(function (p) {
      if (byPath[p] && !seen[p]) { seen[p] = true; out.push(byPath[p]); }
    });
    loadConfig().forEach(function (s) { if (!seen[s.path]) out.push(s); });
    saveConfig(out);
  }

  // Relative hrefs resolve against the CURRENT page, so the prefix that walks
  // back to the repo root differs by page depth ("" on the Launch root, "../"
  // from a sub-app). Derive it ONCE from this module's own URL (always
  // "<repo-root>/shared/js/smd-apps.js") — the same trick smd-app.js uses for
  // SMD_SHARED_ROOT — so callers stay depth-agnostic and never hardcode a path.
  var _base = (function () {
    try {
      var src = document.currentScript && document.currentScript.src;
      if (!src) return "";
      var root = src.replace(/shared\/js\/smd-apps\.js(\?.*)?$/, ""); // "<origin><repo-root>/"
      var here = location.href.split(/[?#]/)[0];
      if (here.indexOf(root) !== 0) return "";
      var rel = here.slice(root.length); // "" | "PlanMyDay/" | "PlanMyDay/index.html"
      var depth = (rel.match(/\//g) || []).length;
      return new Array(depth + 1).join("../");
    } catch (e) { return ""; }
  })();

  // Relative href from the current page to another app ("" is Launch itself).
  function href(path) { return _base + (path || ""); }

  // The registry `path` of the app hosting the CURRENT page ("" = Launch, the
  // repo root). Derived from the same module-URL trick as `_base`: the page path
  // relative to the repo root is matched against the registered `APPS[].path`
  // values, longest prefix first, so a grouped app is not mistaken for its group.
  var _currentPath = (function () {
    try {
      var src = document.currentScript && document.currentScript.src;
      if (!src) return null;
      var root = src.replace(/shared\/js\/smd-apps\.js(\?.*)?$/, "");
      var here = location.href.split(/[?#]/)[0];
      if (here.indexOf(root) !== 0) return null;
      var rel = here.slice(root.length);
      // Longest registered prefix wins, so an app nested inside a group folder
      // matches its own (longer) path rather than the group folder's.
      var best = "";
      APPS.forEach(function (a) {
        if (!a.path) return;
        if (rel.indexOf(a.path) === 0 && a.path.length > best.length) best = a.path;
      });
      if (best) return best;
      var m = rel.match(/^([^/]+)\//);
      return m ? m[1] + "/" : "";
    } catch (e) { return null; }
  })();

  function currentPath() { return _currentPath; }

  // ---- Launch flyout submenu ------------------------------------------------

  var SUBMENU_CSS = `
    #mainNav .dropdown-submenu { position: relative; }
    #mainNav .dropdown-submenu > .dropdown-menu {
      position: absolute; top: 0; left: 100%; margin: 0;
    }
    #mainNav .dropdown-submenu > .dropdown-menu > li > a { white-space: nowrap; }
    #mainNav .dropdown-submenu:hover > .dropdown-menu,
    #mainNav .dropdown-submenu.submenu-open > .dropdown-menu { display: block; }
    #mainNav .launch-submenu-toggle::after {
      content: ""; display: inline-block; margin-left: 0.4em; vertical-align: middle;
      border-top: 0.3em solid transparent; border-bottom: 0.3em solid transparent;
      border-left: 0.3em solid currentColor;
    }
  `;

  function ensureSubmenuStyle() {
    if (typeof injectSmdComponentStyle === "function") injectSmdComponentStyle("smd-launch-submenu", SUBMENU_CSS);
  }

  var _submenuOutsideBound = false;

  // Replace the static "Launch" menu item in #mainNav with a group header that
  // opens a flyout of every app whose "Show in Menu" tick is on. Called on boot
  // by every app (see the DOMContentLoaded hook at the bottom).
  function buildLaunchSubmenu() {
    var nav = document.getElementById("mainNav");
    if (!nav) return;
    var items = nav.querySelectorAll(".dropdown-menu > li > a.dropdown-item");
    var launchLi = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].textContent.replace(/^\s+|\s+$/g, "") === "Launch") { launchLi = items[i].parentNode; break; }
    }
    if (!launchLi || launchLi.classList.contains("dropdown-submenu")) return;

    ensureSubmenuStyle();

    var li = document.createElement("li");
    li.className = "dropdown-submenu";

    var toggle = document.createElement("a");
    toggle.className = "dropdown-item launch-submenu-toggle";
    toggle.setAttribute("role", "button");
    toggle.setAttribute("aria-haspopup", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Launch";

    var menu = document.createElement("ul");
    menu.className = "dropdown-menu launch-submenu-menu";
    menuApps().forEach(function (app) {
      var a = document.createElement("a");
      a.className = "dropdown-item";
      a.href = href(app.path) || "./";
      a.textContent = app.name;
      var eli = document.createElement("li");
      eli.appendChild(a);
      menu.appendChild(eli);
    });

    li.appendChild(toggle);
    li.appendChild(menu);
    launchLi.parentNode.replaceChild(li, launchLi);

    if (!_submenuOutsideBound) {
      _submenuOutsideBound = true;
      // Close any open flyout when clicking elsewhere. The toggle's own click
      // stops propagation so this never closes the submenu it just opened.
      document.addEventListener("click", function () {
        document.querySelectorAll("#mainNav .dropdown-submenu.submenu-open").forEach(function (el) {
          el.classList.remove("submenu-open");
          var t = el.querySelector(".launch-submenu-toggle");
          if (t) t.setAttribute("aria-expanded", "false");
        });
      });
    }

    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = li.classList.toggle("submenu-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // ---- App name in the nav bar ----------------------------------------------

  // Put the app's FULL NAME in the toolbar, right next to the hamburger button.
  // The name comes from the registry above (so the nav and the Launch submenu
  // can never disagree), resolved from the CURRENT page's path. An app whose
  // entry sets `navTitle: false` (My HID) gets no title. Idempotent, and
  // a no-op on pages without a #mainNav (the Storybook, the card viewer frames).
  function mountAppTitle() {
    var nav = document.getElementById("mainNav");
    if (!nav || document.getElementById("appNavTitle")) return;
    var app = _currentPath === null ? null : appByPath(_currentPath);
    if (!app) return;
    var title = app.navTitle === undefined ? app.name : app.navTitle;
    if (!title) return;

    var span = document.createElement("span");
    span.id = "appNavTitle";
    // `navbar-text` aligns the text in the navbar; `mb-0` keeps its default
    // bottom margin from changing the bar height.
    span.className = "navbar-text fw-semibold mb-0";
    span.textContent = title;

    // Directly after the hamburger's dropdown wrapper so it reads as part of the
    // same control group; falls back to the start of the bar.
    var btn = document.getElementById("btnMainMenu");
    var anchor = btn && btn.closest ? btn.closest(".dropdown") : null;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(span, anchor.nextSibling);
    else nav.appendChild(span);

    // The toolbar hides its hamburger while a secondary page is open; keep the
    // title in step (smd-app.js owns that rule and is loaded before this file).
    if (typeof updateMainMenuVisibility === "function") updateMainMenuVisibility();
  }

  function boot() {
    try { buildLaunchSubmenu(); } catch (e) { /* never break app boot */ }
    try { mountAppTitle(); } catch (e) { /* never break app boot */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.SmdApps = {
    APPS: APPS,
    MENU_KEY: MENU_KEY,
    appByPath: appByPath,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    entries: entries,
    launchApps: launchApps,
    menuApps: menuApps,
    setFlag: setFlag,
    reorder: reorder,
    href: href,
    currentPath: currentPath,
    buildLaunchSubmenu: buildLaunchSubmenu,
    mountAppTitle: mountAppTitle
  };
})(window);
