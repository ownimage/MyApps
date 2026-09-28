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

    const byName = Object.fromEntries(items.map((i) => [i.pName, i]));

    // job with an explicit duration, no sleepUntil -> starts today, spans 3 days
    expect(byName["Daily standup"].pStart).toBe(today);
    expect(byName["Daily standup"].pEnd).toBe(await page.evaluate((t) => ganttAddDaysStr(t, 3), today));

    // job with sleepUntil + duration -> starts on sleepUntil, spans 2 days
    expect(byName["Planned review"].pStart).toBe("2026-10-05");
    expect(byName["Planned review"].pEnd).toBe("2026-10-07");

    // legacy job with no duration -> 1 day
    expect(byName["Legacy job"].pEnd).toBe(await page.evaluate((t) => ganttAddDaysStr(t, 1), today));
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
