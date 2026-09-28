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
  page.content = '<div id="ganttChart" style="position:relative;min-height:60vh"></div>';
  page.buttons = [{ text: "Close", variant: "secondary", action: "close" }];
}

// Derives the jsGantt task list from the stored streams. Streams are group rows
// (pGroup: 1); jobs are children (pParent = the group's numeric id). Dates are
// "YYYY-MM-DD", which is the library's default input format. Nothing here writes
// to storage — the whole chart is a read-only projection.
function buildGanttTasks(streams, todayStr) {
  const items = [];
  let id = 1;
  const ordered = (streams || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  ordered.forEach((stream) => {
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
        pName: job.title || "Untitled job",
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
