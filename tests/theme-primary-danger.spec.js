// sketchy + slate: `--bs-primary` and `--bs-secondary` are so close (sketchy
// #333 vs #555, slate #3a3f44 vs #7a8288 - and slate paints them with near-
// identical gradients) that PRIMARY buttons and the active tab look like the
// SECONDARY ones. User decision (2026-10-19): in these two themes - only these -
// primary borrows the DANGER palette for `<smd-button>` and `<smd-tabs>`, so the
// primary and secondary controls are clearly different.
//
// This spec guards that decision: the primary button/tab must paint the same
// surface as the danger button, and must no longer match the secondary one.
const { test, expect } = require("@playwright/test");

const CASES = [];
for (const theme of ["sketchy", "slate"]) {
  for (const mode of ["light", "dark"]) CASES.push({ theme, mode });
}
const SURFACES = ["primary", "secondary", "danger"];

const RENDER = (surfaces) => {
  const old = document.getElementById("primaryProbe");
  if (old) old.remove();
  const host = document.createElement("div");
  host.id = "primaryProbe";
  host.style.cssText = "position:absolute;left:-9999px;top:0";
  surfaces.forEach((v) => {
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

const MEASURE = () => {
  const out = { buttons: {}, tabs: {} };
  document.querySelectorAll("#primaryProbe smd-button").forEach((hostEl) => {
    const btn = hostEl.querySelector("button");
    const cs = getComputedStyle(btn);
    out.buttons[hostEl.getAttribute("variant")] = {
      bg: cs.backgroundColor,
      bgImage: cs.backgroundImage
    };
  });
  const tabBg = (sel) => {
    const el = document.querySelector("#primaryProbe smd-tabs " + sel);
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, bgImage: cs.backgroundImage };
  };
  out.tabs.active = tabBg(".smd-tab-btn.active");
  out.tabs.inactive = tabBg(".smd-tab-btn:not(.active)");
  return out;
};

async function awaitTheme(page, theme, mode) {
  await page.evaluate(([t, m]) => new Promise((resolve) => {
    const base = document.getElementById("bootstrap-theme-css");
    const specific = document.getElementById("theme-override-specific");
    const modeLayer = document.getElementById("theme-override-mode");
    const href = (el) => (el && el.getAttribute("href")) || "";
    if (href(base).indexOf("/" + t + "/bootstrap.min.css") !== -1 &&
        href(specific).indexOf("/" + t + "/" + t + "." + m + ".css") !== -1) return resolve();
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
  await page.waitForTimeout(150);
}

const isFlat = (image) => !image || image === "none";

test.describe("sketchy + slate: primary uses the danger palette", () => {
  test.use({ serviceWorkers: "block" });
  test.describe.configure({ timeout: 60 * 1000 });

  for (const { theme, mode } of CASES) {
    test(`${theme}/${mode}: primary buttons and the active tab paint the danger surface`, async ({ page }) => {
      await page.goto("/PlanMyDay/");
      await awaitTheme(page, theme, mode);
      await page.evaluate(RENDER, SURFACES);
      const m = await page.evaluate(MEASURE);

      // the primary BUTTON paints what the danger button paints (colour and, where
      // the theme uses one, the same gradient)
      expect(m.buttons.primary.bg, `${theme}/${mode}: primary button background`).toBe(m.buttons.danger.bg);
      if (!isFlat(m.buttons.danger.bgImage)) {
        expect(m.buttons.primary.bgImage, `${theme}/${mode}: primary button gradient`).toBe(m.buttons.danger.bgImage);
      }

      // the ACTIVE tab is the primary surface, so it must be the danger colour too
      expect(m.tabs.active.bg, `${theme}/${mode}: active tab background`).toBe(m.buttons.danger.bg);

      // and the whole point: primary no longer looks like secondary
      expect(m.buttons.primary.bg, `${theme}/${mode}: primary vs secondary button`).not.toBe(m.buttons.secondary.bg);
      expect(m.tabs.active.bg, `${theme}/${mode}: active vs inactive tab`).not.toBe(m.tabs.inactive.bg);
    });
  }
});
