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
// Scroll anchor preserved across a re-render. RevoGrid keeps the vertical scroll
// in PIXELS when `source` is replaced, so a stream collapsing/expanding ABOVE the
// current viewport (or being filtered out) makes the visible rows jump away from
// the cursor. We remember the row at the top of the viewport by its stable task
// id plus its pixel offset within the 30px row, then restore the same position
// once the grid has repainted. See ganttCaptureScrollAnchor()/restore.
var _ganttScrollAnchor = null;
// Live light/dark watcher. See ganttApplyMode().
var _ganttModeObserver = null;
// Bar-drag persistence state. The vendored plugin handles the pointer
// interaction and updates the grid's source live; these track which task was
// grabbed (and how) so the pointerup listener can write the result back to the
// stored streams. See ganttBindBarDrag()/ganttPersistBarDrag().
var _ganttDragRecord = null;
var _ganttDragGrid = null;
var _ganttDragBound = false;
// Floating ghost panel shown while a bar is dragged (see ganttBarGhostUpdate).
var _ganttBarGhost = null;
// Row-drag state (reordering jobs within/across streams). See ganttBindRowDrag.
var _ganttRowDrag = null;
// Timer used to defer the drop-target re-resolve after an auto-scroll, giving
// the virtualiser a frame to move rows before we hit-test against them.
var ganttRowDragAutoScrollTimer = null;
// UNDO / REDO. A stack of deep snapshots of the stored streams, captured just
// BEFORE each gantt mutation (bar move/resize, stream shift, job drag-and-drop,
// stream drag-and-drop) is committed. The undo stack is the history of "before"
// states; redo holds the "after" states cleared whenever a new change lands.
var _ganttUndoStack = [];
var _ganttRedoStack = [];

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
    ganttBindUndoShortcuts();
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
    ganttZoomPresets.map((p, i) => (
      // Every preset except the LAST carries `me-1` (margin-end), so the Day and
      // Week buttons get right-margin and the presets read as evenly-spaced
      // controls instead of a fused segment group.
      '<button type="button" class="btn' + (i < ganttZoomPresets.length - 1 ? " me-1" : "") + '" data-gantt-zoom="' + p.id + '"' +
      ' aria-pressed="false" onclick="ganttSetZoom(\'' + p.id + '\')">' + p.label + "</button>"
    )).join("") +
    "</div>"
  );
}

function ganttHeaderHtml() {
  // Zoom first, then Undo/Redo, then the Streams dropdown. The dropdown carries
  // `margin-left:auto` (see injectGanttTheme), so it stays hard right and the
  // zoom + history controls sit beside the page title.
  return ganttZoomHtml() + ganttUndoRedoHtml() + ganttStreamFilterHtml();
}

// Undo / Redo buttons in the header, just before the Streams filter. Disabled
// state is re-asserted by ganttPaintUndoButtons() on every render.
function ganttUndoRedoHtml() {
  return (
    '<div class="gantt-undo-redo btn-group btn-group-sm ms-2" role="group" aria-label="Undo and redo">' +
      '<button type="button" class="btn gantt-undo-btn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled ' +
        'onclick="ganttUndo()">&#8630;</button>' +
      '<button type="button" class="btn gantt-redo-btn" title="Redo (Ctrl+Y)" aria-label="Redo" disabled ' +
        'onclick="ganttRedo()">&#8631;</button>' +
    "</div>"
  );
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

// COLLAPSED STREAMS
//
// A stream's row can be collapsed so its job rows (and bars) are hidden. The
// state is a set of stream TITLES persisted under smdKey("ganttCollapsedStreams")
// (same shape as the hidden-stream filter). Collapsing only affects the rows the
// projection emits — the summary bar keeps its full min..max span so the stream
// stays visible on the timeline — and the toggle lives in the name-column cell
// template (see the pmd-gantt-collapse-toggle rule in injectGanttTheme).
var ganttCollapsedStreams = null;

function ganttCollapsedStreamSet() {
  if (ganttCollapsedStreams) return ganttCollapsedStreams;
  ganttCollapsedStreams = new Set();
  try {
    const raw = localStorage.getItem(smdKey("ganttCollapsedStreams"));
    if (raw) JSON.parse(raw).forEach((t) => ganttCollapsedStreams.add(t));
  } catch (e) {
    ganttCollapsedStreams = new Set();
  }
  return ganttCollapsedStreams;
}

function ganttSaveCollapsedStreams() {
  try {
    localStorage.setItem(smdKey("ganttCollapsedStreams"), JSON.stringify(Array.from(ganttCollapsedStreams)));
  } catch (e) {
    /* storage unavailable (private mode); collapse stays session-only */
  }
}

// Called by the toggle button in the stream name cell.
function ganttToggleStreamCollapsed(title) {
  const set = ganttCollapsedStreamSet();
  if (set.has(title)) set.delete(title);
  else set.add(title);
  ganttSaveCollapsedStreams();
  renderGantt();
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
      '<button type="button" class="btn btn-sm dropdown-toggle gantt-stream-toggle" ' +
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
  const collapsed = ganttCollapsedStreamSet();
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
    // Derive each job's start/end once. ALL jobs are measured so a collapsed
    // stream's summary bar still spans its full min..max range; only the ROWS
    // that are emitted below change when collapsed.
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
    // A collapsed stream emits NO job rows (their bars disappear) but keeps the
    // summary row + span above. An expanded stream emits every job.
    if (!collapsed.has(streamTitle)) {
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
    }
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
  ganttPaintUndoButtons();
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
  } else {
    // The grid preserves its vertical scroll by PIXELS across a source swap, so
    // collapsing/expanding a stream ABOVE the current viewport (or filtering one
    // out) makes the visible rows jump away from the cursor even though the drop
    // the user is looking at has not moved. Anchor the scroll to the row at the
    // top of the viewport (by its stable task id) and restore it after the grid
    // has re-rendered, so the same content stays under the pointer.
    ganttCaptureScrollAnchor(grid, items);
    grid.addEventListener("aftergridrender", function onRender() {
      grid.removeEventListener("aftergridrender", onRender);
      ganttRestoreScrollAnchor(grid, items);
    });
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
          if (model && model.type === "summary") {
            // Stream header: a collapse toggle + the (bold) stream name. The
            // toggle calls ganttToggleStreamCollapsed() which flips the stored
            // collapsed set and re-renders. The glyph is ▸ when collapsed
            // (click to expand) and ▾ when expanded (click to collapse), like a
            // file tree; aria-expanded reflects the CURRENT state.
            var isCollapsed = ganttCollapsedStreamSet().has(value);
            return h("span", { class: "pmd-gantt-stream-name" }, [
              h("button", {
                type: "button",
                class: "pmd-gantt-collapse-toggle",
                "aria-expanded": String(!isCollapsed),
                "aria-label": (isCollapsed ? "Expand" : "Collapse") + " stream " + value,
                onClick: function (e) {
                  e.stopPropagation();
                  ganttToggleStreamCollapsed(value);
                }
              }, isCollapsed ? "▸" : "▾"),
              h("span", { class: "pmd-gantt-stream-title" }, value)
            ]);
          }
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
    // No cell focus. RevoGrid otherwise adds `.focused-rgRow` / a focus ring on
    // click (the row gets `background-color: var(--rg-theme-focused-bg)` and a
    // `revogr-focus` box-shadow border), which reads as a red/theme-coloured
    // highlight on a read-only chart. canFocus=false stops the focus machinery
    // entirely so the class never appears; the CSS override below is a second
    // line of defence for any focus that slips through.
    grid.canFocus = false;
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
  ganttBindRowDrag(grid);
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
    document.addEventListener("pointermove", function (e) {
      if (!_ganttDragRecord || !_ganttDragGrid || !_ganttDragGrid.isConnected) return;
      ganttBarGhostUpdate(_ganttDragGrid, e.clientX, e.clientY);
    });
    document.addEventListener("pointerup", function () {
      if (!_ganttDragRecord || !_ganttDragGrid || !_ganttDragGrid.isConnected) return;
      var rec = _ganttDragRecord;
      _ganttDragRecord = null;
      ganttBarGhostRemove();
      ganttPersistBarDrag(rec);
    });
  }
}

// The floating ghost panel shown while a bar is being dragged. Reads the task's
// LIVE start/end from grid.source (the plugin rewrites them on every move) and
// paints a small panel near the cursor with the start date, end date and span in
// days. Reused for both job and stream bars. The panel is fixed so it can escape
// the grid's scroll containers and pointer-events:none so it never blocks the
// pointer. It is created lazily on the first move and removed on pointerup.
function ganttBarGhostUpdate(grid, x, y) {
  var rec = _ganttBarGhost;
  var row = (grid.source || []).find(function (r) { return r.id === _ganttDragRecord.taskId; });
  if (!row) { ganttBarGhostRemove(); return; }
  if (!rec) {
    rec = document.createElement("div");
    rec.className = "pmd-gantt-bar-ghost";
    document.body.appendChild(rec);
    _ganttBarGhost = rec;
  }
  var start = row.startDate || "";
  var end = row.endDate || "";
  var days = ganttDaysBetween(start, end);
  rec.innerHTML =
    '<div class="pmd-gantt-bar-ghost-label">Start: <span class="pmd-gantt-bar-ghost-date">' + ganttEscapeHtml(start) + "</span></div>" +
    '<div class="pmd-gantt-bar-ghost-label">End: <span class="pmd-gantt-bar-ghost-date">' + ganttEscapeHtml(end) + "</span></div>" +
    '<div class="pmd-gantt-bar-ghost-label">Duration: <span class="pmd-gantt-bar-ghost-date">' + days + " day" + (days === 1 ? "" : "s") + "</span></div>";
  rec.style.left = x + "px";
  rec.style.top = y + "px";
}

function ganttBarGhostRemove() {
  if (_ganttBarGhost && _ganttBarGhost.parentNode) _ganttBarGhost.parentNode.removeChild(_ganttBarGhost);
  _ganttBarGhost = null;
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
  ganttCommitStreams(streams);
}

// ===== UNDO / REDO =====
//
// Every gantt mutation (job/stream bar move or resize, job drag-and-drop,
// stream drag-and-drop) funnels its final save through ganttCommitStreams(),
// which captures the PRE-mutation snapshot on the undo stack, clears the redo
// stack, persists, re-renders and repaints the header buttons. Undo/redo then
// just swap a stored snapshot with the current state and re-render. The
// snapshots are deep copies (loadStreams parses from storage each call), so an
// undo fully restores sleepUntil / duration / stream + job order.

// Deep snapshot of the current stored streams (parsed fresh so nothing aliases
// an in-flight editor buffer).
function ganttSnapshotStreams() {
  return JSON.parse(JSON.stringify(loadStreams()));
}

// Capture the current state as a new undo level and drop any redo history.
function ganttPushUndo() {
  _ganttUndoStack.push(ganttSnapshotStreams());
  if (_ganttUndoStack.length > 100) _ganttUndoStack.shift();
  _ganttRedoStack = [];
  ganttPaintUndoButtons();
}

// The single commit path for all gantt mutations: record undo, persist, render.
function ganttCommitStreams(streams) {
  ganttPushUndo();
  saveStreams(streams);
  renderGantt();
}

function ganttUndo() {
  var before = _ganttUndoStack.pop();
  if (before === undefined) return;
  _ganttRedoStack.push(ganttSnapshotStreams());
  saveStreams(before);
  renderGantt();
  ganttPaintUndoButtons();
}

function ganttRedo() {
  var after = _ganttRedoStack.pop();
  if (after === undefined) return;
  _ganttUndoStack.push(ganttSnapshotStreams());
  saveStreams(after);
  renderGantt();
  ganttPaintUndoButtons();
}

// Reflects the stack depths on the header buttons (disabled when empty). Called
// on every render (renderGantt) so a re-render never leaves a stale state.
function ganttPaintUndoButtons() {
  var undo = document.querySelector("#ganttPage .gantt-undo-btn");
  var redo = document.querySelector("#ganttPage .gantt-redo-btn");
  if (undo) undo.disabled = _ganttUndoStack.length === 0;
  if (redo) redo.disabled = _ganttRedoStack.length === 0;
}

// Ctrl+Z / Ctrl+Y while the Gantt page is open. Only when the focus is NOT in a
// text field (the user may be typing in the streams/job editors behind the
// page, or an <input> inside the page).
function ganttBindUndoShortcuts() {
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    var key = (e.key || "").toLowerCase();
    var isField = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" ||
      e.target.tagName === "SELECT" || (e.target.isContentEditable));
    if (isField) return;
    var page = document.getElementById("ganttPage");
    if (!page || page.classList.contains("d-none")) return;
    if (key === "z") {
      e.preventDefault();
      if (e.shiftKey) ganttRedo();
      else ganttUndo();
    } else if (key === "y") {
      e.preventDefault();
      ganttRedo();
    }
  });
}

// ROW DRAG (reorder jobs within a stream, or reparent to another stream)
//
// RevoGrid's own row drag reorders the raw grid source, but the Gantt plugin
// re-projects `grid.source` from the stored streams on every render, so a native
// reorder would be thrown away. Instead this is a custom pointer drag on the job
// name cells (.pmd-gantt-job-name). On pointerdown we record which stored job was
// grabbed; on pointermove we find the row currently under the cursor and
// highlight it; on pointerup we remove the job from its old stream's jobs array
// and insert it into the target stream at the position matching where it was
// dropped, then renumber `sequence` (the same ordering field the streams/job
// editors use) and save + re-render. Drop targets may be either a stream
// (summary) row — the job lands at the START of that stream — or a job row,
// where the job lands just BEFORE that job (dropping onto the lower half of a
// job row lands AFTER it, so you can place a job between two others).
function ganttBindRowDrag(grid) {
  if (!grid || grid.__ganttRowDragBound) return;
  grid.__ganttRowDragBound = true;

  grid.addEventListener("pointerdown", function (e) {
    // The grab handle is the whole TITLE CELL (the Task column, data-rgcol="0",
    // which contains the .pmd-gantt-job-name span for jobs or the
    // .pmd-gantt-stream-name wrapper for streams), not just the text span - so
    // the user can start the drag anywhere in the cell, including its padding.
    // The collapse toggle is a real <button> inside the stream cell; pressing it
    // must collapse/expand the stream, never start a drag.
    var cellEl = e.target && e.target.closest ? e.target.closest("revogr-data .rgCell[data-rgcol='0']") : null;
    if (!cellEl) return;
    if (e.target && e.target.closest && e.target.closest(".pmd-gantt-collapse-toggle")) return;
    var hasJob = !!cellEl.querySelector(".pmd-gantt-job-name");
    var hasStream = !!cellEl.querySelector(".pmd-gantt-stream-name, .pmd-gantt-stream-title");
    if (!hasJob && !hasStream) return;
    // find the task row for this cell
    var rowEl = cellEl.closest(".rgRow");
    if (!rowEl) return;
    var idx = Number(rowEl.getAttribute("data-rgrow"));
    var row = (grid.source || [])[idx];
    if (!row || !row.id) return;
    if (row.type === "task") {
      if (!hasJob) return;
      _ganttRowDrag = {
        kind: "job",
        grid: grid,
        rowEl: rowEl,
        ghostEl: null,
        jobId: row.id.slice(1),          // strip "j"
        jobTitle: (row.name || "").replace(/\s*\([^)]*\)\s*$/, ""),
        fromStreamIdx: ganttStoredStreamIndexForTask(row.id),
        startX: e.clientX,
        startY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        moved: false,
        targetRowEl: null,
        targetAfter: false,
        targetIndex: idx
      };
    } else if (row.type === "summary") {
      if (!hasStream) return;
      var sidx = ganttStoredStreamIndexForId(row.id);
      if (sidx < 0) return;
      _ganttRowDrag = {
        kind: "stream",
        grid: grid,
        rowEl: rowEl,
        ghostEl: null,
        streamIdx: sidx,
        jobId: row.id.slice(1),          // "s" + stored index
        jobTitle: (row.name || "").replace(/\s*\([^)]*\)\s*$/, ""),
        fromStreamIdx: sidx,
        startX: e.clientX,
        startY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        moved: false,
        targetRowEl: null,
        targetAfter: false,
        targetIndex: idx
      };
    } else {
      return;
    }
    // swallow the pointer so the grid does not also focus/scroll on the press
    e.preventDefault();
  });

  document.addEventListener("pointermove", function (e) {
    if (!_ganttRowDrag || _ganttRowDrag.grid !== grid) return;
    if (!_ganttRowDrag.moved &&
        Math.abs(e.clientX - _ganttRowDrag.startX) < 4 &&
        Math.abs(e.clientY - _ganttRowDrag.startY) < 4) {
      return;
    }
    if (!_ganttRowDrag.moved) {
      _ganttRowDrag.moved = true;
      // Keep a "grabbing" cursor over the whole chart for the duration of the
      // drag: without this, moving over another job's name re-applies that cell's
      // `cursor: grab` and the hand flickers back mid-drag.
      grid.classList.add("pmd-gantt-row-dragging");
      // Highlight the row being dragged in the grid so it stays visible among
      // the target highlighting.
      if (_ganttRowDrag.rowEl) _ganttRowDrag.rowEl.classList.add("pmd-gantt-dragging");
      // Create a ghost of the job title that follows the cursor.
      _ganttRowDrag.ghostEl = ganttRowGhostCreate(_ganttRowDrag.jobTitle);
    }
    if (_ganttRowDrag.ghostEl) ganttRowGhostMove(_ganttRowDrag.ghostEl, e.clientX, e.clientY);
    _ganttRowDrag.lastClientX = e.clientX;
    _ganttRowDrag.lastClientY = e.clientY;
    // Auto-scroll the grid when the pointer nears its top/bottom edge so hidden
    // rows come into reach. Only works while the drag is moving.
    ganttRowDragAutoScroll(grid, e.clientY);
    e.preventDefault();
    ganttRowDragHighlight(grid, e.clientX, e.clientY);
  });

  document.addEventListener("pointerup", function (e) {
    if (!_ganttRowDrag || _ganttRowDrag.grid !== grid) return;
    var drag = _ganttRowDrag;
    var targetEl = drag.targetRowEl;
    _ganttRowDrag = null;
    // clear the highlight BEFORE anything can change the DOM; the element is
    // captured from the record because _ganttRowDrag is null by now
    if (targetEl) targetEl.classList.remove("pmd-gantt-drop-target", "pmd-gantt-drop-target--after");
    if (drag.rowEl) drag.rowEl.classList.remove("pmd-gantt-dragging");
    if (drag.ghostEl) ganttRowGhostRemove(drag.ghostEl);
    clearInterval(ganttRowDragAutoScrollTimer);
    grid.classList.remove("pmd-gantt-row-dragging");
    if (!drag.moved) return; // it was a click, not a drag
    ganttPersistRowDrag(drag, e.clientX, e.clientY);
  });

  document.addEventListener("pointercancel", function (e) {
    // Same cleanup as pointerup but never persists the drag.
    if (!_ganttRowDrag || _ganttRowDrag.grid !== grid) return;
    var drag = _ganttRowDrag;
    var targetEl = drag.targetRowEl;
    _ganttRowDrag = null;
    if (targetEl) targetEl.classList.remove("pmd-gantt-drop-target", "pmd-gantt-drop-target--after");
    if (drag.rowEl) drag.rowEl.classList.remove("pmd-gantt-dragging");
    if (drag.ghostEl) ganttRowGhostRemove(drag.ghostEl);
    clearInterval(ganttRowDragAutoScrollTimer);
    grid.classList.remove("pmd-gantt-row-dragging");
  });
}

// A floating ghost of the dragged job's title that follows the cursor. Fixed so
// it can escape the grid's scroll containers; pointer-events:none so it never
// blocks the pointer. Styled from the same theme tokens as the chart.
function ganttRowGhostCreate(title) {
  var el = document.createElement("div");
  el.className = "pmd-gantt-drag-ghost";
  el.textContent = title || "";
  document.body.appendChild(el);
  return el;
}

function ganttRowGhostMove(el, x, y) {
  el.style.left = x + "px";
  el.style.top = y + "px";
}

function ganttRowGhostRemove(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

// The stored stream index that a task id ("j" + jobid) belongs to, found by
// scanning the stored streams' job ids. Returns -1 if the job is not stored.
function ganttStoredStreamIndexForTask(taskId) {
  var streams = loadStreams();
  var jobId = taskId.slice(1);
  for (var s = 0; s < streams.length; s++) {
    var jobs = streams[s].jobs || [];
    for (var j = 0; j < jobs.length; j++) {
      if (jobs[j].id === jobId) return s;
    }
  }
  return -1;
}

// Highlights the insertion boundary under the pointer. The band row is the row
// whose vertical band contains the pointer; the cursor's half of that row picks
// the edge. The boundary between two adjacent jobs is the SAME line whether it
// is reached from the bottom half of the job above (insert after it) or the top
// half of the job below (insert before it), so it must render identically: the
// highlight lands on the row that follows the boundary, drawn as a top border
// (the same as "before that next row"). Concretely:
//   - cursor in the TOP half of a job -> insert before it -> top border on it;
//   - cursor in the BOTTOM half of a job -> insert after it -> top border on the
//     NEXT row below (the same line as "before the next job"); if there is no
//     next row, the bottom border on the current row marks the stream's end;
//   - a SUMMARY band row means "append to the stream above" and keeps its own
//     top border (the boundary is just below that stream's jobs).
function ganttRowDragHighlight(grid, clientX, clientY) {
  if (_ganttRowDrag.kind === "stream") {
    ganttStreamDragHighlight(grid, clientX, clientY);
    return;
  }
  var dropY = clientY;
  // A target that is invalid (no stream resolves) or a no-op (job back into its
  // own slot) must not be shown.
  if (!ganttRowDropValid(grid, dropY, _ganttRowDrag.jobId, _ganttRowDrag.fromStreamIdx)) {
    if (_ganttRowDrag.targetRowEl) {
      _ganttRowDrag.targetRowEl.classList.remove("pmd-gantt-drop-target", "pmd-gantt-drop-target--after");
      _ganttRowDrag.targetRowEl = null;
      _ganttRowDrag.targetAfter = false;
    }
    return;
  }
  var bandEl = ganttRowBandEl(grid, dropY, _ganttRowDrag.jobId);
  var highlightEl = bandEl;
  var useAfter = false;
  if (bandEl) {
    var rect = bandEl.getBoundingClientRect();
    var after = clientY >= rect.top + rect.height / 2;
    if (after) {
      // Bottom half: the boundary is below this row. If a row follows, show it
      // as a top border on that row (identical to "before the next job"); only
      // the very last row (no next) uses its bottom border.
      var next = ganttRowBelowEl(grid, bandEl);
      if (next) highlightEl = next;
      else useAfter = true;
    }
  }
  var cls = useAfter ? "pmd-gantt-drop-target--after" : "pmd-gantt-drop-target";
  if (highlightEl === _ganttRowDrag.targetRowEl && cls === _ganttRowDrag.targetAfter) return;
  if (_ganttRowDrag.targetRowEl) _ganttRowDrag.targetRowEl.classList.remove("pmd-gantt-drop-target", "pmd-gantt-drop-target--after");
  _ganttRowDrag.targetRowEl = highlightEl;
  _ganttRowDrag.targetAfter = cls;
  if (highlightEl) highlightEl.classList.add(cls);
}

// Auto-scrolls the grid's vertical viewport when the pointer nears its top or
// bottom edge, so rows above/below the visible area become reachable while
// dragging. RevoGrid virtualises rows inside a `.vertical-inner` scroller; we
// scroll that element directly (not the window). The speed ramps up the closer
// the pointer is to the edge, and while the pointer stays in the edge zone a
// short interval keeps scrolling so the user does not have to keep jiggling
// the mouse. Each scroll re-resolves the drop target against the fresh rows.
function ganttRowDragAutoScroll(grid, clientY) {
  var scroller = ganttRowScrollerEl(grid);
  if (!scroller) return;
  clearInterval(ganttRowDragAutoScrollTimer);
  var rect = scroller.getBoundingClientRect();
  var threshold = 48; // px from the edge to start scrolling
  var maxStep = 24;   // px per tick at the very edge
  var topGap = clientY - rect.top;
  var bottomGap = rect.bottom - clientY;
  var dir = 0;
  if (topGap < threshold) dir = -1;
  else if (bottomGap < threshold) dir = 1;
  if (dir === 0) return;
  var step = function () {
    if (!_ganttRowDrag || !scroller.isConnected) { clearInterval(ganttRowDragAutoScrollTimer); return; }
    var r = scroller.getBoundingClientRect();
    var g = _ganttRowDrag.lastClientY;
    var t = 0;
    if (dir < 0) t = Math.max(0, 1 - (g - r.top) / threshold);
    else t = Math.max(0, 1 - (r.bottom - g) / threshold);
    if (t <= 0) { clearInterval(ganttRowDragAutoScrollTimer); return; }
    scroller.scrollTop += dir * Math.ceil(t * t * maxStep);
    if (_ganttRowDrag) ganttRowDragHighlight(grid, _ganttRowDrag.lastClientX, _ganttRowDrag.lastClientY);
  };
  step();
  ganttRowDragAutoScrollTimer = setInterval(step, 50);
}

// Remembers the row at the top of the grid's vertical viewport so the scroll
// position can be restored after a re-render that changes the row COUNT above
// it (collapse/expand/filter). The anchor is the source task id of the first
// visible row plus how many pixels of that 30px row are scrolled off the top.
function ganttCaptureScrollAnchor(grid, newItems) {
  _ganttScrollAnchor = null;
  if (!grid || grid.__ganttScrollAnchorDisabled) return;
  var scroller = ganttRowScrollerEl(grid);
  if (!scroller) return;
  var oldSource = grid.source || [];
  if (!oldSource.length) return;
  var rowSize = 30;
  var topPx = scroller.scrollTop;
  var rowIdx = Math.max(0, Math.floor(topPx / rowSize));
  var row = oldSource[rowIdx];
  if (!row || !row.id) return;
  // If the anchored row will not exist in the new source (its stream collapsed
  // and the top row was a job of it), fall back to that stream's summary row,
  // which always survives a collapse.
  var id = row.id;
  var found = (newItems || []).some(function (t) { return t.id === id; });
  if (!found && id.charAt(0) === "j") {
    var sidx = ganttStoredStreamIndexForTask(id);
    if (sidx >= 0) id = "s" + sidx;
  }
  _ganttScrollAnchor = { id: id, offset: topPx - rowIdx * rowSize };
}

// Applies a captured scroll anchor after the grid has re-rendered: finds the
// anchored row's new index in the rebuilt source and scrolls so that same row is
// at the same viewport offset, keeping the content under the cursor stable.
function ganttRestoreScrollAnchor(grid, newItems) {
  var anchor = _ganttScrollAnchor;
  _ganttScrollAnchor = null;
  if (!anchor) return;
  var scroller = ganttRowScrollerEl(grid);
  if (!scroller) return;
  var rowIdx = -1;
  for (var i = 0; i < (newItems || []).length; i++) {
    if (newItems[i].id === anchor.id) { rowIdx = i; break; }
  }
  if (rowIdx < 0) return;
  var rowSize = 30;
  var target = rowIdx * rowSize + anchor.offset;
  var max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  scroller.scrollTop = Math.max(0, Math.min(target, max));
}

// The element RevoGrid scrolls vertically. The `.vertical-inner` inside the
// pinned scroll viewport is the one with overflow-y:auto. Cached on the grid.
function ganttRowScrollerEl(grid) {
  if (grid.__ganttRowScroller) return grid.__ganttRowScroller;
  var el = grid.querySelector(".vertical-inner") || grid.querySelector("revogr-viewport-scroll .vertical-inner");
  if (!el) {
    var scrollers = grid.querySelectorAll("revogr-viewport-scroll");
    for (var i = 0; i < scrollers.length; i++) {
      var inner = scrollers[i].querySelector(".vertical-inner");
      if (inner) { el = inner; break; }
    }
  }
  grid.__ganttRowScroller = el;
  return el;
}

// The row element whose vertical band contains dropY, across ALL rows (summary
// included), excluding the dragged job's own row. If the line is over the
// dragged row's own band, fall through to the row below it. Returns null when
// there is no row under the line.
function ganttRowBandEl(grid, dropY, jobId) {
  var seen = {};
  var rows = [];
  document.querySelectorAll("#ganttChart .rgRow").forEach(function (el) {
    var idx = Number(el.getAttribute("data-rgrow"));
    if (isNaN(idx) || seen[idx]) return;
    seen[idx] = true;
    var row = (grid.source || [])[idx];
    if (!row) return;
    if (row.type === "task" && row.id.slice(1) === jobId) return; // the dragged row
    var rect = el.getBoundingClientRect();
    rows.push({ el: el, top: rect.top, bottom: rect.bottom });
  });
  rows.sort(function (a, b) { return a.top - b.top; });
  for (var i = 0; i < rows.length; i++) {
    if (dropY < rows[i].bottom) return rows[i].el;
  }
  // Line below every row: highlight the last row so the user sees the boundary.
  return rows.length ? rows[rows.length - 1].el : null;
}

// The row element directly below a given row, in visual (top-sorted) order,
// excluding the dragged job's own row. Returns null when the given row is the
// last one rendered. Used by the drop highlight to render the "after this row"
// boundary on the same line as "before the next row".
function ganttRowBelowEl(grid, rowEl) {
  var seen = {};
  var rows = [];
  document.querySelectorAll("#ganttChart .rgRow").forEach(function (el) {
    var idx = Number(el.getAttribute("data-rgrow"));
    if (isNaN(idx) || seen[idx]) return;
    seen[idx] = true;
    var row = (grid.source || [])[idx];
    if (!row) return;
    if (row.type === "task" && row.id.slice(1) === _ganttRowDrag.jobId) return; // the dragged row
    var rect = el.getBoundingClientRect();
    rows.push({ el: el, top: rect.top, bottom: rect.bottom });
  });
  rows.sort(function (a, b) { return a.top - b.top; });
  var target = Number(rowEl.getAttribute("data-rgrow"));
  var found = false;
  for (var i = 0; i < rows.length; i++) {
    if (found) return rows[i].el; // first row strictly below the target
    if (Number(rows[i].el.getAttribute("data-rgrow")) === target) found = true;
  }
  return null;
}

// The row that the insertion line (dropY) anchors on. The line is resolved by
// the vertical band it falls in across ALL rows (summary included). A JOB row is
// always a valid anchor (insert before/after it by the midpoint). A SUMMARY row
// is NEVER a target for its own stream's top; it always resolves to the stream
// ABOVE the line, appended to its bottom:
//   - COLLAPSED stream -> the header is the visible target for that (hidden)
//     stream, so it is returned as-is and ganttRowDropTarget appends to it.
//   - EXPANDED stream -> if the dragged job BELONGS to that header's stream,
//     dropping on its own header means "top of my stream" (before the first job
//     below it) - which is a no-op when that job is already first, and moves it
//     up otherwise. For a job from ANOTHER stream the row directly above the
//     header is the anchor: a job above means "after that job" (the previous
//     stream's bottom), and a header above means "append to that stream" (e.g.
//     dropping between two streams appends to the TOP one's bottom). "Above
//     C's header" is never part of C.
//   - the very first header with nothing above it -> rejected.
// When the line is below every row, the last JOB row anchors the drop (lands
// after it). Excludes the dragged job's own row.
function ganttRowAnchor(grid, dropY, jobId) {
  var seen = {};
  var rows = [];
  document.querySelectorAll("#ganttChart .rgRow").forEach(function (el) {
    var idx = Number(el.getAttribute("data-rgrow"));
    if (isNaN(idx) || seen[idx]) return;
    seen[idx] = true;
    var row = (grid.source || [])[idx];
    if (!row) return;
    if (row.type === "task" && row.id.slice(1) === jobId) return; // the dragged row
    var rect = el.getBoundingClientRect();
    rows.push({ el: el, row: row, top: rect.top, bottom: rect.bottom, mid: rect.top + rect.height / 2 });
  });
  rows.sort(function (a, b) { return a.top - b.top; });
  if (!rows.length) return null;
  // The row whose vertical band contains the insertion line.
  for (var i = 0; i < rows.length; i++) {
    if (dropY < rows[i].bottom) {
      if (rows[i].row.type === "task") return rows[i];
      // Summary band.
      if (ganttRowIsCollapsedStream(rows[i].row)) return rows[i]; // into this (hidden) stream
      // Expanded stream: if the dragged job is IN this stream, dropping on its
      // own header means "top of my stream" - anchor on the first job below.
      var sidx = ganttStoredStreamIndexForId(rows[i].row.id);
      var dragStream = ganttStoredStreamIndexForTask("j" + jobId);
      if (sidx === dragStream) {
        var first = i + 1 < rows.length ? rows[i + 1] : null;
        return (first && first.row.type === "task") ? first : null;
      }
      // Otherwise: the stream ABOVE the line, never this stream.
      var prev = i > 0 ? rows[i - 1] : null;
      if (prev) return prev;   // job above -> after it; header above -> append to that stream
      return null;             // first header, nothing above it
    }
  }
  // Line below every row: anchor on the last JOB row so the drop lands after it.
  for (var j = rows.length - 1; j >= 0; j--) {
    if (rows[j].row.type === "task") return rows[j];
  }
  return null;
}

// Whether the summary row's stream is in the collapsed set. Summary ids are
// positional ("s" + stored index); the title keys the collapsed set.
function ganttRowIsCollapsedStream(row) {
  var sidx = ganttStoredStreamIndexForId(row.id);
  if (sidx < 0) return false;
  var streams = loadStreams();
  var title = (streams[sidx] || {}).title || "Untitled stream";
  return ganttCollapsedStreamSet().has(title);
}

// Whether a drop at dropY for jobId would be a NO-OP: the job already sits at
// the resolved position in the same stream (e.g. hovering on the boundary just
// below the job being dragged, which would put it right back where it is).
// Such a target must not be shown and must not be applied. The check mirrors
// ganttPersistRowDrag's insert math AFTER removal, compared to the job's current
// index. A reparent (different target stream) is never a no-op.
function ganttRowDropIsNoop(grid, dropY, jobId, fromStreamIdx) {
  var streams = loadStreams();
  var fromStream = fromStreamIdx >= 0 ? streams[fromStreamIdx] : null;
  if (!fromStream) return false;
  var jobs = fromStream.jobs || [];
  var current = jobs.findIndex(function (j) { return j.id === jobId; });
  if (current < 0) return false;
  var target = ganttRowDropTarget(grid, dropY, jobId);
  if (!target) return false;
  if (target.streamIdx !== fromStreamIdx) return false; // reparent, always valid
  // Simulate removal then insertion, like ganttPersistRowDrag does.
  var others = jobs.filter(function (j) { return j.id !== jobId; });
  var insertAt;
  if (target.anchorJobId === null) {
    insertAt = others.length;
  } else {
    var anchorPos = others.findIndex(function (j) { return j.id === target.anchorJobId; });
    insertAt = anchorPos < 0 ? others.length : (target.after ? anchorPos + 1 : anchorPos);
  }
  insertAt = Math.max(0, Math.min(insertAt, others.length));
  return insertAt === current;
}

// Whether a drop at dropY is a valid, non-noop target that should be shown and
// applied. A null target (e.g. the very first stream header with nothing above
// it, which resolves to no stream) or a no-op position both mean "no target".
function ganttRowDropValid(grid, dropY, jobId, fromStreamIdx) {
  if (ganttRowDropIsNoop(grid, dropY, jobId, fromStreamIdx)) return false;
  return !!ganttRowDropTarget(grid, dropY, jobId);
}

// Applies the drop: move the job to the target stream/position and renumber.
function ganttPersistRowDrag(drag, clientX, clientY) {
  if (drag.kind === "stream") {
    ganttPersistStreamDrag(drag, clientX, clientY);
    return;
  }
  var grid = drag.grid;
  var streams = loadStreams();
  var fromStream = drag.fromStreamIdx >= 0 ? streams[drag.fromStreamIdx] : null;
  if (!fromStream) return;
  var job = (fromStream.jobs || []).find(function (j) { return j.id === drag.jobId; });
  if (!job) return;

  // The drop line is the POINTER's Y position. RevoGrid rows are 30px tall, so
  // resolving by the pointer directly means: to place a job below A2 you only
  // need the cursor at A2's midpoint (the band model's "after" threshold), not
  // a further half-row past it. (A previous version subtracted a grab offset so
  // the line tracked the dragged row's top edge; that made the drag feel
  // sluggish — you had to drag well past the target before it registered.)
  var dropY = clientY;

  // A no-op drop (job back into its own slot) is ignored entirely.
  if (ganttRowDropIsNoop(grid, dropY, drag.jobId, drag.fromStreamIdx)) return;

  var target = ganttRowDropTarget(grid, dropY, drag.jobId);
  if (!target) return;

  // Remove the job from its old stream FIRST; the insert position is recomputed
  // against the array as it stands after removal, so indices cannot shift.
  fromStream.jobs = (fromStream.jobs || []).filter(function (j) { return j.id !== drag.jobId; });

  var toStream = streams[target.streamIdx];
  var toJobs = toStream.jobs || [];
  var insertAt;
  if (target.anchorJobId === null) {
    // no job anchor (should not normally happen) => end of last stream
    insertAt = toJobs.length;
  } else {
    var anchorPos = toJobs.findIndex(function (j) { return j.id === target.anchorJobId; });
    insertAt = anchorPos < 0 ? toJobs.length : (target.after ? anchorPos + 1 : anchorPos);
  }
  insertAt = Math.max(0, Math.min(insertAt, toJobs.length));
  toJobs.splice(insertAt, 0, job);
  toStream.jobs = toJobs;

  // Renumber sequence in both affected streams (the editors do the same).
  if (fromStream === toStream) {
    fromStream.jobs.forEach(function (j, i) { j.sequence = i + 1; });
  } else {
    (fromStream.jobs || []).forEach(function (j, i) { j.sequence = i + 1; });
    toStream.jobs.forEach(function (j, i) { j.sequence = i + 1; });
  }
  ganttCommitStreams(streams);
}

// Resolves a drop point into { streamIdx, anchorJobId, after }. The anchor comes
// from ganttRowAnchor: a JOB anchor inserts before/after that job (by the line's
// position in the row); a SUMMARY anchor (a stream header above the line) means
// "append to the bottom of that stream's jobs", which is how drops after the last
// job or between two closed streams are resolved. Returns null when there is no
// valid target.
function ganttRowDropTarget(grid, dropY, jobId) {
  var anchor = ganttRowAnchor(grid, dropY, jobId);
  if (!anchor) return null;
  if (anchor.row.type === "summary") {
    // The line sits on a stream header; the drop joins the stream ABOVE it by
    // appending to that stream's jobs (the anchor row IS that upper summary row,
    // or the job above resolves to its stream with after=true). Append to the
    // anchor stream's bottom.
    var sidx = ganttStoredStreamIndexForId(anchor.row.id);
    if (sidx < 0) return null;
    return { streamIdx: sidx, anchorJobId: null, after: true };
  }
  var jidx = ganttStoredStreamIndexForTask(anchor.row.id);
  if (jidx < 0) return null;
  var after = dropY >= anchor.mid;
  return { streamIdx: jidx, anchorJobId: anchor.row.id.slice(1), after: after };
}

// Stored stream index for a summary row id ("s" + storedIndex). Summary ids are
// positional and equal the stored array index (see buildGanttTasks).
function ganttStoredStreamIndexForId(id) {
  if (!/^s\d+$/.test(id || "")) return -1;
  var idx = Number(id.slice(1));
  var streams = loadStreams();
  return idx >= 0 && idx < streams.length ? idx : -1;
}

// === STREAM DRAG & DROP ===
//
// Streams are dragged with the same ghost, source-row highlight and drop-target
// edge markers as jobs, but the target is always a STREAM boundary: the top of a
// stream heading, or the very end of the last element (a job in a stream, a
// collapsed stream, or an empty stream). The pointer's position RELATIVE TO THE
// GRAB POINT decides which boundary (see the A/B/C/D rule):
//   - drop point ABOVE the grab point (dragging upward): the drop zone is the
//     TOP of the stream the pointer is on -> insert the dragged stream BEFORE it
//     (so dropping on A, A1..A3 or B, B1..B3 means "above A"/"above B").
//   - drop point BELOW the grab point (dragging downward): the drop zone is the
//     top of the stream AFTER the stream the pointer is on -> insert AFTER it
//     (so dropping on D, D1..D3 means "the end of D").
// Dropping on the dragged stream (or any of its jobs) is invalid, as is any
// target that would not move the stream. Above the first stream = before the
// first stream (move to start); below the last element = after it (move to end).

// The stored stream index whose rendered rows contain dropY. A stream's rows are
// its header row plus its job rows when expanded, so a drop on a job resolves to
// its own stream. The dragged stream's own rows are INCLUDED so hovering over
// them resolves to it (invalid) rather than falling through to a neighbour.
// Returns -1 when nothing is rendered under the line.
function ganttStreamBandUnder(grid, dropY) {
  var seen = {};
  var rows = [];
  document.querySelectorAll("#ganttChart .rgRow").forEach(function (el) {
    var idx = Number(el.getAttribute("data-rgrow"));
    if (isNaN(idx) || seen[idx]) return;
    seen[idx] = true;
    var row = (grid.source || [])[idx];
    if (!row) return;
    var sidx;
    if (row.type === "summary") sidx = ganttStoredStreamIndexForId(row.id);
    else if (row.type === "task") sidx = ganttStoredStreamIndexForTask(row.id);
    else sidx = -1;
    if (sidx < 0) return;
    var rect = el.getBoundingClientRect();
    rows.push({ sidx: sidx, top: rect.top, bottom: rect.bottom });
  });
  rows.sort(function (a, b) { return a.top - b.top; });
  if (!rows.length) return -1;
  for (var i = 0; i < rows.length; i++) {
    if (dropY < rows[i].bottom) return rows[i].sidx;
  }
  return rows[rows.length - 1].sidx; // line below every row -> last row's stream
}

// Resolves a stream drop point into { targetHeaderStream, end, insertAt } or
// null when the drop is invalid or a no-op.
function ganttStreamDropTarget(grid, dropY, grabY, dragStreamIdx) {
  var bandStream = ganttStreamBandUnder(grid, dropY);
  if (bandStream < 0 || bandStream === dragStreamIdx) return null;
  var streams = loadStreams();
  var hidden = ganttHiddenStreamSet();
  var order = streams.map(function (s, i) { return i; })
    .sort(function (a, b) { return (streams[a].sequence || 0) - (streams[b].sequence || 0); });
  var dragPos = order.indexOf(dragStreamIdx);
  if (dragPos < 0) return null;
  var upward = dropY < grabY;
  var others = order.filter(function (i) { return i !== dragStreamIdx; });
  var bandPos = others.indexOf(bandStream);
  var insertAt = bandPos < 0 ? others.length : (upward ? bandPos : bandPos + 1);
  insertAt = Math.max(0, Math.min(insertAt, others.length));
  if (insertAt === dragPos) return null; // no-op: stream would not move
  if (upward) {
    // drop zone = top of the band stream
    return { targetHeaderStream: bandStream, end: false, insertAt: insertAt };
  }
  // downward: drop zone = top of the stream AFTER the band stream. The next
  // stream is taken among VISIBLE streams: streams hidden by the filter render
  // no header row, so anchoring the highlight on one would draw nothing even
  // though the drop persists correctly. If the band stream is the last visible
  // stream (no visible successor), the drop zone is the very end of its last
  // element instead.
  var bandOrderIdx = order.indexOf(bandStream);
  var next = -1;
  for (var i = bandOrderIdx + 1; i < order.length; i++) {
    if (!hidden.has(streams[order[i]].title || "Untitled stream")) { next = order[i]; break; }
  }
  if (next !== -1) return { targetHeaderStream: next, end: false, insertAt: insertAt };
  return { targetHeaderStream: bandStream, end: true, insertAt: insertAt };
}

// The .rgRow element for a stream's header row, or null if not rendered.
// RevoGrid renders each row in BOTH the pinned (name) and scroll views, so rows
// are deduped by data-rgrow; the pinned instance (which carries the name cell)
// is kept.
function ganttStreamHeaderRowEl(grid, streamIdx) {
  var id = "s" + streamIdx;
  var found = null, seen = {};
  document.querySelectorAll("#ganttChart .rgRow").forEach(function (el) {
    var idx = Number(el.getAttribute("data-rgrow"));
    if (isNaN(idx) || seen[idx]) return;
    seen[idx] = true;
    var row = (grid.source || [])[idx];
    if (row && row.id === id && row.type === "summary") found = el;
  });
  return found;
}

// The bottom-most rendered .rgRow - the last element the user can see: the last
// job of the last stream when expanded, or its header when collapsed/empty.
// Deduped by data-rgrow (the grid renders rows twice: pinned + scroll views).
function ganttLastRenderedRowEl(grid) {
  var found = null, best = -Infinity, seen = {};
  document.querySelectorAll("#ganttChart .rgRow").forEach(function (el) {
    var idx = Number(el.getAttribute("data-rgrow"));
    if (isNaN(idx) || seen[idx]) return;
    seen[idx] = true;
    var r = el.getBoundingClientRect();
    if (r.top > best) { best = r.top; found = el; }
  });
  return found;
}

// Highlights the stream boundary the drop would create, using the SAME two
// classes as the job drag: a top border on the target stream's header row
// (insert before it) or a bottom border on the last element (insert at the very
// end).
function ganttStreamDragHighlight(grid, clientX, clientY) {
  var dropY = clientY;
  var target = ganttStreamDropTarget(grid, dropY, _ganttRowDrag.startY, _ganttRowDrag.streamIdx);
  var highlightEl = null, useAfter = false;
  if (target) {
    if (target.end) {
      highlightEl = ganttLastRenderedRowEl(grid);
      useAfter = true;
    } else {
      highlightEl = ganttStreamHeaderRowEl(grid, target.targetHeaderStream);
      useAfter = false;
    }
  }
  var cls = useAfter ? "pmd-gantt-drop-target--after" : "pmd-gantt-drop-target";
  if (highlightEl === _ganttRowDrag.targetRowEl && cls === _ganttRowDrag.targetAfter) return;
  if (_ganttRowDrag.targetRowEl) _ganttRowDrag.targetRowEl.classList.remove("pmd-gantt-drop-target", "pmd-gantt-drop-target--after");
  _ganttRowDrag.targetRowEl = highlightEl;
  _ganttRowDrag.targetAfter = cls;
  if (highlightEl) highlightEl.classList.add(cls);
}

// Applies the drop: move the WHOLE stream (jobs included) to the target position
// and renumber `sequence` across all streams (the same ordering field the stream
// editor renumbers on a drag).
function ganttPersistStreamDrag(drag, clientX, clientY) {
  var grid = drag.grid;
  var streams = loadStreams();
  var target = ganttStreamDropTarget(grid, clientY, drag.startY, drag.streamIdx);
  if (!target) return;
  var dragged = streams[drag.streamIdx];
  if (!dragged) return;
  var order = streams.map(function (s, i) { return i; })
    .sort(function (a, b) { return (streams[a].sequence || 0) - (streams[b].sequence || 0); });
  var others = order.filter(function (i) { return i !== drag.streamIdx; });
  var insertAt = Math.max(0, Math.min(target.insertAt, others.length));
  var reorderedIdx = others.slice();
  reorderedIdx.splice(insertAt, 0, drag.streamIdx);
  var reordered = reorderedIdx.map(function (i) { return streams[i]; });
  reordered.forEach(function (s, i) { s.sequence = i + 1; });
  ganttCommitStreams(reordered);
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
    "/* No focus/selection chrome. The chart is read-only: clicking a cell must",
    "   not draw the vendor's focus ring (revogr-focus.focused-cell paints a",
    "   1px box-shadow border in --rg-theme-selection-border, which follows",
    "   --bs-primary and reads as a red outline) or the selection range border.",
    "   Hide the focus layer and neutralise the selection colours so a click is",
    "   inert. Cells are not focusable anyway once readonly=true; this just kills",
    "   the visual. */",
    "#ganttPage revo-grid revogr-focus.focused-cell {",
    "  display: none !important;",
    "}",
    "#ganttPage revo-grid .selection-range {",
    "  box-shadow: none;",
    "}",
    "#ganttPage revo-grid .rgCell:focus {",
    "  outline: none;",
    "}",
    "#ganttPage revo-grid revogr-data .rgRow.focused-rgRow {",
    "  background-color: transparent;",
    "}",
    "/* Job names are indented under their stream by the name-column cellTemplate",
    "   (which stamps .pmd-gantt-job-name on task rows). The cell is a flex row, so",
    "   the padding must go on the cell itself - the span inside is the truncating",
    "   line, and padding it would push the ellipsis instead of the text. The",
    "   grab cursor marks the row as draggable (reorder within/across streams via",
    "   ganttBindRowDrag). Stream headers get the same grab affordance, except on",
    "   the collapse toggle button (a real control, not a drag handle). */",
    "#ganttPage revo-grid .pmd-gantt-job-name {",
    "  padding-left: 1.5rem;",
    "  cursor: grab;",
    "}",
    "#ganttPage revo-grid .pmd-gantt-stream-name {",
    "  cursor: grab;",
    "}",
    "#ganttPage revo-grid .pmd-gantt-job-name:active,",
    "#ganttPage revo-grid .pmd-gantt-stream-name:active {",
    "  cursor: grabbing;",
    "}",
    "#ganttPage revo-grid .pmd-gantt-collapse-toggle {",
    "  cursor: pointer;",
    "}",
    "/* During a row drag the grid carries .pmd-gantt-row-dragging; every job-name",
    "   and stream-name cell then shows the grabbing hand so the cursor does not",
    "   flick back to the grab affordance when the pointer passes over another",
    "   row. !important is required: the names set cursor:grab themselves (and",
    "   :active = grabbing only on the element actually pressed), so without it",
    "   the hovered row's own rule would win mid-drag. */",
    "#ganttPage revo-grid.pmd-gantt-row-dragging,",
    "#ganttPage revo-grid.pmd-gantt-row-dragging .pmd-gantt-job-name,",
    "#ganttPage revo-grid.pmd-gantt-row-dragging .pmd-gantt-job-name:active,",
    "#ganttPage revo-grid.pmd-gantt-row-dragging .pmd-gantt-stream-name,",
    "#ganttPage revo-grid.pmd-gantt-row-dragging .pmd-gantt-stream-name:active,",
    "#ganttPage revo-grid.pmd-gantt-row-dragging revogr-data .rgCell {",
    "  cursor: grabbing !important;",
    "}",
    "/* Drop-target highlight while a job row is being dragged (ganttBindRowDrag).",
    "   The cursor's half of the band row picks the edge: top half inserts BEFORE",
    "   the row (top border), bottom half inserts AFTER it (bottom border) - so",
    "   the highlighted edge is exactly where the job lands. */",
    "#ganttPage revo-grid .rgRow.pmd-gantt-drop-target {",
    "  box-shadow: inset 0 2px 0 var(--rg-gantt-task);",
    "}",
    "#ganttPage revo-grid .rgRow.pmd-gantt-drop-target--after {",
    "  box-shadow: inset 0 -2px 0 var(--rg-gantt-task);",
    "}",
    "/* Highlight the row being dragged in the grid so the source job stays",
    "   visible among the target highlighting. A subtle tint of the theme's",
    "   success (the task-bar colour) keeps it distinct from the drop-target",
    "   edge markers and from the (already disabled) focus highlight. */",
    "#ganttPage revo-grid .rgRow.pmd-gantt-dragging {",
    "  background-color: color-mix(in srgb, var(--rg-gantt-task) 15%, transparent);",
    "}",
    "/* The floating ghost of the dragged job's title. Fixed so it escapes the",
    "   grid's scroll containers; pointer-events:none so it never blocks the",
    "   pointer; a small offset from the cursor so the title is readable next to",
    "   it. The ghost is appended to <body> (outside #ganttPage), so it uses the",
    "   global --bs-* tokens for a SOLID body-surface background and a real",
    "   border, not the --gantt-* tokens (which are scoped to #ganttPage). */",
    ".pmd-gantt-drag-ghost {",
    "  position: fixed;",
    "  left: 0;",
    "  top: 0;",
    "  transform: translate(12px, 10px);",
    "  pointer-events: none;",
    "  z-index: 2000;",
    "  padding: 0.15rem 0.5rem;",
    "  border-radius: 0.25rem;",
    "  border: 1px solid var(--bs-border-color);",
    "  background-color: var(--bs-body-bg);",
    "  color: var(--bs-body-color);",
    "  font: 500 0.875rem/1.2 var(--bs-body-font-family, system-ui, sans-serif);",
    "  white-space: nowrap;",
    "  box-shadow: 0 0.25rem 0.5rem rgba(0, 0, 0, 0.2);",
    "  opacity: 0.95;",
    "}",
    "/* The bar-drag ghost panel (ganttBarGhostUpdate): a small card near the",
    "   cursor showing the dragged bar's Start / End / Duration, reading the LIVE",
    "   dates as the drag progresses. Same fixed + pointer-events:none treatment",
    "   as the row-drag ghost; the label rows are laid out in a column. The ghost",
    "   is appended to <body> (outside #ganttPage), so it CANNOT use the --gantt-*",
    "   tokens defined on #ganttPage - it must use the global --bs-* variables for",
    "   a SOLID body-surface background and a real border, otherwise the text",
    "   floats over the gridlines with no backing panel. */",
    ".pmd-gantt-bar-ghost {",
    "  position: fixed;",
    "  left: 0;",
    "  top: 0;",
    "  transform: translate(12px, 12px);",
    "  pointer-events: none;",
    "  z-index: 2000;",
    "  display: flex;",
    "  flex-direction: column;",
    "  gap: 0.125rem;",
    "  padding: 0.375rem 0.625rem;",
    "  border-radius: 0.375rem;",
    "  border: 1px solid var(--bs-border-color);",
    "  background-color: var(--bs-body-bg);",
    "  color: var(--bs-body-color);",
    "  font: 500 0.8125rem/1.3 var(--bs-body-font-family, system-ui, sans-serif);",
    "  white-space: nowrap;",
    "  box-shadow: 0 0.25rem 0.625rem rgba(0, 0, 0, 0.25);",
    "  opacity: 0.97;",
    "}",
    ".pmd-gantt-bar-ghost-label {",
    "  display: flex;",
    "  gap: 0.375rem;",
    "}",
    ".pmd-gantt-bar-ghost-label::after {",
    "  content: '';",
    "}",
    ".pmd-gantt-bar-ghost-date {",
    "  font-weight: 600;",
    "  color: inherit;",
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
    "   from its nested jobs visually, on top of the indent. The collapse toggle",
    "   sits before the name; it is a bare text button that follows the theme",
    "   text colour. */",
    "#ganttPage revo-grid .pmd-gantt-stream-name {",
    "  font-weight: 600;",
    "}",
    "#ganttPage revo-grid .pmd-gantt-collapse-toggle {",
    "  border: 0;",
    "  background: transparent;",
    "  padding: 0 0.4rem 0 0;",
    "  font: inherit;",
    "  color: inherit;",
    "  cursor: pointer;",
    "  line-height: 1;",
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
    "/* SOLID BAR COLOURS. The vendor paints both bar types with a vertical",
    "   gradient (jobs: --rg-gantt-task -> --rg-gantt-task-strong; streams: a",
    "   hard-coded dark top -> --rg-gantt-summary). The requirement is a flat",
    "   fill: jobs SOLID --bs-success, streams SOLID --bs-danger. Overriding",
    "   `background` (the shorthand) clears the gradient entirely; the bar label",
    "   and drag handles are unaffected. */",
    "#ganttPage .rg-gantt-bar {",
    "  background: var(--bs-success);",
    "}",
    "#ganttPage .rg-gantt-bar--summary {",
    "  background: var(--bs-danger);",
    "}",
    "/* Zoom buttons: the active preset is the theme PRIMARY button colour, the rest",
    "   are SECONDARY. Button text is WHITE, matching Bootstrap's own filled",
    "   `.btn-primary`/`.btn-secondary` (which hardcode `--bs-btn-color: #fff` in",
    "   every theme). The buttons no longer carry `btn-outline-secondary` (that",
    "   class sets `--bs-btn-color` to the grey secondary, which would paint the",
    "   text grey) - the colours are fully owned here. */",
    "#ganttPage .gantt-zoom > .btn {",
    "  background-color: var(--bs-secondary);",
    "  color: #fff;",
    "  border: 1px solid var(--bs-secondary);",
    "}",
    "#ganttPage .gantt-zoom > .btn:hover,",
    "#ganttPage .gantt-zoom > .btn:focus {",
    "  background-color: var(--bs-secondary);",
    "  color: #fff;",
    "  border-color: var(--bs-secondary);",
    "}",
    "#ganttPage .gantt-zoom > .btn.active {",
    "  background-color: var(--bs-primary);",
    "  color: #fff;",
    "  border-color: var(--bs-primary);",
    "  font-weight: 600;",
    "}",
    "/* Undo/Redo buttons: the same solid secondary fill + white text as the zoom",
    "   buttons. Disabled buttons get a muted, non-interactive treatment so an",
    "   empty history reads as inactive rather than looking clickable. */",
    "#ganttPage .gantt-undo-redo > .btn {",
    "  background-color: var(--bs-secondary);",
    "  color: #fff;",
    "  border: 1px solid var(--bs-secondary);",
    "}",
    "#ganttPage .gantt-undo-redo > .btn:hover:not(:disabled),",
    "#ganttPage .gantt-undo-redo > .btn:focus:not(:disabled) {",
    "  background-color: var(--bs-secondary);",
    "  color: #fff;",
    "  border-color: var(--bs-secondary);",
    "}",
    "#ganttPage .gantt-undo-redo > .btn:disabled {",
    "  opacity: 0.4;",
    "  cursor: default;",
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
    "/* The toggle matches the zoom buttons: a SOLID secondary fill with white",
    "   text (the old `btn-outline-secondary` was a dull grey outline that",
    "   vanished on dark themes like superhero light). `.show` state keeps the",
    "   same fill so the button reads as pressed while the menu is open. */",
    "#ganttPage .gantt-stream-toggle {",
    "  background-color: var(--bs-secondary);",
    "  color: #fff;",
    "  border: 1px solid var(--bs-secondary);",
    "}",
    "#ganttPage .gantt-stream-toggle:hover,",
    "#ganttPage .gantt-stream-toggle:focus,",
    "#ganttPage .gantt-stream-toggle.show {",
    "  background-color: var(--bs-secondary);",
    "  color: #fff;",
    "  border-color: var(--bs-secondary);",
    "}",
    "#ganttPage .gantt-stream-menu {",
    "  position: absolute;",
    "  top: 100%;",
    "  right: 0;",
    "  left: auto;",
    "  z-index: 1080;",
    "  min-width: 14rem;",
    "  display: none;",
    "  background-color: var(--bs-dropdown-bg, var(--gantt-surface));",
    "  color: var(--bs-dropdown-link-color, var(--gantt-text));",
    "  border: 1px solid var(--bs-dropdown-border-color, var(--gantt-border));",
    "  border-radius: var(--bs-dropdown-border-radius, 0.375rem);",
    "  box-shadow: var(--bs-dropdown-box-shadow, 0 0.5rem 1rem rgba(0, 0, 0, 0.15));",
    "}",
    "#ganttPage .gantt-stream-menu.show {",
    "  display: block;",
    "}",
    "#ganttPage .gantt-stream-row {",
    "  cursor: pointer;",
    "  color: var(--bs-dropdown-link-color, var(--gantt-text));",
    "}",
    "#ganttPage .gantt-stream-row:hover {",
    "  background-color: var(--bs-dropdown-link-hover-bg, var(--gantt-surface-alt));",
    "  color: var(--bs-dropdown-link-hover-color, var(--gantt-text));",
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
