const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// OneDrive Phase 2: settings -> Graph plumbing, the folder browser and the
// provider-aware save/import hooks. Every Microsoft call is stubbed at the page
// level (oneDriveInit / oneDriveListFolder / oneDriveLatestJson /
// oneDriveGetFile / oneDrivePutFile), so the suite needs no Azure app
// registration, Microsoft account or internet access.
//
// The real OAuth wiring is exercised separately in the phase probe: MSAL loads,
// loginPopup opens login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize with
// the configured client_id, the callback redirect URI, Files.ReadWrite and a
// PKCE S256 challenge.

const CLIENT_ID = "11111111-2222-3333-4444-555555555555";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The app formats the :latest timestamp in LOCAL time, so derive the expected
// value from the same ISO string (Node and Chromium share the host time zone).
function expectedStamp(iso) {
  const d = new Date(iso);
  return String(d.getDate()).padStart(2, "0") + " " + MONTHS[d.getMonth()] + " " +
    d.getFullYear() + ". " + String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");
}

async function seedOneDrive(page, path, entries) {
  await page.goto(path);
  await page.evaluate(({ keys, clientId }) => {
    localStorage.setItem("smd_onedrive_clientId", clientId);
    localStorage.setItem("smd_onedrive_account", "test@example.com");
    Object.keys(keys).forEach((key) => localStorage.setItem(key, keys[key]));
  }, { keys: entries, clientId: CLIENT_ID });
  await page.reload();
}

async function stubOneDrive(page, options = {}) {
  await page.evaluate((opts) => {
    window.__picked = null;
    window.__put = null;
    SmdConfig.onFileSyncImport = function (provider, data, key) {
      window.__picked = { provider: provider, key: key, data: data };
      return true;
    };
    window.oneDriveInit = function () { return Promise.resolve({ username: "test@example.com" }); };
    window.oneDriveListFolder = function (path) {
      if (path === opts.root) {
        return Promise.resolve({
          folders: [{ name: "Backups", path: opts.root + "/Backups" }],
          files: [{
            name: "planmydays-202610250900.json",
            key: opts.root + "/planmydays-202610250900.json",
            lastModified: "2026-10-25T09:00:00Z"
          }]
        });
      }
      return Promise.resolve({
        folders: [],
        files: [{
          name: "planmydays-202610250800.json",
          key: path + "/planmydays-202610250800.json",
          lastModified: "2026-10-25T08:00:00Z"
        }]
      });
    };
    window.oneDriveLatestJson = function (path) {
      return Promise.resolve({
        name: "planmydays-202610250800.json",
        key: path + "/planmydays-202610250800.json",
        lastModified: "2026-10-25T08:00:00Z"
      });
    };
    window.oneDriveGetFile = function () {
      return Promise.resolve('{"streams":[],"images":[]}');
    };
    window.oneDrivePutFile = function (key, text) {
      window.__put = { key: key, body: text };
      return Promise.resolve({});
    };
  }, { root: options.root || "MyApps/PlanMyDay" });
}

test.describe("OneDrive", () => {
  test("FileSync > OneDrive fields persist and gate the hamburger entries", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await page.evaluate((clientId) => {
      localStorage.setItem("smd_onedrive_clientId", clientId);
      // Keep this test offline: the account row is what matters here.
      window.oneDriveInit = function () { return Promise.resolve(null); };
    }, CLIENT_ID);
    await page.evaluate(() => openSettings());
    await page.locator("#filesync-tab").click();
    await expect(page.locator("#fileSyncTabs > .smd-tab-list .smd-tab-btn")).toHaveText(["OneDrive", "Minio"]);
    await page.locator("#fileSyncTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "OneDrive" }).click();

    await expect(page.locator("#oneDriveDirectory")).toHaveValue("MyApps/PlanMyDay");
    await expect(page.locator("#oneDriveClientId")).toHaveValue(CLIENT_ID);
    await expect(page.locator("#oneDriveTenant")).toHaveValue("common");
    await expect(page.locator("#oneDriveAccount")).toHaveText("Not signed in");
    await expect(page.locator("#btnOneDriveSignIn")).toHaveAttribute("variant", "primary");
    await expect(page.locator("#btnOneDriveSignOut")).toHaveAttribute("variant", "danger");
    await expect(page.locator("#btnOneDriveSignOut button")).toHaveClass(/btn-danger/);
    await expect(page.locator("#btnOneDriveSignOut button")).not.toHaveClass(/btn-outline/);

    await page.locator("#oneDriveEnabled").check();
    await page.locator("#oneDriveDirectory").fill("Custom/Deep/Path/");
    await page.locator("#oneDriveDirectory").blur();
    expect(await page.evaluate(() => localStorage.getItem("planmydays_onedrive_directory"))).toBe("Custom/Deep/Path");

    await page.evaluate(() => closeSettings());
    await page.locator("#btnMainMenu").click();
    await expect(page.locator("a.onedrive-menu-item").filter({ hasText: "Export to OneDrive" })).toBeVisible();
    await expect(page.locator("a.onedrive-menu-item").filter({ hasText: "Import from OneDrive" })).toBeVisible();
    await page.locator("#btnMainMenu").click();

    await page.evaluate(() => openSettings());
    await page.locator("#filesync-tab").click();
    await page.locator("#fileSyncTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "OneDrive" }).click();
    await page.locator("#oneDriveEnabled").uncheck();
    await page.evaluate(() => closeSettings());
    await page.locator("#btnMainMenu").click();
    await expect(page.locator("a.onedrive-menu-item").filter({ hasText: "Export to OneDrive" })).toBeHidden();
  });

  test("page actions use filled smd-buttons, never outline styles", async ({ page }) => {
    await seedOneDrive(page, "/PlanMyDay/", {
      planmydays_onedrive_directory: "MyApps/PlanMyDay"
    });
    await page.evaluate(() => {
      localStorage.removeItem("smd_onedrive_account");
      window.oneDriveInit = function () { return Promise.resolve(null); };
      openOneDrivePage();
    });
    await expect(page.locator("#oneDriveBody .od-status smd-button")).toBeVisible();
    const styles = await page.$$eval("#oneDriveBody smd-button", (hosts) => hosts.map((host) => {
      const button = host.querySelector("button");
      return {
        text: host.textContent.trim(),
        tag: host.tagName,
        cls: button ? button.className : "",
        bg: button ? getComputedStyle(button).backgroundColor : "",
        variant: host.getAttribute("variant")
      };
    }));
    for (const item of styles) {
      expect(item.tag).toBe("SMD-BUTTON");
      expect(item.cls).toContain("btn-");
      expect(item.cls).not.toContain("btn-outline");
      // "Filled" means an actual surface, not the transparent outline look.
      expect(item.bg).not.toBe("rgba(0, 0, 0, 0)");
    }
    // The sign-in action is the filled primary style.
    const signIn = styles.find((item) => item.text === "Sign in");
    expect(signIn.variant).toBe("primary");
    expect(signIn.cls).toContain("btn-primary");
  });

  test("browses folders, files and :latest, then imports through the provider hook", async ({ page }) => {
    await seedOneDrive(page, "/PlanMyDay/", {
      planmydays_onedrive_directory: "MyApps/PlanMyDay"
    });
    await stubOneDrive(page);
    await page.evaluate(() => openOneDrivePage());

    await expect(page.locator("#oneDriveBody .od-folder")).toHaveText("Backups");
    await expect(page.locator("#oneDriveBody .od-folder-split")).toHaveCount(0);
    await expect(page.locator("#oneDriveBody .od-latest")).toContainText("Backups:latest");
    await expect(page.locator("#oneDriveBody .od-latest")).toContainText(
      "planmydays-202610250800.json / " + expectedStamp("2026-10-25T08:00:00Z")
    );
    await expect(page.locator("#oneDriveBody .od-latest-current")).toContainText("PlanMyDay:latest");
    await expect(page.locator("#oneDriveBody .od-latest-current")).toContainText(
      "planmydays-202610250900.json / " + expectedStamp("2026-10-25T09:00:00Z")
    );
    await expect(page.locator("#oneDriveBody .od-latest-current smd-image[image='bi:clock-history']")).toHaveCount(1);
    await expect(page.locator("#oneDriveBody .od-file")).toContainText("planmydays-202610250900.json");
    await expect(page.locator("#oneDriveBody .od-file smd-image[image='fa:file']")).toHaveCount(1);
    // No toolbar Up control: the directory list owns the "< Up" row.
    await expect(page.locator("#btnOneDriveUp")).toHaveCount(0);
    await expect(page.locator("#oneDriveBody .od-up")).toHaveCount(0);

    await page.locator("#oneDriveBody .od-folder").click();
    await expect(page.locator("#oneDriveBody .od-crumbs")).toContainText("Backups");
    await expect(page.locator("#oneDriveBody .od-latest-current")).toContainText("Backups:latest");
    await expect(page.locator("#oneDriveBody .od-latest-current")).toContainText(
      "planmydays-202610250800.json / " + expectedStamp("2026-10-25T08:00:00Z")
    );
    await expect(page.locator("#oneDriveBody .od-up")).toHaveCount(1);
    await page.locator("#oneDriveBody .od-up").click();
    await expect(page.locator("#oneDriveBody .od-crumbs")).toHaveText("OneDrive / MyApps / PlanMyDay");
    await page.locator("#oneDriveBody .od-folder").click();
    await expect(page.locator("#oneDriveBody .od-crumbs")).toContainText("Backups");

    await page.locator("#oneDriveBody .od-file").first().click();
    await expect.poll(async () => page.evaluate(() => window.__picked && window.__picked.provider))
      .toBe("onedrive");
    expect(await page.evaluate(() => window.__picked.key))
      .toBe("MyApps/PlanMyDay/Backups/planmydays-202610250800.json");
  });

  test("Save to OneDrive writes a timestamped planmydays backup", async ({ page }) => {
    await seedOneDrive(page, "/PlanMyDay/", {
      planmydays_onedrive_enabled: "true",
      planmydays_onedrive_directory: "MyApps/PlanMyDay"
    });
    await stubOneDrive(page);
    await page.evaluate(() => saveToOneDrive());
    await expect.poll(async () => page.evaluate(() => window.__put && window.__put.key))
      .toMatch(/^MyApps\/PlanMyDay\/planmydays-\d{12}\.json$/);
    const saved = await page.evaluate(() => {
      const payload = JSON.parse(window.__put.body);
      return {
        streams: Array.isArray(payload.streams),
        images: Array.isArray(payload.images),
        version: payload.version
      };
    });
    expect(saved).toEqual({ streams: true, images: true, version: 1 });
  });

  test("ListOfLists saves its categories payload with the listoflists prefix", async ({ page }) => {
    await seedOneDrive(page, "/ListOfLists/", {
      lol_onedrive_enabled: "true",
      lol_onedrive_directory: "MyApps/ListOfLists"
    });
    await stubOneDrive(page, { root: "MyApps/ListOfLists" });
    await page.evaluate(() => {
      localStorage.setItem("lol_categories", JSON.stringify([
        { id: "cat1", title: "Home", sequence: 1, lists: [] }
      ]));
      saveToOneDrive();
    });
    await expect.poll(async () => page.evaluate(() => window.__put && window.__put.key))
      .toMatch(/^MyApps\/ListOfLists\/listoflists-\d{12}\.json$/);
    const payload = await page.evaluate(() => JSON.parse(window.__put.body));
    expect(payload.categories.map((category) => category.title)).toEqual(["Home"]);
  });

  test("ListOfLists restores categories through the provider-aware import hook", async ({ page }) => {
    await seedOneDrive(page, "/ListOfLists/", {
      lol_onedrive_directory: "MyApps/ListOfLists"
    });
    const result = await page.evaluate(() => {
      window.__picked = null;
      const accepted = SmdConfig.onFileSyncImport("onedrive", {
        categories: [{
          id: "cat1", title: "Imported", sequence: 1, description: "", image: "",
          lists: [{ id: "list1", title: "One", sequence: 1, description: "", active: true, items: [] }]
        }],
        images: []
      }, "listoflists-202610250900.json");
      return {
        accepted: accepted,
        categories: JSON.parse(localStorage.getItem("lol_categories") || "[]")
      };
    });
    expect(result.accepted).toBe(true);
    expect(result.categories.map((category) => category.title)).toEqual(["Imported"]);
    expect(result.categories[0].lists.map((list) => list.title)).toEqual(["One"]);
  });

  test("Storyboard saves the whole story under its own OneDrive folder", async ({ page }) => {
    const scene = {
      id: "od-scene", name: "Scene 1", background: "space", items: [], connectors: [],
      groups: [], view: { zoom: 1, fx: 0.5, fy: 0.5 }
    };
    const story = {
      id: "od-story", name: "My Board", scenes: [scene], activeSceneId: scene.id
    };
    await page.goto("/");
    await page.evaluate(({ story, clientId }) => {
      localStorage.setItem("storyboard_stories", JSON.stringify([story]));
      localStorage.setItem("storyboard_activeStory", story.id);
      localStorage.setItem("storyboard_activeScene", story.activeSceneId);
      localStorage.setItem("storyboard_onedrive_enabled", "true");
      localStorage.setItem("storyboard_onedrive_directory", "MyApps/Storyboard");
      localStorage.setItem("smd_onedrive_clientId", clientId);
      localStorage.setItem("smd_onedrive_account", "test@example.com");
    }, { story, clientId: CLIENT_ID });
    await page.goto("/Storyboard/");
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await page.evaluate(() => {
      window.__put = null;
      window.oneDriveInit = function () { return Promise.resolve({ username: "test@example.com" }); };
      window.oneDrivePutFile = function (key, text) {
        window.__put = { key: key, body: text };
        return Promise.resolve({});
      };
      saveToOneDrive();
    });
    await expect.poll(async () => page.evaluate(() => window.__put && window.__put.key))
      .toMatch(/^MyApps\/Storyboard\/My Board\/story-\d{12}\.json$/);
    const payload = await page.evaluate(() => JSON.parse(window.__put.body));
    expect(payload.app).toBe("storyboard");
    expect(payload.story.name).toBe("My Board");
    expect(payload.story.scenes).toHaveLength(1);
  });

  test("the redirect page loads MSAL's redirect bridge and reports an empty response", async ({ page }) => {
    await page.goto("/onedrive-callback.html");
    expect(await page.evaluate(() => !!window.msalRedirectBridge &&
      typeof window.msalRedirectBridge.broadcastResponseToMainFrame === "function")).toBe(true);
    await expect(page.locator("#msg")).toContainText("No OneDrive sign-in response");
  });

  test("the OneDrive account actions use the full-width CountMyDays layout in every app", async ({ page }) => {
    const apps = ["/PlanMyDay/", "/CountMyDays/", "/ListOfLists/", "/Storyboard/"];
    for (const path of apps) {
      await page.goto(path);
      await page.evaluate((clientId) => {
        localStorage.setItem("smd_onedrive_clientId", clientId);
        window.oneDriveInit = function () { return Promise.resolve(null); };
      }, CLIENT_ID);
      await page.evaluate(() => openSettings());
      await page.locator("#filesync-tab").click();
      expect(await page.locator("#oneDriveAccount").evaluate((el) => el.parentElement.className))
        .toContain("flex-column");
      await expect(page.locator("#btnOneDriveSignIn")).toHaveAttribute("block", "");
      await expect(page.locator("#btnOneDriveSignOut")).toHaveAttribute("block", "");
      await expect(page.locator("#btnOneDriveSignIn button")).toHaveClass(/w-100/);
      await expect(page.locator("#btnOneDriveSignOut button")).toHaveClass(/w-100/);
      await expect(page.locator("#btnOneDriveSignOut button")).toHaveClass(/btn-danger/);
      await expect(page.locator("#btnOneDriveSignOut button")).not.toHaveClass(/btn-outline/);
      await page.evaluate(() => closeSettings());
    }
  });

  test("Storyboard uses one split folder row (navigate | latest)", async ({ page }) => {
    await page.goto("/Storyboard/");
    await page.evaluate((clientId) => {
      localStorage.setItem("smd_onedrive_clientId", clientId);
      localStorage.setItem("smd_onedrive_account", "test@example.com");
      localStorage.setItem("storyboard_onedrive_directory", "MyApps/Storyboard");
    }, CLIENT_ID);
    await page.reload();
    await page.evaluate(() => {
      window.__pickedKey = null;
      window.__navigatedTo = null;
      window.oneDriveInit = function () { return Promise.resolve({ username: "test@example.com" }); };
      window.oneDriveListFolder = function () {
        return Promise.resolve({
          folders: [
            // Deliberately reverse-alphabetical: the renderer sorts by name, so
            // the :latest lookup must be keyed by path, not by array index.
            { name: "Story B", path: "MyApps/Storyboard/Story B" },
            { name: "Story A", path: "MyApps/Storyboard/Story A" }
          ],
          files: []
        });
      };
      window.oneDriveLatestJson = function (path) {
        if (path.indexOf("Story A") === -1) return Promise.resolve(null);
        return Promise.resolve({
          name: "story-202610250900.json",
          key: path + "/story-202610250900.json",
          lastModified: "2026-10-25T09:00:00Z"
        });
      };
      window.oneDriveNavigate = function (path) { window.__navigatedTo = path; };
      window.oneDrivePickFile = function (key) { window.__pickedKey = key; };
      openOneDrivePage();
    });

    await expect(page.locator("#oneDriveBody .od-folder-split")).toHaveCount(2);
    await expect(page.locator("#oneDriveBody .od-folder")).toHaveCount(0);
    await expect(page.locator("#oneDriveBody .od-latest")).toHaveCount(0);
    const navs = page.locator("#oneDriveBody .od-split-nav");
    await expect(navs).toHaveText(["Story A", "Story B"]);
    const latest = page.locator("#oneDriveBody .od-split-latest");
    await expect(latest.first()).toContainText(
      ":latest story-202610250900.json / " + expectedStamp("2026-10-25T09:00:00Z")
    );
    await expect(page.locator("#oneDriveBody .od-split-latest smd-image[image='fa:file']")).toHaveCount(1);
    await expect(latest.nth(1)).toBeDisabled();
    await expect(latest.nth(1)).toContainText("No backups");
    const halves = await page.evaluate(() => {
      const nav = document.querySelector("#oneDriveBody .od-split-nav").getBoundingClientRect().width;
      const right = document.querySelector("#oneDriveBody .od-split-latest").getBoundingClientRect().width;
      return { nav: nav, right: right };
    });
    expect(halves.nav / (halves.nav + halves.right)).toBeCloseTo(0.4, 1);

    await navs.first().click();
    expect(await page.evaluate(() => window.__navigatedTo)).toBe("MyApps/Storyboard/Story A");
    await latest.first().click();
    expect(await page.evaluate(() => window.__pickedKey))
      .toBe("MyApps/Storyboard/Story A/story-202610250900.json");
  });

  test("CountMyDays saves its wizard payload to OneDrive", async ({ page }) => {
    await seedOneDrive(page, "/CountMyDays/", {
      countmydays_onedrive_enabled: "true",
      countmydays_onedrive_directory: "MyApps/CountMyDays",
      countmydays_dates: JSON.stringify([{
        id: "date1", name: "Date", category: "cat1", image: "", type: "annual", month: 1, day: 1
      }]),
      countmydays_categories: JSON.stringify([{ id: "cat1", name: "Cat", image: null }]),
      "shared-images": JSON.stringify([{ name: "Img", data: "data:image/svg+xml;base64,PHN2Zy8+" }])
    });
    await stubOneDrive(page, { root: "MyApps/CountMyDays" });
    await page.evaluate(() => saveToOneDrive());

    const wizard = page.locator("#exportWizardPage");
    await expect(wizard).toHaveAttribute("open", "");
    await expect(wizard).toContainText("Export to OneDrive");
    await wizard.getByRole("button", { name: "Next" }).click();
    await expect(wizard).toContainText("Export Summary");
    await wizard.getByRole("button", { name: "Export" }).click();

    await expect.poll(async () => page.evaluate(() => window.__put && window.__put.key))
      .toMatch(/^MyApps\/CountMyDays\/countmydays-\d{12}\.json$/);
    const payload = await page.evaluate(() => JSON.parse(window.__put.body));
    expect(Object.keys(payload).sort()).toEqual(["categories", "dates", "images"]);
    expect(payload.dates).toHaveLength(1);
    expect(payload.categories).toHaveLength(1);
    expect(payload.images).toHaveLength(1);
    await expect(page.locator("#smdConfirmModal")).toContainText("to OneDrive");
  });

  test("CountMyDays hands a OneDrive backup to its import wizard", async ({ page }) => {
    await seedOneDrive(page, "/CountMyDays/", {
      countmydays_onedrive_directory: "MyApps/CountMyDays"
    });
    await page.evaluate(() => {
      window.oneDriveInit = function () { return Promise.resolve({ username: "test@example.com" }); };
      window.oneDriveListFolder = function (path) {
        return Promise.resolve({
          folders: [],
          files: [{
            name: "countmydays-202610250900.json",
            key: (path ? path + "/" : "") + "countmydays-202610250900.json",
            lastModified: "2026-10-25T09:00:00Z"
          }]
        });
      };
      window.oneDriveGetFile = function () {
        return Promise.resolve(JSON.stringify({
          dates: [{ id: "date1", name: "Imported", category: "cat1", image: "", type: "annual", month: 3, day: 9 }],
          categories: [{ id: "cat1", name: "Imported Cat", image: null }],
          images: []
        }));
      };
      openOneDrivePage();
    });
    await page.locator("#oneDriveBody .od-file").click();
    await expect(page.locator("#importWizardPage")).toHaveAttribute("open", "");
    await expect(page.locator("#oneDriveImportPage")).not.toHaveAttribute("open", "");
  });

  test("OneDrive errors are friendly and an expired session returns to Sign in", async ({ page }) => {
    await seedOneDrive(page, "/PlanMyDay/", {
      planmydays_onedrive_directory: "MyApps/PlanMyDay"
    });
    await page.evaluate(() => {
      window.oneDriveInit = function () { return Promise.resolve({ username: "test@example.com" }); };
      window.oneDriveListFolder = function () {
        return Promise.reject({ status: 404 });
      };
      openOneDrivePage();
    });
    await expect(page.locator("#oneDriveBody .od-status")).toContainText("not found");
    await expect(page.locator("#oneDriveBody .od-status")).toContainText("Try again");

    await page.evaluate(() => {
      localStorage.setItem("smd_onedrive_account", "test@example.com");
      window.oneDriveInit = function () { return Promise.resolve({ username: "test@example.com" }); };
      window.oneDriveListFolder = function () {
        var err = new Error("Sign in to OneDrive first.");
        err.code = "sign_in_required";
        return Promise.reject(err);
      };
      closeOneDrivePage();
      openOneDrivePage();
    });
    await expect(page.locator("#oneDriveBody .od-status")).toContainText("Not signed in to OneDrive");
    expect(await page.evaluate(() => localStorage.getItem("smd_onedrive_account"))).toBeNull();
  });

  test("signing out clears the cached OneDrive account", async ({ page }) => {
    await seedOneDrive(page, "/PlanMyDay/", {
      planmydays_onedrive_directory: "MyApps/PlanMyDay"
    });
    const cleared = await page.evaluate(() => {
      window.oneDriveReadyInstance = function () { return null; };
      window.oneDriveMsalInstance = function () {
        return Promise.resolve({
          getAllAccounts: function () { return [{ username: "test@example.com" }]; },
          logoutPopup: function () { return Promise.resolve(); }
        });
      };
      signOutOfOneDrive();
      return localStorage.getItem("smd_onedrive_account");
    });
    expect(cleared).toBeNull();
  });

  test("path helpers encode, clamp and resolve parents predictably", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    const helpers = await page.evaluate(() => {
      localStorage.setItem("planmydays_onedrive_directory", "MyApps/PlanMyDay");
      return {
        encode: oneDriveEncodePath("My Apps/Plan MyDay/a b.json"),
        root: oneDriveItemPath(""),
        item: oneDriveItemPath("a/b.json"),
        children: oneDriveItemPath("a/b", "/children"),
        join: oneDriveJoinPath("a/", "/b/", "c d"),
        parent: oneDriveParentPath("MyApps/PlanMyDay/Backups/2026"),
        clamp: oneDriveClampPath("SomeOther/Place"),
        friendly404: oneDriveFriendlyError({ status: 404 }),
        friendly403: oneDriveFriendlyError({ status: 403 }),
        friendly401: oneDriveFriendlyError({ status: 401 }),
        friendly429: oneDriveFriendlyError({ status: 429 }),
        friendlyNetwork: oneDriveFriendlyError(new Error("Failed to fetch")),
        friendlySignIn: oneDriveFriendlyError({ code: "sign_in_required" })
      };
    });
    expect(helpers.encode).toBe("My%20Apps/Plan%20MyDay/a%20b.json");
    expect(helpers.root).toBe("/me/drive/root");
    expect(helpers.item).toBe("/me/drive/root:/a/b.json:");
    expect(helpers.children).toBe("/me/drive/root:/a/b:/children");
    expect(helpers.join).toBe("a/b/c d");
    expect(helpers.parent).toBe("MyApps/PlanMyDay/Backups");
    expect(helpers.clamp).toBe("MyApps/PlanMyDay");
    expect(helpers.friendly404).toContain("not found");
    expect(helpers.friendly403).toContain("Files.ReadWrite");
    expect(helpers.friendly401).toContain("sign-in");
    expect(helpers.friendly429).toContain("throttling");
    expect(helpers.friendlyNetwork).toContain("Cannot reach OneDrive");
    expect(helpers.friendlySignIn).toContain("sign-in");
  });
});
