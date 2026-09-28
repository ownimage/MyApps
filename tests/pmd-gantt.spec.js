const { test, expect } = require("@playwright/test");

// The Gantt page (Settings -> Display -> Show Gantt, then the Gantt menu item)
// is a READ-ONLY projection of the stream/job tree. PlanMyDay jobs have no
// start/end dates — only a recurrence rule, an optional `sleepUntil` not-before
// date and a `duration` in days — so the chart derives:
//
//   start = job.sleepUntil || today      (today ASSUMED at read time)
//   end   = start + (job.duration || 1) days
//
// A stream is a collapsible group (pGroup 1). A stream WITH jobs spans them; a
// stream with NO jobs keeps empty start/end, which the library renders as a
// plain header line (so every stream has a row, ready for future reordering).
// Nothing here may write back to storage.
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

    // Job rows are labelled "<title> [<frequency>]", so look them up by title
    // rather than by the whole cell text.
    const byTitle = {};
    items.forEach((i) => { byTitle[i.pName.replace(/\s*\[.*\]$/, "")] = i; });

    // job with an explicit duration, no sleepUntil -> starts today, spans 3 days
    expect(byTitle["Daily standup"].pStart).toBe(today);
    expect(byTitle["Daily standup"].pEnd).toBe(await page.evaluate((t) => ganttAddDaysStr(t, 3), today));

    // job with sleepUntil + duration -> starts on sleepUntil, spans 2 days
    expect(byTitle["Planned review"].pStart).toBe("2026-10-05");
    expect(byTitle["Planned review"].pEnd).toBe("2026-10-07");

    // legacy job with no duration -> 1 day
    expect(byTitle["Legacy job"].pEnd).toBe(await page.evaluate((t) => ganttAddDaysStr(t, 1), today));
  });

  test("renders one row per stream and job, including an empty header for a job-less stream", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);

    await page.evaluate(() => openGantt());
    await page.waitForTimeout(800);

    // page is open
    await expect(page.locator("#ganttPage")).toHaveAttribute("open", "");

    const chart = await page.evaluate(() => {
      const host = document.getElementById("ganttPage").querySelector("#ganttChart");
      const rows = Array.from(host.querySelectorAll("table tr")).map((tr) => tr.textContent.replace(/\s+/g, " ").trim());
      return {
        drawn: !!host.querySelector(".gchartcontainer"),
        rowTexts: rows,
        // group rows are the stream rows
        groupCount: items => items.filter((i) => i.pGroup === 1).length
      };
    });

    expect(chart.drawn).toBe(true);
    // the task table lists: header rows, then Work + its 3 jobs, then Home.
    const text = chart.rowTexts.join(" | ");
    expect(text).toContain("Work");
    expect(text).toContain("Daily standup");
    expect(text).toContain("Planned review");
    expect(text).toContain("Legacy job");
    expect(text).toContain("Home");
    // A stream with no jobs still gets a header row (the empty header line).
    const homeRow = chart.rowTexts.find((r) => /Home/.test(r));
    expect(homeRow).toBeTruthy();
    // It is a header with no dates (0 duration / no start).
    expect(homeRow).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  test("opening the Gantt does not mutate the stored streams (read-only projection)", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    const before = await page.evaluate(() => localStorage.getItem("planmydays_streams"));

    await page.evaluate(() => openGantt());
    await page.waitForTimeout(600);
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

    const name = (t) => items.find((i) => i.pName.includes(t));
    // A plain daily job is the DEFAULT schedule, so it gets no bracket at all.
    expect(name("Standup").pName).toBe("Standup");
    // A job with no schedule at all is the same default -> also no bracket.
    expect(name("Untitled-less").pName).toBe("Untitled-less");
    // Everything that is NOT the default does get the frequency.
    // The parenthetical detail is trimmed: the name column ellipsises, so
    // "Weekdays (Mon-Fri)" would be cut to "Weekda..." and lose the meaning.
    expect(name("Review").pName).toBe("Review [Weekdays]");
    expect(name("Payday").pName).toBe("Payday [15th of every month]");
    // "day(s)" is part of the word, not parenthetical detail - must not be mangled.
    expect(name("Fortnightly").pName).toBe("Fortnightly [Every 14 day(s)]");
    expect(name("Pick days").pName).toBe("Pick days [Mon, Wed]");

    // Stream group rows are NOT labelled with a frequency - they are not jobs.
    const streamRow = items.find((i) => i.pName === "Work");
    expect(streamRow).toBeTruthy();
    expect(streamRow.pName).not.toContain("[");
  });

  test("task text meets WCAG AA contrast in BOTH light and dark mode", async ({ page }) => {
    // Regression guard for the washed-out chart: jsGantt hard-codes white row
    // fills but never sets a text colour, so under a dark theme the text
    // inherited a LIGHT colour and landed on a WHITE row (effectively invisible).
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
    const parse = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);

    for (const [mode, theme] of [["dark", "superhero"], ["light", "flatly"]]) {
      await page.evaluate(([t, m]) => applyTheme(t, m), [theme, mode]);
      await page.waitForFunction((m) => document.documentElement.getAttribute("data-bs-theme") === m, mode);
      // let the per-mode override stylesheet <theme>.<mode>.css land
      await page.waitForTimeout(700);
      await page.evaluate(() => openGantt());
      await page.waitForTimeout(900);

      const samples = await page.evaluate(() => {
        const read = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          let bg = "rgba(0, 0, 0, 0)", node = el;
          while (node && bg === "rgba(0, 0, 0, 0)") {
            const c = getComputedStyle(node).backgroundColor;
            if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) bg = c;
            node = node.parentElement;
          }
          return { color: getComputedStyle(el).color, bg };
        };
        return {
          groupName: read("tr.ggroupitem .gtaskname div"),
          childName: read("tr.glineitem .gtaskname div"),
          dur: read("tr.glineitem .gdur div"),
          startDate: read("tr.glineitem .gstartdate div"),
          weekHeader: read("#ganttChart .gcharttableh .gminorheading"),
          dayHeader: read("#ganttChart .gcharttableh .gminorheadingwkend"),
          // The WEEK-RANGE dates ("21/09/2026 - 27/09/2026"). The vendor pairs
          // .gmajorheading with .gminorheading on one `#ffffff` rule, so theming
          // only the minor heading left these labels white-on-white in dark mode.
          majorHeader: read("#ganttChart .gcharttableh .gmajorheading"),
          // The chart SURFACE must follow the page surface too. A pure
          // text-contrast check is not enough: with the `gantt` class present
          // the vendor's own `div.gantt { color: #656565 }` keeps text readable
          // on its hard-coded WHITE rows, so a regression to a white panel in
          // dark mode would still pass a contrast-only assertion. Comparing the
          // row fill to <body>'s fill is what actually pins the theming.
          rowFill: read("tr.glineitem .gdur div").bg,
          bodyFill: getComputedStyle(document.body).backgroundColor
        };
      });

      for (const [what, v] of Object.entries(samples)) {
        if (what === "rowFill" || what === "bodyFill") continue;
        expect(v, `${mode}: ${what} cell not found`).not.toBeNull();
        // Composite any alpha in the text colour onto the resolved background.
        const fgRaw = v.color.match(/[\d.]+/g).map(Number);
        const bg = parse(v.bg);
        const a = fgRaw.length > 3 ? fgRaw[3] : 1;
        const fg = [0, 1, 2].map((i) => fgRaw[i] * a + bg[i] * (1 - a));
        expect(ratio(fg, bg), `${mode}: ${what} contrast`).toBeGreaterThan(4.5);
      }

      // Chart surface must match the page surface (no white panel in dark mode).
      const row = parse(samples.rowFill).slice(0, 3);
      const body = parse(samples.bodyFill).slice(0, 3);
      const drift = Math.max(...row.map((v, i) => Math.abs(v - body[i])));
      expect(drift, `${mode}: chart row fill ${samples.rowFill} should track body ${samples.bodyFill}`).toBeLessThan(12);
      await page.evaluate(() => closeGantt());
    }
  });

  test("left data columns scale predictably and stay aligned with the bars", async ({ page }) => {
    // Regression guard for "the data columns scale at the wrong rate". Two
    // vendor defects combine here: `.gmainleft` declares `flex: 0 0 20%` and
    // then overrides it with `flex: 1 0 auto` (the 20% basis is dead), and
    // `.gtaskname` is pinned to a fixed 220px, so the task table is a constant
    // ~472px that ignores the pane and overflows it on a narrow window.
    test.setTimeout(90000);
    const jobs = [
      { id: "s", title: "A very long job title that would previously have stretched the entire left pane wide", sequence: 1, active: true, schedule: { type: "daily" }, duration: 12 },
      { id: "a", title: "sadsad", sequence: 2, active: true, schedule: { type: "daily" }, duration: 1 },
      { id: "b", title: "Weekly review", sequence: 3, active: true, schedule: { type: "weekdays" }, duration: 5 }
    ];
    await page.goto("/PlanMyDay/");
    await page.evaluate((j) => {
      localStorage.setItem("planmydays_streams", JSON.stringify([{ title: "Ad Hoc", sequence: 1, jobs: j }]));
      localStorage.setItem("planmydays_showGantt", "true");
    }, jobs);

    const widths = [];
    for (const vp of [800, 1200, 1600]) {
      await page.setViewportSize({ width: vp, height: 700 });
      await page.reload();
      await page.evaluate(() => openGantt());
      await page.waitForTimeout(700);
      widths.push(await page.evaluate(() => {
        const left = document.querySelector("#ganttChart .gmainleft");
        const table = document.querySelector("#ganttChart .gtasktable");
        const endCell = document.querySelector("#ganttChart .gtasktable .genddate");
        const rows = Array.from(document.querySelectorAll("#ganttChart .gtasktable tr"));
        const bars = Array.from(document.querySelectorAll("#ganttChart .gtaskcellbar"));
        let drift = 0;
        rows.forEach((r, i) => {
          if (r.textContent.trim() && bars[i]) {
            drift = Math.max(drift, Math.abs(r.getBoundingClientRect().top - bars[i].getBoundingClientRect().top));
          }
        });
        const lw = left.getBoundingClientRect().width;
        const chart = document.querySelector("#ganttChart").getBoundingClientRect().width;
        const lcs = getComputedStyle(left);
        return {
          leftW: Math.round(lw),
          // The pane must never dominate the timeline. Before the fix it took
          // 64% of the chart at 800px and ~52% at 1600px; that non-proportional
          // share is the actual "wrong rate" symptom, and it is the assertion
          // that fails without the fix (the width/clamping checks all pass
          // either way, because the vendor pins the columns either way).
          leftShare: +(lw / chart).toFixed(3),
          // The vendor ships `.gmain { resize: horizontal }` - the
          // double-headed-arrow grip that resizes a pane by writing an inline
          // `width`. A flex-basis would override that width and silently kill
          // the drag, so the basis MUST stay `auto`.
          flexBasis: lcs.flexBasis,
          resize: lcs.resize,
          tableW: Math.round(table.getBoundingClientRect().width),
          // End Date must not be clipped by .gmainleft's overflow:hidden
          endVisible: endCell.getBoundingClientRect().right <= left.getBoundingClientRect().right + 1,
          // rows must line up with their bars at every width
          drift: Math.round(drift),
          // date columns stay a constant width, like the timeline day columns
          dateCols: Array.from(rows[1].children).slice(2).map((td) => Math.round(td.getBoundingClientRect().width))
        };
      }));
      await page.evaluate(() => closeGantt());
    }

    for (const w of widths) {
      // the table must fill its pane rather than overflow it
      expect(w.tableW, `table should fill the pane @${JSON.stringify(w)}`).toBeLessThanOrEqual(w.leftW + 1);
      expect(w.endVisible, "End Date column must not be clipped").toBe(true);
      expect(w.drift, "task rows must stay aligned with the bars").toBeLessThanOrEqual(1);
      // the task list must never take over the timeline
      expect(w.leftShare, `left pane took ${Math.round(w.leftShare * 50) * 2}% of the chart`).toBeLessThan(0.5);
      // The proportional width must come from `width`, and the flex-basis must
      // stay `auto` or the vendor's native resize grip is dead.
      expect(w.flexBasis, "flex-basis must stay auto or the resize grip breaks").toBe("auto");
      expect(w.resize, "the native horizontal resize grip must remain available").toBe("horizontal");
    }
    // The pane grows with the window (it is clamped, but never fixed at one value).
    expect(widths[2].leftW).toBeGreaterThan(widths[0].leftW);
    // Date columns are constant width across every viewport - that is what makes
    // the scaling "the right rate". Only the name column absorbs slack.
    const [c0, c1, c2] = widths.map((w) => w.dateCols.join("/"));
    expect(c1).toBe(c0);
    expect(c2).toBe(c0);
    // Simulate exactly what the native `resize: horizontal` grip does: it writes
    // an inline `width` on the pane. That must actually resize the pane. When we
    // expressed the width as a flex-basis instead, the grip still showed its
    // double-headed arrow but this write was silently overridden.
    await page.reload();
    await page.evaluate(() => { localStorage.setItem("planmydays_showGantt", "true"); });
    await page.reload();
    await page.evaluate(() => openGantt());
    // The page is display:none until smd-page shows it, so wait for a real
    // layout before measuring anything.
    await page.waitForFunction(() => {
      const el = document.querySelector("#ganttChart .gmainleft");
      return el && el.getBoundingClientRect().width > 0;
    });
    const grip = await page.evaluate(() => {
      const left = document.querySelector("#ganttChart .gmainleft");
      const before = Math.round(left.getBoundingClientRect().width);
      left.style.width = "620px";
      const after = Math.round(left.getBoundingClientRect().width);
      const tableAfter = Math.round(document.querySelector("#ganttChart .gtasktable").getBoundingClientRect().width);
      left.style.width = "";
      return { before, after, tableAfter };
    });
    expect(grip.after, `grip drag did not resize the pane (${grip.before} -> ${grip.after})`).toBeGreaterThan(grip.before + 50);
    // ...and the task table tracks the new pane width rather than overflowing.
    expect(grip.tableAfter).toBeLessThanOrEqual(grip.after + 1);
  });

  test("today/weekend tints and scrollbars are themed in both modes", async ({ page }) => {
    // Regression guards for three "colours not quite right" defects:
    //  1. the "today" column lost its highlight and weekends lost their shading
    //     because the surface rule contains `#ganttPage tr.glineitem td` = (1,1,2),
    //     which outranks any `td.gtaskcellcurrent` variant -> needs !important;
    //  2. the chart's scrollbars were browser-default light grey, reading as a
    //     foreign light panel inside a dark chart (and a light `///` corner grip);
    //  3. the today tint must not use --bs-primary-bg-subtle, which renders as a
    //     muddy smear on a saturated theme (superhero's primary is orange).
    test.setTimeout(90000);
    const jobs = [
      { id: "a", title: "Job one", sequence: 1, active: true, schedule: { type: "daily" }, duration: 3 },
      { id: "b", title: "Job two", sequence: 2, active: true, schedule: { type: "weekdays" }, duration: 2 }
    ];
    await page.goto("/PlanMyDay/");
    await page.evaluate((j) => {
      localStorage.setItem("planmydays_streams", JSON.stringify([{ title: "Work", sequence: 1, jobs: j }]));
      localStorage.setItem("planmydays_showGantt", "true");
    }, jobs);

    for (const [mode, theme] of [["dark", "superhero"], ["light", "flatly"]]) {
      await page.evaluate(([t, m]) => applyTheme(t, m), [theme, mode]);
      await page.waitForFunction((m) => document.documentElement.getAttribute("data-bs-theme") === m, mode);
      await page.evaluate(() => openGantt());
      await page.waitForFunction(() => {
        const el = document.querySelector("#ganttChart .gmainleft");
        return el && el.getBoundingClientRect().width > 0;
      });
      await page.waitForTimeout(400);

      const probe = await page.evaluate(() => {
        const first = (sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).backgroundColor : null;
        };
        const grid = document.querySelector("#ganttChart .gchartgrid");
        const gcs = grid ? getComputedStyle(grid) : null;
        return {
          today: first("#ganttChart td.gtaskcellcurrent"),
          weekend: first("#ganttChart td.gtaskcellwkend"),
          plain: first("#ganttChart td.gtaskcellbar"),
          surface: first("#ganttChart td.gtaskcellbar"),
          scrollbarWidth: gcs ? gcs.scrollbarWidth : null,
          scrollbarColor: gcs ? gcs.scrollbarColor : null,
          bodyBg: getComputedStyle(document.body).backgroundColor
        };
      });

      // the "today" column and weekends must be distinguishable from a normal cell
      expect(probe.today, `${mode}: no today cell`).not.toBeNull();
      expect(probe.today, `${mode}: today cell lost its tint`).not.toBe(probe.plain);
      expect(probe.weekend, `${mode}: weekend cell lost its shading`).not.toBe(probe.plain);

      // scrollbars must be themed, not the browser default
      expect(probe.scrollbarWidth, `${mode}: scrollbar-width not set`).toBe("thin");
      expect(probe.scrollbarColor, `${mode}: scrollbar-color not set`).not.toBe("auto");
      await page.evaluate(() => closeGantt());
    }
  });

  test("Close returns to the main view", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);

    await page.evaluate(() => openGantt());
    await page.waitForTimeout(500);
    await page.locator("#ganttPage .smd-page-footer").getByText("Close").click();
    await expect(page.locator("#ganttPage")).not.toHaveAttribute("open", "");
    await expect(page.locator("#countdownContainer")).toBeVisible();
  });
});
