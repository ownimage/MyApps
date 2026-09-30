const { test, expect } = require("@playwright/test");

// The Gantt page (Settings -> Display -> Show Gantt, then the Gantt menu item)
// is a READ-ONLY projection of the stream/job tree, now drawn by the vendored
// MIT @revolist/gantt plugin on @revolist/revogrid (shared/vendor/revolist).
// PlanMyDay jobs have no start/end dates — only a recurrence rule, an optional
// `sleepUntil` not-before date and a `duration` in days — so the chart derives:
//
//   start = job.sleepUntil || today      (today ASSUMED at read time)
//   end   = start + (job.duration || 1) days
//
// A stream is a collapsible group (type "summary"). A stream WITH jobs spans
// them; a stream with NO jobs keeps a zero-length span on today, which the
// vendor draws as its 6px minimum bar (so every stream still gets a row).
// Nothing here may write back to storage.
//
// DOM map for the new grid (kept here because the vendor's classes are not
// obvious):
//   #ganttChart revo-grid            the grid element
//   revogr-header .rgHeaderCell      one per column (Task, Start, End, timeline)
//   revogr-data .rgCell              body cells (name/start/end per row)
//   .rg-gantt-bar                    one bar per row
//   .rg-gantt-bar--summary           summary bars (stream rows)
//   .rg-gantt-bar-label              the row label rendered over the timeline
//   .rg-gantt-header-cell            the timeline day/week cells (755 at Day zoom)
//   aria-rowcount on revo-grid       total rows (streams + jobs)
function seedStreams(page, streams) {
  return page.evaluate((s) => {
    localStorage.setItem("planmydays_streams", JSON.stringify(s));
  }, streams);
}

async function enableGantt(page) {
  await page.evaluate(() => {
    localStorage.setItem("planmydays_showGantt", "true");
  });
  await page.reload();
}

async function openChart(page) {
  await page.evaluate(() => openGantt());
  await page.waitForFunction(() => document.querySelectorAll(".rg-gantt-bar").length > 0, null, { timeout: 30000 });
}

const SAMPLE = [
  {
    title: "Work",
    sequence: 1,
    jobs: [
      { id: "job_daily", title: "Daily standup", sequence: 1, active: true, schedule: { type: "daily" }, duration: 3 },
      { id: "job_sleep", title: "Planned review", sequence: 2, active: true, schedule: { type: "weekdays" }, sleepUntil: "2026-10-05", duration: 2 },
      { id: "job_legacy", title: "Legacy job", sequence: 3, active: true, schedule: { type: "daily" } }
    ]
  },
  { title: "Home", sequence: 2, jobs: [] }
];

test.describe("Gantt page", () => {
  test("Show Gantt is the last control on the Display tab and defaults to off", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await page.locator("#btnMainMenu").click();
    await page.locator("a.dropdown-item").filter({ hasText: "Settings" }).click();
    await page.locator("#appearance-tab").click();

    await expect(page.locator("#showGantt")).not.toBeChecked();
    // It must be the LAST row in the Display panel, after Screen resolution.
    const order = await page.evaluate(() => {
      const panel = document.getElementById("appearance-tab-panel") || document.getElementById("themeSelector").closest(".smd-tab-panel");
      return Array.from(panel.querySelectorAll("label")).map((l) => l.textContent.trim()).filter(Boolean);
    });
    expect(order[order.length - 1]).toBe("Show Gantt");
  });

  test("the Gantt menu item is hidden until the setting is on, and persists", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    // The item lives inside a Bootstrap DROPDOWN, so it is display:none until
    // the menu is opened — visibility can only be judged with the menu open, or
    // the assertion would pass for the wrong reason.
    const menuItem = page.locator(".gantt-menu-item");
    await page.locator("#btnMainMenu").click();
    await expect(menuItem).toBeHidden();

    await page.evaluate(() => changeShowGantt(true));
    await expect(menuItem).toBeVisible();

    // survives a reload (reopen the menu, which the reload closed)
    await page.reload();
    await page.locator("#btnMainMenu").click();
    await expect(page.locator(".gantt-menu-item")).toBeVisible();

    // ...and turning it off hides it again
    await page.evaluate(() => changeShowGantt(false));
    await expect(page.locator(".gantt-menu-item")).toBeHidden();
  });

  test("derives bar dates from sleepUntil and duration, defaulting to today and 1 day", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    const today = await page.evaluate(() => getTodayStr());
    const items = await page.evaluate((t) => buildGanttTasks(JSON.parse(localStorage.getItem("planmydays_streams")), t), today);

    // Rows are labelled "<title> [<frequency>]", so look them up by title
    // rather than by the whole name.
    const byTitle = {};
    items.forEach((i) => { byTitle[i.name.replace(/\s*\(.*\)$/, "")] = i; });

    // job with an explicit duration, no sleepUntil -> starts today, spans 3 days
    expect(byTitle["Daily standup"].startDate).toBe(today);
    expect(byTitle["Daily standup"].endDate).toBe(await page.evaluate((t) => ganttAddDaysStr(t, 3), today));

    // job with sleepUntil + duration -> starts on sleepUntil, spans 2 days
    expect(byTitle["Planned review"].startDate).toBe("2026-10-05");
    expect(byTitle["Planned review"].endDate).toBe("2026-10-07");

    // legacy job with no duration -> 1 day
    expect(byTitle["Legacy job"].endDate).toBe(await page.evaluate((t) => ganttAddDaysStr(t, 1), today));
  });

  test("renders one row per stream and job, including a minimum bar for a job-less stream", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await openChart(page);

    // page is open
    await expect(page.locator("#ganttPage")).toHaveAttribute("open", "");

    // 2 streams + 3 jobs = 5 rows, 5 bars, of which 2 are summary bars. The
    // empty "Home" stream still gets its own row + minimum bar.
    const chart = await page.evaluate(() => {
      const grid = document.querySelector("#ganttChart revo-grid");
      return {
        rows: Number(grid.getAttribute("aria-rowcount")),
        cols: Number(grid.getAttribute("aria-colcount")),
        bars: document.querySelectorAll(".rg-gantt-bar").length,
        summaryBars: document.querySelectorAll(".rg-gantt-bar--summary").length,
        labels: Array.from(document.querySelectorAll(".rg-gantt-bar-label")).map((l) => l.textContent.trim()),
        headerCells: document.querySelectorAll("revogr-header .rgHeaderCell").length,
        bodyCells: document.querySelectorAll("revogr-data .rgCell").length,
        themeAttr: grid.getAttribute("theme"),
        readonly: grid.readonly,
        rowSize: Number(grid.rowSize)
      };
    });

    expect(chart.rows).toBe(5);
    expect(chart.bars).toBe(5);
    expect(chart.summaryBars).toBe(2);
    expect(chart.headerCells).toBe(4); // Task, Start, End, timeline
    expect(chart.bodyCells).toBe(20);  // 5 rows x (name, start, end) + 5 timeline labels
    expect(chart.themeAttr).toBe("default");
    expect(chart.readonly).toBe(true);
    expect(chart.rowSize).toBe(30);

    // every stream and job is labelled; the summary stream rows carry no
    // frequency bracket, the empty stream still appears
    expect(chart.labels).toContain("Work");
    expect(chart.labels).toContain("Home");
    expect(chart.labels).toContain("Daily standup");
    expect(chart.labels).toContain("Planned review (Weekdays)");
    expect(chart.labels).toContain("Legacy job");
  });

  test("a stream can be collapsed so its job rows hide, and the state persists", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await openChart(page);

    const state = () => page.evaluate(() => {
      const grid = document.querySelector("#ganttChart revo-grid");
      return {
        rows: Number(grid.getAttribute("aria-rowcount")),
        bars: document.querySelectorAll(".rg-gantt-bar").length,
        summaryBars: document.querySelectorAll(".rg-gantt-bar--summary").length,
        taskBars: document.querySelectorAll(".rg-gantt-bar--task").length,
        toggleGlyphs: Array.from(document.querySelectorAll(".pmd-gantt-collapse-toggle")).map((b) => b.textContent),
        ariaExpanded: Array.from(document.querySelectorAll(".pmd-gantt-collapse-toggle")).map((b) => b.getAttribute("aria-expanded")),
        persisted: JSON.parse(localStorage.getItem("planmydays_ganttCollapsedStreams") || "[]")
      };
    });

    // both streams expanded by default: 2 summary + 3 job rows
    let s = await state();
    expect(s.rows).toBe(5);
    expect(s.taskBars).toBe(3);
    expect(s.summaryBars).toBe(2);
    expect(s.toggleGlyphs).toEqual(["▾", "▾"]);
    expect(s.persisted).toEqual([]);

    // collapse the first stream (Work)
    await page.evaluate(() => document.querySelector(".pmd-gantt-collapse-toggle").click());
    await page.waitForTimeout(400);

    s = await state();
    // job rows gone, summary rows remain
    expect(s.rows).toBe(2);
    expect(s.taskBars).toBe(0);
    expect(s.summaryBars).toBe(2);
    expect(s.toggleGlyphs).toEqual(["▸", "▾"]);
    expect(s.ariaExpanded).toEqual(["false", "true"]);
    expect(s.persisted).toEqual(["Work"]);

    // persists across a reload
    await page.reload();
    await openChart(page);
    s = await state();
    expect(s.rows).toBe(2);
    expect(s.taskBars).toBe(0);
    expect(s.toggleGlyphs).toEqual(["▸", "▾"]);

    // and can be expanded again
    await page.evaluate(() => document.querySelector(".pmd-gantt-collapse-toggle").click());
    await page.waitForTimeout(400);
    s = await state();
    expect(s.rows).toBe(5);
    expect(s.taskBars).toBe(3);
    expect(s.persisted).toEqual([]);
  });

  test("job names are indented under their stream so rows read as a hierarchy", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await openChart(page);

    const state = await page.evaluate(() => {
      const pad = (text) => {
        // stream cells are "▾ + <title span>", so match on the title span
        const streamCell = Array.from(document.querySelectorAll("#ganttChart .pmd-gantt-stream-title"))
          .find((s) => s.textContent.trim() === text);
        const jobCell = Array.from(document.querySelectorAll("#ganttChart .pmd-gantt-job-name"))
          .find((s) => s.textContent.trim() === text);
        const cell = streamCell ? streamCell.closest(".pmd-gantt-stream-name") : jobCell;
        return cell ? parseFloat(getComputedStyle(cell).paddingLeft) : null;
      };
      return {
        jobCount: document.querySelectorAll("#ganttChart .pmd-gantt-job-name").length,
        streamCount: document.querySelectorAll("#ganttChart .pmd-gantt-stream-name").length,
        jobPad: pad("Daily standup"),
        streamPad: pad("Work")
      };
    });

    // 3 jobs + 2 streams, every row is stamped with the right class
    expect(state.jobCount).toBe(3);
    expect(state.streamCount).toBe(2);
    // jobs are indented a clear step; streams stay flush
    expect(state.jobPad).toBeGreaterThan(0);
    expect(state.jobPad).toBeGreaterThan(state.streamPad);
  });

  test("the chart fills the page between the header and the Close footer", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await openChart(page);

    const boxes = await page.evaluate(() => {
      const body = document.querySelector("#ganttPage .smd-page-body");
      const chart = document.querySelector("#ganttChart");
      const grid = document.querySelector("#ganttChart revo-grid");
      return {
        body: Math.round(body.getBoundingClientRect().height),
        chart: Math.round(chart.getBoundingClientRect().height),
        grid: Math.round(grid.getBoundingClientRect().height),
        bodyFlex: getComputedStyle(body).display,
        chartMinHeight: getComputedStyle(chart).minHeight
      };
    });

    // the chart (and the grid inside it) reach the bottom of the page body
    expect(boxes.chart).toBeGreaterThanOrEqual(boxes.body - 2);
    expect(boxes.grid).toBeGreaterThanOrEqual(boxes.body - 2);
    // the body is a column flex container so the host can flex-grow into it
    expect(boxes.bodyFlex).toBe("flex");
    expect(boxes.chartMinHeight).toBe("0px");
  });

  test("opening the Gantt does not mutate the stored streams (read-only projection)", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    const before = await page.evaluate(() => localStorage.getItem("planmydays_streams"));

    await openChart(page);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => localStorage.getItem("planmydays_streams"));

    // Byte-for-byte identical: the chart must not backfill `sleepUntil`/`duration`.
    expect(after).toBe(before);
    // In particular, the job we seeded WITHOUT a duration must not have gained
    // one just from being rendered (the 1-day default is a read-time fallback).
    const legacy = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .flatMap((s) => s.jobs)
        .find((j) => j.id === "job_legacy"));
    expect(legacy.duration).toBeUndefined();
  });

  test("job rows show the repeat frequency in brackets after the title", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    const items = await page.evaluate(() => buildGanttTasks([
      { title: "Work", sequence: 1, jobs: [
        { id: "j1", title: "Standup", sequence: 1, schedule: { type: "daily" } },
        { id: "j2", title: "Review", sequence: 2, schedule: { type: "weekdays" } },
        { id: "j3", title: "Payday", sequence: 3, schedule: { type: "monthly", date: 15 } },
        { id: "j4", title: "Fortnightly", sequence: 4, schedule: { type: "ndays", interval: 14 } },
        { id: "j5", title: "Pick days", sequence: 5, schedule: { type: "days", days: [1, 3] } },
        { id: "j6", title: "Untitled-less", sequence: 6 }
      ]}
    ], getTodayStr()));

    const name = (t) => items.find((i) => i.name.includes(t));
    // A plain daily job is the DEFAULT schedule, so it gets no bracket at all.
    expect(name("Standup").name).toBe("Standup");
    // A job with no schedule at all is the same default -> also no bracket.
    expect(name("Untitled-less").name).toBe("Untitled-less");
    // Everything that is NOT the default does get the frequency.
    // The parenthetical detail is trimmed: the name column ellipsises, so
    // "Weekdays (Mon-Fri)" would be cut to "Weekda..." and lose the meaning.
    expect(name("Review").name).toBe("Review (Weekdays)");
    expect(name("Payday").name).toBe("Payday (15th of every month)");
    // "day(s)" is part of the word, not parenthetical detail - must not be mangled.
    expect(name("Fortnightly").name).toBe("Fortnightly (Every 14 day(s))");
    expect(name("Pick days").name).toBe("Pick days (Mon, Wed)");

    // Stream group rows are NOT labelled with a frequency - they are not jobs.
    const streamRow = items.find((i) => i.name === "Work");
    expect(streamRow).toBeTruthy();
    expect(streamRow.type).toBe("summary");
  });

  test("task text meets WCAG AA contrast in BOTH light and dark mode", async ({ page }) => {
    // Regression guard for the washed-out chart: RevoGrid's cells fall back to
    // transparent/black if the `theme` attribute names a bundled palette that
    // has no matching CSS, which makes the text vanish. The grid surface must
    // follow the page surface in both modes, and its text must keep contrast.
    test.setTimeout(60000);
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    // Reload FIRST (to pick up the setting), then switch theme - doing it the
    // other way round would have the reload wipe the theme we just applied.
    await enableGantt(page);

    // WCAG relative-luminance contrast ratio.
    const ratio = ([r1, g1, b1], [r2, g2, b2]) => {
      const lum = ([r, g, b]) => {
        const f = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const a = lum([r1, g1, b1]), b = lum([r2, g2, b2]);
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return (hi + 0.05) / (lo + 0.05);
    };
    const parse = (s) => String(s).match(/[\d.]+/g).slice(0, 3).map(Number);

    for (const [mode, theme] of [["dark", "superhero"], ["light", "flatly"]]) {
      await page.evaluate(([t, m]) => applyTheme(t, m), [theme, mode]);
      await page.waitForFunction((m) => document.documentElement.getAttribute("data-bs-theme") === m, mode);
      // let the per-mode override stylesheet <theme>.<mode>.css land
      await page.waitForTimeout(700);
      await openChart(page);

      const samples = await page.evaluate(() => {
        const read = (el) => {
          if (!el) return null;
          let bg = "rgba(0, 0, 0, 0)", node = el;
          while (node && bg === "rgba(0, 0, 0, 0)") {
            const c = getComputedStyle(node).backgroundColor;
            if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) bg = c;
            node = node.parentElement;
          }
          return { color: getComputedStyle(el).color, bg };
        };
        const cell = document.querySelector("revogr-data .rgCell");
        const label = document.querySelector(".rg-gantt-bar-label");
        const timeline = document.querySelector(".rg-gantt-cell");
        return {
          nameCell: read(cell),
          timelineLabel: read(label || timeline),
          bodyFill: getComputedStyle(document.body).backgroundColor
        };
      });

      for (const [what, v] of Object.entries(samples)) {
        if (what === "bodyFill") continue; // not a color pair; asserted separately below
        const r = ratio(parse(v.color), parse(v.bg));
        expect(r, `${theme}/${mode} ${what} contrast ${r.toFixed(2)} (color ${v.color} on ${v.bg})`).toBeGreaterThanOrEqual(4.5);
      }
      // the grid surface must actually track the page: text would otherwise stay
      // readable on a hard-coded white panel while the chart broke visually
      expect(samples.nameCell.bg).toBe(samples.bodyFill);
      await page.evaluate(() => closeGantt());
    }
  });

  test("cells and hierarchy are read-only, but job bars are draggable", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await openChart(page);

    const state = await page.evaluate(() => {
      const grid = document.querySelector("#ganttChart revo-grid");
      const bar = document.querySelector(".rg-gantt-bar--task");
      const summary = document.querySelector(".rg-gantt-bar--summary");
      // scope the end handle to the measured bar: the FIRST handle in the whole
      // document belongs to a summary bar (Work comes before its jobs), where it
      // is display:none and its rect is all zeros
      const endHandle = bar ? bar.querySelector(".rg-gantt-bar-handle--end") : null;
      // the plugin appends its own __ganttTimeline column (no sortable prop);
      // the three APP columns must all be explicitly non-sortable
      const appCols = (grid.columns || []).filter((c) => c.prop !== "__ganttTimeline");
      const barRect = bar ? bar.getBoundingClientRect() : null;
      const handleRect = endHandle ? endHandle.getBoundingClientRect() : null;
      return {
        readonly: grid.readonly,
        sortable: appCols.length === 3 && appCols.every((c) => c.sortable === false),
        headerSortArrows: document.querySelectorAll("revogr-header .rgHeaderCell[aria-sort]").length,
        taskBarPointerEvents: bar ? getComputedStyle(bar).pointerEvents : null,
        taskBarCursor: bar ? getComputedStyle(bar).cursor : null,
        taskBarInteraction: bar ? bar.getAttribute("data-gantt-interaction") : null,
        summaryPointerEvents: summary ? getComputedStyle(summary).pointerEvents : null,
        summaryCursor: summary ? getComputedStyle(summary).cursor : null,
        summaryHasEndHandle: !!document.querySelector(".rg-gantt-bar--summary .rg-gantt-bar-handle--end"),
        // summary bar must be a MOVE-only zone (no resize handle on it)
        summaryEndHandleDisplay: document.querySelector(".rg-gantt-bar--summary .rg-gantt-bar-handle--end")
          ? getComputedStyle(document.querySelector(".rg-gantt-bar--summary .rg-gantt-bar-handle--end")).display
          : null,
        // the resize zone must cover the RIGHT half of the bar
        handleCoversRightHalf: barRect && handleRect
          ? handleRect.left >= barRect.left + barRect.width / 2 - 1
            && handleRect.right >= barRect.right - 1
          : false,
        endHandleCursor: endHandle ? getComputedStyle(endHandle).cursor : null
      };
    });

    // cells still cannot be edited, and sorting is still off
    expect(state.readonly).toBe(true);
    expect(state.sortable).toBe(true);
    expect(state.headerSortArrows).toBe(0);
    // JOB bars are draggable again: left half = move (grab), right half = resize
    expect(state.taskBarPointerEvents).toBe("auto");
    expect(state.taskBarCursor).toBe("grab");
    expect(state.taskBarInteraction).toBe("move");
    // the resize zone is the end handle stretched over the right half
    expect(state.handleCoversRightHalf).toBe(true);
    expect(state.endHandleCursor).toBe("ew-resize");
    // summary (stream) bars are draggable as a whole (move only, no resize)
    expect(state.summaryPointerEvents).not.toBe("none");
    expect(state.summaryCursor).toBe("grab");
    expect(state.summaryEndHandleDisplay).toBe("none");
  });

  test("dragging the LEFT half of a job bar moves it and persists sleepUntil", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await openChart(page);

    // pick a task bar; grab it at 25% width (left half = move zone)
    const bar = page.locator(".rg-gantt-bar--task").first();
    const box = await bar.boundingBox();
    expect(box).toBeTruthy();
    const start = { x: box.x + box.width * 0.25, y: box.y + box.height / 2 };
    const before = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .flatMap((s) => s.jobs).find((j) => j.id === "job_daily"));

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 120, start.y, { steps: 8 });
    await page.mouse.up();
    // let the plugin re-render and the persist listener run
    await page.waitForTimeout(500);

    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .flatMap((s) => s.jobs).find((j) => j.id === "job_daily"));
    // moving right must have pushed sleepUntil later (job_daily had none)
    expect(after.sleepUntil).toBeTruthy();
    expect(after.sleepUntil > (before.sleepUntil || "")).toBe(true);
  });

  test("dragging the RIGHT half of a job bar resizes it and persists duration", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await openChart(page);

    // grab at 75% width (right half = resize zone)
    const bar = page.locator(".rg-gantt-bar--task").first();
    const box = await bar.boundingBox();
    expect(box).toBeTruthy();
    const start = { x: box.x + box.width * 0.75, y: box.y + box.height / 2 };
    const before = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .flatMap((s) => s.jobs).find((j) => j.id === "job_daily"));

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 120, start.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .flatMap((s) => s.jobs).find((j) => j.id === "job_daily"));
    // widening to the right must have grown the duration (job_daily had 3)
    expect(Number(after.duration)).toBeGreaterThan(Number(before.duration));
  });

  test("dragging a STREAM bar shifts every child job's start by the same days", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await openChart(page);

    // grab the first SUMMARY bar (the Work stream)
    const bar = page.locator(".rg-gantt-bar--summary").first();
    const box = await bar.boundingBox();
    expect(box).toBeTruthy();
    const start = { x: box.x + box.width * 0.5, y: box.y + box.height / 2 };
    const before = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs
        .map((j) => ({ id: j.id, sleepUntil: j.sleepUntil || null })));

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 120, start.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs
        .map((j) => ({ id: j.id, sleepUntil: j.sleepUntil || null })));

    // every child job in the stream gained a later sleepUntil
    expect(after.length).toBeGreaterThan(0);
    for (const a of after) {
      const b = before.find((x) => x.id === a.id);
      expect(a.sleepUntil).toBeTruthy();
      expect(a.sleepUntil).not.toBe(b.sleepUntil);
      expect(a.sleepUntil > (b.sleepUntil || "")).toBe(true);
    }
  });

  test("Streams dropdown filters the chart and persists", async ({ page }) => {
    test.setTimeout(90000);
    const streams = [
      { title: "Work", sequence: 1, jobs: [
        { id: "a", title: "Alpha", sequence: 1, active: true, schedule: { type: "daily" }, duration: 2 }
      ]},
      { title: "Home", sequence: 2, jobs: [
        { id: "b", title: "Beta", sequence: 1, active: true, schedule: { type: "weekdays" }, duration: 1 }
      ]},
      { title: "Someday", sequence: 3, jobs: [] }
    ];
    await page.goto("/PlanMyDay/");
    await page.evaluate((s) => {
      localStorage.setItem("planmydays_streams", JSON.stringify(s));
      localStorage.setItem("planmydays_showGantt", "true");
    }, streams);
    await page.reload();
    await openChart(page);

    const chartNames = () => page.evaluate(() =>
      Array.from(document.querySelectorAll(".rg-gantt-bar-label")).map((l) => l.textContent.trim()).filter(Boolean));
    const chartRows = () => page.evaluate(() =>
      Number(document.querySelector("#ganttChart revo-grid").getAttribute("aria-rowcount")));

    // The dropdown button shows how many streams are included, and starts at all.
    const btn = page.locator("#ganttStreamMenuBtn");
    await expect(btn).toHaveText("Streams (3/3)");
    await btn.click();
    await expect(page.locator("#ganttStreamMenu")).toHaveClass(/show/);

    // one checkbox per stream, plus the All master
    await expect(page.locator("#ganttPage smd-checkbox[data-stream]")).toHaveCount(3);
    await expect(page.locator("#ganttStreamAll")).toBeChecked();

    // unticking a stream removes its group row AND its jobs
    await page.locator('#ganttPage smd-checkbox[data-stream="Home"]').click();
    await page.waitForTimeout(400);
    await expect(btn).toHaveText("Streams (2/3)");
    expect(await chartNames()).not.toContain("Home");
    expect(await chartNames()).not.toContain("Beta");
    expect(await chartNames()).toContain("Work");
    // All becomes a partial state when not everything is included
    await expect(page.locator("#ganttStreamAll")).not.toBeChecked();

    // All is a master toggle. It is currently UNCHECKED (partial state), so
    // clicking it ticks it -> everything comes back.
    await page.locator("#ganttStreamAll").click();
    await page.waitForTimeout(400);
    await expect(btn).toHaveText("Streams (3/3)");
    expect(await chartNames()).toContain("Someday");

    // clicking it again unticks it -> every stream is excluded
    await page.locator("#ganttStreamAll").click();
    await page.waitForTimeout(400);
    await expect(btn).toHaveText("Streams (0/3)");
    expect(await chartNames()).toEqual([]);

    // put everything back before the persistence check
    await page.locator("#ganttStreamAll").click();
    await page.waitForTimeout(400);
    await expect(btn).toHaveText("Streams (3/3)");

    // the filter is persisted, not per-session
    await page.locator('#ganttPage smd-checkbox[data-stream="Work"]').click();
    await page.waitForTimeout(400);
    await expect(btn).toHaveText("Streams (2/3)");
    // Work(summary) + its Alpha job are gone; Home(summary)+Beta(job)+Someday = 3 rows
    expect(await chartRows()).toBe(3);
    await page.reload();
    await openChart(page);
    await expect(page.locator("#ganttStreamMenuBtn")).toHaveText("Streams (2/3)");
    expect(await chartNames()).not.toContain("Work");
    expect(await chartNames()).toContain("Home");
  });

  test("zoom switch rebuilds the timeline and persists", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await openChart(page);

    const dayCells = await page.evaluate(() => document.querySelectorAll(".rg-gantt-header-cell").length);
    // Day zoom renders a per-day column (hundreds for the range); Month zoom is
    // per-month and must be far fewer.
    expect(dayCells).toBeGreaterThan(100);

    await page.locator('#ganttPage [data-gantt-zoom="month-quarter"]').click();
    await page.waitForTimeout(900);
    const monthCells = await page.evaluate(() => document.querySelectorAll(".rg-gantt-header-cell").length);
    expect(monthCells).toBeLessThan(dayCells / 10);

    // active button state follows the stored preset
    await expect(page.locator('#ganttPage [data-gantt-zoom="month-quarter"]')).toHaveClass(/active/);
    await expect(page.locator('#ganttPage [data-gantt-zoom="day-week"]')).not.toHaveClass(/active/);

    // persisted across a reload
    await page.reload();
    await openChart(page);
    await expect(page.locator('#ganttPage [data-gantt-zoom="month-quarter"]')).toHaveClass(/active/);
    await expect(page.locator('#ganttPage [data-gantt-zoom="day-week"]')).not.toHaveClass(/active/);
    expect(await page.evaluate(() => document.querySelectorAll(".rg-gantt-header-cell").length)).toBeLessThan(dayCells / 10);
  });

  test("every vendored Revolist file is served (no failed dynamic imports)", async ({ page }) => {
    test.setTimeout(60000);
    const failed = [];
    const isRevolist = (s) => /revolist|revo-grid|dynamically imported/.test(s);
    page.on("requestfailed", (r) => { if (isRevolist(r.url())) failed.push(r.url()); });
    page.on("pageerror", (e) => { if (isRevolist(e.message)) failed.push("pageerror: " + e.message); });
    page.on("console", (m) => { if (m.type() === "error" && isRevolist(m.text())) failed.push(m.text()); });

    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await openChart(page);

    // the record of loaded modules proves the whole graph resolved
    const loaded = await page.evaluate(() => {
      const grid = document.querySelector("#ganttChart revo-grid");
      if (!grid || !grid.gantt) return [];
      return window.performance.getEntriesByType("resource")
        .map((e) => e.name)
        .filter((n) => /revolist/.test(n));
    });
    // the full ESM graph for a real render includes the runtime entry chunk and
    // at least one component entry (the exact set is a vendor detail; the
    // important thing is that the dynamic imports resolved and nothing failed)
    expect(loaded.length).toBeGreaterThan(10);
    expect(failed).toEqual([]);
  });

  test("Close returns to the main view", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);

    await openChart(page);
    await page.locator("#ganttPage .smd-page-footer").getByText("Close").click();
    await expect(page.locator("#ganttPage")).not.toHaveAttribute("open", "");
    await expect(page.locator("#countdownContainer")).toBeVisible();
  });
});