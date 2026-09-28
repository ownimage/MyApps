// PlanMyDay — drag & drop for the Gantt page.
//
// The chart itself is drawn by the vendored jsgantt-improved library, which has
// NO drag support and must stay a verbatim third-party copy (see AGENTS.md). So
// this file adds the drag behaviour AROUND it, hooking the chart's own
// `afterDraw` event (installed by gantt.js) because the library rebuilds its DOM
// on every Draw() - and its Day/Week/Month selector calls Draw() directly.
//
//  1. BAR DRAG. Each JOB bar gets three pointer zones:
//       left edge   -> moves the start (sleepUntil), the end stays put
//       right edge  -> changes the duration, the start stays put
//       middle      -> moves the whole bar, duration preserved
//     The bar only ever previews; nothing is written until pointerup.
//  2. ROW DRAG. A Sortable over the LEFT task-list pane reorders streams,
//     reorders the jobs within a stream, and moves a job to another stream.
//
// PERSISTENCE CONTRACT: a completed drag is the ONLY thing here that writes.
// Merely opening the Gantt still touches nothing (tests/pmd-gantt.spec.js pins
// that). Row drops are also filter-safe: streams hidden by the Streams dropdown
// are absent from the DOM, so they must never be dropped or resequenced by a
// rebuild that only sees the visible rows.

var _ganttRowSortable = null;
var _ganttDragActive = null;
var _ganttRowDrag = null;

// ---------------------------------------------------------------------------
// Dates. All "YYYY-MM-DD" <-> Date conversion for drag maths goes through UTC,
// so day arithmetic is immune to DST (same reasoning as ganttAddDaysStr).
// ---------------------------------------------------------------------------

function ganttDragPad2(n) {
  return String(n).padStart(2, "0");
}

function ganttDragUtc(ymd) {
  var p = String(ymd).split("-");
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function ganttDragYmdFromUtc(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + "-" + ganttDragPad2(d.getUTCMonth() + 1) + "-" + ganttDragPad2(d.getUTCDate());
}

function ganttDragDiffDays(a, b) {
  return Math.round((ganttDragUtc(b) - ganttDragUtc(a)) / 86400000);
}

function ganttDragAddDays(ymd, n) {
  return ganttDragYmdFromUtc(ganttDragUtc(ymd) + n * 86400000);
}

// A "YYYY-MM-DD" as a LOCAL-midnight Date, matching how the library parses its
// input format (parseDateStr -> new Date(y, m-1, d, 0, 0)). chartRowDateToX()
// works in local dates, so the probe inputs must be local too.
function ganttDragLocalDate(ymd) {
  var p = String(ymd).split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function ganttDragLocalYmd(d) {
  return d.getFullYear() + "-" + ganttDragPad2(d.getMonth() + 1) + "-" + ganttDragPad2(d.getDate());
}

// ---------------------------------------------------------------------------
// Snapping. The grid is the library's own column grid for the current format:
// one column per day / week / month. Rather than re-derive the library's
// (non-linear, month-length dependent) getOffset formula, we ask the library
// itself: chartRowDateToX(date) gives the exact x it draws that date at, and it
// is monotonic. So we build a date <-> x table from the library's own function.
// ---------------------------------------------------------------------------

// Advance a Date by one column of `fmt`.
function ganttDragStepUnit(d, fmt) {
  if (fmt === "week") {
    d.setDate(d.getDate() + 7);
  } else if (fmt === "month") {
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
  } else {
    d.setDate(d.getDate() + 1);
  }
}

// getOffset() returns ceil(...-1), so the very first column boundary is the one
// and only date whose chartRowDateToX() is <= -1 while the next day is >= 0.
// Walking back from the earliest bar (the anchor is always the Monday / week or
// month start on/before it) finds it exactly, for every format.
function ganttDragFindAnchor(probe, minYmd) {
  if (typeof probe !== "function") return null;
  var start = ganttDragLocalDate(minYmd);
  for (var i = 0; i <= 70; i++) {
    var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() - i);
    if (probe(d) <= -1) return d;
  }
  return null;
}

function ganttDragBuildSnap(g, probe, minYmd) {
  var anchor = ganttDragFindAnchor(probe, minYmd);
  if (!anchor) return null;
  var fmt = g.vFormat || "day";
  var maxX = 4000;
  try {
    var table = g.getChartBody().querySelector("table");
    maxX = (table && table.offsetWidth) || g.getChartBody().clientWidth || 4000;
  } catch (e) { /* keep the fallback */ }
  maxX += 200;
  var entries = [];
  var d = new Date(anchor.getTime());
  for (var i = 0; i < 4000; i++) {
    var x = probe(d);
    entries.push({ x: x, date: new Date(d.getTime()) });
    if (x > maxX) break;
    ganttDragStepUnit(d, fmt);
  }
  return { fmt: fmt, entries: entries, probe: probe };
}

// Nearest column boundary to a pixel x (binary search; the table is sorted).
function ganttDragSnapX(snap, x) {
  var es = snap.entries;
  if (!es.length) return null;
  if (x <= es[0].x) return es[0].date;
  var last = es.length - 1;
  if (x >= es[last].x) return es[last].date;
  var lo = 0, hi = last;
  while (hi - lo > 1) {
    var mid = (lo + hi) >> 1;
    if (es[mid].x <= x) lo = mid; else hi = mid;
  }
  return Math.abs(es[lo].x - x) <= Math.abs(es[hi].x - x) ? es[lo].date : es[hi].date;
}

// ---------------------------------------------------------------------------
// Stamping identity onto the library's DOM.
// ---------------------------------------------------------------------------

function ganttDragInjectHandle(row, item) {
  if (!row || row.querySelector("smd-draghandle.gantt-drag-handle")) return;
  // The handle lives in the narrow FIRST (gtasklist) cell, NOT in gtaskname:
  // the name cell's textContent is asserted by the Gantt tests and counted by
  // the filter, and a glyph in there would pollute it. The app's own stylesheet
  // widens that cell into a gutter and shifts the name cell right by the same
  // amount, so the title starts clear of the handle.
  var cell = row.querySelector("td.gtasklist") || row.querySelector("td.gtaskname");
  if (!cell) return;
  cell.classList.add("gantt-drag-cell");
  var handle = document.createElement("smd-draghandle");
  handle.className = "gantt-drag-handle";
  handle.setAttribute("title", item.__isGroup ? "Drag to reorder streams" : "Drag to reorder, or move to another stream");
  cell.appendChild(handle);
}

function ganttDragAttachBar(bar, item, snap) {
  bar.classList.add("gantt-bar-draggable");
  if (!bar.querySelector(".gantt-grip-left")) {
    var gl = document.createElement("div");
    gl.className = "gantt-grip gantt-grip-left";
    var gr = document.createElement("div");
    gr.className = "gantt-grip gantt-grip-right";
    bar.appendChild(gl);
    bar.appendChild(gr);
  }

  // The drag config is stored on the bar; the actual pointerdown is DELEGATED
  // (see ganttDragOnPointerDown) because the library's tooltip can sit on top
  // of the bar and would otherwise swallow the event before it reached a
  // listener attached here.
  bar.__ganttDrag = { item: item, snap: snap };
}

var _ganttBarPointerBound = false;

function ganttDragBindBarPointer() {
  if (_ganttBarPointerBound || typeof document === "undefined") return;
  _ganttBarPointerBound = true;
  // Capture phase on the DOCUMENT: the tooltip is appended outside the chart,
  // so a listener on the chart container would miss it. The bar is found by
  // hit-testing the point rather than trusting e.target.
  document.addEventListener("pointerdown", ganttDragOnPointerDown, true);
}

function ganttDragResolveBar(e) {
  if (document.elementsFromPoint) {
    var stack = document.elementsFromPoint(e.clientX, e.clientY);
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (el && el.__ganttDrag && el.classList && el.classList.contains("gtaskbarcontainer")) return el;
    }
  }
  var t = e.target;
  while (t && t !== document) {
    if (t.__ganttDrag) return t;
    t = t.parentElement;
  }
  return null;
}

function ganttDragOnPointerDown(e) {
  if (e.button !== 0) return;
  var bar = ganttDragResolveBar(e);
  if (!bar || !bar.__ganttDrag) return;
  var cfg = bar.__ganttDrag;
  var item = cfg.item;
  var job = ganttDragFindJob(item.__jobId);
  if (!job) return;

  var rect = bar.getBoundingClientRect();
  var rel = rect.width ? (e.clientX - rect.left) / rect.width : 0.5;
  var mode;
  // A 1-2 day bar is too narrow for three zones, so it keeps the two edges
  // (left half start / right half duration) and loses the middle "move".
  if (rect.width < 48) mode = rel < 0.5 ? "start" : "end";
  else if (rel < 0.25) mode = "start";
  else if (rel > 0.75) mode = "end";
  else mode = "move";

  ganttDragHideTooltip();
  bar.__ganttPointerId = e.pointerId;
  try { bar.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  bar.classList.add("gantt-bar-dragging");
  document.body.classList.add("gantt-dragging");

  _ganttDragActive = {
    bar: bar,
    item: item,
    snap: cfg.snap,
    jobId: item.__jobId,
    mode: mode,
    start0: item.pStart,
    end0: item.pEnd,
    dur0: Math.max(1, ganttDragDiffDays(item.pStart, item.pEnd)),
    probe: cfg.snap.probe,
    startClientX: e.clientX,
    moved: false
  };

  // Commit happens on pointerup.
  function onMove(ev) {
    ganttDragPreview(_ganttDragActive, ev);
  }
  function onUp() {
    cleanup();
    ganttDragFinish();
  }
  function onCancel() {
    cleanup();
    ganttDragAbort();
  }
  function cleanup() {
    bar.removeEventListener("pointermove", onMove);
    bar.removeEventListener("pointerup", onUp);
    bar.removeEventListener("pointercancel", onCancel);
  }
  bar.addEventListener("pointermove", onMove);
  bar.addEventListener("pointerup", onUp);
  bar.addEventListener("pointercancel", onCancel);
  e.preventDefault();
}

// ---------------------------------------------------------------------------
// Bar drag: preview + commit.
// ---------------------------------------------------------------------------

function ganttDragPreview(drag, ev) {
  if (!drag) return;
  var dx = ev.clientX - drag.startClientX;
  if (Math.abs(dx) > 3) drag.moved = true;
  var cellRect = drag.bar.parentElement.getBoundingClientRect();
  var today = getTodayStr();

  var next;
  if (drag.mode === "move") {
    var targetX = drag.probe(ganttDragLocalDate(drag.start0)) + dx;
    var moved = ganttDragSnapX(drag.snap, targetX);
    if (!moved) return;
    var s = ganttDragLocalYmd(moved);
    if (s < today) s = today;            // clamp: a past start means "no sleepUntil"
    next = { start: s, end: ganttDragAddDays(s, drag.dur0) };
  } else if (drag.mode === "start") {
    var xStart = ev.clientX - cellRect.left;
    var snappedStart = ganttDragSnapX(drag.snap, xStart);
    if (!snappedStart) return;
    var ns = ganttDragLocalYmd(snappedStart);
    if (ns < today) ns = today;
    if (ganttDragDiffDays(ns, drag.end0) < 1) return; // keep the bar >= 1 day
    next = { start: ns, end: drag.end0 };
  } else {
    var xEnd = ev.clientX - cellRect.left;
    var snappedEnd = ganttDragSnapX(drag.snap, xEnd);
    if (!snappedEnd) return;
    var ne = ganttDragLocalYmd(snappedEnd);
    if (ganttDragDiffDays(drag.start0, ne) < 1) ne = ganttDragAddDays(drag.start0, 1);
    next = { start: drag.start0, end: ne };
  }

  drag.next = next;
  var left = drag.probe(ganttDragLocalDate(next.start));
  var right = drag.probe(ganttDragLocalDate(next.end));
  drag.bar.style.left = left + "px";
  drag.bar.style.width = Math.max(6, right - left) + "px";
}

function ganttDragFinish() {
  var drag = _ganttDragActive;
  _ganttDragActive = null;
  ganttDragCleanup(drag ? drag.bar : null);
  if (!drag) return;
  if (drag.moved && drag.next) {
    var start = drag.next.start;
    var duration = Math.max(1, ganttDragDiffDays(start, drag.next.end));
    // A start of "today" is stored as no sleepUntil at all: that is what the
    // field means ("do not show before"), and the app clears it if written.
    var sleepUntil = start === getTodayStr() ? "" : start;
    ganttDragApplyBar(drag.jobId, sleepUntil, duration);
  }
  // Re-render either way: after a real drop it recomputes the stream summary
  // spans; after a click/no-op it simply resets the preview.
  renderGantt();
}

function ganttDragAbort() {
  var drag = _ganttDragActive;
  _ganttDragActive = null;
  ganttDragCleanup(drag ? drag.bar : null);
  if (drag) renderGantt();
}

function ganttDragCleanup(bar) {
  if (bar) {
    bar.classList.remove("gantt-bar-dragging");
    try { bar.releasePointerCapture(bar.__ganttPointerId); } catch (e) { /* ignore */ }
  }
  document.body.classList.remove("gantt-dragging");
}

function ganttDragHideTooltip() {
  document.querySelectorAll(".JSGanttToolTip").forEach(function (t) { t.style.display = "none"; });
}

function ganttDragFindJob(jobId) {
  var streams = loadStreams();
  for (var i = 0; i < streams.length; i++) {
    var jobs = streams[i].jobs || [];
    for (var j = 0; j < jobs.length; j++) {
      if (jobs[j].id === jobId) return jobs[j];
    }
  }
  return null;
}

// Writes sleepUntil/duration for one job, but only if something actually
// changed, so a click that snaps back to the same place is a true no-op.
function ganttDragApplyBar(jobId, sleepUntil, duration) {
  var streams = loadStreams();
  for (var i = 0; i < streams.length; i++) {
    var jobs = streams[i].jobs || [];
    for (var j = 0; j < jobs.length; j++) {
      if (jobs[j].id !== jobId) continue;
      var sameStart = (jobs[j].sleepUntil || "") === (sleepUntil || "");
      var sameDur = Number(jobs[j].duration) === Number(duration);
      if (sameStart && sameDur) return false;
      jobs[j].sleepUntil = sleepUntil;
      jobs[j].duration = duration;
      saveStreams(streams);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Row drag: reorder streams, reorder jobs, move a job between streams.
// ---------------------------------------------------------------------------

function ganttDragRowTbody(g) {
  // NOTE: the task ROWS are NOT inside #ganttChartglisthead. drawListHead()
  // creates that div for the header table, but drawListBody() creates the
  // scrolling table as its SIBLING (both children of .gmainleft). So the row
  // tbody has to be found from the left pane, not from getListBody().
  try {
    var body = typeof g.getListBody === "function" ? g.getListBody() : null;
    var scope = body && body.parentElement ? body.parentElement : document;
    return scope.querySelector("table.gtasktable > tbody")
      || document.querySelector("#ganttChart .gmainleft table.gtasktable > tbody");
  } catch (e) {
    return null;
  }
}

function ganttDragBindRowSortable(g) {
  if (_ganttRowSortable) {
    _ganttRowSortable.destroy();
    _ganttRowSortable = null;
  }
  if (typeof Sortable === "undefined") return;
  var tbody = ganttDragRowTbody(g);
  if (!tbody || !tbody.querySelector("tr[data-gantt-kind]")) return;
  _ganttRowSortable = new Sortable(tbody, {
    handle: "smd-draghandle.gantt-drag-handle",
    draggable: "tr[data-gantt-kind]",
    animation: 150,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 0,
    fallbackClass: "gantt-sortable-fallback",
    ghostClass: "gantt-sortable-ghost",
    chosenClass: "gantt-sortable-chosen",
    dragClass: "gantt-sortable-drag",
    onStart: function (evt) {
      // When a STREAM is dragged its jobs travel with it (they are a nested
      // list). Sortable only moves the one row, so ownership is snapshotted
      // BEFORE the drag starts and re-applied on drop - deriving it from the
      // DOM afterwards would rotate jobs between streams.
      ganttDragBeginRowDrag(evt.item);
    },
    onMove: function (evt) {
      // Streams are FLAT: a stream row may only be dropped among stream rows,
      // never inside another stream's jobs.
      if (evt.dragged.getAttribute("data-gantt-kind") === "group") {
        var rel = evt.related;
        if (rel && rel.getAttribute("data-gantt-kind") !== "group") return false;
      }
      return true;
    },
    onEnd: function () {
      // `_ganttRowDrag` is the snapshot captured in onStart. Hand the whole
      // thing to collectRows so a stream drag can ignore DOM adjacency.
      var drag = _ganttRowDrag;
      var entries = ganttDragCollectRows(g, drag);
      ganttDragEndRowDrag();
      if (entries && ganttDragPersistRows(entries)) renderGantt();
    }
  });
}

// Snapshots the row list at the START of a drag.
//
// While Sortable drags a ROW it REMOVES that row from the table's flow and
// re-inserts it when the pointer moves. That means the group rows' positions
// and the job rows' positions shift INDEPENDENTLY, so during (and even just
// after) a drag the "job row follows its stream row" adjacency is broken for
// every stream, not just the dragged one. Deriving ownership from the DOM at
// drop time therefore rotates every stream's jobs onto its neighbour.
//
// So capture the real ownership ONCE, here, before Sortable touches anything:
// stream idx -> [job ids], plus the stream order. The drop then only has to
// learn the new STREAM order from the DOM and re-apply the captured jobs.
function ganttDragBeginRowDrag(row) {
  ganttDragEndRowDrag();
  var g = _ganttChart;
  var tbody = ganttDragRowTbody(g);
  var snap = { kind: "job", order: [], jobsByStream: {}, isStreamDrag: false };

  if (row && tbody) {
    var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr[data-gantt-kind]"));
    var current = null;
    rows.forEach(function (tr) {
      var kind = tr.getAttribute("data-gantt-kind");
      if (kind === "group") {
        current = parseInt(tr.getAttribute("data-gantt-stream-idx"), 10);
        if (!isNaN(current)) {
          if (snap.order.indexOf(current) === -1) snap.order.push(current);
          if (!snap.jobsByStream[current]) snap.jobsByStream[current] = [];
        }
      } else if (kind === "job" && current !== null) {
        snap.jobsByStream[current].push(tr.getAttribute("data-gantt-job-id"));
      }
    });
  }

  if (row && row.getAttribute("data-gantt-kind") === "group") {
    snap.isStreamDrag = true;
    snap.draggedStreamIdx = parseInt(row.getAttribute("data-gantt-stream-idx"), 10);
    var jobs = [];
    var n = row.nextElementSibling;
    while (n && n.getAttribute("data-gantt-kind") === "job") {
      n.classList.add("gantt-jobs-dragging");
      jobs.push(n);
      n = n.nextElementSibling;
    }
    row.classList.add("gantt-row-ghost");
    snap.jobRows = jobs;
  } else if (row) {
    snap.jobId = row.getAttribute("data-gantt-job-id");
  }

  _ganttRowDrag = snap;
}

function ganttDragEndRowDrag() {
  if (_ganttRowDrag && _ganttRowDrag.jobRows) {
    _ganttRowDrag.jobRows.forEach(function (row) {
      row.classList.remove("gantt-jobs-dragging");
    });
  }
  _ganttRowDrag = null;
  if (typeof document !== "undefined") {
    document.querySelectorAll("#ganttChart tr.gantt-row-ghost").forEach(function (row) {
      row.classList.remove("gantt-row-ghost");
    });
  }
}

// Reads the LEFT pane's rows into the ordered description the save consumes.
//
//  * STREAM drag: only the order of the GROUP rows is read from the DOM (that
//    is what the user changed). Ownership comes from the snapshot taken at drag
//    start, so a stream keeps exactly the jobs it had.
//  * JOB drag: the DOM move IS the move, so adjacency is authoritative here -
//    the dragged job row now sits under its new stream's group row. Every other
//    stream's jobs come from the snapshot so they cannot drift either.
function ganttDragCollectRows(g, drag) {
  var tbody = ganttDragRowTbody(g);
  if (!tbody) return null;
  var entries = [];

  if (drag && drag.jobsByStream) {
    var byStream = drag.jobsByStream;
    var groupOrder = [];
    tbody.querySelectorAll('tr[data-gantt-kind="group"]').forEach(function (tr) {
      var idx = parseInt(tr.getAttribute("data-gantt-stream-idx"), 10);
      if (!isNaN(idx)) groupOrder.push(idx);
    });
    if (drag.isStreamDrag) {
      groupOrder.forEach(function (idx) {
        entries.push({ kind: "group", streamIdx: idx });
        (byStream[idx] || []).forEach(function (jobId) {
          entries.push({ kind: "job", streamIdx: idx, jobId: jobId });
        });
      });
      return entries;
    }
    // A job drag: read the new parent from adjacency for the dragged job, and
    // keep the snapshot for everything else.
    var draggedJobId = drag.jobId;
    var draggedTarget = null;
    var current = null;
    tbody.querySelectorAll("tr[data-gantt-kind]").forEach(function (tr) {
      var kind = tr.getAttribute("data-gantt-kind");
      if (kind === "group") {
        current = parseInt(tr.getAttribute("data-gantt-stream-idx"), 10);
      } else if (kind === "job" && tr.getAttribute("data-gantt-job-id") === draggedJobId) {
        if (!isNaN(current)) draggedTarget = current;
      }
    });
    groupOrder.forEach(function (idx) {
      entries.push({ kind: "group", streamIdx: idx });
      var ids = (byStream[idx] || []).filter(function (id) { return id !== draggedJobId; });
      if (idx === draggedTarget) {
        // Insert the dragged job where it now sits among that stream's rows.
        var pos = ganttDragJobPositionWithin(tbody, idx, draggedJobId);
        ids.splice(pos, 0, draggedJobId);
      }
      ids.forEach(function (jobId) {
        entries.push({ kind: "job", streamIdx: idx, jobId: jobId });
      });
    });
    return entries;
  }

  // Fallback (no snapshot): positional reading, used when collectRows is called
  // directly (e.g. from a test).
  var cur = null;
  tbody.querySelectorAll("tr[data-gantt-kind]").forEach(function (tr) {
    var kind = tr.getAttribute("data-gantt-kind");
    if (kind === "group") {
      cur = parseInt(tr.getAttribute("data-gantt-stream-idx"), 10);
      if (!isNaN(cur)) entries.push({ kind: "group", streamIdx: cur });
    } else if (kind === "job") {
      var idx2 = cur;
      if (idx2 === null || isNaN(idx2)) idx2 = parseInt(tr.getAttribute("data-gantt-stream-idx"), 10);
      entries.push({ kind: "job", streamIdx: idx2, jobId: tr.getAttribute("data-gantt-job-id") });
    }
  });
  return entries;
}

// Index of a job row among the job rows that follow a given stream's group row.
function ganttDragJobPositionWithin(tbody, streamIdx, jobId) {
  var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr[data-gantt-kind]"));
  var seenGroup = false;
  var pos = 0;
  for (var i = 0; i < rows.length; i++) {
    var tr = rows[i];
    var kind = tr.getAttribute("data-gantt-kind");
    if (kind === "group") {
      seenGroup = parseInt(tr.getAttribute("data-gantt-stream-idx"), 10) === streamIdx;
      continue;
    }
    if (seenGroup && kind === "job") {
      if (tr.getAttribute("data-gantt-job-id") === jobId) return pos;
      pos++;
    }
  }
  return pos;
}

// Applies an ordered row description to storage. Exported (a global) so tests
// can exercise the filter-safety directly.
//
// CRITICAL: only streams present in `entries` (the VISIBLE ones) are
// resequenced/rebuilt. Streams hidden by the Streams dropdown keep their stored
// sequence and array slot, and then act as anchors when the whole array is
// re-sorted, so a hidden stream is never deleted or silently relocated.
function ganttDragPersistRows(entries) {
  if (!entries || !entries.length) return false;
  var streams = loadStreams();
  var jobsByIdx = {};
  var order = [];
  var current = null;
  // The set of job ids the DOM actually showed. The "keep anything the DOM did
  // not show" safety net below must consult THIS, not one stream's list: a job
  // moved to another stream is present under its NEW stream, and re-adding it
  // to its OLD stream would silently undo the move.
  var seen = {};
  entries.forEach(function (e) {
    if (e.kind === "group") {
      current = e.streamIdx;
      order.push(current);
      if (!jobsByIdx[current]) jobsByIdx[current] = [];
    } else if (e.kind === "job" && current !== null) {
      jobsByIdx[current].push(e.jobId);
      if (e.jobId) seen[e.jobId] = true;
    }
  });

  var changed = false;
  // A job moved to another stream is not in that stream's CURRENT jobs array, so
  // resolve ids against a map of EVERY job across all streams.
  var allById = {};
  streams.forEach(function (s) {
    (s.jobs || []).forEach(function (j) { allById[j.id] = j; });
  });
  order.forEach(function (idx, i) {
    var stream = streams[idx];
    if (!stream) return;
    if ((stream.sequence || 0) !== i + 1) changed = true;
    stream.sequence = i + 1;
    var all = stream.jobs || [];
    var ordered = jobsByIdx[idx].map(function (id) { return allById[id]; }).filter(Boolean);
    // A job absent from the entire DOM (should not happen) is kept, not dropped.
    all.forEach(function (j) { if (!seen[j.id] && ordered.indexOf(j) === -1) ordered.push(j); });
    ordered.forEach(function (j, k) { if ((j.sequence || 0) !== k + 1) changed = true; j.sequence = k + 1; });
    stream.jobs = ordered;
  });

  // Stable-sort ALL streams by sequence (hidden ones keep their old number as
  // an anchor) and renumber so there are no collisions.
  var sorted = streams.slice().sort(function (a, b) { return (a.sequence || 0) - (b.sequence || 0); });
  sorted.forEach(function (s, i) { s.sequence = i + 1; });
  saveStreams(sorted);
  return changed;
}

// ---------------------------------------------------------------------------
// Entry point, called from gantt.js's afterDraw on EVERY draw.
// ---------------------------------------------------------------------------

function ganttBindDragDrop(g, items) {
  if (!g) return;
  ganttDragInjectStyles();
  ganttDragBindBarPointer();
  // The library HASHES each pID into the DOM element ids (hashKey), so the app's
  // own pID is not usable as a DOM handle. Bind through the library's task
  // objects instead: getList() is populated in the same order the items were
  // added, and each task exposes its rows and bar directly.
  var list = typeof g.getList === "function" ? g.getList() : null;
  if (!items || !items.length || !list || !list.length) {
    ganttDragBindRowSortable(g);
    return;
  }

  // chartRowDateToX closes over `this`, so it MUST be called with the chart as
  // the receiver - bind it once here.
  var probe = typeof g.chartRowDateToX === "function" ? g.chartRowDateToX.bind(g) : null;

  var minYmd = getTodayStr();
  items.forEach(function (it) {
    if (!it.__isGroup && it.pStart && it.pStart < minYmd) minYmd = it.pStart;
  });
  var snap = probe ? ganttDragBuildSnap(g, probe, minYmd) : null;

  items.forEach(function (it, k) {
    var task = list[k];
    if (!task) return;
    var row = typeof task.getListChildRow === "function" ? task.getListChildRow() : null;
    if (row) {
      row.setAttribute("data-gantt-kind", it.__isGroup ? "group" : "job");
      row.setAttribute("data-gantt-stream-idx", String(it.__streamIdx));
      if (it.__isGroup) {
        row.setAttribute("data-gantt-stream-title", it.__streamTitle || "");
      } else {
        row.setAttribute("data-gantt-job-id", it.__jobId || "");
      }
      ganttDragInjectHandle(row, it);
    }
    if (!it.__isGroup && snap) {
      var bar = typeof task.getBarDiv === "function" ? task.getBarDiv() : null;
      if (bar) ganttDragAttachBar(bar, it, snap);
    }
  });

  ganttDragBindRowSortable(g);
}

// ---------------------------------------------------------------------------
// Styles. Injected once, id-guarded alongside the theme/layout blocks in
// gantt.js (the vendored stylesheet is never edited).
// ---------------------------------------------------------------------------

function ganttDragInjectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("pmd-gantt-drag-style")) return;
  var s = document.createElement("style");
  s.id = "pmd-gantt-drag-style";
  s.textContent = [
    "/* Row drag handle. The gutter cell stays narrow and borderless so the handle",
    "   reads as a rail at the very left of the row; the handle overflows it to",
    "   the right (see text-indent on .gtaskname div in gantt.js, which shifts",
    "   the row text clear of the glyph without widening the Name column). */",
    "#ganttPage td.gantt-drag-cell {",
    "  position: relative;",
    "  overflow: visible;",
    "  padding: 0;",
    "  border-left: none;",
    "  border-right: none;",
    "}",
    "#ganttPage td.gantt-drag-cell + td.gtaskname { border-left: none; }",
    "#ganttPage smd-draghandle.gantt-drag-handle {",
    "  position: absolute;",
    "  left: 4px;",
    "  top: 50%;",
    "  transform: translateY(-50%);",
    "  cursor: grab;",
    "  opacity: 0.45;",
    "  z-index: 4;",
    "  touch-action: none;",
    "}",
    "#ganttPage smd-draghandle.gantt-drag-handle:hover { opacity: 1; }",
    "/* While a STREAM row is dragged its job rows collapse away so the list",
    "   reads as a plain list of streams; the fallback ghost carries the jobs, so",
    "   they are still visible as travelling with the stream. (The rows are only",
    "   visually collapsed - the drag still reads their stamps by identity.) */",
    "#ganttPage tr.gantt-jobs-dragging { display: none; }",
    "#ganttPage tr.gantt-row-ghost td {",
    "  background-color: var(--bs-secondary-bg-subtle);",
    "  box-shadow: inset 3px 0 0 var(--bs-primary, #0d6efd);",
    "}",
    "/* Bar drag. touch-action:none is required or a touch drag scrolls the",
    "   chart instead of moving the bar. */",
    "#ganttPage .gtaskbarcontainer.gantt-bar-draggable {",
    "  cursor: grab;",
    "  touch-action: none;",
    "}",
    "#ganttPage .gantt-bar-dragging { opacity: 0.75; cursor: grabbing; }",
    "#ganttPage .gantt-grip {",
    "  position: absolute;",
    "  top: 0;",
    "  bottom: 0;",
    "  width: 25%;",
    "  max-width: 8px;",
    "  z-index: 3;",
    "  cursor: ew-resize;",
    "  opacity: 0;",
    "  transition: opacity 0.1s linear;",
    "}",
    "#ganttPage .gtaskbarcontainer:hover .gantt-grip { opacity: 1; }",
    "#ganttPage .gantt-grip-left { left: 0; }",
    "#ganttPage .gantt-grip-right { right: 0; }",
    "#ganttPage .gantt-grip::before {",
    "  content: \"\";",
    "  position: absolute;",
    "  top: 1px;",
    "  bottom: 1px;",
    "  width: 2px;",
    "  background: var(--bs-primary, #0d6efd);",
    "  border-radius: 1px;",
    "}",
    "#ganttPage .gantt-grip-left::before { left: 1px; }",
    "#ganttPage .gantt-grip-right::before { right: 1px; }",
    "body.gantt-dragging { cursor: ew-resize; -webkit-user-select: none; user-select: none; }",
    "/* Sortable feedback, matching the streams editor's vocabulary. */",
    ".gantt-sortable-ghost { opacity: 0.4; }",
    ".gantt-sortable-fallback { opacity: 0.9; }"
  ].join("\n");
  (document.head || document.documentElement).appendChild(s);
}

// Escape cancels an in-flight bar drag (no write).
if (typeof document !== "undefined") {
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && _ganttDragActive) ganttDragAbort();
  });
}
