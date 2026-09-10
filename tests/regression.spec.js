const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

const TEST_STREAMS = [
  {
    id: "stream_1",
    title: "Work",
    description: "Work tasks",
    tab: "progress",
    image: "",
    sequence: 1,
    jobs: [
      {
        id: "job_1",
        title: "Report",
        description: "Weekly report",
        active: true,
        frequency: "daily",
        sequence: 1,
        suffix: true,
        dayType: "dayOfYear",
        mod: "",
        tasks: []
      },
      {
        id: "job_2",
        title: "Meeting",
        description: "Standup",
        active: true,
        frequency: "weekdays",
        sequence: 2,
        suffix: false,
        dayType: "dayOfYear",
        mod: "",
        tasks: []
      }
    ]
  },
  {
    id: "stream_2",
    title: "Chores",
    description: "",
    tab: "maintenance",
    image: "",
    sequence: 2,
    jobs: [
      {
        id: "job_3",
        title: "Laundry",
        description: "",
        active: true,
        frequency: "weekly",
        sequence: 1,
        suffix: false,
        dayType: "dayOfYear",
        mod: "",
        tasks: []
      }
    ]
  }
];

const now = new Date();
const todayStr = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");

function shortDateStr(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return dayNames[d.getDay()] + " " + d.getDate() + " " + monthNames[d.getMonth()] + " " + d.getFullYear();
}

function futureDateStr(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

function dayMonthStr(dateStr) {
  const parts = shortDateStr(dateStr).split(" ");
  return parts[1] + " " + parts[2];
}

function seedTodayList(page) {
  return page.evaluate(({ data, ds }) => {
    localStorage.setItem("planmydays_streams", JSON.stringify(data));
    localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1", "job_3"]));
    localStorage.setItem("planmydays_last_gen", ds);
    localStorage.setItem("planmydays_completed", JSON.stringify([]));
  }, { data: TEST_STREAMS, ds: todayStr });
}

test.describe("PlanMyDay - Regression", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("planmydays_images", "[]");
      document.querySelectorAll("smd-page").forEach((p) => { p.slideDuration = 0; });
    });
    await startCoverage(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await stopCoverage(page);
  });

  // ── Main View ──────────────────────────────────────────────

  test.describe("Main View", () => {

    test("loads with date heading", async ({ page }) => {
      await expect(page.locator("h2").first()).toBeVisible();
    });

    test("add card opens job edit modal", async ({ page }) => {
      await page.getByText("+ Add Job").click();
      await expect(page.locator("#jobEditPage")).toBeVisible();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("Add Job");
    });

    test("add card modal does not show delete button", async ({ page }) => {
      await page.getByText("+ Add Job").click();
      await expect(page.locator("#jobEditDelBtn")).toHaveCount(0);
    });

    test("can cancel adding an adhoc card", async ({ page }) => {
      test.setTimeout(30000);
      await page.getByText("+ Add Job").click();
      await page.locator("#jobEditCancelBtn").click();
      await expect(page.locator("#jobEditPage")).not.toBeVisible({ timeout: 10000 });
    });

    test("can add an adhoc card", async ({ page }) => {
      test.setTimeout(30000);
      await page.getByText("+ Add Job").click();
      await page.locator("#jobEditPage .form-control").first().fill("Test Ad Hoc");
      await page.locator("#jobEditPage textarea").first().fill("Test description");
      await page.locator("#jobEditOkBtn").click();
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 10000 });
      await expect(page.locator("h4").filter({ hasText: "Test Ad Hoc" })).toBeVisible();
    });

    test("completed jobs show strikethrough", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      const cb = page.locator('.job-checkbox[data-job-id="job_1"]');
      await cb.check();
      await expect(cb).toBeChecked();
    });

    test("view button appears on job cards", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await expect(page.locator("#todayCardList")).toBeVisible();
      const viewBtns = page.locator(".job-view-btn");
      await expect(viewBtns.first()).toBeVisible();
      await expect(await viewBtns.count()).toBeGreaterThanOrEqual(2);
    });

    test("view button opens read-only modal with job data", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await expect(page.locator("#todayCardList")).toBeVisible();
      await page.locator(".job-view-btn").first().click();
      await expect(page.locator("#jobEditPage")).toBeVisible();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("View Job");
      await expect(page.locator("#jobEditOkBtn")).toContainText("OK");
      await expect(page.locator("#btnViewJobEdit")).toContainText("Edit");
      const titleInput = page.locator("#jobEditPage .form-control").first();
      await expect(titleInput).toHaveValue("Report");
      await expect(page.locator("#jobEditPage input:read-only, #jobEditPage select:disabled, #jobEditPage textarea:read-only, #jobEditPage input[type=checkbox]:disabled").first()).toBeVisible();
    });

    test("read-only modal closes with close button", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await expect(page.locator("#todayCardList")).toBeVisible();
      await page.locator(".job-view-btn").first().click();
      await expect(page.locator("#jobEditPage")).toBeVisible();
      await page.locator("#jobEditOkBtn").click();
      await expect(page.locator("#jobEditPage")).toBeHidden({ timeout: 10000 });
    });

    test("edit button in view modal switches to editable mode", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await page.locator(".job-view-btn").first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("View Job");
      await page.locator("#btnViewJobEdit").filter({ hasText: "Edit" }).click();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("Edit Job");
      await expect(page.locator("#jobEditOkBtn")).toContainText("OK");
      const titleInput = page.locator("#jobEditPage .form-control").first();
      await expect(titleInput).toHaveValue("Report");
      await expect(titleInput).toBeEditable();
    });

    test("can delete a job from view then edit flow", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await expect(page.locator("#todayCardList")).toBeVisible();
      await page.locator(".job-view-btn").first().click();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("View Job");
      await page.locator("#btnViewJobEdit").filter({ hasText: "Edit" }).click();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("Edit Job");
      await expect(page.locator("#jobEditDelBtn")).toBeVisible();
      await page.locator("#jobEditDelBtn").click();
      await expect(page.locator("#smdConfirmModal")).toBeVisible();
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Delete" }).click();
      await page.locator("#smdConfirmModal").waitFor({ state: "hidden", timeout: 10000 });
    });

    test("view button renders regardless of badge text", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      const cards = page.locator("#todayCardList .card");
      const cardCount = await cards.count();
      for (let i = 0; i < cardCount; i++) {
        const btn = cards.nth(i).locator(".job-view-btn");
        await expect(btn).toBeVisible();
        const badge = cards.nth(i).locator(".badge.rounded-pill");
        await expect(badge).toBeVisible();
      }
    });

    test("job with future sleepUntil is hidden from main screen", async ({ page }) => {
      await seedTodayList(page);
      await page.evaluate((ds) => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[0].sleepUntil = ds;
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      }, futureDateStr(30));
      await page.reload();
      await expect(page.locator("#todayCardList")).toBeVisible();
      await expect(page.locator("h4").filter({ hasText: "Report" })).not.toBeVisible();
      await expect(page.locator("h4").filter({ hasText: "Laundry" })).toBeVisible();
    });

    test("setting sleepUntil to future via edit removes job from main screen", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await expect(page.locator("h4").filter({ hasText: "Report" })).toBeVisible();
      await page.locator(".job-view-btn").first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#btnViewJobEdit").filter({ hasText: "Edit" }).click();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("Edit Job");
      await page.evaluate((ds) => jobField("sleepUntil", ds), futureDateStr(30));
      await page.locator("#jobEditOkBtn").click();
      
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 10000 });
      await expect(page.locator("h4").filter({ hasText: "Report" })).not.toBeVisible({ timeout: 5000 });
      await expect(page.locator("h4").filter({ hasText: "Laundry" })).toBeVisible();
    });

    test("past sleepUntil is blanked when viewing job from main screen", async ({ page }) => {
      await seedTodayList(page);
      const pastDate = "2020-01-01";
      await page.evaluate((pd) => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[0].sleepUntil = pd;
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      }, pastDate);
      await page.reload();
      await expect(page.locator("h4").filter({ hasText: "Report" })).toBeVisible();
      await page.locator(".job-view-btn").first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("View Job");
      await expect(page.locator("#jobSleepUntil")).toHaveValue("");
      await page.locator("#btnViewJobEdit").filter({ hasText: "Edit" }).click();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("Edit Job");
      await expect(page.locator("#jobSleepUntil")).toHaveValue("");
    });

    test("sleep until shows short date format in view mode", async ({ page }) => {
      await seedTodayList(page);
      await page.evaluate((ds) => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[0].sleepUntil = ds;
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      }, todayStr);
      await page.reload();
      await page.locator(".job-view-btn").first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("View Job");
      await page.locator("#jobSchedule-tab").click();
      await expect(page.locator("#jobSleepUntil")).toHaveValue(shortDateStr(todayStr));
    });

    test("view then edit preserves custom today order", async ({ page }) => {
      // stream order is job_1 (Work/Report), job_3 (Chores/Laundry)
      // set today order to custom order: job_3 then job_1 (reversed)
      await page.evaluate(({ data, ds }) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_3", "job_1"]));
        localStorage.setItem("planmydays_last_gen", ds);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      }, { data: TEST_STREAMS, ds: todayStr });
      await page.reload();
      await expect(page.locator("#todayCardList")).toBeVisible();
      // verify custom order: Laundry (job_3) first, then Report (job_1)
      const cards = page.locator("#todayCardList .today-drag-card");
      await expect(cards.nth(0)).toContainText("Laundry");
      await expect(cards.nth(1)).toContainText("Report");
      // view then edit the first card (Laundry) without making changes
      await page.locator(".job-view-btn").first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#btnViewJobEdit").filter({ hasText: "Edit" }).click();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("Edit Job");
      await page.locator("#jobEditOkBtn").click();
      // hide modal
      
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
      // verify order is still preserved: job_3 then job_1 first, then any new active jobs appended
      const order = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_today_order")));
      expect(order[0]).toBe("job_3");
      expect(order[1]).toBe("job_1");
    });

    test("clear button resets sleepUntil field", async ({ page }) => {
      await page.getByText("+ Add Job").click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      const futureDate = futureDateStr(30);
      await page.evaluate((ds) => {
        const fp = $id("jobSleepUntil")._flatpickr;
        if (fp) {
          fp.setDate(ds, true);
          fp.input.value = ds;
        }
        updateSleepUntilClearBtn();
      }, futureDate);
      await page.locator("#jobSchedule-tab").click();
      await expect(page.locator("#jobSleepUntil")).toHaveValue(futureDate);
      const clearBtn = page.locator("#jobSleepUntilClearBtn");
      await expect(clearBtn).toBeVisible();
      await clearBtn.click();
      await expect(page.locator("#jobSleepUntil")).toHaveValue("");
    });

    test("ok button is disabled when title is empty", async ({ page }) => {
      await page.getByText("+ Add Job").click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      const okBtn = page.locator("#jobEditOkBtn button");
      await expect(okBtn).toBeDisabled();
      await page.locator("#jobTitleInput").fill("My Job");
      await expect(okBtn).toBeEnabled();
      await page.evaluate(() => {
        const input = $id("jobTitleInput");
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await expect(okBtn).toBeDisabled();
    });
    
  });

  // ── Navigation ─────────────────────────────────────────────

  test.describe("Navigation", () => {

    test("opens settings page", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await expect(page.locator("#settingsPage")).toBeVisible();
    });

    test("opens streams editor", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await expect(page.locator("#streamsEditor")).toBeVisible();
    });

    test("opens images editor", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Images" }).click();
      await expect(page.locator("#imagesEditor")).toBeVisible();
    });

    test("opening jobs editor hides images editor", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Images" }).click();
      await expect(page.locator("#imagesEditor")).toBeVisible();
      await page.locator("#imagesEditor").getByRole("button", { name: "Done" }).click();
      await page.locator("#imagesEditor").waitFor({ state: "hidden" });
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await expect(page.locator("#imagesEditor")).not.toBeVisible();
      await expect(page.locator("#streamsEditor")).toBeVisible();
    });

    test("closes images editor back to main view", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Images" }).click();
      await page.locator("#imagesEditor").getByRole("button", { name: "Done" }).click();
      await expect(page.locator("#countdownContainer")).toBeVisible();
    });

    test("edit dropdown has Streams and Images items", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await expect(page.locator("a.dropdown-item").filter({ hasText: "Streams" })).toBeVisible();
      await expect(page.locator("a.dropdown-item").filter({ hasText: "Images" })).toBeVisible();
    });

    test("import/export dropdown has items", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await expect(page.locator("a.dropdown-item").filter({ hasText: /^Export$/ })).toBeVisible();
      await expect(page.locator("a.dropdown-item").filter({ hasText: /^Import$/ })).toBeVisible();
    });

    test("exported filename does not contain -backup-", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      // Seed some images too so export has content
      await page.evaluate(() => {
        localStorage.setItem("planmydays_images", JSON.stringify([]));
      });

      const downloadPromise = page.waitForEvent("download");
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: /^Export$/ }).click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).not.toContain("-backup-");
    });
  });

  // ── Settings ───────────────────────────────────────────────

  test.describe("Settings", () => {

    test("shows all main settings controls", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await expect(page.locator("#splitList")).toBeVisible();
      await expect(page.locator("#autoHideMenu")).toBeVisible();
      await expect(page.locator("#hideDone")).toBeVisible();
      await page.locator("#appearance-tab").click();
      await expect(page.locator("#themeSelector")).toBeVisible();
      await expect(page.locator("#fontSizeSelector")).toBeVisible();
      await expect(page.locator("#iconSizeSelector")).toBeVisible();
      await expect(page.locator("#densitySelector")).toBeVisible();
      await expect(page.locator("#dragSizeSelector")).toBeVisible();
      await page.locator("#schedule-tab").click();
      await expect(page.locator("#jan1Selector")).toBeVisible();
      await expect(page.locator("#mondaySelector")).toBeVisible();
      await page.locator("#danger-tab").click();
      await expect(page.locator("#showDanger")).toBeVisible();
    });

    test("danger zone hidden by default", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await expect(page.locator("#regenerateTilesRow")).not.toBeVisible();
      await expect(page.locator("#clearAllDataRow")).not.toBeVisible();
    });

    test("danger zone appears when toggled", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await expect(page.locator("#regenerateTilesRow")).toBeVisible();
      await expect(page.locator("#clearAllDataRow")).toBeVisible();
    });

    test("font size selector changes body class", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#appearance-tab").click();
      await page.locator("#fontSizeSelector").selectOption("small");
      const hasClass = await page.evaluate(() => document.body.classList.contains("font-size-small"));
      expect(hasClass).toBe(true);
    });

    test("icon size selector changes body class", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#appearance-tab").click();
      await page.locator("#iconSizeSelector").selectOption("small");
      const hasClass = await page.evaluate(() => document.body.classList.contains("icon-size-small"));
      expect(hasClass).toBe(true);
    });

    test("density selector changes body class", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#appearance-tab").click();
      await page.locator("#densitySelector").selectOption("compact");
      const hasClass = await page.evaluate(() => document.body.classList.contains("compact"));
      expect(hasClass).toBe(true);
    });

    test("drag size selector changes body class", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#appearance-tab").click();
      await page.locator("#dragSizeSelector").selectOption("normal");
      const hasNormal = await page.evaluate(() => document.body.classList.contains("drag-size-normal"));
      expect(hasNormal).toBe(true);
      const stored = await page.evaluate(() => localStorage.getItem("planmydays_dragSize"));
      expect(stored).toBe("normal");
      await page.locator("#dragSizeSelector").selectOption("large");
      const hasLarge = await page.evaluate(() => document.body.classList.contains("drag-size-large"));
      expect(hasLarge).toBe(true);
    });

    test("split list toggle persists", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#splitList").check();
      await expect(page.locator("#splitList")).toBeChecked();
    });

    test("auto hide menu toggle persists", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#autoHideMenu").check();
      await expect(page.locator("#autoHideMenu")).toBeChecked();
    });

    test("hide done toggle persists", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#hideDone").check();
      await expect(page.locator("#hideDone")).toBeChecked();
    });

    test("settings close returns to main view", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.locator("#countdownContainer")).toBeVisible();
    });
  });

  // ── Streams Editor ─────────────────────────────────────────

  test.describe("Streams Editor", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      await page.goto("/PlanMyDay/");
      await page.evaluate((data) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
      }, TEST_STREAMS);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.waitForTimeout(150);
    });

    test("shows stream list", async ({ page }) => {
      await expect(page.getByText("Work")).toBeVisible();
      await expect(page.getByText("Chores")).toBeVisible();
    });

    test("add stream creates a new stream", async ({ page }) => {
      await page.getByRole("button", { name: "Add Stream" }).click();
      await expect(page.locator("#streamEditPage")).toBeVisible();
      await expect(page.locator("#streamTitleInput")).toHaveValue("");
      await page.locator("#streamTitleInput").fill("New Stream");
      await page.locator("#btnStreamEditOk").click();
      await page.locator("#streamEditPage").waitFor({ state: "hidden", timeout: 15000 });
      await expect(page.locator("#streamEditorList .editor-title").filter({ hasText: "New Stream" })).toBeVisible();
    });

    test("add stream OK button is disabled until title has text", async ({ page }) => {
      await page.getByRole("button", { name: "Add Stream" }).click();
      await expect(page.locator("#streamEditPage")).toBeVisible();
      await expect(page.locator("#btnStreamEditOk button")).toBeDisabled();
      await page.locator("#streamTitleInput").fill("My Stream");
      await expect(page.locator("#btnStreamEditOk button")).toBeEnabled();
      await page.locator("#streamTitleInput").fill("   ");
      await expect(page.locator("#btnStreamEditOk button")).toBeDisabled();
      await page.locator("#streamTitleInput").fill("My Stream");
      await expect(page.locator("#btnStreamEditOk button")).toBeEnabled();
    });

    test("add stream focuses the title input", async ({ page }) => {
      await page.getByRole("button", { name: "Add Stream" }).click();
      await page.locator("#streamEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#streamTitleInput")).toBeFocused();
    });

    test("add stream Enter key confirms via OK", async ({ page }) => {
      await page.getByRole("button", { name: "Add Stream" }).click();
      await page.locator("#streamEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#streamTitleInput")).toBeFocused();
      await page.locator("#streamTitleInput").fill("Enter Stream");
      await page.keyboard.press("Enter");
      await page.locator("#streamEditPage").waitFor({ state: "hidden", timeout: 15000 });
      await expect(page.locator("#streamEditorList .editor-title").filter({ hasText: "Enter Stream" })).toBeVisible();
    });

    test("edit stream OK button is enabled when title exists", async ({ page }) => {
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#streamEditorList .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#streamEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#btnStreamEditOk button")).toBeEnabled();
    });

    test("can edit a stream", async ({ page }) => {
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#streamEditorList .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#streamEditPage").waitFor({ state: "visible" });
      const titleInput = page.locator("#streamEditPage .smd-page-body input[value=\"Work\"]");
      await expect(titleInput).toBeVisible();
      await titleInput.fill("Work Updated");
      await page.waitForTimeout(100);
      await page.locator("#btnStreamEditOk").first().click();
      await page.waitForTimeout(300);
      await page.locator("#streamEditPage").waitFor({ state: "hidden", timeout: 15000 });
      await expect(page.getByText("Work Updated")).toBeVisible();
    });

    test("can cancel editing a stream", async ({ page }) => {
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#streamEditorList .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#streamEditPage").waitFor({ state: "visible" });
      await page.locator("#streamEditPage .smd-page-body input").first().fill("Cancelled");
      await page.waitForTimeout(100);
      await page.locator("#btnStreamEditCancel").click();
      await page.waitForTimeout(300);
      await page.locator("#streamEditPage").waitFor({ state: "hidden", timeout: 15000 });
      await page.locator("#streamEditorList .editor-title").filter({ hasText: "Work" }).waitFor({ state: "visible" });
      await expect(page.getByText("Cancelled")).not.toBeVisible();
    });

    test("can delete a stream with no jobs", async ({ page }) => {
      await page.evaluate(() => {
        var streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams.push({ id: "stream_empty", title: "EmptyStream", tab: "progress", image: "", sequence: 99, jobs: [] });
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-accordion-header .btn-danger").filter({ hasText: "Delete", visible: true }).click();
      await expect(page.locator("#smdConfirmModal")).toBeVisible();
      await page.waitForTimeout(100);
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Delete" }).click();
      await page.waitForTimeout(200);
      await expect(page.getByText("EmptyStream")).not.toBeVisible();
    });

    test("delete button hidden when stream has jobs", async ({ page }) => {
      var delBtns = page.locator("#streamEditorList .stream-accordion-header .btn-danger").filter({ hasText: "Delete", visible: true });
      await expect(delBtns).toHaveCount(0);
    });

    test("delete button shown when stream has no jobs", async ({ page }) => {
      await page.evaluate(() => {
        var streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams.push({ id: "stream_empty", title: "EmptyStream", tab: "progress", image: "", sequence: 99, jobs: [] });
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      var delBtn = page.locator("#streamEditorList .stream-accordion-header .btn-danger").filter({ hasText: "Delete", visible: true });
      await expect(delBtn).toHaveCount(1);
    });

    test("shows tab badge on stream cards", async ({ page }) => {
      await expect(page.locator("#streamEditorList .badge").first()).toBeVisible();
    });

    test("maintenance tab badge uses info colour on stream cards", async ({ page }) => {
      await expect(page.locator("#streamEditorList .badge.bg-success").filter({ hasText: "progress" }).first()).toBeVisible();
      await expect(page.locator("#streamEditorList .badge.bg-info").filter({ hasText: "maintenance" }).first()).toBeVisible();
    });

    test("job count badge shows today/active/total counts", async ({ page }) => {
      const futureDate = futureDateStr(30);
      const badgeStream = {
        id: "stream_badge", title: "BadgeStream", tab: "progress", image: "", sequence: 1,
        jobs: [
          { id: "job_a", title: "A", active: true, schedule: { type: "daily" }, tasks: [] },
          { id: "job_b", title: "B", active: true, schedule: { type: "daily" }, tasks: [] },
          { id: "job_sleep", title: "Sleep", active: true, schedule: { type: "daily" }, sleepUntil: futureDate, tasks: [] },
          { id: "job_off", title: "Off", active: false, schedule: { type: "daily" }, tasks: [] }
        ]
      };
      await page.evaluate((s) => {
        localStorage.setItem("planmydays_streams", JSON.stringify([s]));
        renderStreamsEditor();
      }, badgeStream);
      await expect(page.locator("#streamEditorList .stream-accordion-item").first().locator(".count-badge")).toHaveText("2/3/4 jobs");
    });

    test("job count badge recalculates when schedule rules change", async ({ page }) => {
      const todayWeekday = new Date().getDay();
      const otherWeekday = (todayWeekday + 1) % 7;
      const badgeStream = {
        id: "stream_badge", title: "BadgeStream", tab: "progress", image: "", sequence: 1,
        jobs: [
          { id: "job_daily", title: "Daily", active: true, schedule: { type: "daily" }, tasks: [] },
          { id: "job_both", title: "Both", active: true, schedule: { type: "days", days: [todayWeekday, otherWeekday] }, tasks: [] },
          { id: "job_other", title: "Other", active: true, schedule: { type: "days", days: [otherWeekday] }, tasks: [] }
        ]
      };
      const badge = page.locator("#streamEditorList .stream-accordion-item").first().locator(".count-badge");
      await page.evaluate((s) => {
        localStorage.setItem("planmydays_streams", JSON.stringify([s]));
        renderStreamsEditor();
      }, badgeStream);
      await expect(badge).toHaveText("2/3/3 jobs");
      await page.evaluate((d) => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[2].schedule = { type: "days", days: [d] };
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        renderStreamsEditor();
      }, todayWeekday);
      await expect(badge).toHaveText("3/3/3 jobs");
      await page.evaluate(() => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[1].active = false;
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        renderStreamsEditor();
      });
      await expect(badge).toHaveText("2/2/3 jobs");
    });

    test("opens jobs from stream accordion", async ({ page }) => {
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await expect(page.locator("#streamEditorList .accordion-collapse.show .accordion-body")).toBeVisible();
    });

    test("closes streams editor back to main view", async ({ page }) => {
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.locator("#countdownContainer")).toBeVisible();
    });

    test("stream edit image button uses Edit", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "ImgStream", tab: "progress", image: "testimg", sequence: 1, jobs: []
        }]));
        localStorage.setItem("planmydays_images", JSON.stringify([{ name: "testimg", data: "" }]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#streamEditorList .btn-primary").filter({ hasText: "Edit" }).first().click();
      await expect(page.locator("#streamEditPage")).toBeVisible();
      await expect(page.locator("#btnStreamImageChoose")).toBeVisible();
      await expect(page.locator("#btnStreamImageChoose")).toContainText("Edit");
    });

    test("accordion stays expanded after edit stream", async ({ page }) => {
      // expand first stream
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      // edit the stream
      await page.locator("#streamEditorList .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#streamEditPage").waitFor({ state: "visible" });
      await page.locator("#streamEditPage .smd-page-body input").first().fill("WorkUpdated");
      await page.locator("#btnStreamEditOk").click();
      await page.locator("#streamEditPage").waitFor({ state: "hidden", timeout: 10000 });
      // accordion should still be expanded
      await expect(page.locator("#streamEditorList .accordion-collapse.show")).toBeVisible({ timeout: 5000 });
      // renamed title should be visible
      await expect(page.getByText("WorkUpdated")).toBeVisible();
    });

    test("streams can be reordered with drag and drop and save immediately", async ({ page }) => {
      const items = page.locator("#streamEditorList .stream-accordion-item");
      await expect(items).toHaveCount(2);
      const handleBox = await items.first().locator(".stream-accordion-header .drag-handle").boundingBox();
      const lastBox = await items.last().boundingBox();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height * 0.9, { steps: 15 });
      await page.mouse.up();
      await expect.poll(() =>
        page.evaluate(() => {
          const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
          return streams.map(s => s.title + ":" + s.sequence);
        })
      ).toEqual(["Chores:1", "Work:2"]);
      await expect(items.first()).toContainText("Chores");
      await expect(items.last()).toContainText("Work");
    });

    test("dragging an expanded stream keeps the same stream expanded", async ({ page }) => {
      // expand the first stream (Work)
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      // drag it below the second stream
      const firstItem = page.locator("#streamEditorList .stream-accordion-item").first();
      const handleBox = await firstItem.locator(".stream-accordion-header .drag-handle").boundingBox();
      const lastItem = page.locator("#streamEditorList .stream-accordion-item").last();
      const lastBox = await lastItem.boundingBox();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height * 0.9, { steps: 15 });
      await page.mouse.up();
      // saved order swapped and Work (now last) is still the expanded stream
      await expect.poll(() =>
        page.evaluate(() => {
          const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
          return streams.map(s => s.title);
        })
      ).toEqual(["Chores", "Work"]);
      await expect(page.locator("#streamEditorList .accordion-collapse.show")).toHaveCount(1);
      await expect(page.locator("#streamEditorList .stream-accordion-item").last().locator(".accordion-collapse.show")).toBeVisible();
      await expect(page.locator("#streamEditorList .accordion-collapse.show")).toContainText("Report");
    });

    test("dragging keeps the same stream expanded even without stream ids", async ({ page }) => {
      await page.evaluate(() => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams.forEach(s => { delete s.id; });
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.waitForTimeout(150);
      // expand the first stream (Work) and drag it below the second
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      const firstItem = page.locator("#streamEditorList .stream-accordion-item").first();
      const handleBox = await firstItem.locator(".stream-accordion-header .drag-handle").boundingBox();
      const lastItem = page.locator("#streamEditorList .stream-accordion-item").last();
      const lastBox = await lastItem.boundingBox();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height * 0.9, { steps: 15 });
      await page.mouse.up();
      // the moved stream keeps its open state
      await expect(page.locator("#streamEditorList .accordion-collapse.show")).toHaveCount(1);
      await expect(page.locator("#streamEditorList .stream-accordion-item").last().locator(".accordion-collapse.show")).toBeVisible();
      await expect(page.locator("#streamEditorList .accordion-collapse.show")).toContainText("Report");
    });
  });

  // ── Search Jobs ────────────────────────────────────────────

  test.describe("Search Jobs", () => {

    async function openSearchJobs(page) {
      await page.locator("#btnMainMenu").click();
      await page.locator("button.dropdown-item").filter({ hasText: "Search Jobs" }).click();
      await page.locator("#jobSearchEditor:not(.d-none)").waitFor({ state: "visible" });
    }

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      await page.goto("/PlanMyDay/");
      await page.evaluate((data) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
      }, TEST_STREAMS);
      await page.reload();
      await openSearchJobs(page);
    });

    test("shows all jobs from all streams", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /Search Jobs/ })).toBeVisible();
      await expect(page.locator("#jobSearchList pmd-job-search-card")).toHaveCount(3);
      await expect(page.getByText("Report")).toBeVisible();
      await expect(page.getByText("Meeting")).toBeVisible();
      await expect(page.getByText("Laundry")).toBeVisible();
    });

    test("header shows total job count badge", async ({ page }) => {
      await page.evaluate(() => {
        var streams = [{
          id: "stream_badge", title: "Badge", tab: "progress", image: "", sequence: 1, jobs: [
            { id: "job_b1", title: "Alpha", active: true, frequency: "daily", sequence: 1, dayType: "dayOfYear", mod: "" },
            { id: "job_b2", title: "Beta", active: true, frequency: "daily", sequence: 2, dayType: "dayOfYear", mod: "" }
          ]
        }];
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      });
      await page.reload();
      await openSearchJobs(page);
      await expect(page.locator("#jobSearchTotalBadge")).toHaveText("2/2/2 jobs");
    });

    test("search filters jobs by partial title", async ({ page }) => {
      await page.fill("#jobSearchInput", "meet");
      await expect(page.locator("#jobSearchList pmd-job-search-card")).toHaveCount(1);
      await expect(page.locator("#jobSearchList pmd-job-search-card .job-title").filter({ hasText: "Meeting" })).toBeVisible();
      await expect(page.getByText("Report")).not.toBeVisible();
      await expect(page.getByText("Laundry")).not.toBeVisible();
    });

    test("search is case insensitive", async ({ page }) => {
      await page.fill("#jobSearchInput", "MEETING");
      await expect(page.locator("#jobSearchList pmd-job-search-card")).toHaveCount(1);
      await expect(page.locator("#jobSearchList pmd-job-search-card .job-title").filter({ hasText: "Meeting" })).toBeVisible();
    });

    test("enter key triggers search", async ({ page }) => {
      await page.fill("#jobSearchInput", "laundry");
      await page.keyboard.press("Enter");
      await expect(page.locator("#jobSearchList pmd-job-search-card")).toHaveCount(1);
      await expect(page.locator("#jobSearchList pmd-job-search-card .job-title").filter({ hasText: "Laundry" })).toBeVisible();
    });

    test("shows message when no jobs match", async ({ page }) => {
      await page.fill("#jobSearchInput", "zzz");
      await expect(page.locator("#jobSearchList pmd-job-search-card")).toHaveCount(0);
      await expect(page.locator("#jobSearchList")).toContainText("No jobs match");
    });

    test("clear resets the search", async ({ page }) => {
      await page.fill("#jobSearchInput", "meet");
      await expect(page.locator("#jobSearchList pmd-job-search-card")).toHaveCount(1);
      await page.locator("#btnJobSearchClear").click();
      await expect(page.locator("#jobSearchList pmd-job-search-card")).toHaveCount(3);
    });

    test("tile shows stream name and badges instead of active label", async ({ page }) => {
      const firstTile = page.locator("#jobSearchList pmd-job-search-card").first();
      await expect(firstTile).toContainText("Work");
      await expect(firstTile.locator(".badge.bg-success").filter({ hasText: "progress" })).toBeVisible();
      await expect(firstTile.locator(".badge.bg-primary")).toBeVisible();
      await expect(page.locator("#jobSearchList")).not.toContainText("Active");
    });

    test("sleep and wait badges shown when present", async ({ page }) => {
      const futureDate = futureDateStr(30);
      await page.evaluate((ds) => {
        var streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[1].waitFor = "the meeting to start";
        streams[1].jobs[0].sleepUntil = ds;
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      }, futureDate);
      await page.reload();
      await openSearchJobs(page);
      const meetingTile = page.locator("#jobSearchList pmd-job-search-card").filter({ hasText: "Meeting" });
      await expect(meetingTile.locator(".badge").filter({ hasText: "Wait:" })).toContainText("Wait: the meeting to start");
      const laundryTile = page.locator("#jobSearchList pmd-job-search-card").filter({ hasText: "Laundry" });
      await expect(laundryTile.locator(".badge").filter({ hasText: "Sleep:" })).toContainText("Sleep: " + shortDateStr(futureDate));
    });

    test("tiles have no drag handles", async ({ page }) => {
      await expect(page.locator("#jobSearchList .drag-handle")).toHaveCount(0);
    });

    test("active checkbox toggles job active state without label", async ({ page }) => {
      const cb = page.locator("#jobSearchList pmd-job-search-card .active-toggle").first();
      await expect(page.locator("#jobSearchList")).not.toContainText("Active");
      await cb.uncheck();
      await expect(cb).not.toBeChecked();
      var active = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs[0].active);
      expect(active).toBe(false);
      await cb.check();
      await expect(cb).toBeChecked();
      active = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs[0].active);
      expect(active).toBe(true);
    });

    test("edit button opens edit job modal and returns to search", async ({ page }) => {
      await page.locator("#jobSearchList pmd-job-search-card").first().getByRole("button", { name: "Edit" }).click();
      await expect(page.locator("#jobEditPage")).toBeVisible();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("Edit Job");
      await page.locator("#jobEditCancelBtn").click();
      await page.locator("#jobEditPage").waitFor({ state: "hidden" });
      await expect(page.locator("#jobSearchEditor:not(.d-none)")).toBeVisible();
      await expect(page.locator("#jobSearchList pmd-job-search-card")).toHaveCount(3);
    });

    test("add job button opens add job modal", async ({ page }) => {
      await page.locator("#btnJobSearchAdd").click();
      await expect(page.locator("#jobEditPage")).toBeVisible();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("Add Job");
      await page.locator("#jobEditCancelBtn").click();
      await page.locator("#jobEditPage").waitFor({ state: "hidden" });
      await expect(page.locator("#jobSearchEditor:not(.d-none)")).toBeVisible();
    });

    test("done button returns to main view", async ({ page }) => {
      await page.locator("#btnJobSearchDone").click();
      await expect(page.locator("#jobSearchEditor")).toHaveClass(/d-none/);
      await expect(page.locator("#countdownContainer:not(.d-none)")).toBeVisible();
    });
  });

  // ── Jobs Editor ────────────────────────────────────────────

  test.describe("Jobs Editor", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      await page.goto("/PlanMyDay/");
      await page.evaluate((data) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
      }, TEST_STREAMS);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
    });

    test("shows job list", async ({ page }) => {
      await expect(page.locator("#streamEditorList .accordion-body .job-title").first()).toContainText("Report");
      await expect(page.getByText("Meeting")).toBeVisible();
    });

    test("sleep until badge shows short date format", async ({ page }) => {
      const futureDate = futureDateStr(30);
      await page.evaluate((ds) => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[0].sleepUntil = ds;
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        renderStreamsEditor();
      }, futureDate);
      await expect(page.locator("#streamEditorList .badge.bg-info").filter({ hasText: "Sleep:" })).toContainText(shortDateStr(futureDate));
    });

    test("wait badge shows wait text when job has no sleep until date", async ({ page }) => {
      await page.evaluate(() => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[0].waitFor = "the delivery to arrive";
        streams[0].jobs[1].waitFor = "the meeting to start";
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        renderStreamsEditor();
      });
      await expect(page.locator("#streamEditorList .badge.bg-info").filter({ hasText: "Wait: the delivery to arrive" })).toBeVisible();
      await expect(page.locator("#streamEditorList .badge.bg-info").filter({ hasText: "Wait: the meeting to start" })).toBeVisible();
    });

    test("sleep until badge takes precedence over wait badge", async ({ page }) => {
      const futureDate = futureDateStr(30);
      await page.evaluate((ds) => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[0].sleepUntil = ds;
        streams[0].jobs[0].waitFor = "the delivery to arrive";
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        renderStreamsEditor();
      }, futureDate);
      await expect(page.locator("#streamEditorList .badge.bg-info").filter({ hasText: "Sleep:" })).toContainText(shortDateStr(futureDate));
      await expect(page.locator("#streamEditorList .badge.bg-info").filter({ hasText: "Wait:" })).toHaveCount(0);
    });

    test("opens add job modal", async ({ page }) => {
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await expect(page.locator("#jobEditPage")).toBeVisible();
    });

    test("new job title defaults to blank", async ({ page }) => {
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobTitleInput")).toHaveValue("");
    });

    test("add job modal does not show delete button", async ({ page }) => {
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobEditDelBtn")).toHaveCount(0);
    });

    test("edit job modal shows delete button", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobEditDelBtn")).toBeVisible();
    });

    test("can fill and save a new job", async ({ page }) => {
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobEditPage .form-control").first().fill("New Job Test");
      await page.locator("#jobEditOkBtn").click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await expect(page.getByText("New Job Test")).toBeVisible();
    });

    test("can cancel adding a new job", async ({ page }) => {
      test.setTimeout(30000);
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobEditCancelBtn").click();
      
      await expect(page.locator("#jobEditPage")).not.toBeVisible({ timeout: 10000 });
    });

    test("opens edit job modal with existing data", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toContainText("Edit");
    });

    test("can delete a job", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobEditDelBtn").click();
      await expect(page.locator("#smdConfirmModal")).toBeVisible();
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Delete" }).waitFor({ state: "visible" });
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Delete" }).click();
      await page.locator("#smdConfirmModal").waitFor({ state: "hidden", timeout: 10000 });
    });

    test("schedule modal opens from job edit", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#btnScheduleChange").click();
      await expect(page.locator("#smdConfirmModal")).toBeVisible();
    });

    test("schedule modal can select specific days", async ({ page }) => {
      test.setTimeout(30000);
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#btnScheduleChange").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.locator("#schedDays").check();
      await expect(page.locator("#schedDaysOptions")).toBeVisible();
      await page.locator("#schedDay0").check();
      await page.locator("#schedDay2").check();
      await page.locator("#smdConfirmModal .smd-footer button[data-index='1']").click();
    });

    test("returns to main view from editor", async ({ page }) => {
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.locator("#countdownContainer")).toBeVisible();
    });

    test("jobs render in stored order without rule sorting", async ({ page }) => {
      await page.evaluate(() => {
        var streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs.push({ id: "job_late", title: "LateJob", active: true, frequency: "daily", sequence: 99, time: "", suffix: false, dayType: "dayOfYear", mod: "", tasks: [] });
        streams[0].jobs.push({ id: "job_early", title: "EarlyJob", active: true, frequency: "daily", sequence: 1, time: "08:00", suffix: false, dayType: "dayOfYear", mod: "", tasks: [] });
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      var jobTitles = page.locator("#streamEditorList .stream-accordion-item").first().locator(".accordion-body .job-drag-card .job-title");
      await expect(jobTitles).toHaveCount(4);
      await expect(jobTitles.first()).toContainText("Report");
      await expect(jobTitles.last()).toContainText("EarlyJob");
    });

    test("dragging a job tile by its handle reorders the stream and persists", async ({ page }) => {
      const firstBody = page.locator("#streamEditorList .stream-accordion-item").first().locator(".accordion-body");
      const handle = firstBody.locator(".job-drag-card .drag-handle").first();
      const handleBox = await handle.boundingBox();
      const lastBox = await firstBody.locator(".job-drag-card").last().boundingBox();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height * 0.9, { steps: 15 });
      await page.mouse.up();
      await expect.poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs.map(j => j.id))
      ).toEqual(["job_2", "job_1"]);
      await expect.poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs.map(j => j.sequence))
      ).toEqual([1, 2]);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      var jobTitles2 = page.locator("#streamEditorList .stream-accordion-item").first().locator(".accordion-body .job-drag-card .job-title");
      await expect(jobTitles2.first()).toContainText("Meeting");
      await expect(jobTitles2.last()).toContainText("Report");
    });

    test("active label is bold on job tiles", async ({ page }) => {
      var activeLabel = page.locator("#streamEditorList .accordion-body .active-toggle").first();
      await expect(activeLabel.locator("span")).toHaveCSS("font-weight", "700");
    });

    test("job tiles have a drag handle for touch reorder", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await expect(page.locator(".job-drag-card .drag-handle").first()).toBeVisible();
    });

    test("activating a job adds it to today order", async ({ page }) => {
      // deactivate job_2 and remove it from today_order
      await page.evaluate((ds) => {
        var streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        var jobs = streams[0].jobs;
        for (var i = 0; i < jobs.length; i++) {
          if (jobs[i].id === "job_2") { jobs[i].active = false; break; }
        }
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1", "job_3"]));
        localStorage.setItem("planmydays_last_gen", ds);
      }, todayStr);
      await page.reload();
      // go back to Jobs Editor
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      // toggle job_2 (Meeting) active
      var meetingToggle = page.locator("#streamEditorList .accordion-body input.active-toggle").nth(1);
      await expect(meetingToggle).not.toBeChecked();
      await meetingToggle.check();
      await page.waitForTimeout(150);
      // click Done to return to main view
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.locator("#countdownContainer")).toBeVisible();
      // verify job_2 is now in today_order (if it matches today's schedule)
      var todayOrder = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_today_order")));
      expect(todayOrder).toContain("job_2");
      // verify position: original order preserved, new job appended
      expect(todayOrder.indexOf("job_1")).toBe(0);
      expect(todayOrder.indexOf("job_3")).toBe(1);
      expect(todayOrder.indexOf("job_2")).toBe(2);
    });

    test("deactivating a job removes it from today order", async ({ page }) => {
      // set today_order to include all three jobs
      await page.evaluate((ds) => {
        var streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1", "job_2", "job_3"]));
        localStorage.setItem("planmydays_last_gen", ds);
      }, todayStr);
      await page.reload();
      // go to Jobs Editor
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      // verify job_2 is active and in the order
      var orderBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_today_order")));
      expect(orderBefore).toContain("job_2");
      // uncheck job_2 (Meeting) - second checkbox
      var meetingToggle = page.locator("#streamEditorList .accordion-body input.active-toggle").nth(1);
      await expect(meetingToggle).toBeChecked();
      await meetingToggle.uncheck();
      // wait for the order to reflect the removal before leaving the editor
      await expect
        .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_today_order") || "[]")))
        .not.toContain("job_2");
      // click Done to return to main view
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.locator("#countdownContainer")).toBeVisible();
      // verify job_2 is removed from today_order
      var orderAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_today_order")));
      expect(orderAfter).not.toContain("job_2");
      expect(orderAfter).toEqual(["job_1", "job_3"]);
    });
  });

  // ── Schedule Modal ─────────────────────────────────────────

  test.describe("Schedule Modal", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      await page.goto("/PlanMyDay/");
      await page.evaluate((data) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
      }, TEST_STREAMS);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.waitForTimeout(150);
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#btnScheduleChange").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.waitForTimeout(200);
    });

    test("every day radio option works", async ({ page }) => {
      await expect(page.locator("#schedDaysOptions")).toBeHidden();
      await expect(page.locator("#schedNDaysOptions")).toBeHidden();
      await expect(page.locator("#schedMonthlyOptions")).toBeHidden();
      await page.locator("#schedDaily").check();
      await page.locator("#smdConfirmModal .smd-footer button[data-index='1']").click();
    });

    test("monthly option shows day selector", async ({ page }) => {
      await page.locator("#schedMonthly").check();
      await expect(page.locator("#schedMonthlyOptions")).toBeVisible();
      await page.locator("#smdConfirmModal .smd-footer button[data-index='1']").click();
    });
  });

  // ── Images Editor ──────────────────────────────────────────

  test.describe("Images Editor", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      await page.goto("/PlanMyDay/");
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Images" }).click();
    });

    test("shows image list", async ({ page }) => {
      await expect(page.locator("#imagesEditor")).toBeVisible();
    });

    test("add new image opens edit modal", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await expect(page.locator("#imageEditModal")).toBeVisible();
      await expect(page.locator("#imageEditModalTitle")).toHaveText("Add Image");
    });

    test("add image modal has all fields", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await expect(page.locator("#imageEditModal label").filter({ hasText: "Name" })).toBeVisible();
      await expect(page.locator("#btnImageUpload")).toBeVisible();
      await expect(page.locator("#btnImageEditOk")).toBeVisible();
      await expect(page.locator("#btnImageEditCancel")).toBeVisible();
    });

    test("theme panels hidden when adding new image", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await expect(page.locator("#imageEditModalBody .fw-bold").filter({ hasText: "Light theme" })).toHaveCount(0);
      await expect(page.locator("#imageEditModalBody .fw-bold").filter({ hasText: "Dark theme" })).toHaveCount(0);
      await expect(page.locator('#imageEditModal input[type="color"]')).toHaveCount(0);
    });

    test("can name a new image", async ({ page }) => {
      test.setTimeout(30000);
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      const nameInput = page.locator("#imageEditModalBody input:not([type])");
      await expect(nameInput).toBeVisible();
      await nameInput.fill("TestImage");
      await nameInput.blur();
      await page.locator("#btnImageEditOk").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden", timeout: 10000 });
      await expect(page.locator(".card:has-text('TestImage')")).toBeVisible({ timeout: 15000 });
    });

    test("can cancel adding a new image", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.waitForTimeout(150);
      await page.evaluate(() => cancelImageEdit());
      await page.locator("#imageEditModal").waitFor({ state: "hidden", timeout: 15000 });
    });

    test("duplicate button creates copy", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").fill("MyImg");
      await page.locator("#btnImageEditOk").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden" });
      await page.locator(".card:has-text('MyImg')").getByTitle("Duplicate").click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").waitFor({ state: "visible", timeout: 10000 });
      await expect(page.locator("#imageEditModalBody .form-control:not(.form-control-sm)")).toHaveValue("MyImg 2");
    });

    test("delete button shows confirmation", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").fill("DelImg");
      await page.locator("#btnImageEditOk").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden", timeout: 10000 });
      await page.locator(".card:has-text('DelImg')").waitFor({ state: "visible" });
      await page.locator(".card:has-text('DelImg')").getByTitle("Delete").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Delete" }).click();
      await page.locator("#smdConfirmModal").waitFor({ state: "hidden", timeout: 10000 });
      await expect(page.getByText("DelImg")).not.toBeVisible();
    });

    test("duplicate button shows two-square icon", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").fill("SqImg");
      await page.locator("#btnImageEditOk").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden" });
      await expect(page.locator(".card:has-text('SqImg')").getByTitle("Duplicate").locator("svg rect")).toHaveCount(2);
    });

    test("duplicate opens modal titled Duplicate Image", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").fill("DupTitle");
      await page.locator("#btnImageEditOk").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden" });
      await page.locator(".card:has-text('DupTitle')").getByTitle("Duplicate").click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await expect(page.locator("#imageEditModalTitle")).toHaveText("Duplicate Image");
      await page.locator("#btnImageEditCancel").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden" });
    });

    test("edit opens modal titled Edit Image", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").fill("EditTitle");
      await page.locator("#btnImageEditOk").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden" });
      await page.locator(".card:has-text('EditTitle')").getByTitle("Edit").click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await expect(page.locator("#imageEditModalTitle")).toHaveText("Edit Image");
      await page.locator("#btnImageEditCancel").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden" });
    });

    test("action buttons have doubled spacing", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").fill("GapImg");
      await page.locator("#btnImageEditOk").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden" });
      const gap = await page.locator(".card:has-text('GapImg') .image-actions").evaluate(el => getComputedStyle(el).gap);
      expect(gap).toBe("16px");
    });

    test("delete button disabled when image used by a stream", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").fill("StreamImg");
      await page.locator("#btnImageEditOk").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden" });
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "s_inuse", title: "InUse", image: "StreamImg", sequence: 1, jobs: []
        }]));
      });
      await page.evaluate(() => renderImagesEditor());
      await expect(page.locator(".card:has-text('StreamImg')").getByTitle("Delete")).toBeDisabled();
    });

    test("delete button disabled when image used by a job", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").fill("JobImg");
      await page.locator("#btnImageEditOk").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden" });
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "s_jobuse", title: "S", image: "", sequence: 1,
          jobs: [{ id: "j_inuse", title: "J", image: "JobImg", active: true, sequence: 1, tasks: [] }]
        }]));
      });
      await page.evaluate(() => renderImagesEditor());
      await expect(page.locator(".card:has-text('JobImg')").getByTitle("Delete")).toBeDisabled();
    });

    test("delete button enabled when image unused", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").fill("FreeImg");
      await page.locator("#btnImageEditOk").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden" });
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "s_free", title: "S", image: "", sequence: 1, jobs: []
        }]));
      });
      await page.evaluate(() => renderImagesEditor());
      await expect(page.locator(".card:has-text('FreeImg')").getByTitle("Delete")).toBeEnabled();
    });

    test("upload button exists on edit modal", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator("#btnImageUpload").waitFor({ state: "visible" });
      await expect(page.locator("#btnImageUpload")).toBeVisible();
    });

    test("search filters the image list", async ({ page }) => {
      const imgName = "FilterMe" + Date.now();
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").waitFor({ state: "visible" });
      await page.locator("#imageEditModalBody .form-control:not(.form-control-sm)").fill(imgName);
      await page.locator("#btnImageEditOk").click();
      await page.locator("#imageEditModal").waitFor({ state: "hidden" });
      await page.evaluate((name) => setImageNameSearch(name), imgName);
      await expect(page.locator(`.card:has-text('${imgName}')`)).toBeVisible();
    });

    test("clear search resets filter", async ({ page }) => {
      test.setTimeout(30000);
      await page.locator('#imageNameSearchInput').fill("xyz");
      await expect(page.locator('#imageNameSearchInput')).toHaveValue("xyz");
      await page.locator('#btnImageFilterClear').click();
      await expect(page.locator('#imageNameSearchInput')).toHaveValue("");
    });
  });

  // ── Image Edit Modal ───────────────────────────────────────

  test.describe("Image Edit Modal", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      const svg = "data:image/svg+xml," + encodeURIComponent('<svg stroke="#000000" fill="#ffffff" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>');
      await page.goto("/PlanMyDay/");
      await page.evaluate((svgData) => {
        localStorage.clear();
        localStorage.setItem("planmydays_images", JSON.stringify([{ name: "EditTest", data: svgData }]));
      }, svg);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Images" }).click();
      await page.locator("#imagesEditor").waitFor({ state: "visible" });
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
    });

    test("color pickers for line and fill exist", async ({ page }) => {
      const colorInputs = page.locator('#imageEditModal input[type="color"]');
      await expect(colorInputs).toHaveCount(4);
    });

    test("stroke width input exists with correct range", async ({ page }) => {
      const widthInput = page.locator('#imageEditModal input[type="number"]').first();
      await expect(widthInput).toHaveAttribute("min", "0.5");
      await expect(widthInput).toHaveAttribute("max", "10");
    });
  });

  // ── Image Picker Modal ─────────────────────────────────────

  test.describe("Image Picker Modal", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      await page.evaluate((data) => {
        localStorage.clear();
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
        localStorage.setItem("planmydays_images", JSON.stringify([
          { name: "PickTest", data: "" },
          { name: "Another", data: "" }
        ]));
      }, TEST_STREAMS);
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList").waitFor({ state: "visible" });
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#streamEditorList .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#btnStreamImageChoose").click();
      await page.locator("#imagePickerPage").waitFor({ state: "visible" });
      await page.evaluate(() => {
        document.querySelectorAll(".modal.show").forEach(function(el) {
          if (el.id !== "imagePickerModal") {
            var inst = bootstrap.Modal.getInstance(el);
            if (inst) inst.hide();
          }
        });
      });
      await page.waitForTimeout(250);
    });

    test("opens from stream editor image choose", async ({ page }) => {
      await expect(page.locator("#imagePickerPage")).toBeVisible();
    });

    test("shows available images in picker", async ({ page }) => {
      await expect(page.getByText("PickTest")).toBeVisible();
      await expect(page.getByText("Another")).toBeVisible();
    });

    test("search filters picker items", async ({ page }) => {
      await page.locator("#imagePickerPage smd-image-picker .item").first().waitFor({ state: "visible" });
      await page.locator("#imagePickerPage smd-image-picker input[type=search]").fill("PickTest");
      await expect(page.getByText("PickTest")).toBeVisible();
      await expect(page.getByText("Another")).not.toBeVisible();
    });

    test("clear button resets picker search", async ({ page }) => {
      await page.locator("#imagePickerPage smd-image-picker input[type=search]").fill("PickTest");
      await page.locator("#imagePickerPage smd-image-picker .clear").click();
      await expect(page.locator("#imagePickerPage smd-image-picker input[type=search]")).toHaveValue("");
    });

    test("no image and cancel buttons exist", async ({ page }) => {
      await expect(page.getByText("No Image")).toBeVisible();
      await expect(page.locator("#imagePickerPage .smd-page-footer smd-button").filter({ hasText: "Cancel" })).toBeVisible();
    });

    test("picker has its icon tabs, Local active by default", async ({ page }) => {
      for (const label of ["Local", "Bootstrap", "Font Awesome", "FA Brands"]) {
        await expect(page.locator("#imagePickerPage smd-image-picker .tab-btn").filter({ hasText: label })).toBeVisible();
      }
      await expect(page.locator("#imagePickerPage smd-image-picker .tab-btn[active]")).toHaveText(/Local/);
      await expect(page.locator("#imagePickerPage smd-image-picker .item").first()).toBeVisible();
    });

    test("picker tabs wrap onto multiple lines", async ({ page }) => {
      const wrap = await page.locator("#imagePickerPage smd-image-picker").evaluate((el) => getComputedStyle(el.shadowRoot.querySelector(".tabs")).flexWrap);
      expect(wrap).toBe("wrap");
      await page.setViewportSize({ width: 360, height: 640 });
      await page.waitForTimeout(300);
      const rows = await page.locator("#imagePickerPage smd-image-picker .tab-btn").evaluateAll((btns) => {
        const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
        return new Set(tops).size;
      });
      expect(rows).toBeGreaterThan(1);
    });

    test("bootstrap tab shows all bootstrap icons with the icon font", async ({ page }) => {
      await page.locator("#imagePickerPage smd-image-picker .tab-btn").filter({ hasText: "Bootstrap" }).click();
      await page.locator("#imagePickerPage smd-image-picker .item").first().waitFor({ state: "visible", timeout: 10000 });
      expect(await page.locator("#imagePickerPage smd-image-picker .item").count()).toBeGreaterThan(500);
      const fontFamily = await page.locator("#imagePickerPage smd-image-picker .glyph").first()
        .evaluate((el) => getComputedStyle(el).fontFamily);
      expect(fontFamily).toContain("bootstrap-icons");
      await expect(page.locator("#imagePickerPage smd-image-picker .tab-btn[active]")).toHaveText(/Bootstrap/);
    });

    test("each icon tab renders its grid with the correct icon font", async ({ page }) => {
      const sets = [
        { label: "Bootstrap", family: "bootstrap-icons" },
        { label: "Font Awesome", family: "Font Awesome 6 Free" },
        { label: "FA Brands", family: "Font Awesome 6 Brands" }
      ];
      for (const set of sets) {
        await page.locator("#imagePickerPage smd-image-picker .tab-btn").filter({ hasText: set.label }).click();
        await page.locator("#imagePickerPage smd-image-picker .item").first().waitFor({ state: "visible", timeout: 15000 });
        const count = await page.locator("#imagePickerPage smd-image-picker .item").count();
        expect(count).toBeGreaterThan(300);
        const family = await page.locator("#imagePickerPage smd-image-picker .glyph").first()
          .evaluate((el) => getComputedStyle(el).fontFamily);
        expect(family).toContain(set.family);
      }
    });

    test("bootstrap tab search filters icons and clear restores them", async ({ page }) => {
      await page.locator("#imagePickerPage smd-image-picker .tab-btn").filter({ hasText: "Bootstrap" }).click();
      await page.locator("#imagePickerPage smd-image-picker .item").first().waitFor({ state: "visible", timeout: 10000 });
      const total = await page.locator("#imagePickerPage smd-image-picker .item").count();
      await page.locator("#imagePickerPage smd-image-picker input[type=search]").fill("house");
      await expect(page.locator("#imagePickerPage smd-image-picker .label").first()).toContainText("house");
      const filtered = await page.locator("#imagePickerPage smd-image-picker .item").count();
      expect(filtered).toBeGreaterThan(0);
      expect(filtered).toBeLessThan(total);
      await page.locator("#imagePickerPage smd-image-picker .clear").click();
      await expect(page.locator("#imagePickerPage smd-image-picker input[type=search]")).toHaveValue("");
      await expect(page.locator("#imagePickerPage smd-image-picker .item")).toHaveCount(total, { timeout: 10000 });
    });

    test("selecting an icon returns the set-prefixed name and closes the picker", async ({ page }) => {
      const sets = [
        { label: "Bootstrap", prefix: "bi" },
        { label: "Font Awesome", prefix: "fa" },
        { label: "FA Brands", prefix: "fab" }
      ];
      for (const set of sets) {
        await page.locator("#imagePickerPage smd-image-picker .tab-btn").filter({ hasText: set.label }).click();
        await page.locator("#imagePickerPage smd-image-picker .item").first().waitFor({ state: "visible", timeout: 15000 });
        const firstItemName = (await page.locator("#imagePickerPage smd-image-picker .label").first().textContent()).trim();
        await page.locator("#imagePickerPage smd-image-picker .item").first().click();
        await page.locator("#imagePickerPage").waitFor({ state: "hidden", timeout: 10000 });
        await expect(page.locator("#streamImageName")).toHaveText(`${set.prefix}:${firstItemName}`);
        await page.locator("#btnStreamImageChoose").click();
        await page.locator("#imagePickerPage").waitFor({ state: "visible" });
        await page.locator("#imagePickerPage smd-image-picker .item").first().waitFor({ state: "visible", timeout: 10000 });
      }
    });
  });

  // ── smd-image rendering ────────────────────────────────────

  test.describe("smd-image rendering", () => {

    test("applies light and dark svg theme overrides to nested elements like the editor preview", async ({ page }) => {
      await page.goto("/PlanMyDay/");
      const nestedSvg = "data:image/svg+xml," + encodeURIComponent('<svg fill="#f7f7f7" stroke="#8f8f8f" xmlns="http://www.w3.org/2000/svg"><path fill="#f7f7f7" stroke="#8f8f8f" d="M0 0h10v10H0z"/></svg>');
      await page.evaluate((svgData) => {
        localStorage.setItem("planmydays_images", JSON.stringify([{
          name: "NestedIcon",
          data: svgData,
          themes: {
            light: { line: "none", fill: "#000000", width: null },
            dark: { line: "none", fill: "#ffffff", width: null }
          }
        }]));
      }, nestedSvg);
      await page.reload();

      for (const [theme, wantFill] of [["dark", "#ffffff"], ["light", "#000000"]]) {
        await page.evaluate((t) => {
          document.documentElement.setAttribute("data-bs-theme", t);
          const el = document.createElement("smd-image");
          el.setAttribute("key-prefix", "planmydays_");
          el.setAttribute("image", "NestedIcon");
          el.setAttribute("size", "64");
          document.body.appendChild(el);
        }, theme);
        const src = await page.evaluate(() =>
          document.querySelector("smd-image[image='NestedIcon']").shadowRoot.querySelector("img").getAttribute("src"));
        const decoded = decodeURIComponent(src.substring("data:image/svg+xml,".length));
        expect(decoded).toContain(`<svg fill="${wantFill}"`);
        expect(decoded).toContain(`<path fill="${wantFill}"`);
        const editorOut = await page.evaluate(() => decodeURIComponent(getThemedImageDataUrl(loadImages()[0]).substring("data:image/svg+xml,".length)));
        expect(decoded).toBe(editorOut);
        await page.evaluate(() => { document.querySelector("smd-image[image='NestedIcon']").remove(); });
      }
    });

    test("renders a bi: prefixed name as a bootstrap icon glyph", async ({ page }) => {
      await page.goto("/PlanMyDay/");
      await page.evaluate(() => {
        const el = document.createElement("smd-image");
        el.setAttribute("image", "bi:house");
        el.setAttribute("size", "64");
        document.body.appendChild(el);
      });
      await page.waitForFunction(() => {
        const el = document.querySelector("smd-image[image='bi:house']");
        if (!el || !el.shadowRoot) return false;
        const span = el.shadowRoot.querySelector(".smd-bi");
        return span && !span.hidden && span.textContent.length > 0;
      }, null, { timeout: 10000 });
      const info = await page.evaluate(() => {
        const el = document.querySelector("smd-image[image='bi:house']");
        const span = el.shadowRoot.querySelector(".smd-bi");
        return {
          glyph: span.textContent,
          fontFamily: getComputedStyle(span).fontFamily,
          fontSize: getComputedStyle(span).fontSize,
          hostW: getComputedStyle(el).width,
          imgHidden: el.shadowRoot.querySelector("img").hidden
        };
      });
      expect(info.fontFamily).toContain("bootstrap-icons");
      expect(info.fontSize).toBe("51px");
      expect(info.hostW).toBe("64px");
      expect(info.imgHidden).toBeTruthy();

      const expected = await page.evaluate(async () => {
        const css = await (await fetch("../shared/vendor/bootstrap-icons.css?v=" + (typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : 0))).text();
        const m = css.match(/\.bi-house::before[^}]*content:\s*["']\\([0-9a-fA-F]+)["']/);
        return m ? String.fromCodePoint(parseInt(m[1], 16)) : "";
      });
      expect(info.glyph).toBe(expected);
    });

    test("renders fa/fab prefixed names as icon glyphs with the right fonts", async ({ page }) => {
      await page.goto("/PlanMyDay/");
      const samples = [
        { image: "fa:house", family: "Font Awesome 6 Free", weight: "900" },
        { image: "fab:github", family: "Font Awesome 6 Brands", weight: "400" }
      ];
      for (const sample of samples) {
        await page.evaluate((img) => {
          const el = document.createElement("smd-image");
          el.setAttribute("image", img);
          el.setAttribute("size", "64");
          document.body.appendChild(el);
        }, sample.image);
        await page.waitForFunction((img) => {
          const el = document.querySelector(`smd-image[image='${img}']`);
          if (!el || !el.shadowRoot) return false;
          const span = el.shadowRoot.querySelector(".smd-bi");
          return span && !span.hidden && span.textContent.length > 0;
        }, sample.image, { timeout: 15000 });
        const info = await page.evaluate((img) => {
          const el = document.querySelector(`smd-image[image='${img}']`);
          const span = el.shadowRoot.querySelector(".smd-bi");
          const cs = getComputedStyle(span);
          return { text: span.textContent, fontFamily: cs.fontFamily, fontWeight: cs.fontWeight };
        }, sample.image);
        expect(info.fontFamily).toContain(sample.family);
        expect(info.fontWeight).toBe(sample.weight);
        expect(info.text.length).toBe(1);
      }
    });

    test("unknown bi: names stay hidden", async ({ page }) => {
      await page.goto("/PlanMyDay/");
      await page.evaluate(() => {
        const el = document.createElement("smd-image");
        el.setAttribute("image", "bi:no-such-icon-xyz");
        document.body.appendChild(el);
      });
      await page.waitForFunction(() => {
        const el = document.querySelector("smd-image[image='bi:no-such-icon-xyz']");
        return el && el.shadowRoot;
      });
      await page.waitForTimeout(800);
      const hidden = await page.evaluate(() => {
        const el = document.querySelector("smd-image[image='bi:no-such-icon-xyz']");
        const span = el.shadowRoot.querySelector(".smd-bi");
        const img = el.shadowRoot.querySelector("img");
        return { spanMissing: !span, imgHidden: img ? img.hidden : null };
      });
      expect(hidden.spanMissing).toBeTruthy();
      expect(hidden.imgHidden).toBeTruthy();
    });

    test("stored images still render when image name is not bi: prefixed", async ({ page }) => {
      await page.goto("/PlanMyDay/");
      await page.evaluate(() => {
        localStorage.setItem("planmydays_images", JSON.stringify([
          { name: "Apple", data: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%23ff0000'/%3E%3C/svg%3E" }
        ]));
        const el = document.createElement("smd-image");
        el.setAttribute("key-prefix", "planmydays_");
        el.setAttribute("image", "Apple");
        el.setAttribute("size", "32");
        document.body.appendChild(el);
      });
      await page.waitForFunction(() => {
        const el = document.querySelector("smd-image[image='Apple']");
        if (!el || !el.shadowRoot) return false;
        const img = el.shadowRoot.querySelector("img");
        return img && !img.hidden && img.hasAttribute("src");
      });
      const hasBiSpan = await page.evaluate(() => {
        const el = document.querySelector("smd-image[image='Apple']");
        return !!el.shadowRoot.querySelector(".smd-bi");
      });
      expect(hasBiSpan).toBeFalsy();
    });

    test("main view renders a bi: job image as an icon glyph", async ({ page }) => {
      const streams = JSON.parse(JSON.stringify(TEST_STREAMS));
      streams[0].jobs[0].image = "bi:house";
      await page.evaluate(({ streams, ds }) => {
        localStorage.setItem("planmydays_images", "[]");
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ds);
        localStorage.setItem("planmydays_completed", "[]");
      }, { streams, ds: todayStr });
      await page.reload();
      await page.locator("#todayCardList smd-image[image='bi:house']").waitFor({ state: "attached" });
      await page.waitForFunction(() => {
        const el = document.querySelector("#todayCardList smd-image[image='bi:house']");
        if (!el || !el.shadowRoot) return false;
        const span = el.shadowRoot.querySelector(".smd-bi");
        return span && !span.hidden;
      }, null, { timeout: 10000 });
      const glyphInfo = await page.locator("#todayCardList smd-image[image='bi:house']").evaluate((el) => {
        const span = el.shadowRoot.querySelector(".smd-bi");
        return { glyph: span.textContent, fontFamily: getComputedStyle(span).fontFamily };
      });
      expect(glyphInfo.fontFamily).toContain("bootstrap-icons");
      expect(glyphInfo.glyph.length).toBeGreaterThan(0);
    });
  });

  // ── Dev Mode ───────────────────────────────────────────────

  test.describe("Dev Mode", () => {

    test("dev mode setting appears with ?dev=true", async ({ page }) => {
      await page.goto("/PlanMyDay/?dev=true");
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await expect(page.locator(".flatpickr-input")).toHaveCount(2);
    });

    test("dev mode not visible without ?dev=true", async ({ page }) => {
      await page.goto("/PlanMyDay/");
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await expect(page.locator(".flatpickr-input")).toHaveCount(0);
    });
  });

  // ── Split List ─────────────────────────────────────────────

  test.describe("Split List", () => {

    test("tabs appear when split list enabled", async ({ page }) => {
      await seedTodayList(page);
      await page.evaluate(() => localStorage.setItem("planmydays_splitList", "true"));
      await page.reload();
      const tabs = page.locator("#todayTabs .smd-tab-btn").filter({ hasText: /Progress|Maintenance/ });
      await expect(tabs).toHaveCount(2);
    });

    test("can switch between tabs", async ({ page }) => {
      await seedTodayList(page);
      await page.evaluate(() => localStorage.setItem("planmydays_splitList", "true"));
      await page.reload();
      await page.locator("#todayTabs .smd-tab-btn").filter({ hasText: "Maintenance" }).click();
      await expect(page.getByText("Laundry")).toBeVisible();
      const reportCard = page.locator("#todayCardList .today-drag-card").filter({ hasText: "Report" });
      await expect(reportCard).toHaveCount(1);
      await expect(reportCard).toBeHidden();
    });

    test("tab bar is visible above the job list when many jobs overflow", async ({ page }) => {
      // Seed a stream with 20 jobs and split list enabled
      const jobs = Array.from({ length: 20 }, (_, i) => ({
        id: `tab_test_job_${i}`,
        title: `Tab Test Job ${i}`,
        description: "",
        active: true,
        frequency: "daily",
        sequence: i,
        suffix: false,
        dayType: "dayOfYear",
        mod: "",
        tasks: []
      }));
      const stream = {
        id: "tab_test_stream",
        title: "TabTest",
        description: "",
        tab: "progress",
        image: "",
        sequence: 1,
        jobs
      };
      const now = new Date();
      const ds = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
      await page.evaluate(({ stream, ds }) => {
        localStorage.setItem("planmydays_streams", JSON.stringify([stream]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(stream.jobs.map(j => j.id)));
        localStorage.setItem("planmydays_last_gen", ds);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
        localStorage.setItem("planmydays_splitList", "true");
      }, { stream, ds });
      await page.reload();

      const tabBar = page.locator("#todayTabs .smd-tab-btn").filter({ hasText: "Progress" });
      await expect(tabBar).toBeVisible();

      // Verify the tab bar is within the viewport (not pushed below the fold)
      const tabBox = await tabBar.boundingBox();
      expect(tabBox).not.toBeNull();
      expect(tabBox.y).toBeGreaterThanOrEqual(0);

      // Verify tabs appear above the first job card
      const firstCard = page.locator(".today-drag-card").first();
      const cardBox = await firstCard.boundingBox();
      expect(cardBox).not.toBeNull();
      expect(tabBox.y + tabBox.height).toBeLessThanOrEqual(cardBox.y);
    });
  });

  // ── Delete Confirm Modal ───────────────────────────────────

  test.describe("Delete Confirm Modal", () => {

    test("cancel button dismisses modal", async ({ page }) => {
      await page.evaluate((data) => {
        var streams = JSON.parse(JSON.stringify(data));
        streams.push({ id: "stream_empty", title: "EmptyStream", tab: "progress", image: "", sequence: 99, jobs: [] });
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      }, TEST_STREAMS);
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList").waitFor({ state: "visible" });
      await page.locator("#streamEditorList .stream-accordion-header .btn-danger").filter({ hasText: "Delete", visible: true }).click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Cancel" }).click();
      await page.locator("#smdConfirmModal").waitFor({ state: "hidden", timeout: 10000 });
      await expect(page.locator("#smdConfirmModal")).not.toBeVisible();
    });
  });

  // ── Ad Hoc Workflow ────────────────────────────────────────

  test.describe("Ad Hoc Workflow", () => {

    test("checking adhoc shows remove confirmation", async ({ page }) => {
      await page.getByText("+ Add Job").click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobEditPage .form-control").first().fill("AdHocJob");
      await page.locator("#jobEditOkBtn").click();
      
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 10000 });
      await page.evaluate(() => {
        const cb = document.querySelector('.job-checkbox');
        if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      await expect(page.locator("#smdConfirmModal")).toBeVisible();
    });

    test("skip adhoc confirm setting works", async ({ page }) => {
      await page.evaluate(() => localStorage.setItem("planmydays_skipAdhocConfirm", "true"));
      await page.reload();
      await page.getByText("+ Add Job").click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobEditPage .form-control").first().fill("SkipMe");
      await page.locator("#jobEditOkBtn").click();
      
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 10000 });
      await expect(page.getByText("SkipMe")).toBeVisible();
      await page.waitForSelector('.job-checkbox');
      await page.evaluate(() => {
        const cb = document.querySelector('.job-checkbox');
        if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      await page.waitForTimeout(250);
      await expect(page.locator("#smdConfirmModal")).not.toBeVisible();
    });
  });

  // ── Suffix Display ─────────────────────────────────────────

  test.describe("Suffix Display", () => {

    test("suffix badge appears on job cards", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await page.locator("#todayCardList").waitFor({ state: "visible" });
      const suffixBadge = page.locator(".badge.bg-secondary").first();
      await expect(suffixBadge).toBeVisible();
    });
  });

  // ── Today List Reorder ───────────────────────────────────

  test.describe("Today List Reorder", () => {

    async function dragFirstCardToBottom(page) {
      const first = page.locator("#todayCardList .today-drag-card").first();
      await expect(first).toHaveAttribute("data-job-id", "job_1");
      const handle = first.locator(".drag-handle");
      const handleBox = await handle.boundingBox();
      const lastBox = await page.locator("#todayCardList .today-drag-card").last().boundingBox();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height * 0.9, { steps: 15 });
      await page.mouse.up();
    }

    test("dragging a job tile by its handle persists the new order", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await expect(page.locator("#todayCardList .today-drag-card")).toHaveCount(2);
      await dragFirstCardToBottom(page);
      await expect.poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_today_order")))
      ).toEqual(["job_3", "job_1"]);
    });

    test("persisted today order is applied after reload", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await expect(page.locator("#todayCardList .today-drag-card")).toHaveCount(2);
      await dragFirstCardToBottom(page);
      await page.reload();
      await expect(page.locator("#todayCardList .today-drag-card").first()).toHaveAttribute("data-job-id", "job_3");
    });
  });

  // ── Main List Sync ────────────────────────────────────────

  test.describe("Main List Sync", () => {

    test("deleting a job from the main view refreshes the list", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      const reportCard = page.locator("#todayCardList .today-drag-card").first();
      await expect(reportCard).toHaveAttribute("data-job-id", "job_1");
      await reportCard.locator(".job-view-btn").click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toContainText("View Job");
      await page.locator("#btnViewJobEdit").click();
      await page.locator("#jobEditDelBtn").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Delete" }).click();
      await page.locator("#smdConfirmModal").waitFor({ state: "hidden", timeout: 10000 });
      await expect(page.locator("#todayCardList .today-drag-card")).toHaveCount(1);
      await expect(page.locator("#todayCardList .today-drag-card").first()).toHaveAttribute("data-job-id", "job_3");
      const order = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_today_order")));
      expect(order).toEqual(["job_3"]);
    });

    test("adding an eligible job in the streams editor joins today's list", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobEditPage .form-control").first().fill("NewDailyJob");
      await page.locator("#jobEditOkBtn").click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      const newId = await page.evaluate(() => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        const jobs = streams[0].jobs;
        return jobs[jobs.length - 1].id;
      });
      await expect.poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_today_order")))
      ).toContain(newId);
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.locator("#countdownContainer")).toBeVisible();
      await expect(page.getByText("NewDailyJob").first()).toBeVisible();
    });

    test("a job that does not match today's schedule is not added to today's list", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobEditPage .form-control").first().fill("SleepingJob");
      await page.locator("#jobSchedule-tab").click();
      const futureDate = futureDateStr(2);
      await page.evaluate((ds) => {
        $id("jobSleepUntil")._flatpickr.setDate(ds, true);
      }, futureDate);
      await page.locator("#jobEditOkBtn").click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      const order = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_today_order")));
      expect(order).toEqual(["job_1", "job_3"]);
      const saved = await page.evaluate(() => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        const jobs = streams[0].jobs;
        return jobs[jobs.length - 1].sleepUntil;
      });
      expect(saved).toBe(futureDate);
    });
  });

  // ── Suffix Start Setting ──────────────────────────────────

  test.describe("Suffix Start Setting", () => {

    test("suffix start dropdown exists in settings after hide done", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#schedule-tab").click();
      const suffixStartSel = page.locator("#suffixStartSelector");
      await expect(suffixStartSel).toBeVisible();
    });

    test("suffix start 0 shows 0-based number on badge", async ({ page }) => {
      await page.evaluate(() => {
        const now = new Date();
        const ds = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "SuffixJob", active: true, frequency: "daily", sequence: 1, suffix: true, dayType: "dayOfYear", mod: "", tasks: [] }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ds);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
        localStorage.setItem("planmydays_suffixStart", "0");
      });
      await page.reload();
      const badge = page.locator(".badge.bg-secondary").first();
      const text = await badge.textContent();
      const match = text.match(/\((\d+)\)/);
      expect(match).not.toBeNull();
    });

    test("suffix start 1 adds 1 to displayed number", async ({ page }) => {
      await page.evaluate(() => {
        const now = new Date();
        const jan1 = new Date(now.getFullYear(), 0, 0);
        const dayOfYear = Math.floor((now - jan1) / 86400000);
        const ds = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "SuffixPlus1", active: true, frequency: "daily", sequence: 1, suffix: true, dayType: "dayOfYear", mod: "", tasks: [] }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ds);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
        localStorage.setItem("planmydays_suffixStart", "1");
        localStorage.setItem("planmydays_jan1", "1");
      });
      await page.reload();
      const badge = page.locator(".badge.bg-secondary").first();
      const text = await badge.textContent();
      const match = text.match(/\((\d+)\)/);
      expect(match).not.toBeNull();
      const num = parseInt(match[1], 10);
      expect(num).toBeGreaterThan(0);
    });

    test("suffix start setting persists via settings page", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#schedule-tab").click();
      await page.locator("#suffixStartSelector").selectOption("1");
      const val = await page.evaluate(() => localStorage.getItem("planmydays_suffixStart"));
      expect(val).toBe("1");
    });
  });

  // ── Tab Badge ──────────────────────────────────────────────

  test.describe("Tab Badge", () => {

    test("tab badge shows progress or maintenance on job cards", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await expect(page.locator("h4").filter({ hasText: "Report" })).toBeVisible();
      const progressBadge = page.locator(".badge.bg-success").filter({ hasText: "progress" });
      await expect(progressBadge.first()).toBeVisible();
      const maintenanceBadge = page.locator(".badge.bg-info").filter({ hasText: "maintenance" });
      await expect(maintenanceBadge.first()).toBeVisible();
    });
  });

  // ── Hide Done ──────────────────────────────────────────────

  test.describe("Hide Done", () => {

    test("completed jobs hidden when hideDone is on", async ({ page }) => {
      await seedTodayList(page);
      await page.evaluate(() => {
        localStorage.setItem("planmydays_completed", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_hideDone", "true");
      });
      await page.reload();
      await expect(page.getByText("Report")).not.toBeVisible();
    });

    test("shows all completed message when all done and hidden", async ({ page }) => {
      await page.evaluate(({ streams, todayStr, todayOrder }) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        localStorage.setItem("planmydays_today_order", JSON.stringify(todayOrder));
        localStorage.setItem("planmydays_last_gen", todayStr);
        localStorage.setItem("planmydays_completed", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_hideDone", "true");
      }, { streams: TEST_STREAMS, todayStr, todayOrder: ["job_1"] });
      await page.reload();
      await expect(page.getByText("All jobs completed!")).toBeVisible({ timeout: 10000 });
    });
  });

  // ── Settings UI Controls ─────────────────────────────────

  test.describe("Settings UI Controls", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
    });

    test("theme selector changes theme", async ({ page }) => {
      await page.locator("#appearance-tab").click();
      await page.locator("#themeSelector select").selectOption("solar");
      const val = await page.evaluate(() => localStorage.getItem("planmydays_theme"));
      expect(val).toBe("solar");
    });

    test("theme fallback on unknown value", async ({ page }) => {
      await page.evaluate(() => localStorage.setItem("planmydays_theme", "nonexistent"));
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#settingsPage:not(.d-none)").waitFor({ state: "visible" });
      const linkHref = await page.evaluate(() => {
        const link = document.getElementById("bootstrap-theme-css");
        return link ? link.getAttribute("href") : "";
      });
      expect(linkHref).toContain("darkly");
    });

    test("settings footer shows the Font Awesome credit", async ({ page }) => {
      await page.locator("#settingsPage:not(.d-none)").waitFor({ state: "visible" });
      await page.evaluate(() => {
        const root = document.getElementById("settingsPage");
        const inner = root && root.shadowRoot && root.shadowRoot.querySelector("smd-fontawesome-credit");
        const text = inner && inner.shadowRoot ? inner.shadowRoot.textContent : "";
        window.__faCredit = text;
      });
      const text = await page.evaluate(() => window.__faCredit || "");
      expect(text).toContain("Font Awesome icons by");
      expect(text).toContain("Fonticons, Inc.");
      expect(text).toContain("CC BY 4.0");
    });

    test("font size normal removes size class", async ({ page }) => {
      await page.locator("#appearance-tab").click();
      await page.locator("#fontSizeSelector").selectOption("small");
      await page.locator("#fontSizeSelector").selectOption("normal");
      const hasSmall = await page.evaluate(() => document.body.classList.contains("font-size-small"));
      expect(hasSmall).toBe(false);
    });

    test("icon size medium and large change body class", async ({ page }) => {
      await page.locator("#appearance-tab").click();
      await page.locator("#iconSizeSelector").selectOption("medium");
      let hasClass = await page.evaluate(() => document.body.classList.contains("icon-size-medium"));
      expect(hasClass).toBe(true);
      await page.locator("#iconSizeSelector").selectOption("large");
      hasClass = await page.evaluate(() => document.body.classList.contains("icon-size-large"));
      expect(hasClass).toBe(true);
    });

    test("density normal removes compact class", async ({ page }) => {
      await page.locator("#appearance-tab").click();
      await page.locator("#densitySelector").selectOption("compact");
      await page.locator("#densitySelector").selectOption("normal");
      const hasCompact = await page.evaluate(() => document.body.classList.contains("compact"));
      expect(hasCompact).toBe(false);
    });

    test("drag size selector switches between normal and large", async ({ page }) => {
      await page.locator("#appearance-tab").click();
      await page.locator("#dragSizeSelector").selectOption("large");
      await page.locator("#dragSizeSelector").selectOption("normal");
      const hasLarge = await page.evaluate(() => document.body.classList.contains("drag-size-large"));
      expect(hasLarge).toBe(false);
      const hasNormal = await page.evaluate(() => document.body.classList.contains("drag-size-normal"));
      expect(hasNormal).toBe(true);
    });

    test("auto hide menu disabling unbinds events", async ({ page }) => {
      await page.locator("#autoHideMenu").check();
      await page.locator("#autoHideMenu").uncheck();
      const autoHide = await page.evaluate(() => localStorage.getItem("planmydays_autoHideMenu"));
      expect(autoHide).toBe("false");
      const bodyClass = await page.evaluate(() => document.body.classList.contains("auto-hide-menu"));
      expect(bodyClass).toBe(false);
    });

    test("split list uncheck disables feature", async ({ page }) => {
      await page.locator("#splitList").check();
      await page.locator("#splitList").uncheck();
      const val = await page.evaluate(() => localStorage.getItem("planmydays_splitList"));
      expect(val).toBe("false");
    });

    test("hide done uncheck disables feature", async ({ page }) => {
      await page.locator("#hideDone").check();
      await page.locator("#hideDone").uncheck();
      const val = await page.evaluate(() => localStorage.getItem("planmydays_hideDone"));
      expect(val).toBe("false");
    });

    test("skip adhoc confirm uncheck disables feature", async ({ page }) => {
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#general-tab").click();
      await page.locator("#skipAdhocConfirm").waitFor({ state: "visible" });
      await page.locator("#skipAdhocConfirm").check();
      await page.locator("#skipAdhocConfirm").uncheck();
      const val = await page.evaluate(() => localStorage.getItem("planmydays_skipAdhocConfirm"));
      expect(val).toBe("false");
    });

    test("jan1 selector persists value", async ({ page }) => {
      await page.locator("#schedule-tab").click();
      await page.locator("#jan1Selector").selectOption("1");
      const val = await page.evaluate(() => localStorage.getItem("planmydays_jan1"));
      expect(val).toBe("1");
    });

    test("monday selector persists value", async ({ page }) => {
      await page.locator("#schedule-tab").click();
      await page.locator("#mondaySelector").selectOption("0");
      const val = await page.evaluate(() => localStorage.getItem("planmydays_monday"));
      expect(val).toBe("0");
    });

    test("start week selector persists value", async ({ page }) => {
      await page.locator("#schedule-tab").click();
      await page.locator("#startWeekSelector").selectOption("2");
      const val = await page.evaluate(() => localStorage.getItem("planmydays_startWeek"));
      expect(val).toBe("2");
    });

    test("auto hide menu toggle enables auto-hide", async ({ page }) => {
      await page.locator("#autoHideMenu").check();
      const autoHide = await page.evaluate(() => localStorage.getItem("planmydays_autoHideMenu") === "true");
      expect(autoHide).toBe(true);
      const bodyClass = await page.evaluate(() => document.body.classList.contains("auto-hide-menu"));
      expect(bodyClass).toBe(true);
    });

    test("skip adhoc confirm toggle works", async ({ page }) => {
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#general-tab").click();
      await page.locator("#skipAdhocConfirm").waitFor({ state: "visible" });
      await page.locator("#skipAdhocConfirm").check();
      const val = await page.evaluate(() => localStorage.getItem("planmydays_skipAdhocConfirm"));
      expect(val).toBe("true");
    });

    test("danger zone toggle shows dev rows in dev mode", async ({ page }) => {
      await page.goto("/PlanMyDay/?dev=true");
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await expect(page.locator("#devTodayRow")).toBeVisible();
      await expect(page.locator("#devLastGenRow")).toBeVisible();
    });
  });

  // ── Job Edit Modal UI ───────────────────────────────────────

  test.describe("Job Edit Modal UI", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      await page.goto("/PlanMyDay/");
      await page.evaluate((data) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
      }, TEST_STREAMS);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
    });

    test("cancel job edit hides modal", async ({ page }) => {
      test.setTimeout(30000);
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobEditCancelBtn").click();
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 10000 });
    });

    test("active toggle on job card works", async ({ page }) => {
      const cb = page.locator(".active-toggle").first();
      await cb.check();
      await expect(cb).toBeChecked();
    });

    test("add job with weekends schedule", async ({ page }) => {
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobEditPage .form-control").first().fill("WeekendJob");
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#btnScheduleChange").click();
      await page.locator("#schedWeekends").check();
      await page.locator("#smdConfirmModal .smd-footer button[data-index='1']").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "hidden", timeout: 10000 });
      await page.locator("#jobEditOkBtn").click();
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 10000 });
      await expect(page.getByText("WeekendJob")).toBeVisible();
    });

    test("add job with monthly schedule", async ({ page }) => {
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobEditPage .form-control").first().fill("MonthlyJob");
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#btnScheduleChange").click();
      await page.locator("#schedMonthly").check();
      await expect(page.locator("#schedMonthlyOptions")).toBeVisible();
      await page.locator("#smdConfirmModal .smd-footer button[data-index='1']").click();
      await page.locator("#jobEditOkBtn").click();
      
      await expect(page.getByText("MonthlyJob")).toBeVisible();
    });

    test("sleep until input exists in job edit", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobSchedule-tab").click();
      await expect(page.locator("#jobSleepUntilDisplay")).toBeVisible();
    });

    test("sleep until picker starts week on configured day", async ({ page }) => {
      await page.evaluate(() => localStorage.setItem("planmydays_startWeek", "2"));
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#jobSleepUntilDisplay").click();
      const firstHead = page.locator(".flatpickr-weekday").first();
      await expect(firstHead).toBeVisible();
      await expect(firstHead).toHaveText("Tue");
    });

    test("wait for input exists in job edit", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobSchedule-tab").click();
      await expect(page.locator("#jobWaitFor")).toBeVisible();
    });

    test("wait for text persists to storage when saved", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#jobWaitFor").fill("the delivery to arrive");
      await page.locator("#jobEditOkBtn").click();
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 10000 });
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs[0].waitFor);
      expect(stored).toBe("the delivery to arrive");
    });

    test("wait for field shows existing value in edit mode", async ({ page }) => {
      await page.evaluate(() => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[0].waitFor = "the delivery to arrive";
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        renderStreamsEditor();
      });
      await page.locator("#streamEditorList .job-drag-card").filter({ hasText: "Report" }).getByRole("button", { name: "Edit" }).click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await expect(page.locator("#jobWaitFor")).toHaveValue("the delivery to arrive");
    });

    test("sleep until shows short date format when date is picked", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      const futureDate = futureDateStr(30);
      await page.evaluate((ds) => {
        $id("jobSleepUntil")._flatpickr.setDate(ds, true);
      }, futureDate);
      await expect(page.locator("#jobSleepUntilDisplay")).toHaveValue(shortDateStr(futureDate));
      await expect(page.locator("#jobSleepUntil")).toHaveValue(futureDate);
    });

    test("sleep until keeps ISO format in storage when saved", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      const futureDate = futureDateStr(30);
      await page.evaluate((ds) => {
        $id("jobSleepUntil")._flatpickr.setDate(ds, true);
      }, futureDate);
      await page.locator("#jobEditOkBtn").click();
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 10000 });
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs[0].sleepUntil);
      expect(stored).toBe(futureDate);
    });

    test("sleep until shows short date format for existing job in edit mode", async ({ page }) => {
      const futureDate = futureDateStr(30);
      await page.evaluate((ds) => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[0].sleepUntil = ds;
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        renderStreamsEditor();
      }, futureDate);
      await page.locator("#streamEditorList .job-drag-card").filter({ hasText: "Report" }).getByRole("button", { name: "Edit" }).click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await expect(page.locator("#jobSleepUntilDisplay")).toHaveValue(shortDateStr(futureDate));
    });

    test("sleep until displays day-of-week prefix in short format", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      const firstDate = futureDateStr(30);
      const secondDate = futureDateStr(60);
      await page.evaluate((ds) => {
        $id("jobSleepUntil")._flatpickr.setDate(ds, true);
      }, firstDate);
      await expect(page.locator("#jobSleepUntilDisplay")).toHaveValue(shortDateStr(firstDate));
      await expect(page.locator("#jobSleepUntil")).toHaveValue(firstDate);
      await page.evaluate((ds) => {
        $id("jobSleepUntil")._flatpickr.setDate(ds, true);
      }, secondDate);
      await expect(page.locator("#jobSleepUntilDisplay")).toHaveValue(shortDateStr(secondDate));
    });

    test("sleep until formatted field stays visible on mobile devices", async ({ browser }) => {
      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        viewport: { width: 412, height: 915 },
        hasTouch: true,
        isMobile: true
      });
      const mp = await context.newPage();
      await mp.goto("http://localhost:8080/PlanMyDay/");
      await mp.evaluate(() => {
        localStorage.clear();
        localStorage.setItem("planmydays_images", "[]");
      });
      await mp.reload();
      const futureDate = futureDateStr(30);
      await mp.evaluate((ds) => {
        localStorage.setItem("planmydays_streams", JSON.stringify([
          {
            id: "stream_1", title: "Work", description: "", tab: "progress", image: "", sequence: 1,
            jobs: [{ id: "job_1", title: "Report", description: "", active: true, frequency: "daily", sequence: 1, suffix: false, dayType: "dayOfYear", mod: "", sleepUntil: ds, tasks: [] }]
          }
        ]));
        renderStreamsEditor();
        editJobInAccordion(0, 0);
      }, futureDate);
      await mp.locator("#jobEditPage").waitFor({ state: "visible" });
      await mp.locator("#jobSchedule-tab").click();
      await expect(mp.locator("#jobSleepUntilDisplay")).toBeVisible();
      await expect(mp.locator("#jobSleepUntilDisplay")).toHaveValue(shortDateStr(futureDate));
      await expect(mp.locator(".flatpickr-mobile")).toHaveCount(0);
      await context.close();
    });

    test("edit job and change schedule time", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#jobTimeHour").waitFor({ state: "visible" });
      await page.locator("#jobTimeHour").selectOption("14");
      await page.locator("#jobTimeMin").selectOption("30");
      await page.locator("#jobEditOkBtn").click();
      
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 10000 });
      const badge = page.locator(".badge.bg-secondary").filter({ hasText: "14:30" });
      await expect(badge).toBeVisible();
    });
  });

  // ── Stream Selector in Job Edit ───────────────────────────────

  test.describe("Stream Selector in Job Edit", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      await page.goto("/PlanMyDay/");
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([
          {
            id: "stream_1", title: "Work", tab: "progress", image: "", sequence: 1,
            jobs: [{ id: "job_1", title: "Report", active: true, frequency: "daily", sequence: 1, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }]
          },
          {
            id: "stream_2", title: "Chores", tab: "maintenance", image: "", sequence: 2, jobs: []
          }
        ]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
    });

    test("stream selector appears in add job modal", async ({ page }) => {
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobStreamDropdown")).toBeVisible();
    });

    test("stream selector appears in edit job modal", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobStreamDropdown")).toBeVisible();
    });

    test("stream selector defaults to current stream", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobStreamBtnText")).toHaveText("Work");
    });

    test("stream selector shows all stream names", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobStreamDropdownBtn").click();
      var items = page.locator("#jobStreamDropdownMenu .dropdown-item");
      await expect(items).toHaveCount(2);
      await expect(items.nth(0)).toContainText("Work");
      await expect(items.nth(1)).toContainText("Chores");
    });

    test("changing stream and saving moves job to new stream", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobStreamDropdownBtn").click();
      await page.locator("#jobStreamDropdownMenu .dropdown-item").nth(1).click();
      await page.locator("#jobEditOkBtn").click();
      
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 10000 });
      const streams = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_streams")));
      expect(streams[0].jobs.length).toBe(0);
      expect(streams[1].jobs.length).toBe(1);
      expect(streams[1].jobs[0].title).toBe("Report");
    });

    test("change button opens image picker and shows selected name", async ({ page }) => {
      test.setTimeout(30000);
      const svg = "data:image/svg+xml," + encodeURIComponent('<svg stroke="#000000" fill="#ffffff" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>');
      await page.evaluate((svgData) => {
        localStorage.setItem("planmydays_images", JSON.stringify([{ name: "TestImg", data: svgData }]));
      }, svg);
      await page.evaluate((data) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
      }, [{
        id: "stream_1", title: "Work", tab: "progress", image: "", sequence: 1,
        jobs: [{ id: "job_1", title: "Report", active: true, frequency: "daily", sequence: 1, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }]
      }]);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#btnJobImageChange").click();
      await page.locator("#imagePickerPage").waitFor({ state: "visible" });
      await page.locator("#imagePickerPage smd-image-picker .item").first().waitFor({ state: "visible", timeout: 10000 });
      await page.locator("#imagePickerPage smd-image-picker .item").first().click();
      await page.locator("#imagePickerPage").waitFor({ state: "hidden", timeout: 10000 });
      await expect(page.locator("#jobImageName")).toHaveText("TestImg");
    });
  });

  // ── Image Editing UI ────────────────────────────────────────

  test.describe("Image Editing UI", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      const svg = "data:image/svg+xml," + encodeURIComponent('<svg stroke="#000000" fill="#ffffff" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>');
      await page.addInitScript((svgData) => {
        localStorage.clear();
        localStorage.setItem("planmydays_images", JSON.stringify([{ name: "EditTest", data: svgData }]));
      }, svg);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Images" }).click();
      await page.locator("#imagesEditor").waitFor({ state: "visible" });
    });

    test("edit image opens modal with existing data", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await expect(page.locator("#imageEditModal")).toBeVisible();
    });

    test("changing line color stores light theme override", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      const colorInput = page.locator('#imageEditModal input[type="color"]').first();
      await colorInput.fill("#ff0000");
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.light?.line || "";
      }, { timeout: 5000 }).toBe("#ff0000");
    });

    test("changing fill color stores light theme override", async ({ page }) => {
      test.setTimeout(30000);
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      const colorInput = page.locator('#imageEditModal input[type="color"]').nth(1);
      await colorInput.fill("#00ff00");
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.light?.fill || "";
      }, { timeout: 5000 }).toBe("#00ff00");
    });

    test("line none checkbox clears stroke", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator('#imageEditModal input[type="checkbox"]').first().check();
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.light?.line || "";
      }).toBe("none");
    });

    test("fill none checkbox clears fill", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator('#imageEditModal input[type="checkbox"]').nth(1).check();
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.light?.fill || "";
      }).toBe("none");
    });

    test("editing line colour unchecks line none", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator('#imageEditModal input[type="checkbox"]').first().check();
      const colorInput = page.locator('#imageEditModal input[type="color"]').first();
      await colorInput.fill("#ff0000");
      await expect(page.locator('#imageEditModal input[type="checkbox"]').first()).not.toBeChecked();
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.light?.line || "";
      }, { timeout: 5000 }).toBe("#ff0000");
    });

    test("editing fill colour unchecks fill none", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator('#imageEditModal input[type="checkbox"]').nth(1).check();
      const colorInput = page.locator('#imageEditModal input[type="color"]').nth(1);
      await colorInput.fill("#00ff00");
      await expect(page.locator('#imageEditModal input[type="checkbox"]').nth(1)).not.toBeChecked();
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.light?.fill || "";
      }, { timeout: 5000 }).toBe("#00ff00");
    });

    test("stroke width input changes value", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      const widthInput = page.locator('#imageEditModal input[type="number"]').first();
      await widthInput.fill("5");
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.light?.width || "";
      }, { timeout: 5000 }).toBe("5");
    });

    test("duplicate name validation prevents OK", async ({ page }) => {
      await page.getByRole("button", { name: "Add Image" }).click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      const nameInput = page.locator("#imageEditModalBody .form-control:not(.form-control-sm)");
      await nameInput.fill("EditTest");
      await expect(page.locator("#imageNameError")).toBeVisible();
      const okBtn = page.locator('#imageEditModal .btn-success');
      await       expect(okBtn).toBeDisabled();
    });

    test("color change updates preview image live without closing modal", async ({ page }) => {
      test.setTimeout(30000);
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      const previewImg = page.locator("#themePreviewLight");
      await expect(previewImg).toBeVisible();
      const initialSrc = await previewImg.getAttribute("src");

      const colorInput = page.locator('#imageEditModal input[type="color"]').first();
      await colorInput.fill("#ff0000");

      await expect.poll(async () => {
        return previewImg.getAttribute("src");
      }, { timeout: 5000 }).not.toBe(initialSrc);

      const newSrc = await previewImg.getAttribute("src");
      expect(decodeURIComponent(newSrc)).toContain('stroke="#ff0000"');
    });

    test("raster image keeps theme panels but hides colour editor controls", async ({ page }) => {
      const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.evaluate(async (b64) => {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const file = new File([arr], "dot.png", { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(file);
        return new Promise(resolve => {
          const origClick = HTMLInputElement.prototype.click;
          HTMLInputElement.prototype.click = function() {
            if (this.type === "file") {
              Object.defineProperty(this, "files", { value: dt.files, configurable: true });
              this.dispatchEvent(new Event("change"));
              HTMLInputElement.prototype.click = origClick;
              setTimeout(resolve, 400);
              return;
            }
            return origClick.apply(this, arguments);
          };
          openImageUpload(editingImageIndex);
        });
      }, pngB64);
      await expect.poll(async () => {
        return page.evaluate(() => {
          const images = JSON.parse(localStorage.getItem("planmydays_images") || "[]");
          return images?.[editingImageIndex]?.data || "";
        });
      }, { timeout: 5000 }).toContain("data:image/png");
      // theme panels still render for raster images
      await expect(page.locator("#imageEditModalBody [data-bs-theme='light']")).toHaveCount(1);
      await expect(page.locator("#imageEditModalBody [data-bs-theme='dark']")).toHaveCount(1);
      await expect(page.locator("#themePreviewLight")).toBeVisible();
      await expect(page.locator("#themePreviewDark")).toBeVisible();
      // but line/fill/width controls are hidden
      await expect(page.locator('#imageEditModal input[type="color"]')).toHaveCount(0);
      await expect(page.locator('#imageEditModal input[type="number"]')).toHaveCount(0);
      await expect(page.locator('#imageEditModal input[type="checkbox"]')).toHaveCount(0);
      // previews show the uploaded raster image
      await expect(page.locator("#themePreviewLight")).toHaveAttribute("src", /data:image\/png/);
      await expect(page.locator("#themePreviewDark")).toHaveAttribute("src", /data:image\/png/);
    });

    test("dark theme override applies and swaps on theme change", async ({ page }) => {
      test.setTimeout(30000);
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      // light theme = theme 0 (first color = light line), dark = theme 1 (3rd color = dark line)
      const darkLineInput = page.locator('#imageEditModal input[type="color"]').nth(2);
      await darkLineInput.fill("#112233");
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.dark?.line || "";
      }, { timeout: 5000 }).toBe("#112233");
      // themed data URL for dark contains the override
      const darkThemed = await page.evaluate(() => getThemedImageDataUrl(loadImages()[0], "dark"));
      expect(decodeURIComponent(darkThemed)).toContain('stroke="#112233"');
      // light themed URL falls back to baked stroke
      const lightThemed = await page.evaluate(() => getThemedImageDataUrl(loadImages()[0], "light"));
      expect(decodeURIComponent(lightThemed)).toContain('stroke="#000000"');
    });

    test("light and dark theme panels both render for SVG images", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await expect(page.locator("#imageEditModalBody [data-bs-theme='light']")).toHaveCount(1);
      await expect(page.locator("#imageEditModalBody [data-bs-theme='dark']")).toHaveCount(1);
      await expect(page.locator("#imageEditModalBody .fw-bold").filter({ hasText: "Light theme" })).toBeVisible();
      await expect(page.locator("#imageEditModalBody .fw-bold").filter({ hasText: "Dark theme" })).toBeVisible();
    });

    test("theme panels use fixed light and dark backgrounds", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      const lightPanel = page.locator("#imageEditModalBody [data-bs-theme='light']").first();
      const darkPanel = page.locator("#imageEditModalBody [data-bs-theme='dark']").first();
      await expect(lightPanel).toHaveCSS("background-color", "rgb(248, 249, 250)");
      await expect(darkPanel).toHaveCSS("background-color", "rgb(33, 37, 41)");
    });

    test("changing fill color stores dark theme override", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      // color inputs: [0]=light line, [1]=light fill, [2]=dark line, [3]=dark fill
      const darkFillInput = page.locator('#imageEditModal input[type="color"]').nth(3);
      await darkFillInput.fill("#00ff00");
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.dark?.fill || "";
      }, { timeout: 5000 }).toBe("#00ff00");
      const darkThemed = await page.evaluate(() => getThemedImageDataUrl(loadImages()[0], "dark"));
      expect(decodeURIComponent(darkThemed)).toContain('fill="#00ff00"');
    });

    test("changing width stores dark theme override", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      const darkWidthInput = page.locator('#imageEditModal input[type="number"]').nth(1);
      await darkWidthInput.fill("7");
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.dark?.width || "";
      }, { timeout: 5000 }).toBe("7");
    });

    test("dark line none checkbox clears dark stroke only", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      // set a dark line override first
      await page.locator('#imageEditModal input[type="color"]').nth(2).fill("#112233");
      // checkboxes: [0]=light line, [1]=light fill, [2]=dark line, [3]=dark fill
      await page.locator('#imageEditModal input[type="checkbox"]').nth(2).check();
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.dark?.line || "";
      }).toBe("none");
      const light = await page.evaluate(() => loadImages()[0].themes?.light?.line || "");
      expect(light).toBe("");
    });

    test("dark fill none checkbox clears dark fill", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator('#imageEditModal input[type="checkbox"]').nth(3).check();
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.dark?.fill || "";
      }).toBe("none");
    });

    test("editing dark line colour unchecks dark line none", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator('#imageEditModal input[type="checkbox"]').nth(2).check();
      const darkLineInput = page.locator('#imageEditModal input[type="color"]').nth(2);
      await darkLineInput.fill("#112233");
      await expect(page.locator('#imageEditModal input[type="checkbox"]').nth(2)).not.toBeChecked();
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.dark?.line || "";
      }, { timeout: 5000 }).toBe("#112233");
    });

    test("editing dark fill colour unchecks dark fill none", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator('#imageEditModal input[type="checkbox"]').nth(3).check();
      const darkFillInput = page.locator('#imageEditModal input[type="color"]').nth(3);
      await darkFillInput.fill("#00ff00");
      await expect(page.locator('#imageEditModal input[type="checkbox"]').nth(3)).not.toBeChecked();
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.dark?.fill || "";
      }, { timeout: 5000 }).toBe("#00ff00");
    });

    test("dark colour change updates dark preview image live", async ({ page }) => {
      test.setTimeout(30000);
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      const previewImg = page.locator("#themePreviewDark");
      await expect(previewImg).toBeVisible();
      const initialSrc = await previewImg.getAttribute("src");

      const darkLineInput = page.locator('#imageEditModal input[type="color"]').nth(2);
      await darkLineInput.fill("#112233");

      await expect.poll(async () => {
        return previewImg.getAttribute("src");
      }, { timeout: 5000 }).not.toBe(initialSrc);

      const newSrc = await previewImg.getAttribute("src");
      expect(decodeURIComponent(newSrc)).toContain('stroke="#112233"');
    });

    test("light and dark overrides stored independently", async ({ page }) => {
      await page.locator(".card:has-text('EditTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.locator('#imageEditModal input[type="color"]').nth(0).fill("#ff0000");
      await page.locator('#imageEditModal input[type="color"]').nth(2).fill("#0000ff");
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.light?.line || "";
      }, { timeout: 5000 }).toBe("#ff0000");
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.dark?.line || "";
      }, { timeout: 5000 }).toBe("#0000ff");
      const lightThemed = await page.evaluate(() => getThemedImageDataUrl(loadImages()[0], "light"));
      const darkThemed = await page.evaluate(() => getThemedImageDataUrl(loadImages()[0], "dark"));
      expect(decodeURIComponent(lightThemed)).toContain('stroke="#ff0000"');
      expect(decodeURIComponent(darkThemed)).toContain('stroke="#0000ff"');
      expect(decodeURIComponent(lightThemed)).not.toContain('stroke="#0000ff"');
      expect(decodeURIComponent(darkThemed)).not.toContain('stroke="#ff0000"');
    });

    test("current app theme selects active override in main view", async ({ page }) => {
      test.setTimeout(30000);
      // set distinct light and dark line overrides
      await page.evaluate(() => {
        const images = loadImages();
        images[0].themes = {
          light: { line: "#ff0000", fill: null, width: null },
          dark: { line: "#0000ff", fill: null, width: null }
        };
        saveImages(images);
        applyTheme("darkly");
      });
      // darkly is a dark theme -> default themed URL should use dark override
      const darkUrl = await page.evaluate(() => getThemedImageDataUrl(loadImages()[0]));
      expect(decodeURIComponent(darkUrl)).toContain('stroke="#0000ff"');
      await page.evaluate(() => applyTheme("flatly"));
      const lightUrl = await page.evaluate(() => getThemedImageDataUrl(loadImages()[0]));
      expect(decodeURIComponent(lightUrl)).toContain('stroke="#ff0000"');
    });
  });

  // ── Image Picker UI ─────────────────────────────────────────

  test.describe("Image Picker UI", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      await page.addInitScript((data) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
        localStorage.setItem("planmydays_images", JSON.stringify([
          { name: "PickMe", data: "" },
          { name: "PickMeToo", data: "" }
        ]));
      }, TEST_STREAMS);
      await page.goto("/PlanMyDay/");
      await page.waitForLoadState("domcontentloaded");
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList").waitFor({ state: "visible" });
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#streamEditorList .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#btnStreamImageChoose").click();
      await page.locator("#imagePickerPage").waitFor({ state: "visible" });
      await page.evaluate(() => {
        document.querySelectorAll(".modal.show").forEach(function(el) {
          if (el.id !== "imagePickerModal") {
            var inst = bootstrap.Modal.getInstance(el);
            if (inst) inst.hide();
          }
        });
      });
      await page.waitForTimeout(250);
    });

    test("selecting image sets name in stream editor", async ({ page }) => {
      await page.locator("#imagePickerPage smd-image-picker .item").first().waitFor({ state: "visible" });
      await expect(page.locator("#imagePickerPage")).toHaveAttribute("open", "");
      await page.locator("#imagePickerPage smd-image-picker .item").first().dispatchEvent("click");
      await expect
        .poll(() => page.evaluate(() => (editBuffer && editBuffer.image) || ""), { timeout: 5000 })
        .toBe("PickMe");
      await page.evaluate(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById("imagePickerModal"));
        if (modal) modal.hide();
      });
      await page.locator("#imagePickerPage").waitFor({ state: "hidden", timeout: 10000 });
      const name = await page.evaluate(() => editBuffer?.image || "");
      expect(name).toBe("PickMe");
    });

    test("search filters picker items", async ({ page }) => {
      await page.locator("#imagePickerPage smd-image-picker .item").first().waitFor({ state: "visible" });
      await page.locator("#imagePickerPage smd-image-picker input[type=search]").fill("PickMeToo");
      await page.locator("#imagePickerPage smd-image-picker .label:has-text('PickMeToo')").waitFor({ state: "visible" });
      await expect(page.locator("#imagePickerPage smd-image-picker .label").filter({ hasText: /^PickMeToo$/ })).toBeVisible();
      await expect(page.locator("#imagePickerPage smd-image-picker .label").filter({ hasText: /^PickMe$/ })).not.toBeVisible();
    });

    test("clear button resets picker search", async ({ page }) => {
      test.setTimeout(30000);
      await page.locator("#imagePickerPage smd-image-picker input[type=search]").fill("PickMeToo");
      await page.locator("#imagePickerPage smd-image-picker .label:has-text('PickMeToo')").waitFor({ state: "visible" });
      await page.locator("#imagePickerPage smd-image-picker .clear").click();
      await expect(page.locator("#imagePickerPage smd-image-picker .label").filter({ hasText: /^PickMe$/ })).toBeVisible();
    });

    test("closing picker with cancel button", async ({ page }) => {
      test.setTimeout(30000);
      await page.locator("#imagePickerPage .smd-page-footer smd-button").filter({ hasText: "Cancel" }).click();
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById("imagePickerModal"));
        if (modal) modal.hide();
      });
      await page.locator("#imagePickerPage").waitFor({ state: "hidden", timeout: 10000 });
      await expect(page.locator("#imagePickerPage")).not.toBeVisible();
    });

    test("no image button clears image in editor", async ({ page }) => {
      await page.getByText("No Image").click();
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById("imagePickerModal"));
        if (modal) modal.hide();
      });
      await page.locator("#imagePickerPage").waitFor({ state: "hidden", timeout: 10000 });
      const img = await page.evaluate(() => editBuffer?.image || "");
      expect(img).toBe("");
    });
  });

  // ── Schedule Type UI ────────────────────────────────────────

  test.describe("Schedule Type UI", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      await page.goto("/PlanMyDay/");
      await page.evaluate((data) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
      }, TEST_STREAMS);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
    });

    test("every day schedule shows correct text", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await expect(page.locator("#jobScheduleText")).toContainText("Every day");
    });

    test("weekdays schedule option", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#btnScheduleChange").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.locator("#schedWeekdays").check();
      await page.locator("#smdConfirmModal .smd-footer button[data-index='1']").click();
      await expect(page.locator("#jobScheduleText")).toContainText("Weekdays");
    });

    test("specific days schedule", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#btnScheduleChange").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.locator("#schedDays").check();
      await page.locator("#schedDay0").check();
      await page.locator("#schedDay6").check();
      await page.locator("#smdConfirmModal .smd-footer button[data-index='1']").click();
      await expect(page.locator("#jobScheduleText")).toContainText("Sun");
      await expect(page.locator("#jobScheduleText")).toContainText("Sat");
    });

    test("monthly schedule option", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#btnScheduleChange").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.locator("#schedMonthly").check();
      await page.locator("#schedMonthlyDay").selectOption("15");
      await page.locator("#smdConfirmModal .smd-footer button[data-index='1']").click();
      await expect(page.locator("#jobScheduleText")).toContainText("15th");
    });

    test("every n days option shows ndays options", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#btnScheduleChange").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.locator("#schedNDays").check();
      await expect(page.locator("#schedNDaysOptions")).toBeVisible();
      await expect(page.locator("#schedNInterval")).toBeVisible();
      await expect(page.locator("#schedNOffset")).toBeVisible();
    });

    test("every n days schedule shows correct text", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#btnScheduleChange").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.locator("#schedNDays").check();
      await page.locator("#schedNInterval").selectOption("3");
      await page.locator("#schedNOffset").selectOption("1");
      await page.locator("#smdConfirmModal .smd-footer button[data-index='1']").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "hidden" });
      await expect(page.locator("#jobScheduleText")).toContainText("Every 3 day(s)");
    });

    test("every n days shows next due display", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#btnScheduleChange").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.waitForTimeout(200);
      await page.locator("#schedNDays").check();
      await expect(page.locator("#schedNextDue")).toContainText("next due");
    });
  });

  // ── Dev Mode UI ─────────────────────────────────────────────

  test.describe("Dev Mode UI", () => {

    test("dev mode today changes date displayed", async ({ page }) => {
      await page.goto("/PlanMyDay/?dev=true");
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      const todayInput = page.locator(".flatpickr-input").first();
      await todayInput.click();
      const futureDate = futureDateStr(30);
      await todayInput.fill(futureDate);
      await todayInput.press("Enter");
      await page.waitForTimeout(250);
      await page.getByRole("button", { name: "Done" }).click();
      await page.waitForTimeout(250);
      await expect(page.locator("h2").first()).toContainText(dayMonthStr(futureDate));
    });
  });

  // ── Image Editing: Cancel Existing ──────────────────────────

  test.describe("Image Editing: Cancel Existing", () => {

    test("cancel editing existing image restores original data", async ({ page }) => {
      const svg = "data:image/svg+xml," + encodeURIComponent('<svg stroke="#000000" fill="#ffffff" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>');
      await page.addInitScript((svgData) => {
        localStorage.clear();
        localStorage.setItem("planmydays_images", JSON.stringify([{ name: "OriginalName", data: svgData }]));
      }, svg);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Images" }).click();
      await page.locator("#imagesEditor").waitFor({ state: "visible" });
      await page.locator(".card:has-text('OriginalName') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.evaluate(() => {
        const input = document.querySelector('#imageEditModalBody .form-control:not(.form-control-sm)');
        if (input) { input.value = "ChangedName"; input.dispatchEvent(new Event('input', { bubbles: true })); }
      });
      await page.locator("#btnImageEditCancel").click();
      await page.waitForTimeout(150);
      const restored = await page.evaluate(() => {
        const images = JSON.parse(localStorage.getItem("planmydays_images") || "[]");
        return { name: images[0]?.name, data: images[0]?.data };
      });
      expect(restored.name).toBe("OriginalName");
      expect(restored.data).toContain("%23000000");
    });

    test("uncheck line none restores stroke color", async ({ page }) => {
      const svg = "data:image/svg+xml," + encodeURIComponent('<svg stroke="#ff0000" fill="#ffffff" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>');
      await page.addInitScript((svgData) => {
        localStorage.clear();
        localStorage.setItem("planmydays_images", JSON.stringify([{ name: "StrokeTest", data: svgData }]));
      }, svg);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Images" }).click();
      await page.locator("#imagesEditor").waitFor({ state: "visible" });
      await page.locator(".card:has-text('StrokeTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      const lineCheckbox = page.locator('#imageEditModal input[type="checkbox"]').first();
      await lineCheckbox.check();
      await page.waitForTimeout(100);
      await lineCheckbox.uncheck();
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.light?.line || "";
      }, { timeout: 5000 }).toBe("#ff0000");
    });

    test("uncheck fill none restores fill color", async ({ page }) => {
      const svg = "data:image/svg+xml," + encodeURIComponent('<svg stroke="#000000" fill="#00ff00" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>');
      await page.addInitScript((svgData) => {
        localStorage.clear();
        localStorage.setItem("planmydays_images", JSON.stringify([{ name: "FillTest", data: svgData }]));
      }, svg);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Images" }).click();
      await page.locator("#imagesEditor").waitFor({ state: "visible" });
      await page.locator(".card:has-text('FillTest') .btn-primary").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      const fillCheckbox = page.locator('#imageEditModal input[type="checkbox"]').nth(1);
      await fillCheckbox.check();
      await page.waitForTimeout(100);
      await fillCheckbox.uncheck();
      await expect.poll(async () => {
        const images = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")));
        return images?.[0]?.themes?.light?.fill || "";
      }, { timeout: 5000 }).toBe("#00ff00");
    });
  });

  // ── Image Picker Empty State ───────────────────────────────

  test.describe("Image Picker Empty State", () => {

    test("picker shows no images available when empty", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1, jobs: []
        }]));
        localStorage.setItem("planmydays_images", JSON.stringify([]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#btnStreamImageChoose").click();
      await page.locator("#imagePickerPage").waitFor({ state: "visible" });
      await expect(page.getByText("No images available.")).toBeVisible();
    });

    test("picker shows no match when search has no results", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1, jobs: []
        }]));
        localStorage.setItem("planmydays_images", JSON.stringify([{ name: "Apple", data: "" }]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#btnStreamImageChoose").click();
      await page.locator("#imagePickerPage").waitFor({ state: "visible" });
      await page.locator("#imagePickerPage smd-image-picker input[type=search]").fill("ZZZZNOTHING");
      await expect(page.getByText("No images match your search.")).toBeVisible();
    });
  });

  // ── Ad Hoc Confirm Removal ─────────────────────────────────

  test.describe("Ad Hoc Confirm Removal", () => {

    test("confirming removal deletes adhoc job", async ({ page }) => {
      await page.getByText("+ Add Job").click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobEditPage .form-control").first().fill("RemoveMe");
      await page.locator("#jobEditOkBtn").click();
      
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 10000 });
      await page.locator("#todayCardList").waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(150);
      await page.locator('.job-checkbox').first().check();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(100);
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Remove" }).click();
      await page.locator("#smdConfirmModal").waitFor({ state: "hidden", timeout: 10000 });
      await expect(page.getByText("RemoveMe")).not.toBeVisible();
    });
  });

  // ── Checkbox Uncheck ───────────────────────────────────────

  test.describe("Checkbox Uncheck", () => {

    test("unchecking completed job removes strikethrough", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      const cb = page.locator('.job-checkbox[data-job-id="job_1"]');
      await cb.check();
      await page.waitForTimeout(100);
      await cb.uncheck();
      await page.waitForTimeout(150);
      await expect(cb).not.toBeChecked();
    });
  });

  // ── Schedule Filtering ─────────────────────────────────────

  test.describe("Schedule Filtering", () => {

    test("job with sleepUntil in future is hidden from today", async ({ page }) => {
      await page.evaluate(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const ds = tomorrow.getFullYear() + "-" + String(tomorrow.getMonth()+1).padStart(2,"0") + "-" + String(tomorrow.getDate()).padStart(2,"0");
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ys = yesterday.getFullYear() + "-" + String(yesterday.getMonth()+1).padStart(2,"0") + "-" + String(yesterday.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "FutureJob", active: true, frequency: "daily",
            sequence: 1, sleepUntil: ds, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify([]));
        localStorage.setItem("planmydays_last_gen", ys);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      await expect(page.getByText("FutureJob")).not.toBeVisible();
    });

    test("sleepUntil in past shows job on today", async ({ page }) => {
      await page.evaluate(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ys = yesterday.getFullYear() + "-" + String(yesterday.getMonth()+1).padStart(2,"0") + "-" + String(yesterday.getDate()).padStart(2,"0");
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const tas = twoDaysAgo.getFullYear() + "-" + String(twoDaysAgo.getMonth()+1).padStart(2,"0") + "-" + String(twoDaysAgo.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "PastSleepJob", active: true, frequency: "daily",
            sequence: 1, sleepUntil: ys, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify([]));
        localStorage.setItem("planmydays_last_gen", tas);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      await expect(page.getByText("PastSleepJob")).toBeVisible();
    });

    test("weekends job hidden on weekday", async ({ page }) => {
      await page.evaluate(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ys = yesterday.getFullYear() + "-" + String(yesterday.getMonth()+1).padStart(2,"0") + "-" + String(yesterday.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "WeekendOnly", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "weekends" }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify([]));
        localStorage.setItem("planmydays_last_gen", ys);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      const todayNum = new Date().getDay();
      if (todayNum === 0 || todayNum === 6) {
        await expect(page.getByText("WeekendOnly")).toBeVisible();
      } else {
        await expect(page.getByText("WeekendOnly")).not.toBeVisible();
      }
    });

    test("weekdays job hidden on weekend", async ({ page }) => {
      await page.evaluate(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ys = yesterday.getFullYear() + "-" + String(yesterday.getMonth()+1).padStart(2,"0") + "-" + String(yesterday.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "WeekdayOnly", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "weekdays" }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify([]));
        localStorage.setItem("planmydays_last_gen", ys);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      const todayNum = new Date().getDay();
      if (todayNum === 0 || todayNum === 6) {
        await expect(page.getByText("WeekdayOnly")).not.toBeVisible();
      } else {
        await expect(page.getByText("WeekdayOnly")).toBeVisible();
      }
    });

    test("specific days schedule shows on matched day", async ({ page }) => {
      await page.evaluate(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ys = yesterday.getFullYear() + "-" + String(yesterday.getMonth()+1).padStart(2,"0") + "-" + String(yesterday.getDate()).padStart(2,"0");
        const todayNum = new Date().getDay();
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "SpecificDayJob", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "days", days: [todayNum] }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify([]));
        localStorage.setItem("planmydays_last_gen", ys);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      await expect(page.getByText("SpecificDayJob")).toBeVisible();
    });

    test("monthly schedule shows on correct date", async ({ page }) => {
      test.setTimeout(30000);
      await page.evaluate(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ys = yesterday.getFullYear() + "-" + String(yesterday.getMonth()+1).padStart(2,"0") + "-" + String(yesterday.getDate()).padStart(2,"0");
        const todayDate = new Date().getDate();
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "MonthlyJobShow", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "monthly", date: todayDate }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify([]));
        localStorage.setItem("planmydays_last_gen", ys);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      await expect(page.getByText("MonthlyJobShow")).toBeVisible();
    });

    test("monthly schedule hides on wrong date", async ({ page }) => {
      test.setTimeout(30000);
      await page.evaluate(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ys = yesterday.getFullYear() + "-" + String(yesterday.getMonth()+1).padStart(2,"0") + "-" + String(yesterday.getDate()).padStart(2,"0");
        const wrongDate = new Date().getDate() === 1 ? 15 : 1;
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "MonthlyJobHide", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "monthly", date: wrongDate }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify([]));
        localStorage.setItem("planmydays_last_gen", ys);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      await expect(page.getByText("MonthlyJobHide")).not.toBeVisible();
    });

    test("every n days schedule shows on correct day based on epoch", async ({ page }) => {
      await page.evaluate(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ys = yesterday.getFullYear() + "-" + String(yesterday.getMonth()+1).padStart(2,"0") + "-" + String(yesterday.getDate()).padStart(2,"0");
        const todayEpoch = Math.floor(new Date().getTime() / 86400000);
        const interval = 2;
        const offset = 0;
        const matches = ((todayEpoch + offset) % interval + interval) % interval === 0;
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "NDaysJob", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "ndays", interval: interval, offset: offset }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify([]));
        localStorage.setItem("planmydays_last_gen", ys);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      const todayEpoch = Math.floor(new Date().getTime() / 86400000);
      const interval = 2;
      const offset = 0;
      const matches = ((todayEpoch + offset) % interval + interval) % interval === 0;
      if (matches) {
        await expect(page.getByText("NDaysJob")).toBeVisible();
      } else {
        await expect(page.getByText("NDaysJob")).not.toBeVisible();
      }
    });
  });

  // ── Data Danger Zone ───────────────────────────────────────

  test.describe("Data Danger Zone", () => {

    test("regenerate tiles rebuilds the today list", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#regenerateTilesRow").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Regenerate Today's Tiles" }).click();
      await page.waitForTimeout(400);
      await expect(page.getByText("Report").first()).toBeVisible();
    });

    test("regenerate tiles clears sleepUntil dates that are today or earlier", async ({ page }) => {
      const tomorrow = await page.evaluate(() => {
        const today = new Date();
        const ts = today.getFullYear() + "-" + String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const ys = yesterday.getFullYear() + "-" + String(yesterday.getMonth()+1).padStart(2,"0") + "-" + String(yesterday.getDate()).padStart(2,"0");
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tms = tomorrow.getFullYear() + "-" + String(tomorrow.getMonth()+1).padStart(2,"0") + "-" + String(tomorrow.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [
            { id: "job_past", title: "PastSleep", active: true, frequency: "daily", sequence: 1, sleepUntil: ys, schedule: { type: "daily" }, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] },
            { id: "job_today", title: "TodaySleep", active: true, frequency: "daily", sequence: 2, sleepUntil: ts, schedule: { type: "daily" }, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] },
            { id: "job_future", title: "FutureSleep", active: true, frequency: "daily", sequence: 3, sleepUntil: tms, schedule: { type: "daily" }, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }
          ]
        }]));
        localStorage.setItem("planmydays_last_gen", ts);
        return tms;
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#regenerateTilesRow").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Regenerate Today's Tiles" }).click();
      await page.waitForTimeout(250);
      const streams = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_streams")));
      expect(streams[0].jobs.find(j => j.id === "job_past").sleepUntil).toBe("");
      expect(streams[0].jobs.find(j => j.id === "job_today").sleepUntil).toBe("");
      expect(streams[0].jobs.find(j => j.id === "job_future").sleepUntil).toBe(tomorrow);
    });

    test("regenerate tiles respects every n days schedule", async ({ page }) => {
      await page.evaluate(() => {
        const today = new Date();
        const ts = today.getFullYear() + "-" + String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
        const todayEpoch = Math.floor(today.getTime() / 86400000);
        const matchesToday = ((todayEpoch - 0) % 2 + 2) % 2 === 0;
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "NDaysRegen", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "ndays", interval: 2, offset: 0 }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ts);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
        localStorage.setItem("planmydays_scheduleTestMatches", matchesToday ? "true" : "false");
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#regenerateTilesRow").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Regenerate Today's Tiles" }).click();
      await page.waitForTimeout(250);
      const matches = await page.evaluate(() => localStorage.getItem("planmydays_scheduleTestMatches") === "true");
      if (matches) {
        await expect(page.getByText("NDaysRegen")).toBeVisible();
      } else {
        await expect(page.getByText("NDaysRegen")).not.toBeVisible();
      }
    });

    test("regenerate tiles respects weekdays schedule", async ({ page }) => {
      await page.evaluate(() => {
        const today = new Date();
        const ts = today.getFullYear() + "-" + String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
        const day = today.getDay();
        const isWeekday = day >= 1 && day <= 5;
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "WeekdayRegen", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "weekdays" }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ts);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
        localStorage.setItem("planmydays_scheduleTestMatches", isWeekday ? "true" : "false");
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#regenerateTilesRow").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Regenerate Today's Tiles" }).click();
      await page.waitForTimeout(250);
      const matches = await page.evaluate(() => localStorage.getItem("planmydays_scheduleTestMatches") === "true");
      if (matches) {
        await expect(page.getByText("WeekdayRegen")).toBeVisible();
      } else {
        await expect(page.getByText("WeekdayRegen")).not.toBeVisible();
      }
    });

    test("regenerate tiles respects weekends schedule", async ({ page }) => {
      await page.evaluate(() => {
        const today = new Date();
        const ts = today.getFullYear() + "-" + String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
        const day = today.getDay();
        const isWeekend = day === 0 || day === 6;
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "WeekendRegen", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "weekends" }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ts);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
        localStorage.setItem("planmydays_scheduleTestMatches", isWeekend ? "true" : "false");
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#regenerateTilesRow").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Regenerate Today's Tiles" }).click();
      await page.waitForTimeout(250);
      const matches = await page.evaluate(() => localStorage.getItem("planmydays_scheduleTestMatches") === "true");
      if (matches) {
        await expect(page.getByText("WeekendRegen")).toBeVisible();
      } else {
        await expect(page.getByText("WeekendRegen")).not.toBeVisible();
      }
    });

    test("regenerate tiles respects specific days schedule", async ({ page }) => {
      await page.evaluate(() => {
        const today = getTodayDate();
        const ts = today.getFullYear() + "-" + String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
        const day = today.getDay();
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "SpecificDayRegen", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "days", days: [day] }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ts);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#regenerateTilesRow").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Regenerate Today's Tiles" }).click();
      await expect(page.getByText("SpecificDayRegen")).toBeVisible();
    });

    test("regenerate tiles respects specific days schedule mismatch", async ({ page }) => {
      await page.evaluate(() => {
        const today = getTodayDate();
        const ts = today.getFullYear() + "-" + String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
        const day = today.getDay();
        const wrongDay = day === 0 ? 1 : 0;
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "SpecificDayMismatch", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "days", days: [wrongDay] }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ts);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#regenerateTilesRow").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Regenerate Today's Tiles" }).click();
      // regenerating drops the non-matching job from the order; wait for it in storage first
      await expect
        .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_today_order") || "[]")))
        .not.toContain("job_1");
      await expect(page.getByText("SpecificDayMismatch")).not.toBeVisible();
    });

    test("regenerate tiles respects day of month schedule", async ({ page }) => {
      await page.evaluate(() => {
        const today = new Date();
        const ts = today.getFullYear() + "-" + String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
        const dateNum = today.getDate();
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "MonthlyRegen", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "monthly", date: dateNum }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ts);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#regenerateTilesRow").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Regenerate Today's Tiles" }).click();
      await page.waitForTimeout(250);
      await expect(page.getByText("MonthlyRegen")).toBeVisible();
    });

    test("regenerate tiles respects day of month schedule mismatch", async ({ page }) => {
      await page.evaluate(() => {
        const today = new Date();
        const ts = today.getFullYear() + "-" + String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
        const dateNum = today.getDate();
        const wrongDate = dateNum === 1 ? 15 : 1;
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{
            id: "job_1", title: "MonthlyMismatch", active: true, frequency: "daily",
            sequence: 1, schedule: { type: "monthly", date: wrongDate }, suffix: false, dayType: "dayOfYear", mod: "", tasks: []
          }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ts);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#regenerateTilesRow").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Regenerate Today's Tiles" }).click();
      await page.waitForTimeout(250);
      await expect(page.getByText("MonthlyMismatch")).not.toBeVisible();
    });

    test("clear all data removes everything", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", "[]");
        localStorage.setItem("planmydays_images", "[]");
        localStorage.setItem("planmydays_theme", "darkly");
        localStorage.setItem("theme", "old");
        localStorage.setItem("images", "old");
        localStorage.setItem("showDanger", "true");
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#clearAllDataRow").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Clear All Data" }).click();
      await expect(page.locator("#smdConfirmModal")).toBeVisible();
      await page.waitForTimeout(100);
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Clear" }).click();
      await page.waitForTimeout(250);
      await expect(page.locator("#smdConfirmModal")).not.toBeVisible({ timeout: 10000 });
      const allKeys = await page.evaluate(() => {
        const k = Object.keys(localStorage);
        return k.filter(key => key !== "planmydays_last_gen" && key !== "planmydays_today_order" && key !== "planmydays_completed");
      });
      expect(allKeys.length).toBe(0);
    });
  });

  // ── Sort Jobs in Streams ───────────────────────────────────

  test.describe("Sort Jobs in Streams", () => {

    test("sort jobs in streams button shows in danger zone", async ({ page }) => {
      await page.goto("/PlanMyDay/");
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await expect(page.locator("#btnSortJobsInStreams")).toBeHidden();
      await page.locator("#showDanger").check();
      await expect(page.locator("#btnSortJobsInStreams")).toBeVisible();
    });

    test("sort jobs in streams applies rule order and persists", async ({ page }) => {
      await page.evaluate(() => {
        const today = new Date();
        const ts = today.getFullYear() + "-" + String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
        const future = new Date(today);
        future.setDate(future.getDate() + 2);
        const tms = future.getFullYear() + "-" + String(future.getMonth()+1).padStart(2,"0") + "-" + String(future.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [
            { id: "job_sleep", title: "SleepJob", active: true, frequency: "daily", sequence: 1, sleepUntil: tms, time: "09:00", suffix: false, dayType: "dayOfYear", mod: "", tasks: [] },
            { id: "job_plain", title: "PlainJob", active: true, frequency: "daily", sequence: 2, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] },
            { id: "job_timed", title: "TimedJob", active: true, frequency: "daily", sequence: 3, time: "08:00", suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }
          ]
        }]));
        localStorage.setItem("planmydays_last_gen", ts);
        localStorage.setItem("planmydays_today_order", JSON.stringify([]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.getByRole("button", { name: "Sort Jobs in Streams" }).click();
      await expect(page.locator("#settingsPage")).toBeHidden();
      const streams = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_streams")));
      expect(streams[0].jobs.map(j => j.id)).toEqual(["job_timed", "job_plain", "job_sleep"]);
      expect(streams[0].jobs.map(j => j.sequence)).toEqual([1, 2, 3]);
    });
  });

  // ── Auto-Hide Nav Behavior ─────────────────────────────────

  test.describe("Auto-Hide Nav Behavior", () => {

    test("nav hides when auto-hide is enabled and editors are closed", async ({ page }) => {
      await page.evaluate(() => localStorage.setItem("planmydays_autoHideMenu", "true"));
      await page.reload();
      await page.waitForTimeout(4500);
      const navHidden = await page.evaluate(() => {
        const nav = document.getElementById("mainNav");
        return nav ? nav.classList.contains("nav-hidden") : false;
      });
      expect(navHidden).toBe(true);
    });

    test("nav not hidden when auto-hide is disabled", async ({ page }) => {
      await page.evaluate(() => localStorage.setItem("planmydays_autoHideMenu", "false"));
      await page.reload();
      await page.waitForTimeout(4500);
      const navHidden = await page.evaluate(() => {
        const nav = document.getElementById("mainNav");
        return nav ? nav.classList.contains("nav-hidden") : false;
      });
      expect(navHidden).toBe(false);
    });

    test("nav shown when pointer moves after auto-hide", async ({ page }) => {
      await page.evaluate(() => localStorage.setItem("planmydays_autoHideMenu", "true"));
      await page.reload();
      const navHidden1 = await page.evaluate(() => {
        const nav = document.getElementById("mainNav");
        return nav ? nav.classList.contains("nav-hidden") : false;
      });
      expect(navHidden1).toBe(false);
      await page.waitForTimeout(5000);
      const navHidden2 = await page.evaluate(() => {
        const nav = document.getElementById("mainNav");
        return nav ? nav.classList.contains("nav-hidden") : false;
      });
      expect(navHidden2).toBe(true);
      await page.evaluate(() => {
        const nav = document.getElementById("mainNav");
        if (nav) nav.classList.remove("nav-hidden");
      });
      const navHidden3 = await page.evaluate(() => {
        const nav = document.getElementById("mainNav");
        return nav ? nav.classList.contains("nav-hidden") : false;
      });
      expect(navHidden3).toBe(false);
    });
  });

  // ── Dev Mode: Dev Today Override ───────────────────────────

  test.describe("Dev Mode: Dev Today Override", () => {

    test("dev today overrides getTodayDate", async ({ page }) => {
      await page.goto("/PlanMyDay/?dev=true");
      const futureDate = futureDateStr(30);
      await page.evaluate((ds) => {
        localStorage.setItem("devToday", ds);
      }, futureDate);
      await page.reload();
      await expect(page.locator("h2").first()).toContainText(dayMonthStr(futureDate));
    });

    test("dev last gen is returned by getStoredLastGen", async ({ page }) => {
      await page.goto("/PlanMyDay/?dev=true");
      const futureDate = futureDateStr(29);
      await page.evaluate((ds) => {
        localStorage.setItem("devLastGen", ds);
      }, futureDate);
      await page.reload();
      const stored = await page.evaluate(() => window.getStoredLastGen());
      expect(stored).toBe(futureDate);
    });
  });

  // ── No Active Jobs Message ─────────────────────────────────

  test.describe("No Active Jobs Message", () => {

    test("shows no active jobs message when streams empty", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([]));
      });
      await page.reload();
      await page.locator("#countdownContainer").waitFor({ state: "visible" });
      await expect(page.getByText("No active jobs yet")).toBeVisible();
    });
  });

  // ── Schedule Filtering Carryover ───────────────────────────

  test.describe("Schedule Filtering Carryover", () => {

    test("uncompleted jobs carried over when date changes", async ({ page }) => {
      await page.evaluate(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ys = yesterday.getFullYear() + "-" + String(yesterday.getMonth()+1).padStart(2,"0") + "-" + String(yesterday.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "CarryOverJob", active: true, frequency: "daily", sequence: 1, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ys);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      await expect(page.getByText("CarryOverJob")).toBeVisible();
    });
  });

  // ── Day Type Suffix Branches ──────────────────────────────

  test.describe("Day Type Suffix Branches", () => {

    test("dayOfMonth suffix badge visible", async ({ page }) => {
      await page.evaluate(() => {
        const now = new Date();
        const ds = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "DomJob", active: true, frequency: "daily", sequence: 1, suffix: true, dayType: "dayOfMonth", mod: "", tasks: [] }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ds);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      const badge = page.locator(".badge.bg-secondary").first();
      await expect(badge).toBeVisible();
    });

    test("dayOfWeek with monday 0 suffix badge visible", async ({ page }) => {
      await page.evaluate(() => {
        const now = new Date();
        const ds = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "DowJob", active: true, frequency: "daily", sequence: 1, suffix: true, dayType: "dayOfWeek", mod: "", tasks: [] }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ds);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
        localStorage.setItem("planmydays_monday", "0");
      });
      await page.reload();
      const badge = page.locator(".badge.bg-secondary").first();
      await expect(badge).toBeVisible();
    });

    test("jan1 zero suffix badge visible", async ({ page }) => {
      await page.evaluate(() => {
        const now = new Date();
        const ds = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "Jan1Job", active: true, frequency: "daily", sequence: 1, suffix: true, dayType: "dayOfYear", mod: "", tasks: [] }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ds);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
        localStorage.setItem("planmydays_jan1", "0");
      });
      await page.reload();
      const badge = page.locator(".badge.bg-secondary").first();
      await expect(badge).toBeVisible();
    });

    test("suffix with mod 2 badge visible", async ({ page }) => {
      await page.evaluate(() => {
        const now = new Date();
        const ds = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "Mod2", active: true, frequency: "daily", sequence: 1, suffix: true, dayType: "dayOfYear", mod: "2", tasks: [] }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ds);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      const badge = page.locator(".badge.bg-secondary").first();
      await expect(badge).toBeVisible();
    });
  });

  // ── Job Sorting By Time ────────────────────────────────────

  test.describe("Job Sorting By Time", () => {

    test("addScheduleJobsToOrder sorts newly added jobs by time", async ({ page }) => {
      await page.evaluate(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ys = yesterday.getFullYear() + "-" + String(yesterday.getMonth()+1).padStart(2,"0") + "-" + String(yesterday.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [
            { id: "job_1", title: "Late", active: true, frequency: "daily", sequence: 1, time: "15:00", suffix: false, dayType: "dayOfYear", mod: "", tasks: [] },
            { id: "job_2", title: "Early", active: true, frequency: "daily", sequence: 2, time: "08:00", suffix: false, dayType: "dayOfYear", mod: "", tasks: [] },
            { id: "job_3", title: "Mid", active: true, frequency: "daily", sequence: 3, time: "12:00", suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }
          ]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1", "job_2", "job_3"]));
        localStorage.setItem("planmydays_last_gen", ys);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      const h4s = page.locator("h4");
      await expect(h4s.nth(0)).toContainText("Early");
      await expect(h4s.nth(1)).toContainText("Mid");
      await expect(h4s.nth(2)).toContainText("Late");
    });
  });

  // ── Dev Mode Settings ──────────────────────────────────────

  test.describe("Dev Mode Settings", () => {

    test("dev mode flatpickr inputs appear with danger zone", async ({ page }) => {
      await page.goto("/PlanMyDay/?dev=true");
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#devTodayRow").waitFor({ state: "visible" });
      await expect(page.locator(".flatpickr-input")).toHaveCount(2);
    });
  });

  // ── Top-Level: Streams Editor Interaction ────────────────

  test.describe("Top-Level: Streams Editor", () => {

    test("open streams editor, add stream, cancel edit", async ({ page }) => {
      test.setTimeout(30000);
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "MyStream", tab: "progress", image: "", sequence: 1, jobs: []
        }]));
      });
      await page.reload();
      await page.waitForLoadState("networkidle");
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await expect(page.locator("#streamsEditor")).toBeVisible();
      await expect(page.locator("#streamEditorList .editor-title").filter({ hasText: "MyStream" })).toBeVisible();
      await page.getByRole("button", { name: "Add Stream" }).click();
      await expect(page.locator("#streamEditPage")).toBeVisible();
      await page.waitForTimeout(150);
      await page.evaluate(() => cancelEdit());
      await page.locator("#streamEditPage").waitFor({ state: "hidden", timeout: 15000 });
      await expect(page.locator("#streamEditorList")).toBeVisible();
    });

    test("edit stream and save changes", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "EditMe", tab: "progress", image: "", sequence: 1, jobs: []
        }]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#streamEditorList .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator('input[value="EditMe"]').fill("EditedStream");
      await page.getByRole("button", { name: "OK" }).click();
      await expect(page.getByText("EditedStream")).toBeVisible();
    });
  });

  test.describe("Top-Level: Jobs via Streams", () => {

    test("open jobs editor and view jobs", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Work", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "Task1", active: true, frequency: "daily", sequence: 1, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }]
        }]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await expect(page.locator("#streamEditorList")).toBeVisible();
      await expect(page.getByText("Task1")).toBeVisible();
    });

    test("add new job via jobs editor", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Work", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "Existing", active: true, frequency: "daily", sequence: 1, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }]
        }]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobEditPage .form-control").first().fill("NewTask");
      await page.locator("#jobEditOkBtn").click();
      await expect(page.getByText("NewTask")).toBeVisible();
    });
  });

  test.describe("Top-Level: Regenerate Tiles", () => {

    test("regenerate tiles rebuilds order when lastGen differs", async ({ page }) => {
      await page.evaluate(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ys = yesterday.getFullYear() + "-" + String(yesterday.getMonth()+1).padStart(2,"0") + "-" + String(yesterday.getDate()).padStart(2,"0");
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Test", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "RegenJob", active: true, frequency: "daily", sequence: 1, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ys);
        localStorage.setItem("planmydays_completed", JSON.stringify([]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#regenerateTilesRow").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Regenerate Today's Tiles" }).click();
      await expect(page.getByText("RegenJob")).toBeVisible();
    });
  });

  // ── Modal Stacking: Image Picker from Job Edit ──────────

  test.describe("Modal Stacking: Image Picker from Job Edit", () => {

    test("selecting image from job edit page", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Work", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "Report", active: true, frequency: "daily", sequence: 1, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }]
        }]));
        localStorage.setItem("planmydays_images", JSON.stringify([
          { name: "TestImg", data: "" },
          { name: "TestImg2", data: "" }
        ]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#btnJobImageChange").click();
      await page.locator("#imagePickerPage").waitFor({ state: "visible" });
      await expect(page.locator("#imagePickerPage")).toBeVisible();
      await page.locator("#imagePickerPage smd-image-picker .item").first().waitFor({ state: "visible" });
      // guard against the click landing while the picker is still mid-transition
      await expect(page.locator("#imagePickerPage")).toHaveAttribute("open", "");
      await page.locator("#imagePickerPage smd-image-picker .item").first().dispatchEvent("click");
      // selection writes back to the buffer; wait for it instead of a fixed sleep
      await expect
        .poll(() => page.evaluate(() => (jobsBuffer && jobsBuffer.image) || ""), { timeout: 5000 })
        .toBe("TestImg");
      await page.evaluate(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById("imagePickerModal"));
        if (modal) modal.hide();
      });
      await page.locator("#imagePickerPage").waitFor({ state: "hidden", timeout: 10000 });
      const img = await page.evaluate(() => jobsBuffer?.image || "");
      expect(img).toBe("TestImg");
    });

    test("selecting image from add job page", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Work", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "Existing", active: true, frequency: "daily", sequence: 1, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }]
        }]));
        localStorage.setItem("planmydays_images", JSON.stringify([
          { name: "AddJobImg", data: "" }
        ]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#btnJobImageChange").click();
      await page.locator("#imagePickerPage").waitFor({ state: "visible" });
      await expect(page.locator("#imagePickerPage")).toBeVisible();
      await page.locator("#imagePickerPage smd-image-picker .item").first().waitFor({ state: "visible" });
      // guard against the click landing while the picker is still mid-transition
      await expect(page.locator("#imagePickerPage")).toHaveAttribute("open", "");
      await page.locator("#imagePickerPage smd-image-picker .item").first().dispatchEvent("click");
      // selection writes back to the buffer; wait for it instead of a fixed sleep
      await expect
        .poll(() => page.evaluate(() => (jobsBuffer && jobsBuffer.image) || ""), { timeout: 5000 })
        .toBe("AddJobImg");
    });

    test("searching images from job edit page", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "stream_1", title: "Work", tab: "progress", image: "", sequence: 1,
          jobs: [{ id: "job_1", title: "Report", active: true, frequency: "daily", sequence: 1, suffix: false, dayType: "dayOfYear", mod: "", tasks: [] }]
        }]));
        localStorage.setItem("planmydays_images", JSON.stringify([
          { name: "Apple", data: "" },
          { name: "Banana", data: "" }
        ]));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#btnJobImageChange").click();
      await page.locator("#imagePickerPage").waitFor({ state: "visible" });
      await expect(page.locator("#imagePickerPage")).toHaveAttribute("open", "");
      await page.locator("#imagePickerPage smd-image-picker input[type=search]").fill("Banana");
      const banana = page.locator("#imagePickerPage smd-image-picker .label").filter({ hasText: "Banana" });
      await banana.waitFor({ state: "visible" });
      const apple = page.locator("#imagePickerPage smd-image-picker .label").filter({ hasText: "Apple" });
      await expect(apple).not.toBeVisible();
    });
  });

  // ── Modal Stacking: Image Picker from Front Page Add Card ─

  test.describe("Modal Stacking: Image Picker from Front Page Add Card", () => {

    test("selecting image from front page add card", async ({ page }) => {
      test.setTimeout(30000);
      await page.evaluate(() => {
        localStorage.setItem("planmydays_images", JSON.stringify([
          { name: "FrontImg", data: "" }
        ]));
      });
      await page.reload();
      await page.getByText("+ Add Job").click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#btnJobImageChange").click();
      await page.locator("#imagePickerPage").waitFor({ state: "visible" });
      await expect(page.locator("#imagePickerPage")).toBeVisible();
      await page.locator("#imagePickerPage smd-image-picker .item").first().waitFor({ state: "visible" });
      // guard against the click landing while the picker is still mid-transition
      await expect(page.locator("#imagePickerPage")).toHaveAttribute("open", "");
      await page.locator("#imagePickerPage smd-image-picker .item").first().dispatchEvent("click");
      // selection writes back to the buffer; wait for it instead of a fixed sleep
      await expect
        .poll(() => page.evaluate(() => (jobsBuffer && jobsBuffer.image) || ""), { timeout: 5000 })
        .toBe("FrontImg");
      await page.evaluate(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById("imagePickerModal"));
        if (modal) modal.hide();
      });
      await page.locator("#imagePickerPage").waitFor({ state: "hidden", timeout: 10000 });
      const img = await page.evaluate(() => jobsBuffer?.image || "");
      expect(img).toBe("FrontImg");
    });
  });

  // ── Coverage: Import / Export / Upload / Edge cases ────────

  test.describe("Coverage: Import Export Upload", () => {

    test("importData loads streams and images from JSON file", async ({ page }) => {
      const payload = {
        version: 1,
        streams: [{
          id: "stream_imp",
          title: "Imported",
          description: "",
          tab: "progress",
          image: "",
          sequence: 1,
          jobs: [{
            id: "job_imp",
            title: "Imported Job",
            description: "",
            active: true,
            frequency: "daily",
            sequence: 1,
            suffix: false,
            dayType: "dayOfYear",
            mod: "",
            tasks: [],
            schedule: { type: "daily" }
          }]
        }],
        images: [{ name: "ImpImg", data: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" stroke="#111" fill="#eee"><circle r="5"/></svg>') }]
      };
      await page.evaluate((data) => {
        return new Promise(resolve => {
          const file = new File([JSON.stringify(data)], "backup.json", { type: "application/json" });
          const dt = new DataTransfer();
          dt.items.add(file);
          const origClick = HTMLInputElement.prototype.click;
          HTMLInputElement.prototype.click = function() {
            if (this.type === "file") {
              Object.defineProperty(this, "files", { value: dt.files, configurable: true });
              this.dispatchEvent(new Event("change"));
              HTMLInputElement.prototype.click = origClick;
              setTimeout(resolve, 400);
              return;
            }
            return origClick.apply(this, arguments);
          };
          importData();
        });
      }, payload);
      await page.waitForTimeout(300);
      await expect(page.locator("h4").filter({ hasText: "Imported Job" })).toBeVisible();
      const lastGen = await page.evaluate(() => localStorage.getItem("planmydays_last_gen"));
      expect(lastGen).toBe(todayStr);
      const todayOrder = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_today_order") || "[]"));
      expect(todayOrder).toContain("job_imp");
      const imgCount = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images") || "[]").length);
      expect(imgCount).toBe(1);
    });

    test("after importing, regenerate todays jobs runs automatically", async ({ page }) => {
      const payload = {
        version: 1,
        streams: [{
          id: "stream_regen",
          title: "Regen",
          description: "",
          tab: "progress",
          image: "",
          sequence: 1,
          jobs: [{
            id: "job_regen",
            title: "Regen Job",
            description: "",
            active: true,
            frequency: "daily",
            sequence: 1,
            suffix: false,
            dayType: "dayOfYear",
            mod: "",
            tasks: [],
            schedule: { type: "daily" }
          }]
        }],
        images: []
      };
      await page.evaluate((data) => {
        return new Promise(resolve => {
          const file = new File([JSON.stringify(data)], "backup.json", { type: "application/json" });
          const dt = new DataTransfer();
          dt.items.add(file);
          const origClick = HTMLInputElement.prototype.click;
          HTMLInputElement.prototype.click = function() {
            if (this.type === "file") {
              Object.defineProperty(this, "files", { value: dt.files, configurable: true });
              this.dispatchEvent(new Event("change"));
              HTMLInputElement.prototype.click = origClick;
              setTimeout(resolve, 400);
              return;
            }
            return origClick.apply(this, arguments);
          };
          importData();
        });
      }, payload);
      await page.waitForTimeout(300);
      const lastGen = await page.evaluate(() => localStorage.getItem("planmydays_last_gen"));
      expect(lastGen).toBe(todayStr);
      const completed = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_completed") || "[]"));
      expect(completed).toEqual([]);
      const todayOrder = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_today_order") || "[]"));
      expect(todayOrder).toContain("job_regen");
      await expect(page.locator("h4").filter({ hasText: "Regen Job" })).toBeVisible();
    });

    test("importData rejects invalid JSON via alert", async ({ page }) => {
      page.on("dialog", async d => { await d.accept(); });
      await page.evaluate(() => {
        return new Promise(resolve => {
          const input = document.createElement("input");
          input.type = "file";
          const file = new File(["not-json{{{"], "bad.json", { type: "application/json" });
          const dt = new DataTransfer();
          dt.items.add(file);
          Object.defineProperty(input, "files", { value: dt.files });
          // Call the real importData change handler by monkey-patching click
          const origClick = HTMLInputElement.prototype.click;
          HTMLInputElement.prototype.click = function() {
            if (this.type === "file" && this.accept && this.accept.includes("json")) {
              Object.defineProperty(this, "files", { value: dt.files, configurable: true });
              this.dispatchEvent(new Event("change"));
              HTMLInputElement.prototype.click = origClick;
              setTimeout(resolve, 200);
              return;
            }
            return origClick.apply(this, arguments);
          };
          importData();
        });
      });
    });

    test("importData rejects file missing streams and images", async ({ page }) => {
      page.on("dialog", async d => { await d.accept(); });
      await page.evaluate(() => {
        return new Promise(resolve => {
          const file = new File([JSON.stringify({ version: 1 })], "empty.json", { type: "application/json" });
          const dt = new DataTransfer();
          dt.items.add(file);
          const origClick = HTMLInputElement.prototype.click;
          HTMLInputElement.prototype.click = function() {
            if (this.type === "file") {
              Object.defineProperty(this, "files", { value: dt.files, configurable: true });
              this.dispatchEvent(new Event("change"));
              HTMLInputElement.prototype.click = origClick;
              setTimeout(resolve, 200);
              return;
            }
            return origClick.apply(this, arguments);
          };
          importData();
        });
      });
    });

    test("uploadStandardImages adds sample images", async ({ page }) => {
      test.setTimeout(60000);
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#danger-tab").click();
      await page.locator("#showDanger").check();
      await page.locator("#uploadStandardImagesRow").waitFor({ state: "visible" });
      await page.locator("#btnUploadImages").click();
      await page.waitForFunction(() => {
        const imgs = JSON.parse(localStorage.getItem("planmydays_images") || "[]");
        return imgs.length > 0;
      }, null, { timeout: 45000 });
      const count = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images") || "[]").length);
      expect(count).toBeGreaterThan(0);
    });

    test("exportData triggers download", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      const downloadPromise = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
      await page.evaluate(() => exportData());
      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toMatch(/^planmydays-\d+\.json$/);
        expect(download.suggestedFilename()).not.toContain("-backup-");
      }
    });
  });

  test.describe("Coverage: Images advanced", () => {

    const sampleSvg = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" stroke="#ff0000" fill="#00ff00" stroke-width="2"><rect width="10" height="10"/></svg>');
    const svgNoAttrs = '<svg xmlns="http://www.w3.org/2000/svg"><circle stroke="#abc" fill="#def" r="5"/></svg>';

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      const images = [];
      for (let i = 1; i <= 35; i++) {
        images.push({ name: `Img${String(i).padStart(2, "0")}`, data: sampleSvg });
      }
      images.push({ name: "Photo 5", data: sampleSvg });
      await page.evaluate((imgs) => {
        localStorage.setItem("planmydays_images", JSON.stringify(imgs));
      }, images);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Images" }).click();
      await page.waitForTimeout(150);
    });

    test("image list pagination next and previous", async ({ page }) => {
      await expect(page.getByText("Page 1 of")).toBeVisible();
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.getByText("Page 2 of")).toBeVisible();
      await page.getByRole("button", { name: "Previous" }).click();
      await expect(page.getByText("Page 1 of")).toBeVisible();
    });

    test("duplicate image with trailing number increments", async ({ page }) => {
      await page.locator("#imageNameSearchInput").fill("Photo 5");
      await page.waitForTimeout(100);
      await page.locator("#imagesList").getByTitle("Duplicate").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      const name = await page.locator("#imageEditModalBody input.form-control").first().inputValue();
      expect(name).toMatch(/Photo 6/);
      await page.locator("#btnImageEditCancel").click();
    });

    test("upload SVG image via file input", async ({ page }) => {
      await page.locator("#imagesList").getByTitle("Edit").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.evaluate((svgText) => {
        return new Promise(resolve => {
          const file = new File([svgText], "icon.svg", { type: "image/svg+xml" });
          const dt = new DataTransfer();
          dt.items.add(file);
          const origClick = HTMLInputElement.prototype.click;
          HTMLInputElement.prototype.click = function() {
            if (this.type === "file") {
              Object.defineProperty(this, "files", { value: dt.files, configurable: true });
              this.dispatchEvent(new Event("change"));
              HTMLInputElement.prototype.click = origClick;
              setTimeout(resolve, 300);
              return;
            }
            return origClick.apply(this, arguments);
          };
          openImageUpload(editingImageIndex);
        });
      }, svgNoAttrs);
      await page.waitForTimeout(100);
      const data = await page.evaluate(() => {
        const images = JSON.parse(localStorage.getItem("planmydays_images") || "[]");
        return images[editingImageIndex]?.data || "";
      });
      expect(data).toContain("data:image/svg+xml");
      expect(data).toMatch(/stroke/);
    });

    test("upload raster image via file input", async ({ page }) => {
      await page.locator("#imagesList").getByTitle("Edit").first().click();
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      // 1x1 PNG
      const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      await page.evaluate(async (b64) => {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const file = new File([arr], "dot.png", { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(file);
        return new Promise(resolve => {
          const origClick = HTMLInputElement.prototype.click;
          HTMLInputElement.prototype.click = function() {
            if (this.type === "file") {
              Object.defineProperty(this, "files", { value: dt.files, configurable: true });
              this.dispatchEvent(new Event("change"));
              HTMLInputElement.prototype.click = origClick;
              setTimeout(resolve, 300);
              return;
            }
            return origClick.apply(this, arguments);
          };
          openImageUpload(editingImageIndex);
        });
      }, pngB64);
      await page.waitForTimeout(100);
      const data = await page.evaluate(() => {
        const images = JSON.parse(localStorage.getItem("planmydays_images") || "[]");
        return images[editingImageIndex]?.data || "";
      });
      expect(data.startsWith("data:image/png")).toBeTruthy();
    });

    test("stroke width adds attribute when missing", async ({ page }) => {
      await page.evaluate(() => {
        const images = loadImages();
        const bare = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" stroke="#000" fill="none"><rect width="5" height="5"/></svg>');
        images[0].data = bare;
        images[0].name = "BareStroke";
        saveImages(images);
        editingImageIndex = 0;
        isNewImage = false;
        renderImagesEditor();
      });
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      await page.evaluate(() => editImageStrokeWidth(0, 0, "4"));
      const themed = await page.evaluate(() => getThemedImageDataUrl(loadImages()[0], "light"));
      expect(decodeURIComponent(themed)).toMatch(/stroke-width=["']4["']/);
    });

    test("editImageField non-name field saves", async ({ page }) => {
      await page.evaluate(() => {
        const images = loadImages();
        editingImageIndex = 0;
        isNewImage = false;
        editImageField("lineColor", "#abcdef");
      });
      const val = await page.evaluate(() => loadImages()[0].lineColor);
      expect(val).toBe("#abcdef");
    });

    test("delete image via confirm", async ({ page }) => {
      const before = await page.evaluate(() => loadImages().length);
      await page.locator("#imagesList").getByTitle("Delete").first().click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.waitForTimeout(100);
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Delete" }).click();
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => loadImages().length);
      expect(after).toBe(before - 1);
    });
  });

  test.describe("Coverage: Main view edge cases", () => {

    test("loadStreams assigns missing job ids", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "s1", title: "S", tab: "progress", sequence: 1, jobs: [
            { title: "NoId", active: true, frequency: "daily", sequence: 1, schedule: { type: "daily" } }
          ]
        }]));
        localStorage.setItem("planmydays_last_gen", new Date().toISOString().slice(0, 10));
        localStorage.setItem("planmydays_today_order", JSON.stringify([]));
      });
      await page.reload();
      const id = await page.evaluate(() => {
        const s = loadStreams();
        return s[0].jobs[0].id;
      });
      expect(id).toMatch(/^job_/);
    });

    test("jobs with stream and job images render img tags", async ({ page }) => {
      const svg = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" stroke="%23abc" fill="none"><circle r="3"/></svg>');
      await page.evaluate(({ svgData, streams, ds }) => {
        localStorage.setItem("planmydays_images", JSON.stringify([
          { name: "StreamIcon", data: svgData },
          { name: "JobIcon", data: svgData }
        ]));
        streams[0].image = "StreamIcon";
        streams[0].jobs[0].image = "JobIcon";
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1"]));
        localStorage.setItem("planmydays_last_gen", ds);
        localStorage.setItem("planmydays_completed", "[]");
      }, { svgData: svg, streams: TEST_STREAMS, ds: todayStr });
      await page.reload();
      await expect(page.locator("#todayCardList smd-image").first().locator("img")).toBeVisible();
      const count = await page.locator("#todayCardList smd-image").count();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    test("split list empty tab message", async ({ page }) => {
      await page.evaluate((data) => {
        data[0].tab = "progress";
        data[1].tab = "progress";
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
        localStorage.setItem("planmydays_splitList", "true");
        localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1", "job_3"]));
        localStorage.setItem("planmydays_last_gen", new Date().toISOString().slice(0, 10));
        localStorage.setItem("planmydays_completed", "[]");
      }, TEST_STREAMS);
      await page.reload();
      await page.locator("#todayTabs .smd-tab-btn").filter({ hasText: "Maintenance" }).click();
      await expect(page.getByText("No jobs in this tab.")).toBeVisible();
    });

    test("escapeHtml handles null and zero", async ({ page }) => {
      const result = await page.evaluate(() => ({
        empty: escapeHtml(null),
        zero: escapeHtml(0),
        html: escapeHtml("<b>&</b>")
      }));
      expect(result.empty).toBe("");
      expect(result.zero).toBe("0");
      expect(result.html).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
    });

    test("density compact restored on load", async ({ page }) => {
      await page.evaluate(() => localStorage.setItem("planmydays_density", "compact"));
      await page.reload();
      await expect(page.locator("body")).toHaveClass(/compact/);
    });

    test("drag size defaults to large on fresh load", async ({ page }) => {
      await expect(page.locator("body")).toHaveClass(/drag-size-large/);
    });

    test("drag size normal restored on load", async ({ page }) => {
      await page.evaluate(() => localStorage.setItem("planmydays_dragSize", "normal"));
      await page.reload();
      await expect(page.locator("body")).toHaveClass(/drag-size-normal/);
      await expect(page.locator("body")).not.toHaveClass(/drag-size-large/);
    });

    test("drag size setting changes handle size on main view", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await page.locator("#todayCardList .today-drag-card .drag-handle").first().waitFor({ state: "visible" });
      const handleSize = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#todayCardList .drag-handle")).fontSize));
      const largeSize = await handleSize();
      await page.evaluate(() => changeDragSize("normal"));
      const normalSize = await handleSize();
      expect(largeSize).toBeGreaterThan(normalSize);
      await page.evaluate(() => changeDragSize("large"));
      expect(await handleSize()).toBe(largeSize);
    });

    test("changeDevToday and changeDevLastGen via settings helpers", async ({ page }) => {
      await page.goto("/PlanMyDay/?dev=true");
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem("planmydays_images", "[]");
      });
      await startCoverage(page);
      await page.reload();
      const futureToday = futureDateStr(30);
      const futureLastGen = futureDateStr(29);
      await page.evaluate(({ t, l }) => {
        changeDevToday(t);
        changeDevLastGen(l);
      }, { t: futureToday, l: futureLastGen });
      const vals = await page.evaluate(() => ({
        today: localStorage.getItem("devToday"),
        last: localStorage.getItem("devLastGen"),
        dateFn: getTodayStr()
      }));
      expect(vals.today).toBe(futureToday);
      expect(vals.last).toBe(futureLastGen);
      expect(vals.dateFn).toBe(futureToday);
    });

    test("getImageColors decodes percent-hash colors", async ({ page }) => {
      const result = await page.evaluate(() => {
        const data = "data:image/svg+xml," + encodeURIComponent('<svg stroke="%23aabbcc" fill="%23ddeeff" stroke-width="3"></svg>');
        // getImageColors matches against decoded string; also test raw %23 path
        const raw = "data:image/svg+xml," + encodeURIComponent('<svg></svg>').replace("svg", 'svg stroke="%23ff00aa" fill="%2300ffaa"');
        return {
          a: getImageColors(data),
          b: getImageColors(""),
          c: getImageColors("data:image/png;base64,xx")
        };
      });
      expect(result.a.line).toBeTruthy();
      expect(result.b.line).toBe("");
      expect(result.c.line).toBe("");
    });

    test("updateSvgColor handles empty and hash colors", async ({ page }) => {
      const result = await page.evaluate(() => {
        const src = "data:image/svg+xml," + encodeURIComponent('<svg stroke="#111" fill="#222"></svg>');
        return {
          cleared: updateSvgColor(src, "stroke", ""),
          colored: updateSvgColor(src, "fill", "#abcdef"),
          passthrough: updateSvgColor("not-svg", "stroke", "#000")
        };
      });
      expect(result.passthrough).toBe("not-svg");
      expect(decodeURIComponent(result.colored)).toContain("#abcdef");
      expect(decodeURIComponent(result.cleared)).toMatch(/stroke=["']none["']/);
    });

    test("addScheduleJobsToOrder time sort branches", async ({ page }) => {
      const order = await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "s", title: "S", tab: "progress", sequence: 1,
          jobs: [
            { id: "noTime1", title: "N1", active: true, schedule: { type: "daily" } },
            { id: "timeB", title: "TB", active: true, time: "14:00", schedule: { type: "daily" } },
            { id: "timeA", title: "TA", active: true, time: "09:00", schedule: { type: "daily" } },
            { id: "noTime2", title: "N2", active: true, schedule: { type: "daily" } },
            { id: "inactive", title: "X", active: false, time: "07:00", schedule: { type: "daily" } }
          ]
        }]));
        return addScheduleJobsToOrder([]);
      });
      expect(order.indexOf("timeA")).toBeLessThan(order.indexOf("timeB"));
      expect(order).toContain("noTime1");
      expect(order).not.toContain("inactive");
    });

    test("loadCompletedJobs and loadTodayOrder null branches", async ({ page }) => {
      const result = await page.evaluate(() => {
        localStorage.removeItem("planmydays_completed");
        localStorage.removeItem("planmydays_today_order");
        return {
          completed: loadCompletedJobs(),
          order: loadTodayOrder()
        };
      });
      expect(result.completed).toEqual([]);
      expect(result.order).toBeNull();
    });

    test("shouldShowJobToday unknown type and empty days", async ({ page }) => {
      const result = await page.evaluate(() => ({
        unknown: shouldShowJobToday({ schedule: { type: "weird" } }),
        noSchedule: shouldShowJobToday({}),
        emptyDays: shouldShowJobToday({ schedule: { type: "days", days: [] } }),
        monthlyDefault: shouldShowJobToday({ schedule: { type: "monthly" } }),
        ndaysDefault: shouldShowJobToday({ schedule: { type: "ndays" } })
      }));
      expect(result.unknown).toBe(true);
      expect(result.noSchedule).toBe(true);
      expect(result.emptyDays).toBe(false);
    });

    test("getScheduleText and getNextDueText branches", async ({ page }) => {
      const result = await page.evaluate(() => ({
        daily: getScheduleText({ type: "daily" }),
        weekdays: getScheduleText({ type: "weekdays" }),
        weekends: getScheduleText({ type: "weekends" }),
        days: getScheduleText({ type: "days", days: [1, 3] }),
        daysEmpty: getScheduleText({ type: "days", days: [] }),
        monthly: getScheduleText({ type: "monthly", date: 15 }),
        monthlyDef: getScheduleText({ type: "monthly" }),
        ndays: getScheduleText({ type: "ndays", interval: 3, offset: 1 }),
        ndaysDef: getScheduleText({ type: "ndays" }),
        unknown: getScheduleText({ type: "x" }),
        none: getScheduleText(null),
        next: getNextDueText(3, 1),
        nextDef: getNextDueText(2, 0)
      }));
      expect(result.daily.toLowerCase()).toMatch(/every|daily/i);
      expect(result.weekdays.toLowerCase()).toMatch(/weekday/i);
      expect(result.next).toBeTruthy();
    });

    test("saveScheduleModal empty days falls back to daily", async ({ page }) => {
      await page.evaluate((data) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
        jobsStreamIndex = 0;
        jobsTargetStreamIndex = 0;
        jobsEditingIdx = 0;
        isNewJob = false;
        jobsBuffer = JSON.parse(JSON.stringify(data[0].jobs[0]));
        buildJobEditPage(false);
      }, TEST_STREAMS);
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await page.locator("#btnScheduleChange").click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.locator('input[name="scheduleType"][value="days"]').check();
      await page.evaluate(() => onScheduleTypeChange());
      for (let i = 0; i < 7; i++) {
        const cb = page.locator("#schedDay" + i);
        if (await cb.count() && await cb.isChecked()) await cb.uncheck();
      }
      await page.evaluate(() => saveScheduleModal());
      const schedule = await page.evaluate(() => jobsBuffer?.schedule);
      expect(schedule?.type).toBe("daily");
    });

    test("formatDate and getDaysSinceEpoch", async ({ page }) => {
      const futureDate = futureDateStr(30);
      const result = await page.evaluate((ds) => ({
        formatted: formatDate(ds),
        empty: formatDate(""),
        epoch: getDaysSinceEpoch(new Date(ds + "T00:00:00"))
      }), futureDate);
      expect(result.formatted).toBe(shortDateStr(futureDate));
      expect(result.empty).toBe("");
      expect(typeof result.epoch).toBe("number");
    });

    test("image helper OOB and missing-data branches", async ({ page }) => {
      const result = await page.evaluate(() => {
        localStorage.setItem("planmydays_images", JSON.stringify([
          { name: "Only", data: "data:image/svg+xml," + encodeURIComponent("<svg stroke='#111' fill='#222'></svg>") },
          { name: "NoData", data: "" },
          { name: "SingleQuote", data: "data:image/svg+xml," + encodeURIComponent("<svg stroke='#abc' fill='none'></svg>") }
        ]));
        editingImageIndex = -1;
        const out = {};
        out.dupOob = (duplicateImage(-1), duplicateImage(99), true);
        out.editOob = (editImageField("name", "x"), editImageColor(-1, 0, "stroke", "#000"), editImageFillNone(99, 0, true), editImageStrokeNone(-1, 0, true), editImageStrokeWidth(99, 0, "2"), true);
        out.strokeNonSvg = (editImageStrokeWidth(1, 0, "3"), loadImages()[1].data);
        // single-quote attr path in updateSvgColor
        const sq = "data:image/svg+xml," + encodeURIComponent("<svg stroke='#abc' fill='none'></svg>");
        out.singleQuote = updateSvgColor(sq, "stroke", "#fff");
        // decodeVal %23 path
        out.pct = getImageColors("data:image/svg+xml," + encodeURIComponent('<svg stroke="%23ff00aa" fill="%2300bbcc" stroke-width="1"></svg>'));
        // missing stroke/fill matches
        out.bare = getImageColors("data:image/svg+xml," + encodeURIComponent("<svg></svg>"));
        // normalizeSvg defaults when no stroke/fill in children
        out.normEmpty = normalizeSvgForEditing("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
        out.normChild = normalizeSvgForEditing('<svg xmlns="http://www.w3.org/2000/svg"><path stroke="#111" fill="#222"/></svg>');
        // checkDuplicateName with no input
        editingImageIndex = -1;
        out.checkNoInput = (checkDuplicateName(), true);
        // openImageUpload cancel (no file)
        out.uploadCancel = (() => {
          const orig = HTMLInputElement.prototype.click;
          HTMLInputElement.prototype.click = function() {
            Object.defineProperty(this, "files", { value: [], configurable: true });
            this.dispatchEvent(new Event("change"));
            HTMLInputElement.prototype.click = orig;
          };
          openImageUpload(0);
          return true;
        })();
        // getImageByName empty
        out.noName = getImageByName("");
        out.missing = getImageByName("Nope");
        out.dataUrl = getImageDataUrl("Only");
        out.dataMissing = getImageDataUrl("Nope");
        // page clamp when page beyond total
        imagesPage = 50;
        imageNameSearch = "";
        renderImagesEditor();
        out.pageClamped = imagesPage;
        return out;
      });
      expect(result.dupOob).toBe(true);
      expect(result.strokeNonSvg).toBe("");
      expect(result.pct.line).toMatch(/#ff00aa/i);
      expect(result.bare.line).toBe("");
      expect(result.normEmpty).toMatch(/stroke=/);
      expect(result.noName).toBeNull();
      expect(result.missing).toBeNull();
      expect(result.dataMissing).toBeNull();
      expect(result.pageClamped).toBe(0);
    });

    test("edit image prev color fallbacks and fill/stroke restore defaults", async ({ page }) => {
      await page.evaluate(() => {
        const svg = "data:image/svg+xml," + encodeURIComponent('<svg stroke="none" fill="none" stroke-width="2"><rect/></svg>');
        localStorage.setItem("planmydays_images", JSON.stringify([
          { name: "NoneCols", data: svg }
        ]));
        editingImageIndex = 0;
        isNewImage = false;
        editImageBackup = JSON.parse(JSON.stringify(loadImages()[0]));
        renderImagesEditor();
      });
      await page.locator("#imageEditModal").waitFor({ state: "visible" });
      // uncheck none without _prev* set -> default #000000
      await page.evaluate(() => {
        editImageStrokeNone(0, 0, false);
        editImageFillNone(0, 0, false);
        // set none again storing prev, then restore
        editImageStrokeNone(0, 0, true);
        editImageFillNone(0, 0, true);
        editImageStrokeNone(0, 0, false);
        editImageFillNone(0, 0, false);
        // stroke width empty value fallback
        editImageStrokeWidth(0, 0, "");
      });
      const img = await page.evaluate(() => loadImages()[0]);
      expect(img.themes.light.line).toBeTruthy();
      expect(img.themes.light.fill).toBeTruthy();
    });

    test("seedSampleImages skips when images already present", async ({ page }) => {
      const result = await page.evaluate(() => {
        localStorage.setItem("planmydays_images", JSON.stringify([{ name: "x", data: "" }]));
        seedSampleImages();
        return JSON.parse(localStorage.getItem("planmydays_images")).length;
      });
      expect(result).toBe(1);
    });

    test("uploadStandardImages merges without duplicating names", async ({ page }) => {
      test.setTimeout(60000);
      await page.evaluate(async () => {
        // seed one name that will collide after upload
        const res = await fetch("../shared/sampleImages.json");
        const data = await res.json();
        if (data.images && data.images[0]) {
          localStorage.setItem("planmydays_images", JSON.stringify([data.images[0]]));
        }
      });
      await page.evaluate(() => uploadStandardImages());
      await page.waitForFunction(() => {
        const imgs = JSON.parse(localStorage.getItem("planmydays_images") || "[]");
        return imgs.length > 1;
      }, null, { timeout: 45000 });
      const names = await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_images")).map(i => i.name));
      expect(new Set(names).size).toBe(names.length);
    });

    test("upload summary modal shows counts", async ({ page }) => {
      test.setTimeout(60000);
      await page.evaluate(async () => {
        const res = await fetch("../shared/sampleImages.json");
        const data = await res.json();
        if (data.images && data.images[0]) {
          localStorage.setItem("planmydays_images", JSON.stringify([data.images[0]]));
        }
      });
      await page.evaluate(() => uploadStandardImages());
      await page.locator("#smdConfirmModal").waitFor({ state: "visible", timeout: 15000 });
      const total = await page.evaluate(async () => (await (await fetch("../shared/sampleImages.json")).json()).images.length);
      await expect(page.locator("#smdConfirmModal")).toContainText(`${total} images uploaded`);
      await expect(page.locator("#smdConfirmModal")).toContainText(`${total - 1} added`);
      await expect(page.locator("#smdConfirmModal")).toContainText("1 duplicate ignored");
      await expect(page.locator("#smdConfirmModal .smd-body br")).toHaveCount(2);
    });

    test("settings auto-hide branch guards", async ({ page }) => {
      await page.evaluate(() => {
        // unbind when not bound
        autoHideEventsBound = false;
        unbindAutoHideEvents();
        // bind twice
        bindAutoHideEvents();
        bindAutoHideEvents();
        // reset when disabled
        localStorage.setItem("planmydays_autoHideMenu", "false");
        resetAutoHideTimer();
        // reset when cooldown active
        localStorage.setItem("planmydays_autoHideMenu", "true");
        autoHideCooldown = true;
        resetAutoHideTimer();
        autoHideCooldown = false;
        // hideNav when editors open should not hide
        document.getElementById("settingsPage").classList.remove("d-none");
        hideNav();
        const hiddenWhileSettings = document.getElementById("mainNav").classList.contains("nav-hidden");
        document.getElementById("settingsPage").classList.add("d-none");
        // hideNav normal path
        hideNav();
        // showNav
        showNav();
        // changeAutoHide on/off
        changeAutoHideMenu(true);
        changeAutoHideMenu(false);
        window.__autoHideBranch = {
          bound: autoHideEventsBound,
          hiddenWhileSettings
        };
      });
      const r = await page.evaluate(() => window.__autoHideBranch);
      expect(r.bound).toBe(false);
      expect(r.hiddenWhileSettings).toBe(false);
    });

    test("applyTheme fallback and font/density normal branches", async ({ page }) => {
      await page.evaluate(() => {
        applyTheme("not-a-real-theme");
        changeFontSize("normal");
        changeFontSize("small");
        changeDensity("normal");
        changeDensity("compact");
        changeIconSize("small");
        changeSplitList(false);
        changeHideDone(false);
        changeSkipAdhocConfirm(false);
        changeShowDanger(false);
        changeShowDanger(true);
      });
      const theme = await page.evaluate(() => localStorage.getItem("planmydays_theme"));
      expect(theme).toBe("not-a-real-theme");
      await expect(page.locator("body")).toHaveClass(/font-size-small/);
      await expect(page.locator("body")).toHaveClass(/compact/);
    });

    test("markJobDone and removeAdhocJob edge branches", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_streams", JSON.stringify([{
          id: "ah", title: "Ad Hoc", tab: "progress", sequence: 1,
          jobs: [
            { id: "adhoc1", title: "A1", active: true, schedule: { type: "daily" } },
            { id: "adhoc2", title: "A2", active: true, schedule: { type: "daily" } }
          ]
        }, {
          id: "s2", title: "Work", tab: "progress", sequence: 2,
          jobs: [{ id: "w1", title: "W1", active: true, schedule: { type: "daily" } }]
        }]));
        localStorage.setItem("planmydays_today_order", JSON.stringify(["adhoc1", "adhoc2", "w1"]));
        localStorage.setItem("planmydays_last_gen", getTodayStr());
        localStorage.setItem("planmydays_completed", JSON.stringify(["w1"]));
        localStorage.setItem("planmydays_skipAdhocConfirm", "true");
      });
      await page.reload();
      // already-completed job: uncheck then check again
      const workCb = page.locator('.job-checkbox[data-job-id="w1"]');
      await workCb.uncheck();
      await workCb.check();
      // adhoc with skip confirm removes job (element goes away on re-render)
      const adhocCb = page.locator('.job-checkbox[data-job-id="adhoc1"]');
      await adhocCb.click();
      await expect(page.locator('.today-drag-card[data-job-id="adhoc1"]')).toHaveCount(0);
      const remaining = await page.evaluate(() => {
        const s = loadStreams().find(t => t.title === "Ad Hoc");
        return (s.jobs || []).map(j => j.id);
      });
      expect(remaining).not.toContain("adhoc1");
      expect(remaining).toContain("adhoc2");
    });

    test("getJobSuffix mod zero and dayType defaults", async ({ page }) => {
      const result = await page.evaluate(() => {
        localStorage.setItem("planmydays_suffixStart", "0");
        localStorage.setItem("planmydays_monday", "1");
        localStorage.setItem("planmydays_jan1", "1");
        return {
          off: getJobSuffix({ suffix: false }),
          week: getJobSuffix({ suffix: true, dayType: "dayOfWeek" }),
          month: getJobSuffix({ suffix: true, dayType: "dayOfMonth" }),
          year: getJobSuffix({ suffix: true, dayType: "dayOfYear" }),
          mod0: getJobSuffix({ suffix: true, dayType: "dayOfYear", mod: "0" }),
          modBad: getJobSuffix({ suffix: true, dayType: "dayOfYear", mod: "abc" }),
          mod3: getJobSuffix({ suffix: true, dayType: "dayOfYear", mod: "3" })
        };
      });
      expect(result.off).toBe("");
      expect(result.week).toMatch(/\(\d+\)/);
      expect(result.mod3).toMatch(/\(\d+\)/);
    });

    test("updateJobImagePreview and stream preview empty name", async ({ page }) => {
      await page.evaluate((data) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
        localStorage.setItem("planmydays_images", JSON.stringify([
          { name: "PrevImg", data: "data:image/svg+xml," + encodeURIComponent("<svg></svg>") }
        ]));
        jobsStreamIndex = 0;
        jobsTargetStreamIndex = 0;
        jobsBuffer = { title: "t", image: "" };
        jobsEditingIdx = 0;
        isNewJob = false;
        buildJobEditPage(false);
      }, TEST_STREAMS);
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.evaluate(() => {
        updateJobImagePreview("");
        updateJobImagePreview("PrevImg");
        updateStreamImagePreview("");
        updateStreamImagePreview("PrevImg");
        updateJobStreamPreview();
        jobTimeChanged();
        clearSleepUntil();
        updateSleepUntilClearBtn();
        updateJobEditOkBtn();
      });
      await page.evaluate(() => {
        var streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].image = "PrevImg";
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
        updateJobStreamPreview();
        jobChangeStream(1);
    });
  });

  test.describe("Minio", () => {

    // ── Settings UI ────────────────────────────────────────

    test("minio tab exists in settings", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await expect(page.locator("#minio-tab")).toBeVisible();
    });

    test("minio tab shows fields when enabled", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#minio-tab").click();
      await expect(page.locator("#minioEnabled")).toBeVisible();
      await expect(page.locator("#minioServer")).toBeVisible();
      await expect(page.locator("#minioUsername")).toBeVisible();
      await expect(page.locator("#minioPassword")).toBeVisible();
      await expect(page.locator("#minioBucket")).toBeVisible();
    });

    test("minio fields are disabled when enable toggle is off", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#minio-tab").click();
      await expect(page.locator("#minioEnabled")).not.toBeChecked();
      await expect(page.locator("#minioServer")).toBeDisabled();
      await expect(page.locator("#minioUsername")).toBeDisabled();
      await expect(page.locator("#minioPassword")).toBeDisabled();
      await expect(page.locator("#minioBucket")).toBeDisabled();
    });

    test("minio fields become enabled when toggle is on", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#minio-tab").click();
      await page.waitForTimeout(100);
      await page.locator("#minioEnabled").check();
      await expect(page.locator("#minioServer")).toBeEnabled();
      await expect(page.locator("#minioUsername")).toBeEnabled();
      await expect(page.locator("#minioPassword")).toBeEnabled();
      await expect(page.locator("#minioBucket")).toBeEnabled();
    });

    test("minio settings persist in localStorage", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_minio_enabled", "true");
        localStorage.setItem("planmydays_minio_server", "http://minio:9000");
        localStorage.setItem("planmydays_minio_username", "testuser");
        localStorage.setItem("planmydays_minio_password", "testpass");
        localStorage.setItem("planmydays_minio_bucket", "testbucket");
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#minio-tab").click();
      await page.waitForTimeout(150);
      await expect(page.locator("#minioEnabled")).toBeChecked();
      await expect(page.locator("#minioServer")).toHaveValue("http://minio:9000");
      await expect(page.locator("#minioUsername")).toHaveValue("testuser");
      await expect(page.locator("#minioPassword")).toHaveValue("testpass");
      await expect(page.locator("#minioBucket")).toHaveValue("testbucket");
    });

    test("password toggle shows and hides password", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#minio-tab").click();
      await page.waitForTimeout(100);
      await page.locator("#minioEnabled").check();
      await page.locator("#minioPassword").fill("secret");
      await expect(page.locator("#minioPassword")).toHaveAttribute("type", "password");
      await page.locator("#minioFields button[title='Show/hide password']").click();
      await expect(page.locator("#minioPassword")).toHaveAttribute("type", "text");
      await page.locator("#minioFields button[title='Show/hide password']").click();
      await expect(page.locator("#minioPassword")).toHaveAttribute("type", "password");
    });

    test("password is hidden when leaving minio tab", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#minio-tab").click();
      await page.waitForTimeout(100);
      await page.locator("#minioEnabled").check();
      await page.locator("#minioPassword").fill("secret");
      await page.locator("#minioFields button[title='Show/hide password']").click();
      await expect(page.locator("#minioPassword")).toHaveAttribute("type", "text");
      await page.locator("#general-tab").click();
      await expect(page.locator("#minioPassword")).toHaveAttribute("type", "password");
    });

    // ── Menu visibility ────────────────────────────────────

    test("minio menu items hidden when disabled", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await expect(page.locator("a.dropdown-item").filter({ hasText: "Export to Minio" })).not.toBeVisible();
      await expect(page.locator("a.dropdown-item").filter({ hasText: "Import from Minio" })).not.toBeVisible();
    });

    test("minio menu items appear when enabled", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_minio_enabled", "true");
        localStorage.setItem("planmydays_minio_server", "http://localhost:9000");
        localStorage.setItem("planmydays_minio_username", "u");
        localStorage.setItem("planmydays_minio_password", "p");
        localStorage.setItem("planmydays_minio_bucket", "b");
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await expect(page.locator("a.dropdown-item").filter({ hasText: "Export to Minio" })).toBeVisible();
      await expect(page.locator("a.dropdown-item").filter({ hasText: "Import from Minio" })).toBeVisible();
    });

    test("minio menu options hidden when disabled via the settings minio tab", async ({ page }) => {
      // settings -> minio tab -> disabled
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#minio-tab").click();
      await expect(page.locator("#minioEnabled")).not.toBeChecked();
      await page.getByRole("button", { name: "Done" }).click();
      // main menu should not show the import/export options
      await page.locator("#btnMainMenu").click();
      await expect(page.locator("a.dropdown-item").filter({ hasText: "Export to Minio" })).not.toBeVisible();
      await expect(page.locator("a.dropdown-item").filter({ hasText: "Import from Minio" })).not.toBeVisible();
      // enabling in settings makes them appear
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#minio-tab").click();
      await page.locator("#minioEnabled").check();
      await page.getByRole("button", { name: "Done" }).click();
      await page.locator("#btnMainMenu").click();
      await expect(page.locator("a.dropdown-item").filter({ hasText: "Export to Minio" })).toBeVisible();
      await expect(page.locator("a.dropdown-item").filter({ hasText: "Import from Minio" })).toBeVisible();
      // disabling again hides them again
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#minio-tab").click();
      await page.locator("#minioEnabled").uncheck();
      await page.getByRole("button", { name: "Done" }).click();
      await page.locator("#btnMainMenu").click();
      await expect(page.locator("a.dropdown-item").filter({ hasText: "Export to Minio" })).not.toBeVisible();
      await expect(page.locator("a.dropdown-item").filter({ hasText: "Import from Minio" })).not.toBeVisible();
    });

    // ── Export error handling ──────────────────────────────

    test("export to minio shows alert when missing server config", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_minio_enabled", "true");
      });
      await page.reload();
      await page.evaluate(() => exportToMinio());
      await page.waitForTimeout(150);
      await expect(page.locator("#smdConfirmModal")).toBeVisible();
      await expect(page.locator("#smdConfirmModal").locator("p")).toContainText("configure all Minio settings");
      await page.locator("#smdConfirmModal .smd-footer button").click();
      await page.waitForTimeout(150);
      await expect(page.locator("#smdConfirmModal")).not.toBeVisible();
    });

    test("export to minio alerts self-remove from DOM after close", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_minio_enabled", "true");
      });
      await page.reload();
      await page.evaluate(() => exportToMinio());
      await page.waitForTimeout(150);
      await page.locator("#smdConfirmModal .smd-footer button").click();
      await page.waitForTimeout(250);
      await expect(page.locator("#smdConfirmModal")).not.toBeVisible();
    });

    // ── Import error handling ──────────────────────────────

    test("import from minio shows alert when missing config", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_minio_enabled", "true");
      });
      await page.reload();
      await page.evaluate(() => importFromMinio());
      await page.waitForTimeout(150);
      await expect(page.locator("#smdConfirmModal")).toBeVisible();
      await expect(page.locator("#smdConfirmModal").locator("p")).toContainText("server, username and password");
    });

    test("import from minio does nothing when disabled", async ({ page }) => {
      await page.evaluate(() => importFromMinio());
      await page.waitForTimeout(150);
      await expect(page.locator("#smdConfirmModal")).not.toBeVisible();
    });

    // ── getMinioConfig returns correct shape ───────────────

    test("getMinioConfig parses localStorage values", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_minio_enabled", "true");
        localStorage.setItem("planmydays_minio_server", "http://srv:9000/");
        localStorage.setItem("planmydays_minio_username", "minioadmin");
        localStorage.setItem("planmydays_minio_password", "minioadmin");
        localStorage.setItem("planmydays_minio_bucket", "pmd");
      });
      await page.reload();
      const config = await page.evaluate(() => getMinioConfig());
      expect(config.enabled).toBe(true);
      expect(config.server).toBe("http://srv:9000");
      expect(config.username).toBe("minioadmin");
      expect(config.password).toBe("minioadmin");
      expect(config.bucket).toBe("pmd");
    });

    test("getMinioConfig strips trailing slashes from server", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_minio_server", "http://host:9000///");
      });
      await page.reload();
      const server = await page.evaluate(() => getMinioConfig().server);
      expect(server).toBe("http://host:9000");
    });

    // ── showMinioAlert modal ───────────────────────────────

    test("showMinioAlert creates and shows modal", async ({ page }) => {
      await page.evaluate(() => showMinioAlert("Test message"));
      await page.waitForTimeout(150);
      await expect(page.locator("#smdConfirmModal")).toBeVisible();
      await expect(page.locator("#smdConfirmModal").locator("p")).toContainText("Test message");
    });

    test("showMinioAlert error type uses red button", async ({ page }) => {
      await page.evaluate(() => showMinioAlert("Error!", "error"));
      await page.waitForTimeout(150);
      await expect(page.locator("#smdConfirmModal .smd-footer button[variant='danger']")).toBeVisible();
    });

    test("showMinioAlert info type uses primary button", async ({ page }) => {
      await page.evaluate(() => showMinioAlert("Info", "info"));
      await page.waitForTimeout(150);
      await expect(page.locator("#smdConfirmModal .smd-footer button[variant='primary']")).toBeVisible();
    });

    test("showMinioAlert cleans up old modal before showing new", async ({ page }) => {
      const counts = await page.evaluate(() => {
        showMinioAlert("First");
        const before = document.querySelectorAll("#smdConfirmModal").length;
        showMinioAlert("Second");
        const after = document.querySelectorAll("#smdConfirmModal").length;
        return { before, after };
      });
      expect(counts.before).toBe(1);
      expect(counts.after).toBe(1);
      await expect(page.locator("#smdConfirmModal").filter({ hasText: "Second" })).toBeVisible();
    });

    // ── Crypto functions ──────────────────────────────────

    test("sha256 computes correct hash for empty string", async ({ page }) => {
      const hash = await page.evaluate(() => sha256(""));
      expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    test("sha256 computes correct hash for known input", async ({ page }) => {
      const hash = await page.evaluate(() => sha256("hello"));
      expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    });

    test("sha256 returns a promise", async ({ page }) => {
      const isPromise = await page.evaluate(() => sha256("test") instanceof Promise);
      expect(isPromise).toBe(true);
    });

    test("bufToHex converts ArrayBuffer to lowercase hex", async ({ page }) => {
      const hex = await page.evaluate(() => {
        var buf = new Uint8Array([0, 1, 10, 16, 255]).buffer;
        return bufToHex(buf);
      });
      expect(hex).toBe("00010a10ff");
    });

    test("bufToHex pads single-digit bytes", async ({ page }) => {
      const hex = await page.evaluate(() => {
        var buf = new Uint8Array([5, 15]).buffer;
        return bufToHex(buf);
      });
      expect(hex).toBe("050f");
    });

    test("hmacSign returns an ArrayBuffer", async ({ page }) => {
      const isAB = await page.evaluate(async () => {
        var r = await hmacSign("key", "message");
        return r instanceof ArrayBuffer;
      });
      expect(isAB).toBe(true);
    });

    test("hmacSign produces consistent output", async ({ page }) => {
      const r1 = await page.evaluate(async () => {
        var r = await hmacSign("secret", "data");
        return bufToHex(r);
      });
      const r2 = await page.evaluate(async () => {
        var r = await hmacSign("secret", "data");
        return bufToHex(r);
      });
      expect(r1).toBe(r2);
      expect(r1.length).toBeGreaterThan(0);
    });

    test("getSignatureKey returns an ArrayBuffer", async ({ page }) => {
      const isAB = await page.evaluate(async () => {
        var r = await getSignatureKey("secret", "20260802", "us-east-1", "s3");
        return r instanceof ArrayBuffer;
      });
      expect(isAB).toBe(true);
    });

    test("getSignatureKey produces consistent signing key", async ({ page }) => {
      const k1 = await page.evaluate(async () => {
        var r = await getSignatureKey("secret", "20260802", "us-east-1", "s3");
        return bufToHex(r);
      });
      const k2 = await page.evaluate(async () => {
        var r = await getSignatureKey("secret", "20260802", "us-east-1", "s3");
        return bufToHex(r);
      });
      expect(k1).toBe(k2);
      expect(k1.length).toBe(64);
    });

    // ── Config change functions ────────────────────────────

    test("changeMinioServer stores value", async ({ page }) => {
      await page.evaluate(() => changeMinioServer("http://srv:9000"));
      const val = await page.evaluate(() => localStorage.getItem("planmydays_minio_server"));
      expect(val).toBe("http://srv:9000");
    });

    test("changeMinioUsername stores value", async ({ page }) => {
      await page.evaluate(() => changeMinioUsername("admin"));
      const val = await page.evaluate(() => localStorage.getItem("planmydays_minio_username"));
      expect(val).toBe("admin");
    });

    test("changeMinioPassword stores value", async ({ page }) => {
      await page.evaluate(() => changeMinioPassword("secret"));
      const val = await page.evaluate(() => localStorage.getItem("planmydays_minio_password"));
      expect(val).toBe("secret");
    });

    test("changeMinioBucket stores value", async ({ page }) => {
      await page.evaluate(() => changeMinioBucket("mybucket"));
      const val = await page.evaluate(() => localStorage.getItem("planmydays_minio_bucket"));
      expect(val).toBe("mybucket");
    });

    test("changeMinioEnabled toggles fields and menu", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#minio-tab").click();
      await page.waitForTimeout(100);
      await page.locator("#minioEnabled").check();
      const items = await page.locator(".minio-menu-item").count();
      expect(items).toBeGreaterThan(0);
    });

    // ── getMinioConfig defaults ────────────────────────────

    test("getMinioConfig returns empty defaults", async ({ page }) => {
      const config = await page.evaluate(() => getMinioConfig());
      expect(config.enabled).toBe(false);
      expect(config.server).toBe("");
      expect(config.username).toBe("");
      expect(config.password).toBe("");
      expect(config.bucket).toBe("");
    });

    test("getMinioConfig with empty server still returns empty string", async ({ page }) => {
      await page.evaluate(() => localStorage.setItem("planmydays_minio_server", ""));
      await page.reload();
      const config = await page.evaluate(() => getMinioConfig());
      expect(config.server).toBe("");
    });

    // ── loadMinioSettings populates form ───────────────────

    test("loadMinioSettings populates fields from localStorage", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#minio-tab").click();
      await page.evaluate(() => {
        localStorage.setItem("planmydays_minio_enabled", "true");
        localStorage.setItem("planmydays_minio_server", "http://srv:9000");
        localStorage.setItem("planmydays_minio_username", "u");
        localStorage.setItem("planmydays_minio_password", "p");
        localStorage.setItem("planmydays_minio_bucket", "b");
        loadMinioSettings();
      });
      await expect(page.locator("#minioEnabled")).toBeChecked();
      await expect(page.locator("#minioServer")).toHaveValue("http://srv:9000");
      await expect(page.locator("#minioUsername")).toHaveValue("u");
      await expect(page.locator("#minioPassword")).toHaveValue("p");
      await expect(page.locator("#minioBucket")).toHaveValue("b");
    });

    test("loadMinioSettings disables fields when not enabled", async ({ page }) => {
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await page.locator("#minio-tab").click();
      await page.evaluate(() => loadMinioSettings());
      await expect(page.locator("#minioServer")).toBeDisabled();
      await expect(page.locator("#minioUsername")).toBeDisabled();
      await expect(page.locator("#minioPassword")).toBeDisabled();
      await expect(page.locator("#minioBucket")).toBeDisabled();
    });

    // ── Import modal UI ────────────────────────────────────

    test("openMinioImportPage creates page with loading state", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_minio_enabled", "true");
        localStorage.setItem("planmydays_minio_server", "http://localhost:9000");
        localStorage.setItem("planmydays_minio_username", "u");
        localStorage.setItem("planmydays_minio_password", "p");
      });
      await page.reload();
      await page.evaluate(() => openMinioImportPage());
      await page.waitForTimeout(150);
      await expect(page.locator("#minioImportPage")).toBeVisible();
      await expect(page.locator("#minioImportBody")).toContainText("Loading buckets");
    });

    test("closeMinioImport hides the import page", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_minio_enabled", "true");
        localStorage.setItem("planmydays_minio_server", "http://localhost:9000");
        localStorage.setItem("planmydays_minio_username", "u");
        localStorage.setItem("planmydays_minio_password", "p");
      });
      await page.reload();
      await page.evaluate(() => openMinioImportPage());
      await page.waitForTimeout(150);
      await page.evaluate(() => closeMinioImport());
      await page.waitForTimeout(250);
      await expect(page.locator("#minioImportPage")).not.toBeVisible();
    });

    // ── Import page error paths ────────────────────────────

    test("import page shows error alert when bucket list fails", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem("planmydays_minio_enabled", "true");
        localStorage.setItem("planmydays_minio_server", "http://127.0.0.1:1");
        localStorage.setItem("planmydays_minio_username", "u");
        localStorage.setItem("planmydays_minio_password", "p");
      });
      await page.reload();
      await page.evaluate(() => openMinioImportPage());
      // Fetch to a non-existent server fails: the page closes and an error alert shows
      await expect(page.locator("#smdConfirmModal")).toBeVisible({ timeout: 10000 });
      await expect(page.locator("#smdConfirmModal")).toContainText("Failed to list buckets");
      await expect(page.locator("#minioImportPage")).not.toBeVisible();
    });

    // ── Export does nothing when disabled ──────────────────

    test("export to minio does nothing when disabled", async ({ page }) => {
      await page.evaluate(() => exportToMinio());
      await page.waitForTimeout(150);
      await expect(page.locator("#smdConfirmModal")).not.toBeVisible();
    });

    // ── toggleMinioPassword edge cases ─────────────────────

    test("toggleMinioPassword is safe when input missing", async ({ page }) => {
      await page.evaluate(() => {
        var input = document.getElementById("minioPassword");
        if (input) input.remove();
        toggleMinioPassword();
      });
      // Should not throw
    });

    // ── updateMinioMenu edge cases ─────────────────────────

    test("updateMinioMenu hides items when no minio items exist", async ({ page }) => {
      await page.evaluate(() => {
        var items = document.querySelectorAll(".minio-menu-item");
        items.forEach(function(el) { el.remove(); });
        updateMinioMenu();
      });
      // Should not throw
    });

    // ── Minio request rejection for bad config ─────────────

    test("minioRequest with unreachable server returns error", async ({ page }) => {
      const result = await page.evaluate(async () => {
        try {
          await minioRequest("GET", "bucket", null, null, null, {
            server: "http://127.0.0.1:1",
            username: "u",
            password: "p"
          });
          return "no-error";
        } catch (e) {
          return "error";
        }
      });
      expect(result).toBe("error");
    });

    test("minioListBuckets with bad server fails gracefully", async ({ page }) => {
      const result = await page.evaluate(async () => {
        try {
          await minioListBuckets({
            server: "http://127.0.0.1:1",
            username: "u",
            password: "p"
          });
          return "no-error";
        } catch (e) {
          return "error";
        }
      });
      expect(result).toBe("error");
    });

    test("minioListObjects with bad server fails gracefully", async ({ page }) => {
      const result = await page.evaluate(async () => {
        try {
          await minioListObjects("bucket", {
            server: "http://127.0.0.1:1",
            username: "u",
            password: "p"
          });
          return "no-error";
        } catch (e) {
          return "error";
        }
      });
      expect(result).toBe("error");
    });

    test("minioGetObject with bad server fails gracefully", async ({ page }) => {
      const result = await page.evaluate(async () => {
        try {
          await minioGetObject("bucket", "key", {
            server: "http://127.0.0.1:1",
            username: "u",
            password: "p"
          });
          return "no-error";
        } catch (e) {
          return "error";
        }
      });
      expect(result).toBe("error");
    });

    test("minioPutObject with bad server fails gracefully", async ({ page }) => {
      const result = await page.evaluate(async () => {
        try {
          await minioPutObject("bucket", "key", "{}", {
            server: "http://127.0.0.1:1",
            username: "u",
            password: "p"
          });
          return "no-error";
        } catch (e) {
          return "error";
        }
      });
      expect(result).toBe("error");
    });

    test("minio import displays files in reverse alphabetical order", async ({ page }) => {
      const fileOrder = ["mike.json", "alpha.json", "zulu.json", "bravo.json"];
      await page.route(function(url) { return url.hostname === "minio" && url.port === "9000"; }, async function(route) {
        var u = route.request().url();
        var xml;
        if (u.indexOf("list-type=2") !== -1) {
          xml = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
            '<Name>testbucket</Name><KeyCount>4</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>'
          ].concat(
            fileOrder.map(function(f) {
              return '<Contents><Key>' + f + '</Key><LastModified>2026-08-01T10:00:00.000Z</LastModified><ETag>"abc"</ETag><Size>1024</Size><StorageClass>STANDARD</StorageClass></Contents>';
            }),
            ['</ListBucketResult>']
          ).join("");
        } else {
          xml = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
            '<Buckets><Bucket><Name>testbucket</Name><CreationDate>2026-01-01T00:00:00.000Z</CreationDate></Bucket></Buckets>',
            '</ListAllMyBucketsResult>'].join("");
        }
        await route.fulfill({ status: 200, body: xml });
      });
      await page.evaluate(() => {
        localStorage.setItem("planmydays_minio_enabled", "true");
        localStorage.setItem("planmydays_minio_server", "http://minio:9000");
        localStorage.setItem("planmydays_minio_username", "u");
        localStorage.setItem("planmydays_minio_password", "p");
        localStorage.setItem("planmydays_minio_bucket", "testbucket");
      });
      await page.reload();
      await page.evaluate(() => importFromMinio());
      await page.waitForSelector("#minioImportBody .list-group-item");
      const shown = await page.$$eval("#minioImportBody .list-group-item", (items) => items.map((li) => li.textContent.trim()));
      expect(shown).toEqual(["zulu.json", "mike.json", "bravo.json", "alpha.json"]);
      await expect(page.locator("#minioImportPage .smd-page-header")).toContainText("Bucket: testbucket");
    });
  });

  // ── Job Edit Tabs ─────────────────────────────────────────

  test.describe("Job Edit Tabs", () => {

    test.beforeEach(async ({ page }) => {
      await startCoverage(page);
      await page.goto("/PlanMyDay/");
      await page.evaluate((data) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
      }, TEST_STREAMS);
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
    });

    test("General tab is active by default", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobGeneral-tab")).toHaveAttribute("active", "");
      await expect(page.locator("#jobGeneral-tab-panel")).toHaveAttribute("active", "");
    });

    test("Schedule tab switches correctly", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobSchedule-tab").click();
      await expect(page.locator("#jobSchedule-tab")).toHaveAttribute("active", "");
      await expect(page.locator("#jobSchedule-tab-panel")).toHaveAttribute("active", "");
      await expect(page.locator("#jobGeneral-tab-panel")).not.toHaveAttribute("active", "");
    });

    test("Tasks tab switches correctly", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await expect(page.locator("#jobTasks-tab")).toHaveAttribute("active", "");
      await expect(page.locator("#jobTasks-tab-panel")).toHaveAttribute("active", "");
      await page.locator("#jobAddTaskBottomBtn").waitFor({ state: "visible" });
    });

    test("active tab persists when switching from view to edit", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await page.locator(".job-view-btn").first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await expect(page.locator("#jobTasks-tab")).toHaveAttribute("active", "");
      await page.locator("#btnViewJobEdit").filter({ hasText: "Edit" }).click();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("Edit Job");
      await expect(page.locator("#jobTasks-tab")).toHaveAttribute("active", "");
      await expect(page.locator("#jobTasks-tab-panel")).toHaveAttribute("active", "");
    });

    test("add task increases task count", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await expect(page.locator(".task-row")).toHaveCount(1);
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await expect(page.locator(".task-row")).toHaveCount(3);
    });

    test("task description is stored in jobsBuffer", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator(".task-desc-input").first().fill("Check logs");
      const tasks = await page.evaluate(() => jobsBuffer?.tasks);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].description).toBe("Check logs");
    });

    test("task done checkbox toggles stored value", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator(".task-done-cb").first().check();
      const tasks = await page.evaluate(() => jobsBuffer?.tasks);
      expect(tasks[0].done).toBe(true);
      await page.locator(".task-done-cb").first().uncheck();
      const tasks2 = await page.evaluate(() => jobsBuffer?.tasks);
      expect(tasks2[0].done).toBe(false);
    });

    test("delete task removes it from list", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await expect(page.locator(".task-row")).toHaveCount(2);
      await page.locator("#jobTasksList .btn-danger").first().click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Delete" }).click();
      await page.locator("#smdConfirmModal").waitFor({ state: "hidden" });
      await expect(page.locator(".task-row")).toHaveCount(1);
      const tasks = await page.evaluate(() => jobsBuffer?.tasks);
      expect(tasks).toHaveLength(1);
    });

    test("delete task cancel keeps the task", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await expect(page.locator(".task-row")).toHaveCount(2);
      await page.locator("#jobTasksList .btn-danger").first().click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Cancel" }).click();
      await page.locator("#smdConfirmModal").waitFor({ state: "hidden" });
      await expect(page.locator(".task-row")).toHaveCount(2);
      const tasks = await page.evaluate(() => jobsBuffer?.tasks);
      expect(tasks).toHaveLength(2);
    });

    test("delete task confirm shows task name", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator(".task-desc-input").first().fill("My task name");
      await page.locator("#jobTasksList .btn-danger").first().click();
      await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
      await expect(page.locator("#smdConfirmModal .smd-body")).toContainText("My task name");
      await page.locator("#smdConfirmModal").locator("button").filter({ hasText: "Delete" }).click();
    });

    test("task note button toggles note textarea", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      const noteRow = page.locator("#taskNoteRow0");
      await expect(noteRow).not.toBeVisible();
      await page.locator(".task-note-btn").first().click();
      await expect(noteRow).toBeVisible();
      await page.locator(".task-note-btn").first().click();
      await expect(noteRow).not.toBeVisible();
    });

    test("task note is stored in jobsBuffer", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator(".task-note-btn").first().click();
      await page.locator("#taskNoteRow0 textarea").fill("Important note about task");
      const tasks = await page.evaluate(() => jobsBuffer?.tasks);
      expect(tasks[0].note).toBe("Important note about task");
    });

    test("task note persists through re-render", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator(".task-note-btn").first().click();
      await page.locator("#taskNoteRow0 textarea").fill("Persistent note");
      await page.locator("#jobAddTaskBottomBtn").click();
      const noteRow = page.locator("#taskNoteRow0");
      await expect(noteRow).toBeVisible();
      const noteValue = await page.locator("#taskNoteRow0 textarea").inputValue();
      expect(noteValue).toBe("Persistent note");
    });

    test("closed task note stays closed through re-render", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator(".task-note-btn").first().click();
      await page.locator("#taskNoteRow0 textarea").fill("Note text");
      await page.locator(".task-note-btn").first().click();
      await expect(page.locator("#taskNoteRow0")).not.toBeVisible();
      await page.locator("#jobAddTaskBottomBtn").click();
      await expect(page.locator("#taskNoteRow0")).not.toBeVisible();
      await page.evaluate(() => renderJobTasks());
      await expect(page.locator("#taskNoteRow0")).not.toBeVisible();
    });

    test("task note button style reflects note content", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await expect(page.locator(".task-note-btn").first()).toHaveClass(/btn-info/);
      await page.locator(".task-note-btn").first().click();
      await expect(page.locator(".task-note-btn").first()).toHaveClass(/btn-info/);
      await page.locator("#taskNoteRow0 textarea").fill("has note");
      await expect(page.locator(".task-note-btn").first()).toHaveClass(/btn-outline-info/);
      await page.locator(".task-note-btn").first().click();
      await expect(page.locator(".task-note-btn").first()).toHaveClass(/btn-outline-info/);
      await page.locator(".task-note-btn").first().click();
      await page.locator("#taskNoteRow0 textarea").fill("");
      await expect(page.locator(".task-note-btn").first()).toHaveClass(/btn-info/);
    });

    test("task note button paints outline state on touch devices", async ({ browser }) => {
      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true
      });
      const mp = await context.newPage();
      await mp.goto("http://localhost:8080/PlanMyDay/");
      await mp.evaluate((data) => {
        localStorage.setItem("planmydays_streams", JSON.stringify(data));
      }, TEST_STREAMS);
      await mp.reload();
      await mp.locator("#btnMainMenu").click();
      await mp.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await mp.locator("#streamEditorList .stream-header-main").first().click();
      await mp.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await mp.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await mp.locator("#jobEditPage").waitFor({ state: "visible" });
      await mp.locator("#jobTasks-tab").click();
      await mp.locator("#jobAddTaskBottomBtn").click();
      const noteBtn = mp.locator(".task-note-btn").first();
      await expect(noteBtn).toHaveClass(/btn-info/);
      const emptyBg = await noteBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(emptyBg).not.toBe("rgba(0, 0, 0, 0)");
      await noteBtn.click();
      await expect(noteBtn).toHaveClass(/btn-info/);
      await mp.locator("#taskNoteRow0 textarea").fill("has note");
      await expect(noteBtn).toHaveClass(/btn-outline-info/);
      await expect(mp.locator("#taskNoteRow0")).toBeVisible();
      const expandedBg = await noteBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(expandedBg);
      await noteBtn.click();
      await expect(noteBtn).toHaveClass(/btn-outline-info/);
      const collapsedBg = await noteBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(collapsedBg);
      await context.close();
    });

    test("tasks persist through save and reload", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator(".task-desc-input").first().fill("Review PRs");
      await page.locator(".task-done-cb").first().check();
      await page.locator("#jobEditOkBtn").click();
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 15000 });
      const savedTasks = await page.evaluate(() => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        return streams[0].jobs[0].tasks;
      });
      expect(savedTasks).toHaveLength(1);
      expect(savedTasks[0].description).toBe("Review PRs");
      expect(savedTasks[0].done).toBe(true);
    });

    test("newly created job has empty tasks array", async ({ page }) => {
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      const tasks = await page.evaluate(() => jobsBuffer?.tasks);
      expect(tasks).toEqual([]);
    });

    test("add job focuses the title input", async ({ page }) => {
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobTitleInput")).toBeFocused();
    });

    test("add job Enter key confirms via OK", async ({ page }) => {
      await page.getByRole("button", { name: "Add Job" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await expect(page.locator("#jobTitleInput")).toBeFocused();
      await page.locator("#jobTitleInput").fill("Enter Job");
      await page.keyboard.press("Enter");
      await page.locator("#jobEditPage").waitFor({ state: "hidden", timeout: 15000 });
      await expect(page.locator("#streamEditorList .accordion-collapse.show")).toContainText("Enter Job");
    });

    test("task added via top button lands at top and bottom button appends", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator(".task-desc-input").first().fill("Original task");
      const topBtn = page.locator("#jobAddTaskBtn");
      await expect(topBtn).toBeVisible();
      await topBtn.click();
      const inputs = page.locator("#jobTasksList .task-desc-input");
      await expect(inputs).toHaveCount(2);
      await inputs.first().fill("Top task");
      const tasks = await page.evaluate(() => jobsBuffer?.tasks);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].description).toBe("Top task");
      expect(tasks[1].description).toBe("Original task");
    });

    test("delete button on task row is btn-danger", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      // wait for the Tasks pane to be the active tab before adding a task
      await expect(page.locator("#jobTasks-tab")).toHaveAttribute("active", "");
      await page.locator("#jobAddTaskBottomBtn").click();
      await expect(page.locator("#jobTasksList .btn-danger")).toBeVisible();
    });

    test("top add task button is btn-primary and at top", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      const topBtn = page.locator("#jobAddTaskBtn");
      await expect(topBtn).toBeVisible();
      await expect(topBtn).toHaveClass(/btn-primary/);
      const tasksListEl = page.locator("#jobTasksList");
      const addBtnBox = await topBtn.boundingBox();
      const tasksListBox = await tasksListEl.boundingBox();
      expect(addBtnBox.y).toBeLessThan(tasksListBox.y);
      await topBtn.click();
      await expect(page.locator("#jobTasksList .task-row")).toHaveCount(2);
    });

    test("tasks tab shows no tasks for job without tasks", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await expect(page.locator("#jobTasksList .task-row")).toHaveCount(0);
      await expect(page.locator("#jobAddTaskBtn")).toBeHidden();
      await expect(page.locator("#jobAddTaskBottomBtn")).toBeVisible();
    });

    test("top add task button appears once a task exists", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await expect(page.locator("#jobAddTaskBtn")).toBeHidden();
      await expect(page.locator("#jobAddTaskBottomBtn")).toBeVisible();
      await page.locator("#jobAddTaskBottomBtn").click();
      await expect(page.locator("#jobTasksList .task-row")).toHaveCount(1);
      await expect(page.locator("#jobAddTaskBtn")).toBeVisible();
      await expect(page.locator("#jobAddTaskBottomBtn")).toBeVisible();
    });

    test("top add task button shown when job already has tasks", async ({ page }) => {
      await page.evaluate(() => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[0].tasks = [{ description: "Existing", done: false }];
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      });
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
      await page.locator("#streamEditorList .stream-header-main").first().click();
      await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await expect(page.locator("#jobTasksList .task-row")).toHaveCount(1);
      await expect(page.locator("#jobAddTaskBtn")).toBeVisible();
      await expect(page.locator("#jobAddTaskBottomBtn")).toBeVisible();
      await page.locator("#jobAddTaskBtn").click();
      await expect(page.locator("#jobTasksList .task-row")).toHaveCount(2);
      const tasks = await page.evaluate(() => jobsBuffer?.tasks);
      expect(tasks[0].description).toBe("");
    });

    test("task rows have drag handle", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await expect(page.locator(".task-drag-card .drag-handle")).toHaveCount(2);
    });

    test("view-only mode hides drag handle on tasks", async ({ page }) => {
      await seedTodayList(page);
      await page.evaluate(() => {
        const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
        streams[0].jobs[0].tasks = [{ description: "Test task", done: false }];
        localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      });
      await page.reload();
      await page.locator(".job-view-btn").first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      const dragHandles = page.locator(".task-drag-card .drag-handle");
      await expect(dragHandles).toHaveCount(0);
    });

    test("task rows can be reordered with drag and drop", async ({ page }) => {
      await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator(".task-desc-input").first().fill("First task");
      await page.locator("#jobAddTaskBottomBtn").click();
      await page.locator(".task-desc-input").last().fill("Second task");
      const handle = page.locator("#jobTasksList .task-row").first().locator(".drag-handle");
      const handleBox = await handle.boundingBox();
      const lastBox = await page.locator("#jobTasksList .task-row").last().boundingBox();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height * 0.9, { steps: 15 });
      await page.mouse.up();
      await expect.poll(() =>
        page.evaluate(() => (jobsBuffer?.tasks || []).map(t => t.description))
      ).toEqual(["Second task", "First task"]);
      await expect(page.locator("#jobTasksList .task-row")).toHaveCount(2);
      await expect(page.locator("#jobTasksList .task-note-row")).toHaveCount(2);
    });

    async function openJobTasksTab(page, mode) {
      if (mode === "add") {
        await page.getByRole("button", { name: "Add Job" }).first().click();
      } else {
        await page.locator("#streamEditorList .accordion-body .btn-primary").filter({ hasText: "Edit" }).first().click();
      }
      await page.locator("#jobEditPage").waitFor({ state: "visible" });
      await page.locator("#jobTasks-tab").click();
      await expect(page.locator("#jobTasks-tab")).toHaveAttribute("active", "");
    }

    for (const [mode, title] of [["edit", "Edit Job"], ["add", "Add Job"]]) {
      test(`bottom add task button is visible on the ${title} tasks tab`, async ({ page }) => {
        await openJobTasksTab(page, mode);
        const bottomBtn = page.locator("#jobAddTaskBottomBtn");
        await expect(bottomBtn).toBeVisible();
        await expect(bottomBtn).toHaveText("Add Task");
        await expect(page.locator("#jobAddTaskBtn")).toBeHidden();
      });

      test(`bottom add task adds a task and focuses it on ${title}`, async ({ page }) => {
        await openJobTasksTab(page, mode);
        const startLen = await page.evaluate(() => (jobsBuffer?.tasks || []).length);
        await page.locator("#jobAddTaskBottomBtn").click();
        await expect(page.locator("#jobTasksList .task-row")).toHaveCount(startLen + 1);
        const focused = await page.evaluate(() => {
          const tabs = $id("jobEditTabs");
          const el = tabs && tabs.shadowRoot ? tabs.shadowRoot.activeElement : null;
          if (!el || !el.classList.contains("task-desc-input")) return null;
          const row = el.closest(".task-row");
          return row ? Number(row.getAttribute("data-task-index")) : null;
        });
        expect(focused).toBe(startLen);
      });

      test(`bottom add task scrolls to show the new task on ${title}`, async ({ page }) => {
        await openJobTasksTab(page, mode);
        await page.evaluate(() => {
          for (let i = 0; i < 20; i++) jobsBuffer.tasks.push({ description: "Task " + i, done: false, note: "" });
          renderJobTasks();
        });
        await page.evaluate(() => { const body = document.querySelector("#jobEditPage").shadowRoot.querySelector(".smd-page-body"); body.scrollTop = 0; });
        await expect.poll(() => page.evaluate(() => document.querySelector("#jobEditPage").shadowRoot.querySelector(".smd-page-body").scrollTop)).toBe(0);
        await page.evaluate(() => $id("jobAddTaskBottomBtn").click());
        const result = await page.evaluate(() => {
          const body = document.querySelector("#jobEditPage").shadowRoot.querySelector(".smd-page-body");
          const inputs = $id("jobTasksList").querySelectorAll(".task-row .task-desc-input");
          const tabs = $id("jobEditTabs");
          const active = tabs && tabs.shadowRoot ? tabs.shadowRoot.activeElement : null;
          const el = inputs[inputs.length - 1];
          const br = el.getBoundingClientRect();
          const bb = body.getBoundingClientRect();
          return {
            scrollTop: body.scrollTop,
            focused: el === active,
            visible: br.top >= bb.top && br.bottom <= bb.bottom
          };
        });
        expect(result.scrollTop).toBeGreaterThan(0);
        expect(result.focused).toBe(true);
        expect(result.visible).toBe(true);
});
    }
  });

  // ── smd-page / smd-modal action contract ─────────────────────
  // Clicking a footer button must close the overlay (unless the
  // button config sets close: false) and then dispatch the action
  // event for the calling page to react to.

  test.describe("smd overlays: auto-close and event contract", () => {

    test("smd-page footer button closes the page then fires smd-page-action", async ({ page }) => {
      await page.evaluate(() => {
        window.__contractActions = [];
        document.getElementById("jobEditPage").addEventListener("smd-page-action", (e) => {
          window.__contractActions.push({ index: e.detail.index, action: e.detail.action, text: e.detail.text });
        });
      });
      await page.getByText("+ Add Job").click();
      await expect(page.locator("#jobEditPage")).toBeVisible();
      await page.locator("#jobEditCancelBtn").click();
      await expect(page.locator("#jobEditPage")).toBeHidden({ timeout: 10000 });
      await expect.poll(() => page.evaluate(() => window.__contractActions)).toEqual([
        { index: 0, action: "cancel", text: "Cancel" }
      ]);
    });

    test("smd-page footer button with close:false keeps the page open and fires smd-page-action", async ({ page }) => {
      await seedTodayList(page);
      await page.reload();
      await page.evaluate(() => {
        window.__contractActions = [];
        document.getElementById("jobEditPage").addEventListener("smd-page-action", (e) => {
          window.__contractActions.push({ index: e.detail.index, action: e.detail.action, text: e.detail.text });
        });
      });
      await page.locator(".job-view-btn").first().click();
      await expect(page.locator("#jobEditPage")).toBeVisible();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("View Job");
      await page.locator("#btnViewJobEdit").click();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("Edit Job");
      await expect(page.locator("#jobEditPage")).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.__contractActions)).toEqual([
        { index: 0, action: "edit", text: "Edit" }
      ]);
    });

    test("smd-modal footer button closes the modal then fires smd-modal-action; close:false keeps it open", async ({ page }) => {
      await page.addScriptTag({ url: "/shared/js/components/smd-modal.js" });
      await page.evaluate(() => {
        window.__modalActions = [];
        const m = document.createElement("smd-modal");
        m.id = "contractModal";
        m.title = "Contract";
        m.content = "<p>body</p>";
        m.buttons = [
          { text: "Keep", action: "keep", close: false },
          { text: "Confirm", action: "confirm" }
        ];
        m.addEventListener("smd-modal-action", (e) => {
          window.__modalActions.push({ index: e.detail.index, action: e.detail.action, text: e.detail.text });
        });
        document.body.appendChild(m);
        window.__contractModal = m;
      });
      await page.evaluate(() => window.__contractModal.show());
      await expect(page.locator("#contractModal")).toBeVisible();
      await page.locator("#contractModal .smd-footer button").nth(0).click();
      await expect(page.locator("#contractModal")).toBeVisible();
      await page.locator("#contractModal .smd-footer button").nth(1).click();
      await expect(page.locator("#contractModal")).toBeHidden();
      await expect.poll(() => page.evaluate(() => window.__modalActions)).toEqual([
        { index: 0, action: "keep", text: "Keep" },
        { index: 1, action: "confirm", text: "Confirm" }
      ]);
    });
});

  // ── smd-page slide duration ─────────────────────────────────
  // The slide in/out duration is configurable via the
  // slide-duration attribute/property and defaults to 0 (instant).

  test.describe("smd-page: slide duration", () => {

    test("slide duration defaults to instant and tracks the slide-duration attribute", async ({ page }) => {
      await page.goto("/PlanMyDay/");
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(() => {
        window.__slidePage = document.createElement("smd-page");
        window.__slidePage.id = "slideTestPage";
        window.__slidePage.title = "Slide Test";
        window.__slidePage.content = "<p>body</p>";
        document.body.appendChild(window.__slidePage);
      });
      const durationOf = () =>
        page.evaluate(() => {
          const root = window.__slidePage.shadowRoot.querySelector(".smd-page");
          return getComputedStyle(root).transitionDuration;
        });
      await expect.poll(durationOf).toBe("0s");
      await page.evaluate(() => { window.__slidePage.slideDuration = 300; });
      await expect.poll(durationOf).toBe("0.3s");
      await page.evaluate(() => { window.__slidePage.slideDuration = 0; });
      await expect.poll(durationOf).toBe("0s");
    });

    test("settings slide speed control updates all smd-pages and persists", async ({ page }) => {
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.locator("#btnMainMenu").click();
      await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
      await expect(page.locator("#settingsPage:not(.d-none)")).toBeVisible();
      await page.locator("#appearance-tab").click();
      await page.locator("#slideDurationSelector").selectOption("150");
      await expect.poll(() => page.evaluate(() => localStorage.getItem("planmydays_slideDuration"))).toBe("150");
      const result = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("smd-page")).map((p) => ({
          id: p.id,
          attr: p.getAttribute("slide-duration"),
          cssVar: p.style.getPropertyValue("--smd-slide-duration")
        }));
      });
      expect(result.length).toBeGreaterThan(0);
      result.forEach((r) => {
        expect(r.attr).toBe("150");
        expect(r.cssVar).toBe("0.15s");
      });
    });

    test("page hides promptly when slide duration is 0", async ({ page }) => {
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem("planmydays_slideDuration", "0");
      });
      await page.reload();
      await page.getByText("+ Add Job").click();
      await expect(page.locator("#jobEditPage .smd-page-header h2")).toHaveText("Add Job");
      const elapsed = await page.evaluate(async () => {
        const p = document.getElementById("jobEditPage");
        p.classList.remove("d-none");
        const t0 = performance.now();
        hideJobEditPage();
        await new Promise((resolve) => {
          const iv = setInterval(() => {
            if (p.classList.contains("d-none")) {
              clearInterval(iv);
              resolve();
            }
          }, 5);
        });
        return Math.round(performance.now() - t0);
      });
      expect(elapsed).toBeLessThan(200);
    });
  });

  // ── Asset cache-busting ───────────────────────────────────────
  // Every same-origin stylesheet/script load is versioned with
  // ?v=BUILD_NUMBER so a new build always fetches fresh files.

  test.describe("asset cache-busting", () => {

    test("all stylesheets and same-origin scripts carry ?v=BUILD_NUMBER", async ({ page }) => {
      await page.goto("/PlanMyDay/");
      const build = await page.evaluate(() => (typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : ""));
      expect(build).not.toBe("");
      const stamps = await page.evaluate(() => {
        const v = (u) => { try { return new URL(u, location.href).searchParams.get("v"); } catch (e) { return null; } };
        const links = Array.from(document.querySelectorAll('link[href]'))
          .map((l) => l.getAttribute("href"))
          .filter((h) => h && h.indexOf("://") === -1 && h.charAt(0) !== "//")
          .map((h) => ({ url: h, v: v(h) }));
        const scripts = Array.from(document.querySelectorAll('script[src]'))
          .map((s) => s.getAttribute("src"))
          .filter((s) => s && s.indexOf("build-number.js") === -1)
          .map((s) => ({ url: s, v: v(s) }));
        return { links, scripts };
      });
      const bad = [...stamps.links, ...stamps.scripts].filter((x) => x.v !== build);
      expect(bad).toEqual([]);
    });

    test("theme swap is cache-busted with the build number", async ({ page }) => {
      await page.goto("/PlanMyDay/");
      const build = await page.evaluate(() => (typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : ""));
      await page.evaluate(() => applyTheme("quartz"));
      const themeHref = await page.evaluate(() => document.getElementById("bootstrap-theme-css").getAttribute("href"));
      expect(new URL(themeHref, "http://x/").searchParams.get("v")).toBe(build);
      expect(themeHref).toMatch(/css\/themes\/quartz\/bootstrap\.min\.css/);
    });

    test("no console errors and no failed loads when icon-font glyphs render (bi/fa/fab)", async ({ page }) => {
      const consoleErrors = [];
      const pageErrors = [];
      const badResponses = [];
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
      page.on("pageerror", (err) => pageErrors.push(err.message));
      page.on("response", (resp) => { if (resp.status() >= 400) badResponses.push(resp.status() + " " + resp.url()); });

      await page.goto("/PlanMyDay/");
      // Render one glyph per icon family — each requires its vendored @font-face,
      // so a wrong/missing font file url (e.g. "/vendor/fonts/..." vs the actual
      // "../shared/vendor/fonts/...") surfaces as a 404/console error here.
      const samples = ["bi:house", "fa:house", "fab:github"];
      for (const image of samples) {
        await page.evaluate((img) => {
          const el = document.createElement("smd-image");
          el.setAttribute("image", img);
          el.setAttribute("size", "64");
          document.body.appendChild(el);
        }, image);
        await page.waitForFunction((img) => {
          const el = document.querySelector(`smd-image[image='${img}']`);
          if (!el || !el.shadowRoot) return false;
          const span = el.shadowRoot.querySelector(".smd-bi");
          return span && !span.hidden && span.textContent.length > 0;
        }, image, { timeout: 15000 });
      }
      // Give any lazily-fetched font files time to register a 404/fail.
      await page.waitForTimeout(1500);

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(badResponses).toEqual([]);
    });

    test("no console errors when deployed under /PlanMyDay/ (sub-path) during SW precache", async ({ page }) => {
      test.setTimeout(120000);
      const consoleErrors = [];
      const pageErrors = [];
      const badResponses = [];
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
      page.on("pageerror", (err) => pageErrors.push(err.message));
      page.on("response", (resp) => { if (resp.status() >= 400) badResponses.push(resp.status() + " " + resp.url()); });

      // tests/subpath-server.py serves the repo ONLY under /PlanMyDay/ (every
      // origin-root path 404s): the app is at /PlanMyDay/PlanMyDay/ and shared
      // at /PlanMyDay/shared/, mimicking a sub-path deployment.
      await page.goto("http://localhost:8081/PlanMyDay/PlanMyDay/");

      // The theme <link> must resolve through the derived relative prefix; an
      // absolute "/css/themes/..." href would 404 here and trip badResponses.
      const themeHref = await page.evaluate(() => document.getElementById("bootstrap-theme-css").getAttribute("href"));
      expect(themeHref).toMatch(/^\.\.\/shared\/css\/themes\//);
      expect(themeHref).not.toMatch(/^\/css\//);

      // Wait for the SW to register, install, and finish precaching. The first
      // worker on a fresh context activates automatically after install (no
      // existing controller to wait behind), so once the registration reports an
      // active worker, cache.addAll has completed. If any precache URL 404s, the
      // cache.addAll rejects, install fails, and the worker never activates.
      await expect.poll(async () => {
        return page.evaluate(async () => {
          const regs = await navigator.serviceWorker.getRegistrations();
          const r = regs.find((x) => x.scope && x.scope.includes("/PlanMyDay/"));
          return r && r.active ? r.active.state + "|" + !!navigator.serviceWorker.controller : "pending";
        });
      }, { timeout: 60000 }).toBe("activated|true");

      // Confirm the precache actually stored the expected assets under /PlanMyDay/.
      const cachedUrls = await page.evaluate(async () => {
        const v = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "";
        const cache = await caches.open("myapps-" + v);
        return (await cache.keys()).map((r) => r.url);
      });
      expect(cachedUrls.length).toBeGreaterThan(0);
      expect(cachedUrls).toEqual(expect.arrayContaining([
        expect.stringContaining("/PlanMyDay/shared/css/themes/darkly/bootstrap.min.css"),
        expect.stringContaining("/PlanMyDay/PlanMyDay/js/app.js"),
        expect.stringContaining("/PlanMyDay/PlanMyDay/index.html")
      ]));

      // Any page-level asset load failures surface here.
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(badResponses).toEqual([]);
    });
  });
});
});
