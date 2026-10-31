// FORM FIELD STATE VISIBILITY: active (focused) fields must look clearly
// different from inactive (disabled / read-only) ones, on every theme and mode.
//
// WHAT "CLEARLY DIFFERENT" MEANS HERE
//   A field is judged distinguishable when its border style, border width or
//   border colour differs from the active field, OR when its background fill is
//   a real step away (see MIN_FILL_DISTANCE below). The fill check is the one
//   that catches themes whose "switched off" box is only a few RGB levels away
//   from the live one - e.g. litera/light, where #e9ecef sat on #fff and the
//   field just read as the same white box.
//   CHECKBOXES are measured too: an unchecked <smd-checkbox> is transparent (it
//   shows the page/row), so a disabled one has to paint a background or the only
//   cue left is the border - and that background must be the SAME one the other
//   inactive controls paint (--smd-inactive-surface), not a colour of its own.
//
// WHERE THE COLOURS COME FROM
//   shared/css/styles.css paints disabled / read-only controls from
//   --smd-inactive-surface / --smd-inactive-border / --smd-inactive-text. The
//   MODE layer (shared/css/themes/light.css, dark.css) sets neutral defaults and
//   a theme sheet may override those VALUES in its own
//   shared/css/themes/<theme>/<theme>.<mode>.css - never the selectors. This
//   spec asserts the OUTCOME on the rendered field, so it does not care how a
//   theme reaches the colours.
//
// WHY ONE TEST PER THEME/MODE
//   The repo config sets `quiet: true`, which swallows console output, so a
//   single looping test can only report once, at the end. One test per pair lets
//   the list reporter stream each result as it happens AND leaves a complete
//   list of the failing pairs in the summary - never just a count.
//
// RUNNING
//   npx playwright test tests/form-field-states.spec.js --project=chromium
//   Every theme runs as its own test, so the suite parallelises and each
//   failure names one theme/mode pair instead of a count.
const { test, expect } = require("@playwright/test");

const THEMES = ["bootstrap", "brite", "cerulean", "cosmo", "cyborg", "darkly", "flatly", "journal", "litera",
  "lumen", "lux", "materia", "minty", "morph", "pulse", "quartz", "sandstone", "simplex", "sketchy", "slate",
  "solar", "spacelab", "superhero", "united", "vapor", "yeti", "zephyr"];
const MODES = ["light", "dark"];

// RGB distance under which two fills read as "the same box". #fff -> #e9ecef
// (the old light-mode default) is only ~33 apart and was reported as too
// subtle, so 40 is the smallest step worth calling visible.
const MIN_FILL_DISTANCE = 40;

// ---- colour helpers --------------------------------------------------------
// Chromium serialises computed colours as `rgb()/rgba()`; `color(srgb ...)` is
// used for color-mix() results. Returns null for anything we cannot compare.
function parseColor(color) {
  const s = String(color || "").trim();
  if (!s || s === "transparent" || s === "none") return null;
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const nums = s.match(/-?[\d.]+/g);
  if (!nums || nums.length < 3) return null;
  const [r, g, b] = nums.slice(0, 3).map(Number);
  const scaled = /^color\(/.test(s) ? [r, g, b].map((v) => v * 255) : [r, g, b];
  // Fully transparent fills carry no visible surface (the theme paints a
  // background-image gradient instead) - there is nothing to compare.
  if (nums.length > 3 && Number(nums[3]) === 0) return null;
  return scaled;
}

function colorDistance(a, b) {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  return Math.sqrt(
    Math.pow(ca[0] - cb[0], 2) + Math.pow(ca[1] - cb[1], 2) + Math.pow(ca[2] - cb[2], 2)
  );
}

function describe(state) {
  return `fill ${state.backgroundColor}, border ${state.borderWidth} ${state.borderStyle} ${state.borderColor}`;
}

// ---- probe ----------------------------------------------------------------
// Bare Bootstrap controls, offscreen. #smd-app is <body>, so appending to
// document.body keeps the normal cascade (same trick as contrast.spec.js).
const RENDER_PROBE = () => {
  const old = document.getElementById("formFieldStateTest");
  if (old) old.remove();
  const host = document.createElement("div");
  host.id = "formFieldStateTest";
  host.style.cssText = "position:absolute;left:-5000px;top:0";
  const mk = (id, props) => {
    const el = document.createElement("input");
    el.type = "text";
    el.className = "form-control";
    el.id = id;
    el.value = id;
    Object.assign(el, props || {});
    host.appendChild(el);
  };
  mk("testInput");
  mk("testDisabledInput", { disabled: true });
  mk("testReadonlyInput", { readOnly: true });
  // Checkboxes: the app's control is <smd-checkbox> (light DOM, wraps a real
  // <input type=checkbox>). One pair per checked state, so the ONLY difference
  // inside a pair is active vs inactive.
  const mkBox = (id, attrs) => {
    const el = document.createElement("smd-checkbox");
    el.id = id;
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    host.appendChild(el);
  };
  mkBox("testCheckbox");
  mkBox("testDisabledCheckbox", { disabled: "" });
  mkBox("testCheckedCheckbox", { checked: "" });
  mkBox("testDisabledCheckedCheckbox", { checked: "", disabled: "" });
  document.body.appendChild(host);
};

const FOCUS_ACTIVE = () => {
  const el = document.getElementById("testInput");
  if (el) el.focus();
  return document.activeElement === el;
};

const MEASURE = () => {
  const read = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      borderStyle: cs.borderTopStyle,
      borderWidth: cs.borderTopWidth,
      borderColor: cs.borderTopColor,
      backgroundColor: cs.backgroundColor,
      focus: document.activeElement === el,
    };
  };

  // An unchecked checkbox is transparent, i.e. it SHOWS the page/row behind it.
  // Composite it over the page so "transparent" and "painted #ced4da" are
  // comparable numbers instead of null.
  const parseRgb = (color) => {
    const m = String(color).match(/^rgba?\(([^)]+)\)$/i);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const pageBg = parseRgb(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const flatten = (color) => {
    const fg = parseRgb(color);
    if (!fg) return `rgb(${pageBg.r}, ${pageBg.g}, ${pageBg.b})`;
    if (fg.a >= 1) return `rgb(${Math.round(fg.r)}, ${Math.round(fg.g)}, ${Math.round(fg.b)})`;
    const mix = (f, b) => Math.round(f * fg.a + b * (1 - fg.a));
    return `rgb(${mix(fg.r, pageBg.r)}, ${mix(fg.g, pageBg.g)}, ${mix(fg.b, pageBg.b)})`;
  };
  const readBox = (id) => {
    const host = document.getElementById(id);
    const input = host && host.querySelector('input[type="checkbox"]');
    if (!input) return null;
    const cs = getComputedStyle(input);
    return {
      borderStyle: cs.borderTopStyle,
      borderWidth: cs.borderTopWidth,
      borderColor: cs.borderTopColor,
      backgroundColor: flatten(cs.backgroundColor),
      checked: input.checked,
      disabled: input.disabled,
    };
  };

  return {
    page: flatten(getComputedStyle(document.body).backgroundColor),
    active: read("testInput"),
    disabled: read("testDisabledInput"),
    readonly: read("testReadonlyInput"),
    checkboxEnabled: readBox("testCheckbox"),
    checkboxDisabled: readBox("testDisabledCheckbox"),
    checkboxChecked: readBox("testCheckedCheckbox"),
    checkboxDisabledChecked: readBox("testDisabledCheckedCheckbox"),
  };
};

// ---- theme switching (same contract as contrast.spec.js) -------------------
// applyTheme() swaps three <link> elements; wait for their `load` events, then
// for the LIVE sheets to name the new files, then until the rendered colours
// stop changing (Bootstrap animates field borders for 150ms).
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
    setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 10000);
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
      ["testInput", "testDisabledInput", "testReadonlyInput"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const cs = getComputedStyle(el);
        parts.push(cs.backgroundColor, cs.borderTopColor, cs.borderTopWidth, cs.boxShadow);
      });
      return parts.join("|");
    });
    if (previous === now) return;
    previous = now;
    await page.waitForTimeout(60);
  }
}

// ---- assertions -----------------------------------------------------------
function stateFailures(active, inactive, label, inactiveName) {
  const out = [];

  const widthDiffers = Math.abs((parseFloat(active.borderWidth) || 0) - (parseFloat(inactive.borderWidth) || 0)) >= 1;
  const styleDiffers = active.borderStyle !== inactive.borderStyle;
  const borderDistance = colorDistance(active.borderColor, inactive.borderColor);
  const fillDistance = colorDistance(active.backgroundColor, inactive.backgroundColor);

  const anyDifference = widthDiffers ||
    styleDiffers ||
    (borderDistance !== null && borderDistance >= MIN_FILL_DISTANCE) ||
    (fillDistance !== null && fillDistance >= MIN_FILL_DISTANCE);

  if (!anyDifference) {
    out.push(`${label}: active vs ${inactiveName} look the same ` +
      `(active ${describe(active)} vs ${inactiveName} ${describe(inactive)})`);
  }

  // The fill is the "is this box switched off?" cue people actually notice, so
  // a border-only difference is not enough when the surfaces are near-identical.
  if (fillDistance !== null && fillDistance < MIN_FILL_DISTANCE) {
    out.push(`${label}: active vs ${inactiveName} fill too similar ` +
      `(${active.backgroundColor} vs ${inactive.backgroundColor}, ` +
      `distance ${fillDistance.toFixed(1)} < ${MIN_FILL_DISTANCE})`);
  }

  return out;
}

// A checkbox has no surface of its own, so "inactive" must paint the SAME
// background as the other inactive controls (shared/css/styles.css gives them
// all --smd-inactive-surface). Compared against the inactive probe FIELD, so the
// checkbox cannot drift onto a colour of its own.
function inactiveBackgroundFailures(inactiveField, box, label, boxName) {
  if (!inactiveField || !box) return [];
  const distance = colorDistance(inactiveField.backgroundColor, box.backgroundColor);
  if (distance === null || distance < 1) return [];
  return [`${label}: ${boxName} does not use the inactive background ` +
    `(${box.backgroundColor} vs other inactive fields ${inactiveField.backgroundColor})`];
}

// Fill-only comparison, used for checkboxes: same checked state on both sides,
// so a difference in fill means exactly "inactive is painted differently".
function fillFailures(withState, inactiveState, label, withName, inactiveName) {
  if (!withState || !inactiveState) return [];
  const distance = colorDistance(withState.backgroundColor, inactiveState.backgroundColor);
  if (distance === null || distance >= MIN_FILL_DISTANCE) return [];
  return [`${label}: ${withName} vs ${inactiveName} fill too similar ` +
    `(${withState.backgroundColor} vs ${inactiveState.backgroundColor}, ` +
    `distance ${distance.toFixed(1)} < ${MIN_FILL_DISTANCE})`];
}

async function checkThemeMode(page, theme, mode) {
  const label = `${theme}/${mode}`;
  await setTheme(page, theme, mode);

  // The active field is the FOCUSED one; a theme swap can drop focus.
  const focused = await page.evaluate(FOCUS_ACTIVE);
  await page.waitForTimeout(80);

  const styles = await page.evaluate(MEASURE);
  expect(styles.active, `${label}: active probe field not rendered`).not.toBeNull();
  expect(styles.disabled, `${label}: disabled probe field not rendered`).not.toBeNull();
  expect(styles.readonly, `${label}: read-only probe field not rendered`).not.toBeNull();
  expect(focused, `${label}: could not focus the active field probe`).toBe(true);
  expect(styles.disabled.focus, `${label}: the disabled field unexpectedly took focus`).toBe(false);
  expect(styles.readonly.focus, `${label}: the read-only field unexpectedly took focus`).toBe(false);

  expect(styles.checkboxEnabled, `${label}: enabled checkbox probe not rendered`).not.toBeNull();
  expect(styles.checkboxDisabled, `${label}: disabled checkbox probe not rendered`).not.toBeNull();
  expect(styles.checkboxChecked, `${label}: checked checkbox probe not rendered`).not.toBeNull();
  expect(styles.checkboxDisabledChecked, `${label}: disabled+checked checkbox probe not rendered`).not.toBeNull();
  expect(styles.checkboxDisabled.disabled, `${label}: the disabled checkbox probe is not disabled`).toBe(true);
  expect(styles.checkboxChecked.checked, `${label}: the checked checkbox probe is not checked`).toBe(true);
  // The fix must paint the INACTIVE box only: a live checkbox stays transparent
  // (it shows the row it sits on), so an enabled one still composites to the page.
  expect(styles.checkboxEnabled.backgroundColor,
    `${label}: the enabled checkbox should stay transparent`).toBe(styles.page);

  const failures = [
    ...stateFailures(styles.active, styles.disabled, label, "disabled"),
    ...stateFailures(styles.active, styles.readonly, label, "readonly"),
    // Checkboxes are compared against the FIELD surface, not against the page:
    // an enabled unchecked box is transparent, so what it "sits on" is the page,
    // which on the dark-page light-mode themes (slate, darkly, cyborg, solar,
    // superhero, vapor) and on morph/light is itself within ~25-40 RGB levels of
    // the inactive surface. Comparing there would force the box off the shared
    // inactive palette - exactly what these checks exist to prevent. The live
    // field is the surface a form control is supposed to read as, and the
    // inactiveBackgroundFailures() checks below pin the box to it exactly.
    ...fillFailures(styles.active, styles.checkboxDisabled, label,
      "a live field", "the disabled checkbox"),
    ...inactiveBackgroundFailures(styles.disabled, styles.checkboxDisabled, label,
      "disabled checkbox (unchecked)"),
    ...inactiveBackgroundFailures(styles.disabled, styles.checkboxDisabledChecked, label,
      "disabled checkbox (checked)"),
  ];
  expect(failures.join("\n")).toBe("");
}

test.describe("Form Field State Visibility", () => {
  for (const theme of THEMES) {
    for (const mode of MODES) {
      test(`${theme}/${mode}: active and inactive fields are clearly distinguishable`, async ({ page }) => {
        test.setTimeout(90 * 1000);
        await page.goto("/PlanMyDay/");
        await page.evaluate(RENDER_PROBE);
        await checkThemeMode(page, theme, mode);
      });
    }
  }
});
