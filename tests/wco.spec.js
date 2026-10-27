const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

// Window Controls Overlay (WCO).
//
// Every manifest opts in. The overlay itself is USER-controlled (the PWA's
// "Hide title bar" toggle) and starts disabled, so the app only reacts to
// navigator.windowControlsOverlay.visible. When visible, #mainNav moves into
// the title-bar strip, the body gets the same top inset, and Auto-hide cannot
// hide the nav any more. When off, the ordinary nav row is untouched.

const APPS = [
  "Launch", "PlanMyDay", "CountMyDays", "ListOfLists", "QRLinks",
  "SolarControlar", "FreeFormOX", "MyHID", "Storyboard"
];

// A controllable stand-in for the real WCO API. visible=true makes the shared
// smd-app.js hook add body.smd-wco exactly as an installed PWA would.
function mockWco(visible) {
  const state = { visible: !!visible, listeners: [] };
  const wco = {
    get visible() { return state.visible; },
    getTitlebarAreaRect() { return { x: 0, y: 0, width: 1200, height: 33 }; },
    addEventListener(type, fn) {
      if (type === "geometrychange") state.listeners.push(fn);
    },
    removeEventListener() {}
  };
  try {
    Object.defineProperty(navigator, "windowControlsOverlay", { configurable: true, get: () => wco });
  } catch (e) {
    Object.defineProperty(Navigator.prototype, "windowControlsOverlay", { configurable: true, get: () => wco });
  }
  window.__wcoState = state;
  window.__setWco = function (value) {
    state.visible = !!value;
    state.listeners.slice().forEach((fn) => fn());
  };
}

test.describe("Window Controls Overlay", () => {
  test("every app manifest opts into window-controls-overlay", () => {
    for (const app of APPS) {
      const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, "..", app, "manifest.json"), "utf8"));
      expect(manifest.display_override, app).toContain("window-controls-overlay");
    }
  });

  test("with the overlay on, the nav moves into the title bar and keeps working", async ({ page }) => {
    await page.addInitScript(mockWco, true);
    await page.goto("/Storyboard/");
    await expect(page.locator("body")).toHaveClass(/smd-wco/);

    const geom = await page.evaluate(() => {
      const nav = document.getElementById("mainNav");
      const area = document.getElementById("storyboardArea");
      const cs = getComputedStyle(nav);
      const navRect = nav.getBoundingClientRect();
      return {
        position: cs.position,
        height: Math.round(navRect.height),
        top: Math.round(navRect.top),
        bodyPad: getComputedStyle(document.body).paddingTop,
        areaTop: Math.round(area.getBoundingClientRect().top)
      };
    });
    expect(geom.position).toBe("fixed");
    expect(geom.height).toBe(33);
    expect(geom.top).toBe(0);
    expect(geom.bodyPad).toBe("33px");
    expect(geom.areaTop).toBeGreaterThanOrEqual(33);

    // The left rail needs extra breathing room under the title-bar hamburger;
    // the normal web app keeps its 12px inset.
    const railGap = await page.evaluate(() => {
      const nav = document.getElementById("mainNav").getBoundingClientRect();
      const rail = document.getElementById("sbToolbar").getBoundingClientRect();
      return Math.round(rail.top - nav.bottom);
    });
    expect(railGap).toBeGreaterThanOrEqual(24);

    // The hamburger must still open its menu: a drag region would swallow it.
    await page.locator("#btnMainMenu").click();
    await expect(page.locator("#mainNav .dropdown-menu").first()).toBeVisible();

    // Auto-hide is irrelevant in the title bar: hideNav may add the class, but
    // the WCO rule pins the transform so the nav cannot slide away.
    await page.evaluate(() => hideNav());
    await expect(page.locator("#mainNav")).toHaveClass(/nav-hidden/);
    expect(await page.evaluate(() =>
      getComputedStyle(document.getElementById("mainNav")).transform)).toBe("none");
  });

  test("the overlay transitioning off restores the normal nav row", async ({ page }) => {
    await page.addInitScript(mockWco, true);
    await page.goto("/Storyboard/");
    await expect(page.locator("body")).toHaveClass(/smd-wco/);

    await page.evaluate(() => window.__setWco(false));
    await expect(page.locator("body")).not.toHaveClass(/smd-wco/);
    expect(await page.evaluate(() =>
      getComputedStyle(document.getElementById("mainNav")).position)).not.toBe("fixed");
    expect(await page.evaluate(() =>
      getComputedStyle(document.body).paddingTop)).toBe("0px");
    // The normal in-app nav row keeps the rail's original 12px inset.
    expect(await page.evaluate(() =>
      getComputedStyle(document.getElementById("sbToolbar")).top)).toBe("12px");
  });

  test("a non-Storyboard shell also hands the title-bar strip to the nav", async ({ page }) => {
    await page.addInitScript(mockWco, true);
    await page.goto("/PlanMyDay/");
    await expect(page.locator("body")).toHaveClass(/smd-wco/);
    const geom = await page.evaluate(() => {
      const nav = document.getElementById("mainNav");
      const container = document.querySelector(".container-fluid");
      const cs = getComputedStyle(nav);
      return {
        position: cs.position,
        height: Math.round(nav.getBoundingClientRect().height),
        top: Math.round(nav.getBoundingClientRect().top),
        containerTop: Math.round(container.getBoundingClientRect().top)
      };
    });
    expect(geom.position).toBe("fixed");
    expect(geom.height).toBe(33);
    expect(geom.top).toBe(0);
    expect(geom.containerTop).toBeGreaterThanOrEqual(33);
  });
});
