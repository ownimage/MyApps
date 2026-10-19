// smd-contrast.js — WCAG AA (4.5:1) contrast normalisation for BUTTON and TAB text.
//
// Bootswatch ships literal `--bs-btn-color` values (usually white) that often
// fail AA on that theme's own accent surfaces - journal's warning button is
// white on #f5e625 (1.29:1), minty's is 1.47:1, and the `.text-bg-*` tab
// colours are just as theme-dependent. CSS cannot measure contrast, so this
// module runs after a theme/mode change, measures the surfaces the browser will
// actually paint, and overrides the text colour ONLY where the theme's own
// choice fails AA. Candidates, in order:
//   1. the theme's own colour, when it already passes - left completely alone;
//   2. the better of --bs-body-color / --bs-body-bg (the user's rule);
//   3. black / white, which always reach 4.58:1 or better on an opaque surface.
// So a theme keeps its own look wherever that look is already readable, and only
// genuinely unreadable labels are repainted.
//
// Every state is judged separately: Bootstrap reads `--bs-btn-color`,
// `--bs-btn-hover-color`, `--bs-btn-active-color` and `--bs-btn-disabled-color`
// off the `.btn-<variant>` element, so setting all four there fixes the whole
// button without pseudo-class rules (the hover/active surfaces can differ from
// the base one, so each picks its own colour). Translucent surfaces (quartz's
// `--bs-secondary` is rgba(255,255,255,.4)) are composited over the page
// background before measuring, because that is what the eye sees.
//
// The overrides go into ONE <style> appended to <head>, so they beat the theme
// sheets by source order. Re-running is idempotent and stateless: the previous
// sheet is removed before measuring, so a theme swap is never judged against our
// own output, and a theme with nothing to fix leaves no style element behind.
(function () {
  "use strict";

  var AA = 4.5;
  var STYLE_ID = "smd-contrast-overrides";
  // Bootstrap's own button variants; `.btn-link` is deliberately excluded (it is
  // not a filled surface and has no --bs-btn-* surface vars).
  var VARIANTS = ["primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];
  var BLACK = { r: 0, g: 0, b: 0, a: 1 };
  var WHITE = { r: 255, g: 255, b: 255, a: 1 };
  var _timer = null;

  // "rgb(r, g, b)" | "rgba(r, g, b, a)" | "color(srgb r g b [/ a])" | "#rgb" |
  // "#rrggbb" | "#rrggbbaa" | "transparent" -> {r,g,b,a} or null when unparseable
  // (e.g. a `var(...)` token from a custom property).
  function parseColor(value) {
    var s = String(value == null ? "" : value).trim();
    if (!s) return null;
    if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    var m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      var p = m[1].split(/[\s,\/]+/).filter(function (v) { return v !== ""; }).map(Number);
      if (p.length < 3 || p.some(isNaN)) return null;
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = s.match(/^color\(srgb\s+([^)]+)\)$/i);
    if (m) {
      var q = m[1].split(/[\s\/]+/).filter(function (v) { return v !== ""; }).map(Number);
      if (q.length < 3 || q.some(isNaN)) return null;
      return { r: q[0] * 255, g: q[1] * 255, b: q[2] * 255, a: q.length > 3 ? q[3] : 1 };
    }
    m = s.match(/^#([0-9a-f]{3,8})$/i);
    if (m) {
      var h = m[1];
      var hex = function (i) { return parseInt(h.slice(i, i + 2), 16); };
      if (h.length === 3 || h.length === 4) {
        return {
          r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16),
          a: h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1
        };
      }
      if (h.length === 6 || h.length === 8) {
        return { r: hex(0), g: hex(2), b: hex(4), a: h.length === 8 ? hex(6) / 255 : 1 };
      }
    }
    return null;
  }

  // `fg` (possibly translucent) painted over the opaque `bg`.
  function composite(fg, bg) {
    if (!fg) return bg;
    if (fg.a >= 1) return fg;
    return {
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1
    };
  }

  function luminance(c) {
    var f = function (v) {
      var x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    var hi = Math.max(x, y), lo = Math.min(x, y);
    return (hi + 0.05) / (lo + 0.05);
  }

  function rgbCss(c) {
    return "rgb(" + Math.round(c.r) + ", " + Math.round(c.g) + ", " + Math.round(c.b) + ")";
  }

  // The colour to use for `current` text on `surface`, or null when the theme's
  // own colour already passes (nothing to change).
  function pickTextColor(current, surface, bodyColor, bodyBg) {
    if (!current || !surface) return null;
    if (contrast(current, surface) >= AA) return null;
    // (2) the body palette, best of the two that actually passes AA
    var best = null;
    [bodyColor, bodyBg].forEach(function (c) {
      if (!c) return;
      var r = contrast(c, surface);
      if (r >= AA && (!best || r > best.ratio)) best = { color: c, ratio: r };
    });
    // (3) black/white always reach AA on an opaque surface
    if (!best) {
      [BLACK, WHITE].forEach(function (c) {
        var r = contrast(c, surface);
        if (!best || r > best.ratio) best = { color: c, ratio: r };
      });
    }
    return best.color;
  }

  // The surface a BUTTON STATE paints: its own `--bs-btn-*-bg` when the theme
  // sets one, otherwise the base surface (Bootstrap falls back the same way).
  function stateSurface(cs, name, baseSurface, pageBg) {
    var c = parseColor(cs.getPropertyValue(name));
    if (!c || c.a === 0) return baseSurface;
    return composite(c, pageBg);
  }

  // The theme's text colour for a state, falling back to the base colour.
  function stateColor(cs, name, baseColor) {
    var c = parseColor(cs.getPropertyValue(name));
    if (!c || c.a === 0) return baseColor;
    return c;
  }

  function buildCss() {
    if (!document.body) return "";
    var bodyCs = getComputedStyle(document.body);
    var pageBg = composite(parseColor(bodyCs.backgroundColor), WHITE);
    var bodyColor = parseColor(bodyCs.color);
    var bodyBg = parseColor(bodyCs.backgroundColor);

    var host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
    var probes = {};
    VARIANTS.forEach(function (v) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-" + v;
      b.textContent = "Probe";
      host.appendChild(b);
      probes[v] = b;
    });
    // Tabs live inside <smd-tabs> (the component's own rules are scoped to it),
    // so probe them there rather than as bare buttons.
    var tabs = document.createElement("smd-tabs");
    host.appendChild(tabs);
    var activeTab = document.createElement("button");
    activeTab.type = "button";
    activeTab.className = "nav-link smd-tab-btn text-bg-primary";
    var inactiveTab = document.createElement("button");
    inactiveTab.type = "button";
    inactiveTab.className = "nav-link smd-tab-btn text-bg-secondary";
    tabs.appendChild(activeTab);
    tabs.appendChild(inactiveTab);
    document.body.appendChild(host);

    var rules = [];
    try {
      VARIANTS.forEach(function (v) {
        var el = probes[v];
        var cs = getComputedStyle(el);
        var baseSurface = composite(parseColor(cs.backgroundColor), pageBg);
        var baseColor = parseColor(cs.color);
        // One entry per button state. The `--bs-btn-*-color` var keeps Bootstrap's
        // own machinery consistent, and the explicit `color` (with `!important`)
        // is what actually repaints: Bootswatch themes paint `.btn` text with a
        // literal colour (minty ships `.btn,.btn:hover{color:#fff}`) and the
        // `.text-bg-*` helpers use `color:#fff!important`, so a var override alone
        // loses.
        var states = [
          { sel: ".btn-" + v, varName: "--bs-btn-color", color: baseColor, surface: baseSurface },
          { sel: ".btn-" + v + ":hover, .btn-" + v + ":focus-visible", varName: "--bs-btn-hover-color",
            color: stateColor(cs, "--bs-btn-hover-color", baseColor),
            surface: stateSurface(cs, "--bs-btn-hover-bg", baseSurface, pageBg) },
          { sel: ".btn-" + v + ":active", varName: "--bs-btn-active-color",
            color: stateColor(cs, "--bs-btn-active-color", baseColor),
            surface: stateSurface(cs, "--bs-btn-active-bg", baseSurface, pageBg) },
          { sel: ".btn-" + v + ":disabled, .btn-" + v + ".disabled", varName: "--bs-btn-disabled-color",
            color: stateColor(cs, "--bs-btn-disabled-color", baseColor),
            surface: stateSurface(cs, "--bs-btn-disabled-bg", baseSurface, pageBg) }
        ];
        states.forEach(function (s) {
          s.picked = pickTextColor(s.color, s.surface, bodyColor, bodyBg);
        });
        if (!states.some(function (s) { return s.picked; })) return;
        // ALL four vars go on the base selector: Bootstrap reads `--bs-btn-*-color`
        // off the element in every state, so one rule drives the whole button and
        // the values stay introspectable (a `:hover`-scoped var is invisible when
        // the button is not hovered).
        var decls = states.filter(function (s) { return s.picked; })
          .map(function (s) { return "    " + s.varName + ": " + rgbCss(s.picked) + ";"; });
        // The explicit `color` is what actually repaints (see the header note).
        if (states[0].picked) decls.push("    color: " + rgbCss(states[0].picked) + " !important;");
        rules.push(".btn-" + v + " {\n" + decls.join("\n") + "\n}");
        states.slice(1).forEach(function (s) {
          if (!s.picked) return;
          rules.push(s.sel + " {\n    color: " + rgbCss(s.picked) + " !important;\n}");
        });
      });

      [["primary", activeTab], ["secondary", inactiveTab]].forEach(function (pair) {
        var variant = pair[0], el = pair[1];
        var cs = getComputedStyle(el);
        var surface = composite(parseColor(cs.backgroundColor), pageBg);
        var picked = pickTextColor(parseColor(cs.color), surface, bodyColor, bodyBg);
        if (!picked) return;
        var sel = "smd-tabs .smd-tab-btn.text-bg-" + variant;
        rules.push(
          sel + ",\n" + sel + ":hover,\n" + sel + ":focus-visible {\n    color: " + rgbCss(picked) + " !important;\n}"
        );
      });

      // MAIN MENU: styles.css paints the hamburger menu with the BODY surface and
      // the BODY colour, so that is the pair to guarantee. A theme's own body text
      // can be sub-AA (minty light is #888 on #fff = 3.54:1, morph 2.63:1) and the
      // menu is our chrome on a surface we forced, so it gets the same repair as
      // buttons and tabs.
      var menuText = pickTextColor(bodyColor, pageBg, bodyColor, bodyBg);
      if (menuText) {
        var menuSel = "#mainNav .dropdown-menu .dropdown-item";
        rules.push(
          menuSel + ",\n" + menuSel + ":hover,\n" + menuSel + ":focus,\n" + menuSel + ".active {\n    " +
          "color: " + rgbCss(menuText) + " !important;\n}"
        );
      }
    } finally {
      host.remove();
    }
    return rules.join("\n\n");
  }

  function applySmdContrastVars() {
    var old = document.getElementById(STYLE_ID);
    if (old) old.remove();
    if (!document.body) return;
    var css = buildCss();
    if (!css) return;                       // this theme/mode already passes AA
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = "/* Generated by shared/js/smd-contrast.js - do not edit. */\n" + css + "\n";
    (document.head || document.documentElement).appendChild(style);
  }

  // Coalesce a burst of theme/mode changes and wait for the sheets they point at
  // to have actually loaded before measuring (link.sheet stays on the PREVIOUS
  // sheet for a tick after `href` changes).
  function scheduleSmdContrast() {
    if (_timer) clearTimeout(_timer);
    var tries = 80;                          // ~2s ceiling if a sheet never loads
    var attempt = function () {
      _timer = null;
      if (!document.body) {
        if (--tries > 0) _timer = setTimeout(attempt, 25);
        return;
      }
      var links = ["bootstrap-theme-css", "theme-override-mode", "theme-override-specific"]
        .map(function (id) { return document.getElementById(id); })
        .filter(Boolean);
      if (!links.every(function (l) { return !!l.sheet; }) && --tries > 0) {
        _timer = setTimeout(attempt, 25);
        return;
      }
      try {
        applySmdContrastVars();
      } catch (e) {
        // A colour is never worth breaking the app for.
      }
    };
    attempt();
  }

  window.applySmdContrastVars = applySmdContrastVars;
  window.scheduleSmdContrast = scheduleSmdContrast;

  // Every theme/override sheet load (initial load included) re-runs the pass;
  // `load` does not bubble, so listen in the capture phase.
  document.addEventListener("load", function (event) {
    var t = event.target;
    if (t && t.tagName === "LINK" && /themes\//.test(t.getAttribute("href") || "")) scheduleSmdContrast();
  }, true);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleSmdContrast);
  } else {
    scheduleSmdContrast();
  }
  window.addEventListener("load", scheduleSmdContrast);
})();
