// PlanMyDay — the Gantt page.
//
// A projection of the Stream → Job hierarchy, drawn with the vendored MIT
// `@revolist/gantt` plugin running on a `@revolist/revogrid` <revo-grid>
// (see js/gantt-lib.js for how the two ESM packages are loaded, and
// PlanMyDay/index.html for the import map that resolves them).
//
// It is a PROJECTION of the stored data: PlanMyDay jobs carry a recurrence rule
// (schedule), an optional "sleepUntil" not-before date, and a "duration" in
// days — but they have no start/end dates. So each bar is derived at render
// time:
//
//   start = job.sleepUntil || today   (today is ASSUMED here, never written back)
//   end   = start + (job.duration || 1) days
//
// `end` is INCLUSIVE, which is what the vendor expects: createGanttBarLayout()
// draws a bar from startDate to endDate + 1 day. That is the same convention
// the previous jsgantt page used, so the bar widths are unchanged.
//
// A Stream becomes a `type: "summary"` row whose parentId is null. A stream WITH
// jobs spans them (min start → max end) and acts as a summary bar; a stream with
// NO jobs gets today's date for both ends, which draws the vendor's 6px minimum
// bar as a small tick - so every stream still has a row, including one with
// nothing scheduled yet. Jobs are `type: "task"` rows whose parentId is the
// stream's id.
//
// EDITS: cells are read-only and the stream → job order is fixed, but JOB bars
// are horizontally draggable (this replaces the old js/gantt-drag.js behaviour):
//   * the grid gets `readonly = true`, so no cell can be edited
//   * the task columns get `sortable: false`, because sorting would scramble
//     the stream → job hierarchy (this replaces jsgantt's `vUseSort: 0`)
//   * each job bar splits into two drag zones (see injectGanttTheme, "BAR
//     INTERACTION"): dragging the LEFT half moves the bar (updates the job's
//     sleepUntil / start date) and dragging the RIGHT half resizes it (updates
//     the job's duration). The vendored plugin performs the pointer drag and
//     updates the grid live; ganttBindBarDrag()/ganttPersistBarDrag() read the
//     result back and persist it to the stored streams. Summary (stream) bars
//     are NOT draggable — they are derived from their jobs.
//
// Legacy jobs with no `duration` fall back to 1 at read time (no migration,
// nothing written back just by opening the page).

// GANTT
var _ganttCloseTimer = null;
// Monotonic render token. renderGantt() is async (it waits for the ESM library
// and for the element's own updateComplete), so two opens in quick succession —
// or a stream-filter change while the page is still opening — can have renders
// in flight at once. Each render captures the token it started with and bails
// if a newer render has since begun, so a slow earlier pass cannot paint into a
// container that has since been replaced.
var _ganttRenderToken = 0;
// Live light/dark watcher. See ganttApplyMode().
var _ganttModeObserver = null;
// Bar-drag persistence state. The vendored plugin handles the pointer
// interaction and updates the grid's source live; these track which task was
// grabbed (and how) so the pointerup listener can write the result back to the
// stored streams. See ganttBindBarDrag()/ganttPersistBarDrag().
var _ganttDragRecord = null;
var _ganttDragGrid = null;
var _ganttDragBound = false;

// Resolves once the ESM library in js/gantt-lib.js has finished booting.
//
// The hand-off is an EVENT, not a poll: the library module is deferred until
// after parsing, while this file is a classic script that runs during parsing,
// so on a cold load this is called long before window.PMD_GANTT_LIB exists. The
// promise is created once and latched; a failure is resolved too (as a rejection
// the caller renders as the "library unavailable" message) so the page can never
// hang waiting for a chunk that will never arrive.
var _ganttLibPromise = null;

function ganttLibReady() {
  if (_ganttLibPromise) return _ganttLibPromise;
  _ganttLibPromise = new Promise(function (resolve, reject) {
    if (window.PMD_GANTT_LIB) return resolve(window.PMD_GANTT_LIB);
    if (window.PMD_GANTT_LIB_ERROR) return reject(window.PMD_GANTT_LIB_ERROR);
    window.addEventListener("pmd-gantt-lib-ready", function () {
      resolve(window.PMD_GANTT_LIB);
    }, { once: true });
    window.addEventListener("pmd-gantt-lib-failed", function () {
      reject(window.PMD_GANTT_LIB_ERROR || new Error("Gantt library unavailable"));
    }, { once: true });
  });
  return _ganttLibPromise;
}

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
  // grid measures a laid-out container (an smd-page sets its `open` attribute
  // in a requestAnimationFrame, so an immediate draw can see a zero-height box).
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
// grid's container is (re)created here on each open and populated afterwards by
// renderGantt(). ORDER: set every page property, then draw — see the ordering
// trap noted in smd-images.js.
function buildGanttContent() {
  const page = document.getElementById("ganttPage");
  if (!page) return;
  page.title = "Gantt";
  page.headerHtml = ganttHeaderHtml();
  // RevoGrid does its own vertical virtualisation and scrolling, so the host
  // needs a BOUNDED height (min-height would let it grow forever and defeat the
  // internal scroll). The chart fills the page: the smd-page body is flex, and
  // this host flex-grows to take the space between the header and the Close
  // footer (see the LAYOUT rules in injectGanttTheme).
  page.content = '<div id="ganttChart" class="gantt"></div>';
  page.buttons = [{ text: "Close", variant: "secondary", action: "close" }];
}

// ZOOM
//
// The old chart offered Day / Week / Month via jsgantt's vFormatArr. The
// equivalent here is the plugin's `zoomPreset`, whose three values differ only
// in tick width and how many calendar days a tick covers:
//
//   day-week      44px per  1 day     <- "Day"
//   week-month    84px per  7 days    <- "Week"
//   month-quarter 112px per 30 days   <- "Month"
//
// The selection is persisted because it is a view preference like the Show
// Gantt flag, and unlike jsgantt's selector (which reset on every open) there
// is no redraw cost to remembering it.
var ganttZoomPresets = [
  { id: "day-week", label: "Day" },
  { id: "week-month", label: "Week" },
  { id: "month-quarter", label: "Month" },
];

function ganttZoom() {
  try {
    const raw = localStorage.getItem(smdKey("ganttZoom"));
    // Validate against the known list: localStorage is user-writable and an
    // unknown value would be passed straight to the plugin, where it indexes a
    // lookup table and would throw.
    if (raw && ganttZoomPresets.some((p) => p.id === raw)) return raw;
  } catch (e) {
    /* storage unavailable; fall through to the default */
  }
  return "day-week";
}

function ganttSetZoom(preset) {
  if (!ganttZoomPresets.some((p) => p.id === preset)) return;
  try {
    localStorage.setItem(smdKey("ganttZoom"), preset);
  } catch (e) {
    /* storage unavailable; zoom stays session-only */
  }
  ganttPaintZoomButtons();
  renderGantt();
}

// The buttons are rebuilt with the header on every open, so the "active" state
// has to be re-asserted from the stored value rather than remembered in a
// variable that a rebuild would silently discard.
function ganttPaintZoomButtons() {
  const active = ganttZoom();
  document.querySelectorAll("#ganttPage [data-gantt-zoom]").forEach((btn) => {
    const on = btn.getAttribute("data-gantt-zoom") === active;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function ganttZoomHtml() {
  return (
    '<div class="gantt-zoom btn-group btn-group-sm" role="group" aria-label="Timeline zoom">' +
    ganttZoomPresets.map((p) => (
      '<button type="button" class="btn btn-outline-secondary" data-gantt-zoom="' + p.id + '"' +
      ' aria-pressed="false" onclick="ganttSetZoom(\'' + p.id + '\')">' + p.label + "</button>"
    )).join("") +
    "</div>"
  );
}

function ganttHeaderHtml() {
  // Zoom first, then the Streams dropdown. The dropdown carries `margin-left:auto`
  // (see injectGanttTheme), so it stays hard right and the zoom group sits beside
  // the page title.
  return ganttZoomHtml() + ganttStreamFilterHtml();
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

// PROJECTION
//
// Derives the <revo-grid> source from the stored streams: a `summary` row per
// stream and a `task` row per job, grouped by parentId. Dates are "YYYY-MM-DD",
// which is what the plugin's ISODateString expects. Nothing here writes to
// storage — the whole chart is a read-only projection.
function buildGanttTasks(streams, todayStr) {
  const items = [];
  const hidden = ganttHiddenStreamSet();
  // Keep each stream's index in the STORED array alongside it so the sort below
  // has something stable to move. This index is only valid for THIS render pass
  // (adding/removing a stream renumbers it); a job's durable identity is always
  // its `id`, which is what the task ids below use.
  const withIndex = (streams || []).map((s, i) => ({ stream: s, idx: i }));
  const ordered = withIndex.slice().sort((a, b) => (a.stream.sequence || 0) - (b.stream.sequence || 0));
  // Streams excluded by the header filter are dropped entirely, so both the
  // summary row and all of its jobs disappear from the chart.
  const visible = ordered.filter((x) => !hidden.has(x.stream.title || "Untitled stream"));
  visible.forEach((x) => {
    const stream = x.stream;
    const streamTitle = stream.title || "Untitled stream";
    // The stream id is positional and only has to be unique within this one
    // source array, which is all the plugin's `new Map(tasks.map(t => [t.id]))`
    // grouping needs. Job ids come from the stored `id` so they survive a
    // re-projection.
    const groupId = "s" + x.idx;
    const jobs = (stream.jobs || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    // Derive each job's start/end once.
    const spans = jobs.map((job) => {
      const start = job.sleepUntil || todayStr;
      const days = Math.max(1, parseInt(job.duration, 10) || 1);
      const end = ganttAddDaysStr(start, days);
      return { job, start, end };
    });
    // A stream WITH jobs spans them. One WITHOUT jobs gets a zero-length span on
    // today, which the vendor draws as its 6px minimum bar: the stream still
    // gets a row, so a new empty stream is visible on the chart instead of
    // silently vanishing.
    const groupStart = spans.length
      ? spans.reduce((min, s) => (s.start < min ? s.start : min), spans[0].start)
      : todayStr;
    const groupEnd = spans.length
      ? spans.reduce((max, s) => (s.end > max ? s.end : max), spans[0].end)
      : todayStr;
    items.push({
      id: groupId,
      parentId: null,
      name: streamTitle,
      type: "summary",
      startDate: groupStart,
      endDate: groupEnd,
      progressPercent: 0
    });
    spans.forEach(({ job, start, end }) => {
      items.push({
        id: "j" + job.id,
        parentId: groupId,
        name: ganttJobLabel(job),
        type: "task",
        startDate: start,
        endDate: end,
        progressPercent: 0
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

// Row label for a job: the title, plus the repeat frequency in round brackets
// when it is worth saying - e.g. "Review (Weekdays)" or "Gym (Mon, Wed, Fri)".
//
// "Every day" is the default schedule, so a plain daily job (or one with no
// schedule at all) gets NOTHING: labelling every row "(Every day)" is noise.
// The frequency text comes from the app's own `getScheduleText` so the chart
// never grows a second, drifting wording for the same schedule.
function ganttJobLabel(job) {
  const title = job.title || "Untitled job";
  const raw = typeof getScheduleText === "function" ? getScheduleText(job.schedule) : "";
  // Only drop the parenthetical when it really is extra detail. It must contain
  // a space or a dash ("Mon-Fri"); otherwise "Every 14 day(s)" would be mangled
  // into "Every 14 day" by mistake.
  const freq = String(raw || "").replace(/\s*\(([^)]*)\)\s*$/, (m, inner) => (/[\s\-–]/.test(inner) ? "" : m)).trim();
  if (!freq || /^every\s*day$/i.test(freq)) return title;
  return title + " (" + freq + ")";
}

// RENDER
//
// Draws the chart. The whole function is read-only: it sets properties on the
// grid and never subscribes to anything, so there is no path by which the chart
// can write back to storage.
function renderGantt() {
  const token = ++_ganttRenderToken;
  const page = document.getElementById("ganttPage");
  const host = page && page.querySelector("#ganttChart");
  if (!host) return;
  ganttPaintZoomButtons();
  ganttLibReady().then(function (lib) {
    // Bail if a newer render started, or if the page was closed/rebuilt while we
    // were waiting — the element we captured may no longer be the one on screen.
    if (token !== _ganttRenderToken || !host.isConnected) return;
    try {
      drawGantt(host, lib);
    } catch (err) {
      host.innerHTML = '<div class="text-danger p-3">Could not draw the Gantt chart.</div>';
    }
  }).catch(function (err) {
    if (token !== _ganttRenderToken || !host.isConnected) return;
    console.error("PlanMyDay: Gantt draw failed", err);
    host.innerHTML = '<div class="text-secondary p-3">Gantt library unavailable.</div>';
  });
}

function drawGantt(host, lib) {
  const todayStr = getTodayStr();
  const items = buildGanttTasks(loadStreams(), todayStr);
  // Reuse the grid if this container already has one. Re-creating it on every
  // stream-filter change would re-register the plugin and throw away the
  // horizontal scroll position, so the element is built once per container and
  // afterwards only `source` (and `gantt`, for zoom) is touched.
  let grid = host.querySelector("revo-grid");
  const isNew = !grid;
  if (isNew) {
    grid = document.createElement("revo-grid");
    grid.style.height = "100%";
    host.appendChild(grid);
  }

  if (isNew) {
    // The plugin's own column set (Task / Start / End) with sorting switched
    // off. normalizeTaskColumns() keeps an explicit `sortable: false` — it only
    // falls back to true when the property is absent — and pins the task
    // columns to the start edge so the timeline scrolls under them.
    grid.columns = lib.DEFAULT_TASK_COLUMNS.map(function (col) {
      var copy = Object.assign({}, col, { sortable: false });
      // Indent the Task column for JOB rows so a job is visually nested under
      // its stream. The rows carry no DOM marker for task vs summary, so this
      // is done in the cell template (the row model has `type`). The template
      // returns a vnode exactly like the vendored cell renderer does, keeping
      // the ellipsis/truncation the default text node would have.
      if (col.prop === "name") {
        copy.cellTemplate = function (h, schemaModel) {
          var model = schemaModel && schemaModel.model;
          var value = model && model.name != null ? String(model.name) : "";
          var cls = model && model.type === "task" ? "pmd-gantt-job-name" : "pmd-gantt-stream-name";
          return h("span", { class: cls }, value);
        };
      }
      return copy;
    });
    // The plugin MUST be registered before `gantt` is set: its constructor
    // installs the `gantt` accessor that the config is written through, and it
    // projects the current grid source on construction.
    grid.plugins = [lib.GanttPlugin];
    // readonly is what stops the Task/Start/End cells being edited. It does NOT
    // stop the bars being dragged — that is a separate pointer handler inside
    // the plugin and is disabled in CSS. Both are needed.
    grid.readonly = true;
    // 30px rows: the vendor ships 40px min-height cells and 28px bars, which on
    // a full-page chart read as a handful of chunky rows with dead space below.
    // Compact rows are overridden in CSS (the timeline cell keeps its 40px
    // min-height unless it is dropped too), so the full page shows far more
    // rows - the chart fills with content instead of looking stretched.
    grid.rowSize = 30;
    ganttApplyMode(grid);
    grid.gantt = {
      id: "planmyday-gantt",
      name: "PlanMyDay Gantt",
      version: "1",
      timeZone: "UTC",
      updatedAt: new Date().toISOString(),
      zoomPreset: ganttZoom(),
      visuals: { showDependencies: false, showTaskLabels: true }
    };
  } else if (grid.gantt && grid.gantt.zoomPreset !== ganttZoom()) {
    // Reassigning the whole object is how the plugin is reconfigured: the
    // accessor is reactive, so a new object re-reads the zoom preset and
    // re-lays-out the timeline in place.
    grid.gantt = Object.assign({}, grid.gantt, { zoomPreset: ganttZoom() });
  }

  grid.source = items;
  ganttWatchMode(grid);
  ganttBindBarDrag(grid);
}

// BAR DRAG PERSISTENCE
//
// The vendored plugin owns the pointer interaction (see the BAR INTERACTION
// comment in injectGanttTheme): a pointerdown on a bar element that carries
// `data-gantt-interaction="move"` (the whole bar — our left half) or on the end
// handle's `"resize-end"` (our right half) opens a range edit, and each
// pointermove rewrites that task's startDate/endDate in the plugin's own copy of
// the source, re-rendering the grid as it goes. This code never duplicates the
// drag itself; it only needs to (a) remember which task + mode was grabbed when
// the pointer went down, and (b) after pointerup read the updated dates out of
// `grid.source` and persist them to the app's stored streams. Both halves map
// back to the job model used by buildGanttTasks():
//
//   start = job.sleepUntil || today      (a MOVE shifts start, so sleepUntil)
//   end   = start + (job.duration || 1)  (a resize-end changes end => duration)
//
// A move keeps the duration (both ends shift together) so only sleepUntil is
// written; a resize-end changes endDate only, so the duration is recomputed from
// the new span. A SUMMARY drag (stream bar) shifts every child job's start by
// the same day delta (see ganttPersistStreamShift). The grid's own scrollbar /
// zoom re-render must not be disturbed: no re-render is forced here — the plugin
// already drew the moved bar — but the stored streams are updated so a later
// open/reload keeps the change.
function ganttBindBarDrag(grid) {
  if (!grid) return;
  _ganttDragGrid = grid;
  // Capture what is being grabbed. Pointerdown bubbles, and the plugin's own
  // handler is registered on the grid before ours, but we only READ the target's
  // data attributes here — nothing we do can fight the drag.
  grid.addEventListener("pointerdown", function (e) {
    var hit = ganttDragTarget(e);
    if (!hit) return;
    var row = (grid.source || []).find(function (r) { return r.id === hit.taskId; });
    if (!row || (row.type !== "task" && row.type !== "summary")) return;
    _ganttDragRecord = {
      taskId: hit.taskId,
      mode: hit.mode,
      startDate: row.startDate,
      endDate: row.endDate
    };
  });
  // One document-level listener for the whole page lifetime: grids are recreated
  // on every open, but the stored drag state is module-level, so the listener is
  // installed once.
  if (!_ganttDragBound) {
    _ganttDragBound = true;
    document.addEventListener("pointerup", function () {
      if (!_ganttDragRecord || !_ganttDragGrid || !_ganttDragGrid.isConnected) return;
      var rec = _ganttDragRecord;
      _ganttDragRecord = null;
      ganttPersistBarDrag(rec);
    });
  }
}

// Walks the event's composed path for the first element that names a gantt bar
// and an interaction mode, mirroring the plugin's own hit test (An()). Returns
// null when the pointer went down somewhere else entirely.
function ganttDragTarget(e) {
  var path = e.composedPath ? e.composedPath() : [];
  for (var i = 0; i < path.length; i++) {
    var el = path[i];
    if (!(el instanceof HTMLElement)) continue;
    var taskId = el.getAttribute && el.getAttribute("data-gantt-task-id");
    var mode = el.getAttribute && el.getAttribute("data-gantt-interaction");
    if (taskId && (mode === "move" || mode === "resize-end")) {
      return { taskId: taskId, mode: mode };
    }
  }
  return null;
}

// Reads the dragged task's final dates from grid.source (the plugin updated
// them) and writes the equivalent job fields back into the stored streams.
// Task ids are "j" + job.id for jobs and "s" + storedArrayIndex for streams. A
// row without a match in storage is left alone.
function ganttPersistBarDrag(rec) {
  var grid = _ganttDragGrid;
  var row = (grid.source || []).find(function (r) { return r.id === rec.taskId; });
  if (!row) return;
  // Only write when the drag actually moved something.
  if (row.startDate === rec.startDate && row.endDate === rec.endDate) return;
  var streams = loadStreams();
  if (row.type === "summary") {
    ganttPersistStreamShift(streams, rec, row);
    return;
  }
  if (row.type !== "task") return;
  var jobId = rec.taskId.slice(1); // strip the "j" prefix
  var job = null;
  for (var s = 0; s < streams.length && !job; s++) {
    var jobs = streams[s].jobs || [];
    for (var j = 0; j < jobs.length; j++) {
      if (jobs[j].id === jobId) { job = jobs[j]; break; }
    }
  }
  if (!job) return;
  if (rec.mode === "move") {
    job.sleepUntil = row.startDate;
  } else if (rec.mode === "resize-end") {
    var days = ganttDaysBetween(row.startDate, row.endDate);
    job.duration = Math.max(1, days);
  }
  ganttSaveShiftedStreams(streams);
}

// A stream bar was moved: shift every job in that stream by the same number of
// days the stream's start moved, so the children follow their parent's new
// position. Stream task ids are "s" + the stream's index in the STORED array
// (buildGanttTasks assigns them that way, before any sequence sort). A job with
// no sleepUntil starts "today" by definition, so shifting it means recording
// today + delta explicitly.
function ganttPersistStreamShift(streams, rec, row) {
  var idx = Number(rec.taskId.slice(1));
  var stream = streams[idx];
  if (!stream) return;
  var delta = ganttDaysBetween(rec.startDate, row.startDate);
  if (delta === 0) return;
  var todayStr = getTodayStr();
  (stream.jobs || []).forEach(function (job) {
    job.sleepUntil = ganttAddDaysStr(job.sleepUntil || todayStr, delta);
  });
  ganttSaveShiftedStreams(streams);
}

// Persists the streams and re-projects from them so the summary bars and any
// other derived rows follow the new spans immediately.
function ganttSaveShiftedStreams(streams) {
  saveStreams(streams);
  renderGantt();
}

// Whole days between two YYYY-MM-DD strings (end - start), UTC arithmetic like
// ganttAddDaysStr(). The app's duration is exactly this span: end = start +
// duration days.
function ganttDaysBetween(startStr, endStr) {
  var ps = String(startStr).split("-");
  var pe = String(endStr).split("-");
  var d0 = Date.UTC(Number(ps[0]), Number(ps[1]) - 1, Number(ps[2]));
  var d1 = Date.UTC(Number(pe[0]), Number(pe[1]) - 1, Number(pe[2]));
  return Math.round((d1 - d0) / 86400000);
}

// LIGHT / DARK
//
// RevoGrid's theme system is gated on the `theme` ATTRIBUTE, and the shipped
// stylesheet only has rules for `default`, `dark`, `compact`, `darkCompact`,
// `material` and `darkMaterial`. The five bundled named palettes (ocean,
// midnight, aurora, highContrast, highContrastDark) are built with defineTheme()
// but have no matching CSS, so naming one leaves the grid UNSTYLED — the cells
// fall back to transparent/black and the text vanishes. So the attribute is
// pinned to the two real modes, and the actual colours come from the
// --rg-theme-* overrides in injectGanttTheme(), which point at the app's
// Bootstrap variables and so follow the active Bootswatch theme for free.
function ganttApplyMode(grid) {
  const dark = document.documentElement.getAttribute("data-bs-theme") === "dark";
  grid.setAttribute("theme", dark ? "dark" : "default");
}

// Keeps the attribute in step with the app's Theme Mode setting while the chart
// is on screen. The app flips `data-bs-theme` on <html> and dispatches no event,
// so this is the only way a mid-view mode switch reaches the grid. The observer
// is stored on the window rather than leaked per grid element, and is replaced
// (not stacked) when a new grid is drawn.
function ganttWatchMode(grid) {
  if (_ganttModeObserver) _ganttModeObserver.disconnect();
  _ganttModeObserver = new MutationObserver(function () {
    ganttApplyMode(grid);
  });
  _ganttModeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-bs-theme"]
  });
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

// THEME OVERRIDE for the vendored grid + timeline.
//
// Both libraries expose their colours as CSS custom properties, so the whole
// override is one scoped block of variable assignments rather than a pile of
// rules fighting the vendors' DOM classes (which is what the previous jsgantt
// page had to do — it patched `.glineitem`, `.gmajorheading`, `.gselector` and
// friends by hand).
//
// Three separate things are themed here:
//
//  1. --rg-theme-*    RevoGrid's grid tokens. NOTE the name mismatch: the
//     public `themeTokenCssVariables` map documents these as --revo-grid-*, but
//     the shipped stylesheet actually reads --rg-theme-*. Overriding the
//     documented names would do nothing at all, so the real ones are used here.
//     The grid paints its own surface from --rg-theme-background and leaves the
//     individual cells transparent, which is why the cells need no rules of
//     their own.
//
//  2. --rg-gantt-*   The timeline's own tokens (header, gridlines, bars,
//     summary bars, dependency arrows). Every one of these has a hard-coded
//     light fallback in gantt.css, so all of them must be set or the timeline
//     stays white inside a dark chart.
//
//  3. The one rule the tokens cannot express: `.rg-gantt-cell` bakes a white
//     wash into its background-image (a hard-coded
//     `linear-gradient(#fafafaa3, #fff6)`) with no variable to turn it off. Left
//     alone it lays a milky film over the cells in a dark theme, so the
//     background-image is replaced with just the gridline gradient — the
//     background-size that drives the gridline pitch is left untouched.
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
    "}",
    "/* 1. RevoGrid grid tokens. Explicit values only: anything left unset falls",
    "   back to the vendors' light defaults and shows through as a white panel.",
    "   Every value is a Bootstrap variable, so all of this follows the active",
    "   Bootswatch theme AND light/dark mode with no per-theme work. */",
    "#ganttPage revo-grid {",
    "  --rg-theme-background: var(--bs-body-bg);",
    "  --rg-theme-foreground: var(--bs-body-color);",
    "  --rg-theme-text: var(--bs-body-color);",
    "  --rg-theme-border: var(--bs-border-color);",
    "  --rg-theme-divider: var(--bs-border-color);",
    "  --rg-theme-cell-border: var(--bs-border-color);",
    "  --rg-theme-cell-vertical-border: var(--bs-border-color);",
    "  --rg-theme-cell-disabled-bg: var(--bs-body-bg);",
    "  --rg-theme-header-bg: var(--bs-secondary-bg);",
    "  --rg-theme-header-color: var(--bs-body-color);",
    "  --rg-theme-header-border: var(--bs-border-color);",
    "  --rg-theme-header-focused-bg: var(--bs-tertiary-bg);",
    "  --rg-theme-header-hover-bg: var(--bs-tertiary-bg);",
    "  --rg-theme-row-headers-bg: var(--bs-secondary-bg);",
    "  --rg-theme-row-headers-color: var(--bs-body-color);",
    "  --rg-theme-row-hover: var(--bs-tertiary-bg);",
    "  --rg-theme-focused-bg: var(--bs-tertiary-bg);",
    "  --rg-theme-primary: var(--bs-primary);",
    "  --rg-theme-primary-transparent: color-mix(in srgb, var(--bs-primary) 12%, transparent);",
    "  --rg-theme-selection-bg: color-mix(in srgb, var(--bs-primary) 12%, transparent);",
    "  --rg-theme-selection-border: var(--bs-primary);",
    "  /* gantt.css reads --revo-grid-focused-bg (not --rg-theme-*) for the",
    "     header cell background, so it needs the documented name too. */",
    "  --revo-grid-focused-bg: var(--bs-tertiary-bg);",
    "}",
    "/* Job names are indented under their stream by the name-column cellTemplate",
    "   (which stamps .pmd-gantt-job-name on task rows). The cell is a flex row, so",
    "   the padding must go on the cell itself - the span inside is the truncating",
    "   line, and padding it would push the ellipsis instead of the text. */",
    "#ganttPage revo-grid .pmd-gantt-job-name {",
    "  padding-left: 1.5rem;",
    "}",
    "/* 2. The timeline's own tokens. */",
    "#ganttPage {",
    "  --rg-gantt-background: var(--bs-body-bg);",
    "  --rg-gantt-foreground: var(--bs-body-color);",
    "  --rg-gantt-muted: var(--bs-secondary-bg);",
    "  --rg-gantt-muted-foreground: var(--bs-body-color);",
    "  --rg-gantt-border: var(--bs-border-color);",
    "  --rg-gantt-gridline: var(--bs-border-color);",
    "  --rg-gantt-task: var(--bs-success);",
    "  --rg-gantt-task-strong: color-mix(in srgb, var(--bs-success) 82%, black);",
    "  --rg-gantt-summary: var(--bs-danger);",
    "  --rg-gantt-dependency: var(--bs-body-color);",
    "}",
    "/* 3. Drop the hard-coded white wash. The vendor rule is a `background`",
    "   shorthand carrying BOTH gradients; only background-image is replaced, so",
    "   the background-size (the gridline pitch) still applies.",
    "   Selector beats the vendors' bare `.rg-gantt-cell`, so no !important. */",
    "#ganttPage .rg-gantt-cell {",
    "  background-image: linear-gradient(to right, var(--rg-gantt-gridline) 1px, transparent 1px);",
    "  min-height: 0;",
    "}",
    "/* Stream headers are the summary row names in the Task column (the cell",
    "   template stamps .pmd-gantt-stream-name on them). Bold separates a stream",
    "   from its nested jobs visually, on top of the indent. */",
    "#ganttPage revo-grid .pmd-gantt-stream-name {",
    "  font-weight: 600;",
    "}",
    "/* BAR INTERACTION. The plugin draws each bar with the whole bar set to",
    "   data-gantt-interaction=\"move\" and a small end handle set to",
    "   \"resize-end\", then binds a document-level pointerdown/move/up that",
    "   rewrites startDate/endDate in its own copy of the source and re-renders",
    "   (grid.source ends up carrying the new dates). That drag is wanted for JOB",
    "   bars, split by which half you grab:",
    "     - LEFT half is the bar element itself -> grab cursor + \"move\" mode.",
    "       Dragging it shifts the whole bar (start AND end), which persists as",
    "       the job's start date (sleepUntil; see ganttBindBarDrag).",
    "     - RIGHT half is the end handle stretched across it -> ew-resize cursor",
    "       + \"resize-end\" mode. Dragging it changes the end date only, which",
    "       persists as the job's duration.",
    "   SUMMARY (stream) bars are draggable too, but as a WHOLE BAR only (move",
    "   mode): dragging a stream bar shifts every job in that stream by the same",
    "   number of days (persisted in ganttPersistBarDrag). Resizing a stream makes",
    "   no sense - its span is derived from its jobs - so the end handle is",
    "   removed from summary bars and the whole bar is one move zone.",
    "   The start/progress handles are hidden so only move + duration-resize can",
    "   ever start, and cell editing is still off (grid.readonly). The vendor",
    "   only moves the grid; persisting to the stored streams is done by",
    "   ganttBindBarDrag(). */",
    "#ganttPage .rg-gantt-bar {",
    "  cursor: grab;",
    "}",
    "#ganttPage .rg-gantt-bar-handle--start,",
    "#ganttPage .rg-gantt-progress-handle {",
    "  display: none;",
    "}",
    "#ganttPage .rg-gantt-bar--summary .rg-gantt-bar-handle--end {",
    "  display: none;",
    "}",
    "#ganttPage .rg-gantt-bar-handle--end {",
    "  left: 50%;",
    "  right: auto;",
    "  width: 50%;",
    "  top: 0;",
    "  height: 100%;",
    "  transform: none;",
    "  border-radius: 0;",
    "  background: transparent;",
    "  opacity: 1;",
    "  cursor: ew-resize;",
    "}",
    "/* COMPACT ROWS. The rows are 30px (grid.rowSize) instead of the vendor's",
    "   42px, so the full-page chart shows far more rows. The vendor's bar sizes",
    "   are sized for 42px rows; shrink them to sit cleanly inside the 30px row",
    "   (bars are vertically centred on the row). The label keeps the 12px font",
    "   but its text-shadow is off so it stays readable at the tighter pitch. */",
    "#ganttPage .rg-gantt-bar {",
    "  height: 18px;",
    "}",
    "#ganttPage .rg-gantt-bar--summary {",
    "  height: 8px;",
    "}",
    "/* Zoom buttons: the active preset is filled, the rest stay outline-only.",
    "   The button group follows the page chrome rather than the theme's button",
    "   palette - `btn-outline-secondary` is NOT reliably an outline (it renders",
    "   as a filled grey block with white text in flatly light mode). */",
    "#ganttPage .gantt-zoom > .btn {",
    "  background-color: var(--gantt-surface);",
    "  color: var(--gantt-text);",
    "  border: 1px solid var(--gantt-border);",
    "}",
    "#ganttPage .gantt-zoom > .btn:hover,",
    "#ganttPage .gantt-zoom > .btn:focus {",
    "  background-color: var(--gantt-surface-alt);",
    "  color: var(--gantt-text);",
    "  border-color: var(--gantt-border);",
    "}",
    "#ganttPage .gantt-zoom > .btn.active {",
    "  background-color: var(--gantt-surface-alt);",
    "  color: var(--gantt-text);",
    "  border-color: var(--gantt-border);",
    "  font-weight: 600;",
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
    "}",
    "/* LAYOUT: the chart fills the page. The smd-page body is `flex: 1",
    "   overflow-y: auto`, which would wrap the grid in a scroll pane and cap it",
    "   at the body's own scroll height - the grid needs the body's flex space",
    "   directly so its internal virtualiser owns the scrollbar. Turn the body",
    "   into a column flex container, drop its padding (the p-2 utility is",
    "   `!important`, so this has to be too), and let the host grow. */",
    "#smd-app #ganttPage .smd-page-body {",
    "  display: flex;",
    "  flex-direction: column;",
    "  overflow: hidden;",
    "  padding: 0 !important;",
    "}",
    "#ganttPage #ganttChart {",
    "  flex: 1 1 auto;",
    "  min-height: 0;",
    "}"
  ].join("\n");
  (document.head || document.documentElement).appendChild(s);
})();
