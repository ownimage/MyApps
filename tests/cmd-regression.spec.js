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
    if (images) localStorage.setItem("shared-images", JSON.stringify(images));
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
        images: JSON.parse(localStorage.getItem("shared-images") || "[]").length
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
      // Every tile carries a Local/Google source badge under the date.
      await expect(page.locator("cmd-countdown-card").first().locator("smd-badge")).toHaveText("Local");
      await expect(page.locator("cmd-countdown-card").first()).toHaveAttribute("source", "local");
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
      // Use a "once" date exactly 10 days out (1 week + 3 days) so the days
      // line can never be blank: an annual date can fall on an exact whole-week
      // boundary (e.g. 2026-09-16 -> 14 Jul 2027 = 43 weeks + 0 days), which
      // legitimately renders no count2 line.
      const anni = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10);
      await seed(page, {
        dates: [{
          name: "Anniversary", category: "Birthday", image: "imgB",
          type: "once", month: anni.getMonth() + 1, day: anni.getDate(), year: anni.getFullYear()
        }],
        settings: { countdownFormat: "weeksAndDays" }
      });
      const card = page.locator("cmd-countdown-card").filter({ hasText: "Anniversary" });
      await expect(card).toHaveAttribute("count1", "1 week");
      await expect(card).toHaveAttribute("count2", "3 days");
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
      await page.locator("#settingsPage").getByRole("button", { name: "OK" }).click();
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
      expect(width).toBe("40px");
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("countmydays_iconSize"))).toBe("small");
    });

    test("danger actions are hidden until Show danger is enabled", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openSettings());
      await page.locator("#danger-tab").click();
      await expect(page.locator("#settingsPage #clearAllDataRow")).toBeHidden();
      await expect(page.locator("#gcalDangerRow")).toBeHidden();
      await page.locator("#showDanger").check();
      await expect(page.locator("#settingsPage #clearAllDataRow")).toBeVisible();
      // The Google data actions live on the Danger tab.
      await expect(page.locator("#gcalDangerRow")).toBeVisible();
      await expect(page.locator("#settingsPage").getByRole("button", { name: "Load sample data" })).toBeVisible();
      await expect(page.locator("#settingsPage").getByRole("button", { name: "Clear cache" })).toBeVisible();
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
      // The filter Clear button carries danger styling, not the neutral grey.
      const clearBg = await page.locator("#datesEditor").getByRole("button", { name: "Clear", exact: true }).evaluate(el => getComputedStyle(el).backgroundColor);
      const dangerColor = await page.evaluate(() => {
        const t = document.createElement("span");
        t.style.color = "var(--bs-danger, #e74c3c)";
        document.body.appendChild(t);
        const c = getComputedStyle(t).color;
        t.remove();
        return c;
      });
      expect(clearBg).toBe(dangerColor);
      await page.locator("#datesEditor").getByRole("button", { name: "Add Date" }).click();
      await expect(page.locator("#dateEditPage")).toHaveAttribute("open", "");
      await expect(page.locator("#dateEditPage").getByText("Title", { exact: true })).toBeVisible();
      await expect(page.locator("#dateEditPage").getByText("Name", { exact: true })).toHaveCount(0);
      // Cancel sits to the left of OK in the footer.
      expect(await page.locator("#dateEditPage .smd-page-footer smd-button").allInnerTexts()).toEqual(["Cancel", "OK"]);
      // The category picker is the shared dropdown; a new date defaults to the
      // first category and shows its image thumb.
      await expect(page.locator("#dateCategorySelect #smdImageBtnText")).toHaveText("Birthday");
      await page.locator("#dateCategorySelect #smdImageDropdownBtn").click();
      // "No Category" carries a blank thumb placeholder so all rows line up.
      const noCategoryRow = page.locator("#dateCategorySelect #smdImageDropdownMenu .dropdown-item").filter({ hasText: "No Category" });
      await expect(noCategoryRow.locator("smd-image")).toHaveCount(0);
      await expect(noCategoryRow.locator(".thumb.thumb-blank")).toHaveCount(1);
      const birthdayRow = page.locator("#dateCategorySelect #smdImageDropdownMenu .dropdown-item").filter({ hasText: "Birthday" });
      await expect(birthdayRow.locator("smd-image")).toHaveCount(1);
      await birthdayRow.click();
      await expect(page.locator("#dateCategorySelect #smdImageBtnText")).toHaveText("Birthday");
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
      expect(saved.category).toBe("Birthday");
      expect(await page.locator("#datesEditor cmd-date-card").count()).toBe(5);
    });

    test("once type uses a date input and saves the year", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openDatesEditor());
      await page.locator("#datesEditor cmd-date-card").first().getByRole("button", { name: "Edit" }).click();
      await page.locator("#dateTypeSelect").selectOption("once");
      await expect(page.locator("#smdDatePickerAlt")).toBeVisible();
      // The field is read-only: clicking anywhere on it opens the date picker.
      await expect(page.locator("#smdDatePickerAlt")).toHaveAttribute("readonly", "readonly");
      await page.locator("#smdDatePickerAlt").click();
      await expect(page.locator(".flatpickr-calendar.open")).toBeVisible();
      await page.locator(".flatpickr-calendar.open .flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)").filter({ hasText: "15" }).click();
      await page.locator("#dateEditPage").getByRole("button", { name: "OK" }).click();

      const saved = await page.evaluate(() => {
        const dates = JSON.parse(localStorage.getItem("countmydays_dates") || "[]");
        return dates.find(d => d.type === "once" && d.name === "Today Event");
      });
      expect(saved.day).toBe(15);
      expect(saved.month).toBe(now.getMonth() + 1);
      expect(saved.year).toBe(now.getFullYear());
    });

    test("selecting No Category clears the date category", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openDatesEditor());
      await page.locator("#datesEditor").getByRole("button", { name: "Add Date" }).click();
      await expect(page.locator("#dateCategorySelect #smdImageBtnText")).toHaveText("Birthday");
      await page.locator("#dateCategorySelect #smdImageDropdownBtn").click();
      await page.locator("#dateCategorySelect #smdImageDropdownMenu .dropdown-item").filter({ hasText: "No Category" }).click();
      await expect(page.locator("#dateCategorySelect #smdImageBtnText")).toHaveText("No Category");
      await page.locator("#dateEditPage").getByRole("button", { name: "OK" }).click();
      const saved = await page.evaluate(() => {
        const dates = JSON.parse(localStorage.getItem("countmydays_dates") || "[]");
        return dates[dates.length - 1];
      });
      expect(saved.category).toBe("");
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
      // Category dropdown: shared <smd-image-dropdown>, defaults to the
      // no-image "All" option on the search button.
      await expect(page.locator("#dateCategoryFilter #smdImageBtnText")).toHaveText("All");
      await page.locator("#dateCategoryFilter #smdImageDropdownBtn").click();
      await page.locator("#dateCategoryFilter #smdImageDropdownMenu .dropdown-item").filter({ hasText: "Birthday" }).click();
      await expect(page.locator("#dateCategoryFilter #smdImageBtnText")).toHaveText("Birthday");
      expect(await page.locator("#datesEditor cmd-date-card").count()).toBe(2);
      await page.locator("#dateTitleSearch").fill("Trip");
      await expect(page.locator("#datesEditor cmd-date-card")).toHaveCount(1);
      await expect(page.locator("#datesEditor cmd-date-card").first()).toHaveAttribute("name", "Trip");
      await page.locator("#datesEditor").getByRole("button", { name: "Clear" }).click();
      await expect(page.locator("#datesEditor cmd-date-card")).toHaveCount(4);
      await expect(page.locator("#dateCategoryFilter #smdImageBtnText")).toHaveText("All");
    });

    test("none category filter matches only dates with no category", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openDatesEditor());
      await page.locator("#dateCategoryFilter #smdImageDropdownBtn").click();
      await page.locator("#dateCategoryFilter #smdImageDropdownMenu .dropdown-item").filter({ hasText: "None" }).click();
      await expect(page.locator("#dateCategoryFilter #smdImageBtnText")).toHaveText("None");
      await expect(page.locator("#datesEditor cmd-date-card")).toHaveCount(1);
      await expect(page.locator("#datesEditor cmd-date-card").first()).toHaveAttribute("name", "Today Event");
    });

    test("date picker works on a local once date", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openDatesEditor());
      await page.locator("#datesEditor cmd-date-card").filter({ hasText: "Project Deadline" }).getByRole("button", { name: "Edit" }).click();
      await expect(page.locator("#smdDatePickerAlt")).toBeVisible();
      await expect(page.locator("#smdDatePickerAlt")).toHaveValue(`${SEED_DATES[2].day}/${SEED_DATES[2].month}/${SEED_DATES[2].year}`);
      await page.locator("#smdDatePickerAlt").click();
      await expect(page.locator(".flatpickr-calendar.open")).toBeVisible();
      await page.locator(".flatpickr-calendar.open .flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)").filter({ hasText: "15" }).click();
      await page.locator("#dateEditPage").getByRole("button", { name: "OK" }).click();

      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_dates") || "[]").find(d => d.name === "Project Deadline"));
      expect(saved.day).toBe(15);
      expect(saved.month).toBe(12);
      expect(saved.year).toBe(FUTURE_YEAR);
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

      // The thumbnails must read the SHARED image library (key-prefix shared-)
      // and actually render an image, not just the card title.
      const firstThumb = page.locator("#imagesEditor smd-image-card").first().locator("smd-image");
      await expect(firstThumb).toHaveAttribute("key-prefix", "shared-");
      await expect.poll(async () => firstThumb.locator("img").getAttribute("src")).toBeTruthy();
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
        images: JSON.parse(localStorage.getItem("shared-images") || "[]").map(i => i.name),
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
      // The dialog form is the shared <smd-image-editor> component.
      await expect(page.locator("#imageEditModalBody smd-image-editor")).toBeVisible();
      await expect(page.locator("#imageEditModalBody smd-image-editor .card input.form-control")).toBeVisible();
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
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("shared-images") || "[]").some(i => i.name === "imgA copy"))).toBe(true);
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
      await page.locator("#datesEditor").getByRole("button", { name: "OK" }).click();

      await page.evaluate(() => openCategoriesEditor());
      await page.locator("#categoriesEditor").getByRole("button", { name: "OK" }).click();

      await page.evaluate(() => openImagesEditor());
      await page.evaluate(() => closeImagesEditor());

      await page.evaluate(() => openSettings());
      await page.locator("#settingsPage").getByRole("button", { name: "OK" }).click();

      await page.evaluate(() => exportData());
      await page.locator("#exportWizardPage").getByRole("button", { name: "Cancel" }).click();

      await page.evaluate(() => startQRImport());
      await page.evaluate(() => cancelQRImport());

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });

  test.describe("Google Calendar", () => {

    test("G Cal settings tab enables Google and renders the share QR", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => openSettings());
      await page.locator("#settingsPage").getByRole("button", { name: "G Cal" }).click();
      await expect(page.locator("#gcalOptions")).toBeHidden();

      // qrcodejs renders a canvas + an <img> fallback; one of them is visible.
      await expect(page.locator("#shareQrCode img").first()).toBeVisible({ timeout: 30000 });
      expect(await page.locator("#shareQrCode canvas, #shareQrCode img").count()).toBeGreaterThan(0);

      await page.locator("#gcalEnabled").check();
      await expect(page.locator("#gcalOptions")).toBeVisible();
      await page.locator("#gcalName").fill("Test User");
      await page.locator("#gcalName").blur();
      await page.locator("#gcalClientId").fill("dummy.apps.googleusercontent.com");
      await page.locator("#gcalClientId").blur();

      // Refresh stays on the G Cal tab; Load sample data / Clear cache moved to
      // the Danger tab.
      await expect(page.locator("#settingsPage").getByRole("button", { name: "Refresh", exact: true })).toBeVisible();
      await expect(page.locator("#gcalDangerRow")).toBeHidden();

      await expect.poll(async () => page.evaluate(() => localStorage.getItem("countmydays_gcal_enabled"))).toBe("true");
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("countmydays_gcal_name"))).toBe("Test User");
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("countmydays_gcal_client_id"))).toBe("dummy.apps.googleusercontent.com");

      // The Google menu entries become visible ("Edit Google Events" was removed).
      await page.locator("#settingsPage").getByRole("button", { name: "OK" }).click();
      await page.locator("#btnMainMenu").click();
      await expect(page.locator(".google-menu-item").filter({ hasText: "Refresh Google Calendar" })).toBeVisible();
      await expect(page.locator(".google-menu-item").filter({ hasText: "Edit Google Events" })).toHaveCount(0);
    });

    test("loads sample Google data and unifies Google entries in the dates editor", async ({ page }) => {
      await seed(page, { settings: { gcal_enabled: "true", gcal_name: "Test User" } });
      await page.evaluate(() => loadGCalSampleData());
      await expect(page.locator("#smdConfirmModal")).toContainText("7 events cached");
      await page.locator("#smdConfirmModal").getByRole("button", { name: "OK" }).click();

      // Visible Google events appear on the main view alongside local dates.
      const dentistCard = page.locator("cmd-countdown-card").filter({ hasText: "Dentist Appointment" });
      await expect(dentistCard).toBeVisible();
      await expect(dentistCard).toHaveAttribute("source", "google");
      await expect(dentistCard.locator("smd-badge")).toHaveText("Google");

      await page.evaluate(() => openDatesEditor());
      // 4 local + 6 visible Google events (1 cached event is hidden).
      await expect(page.locator("#datesEditor cmd-date-card")).toHaveCount(10);
      await expect(page.locator("#datesEditor cmd-date-card").filter({ hasText: "Google" })).toHaveCount(6);
      await expect(page.locator("#datesEditor cmd-date-card").filter({ hasText: "Local" })).toHaveCount(4);
      await expect(page.locator("#datesEditor cmd-date-card").filter({ hasText: "Repeat" })).toHaveCount(2);

      // Source badges moved to the date line (after the once/annual type text),
      // with themed info/primary/secondary colours; the title keeps no badges.
      await expect(page.locator("#datesEditor cmd-date-card").first().locator(".title .event-badge")).toHaveCount(0);
      const dentistBadgeCard = page.locator("#datesEditor cmd-date-card").filter({ hasText: "Dentist Appointment" });
      await expect(dentistBadgeCard.locator(".meta .event-badge-google")).toHaveText("Google");
      await expect(page.locator("#datesEditor cmd-date-card").filter({ hasText: "Local" }).first().locator(".meta .event-badge-local")).toHaveText("Local");

      // Hide Google entries.
      await page.locator("#filterShowGoogle").uncheck();
      await expect(page.locator("#datesEditor cmd-date-card")).toHaveCount(4);
      await page.locator("#filterShowGoogle").check();

      // Show the hidden Google entry.
      await page.locator("#filterShowGoogleHidden").check();
      await expect(page.locator("#datesEditor cmd-date-card")).toHaveCount(11);
      await expect(page.locator("#datesEditor cmd-date-card").filter({ hasText: "Hidden" })).toHaveCount(1);

      // Googles rows have no Delete button.
      const googleCard = page.locator("#datesEditor cmd-date-card").filter({ hasText: "Dentist Appointment" });
      await expect(googleCard.getByRole("button", { name: "Delete" })).toHaveCount(0);
    });

    test("editing a Google event patches the description and the cached feed", async ({ page }) => {
      await seed(page, { settings: { gcal_enabled: "true", gcal_name: "Test User" } });
      await page.evaluate(() => loadGCalSampleData());
      await page.locator("#smdConfirmModal").getByRole("button", { name: "OK" }).click();

      await page.evaluate(() => {
        window.__patched = null;
        updateGoogleEventDescription = (id, description) => {
          window.__patched = { id, description };
          return Promise.resolve({ id, description });
        };
      });

      await page.evaluate(() => openDatesEditor());
      await page.locator("#datesEditor cmd-date-card").filter({ hasText: "Dentist Appointment" }).getByRole("button", { name: "Edit" }).click();
      await expect(page.locator("#googleEventEditPage")).toHaveAttribute("open", "");

      await page.locator("#gcalShowCheck").uncheck();
      await page.locator("#googleEventEditPage").getByRole("button", { name: "OK" }).click();

      await expect.poll(async () => page.evaluate(() => window.__patched && window.__patched.id)).toBe("sample_1");
      const description = await page.evaluate(() => window.__patched.description);
      expect(description).toContain("count_my_days");
      expect(description).toContain("Test User");
      expect(description).toContain("show: false");
      const cmd = await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_google_cal")).items.find(i => i.id === "sample_1")._cmd);
      expect(cmd.show).toBe(false);

      await expect(page.locator("#smdConfirmModal")).toContainText("updated");
      await page.locator("#smdConfirmModal").getByRole("button", { name: "OK" }).click();
      // Returning from a dates-launched Google edit reveals the dates editor.
      await expect(page.locator("#datesEditor")).toHaveAttribute("open", "");
    });

    test("refresh caches a stubbed feed and reports the count", async ({ page }) => {
      await seed(page, { settings: { gcal_enabled: "true", gcal_client_id: "dummy" } });
      await page.evaluate(() => {
        fetchEvents = () => Promise.resolve({
          items: [
            { id: "r1", summary: "Refreshed One", start: { date: "2026-11-01" } },
            { id: "r2", summary: "Refreshed Two", start: { date: "2026-12-01" } }
          ]
        });
      });
      await page.evaluate(() => refreshGoogleCalendar());
      await expect(page.locator("#smdConfirmModal")).toContainText("Refreshed: 2 events cached");
      await page.locator("#smdConfirmModal").getByRole("button", { name: "OK" }).click();
      const cached = await page.evaluate(() => JSON.parse(localStorage.getItem("countmydays_google_cal") || "null"));
      expect(cached.items.length).toBe(2);
    });

    test("refresh reports a failure via the shared modal", async ({ page }) => {
      await seed(page, { settings: { gcal_enabled: "true", gcal_client_id: "dummy" } });
      await page.evaluate(() => {
        requestGoogleAccessToken = () => Promise.reject(new Error("OAuth unavailable"));
      });
      await page.evaluate(() => refreshGoogleCalendar());
      await expect(page.locator("#smdConfirmModal")).toContainText("Failed to refresh");
      await expect(page.locator("#smdConfirmModal")).toContainText("OAuth unavailable");
      await page.locator("#smdConfirmModal").getByRole("button", { name: "OK" }).click();
    });

    test("Clear cache only clears the CountMyDays Google cache entry", async ({ page }) => {
      await seed(page, {
        settings: {
          gcal_enabled: "true",
          gcal_name: "Test User",
          gcal_client_id: "dummy",
          gcal_access_token: "test-token",
          google_cal: JSON.stringify({ items: [{ id: "cached1", summary: "Cached", start: { date: "2026-10-01" } }] })
        }
      });
      // Unrelated keys that must survive the cache clear: this app's other data,
      // another app's data, and legacy (pre-migration) keys.
      await page.evaluate(() => {
        localStorage.setItem("countmydays_dates", JSON.stringify([{ name: "Keep Me", type: "annual", month: 1, day: 1 }]));
        localStorage.setItem("planmydays_streams", "[]");
        localStorage.setItem("cmd_gcal_enabled", "true");
        localStorage.setItem("dates", "[]");
      });

      await page.evaluate(() => clearGoogleCalCache());
      await expect(page.locator("#smdConfirmModal")).toContainText("Cached feed cleared");
      await page.locator("#smdConfirmModal").getByRole("button", { name: "OK" }).click();

      const state = await page.evaluate(() => ({
        cache: localStorage.getItem("countmydays_google_cal"),
        gcalName: localStorage.getItem("countmydays_gcal_name"),
        token: localStorage.getItem("countmydays_gcal_access_token"),
        dates: JSON.parse(localStorage.getItem("countmydays_dates") || "[]"),
        pmdStreams: localStorage.getItem("planmydays_streams"),
        legacyGcalEnabled: localStorage.getItem("cmd_gcal_enabled"),
        legacyDates: localStorage.getItem("dates")
      }));
      expect(state.cache).toBeNull();
      expect(state.gcalName).toBe("Test User");
      expect(state.token).toBe("test-token");
      expect(state.dates.some(d => d.name === "Keep Me")).toBe(true);
      expect(state.pmdStreams).toBe("[]");
      expect(state.legacyGcalEnabled).toBe("true");
      expect(state.legacyDates).toBe("[]");
    });

    test("Google events editor lists every cached event", async ({ page }) => {
      await seed(page, { settings: { gcal_enabled: "true", gcal_name: "Test User" } });
      await page.evaluate(() => loadGCalSampleData());
      await page.locator("#smdConfirmModal").getByRole("button", { name: "OK" }).click();
      await page.evaluate(() => openGoogleEventsEditor());
      await expect(page.locator("#googleEventsPage")).toHaveAttribute("open", "");
      await expect(page.locator("#googleEventsPage cmd-date-card")).toHaveCount(7);
      await page.locator("#googleEventsPage").getByRole("button", { name: "OK" }).click();
      await expect(page.locator("#googleEventsPage")).not.toHaveAttribute("open", "");
    });

    test("legacy unprefixed keys are left untouched (no migration runs)", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => {
        localStorage.setItem("dates", JSON.stringify([{ name: "Legacy Day", type: "annual", month: 12, day: 25 }]));
        localStorage.setItem("cmd_gcal_enabled", "true");
      });
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      const state = await page.evaluate(() => ({
        dates: JSON.parse(localStorage.getItem("dates") || "null"),
        gcal: localStorage.getItem("cmd_gcal_enabled"),
        namespacedDates: localStorage.getItem("countmydays_dates")
      }));
      // The legacy data stays exactly as written — no migration runs.
      expect(state.dates).toEqual([{ name: "Legacy Day", type: "annual", month: 12, day: 25 }]);
      expect(state.gcal).toBe("true");
      // The app only reads its namespaced keys, so the legacy data is not used.
      expect(state.namespacedDates).not.toBeNull();
    });
  });

  test.describe("Sub-path deployment", () => {
    test("no console errors when deployed under a repo sub-path during SW precache", async ({ page }) => {
      test.setTimeout(300000);
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

      // Wait for the SW to register, install, and finish precaching. The first
      // worker on a fresh context activates automatically after install (no
      // existing controller to wait behind), so once the registration reports an
      // active worker, cache.addAll has completed. If any precache URL 404s, the
      // cache.addAll rejects, install fails, and the worker never activates. Under
      // the parallel shard load a single transient request failure can leave the
      // install failed with no worker at all — re-register to retry it.
      await expect.poll(async () => {
        return page.evaluate(async () => {
          let regs = await navigator.serviceWorker.getRegistrations();
          let r = regs.find((x) => x.scope && x.scope.includes("/PlanMyDay/"));
          if (!r) {
            try { await navigator.serviceWorker.register("/PlanMyDay/sw.js"); } catch (e) { /* retry next poll */ }
            return "pending";
          }
          if (r.active) return r.active.state + "|" + !!navigator.serviceWorker.controller;
          if (!r.installing && !r.waiting) {
            // Failed/never-started install: unregister and re-register to retry.
            try { await r.unregister(); await navigator.serviceWorker.register("/PlanMyDay/sw.js"); } catch (e) { /* retry next poll */ }
          }
          return "pending";
        });
      }, { timeout: 240000 }).toBe("activated|true");

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
