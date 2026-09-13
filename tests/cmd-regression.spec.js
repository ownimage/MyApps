const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

const now = new Date();
const TODAY_MONTH = now.getMonth() + 1;
const TODAY_DAY = now.getDate();
const FUTURE_YEAR = now.getFullYear() + 2;

const SEED_IMAGES = [
  {
    name: "imgA",
    data: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" stroke="#000000" fill="none"><rect x="1" y="1" width="10" height="10"/></svg>')
  },
  {
    name: "imgB",
    data: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" stroke="#000000" fill="none"><circle cx="6" cy="6" r="5"/></svg>')
  },
  {
    name: "imgC",
    data: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" stroke="#000000" fill="none"><path d="M1 1 L11 11"/></svg>')
  }
];

const SEED_CATEGORIES = [
  { name: "Birthday", image: "imgA" },
  { name: "Work", image: null }
];

const SEED_DATES = [
  { name: "Today Event", category: "", image: "", type: "annual", month: TODAY_MONTH, day: TODAY_DAY },
  { name: "Anniversary", category: "Birthday", image: "imgB", type: "annual", month: 7, day: 14 },
  { name: "Project Deadline", category: "Work", image: "imgC", type: "once", month: 12, day: 25, year: FUTURE_YEAR },
  { name: "Trip", category: "Birthday", image: "", type: "annual", month: 11, day: 3 }
];

async function seed(page, overrides = {}) {
  const data = {
    dates: SEED_DATES,
    categories: SEED_CATEGORIES,
    images: SEED_IMAGES,
    settings: {},
    ...overrides
  };
  await page.goto("/CountMyDays/");
  await page.evaluate(({ dates, categories, images, settings }) => {
    localStorage.clear();
    if (dates) localStorage.setItem("countmydays_dates", JSON.stringify(dates));
    if (categories) localStorage.setItem("countmydays_categories", JSON.stringify(categories));
    if (images) localStorage.setItem("countmydays_images", JSON.stringify(images));
    Object.entries(settings).forEach(([key, value]) => localStorage.setItem("countmydays_" + key, value));
  }, data);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

test.describe("CountMyDays - Regression", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto("/CountMyDays/");
    await startCoverage(page);
  });

  test.afterEach(async ({ page }) => {
    await stopCoverage(page);
  });

  test.describe("Boot + migration", () => {

    test("boots with no console errors and renders countdowns", async ({ page }) => {
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
      page.on("pageerror", (err) => pageErrors.push(String(err)));

      await seed(page);

      await expect(page.locator("cmd-countdown-card").first()).toBeVisible();
      expect(await page.locator("cmd-countdown-card").count()).toBe(4);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test("legacy unprefixed keys are migrated and removed", async ({ page }) => {
      await page.goto("/CountMyDays/");
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem("dates", JSON.stringify([{ name: "Legacy Day", category: "", image: "", type: "annual", month: 12, day: 25 }]));
        localStorage.setItem("categories", JSON.stringify([{ name: "Legacy Cat", image: null }]));
        localStorage.setItem("images", JSON.stringify([{ name: "Legacy Img", data: "data:image/svg+xml,%3Csvg/%3E" }]));
        localStorage.setItem("theme", "darkly");
        localStorage.setItem("fontSize", "small");
        localStorage.setItem("iconSize", "medium");
        localStorage.setItem("countdownFormat", "weeksAndDays");
      });
      await page.reload();
      await page.waitForLoadState("domcontentloaded");

      const migrated = await page.evaluate(() => ({
        dates: JSON.parse(localStorage.getItem("countmydays_dates") || "[]").length,
        categories: JSON.parse(localStorage.getItem("countmydays_categories") || "[]").length,
        images: JSON.parse(localStorage.getItem("countmydays_images") || "[]").length,
        theme: localStorage.getItem("countmydays_theme"),
        fontSize: localStorage.getItem("countmydays_fontSize"),
        iconSize: localStorage.getItem("countmydays_iconSize"),
        legacyDates: localStorage.getItem("dates"),
        legacyTheme: localStorage.getItem("theme")
      }));
      expect(migrated.dates).toBe(1);
      expect(migrated.categories).toBe(1);
      expect(migrated.images).toBe(1);
      expect(migrated.theme).toBe("darkly");
      expect(migrated.fontSize).toBe("small");
      expect(migrated.iconSize).toBe("medium");
      expect(migrated.legacyDates).toBeNull();
      expect(migrated.legacyTheme).toBeNull();

      // The migrated data renders, not the sample data.
      await expect(page.locator("cmd-countdown-card").first()).toHaveAttribute("title", "Legacy Day");
    });

    test("sample data seeds empty stores on first visit", async ({ page }) => {
      await page.goto("/CountMyDays/");
      await page.evaluate(() => { localStorage.clear(); });
      await page.reload();
      await page.waitForFunction(() => {
        try {
          return JSON.parse(localStorage.getItem("countmydays_dates") || "[]").length > 0;
        } catch (e) {
          return false;
        }
      });
      const counts = await page.evaluate(() => ({
        dates: JSON.parse(localStorage.getItem("countmydays_dates") || "[]").length,
        categories: JSON.parse(localStorage.getItem("countmydays_categories") || "[]").length,
        images: JSON.parse(localStorage.getItem("countmydays_images") || "[]").length
      }));
      expect(counts.dates).toBeGreaterThan(0);
      expect(counts.categories).toBeGreaterThan(0);
      expect(counts.images).toBeGreaterThan(0);
      await expect(page.locator("cmd-countdown-card").first()).toBeVisible();
    });
  });

  test.describe("Main view", () => {

    test("renders the today section and future section", async ({ page }) => {
      await seed(page);
      await expect(page.locator("#countdownContainer h2").first()).toHaveText("Today!");
      await expect(page.locator("cmd-countdown-card").first()).toHaveAttribute("title", "Today Event");
      const headings = await page.locator("#countdownContainer h2").allTextContents();
      expect(headings.length).toBe(2);
      expect(headings[1]).toContain("From ");
    });

    test("days format shows the day count", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => changeFormat("days"));
      await page.evaluate(() => renderMain());
      const card = page.locator("cmd-countdown-card").first();
      await expect(card).toHaveAttribute("count1", "0");
      await expect(card).toHaveAttribute("count2", "days");
    });

    test("weeks and days format is honoured", async ({ page }) => {
      await seed(page, { settings: { countdownFormat: "weeksAndDays" } });
      const card = page.locator("cmd-countdown-card").filter({ hasText: "Anniversary" });
      await expect(card).toHaveAttribute("count1", /week/);
      await expect(card).toHaveAttribute("count2", /day/);
    });

    test("max countdowns limits the list and + N more expands it", async ({ page }) => {
      await seed(page, { settings: { maxCountdowns: "1" } });
      // 4 seeded dates: 1 today + 3 future; only the first future is shown.
      expect(await page.locator("cmd-countdown-card").count()).toBe(2);
      const more = page.locator("#countdownContainer a.btn");
      await expect(more).toContainText("+ 2 more");
      await more.click();
      expect(await page.locator("cmd-countdown-card").count()).toBe(4);
    });

    test("category and date thumbnails render through smd-image", async ({ page }) => {
      await seed(page);
      const card = page.locator("cmd-countdown-card").filter({ hasText: "Anniversary" });
      const thumbs = card.locator("smd-image");
      expect(await thumbs.count()).toBe(2);
      await expect(thumbs.first()).toHaveAttribute("image", "imgA");
      await expect(thumbs.nth(1)).toHaveAttribute("image", "imgB");
      await expect(thumbs.first().locator("img")).toBeVisible();
    });
  });

  test.describe("Settings", () => {

    test("opens with the theme list and display controls", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openSettings());
      await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");
      await expect(page.locator("#themeSelector select")).toBeVisible();
      // 26 shared themes (25 + brite)
      expect(await page.locator("#themeSelector select option").count()).toBe(26);
      await expect(page.locator("#formatSelector")).toBeVisible();
      await expect(page.locator("#fontSizeSelector")).toBeVisible();
      await expect(page.locator("#iconSizeSelector")).toBeVisible();
      await expect(page.locator("#densitySelector")).toBeVisible();
      await expect(page.locator("#maxCountdownsSelector")).toBeVisible();
      await expect(page.locator("#autoHideMenu")).toBeVisible();
      await page.locator("#settingsPage").getByRole("button", { name: "Done" }).click();
      await expect(page.locator("#countdownContainer")).not.toHaveClass(/d-none/);
    });

    test("theme change persists and swaps the stylesheet", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openSettings());
      await page.locator("#themeSelector select").selectOption("brite");
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("countmydays_theme"))).toBe("brite");
      const href = await page.locator("#bootstrap-theme-css").getAttribute("href");
      expect(href).toContain("css/themes/brite/bootstrap.min.css");
      await expect.poll(async () => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("brite");
    });

    test("font size and density apply body classes", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openSettings());
      await page.locator("#fontSizeSelector").selectOption("small");
      await page.locator("#densitySelector").selectOption("compact");
      expect(await page.evaluate(() => document.body.classList.contains("font-size-small"))).toBe(true);
      expect(await page.evaluate(() => document.body.classList.contains("compact"))).toBe(true);
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("countmydays_density"))).toBe("compact");
    });

    test("icon size drives the smd-image render size", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openSettings());
      await page.locator("#iconSizeSelector").selectOption("small");
      const width = await page.evaluate(() => {
        const card = document.querySelector("cmd-countdown-card");
        return getComputedStyle(card.shadowRoot.querySelector("smd-image")).width;
      });
      expect(width).toBe("64px");
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("countmydays_iconSize"))).toBe("small");
    });

    test("danger actions are hidden until Show danger is enabled", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openSettings());
      await page.locator("#danger-tab").click();
      await expect(page.locator("#settingsPage #clearAllDataRow")).toBeHidden();
      await page.locator("#showDanger").check();
      await expect(page.locator("#settingsPage #clearAllDataRow")).toBeVisible();
    });
  });

  test.describe("Dates editor", () => {

    test("lists dates sorted by target date", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openDatesEditor());
      await expect(page.locator("#datesEditor")).toHaveAttribute("open", "");
      await expect(page.locator("#datesEditor cmd-date-card").first()).toHaveAttribute("name", "Today Event");
      expect(await page.locator("#datesEditor cmd-date-card").count()).toBe(4);
    });

    test("adds a date and saves its fields", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openDatesEditor());
      await page.locator("#datesEditor").getByRole("button", { name: "Add Date" }).click();
      await expect(page.locator("#dateEditPage")).toHaveAttribute("open", "");
      await page.locator("#dateNameInput").fill("New Holiday");
      await page.locator("#dateDaySelect").selectOption("9");
      await page.locator("#dateMonthSelect").selectOption("6");
      await page.locator("#dateEditPage").getByRole("button", { name: "OK" }).click();
      await expect(page.locator("#dateEditPage")).not.toHaveAttribute("open", "");

      const saved = await page.evaluate(() => {
        const dates = JSON.parse(localStorage.getItem("countmydays_dates") || "[]");
        return dates.find(d => d.name === "New Holiday");
      });
      expect(saved).toBeTruthy();
      expect(saved.day).toBe(9);
      expect(saved.month).toBe(6);
      expect(saved.type).toBe("annual");
      expect(await page.locator("#datesEditor cmd-date-card").count()).toBe(5);
    });

    test("once type uses a date input and saves the year", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openDatesEditor());
      await page.locator("#datesEditor cmd-date-card").first().getByRole("button", { name: "Edit" }).click();
      await page.locator("#dateTypeSelect").selectOption("once");
      await expect(page.locator("#dateOnceInput")).toBeVisible();
      await page.locator("#dateOnceInput").fill("15/03/2030");
      await page.locator("#dateOnceInput").press("Tab");
      await page.locator("#dateEditPage").getByRole("button", { name: "OK" }).click();

      const saved = await page.evaluate(() => {
        const dates = JSON.parse(localStorage.getItem("countmydays_dates") || "[]");
        return dates.find(d => d.type === "once" && d.name === "Today Event");
      });
      expect(saved.year).toBe(2030);
      expect(saved.month).toBe(3);
      expect(saved.day).toBe(15);
    });

    test("cancel removes a newly added date", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openDatesEditor());
      await page.locator("#datesEditor").getByRole("button", { name: "Add Date" }).click();
      await page.locator("#dateEditPage").getByRole("button", { name: "Cancel" }).click();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_dates") || "[]").length)).toBe(4);
    });

    test("delete confirmation removes the date", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openDatesEditor());
      await page.locator("#datesEditor cmd-date-card").filter({ hasText: "Trip" }).getByRole("button", { name: "Delete" }).click();
      await expect(page.locator("#smdConfirmModal")).toBeVisible();
      await page.locator("#smdConfirmModal").getByRole("button", { name: "Delete" }).click();
      await expect(page.locator("#datesEditor cmd-date-card")).toHaveCount(3);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_dates") || "[]").some(d => d.name === "Trip"))).toBe(false);
    });

    test("filters by category and title", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openDatesEditor());
      await page.locator("#dateCategoryFilter").selectOption("Birthday");
      expect(await page.locator("#datesEditor cmd-date-card").count()).toBe(2);
      await page.locator("#dateTitleSearch").fill("Trip");
      await expect(page.locator("#datesEditor cmd-date-card")).toHaveCount(1);
      await expect(page.locator("#datesEditor cmd-date-card").first()).toHaveAttribute("name", "Trip");
      await page.locator("#datesEditor").getByRole("button", { name: "Clear" }).click();
      await expect(page.locator("#datesEditor cmd-date-card")).toHaveCount(4);
    });
  });

  test.describe("Categories editor", () => {

    test("adds a category", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openCategoriesEditor());
      await page.locator("#categoriesEditor").getByRole("button", { name: "Add Category" }).click();
      await page.locator("#categoryNameInput").fill("Travel");
      await page.locator("#categoryEditPage").getByRole("button", { name: "OK" }).click();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_categories") || "[]").some(c => c.name === "Travel"))).toBe(true);
      await expect(page.locator("#categoriesEditor cmd-category-card")).toHaveCount(3);
    });

    test("blocks a duplicate name", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openCategoriesEditor());
      await page.locator("#categoriesEditor").getByRole("button", { name: "Add Category" }).click();
      await page.locator("#categoryNameInput").fill("Work");
      await expect(page.locator("#categoryEditPage #categoryNameError")).toBeVisible();
      await page.locator("#categoryEditPage").getByRole("button", { name: "OK" }).click();
      // Still on the edit page and the duplicate was not saved twice.
      await expect(page.locator("#categoryEditPage")).toHaveAttribute("open", "");
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_categories") || "[]").filter(c => c.name === "Work").length)).toBe(1);
    });

    test("renaming a category updates its dates", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openCategoriesEditor());
      await page.locator("#categoriesEditor cmd-category-card").filter({ hasText: "Birthday" }).getByRole("button", { name: "Edit" }).click();
      await page.locator("#categoryNameInput").fill("Celebrations");
      await page.locator("#categoryEditPage").getByRole("button", { name: "OK" }).click();
      const renamedDates = await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_dates") || "[]").filter(d => d.category === "Celebrations").length);
      expect(renamedDates).toBe(2);
    });

    test("deleting a category clears its date references", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openCategoriesEditor());
      await page.locator("#categoriesEditor cmd-category-card").filter({ hasText: "Work" }).getByRole("button", { name: "Delete" }).click();
      await expect(page.locator("#smdConfirmModal")).toBeVisible();
      await page.locator("#smdConfirmModal").getByRole("button", { name: "Delete" }).click();
      const cleared = await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_dates") || "[]").find(d => d.name === "Project Deadline").category);
      expect(cleared).toBeNull();
      await expect(page.locator("#categoriesEditor cmd-category-card")).toHaveCount(1);
    });
  });

  test.describe("Images editor", () => {

    test("lists images with smd-image-card and marks in-use images", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openImagesEditor());
      await expect(page.locator("#imagesEditor")).toHaveAttribute("open", "");
      await expect(page.locator("#imagesEditor smd-image-card")).toHaveCount(3);

      const imgA = page.locator("#imagesEditor smd-image-card").filter({ hasText: "imgA" });
      const imgC = page.locator("#imagesEditor smd-image-card").filter({ hasText: "imgC" });
      // imgA is used by a category and imgC by a date -> delete disabled.
      await expect(imgA.locator('[data-action="delete"]')).toBeDisabled();
      await expect(imgC.locator('[data-action="delete"]')).toBeDisabled();
    });

    test("renaming an image updates category and date references", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openImagesEditor());
      await page.locator("#imagesEditor smd-image-card").filter({ hasText: "imgB" }).getByRole("button", { name: "Edit" }).click();
      await expect(page.locator("#imageEditModal")).toBeVisible();
      const nameInput = page.locator("#imageEditModalBody input.form-control").first();
      await nameInput.fill("imgB2");
      await nameInput.press("Tab");
      await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_dates") || "[]").some(d => d.image === "imgB2"))).toBe(true);
      const catRef = await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_categories") || "[]").find(c => c.name === "Birthday").image);
      expect(catRef).toBe("imgA");
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_categories") || "[]").some(c => c.image === "imgB2"))).toBe(false);
      await page.locator("#imageEditModal").getByRole("button", { name: "Cancel" }).click();
    });

    test("deleting an image clears its references (hook)", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openImagesEditor());
      await page.evaluate(() => {
        const images = loadImages();
        const idx = images.findIndex(i => i.name === "imgB");
        deleteImage(idx);
      });
      const state = await page.evaluate(() => ({
        images: JSON.parse(localStorage.getItem("countmydays_images") || "[]").map(i => i.name),
        dateRef: JSON.parse(localStorage.getItem("countmydays_dates") || "[]").find(d => d.name === "Anniversary").image
      }));
      expect(state.images).not.toContain("imgB");
      expect(state.dateRef).toBeNull();
    });

    test("add new image opens the shared edit modal", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openImagesEditor());
      await page.locator("#imagesEditor").getByRole("button", { name: "Add Image" }).click();
      await expect(page.locator("#imageEditModal")).toBeVisible();
      await expect(page.locator("#imageEditModalTitle")).toHaveText("Add Image");
      await page.locator("#imageEditModal").getByRole("button", { name: "Cancel" }).click();
    });
  });

  test.describe("Image picker", () => {

    test("selecting an image stores it on the date", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openDatesEditor());
      await page.locator("#datesEditor cmd-date-card").filter({ hasText: "Trip" }).getByRole("button", { name: "Edit" }).click();
      await page.locator("#dateImageSelect").getByRole("button", { name: "Edit" }).click();
      await expect(page.locator("#imagePickerPage")).toHaveAttribute("open", "");
      await expect(page.locator("#imagePickerPage smd-image-picker .item").first()).toBeVisible();
      await page.locator("#imagePickerPage smd-image-picker .item").filter({ hasText: "imgC" }).click();
      await expect(page.locator("#imagePickerPage")).not.toHaveAttribute("open", "");
      await page.locator("#dateEditPage").getByRole("button", { name: "OK" }).click();
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_dates") || "[]").find(d => d.name === "Trip").image);
      expect(stored).toBe("imgC");
    });
  });

  test.describe("Export / Import", () => {

    test("export wizard walks the partial-selection steps", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => exportData());
      await expect(page.locator("#exportWizardPage")).toHaveAttribute("open", "");
      await expect(page.locator("#exportWizardPage")).toContainText("Choose what to export");
      await page.locator("#exportWizardPage #ewPartial").check();
      await page.locator("#exportWizardPage").getByRole("button", { name: "Next" }).click();
      await expect(page.locator("#exportWizardPage")).toContainText("Export Dates");
      await page.locator("#exportWizardPage #ewDatesAll").check();
      await page.locator("#exportWizardPage").getByRole("button", { name: "Next" }).click();
      await expect(page.locator("#exportWizardPage")).toContainText("Export Categories");
      await page.locator("#exportWizardPage").getByRole("button", { name: "Next" }).click();
      await expect(page.locator("#exportWizardPage")).toContainText("Export Images");
      await page.locator("#exportWizardPage").getByRole("button", { name: "Next" }).click();
      await expect(page.locator("#exportWizardPage")).toContainText("Export Summary");
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.locator("#exportWizardPage").getByRole("button", { name: "Export" }).click()
      ]);
      expect(download.suggestedFilename()).toBe("countmydays-export.json");
      await expect(page.locator("#exportWizardPage")).not.toHaveAttribute("open", "");
    });

    test("QR export renders chunked QR codes", async ({ page }) => {
      await seed(page, {
        dates: [{ name: "Tiny", category: "", image: "", type: "annual", month: 3, day: 3 }],
        categories: [],
        images: []
      });
      await page.evaluate(() => {
        startExportWizard("qr");
        ew.scope = "all";
        finishExportWizard();
      });
      await expect(page.locator("#qrExportPage")).toHaveAttribute("open", "");
      await expect(page.locator("#qrExportPage smd-qr-export .item").first()).toBeVisible({ timeout: 30000 });
      await expect(page.locator("#qrExportPage smd-qr-export .label").first()).toContainText("QR 1 of");
      await page.locator("#qrExportPage").getByRole("button", { name: "Close" }).click();
      await expect(page.locator("#qrExportPage")).not.toHaveAttribute("open", "");
    });

    test("import wizard imports a JSON payload", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => {
        startImportWizard({
          dates: [{ name: "Imported Day", type: "annual", month: 5, day: 5, category: "", image: "" }],
          categories: [],
          images: []
        });
      });
      await expect(page.locator("#importWizardPage")).toHaveAttribute("open", "");
      await page.locator("#importWizardPage").getByRole("button", { name: "Import" }).click();
      await page.locator("#importWizardPage").getByRole("button", { name: "Apply & Continue" }).click();
      await expect(page.locator("#importWizardPage")).toContainText("Import complete");
      await page.locator("#importWizardPage").getByRole("button", { name: "Close" }).click();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_dates") || "[]").some(d => d.name === "Imported Day"))).toBe(true);
    });

    test("import wizard resolves an image name conflict", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => {
        startImportWizard({
          dates: [],
          categories: [],
          images: [{ name: "imgA", data: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" stroke="#ff0000" fill="none"><rect width="4" height="4"/></svg>') }]
        });
      });
      await page.locator("#importWizardPage").getByRole("button", { name: "Import" }).click();
      await expect(page.locator("#importWizardPage")).toContainText("already exists");
      await page.locator("#importWizardPage #imgKeepBoth").check();
      const nameInput = page.locator("#importWizardPage #imgNewName");
      await nameInput.fill("imgA copy");
      await page.locator("#importWizardPage").getByRole("button", { name: "Next" }).click();
      await page.locator("#importWizardPage").getByRole("button", { name: "Apply & Continue" }).click();
      await page.locator("#importWizardPage").getByRole("button", { name: "Close" }).click();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_images") || "[]").some(i => i.name === "imgA copy"))).toBe(true);
    });

    test("QR import page opens and cancels", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => startQRImport());
      await expect(page.locator("#qrImportPage")).toHaveAttribute("open", "");
      await expect(page.locator("#qrImportPage smd-qr-import")).toBeVisible();
      await page.locator("#qrImportPage").getByRole("button", { name: "Cancel" }).click();
      await expect(page.locator("#qrImportPage")).not.toHaveAttribute("open", "");
    });
  });

  test.describe("No console errors across the editor sweep", () => {
    test("smd-page editors render without console/page errors", async ({ page }) => {
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
      page.on("pageerror", (err) => pageErrors.push(String(err)));

      await seed(page);
      await page.evaluate(() => openDatesEditor());
      await page.locator("#datesEditor").getByRole("button", { name: "Add Date" }).click();
      await page.locator("#dateEditPage").getByRole("button", { name: "Cancel" }).click();
      await page.locator("#datesEditor").getByRole("button", { name: "Done" }).click();

      await page.evaluate(() => openCategoriesEditor());
      await page.locator("#categoriesEditor").getByRole("button", { name: "Done" }).click();

      await page.evaluate(() => openImagesEditor());
      await page.evaluate(() => closeImagesEditor());

      await page.evaluate(() => openSettings());
      await page.locator("#settingsPage").getByRole("button", { name: "Done" }).click();

      await page.evaluate(() => exportData());
      await page.locator("#exportWizardPage").getByRole("button", { name: "Cancel" }).click();

      await page.evaluate(() => startQRImport());
      await page.evaluate(() => cancelQRImport());

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });

  test.describe("Sub-path deployment", () => {
    test("no console errors when deployed under a repo sub-path during SW precache", async ({ page }) => {
      test.setTimeout(120000);
      const consoleErrors = [];
      const pageErrors = [];
      const badResponses = [];
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
      page.on("pageerror", (err) => pageErrors.push(err.message));
      page.on("response", (resp) => { if (resp.status() >= 400) badResponses.push(resp.status() + " " + resp.url()); });

      // tests/subpath-server.py serves the repo ONLY under /PlanMyDay/, so this
      // is the repo at /PlanMyDay/ with the app at /PlanMyDay/CountMyDays/ and
      // shared at /PlanMyDay/shared/ — exactly the GitHub Pages layout.
      await page.goto("http://localhost:8081/PlanMyDay/CountMyDays/");

      const themeHref = await page.evaluate(() => document.getElementById("bootstrap-theme-css").getAttribute("href"));
      expect(themeHref).toMatch(/^\.\.\/shared\/css\/themes\//);

      await expect(page.locator("cmd-countdown-card").first()).toBeVisible();

      await expect.poll(async () => {
        return page.evaluate(async () => {
          const regs = await navigator.serviceWorker.getRegistrations();
          const r = regs.find((x) => x.scope && x.scope.includes("/PlanMyDay/"));
          return r && r.active ? r.active.state + "|" + !!navigator.serviceWorker.controller : "pending";
        });
      }, { timeout: 60000 }).toBe("activated|true");

      const cachedUrls = await page.evaluate(async () => {
        const v = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "";
        const cache = await caches.open("myapps-" + v);
        return (await cache.keys()).map((r) => r.url);
      });
      expect(cachedUrls).toEqual(expect.arrayContaining([
        expect.stringContaining("/PlanMyDay/CountMyDays/js/app.js"),
        expect.stringContaining("/PlanMyDay/CountMyDays/index.html"),
        expect.stringContaining("/PlanMyDay/shared/vendor/lz-string.min.js")
      ]));

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(badResponses).toEqual([]);
    });
  });
});
