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

  test("collapsing a stream ABOVE the viewport keeps the visible rows anchored (no scroll jump)", async ({ page }) => {
    test.setTimeout(60000);
    // 30 streams x 6 jobs = 210 rows: far more than the ~24 rows that fit on
    // screen. Collapsing/expanding a stream above the current scroll position
    // must NOT move the rows under the cursor - the scroll stays anchored to
    // the same row even though the total row count changed.
    const streams = [];
    for (let i = 1; i <= 30; i++) {
      streams.push({
        title: "S" + i,
        sequence: i,
        jobs: Array.from({ length: 6 }, (_, j) => ({
          id: "s" + i + "_j" + (j + 1),
          title: "S" + i + "J" + (j + 1),
          sequence: j + 1,
          active: true,
          schedule: { type: "daily" },
          duration: 1
        }))
      });
    }
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const topRow = (page) => page.evaluate(() => {
      const scroller = document.querySelector("#ganttChart revo-grid .vertical-inner");
      // the first rendered row whose top is at/just below the viewport top
      let best = null;
      document.querySelectorAll("#ganttChart .rgRow").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top >= 95 && (!best || r.top < best.top)) {
          best = { top: r.top, title: (el.querySelector(".pmd-gantt-stream-title") || el.querySelector(".pmd-gantt-job-name") || {}).textContent };
        }
      });
      return { scrollTop: scroller.scrollTop, row: best };
    });

    // Scroll so S5's header is at the top of the viewport.
    await page.evaluate(() => {
      const scroller = document.querySelector("#ganttChart revo-grid .vertical-inner");
      scroller.scrollTop = 28 * 30; // S5 header is source index 28 (4 streams * 7 rows)
    });
    await page.waitForTimeout(400);
    const before = await topRow(page);
    expect(before.row && before.row.title).toBe("S5");
    expect(before.scrollTop).toBe(840);

    // Collapse S2 (ABOVE the viewport). S5 must remain the top visible row.
    await page.evaluate(() => ganttToggleStreamCollapsed("S2"));
    await page.waitForTimeout(600);
    const afterCollapse = await topRow(page);
    expect(afterCollapse.row && afterCollapse.row.title).toBe("S5");

    // Re-expand S2; still anchored on S5.
    await page.evaluate(() => ganttToggleStreamCollapsed("S2"));
    await page.waitForTimeout(600);
    const afterExpand = await topRow(page);
    expect(afterExpand.row && afterExpand.row.title).toBe("S5");
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
        // The bar label is positioned to the RIGHT of its bar (offset by
        // `left: calc(100% + 12px)` in the vendor CSS) but is DOM-nested inside
        // the bar element, so walking up its ancestors stops at the solid bar
        // background even though the label is painted on the timeline cell
        // behind it. Resolve the ACTUAL painted background under the label via
        // elementFromPoint instead, so the contrast check reflects what is on
        // screen (the timeline cell, which follows the page surface).
        const readLabel = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { color: getComputedStyle(el).color, bg: hit ? read(hit).bg : null };
        };
        const cell = document.querySelector("revogr-data .rgCell");
        const label = document.querySelector(".rg-gantt-bar-label");
        const timeline = document.querySelector(".rg-gantt-cell");
        return {
          nameCell: read(cell),
          timelineLabel: readLabel(label || timeline),
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

  test("Gantt uses theme primary/secondary for the zoom buttons, solid success/danger bars, and a standard header background in light and dark", async ({ page }) => {
    // (1) zoom buttons: the SELECTED preset is the theme PRIMARY button colour,
    //     the unselected ones are SECONDARY;
    // (2) task bars are SOLID --bs-success, stream bars SOLID --bs-danger (the
    //     vendor ships a gradient for both);
    // (3) the timeline header background is the standard theme background for
    //     the mode (no dark-navy gradient showing through on themes like
    //     superhero whose light mode still has a dark --bs-body-bg).
    test.setTimeout(120000);
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);

    const parse = (s) => String(s).match(/[\d.]+/g).slice(0, 3).map(Number);
    const rgb = (v) => {
      // Accept either "rgb(r, g, b)" (as the browser reports computed colors) or
      // a hex "#rrggbb" / "#rgb" (as the --bs-* custom props are declared).
      const s = String(v).trim();
      if (s.charAt(0) === "#") {
        let h = s.slice(1);
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        return "rgb(" + [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ") + ")";
      }
      return "rgb(" + parse(s).join(", ") + ")";
    };

    for (const [theme, mode] of [["superhero", "light"], ["superhero", "dark"], ["bootstrap", "light"], ["bootstrap", "dark"]]) {
      await page.evaluate(([t, m]) => applyTheme(t, m), [theme, mode]);
      await page.waitForFunction((m) => document.documentElement.getAttribute("data-bs-theme") === m, mode);
      await page.waitForTimeout(700); // let the per-mode override stylesheet land
      await openChart(page);

      const expected = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return {
          primary: root.getPropertyValue("--bs-primary").trim(),
          secondary: root.getPropertyValue("--bs-secondary").trim(),
          success: root.getPropertyValue("--bs-success").trim(),
          danger: root.getPropertyValue("--bs-danger").trim(),
          secondaryBg: root.getPropertyValue("--bs-secondary-bg").trim(),
          bodyBg: root.getPropertyValue("--bs-body-bg").trim()
        };
      });
      const primary = rgb(expected.primary), secondary = rgb(expected.secondary);
      const success = rgb(expected.success), danger = rgb(expected.danger);

      // (1) zoom buttons
      const zoom = await page.evaluate(() => {
        const active = document.querySelector('#ganttPage .gantt-zoom > .btn.active');
        const inactive = document.querySelector('#ganttPage .gantt-zoom > .btn:not(.active)');
        return {
          activeBg: active ? getComputedStyle(active).backgroundColor : null,
          inactiveBg: inactive ? getComputedStyle(inactive).backgroundColor : null,
          activeColor: active ? getComputedStyle(active).color : null,
          inactiveColor: inactive ? getComputedStyle(inactive).color : null
        };
      });
      expect(zoom.activeBg, `${theme}/${mode} active zoom is primary`).toBe(primary);
      expect(zoom.inactiveBg, `${theme}/${mode} inactive zoom is secondary`).toBe(secondary);
      // Button text is WHITE on both the filled primary (selected) and secondary
      // (unselected) surfaces, exactly like Bootstrap's own `.btn-primary`/
      // `.btn-secondary` (`--bs-btn-color: #fff`). A `--bs-body-color` fallback
      // would render black in light mode.
      expect(zoom.activeColor, `${theme}/${mode} active zoom text is white`).toBe("rgb(255, 255, 255)");
      expect(zoom.inactiveColor, `${theme}/${mode} inactive zoom text is white`).toBe("rgb(255, 255, 255)");

      // (2) bars: solid, matching the theme success/danger exactly
      const bars = await page.evaluate(() => {
        const job = document.querySelector('#ganttPage .rg-gantt-bar:not(.rg-gantt-bar--summary)');
        const stream = document.querySelector('#ganttPage .rg-gantt-bar--summary');
        return {
          jobBg: job ? getComputedStyle(job).backgroundColor : null,
          jobImage: job ? getComputedStyle(job).backgroundImage : null,
          streamBg: stream ? getComputedStyle(stream).backgroundColor : null,
          streamImage: stream ? getComputedStyle(stream).backgroundImage : null
        };
      });
      expect(bars.jobBg, `${theme}/${mode} job bar is solid success`).toBe(success);
      expect(bars.jobImage, `${theme}/${mode} job bar has no gradient`).toBe("none");
      expect(bars.streamBg, `${theme}/${mode} stream bar is solid danger`).toBe(danger);
      expect(bars.streamImage, `${theme}/${mode} stream bar has no gradient`).toBe("none");

      // (3) the timeline header background = the gantt BODY surface (--bs-body-bg)
      //     for this theme/mode, matching the cells - NOT --bs-secondary-bg
      //     (which is light-grey in superhero light and would render the
      //     near-white header text white-on-white) and NOT the vendor's dark
      //     gradient.
      const header = await page.evaluate(() => {
        const h = document.querySelector('#ganttPage .rg-gantt-header');
        const revo = document.querySelector('#ganttChart revo-grid revogr-header');
        const cell = document.querySelector('#ganttChart .rg-gantt-cell');
        return {
          hBg: h ? getComputedStyle(h).backgroundColor : null,
          hImage: h ? getComputedStyle(h).backgroundImage : null,
          hColor: h ? getComputedStyle(h).color : null,
          revoBg: revo ? getComputedStyle(revo).backgroundColor : null,
          cellBg: cell ? getComputedStyle(cell).backgroundColor : null
        };
      });
      expect(header.hBg, `${theme}/${mode} timeline header uses --bs-body-bg`).toBe(rgb(expected.bodyBg));
      expect(header.hImage, `${theme}/${mode} timeline header has no gradient`).toBe("none");
      expect(header.revoBg, `${theme}/${mode} revogr-header uses --bs-body-bg`).toBe(rgb(expected.bodyBg));
      // header text must contrast on the body surface (readable, not white-on-white)
      expect(header.hColor, `${theme}/${mode} header text readable on body bg`).not.toBe(rgb(expected.bodyBg));

      await page.evaluate(() => closeGantt());
    }
  });

  test("the Streams filter dropdown uses the themed dropdown surface, a solid secondary toggle, and readable hover in light and dark", async ({ page }) => {
    // The dropdown must NOT look "dull"/broken on themes whose light mode is
    // still dark (superhero): the menu follows Bootstrap's own --bs-dropdown-*
    // tokens (themed surface + hover), and the toggle is a solid secondary
    // button with white text like the zoom buttons.
    test.setTimeout(120000);
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);

    const parse = (s) => String(s).match(/[\d.]+/g).slice(0, 3).map(Number);
    const rgb = (v) => {
      const s = String(v).trim();
      if (s.charAt(0) === "#") {
        let h = s.slice(1);
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        return "rgb(" + [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ") + ")";
      }
      return "rgb(" + parse(s).join(", ") + ")";
    };

    for (const [theme, mode] of [["superhero", "light"], ["superhero", "dark"], ["bootstrap", "light"], ["bootstrap", "dark"]]) {
      await page.evaluate(([t, m]) => applyTheme(t, m), [theme, mode]);
      await page.waitForFunction((m) => document.documentElement.getAttribute("data-bs-theme") === m, mode);
      await page.waitForTimeout(700); // let the per-mode override stylesheet land
      await openChart(page);

      await page.evaluate(() => ganttToggleStreamMenu());
      await page.waitForTimeout(200);

      const expected = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        // Resolve --bs-dropdown-bg through a real element (it may be a var()).
        const probeMenu = document.createElement("div");
        probeMenu.className = "dropdown-menu";
        probeMenu.style.cssText = "position:absolute;left:-9999px;display:block";
        document.body.appendChild(probeMenu);
        const menuCs = getComputedStyle(probeMenu);
        const out = { secondary: root.getPropertyValue("--bs-secondary").trim(), dropdownBg: menuCs.backgroundColor };
        probeMenu.remove();
        return out;
      });
      const secondary = rgb(expected.secondary);

      const dropdown = await page.evaluate(() => {
        const menu = document.querySelector("#ganttStreamMenu");
        const btn = document.querySelector("#ganttStreamMenuBtn");
        const row = document.querySelector(".gantt-stream-row");
        const hoverBg = Array.from(document.styleSheets)
          .flatMap((s) => { try { return Array.from(s.cssRules); } catch (e) { return []; } })
          .filter((r) => r.selectorText && r.selectorText.includes(".gantt-stream-row:hover"))
          .map((r) => r.style.getPropertyValue("background-color"))
          .filter(Boolean)
          .pop();
        return {
          menuBg: menu ? getComputedStyle(menu).backgroundColor : null,
          menuColor: menu ? getComputedStyle(menu).color : null,
          btnBg: btn ? getComputedStyle(btn).backgroundColor : null,
          btnColor: btn ? getComputedStyle(btn).color : null,
          rowColor: row ? getComputedStyle(row).color : null,
          hoverBgRule: hoverBg || null
        };
      });

      // (1) the toggle is a SOLID secondary button with white text
      expect(dropdown.btnBg, `${theme}/${mode} toggle is solid secondary`).toBe(secondary);
      expect(dropdown.btnColor, `${theme}/${mode} toggle text is white`).toBe("rgb(255, 255, 255)");

      // (2) the menu surface comes from Bootstrap's theme-aware dropdown token,
      //     so it is NOT the dull dark-navy body background of superhero light
      expect(dropdown.menuBg, `${theme}/${mode} menu uses --bs-dropdown-bg`).toBe(rgb(expected.dropdownBg));

      // (3) the menu + row text is readable on the menu surface (contrast, not
      //     white-on-white)
      const contrast = (c1, c2) => {
        const lum = (v) => {
          const f = (x) => (x / 255 <= 0.03928 ? x / 255 / 12.92 : Math.pow((x / 255 + 0.055) / 1.055, 2.4));
          const [r, g, b] = v.map(Number);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const a = lum(parse(c1)), b = lum(parse(c2));
        const [hi, lo] = a > b ? [a, b] : [b, a];
        return (hi + 0.05) / (lo + 0.05);
      };
      expect(contrast(dropdown.menuColor, dropdown.menuBg), `${theme}/${mode} menu text contrasts on menu bg`).toBeGreaterThanOrEqual(3);
      expect(contrast(dropdown.rowColor, dropdown.menuBg), `${theme}/${mode} row text contrasts on menu bg`).toBeGreaterThanOrEqual(3);

      // (4) the row :hover has a rule (themed translucent overlay, not a solid
      //     light-grey that would render white-on-white in superhero light)
      expect(dropdown.hoverBgRule, `${theme}/${mode} row hover has a background rule`).toBeTruthy();

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

  test("dragging a job bar shows a ghost panel with start, end and duration that follows the cursor", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await openChart(page);

    // pick a task bar and grab its LEFT half (move zone)
    const bar = page.locator(".rg-gantt-bar--task").first();
    const box = await bar.boundingBox();
    expect(box).toBeTruthy();
    const start = { x: box.x + box.width * 0.25, y: box.y + box.height / 2 };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 120, start.y, { steps: 6 });
    await page.waitForTimeout(100);

    const ghost = await page.evaluate(() => {
      const el = document.querySelector(".pmd-gantt-bar-ghost");
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const text = el.textContent || "";
      const cs = getComputedStyle(el);
      const root = getComputedStyle(document.documentElement);
      const date = el.querySelector(".pmd-gantt-bar-ghost-date");
      const dateCs = date ? getComputedStyle(date) : null;
      return {
        text: text.replace(/\s+/g, " ").trim(),
        hasStart: /Start\s*:/i.test(text),
        hasEnd: /End\s*:/i.test(text),
        hasDuration: /Duration\s*:/i.test(text),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        bg: cs.backgroundColor,
        borderWidth: cs.borderTopWidth,
        expectedBg: root.getPropertyValue("--bs-body-bg").trim(),
        dateColor: dateCs ? dateCs.color : null,
        dateWeight: dateCs ? dateCs.fontWeight : null,
        labelColor: cs.color
      };
    });

    // the ghost must exist and show all three fields
    expect(ghost).toBeTruthy();
    expect(ghost.hasStart).toBe(true);
    expect(ghost.hasEnd).toBe(true);
    expect(ghost.hasDuration).toBe(true);

    // it must have a SOLID background (the gantt/body surface) and a real
    // border, so the text does not float over the gridlines. The ghost lives on
    // <body> (outside #ganttPage), so it must use the global --bs-* tokens.
    const parse = (s) => String(s).match(/[\d.]+/g).slice(0, 3).map(Number);
    const rgb = (v) => {
      const s = String(v).trim();
      if (s.charAt(0) === "#") {
        let h = s.slice(1);
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        return "rgb(" + [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ") + ")";
      }
      return "rgb(" + parse(s).join(", ") + ")";
    };
    expect(ghost.bg, "ghost background is the solid body surface").toBe(rgb(ghost.expectedBg));
    expect(parseFloat(ghost.borderWidth), "ghost has a real border").toBeGreaterThan(0);

    // the date values take the LABEL colour (not the bar's success green) and
    // are BOLD, so they read as values on the same surface as the labels
    expect(ghost.dateColor, "date values match the label colour").toBe(ghost.labelColor);
    expect(Number(ghost.dateWeight) >= 600, "date values are bold").toBe(true);

    // it must be near the cursor (not at the bar's original position)
    const cursor = await page.evaluate(() => ({ x: Math.round(window.__lastMouseX), y: Math.round(window.__lastMouseY) }));
    expect(Math.abs(ghost.x - start.x)).toBeLessThan(150);

    // release -> ghost is gone
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => !!document.querySelector(".pmd-gantt-bar-ghost"));
    expect(after).toBe(false);
  });

  test("dragging a STREAM bar also shows the ghost panel with the stream's span", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await openChart(page);

    const bar = page.locator(".rg-gantt-bar--summary").first();
    const box = await bar.boundingBox();
    expect(box).toBeTruthy();
    const start = { x: box.x + box.width * 0.25, y: box.y + box.height / 2 };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y, { steps: 5 });
    await page.waitForTimeout(100);

    const ghost = await page.evaluate(() => {
      const el = document.querySelector(".pmd-gantt-bar-ghost");
      if (!el) return null;
      const text = el.textContent || "";
      return {
        hasStart: /Start\s*:/i.test(text),
        hasEnd: /End\s*:/i.test(text),
        hasDuration: /Duration\s*:/i.test(text)
      };
    });
    expect(ghost).toBeTruthy();
    expect(ghost.hasStart).toBe(true);
    expect(ghost.hasEnd).toBe(true);
    expect(ghost.hasDuration).toBe(true);

    await page.mouse.up();
  });

  test("dragging a JOB row within its stream reorders it and renumbers sequence", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "Work", sequence: 1, jobs: [
        { id: "job_a", title: "Alpha", sequence: 1, active: true, schedule: { type: "daily" }, duration: 2 },
        { id: "job_b", title: "Beta", sequence: 2, active: true, schedule: { type: "daily" }, duration: 3 },
        { id: "job_c", title: "Gamma", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "Home", sequence: 2, jobs: [
        { id: "job_x", title: "Delta", sequence: 1, active: true, schedule: { type: "daily" }, duration: 2 }
      ]}
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const rowRect = (text) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      const row = name && name.closest(".rgRow");
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);

    // reported regression: drag item 3 (Gamma) above item 1 (Alpha) — it must
    // land as item 1, not item 2. The drop line is the pointer's Y, so place the
    // pointer on Alpha's row (upper quarter) to move Gamma above it.
    const gammaName = await nameRect("Gamma");
    const alphaRow = await rowRect("Alpha");
    expect(gammaName).toBeTruthy();
    expect(alphaRow).toBeTruthy();
    const lineY = alphaRow.y + alphaRow.h * 0.25; // upper quarter of Alpha's row
    await page.mouse.move(gammaName.x + gammaName.w / 2, gammaName.y + gammaName.h / 2);
    await page.mouse.down();
    await page.mouse.move(alphaRow.x + alphaRow.w / 2, lineY, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const order = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs
        .map((j) => ({ id: j.id, sequence: j.sequence })));
    expect(order.map((j) => j.id)).toEqual(["job_c", "job_a", "job_b"]);
    expect(order.map((j) => j.sequence)).toEqual([1, 2, 3]);

    // the drop-target highlight must be gone after the drag ends
    const highlight = await page.evaluate(() =>
      document.querySelectorAll("#ganttChart .rgRow.pmd-gantt-drop-target").length);
    expect(highlight).toBe(0);
  });

  test("dropping a job below another requires the cursor only at the target's midpoint (not past it)", async ({ page }) => {
    test.setTimeout(60000);
    // A1, A2, A3 in one stream. The drop line is the POINTER's Y, so placing A1
    // below A2 only needs the cursor at A2's midpoint — not a further half-row
    // past it (the sluggish-feeling regression).
    const streams = [
      { title: "Work", sequence: 1, jobs: [
        { id: "job_a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_a2", title: "A2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_a3", title: "A3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "Home", sequence: 2, jobs: [] }
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const rowRect = (text) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      const row = name && name.closest(".rgRow");
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const order = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs.map((j) => j.id));
    const hasTarget = (page) => page.evaluate(() => {
      const el = document.querySelector(".pmd-gantt-drop-target, .pmd-gantt-drop-target--after");
      if (!el) return null;
      return {
        cls: el.classList.contains("pmd-gantt-drop-target--after") ? "after" : "before",
        idx: el.getAttribute("data-rgrow"),
        top: Math.round(el.getBoundingClientRect().top)
      };
    });

    // Drag A1. The boundary right below A1 (A2's TOP) is where A1 already sits,
    // so it is a NO-OP and must show NO drop target.
    const a1 = await nameRect("A1");
    const a2 = await rowRect("A2");
    const a3 = await rowRect("A3");
    expect(a1).toBeTruthy();
    expect(a2).toBeTruthy();
    expect(a3).toBeTruthy();
    await page.mouse.move(a1.x + a1.w / 2, a1.y + a1.h / 2);
    await page.mouse.down();
    await page.mouse.move(a1.x + a1.w / 2, a2.y + a2.h * 0.25, { steps: 2 });
    expect(await hasTarget(page)).toBe(null); // no-op boundary suppressed

    // A2's MIDPOINT is the first valid "below A2" position; the drop line is the
    // pointer's Y, so the cursor only needs to reach it (not past A3). The
    // highlight normalizes "after A2" to a top border on the row below (A3).
    await page.mouse.move(a1.x + a1.w / 2, a2.y + a2.h / 2, { steps: 2 });
    const midTarget = await hasTarget(page);
    expect(midTarget).toBeTruthy();
    expect(midTarget.idx).toBe("3"); // normalized to a top border on A3
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await order(page)).toEqual(["job_a2", "job_a1", "job_a3"]);

    // Control: release on the no-op boundary (A2's top) leaves A1 in place.
    await page.evaluate((s) => localStorage.setItem("planmydays_streams", JSON.stringify(s)), streams);
    await page.reload({ waitUntil: "load" });
    await page.evaluate(() => openGantt());
    await page.waitForFunction(() => document.querySelectorAll(".rg-gantt-bar").length > 0, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    const a1b = await nameRect("A1");
    const a2b = await rowRect("A2");
    await page.mouse.move(a1b.x + a1b.w / 2, a1b.y + a1b.h / 2);
    await page.mouse.down();
    await page.mouse.move(a1b.x + a1b.w / 2, a2b.y + a2b.h * 0.25, { steps: 5 });
    expect(await hasTarget(page)).toBe(null); // no target while over the no-op
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await order(page)).toEqual(["job_a1", "job_a2", "job_a3"]);
  });

  test("a JOB row can be grabbed from anywhere in its title cell (not just the text)", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "Work", sequence: 1, jobs: [
        { id: "job_a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_a2", title: "A2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_a3", title: "A3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "Home", sequence: 2, jobs: [] }
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const cellRect = (text) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      const cell = name && name.closest(".rgCell");
      if (!cell) return null;
      const r = cell.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const rowRect = (text) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      const row = name && name.closest(".rgRow");
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const order = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs.map((j) => j.id));

    // Grab A1 from the FAR RIGHT of its title cell (empty cell padding, well
    // away from the name text) - the drag must still start.
    const a1Cell = await cellRect("A1");
    const a2 = await rowRect("A2");
    expect(a1Cell).toBeTruthy();
    expect(a2).toBeTruthy();
    const grabX = a1Cell.x + a1Cell.w - 20;
    const grabY = a1Cell.y + a1Cell.h / 2;
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    // moving to A2's midpoint and releasing must reorder A1 below A2
    await page.mouse.move(grabX, a2.y + a2.h / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await order(page)).toEqual(["job_a2", "job_a1", "job_a3"]);
  });

  test("dragging a JOB shows a ghost title following the cursor and highlights the source row", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "Work", sequence: 1, jobs: [
        { id: "job_a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_a2", title: "A2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_a3", title: "A3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "Home", sequence: 2, jobs: [] }
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const rowRect = (text) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      const row = name && name.closest(".rgRow");
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);

    const a1 = await nameRect("A1");
    const a2 = await rowRect("A2");
    expect(a1).toBeTruthy();
    expect(a2).toBeTruthy();
    await page.mouse.move(a1.x + a1.w / 2, a1.y + a1.h / 2);
    await page.mouse.down();
    await page.mouse.move(a1.x + a1.w / 2, a2.y + a2.h / 2, { steps: 5 });

    // A ghost of the job's title follows the cursor
    const during = await page.evaluate(() => {
      const ghost = document.querySelector(".pmd-gantt-drag-ghost");
      const dragging = document.querySelector(".pmd-gantt-dragging");
      return {
        ghostExists: !!ghost,
        ghostText: ghost ? ghost.textContent.trim() : null,
        ghostPointerEvents: ghost ? getComputedStyle(ghost).pointerEvents : null,
        ghostY: ghost ? Math.round(ghost.getBoundingClientRect().y) : null,
        draggingExists: !!dragging,
        draggingIdx: dragging ? dragging.getAttribute("data-rgrow") : null
      };
    });
    expect(during.ghostExists).toBe(true);
    expect(during.ghostText).toBe("A1");
    expect(during.ghostPointerEvents).toBe("none");
    expect(during.draggingExists).toBe(true);
    expect(during.draggingIdx).toBe("1"); // A1's row

    // ghost moves when the pointer does
    const y1 = during.ghostY;
    await page.mouse.move(a1.x + a1.w / 2, a2.y + a2.h * 0.75, { steps: 3 });
    const y2 = await page.evaluate(() => {
      const ghost = document.querySelector(".pmd-gantt-drag-ghost");
      return ghost ? Math.round(ghost.getBoundingClientRect().y) : null;
    });
    expect(y2).not.toBe(y1);

    // releasing removes the ghost and the row highlight
    await page.mouse.up();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
      ghostExists: !!document.querySelector(".pmd-gantt-drag-ghost"),
      draggingRows: document.querySelectorAll(".pmd-gantt-dragging").length
    }));
    expect(after.ghostExists).toBe(false);
    expect(after.draggingRows).toBe(0);
  });

  test("dragging auto-scrolls the grid when the cursor nears the bottom edge", async ({ page }) => {
    test.setTimeout(60000);
    // Many rows so the grid's vertical viewport overflows and can scroll.
    const streams = Array.from({ length: 6 }, (_, si) => ({
      title: "S" + (si + 1),
      sequence: si + 1,
      jobs: Array.from({ length: 6 }, (_, ji) => ({
        id: "s" + si + "_j" + ji,
        title: "S" + (si + 1) + "J" + (ji + 1),
        sequence: ji + 1,
        active: true,
        schedule: { type: "daily" },
        duration: 1
      }))
    }));
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const scrollerState = (page) => page.evaluate(() => {
      const s = document.querySelector("#ganttChart revo-grid .vertical-inner");
      return s ? { scrollTop: s.scrollTop, clientH: s.clientHeight, scrollH: s.scrollHeight } : null;
    });

    const st = await scrollerState(page);
    expect(st).toBeTruthy();
    expect(st.scrollH).toBeGreaterThan(st.clientH); // confirm it can scroll

    const s1j1 = await nameRect("S1J1");
    expect(s1j1).toBeTruthy();
    const bottom = await page.evaluate(() => {
      const s = document.querySelector("#ganttChart revo-grid .vertical-inner");
      const r = s.getBoundingClientRect();
      return r.bottom;
    });
    const before = await scrollerState(page);

    // drag S1J1 and hold the cursor near the bottom edge -> auto-scroll begins
    await page.mouse.move(s1j1.x + s1j1.w / 2, s1j1.y + s1j1.h / 2);
    await page.mouse.down();
    await page.mouse.move(s1j1.x + s1j1.w / 2, bottom - 10, { steps: 8 });
    await page.waitForTimeout(400); // let the interval-driven scroll run
    const during = await scrollerState(page);
    expect(during.scrollTop).toBeGreaterThan(before.scrollTop);

    // releasing ends the drag and stops scrolling. The interval fires every 50ms
    // so the mid-drag capture may have been taken a tick before the release
    // cleared it; what matters is that it no longer advances after release.
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after1 = await scrollerState(page);
    await page.waitForTimeout(200);
    const after2 = await scrollerState(page);
    expect(after1.scrollTop).toBe(after2.scrollTop);
  });

  test("dragging a JOB onto its OWN stream header shows no drop target (no valid drop)", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "Work", sequence: 1, jobs: [
        { id: "job_a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_a2", title: "A2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_a3", title: "A3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "Home", sequence: 2, jobs: [] }
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const headerRect = (title) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).find((s) => s.textContent.trim() === t);
      if (!name) return null;
      const r = name.closest(".rgRow").getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, title);
    const hasTarget = (page) => page.evaluate(() =>
      !!document.querySelector(".pmd-gantt-drop-target, .pmd-gantt-drop-target--after"));
    const order = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs.map((j) => j.id));

    // Drag A1 onto its OWN stream header (Work). There is no valid drop: it is
    // not part of the stream above (Work is first) and it would not move.
    const a1 = await nameRect("A1");
    const header = await headerRect("Work");
    expect(a1).toBeTruthy();
    expect(header).toBeTruthy();
    await page.mouse.move(a1.x + a1.w / 2, a1.y + a1.h / 2);
    await page.mouse.down();
    // both halves of the header must show no target
    await page.mouse.move(a1.x + a1.w / 2, header.y + header.h * 0.25, { steps: 2 });
    expect(await hasTarget(page)).toBe(false);
    await page.mouse.move(a1.x + a1.w / 2, header.y + header.h * 0.75, { steps: 2 });
    expect(await hasTarget(page)).toBe(false);
    // releasing there leaves the order unchanged
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await order(page)).toEqual(["job_a1", "job_a2", "job_a3"]);
  });

  test("dragging a JOB onto its OWN stream header is a no-op (never reparents to the stream above)", async ({ page }) => {
    test.setTimeout(60000);
    // A/B/C/D all open. Dragging C1 onto Stream C's header (its OWN stream) must
    // show no drop target and must NOT move it into B (the stream above C): the
    // boundary just below C's header is C1's own first-job slot, so it is a
    // no-op. But dragging a job from ANOTHER stream (D1) onto C's header still
    // goes to the stream above (B) - that is the "above the header is not part
    // of this stream" rule.
    const streams = [
      { title: "A", sequence: 1, jobs: [
        { id: "job_a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_a2", title: "A2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_a3", title: "A3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "B", sequence: 2, jobs: [
        { id: "job_b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_b2", title: "B2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_b3", title: "B3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "C", sequence: 3, jobs: [
        { id: "job_c1", title: "C1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_c2", title: "C2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_c3", title: "C3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "D", sequence: 4, jobs: [
        { id: "job_d1", title: "D1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }
      ]}
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const headerRect = (title) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).find((s) => s.textContent.trim() === t);
      if (!name) return null;
      const r = name.closest(".rgRow").getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, title);
    const hasTarget = (page) => page.evaluate(() =>
      !!document.querySelector(".pmd-gantt-drop-target, .pmd-gantt-drop-target--after"));
    const order = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams")).map((s) => ({
        title: s.title, jobs: (s.jobs || []).map((j) => j.id)
      })));

    // Drag C1 onto Stream C's header -> no target, no change
    const c1 = await nameRect("C1");
    const cHeader = await headerRect("C");
    expect(c1).toBeTruthy();
    expect(cHeader).toBeTruthy();
    await page.mouse.move(c1.x + c1.w / 2, c1.y + c1.h / 2);
    await page.mouse.down();
    await page.mouse.move(c1.x + c1.w / 2, cHeader.y + cHeader.h * 0.75, { steps: 2 });
    expect(await hasTarget(page)).toBe(false);
    await page.mouse.up();
    await page.waitForTimeout(600);
    let o = await order(page);
    expect(o.find((s) => s.title === "C").jobs).toEqual(["job_c1", "job_c2", "job_c3"]);
    expect(o.find((s) => s.title === "B").jobs).toEqual(["job_b1", "job_b2", "job_b3"]);

    // Control: drag D1 (from D) onto C's header -> target shown, goes to B (above C)
    await page.evaluate((s) => localStorage.setItem("planmydays_streams", JSON.stringify(s)), streams);
    await page.reload({ waitUntil: "load" });
    await page.evaluate(() => openGantt());
    await page.waitForFunction(() => document.querySelectorAll(".rg-gantt-bar").length > 0, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    const d1 = await nameRect("D1");
    const cHeader2 = await headerRect("C");
    await page.mouse.move(d1.x + d1.w / 2, d1.y + d1.h / 2);
    await page.mouse.down();
    await page.mouse.move(d1.x + d1.w / 2, cHeader2.y + cHeader2.h * 0.75, { steps: 2 });
    expect(await hasTarget(page)).toBe(true);
    await page.mouse.up();
    await page.waitForTimeout(600);
    o = await order(page);
    expect(o.find((s) => s.title === "B").jobs).toEqual(["job_b1", "job_b2", "job_b3", "job_d1"]);
    expect(o.find((s) => s.title === "C").jobs).toEqual(["job_c1", "job_c2", "job_c3"]);
  });

  test("dropping a JOB on its own original slot keeps it there (regression: it went to the end)", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "Work", sequence: 1, jobs: [
        { id: "job_a", title: "Alpha", sequence: 1, active: true, schedule: { type: "daily" }, duration: 2 },
        { id: "job_b", title: "Beta", sequence: 2, active: true, schedule: { type: "daily" }, duration: 3 },
        { id: "job_c", title: "Gamma", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "Home", sequence: 2, jobs: [] }
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    // helper that returns the ROW rect (not the name span) for a job name
    const rowRect = (text) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      const row = name && name.closest(".rgRow");
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);

    const alpha = await rowRect("Alpha");
    const beta = await rowRect("Beta");
    expect(alpha).toBeTruthy();
    expect(beta).toBeTruthy();

    // grab item 2 (Beta) at its row's vertical middle
    await page.mouse.move(beta.x + beta.w / 2, beta.y + beta.h / 2);
    await page.mouse.down();
    // drag it up above item 1 (Alpha)
    await page.mouse.move(alpha.x + alpha.w / 2, alpha.y - 8, { steps: 4 });
    // then drag back DOWN so the pointer sits at the boundary between Alpha's
    // bottom and Beta's top (Beta's own original slot). This used to resolve to
    // Beta itself as the anchor, which after removal was unfindable and sent the
    // job to the end of the stream. The insertion line skips the dragged row, so
    // Beta stays in place.
    const boundaryY = beta.y; // top of Beta's row == boundary between Alpha and Beta
    await page.mouse.move(alpha.x + alpha.w / 2, boundaryY + beta.h / 2, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const order = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))[0].jobs.map((j) => j.id));
    expect(order).toEqual(["job_a", "job_b", "job_c"]);
  });

  test("dropping a JOB on a stream header appends it to the stream above (bottom), never the header's own stream", async ({ page }) => {
    test.setTimeout(60000);
    // A open, B closed, C open, D open. Dragging D2 "between B and C" (on B's or
    // C's header, i.e. above C's header) must add it to the BOTTOM of B, never the
    // top of C: a drop above a stream's header is not part of that stream.
    const streams = [
      { title: "A", sequence: 1, jobs: [
        { id: "job_a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_a2", title: "A2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_a3", title: "A3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "B", sequence: 2, jobs: [
        { id: "job_b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_b2", title: "B2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_b3", title: "B3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "C", sequence: 3, jobs: [
        { id: "job_c1", title: "C1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_c2", title: "C2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_c3", title: "C3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "D", sequence: 4, jobs: [
        { id: "job_d1", title: "D1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_d2", title: "D2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "job_d3", title: "D3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]}
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await page.evaluate(() => localStorage.setItem("planmydays_ganttCollapsedStreams", JSON.stringify(["B"])));
    await enableGantt(page);
    await openChart(page);

    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const rowRect = (text) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      const row = name && name.closest(".rgRow");
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const headerRect = (title) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).find((s) => s.textContent.trim() === t);
      if (!name) return null;
      const r = name.closest(".rgRow").getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, title);
    const order = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams")).map((s) => ({
        title: s.title, jobs: (s.jobs || []).map((j) => j.id)
      })));

    async function reset() {
      await page.evaluate((s) => localStorage.setItem("planmydays_streams", JSON.stringify(s)), streams);
      await page.evaluate(() => localStorage.setItem("planmydays_ganttCollapsedStreams", JSON.stringify(["B"])));
      await page.reload({ waitUntil: "load" });
      await page.evaluate(() => openGantt());
      await page.waitForFunction(() => document.querySelectorAll(".rg-gantt-bar").length > 0, null, { timeout: 30000 });
      await page.waitForTimeout(400);
    }

    // Drop D2 (from D) "between B and C". First on B's (collapsed) header.
    await reset();
    const bHeader = await headerRect("B");
    expect(bHeader).toBeTruthy();
    const d2 = await nameRect("D2");
    const lineY = bHeader.y + bHeader.h / 2;
    await page.mouse.move(d2.x + d2.w / 2, d2.y + d2.h / 2);
    await page.mouse.down();
    await page.mouse.move(d2.x + d2.w / 2, lineY, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    let o = await order(page);
    expect(o.find((s) => s.title === "B").jobs).toEqual(["job_b1", "job_b2", "job_b3", "job_d2"]);
    expect(o.find((s) => s.title === "D").jobs).toEqual(["job_d1", "job_d3"]);

    // Now drop D2 on C's (expanded) header — still "above C's header", so it must
    // go to B's bottom, NOT to the top of C.
    await reset();
    const cHeader = await headerRect("C");
    expect(cHeader).toBeTruthy();
    const d2b = await nameRect("D2");
    const lineYb = cHeader.y + cHeader.h / 2;
    await page.mouse.move(d2b.x + d2b.w / 2, d2b.y + d2b.h / 2);
    await page.mouse.down();
    await page.mouse.move(d2b.x + d2b.w / 2, lineYb, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    o = await order(page);
    expect(o.find((s) => s.title === "B").jobs).toEqual(["job_b1", "job_b2", "job_b3", "job_d2"]);
    expect(o.find((s) => s.title === "C").jobs).toEqual(["job_c1", "job_c2", "job_c3"]);
    expect(o.find((s) => s.title === "D").jobs).toEqual(["job_d1", "job_d3"]);
  });

  test("dragging a JOB row onto another stream reparents it and renumbers both", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "Work", sequence: 1, jobs: [
        { id: "job_a", title: "Alpha", sequence: 1, active: true, schedule: { type: "daily" }, duration: 2 },
        { id: "job_c", title: "Gamma", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "Home", sequence: 2, jobs: [
        { id: "job_x", title: "Delta", sequence: 1, active: true, schedule: { type: "daily" }, duration: 2 }
      ]}
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);

    // drag Gamma (in Work) onto Delta's row (a Home job) -> reparents into Home
    const gamma = await nameRect("Gamma");
    const gammaRow = await page.evaluate(() => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === "Gamma");
      const row = name && name.closest(".rgRow");
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const deltaRow = await page.evaluate(() => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === "Delta");
      const row = name && name.closest(".rgRow");
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    expect(gammaRow).toBeTruthy();
    expect(deltaRow).toBeTruthy();
    // drop the line in Delta's UPPER half -> before Delta; the drop line is the
    // pointer's Y, so the pointer goes straight to Delta's row
    const lineY = deltaRow.y + deltaRow.h * 0.25;
    await page.mouse.move(gamma.x + gamma.w / 2, gamma.y + gamma.h / 2);
    await page.mouse.down();
    await page.mouse.move(deltaRow.x + deltaRow.w / 2, lineY, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const streamsAfter = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams")).map((s) => ({
        title: s.title,
        jobs: (s.jobs || []).map((j) => ({ id: j.id, sequence: j.sequence }))
      })));
    const work = streamsAfter.find((s) => s.title === "Work");
    const home = streamsAfter.find((s) => s.title === "Home");
    expect(work.jobs.map((j) => j.id)).toEqual(["job_a"]);
    expect(work.jobs.map((j) => j.sequence)).toEqual([1]);
    expect(home.jobs.map((j) => j.id)).toEqual(["job_c", "job_x"]);
    expect(home.jobs.map((j) => j.sequence)).toEqual([1, 2]);
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

  test("dragging a STREAM above another stream heading moves it there, ghost and row highlight included", async ({ page }) => {
    test.setTimeout(60000);
    // A, B, C, D (each with jobs). Dragging C UP onto B's header must drop it
    // ABOVE B -> A,C,B,D, with the same ghost + source-row highlight as jobs.
    const streams = [
      { title: "A", sequence: 1, jobs: [{ id: "a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "B", sequence: 2, jobs: [{ id: "b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "C", sequence: 3, jobs: [{ id: "c1", title: "C1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }, { id: "c2", title: "C2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "D", sequence: 4, jobs: [{ id: "d1", title: "D1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] }
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const headerRect = (title) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).find((s) => s.textContent.trim() === t);
      if (!name) return null;
      const r = name.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, title);
    const streamOrder = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .slice().sort((a, b) => a.sequence - b.sequence)
        .map((s) => s.title));
    const targetOn = (page) => page.evaluate(() => {
      const el = document.querySelector(".pmd-gantt-drop-target");
      if (!el) return null;
      const name = el.querySelector(".pmd-gantt-stream-title");
      return name ? name.textContent.trim() : null;
    });

    const c = await headerRect("C");
    const b = await headerRect("B");
    expect(c).toBeTruthy();
    expect(b).toBeTruthy();

    await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.w / 2, b.y + b.h / 2, { steps: 6 });

    // ghost shows the dragged STREAM title; the source row is highlighted
    const during = await page.evaluate(() => ({
      ghost: (document.querySelector(".pmd-gantt-drag-ghost") || {}).textContent || null,
      dragging: (() => {
        const el = document.querySelector(".pmd-gantt-dragging");
        if (!el) return null;
        const t = el.querySelector(".pmd-gantt-stream-title");
        return t ? t.textContent.trim() : null;
      })()
    }));
    expect(during.ghost).toBe("C");
    expect(during.dragging).toBe("C");

    // the drop target is a top border on B's header row (insert before B)
    expect(await targetOn(page)).toBe("B");
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await streamOrder(page)).toEqual(["A", "C", "B", "D"]);
    // the highlight is gone after the drop
    expect(await page.evaluate(() => document.querySelectorAll(".pmd-gantt-drop-target, .pmd-gantt-drop-target--after").length)).toBe(0);
  });

  test("dragging a STREAM onto a JOB of another stream resolves to that stream (C onto A's jobs -> start)", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "A", sequence: 1, jobs: [
        { id: "a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "a2", title: "A2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "a3", title: "A3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "B", sequence: 2, jobs: [{ id: "b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "C", sequence: 3, jobs: [{ id: "c1", title: "C1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "D", sequence: 4, jobs: [{ id: "d1", title: "D1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] }
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const headerRect = (title) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).find((s) => s.textContent.trim() === t);
      if (!name) return null;
      const r = name.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, title);
    const streamOrder = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .slice().sort((a, b) => a.sequence - b.sequence)
        .map((s) => s.title));

    const c = await headerRect("C");
    const a3 = await nameRect("A3");
    expect(c).toBeTruthy();
    expect(a3).toBeTruthy();
    await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.w / 2, a3.y + a3.h / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await streamOrder(page)).toEqual(["C", "A", "B", "D"]);
  });

  test("dragging a STREAM onto a JOB of the LAST stream moves it to the END (C onto D1 -> A,B,D,C)", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "A", sequence: 1, jobs: [{ id: "a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "B", sequence: 2, jobs: [{ id: "b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "C", sequence: 3, jobs: [{ id: "c1", title: "C1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "D", sequence: 4, jobs: [
        { id: "d1", title: "D1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "d2", title: "D2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "d3", title: "D3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]}
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const headerRect = (title) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).find((s) => s.textContent.trim() === t);
      if (!name) return null;
      const r = name.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, title);
    const streamOrder = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .slice().sort((a, b) => a.sequence - b.sequence)
        .map((s) => s.title));

    const c = await headerRect("C");
    const d1 = await nameRect("D1");
    expect(c).toBeTruthy();
    expect(d1).toBeTruthy();
    await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.w / 2, d1.y + d1.h / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await streamOrder(page)).toEqual(["A", "B", "D", "C"]);
  });

  test("dragging a STREAM onto a stream BELOW it shows the drop target on the last element (B onto D)", async ({ page }) => {
    test.setTimeout(60000);
    // The user's ABCD scenario: dragging B and dropping on C (the stream
    // immediately after B) shows a target; dropping on D (the stream below C)
    // moved the stream correctly but showed NO drop target. Both must render.
    const streams = [
      { title: "A", sequence: 1, jobs: [{ id: "a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "B", sequence: 2, jobs: [{ id: "b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "C", sequence: 3, jobs: [{ id: "c1", title: "C1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "D", sequence: 4, jobs: [
        { id: "d1", title: "D1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "d2", title: "D2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "d3", title: "D3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]}
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const headerRect = (title) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).find((s) => s.textContent.trim() === t);
      if (!name) return null;
      const r = name.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, title);
    const streamOrder = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .slice().sort((a, b) => a.sequence - b.sequence)
        .map((s) => s.title));
    const target = (page) => page.evaluate(() => {
      const el = document.querySelector(".pmd-gantt-drop-target, .pmd-gantt-drop-target--after");
      if (!el) return null;
      const name = el.querySelector(".pmd-gantt-job-name, .pmd-gantt-stream-title");
      return {
        after: el.classList.contains("pmd-gantt-drop-target--after"),
        label: name ? name.textContent.trim() : null
      };
    });

    // Control: dragging B onto C shows a target (the "immediately after" stream).
    const b = await headerRect("B");
    const c1 = await nameRect("C1");
    expect(b).toBeTruthy();
    expect(c1).toBeTruthy();
    await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.w / 2, c1.y + c1.h / 2, { steps: 6 });
    const onC = await target(page);
    expect(onC).toBeTruthy();
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await streamOrder(page)).toEqual(["A", "C", "B", "D"]);

    // Now drag B onto D3 (a job of D, the stream BELOW C) -> the drop lands at
    // the END of D, so a bottom-border target must be shown on D's last element.
    await page.evaluate((s) => localStorage.setItem("planmydays_streams", JSON.stringify(s)), streams);
    await page.reload({ waitUntil: "load" });
    await page.evaluate(() => openGantt());
    await page.waitForFunction(() => document.querySelectorAll(".rg-gantt-bar").length > 0, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    const b2 = await headerRect("B");
    const d3 = await nameRect("D3");
    expect(b2).toBeTruthy();
    expect(d3).toBeTruthy();
    await page.mouse.move(b2.x + b2.w / 2, b2.y + b2.h / 2);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.w / 2, d3.y + d3.h / 2, { steps: 6 });
    const onD = await target(page);
    expect(onD).toBeTruthy(); // BUG: currently null
    expect(onD.after).toBe(true);
    expect(onD.label).toBe("D3");
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await streamOrder(page)).toEqual(["A", "C", "D", "B"]);
  });

  test("dragging a STREAM onto the LAST VISIBLE stream shows the end drop target even when later streams are filtered out", async ({ page }) => {
    test.setTimeout(60000);
    // Regression: with the Streams dropdown filter hiding E+F, D is the last
    // VISIBLE stream. Dragging B onto D must still show the "very end" drop
    // target (bottom border on D's last element) - previously the target
    // resolved to the hidden next stream's header (not rendered) and no
    // highlight appeared, even though the drop itself worked.
    const streams = [
      { title: "A", sequence: 1, jobs: [{ id: "a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "B", sequence: 2, jobs: [{ id: "b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "C", sequence: 3, jobs: [{ id: "c1", title: "C1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "D", sequence: 4, jobs: [
        { id: "d1", title: "D1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "d2", title: "D2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "d3", title: "D3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "E", sequence: 5, jobs: [{ id: "e1", title: "E1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "F", sequence: 6, jobs: [{ id: "f1", title: "F1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] }
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await page.evaluate(() => localStorage.setItem("planmydays_ganttHiddenStreams", JSON.stringify(["E", "F"])));
    await enableGantt(page);
    await openChart(page);

    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const headerRect = (title) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).find((s) => s.textContent.trim() === t);
      if (!name) return null;
      const r = name.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, title);
    const streamOrder = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .slice().sort((a, b) => a.sequence - b.sequence)
        .map((s) => s.title));
    const target = (page) => page.evaluate(() => {
      const el = document.querySelector(".pmd-gantt-drop-target, .pmd-gantt-drop-target--after");
      if (!el) return null;
      const name = el.querySelector(".pmd-gantt-job-name, .pmd-gantt-stream-title");
      return {
        after: el.classList.contains("pmd-gantt-drop-target--after"),
        label: name ? name.textContent.trim() : null
      };
    });

    // E and F are hidden - only A,B,C,D render.
    const rendered = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).map((s) => s.textContent.trim()));
    expect(rendered).toEqual(["A", "B", "C", "D"]);

    // Drag B onto D1 (a job of D). D is the last VISIBLE stream, so the drop
    // lands at the very end -> bottom-border target on D's last element (D3).
    const b = await headerRect("B");
    const d1 = await nameRect("D1");
    expect(b).toBeTruthy();
    expect(d1).toBeTruthy();
    await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.w / 2, d1.y + d1.h / 2, { steps: 8 });
    const onD = await target(page);
    expect(onD).toBeTruthy(); // BUG: null because target resolved to hidden E
    expect(onD.after).toBe(true);
    expect(onD.label).toBe("D3");
    await page.mouse.up();
    await page.waitForTimeout(600);
    // E and F are hidden but still stored; they keep their sequence slots after D.
    expect(await streamOrder(page)).toEqual(["A", "C", "D", "B", "E", "F"]);
  });

  test("dragging a STREAM onto ITSELF or one of its jobs shows no drop target and does not move", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "A", sequence: 1, jobs: [{ id: "a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "B", sequence: 2, jobs: [{ id: "b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "C", sequence: 3, jobs: [
        { id: "c1", title: "C1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "c2", title: "C2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "D", sequence: 4, jobs: [{ id: "d1", title: "D1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] }
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const headerRect = (title) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).find((s) => s.textContent.trim() === t);
      if (!name) return null;
      const r = name.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, title);
    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const streamOrder = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .slice().sort((a, b) => a.sequence - b.sequence)
        .map((s) => s.title));
    const hasTarget = (page) => page.evaluate(() =>
      !!document.querySelector(".pmd-gantt-drop-target, .pmd-gantt-drop-target--after"));

    const c = await headerRect("C");
    const c2 = await nameRect("C2");
    expect(c).toBeTruthy();
    expect(c2).toBeTruthy();
    await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
    await page.mouse.down();
    // on its own header
    await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2 + c.h * 0.5, { steps: 3 });
    expect(await hasTarget(page)).toBe(false);
    // on its own job
    await page.mouse.move(c.x + c.w / 2, c2.y + c2.h / 2, { steps: 3 });
    expect(await hasTarget(page)).toBe(false);
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await streamOrder(page)).toEqual(["A", "B", "C", "D"]);
  });

  test("dragging a STREAM below the LAST element moves it to the end (C below D3)", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "A", sequence: 1, jobs: [{ id: "a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "B", sequence: 2, jobs: [{ id: "b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "C", sequence: 3, jobs: [{ id: "c1", title: "C1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "D", sequence: 4, jobs: [
        { id: "d1", title: "D1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "d2", title: "D2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "d3", title: "D3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]}
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const headerRect = (title) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).find((s) => s.textContent.trim() === t);
      if (!name) return null;
      const r = name.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, title);
    const nameRect = (text) => page.evaluate((t) => {
      const el = Array.from(document.querySelectorAll(".pmd-gantt-job-name")).find((s) => s.textContent.trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, text);
    const streamOrder = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .slice().sort((a, b) => a.sequence - b.sequence)
        .map((s) => s.title));

    const c = await headerRect("C");
    const d3 = await nameRect("D3");
    expect(c).toBeTruthy();
    expect(d3).toBeTruthy();
    await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
    await page.mouse.down();
    // the drop line is the POINTER's Y; below D3's midpoint is past the last job
    await page.mouse.move(c.x + c.w / 2, d3.y + d3.h * 0.75, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await streamOrder(page)).toEqual(["A", "B", "D", "C"]);
  });

  test("dragging a STREAM above the TOP stream moves it to the start (C above A)", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "A", sequence: 1, jobs: [{ id: "a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "B", sequence: 2, jobs: [{ id: "b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "C", sequence: 3, jobs: [{ id: "c1", title: "C1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "D", sequence: 4, jobs: [{ id: "d1", title: "D1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] }
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const headerRect = (title) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).find((s) => s.textContent.trim() === t);
      if (!name) return null;
      const r = name.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, title);
    const streamOrder = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .slice().sort((a, b) => a.sequence - b.sequence)
        .map((s) => s.title));

    const c = await headerRect("C");
    const a = await headerRect("A");
    expect(c).toBeTruthy();
    expect(a).toBeTruthy();
    await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.w / 2, a.y - 20, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await streamOrder(page)).toEqual(["C", "A", "B", "D"]);
  });

  test("moving a STREAM takes all of its jobs with it and keeps their internal order", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "A", sequence: 1, jobs: [{ id: "a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "B", sequence: 2, jobs: [{ id: "b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] },
      { title: "C", sequence: 3, jobs: [
        { id: "c1", title: "C1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "c2", title: "C2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "c3", title: "C3", sequence: 3, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "D", sequence: 4, jobs: [{ id: "d1", title: "D1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] }
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    const headerRect = (title) => page.evaluate((t) => {
      const name = Array.from(document.querySelectorAll(".pmd-gantt-stream-title")).find((s) => s.textContent.trim() === t);
      if (!name) return null;
      const r = name.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, title);
    const streamOrder = (page) => page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .slice().sort((a, b) => a.sequence - b.sequence)
        .map((s) => s.title));
    const jobIdsIn = (page, title) => page.evaluate((t) => {
      const s = JSON.parse(localStorage.getItem("planmydays_streams")).find((x) => x.title === t);
      return (s.jobs || []).map((j) => j.id);
    }, title);

    const c = await headerRect("C");
    const a = await headerRect("A");
    expect(c).toBeTruthy();
    expect(a).toBeTruthy();
    await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.w / 2, a.y - 20, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await streamOrder(page)).toEqual(["C", "A", "B", "D"]);
    // C still owns all three jobs, in their original sequence order
    expect(await jobIdsIn(page, "C")).toEqual(["c1", "c2", "c3"]);
  });

  test("the collapse toggle still works while stream headers are draggable", async ({ page }) => {
    test.setTimeout(60000);
    const streams = [
      { title: "A", sequence: 1, jobs: [
        { id: "a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 },
        { id: "a2", title: "A2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 }
      ]},
      { title: "B", sequence: 2, jobs: [{ id: "b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 1 }] }
    ];
    await page.goto("/PlanMyDay/");
    await seedStreams(page, streams);
    await enableGantt(page);
    await openChart(page);

    // clicking the toggle collapses A (its job rows vanish), it does not drag
    const before = await page.evaluate(() => document.querySelectorAll("#ganttChart .rg-gantt-bar").length);
    await page.locator("#ganttPage .pmd-gantt-stream-name")
      .filter({ hasText: "A" })
      .locator(".pmd-gantt-collapse-toggle")
      .click();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => document.querySelectorAll("#ganttChart .rg-gantt-bar").length);
    expect(after).toBeLessThan(before);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("planmydays_ganttCollapsedStreams") || "[]"))).toContain("A");
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