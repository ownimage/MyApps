// Main-menu (hamburger dropdown) legibility on EVERY theme and mode.
//
// Two symptoms the user reported, each with its own guard:
//   (1) SMALL  - the menu text came out smaller than the page text, because
//       several themes pin `.navbar` (brite's `font-size:1.09375rem` = a fixed
//       17.5px against the default xlarge 20.8px body; journal 18px, litera
//       15.4px, lux/zephyr 14px) or the dropdown itself (sandstone/yeti's 13px
//       items). #mainNav in shared/css/styles.css now pins the toolbar and its
//       menu to the shared `p` token, so the menu can never be smaller than the
//       body and it grows with the Font size setting.
//   (2) GREY   - the menu is painted with the BODY surface (we force it), so its
//       text must be the body colour; a theme's own `--bs-dropdown-link-color`
//       can be a greyer value that no longer matches (quartz dark ships #dee2e6
//       against a #fff body colour). And where the theme's own body text is
//       itself sub-AA (minty light is #888 on #fff = 3.54:1, morph 2.63:1)
//       shared/js/smd-contrast.js repaints the menu text, exactly as it does for
//       buttons and tabs.
const { test, expect } = require("@playwright/test");

const THEMES = ["bootstrap", "brite", "cerulean", "cosmo", "cyborg", "darkly", "flatly", "journal", "litera",
  "lumen", "lux", "materia", "minty", "morph", "pulse", "quartz", "sandstone", "simplex", "sketchy", "slate",
  "solar", "spacelab", "superhero", "united", "vapor", "yeti", "zephyr"];
const MODES = ["light", "dark"];
const FONT_SIZES = ["xsmall", "small", "normal", "large", "xlarge", "jumbo"];
const AA = 4.5;

// ---- WCAG relative luminance / contrast (test-side) ------------------------
function channels(color) {
  const s = String(color).trim();
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    const p = (i) => parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return [p(0), p(1), p(2)];
  }
  const nums = s.match(/-?[\d.]+/g);
  if (!nums) throw new Error("cannot parse colour: " + color);
  const [r, g, b] = nums.slice(0, 3).map(Number);
  return /^color\(/.test(s) ? [r, g, b].map((v) => v * 255) : [r, g, b];
}
function luminance(color) {
  return channels(color).map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}
// A translucent menu surface (quartz) is composited over the page, as the eye sees it.
function solid(color) {
  const nums = String(color).match(/-?[\d.]+/g);
  if (!nums) throw new Error("cannot parse colour: " + color);
  const parts = nums.map(Number);
  const [r, g, b] = parts.slice(0, 3);
  const a = parts.length > 3 ? parts[3] : 1;
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgb(${Math.round(r * a + 255 * (1 - a))}, ${Math.round(g * a + 255 * (1 - a))}, ${Math.round(b * a + 255 * (1 - a))})`;
}

// ---- In-page helper --------------------------------------------------------
const MENU = () => {
  const menu = document.querySelector("#mainNav .dropdown-menu");
  if (!menu) return null;
  const items = Array.from(menu.querySelectorAll(".dropdown-item")).filter((i) => !i.classList.contains("d-none"));
  const item = items[0];
  const nav = document.getElementById("mainNav");
  const bodyFs = parseFloat(getComputedStyle(document.body).fontSize);
  // What styles.css pins the menu text to: the theme's --bs-body-color, resolved
  // in the menu's own context (a theme may set the body element's colour
  // separately - quartz dark's body is #fff while --bs-body-color is #dee2e6).
  const probe = document.createElement("span");
  probe.style.color = "var(--bs-body-color)";
  menu.appendChild(probe);
  const tokenColor = getComputedStyle(probe).color;
  probe.remove();
  return {
    itemCount: items.length,
    bodyFs: bodyFs,
    navFs: nav ? parseFloat(getComputedStyle(nav).fontSize) : null,
    menuFs: parseFloat(getComputedStyle(menu).fontSize),
    itemFs: item ? parseFloat(getComputedStyle(item).fontSize) : null,
    itemColor: item ? getComputedStyle(item).color : null,
    tokenColor: tokenColor,
    bodyColor: getComputedStyle(document.body).color,
    menuBg: getComputedStyle(menu).backgroundColor
  };
};

async function setTheme(page, theme, mode) {
  await page.evaluate(([t, m]) => applyTheme(t, m), [theme, mode]);
  await page.waitForFunction(([t, m]) => {
    const href = (el) => (el && el.getAttribute("href")) || "";
    const specific = document.getElementById("theme-override-specific");
    return href(document.getElementById("bootstrap-theme-css")).indexOf("/" + t + "/bootstrap.min.css") !== -1 &&
      href(specific).indexOf("/" + t + "/" + t + "." + m + ".css") !== -1 && !!specific.sheet;
  }, [theme, mode], { timeout: 15000 });
}

async function openMenu(page) {
  // #mainNav contains TWO dropdown-menus: the hamburger menu itself and the
  // "My Apps" flyout submenu nested inside it (.launch-submenu-menu).
  await page.locator("#btnMainMenu").click();
  await expect(page.locator("#mainNav .dropdown-menu").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const menu = document.querySelector("#mainNav .dropdown-menu");
    return menu ? getComputedStyle(menu).display !== "none" : false;
  })).toBe(true);
}
async function closeMenu(page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("#mainNav .dropdown-menu").first()).toBeHidden();
}

test.describe("Main-menu legibility", () => {

  test("the menu text is never smaller than the body text, on every theme and mode", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    const failures = [];
    for (const theme of THEMES) {
      for (const mode of MODES) {
        const label = theme + "/" + mode;
        await setTheme(page, theme, mode);
        await openMenu(page);
        const m = await page.evaluate(MENU);
        await closeMenu(page);
        if (!m || !m.itemCount) { failures.push(label + ": no visible menu items"); continue; }
        if (m.itemFs < m.bodyFs - 0.01) {
          failures.push(`${label}: menu item ${m.itemFs}px is smaller than the body text ${m.bodyFs}px`);
        }
        if (m.navFs < m.bodyFs - 0.01) {
          failures.push(`${label}: toolbar ${m.navFs}px is smaller than the body text ${m.bodyFs}px`);
        }
        if (m.menuFs < m.bodyFs - 0.01) {
          failures.push(`${label}: menu ${m.menuFs}px is smaller than the body text ${m.bodyFs}px`);
        }
      }
    }
    expect(failures.join("\n")).toBe("");
  });

  test("the menu text follows the Font size setting", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    let previous = 0;
    for (const size of FONT_SIZES) {
      await page.evaluate((v) => changeFontSize(v), size);
      await openMenu(page);
      const m = await page.evaluate(MENU);
      await closeMenu(page);
      expect(m.itemFs, size + ": the menu text grows with the setting").toBeGreaterThan(previous);
      expect(m.itemFs, size + ": the menu text matches the body text (" + m.bodyFs + "px)").toBeCloseTo(m.bodyFs, 1);
      previous = m.itemFs;
    }
  });

  test("the menu text is readable on its surface on every theme and mode", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    const failures = [];
    const mismatched = [];
    for (const theme of THEMES) {
      for (const mode of MODES) {
        const label = theme + "/" + mode;
        await setTheme(page, theme, mode);
        await openMenu(page);
        const m = await page.evaluate(MENU);
        await closeMenu(page);
        if (!m || !m.itemCount) { failures.push(label + ": no visible menu items"); continue; }
        const bg = solid(m.menuBg);
        const ratio = contrast(m.itemColor, bg);
        if (ratio < AA) {
          failures.push(`${label}: menu text ${ratio.toFixed(2)}:1 (${m.itemColor} on ${bg})`);
          continue;
        }
        // Where the theme's OWN body-text token is already readable on this
        // surface the menu must simply use it (no gratuitous repaint) ...
        if (contrast(m.tokenColor, bg) >= AA && m.itemColor !== m.tokenColor) {
          mismatched.push(`${label}: menu ${m.itemColor} but --bs-body-color is ${m.tokenColor}`);
        }
        // ...and where it is not, the repaint must still satisfy AA (asserted above).
      }
    }
    expect(failures.join("\n")).toBe("");
    expect(mismatched.join("\n")).toBe("");
  });

  test("the Launch flyout submenu is visible on every theme and mode", async ({ page }) => {
    // The flyout is positioned at `left: 100%`, so an ancestor with
    // `overflow: hidden` clips it away: the element keeps its geometry but is
    // never painted and never hit-tested. sketchy is the only theme that sets
    // `.dropdown-menu{overflow:hidden}`, and its Main Menu | Launch submenu was
    // invisible in both modes until #mainNav .dropdown-menu opted out.
    // elementFromPoint is the honest check - a clipped element still reports a rect.
    await page.goto("/PlanMyDay/");
    const failures = [];
    for (const theme of THEMES) {
      for (const mode of MODES) {
        const label = theme + "/" + mode;
        await setTheme(page, theme, mode);
        await openMenu(page);
        await page.locator("#mainNav .launch-submenu-toggle").hover();
        const hit = () => page.evaluate(() => {
          const menu = document.querySelector("#mainNav .launch-submenu-menu");
          const item = menu && menu.querySelector(".dropdown-item");
          if (!item) return false;
          const r = item.getBoundingClientRect();
          const point = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
          return !!(point && menu.contains(point));
        });
        let visible = false;
        try {
          await expect.poll(hit, { timeout: 4000 }).toBe(true);
          visible = true;
        } catch (e) { visible = false; }
        if (!visible) failures.push(label + ": the Launch submenu is clipped or not hit-testable");
        await closeMenu(page);
      }
    }
    expect(failures.join("\n")).toBe("");
  });
});
