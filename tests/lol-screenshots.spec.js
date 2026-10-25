const { test } = require("@playwright/test");
const { createScreenshotAllThemes, seedOneDriveSettings, stubOneDriveBrowser } = require("./screenshot-helpers");

const sampleImages = require("../shared/sampleImages.json");

// A few real sample images so the category/list thumbnails are not all empty.
function sampleByName(name) {
  return sampleImages.images.filter((img) => img.name === name);
}

const CATEGORIES = [
  {
    title: "Work", sequence: 1, description: "Work stuff", image: "List of Lists",
    lists: [
      {
        id: "list_1", title: "Report", sequence: 1, description: "Weekly report", active: true,
        image: "Plan My Day",
        items: [
          { description: "Gather data", done: true, note: "" },
          { description: "Write it up", done: false, note: "Draft done, needs review" },
        ],
      },
      {
        id: "list_2", title: "Meeting", sequence: 2, description: "Notes for the standup",
        active: true, items: [{ description: "Bring the agenda", done: false, note: "" }],
      },
    ],
  },
  {
    title: "Home", sequence: 2, description: "", image: "Count My Days",
    lists: [
      { id: "list_3", title: "Laundry", sequence: 1, description: "", active: true, items: [] },
      { id: "list_4", title: "Shopping", sequence: 2, description: "Weekly shop", active: true, items: [] },
    ],
  },
];

// A same-mode theme swap does not change `data-bs-theme`, so the components that
// read the theme themselves need an explicit re-render per theme.
function refreshLolAfterTheme() {
  const open = (id) => {
    const el = document.getElementById(id);
    return el && !el.classList.contains("d-none") && el.hasAttribute("open") ? el : null;
  };
  if (typeof renderMain !== "function") return;
  if (open("categoriesEditor")) { renderCategoriesEditor(); return; }
  if (open("listSearchEditor")) { renderSearchLists(); return; }
  if (open("listEditPage")) { return; }        // the editor keeps its content
  renderMain();
}

const screenshotAllThemes = createScreenshotAllThemes("lol", refreshLolAfterTheme);

test.describe("ListOfLists - Screenshots", () => {

  test.describe.configure({ timeout: 300000 });

  test.use({
    viewport: { width: 390, height: 797 },
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    hasTouch: true,
    isMobile: true,
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/ListOfLists/");
    await page.evaluate(({ images, categories }) => {
      localStorage.clear();
      localStorage.setItem("lol_fontSize", "normal");
      localStorage.setItem("lol_iconSize", "large");
      localStorage.setItem("lol_density", "normal");
      localStorage.setItem("lol_slideDuration", "0");
      localStorage.setItem("shared-images", JSON.stringify(images));
      localStorage.setItem("lol_categories", JSON.stringify(categories));
      localStorage.removeItem("lol_main_order");
      localStorage.removeItem("lol_last_gen");
    }, { images: sampleImages.images, categories: CATEGORIES });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("lol-list-main-card");
  });

  test("main view", async ({ page }) => {
    await screenshotAllThemes(page, "main-view.png");
  });

  test("main menu dropdown", async ({ page }) => {
    await page.locator("#btnMainMenu").click();
    await page.locator(".dropdown-menu.show").first().waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await screenshotAllThemes(page, "main-menu-dropdown.png");
  });

  test("view list (read-only)", async ({ page }) => {
    await page.locator("#mainCardList lol-list-main-card").first().locator("smd-button.list-view-btn").click();
    await page.locator("#listEditPage").waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await screenshotAllThemes(page, "list-view.png");
  });

  test("edit list", async ({ page }) => {
    await page.locator("#mainCardList lol-list-main-card").first().locator("smd-button.list-view-btn").click();
    await page.locator("#btnViewListEdit").click();
    await page.locator("#listTitleInput").waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await screenshotAllThemes(page, "list-edit.png");
  });

  test("categories editor", async ({ page }) => {
    await page.evaluate(() => openCategoriesEditor());
    await page.locator("#categoryEditorList lol-category-header").first().locator(".category-header-main").click();
    await page.locator("#categoryCollapse_0").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "categories-editor.png");
  });

  test("search lists", async ({ page }) => {
    await page.evaluate(() => openSearchLists());
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "search-lists.png");
  });

  test("settings", async ({ page }) => {
    await page.evaluate(() => openSettings());
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "settings.png");
  });

  test("settings - onedrive", async ({ page }) => {
    await seedOneDriveSettings(page, { prefix: "lol_", directory: "MyApps/ListOfLists" });
    await page.evaluate(() => openSettings());
    await page.waitForSelector("#settingsPage:not(.d-none)");
    await page.locator("#filesync-tab").click();
    await page.locator("#fileSyncTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "OneDrive" }).click();
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "settings-onedrive.png");
  });

  test("main menu dropdown - filesync", async ({ page }) => {
    await seedOneDriveSettings(page, { prefix: "lol_", directory: "MyApps/ListOfLists" });
    await page.evaluate(() => updateFileSyncMenu());
    await page.locator("#btnMainMenu").click();
    await page.locator(".dropdown-menu.show").first().waitFor({ state: "visible" });
    await page.waitForTimeout(250);
    await screenshotAllThemes(page, "main-menu-filesync.png");
  });

  test("open from onedrive", async ({ page }) => {
    await seedOneDriveSettings(page, { prefix: "lol_", directory: "MyApps/ListOfLists" });
    await stubOneDriveBrowser(page, {
      directory: "MyApps/ListOfLists",
      latestName: "listoflists-202610250930.json"
    });
    await page.evaluate(() => openOneDrivePage());
    await page.waitForSelector("#oneDriveBody .od-latest-current");
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "open-from-onedrive.png");
  });
});
