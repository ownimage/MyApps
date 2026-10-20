const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

// Coverage hooks (top-level so every test in this spec is captured).
test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// A small, realistic data set: two categories, three lists (one inactive), and a
// couple of list items with a note. ListOfLists has NO schedule UI any more, so
// every list is "daily" (shown on the main page).
const CATEGORIES = [
  {
    title: "Work", sequence: 1, description: "Work stuff", image: "",
    lists: [
      {
        id: "list_1", title: "Report", sequence: 1, description: "Weekly report",
        active: true,
        items: [
          { description: "Gather data", done: false, note: "" },
          { description: "Write it up", done: true, note: "Draft done" },
        ],
      },
      { id: "list_2", title: "Meeting", sequence: 2, description: "", active: true, items: [] },
    ],
  },
  {
    title: "Home", sequence: 2, description: "", image: "",
    lists: [{ id: "list_3", title: "Laundry", sequence: 1, description: "", active: false, items: [] }],
  },
];

const ICON_IMAGE = {
  name: "dots",
  data: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><circle cx='5' cy='5' r='4' fill='%23000'/></svg>",
};

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

async function seed(page, categories = CATEGORIES) {
  await page.evaluate((cats) => {
    localStorage.setItem("lol_categories", JSON.stringify(cats));
    localStorage.removeItem("lol_main_order");
    localStorage.removeItem("lol_completed");
    localStorage.removeItem("lol_last_gen");
  }, categories);
  await page.reload();
}

async function readCategories(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("lol_categories") || "[]"));
}

async function readMainOrder(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("lol_main_order") || "null"));
}

function mainCard(page, title) {
  // the host carries the list title as an ATTRIBUTE (unique), so no text matching
  return page.locator(`#mainCardList lol-list-main-card[title="${title}"]`);
}

async function openListEditorFromMain(page, title) {
  await mainCard(page, title).locator("smd-button.list-view-btn").click();
  await expect(page.locator("#listEditPage")).toBeVisible();
}

// View mode -> the full editor (the footer's Edit button).
async function switchViewToEdit(page) {
  await page.locator("#btnViewListEdit").click();
  await expect(page.locator("#listTitleInput")).toBeVisible();
}

test.describe("ListOfLists - Regression", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto("/ListOfLists/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("shared-images", "[]");
      // Instant page slides keep the assertions about open/closed deterministic.
      localStorage.setItem("lol_slideDuration", "0");
    });
    await page.reload();
  });

  // ── Boot ────────────────────────────────────────────────────────────────

  test.describe("Boot", () => {
    test("boots with no console errors and renders the main view", async ({ page }) => {
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(String(e)));
      await seed(page);
      await expect(page.locator("#mainContainer smd-h1").first()).toBeVisible();
      await expect(page.locator("#mainCardList lol-list-main-card")).toHaveCount(2);
      expect(errors).toEqual([]);
    });

    test("uses the lol_ storage namespace", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("lol_probe", "1");
        document.body.classList.toggle("font-size-large", true);
      });
      // The shared appearance settings write with smdKey() = the lol_ prefix.
      await page.evaluate(() => changeFontSize("large"));
      const keys = await page.evaluate(() => Object.keys(localStorage));
      expect(keys).toContain("lol_fontSize");
      expect(keys.some((k) => k.startsWith("planmydays_"))).toBe(false);
    });

    test("an empty app shows the empty-state message", async ({ page }) => {
      await expect(page.locator("#mainScrollBody")).toContainText("No active lists yet");
      await expect(page.locator("#mainCardList lol-list-main-card")).toHaveCount(0);
    });
  });

  // ── Main view ───────────────────────────────────────────────────────────

  test.describe("Main view", () => {
    test("shows a card per active list with its category, title and description", async ({ page }) => {
      await seed(page);
      const cards = page.locator("#mainCardList lol-list-main-card");
      await expect(cards).toHaveCount(2);
      await expect(cards.nth(0).locator(".list-title")).toHaveText("Report");
      await expect(cards.nth(0).locator(".category-title")).toHaveText("Work");
      await expect(cards.nth(0).locator(".description")).toHaveText("Weekly report");
      await expect(cards.nth(1).locator(".list-title")).toHaveText("Meeting");
      await expect(cards.nth(1).locator(".description")).toBeHidden();
    });

    test("an inactive list is not shown", async ({ page }) => {
      await seed(page);
      await expect(mainCard(page, "Laundry")).toHaveCount(0);
    });

    test("the date heading is today", async ({ page }) => {
      await seed(page);
      const heading = page.locator("#mainContainer smd-h1").first();
      await expect(heading).toHaveText(/\d{4}/);
      const text = await heading.textContent();
      expect(text).toContain(String(new Date().getFullYear()));
      expect(text.split(" ")[0]).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/);
    });

    test("the main view follows the Edit Categories order, not the daily main_order snapshot", async ({ page }) => {
      const cats = [
        {
          title: "Second", sequence: 2, description: "", lists: [
            { id: "list_b", title: "B1", sequence: 1, active: true, items: [] },
          ],
        },
        {
          title: "First", sequence: 1, description: "", lists: [
            { id: "list_a1", title: "A1", sequence: 1, active: true, items: [] },
            { id: "list_a2", title: "A2", sequence: 2, active: true, items: [] },
          ],
        },
      ];
      await page.evaluate(({ data, gen }) => {
        localStorage.setItem("lol_categories", JSON.stringify(data));
        // Deliberately conflicting daily snapshot: the front screen must ignore
        // it in favour of the category sequence + list array order.
        localStorage.setItem("lol_main_order", JSON.stringify(["list_b", "list_a2", "list_a1"]));
        localStorage.setItem("lol_completed", "[]");
        localStorage.setItem("lol_last_gen", gen);
      }, { data: cats, gen: todayStr() });
      await page.reload();

      const titles = await page.locator("#mainCardList lol-list-main-card .list-title").allTextContents();
      expect(titles).toEqual(["A1", "A2", "B1"]);
    });

    test("both thumbnails keep their slot with no images", async ({ page }) => {
      await seed(page);
      const card = mainCard(page, "Report");
      await expect(card.locator(".category-thumb")).toHaveCount(1);
      await expect(card.locator(".list-thumb")).toHaveCount(1);
    });

    test("a swipe left asks for confirmation and can be cancelled", async ({ page }) => {
      await seed(page);
      const card = mainCard(page, "Report");
      const box = await card.boundingBox();
      await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();
      const modal = page.locator("#smdConfirmModal");
      await expect(modal).toBeVisible();
      await expect(modal).toContainText("Delete List?");
      await modal.getByRole("button", { name: "Cancel" }).click();
      await expect(mainCard(page, "Report")).toHaveCount(1);
      expect((await readCategories(page))[0].lists[0].title).toBe("Report");
    });

    test("a swipe left deletes the list from its category and the main order", async ({ page }) => {
      await seed(page);
      const card = mainCard(page, "Report");
      const box = await card.boundingBox();
      await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();
      const modal = page.locator("#smdConfirmModal");
      await expect(modal).toBeVisible();
      await modal.getByRole("button", { name: "Delete" }).click();
      await expect(mainCard(page, "Report")).toHaveCount(0);
      const cats = await readCategories(page);
      expect(cats[0].lists.map((l) => l.title)).toEqual(["Meeting"]);
      expect(await readMainOrder(page)).not.toContain("list_1");
    });
  });

  // ── View List (read-only) ───────────────────────────────────────────────

  test.describe("View List", () => {
    test("opens read-only: title as the heading, no handles, no delete, locked description", async ({ page }) => {
      await seed(page);
      await openListEditorFromMain(page, "Report");
      await expect(page.locator("#listEditPage .smd-page-header")).toContainText("Report");
      const items = page.locator("#listItemsList .item-row");
      await expect(items).toHaveCount(2);
      await expect(page.locator("#listItemsList .drag-handle")).toHaveCount(0);
      await expect(page.locator("#listItemsList .btn-danger")).toHaveCount(0);
      await expect(page.locator("#listItemsList .item-desc-input").first()).toHaveAttribute("readonly", "");
      // The done checkbox and the note button stay live so lists can be ticked.
      await expect(page.locator("#listItemsList .item-done-cb").first()).toBeEnabled();
      await expect(page.locator("#listItemsList .item-note-btn").first()).toBeEnabled();
      // The full editor's controls are not rendered at all.
      await expect(page.locator("#listTitleInput")).toHaveCount(0);
      await expect(page.locator("#listCategoryDropdown")).toHaveCount(0);
    });

    test("ticking an item in view mode persists on OK", async ({ page }) => {
      await seed(page);
      await openListEditorFromMain(page, "Report");
      await page.locator("#listItemsList .item-row").first().locator(".item-done-cb").check();
      await page.locator("#listEditOkBtn").click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      const cats = await readCategories(page);
      expect(cats[0].lists[0].items[0].done).toBe(true);
    });

    test("editing a note in view mode persists on OK", async ({ page }) => {
      await seed(page);
      await openListEditorFromMain(page, "Report");
      await page.locator("#listItemsList .item-row").first().locator(".item-note-btn").click();
      await page.locator("#listItemsList #itemNoteRow0 textarea").fill("Called the client");
      await page.locator("#listEditOkBtn").click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      const cats = await readCategories(page);
      expect(cats[0].lists[0].items[0].note).toBe("Called the client");
    });

    test("Edit switches the same page into the full editor", async ({ page }) => {
      await seed(page);
      await openListEditorFromMain(page, "Report");
      await expect(page.locator("#btnViewListEdit")).toBeVisible();
      await switchViewToEdit(page);
      await expect(page.locator("#listTitleInput")).toHaveValue("Report");
      await expect(page.locator("#listItemsList .item-row")).toHaveCount(2);
    });
  });

  // ── Edit List ───────────────────────────────────────────────────────────

  test.describe("Edit List", () => {
    async function openEdit(page, title = "Report") {
      await seed(page);
      await openListEditorFromMain(page, title);
      await switchViewToEdit(page);
    }

    test("has the single-form controls and no tabs", async ({ page }) => {
      await openEdit(page);
      await expect(page.locator("#listTitleInput")).toBeVisible();
      await expect(page.locator("#listActiveCb")).toBeVisible();
      await expect(page.locator("#listCategoryDropdown")).toBeVisible();
      await expect(page.locator("#listImageSelect")).toBeVisible();
      await expect(page.locator("#listShowDescription")).toBeVisible();
      await expect(page.locator("#listDescriptionWrap")).toBeVisible();       // has a description
      await expect(page.locator("#listEditPage smd-tabs")).toHaveCount(0);    // the tabs are gone
    });

    test("the description box is hidden until the Description checkbox is ticked", async ({ page }) => {
      await openEdit(page, "Meeting");            // no description
      await expect(page.locator("#listDescriptionWrap")).toBeHidden();
      await page.locator("#listShowDescription").check();
      await expect(page.locator("#listDescriptionWrap")).toBeVisible();
    });

    test("OK is disabled while the title is empty", async ({ page }) => {
      await openEdit(page);
      // smd-button mirrors to the inner native button, so assert there.
      const ok = page.locator("#listEditOkBtn button");
      await expect(ok).toBeEnabled();
      await page.locator("#listTitleInput").fill("");
      await expect(ok).toBeDisabled();
      await page.locator("#listTitleInput").fill("Renamed");
      await expect(ok).toBeEnabled();
    });

    test("renaming the list persists", async ({ page }) => {
      await openEdit(page);
      await page.locator("#listTitleInput").fill("Renamed Report");
      await page.locator("#listEditOkBtn").click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      const cats = await readCategories(page);
      expect(cats[0].lists[0].title).toBe("Renamed Report");
      await expect(mainCard(page, "Renamed Report")).toHaveCount(1);
    });

    test("cancel discards the edits", async ({ page }) => {
      await openEdit(page);
      await page.locator("#listTitleInput").fill("Discarded");
      await page.locator("#listEditCancelBtn").click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      const cats = await readCategories(page);
      expect(cats[0].lists[0].title).toBe("Report");
    });

    test("moving the list to another category persists", async ({ page }) => {
      await openEdit(page);
      await page.locator("#listCategoryDropdown #smdImageDropdownBtn").click();
      await page.locator("#listCategoryDropdown .item").filter({ hasText: "Home" }).first().click();
      await page.locator("#listEditOkBtn").click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      const cats = await readCategories(page);
      expect(cats[0].lists.map((l) => l.id)).toEqual(["list_2"]);
      expect(cats[1].lists.map((l) => l.id)).toEqual(["list_3", "list_1"]);
    });

    test("Delete removes the list and returns to the main view", async ({ page }) => {
      await openEdit(page);
      await page.locator("#listEditDelBtn").click();
      const modal = page.locator("#smdConfirmModal");
      await expect(modal).toBeVisible();
      await modal.getByRole("button", { name: "Delete" }).click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      await expect(mainCard(page, "Report")).toHaveCount(0);
      const cats = await readCategories(page);
      expect(cats[0].lists.map((l) => l.id)).toEqual(["list_2"]);
    });

    test("shows the Show (active) checkbox state", async ({ page }) => {
      await openEdit(page);
      await expect(page.locator("#listActiveCb")).toBeChecked();
      await page.locator("#listActiveCb").uncheck();
      await page.locator("#listEditOkBtn").click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      const cats = await readCategories(page);
      expect(cats[0].lists[0].active).toBe(false);
      await expect(mainCard(page, "Report")).toHaveCount(0);
    });
  });

  // ── List items ──────────────────────────────────────────────────────────

  test.describe("List items", () => {
    async function openItems(page, title = "Report") {
      await seed(page);
      await openListEditorFromMain(page, title);
      await switchViewToEdit(page);
      await expect(page.locator("#listItemsList .item-row")).toHaveCount(2);
    }

    test("the top Add button only appears once items exist", async ({ page }) => {
      await seed(page);
      await openListEditorFromMain(page, "Meeting");
      await switchViewToEdit(page);
      await expect(page.locator("#listItemsList .item-row")).toHaveCount(0);
      await expect(page.locator("#listAddItemBtn")).toBeHidden();
      await page.locator("#listAddItemBottomBtn").click();
      await expect(page.locator("#listItemsList .item-row")).toHaveCount(1);
      await expect(page.locator("#listAddItemBtn")).toBeVisible();
    });

    test("the bottom Add appends and the top Add prepends", async ({ page }) => {
      await openItems(page);
      await page.locator("#listAddItemBottomBtn").click();
      await page.locator("#listItemsList .item-desc-input").last().fill("Third");
      await page.locator("#listAddItemBtn").click();
      await page.locator("#listItemsList .item-desc-input").first().fill("Zeroth");
      const values = await page.locator("#listItemsList .item-desc-input").evaluateAll((els) => els.map((e) => e.value));
      expect(values).toEqual(["Zeroth", "Gather data", "Write it up", "Third"]);
    });

    test("description edits persist on OK", async ({ page }) => {
      await openItems(page);
      await page.locator("#listItemsList .item-desc-input").first().fill("Gather ALL data");
      await page.locator("#listEditOkBtn").click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      const cats = await readCategories(page);
      expect(cats[0].lists[0].items[0].description).toBe("Gather ALL data");
    });

    test("the done checkbox persists", async ({ page }) => {
      await openItems(page);
      await page.locator("#listItemsList .item-row").first().locator(".item-done-cb").check();
      await page.locator("#listEditOkBtn").click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      const cats = await readCategories(page);
      expect(cats[0].lists[0].items[0].done).toBe(true);
    });

    test("the note button toggles the note row and the note persists", async ({ page }) => {
      await openItems(page);
      const noteRow = page.locator("#listItemsList #itemNoteRow0");
      await expect(noteRow).toBeHidden();
      await page.locator("#listItemsList .item-row").first().locator(".item-note-btn").click();
      await expect(noteRow).toBeVisible();
      // An existing note opens by itself and paints the button as outlined.
      await expect(page.locator("#listItemsList #itemNoteRow1")).toBeVisible();
      await expect(page.locator("#listItemsList .item-row").nth(1).locator(".item-note-btn"))
        .toHaveClass(/btn-outline-info/);
      await noteRow.locator("textarea").fill("A new note");
      await page.locator("#listEditOkBtn").click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      const cats = await readCategories(page);
      expect(cats[0].lists[0].items[0].note).toBe("A new note");
    });

    test("deleting an item asks first and then removes it", async ({ page }) => {
      await openItems(page);
      await page.locator("#listItemsList .item-row").first().locator("button.btn-danger").click();
      const modal = page.locator("#smdConfirmModal");
      await expect(modal).toContainText("Delete List Item?");
      await modal.getByRole("button", { name: "Cancel" }).click();
      await expect(page.locator("#listItemsList .item-row")).toHaveCount(2);
      await page.locator("#listItemsList .item-row").first().locator("button.btn-danger").click();
      await page.locator("#smdConfirmModal").getByRole("button", { name: "Delete" }).click();
      await expect(page.locator("#listItemsList .item-row")).toHaveCount(1);
      await page.locator("#listEditOkBtn").click();
      const cats = await readCategories(page);
      expect(cats[0].lists[0].items.map((i) => i.description)).toEqual(["Write it up"]);
    });

    test("items can be reordered by dragging the handle", async ({ page }) => {
      await openItems(page);
      const handle = page.locator("#listItemsList .item-row").first().locator(".drag-handle");
      const handleBox = await handle.boundingBox();
      const lastBox = await page.locator("#listItemsList .item-row").last().boundingBox();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height * 0.9, { steps: 15 });
      await page.mouse.up();
      await expect.poll(async () => page.locator("#listItemsList .item-desc-input").evaluateAll((els) => els.map((e) => e.value)))
        .toEqual(["Write it up", "Gather data"]);
      await page.locator("#listEditOkBtn").click();
      const cats = await readCategories(page);
      expect(cats[0].lists[0].items.map((i) => i.description)).toEqual(["Write it up", "Gather data"]);
    });

    test("the note row stays closed through a re-render", async ({ page }) => {
      await openItems(page);
      await expect(page.locator("#listItemsList #itemNoteRow0")).toBeHidden();
      await page.locator("#listItemsList .item-row").first().locator(".item-note-btn").click();
      await expect(page.locator("#listItemsList #itemNoteRow0")).toBeVisible();
      await page.locator("#listItemsList .item-row").first().locator(".item-note-btn").click();
      await expect(page.locator("#listItemsList #itemNoteRow0")).toBeHidden();
      // re-render through the data setter (what a save/reopen does)
      await page.evaluate(() => { renderListItems(); });
      await expect(page.locator("#listItemsList #itemNoteRow0")).toBeHidden();
    });
  });

  // ── Categories editor ───────────────────────────────────────────────────

  test.describe("Categories editor", () => {
    async function openEditor(page) {
      await seed(page);
      await page.evaluate(() => openCategoriesEditor());
      await expect(page.locator("#categoriesEditor")).toBeVisible();
      await expect(page.locator("#categoryEditorList lol-category-header")).toHaveCount(2);
    }

    test("lists a header per category in sequence order", async ({ page }) => {
      await openEditor(page);
      await expect(page.locator("#categoryEditorList .editor-title")).toHaveText(["Work", "Home"]);
      await expect(page.locator("#categoriesEditor .smd-page-header")).toContainText("Edit Categories");
    });

    test("expanding one category shows its lists and closes the other", async ({ page }) => {
      await openEditor(page);
      const headers = page.locator("#categoryEditorList lol-category-header");
      await headers.nth(0).locator(".category-header-main").click();
      await expect(page.locator("#categoryCollapse_0")).toHaveClass(/show/);
      await expect(page.locator("#categoryCollapse_1")).not.toHaveClass(/show/);
      await headers.nth(1).locator(".category-header-main").click();
      await expect(page.locator("#categoryCollapse_1")).toHaveClass(/show/);
      await expect(page.locator("#categoryCollapse_0")).not.toHaveClass(/show/);
    });

    test("the Delete button is only offered for an empty category", async ({ page }) => {
      await seed(page, [
        { title: "Empty", sequence: 2, description: "", image: "", lists: [] },
        ...CATEGORIES.map((c) => ({ ...c, sequence: c.sequence + 1 })),
      ]);
      await page.evaluate(() => openCategoriesEditor());
      const first = page.locator("#categoryEditorList lol-category-header").first();
      await expect(first.locator('[data-action="delete"]')).toBeVisible();
      await expect(page.locator("#categoryEditorList lol-category-header").nth(1)
        .locator('[data-action="delete"]')).toBeHidden();
    });

    test("Add Category saves a new category", async ({ page }) => {
      await openEditor(page);
      await page.locator("#btnAddCategory").click();
      await expect(page.locator("#categoryEditPage")).toBeVisible();
      await expect(page.locator("#btnCategoryEditOk button")).toBeDisabled();
      await page.locator("#categoryTitleInput").fill("Errands");
      await expect(page.locator("#btnCategoryEditOk button")).toBeEnabled();
      await page.locator("#btnCategoryEditOk").click();
      await expect(page.locator("#categoryEditPage")).toBeHidden();
      const cats = await readCategories(page);
      expect(cats.map((c) => c.title)).toEqual(["Work", "Home", "Errands"]);
      await expect(page.locator("#categoryEditorList .editor-title")).toHaveText(["Work", "Home", "Errands"]);
    });

    test("Edit Category renames it and Cancel discards", async ({ page }) => {
      await openEditor(page);
      await page.locator("#categoryEditorList lol-category-header").first().locator('[data-action="edit"]').click();
      await expect(page.locator("#categoryTitleInput")).toHaveValue("Work");
      await page.locator("#categoryTitleInput").fill("Discarded");
      await page.locator("#btnCategoryEditCancel").click();
      expect((await readCategories(page)).map((c) => c.title)).toEqual(["Work", "Home"]);

      await page.locator("#categoryEditorList lol-category-header").first().locator('[data-action="edit"]').click();
      await page.locator("#categoryTitleInput").fill("Job");
      await page.locator("#btnCategoryEditOk").click();
      expect((await readCategories(page)).map((c) => c.title)).toEqual(["Job", "Home"]);
    });

    test("Delete Category asks first and then removes it", async ({ page }) => {
      await seed(page, [
        { title: "Work", sequence: 1, description: "", image: "", lists: [] },
        { title: "Home", sequence: 2, description: "", image: "", lists: CATEGORIES[1].lists },
      ]);
      await page.evaluate(() => openCategoriesEditor());
      await page.locator("#categoryEditorList lol-category-header").first().locator('[data-action="delete"]').click();
      const modal = page.locator("#smdConfirmModal");
      await expect(modal).toContainText("Delete Category?");
      await modal.getByRole("button", { name: "Cancel" }).click();
      expect((await readCategories(page)).length).toBe(2);
      await page.locator("#categoryEditorList lol-category-header").first().locator('[data-action="delete"]').click();
      await page.locator("#smdConfirmModal").getByRole("button", { name: "Delete" }).click();
      expect((await readCategories(page)).map((c) => c.title)).toEqual(["Home"]);
    });

    test("Add List inside a category appends a list to it", async ({ page }) => {
      await openEditor(page);
      await page.locator("#categoryEditorList lol-category-header").nth(1).locator('[data-action="add-list"]').click();
      await expect(page.locator("#listTitleInput")).toBeVisible();
      await expect(page.locator("#listEditPage .smd-page-header")).toContainText("Add List");
      await page.locator("#listTitleInput").fill("Windows");
      await page.locator("#listEditOkBtn").click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      const cats = await readCategories(page);
      expect(cats[1].lists.map((l) => l.title)).toEqual(["Laundry", "Windows"]);
      await expect(page.locator("#categoryEditorList lol-list-summary-card .list-title")).toContainText(["Report"]);
    });

    test("the Active toggle updates the list and the main order", async ({ page }) => {
      await openEditor(page);
      // the list cards live inside the (collapsed) accordion body: expand first
      await page.locator("#categoryEditorList lol-category-header").first().locator(".category-header-main").click();
      const card = page.locator("#categoryEditorList lol-list-summary-card").first();
      await expect(card.locator("smd-checkbox.active-toggle")).toBeChecked();
      await card.locator("smd-checkbox.active-toggle").uncheck();
      await expect.poll(async () => (await readCategories(page))[0].lists[0].active).toBe(false);
      expect(await readMainOrder(page)).not.toContain("list_1");
      await card.locator("smd-checkbox.active-toggle").check();
      await expect.poll(async () => (await readCategories(page))[0].lists[0].active).toBe(true);
      expect(await readMainOrder(page)).toContain("list_1");
    });

    test("Edit on a list card opens that list", async ({ page }) => {
      await openEditor(page);
      await page.locator("#categoryEditorList lol-category-header").first().locator(".category-header-main").click();
      await page.locator("#categoryEditorList lol-list-summary-card").first().locator("smd-button.list-edit-btn").click();
      await expect(page.locator("#listEditPage")).toBeVisible();
      await expect(page.locator("#listEditPage .smd-page-header")).toContainText("Edit List");
      await expect(page.locator("#listTitleInput")).toHaveValue("Report");
    });

    test("categories can be reordered by dragging the handle", async ({ page }) => {
      await openEditor(page);
      const handle = page.locator("#categoryEditorList lol-category-header").first().locator(".drag-handle");
      const handleBox = await handle.boundingBox();
      const lastBox = await page.locator("#categoryEditorList .category-accordion-item").last().boundingBox();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height * 0.9, { steps: 15 });
      await page.mouse.up();
      await expect.poll(async () => (await readCategories(page)).map((c) => c.title)).toEqual(["Home", "Work"]);
      await expect(page.locator("#categoryEditorList .editor-title")).toHaveText(["Home", "Work"]);
    });

    test("reordering lists within a category reorders the main view", async ({ page }) => {
      await openEditor(page);
      await page.locator("#categoryEditorList lol-category-header").first().locator(".category-header-main").click();
      await expect(page.locator("#categoryCollapse_0")).toHaveClass(/show/);

      const cards = page.locator("#categoryCollapse_0 .list-drag-card");
      const handle = cards.first().locator(".drag-handle");
      const handleBox = await handle.boundingBox();
      const lastBox = await cards.last().boundingBox();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height * 0.9, { steps: 15 });
      await page.mouse.up();

      await expect.poll(async () => (await readCategories(page))[0].lists.map((l) => l.title))
        .toEqual(["Meeting", "Report"]);
      await page.locator("#btnCategoriesDone").click();
      const titles = await page.locator("#mainCardList lol-list-main-card .list-title").allTextContents();
      expect(titles).toEqual(["Meeting", "Report"]);
    });

    test("OK closes the editor and returns to the main view", async ({ page }) => {
      await openEditor(page);
      await page.locator("#btnCategoriesDone").click();
      await expect(page.locator("#categoriesEditor")).toBeHidden();
      await expect(page.locator("#mainContainer")).toBeVisible();
      await expect(page.locator("#mainCardList lol-list-main-card")).toHaveCount(2);
    });
  });

  // ── Search Lists ────────────────────────────────────────────────────────

  test.describe("Search Lists", () => {
    async function openSearch(page) {
      await seed(page);
      await page.evaluate(() => openSearchLists());
      await expect(page.locator("#listSearchEditor")).toBeVisible();
    }

    test("lists every list from every category", async ({ page }) => {
      await openSearch(page);
      await expect(page.locator("#listSearchList lol-list-summary-card")).toHaveCount(3);
      await expect(page.locator("#listSearchList .list-title")).toHaveText(["Report", "Meeting", "Laundry"]);
      await expect(page.locator("#listSearchEditor .smd-page-header")).toContainText("Search Lists");
    });

    test("filters by title and the Clear button restores the full list", async ({ page }) => {
      await openSearch(page);
      await page.locator("#listSearchInput").fill("meet");
      await expect(page.locator("#listSearchList lol-list-summary-card")).toHaveCount(1);
      await expect(page.locator("#listSearchList .list-title")).toHaveText(["Meeting"]);
      await page.locator("#btnListSearchClear").click();
      await expect(page.locator("#listSearchList lol-list-summary-card")).toHaveCount(3);
    });

    test("shows a message when nothing matches", async ({ page }) => {
      await openSearch(page);
      await page.locator("#listSearchInput").fill("zzz");
      await expect(page.locator("#listSearchList")).toContainText('No lists match "zzz"');
    });

    test("Edit opens the list editor from the search result", async ({ page }) => {
      await openSearch(page);
      await page.locator("#listSearchList lol-list-summary-card").first().locator("smd-button.list-edit-btn").click();
      await expect(page.locator("#listEditPage .smd-page-header")).toContainText("Edit List");
      await expect(page.locator("#listTitleInput")).toHaveValue("Report");
    });

    test("the Active toggle updates the search result and the main order", async ({ page }) => {
      await openSearch(page);
      const card = page.locator("#listSearchList lol-list-summary-card").first();
      await card.locator("smd-checkbox.active-toggle").uncheck();
      await expect.poll(async () => (await readCategories(page))[0].lists[0].active).toBe(false);
      expect(await readMainOrder(page)).not.toContain("list_1");
    });

    test("Add List creates an Ad Hoc category and saves the new list", async ({ page }) => {
      await openSearch(page);
      await page.locator("#btnListSearchAdd").click();
      await expect(page.locator("#listEditPage")).toBeVisible();
      await expect(page.locator("#listEditPage .smd-page-header")).toContainText("Add List");
      await page.locator("#listTitleInput").fill("Buy milk");
      await page.locator("#listEditOkBtn").click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      const cats = await readCategories(page);
      const adhoc = cats.find((c) => c.title === "Ad Hoc");
      expect(adhoc).toBeTruthy();
      expect(adhoc.lists.map((l) => l.title)).toEqual(["Buy milk"]);
      await expect(page.locator("#listSearchList .list-title")).toContainText(["Buy milk"]);
    });

    test("cancelling a new Ad Hoc list removes it again", async ({ page }) => {
      await openSearch(page);
      await page.locator("#btnListSearchAdd").click();
      await expect(page.locator("#listTitleInput")).toBeVisible();
      await page.locator("#listEditCancelBtn").click();
      await expect(page.locator("#listEditPage")).toBeHidden();
      const cats = await readCategories(page);
      const adhoc = cats.find((c) => c.title === "Ad Hoc");
      // the Ad Hoc category stays (it was created), but holds no list
      expect(adhoc ? adhoc.lists : []).toEqual([]);
    });

    test("OK closes the search page and returns to the main view", async ({ page }) => {
      await openSearch(page);
      await page.locator("#btnListSearchDone").click();
      await expect(page.locator("#listSearchEditor")).toBeHidden();
      await expect(page.locator("#mainContainer")).toBeVisible();
    });
  });

  // ── Images editor ───────────────────────────────────────────────────────

  test.describe("Images editor", () => {
    test("opens and renders the shared library tiles", async ({ page }) => {
      await page.evaluate((image) => {
        localStorage.setItem("shared-images", JSON.stringify([image]));
        localStorage.setItem("lol_slideDuration", "0");
      }, ICON_IMAGE);
      await page.reload();
      await page.evaluate(() => openImagesEditor());
      await expect(page.locator("#imagesEditor")).toBeVisible();
      await expect(page.locator("#imagesEditor smd-image-card")).toHaveCount(1);
      await expect(page.locator("#imagesEditor smd-image-card .editor-title")).toContainText("dots");
      // the tiles read the SHARED library
      await expect(page.locator("#imagesEditor smd-image-card smd-image").first())
        .toHaveAttribute("key-prefix", "shared-");
    });
  });

  // ── Settings ────────────────────────────────────────────────────────────

  test.describe("Settings", () => {
    async function openSettingsPage(page) {
      await seed(page);
      await page.evaluate(() => openSettings());
      await expect(page.locator("#settingsPage")).toBeVisible();
    }

    test("has the General, Display, Minio and Danger tabs", async ({ page }) => {
      await openSettingsPage(page);
      const tabs = page.locator("#settingsPage .smd-tab-btn");
      await expect(tabs).toHaveText(["Display", "Minio", "Danger"]);
      await expect(page.locator("#autoHideMenu")).toBeVisible();
    });

    test("the Display tab carries every appearance control", async ({ page }) => {
      await openSettingsPage(page);
      await page.locator("#settingsPage .smd-tab-btn").filter({ hasText: "Display" }).click();
      for (const id of ["#themeSelector", "#fontSizeSelector", "#iconSizeSelector", "#densitySelector",
        "#touchSizeSelector", "#slideDurationSelector"]) {
        await expect(page.locator(id), id).toBeVisible();
      }
    });

    test("the font size setting persists under the lol_ prefix", async ({ page }) => {
      await openSettingsPage(page);
      await page.locator("#settingsPage .smd-tab-btn").filter({ hasText: "Display" }).click();
      await page.locator("#fontSizeSelector").click();
      await page.locator("#fontSizeSelector .smd-select-item[data-value='large']").click();
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("lol_fontSize"))).toBe("large");
      await expect(page.locator("body")).toHaveClass(/font-size-large/);
    });

    test("the theme control writes the lol_theme key", async ({ page }) => {
      await openSettingsPage(page);
      await page.locator("#settingsPage .smd-tab-btn").filter({ hasText: "Display" }).click();
      await page.locator("#themeSelector .smd-theme-select").click();
      await page.locator("#themeSelector .smd-select-item[data-value='flatly']").click();
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("lol_theme"))).toBe("flatly");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "flatly");
    });

    test("Auto-hide menu toggles the body class", async ({ page }) => {
      await openSettingsPage(page);
      await page.locator("#autoHideMenu").check();
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("lol_autoHideMenu"))).toBe("true");
      await expect(page.locator("body")).toHaveClass(/auto-hide-menu/);
      await page.locator("#autoHideMenu").uncheck();
      await expect(page.locator("body")).not.toHaveClass(/auto-hide-menu/);
    });

    test("Show danger reveals the danger rows only when ticked", async ({ page }) => {
      await openSettingsPage(page);
      await page.locator("#settingsPage .smd-tab-btn").filter({ hasText: "Danger" }).click();
      await expect(page.locator("#regenerateTilesRow")).toBeHidden();
      await page.locator("#showDanger").check();
      for (const id of ["#regenerateTilesRow", "#sortListsInCategoriesRow", "#clearAllDataRow",
        "#refreshAppRow", "#uploadStandardImagesRow", "#noCacheRow"]) {
        await expect(page.locator(id), id).toBeVisible();
      }
      // the dev rows stay hidden outside dev mode
      await expect(page.locator("#devTodayRow")).toBeHidden();
    });

    test("Clear local storage asks first and then clears this app's data", async ({ page }) => {
      await openSettingsPage(page);
      await page.locator("#settingsPage .smd-tab-btn").filter({ hasText: "Danger" }).click();
      await page.locator("#showDanger").check();
      await page.locator("#btnClearAllData").click();
      const modal = page.locator("#smdConfirmModal");
      await expect(modal).toContainText("Clear ALL List of Lists data?");
      await modal.getByRole("button", { name: "Cancel" }).click();
      expect(await page.evaluate(() => localStorage.getItem("lol_categories"))).not.toBeNull();
      await page.locator("#btnClearAllData").click();
      await modal.getByRole("button", { name: "Clear" }).click();
      // every key is dropped; the main view re-renders empty (and re-seeds its
      // own order/last_gen keys, so localStorage.length is not 0 afterwards)
      await expect.poll(async () => page.evaluate(() => localStorage.getItem("lol_categories"))).toBeNull();
      await expect(page.locator("#mainScrollBody")).toContainText("No active lists yet");
    });

    test("Regenerate Main Tiles rebuilds the order and clears a past sleepUntil", async ({ page }) => {
      const cats = JSON.parse(JSON.stringify(CATEGORIES));
      cats[0].lists[1].sleepUntil = "2000-01-01";       // intentionally long past
      await page.evaluate((data) => {
        localStorage.setItem("lol_categories", JSON.stringify(data));
        localStorage.removeItem("lol_main_order");
        localStorage.removeItem("lol_last_gen");
      }, cats);
      await page.reload();
      await page.evaluate(() => openSettings());
      await page.locator("#settingsPage .smd-tab-btn").filter({ hasText: "Danger" }).click();
      await page.locator("#showDanger").check();
      await page.locator("#btnRegenerateTiles").click();
      await expect(page.locator("#settingsPage")).toBeHidden();
      const saved = await readCategories(page);
      expect(saved[0].lists[1].sleepUntil).toBe("");
      const order = await readMainOrder(page);
      expect(order).toEqual(expect.arrayContaining(["list_1", "list_2"]));
    });

    test("Sort Lists in Categories reorders by the sleepUntil/time rules", async ({ page }) => {
      const cats = JSON.parse(JSON.stringify(CATEGORIES));
      cats[0].lists = [
        { id: "list_a", title: "Later", sequence: 1, description: "", active: true, sleepUntil: todayStr(), items: [] },
        { id: "list_b", title: "Timed", sequence: 2, description: "", active: true, time: "09:00", items: [] },
        { id: "list_c", title: "Plain", sequence: 3, description: "", active: true, items: [] },
      ];
      await page.evaluate((data) => {
        localStorage.setItem("lol_categories", JSON.stringify(data));
        localStorage.removeItem("lol_main_order");
        localStorage.removeItem("lol_last_gen");
      }, cats);
      await page.reload();
      await page.evaluate(() => openSettings());
      await page.locator("#settingsPage .smd-tab-btn").filter({ hasText: "Danger" }).click();
      await page.locator("#showDanger").check();
      await page.locator("#btnSortListsInCategories").click();
      const saved = await readCategories(page);
      // no sleepUntil + time first, then the plain ones, then the sleepUntil group
      expect(saved[0].lists.map((l) => l.title)).toEqual(["Timed", "Plain", "Later"]);
      // The main view mirrors the reordered Edit Categories list order.
      const titles = await page.locator("#mainCardList lol-list-main-card .list-title").allTextContents();
      expect(titles).toEqual(["Timed", "Plain", "Later"]);
    });

    test("the Minio tab hides its menu items until enabled", async ({ page }) => {
      await seed(page);
      const menuItem = page.locator("a.minio-menu-item").filter({ hasText: "Export to Minio" });
      // open the hamburger: the items are in the (otherwise collapsed) menu
      await page.locator("#btnMainMenu").click();
      await expect(page.locator("#mainNav > .dropdown > .dropdown-menu")).toBeVisible();
      await expect(menuItem).toBeHidden();
      await page.locator("#btnMainMenu").click();                 // close the menu again

      await page.evaluate(() => openSettings());
      await page.locator("#settingsPage .smd-tab-btn").filter({ hasText: "Minio" }).click();
      await page.locator("#minioEnabled").check();
      await page.locator("#settingsPage .smd-page-footer smd-button").filter({ hasText: "OK" }).click();
      await expect(page.locator("#settingsPage")).toBeHidden();

      await page.locator("#btnMainMenu").click();
      await expect(menuItem).toBeVisible();
    });
  });

  // ── Export / Import ─────────────────────────────────────────────────────

  test.describe("Export / Import", () => {
    test("Export produces the categories + images payload", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => {
        window.__exported = null;
        window.__exportName = null;
        smdDownloadJson = (data, name) => { window.__exported = data; window.__exportName = name; };
        exportData();
      });
      const { payload, name } = await page.evaluate(() => ({ payload: window.__exported, name: window.__exportName }));
      expect(name).toBe("listoflists");
      expect(payload.version).toBe(1);
      expect(payload.categories.map((c) => c.title)).toEqual(["Work", "Home"]);
      expect(payload.images).toEqual([]);
      expect(typeof payload.exportedAt).toBe("string");
    });

    test("Import replaces the categories and regenerates the main view", async ({ page }) => {
      await seed(page);
      const imported = [{
        title: "Imported", sequence: 1, description: "", image: "",
        lists: [{ id: "list_x", title: "From file", sequence: 1, description: "", active: true, items: [] }],
      }];
      await page.evaluate((data) => {
        smdReadJsonFile = (cb) => cb({ version: 1, categories: data, images: [] });
        importData();
      }, imported);
      await expect.poll(async () => (await readCategories(page)).map((c) => c.title)).toEqual(["Imported"]);
      await expect(mainCard(page, "From file")).toHaveCount(1);
    });

    test("Import rejects a file without categories or images", async ({ page }) => {
      await seed(page);
      await page.evaluate(() => {
        window.alert = (msg) => { window.__alert = msg; };
        smdReadJsonFile = (cb) => cb({ nonsense: true });
        importData();
      });
      // the storage is untouched and the user is told
      expect(await page.evaluate(() => window.__alert)).toBeTruthy();
      expect((await readCategories(page)).map((c) => c.title)).toEqual(["Work", "Home"]);
    });
  });

  // ── Minio ───────────────────────────────────────────────────────────────

  test.describe("Minio", () => {
    async function enableMinio(page, bucket = "lol") {
      await page.evaluate((bucketName) => {
        localStorage.setItem("lol_minio_enabled", "true");
        localStorage.setItem("lol_minio_server", "http://minio:9000");
        localStorage.setItem("lol_minio_username", "minioadmin");
        localStorage.setItem("lol_minio_password", "minioadmin");
        localStorage.setItem("lol_minio_bucket", bucketName);
      }, bucket);
    }

    test("Export to Minio names the file listoflists-<datetime>.json and uploads the categories payload", async ({ page }) => {
      await seed(page);
      await enableMinio(page);
      await page.evaluate(() => {
        window.__minioPut = null;
        minioPutObject = (bucket, key, body) => {
          window.__minioPut = { bucket, key, body };
          return Promise.resolve();
        };
        exportToMinio();
      });

      await expect.poll(async () => page.evaluate(() => window.__minioPut && window.__minioPut.key))
        .toMatch(/^listoflists-\d{12}\.json$/);
      const put = await page.evaluate(() => window.__minioPut);
      expect(put.bucket).toBe("lol");
      const payload = JSON.parse(put.body);
      expect(payload.categories.map((c) => c.title)).toEqual(["Work", "Home"]);
      expect(payload.categories[0].lists.map((l) => l.title)).toEqual(["Report", "Meeting"]);
      expect(payload.images).toEqual([]);
      // ListOfLists must NOT use PlanMyDay's streams shape.
      expect(payload.streams).toBeUndefined();

      await expect(page.locator("#smdConfirmModal")).toContainText("Exported listoflists-");
      await page.locator("#smdConfirmModal").getByRole("button", { name: "OK" }).click();
    });

    test("Importing from Minio restores the categories through the app hook", async ({ page }) => {
      await seed(page);
      const imported = [{
        title: "Minio Import", sequence: 1, description: "", image: "",
        lists: [{ id: "list_minio", title: "From Minio", sequence: 1, description: "", active: true, items: [] }],
      }];

      const result = await page.evaluate((categories) => {
        const accepted = SmdConfig.onMinioImport(
          { version: 1, categories, images: [] },
          "listoflists-202601010000.json"
        );
        return {
          accepted,
          categories: JSON.parse(localStorage.getItem("lol_categories") || "[]")
        };
      }, imported);

      expect(result.accepted).toBe(true);
      expect(result.categories.map((c) => c.title)).toEqual(["Minio Import"]);
      expect(result.categories[0].lists.map((l) => l.title)).toEqual(["From Minio"]);
      await expect(page.locator("#smdConfirmModal")).toContainText("Imported listoflists-202601010000.json");
      await page.locator("#smdConfirmModal").getByRole("button", { name: "OK" }).click();

      // A file without categories or images is rejected and storage is untouched.
      const rejected = await page.evaluate(() => {
        const accepted = SmdConfig.onMinioImport({ nonsense: true }, "bad.json");
        return {
          accepted,
          categories: JSON.parse(localStorage.getItem("lol_categories") || "[]")
        };
      });
      expect(rejected.accepted).toBe(false);
      expect(rejected.categories.map((c) => c.title)).toEqual(["Minio Import"]);
    });
  });
});
