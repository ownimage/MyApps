// CONTRAST CSS — drift detector AND generator, in one spec.
//
// The WCAG AA contrast normalisation is BAKED INTO the CSS: every theme's own
// per-mode sheet (shared/css/themes/<theme>/<theme>.<mode>.css) carries a generated
// block between the `smd-contrast:start` / `smd-contrast:end` markers, listing the
// button/tab/main-menu text colours that had to be repainted. NOTHING measures
// contrast at runtime any more - no script is loaded by the apps for this.
//
//   default               FAILS if any theme needs a rule it does not have, or
//                         carries a rule it no longer needs = "nothing needs to
//                         change anywhere".
//   SMD_CONTRAST_FIX=1    rewrites the marked block in every sheet, then verifies
//                         the result, so a theme edit is one command:
//                           SMD_CONTRAST_FIX=1 npx playwright test --project=contrast --workers=1
//
// HOW IT MEASURES: the marked block is STRIPPED from the theme sheet (the request
// is intercepted and fulfilled from disk), so the spec always judges the THEME's
// own colours and never its own output. That is what makes regeneration
// idempotent - a second FIX run produces the same files.
//
// WHAT IT DOES NOT DO: prove the rendered result is readable. That is the outcome
// guard in tests/contrast.spec.js (and tests/menu-legibility.spec.js), which
// measures the real components WITH the baked CSS applied.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { measureRenderedControls } = require("./rendered-controls");

const ROOT = path.resolve(__dirname, "..");
const THEMES_DIR = path.join(ROOT, "shared", "css", "themes");
const VARIANTS = ["primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];
const STATES = ["base", "hover", "focus", "active", "disabled"];
const AA = 4.5;
const FIX = process.env.SMD_CONTRAST_FIX === "1";
const START = "smd-contrast:start";
const END = "smd-contrast:end";

// ---- theme discovery ------------------------------------------------------
// Every directory that ships a `<theme>.<mode>.css` override sheet.
const THEMES = fs.readdirSync(THEMES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => ["light", "dark"].every((mode) => fs.existsSync(sheetFor(name, mode))))
  .sort();

function sheetFor(theme, mode) {
  return path.join(THEMES_DIR, theme, `${theme}.${mode}.css`);
}
const MODES = ["light", "dark"];

// ---- marker block I/O -----------------------------------------------------
function splitBlock(text) {
  const start = text.indexOf(START);
  if (start === -1) return { before: text, block: "", after: "" };
  const end = text.indexOf(END);
  if (end === -1) return { before: text, block: "", after: "" };
  const lineStart = text.lastIndexOf("\n", start) + 1;
  const lineEnd = text.indexOf("\n", end) + 1 || text.length;
  return {
    before: text.slice(0, lineStart),
    block: text.slice(lineStart, lineEnd),
    after: text.slice(lineEnd)
  };
}

function stripBlock(text) {
  const { before, after } = splitBlock(text);
  return before + after;
}

function withBlock(text, block) {
  const { before, after } = splitBlock(text);
  const trimmedBefore = before.replace(/\s*$/, "");
  if (!block) {
    // nothing to fix for this theme/mode: drop the block, keep the rest as it was
    return trimmedBefore + "\n" + after.replace(/^\s*\n/, "");
  }
  return trimmedBefore + "\n\n" + block + "\n" + after.replace(/^\s*\n/, "");
}

const norm = (text) => text
  .replace(/\r\n/g, "\n")
  .split("\n").map((l) => l.replace(/\s+$/, "")).join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .replace(/^\n+|\n+$/g, "");

// ---- what the theme needs (measured in the page, with our block stripped) ---
// The page returns, per element, the colour + surface it would paint; the picking
// rules live here so the browser only does CSS measurement.
const MEASURE = (variants) => {
  // --- WCAG + colour helpers (test-only; the app no longer runs any of this) ---
  const AA = 4.5;
  const parse = (s) => {
    const str = String(s == null ? "" : s).trim();
    if (!str || str === "transparent") return null;
    const hex = str.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
      const p = (i) => parseInt(h.slice(i * 2, i * 2 + 2), 16);
      return { r: p(0), g: p(1), b: p(2), a: h.length === 8 ? p(3) / 255 : 1 };
    }
    const m = str.match(/^(rgba?|color)\((.*)\)$/);
    if (!m) return null;                      // e.g. an unresolved var(...)
    const parts = m[2].replace(/^srgb\s+/, "").split(/[\s,\/]+/).filter((v) => v !== "").map(Number);
    const scale = m[1] === "color" ? 255 : 1;
    return { r: parts[0] * scale, g: parts[1] * scale, b: parts[2] * scale, a: parts.length > 3 ? parts[3] : 1 };
  };
  const WHITE = { r: 255, g: 255, b: 255, a: 1 };
  const BLACK = { r: 0, g: 0, b: 0, a: 1 };
  const over = (fg, bg) => (!fg ? bg : fg.a >= 1 ? fg
    : { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lum = (c) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); const hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); };
  const rgb = (c) => "rgb(" + Math.round(c.r) + ", " + Math.round(c.g) + ", " + Math.round(c.b) + ")";

  // The colour to use for `current` on `surface`: null when the theme's own colour
  // already passes AA (nothing to fix), else the better of --bs-body-color /
  // --bs-body-bg, else black/white.
  const pick = (current, surface, bodyColor, bodyBg) => {
    if (!current || !surface) return null;
    if (ratio(over(current, surface), surface) >= AA) return null;
    let best = null;
    [bodyColor, bodyBg].forEach((c) => {
      if (!c) return;
      const r = ratio(c, surface);
      if (r >= AA && (!best || r > best.r)) best = { c, r };
    });
    if (!best) {
      [BLACK, WHITE].forEach((c) => {
        const r = ratio(c, surface);
        if (!best || r > best.r) best = { c, r };
      });
    }
    return best.c;
  };

  // NON-TEXT UI (the menu border): 3:1 is enough (WCAG 1.4.11), and the theme's
  // body/emphasis colours are tried first before falling back to black/white.
  const UI_MIN = 3;
  const pickBorder = (current, surface, candidates) => {
    if (!current || !surface) return null;
    if (ratio(current, surface) >= UI_MIN) return null;
    let best = null;
    candidates.forEach((c) => {
      if (!c) return;
      const r = ratio(c, surface);
      if (r >= UI_MIN && (!best || r > best.r)) best = { c, r };
    });
    if (!best) {
      [BLACK, WHITE].forEach((c) => {
        const r = ratio(c, surface);
        if (!best || r > best.r) best = { c, r };
      });
    }
    return best.c;
  };

  const host = document.getElementById("contrastCssProbe") || (() => {
    const h = document.createElement("div");
    h.id = "contrastCssProbe";
    h.style.cssText = "position:absolute;left:-9999px;top:0";
    variants.forEach((v) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-" + v;
      b.textContent = "Probe";
      h.appendChild(b);
      const badge = document.createElement("span");
      badge.className = "badge text-bg-" + v;
      badge.textContent = "Probe";
      h.appendChild(badge);
    });
    const tabs = document.createElement("smd-tabs");
    h.appendChild(tabs);
    tabs.tabs = [{title:"Active"}, {title:"Inactive"}];
    const select = document.createElement("smd-select");
    select.id = "contrastCssSelect";
    select.options = [{value:"one",label:"Selected"},{value:"two",label:"Option"}];
    h.appendChild(select);
    document.body.appendChild(h);
    return h;
  })();

  // CountMyDays card (date/time/count text) + form/checkbox probes, created once
  // so every theme measures the same elements.
  if (!document.getElementById("contrastCssCard")) {
    const card = document.createElement("cmd-countdown-card");
    card.id = "contrastCssCard";
    card.setAttribute("title", "Contrast Probe");
    card.setAttribute("date-text", "Sat 12 Sep 2026");
    card.setAttribute("time-text", "10:30");
    card.setAttribute("count1", "3");
    card.setAttribute("count2", "weeks");
    document.body.appendChild(card);
  }
  if (!document.getElementById("contrastCssBorders")) {
    const bhost = document.createElement("div");
    bhost.id = "contrastCssBorders";
    bhost.style.cssText = "position:absolute;left:-9999px;top:0";
    const mk = (tag, cls, attrs) => {
      const el = document.createElement(tag);
      el.className = cls;
      Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
      if (tag === "select") {
        const o = document.createElement("option");
        o.textContent = "x";
        el.appendChild(o);
      }
      bhost.appendChild(el);
    };
    mk("input", "form-control", { type: "text" });
    mk("textarea", "form-control");
    mk("select", "form-select");
    mk("input", "form-check-input", { type: "checkbox" });
    const nativeCb = document.createElement("smd-checkbox");
    nativeCb.id = "contrastCssNativeCheckbox";
    bhost.appendChild(nativeCb);
    document.body.appendChild(bhost);
  }
  // Alert bars (MyHID's capture status, hid-tab, the main view, SolarControlar),
  // created once so every theme measures the same elements.
  if (!document.getElementById("contrastCssAlerts")) {
    const ahost = document.createElement("div");
    ahost.id = "contrastCssAlerts";
    ahost.style.cssText = "position:absolute;left:-9999px;top:0";
    ["secondary", "warning", "danger", "success", "info"].forEach((variant) => {
      const el = document.createElement("div");
      el.className = "alert alert-" + variant + " py-2 px-3 mb-3";
      el.textContent = "Contrast Probe";
      ahost.appendChild(el);
    });
    document.body.appendChild(ahost);
  }

  const bodyCs = getComputedStyle(document.body);
  const pageBg = over(parse(bodyCs.backgroundColor), WHITE);
  const bodyColor = parse(bodyCs.color);
  const bodyBg = parse(bodyCs.backgroundColor);
  // `pick` returns a colour object; serialise it for the Node-side formatter.
  const pickCss = (current, surface) => {
    const c = pick(current, surface, bodyColor, bodyBg);
    return c ? rgb(c) : null;
  };

  // A control's real surface is its background colour OR the DARKEST extent of its
  // `background-image` gradient - the part that dominates the body of the button. A
  // flat `background-color` read missed slate dark's secondary button (flat #7a8288
  // reads as fine for black, but its ramp runs down to #62686d: 3.69:1 on black,
  // 5.68:1 on white). For Bootstrap's usual translucent white sheen the darkest
  // extent IS the background colour, so ordinary themes are unaffected.
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

  const out = { buttons: {}, tabs: {}, badges: {}, menu: null };
  // Alert bars: text against the bar's own surface (the theme's alert tint, judged
  // on its darkest extent when it carries a gradient).
  const alertHost = document.getElementById("contrastCssAlerts");
  if (alertHost) {
    out.alerts = {};
    alertHost.querySelectorAll(".alert").forEach((el) => {
      const variant = Array.from(el.classList).filter((c) => c.indexOf("alert-") === 0)[0];
      if (!variant) return;
      const cs = getComputedStyle(el);
      const surface = darkestSurface(cs, over(parse(cs.backgroundColor), pageBg));
      const col = parse(cs.color);
      out.alerts[variant.replace("alert-", "")] = {
        current: col ? rgb(col) : null,
        surface: rgb(surface),
        picked: pickCss(col, surface)
      };
    });
  }

  const menuItem = document.querySelector("#mainNav .dropdown-menu .dropdown-item");
  if (menuItem) {
    // styles.css paints the hamburger menu with the BODY surface and BODY colour.
    out.menu = { current: bodyColor ? rgb(bodyColor) : null, surface: rgb(pageBg), picked: pickCss(bodyColor, pageBg) };
  }

  // MENU BORDER: the popup's edge has to read as a boundary against the page, which
  // the theme's own translucent border tint does not (1.16-2.6:1 on most themes).
  // Non-text UI needs 3:1 (WCAG 1.4.11). Only the COLOUR is repainted; the theme's
  // width/style/radius stay.
  const menuEl = document.querySelector("#mainNav .dropdown-menu");
  if (menuEl) {
    const mcs = getComputedStyle(menuEl);
    const menuBg = over(parse(mcs.backgroundColor), pageBg);
    const borderColor = parse(mcs.borderTopColor);
    // --bs-emphasis-color is the theme's "strongest text" token; it is a good second
    // candidate (some themes keep it dark on a dark page, hence the fallback).
    const emphasisProbe = document.createElement("span");
    emphasisProbe.style.cssText = "position:absolute;color:var(--bs-emphasis-color)";
    document.body.appendChild(emphasisProbe);
    const emphasis = parse(getComputedStyle(emphasisProbe).color);
    emphasisProbe.remove();
    const borderPick = pickBorder(borderColor, menuBg, [bodyColor, emphasis]);
    out.menuBorder = {
      current: borderColor ? rgb(borderColor) : null,
      surface: rgb(menuBg),
      width: parseFloat(mcs.borderTopWidth) || 0,
      style: mcs.borderTopStyle,
      picked: borderPick ? rgb(borderPick) : null
    };
  }

  // CountMyDays card secondary text (date/time/count) on the card surface.
  const card = document.getElementById("contrastCssCard");
  const cardEl = card && card.querySelector(".card");
  if (cardEl) {
    const ccs = getComputedStyle(cardEl);
    const surface = darkestSurface(ccs, over(parse(ccs.backgroundColor), pageBg));
    const dateEl = card.querySelector(".date-text");
    if (dateEl) {
      const col = parse(getComputedStyle(dateEl).color);
      out.cardText = {
        current: col ? rgb(col) : null,
        surface: rgb(surface),
        picked: pickCss(col, surface)
      };
    }
  }

  // Form-entry and Bootstrap checkbox/radio borders: non-text UI needs 3:1. A
  // missing/zero-width border counts as failing (we add a 1px solid boundary).
  const bhost = document.getElementById("contrastCssBorders");
  if (bhost) {
    const emphasisProbe = document.createElement("span");
    emphasisProbe.style.cssText = "position:absolute;color:var(--bs-emphasis-color)";
    document.body.appendChild(emphasisProbe);
    const emphasis = parse(getComputedStyle(emphasisProbe).color);
    emphasisProbe.remove();
    const borderOf = (sel) => {
      const el = bhost.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const raw = parse(cs.borderTopColor);
      const painted = over(raw, pageBg);
      const width = parseFloat(cs.borderTopWidth) || 0;
      const style = cs.borderTopStyle;
      const visible = width > 0 && style !== "none";
      const pick = pickBorder(visible ? painted : pageBg, pageBg, [bodyColor, emphasis]);
      return {
        current: rgb(painted),
        surface: rgb(pageBg),
        width,
        style,
        picked: pick ? rgb(pick) : null
      };
    };
    out.borders = {
      control: borderOf("input.form-control"),
      select: borderOf("select.form-select"),
      checkbox: borderOf("input.form-check-input")
    };
    // <smd-checkbox> now draws its own border (`appearance: none`), so the theme
    // boundary is a normal border again instead of an outline ring. The pick
    // deliberately ignores the inherited currentColor: the generated rule pins
    // one contrast-safe COLOUR per theme, so it is stable no matter where the
    // checkbox sits (the component sheet owns width/style/radius).
    const nativeCb = bhost.querySelector("smd-checkbox input");
    if (nativeCb) {
      const cs = getComputedStyle(nativeCb);
      const raw = parse(cs.borderColor);
      const painted = over(raw, pageBg);
      const width = parseFloat(cs.borderWidth) || 0;
      const style = cs.borderStyle;
      const pick = pickBorder(pageBg, pageBg, [bodyColor, emphasis]);
      out.nativeCheckbox = {
        current: rgb(painted),
        surface: rgb(pageBg),
        width,
        style,
        picked: pick ? rgb(pick) : null
      };
    }
  }
  return out;
};

// Preserve a native colour whenever it passes on EVERY painted gradient stop.
// Flatten a control's gradient only when no foreground can work across its ramp.
function renderedPick(paint, bodyColor, bodyBg) {
  const lum = c => c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const over = (a,b) => a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])).concat(1);
  const score = (c,surfaces) => Math.min(...surfaces.map(bg=>ratio(over(c,bg),bg)));
  const rgb = c => "rgb("+c.slice(0,3).map(Math.round).join(", ")+")";
  const original = score(paint.foreground,paint.surfaces);
  if (original >= AA) return {current:paint.color, picked:null};
  const candidates = [bodyColor,bodyBg,[0,0,0,1],[255,255,255,1]].map(c=>c.slice(0,3).concat(1));
  const choose = surfaces => {
    const measured = candidates.map(c=>({c,ratio:score(c,surfaces)}));
    const theme = measured.slice(0,2).filter(candidate=>candidate.ratio>=AA);
    return (theme.length?theme:measured.slice(2)).sort((a,b)=>b.ratio-a.ratio)[0];
  };
  let best = choose(paint.surfaces), flatten = false;
  if (best.ratio < AA && paint.image !== "none") {
    flatten = true;
    // Removing a conflicting gradient may make the original text readable again.
    if (score(paint.foreground,paint.flatSurfaces) >= AA) return {current:paint.color,picked:null,flatten:true};
    best = choose(paint.flatSurfaces);
  }
  let background = null;
  if (best.ratio < AA) {
    // A transparent field over a page gradient may have no single readable ink.
    // Only in that case use the existing theme body surface behind the label.
    const surface = bodyBg.slice(0,3).concat(1);
    best = choose([surface]); background = rgb(surface); flatten = true;
  }
  if (best.ratio < AA) throw new Error("No accessible foreground for " + JSON.stringify(paint));
  return {current:paint.color,picked:rgb(best.c),flatten,background};
}

async function applyRenderedMeasurements(page, measured) {
  const states = await measureRenderedControls(page,"#contrastCssProbe");
  measured.buttons = {}; measured.badges = {}; measured.tabs = {}; measured.fields = {};
  for (const variant of VARIANTS) {
    measured.buttons[variant] = {};
    for (const state of STATES) {
      const renderedState = state === "hover" ? "hover" : state;
      const sample = states[renderedState];
      measured.buttons[variant][state] = renderedPick(sample.buttons[variant],sample.bodyColor,sample.bodyBg);
    }
    // Focus and hover can have different surfaces (e.g. Slate/Cerulean).
    measured.buttons[variant].focus = renderedPick(states.focus.buttons[variant],states.focus.bodyColor,states.focus.bodyBg);
    measured.badges[variant] = renderedPick(states.base.badges[variant],states.base.bodyColor,states.base.bodyBg);
  }
  for (const field of ["input","select"]) {
    measured.fields[field] = {};
    for (const state of ["base","hover","focus","active"]) {
      const sample = states[state];
      if (sample.fields[field]) measured.fields[field][state] = renderedPick(sample.fields[field],sample.bodyColor,sample.bodyBg);
    }
  }
  measured.selectItems = {};
  for (const kind of ["selected","normal"]) {
    const sample = states.base;
    if (sample.selectItems[kind]) measured.selectItems[kind] = renderedPick(sample.selectItems[kind],sample.bodyColor,sample.bodyBg);
  }
  for (const variant of ["primary","secondary"]) {
    measured.tabs[variant] = {};
    for (const state of ["base","hover","focus","active"]) {
      const sample = states[state];
      measured.tabs[variant][state] = renderedPick(sample.tabs[variant],sample.bodyColor,sample.bodyBg);
    }
  }
}

// ---- formatting (deterministic: the comparison is on the exact text) -------
const SELECTOR = {
  base: (v) => `.btn-${v}:not(:hover):not(:focus-visible):not(:active):not(.active):not(:disabled):not(.disabled)`,
  hover: (v) => `.btn-${v}:not(:active):not(.active):not(:focus-visible):not(:disabled):not(.disabled):hover`,
  focus: (v) => `.btn-${v}:not(:active):not(.active):not(:disabled):not(.disabled):focus-visible`,
  active: (v) => `.btn-${v}:not(:disabled):not(.disabled):active, .btn-${v}:not(:disabled):not(.disabled).active`,
  disabled: (v) => `.btn-${v}:disabled, .btn-${v}.disabled`
};

function hex(c) {
  const m = String(c).match(/-?\d+\.?\d*/g).map(Number);
  const h = (n) => Math.round(n).toString(16).padStart(2, "0");
  const out = "#" + h(m[0]) + h(m[1]) + h(m[2]);
  if (/^#[0-9a-f]{6}$/.test(out) && out[1] === out[2] && out[3] === out[4] && out[5] === out[6]) {
    return out[0] + out[1] + out[3] + out[5];      // #000 / #fff
  }
  return out;
}

function formatBlock(measured) {
  const rules = [];

  // group variants whose state -> colour signature is identical
  const groups = new Map();
  VARIANTS.forEach((v, index) => {
    const found = measured.buttons[v];
    if (!found) return;
    const picked = {};
    STATES.forEach((s) => { picked[s] = found[s].picked ? hex(found[s].picked) : null; });
    if (!STATES.some((s) => picked[s])) return;
    const sig = JSON.stringify(picked);
    if (!groups.has(sig)) groups.set(sig, { picked, variants: [], index });
    groups.get(sig).variants.push(v);
  });

  [...groups.values()].sort((a, b) => a.index - b.index).forEach((group) => {
    const needed = STATES.filter((s) => group.picked[s]);
    const byColour = new Map();
    group.variants.forEach((v) => needed.forEach((s) => {
      const c = group.picked[s];
      if (!byColour.has(c)) byColour.set(c, []);
      byColour.get(c).push(SELECTOR[s](v));
    }));
    byColour.forEach((selectors, colour) => {
      rules.push(selectors.join(",\n") + " {\n  color: " + colour + " !important;\n}");
    });
  });

  Object.entries(measured.badges || {}).forEach(([variant, badge]) => {
    if (badge.picked) rules.push(".badge.text-bg-" + variant + " {\n  color: " + hex(badge.picked) + " !important;\n}");
  });

  VARIANTS.forEach(v => {
    for (const state of STATES) if (measured.buttons[v][state].flatten) rules.push(SELECTOR[state](v) + " {\n  background-image: none !important;\n" + (measured.buttons[v][state].background?"  background-color: "+measured.buttons[v][state].background+" !important;\n":"") + "}");
  });
  for (const [name, cls] of [["primary","text-bg-primary"],["secondary","text-bg-secondary"]]) {
    const states = measured.tabs[name];
    const selectors = {
      base: "smd-tabs .smd-tab-btn."+cls+":not(:hover):not(:focus-visible):not(:active)",
      hover: "smd-tabs .smd-tab-btn."+cls+":hover:not(:focus-visible):not(:active)",
      focus: "smd-tabs .smd-tab-btn."+cls+":focus-visible:not(:active)",
      active: "smd-tabs .smd-tab-btn."+cls+":active"
    };
    for (const state of ["base","hover","focus","active"]) {
      const correction = states[state];
      if (correction.picked || correction.flatten) rules.push(selectors[state]+" {\n"+
        (correction.picked?"  color: "+hex(correction.picked)+" !important;\n":"")+
        (correction.flatten?"  background-image: none !important;\n":"")+
        (correction.background?"  background-color: "+correction.background+" !important;\n":"")+"}");
    }
  }

  for (const [field, selector] of [["input",".form-control:not([readonly]):not(:disabled)"],["select",".form-select:not(:disabled)"]]) {
    for (const state of ["base","hover","focus","active"]) {
      const correction = measured.fields[field][state];
      const suffix = state === "base" ? ":not(:hover):not(:focus-visible):not(:active)" : state === "hover" ? ":hover:not(:focus-visible):not(:active)" : state === "focus" ? ":focus-visible:not(:active)" : ":active";
      if (correction && (correction.picked || correction.background)) rules.push(selector+suffix+" {\n"+
        (correction.picked?"  color: "+hex(correction.picked)+" !important;\n":"")+
        (correction.background?"  background-color: "+correction.background+" !important;\n  background-image: none !important;\n":"")+"}");
    }
  }
  for (const [kind,selector] of [["selected","smd-select .smd-select-item:is(.text-bg-primary, :hover, :focus-visible)"],["normal","smd-select .smd-select-item:not(.text-bg-primary):not(:hover):not(:focus-visible)"]]) {
    const correction = measured.selectItems[kind];
    if (correction && correction.picked) rules.push(selector+" {\n  color: "+hex(correction.picked)+" !important;\n}");
  }

  if (measured.menu && measured.menu.picked) {
    const sel = "#mainNav .dropdown-menu .dropdown-item";
    rules.push(sel + ",\n" + sel + ":hover,\n" + sel + ":focus,\n" + sel + ".active {\n  color: " + hex(measured.menu.picked) + " !important;\n}");
  }

  // The menu + its Launch submenu both match `.dropdown-menu` inside #mainNav, so one
  // rule gives both a boundary that contrasts with the panel (3:1, WCAG 1.4.11).
  if (measured.menuBorder && measured.menuBorder.picked) {
    rules.push("#mainNav .dropdown-menu {\n  border-color: " + hex(measured.menuBorder.picked) + ";\n}");
  }

  // CountMyDays card secondary text (date/time/count): match the card title /
  // body colour when the theme's secondary palette is too close to the surface.
  if (measured.cardText && measured.cardText.picked) {
    rules.push("cmd-countdown-card .text-secondary {\n  color: " + hex(measured.cardText.picked) + " !important;\n}");
  }

  // Alert bars: Bootstrap paints `.alert-<variant>` from `--bs-alert-color`, and
  // several themes ship white on a saturated tint (cyborg warning 2.39:1, darkly
  // 2.19:1). One rule per distinct colour, covering the variants that share it.
  if (measured.alerts) {
    const byColour = new Map();
    Object.keys(measured.alerts).forEach((variant) => {
      const found = measured.alerts[variant];
      if (!found || !found.picked) return;
      const colour = hex(found.picked);
      if (!byColour.has(colour)) byColour.set(colour, []);
      byColour.get(colour).push(".alert-" + variant);
    });
    byColour.forEach((selectors, colour) => {
      rules.push(
        selectors.join(",\n") + " {\n" +
        "  --bs-alert-color: " + colour + ";\n" +
        "  color: " + colour + " !important;\n}"
      );
    });
  }

  // Form-entry and checkbox/radio boundaries: 3:1 against the page (WCAG 1.4.11).
  // Group selectors that resolved to the same colour.
  if (measured.borders) {
    const groups = new Map();
    const add = (sel, m) => {
      if (!m || !m.picked) return;
      const colour = hex(m.picked);
      if (!groups.has(colour)) groups.set(colour, []);
      if (!groups.get(colour).includes(sel)) groups.get(colour).push(sel);
    };
    add(".form-control", measured.borders.control);
    add(".form-select", measured.borders.select);
    add(".form-check-input", measured.borders.checkbox);
    groups.forEach((selectors, colour) => {
      rules.push(
        selectors.join(",\n") + " {\n" +
        "  border-color: " + colour + ";\n" +
        "  border-style: solid;\n" +
        "  border-width: 1px;\n}"
      );
    });
  }

  // The shared <smd-checkbox> draws its own single border (`appearance: none`),
  // so recolour THAT border. Do not add an outline here: a second ring is the
  // double-border bug this replaced.
  if (measured.nativeCheckbox && measured.nativeCheckbox.picked) {
    rules.push(
      "smd-checkbox input[type=\"checkbox\"] {\n" +
      "  border-color: " + hex(measured.nativeCheckbox.picked) + ";\n}"
    );
  }

  if (!rules.length) return "";
  return [
    "/* " + START + " */",
    ...rules,
    "/* " + END + " */"
  ].join("\n");
}

// Switch theme+mode and WAIT until the new sheets are actually APPLIED.
// `link.sheet` keeps pointing at the PREVIOUS sheet for a beat after `href`
// changes (a race this suite has hit before), so three things are waited on:
//   1. the links' own `load` events;
//   2. the LIVE CSSStyleSheet objects (`link.sheet.href`) naming the new theme;
//   3. a stable sample of the applied colours (two identical reads in a row).
async function awaitTheme(page, theme, mode) {
  await page.evaluate(async ([t, m]) => {
    const entries = ["bootstrap-theme-css", "theme-override-specific", "theme-override-mode"].map(id => {
      const link = document.getElementById(id);
      let finish;
      const ready = new Promise((resolve, reject) => {
        const cleanup = () => { link.removeEventListener("load", onLoad); link.removeEventListener("error", onError); };
        const onLoad = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error("Theme stylesheet failed: " + id)); };
        finish = onLoad;
        link.addEventListener("load", onLoad);
        link.addEventListener("error", onError);
      });
      return { link, href: link.href, ready, finish };
    });
    applyTheme(t, m);
    entries.forEach(entry => {
      if (entry.href === entry.link.href && entry.link.sheet) entry.finish();
    });
    await Promise.all(entries.map(entry => entry.ready));
  }, [theme, mode]);

  await page.waitForFunction(([t, m]) => {
    const sheetHref = (id) => {
      const el = document.getElementById(id);
      return (el && el.sheet && el.sheet.href) || "";
    };
    return sheetHref("bootstrap-theme-css").indexOf("/" + t + "/bootstrap.min.css") !== -1 &&
      sheetHref("theme-override-specific").indexOf("/" + t + "/" + t + "." + m + ".css") !== -1;
  }, [theme, mode], { timeout: 20000 });

  // Applied colours must stop moving (the style recalc can land a frame later).
  let previous = null;
  for (let i = 0; i < 30; i++) {
    const now = await page.evaluate(() => {
      const parts = [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).color];
      document.querySelectorAll("#contrastCssProbe .btn").forEach((el) => {
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
test.describe("Contrast CSS is baked and current", { tag: "@contrast" }, () => {
  // The app's service worker precaches the theme CSS, so a `<link>` for a theme is
  // served from the SW cache and page.route never sees it - the stripped body would
  // be bypassed and the measurement would see our own baked block. These specs only
  // need the DOM + CSS, so block the worker.
  test.use({ serviceWorkers: "block" });

  test("every theme's generated contrast block matches what it needs", async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);

    // Serve every theme sheet from DISK with our generated block stripped, so the
    // measurement sees the theme's own colours.
    await page.route("**/css/themes/**", (route) => {
      const rel = decodeURIComponent(new URL(route.request().url()).pathname).split("/css/themes/")[1];
      const file = path.join(THEMES_DIR, rel || "");
      if (!rel || !fs.existsSync(file)) return route.continue();
      return route.fulfill({ status: 200, contentType: "text/css", body: stripBlock(fs.readFileSync(file, "utf8")) });
    });

    await page.goto("/PlanMyDay/", { waitUntil: "domcontentloaded" });
    // Create the probe elements once, so the settle check always sees them.
    await page.evaluate(MEASURE, VARIANTS);

    const problems = [];
    const writes = [];
    const expectedByFile = new Map();

    for (const theme of THEMES) {
      for (const mode of MODES) {
        const label = theme + "/" + mode;
        await awaitTheme(page, theme, mode);

        const measured = await page.evaluate(MEASURE, VARIANTS);
        await applyRenderedMeasurements(page, measured);
        const expected = formatBlock(measured);
        // Diagnostics, surfaced in the failure message (console.log is not shown by
        // the line reporter).
        const probed = await page.evaluate(() => ({
          btns: document.querySelectorAll("#contrastCssProbe .btn").length,
          tabs: document.querySelectorAll("#contrastCssProbe smd-tabs .smd-tab-btn").length,
          overrideRules: (() => { const s = document.getElementById("theme-override-specific"); return s && s.sheet ? s.sheet.cssRules.length : -1; })()
        }));

        const file = sheetFor(theme, mode);
        const original = fs.readFileSync(file, "utf8");
        const currentBlock = norm(splitBlock(original).block);
        const expectedBlock = norm(expected);
        expectedByFile.set(file, expectedBlock);

        if (currentBlock === expectedBlock) continue;

        if (FIX) {
          fs.writeFileSync(file, withBlock(original, expected));
          writes.push(label + (expectedBlock ? " (updated)" : " (block removed - nothing needed)"));
        } else {
          problems.push(
            `${label}  ${file.replace(ROOT + path.sep, "")}\n` +
            (expectedBlock
              ? "    needs:\n" + expectedBlock.split("\n").map((l) => "      " + l).join("\n")
              : "    needs NO overrides, but the sheet still carries a block" +
                "  [measured buttons=" + Object.keys(measured.buttons).length +
                " tabs=" + Object.keys(measured.tabs).length +
                " menu=" + (measured.menu ? measured.menu.picked : "null") +
                " probe=" + JSON.stringify(probed) + "]")
          );
        }
      }
    }

    if (FIX) {
      console.log("SMD_CONTRAST_FIX=1 - rewrote " + writes.length + " sheet(s):\n  " + writes.join("\n  "));
      // verify every write landed (a second run must therefore find nothing to do)
      expect(writes.length, "a fix run must report what it changed").toBe(writes.length);
      for (const [file, expectedBlock] of expectedByFile) {
        expect(norm(splitBlock(fs.readFileSync(file, "utf8")).block),
          file.replace(ROOT + path.sep, "") + " did not receive the generated block").toBe(expectedBlock);
      }
      return;
    }

    expect(
      problems.join("\n\n"),
      "The baked contrast CSS no longer matches the themes.\n" +
      "Run:  SMD_CONTRAST_FIX=1 npx playwright test --project=contrast --workers=1"
    ).toBe("");
  });
});
