// PlanMyDay — the streams editor (accordion list + stream edit page).

// THREADS EDITOR
let editingIndex = -1;
let editBuffer = null;
let isNew = false;

var _streamsCloseTimer = null;

function openStreamsEditor() {
  document.getElementById("countdownContainer").classList.add("d-none");
  document.getElementById("settingsPage").classList.add("d-none");
  document.getElementById("imagesEditor").classList.add("d-none");
  document.getElementById("jobSearchEditor").classList.add("d-none");

  const page = document.getElementById("streamsEditor");
  if (_streamsCloseTimer) {
    clearTimeout(_streamsCloseTimer);
    _streamsCloseTimer = null;
  }
  page.classList.remove("d-none");
  renderStreamsEditor();
  page.show();
}

function closeStreamsEditor() {
  const page = document.getElementById("streamsEditor");
  if (page) {
    page.hide();
    clearTimeout(_streamsCloseTimer);
    _streamsCloseTimer = setTimeout(function() {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
  document.getElementById("countdownContainer").classList.remove("d-none");
  editingIndex = -1; editBuffer = null; isNew = false;
  renderMain();
}

var _streamEditCloseTimer = null;

function openStreamEditPage() {
  const streams = loadStreams();
  const t = streams[editingIndex];
  const data = editBuffer || t;
  const page = document.getElementById("streamEditPage");
  if (!page) return;
  page.classList.remove("d-none");
  page.title = isNew ? "Add Stream" : "Edit Stream";
  page.content = getStreamEditFormHTML(data);
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel", id: "btnStreamEditCancel" },
    { text: "OK", variant: "success", action: "done", id: "btnStreamEditOk" }
  ];
  injectStyleInto(page.shadowRoot, JOBS_EDITOR_STYLES);
  page.show();
  updateStreamEditOkBtn();
  if (isNew) {
    const input = $id("streamTitleInput");
    if (input) input.focus();
  }
}

function hideStreamEditPage() {
  const page = document.getElementById("streamEditPage");
  if (page) {
    page.hide();
    clearTimeout(_streamEditCloseTimer);
    _streamEditCloseTimer = setTimeout(function() {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
}

function updateStreamEditOkBtn() {
  const okBtn = $id("btnStreamEditOk");
  const title = $id("streamTitleInput");
  if (okBtn) okBtn.disabled = !title || !title.value.trim();
}

function streamEditSubmit() {
  const okBtn = $id("btnStreamEditOk");
  if (okBtn && !okBtn.disabled) doneEdit();
}

function getStreamEditFormHTML(data) {
  return `
    <div class="mb-2">
      <label class="form-label">Title</label>
      <input class="form-control" id="streamTitleInput" value="${escapeHtml(data.title || "")}" oninput="editField('title', this.value);updateStreamEditOkBtn()" onkeydown="if(event.key==='Enter') streamEditSubmit()">
    </div>
    <div class="mb-2">
      <label class="form-label">Tab</label>
      <select class="form-select" onchange="editField('tab', this.value)">
        <option value="progress" ${(data.tab || "progress") === "progress" ? "selected" : ""}>Progress</option>
        <option value="maintenance" ${data.tab === "maintenance" ? "selected" : ""}>Maintenance</option>
      </select>
    </div>
    <div class="mb-2">
      <label class="form-label">Description</label>
      <textarea class="form-control" rows="3" oninput="editField('description', this.value)">${escapeHtml(data.description || "")}</textarea>
    </div>
    <div class="mb-2">
      <label class="form-label">Image</label>
      <smd-image-select id="streamImageSelect" key-prefix="planmydays_" image="${escapeHtml(data.image || "")}" label-id="streamImageName" button-id="btnStreamImageChoose"></smd-image-select>
    </div>
  `;
}

function renderStreamsEditor() {
  const page = document.getElementById("streamsEditor");
  if (!page || !page.shadowRoot) return;

  // remember which accordion items are expanded (by index; after a drag the
  // captured indices are translated through the reorder so the same stream stays open)
  const streams = loadStreams();
  var expandedStreams = [];
  if (streamsEditorExpandedIdxs !== null) {
    // drag capture (onStart + onEnd) is authoritative: the DOM collapse ids no
    // longer match stream indices once the reorder has been saved
    expandedStreams = streamsEditorExpandedIdxs;
    streamsEditorExpandedIdxs = null;
  } else {
    var openCollapses = page.shadowRoot.querySelectorAll(".accordion-collapse.show");
    for (var ec = 0; ec < openCollapses.length; ec++) {
      var m = openCollapses[ec].id.match(/streamCollapse_(\d+)/);
      if (m) expandedStreams.push(parseInt(m[1]));
    }
  }

  var sorted = [].concat(streams).sort(function(a, b) { return (a.sequence || 0) - (b.sequence || 0); });

  var accordionHtml = "";
  sorted.forEach(function(t, displayIdx) {
    var realIdx = streams.indexOf(t);
    var streamImageName = t.image || "";
    var jobs = t.jobs || [];
    var collapseId = "streamCollapse_" + realIdx;
    var isExpanded = expandedStreams.indexOf(realIdx) !== -1;

    var activeJobs = jobs.filter(function(j) { return j.active !== false; });
    var headerJobCounts = jobs.length > 0
      ? activeJobs.filter(function(j) { return shouldShowJobToday(j); }).length + '/' + activeJobs.length + '/' + jobs.length + ' job' + (jobs.length !== 1 ? 's' : '')
      : "";
    var headerAttrs = [
      'stream-idx="' + realIdx + '"',
      'title="' + escAttr(t.title || "") + '"',
      'tab="' + escAttr(t.tab || "progress") + '"',
      (isExpanded ? 'expanded' : ''),
      (jobs.length === 0 ? 'can-delete' : '')
    ];
    if (streamImageName) headerAttrs.push('image="' + escAttr(streamImageName) + '"');
    if (headerJobCounts) headerAttrs.push('jobcounts="' + escAttr(headerJobCounts) + '"');
    var headerHtml = '<pmd-stream-header ' + headerAttrs.filter(Boolean).join(" ") + '></pmd-stream-header>';

    var bodyHtml = '<div id="' + collapseId + '" class="accordion-collapse collapse' + (isExpanded ? " show" : "") + '">' +
      '<div class="accordion-body stream-accordion-body">' +
        (jobs.length > 0 ? renderJobsInAccordion(t, jobs, realIdx) : '<div class="text-secondary small p-2">No jobs</div>') +
      '</div>' +
    '</div>';

    accordionHtml += '<div class="accordion-item stream-accordion-item stream-drag-card mb-2' + (isExpanded ? " expanded" : "") + '" data-stream-idx="' + realIdx + '">' + headerHtml + bodyHtml + '</div>';
  });

  page.headerHtml = '<span id="editJobsTotalBadge" class="badge bg-info" style="font-size:0.8em;vertical-align:middle"></span>';
  page.content =
    '<div id="streamsEditorHeader">' +
      '<div id="addStreamTileTop" class="mb-3"></div>' +
      '<div id="streamEditorFilters" class="mb-3"></div>' +
    '</div>' +
    '<div id="streamEditorList" class="accordion">' + accordionHtml + '</div>' +
    '<div id="addStreamTile" class="mt-3"></div>' +
    '<div id="singleStreamEditor" class="d-none"></div>';

  page.buttons = [
    { text: "Add Stream", variant: "primary", action: "add", id: "btnAddStream", close: false },
    { text: "Done", variant: "success", action: "done", id: "btnStreamsDone" }
  ];
  page.title = "Edit Streams";

  if (editingIndex >= 0) {
    openStreamEditPage();
  }

  updateEditorJobCountBadges();
  updateNavState();
  injectStreamsEditorStyles();
  initStreamsEditorSortable();
  initStreamJobsSortables();
}

function setStreamExpanded(index, expanded) {
  const page = document.getElementById("streamsEditor");
  if (!page || !page.shadowRoot) return;
  const root = page.shadowRoot;
  const collapseEl = root.getElementById("streamCollapse_" + index);
  const itemEl = collapseEl ? collapseEl.closest(".stream-accordion-item") : null;
  if (expanded) {
    // only one accordion section open at a time
    root.querySelectorAll(".accordion-collapse.show").forEach(function(coll) {
      if (coll === collapseEl) return;
      coll.classList.remove("show");
      const it = coll.closest(".stream-accordion-item");
      if (it) {
        it.classList.remove("expanded");
        const h = it.querySelector("pmd-stream-header");
        if (h) h.removeAttribute("expanded");
      }
    });
  }
  if (collapseEl) collapseEl.classList.toggle("show", expanded);
  if (itemEl) itemEl.classList.toggle("expanded", expanded);
  if (itemEl) {
    const header = itemEl.querySelector("pmd-stream-header");
    if (header) {
      if (expanded) header.setAttribute("expanded", "");
      else header.removeAttribute("expanded");
    }
  }
}

var streamsEditorSortable = null;
var streamsEditorExpandedIdxs = null;

function initStreamsEditorSortable() {
  if (streamsEditorSortable) {
    streamsEditorSortable.destroy();
    streamsEditorSortable = null;
  }
  if (typeof Sortable === "undefined") return;
  var el = $id("streamEditorList");
  if (!el || !el.querySelector(".stream-accordion-item")) return;
  streamsEditorSortable = new Sortable(el, {
    handle: ".stream-accordion-header .drag-handle",
    draggable: ".stream-accordion-item",
    animation: 150,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 0,
    fallbackClass: "sortable-fallback",
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    onStart: function() {
      var idxs = [];
      el.querySelectorAll(".accordion-collapse.show").forEach(function(coll) {
        var m = coll.id.match(/streamCollapse_(\d+)/);
        if (m) idxs.push(parseInt(m[1]));
      });
      streamsEditorExpandedIdxs = idxs.length ? idxs : null;
    },
    onEnd: function() {
      var streams = loadStreams();
      var order = [];
      el.querySelectorAll(".stream-accordion-item").forEach(function(item) {
        var idx = parseInt(item.getAttribute("data-stream-idx"), 10);
        if (!isNaN(idx) && order.indexOf(idx) === -1) order.push(idx);
      });
      if (order.length !== streams.length) return;
      // translate the captured pre-drag indices to their post-reorder positions
      // (order[k] is the old index now sitting at new position k)
      if (streamsEditorExpandedIdxs !== null) {
        var translated = streamsEditorExpandedIdxs.map(function(e) { return order.indexOf(e); })
                     .filter(function(k) { return k !== -1; });
        streamsEditorExpandedIdxs = translated.length ? translated : null;
      }
      var reordered = order.map(function(idx) { return streams[idx]; });
      reordered.forEach(function(s, i) { s.sequence = i + 1; });
      saveStreams(reordered);
      renderStreamsEditor();
    }
  });
}

var streamJobsSortables = [];

function initStreamJobsSortables() {
  streamJobsSortables.forEach(function(s) { if (s) s.destroy(); });
  streamJobsSortables = [];
  if (typeof Sortable === "undefined") return;
  var list = $id("streamEditorList");
  if (!list) return;
  list.querySelectorAll(".accordion-body").forEach(function(body) {
    if (!body.querySelector(".job-drag-card")) return;
    var item = body.closest(".stream-accordion-item");
    if (!item) return;
    streamJobsSortables.push(new Sortable(body, {
      handle: ".job-drag-card .drag-handle",
      draggable: ".job-drag-card",
      animation: 150,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 0,
      fallbackClass: "sortable-fallback",
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      onEnd: function() {
        var streamIdx = parseInt(item.getAttribute("data-stream-idx"), 10);
        if (isNaN(streamIdx)) return;
        var streams = loadStreams();
        var jobs = streams[streamIdx].jobs || [];
        var order = [];
        body.querySelectorAll(".job-drag-card").forEach(function(card) {
          var idx = parseInt(card.getAttribute("data-job-idx"), 10);
          if (!isNaN(idx) && order.indexOf(idx) === -1) order.push(idx);
        });
        if (order.length !== jobs.length) return;
        var reordered = order.map(function(idx) { return jobs[idx]; });
        reordered.forEach(function(j, i) { j.sequence = i + 1; });
        streams[streamIdx].jobs = reordered;
        saveStreams(streams);
        renderStreamsEditor();
      }
    }));
  });
}

function renderJobsInAccordion(stream, jobs, streamIdx) {
  return jobs.map(function(j, realIdx) {
    var scheduleText = getScheduleText(j.schedule);
    var jobImageName = j.image || "";
    var hasSleep = j.sleepUntil && j.sleepUntil.trim();
    var hasWait = j.waitFor && j.waitFor.trim();
    var suffix = (getJobSuffix(j) || "").trim();
    var extra = "";
    if (hasSleep) extra = "Sleep: " + formatDate(j.sleepUntil);
    else if (hasWait) extra = "Wait: " + j.waitFor.trim();
    var attrs = [
      'stream-idx="' + streamIdx + '"',
      'job-idx="' + realIdx + '"',
      'title="' + escAttr(j.title || "") + '"',
      'schedule="' + escAttr(scheduleText) + '"',
      'active="' + (j.active !== false ? "true" : "false") + '"'
    ];
    if (jobImageName) attrs.push('image="' + escAttr(jobImageName) + '"');
    if (j.time && j.time.trim()) attrs.push('time="' + escAttr(j.time.trim()) + '"');
    if (suffix) attrs.push('suffix="' + escAttr(suffix) + '"');
    if (extra) attrs.push('extra="' + escAttr(extra) + '"');
    return '<div class="job-drag-card" data-job-idx="' + realIdx + '">' +
      '<pmd-stream-job-card ' + attrs.join(" ") + '>' +
        '<div class="drag-handle" title="drag" slot="drag-handle">&#9776;</div>' +
      '</pmd-stream-job-card>' +
    '</div>';
  }).join("");
}

function addNewJobForStream(streamIdx) {
  jobsStreamIndex = streamIdx;
  addNewJob();
}
function editJobInAccordion(streamIdx, jobIdx) {
  jobsStreamIndex = streamIdx;
  editJob(jobIdx);
}
function confirmDeleteJobInAccordion(streamIdx, jobIdx) {
  jobsStreamIndex = streamIdx;
  confirmDeleteJob(jobIdx);
}

function editField(field, value) {
  if (!editBuffer) return;
  editBuffer[field] = value;
}

function editStream(index) {
  var streams = loadStreams();
  editBuffer = JSON.parse(JSON.stringify(streams[index]));
  editingIndex = index; isNew = false;
  openStreamEditPage();
}

function cancelEdit() {
  hideStreamEditPage();
  if (isNew && editingIndex >= 0) {
    var streams = loadStreams();
    streams.splice(editingIndex, 1);
    saveStreams(streams);
  }
  editingIndex = -1; editBuffer = null; isNew = false;
  renderStreamsEditor();
}

function doneEdit() {
  if (editingIndex >= 0 && editBuffer) {
    var streams = loadStreams();
    streams[editingIndex] = editBuffer;
    saveStreams(streams);
  }
  hideStreamEditPage();
  editingIndex = -1; editBuffer = null; isNew = false;
  renderStreamsEditor();
}

function confirmDeleteStream(index) {
  editingIndex = index;
  var streams = loadStreams();
  var stream = streams[index] || {};
  showSmdModal({
    title: "Delete Stream?",
    content: 'Delete stream "' + escapeHtml(stream.title || "") + '"?',
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function(detail) {
      if (detail.action !== "delete") return;
      var s = loadStreams();
      s.splice(index, 1);
      s.forEach(function(t, i) { t.sequence = i + 1; });
      saveStreams(s);
      editingIndex = -1; editBuffer = null; isNew = false;
      renderStreamsEditor();
    }
  });
}

function addNewStream() {
  var streams = loadStreams();
  var seq = streams.length + 1;
  var newStream = { title: "", sequence: seq, description: "", jobs: [], tab: "progress" };
  streams.push(newStream);
  saveStreams(streams);
  editBuffer = JSON.parse(JSON.stringify(newStream));
  editingIndex = streams.length - 1; isNew = true;
  openStreamEditPage();
}
