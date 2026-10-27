// WCAG AA (4.5:1) contrast for BUTTON and TAB text on EVERY theme and mode - the
// OUTCOME guard.
//
// The fixes are baked into each theme's own per-mode sheet
// (shared/css/themes/<theme>/<theme>.<mode>.css, generated block);
// tests/contrast-css.spec.js keeps that block current. This spec instead
// measures the REAL `<smd-button>` / `<smd-tabs>` components to prove the baked
// CSS actually renders readable labels. Every button state is checked, because
// hover/active paint their own surface (`--bs-btn-hover-bg`, ...) from their own
// var.
//
// The ratios are recomputed here from the resolved colours the browser reports, so
// the spec asserts the OUTCOME (>= 4.5:1) and not the method.
const { test, expect } = require("@playwright/test");

const THEMES = ["bootstrap", "brite", "cerulean", "cosmo", "cyborg", "darkly", "flatly", "journal", "litera",
  "lumen", "lux", "materia", "minty", "morph", "pulse", "quartz", "sandstone", "simplex", "sketchy", "slate",
  "solar", "spacelab", "superhero", "united", "vapor", "yeti", "zephyr"];
const MODES = ["light", "dark"];
const VARIANTS = ["primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];
const STATES = ["base", "hover", "active", "disabled"];
const AA = 4.5;

// ---- WCAG relative luminance / contrast (test-side) ------------------------
function channels(color) {
  const s = String(color).trim();
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const h = hex[1];
    const pair = (i) => parseInt(h.slice(i, i + 2), 16);
    if (h.length === 3 || h.length === 4) {
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    }
    return [pair(0), pair(2), pair(4)];
  }
  const nums = s.match(/-?[\d.]+/g);
  if (!nums) throw new Error("cannot parse colour: " + color);
  const [r, g, b] = nums.slice(0, 3).map(Number);
  // Chromium serialises color-mix() as `color(srgb r g b)` with 0..1 channels.
  return /^color\(/.test(s) ? [r, g, b].map((v) => v * 255) : [r, g, b];
}
function luminance(color) {
  return channels(color)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

// ---- In-page helpers -------------------------------------------------------
// One real <smd-button> per variant plus a real <smd-tabs> (2 tabs), offscreen.
// #smd-app is <body>, so appending to document.body keeps the normal cascade.
const RENDER = (variants) => {
  const old = document.getElementById("contrastProbe");
  if (old) old.remove();
  const host = document.createElement("div");
  host.id = "contrastProbe";
  host.style.cssText = "position:absolute;left:-9999px;top:0";
  variants.forEach((v) => {
    const b = document.createElement("smd-button");
    b.setAttribute("variant", v);
    b.textContent = "Sample";
    host.appendChild(b);
  });
  const tabs = document.createElement("smd-tabs");
  host.appendChild(tabs);
  document.body.appendChild(host);
  tabs.tabs = [{ title: "One" }, { title: "Two" }];
};

// Probe for the CountMyDays countdown card (date/time/count text) plus a form
// entry and a Bootstrap checkbox/radio for the non-text border checks.
const RENDER_CMD = () => {
  const old = document.getElementById("cmdContrastProbe");
  if (old) old.remove();
  const card = document.createElement("cmd-countdown-card");
  card.id = "cmdContrastProbe";
  card.setAttribute("title", "Contrast Probe");
  card.setAttribute("date-text", "Sat 12 Sep 2026");
  card.setAttribute("time-text", "10:30");
  card.setAttribute("count1", "3");
  card.setAttribute("count2", "weeks");
  document.body.appendChild(card);

  const host = document.createElement("div");
  host.id = "borderContrastProbe";
  host.style.cssText = "position:absolute;left:-9999px;top:0";
  const mk = (tag, cls, attrs) => {
    const el = document.createElement(tag);
    el.className = cls;
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    if (tag === "select") {
      const o = document.createElement("option");
      o.textContent = "x";
      el.appendChild(o);
    }
    host.appendChild(el);
  };
  mk("input", "form-control", { type: "text" });
  mk("textarea", "form-control");
  mk("select", "form-select");
  mk("input", "form-check-input", { type: "checkbox" });
  const nativeCb = document.createElement("smd-checkbox");
  nativeCb.id = "nativeCheckboxProbe";
  host.appendChild(nativeCb);

  // Alert bars (MyHID's capture status, hid-tab, the main view, SolarControlar).
  // Rendered exactly like the app does, so the measured pair is the real one.
  const alerts = document.createElement("div");
  alerts.id = "alertContrastProbe";
  alerts.style.cssText = "position:absolute;left:-9999px;top:0";
  ["secondary", "warning", "danger", "success", "info"].forEach((variant) => {
    const el = document.createElement("div");
    el.className = "alert alert-" + variant + " py-2 px-3 mb-3";
    el.textContent = "Contrast Probe";
    alerts.appendChild(el);
  });
  document.body.appendChild(alerts);
  document.body.appendChild(host);
};

// The surface a control actually paints. Themes with a `background-image` gradient
// (slate, materia, ...) paint MORE than the flat background-color, and the label has
// to work against the gradient's DARKEST extent - that is the part that dominates
// the body of the button (for Bootstrap's usual `rgba(255,255,255,.15)` sheen the
// darkest extent IS the base colour, so ordinary themes are unaffected). Reading
// only `background-color` is what missed slate dark's secondary button: the flat
// #7a8288 said black was fine, but the ramp runs down to #62686d (3.69:1 on black,
// 5.68:1 on white).
const MEASURE = () => {
  const parse = (s) => {
    const str = String(s || "").trim();
    const hex = str.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
      // normalise #abc / #abcd to 6/8 digits so the channels are 2 chars each
      let h = hex[1];
      if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
      const p = (i) => parseInt(h.slice(i * 2, i * 2 + 2), 16);
      return { r: p(0), g: p(1), b: p(2), a: h.length === 8 ? p(3) / 255 : 1 };
    }
    const m = str.match(/^(rgba?|color)\((.*)\)$/);
    if (!m) return null;
    const parts = m[2].split(/[\s,\/]+/).filter((v) => v !== "").map(Number);
    const scale = m[1] === "color" ? 255 : 1;
    return { r: parts[0] * scale, g: parts[1] * scale, b: parts[2] * scale, a: parts.length > 3 ? parts[3] : 1 };
  };
  const over = (fg, bg) => (!fg ? bg : fg.a >= 1 ? fg
    : { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const css = (c) => "rgb(" + Math.round(c.r) + ", " + Math.round(c.g) + ", " + Math.round(c.b) + ")";
  const luminance = (c) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };

  // The darkest surface the element paints: its background colour, or the darkest
  // colour stop of its gradient (each stop composited over the background, so a
  // translucent sheen is handled like an opaque ramp).
  const darkestSurface = (cs, bg) => {
    let darkest = bg;
    const img = String(cs.backgroundImage || "");
    if (img && img !== "none" && /gradient/i.test(img)) {
      const re = /(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}\b|\b(?:white|black|transparent)\b)/gi;
      let m;
      while ((m = re.exec(img)) !== null) {
        const stop = parse(m[1]);
        if (!stop) continue;
        const painted = over(stop, bg);
        if (luminance(painted) < luminance(darkest)) darkest = painted;
      }
    }
    return darkest;
  };

  const pageBg = over(parse(getComputedStyle(document.body).backgroundColor), { r: 255, g: 255, b: 255, a: 1 });
  const out = { buttons: {}, tabs: {} };

  document.querySelectorAll("#contrastProbe smd-button").forEach((hostEl) => {
    const btn = hostEl.querySelector("button");
    const cs = getComputedStyle(btn);
    const baseBg = over(parse(cs.backgroundColor), pageBg);
    const baseColor = cs.color;
    // Each state paints from its own var; a missing/transparent surface var falls
    // back to the base surface, and an unparseable token (e.g. an unresolved
    // `var(...)`) falls back to the base colour - exactly as Bootstrap does.
    // GRADIENTS: the element's `background-image` belongs to the BASE state (slate
    // and friends override it per state, which cannot be read without hovering), so
    // base/disabled use it (the image persists there) and hover/active are judged
    // on their own flat background colour.
    const stateQuirk = (token) => /^(#|rgba?\(|color\()/i.test(String(token).trim());
    const state = (colorToken, bgToken, withGradient) => {
      const raw = parse(cs.getPropertyValue(bgToken).trim());
      const token = cs.getPropertyValue(colorToken).trim();
      const bg = raw && raw.a > 0 ? over(raw, pageBg) : baseBg;
      return {
        color: stateQuirk(token) ? token : baseColor,
        bg: css(withGradient ? darkestSurface(cs, bg) : bg)
      };
    };
    out.buttons[hostEl.getAttribute("variant")] = {
      base: { color: baseColor, bg: css(darkestSurface(cs, baseBg)) },
      hover: state("--bs-btn-hover-color", "--bs-btn-hover-bg", false),
      active: state("--bs-btn-active-color", "--bs-btn-active-bg", false),
      disabled: state("--bs-btn-disabled-color", "--bs-btn-disabled-bg", true)
    };
  });

  const tabState = (selector) => {
    const el = document.querySelector("#contrastProbe smd-tabs " + selector);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const bg = over(parse(cs.backgroundColor), pageBg);
    return { color: cs.color, bg: css(darkestSurface(cs, bg)) };
  };
  out.tabs.active = tabState(".smd-tab-btn.active");
  out.tabs.inactive = tabState(".smd-tab-btn:not(.active)");
  return out;
};

// Card secondary text + form/checkbox border measurements. The card text must be
// readable against the card surface; the borders are non-text UI boundaries, so
// WCAG 1.4.11 applies (3:1, not 4.5:1).
const MEASURE_CMD = () => {
  const parse = (s) => {
    const str = String(s || "").trim();
    const hex = str.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
      const p = (i) => parseInt(h.slice(i * 2, i * 2 + 2), 16);
      return { r: p(0), g: p(1), b: p(2), a: h.length === 8 ? p(3) / 255 : 1 };
    }
    const m = str.match(/^(rgba?|color)\((.*)\)$/);
    if (!m) return null;
    const parts = m[2].split(/[\s,\/]+/).filter((v) => v !== "").map(Number);
    const scale = m[1] === "color" ? 255 : 1;
    return { r: parts[0] * scale, g: parts[1] * scale, b: parts[2] * scale, a: parts.length > 3 ? parts[3] : 1 };
  };
  const over = (fg, bg) => (!fg ? bg : fg.a >= 1 ? fg
    : { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lum = (c) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); const hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); };
  const rgb = (c) => "rgb(" + Math.round(c.r) + ", " + Math.round(c.g) + ", " + Math.round(c.b) + ")";
  const darkestSurface = (cs, bg) => {
    let darkest = bg;
    const img = String(cs.backgroundImage || "");
    if (img && img !== "none" && /gradient/i.test(img)) {
      const re = /(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}\b|\b(?:white|black|transparent)\b)/gi;
      let m;
      while ((m = re.exec(img)) !== null) {
        const stop = parse(m[1]);
        if (!stop) continue;
        const painted = over(stop, bg);
        if (lum(painted) < lum(darkest)) darkest = painted;
      }
    }
    return darkest;
  };

  const pageBg = over(parse(getComputedStyle(document.body).backgroundColor), { r: 255, g: 255, b: 255, a: 1 });
  const card = document.getElementById("cmdContrastProbe");

  const cardEl = card && card.querySelector(".card");
  let cardSurface = pageBg;
  if (cardEl) {
    const cs = getComputedStyle(cardEl);
    cardSurface = darkestSurface(cs, over(parse(cs.backgroundColor), pageBg));
  }

  const text = {};
  ["date-text", "time-text", "count-2"].forEach((cls) => {
    const el = card ? card.querySelector("." + cls) : null;
    if (!el) return;
    const col = parse(getComputedStyle(el).color);
    text[cls] = { color: rgb(col), bg: rgb(cardSurface), ratio: ratio(col, cardSurface) };
  });

  const host = document.getElementById("borderContrastProbe");
  const border = (sel, pseudo) => {
    const el = host ? host.querySelector(sel) : null;
    if (!el) return null;
    const cs = getComputedStyle(el, pseudo);
    const raw = parse(cs.borderTopColor);
    const painted = over(raw, pageBg);
    return {
      width: parseFloat(cs.borderTopWidth) || 0,
      style: cs.borderTopStyle,
      color: rgb(painted),
      bg: rgb(pageBg),
      ratio: ratio(painted, pageBg)
    };
  };
  const borders = {
    control: border("input.form-control"),
    textarea: border("textarea.form-control"),
    select: border("select.form-select"),
    checkbox: border("input.form-check-input")
  };
  // The shared <smd-checkbox> draws its own single border (`appearance: none`),
  // so it is measured like any other control border. Sketchy instead draws the
  // checkbox with [type=checkbox]::before (and drops our border in its theme
  // override), so fall back to the pseudo-element's border when ours is absent.
  borders.nativeCheckbox = border("smd-checkbox input");
  if (borders.nativeCheckbox && (borders.nativeCheckbox.style === "none" || borders.nativeCheckbox.width < 1)) {
    const pseudo = border("smd-checkbox input", "::before");
    if (pseudo && pseudo.style !== "none" && pseudo.width >= 1) borders.nativeCheckbox = pseudo;
  }

  // Alert bars: the text against the bar's OWN surface (the theme's alert tint,
  // which can carry a gradient - judged on its darkest extent like a button).
  const alertHost = document.getElementById("alertContrastProbe");
  const alerts = {};
  if (alertHost) {
    alertHost.querySelectorAll(".alert").forEach((el) => {
      const variant = Array.from(el.classList)
        .filter((c) => c.indexOf("alert-") === 0)[0];
      if (!variant) return;
      const cs = getComputedStyle(el);
      const surface = darkestSurface(cs, over(parse(cs.backgroundColor), pageBg));
      const col = parse(cs.color);
      alerts[variant] = {
        color: rgb(col),
        bg: rgb(surface),
        ratio: ratio(col, surface)
      };
    });
  }
  return { text, borders, alerts };
};

function buttonFailures(m, label) {
  const out = [];
  for (const variant of VARIANTS) {
    const found = m.buttons[variant];
    if (!found) { out.push(label + "  button " + variant + ": not rendered"); continue; }
    for (const state of STATES) {
      const { color, bg } = found[state];
      const ratio = contrast(color, bg);
      if (ratio < AA) out.push(`${label}  button ${variant} ${state}: ${ratio.toFixed(2)}:1 (${color} on ${bg})`);
    }
  }
  return out;
}
function tabFailures(m, label) {
  const out = [];
  for (const which of ["active", "inactive"]) {
    const found = m.tabs[which];
    if (!found) { out.push(label + "  tab " + which + ": not rendered"); continue; }
    const ratio = contrast(found.color, found.bg);
    if (ratio < AA) out.push(`${label}  tab ${which}: ${ratio.toFixed(2)}:1 (${found.color} on ${found.bg})`);
  }
  return out;
}

// Switch theme+mode and wait until the new sheets are actually APPLIED: the links'
// `load` events, then the LIVE CSSStyleSheet objects naming the new theme, then a
// stable sample of the applied colours (Bootstrap animates `.btn` colour for 150ms,
// so a single sample can land mid-fade).
async function setTheme(page, theme, mode) {
  await page.evaluate(([t, m]) => new Promise((resolve) => {
    const base = document.getElementById("bootstrap-theme-css");
    const specific = document.getElementById("theme-override-specific");
    const modeLayer = document.getElementById("theme-override-mode");
    const href = (el) => (el && el.getAttribute("href")) || "";
    if (href(base).indexOf("/" + t + "/bootstrap.min.css") !== -1 &&
        href(specific).indexOf("/" + t + "/" + t + "." + m + ".css") !== -1) {
      return resolve();
    }
    let pending = 0;
    let settled = false;
    const done = () => { if (settled || --pending > 0) return; settled = true; resolve(); };
    [base, specific, modeLayer].filter(Boolean).forEach((el) => {
      pending++;
      const onLoad = () => { el.removeEventListener("load", onLoad); done(); };
      el.addEventListener("load", onLoad);
    });
    applyTheme(t, m);
    setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 5000);
  }), [theme, mode]);

  await page.waitForFunction(([t, m]) => {
    const sheetHref = (id) => { const el = document.getElementById(id); return (el && el.sheet && el.sheet.href) || ""; };
    return sheetHref("bootstrap-theme-css").indexOf("/" + t + "/bootstrap.min.css") !== -1 &&
      sheetHref("theme-override-specific").indexOf("/" + t + "/" + t + "." + m + ".css") !== -1;
  }, [theme, mode], { timeout: 20000 });

  let previous = null;
  for (let i = 0; i < 30; i++) {
    const now = await page.evaluate(() => {
      const parts = [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).color];
      document.querySelectorAll("#contrastProbe smd-button button").forEach((el) => {
        const cs = getComputedStyle(el);
        parts.push(cs.color, cs.backgroundColor);
        ["hover", "active", "disabled"].forEach((s) => parts.push(
          cs.getPropertyValue("--bs-btn-" + s + "-color"), cs.getPropertyValue("--bs-btn-" + s + "-bg")));
      });
      return parts.join("|");
    });
    if (previous === now) return;
    previous = now;
    await page.waitForTimeout(60);
  }
}

test.describe("Contrast (WCAG AA)", { tag: "@contrast" }, () => {

  test("every smd-button variant meets AA in every state, on every theme and mode", async ({ page }) => {
    test.setTimeout(5 * 60 * 1000);          // 27 themes x 2 modes, each with a settle wait
    await page.goto("/PlanMyDay/");
    await page.evaluate(RENDER, VARIANTS);            // probe once, reused per theme
    const failures = [];
    for (const theme of THEMES) {
      for (const mode of MODES) {
        const label = theme + "/" + mode;
        await setTheme(page, theme, mode);
        failures.push(...buttonFailures(await page.evaluate(MEASURE), label));
      }
    }
    expect(failures.join("\n")).toBe("");
  });

  test("smd-tab colours meet AA on every theme and mode", async ({ page }) => {
    test.setTimeout(5 * 60 * 1000);
    await page.goto("/PlanMyDay/");
    await page.evaluate(RENDER, VARIANTS);
    const failures = [];
    for (const theme of THEMES) {
      for (const mode of MODES) {
        const label = theme + "/" + mode;
        await setTheme(page, theme, mode);
        failures.push(...tabFailures(await page.evaluate(MEASURE), label));
      }
    }
    expect(failures.join("\n")).toBe("");
  });

  test("nothing computes contrast at runtime any more", async ({ page }) => {
    // The AA fixes are BAKED INTO the theme CSS (tests/contrast-css.spec.js keeps
    // them current). Nothing may inject colour styles or expose a normaliser at
    // runtime - this guard fails if that code is ever added back.
    await page.goto("/PlanMyDay/");
    await page.evaluate(RENDER, VARIANTS);
    for (const theme of ["superhero", "minty", "journal"]) {
      for (const mode of MODES) {
        await setTheme(page, theme, mode);
        const state = await page.evaluate(() => ({
          injected: !!document.getElementById("smd-contrast-overrides"),
          styleSheets: Array.from(document.styleSheets).filter((s) => !s.href).length,
          normaliser: typeof window.applySmdContrastVars + "/" + typeof window.scheduleSmdContrast
        }));
        expect(state.injected, theme + "/" + mode + ": no contrast stylesheet may be injected").toBe(false);
        expect(state.normaliser, theme + "/" + mode + ": no runtime normaliser may exist").toBe("undefined/undefined");
      }
    }
  });

  test("CountMyDays card secondary text meets AA on every theme and mode", async ({ page }) => {
    test.setTimeout(5 * 60 * 1000);
    await page.goto("/CountMyDays/");
    await page.evaluate(RENDER_CMD);
    await page.evaluate(RENDER, VARIANTS);
    const failures = [];
    for (const theme of THEMES) {
      for (const mode of MODES) {
        const label = theme + "/" + mode;
        await setTheme(page, theme, mode);
        const measured = await page.evaluate(MEASURE_CMD);
        for (const [cls, found] of Object.entries(measured.text)) {
          if (found.ratio < AA) {
            failures.push(`${label}  .${cls}: ${found.ratio.toFixed(2)}:1 (${found.color} on ${found.bg})`);
          }
        }
      }
    }
    expect(failures.join("\n")).toBe("");
  });

  test("alert bars meet AA on every theme and mode", async ({ page }) => {
    test.setTimeout(5 * 60 * 1000);
    await page.goto("/CountMyDays/");
    await page.evaluate(RENDER_CMD);
    await page.evaluate(RENDER, VARIANTS);
    const failures = [];
    for (const theme of THEMES) {
      for (const mode of MODES) {
        const label = theme + "/" + mode;
        await setTheme(page, theme, mode);
        const measured = await page.evaluate(MEASURE_CMD);
        for (const [name, found] of Object.entries(measured.alerts || {})) {
          if (found.ratio < AA) {
            failures.push(`${label}  ${name}: ${found.ratio.toFixed(2)}:1 (${found.color} on ${found.bg})`);
          }
        }
      }
    }
    expect(failures.join("\n")).toBe("");
  });

  test("form entry and checkbox borders meet 3:1 on every theme and mode", async ({ page }) => {
    test.setTimeout(5 * 60 * 1000);
    await page.goto("/CountMyDays/");
    await page.evaluate(RENDER_CMD);
    await page.evaluate(RENDER, VARIANTS);
    const failures = [];
    for (const theme of THEMES) {
      for (const mode of MODES) {
        const label = theme + "/" + mode;
        await setTheme(page, theme, mode);
        const measured = await page.evaluate(MEASURE_CMD);
        for (const [name, found] of Object.entries(measured.borders)) {
          if (!found) { failures.push(`${label}  ${name}: not rendered`); continue; }
          if (found.style === "none" || found.width < 1) {
            failures.push(`${label}  ${name}: no visible border`);
          } else if (found.ratio < 3) {
            failures.push(`${label}  ${name}: ${found.ratio.toFixed(2)}:1 (${found.color} on ${found.bg})`);
          }
        }
      }
    }
    expect(failures.join("\n")).toBe("");
  });

  // ---- INACTIVE (read-only / disabled) controls -----------------------------
  // Every app/page gets the same shared rules + mode palette, so ONE probe that
  // mounts each kind of inactive control covers them all. The controls are
  // mounted twice: on the page, and inside a <pmd-tasks> row - which paints its
  // own surface (--pmd-tasks-row-background), a different background from the
  // page in most themes, so the borders/box have to clear 3:1 on BOTH.
  const RENDER_INACTIVE = () => {
    const old = document.getElementById("inactiveProbe");
    if (old) old.remove();
    const host = document.createElement("div");
    host.id = "inactiveProbe";
    host.style.cssText = "position:absolute;left:-9999px;top:0;width:640px";

    const page = document.createElement("div");
    page.id = "inactivePageBlock";
    const html = (tag, id, attrs, text) => {
      const el = document.createElement(tag);
      el.id = id;
      Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
      if (text) el.textContent = text;
      return el;
    };
    page.appendChild(html("input", "inReadonlyInput", { class: "form-control", readonly: "", value: "Read only" }));
    page.appendChild(html("textarea", "inReadonlyTextarea", { class: "form-control", readonly: "", rows: "2" }, "Read only"));
    page.appendChild(html("input", "inDisabledInput", { class: "form-control", disabled: "", value: "Disabled" }));
    page.appendChild(html("button", "inDisabledSelect", { class: "form-select", type: "button", disabled: "" }, "Disabled"));
    page.appendChild(html("button", "inDisabledButton", { class: "btn btn-primary", type: "button", disabled: "" }, "Disabled"));

    const smdButton = document.createElement("smd-button");
    smdButton.id = "inDisabledSmdButton";
    smdButton.setAttribute("variant", "primary");
    smdButton.setAttribute("disabled", "");
    smdButton.textContent = "Disabled";
    page.appendChild(smdButton);

    const unchecked = document.createElement("smd-checkbox");
    unchecked.id = "inDisabledCheckbox";
    unchecked.setAttribute("disabled", "");
    unchecked.textContent = "Label";
    page.appendChild(unchecked);

    const checked = document.createElement("smd-checkbox");
    checked.id = "inDisabledChecked";
    checked.setAttribute("disabled", "");
    checked.setAttribute("checked", "");
    checked.textContent = "Checked";
    page.appendChild(checked);

    const datePicker = document.createElement("smd-date-picker");
    datePicker.id = "inReadonlyDate";
    datePicker.setAttribute("readonly", "");
    datePicker.setAttribute("value", "2026-10-05");
    page.appendChild(datePicker);

    const smdSelect = document.createElement("smd-select");
    smdSelect.id = "inDisabledSmdSelect";
    smdSelect.setAttribute("disabled", "");
    ["A", "B"].forEach((label) => {
      const o = document.createElement("option");
      o.value = label;
      o.textContent = label;
      smdSelect.appendChild(o);
    });
    page.appendChild(smdSelect);

    host.appendChild(page);

    // Same controls inside a list-item row: the row paints its own surface.
    const rows = document.createElement("pmd-tasks");
    rows.id = "inactiveTaskRows";
    rows.setAttribute("read-only", "");
    rows.tasks = [{ description: "Task", done: true, note: "", noteOpen: false }];
    host.appendChild(rows);

    document.body.appendChild(host);
  };

  const MEASURE_INACTIVE = () => {
    const parse = (s) => {
      const str = String(s || "").trim();
      const hex = str.match(/^#([0-9a-f]{3,8})$/i);
      if (hex) {
        let h = hex[1];
        if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
        const p = (i) => parseInt(h.slice(i * 2, i * 2 + 2), 16);
        return { r: p(0), g: p(1), b: p(2), a: h.length === 8 ? p(3) / 255 : 1 };
      }
      const m = str.match(/^(rgba?|color)\((.*)\)$/);
      if (!m) return null;
      const parts = m[2].split(/[\s,\/]+/).filter((v) => v !== "").map(Number);
      const scale = m[1] === "color" ? 255 : 1;
      return { r: parts[0] * scale, g: parts[1] * scale, b: parts[2] * scale, a: parts.length > 3 ? parts[3] : 1 };
    };
    const over = (fg, bg) => (!fg ? bg : fg.a >= 1 ? fg
      : { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const lum = (c) => {
      const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => {
      const x = lum(a), y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const rgb = (c) => "rgb(" + Math.round(c.r) + ", " + Math.round(c.g) + ", " + Math.round(c.b) + ")";
    // The surface an element SITS ON (its own background excluded) - the parent
    // chain composited over the body, so a task row is measured against the row.
    const under = (el) => {
      let node = el.parentElement, acc = null;
      while (node && node !== document.documentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c && c.a > 0) {
          acc = acc ? over(acc, c) : c;
          if (acc.a >= 0.999) return acc;
        }
        node = node.parentElement;
      }
      const body = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
      return acc ? over(acc, body) : body;
    };
    const own = (el) => {
      const c = parse(getComputedStyle(el).backgroundColor);
      return c && c.a > 0 ? over(c, under(el)) : under(el);
    };

    const out = [];
    const text = (label, el) => {
      if (!el) return out.push({ label, kind: "text", missing: true });
      const bg = own(el);
      const fg = over(parse(getComputedStyle(el).color), bg);
      out.push({ label, kind: "text", got: ratio(fg, bg), needs: 4.5, detail: rgb(fg) + " on " + rgb(bg) });
    };
    const boundary = (label, el) => {
      if (!el) return out.push({ label, kind: "graphic", missing: true });
      const cs = getComputedStyle(el);
      const bg = under(el);
      let bcRaw = parse(cs.borderTopColor);
      let width = parseFloat(cs.borderTopWidth) || 0;
      let style = cs.borderTopStyle;
      // sketchy draws the checkbox with [type=checkbox]::before (its own
      // hand-drawn box) and drops our border, so measure the pseudo-element -
      // the same fallback the form-border test above uses.
      if (el.matches('input[type="checkbox"]') && (style === "none" || width < 1)) {
        const pseudo = getComputedStyle(el, "::before");
        const pw = parseFloat(pseudo.borderTopWidth) || 0;
        if (pseudo.borderTopStyle !== "none" && pw >= 1) {
          bcRaw = parse(pseudo.borderTopColor);
          width = pw;
          style = pseudo.borderTopStyle;
        }
      }
      const bc = over(bcRaw, bg);
      const r = {
        label,
        kind: "graphic",
        got: ratio(bc, bg),
        needs: 3,
        width,
        style,
        detail: "border " + rgb(bc) + " on " + rgb(bg)
      };
      // Only a CHECKBOX BOX has a meaningful "fill": for a text field the fill is
      // its own surface, which is deliberately close to the page.
      if (el.matches('input[type="checkbox"]')) {
        const fillRaw = parse(cs.backgroundColor);
        const fill = fillRaw && fillRaw.a > 0 ? over(fillRaw, bg) : null;
        if (fill) {
          r.fill = ratio(fill, bg);
          // The tick is an SVG background image; read the colour it was drawn with.
          const img = String(cs.backgroundImage || "");
          const m = img.match(/stroke='%23([0-9a-f]{6})'/i) || img.match(/stroke='#([0-9a-f]{6})'/i);
          const tick = m ? { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 }
            : { r: 255, g: 255, b: 255, a: 1 };
          r.tick = ratio(tick, fill);
          r.tickDetail = rgb(tick) + " on " + rgb(fill);
        }
      }
      out.push(r);
    };

    const q = (sel) => document.querySelector("#inactiveProbe " + sel);

    // Set A: the control types, on the page surface.
    text("readonly input text", q("#inReadonlyInput"));
    boundary("readonly input border", q("#inReadonlyInput"));
    text("readonly textarea text", q("#inReadonlyTextarea"));
    boundary("readonly textarea border", q("#inReadonlyTextarea"));
    text("disabled input text", q("#inDisabledInput"));
    boundary("disabled input border", q("#inDisabledInput"));
    text("disabled .form-select text", q("#inDisabledSelect"));
    boundary("disabled .form-select border", q("#inDisabledSelect"));
    text("disabled raw .btn text", q("#inDisabledButton"));
    boundary("disabled raw .btn boundary", q("#inDisabledButton"));
    text("disabled <smd-button> text", q("#inDisabledSmdButton button"));
    boundary("disabled <smd-button> boundary", q("#inDisabledSmdButton button"));
    text("disabled <smd-select> text", q("#inDisabledSmdSelect .form-select"));
    boundary("disabled <smd-select> border", q("#inDisabledSmdSelect .form-select"));
    text("read-only <smd-date-picker> text", q("#inReadonlyDate #smdDatePickerAlt"));
    boundary("read-only <smd-date-picker> border", q("#inReadonlyDate #smdDatePickerAlt"));
    text("disabled checkbox LABEL", q("#inDisabledCheckbox"));
    boundary("disabled checkbox box (unchecked)", q("#inDisabledCheckbox input"));
    boundary("disabled checkbox box (checked)", q("#inDisabledChecked input"));

    // Set B: the same kinds inside a list-item row (its own surface).
    text("task row: readonly description", q("#inactiveTaskRows .task-desc-input"));
    boundary("task row: readonly description border", q("#inactiveTaskRows .task-desc-input"));
    text("task row: disabled note button", q("#inactiveTaskRows .task-note-btn"));
    boundary("task row: disabled note button boundary", q("#inactiveTaskRows .task-note-btn"));
    boundary("task row: disabled done checkbox", q("#inactiveTaskRows .task-done-cb input"));

    return out;
  };

  test("inactive (read-only / disabled) controls meet AA on every theme and mode", async ({ page }) => {
    test.setTimeout(6 * 60 * 1000);
    await page.goto("/PlanMyDay/");
    await page.evaluate(RENDER_INACTIVE);
    await page.evaluate(RENDER, VARIANTS);            // keeps setTheme()'s settle probe happy
    const failures = [];
    for (const theme of THEMES) {
      for (const mode of MODES) {
        const label = theme + "/" + mode;
        await setTheme(page, theme, mode);
        const rows = await page.evaluate(MEASURE_INACTIVE);
        for (const r of rows) {
          if (r.missing) { failures.push(`${label}  ${r.label}: not rendered`); continue; }
          if (r.kind === "graphic" && (r.style === "none" || r.width < 1)) {
            failures.push(`${label}  ${r.label}: no visible border`);
          }
          if (r.got < r.needs) {
            failures.push(`${label}  ${r.label}: ${r.got.toFixed(2)}:1 (needs ${r.needs}) - ${r.detail}`);
          }
          if (r.fill !== undefined && r.fill < 3) {
            failures.push(`${label}  ${r.label}: fill ${r.fill.toFixed(2)}:1 (needs 3) - ${r.detail}`);
          }
          if (r.tick !== undefined && r.tick < 3) {
            failures.push(`${label}  ${r.label}: tick ${r.tick.toFixed(2)}:1 (needs 3) - ${r.tickDetail}`);
          }
        }
      }
    }
    expect(failures.join("\n")).toBe("");
  });
});
