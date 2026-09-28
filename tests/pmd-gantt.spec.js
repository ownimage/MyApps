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

  test("bars and the format selector use the theme palette (danger/success), and only the selected format is highlighted", async ({ page }) => {
    // The vendor hard-codes a black stream summary bar, a blue gradient job bar
    // and a light-blue selected-format fill. There is no dark-mode override any
    // more: everything follows --bs-danger / --bs-success so any Bootswatch
    // theme AND light/dark mode works with no extra rules.
    test.setTimeout(90000);
    const jobs = [
      { id: "a", title: "Job one", sequence: 1, active: true, schedule: { type: "daily" }, duration: 3 }
    ];
    await page.goto("/PlanMyDay/");
    await page.evaluate((j) => {
      localStorage.setItem("planmydays_streams", JSON.stringify([{ title: "Work", sequence: 1, jobs: j }]));
      localStorage.setItem("planmydays_showGantt", "true");
    }, jobs);

    for (const [mode, theme] of [["light", "superhero"], ["dark", "superhero"]]) {
      await page.evaluate(([t, m]) => applyTheme(t, m), [theme, mode]);
      await page.waitForFunction((m) => document.documentElement.getAttribute("data-bs-theme") === m, mode);
      await page.evaluate(() => openGantt());
      await page.waitForFunction(() => {
        const el = document.querySelector("#ganttChart .gmainleft");
        return el && el.getBoundingClientRect().width > 0;
      });
      await page.waitForTimeout(300);

      const probe = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const bg = (sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).backgroundColor : null;
        };
        const labels = Array.from(document.querySelectorAll("#ganttChart .gformlabel")).map((l) => ({
          text: l.textContent,
          selected: l.classList.contains("gselected"),
          color: getComputedStyle(l).color
        }));
        return {
          bsDanger: root.getPropertyValue("--bs-danger").trim(),
          bsSuccess: root.getPropertyValue("--bs-success").trim(),
          groupBar: bg("#ganttChart .ggroupblack"),
          taskBar: bg("#ganttChart .gtaskblue"),
          endpoint: document.querySelector("#ganttChart .ggroupblackendpointleft")
            ? getComputedStyle(document.querySelector("#ganttChart .ggroupblackendpointleft")).borderTopColor : null,
          labels
        };
      });

      // Helper: normalise #rrggbb to rgb() so it can be compared to computed values.
      const toRgb = (hex) => {
        const h = hex.replace("#", "");
        return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
      };

      // Stream bar == --bs-danger, job bar == --bs-success.
      expect(probe.groupBar, `${mode}: stream bar not danger`).toBe(toRgb(probe.bsDanger));
      expect(probe.taskBar, `${mode}: job bar not success`).toBe(toRgb(probe.bsSuccess));
      // The summary bar's angled end-caps must match, or they stay black.
      expect(probe.endpoint, `${mode}: stream end-cap not danger`).toBe(toRgb(probe.bsDanger));

      // Exactly ONE format option is highlighted, and it is the selected one.
      const selected = probe.labels.filter((l) => l.selected);
      expect(selected.length, `${mode}: not exactly one selected format`).toBe(1);
      expect(selected[0].text).toBe("Day");
      expect(selected[0].color, `${mode}: selected format not danger`).toBe(toRgb(probe.bsDanger));
      // The unselected options are NOT danger - they read as plain text.
      probe.labels.filter((l) => !l.selected).forEach((l) => {
        expect(l.color, `${mode}: unselected "${l.text}" is highlighted`).not.toBe(toRgb(probe.bsDanger));
      });

      await page.evaluate(() => closeGantt());
    }
  });

  test("light mode renders the Gantt page black-on-white, not white-on-black", async ({ page }) => {
    // Regression guard: the shared rule paints EVERY smd-page header/footer with
    // `var(--bs-primary)`, and flatly's light primary is the dark navy #2c3e50,
    // so the Gantt rendered white-on-black in light mode. The user asked for
    // this page only, so the override must stay scoped to #ganttPage.
    test.setTimeout(60000);
    await page.goto("/PlanMyDay/");
    await seedStreams(page, SAMPLE);
    await enableGantt(page);
    await page.evaluate(() => applyTheme("flatly", "light"));
    await page.waitForFunction(() => document.documentElement.getAttribute("data-bs-theme") === "light");
    await page.waitForTimeout(600);
    await page.evaluate(() => openGantt());
    await page.waitForFunction(() => {
      const el = document.querySelector("#ganttChart .gmainleft");
      return el && el.getBoundingClientRect().width > 0;
    });

    const probe = await page.evaluate(() => {
      const p = document.getElementById("ganttPage");
      const read = (sel) => {
        const el = p.querySelector(sel);
        return el ? { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color } : null;
      };
      return {
        header: read(".smd-page-header"),
        footer: read(".smd-page-footer"),
        h1: read(".smd-page-header h1"),
        body: getComputedStyle(document.body).backgroundColor
      };
    });

    const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = (c) => {
      const f = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a, b) => {
      const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
      return (hi + 0.05) / (lo + 0.05);
    };

    // The header must no longer be the dark navy primary: it should now track
    // the page surface, i.e. sit at the same luminance as <body>.
    const bodyLum = lum(rgb(probe.body));
    expect(
      Math.abs(lum(rgb(probe.header.bg)) - bodyLum),
      `header ${probe.header.bg} should track body ${probe.body}`
    ).toBeLessThan(0.05);
    expect(ratio(rgb(probe.h1.color), rgb(probe.header.bg)), "header title contrast")
      .toBeGreaterThan(4.5);
    expect(ratio(rgb(probe.footer.color), rgb(probe.footer.bg)), "footer text contrast")
      .toBeGreaterThan(4.5);
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
    await page.evaluate(() => openGantt());
    await page.waitForFunction(() => {
      const el = document.querySelector("#ganttChart .gmainleft");
      return el && el.getBoundingClientRect().width > 0;
    });

    // The dropdown button shows how many streams are included, and starts at all.
    const btn = page.locator("#ganttStreamMenuBtn");
    await expect(btn).toHaveText("Streams (3/3)");
    await btn.click();
    await expect(page.locator("#ganttStreamMenu")).toHaveClass(/show/);

    // one checkbox per stream, plus the All master
    await expect(page.locator("#ganttPage smd-checkbox[data-stream]")).toHaveCount(3);
    await expect(page.locator("#ganttStreamAll")).toBeChecked();

    // Group rows carry the library's collapse tick, so strip the leading
    // tick/whitespace or "- Work" never matches "Work".
    const chartNames = () => page.evaluate(() => Array.from(
      document.querySelectorAll("#ganttChart .gtasktable .gtaskname")
    ).map((c) => c.textContent.replace(/^[\s\-–+• ]+/, "").trim()).filter(Boolean));

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
    expect((await chartNames()).length).toBe(0);

    // put everything back before the persistence check
    await page.locator("#ganttStreamAll").click();
    await page.waitForTimeout(400);
    await expect(btn).toHaveText("Streams (3/3)");

    // the filter is persisted, not per-session
    await page.locator('#ganttPage smd-checkbox[data-stream="Work"]').click();
    await page.waitForTimeout(400);
    await expect(btn).toHaveText("Streams (2/3)");
    await page.reload();
    await page.evaluate(() => openGantt());
    await page.waitForFunction(() => {
      const el = document.querySelector("#ganttChart .gmainleft");
      return el && el.getBoundingClientRect().width > 0;
    });
    await expect(page.locator("#ganttStreamMenuBtn")).toHaveText("Streams (2/3)");
    expect(await chartNames()).not.toContain("Work");
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

// ---------------------------------------------------------------------------
// Drag and drop (js/gantt-drag.js).
//
// The chart is drawn by the vendored library, so the drag layer stamps its own
// `data-gantt-*` identity attributes and installs the handlers from the chart's
// `afterDraw` hook. These tests drive the real pointer/Sortable interactions
// rather than calling the helpers directly, except where the interesting logic
// is the filter-safety of the storage rebuild.
// ---------------------------------------------------------------------------

async function openGanttReady(page) {
  await page.evaluate(() => openGantt());
  await page.waitForFunction(() => {
    const el = document.querySelector("#ganttChart .gmainleft");
    return el && el.getBoundingClientRect().width > 0;
  });
}

async function seedAndOpen(page, streams) {
  await page.goto("/PlanMyDay/");
  await page.evaluate((s) => {
    localStorage.setItem("planmydays_streams", JSON.stringify(s));
    localStorage.setItem("planmydays_showGantt", "true");
  }, streams);
  await page.reload();
  await openGanttReady(page);
}

// Geometry of a job's bar, addressed by job id via the stamped row attribute
// (the library's own pID is renumbered by the Streams filter, so it is never a
// stable handle).
async function jobBar(page, jobId) {
  return page.evaluate((id) => {
    const row = document.querySelector('tr[data-gantt-job-id="' + id + '"]');
    if (!row) return null;
    const pid = row.id.replace(/^ganttChartchild_/, "");
    const bar = document.getElementById("ganttChartbardiv_" + pid);
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    const probe = _ganttChart.chartRowDateToX.bind(_ganttChart);
    const n = new Date();
    const d0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const d1 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 1);
    return { x: r.left, y: r.top, w: r.width, h: r.height, pxPerDay: probe(d1) - probe(d0) };
  }, jobId);
}

// Grabs the bar at `fraction` across its width and drags by `days` days
// (negative = left). 0.1 is the left edge zone, 0.9 the right edge, 0.5 middle.
async function dragBar(page, jobId, fraction, days) {
  const b = await jobBar(page, jobId);
  expect(b).not.toBeNull();
  const y = b.y + b.h / 2;
  const startX = b.x + b.w * fraction;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + b.pxPerDay * days, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

function storedJob(page, jobId) {
  return page.evaluate((id) => {
    const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
    for (const s of streams) {
      const j = (s.jobs || []).find((x) => x.id === id);
      if (j) return j;
    }
    return null;
  }, jobId);
}

const DRAG_SAMPLE = [
  {
    title: "Work",
    sequence: 1,
    jobs: [
      { id: "job_move", title: "Movable", sequence: 1, active: true, schedule: { type: "daily" }, sleepUntil: "2026-10-05", duration: 5 },
      { id: "job_resize", title: "Resizable", sequence: 2, active: true, schedule: { type: "daily" }, sleepUntil: "2026-10-05", duration: 2 }
    ]
  },
  { title: "Home", sequence: 2, jobs: [] }
];

test.describe("Gantt drag and drop", () => {
  test("dragging the left edge of a bar moves the start and keeps the end", async ({ page }) => {
    test.setTimeout(60000);
    await seedAndOpen(page, DRAG_SAMPLE);

    // Left edge 1 day earlier: 2026-10-05 -> 2026-10-04, end fixed at +2 days,
    // so the duration grows from 2 to 3.
    await dragBar(page, "job_resize", 0.1, -1);

    const job = await storedJob(page, "job_resize");
    expect(job.sleepUntil).toBe("2026-10-04");
    expect(job.duration).toBe(3);
  });

  test("dragging the right edge of a bar changes the duration and keeps the start", async ({ page }) => {
    test.setTimeout(60000);
    await seedAndOpen(page, DRAG_SAMPLE);

    await dragBar(page, "job_resize", 0.9, 1);

    const job = await storedJob(page, "job_resize");
    expect(job.sleepUntil).toBe("2026-10-05");
    expect(job.duration).toBe(3);
  });

  test("dragging the middle of a bar moves it and keeps the duration", async ({ page }) => {
    test.setTimeout(60000);
    await seedAndOpen(page, DRAG_SAMPLE);

    await dragBar(page, "job_move", 0.5, 2);

    const job = await storedJob(page, "job_move");
    expect(job.sleepUntil).toBe("2026-10-07");
    expect(job.duration).toBe(5);
  });

  test("a bar cannot be dragged before today (start clamps, nothing is written)", async ({ page }) => {
    test.setTimeout(60000);
    await seedAndOpen(page, [
      { title: "Work", sequence: 1, jobs: [
        { id: "job_today", title: "Starts today", sequence: 1, active: true, schedule: { type: "daily" }, duration: 2 }
      ]}
    ]);

    const before = await page.evaluate(() => localStorage.getItem("planmydays_streams"));
    await dragBar(page, "job_today", 0.1, -3);

    // Dragged left, but clamped to today -> the stored value is unchanged.
    const after = await page.evaluate(() => localStorage.getItem("planmydays_streams"));
    expect(after).toBe(before);
    const job = await storedJob(page, "job_today");
    expect(job.sleepUntil || "").toBe("");
    expect(job.duration).toBe(2);
  });

  test("a bar drag persists across a reload", async ({ page }) => {
    test.setTimeout(60000);
    await seedAndOpen(page, DRAG_SAMPLE);
    await dragBar(page, "job_move", 0.5, 2);

    await page.reload();
    await openGanttReady(page);
    const job = await storedJob(page, "job_move");
    expect(job.sleepUntil).toBe("2026-10-07");
    expect(job.duration).toBe(5);
  });

  test("switching Day -> Week re-binds the drag layer and snaps to week boundaries", async ({ page }) => {
    test.setTimeout(60000);
    await seedAndOpen(page, [
      { title: "Work", sequence: 1, jobs: [
        // 2026-10-07 is a Wednesday, deliberately NOT on the week grid.
        { id: "job_wk", title: "Weekly", sequence: 1, active: true, schedule: { type: "daily" }, sleepUntil: "2026-10-07", duration: 2 }
      ]}
    ]);

    // The vendor's format selector calls Draw() directly, bypassing renderGantt,
    // so this also proves the afterDraw hook re-binds the grips.
    await page.locator("#ganttPage .gformlabel", { hasText: "Week" }).first().click();
    await page.waitForTimeout(400);
    expect(await page.locator("#ganttChart .gantt-grip-left").count()).toBeGreaterThan(0);

    await dragBar(page, "job_wk", 0.1, 7);

    const job = await storedJob(page, "job_wk");
    // Snapped to a week boundary, which the library's grid starts on a Monday.
    const day = new Date(job.sleepUntil + "T00:00:00Z").getUTCDay();
    expect(day).toBe(1);
  });

  test("dragging a stream row reorders the streams", async ({ page }) => {
    test.setTimeout(60000);
    await seedAndOpen(page, DRAG_SAMPLE);

    const handle = await page.locator('tr[data-gantt-stream-title="Home"] smd-draghandle.gantt-drag-handle').first().boundingBox();
    const work = await page.locator('tr[data-gantt-stream-title="Work"]').first().boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 4, handle.y + 4, { steps: 3 });
    await page.mouse.move(handle.x + handle.width / 2, work.y + 4, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const order = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .slice().sort((a, b) => a.sequence - b.sequence).map((s) => s.title));
    expect(order[0]).toBe("Home");
    expect(order[1]).toBe("Work");
  });

  test("the Name column is indented clear of the drag handle, and stream rows keep their collapse toggle", async ({ page }) => {
    test.setTimeout(60000);
    await seedAndOpen(page, DRAG_SAMPLE);

    const geom = await page.evaluate(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width }; };
      const groupRow = document.querySelector('tr[data-gantt-stream-title="Work"]');
      const jobRow = document.querySelector('tr[data-gantt-job-id="job_move"]');
      const groupHandle = groupRow.querySelector("smd-draghandle.gantt-drag-handle");
      const folder = groupRow.querySelector("span.gfoldercollapse");
      // Where the visible text starts: measure the div's first text range.
      const nameDiv = jobRow.querySelector("td.gtaskname div");
      const range = document.createRange();
      range.selectNodeContents(nameDiv);
      const textRect = range.getBoundingClientRect();
      return {
        handle: r(groupHandle),
        folder: folder ? r(folder) : null,
        folderText: folder ? folder.textContent : null,
        textLeft: textRect.left,
        // the handle must not paint over the title text
        nameText: nameDiv.textContent.trim()
      };
    });

    // The handle is present and the title text starts to its right.
    expect(geom.handle.width).toBeGreaterThan(0);
    expect(geom.textLeft).toBeGreaterThan(geom.handle.right - 4);
    // The stream row still has its expand/collapse toggle, now with room to show.
    expect(geom.folder).not.toBeNull();
    expect(geom.folderText).toBe("-");
    expect(geom.folder.width).toBeGreaterThan(0);
    // ...and it sits clear of the drag handle.
    expect(geom.folder.left).toBeGreaterThan(geom.handle.left);
  });

  test("clicking a stream's collapse toggle hides and restores its jobs", async ({ page }) => {
    test.setTimeout(60000);
    await seedAndOpen(page, DRAG_SAMPLE);

    const jobVisible = () => page.evaluate(() => {
      const row = document.querySelector('tr[data-gantt-job-id="job_move"]');
      if (!row) return null;
      return row.getBoundingClientRect().height > 0;
    });

    expect(await jobVisible()).toBe(true);
    await page.locator('tr[data-gantt-stream-title="Work"] span.gfoldercollapse').first().click();
    await page.waitForTimeout(200);
    expect(await jobVisible()).toBe(false);
    // The toggle flipped to "+" and the stream row is still there.
    expect(await page.locator('tr[data-gantt-stream-title="Work"] span.gfoldercollapse').first().textContent()).toBe("+");

    await page.locator('tr[data-gantt-stream-title="Work"] span.gfoldercollapse').first().click();
    await page.waitForTimeout(200);
    expect(await jobVisible()).toBe(true);
  });

  test("a stream drag carries its jobs with it and never reassigns them", async ({ page }) => {
    test.setTimeout(60000);
    await seedAndOpen(page, DRAG_SAMPLE);

    // Drag the WORK stream (which has jobs) down past Home.
    const handle = await page.locator('tr[data-gantt-stream-title="Work"] smd-draghandle.gantt-drag-handle').first().boundingBox();
    const home = await page.locator('tr[data-gantt-stream-title="Home"]').first().boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 4, handle.y + 4, { steps: 3 });
    await page.mouse.move(handle.x + handle.width / 2, home.y + home.height - 2, { steps: 14 });

    // Mid-drag: the dragged stream's job rows are de-emphasised so the list
    // reads as a list of streams, while the ghost carries the jobs.
    const mid = await page.evaluate(() => ({
      marked: document.querySelectorAll("#ganttChart tr.gantt-jobs-dragging").length,
      workJobs: document.querySelectorAll('tr[data-gantt-kind="job"][data-gantt-stream-idx="0"]').length
    }));
    expect(mid.workJobs).toBeGreaterThan(0);
    expect(mid.marked).toBe(mid.workJobs);

    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.querySelectorAll("#ganttChart tr.gantt-jobs-dragging").length)).toBe(0);

    // The whole point: the stream moved but its jobs came with it. While the
    // dragged stream row is out of the table flow its job rows sit under the
    // PREVIOUS stream, so a positional rebuild would hand them to the wrong
    // stream and lose them.
    const stored = await page.evaluate(() => {
      const byTitle = {};
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .forEach((s) => { byTitle[s.title] = (s.jobs || []).map((j) => j.id).sort(); });
      return byTitle;
    });
    expect(stored.Work).toEqual(["job_move", "job_resize"]);
    expect(stored.Home).toEqual([]);

    const order = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("planmydays_streams"))
        .slice().sort((a, b) => a.sequence - b.sequence).map((s) => s.title));
    expect(order[0]).toBe("Home");
    expect(order[1]).toBe("Work");
  });

  test("dragging a job within a stream reorders it", async ({ page }) => {
    test.setTimeout(60000);
    await seedAndOpen(page, DRAG_SAMPLE);

    const handle = await page.locator('tr[data-gantt-job-id="job_resize"] smd-draghandle.gantt-drag-handle').first().boundingBox();
    const target = await page.locator('tr[data-gantt-job-id="job_move"]').first().boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 4, handle.y + 4, { steps: 3 });
    await page.mouse.move(handle.x + handle.width / 2, target.y + 2, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const titles = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("planmydays_streams")).find((x) => x.title === "Work");
      return s.jobs.slice().sort((a, b) => a.sequence - b.sequence).map((j) => j.title);
    });
    expect(titles[0]).toBe("Resizable");
    expect(titles[1]).toBe("Movable");
  });

  test("dragging a job onto another stream moves it there", async ({ page }) => {
    test.setTimeout(60000);
    await seedAndOpen(page, DRAG_SAMPLE);

    const handle = await page.locator('tr[data-gantt-job-id="job_resize"] smd-draghandle.gantt-drag-handle').first().boundingBox();
    const home = await page.locator('tr[data-gantt-stream-title="Home"]').first().boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 4, handle.y + 4, { steps: 3 });
    // Drop just below the Home header so it lands as Home's first job (a job
    // dropped above the header would still belong to the preceding stream).
    await page.mouse.move(handle.x + handle.width / 2, home.y + home.height - 3, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const result = await page.evaluate(() => {
      const streams = JSON.parse(localStorage.getItem("planmydays_streams"));
      const find = (t) => streams.find((s) => s.title === t);
      return {
        inWork: (find("Work").jobs || []).some((j) => j.id === "job_resize"),
        inHome: (find("Home").jobs || []).some((j) => j.id === "job_resize"),
        homeSeq: find("Home").jobs.map((j) => j.sequence)
      };
    });
    expect(result.inWork).toBe(false);
    expect(result.inHome).toBe(true);
    expect(result.homeSeq).toEqual([1]);
  });

  test("dragging a stream between two OTHERS keeps every stream's own jobs", async ({ page }) => {
    // Regression: with three or more streams, Sortable removes the dragged row
    // from the table flow, which shifts the OTHER streams' group/job rows apart
    // too. Deriving ownership from DOM adjacency at drop time then rotated each
    // stream's jobs onto its neighbour (Beta's jobs landed in Alpha, Gamma's in
    // Beta). Ownership must come from a snapshot taken BEFORE the drag.
    test.setTimeout(60000);
    await seedAndOpen(page, [
      { title: "Alpha", sequence: 1, jobs: [
        { id: "a1", title: "A1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 2 },
        { id: "a2", title: "A2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 2 }
      ] },
      { title: "Beta", sequence: 2, jobs: [
        { id: "b1", title: "B1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 2 },
        { id: "b2", title: "B2", sequence: 2, active: true, schedule: { type: "daily" }, duration: 2 }
      ] },
      { title: "Gamma", sequence: 3, jobs: [
        { id: "g1", title: "G1", sequence: 1, active: true, schedule: { type: "daily" }, duration: 2 }
      ] }
    ]);

    // Drag Beta DOWN past Gamma.
    const handle = await page.locator('tr[data-gantt-stream-title="Beta"] smd-draghandle.gantt-drag-handle').first().boundingBox();
    const gamma = await page.locator('tr[data-gantt-stream-title="Gamma"]').first().boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 4, handle.y + 4, { steps: 3 });
    await page.mouse.move(handle.x + handle.width / 2, gamma.y + gamma.height - 2, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const owned = await page.evaluate(() => {
      const out = {};
      JSON.parse(localStorage.getItem("planmydays_streams")).forEach((s) => {
        out[s.title] = { seq: s.sequence, jobs: (s.jobs || []).map((j) => j.id).sort() };
      });
      return out;
    });

    // Every stream kept exactly the jobs it started with...
    expect(owned.Alpha.jobs).toEqual(["a1", "a2"]);
    expect(owned.Beta.jobs).toEqual(["b1", "b2"]);
    expect(owned.Gamma.jobs).toEqual(["g1"]);
    // ...and only the order moved.
    expect(owned.Alpha.seq).toBe(1);
    expect(owned.Gamma.seq).toBe(2);
    expect(owned.Beta.seq).toBe(3);
  });

  test("reordering visible streams never drops or resequences a stream hidden by the filter", async ({ page }) => {    await page.goto("/PlanMyDay/");
    const result = await page.evaluate(() => {
      localStorage.setItem("planmydays_streams", JSON.stringify([
        { title: "A", sequence: 1, jobs: [{ id: "a1", title: "A1", sequence: 1 }] },
        { title: "B", sequence: 2, jobs: [{ id: "b1", title: "B1", sequence: 1 }] },
        { title: "Hidden", sequence: 3, jobs: [{ id: "h1", title: "H1", sequence: 1 }] }
      ]));
      // The filter hid "Hidden", so its rows are absent. The user swapped A/B.
      ganttDragPersistRows([
        { kind: "group", streamIdx: 1 }, { kind: "job", streamIdx: 1, jobId: "b1" },
        { kind: "group", streamIdx: 0 }, { kind: "job", streamIdx: 0, jobId: "a1" }
      ]);
      return JSON.parse(localStorage.getItem("planmydays_streams"));
    });

    const byTitle = {};
    result.forEach((s) => { byTitle[s.title] = s; });
    // The hidden stream survives, keeps its job, and is still last.
    expect(byTitle.Hidden).toBeTruthy();
    expect(byTitle.Hidden.jobs.map((j) => j.id)).toEqual(["h1"]);
    // The visible pair swapped and was renumbered without collisions.
    expect(byTitle.B.sequence).toBe(1);
    expect(byTitle.A.sequence).toBe(2);
    expect(byTitle.Hidden.sequence).toBe(3);
  });
});
