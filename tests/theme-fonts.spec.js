// THEME WEBFONTS: each Bootswatch theme loads specific Google fonts via an
// `@import url("https://fonts.googleapis.com/css?family=...")` in its own CSS
// (sketchy: Neucha + Cabin Sketch, journal: News Cycle, cosmo/lumen/solar: Source
// Sans Pro, morph: Nunito, zephyr: Inter, minty: Montserrat, ...). This repo strips
// that import and VENDORS the woff2 files, so the families must be declared with
// @font-face in shared/css/fonts/fonts.css and precached - otherwise the browser
// silently falls back to a system font and the theme stops matching its Bootswatch
// reference (sketchy lost both its hand-drawn body face AND its headings that way).
//
// EXPECTED below is read from Bootswatch's own `@import` per theme (audited
// 2026-10-19), not guessed from our CSS: a family that only appears as an OS
// fallback inside a system stack (litera's "Roboto", journal's "Arial Narrow Bold")
// is not something we ship.
const { test, expect } = require("@playwright/test");

const EXPECTED = {
  bootstrap: [],          // stock Bootstrap, system fonts
  brite: [],
  cerulean: [],
  cosmo: ["Source Sans Pro"],
  cyborg: ["Roboto"],
  darkly: ["Lato"],
  flatly: ["Lato"],
  journal: ["News Cycle"],
  litera: [],
  lumen: ["Source Sans Pro"],
  lux: ["Nunito Sans"],
  materia: ["Roboto"],
  minty: ["Montserrat"],
  morph: ["Nunito"],
  pulse: [],
  quartz: [],
  sandstone: ["Roboto"],
  simplex: ["Open Sans"],
  sketchy: ["Neucha", "Cabin Sketch"],
  slate: [],
  solar: ["Source Sans Pro"],
  spacelab: ["Open Sans"],
  superhero: ["Lato"],
  united: ["Ubuntu"],
  vapor: ["Lato"],
  yeti: ["Open Sans"],
  zephyr: ["Inter"]
};

// Families that the theme uses on HEADINGS/navbar/buttons rather than the body
// (their body stack is the system one) - checked separately so the theme really
// renders with the reference face, not just declares it.
const HEADING_FONT = { sketchy: "Cabin Sketch", journal: "News Cycle", minty: "Montserrat" };

async function awaitTheme(page, theme, mode) {
  await page.evaluate(([t, m]) => new Promise((resolve) => {
    const base = document.getElementById("bootstrap-theme-css");
    const specific = document.getElementById("theme-override-specific");
    const href = (el) => (el && el.getAttribute("href")) || "";
    if (href(base).indexOf("/" + t + "/bootstrap.min.css") !== -1 &&
        href(specific).indexOf("/" + t + "/" + t + "." + m + ".css") !== -1) return resolve();
    let pending = 0;
    let settled = false;
    const done = () => { if (settled || --pending > 0) return; settled = true; resolve(); };
    [base, specific].filter(Boolean).forEach((el) => {
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
}

test.describe("Theme webfonts", () => {
  test.use({ serviceWorkers: "block" });
  test.describe.configure({ timeout: 5 * 60 * 1000 });

  test("every font family a theme's reference loads is bundled and its file loads", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    const failures = [];
    for (const [theme, families] of Object.entries(EXPECTED)) {
      if (!families.length) continue;
      await awaitTheme(page, theme, "light");
      const states = await page.evaluate(async (wanted) => {
        const out = {};
        for (const fam of wanted) {
          const faces = Array.from(document.fonts).filter((f) => f.family.replace(/["']/g, "") === fam);
          if (!faces.length) { out[fam] = "not declared in fonts.css"; continue; }
          await Promise.all(faces.map((f) => f.load().catch(() => {})));
          const bad = faces.map((f) => f.status).filter((s) => s !== "loaded");
          out[fam] = bad.length ? bad.join(",") : faces.length + " face(s) loaded";
        }
        return out;
      }, families);
      for (const [fam, state] of Object.entries(states)) {
        if (!/face\(s\) loaded$/.test(state)) failures.push(`${theme}: "${fam}" -> ${state}`);
      }
      // ... and heading-only faces must actually be applied, not merely declared.
      if (HEADING_FONT[theme]) {
        const used = await page.evaluate(() => {
          const el = document.querySelector("h1, h2, .h1, .h2");
          return el ? getComputedStyle(el).fontFamily : "(no heading on the page)";
        });
        if (!used.replace(/["']/g, "").toLowerCase().startsWith(HEADING_FONT[theme].toLowerCase())) {
          failures.push(`${theme}: heading font is "${used}", expected it to start with "${HEADING_FONT[theme]}"`);
        }
      }
    }
    expect(failures.join("\n")).toBe("");
  });
});
