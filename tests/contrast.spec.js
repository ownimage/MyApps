// WCAG AA (4.5:1) contrast for BUTTON and TAB text on EVERY theme and mode.
//
// shared/js/smd-contrast.js repaints a label only where the theme's own colour
// fails AA (preferring --bs-body-color / --bs-body-bg, falling back to
// black/white); this spec is the guard that it actually did, measured on the
// REAL `<smd-button>` / `<smd-tabs>` components rather than on raw `.btn-*`
// probes. Every button state is checked, because hover/active paint their own
// surface (`--bs-btn-hover-bg`, ...) from their own var.
//
// The ratios are recomputed here from the resolved colours the browser reports,
// so the spec asserts the OUTCOME (>= 4.5:1) and not the module's method.
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

// Every resolved colour the browser will paint, with translucent surfaces
// composited over the page background (that is what the eye sees).
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

  const pageBg = over(parse(getComputedStyle(document.body).backgroundColor), { r: 255, g: 255, b: 255, a: 1 });
  const out = { buttons: {}, tabs: {}, hasOverrides: !!document.getElementById("smd-contrast-overrides") };

  document.querySelectorAll("#contrastProbe smd-button").forEach((hostEl) => {
    const btn = hostEl.querySelector("button");
    const cs = getComputedStyle(btn);
    const baseBg = over(parse(cs.backgroundColor), pageBg);
    const baseColor = cs.color;
    // Each state paints from its own var; a missing/transparent surface var falls
    // back to the base surface, and an unparseable token (e.g. an unresolved
    // `var(...)`) falls back to the base colour - exactly as Bootstrap does.
    const stateQuirk = (token) => /^(#|rgba?\(|color\()/i.test(String(token).trim());
    const state = (colorToken, bgToken) => {
      const raw = parse(cs.getPropertyValue(bgToken).trim());
      const token = cs.getPropertyValue(colorToken).trim();
      return {
        color: stateQuirk(token) ? token : baseColor,
        bg: raw && raw.a > 0 ? css(over(raw, pageBg)) : css(baseBg)
      };
    };
    out.buttons[hostEl.getAttribute("variant")] = {
      base: { color: baseColor, bg: css(baseBg) },
      hover: state("--bs-btn-hover-color", "--bs-btn-hover-bg"),
      active: state("--bs-btn-active-color", "--bs-btn-active-bg"),
      disabled: state("--bs-btn-disabled-color", "--bs-btn-disabled-bg")
    };
  });

  const tabState = (selector) => {
    const el = document.querySelector("#contrastProbe smd-tabs " + selector);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { color: cs.color, bg: css(over(parse(cs.backgroundColor), pageBg)) };
  };
  out.tabs.active = tabState(".smd-tab-btn.active");
  out.tabs.inactive = tabState(".smd-tab-btn:not(.active)");
  return out;
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

// Switch theme+mode and wait until the sheets the module measures are the ones
// applyTheme() asked for (link.sheet lags a tick behind `href`).
async function setTheme(page, theme, mode) {
  await page.evaluate(([t, m]) => applyTheme(t, m), [theme, mode]);
  await page.waitForFunction(([t, m]) => {
    const href = (el) => (el && el.getAttribute("href")) || "";
    const specific = document.getElementById("theme-override-specific");
    return href(document.getElementById("bootstrap-theme-css")).indexOf("/" + t + "/bootstrap.min.css") !== -1 &&
      href(specific).indexOf("/" + t + "/" + t + "." + m + ".css") !== -1 && !!specific.sheet;
  }, [theme, mode], { timeout: 15000 });
}

// The module runs off the sheets' load events, so poll rather than sampling once:
// a broken automatic hookup times out here instead of passing by luck. Polling the
// joined failure list (not a count) means a timeout shows exactly which
// variant/state/mode is wrong.
async function settle(page, label, failures) {
  const report = async () => failures(await page.evaluate(MEASURE), label).join("\n");
  await expect.poll(report, { timeout: 15000, message: label + ": waiting for the contrast normaliser" }).toBe("");
  return failures(await page.evaluate(MEASURE), label);
}

test.describe("Contrast (WCAG AA)", () => {

  test("every smd-button variant meets AA in every state, on every theme and mode", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    const failures = [];
    for (const theme of THEMES) {
      for (const mode of MODES) {
        const label = theme + "/" + mode;
        await setTheme(page, theme, mode);
        await page.evaluate(RENDER, VARIANTS);
        failures.push(...await settle(page, label, buttonFailures));
      }
    }
    expect(failures.join("\n")).toBe("");
  });

  test("smd-tab colours meet AA on every theme and mode", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    const failures = [];
    for (const theme of THEMES) {
      for (const mode of MODES) {
        const label = theme + "/" + mode;
        await setTheme(page, theme, mode);
        await page.evaluate(RENDER, VARIANTS);
        failures.push(...await settle(page, label, tabFailures));
      }
    }
    expect(failures.join("\n")).toBe("");
  });

  test("a theme whose own colours already pass AA gets no overrides injected", async ({ page }) => {
    // The normaliser must be a repair, not a blanket repaint: bootstrap and brite
    // pass everywhere, so shared/js/smd-contrast.js should leave no style behind
    // (after any style left by the previous theme has been replaced).
    await page.goto("/PlanMyDay/");
    await setTheme(page, "minty", "light");           // a theme that DOES need repairs
    await page.evaluate(RENDER, VARIANTS);
    await expect.poll(async () => (await page.evaluate(MEASURE)).hasOverrides).toBe(true);
    for (const theme of ["bootstrap", "brite"]) {
      for (const mode of MODES) {
        await setTheme(page, theme, mode);
        await page.evaluate(RENDER, VARIANTS);
        await expect.poll(async () => (await page.evaluate(MEASURE)).hasOverrides,
          { message: theme + "/" + mode + " must not need overrides" }).toBe(false);
      }
    }
  });
});
