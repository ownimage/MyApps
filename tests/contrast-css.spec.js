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
//                           SMD_CONTRAST_FIX=1 npx playwright test tests/contrast-css.spec.js
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

const ROOT = path.resolve(__dirname, "..");
const THEMES_DIR = path.join(ROOT, "shared", "css", "themes");
const VARIANTS = ["primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];
const STATES = ["base", "hover", "active", "disabled"];
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
    const parts = m[2].split(/[\s,\/]+/).filter((v) => v !== "").map(Number);
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
    if (ratio(current, surface) >= AA) return null;
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
    });
    const tabs = document.createElement("smd-tabs");
    h.appendChild(tabs);
    const a = document.createElement("button");
    a.className = "nav-link smd-tab-btn text-bg-primary";
    const i = document.createElement("button");
    i.className = "nav-link smd-tab-btn text-bg-secondary";
    tabs.appendChild(a);
    tabs.appendChild(i);
    document.body.appendChild(h);
    return h;
  })();

  const bodyCs = getComputedStyle(document.body);
  const pageBg = over(parse(bodyCs.backgroundColor), WHITE);
  const bodyColor = parse(bodyCs.color);
  const bodyBg = parse(bodyCs.backgroundColor);
  // `pick` returns a colour object; serialise it for the Node-side formatter.
  const pickCss = (current, surface) => {
    const c = pick(current, surface, bodyColor, bodyBg);
    return c ? rgb(c) : null;
  };

  const out = { buttons: {}, tabs: {}, menu: null };

  document.querySelectorAll("#contrastCssProbe .btn").forEach((el) => {
    const v = (el.className.match(/btn-([a-z]+)/) || [])[1];
    if (!v) return;
    const cs = getComputedStyle(el);
    const base = over(parse(cs.backgroundColor), pageBg);
    const surfaceOf = (name, fallback) => {
      const c = parse(cs.getPropertyValue(name));
      return !c || c.a === 0 ? fallback : over(c, pageBg);
    };
    const colorOf = (name, fallback) => {
      const c = parse(cs.getPropertyValue(name));
      return !c || c.a === 0 ? fallback : c;
    };
    const baseColor = parse(cs.color);
    out.buttons[v] = {
      base: { current: baseColor ? rgb(baseColor) : null, surface: rgb(base), picked: pickCss(baseColor, base) },
      hover: (() => { const c = colorOf("--bs-btn-hover-color", baseColor); const s = surfaceOf("--bs-btn-hover-bg", base);
        return { current: c ? rgb(c) : null, surface: rgb(s), picked: pickCss(c, s) }; })(),
      active: (() => { const c = colorOf("--bs-btn-active-color", baseColor); const s = surfaceOf("--bs-btn-active-bg", base);
        return { current: c ? rgb(c) : null, surface: rgb(s), picked: pickCss(c, s) }; })(),
      disabled: (() => { const c = colorOf("--bs-btn-disabled-color", baseColor); const s = surfaceOf("--bs-btn-disabled-bg", base);
        return { current: c ? rgb(c) : null, surface: rgb(s), picked: pickCss(c, s) }; })()
    };
  });

  [["primary", ".text-bg-primary"], ["secondary", ".text-bg-secondary"]].forEach(([name, sel]) => {
    const el = host.querySelector("smd-tabs " + sel);
    if (!el) return;
    const cs = getComputedStyle(el);
    const surface = over(parse(cs.backgroundColor), pageBg);
    const col = parse(cs.color);
    out.tabs[name] = { current: col ? rgb(col) : null, surface: rgb(surface), picked: pickCss(col, surface) };
  });

  const menuItem = document.querySelector("#mainNav .dropdown-menu .dropdown-item");
  if (menuItem) {
    // styles.css paints the hamburger menu with the BODY surface and BODY colour.
    out.menu = { current: bodyColor ? rgb(bodyColor) : null, surface: rgb(pageBg), picked: pickCss(bodyColor, pageBg) };
  }
  return out;
};

// ---- formatting (deterministic: the comparison is on the exact text) -------
const SELECTOR = {
  base: (v) => `.btn-${v}`,
  hover: (v) => `.btn-${v}:hover, .btn-${v}:focus-visible`,
  active: (v) => `.btn-${v}:active`,
  disabled: (v) => `.btn-${v}:disabled, .btn-${v}.disabled`
};
const VAR = { base: "--bs-btn-color", hover: "--bs-btn-hover-color", active: "--bs-btn-active-color", disabled: "--bs-btn-disabled-color" };

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
    // one rule for the VAR values (Bootstrap reads them per state) ...
    rules.push(
      group.variants.map((v) => ".btn-" + v).join(", ") + " {\n" +
      needed.map((s) => "  " + VAR[s] + ": " + group.picked[s] + ";").join("\n") + "\n}"
    );
    // ... and one repaint rule PER DISTINCT COLOUR (a group's states can differ:
    // darkly's success is #222 hover/disabled but #000 active). Themes paint `.btn`
    // with a literal colour and `.text-bg-*` uses !important, so this explicit
    // declaration is what actually repaints.
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

  [["primary", "text-bg-primary"], ["secondary", "text-bg-secondary"]].forEach(([name, cls]) => {
    const t = measured.tabs[name];
    if (!t || !t.picked) return;
    const sel = "smd-tabs .smd-tab-btn." + cls;
    rules.push(sel + ",\n" + sel + ":hover,\n" + sel + ":focus-visible {\n  color: " + hex(t.picked) + " !important;\n}");
  });

  if (measured.menu && measured.menu.picked) {
    const sel = "#mainNav .dropdown-menu .dropdown-item";
    rules.push(sel + ",\n" + sel + ":hover,\n" + sel + ":focus,\n" + sel + ".active {\n  color: " + hex(measured.menu.picked) + " !important;\n}");
  }

  if (!rules.length) return "";
  return [
    "/* " + START + " - generated WCAG AA contrast overrides. Do not edit by hand:",
    "   regenerate with  SMD_CONTRAST_FIX=1 npx playwright test tests/contrast-css.spec.js",
    "   (tests/contrast-css.spec.js fails when this block no longer matches the theme). */",
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
    const done = () => {
      if (settled || --pending > 0) return;
      settled = true;
      resolve();
    };
    [base, specific, modeLayer].filter(Boolean).forEach((el) => {
      pending++;
      const onLoad = () => { el.removeEventListener("load", onLoad); done(); };
      el.addEventListener("load", onLoad);
    });
    applyTheme(t, m);
    setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 5000);
  }), [theme, mode]);

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
test.describe("Contrast CSS is baked and current", () => {
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

    await page.goto("/PlanMyDay/");
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
      "Run:  SMD_CONTRAST_FIX=1 npx playwright test tests/contrast-css.spec.js"
    ).toBe("");
  });
});
