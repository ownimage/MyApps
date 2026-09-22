// Centralized WCAG contrast-colour generator (shared).
//
// Many Bootswatch themes ship button/badge/tab text that fails WCAG AA (e.g.
// white-on-info ≈ 1.8–2.1:1 on quartz/slate/yeti/superhero/lumen, white-on-
// success ≈ 1.5–2.9:1 on vapor/minty/slate/darkly, white-on-warning ≈ 1.3–2.5:1
// on journal/minty/sketchy/quartz/etc.). Rather than patching one theme or one
// component at a time, this module generates EVERY "text colour on a themed
// surface" the UI needs from the <html> CSS custom properties that the loaded
// Bootstrap theme defines (`--bs-primary`, `--bs-secondary`, …), choosing the
// darker-or-lighter text that maximizes the WCAG contrast ratio.
//
// The theme selector (<smd-theme> / changeTheme) reloads the theme css, and the
// theme engine (smd-settings.js applySmdVars) calls applySmdContrastVars() on
// every theme link load, so the generated palette always matches the theme that
// is actually displayed. Light-DOM css then consumes the variables:
//
//   --smd-on-primary / --smd-on-secondary / --smd-on-success
//   --smd-on-danger  / --smd-on-warning  / --smd-on-info
//   --smd-on-body
//   --smd-muted-header-text   (readable text on the smd-page/smd-modal header bg)
//   --smd-<variant>-text      (same as --smd-on-<variant>; kept as the existing
//                              consumer-facing alias used by buttons/panels)
//   --smd-tab-active-text     (on --bs-primary; for active tabs)
//   --smd-tab-text            (on --bs-secondary; inactive tabs)

(function (global) {
  "use strict";

  // ---- WCAG relative luminance (sRGB) ----
  function channel(c) {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }
  function luminance(rgb) {
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  }
  function ratio(a, b) {
    const la = luminance(a), lb = luminance(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  // ---- css colour parsing ----
  function parseCssColor(str) {
    if (!str) return null;
    let s = String(str).trim();
    const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    const rgb = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*[\d.]+)?\s*\)/i);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    return null;
  }

  // Resolve a css var() chain into its final usage string. Used to read the
  // theme surfaces: --bs-primary (etc.) can alias another --bs-* (e.g. --bs-
  // blue) and the theme may fail before JS onto rgb()/hex. Shallow loop keeps
  // it cheap; unknown/empty resolves to the fallback.
  function resolveCssVar(usage, fallback) {
    let val = usage;
    for (let i = 0; i < 8 && typeof val === "string"; i++) {
      const m = val.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)$/);
      if (!m) break;
      const prop = global.getComputedStyle(global.document.documentElement).getPropertyValue(m[1]).trim();
      if (!prop) {
        val = (m[2] || fallback || "").trim();
        break;
      }
      val = prop;
    }
    return val || fallback || "";
  }

  // Read a themed surface (rgb triplet) from a --bs-* prop, following var chains.
  function surface(prop, fallback) {
    return parseCssColor(resolveCssVar("var(" + prop + ")", fallback));
  }

  // Pick the darker-or-lighter text colour with the better WCAG ratio against bg.
  // Pure #000/#fff maximise the achievable ratio; a strict read of the result is
  // used by the tests (>= 4.5:1 normal text unless the surface is mid-tone).
  function bestText(bg) {
    if (!bg) return "#fff";
    return ratio([0, 0, 0], bg) >= ratio([255, 255, 255], bg) ? "#000" : "#fff";
  }

  // Compute a readable text colour as an rgb() css string for a bg (used for the
  // colour-mix'd header surfaces, which have no --bs-* var to read).
  function textForRgb(bg) {
    return bestText(bg);
  }

  // ---- palette generation ----
  function generate(colors) {
    const on = (c) => colors[c] ? bestText(colors[c]) : "#fff";
    const body = colors.body ? bestText(colors.body) : "#fff";
    return {
      primary: on("primary"),
      secondary: on("secondary"),
      success: on("success"),
      danger: on("danger"),
      warning: on("warning"),
      info: on("info"),
      body: body,
      tabActive: on("primary"),
      tab: on("secondary")
    };
  }

  global.SmdContrast = {
    luminance,
    ratio,
    parseCssColor,
    resolveCssVar,
    bestText,
    generate
  };

  // Publish the full palette as CSS custom properties on <html>.
  //
  // Hybrid rule: a theme keeps its OWN text colour when that colour already
  // meets the WCAG AA target on the surface (so thumb-tested themes like
  // cerulean's dark-grey secondary text are untouched), and only substitutes
  // the computed darker-or-lighter text when the theme's choice FAILS. The
  // theme-accurate values are read from the --smd-*-text props that
  // smd-settings.applySmdVars() set right before calling this.
  function applySmdContrastVars() {
    const doc = global.document;
    if (!doc || !doc.documentElement) return;
    const root = doc.documentElement;
    const cs = global.getComputedStyle(root);

    const colors = {
      primary: parseCssColor(cs.getPropertyValue("--bs-primary").trim()) || parseCssColor("#0d6efd"),
      secondary: parseCssColor(cs.getPropertyValue("--bs-secondary").trim()) || parseCssColor("#6c757d"),
      success: parseCssColor(cs.getPropertyValue("--bs-success").trim()) || parseCssColor("#198754"),
      danger: parseCssColor(cs.getPropertyValue("--bs-danger").trim()) || parseCssColor("#dc3545"),
      warning: parseCssColor(cs.getPropertyValue("--bs-warning").trim()) || parseCssColor("#ffc107"),
      info: parseCssColor(cs.getPropertyValue("--bs-info").trim()) || parseCssColor("#0dcaf0"),
      body: parseCssColor(cs.getPropertyValue("--bs-body-bg").trim()) || parseCssColor("#ffffff")
    };

    // Text the theme itself chose for each button surface (set by applySmdVars).
    // Theme choices may be rgb()/hex/resolved; keep the raw css string.
    const themeChoice = (variant, fallback) => {
      const raw = cs.getPropertyValue("--smd-" + variant + "-text").trim() || fallback;
      return parseCssColor(raw) ? raw : "";
    };

    const cssColor = (rgb) => (rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : "");

    // Keep the theme's own colour when it passes AA; compute when it fails.
    // Always returns a valid css colour STRING (never an rgb array).
    const finalText = (variant, fallback) => {
      const bg = colors[variant];
      const chosenRaw = themeChoice(variant, fallback);
      const chosen = parseCssColor(chosenRaw);
      if (chosen && bg && ratio(chosen, bg) >= 4.5) return chosenRaw;
      return bestText(bg);
    };
    const pal = generate(colors); // pure-computed fallbacks for mid-tones/tabs
    const set = (prop, value) => root.style.setProperty(prop, value);

    set("--smd-primary-text", finalText("primary", pal.primary));
    set("--smd-secondary-text", finalText("secondary", pal.secondary));
    set("--smd-success-text", finalText("success", pal.success));
    set("--smd-danger-text", finalText("danger", pal.danger));
    set("--smd-warning-text", finalText("warning", pal.warning));
    set("--smd-info-text", finalText("info", pal.info));

    // Generated "on-surface" colours: guaranteed to be whatever maximises
    // contrast on that surface (they never inherit a failing theme choice).
    set("--smd-on-primary", pal.primary);
    set("--smd-on-secondary", pal.secondary);
    set("--smd-on-success", pal.success);
    set("--smd-on-danger", pal.danger);
    set("--smd-on-warning", pal.warning);
    set("--smd-on-info", pal.info);
    set("--smd-on-body", pal.body);

    // Tabs — same hybrid rule: active tabs sit on --bs-primary, inactive on
    // --bs-secondary, so they share the button text colours for those surfaces.
    set("--smd-tab-active-text", finalText("primary", pal.tabActive));
    set("--smd-tab-text", finalText("secondary", pal.tab));

    // smd-page header / smd-modal header backgrounds are the body bg lightened
    // by color-mix(..., 85%, white). Compute readable text against that mixture.
    const mix = (rgb) => {
      const bg = rgb;
      const out = [
        Math.round(bg[0] * 0.85 + 255 * 0.15),
        Math.round(bg[1] * 0.85 + 255 * 0.15),
        Math.round(bg[2] * 0.85 + 255 * 0.15)
      ];
      return out;
    };
    set("--smd-muted-header-text", textForRgb(mix(colors.body)));

    // Runtime-proof: also publish the resolved theme surface colours so UI
    // choices can key off them without re-reading the cascade.
    for (const name of ["primary", "secondary", "success", "danger", "warning", "info"]) {
      const rgb = colors[name];
      set("--smd-rgb-" + name, rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : "");
    }
  }

  global.applySmdContrastVars = applySmdContrastVars;

  // Self-heal ordering: the theme <link> may have fired its load event (and
  // applySmdVars) before this file was parsed in other apps. If so, recompute
  // the contrast palette immediately instead of waiting for a re-theme.
  if (global.document && global.document.documentElement &&
      global.document.documentElement.style.getPropertyValue("--smd-primary-text")) {
    global.applySmdContrastVars();
  }
})(window);