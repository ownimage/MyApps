const { test, expect } = require("@playwright/test");
const { createScreenshotAllThemes, seedOneDriveSettings, stubOneDriveBrowser } = require("./screenshot-helpers");

const sampleImagesData = require("../shared/sampleImages.json");

const TEST_STREAMS = [
  {
    id: "stream_1",
    title: "Work",
    description: "Work tasks",
    tab: "progress",
    image: "Work 1",
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
        image: "Computer",
        tasks: []
      },
      {
        id: "job_2",
        title: "Meeting",
        description: "Standup meeting",
        active: true,
        frequency: "weekdays",
        sequence: 2,
        suffix: false,
        dayType: "dayOfYear",
        mod: "",
        image: "Planning",
        tasks: []
      }
    ]
  },
  {
    id: "stream_2",
    title: "Chores",
    description: "Household chores",
    tab: "maintenance",
    image: "Home 1",
    sequence: 2,
    jobs: [
      {
        id: "job_4",
        title: "Dishes",
        description: "Wash dishes",
        active: true,
        frequency: "daily",
        sequence: 1,
        suffix: false,
        dayType: "dayOfYear",
        mod: "",
        image: "Home",
        tasks: []
      },
      {
        id: "job_5",
        title: "Laundry",
        description: "Do laundry",
        active: true,
        frequency: "weekly",
        sequence: 2,
        suffix: false,
        dayType: "dayOfYear",
        mod: "1",
        image: "Checklist",
        tasks: []
      }
    ]
  },
  {
    id: "stream_3",
    title: "Fitness",
    description: "Exercise routines",
    tab: "progress",
    image: "Fitness 1",
    sequence: 3,
    jobs: [
      {
        id: "job_3",
        title: "Run",
        description: "Morning run",
        active: true,
        frequency: "daily",
        sequence: 1,
        suffix: false,
        dayType: "dayOfYear",
        mod: "",
        image: "Running Shoe",
        tasks: [],
        sleepUntil: "",
        time: "07:00"
      },
      {
        id: "job_6",
        title: "Gym",
        description: "Weight training",
        active: false,
        frequency: "weekdays",
        sequence: 2,
        suffix: false,
        dayType: "dayOfYear",
        mod: "",
        image: "Fitness 2",
        tasks: []
      }
    ]
  }
];

const now = new Date();
const todayStr = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");

function futureDateStr(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

function refreshPmdAfterTheme() {
  if (typeof renderMain === "function") renderMain();
  if (typeof renderImagesEditor === "function") {
    const imagesEditor = document.getElementById("imagesEditor");
    if (imagesEditor && !imagesEditor.classList.contains("d-none")) renderImagesEditor();
  }
  const streamsEditor = document.getElementById("streamsEditor");
  const streamEditPageOpen = !!document.getElementById("streamEditPage") && document.getElementById("streamEditPage").hasAttribute("open");
  if (streamsEditor && !streamsEditor.classList.contains("d-none") && !streamEditPageOpen && typeof renderStreamsEditor === "function") {
    renderStreamsEditor();
  }
  const jobEditPageEl = document.getElementById("jobEditPage");
  const jobPageOpen = !!jobEditPageEl && !jobEditPageEl.classList.contains("d-none");
  if (jobPageOpen) {
    if (typeof updateJobStreamPreview === "function") updateJobStreamPreview();
    if (typeof updateJobImagePreview === "function" && typeof jobsBuffer !== "undefined" && jobsBuffer) {
      updateJobImagePreview(jobsBuffer.image);
    }
  }
  if (streamEditPageOpen) {
    if (typeof updateStreamImagePreview === "function" && typeof editBuffer !== "undefined" && editBuffer) {
      updateStreamImagePreview(editBuffer.image);
    }
  }
  // The Gantt chart is a revo-grid that reads the theme tokens itself, so it has
  // to be re-projected on a theme/mode swap (its own MutationObserver only
  // watches `data-bs-theme`, which does not change on a same-mode theme swap).
  if (typeof refreshGanttIfOpen === "function") refreshGanttIfOpen();
}

const screenshotAllThemes = createScreenshotAllThemes("pmd", refreshPmdAfterTheme);

function seedMainView(page) {
  return page.evaluate(({ data, ds }) => {
    localStorage.setItem("planmydays_streams", JSON.stringify(data));
    localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1", "job_2", "job_4", "job_3", "job_5", "job_6"]));
    localStorage.setItem("planmydays_last_gen", ds);
    localStorage.setItem("planmydays_completed", JSON.stringify([]));
  }, { data: TEST_STREAMS, ds: todayStr });
}

test.describe("PlanMyDay - Screenshots", () => {

  test.describe.configure({ timeout: 360000 });

  test.use({
    viewport: { width: 390, height: 797 },
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    hasTouch: true,
    isMobile: true,
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "devicePixelRatio", {
        get: () => 3,
        configurable: true,
      });
    });
    await page.goto("/PlanMyDay/");
    await page.evaluate((images) => {
      localStorage.clear();
      localStorage.setItem("planmydays_fontSize", "xsmall");
      localStorage.setItem("planmydays_iconSize", "small");
      localStorage.setItem("planmydays_density", "compact");
      localStorage.setItem("planmydays_touchSize", "normal");
      localStorage.setItem("shared-images", JSON.stringify(images));
    }, sampleImagesData.images);
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
  });

  test("main view", async ({ page }) => {
    await seedMainView(page);
    await page.reload();
    await page.waitForSelector(".today-drag-card");
    await screenshotAllThemes(page, "main-view.png");
    await page.evaluate(() => changeTouchSize("large"));
    await screenshotAllThemes(page, "main-view-large.png");
  });

  test("main view - split list progress", async ({ page }) => {
    await seedMainView(page);
    await page.evaluate(() => localStorage.setItem("planmydays_splitList", "true"));
    await page.reload();
    await page.waitForSelector(".today-drag-card");
    await screenshotAllThemes(page, "main-view-split-progress.png");
  });

  test("main view - split list maintenance", async ({ page }) => {
    await seedMainView(page);
    await page.evaluate(() => localStorage.setItem("planmydays_splitList", "true"));
    await page.reload();
    await page.waitForSelector(".today-drag-card");
    await page.locator("#todayTabs .smd-tab-btn").filter({ hasText: "Maintenance" }).click();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "main-view-split-maintenance.png");
  });

  test("main view - hide done", async ({ page }) => {
    await seedMainView(page);
    await page.evaluate(() => {
      localStorage.setItem("planmydays_completed", JSON.stringify(["job_1", "job_3"]));
      localStorage.setItem("planmydays_hideDone", "true");
    });
    await page.reload();
    await page.waitForSelector(".today-drag-card");
    await screenshotAllThemes(page, "main-view-hide-done.png");
  });

  test.describe("gantt", () => {
    // The Gantt is a desktop-shaped view: at the phone viewport the grid
    // virtualises the timeline columns off-screen and NO bars render (the scene
    // would be an empty grid), so this scene uses a wide viewport instead.
    test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false });

    test("empty stream edit footer", async ({ page }) => {
      await seedMainView(page);
      await page.evaluate(() => {
        const streams = loadStreams();
        streams.push({ title: "Empty stream", sequence: streams.length + 1, jobs: [] });
        saveStreams(streams);
        openStreamsEditor();
        editStream(streams.length - 1);
      });
      await expect(page.locator("#streamEditPage .smd-page-footer smd-button#btnStreamEditDelete button")).toBeVisible();
      await expect(page.locator("#streamEditPage .smd-page-footer smd-button")).toHaveText(["Cancel", "Delete", "OK"]);
      await screenshotAllThemes(page, "empty-stream-edit.png");
    });

    test("gantt stream drop boundary", async ({ page }) => {
      await seedMainView(page);
      await page.evaluate(() => localStorage.setItem("planmydays_showGantt", "true"));
      await page.reload();
      await page.evaluate(() => openGantt());
      const showBoundary = async () => {
        await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true })));
        await page.mouse.up();
        const source = page.locator(".pmd-gantt-job-name").filter({ hasText: /^Report/ });
        await expect(source).toBeVisible();
        const header = page.locator(".pmd-gantt-stream-title").filter({ hasText: /^Chores$/ });
        const sr = await source.boundingBox();
        const hr = await header.locator("xpath=ancestor::*[contains(@class,'rgRow')]").boundingBox();
        await page.mouse.move(sr.x + sr.width / 2, sr.y + sr.height / 2);
        await page.mouse.down();
        await page.mouse.move(sr.x + sr.width / 2, hr.y + hr.height * .75, { steps: 6 });
        await expect(page.locator(".pmd-gantt-drop-target")).toHaveCount(1);
      };
      await screenshotAllThemes(page, "gantt-stream-drop.png", { beforeCapture: showBoundary });
      await page.mouse.up();
      await expect.poll(() => page.evaluate(() => loadStreams().find(s => s.title === "Chores").jobs[0].title)).toBe("Report");
    });

    test("gantt", async ({ page }) => {
      // The Gantt page only exists once the "Show Gantt" setting is on, and the
      // chart needs seeded streams to draw bars (see TEST_STREAMS).
      test.setTimeout(600000);
      await seedMainView(page);
      await page.evaluate(() => localStorage.setItem("planmydays_showGantt", "true"));
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(() => openGantt());
      await page.waitForFunction(() => document.querySelectorAll(".rg-gantt-bar").length > 0, null, { timeout: 30000 });
      await expect(page.locator("#ganttPage .smd-page-header smd-button")).toHaveCount(8);
      await screenshotAllThemes(page, "gantt.png");
    });
  });

  test("main menu dropdown", async ({ page }) => {
    await page.locator("#btnMainMenu").click();
    await page.waitForSelector(".dropdown-menu.show");
    await page.waitForTimeout(200);
    // Re-hover per theme/mode: each theme re-lays-out the menu (different
    // Bootstrap padding), so a single hover before the loop is lost for themes
    // whose item rect moves away from the fixed pointer.
    const hoverLaunch = async (p) => {
      await p.evaluate(() => { changeAutoHideMenu(true); hideNav(); });
      await expect(p.locator("#mainNav")).not.toHaveClass(/nav-hidden/);
      await p.locator("#mainNav .launch-submenu-toggle").hover();
      await expect(p.locator('#mainNav .launch-submenu-menu .dropdown-item').filter({ hasText: /^Clock$/ })).toBeVisible();
      await p.waitForTimeout(100);
    };
    await hoverLaunch(page);
    await screenshotAllThemes(page, "main-menu-dropdown.png", { beforeCapture: hoverLaunch });
  });

  test("add card modal", async ({ page }) => {
    await seedMainView(page);
    await page.reload();
    await page.getByText("+ Add Job").click();
    await page.locator("#jobEditPage").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "main-screen-add-job.png");
  });

  test("settings", async ({ page }) => {
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
    await page.waitForSelector("#settingsPage:not(.d-none)");
    await screenshotAllThemes(page, "settings.png");
  });

  test("settings - appearance", async ({ page }) => {
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
    await page.waitForSelector("#settingsPage:not(.d-none)");
    await page.locator("#appearance-tab").click();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "settings-appearance.png");
  });

  test("settings - schedule", async ({ page }) => {
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
    await page.waitForSelector("#settingsPage:not(.d-none)");
    await page.locator("#schedule-tab").click();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "settings-schedule.png");
  });

  test("settings - danger zone", async ({ page }) => {
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
    await page.waitForSelector("#settingsPage:not(.d-none)");
    await page.locator("#danger-tab").click();
    await page.locator("#showDanger").check();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "settings-danger.png");
  });

  test("streams editor", async ({ page }) => {
    const streamsWithSleepWait = JSON.parse(JSON.stringify(TEST_STREAMS));
    streamsWithSleepWait[0].jobs[0].sleepUntil = futureDateStr(30);
    streamsWithSleepWait[0].jobs[1].waitFor = "the meeting to start";
    streamsWithSleepWait[0].jobs.push({
      id: "job_7", title: "Water Plants", description: "", active: true,
      frequency: "daily", sequence: 3, suffix: false, dayType: "dayOfYear", mod: "",
      image: "", tasks: []
    });
    streamsWithSleepWait[0].jobs.push({
      id: "job_8", title: "Pay Bills", description: "", active: true,
      frequency: "weekdays", sequence: 4, suffix: false, dayType: "dayOfYear", mod: "",
      image: "", tasks: [], schedule: { type: "weekdays" }
    });
    await page.evaluate((data) => {
      localStorage.setItem("planmydays_streams", JSON.stringify(data));
    }, streamsWithSleepWait);
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
    await page.waitForSelector("#streamEditorList .accordion-item");
    await page.locator("#streamEditorList .stream-header-main").first().click();
    await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
    await page.waitForSelector("#streamEditorList smd-badge[variant=info]", { state: "attached" });
    await expect(page.locator("#streamEditorList .accordion-collapse.show smd-badge[variant=primary]").filter({ hasText: "Weekdays" })).toHaveCount(1);
    await screenshotAllThemes(page, "streams-edit.png");
    await page.evaluate(() => changeTouchSize("large"));
    await page.waitForFunction(() => window.SmdDragHandle && SmdDragHandle.defaultSize === "large");
    await screenshotAllThemes(page, "streams-edit-large.png");
  });

  test("stream add modal", async ({ page }) => {
    await page.evaluate((data) => {
      localStorage.setItem("planmydays_streams", JSON.stringify(data));
    }, TEST_STREAMS);
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
    await page.waitForSelector("#streamEditorList .accordion-item");
    await page.getByRole("button", { name: "Add Stream" }).click();
    await page.locator("#streamEditPage").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "stream-add.png");
  });

  test("jobs editor", async ({ page }) => {
    await page.evaluate((data) => {
      localStorage.setItem("planmydays_streams", JSON.stringify(data));
    }, TEST_STREAMS);
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
    await page.waitForSelector("#streamEditorList .accordion-item");
    await page.locator("#streamEditorList .stream-header-main").first().click();
    await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
    await page.waitForSelector("#streamEditorList .accordion-body .job-drag-card");
    await screenshotAllThemes(page, "stream-job-list.png");
  });

  test("add job modal", async ({ page }) => {
    await page.evaluate((data) => {
      localStorage.setItem("planmydays_streams", JSON.stringify(data));
    }, TEST_STREAMS);
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
    await page.waitForSelector("#streamEditorList .accordion-item");
    await page.locator("#streamEditorList .stream-header-main").first().click();
    await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Add Job" }).first().click();
    await page.locator("#jobEditPage").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "stream-add-job.png");
  });

  test("jobs search", async ({ page }) => {
    const streamsWithSleepWait = JSON.parse(JSON.stringify(TEST_STREAMS));
    streamsWithSleepWait[0].jobs[0].sleepUntil = futureDateStr(30);
    streamsWithSleepWait[0].jobs[0].time = "09:00";
    streamsWithSleepWait[0].jobs[1].waitFor = "the meeting to start";
    await page.evaluate((data) => {
      localStorage.setItem("planmydays_streams", JSON.stringify(data));
    }, streamsWithSleepWait);
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Search Jobs" }).click();
    await page.waitForSelector("#jobSearchEditor:not(.d-none)");
    await page.waitForSelector("#jobSearchList pmd-job-summary-card");
    await screenshotAllThemes(page, "jobs-search.png");
  });

  test("jobs search - filtered", async ({ page }) => {
    await page.evaluate((data) => {
      localStorage.setItem("planmydays_streams", JSON.stringify(data));
    }, TEST_STREAMS);
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Search Jobs" }).click();
    await page.waitForSelector("#jobSearchEditor:not(.d-none)");
    await page.waitForSelector("#jobSearchList pmd-job-summary-card");
    await page.locator("#jobSearchInput").fill("meet");
    await page.waitForTimeout(200);
    await screenshotAllThemes(page, "jobs-search-filtered.png");
  });

  async function openViewJobWithData(page) {
    await page.evaluate((data) => {
      var streams = JSON.parse(JSON.stringify(data));
      streams[0].jobs[0].tasks = [
        { description: "Check deployment logs", done: true },
        { description: "Update test fixtures", done: false },
        { description: "Review pull request", done: false }
      ];
      streams[0].jobs[0].time = "09:00";
      streams[0].jobs[0].sleepUntil = "";
      streams[0].jobs[0].description = "Complete weekly development report with metrics and analysis";
      streams[0].jobs[0].suffix = true;
      var now = new Date();
      var ds = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
      localStorage.setItem("planmydays_streams", JSON.stringify(streams));
      localStorage.setItem("planmydays_today_order", JSON.stringify(["job_1", "job_2", "job_3"]));
      localStorage.setItem("planmydays_last_gen", ds);
      localStorage.setItem("planmydays_completed", JSON.stringify([]));
    }, TEST_STREAMS);
    await page.reload();
    await page.waitForSelector(".today-drag-card");
    await page.locator(".job-view-btn").first().click();
    await page.locator("#jobEditPage").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
  }

  test("job view modal - general tab", async ({ page }) => {
    await openViewJobWithData(page);
    await screenshotAllThemes(page, "job-view-general.png");
  });

  test("job view modal - schedule tab", async ({ page }) => {
    await openViewJobWithData(page);
    await page.locator("#jobSchedule-tab").click();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "job-view-schedule.png");
  });

  test("job view modal - tasks tab", async ({ page }) => {
    await openViewJobWithData(page);
    await page.locator("#jobTasks-tab").click();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "job-view-tasks.png");
  });

  test("job edit modal", async ({ page }) => {
    await page.evaluate((data) => {
      localStorage.setItem("planmydays_streams", JSON.stringify(data));
    }, TEST_STREAMS);
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
    await page.waitForSelector("#streamEditorList .accordion-item");
    await page.locator("#streamEditorList .stream-header-main").first().click();
    await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#streamEditorList .accordion-body .job-drag-card").first().getByRole("button", { name: "Edit" }).click();
    await page.locator("#jobEditPage").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "job-edit.png");
  });

  async function openScheduleModalFromJobEdit(page) {
    await page.evaluate((data) => {
      localStorage.setItem("planmydays_streams", JSON.stringify(data));
    }, TEST_STREAMS);
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
    await page.waitForSelector("#streamEditorList .accordion-item");
    await page.locator("#streamEditorList .stream-header-main").first().click();
    await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#streamEditorList .accordion-body .job-drag-card").first().getByRole("button", { name: "Edit" }).click();
    await page.locator("#jobEditPage").waitFor({ state: "visible" });
    await page.locator("#jobSchedule-tab").click();
    await page.locator("#btnScheduleChange").click();
    await page.locator("#smdConfirmModal").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
  }

  test("schedule modal - every day", async ({ page }) => {
    await openScheduleModalFromJobEdit(page);
    await page.locator("#schedDaily").check();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "schedule-every-day.png");
  });

  test("schedule modal - every n days", async ({ page }) => {
    await openScheduleModalFromJobEdit(page);
    await page.locator("#schedNDays").check();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "schedule-every-n-days.png");
  });

  test("schedule modal - weekdays", async ({ page }) => {
    await openScheduleModalFromJobEdit(page);
    await page.locator("#schedWeekdays").check();
    await expect(page.locator("#schedWeekdays")).toBeChecked();
    await screenshotAllThemes(page, "schedule-weekdays.png");
  });

  test("schedule modal - weekends", async ({ page }) => {
    await openScheduleModalFromJobEdit(page);
    await page.locator("#schedWeekends").check();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "schedule-weekends.png");
  });

  test("schedule modal - specific days", async ({ page }) => {
    await openScheduleModalFromJobEdit(page);
    await page.locator("#schedDays").check();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "schedule-specific-days.png");
  });

  test("schedule modal - day of month", async ({ page }) => {
    await openScheduleModalFromJobEdit(page);
    await page.locator("#schedMonthly").check();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "schedule-day-of-month.png");
  });

  test("images editor", async ({ page }) => {
    await page.reload();
    await page.evaluate(() => {
      if (typeof uploadStandardImages === "function") uploadStandardImages();
    });
    await page.locator("#smdConfirmModal").getByRole("button", { name: "Merge" }).click();
    await expect(page.locator("#smdConfirmModal")).toContainText("images uploaded", { timeout: 45000 });
    await page.getByRole("button", { name: "OK" }).click();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Images" }).click();
    await page.locator("#imagesList").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "images-edit.png");
  });

  test("sample images upload confirmation", async ({ page }) => {
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
    await page.locator("#danger-tab").click();
    await page.locator("#showDanger").check();
    await page.locator("#uploadStandardImagesRow").waitFor({ state: "visible" });
    await page.locator("#btnUploadImages").click();
    await page.locator("#smdConfirmModal").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "images-upload-confirm.png");
  });

  async function openJobEditWithTasks(page) {
    await page.evaluate(({ data, sleep }) => {
      var streams = JSON.parse(JSON.stringify(data));
      streams[0].jobs[0].tasks = [
        { description: "Check deployment logs", done: true },
        { description: "Update test fixtures", done: false },
        { description: "Review pull request", done: false }
      ];
      streams[0].jobs[0].time = "09:00";
      streams[0].jobs[0].sleepUntil = sleep;
      streams[0].jobs[0].description = "Complete weekly development report with metrics and analysis";
      localStorage.setItem("planmydays_streams", JSON.stringify(streams));
    }, { data: TEST_STREAMS, sleep: futureDateStr(30) });
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Streams" }).click();
    await page.waitForSelector("#streamEditorList .accordion-item");
    await page.locator("#streamEditorList .stream-header-main").first().click();
    await page.locator("#streamEditorList .accordion-collapse.show").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#streamEditorList .job-drag-card").filter({ hasText: "Report" }).getByRole("button", { name: "Edit" }).click();
    await page.locator("#jobEditPage").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
  }

  test("job edit modal - general tab", async ({ page }) => {
    await openJobEditWithTasks(page);
    await screenshotAllThemes(page, "job-edit-general.png");
  });

  test("job edit modal - schedule tab", async ({ page }) => {
    await openJobEditWithTasks(page);
    await page.locator("#jobSchedule-tab").click();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "job-edit-schedule.png");
  });

  test("job edit modal - tasks tab", async ({ page }) => {
    await openJobEditWithTasks(page);
    await page.locator("#jobTasks-tab").click();
    await page.locator("#jobTasksList .task-drag-card").first().waitFor({ state: "visible" });
    await screenshotAllThemes(page, "job-edit-tasks.png");
    await page.evaluate(() => changeTouchSize("large"));
    await page.waitForFunction(() => window.SmdDragHandle && SmdDragHandle.defaultSize === "large");
    await screenshotAllThemes(page, "job-edit-tasks-large.png");
  });

  test("settings - minio", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("planmydays_minio_enabled", "true");
      localStorage.setItem("planmydays_minio_server", "http://minio.local:9000");
      localStorage.setItem("planmydays_minio_username", "minioadmin");
      localStorage.setItem("planmydays_minio_password", "••••••••");
      localStorage.setItem("planmydays_minio_bucket", "pmd");
    });
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
    await page.waitForSelector("#settingsPage:not(.d-none)");
    await page.locator("#filesync-tab").click();
    await page.locator("#fileSyncTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Minio" }).click();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "settings-minio.png");
  });

  test("minio import", async ({ page }) => {
    await page.route(function(url) { return url.hostname === "minio.local" && url.port === "9000"; }, async function(route) {
      var body = ['<?xml version="1.0" encoding="UTF-8"?>',
        '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
        '<Name>pmd</Name><KeyCount>3</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>',
        '<Contents><Key>planmydays-20260801.json</Key><LastModified>2026-08-01T10:00:00.000Z</LastModified><ETag>"abc"</ETag><Size>1024</Size><StorageClass>STANDARD</StorageClass></Contents>',
        '<Contents><Key>planmydays-20260731.json</Key><LastModified>2026-07-31T18:00:00.000Z</LastModified><ETag>"def"</ETag><Size>2048</Size><StorageClass>STANDARD</StorageClass></Contents>',
        '<Contents><Key>planmydays-20260720.json</Key><LastModified>2026-07-20T08:00:00.000Z</LastModified><ETag>"ghi"</ETag><Size>1536</Size><StorageClass>STANDARD</StorageClass></Contents>',
        '</ListBucketResult>'].join("");
      await route.fulfill({ status: 200, body: body });
    });
    await page.evaluate(() => {
      localStorage.setItem("planmydays_minio_enabled", "true");
      localStorage.setItem("planmydays_minio_server", "http://minio.local:9000");
      localStorage.setItem("planmydays_minio_username", "minioadmin");
      localStorage.setItem("planmydays_minio_password", "••••••••");
      localStorage.setItem("planmydays_minio_bucket", "pmd");
    });
    await page.reload();
    await page.evaluate(() => importFromMinio());
    await page.waitForSelector("#minioImportPage");
    await page.waitForSelector("#minioImportBody .list-group-item");
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "minio-import.png");
  });

  test("settings - onedrive", async ({ page }) => {
    await seedOneDriveSettings(page, { prefix: "planmydays_", directory: "MyApps/PlanMyDay" });
    await page.evaluate(() => openSettings());
    await page.waitForSelector("#settingsPage:not(.d-none)");
    await page.locator("#filesync-tab").click();
    await page.locator("#fileSyncTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "OneDrive" }).click();
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "settings-onedrive.png");
  });

  test("main menu dropdown - filesync", async ({ page }) => {
    await seedOneDriveSettings(page, { prefix: "planmydays_", directory: "MyApps/PlanMyDay" });
    await page.evaluate(() => updateFileSyncMenu());
    await page.locator("#btnMainMenu").click();
    await page.locator(".dropdown-menu.show").first().waitFor({ state: "visible" });
    await page.waitForTimeout(250);
    await screenshotAllThemes(page, "main-menu-filesync.png");
  });

  test("open from onedrive", async ({ page }) => {
    await seedOneDriveSettings(page, { prefix: "planmydays_", directory: "MyApps/PlanMyDay" });
    await stubOneDriveBrowser(page, {
      directory: "MyApps/PlanMyDay",
      latestName: "planmydays-202610250930.json"
    });
    await page.evaluate(() => openOneDrivePage());
    await page.waitForSelector("#oneDriveBody .od-latest-current");
    await page.waitForTimeout(400);
    await screenshotAllThemes(page, "onedrive-open.png");
  });
});

// Solar regressions are mirrored here per the repository screenshot workflow.
test.describe('Solar dashboard appearance screenshots', () => {
  test.use({ serviceWorkers: 'block' });
  test('Solar dashboard seven tabs and installed layout', async ({ page }) => {
    test.setTimeout(120000);
    const { mockFlaskApi } = require('./solar-fixtures');
    const { theme, inspectContrast } = require('./solar-appearance-helpers');
    await page.addInitScript(() => Object.defineProperty(navigator,'windowControlsOverlay',{value:{visible:true,addEventListener(){}}}));
    await mockFlaskApi(page);
    await page.goto('/SolarControlar/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#batteryPercent')).toHaveText('50%');
    await expect(page.locator('#topTiles .tile-label')).toHaveText(['Latest Date','Latest Time','Battery Charge']);
    await expect(page.locator('#topTiles .flap-card')).toHaveText(['0','8','0','0','0','0']);
    await page.evaluate(() => { Chart.defaults.animation = false; });
    await page.addStyleTag({content:'*, *::before, *::after { transition: none !important; }'});
    for (const mode of ['light','dark']) {
      await theme(page, process.env.SCREENSHOT_THEME || 'superhero', mode);
      for (const tab of ['Now','Settings','Files','Config','Forecast','Power','kWh']) {
        await page.locator('#mainTabs .smd-tab-btn').filter({hasText:new RegExp('^'+tab+'$')}).click();
        if(tab==='Now') await expect(page.locator('#topTiles')).toBeVisible();
        else await expect(page.locator('#topTiles')).toBeHidden();
        if(tab==='Power'||tab==='kWh') await expect.poll(()=>page.evaluate(tab=>{
          const chart=tab==='Power'?window._powerChart:window._energyChart;
          if(!chart)return false;
          const c=chart.canvas,r=c.getBoundingClientRect();
          return Math.abs(c.width-r.width*devicePixelRatio)<2 && Math.abs(c.height-r.height*devicePixelRatio)<2;
        },tab)).toBeTruthy();
        expect(await page.evaluate(inspectContrast)).toEqual([]);
        await page.screenshot({ path: test.info().outputPath('solar-'+mode+'-'+tab+'.png'), fullPage:true });
        if(tab==='kWh') {
          const {pickOption}=require('./theme-controls');
          for(const period of ['month','year']) {
            await pickOption(page,'#energy-period',period);
            await expect.poll(()=>page.evaluate(()=>window._energyChart?.scales.x.options.title.text)).toBe(period==='month'?'Sep 2026':'2026');
            const range=await page.evaluate(()=>({max:_energyChart.scales.y.max,
              peak:Math.max(..._energyChart.data.datasets.map(ds=>ds.data.filter(Number.isFinite).at(-1)).filter(Number.isFinite))}));
            expect(range.max).toBeGreaterThanOrEqual(range.peak);
            await page.screenshot({path:test.info().outputPath('solar-'+mode+'-KWh-'+period+'.png'),fullPage:true});
          }
          await page.locator('.energy-series[value="usage"]').uncheck();
          const hiddenRange=await page.evaluate(()=>({max:_energyChart.scales.y.max,
            peak:Math.max(..._energyChart.data.datasets.map(ds=>ds.data.filter(Number.isFinite).at(-1)).filter(Number.isFinite))}));
          expect(hiddenRange.max).toBeGreaterThanOrEqual(hiddenRange.peak);
          await page.screenshot({path:test.info().outputPath('solar-'+mode+'-KWh-hidden-largest.png'),fullPage:true});
          await page.locator('.energy-series[value="usage"]').check();
          await pickOption(page,'#energy-period','day');
          await expect.poll(()=>page.evaluate(()=>window._energyChart?.scales.x.options.title.text)).toBe('15 Sep 2026');
        }
      }
      await page.setViewportSize({width:390,height:900});
      await page.locator('#mainTabs .smd-tab-btn').filter({hasText:'Now'}).click();
      await page.screenshot({ path:test.info().outputPath('solar-'+mode+'-mobile.png'),fullPage:true });
      await page.setViewportSize({width:1280,height:900});
      await page.evaluate(()=>openSettings());
      await page.locator('#settingsTabs').getByRole('tab',{name:'Display',exact:true}).click();
      await expect(page.locator('#screenResolution')).toHaveText('1280 × 900 (1x)');
      await page.screenshot({path:test.info().outputPath('solar-'+mode+'-display-settings.png'),fullPage:true});
      await page.evaluate(()=>closeSettings());
      await expect(page.locator('#settingsPage')).toBeHidden();
    }
  });
});

test.describe('SlideShow screenshots', () => {
  test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  test('SlideShow viewer, folder picker and settings', async ({page}) => {
    test.setTimeout(180000);
    const {setup,choose} = require('./slideshow-fixtures');
    const capture = createScreenshotAllThemes('slideshow');
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
    page.on('requestfailed',request=>errors.push(request.url()));
    await page.addInitScript(() => {delete Object.getPrototypeOf(navigator).serviceWorker;});
    await setup(page); await choose(page);
    await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo2.PNG');
    await capture(page,'viewer.png');
    await page.evaluate(()=>openSettings());
    await page.locator('#playSlides button').click();
    await expect(page.locator('#useSlideFolder button')).toBeEnabled();
    await expect(page.locator('#useSlideFolder button')).toHaveText('Play');
    await capture(page,'folders.png');
    await page.evaluate(() => ssCloseFolders());
    await page.evaluate(() => openSettings());
    await capture(page,'settings-slideshow.png');
    await page.locator('#source-tab').click();
    await expect(page.locator('#oneDriveDirectory')).toHaveValue('Pictures');
    await expect(page.locator('#oneDriveClientId')).toBeVisible();
    await capture(page,'settings-onedrive.png');
    await page.locator('#source-url-tab').click();
    await page.locator('#oneDriveUrl').fill('https://1drv.ms/f/shared-photos');
    await page.locator('#oneDriveUrl').blur();
    await expect(page.locator('#oneDriveClientId')).toBeVisible();
    await expect(page.locator('#oneDriveTenant')).toBeVisible();
    await capture(page,'settings-onedrive-url.png');
    await page.evaluate(()=>{
      oneDriveGraphJson=async path=>path.startsWith('/shares/')
        ? {id:'shared-root',name:'Shared photos',folder:{},parentReference:{driveId:'shared-drive'}}
        : {value:[{id:'year-folder',name:'Year',folder:{},parentReference:{driveId:'shared-drive'}}]};
    });
    await page.locator('#slideshow-tab').click();
    await page.locator('#playSlides button').click();
    await expect(page.locator('#slideFolderPath')).toHaveText('Shared photos');
    await expect(page.locator('#useSlideFolder button')).toBeEnabled();
    await capture(page,'folders-onedrive-url.png');
    expect(errors).toEqual([]);
  });
});
