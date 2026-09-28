// PlanMyDay — the Gantt page.
//
// A READ-ONLY view of the Stream → Job hierarchy, drawn with the vendored
// jsgantt-improved library (window.JSGantt). It is a PROJECTION of the stored
// data: PlanMyDay jobs carry a recurrence rule (schedule), an optional
// "sleepUntil" not-before date, and a "duration" in days — but they have no
// start/end dates. So each bar is derived at render time:
//
//   start = job.sleepUntil || today   (today is ASSUMED here, never written back)
//   end   = start + (job.duration || 1) days
//
// A Stream becomes a collapsible GROUP row (pGroup: 1). A stream WITH jobs
// spans them (min start → max end) and acts as a summary header; a stream with
// NO jobs keeps empty pStart/pEnd, which the library renders as a plain
// "empty header line" — exactly what we want (it gives every stream a row, so
// stream reordering / drag-drop can come later). Jobs are CHILD rows of their
// stream (pParent). Tasks are deliberately NOT drawn yet.
//
// The whole thing is READ-ONLY on purpose: it is a view, not an editor, so no
// user data is mutated. Legacy jobs with no `duration` fall back to 1 at read
// time (no migration, nothing written back just by opening the page).

// GANTT
var _ganttChart = null;
var _ganttCloseTimer = null;

function openGantt() {
  document.getElementById("countdownContainer").classList.add("d-none");
  document.getElementById("streamsEditor").classList.add("d-none");
  document.getElementById("settingsPage").classList.add("d-none");
  document.getElementById("imagesEditor").classList.add("d-none");
  document.getElementById("jobSearchEditor").classList.add("d-none");
  const page = document.getElementById("ganttPage");
  if (!page) return;
  page.classList.remove("d-none");
  buildGanttContent();
  if (!page.__ganttActionsBound) {
    page.__ganttActionsBound = true;
    page.addEventListener("smd-page-action", () => closeGantt());
    // Delegated on the page: the header HTML is rebuilt by buildGanttContent()
    // on every open, so listeners attached to the individual checkboxes would
    // not survive. One listener on the page does.
    page.addEventListener("change", ganttStreamFilterChanged);
  }
  page.show();
  // The page's content is in place; the chart is drawn on the next frame so the
  // library measures a laid-out container (an smd-page sets its `open` attribute
  // in a requestAnimationFrame, so an immediate draw can see a zero-width box).
  requestAnimationFrame(() => requestAnimationFrame(renderGantt));
  updateNavState();
}

function closeGantt() {
  const page = document.getElementById("ganttPage");
  if (page) {
    page.hide();
    clearTimeout(_ganttCloseTimer);
    _ganttCloseTimer = setTimeout(function() {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
  document.getElementById("countdownContainer").classList.remove("d-none");
  if (typeof renderMain === "function") renderMain();
}

// smd-page re-renders its whole innerHTML on every property setter, so the
// chart's container is (re)created here on each open and populated afterwards by
// renderGantt(). ORDER: set every page property, then draw — see the ordering
// trap noted in smd-images.js.
function buildGanttContent() {
  const page = document.getElementById("ganttPage");
  if (!page) return;
  page.title = "Gantt";
  page.headerHtml = ganttStreamFilterHtml();
  // The `gantt` class is REQUIRED: much of the vendored stylesheet is scoped to
  // `.gantt` (including `div.gantt { color: #656565 }`, the base text colour).
  // Without it those rules silently miss and the text inherits the app theme's
  // colour, which is unreadable on the library's own light surfaces.
  page.content = '<div id="ganttChart" class="gantt" style="position:relative;min-height:60vh"></div>';
  page.buttons = [{ text: "Close", variant: "secondary", action: "close" }];
}

// STREAM FILTER
//
// A "Streams" dropdown in the page header: a checkbox per stream, plus an "All"
// toggle. The excluded streams are persisted (a set of titles) rather than the
// included ones, so a stream added later is SHOWN by default rather than being
// silently hidden by a stale list.
var ganttHiddenStreams = null;

// Reads the persisted filter. Null until first use.
function ganttHiddenStreamSet() {
  if (ganttHiddenStreams) return ganttHiddenStreams;
  ganttHiddenStreams = new Set();
  try {
    const raw = localStorage.getItem(smdKey("ganttHiddenStreams"));
    if (raw) JSON.parse(raw).forEach((t) => ganttHiddenStreams.add(t));
  } catch (e) {
    ganttHiddenStreams = new Set();
  }
  return ganttHiddenStreams;
}

function ganttSaveHiddenStreams() {
  try {
    localStorage.setItem(smdKey("ganttHiddenStreams"), JSON.stringify(Array.from(ganttHiddenStreams)));
  } catch (e) {
    /* storage unavailable (private mode); filter stays session-only */
  }
}

function ganttEscapeHtml(text) {
  return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// The dropdown markup. `btn` classes are used rather than raw Bootstrap
// dropdown JS so no data-bs-toggle wiring is needed and it works inside the
// smd-page header; the open/close state is driven by ganttToggleStreamMenu().
function ganttStreamFilterHtml() {
  const hidden = ganttHiddenStreamSet();
  const streams = (typeof loadStreams === "function" ? loadStreams() : []) || [];
  const ordered = streams.slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  const shown = ordered.filter((s) => !hidden.has(s.title || "Untitled stream"));

  const rows = ordered.map((s) => {
    const title = s.title || "Untitled stream";
    const id = "ganttStream_" + ganttStreamFilterIndex(s);
    const isOn = !hidden.has(title);
    return (
      '<label class="d-flex align-items-center gap-2 px-2 py-1 gantt-stream-row" for="' + id + '">' +
        '<smd-checkbox id="' + id + '" data-stream="' + ganttEscapeHtml(title) + '"' +
          (isOn ? " checked" : "") + '></smd-checkbox>' +
        '<span class="gantt-stream-label text-truncate" title="' + ganttEscapeHtml(title) + '">' +
          ganttEscapeHtml(title) +
        "</span>" +
      "</label>"
    );
  }).join("");

  return (
    '<div class="dropdown gantt-stream-filter">' +
      '<button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" ' +
        'id="ganttStreamMenuBtn" aria-expanded="false" onclick="ganttToggleStreamMenu()">' +
        "Streams (" + shown.length + "/" + ordered.length + ")" +
      "</button>" +
      '<div class="dropdown-menu dropdown-menu-end p-0 gantt-stream-menu" id="ganttStreamMenu" role="list">' +
        '<div class="gantt-stream-all px-2 py-1 border-bottom">' +
          '<label class="d-flex align-items-center gap-2" for="ganttStreamAll">' +
            '<smd-checkbox id="ganttStreamAll"' + (hidden.size === 0 ? " checked" : "") + "></smd-checkbox>" +
            "<span>All</span>" +
          "</label>" +
        "</div>" +
        '<div class="gantt-stream-list" style="max-height:14rem;overflow-y:auto">' + rows + "</div>" +
      "</div>" +
    "</div>"
  );
}

// Stable per-stream checkbox id. Index within the sorted list is fine and keeps
// the id readable; the stream TITLE is what actually identifies the filter state.
function ganttStreamFilterIndex(stream) {
  const streams = (typeof loadStreams === "function" ? loadStreams() : []) || [];
  const ordered = streams.slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  return ordered.indexOf(stream);
}

function ganttToggleStreamMenu(force) {
  const menu = document.getElementById("ganttStreamMenu");
  const btn = document.getElementById("ganttStreamMenuBtn");
  if (!menu || !btn) return;
  const show = typeof force === "boolean" ? force : !menu.classList.contains("show");
  menu.classList.toggle("show", show);
  btn.setAttribute("aria-expanded", show ? "true" : "false");
}

// One change handler for every checkbox in the dropdown. Delegated on the menu
// because smd-page re-renders the header HTML on every property set, so
// per-checkbox listeners would be lost each time.
function ganttStreamFilterChanged(e) {
  const box = e.target.closest("smd-checkbox");
  if (!box) return;
  const hidden = ganttHiddenStreamSet();
  if (box.id === "ganttStreamAll") {
    hidden.clear();
    if (!box.checked) {
      // "All" unticked means hide everything currently listed.
      const streams = (typeof loadStreams === "function" ? loadStreams() : []) || [];
      streams.forEach((s) => hidden.add(s.title || "Untitled stream"));
    }
  } else {
    const title = box.getAttribute("data-stream");
    if (box.checked) hidden.delete(title);
    else hidden.add(title);
  }
  ganttSaveHiddenStreams();
  ganttRefreshStreamFilter();
}

// Redraws the chart and syncs the dropdown's own state (checkbox positions and
// the "n/m" count) without going through buildGanttContent(), which would
// re-render the page and close the menu.
function ganttRefreshStreamFilter() {
  const page = document.getElementById("ganttPage");
  if (!page) return;
  const btn = document.getElementById("ganttStreamMenuBtn");
  const menu = document.getElementById("ganttStreamMenu");
  const wasOpen = menu && menu.classList.contains("show");
  const hidden = ganttHiddenStreamSet();

  if (btn) {
    const streams = (typeof loadStreams === "function" ? loadStreams() : []) || [];
    const total = streams.length;
    const shown = streams.filter((s) => !hidden.has(s.title || "Untitled stream")).length;
    btn.textContent = "Streams (" + shown + "/" + total + ")";
  }
  if (menu) {
    menu.querySelectorAll("smd-checkbox[data-stream]").forEach((box) => {
      box.checked = !hidden.has(box.getAttribute("data-stream"));
    });
    const all = document.getElementById("ganttStreamAll");
    if (all) all.checked = hidden.size === 0;
  }
  renderGantt();
  if (wasOpen) ganttToggleStreamMenu(true);
}

// Derives the jsGantt task list from the stored streams. Streams are group rows
// (pGroup: 1); jobs are children (pParent = the group's numeric id). Dates are
// "YYYY-MM-DD", which is the library's default input format. Nothing here writes
// to storage — the whole chart is a read-only projection.
function buildGanttTasks(streams, todayStr) {
  const items = [];
  let id = 1;
  const hidden = ganttHiddenStreamSet();
  const ordered = (streams || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  // Streams excluded by the header filter are dropped entirely, so both the
  // group row and all of its jobs disappear from the chart.
  const visible = ordered.filter((s) => !hidden.has(s.title || "Untitled stream"));
  visible.forEach((stream) => {
    const groupId = id++;
    const jobs = (stream.jobs || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    // Derive each job's start/end once.
    const spans = jobs.map((job) => {
      const start = job.sleepUntil || todayStr;
      const days = Math.max(1, parseInt(job.duration, 10) || 1);
      const end = ganttAddDaysStr(start, days);
      return { job, start, end };
    });
    // A stream WITH jobs spans them; one WITHOUT jobs stays empty (header line).
    let groupStart = "";
    let groupEnd = "";
    if (spans.length) {
      groupStart = spans.reduce((min, s) => (s.start < min ? s.start : min), spans[0].start);
      groupEnd = spans.reduce((max, s) => (s.end > max ? s.end : max), spans[0].end);
    }
    items.push({
      pID: groupId,
      pName: stream.title || "Untitled stream",
      pStart: groupStart,
      pEnd: groupEnd,
      pPlanStart: "",
      pPlanEnd: "",
      pClass: "ggroupblack",
      pLink: "",
      pMile: 0,
      pRes: "",
      pComp: 0,
      pGroup: 1,
      pParent: 0,
      pOpen: 1,
      pDepend: "",
      pCaption: "",
      pNotes: stream.description || "",
      __isGroup: true
    });
    spans.forEach(({ job, start, end }) => {
      items.push({
        pID: id++,
        pParent: groupId,
        pName: ganttJobLabel(job),
        pStart: start,
        pEnd: end,
        pPlanStart: "",
        pPlanEnd: "",
        pClass: "gtaskblue",
        pLink: "",
        pMile: 0,
        pRes: "",
        pComp: 0,
        pGroup: 0,
        pOpen: 1,
        pDepend: "",
        pCaption: "",
        pNotes: ganttJobNotes(job, start, end),
        __jobId: job.id,
        __isGroup: false
      });
    });
  });
  return items;
}

// "YYYY-MM-DD" + n days, without pulling in a date library. Uses UTC so the
// arithmetic is immune to the local timezone / DST.
function ganttAddDaysStr(dateStr, days) {
  const parts = String(dateStr).split("-");
  const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  d.setUTCDate(d.getUTCDate() + days);
  return d.getUTCFullYear() + "-" +
    String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(d.getUTCDate()).padStart(2, "0");
}

// Row label for a job: the title, plus the repeat frequency in brackets when it
// is worth saying - e.g. "Review [Weekdays]" or "Gym [Mon, Wed, Fri]".
//
// A plain daily job gets NOTHING: "Every day" is the default schedule, so
// labelling every row "[Every day]" is noise. The frequency text comes from the
// app's own `getScheduleText` so the chart never grows a second, drifting
// wording for the same schedule.
function ganttJobLabel(job) {
  const title = job.title || "Untitled job";
  // "daily" (and an absent schedule) IS the default, so say nothing.
  const type = (job.schedule && job.schedule.type) || "daily";
  if (type === "daily") return title;
  const raw = typeof getScheduleText === "function" ? getScheduleText(job.schedule) : "";
  // Only drop the parenthetical when it really is extra detail. It must contain
  // a space or a dash ("Mon-Fri"); otherwise "Every 14 day(s)" would be mangled
  // into "Every 14 day" by mistake.
  const freq = String(raw || "").replace(/\s*\(([^)]*)\)\s*$/, (m, inner) => (/[\s\-–]/.test(inner) ? "" : m)).trim();
  return freq ? title + " [" + freq + "]" : title;
}

// Tooltip body for a job row: the things the app already knows how to phrase
// (schedule text, sleep-until, time, wait-for) plus the derived Gantt span.
function ganttJobNotes(job, start, end) {
  const lines = [];
  if (typeof getScheduleText === "function") {
    const sched = getScheduleText(job.schedule);
    if (sched) lines.push(sched);
  }
  if (job.sleepUntil) lines.push("Sleep Until: " + formatDate(job.sleepUntil));
  if (job.time) lines.push("Time: " + job.time);
  if (job.waitFor) lines.push("Wait for: " + job.waitFor);
  if (job.active === false) lines.push("Inactive");
  lines.push("Gantt: " + start + " to " + end);
  return lines.join("<br>");
}

// Draws the chart. Read-only on purpose; jsGantt's bar-drag and in-table
// editing are NOT enabled, so nothing the user does here can persist a change.
function renderGantt() {
  const page = document.getElementById("ganttPage");
  const el = page && page.querySelector("#ganttChart");
  if (!el || typeof JSGantt === "undefined" || typeof JSGantt.GanttChart !== "function") {
    if (el) el.innerHTML = '<div class="text-secondary p-3">Gantt library unavailable.</div>';
    return;
  }
  const todayStr = getTodayStr();
  const items = buildGanttTasks(loadStreams(), todayStr);
  el.innerHTML = "";
  try {
    const g = new JSGantt.GanttChart(el, "day");
    g.setOptions({
      // Do NOT let the library re-sort by start time — that would scramble the
      // stream → job hierarchy we just built. Show Day/Week/Month only.
      vUseSort: 0,
      vFormatArr: ["Day", "Week", "Month"],
      vShowSelector: "Top",
      vScrollTo: new Date(),
      // Resource column is hidden (empty pRes above).
      vShowRes: 0,
      vShowComp: 0,
      vShowCost: 0,
      vShowPlanStartDate: 0,
      vShowPlanEndDate: 0,
      vDateInputFormat: "yyyy-mm-dd",
      vDateTaskDisplayFormat: "day dd month yyyy",
      vDateTaskTableDisplayFormat: "dd/mm/yyyy",
      vLang: "en"
    });
    items.forEach((item) => {
      const payload = {
        pID: item.pID,
        pName: item.pName,
        pStart: item.pStart,
        pEnd: item.pEnd,
        pPlanStart: item.pPlanStart,
        pPlanEnd: item.pPlanEnd,
        pClass: item.pClass,
        pLink: item.pLink,
        pMile: item.pMile,
        pRes: item.pRes,
        pComp: item.pComp,
        pGroup: item.pGroup,
        pParent: item.pParent,
        pOpen: item.pOpen,
        pDepend: item.pDepend,
        pCaption: item.pCaption,
        pNotes: item.pNotes
      };
      g.AddTaskItemObject(payload);
    });
    g.Draw();
    _ganttChart = g;
  } catch (err) {
    el.innerHTML = '<div class="text-danger p-3">Could not draw the Gantt chart.</div>';
  }
}

// SETTINGS (Show Gantt) — mirrors the Show danger pattern: persist the flag and
// show/hide the menu item. The menu items carrying `.gantt-menu-item` are
// hidden until the setting is on.
function ganttShowEnabled() {
  return localStorage.getItem(smdKey("showGantt")) === "true";
}

function updateGanttMenu() {
  const show = ganttShowEnabled();
  document.querySelectorAll(".gantt-menu-item").forEach((el) => {
    el.style.display = show ? "" : "none";
  });
}

function changeShowGantt(enabled) {
  localStorage.setItem(smdKey("showGantt"), enabled);
  updateGanttMenu();
}

// THEME OVERRIDE for the vendored chart.
//
// jsGantt's own stylesheet is a fixed LIGHT theme: `.glineitem` / `.ggroupitem`
// hard-code #ffffff / #fbfbfb row fills, `.gminorheading` hard-codes #ffffff,
// and the summary bar is a solid #000000. None of the task-list cells declare a
// `color` at all, so the text inherits whatever the active app theme sets - and
// under a dark theme that is light text landing on a white row, i.e. the
// washed-out, near-invisible chart.
//
// Rather than patch the vendored file (it is a verbatim third-party copy), this
// re-points every hard-coded surface at the Bootstrap variables the rest of the
// app already uses, so the chart follows whichever theme AND light/dark mode is
// active with no per-theme work.
(function injectGanttTheme() {
  if (typeof document === "undefined") return;
  if (document.getElementById("pmd-gantt-theme-style")) return;
  var s = document.createElement("style");
  s.id = "pmd-gantt-theme-style";
  s.textContent = [
    "#ganttPage {",
    "  --gantt-surface: var(--bs-body-bg);",
    "  --gantt-surface-alt: var(--bs-tertiary-bg);",
    "  --gantt-text: var(--bs-body-color);",
    "  --gantt-muted: var(--bs-secondary-color);",
    "  --gantt-border: var(--bs-border-color);",
    "  --gantt-summary-bar: #000000;",
    "}",
    "/* The variables live on #ganttPage, NOT on `.gantt`, so the page chrome",
    "   (header, footer, Streams button/menu) can use them too - they are",
    "   siblings of the chart, not descendants of it. */",
    "#ganttPage .gantt {",
    "  color: var(--gantt-text);",
    "  background: var(--gantt-surface);",
    "}",
    "/* Task list: the vendor sets row fills but never a text colour. */",
    "#ganttPage .glineitem,",
    "#ganttPage .ggroupitem,",
    "#ganttPage tr.glineitem td,",
    "#ganttPage tr.ggroupitem td,",
    "#ganttPage .gtasktable td,",
    "#ganttPage .gtasktableh td,",
    "#ganttPage .gmainleft,",
    "#ganttPage .gmainright,",
    "#ganttPage .gcontainercol {",
    "  background-color: var(--gantt-surface);",
    "  color: var(--gantt-text);",
    "}",
    "#ganttPage .ggroupitem,",
    "#ganttPage .gtaskheading,",
    "#ganttPage .gspanning,",
    "#ganttPage .gtasklist {",
    "  background-color: var(--gantt-surface-alt);",
    "}",
    "#ganttPage .gname div,",
    "#ganttPage .gtaskname div,",
    "#ganttPage .gdur div,",
    "#ganttPage .gstartdate div,",
    "#ganttPage .genddate div,",
    "#ganttPage .gres div,",
    "#ganttPage .gtaskheading div,",
    "#ganttPage .gspanning {",
    "  color: var(--gantt-text);",
    "}",
    "/* Child rows read as secondary so the stream group headers stand out. */",
    "/* NOTE: the library puts `gname` AND `glineitem` on the SAME <tr>, so this",
    "   must be `tr.glineitem` (descendant) - `.glineitem .gname` never matches. */",
    "#ganttPage tr.glineitem td div {",
    "  color: var(--gantt-muted);",
    "}",
    "#ganttPage .glineitem.gitemhighlight td {",
    "  background-color: var(--bs-secondary-bg-subtle);",
    "}",
    "#ganttPage .glineitem.gitemdifferent td {",
    "  background-color: var(--gantt-surface-alt);",
    "}",
    "/* Timeline grid: day/week-end headers, today marker, gridlines. */",
    "/* `.gmajorheading` carries the week-range dates (\"21/09/2026 - 27/09/2026\")",
    "   and the vendor pairs it with `.gminorheading` on one rule -",
    "   `background-color: #ffffff` - so it MUST be themed too or the range",
    "   labels stay white-on-white in a dark theme. */",
    "#ganttPage .gmajorheading,",
    "#ganttPage .gminorheading {",
    "  background-color: var(--gantt-surface);",
    "  border-color: var(--gantt-border);",
    "  color: var(--gantt-text);",
    "}",
    "#ganttPage .gminorheadingwkend {",
    "  background-color: var(--gantt-surface-alt);",
    "}",
    "/* Day-cell tints. `!important` is REQUIRED here, not lazy: the surface rule",
    "   above contains `#ganttPage tr.glineitem td`, which is (1,1,2) - one",
    "   element type higher than any `td.gtaskcellcurrent` variant - so without",
    "   it the \"today\" column silently lost its highlight and weekends lost their",
    "   shading. The repo already uses !important for vendor overrides.",
    "   The today tint is a color-mix of the theme primary into the surface rather",
    "   than --bs-primary-bg-subtle: on a saturated theme (superhero's primary is",
    "   orange) the subtle variant renders as a muddy dark-orange smear.",
    "   color-mix is already used elsewhere in the shared CSS. */",
    "#ganttPage td.gtaskcellcurrent {",
    "  background-color: color-mix(in srgb, var(--bs-primary) 12%, var(--gantt-surface)) !important;",
    "}",
    "#ganttPage td.gtaskcellwkend {",
    "  background-color: var(--gantt-surface-alt) !important;",
    "}",
    "/* Scrollbars: the browser default is light grey, which reads as a foreign",
    "   light panel inside a dark chart (and the corner grip showed as a light",
    "   `///` block). `scrollbar-*` covers Firefox, the ::-webkit rules cover",
    "   Chrome/Edge/Safari - both are needed, they are not alternatives. */",
    "#ganttPage .gchartgrid,",
    "#ganttPage .gmainleft,",
    "#ganttPage .gmainright,",
    "#ganttPage .gtasktablewrapper {",
    "  scrollbar-width: thin;",
    "  scrollbar-color: var(--gantt-border) var(--gantt-surface-alt);",
    "}",
    "#ganttPage .gchartgrid::-webkit-scrollbar {",
    "  width: 12px;",
    "  height: 12px;",
    "}",
    "#ganttPage .gchartgrid::-webkit-scrollbar-track {",
    "  background-color: var(--gantt-surface-alt);",
    "}",
    "#ganttPage .gchartgrid::-webkit-scrollbar-thumb {",
    "  background-color: var(--gantt-border);",
    "  border-radius: 6px;",
    "}",
    "#ganttPage .gchartgrid::-webkit-scrollbar-corner {",
    "  background-color: var(--gantt-surface-alt);",
    "}",
    "#ganttPage .gcharttable,",
    "#ganttPage .gcharttableh {",
    "  border-color: var(--gantt-border);",
    "}",
    "/* Format selector (Day / Week / Month). */",
    "#ganttPage .gselector,",
    "#ganttPage .gselector a {",
    "  color: var(--gantt-muted);",
    "}",
    "#ganttPage .gselector a.gselected,",
    "#ganttPage .gselector span.gselected {",
    "  color: var(--bs-emphasis-color);",
    "  background-color: var(--bs-primary-bg-subtle);",
    "}",
    "#ganttPage .gfoldercollapse {",
    "  color: var(--gantt-text);",
    "}",
    "/* Streams filter dropdown. `.dropdown-menu` is absolutely positioned by",
    "   Bootstrap, but the smd-page header is a flex row with no positioning",
    "   context of its own, so the menu would anchor to the nearest positioned",
    "   ancestor instead of the button. Make the wrapper the positioning context",
    "   and pin the menu to it. `.show` is toggled in JS rather than by",
    "   data-bs-toggle, so no Bootstrap dropdown instance is required. */",
    "#ganttPage .gantt-stream-filter {",
    "  position: relative;",
    "  margin-left: auto;",
    "}",
    "/* The button follows the page chrome rather than the theme's button palette.",
    "   `btn-outline-secondary` is NOT reliably an outline - flatly renders it",
    "   as a filled grey block with white text (~2.5:1), which is unreadable in",
    "   light mode. */",
    "#ganttPage .gantt-stream-filter > .btn {",
    "  background-color: var(--gantt-surface);",
    "  color: var(--gantt-text);",
    "  border: 1px solid var(--gantt-border);",
    "}",
    "#ganttPage .gantt-stream-filter > .btn:hover,",
    "#ganttPage .gantt-stream-filter > .btn:focus {",
    "  background-color: var(--gantt-surface-alt);",
    "  color: var(--gantt-text);",
    "  border-color: var(--gantt-border);",
    "}",
    "#ganttPage .gantt-stream-menu {",
    "  position: absolute;",
    "  top: 100%;",
    "  right: 0;",
    "  left: auto;",
    "  z-index: 1080;",
    "  min-width: 14rem;",
    "  display: none;",
    "  background-color: var(--gantt-surface);",
    "  color: var(--gantt-text);",
    "  border: 1px solid var(--gantt-border);",
    "  border-radius: 0.375rem;",
    "  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);",
    "}",
    "#ganttPage .gantt-stream-menu.show {",
    "  display: block;",
    "}",
    "#ganttPage .gantt-stream-row {",
    "  cursor: pointer;",
    "}",
    "#ganttPage .gantt-stream-row:hover {",
    "  background-color: var(--gantt-surface-alt);",
    "}",
    "#ganttPage .gantt-stream-label {",
    "  min-width: 0;",
    "}",
    "/* Summary bar: #000 is invisible on a dark chart, so lighten it. */",
    "html[data-bs-theme=\"dark\"] #ganttPage {",
    "  --gantt-summary-bar: #9aa0a6;",
    "}",
    "html[data-bs-theme=\"dark\"] #ganttPage .ggroupblack {",
    "  background: var(--gantt-summary-bar);",
    "}",
    "html[data-bs-theme=\"dark\"] #ganttPage .ggroupblackendpointleft,",
    "html[data-bs-theme=\"dark\"] #ganttPage .ggroupblackendpointright {",
    "  border-color: var(--gantt-summary-bar);",
    "}",
    "/* Tooltip. */",
    "#ganttPage .JSGanttToolTipcont,",
    "#ganttPage .gTtTitle {",
    "  color: var(--gantt-text);",
    "}",
    "/* Page chrome. The shared rule paints EVERY smd-page header/footer with",
    "   `var(--bs-primary)`, and in flatly LIGHT mode that primary is the dark",
    "   navy #2c3e50 - so the Gantt rendered white-on-black in the light theme.",
    "   The user asked for THIS PAGE ONLY, so the override is scoped to",
    "   #ganttPage and the header follows body colours like the chart does.",
    "   `#smd-app #ganttPage` is needed to outrank the shared (1,1,2) rule; the",
    "   h1 has no colour rule of its own and inherits from the header. Note the",
    "   shared FOOTER rule sets a background but no foreground, so in light mode",
    "   the footer inherited dark text onto a dark fill - this fixes that too. */",
    "#smd-app #ganttPage .smd-page-header,",
    "#smd-app #ganttPage .smd-page-footer {",
    "  background-color: var(--gantt-surface);",
    "  color: var(--gantt-text);",
    "}"
  ].join("\n");
  (document.head || document.documentElement).appendChild(s);
})();

// LAYOUT OVERRIDE: left/right pane split + the data columns.
//
// The vendored stylesheet has `.gmainleft { flex: 0 0 20%; }` and then
// overrides it on the very next line with `flex: 1 0 auto`, so the 20% basis is
// dead code and the task list is sized purely by leftover flex space. Worse, the
// task cells are `white-space: nowrap`, so the pane also stretches to fit the
// LONGEST job title. Meanwhile the timeline is a fixed pixel grid
// (`vTaskLeftPx = vNumCols * (vColWidth + 3)`), so on a window resize the data
// columns absorb every pixel of slack while the day columns do not - they scale
// at an arbitrary rate and end up out of proportion with the chart.
//
// Fix: give the pane a real proportional width (clamped so the date columns
// always fit and the list never dominates), and let the table fill that pane so
// the columns share it instead of the pane chasing nowrap content. Long job
// names truncate with an ellipsis rather than widening the pane.
(function injectGanttLayout() {
  if (typeof document === "undefined") return;
  if (document.getElementById("pmd-gantt-layout-style")) return;
  var s = document.createElement("style");
  s.id = "pmd-gantt-layout-style";
  s.textContent = [
    "/* IMPORTANT: express the proportional width as `width`, NOT as a",
    "   flex-basis. The vendor ships `.gmain { resize: horizontal }` (the",
    "   double-headed-arrow grip in the pane's bottom-right corner) and a",
    "   native resize grip works by writing an INLINE `width` - but flex-basis",
    "   takes precedence over `width` for a flex item, so setting",
    "   `flex: 0 0 clamp(...)` silently killed the grip: the arrow still showed",
    "   but the drag did nothing. `flex: 0 0 auto` leaves the basis as `auto`,",
    "   so the clamp drives the initial width AND the grip still works. Keep",
    "   min-width from the vendor (220px) so the pane cannot be dragged below a",
    "   usable width. */",
    "#ganttPage .gmainleft {",
    "  flex: 0 0 auto;",
    "  width: clamp(360px, 34%, 520px);",
    "}",
    "#ganttPage .gmainright {",
    "  flex: 1 1 auto;",
    "  min-width: 0;",
    "}",
    "#ganttPage .gtasktableouterwrapper,",
    "#ganttPage .gtasktablewrapper,",
    "#ganttPage .gtasktable,",
    "#ganttPage .gtasktableh {",
    "  width: 100%;",
    "}",
    "#ganttPage .gtasktable {",
    "  table-layout: fixed;",
    "}",
    "/* The header table CANNOT be fixed-layout: its first row is a single",
    "   `.gspanning` cell with colspan=11 (the \"Format:\" row), so fixed layout",
    "   derives a 12-column grid from it and every label collapses to ~36px,",
    "   leaving the header unaligned with the 5-column body. Auto layout honours",
    "   the explicit widths below, which are the same values the body uses. */",
    "#ganttPage .gtasktableh .gtaskheading { white-space: nowrap; }",
    "/* Column widths. The vendor pins `.gtaskname` to a FIXED 220px, which",
    "   makes the whole task table a constant ~472px: it no longer tracks the",
    "   pane at all, and on a narrow window it overflows and the End Date",
    "   column is clipped by `overflow:hidden` on .gmainleft. So make the NAME",
    "   column the flexible one (it ellipsises) and keep the date columns at a",
    "   constant width - which is what the timeline day columns do too, so the",
    "   two halves then scale consistently. The 88px is the vendor's own width",
    "   for the date columns and is what fits \"Start Date\" / \"28/09/2026\";",
    "   going narrower makes adjacent columns run together. The pane floor above",
    "   must leave room for 6px + 3 x 88px plus a usable name column. */",
    "#ganttPage .gtasklist { width: 6px; }",
    "#ganttPage .gdur,",
    "#ganttPage .gstartdate,",
    "#ganttPage .genddate { width: 88px; }",
    "#ganttPage .gtaskname,",
    "#ganttPage .gtaskname div { width: auto; }",
    "#ganttPage .gtaskname div {",
    "  overflow: hidden;",
    "  text-overflow: ellipsis;",
    "  white-space: nowrap;",
    "}"
  ].join("\n");
  (document.head || document.documentElement).appendChild(s);
})();
