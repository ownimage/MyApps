const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");
const { pickOption } = require("./theme-controls");

// Coverage hooks (top-level so every test in this spec is captured).
test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

test.describe("Launch - Regression", () => {

  // Shared CSS contract: vendor sheets load first so Bootstrap/theme styles win,
  // then the theme Bootstrap, shared functional styles, and finally the
  // theme-specific override.
  const SHELL_CASCADE = [
    "/",
    "/PlanMyDay/",
    "/CountMyDays/",
    "/QRLinks/",
    "/SolarControlar/",
    "/FreeFormOX/",
    "/ListOfLists/",
    "/PhoneButtons/",
    "/storybook/",
    "/storybook/cardViewer.html"
  ];

  function cascadeRank(rawHref) {
    const href = rawHref.split(/[?#]/)[0];
    if (/shared\/vendor\//.test(href)) return 0;
    // Vendor-sheet repaints (e.g. flatpickr) load with the vendor group.
    if (/shared\/css\/vendor-overrides\.css$/.test(href)) return 0;
    if (/shared\/css\/themes\/[^/]+\/bootstrap\.min\.css$/.test(href)) return 1;
    if (/shared\/css\/styles\.css$/.test(href)) return 2;
    // Shared MODE layer: shared/css/themes/<mode>.css (one file per mode).
    if (/shared\/css\/themes\/(light|dark)\.css$/.test(href)) return 3;
    // Per-theme + per-mode layer: shared/css/themes/<theme>/<theme>.<mode>.css.
    if (/shared\/css\/themes\/[^/]+\/[^/]+\.css$/.test(href)) return 4;
    // App-owned layer (e.g. PlanMyDay/css/gantt.css or css/gantt.css) wins over
    // the theme.
    if (/(^|\/)css\/[^/]+\.css$/.test(href)) return 5;
    return 6;
  }

  test("app shells load stylesheets in the documented cascade order", async ({ request }) => {
    for (const shell of SHELL_CASCADE) {
      const response = await request.get(shell);
      expect(response.status(), shell).toBe(200);
      const html = await response.text();
      // Only the document head's own links; cardViewer.html also builds links
      // inside a <script> template, which the Storybook card viewer test covers.
      const stylesheets = (html.split(/<script\b/i)[0].match(/<link\b[^>]*>/g) || [])
        .filter((tag) => /rel="stylesheet"/.test(tag))
        .map((tag) => (tag.match(/href="([^"]+)"/) || [])[1])
        .filter(Boolean);
      const ranks = stylesheets.map(cascadeRank);
      expect(ranks.every((rank) => rank < 6), `${shell} has an unexpected stylesheet: ${stylesheets.join(", ")}`).toBe(true);
      expect(ranks, shell).toEqual([...ranks].sort((a, b) => a - b));
      expect(stylesheets.filter((href) => href.split(/[?#]/)[0].endsWith("shared/css/styles.css")), shell).toHaveLength(1);
    }
  });

  // Every app shows its FULL NAME in the toolbar, next to the hamburger button.
  // The label comes from the shared registry (`SmdApps.APPS[].navTitle || name`)
  // keyed off the app's own path, so the nav and the Launch submenu can never
  // disagree. Phone Buttons opts OUT (`navTitle: false`): its nav already shows
  // the name of the app running on the server.
  test("each app's nav shows the app name next to the hamburger", async ({ page }) => {
    const EXPECTED = [
      ["/", "My Apps"],
      ["/PlanMyDay/", "Plan My Day"],
      ["/CountMyDays/", "Count My Days"],
      ["/QRLinks/", "QR Links"],
      ["/SolarControlar/", "Solar Controlar"],
      ["/FreeFormOX/", "FreeFormOX"],
      ["/ListOfLists/", "List of Lists"]
    ];
    for (const [shell, name] of EXPECTED) {
      await page.goto(shell);
      const title = page.locator("#mainNav #appNavTitle");
      await expect(title, shell).toHaveCount(1);
      await expect(title, shell).toHaveText(name);
      const geom = await page.evaluate(() => {
        const nav = document.getElementById("mainNav");
        const btn = document.getElementById("btnMainMenu");
        const span = document.getElementById("appNavTitle");
        const rb = btn.getBoundingClientRect(), rs = span.getBoundingClientRect();
        return {
          inNav: nav.contains(span),
          sameRow: Math.abs((rb.top + rb.height / 2) - (rs.top + rs.height / 2)) < 6,
          toTheRight: rs.left >= rb.right - 1,
          // Pinned to the body colour, NOT Bootstrap's --bs-navbar-color.
          bodyColour: getComputedStyle(span).color === getComputedStyle(document.body).color
        };
      });
      expect(geom.inNav, shell).toBe(true);
      expect(geom.sameRow, shell).toBe(true);
      expect(geom.toTheRight, shell).toBe(true);
      expect(geom.bodyColour, shell).toBe(true);
    }
    // Phone Buttons opts out of the nav title.
    await page.goto("/PhoneButtons/");
    await expect(page.locator("#appNavTitle")).toHaveCount(0);
  });

  test("root shows the grid of available apps", async ({ page }) => {
    const errors = [];
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/");
    await expect(page.locator("#appGrid .app-tile")).toHaveCount(8);

    const tiles = page.locator("#appGrid .app-tile");
    const EXPECTED_TILES = [
      ["Plan My Day", "PlanMyDay/"],
      ["Count My Days", "CountMyDays/"],
      ["QR Links", "QRLinks/"],
      ["Solar Controlar", "SolarControlar/"],
      ["FreeFormOX", "FreeFormOX/"],
      ["List of Lists", "ListOfLists/"],
      ["Phone Buttons", "PhoneButtons/"],
      ["Launch", "./"]
    ];
    for (let i = 0; i < EXPECTED_TILES.length; i++) {
      await expect(tiles.nth(i)).toContainText(EXPECTED_TILES[i][0]);
      await expect(tiles.nth(i)).toHaveAttribute("href", EXPECTED_TILES[i][1]);
    }

    // App icons load via <smd-image> from the shared sample library (the SVGs are
    // 512x512; the Solar Controlar icon is the unpacked 256px PNG, rendered at
    // the tile's data80 thumbnail when the 80px size sheet applies).
    for (let i = 0; i < 8; i++) {
      await expect.poll(async () => tiles.nth(i).locator("smd-image img").evaluate(el => el.getAttribute("src") && el.naturalWidth)).toBeGreaterThan(0);
    }
    expect(await tiles.nth(3).locator("smd-image img").evaluate(async (imgEl) => {
      const src = imgEl.getAttribute("src");
      if (!src) return false;
      const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
      return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    })).toBe(true);
    expect(errors).toEqual([]);
  });

  test("Launch uses its own settings namespace and the shared image library", async ({ page }) => {
    await page.goto("/");
    const cfg = await page.evaluate(() => ({
      prefix: SmdConfig.storagePrefix,
      imagePrefix: SmdConfig.imagePrefix,
      imageKey: smdImagePrefix() + "images"
    }));
    expect(cfg.prefix).toBe("launch_");
    expect(cfg.imagePrefix).toBe("shared-");
    expect(cfg.imageKey).toBe("shared-images");
  });

  test("settings has theme, image size, share QR and Font Awesome credit", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");
    await expect(page.locator("#settingsTabs .smd-tab-btn")).toHaveText(["Display", "Menu"]);

    // The settings page is an opaque full-screen surface: the Launch grid behind
    // it must not show through (this app does not explicitly hide its main content).
    const pageSurface = page.locator("#settingsPage .smd-page");
    await expect(pageSurface).toBeVisible();
    const surfaceBg = await pageSurface.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(surfaceBg).not.toBe("rgba(0, 0, 0, 0)");
    expect(surfaceBg).not.toBe("transparent");

    await expect(page.locator("#themeSelector .smd-theme-select")).toBeVisible();
    await expect(page.locator("#themeSelector .smd-theme-mode-select")).toBeVisible();
    expect(await page.locator("#themeSelector .smd-theme-select .smd-select-item").count()).toBe(27);
    expect(await page.locator("#themeSelector .smd-theme-mode-select .smd-select-item").allTextContents()).toEqual(["Light", "Dark"]);
    await expect(page.locator("#iconSizeSelector")).toBeVisible();
    await expect(page.locator("#shareQrCode img").first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#settingsPage smd-fontawesome-credit")).toBeVisible();

    // Theme + image size persist in the launch_ namespace.
    await pickOption(page, "#themeSelector .smd-theme-select", "brite");
    await pickOption(page, "#themeSelector .smd-theme-mode-select", "dark");
    await expect.poll(async () => page.evaluate(() => localStorage.getItem("launch_theme"))).toBe("brite");
    await expect.poll(async () => page.evaluate(() => localStorage.getItem("launch_themeMode"))).toBe("dark");
    await expect(page.locator("html")).toHaveAttribute("data-bs-theme", "dark");
    await expect(page.locator("#themeSelector")).toHaveAttribute("mode", "dark");
    await pickOption(page, "#iconSizeSelector", "small");
    await expect.poll(async () => page.evaluate(() => localStorage.getItem("launch_iconSize"))).toBe("small");
  });

  test("every app's menu shows the Launch submenu of ticked apps", async ({ page }) => {
    const EXPECTED_MENU = [
      ["Plan My Day", "../PlanMyDay/"],
      ["Count My Days", "../CountMyDays/"],
      ["QR Links", "../QRLinks/"],
      ["Solar Controlar", "../SolarControlar/"],
      ["FreeFormOX", "../FreeFormOX/"],
      ["List of Lists", "../ListOfLists/"],
      ["Phone Buttons", "../PhoneButtons/"],
      ["Launch", "../"]
    ];
    // SolarControlar is intentionally skipped: it needs its own power-data
    // backend (the /solar/api server), and without it the app's loading overlay
    // covers #btnMainMenu, so the menu can never be opened in this test.
    for (const shell of ["/PlanMyDay/", "/CountMyDays/", "/QRLinks/", "/FreeFormOX/", "/ListOfLists/", "/PhoneButtons/"]) {
      await page.goto(shell);
      await page.locator("#btnMainMenu").click();
      const toggle = page.locator("#mainNav .launch-submenu-toggle");
      await expect(toggle, shell).toBeVisible();
      await expect(toggle).toHaveText("Launch");
      // The Launch entry is a group header now (no href) that opens the flyout.
      await expect(toggle).not.toHaveAttribute("href", /.+/);
      await toggle.click();
      const items = page.locator("#mainNav .launch-submenu-menu .dropdown-item");
      await expect(items, shell).toHaveCount(EXPECTED_MENU.length);
      for (let i = 0; i < EXPECTED_MENU.length; i++) {
        await expect(items.nth(i), shell).toHaveText(EXPECTED_MENU[i][0]);
        await expect(items.nth(i), shell).toHaveAttribute("href", EXPECTED_MENU[i][1]);
      }
    }
  });

  test("every app reads the same shared image library", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("shared-images", JSON.stringify([
        { name: "shared-one", data: "data:image/svg+xml,%3Csvg/%3E" },
        { name: "shared-two", data: "data:image/svg+xml,%3Csvg/%3E" }
      ]));
    });

    await page.goto("/PlanMyDay/");
    await expect.poll(async () => page.evaluate(() => loadImages().map(i => i.name))).toEqual(["shared-one", "shared-two"]);

    await page.goto("/CountMyDays/");
    await expect.poll(async () => page.evaluate(() => loadImages().map(i => i.name))).toEqual(["shared-one", "shared-two"]);

    await page.goto("/QRLinks/");
    await expect.poll(async () => page.evaluate(() => loadImages().map(i => i.name))).toEqual(["shared-one", "shared-two"]);
  });

  test("legacy per-app image lists migrate into the shared library", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await page.waitForLoadState("domcontentloaded");
    // Let the first-visit sample seeding settle before clearing storage, so the
    // async seedSampleImages fetch cannot re-write shared-images over our legacy
    // keys (Launch and PlanMyDay both seed samples at boot now).
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("shared-images") || "[]").length)).toBeGreaterThan(0);
    await page.evaluate(() => {
      localStorage.removeItem("shared-images");
      localStorage.setItem("planmydays_images", JSON.stringify([{ name: "pmd-img", data: "" }]));
      localStorage.setItem("countmydays_images", JSON.stringify([{ name: "cmd-img", data: "" }]));
    });

    await page.reload();
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("shared-images") || "[]").map(i => i.name))).toEqual(["pmd-img", "cmd-img"]);
    const leftovers = await page.evaluate(() => ({
      pmd: localStorage.getItem("planmydays_images"),
      cmd: localStorage.getItem("countmydays_images")
    }));
    expect(leftovers.pmd).toBeNull();
    expect(leftovers.cmd).toBeNull();
  });

  // ── Launch Menu tab ─────────────────────────────────────────

  test.describe("Launch Menu tab", () => {

    const ALL_APPS = ["Plan My Day", "Count My Days", "QR Links", "Solar Controlar", "FreeFormOX", "List of Lists", "Phone Buttons", "Launch"];

    async function openMenuTab(page) {
      await page.goto("/");
      await page.evaluate(() => {
        localStorage.clear();
        document.querySelectorAll("smd-page").forEach(p => { p.slideDuration = 0; });
        openSettings();
      });
      await page.locator("#settingsTabs .smd-tab-btn").filter({ hasText: "Menu" }).click();
      await expect(page.locator("#appMenuList launch-app-menu").first()).toBeVisible();
    }

    test("lists every app with a drag handle, a Launch tick and a Menu tick", async ({ page }) => {
      await openMenuTab(page);
      await expect(page.locator("#appMenuList launch-app-menu")).toHaveCount(ALL_APPS.length);
      await expect(page.locator("#appMenuList .app-name")).toHaveText(ALL_APPS);
      await expect(page.locator("#appMenuList .drag-handle")).toHaveCount(ALL_APPS.length);
      await expect(page.locator("#appMenuList smd-checkbox.launch-toggle")).toHaveCount(ALL_APPS.length);
      await expect(page.locator("#appMenuList smd-checkbox.menu-toggle")).toHaveCount(ALL_APPS.length);
      // both ticks default ON
      await expect(page.locator("#appMenuList smd-checkbox.launch-toggle[checked]")).toHaveCount(ALL_APPS.length);
      await expect(page.locator("#appMenuList smd-checkbox.menu-toggle[checked]")).toHaveCount(ALL_APPS.length);
    });

    test("the Show on Launch tick hides an app from the grid and persists", async ({ page }) => {
      await openMenuTab(page);
      await page.locator('#appMenuList launch-app-menu[path="PhoneButtons/"] smd-checkbox.launch-toggle input').click();
      await expect.poll(() => page.evaluate(() =>
        JSON.parse(localStorage.getItem("launch_appMenu")).find(c => c.path === "PhoneButtons/").onLaunch
      )).toBe(false);
      await page.evaluate(() => closeSettings());
      await expect(page.locator("#appGrid .app-tile")).toHaveCount(ALL_APPS.length - 1);
      await expect(page.locator("#appGrid")).not.toContainText("Phone Buttons");
    });

    test("the Show in Menu tick removes an app from another app's Launch submenu", async ({ page }) => {
      await openMenuTab(page);
      await page.locator('#appMenuList launch-app-menu[path="ListOfLists/"] smd-checkbox.menu-toggle input').click();
      await expect.poll(() => page.evaluate(() =>
        JSON.parse(localStorage.getItem("launch_appMenu")).find(c => c.path === "ListOfLists/").onMenu
      )).toBe(false);
      await page.goto("/PlanMyDay/");
      await page.locator("#btnMainMenu").click();
      await page.locator("#mainNav .launch-submenu-toggle").click();
      await expect(page.locator("#mainNav .launch-submenu-menu .dropdown-item")).toHaveCount(ALL_APPS.length - 1);
      await expect(page.locator("#mainNav .launch-submenu-menu")).not.toContainText("List of Lists");
    });

    test("stacks the Launch and Menu ticks with labels beside the handle, image and title", async ({ page }) => {
      await openMenuTab(page);
      const geo = await page.evaluate(() => {
        const tile = document.querySelector("#appMenuList launch-app-menu");
        const l = tile.querySelector(".launch-toggle").getBoundingClientRect();
        const m = tile.querySelector(".menu-toggle").getBoundingClientRect();
        const name = tile.querySelector(".app-name").getBoundingClientRect();
        const handle = tile.querySelector(".drag-handle").getBoundingClientRect();
        const thumb = tile.querySelector(".thumb").getBoundingClientRect();
        const label = (sel) => tile.querySelector(sel + " .checkbox-label").textContent.trim();
        return {
          launchLabel: label(".launch-toggle"),
          menuLabel: label(".menu-toggle"),
          stacked: m.top >= l.bottom - 1,
          nameMid: name.top + name.height / 2,
          launchMid: l.top + l.height / 2,
          menuMid: m.top + m.height / 2,
          handleLeftOfName: handle.right <= name.left + 1,
          thumbLeftOfName: thumb.right <= name.left + 1
        };
      });
      expect(geo.launchLabel).toBe("Launch");
      expect(geo.menuLabel).toBe("Menu");
      // one tick under the other
      expect(geo.stacked).toBe(true);
      // handle/image sit to the LEFT of the title and the title spans both tick rows
      expect(geo.handleLeftOfName).toBe(true);
      expect(geo.thumbLeftOfName).toBe(true);
      expect(geo.nameMid).toBeGreaterThan(geo.launchMid - 2);
      expect(geo.nameMid).toBeLessThan(geo.menuMid + 2);
    });

    test("reordering the Menu list reorders the Launch grid", async ({ page }) => {
      await openMenuTab(page);
      const tiles = page.locator("#appMenuList launch-app-menu");
      // Drag the FIRST tile down past the second (both are always in view; the
      // list scrolls, so the LAST tile can sit under the page footer).
      const handle = tiles.first().locator(".drag-handle");
      const h = await handle.boundingBox();
      const second = await tiles.nth(1).boundingBox();
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 12, { steps: 4 });
      await page.mouse.move(second.x + second.width / 2, second.y + second.height - 3, { steps: 15 });
      await page.mouse.up();
      await expect(page.locator("#appMenuList launch-app-menu").first()).toHaveAttribute("path", "CountMyDays/");
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("launch_appMenu"))[0].path)).toBe("CountMyDays/");
      await page.evaluate(() => closeSettings());
      await expect(page.locator("#appGrid .app-tile").first()).toContainText("Count My Days");
    });
  });
});
