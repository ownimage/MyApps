// DEV MODE
window.isDevMode = new URLSearchParams(window.location.search).get("dev") === "true";

// PlanMyDayApp — the Plan My Day app, extending the shared SmdApp base class.
// Configuring the storage prefix here means every shared service (theme engine,
// images store, minio backup) reads/writes "planmydays_*" keys via SmdConfig.
class PlanMyDayApp extends SmdApp {
  constructor() {
    super({
      storagePrefix: "planmydays_",
      themeDefault: "darkly",
      appName: "Plan My Day"
    });
    this.renderMain = renderMain;
    this.renderStreamsEditor = renderStreamsEditor;
    this.renderImagesEditor = renderImagesEditor;
    this.renderSearchJobs = renderSearchJobs;
    this.openSettings = openSettings;
    this.closeSettings = closeSettings;
    this.openStreamsEditor = openStreamsEditor;
    this.closeStreamsEditor = closeStreamsEditor;
    this.openSearchJobs = openSearchJobs;
    this.closeSearchJobs = closeSearchJobs;
  }
}

function getTodayDate() {
  const dev = localStorage.getItem("devToday");
  return dev ? new Date(dev + "T00:00:00") : new Date();
}
function getTodayStr() {
  const d = getTodayDate();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function getStoredLastGen() {
  if (isDevMode) {
    const dev = localStorage.getItem("devLastGen");
    if (dev) return dev;
  }
  return localStorage.getItem(smdKey("last_gen"));
}

// STORAGE HELPERS
function loadStreams() {
  const streams = JSON.parse(localStorage.getItem(smdKey("streams")) || "[]");
  let nextId = Date.now();
  let changed = false;
  streams.forEach(t => {
    (t.jobs || []).forEach(j => {
      if (!j.id) { j.id = "job_" + (nextId++); changed = true; }
    });
  });
  if (changed) saveStreams(streams);
  return streams;
}
function saveStreams(streams) {
  localStorage.setItem(smdKey("streams"), JSON.stringify(streams));
}

// JOB COMPLETION STORAGE
function loadCompletedJobs() {
  const data = localStorage.getItem(smdKey("completed"));
  return data ? JSON.parse(data) : [];
}
function saveCompletedJobs(ids) {
  localStorage.setItem(smdKey("completed"), JSON.stringify(ids));
}

// TODAY PAGE ORDER
function loadTodayOrder() {
  const data = localStorage.getItem(smdKey("today_order"));
  return data ? JSON.parse(data) : null;
}
function saveTodayOrder(order) {
  localStorage.setItem(smdKey("today_order"), JSON.stringify(order));
}

// MAIN PAGE RENDER
function addScheduleJobsToOrder(order) {
  const streams = loadStreams();
  const existing = new Set(order);
  const jobMap = {};
  streams.forEach(t => {
    (t.jobs || []).forEach(j => {
      jobMap[j.id] = j;
      if (j.active !== false && shouldShowJobToday(j) && !existing.has(j.id)) {
        order.push(j.id);
        existing.add(j.id);
      }
    });
  });
  order.sort((a, b) => {
    const ta = jobMap[a]?.time;
    const tb = jobMap[b]?.time;
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return ta.localeCompare(tb);
  });
  return order;
}

function ensureTodayList() {
  const today = getTodayStr();
  const lastGen = getStoredLastGen();
  const existingOrder = loadTodayOrder();
  if (lastGen === today && existingOrder) return;

  if (!existingOrder) {
    const order = addScheduleJobsToOrder([]);
    saveTodayOrder(order);
    saveCompletedJobs([]);
    localStorage.setItem(smdKey("last_gen"), today);
    return;
  }

  // date changed: carry over uncompleted + add new schedule-matching jobs
  const completed = loadCompletedJobs();
  const carried = existingOrder.filter(id => !completed.includes(id));
  const merged = addScheduleJobsToOrder(carried);
  saveTodayOrder(merged);
  saveCompletedJobs([]);
  localStorage.setItem(smdKey("last_gen"), today);
}

function renderMain() {
  const container = document.getElementById("countdownContainer");
  if (!container) return;
  container.innerHTML = "";

  const now = getTodayDate();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateStr = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}, ${now.getFullYear()}`;

  const headingRow = document.createElement("div");
  headingRow.className = "d-flex align-items-center gap-2 mb-3 flex-shrink-0";
  const dateHeading = document.createElement("h2");
  dateHeading.className = "mb-0";
  dateHeading.textContent = dateStr;
  headingRow.appendChild(dateHeading);
  const addBtn = document.createElement("button");
  addBtn.className = "btn btn-primary editor-btn ms-auto";
  addBtn.id = "btnAddCard";
  addBtn.innerHTML = "&#43; Add Job";
  addBtn.onclick = function() { addTodayCardWithModal(); };
  headingRow.appendChild(addBtn);
  container.appendChild(headingRow);

  ensureTodayList();

  const streams = loadStreams();
  const completed = loadCompletedJobs();
  const todayOrder = loadTodayOrder() || [];
  const todaySet = new Set(todayOrder);

  const allJobs = [];
  streams.forEach((t, streamIdx) => {
    (t.jobs || []).forEach((j, jobIdx) => {
      if (j.active !== false && todaySet.has(j.id) && shouldShowJobToday(j)) {
        allJobs.push({ job: j, streamTitle: t.title, streamIdx, jobIdx });
      }
    });
  });

  const orderMap = {};
  todayOrder.forEach((id, i) => { orderMap[id] = i; });
  allJobs.sort((a, b) => (orderMap[a.job.id] !== undefined ? orderMap[a.job.id] : 999) - (orderMap[b.job.id] !== undefined ? orderMap[b.job.id] : 999));

  if (localStorage.getItem(smdKey("hideDone")) === "true") {
    const filtered = allJobs.filter(({ job }) => !completed.includes(job.id));
    if (filtered.length === 0 && allJobs.length > 0) {
      const msg = document.createElement("p");
      msg.className = "text-secondary";
      msg.textContent = "All jobs completed!";
      container.appendChild(msg);
      updateNavState();
      return;
    }
    allJobs.length = 0; allJobs.push(...filtered);
  }

  const splitList = localStorage.getItem(smdKey("splitList")) === "true";
  const tab = container.dataset.todayTab || "progress";
  let matchingStreams = null;

  if (splitList) {
    const tabWrapper = document.createElement("div");
    tabWrapper.className = "mb-3 flex-shrink-0";
    const tabsEl = document.createElement("smd-tabs");
    tabsEl.id = "todayTabs";
    tabsEl.tabs = [
      { title: "Progress", content: "" },
      { title: "Maintenance", content: "" }
    ];
    tabsEl.activeIndex = tab === "maintenance" ? 1 : 0;
    const hidePanels = document.createElement("style");
    hidePanels.textContent = ".smd-tab-panel { display: none !important; }";
    tabsEl.shadowRoot.appendChild(hidePanels);
    tabsEl.addEventListener("smd-tabs-change", function(e) {
      const tabTitle = e.detail && e.detail.tab ? (e.detail.tab.title || "") : "";
      container.dataset.todayTab = tabTitle.toLowerCase() === "maintenance" ? "maintenance" : "progress";
      renderMain();
    });
    tabWrapper.appendChild(tabsEl);
    container.appendChild(tabWrapper);

    matchingStreams = new Set();
    allJobs.forEach(({ streamIdx }) => {
      const s = streams[streamIdx];
      if ((s.tab || "progress") === tab) matchingStreams.add(streamIdx);
    });
  }

  const scrollBody = document.createElement("div");
  scrollBody.id = "countdownScrollBody";
  container.appendChild(scrollBody);

  const cardContainer = document.createElement("div");
  cardContainer.id = "todayCardList";

  if (allJobs.length === 0) {
    const msg = document.createElement("p");
    msg.className = "text-secondary";
    msg.textContent = splitList ? "No jobs in this tab." : "No active jobs yet. Add streams with active jobs to get started.";
    scrollBody.appendChild(msg);
    updateNavState();
    return;
  }

  if (splitList && allJobs.every(({ streamIdx }) => !matchingStreams.has(streamIdx))) {
    const msg = document.createElement("p");
    msg.className = "text-secondary";
    msg.textContent = "No jobs in this tab.";
    scrollBody.appendChild(msg);
  }

  allJobs.forEach(({ job, streamTitle, streamIdx, jobIdx }) => {
    const isDone = completed.includes(job.id);
    const streams = loadStreams();
    const stream = streams[streamIdx] || {};
    const streamImageName = stream.image || "";
    const jobImageName = job.image || "";
    const suffixLabel = getJobSuffix(job);
    const card = document.createElement("div");
    card.className = `card countdown-card mb-2 today-drag-card ${isDone ? "opacity-50" : ""}`;
    card.dataset.jobId = job.id;
    card.dataset.streamIdx = streamIdx;
    if (matchingStreams && !matchingStreams.has(streamIdx)) card.hidden = true;
    card.innerHTML = `
      <div class="row align-items-center">
        <div class="col-auto d-flex align-items-center">
          <div class="drag-handle" style="cursor:grab;line-height:1;display:flex;align-items:center">&#9776;</div>
          <div class="form-check mb-0 ms-1 pe-0 d-flex align-items-center" style="min-height:0;padding-left:0">
            <input class="form-check-input job-checkbox m-0 position-static" type="checkbox" data-job-id="${escapeHtml(job.id)}" ${isDone ? "checked" : ""}>
          </div>
        </div>
        <div class="col-auto d-flex align-items-center gap-1 px-0" style="min-width:68px">
          <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center">${streamImageName ? `<smd-image key-prefix="planmydays_" image="${escapeHtml(streamImageName)}" size="32"></smd-image>` : ""}</div>
          <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center">${jobImageName ? `<smd-image key-prefix="planmydays_" image="${escapeHtml(jobImageName)}" size="32"></smd-image>` : ""}</div>
        </div>
        <div class="col" style="min-width:0">
          <div class="d-flex align-items-center gap-2 mb-1">
            <h4 class="mb-0" style="${isDone ? 'text-decoration:line-through' : ''}">${escapeHtml(job.title)}${suffixLabel ? ` <span class="badge bg-secondary">${escapeHtml(suffixLabel.trim())}</span>` : ""}</h4>
          </div>
          <div class="d-flex justify-content-between align-items-center position-relative">
            <span class="small">${escapeHtml(streamTitle)}</span>
            <button class="btn btn-primary position-absolute start-50 translate-middle-x job-view-btn" onclick="viewJobReadOnly(${streamIdx}, ${jobIdx})" title="View job" style="padding:0.35em 0.65em;font-size:0.75em;line-height:1;font-weight:700">View</button>
            <span class="badge rounded-pill bg-${(stream.tab || "progress") === "progress" ? "success" : "info"}">${escapeHtml(stream.tab || "progress")}</span>
          </div>
          ${job.description ? `<div class="mt-1 text-secondary small">${escapeHtml(job.description)}</div>` : ""}
        </div>
      </div>
    `;
    cardContainer.appendChild(card);
  });

  scrollBody.appendChild(cardContainer);

  // checkbox change handler
  container.querySelectorAll(".job-checkbox").forEach(cb => {
    cb.addEventListener("change", function() {
      const jobId = this.dataset.jobId;
      const card = this.closest(".today-drag-card");
      if (this.checked) {
        const streamIdx = card ? parseInt(card.dataset.streamIdx) : -1;
        const streams = loadStreams();
        const stream = streams[streamIdx];
        if (stream && stream.title === "Ad Hoc") {
          const skipConfirm = localStorage.getItem(smdKey("skipAdhocConfirm")) === "true";
          if (!skipConfirm) {
            const job = (stream.jobs || []).find(j => j.id === jobId);
            const cbRef = this;
            showSmdModal({
              title: "Remove from Ad Hoc?",
              content: `Remove "<strong>${escapeHtml(job?.title || jobId)}</strong>" from Ad Hoc?`,
              buttons: [
                { text: "Cancel", variant: "secondary", action: "cancel" },
                { text: "Remove", variant: "danger", action: "remove" }
              ],
              onAction: (detail) => {
                if (detail.action === "remove") removeAdhocJob(streamIdx, jobId, cbRef);
                else cbRef.checked = false;
              }
            });
            return;
          }
          removeAdhocJob(streamIdx, jobId, this);
        } else {
          markJobDone(jobId, this);
        }
      } else {
        let completed = loadCompletedJobs();
        completed = completed.filter(id => id !== jobId);
        saveCompletedJobs(completed);
        if (card) {
          card.classList.toggle("opacity-50", false);
          const titleEl = card.querySelector("h4");
          if (titleEl) titleEl.style.textDecoration = "none";
        }
      }
    });
  });

function removeAdhocJob(streamIdx, jobId, cbRef) {
  const streams = loadStreams();
  const stream = streams[streamIdx];
  if (stream) {
    const jobs = stream.jobs || [];
    const idx = jobs.findIndex(j => j.id === jobId);
    if (idx >= 0) jobs.splice(idx, 1);
    stream.jobs = jobs;
    saveStreams(streams);
  }
  markJobDone(jobId, cbRef);
  renderMain();
}

function markJobDone(jobId, cbRef) {
  let completed = loadCompletedJobs();
  if (!completed.includes(jobId)) completed.push(jobId);
  saveCompletedJobs(completed);
  const card = cbRef.closest(".today-drag-card");
  if (card) {
    card.classList.toggle("opacity-50", true);
    const titleEl = card.querySelector("h4");
    if (titleEl) titleEl.style.textDecoration = "line-through";
  }
}

  updateNavState();
  initTodayCardsSortable();
}

function addTodayCardWithModal() {
  const streams = loadStreams();
  let stream = streams.find(t => t.title === "Ad Hoc");
  if (!stream) {
    stream = { title: "Ad Hoc", sequence: streams.length + 1, jobs: [] };
    streams.push(stream);
    saveStreams(streams);
  }
  const jobs = stream.jobs || [];
  const streamIdx = streams.indexOf(stream);
  jobsStreamIndex = streamIdx;
  const seq = jobs.length + 1;
  const newJob = { id: "job_" + Date.now(), title: "", sequence: seq, description: "", active: true, frequency: "daily", time: "", sleepUntil: "", waitFor: "", schedule: { type: "daily" } };
  jobs.push(newJob);
  stream.jobs = jobs;
  saveStreams(streams);
  jobsBuffer = JSON.parse(JSON.stringify(newJob));
  jobsEditingIdx = jobs.length - 1; isNewJob = true;
  buildJobEditPage(false);
}

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

// JOB SEARCH
var jobSearchQuery = "";
var _jobSearchCloseTimer = null;

function openSearchJobs() {
  document.getElementById("countdownContainer").classList.add("d-none");
  document.getElementById("streamsEditor").classList.add("d-none");
  document.getElementById("settingsPage").classList.add("d-none");
  document.getElementById("imagesEditor").classList.add("d-none");
  const page = document.getElementById("jobSearchEditor");
  page.classList.remove("d-none");
  jobSearchQuery = "";
  buildSearchJobsContent();
  const sjPage = document.getElementById("jobSearchEditor");
  if (sjPage && sjPage.shadowRoot) {
    injectStyleInto(sjPage.shadowRoot, JOBS_EDITOR_STYLES);
  }
  page.show();
  const input = $id("jobSearchInput");
  if (input) input.value = "";
  renderSearchJobs();
  updateNavState();
}

function closeSearchJobs() {
  const page = document.getElementById("jobSearchEditor");
  if (page) {
    page.hide();
    clearTimeout(_jobSearchCloseTimer);
    _jobSearchCloseTimer = setTimeout(function() {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
  document.getElementById("countdownContainer").classList.remove("d-none");
  renderMain();
}

function buildSearchJobsContent() {
  const page = document.getElementById("jobSearchEditor");
  if (!page) return;
  page.title = "Search Jobs";
  page.headerHtml = '<span id="jobSearchTotalBadge" class="badge bg-info" style="font-size:0.8em;vertical-align:middle"></span>';
  page.content =
    '<div id="jobSearchHeader">' +
      '<div id="jobSearchFilters" class="mt-3">' +
        '<div class="row align-items-center">' +
          '<div class="col" style="padding-left:0">' +
            '<input type="search" class="form-control" id="jobSearchInput" placeholder="Search job titles..." oninput="searchJobsFilter()">' +
          '</div>' +
          '<div class="col-auto" style="padding-left:0;padding-right:0">' +
            '<smd-button variant="danger" id="btnJobSearchClear" onclick="clearJobSearchFilter()">Clear</smd-button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div id="jobSearchList"></div>';
  page.buttons = [
    { text: "Add Job", variant: "secondary", action: "add", id: "btnJobSearchAdd", close: false },
    { text: "Done", variant: "success", action: "done", id: "btnJobSearchDone" }
  ];
}

function clearJobSearchFilter() {
  jobSearchQuery = "";
  const input = $id("jobSearchInput");
  if (input) input.value = "";
  renderSearchJobs();
}

function searchJobsFilter() {
  var input = $id("jobSearchInput");
  jobSearchQuery = input ? input.value.trim() : "";
  renderSearchJobs();
}

function addNewJobFromSearch() {
  addTodayCardWithModal();
}

function getJobCountBadgeText(streams) {
  var totalDue = 0, totalActive = 0, totalJobs = 0;
  streams.forEach(function(s) {
    var jbs = s.jobs || [];
    totalDue += jbs.filter(function(j) { return j.active !== false && shouldShowJobToday(j); }).length;
    totalActive += jbs.filter(function(j) { return j.active !== false; }).length;
    totalJobs += jbs.length;
  });
  return totalDue + "/" + totalActive + "/" + totalJobs + " job" + (totalJobs !== 1 ? "s" : "");
}

function updateEditorJobCountBadges() {
  var streams = loadStreams();
  var text = getJobCountBadgeText(streams);
  ["editJobsTotalBadge", "jobSearchTotalBadge"].forEach(function(id) {
    var el = $id(id);
    if (el) el.textContent = text;
  });
  var page = document.getElementById("streamsEditor");
  if (page && page.shadowRoot) {
    page.shadowRoot.querySelectorAll("pmd-stream-header").forEach(function(header) {
      var idx = parseInt(header.getAttribute("stream-idx"), 10);
      if (isNaN(idx) || !streams[idx]) return;
      var jobs = streams[idx].jobs || [];
      var activeJobs = jobs.filter(function(j) { return j.active !== false; });
      var counts = "";
      if (jobs.length > 0) {
        counts = activeJobs.filter(function(j) { return shouldShowJobToday(j); }).length + '/' +
                 activeJobs.length + '/' + jobs.length + ' job' + (jobs.length !== 1 ? 's' : '');
      }
      if (counts) header.setAttribute("jobcounts", counts);
      else header.removeAttribute("jobcounts");
    });
  }
  return text;
}

function renderSearchJobs() {
  const list = $id("jobSearchList");
  if (!list) return;
  const streams = loadStreams();
  updateEditorJobCountBadges();
  const query = jobSearchQuery.toLowerCase();
  const matches = [];
  streams.forEach(function(stream, streamIdx) {
    (stream.jobs || []).forEach(function(job, jobIdx) {
      if (query && !(job.title || "").toLowerCase().includes(query)) return;
      matches.push({ stream, streamIdx, job, jobIdx });
    });
  });
  list.innerHTML = "";
  if (matches.length === 0) {
    list.innerHTML = '<div class="text-secondary small p-2">' + (query ? 'No jobs match "' + escapeHtml(jobSearchQuery) + '".' : "No jobs found.") + '</div>';
    updateNavState();
    return;
  }
  matches.forEach(function(m) {
    list.appendChild(buildJobSearchCard(m.stream, m.streamIdx, m.job, m.jobIdx));
  });
  list.addEventListener("pmd-job-edit", handleJobSearchCardEdit);
  list.addEventListener("pmd-job-toggle-active", handleJobSearchCardToggle);
  updateNavState();
}

function buildJobSearchCard(stream, streamIdx, job, jobIdx) {
  const card = document.createElement("pmd-job-search-card");
  card.dataset.jobId = job.id;
  const set = (name, value) => {
    if (value !== undefined && value !== null && value !== "") card.setAttribute(name, value);
  };
  set("stream-idx", streamIdx);
  set("job-idx", jobIdx);
  set("title", job.title || "");
  set("stream-title", stream.title || "");
  set("tab", stream.tab || "progress");
  set("schedule", getScheduleText(job.schedule));
  set("active", job.active !== false ? "true" : "false");
  set("stream-image", stream.image ? stream.image : "");
  set("image", job.image ? job.image : "");
  set("suffix", (getJobSuffix(job) || "").trim());
  if (job.sleepUntil && job.sleepUntil.trim()) set("extra", "Sleep: " + formatDate(job.sleepUntil));
  else if (job.waitFor && job.waitFor.trim()) set("extra", "Wait: " + job.waitFor.trim());
  if (job.time && job.time.trim()) set("time", job.time.trim());
  return card;
}

function handleJobSearchCardEdit(e) {
  editJobInAccordion(e.detail.streamIdx, e.detail.jobIdx);
}

function handleJobSearchCardToggle(e) {
  handleAccordionJobActiveToggle(e.detail.streamIdx, e.detail.jobIdx, e.detail.checked);
}

function handleAccordionJobActiveToggle(streamIdx, jobIdx, checked) {
  var streams = loadStreams();
  var jobs = streams[streamIdx].jobs || [];
  if (jobs[jobIdx]) jobs[jobIdx].active = checked;
  saveStreams(streams);
  var jobId = jobs[jobIdx] ? jobs[jobIdx].id : null;
  if (jobId) {
    var order = loadTodayOrder() || [];
    if (checked && shouldShowJobToday(jobs[jobIdx])) {
      if (!order.includes(jobId)) order.push(jobId);
    } else {
      order = order.filter(function(id) { return id !== jobId; });
    }
    saveTodayOrder(order);
  }
  updateEditorJobCountBadges();
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

function injectStreamsEditorStyles() {
  var page = document.getElementById("streamsEditor");
  if (page && page.shadowRoot) {
    injectStyleInto(page.shadowRoot, JOBS_EDITOR_STYLES + STREAMS_EDITOR_STYLES);
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

var todayCardsSortable = null;

function initTodayCardsSortable() {
  if (todayCardsSortable) {
    todayCardsSortable.destroy();
    todayCardsSortable = null;
  }
  if (typeof Sortable === "undefined") return;
  var el = document.getElementById("todayCardList");
  if (!el || !el.querySelector(".today-drag-card")) return;
  todayCardsSortable = new Sortable(el, {
    handle: ".drag-handle",
    draggable: ".today-drag-card",
    animation: 150,
    onEnd: function() {
      var order = [];
      el.querySelectorAll(".today-drag-card").forEach(function(card) {
        var id = card.getAttribute("data-job-id");
        if (id && order.indexOf(id) === -1) order.push(id);
      });
      if (order.length === 0) return;
      saveTodayOrder(order);
    }
  });
}

function sortJobsByRules(jobs) {
  // rule 1: has sleepUntil → end (ordered by sleepUntil date, then time)
  // rule 2: no sleepUntil, has time → start (ordered by time)
  // rule 3: no sleepUntil, no time → middle (ordered by sequence)
  return [].concat(jobs).sort(function(a, b) {
    var aSleep = a.sleepUntil && a.sleepUntil.trim();
    var bSleep = b.sleepUntil && b.sleepUntil.trim();
    var aTime = a.time && a.time.trim();
    var bTime = b.time && b.time.trim();
    // groups: 0=rule2(noSleep+time), 1=rule3(noSleep+noTime), 2=rule1(sleepUntil)
    var aGroup = aSleep ? 2 : (aTime ? 0 : 1);
    var bGroup = bSleep ? 2 : (bTime ? 0 : 1);
    if (aGroup !== bGroup) return aGroup - bGroup;
    if (aGroup === 0) {
      var t = aTime.localeCompare(bTime);
      if (t !== 0) return t;
      return (a.sequence || 0) - (b.sequence || 0);
    }
    if (aGroup === 2) {
      var d = aSleep.localeCompare(bSleep);
      if (d !== 0) return d;
      if (aTime && bTime) return aTime.localeCompare(bTime);
      if (aTime) return 1;
      if (bTime) return -1;
      return (a.sequence || 0) - (b.sequence || 0);
    }
    return (a.sequence || 0) - (b.sequence || 0);
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

function updateStreamImagePreview(name) {
  var sel = $id("streamImageSelect");
  if (sel) {
    if (name) sel.setAttribute("image", name);
    else sel.removeAttribute("image");
  }
  var nameEl = $id("streamImageName");
  if (nameEl) nameEl.textContent = name;
}
function updateJobImagePreview(name) {
  var sel = $id("jobImageSelect");
  if (sel) {
    if (name) sel.setAttribute("image", name);
    else sel.removeAttribute("image");
  }
  var nameEl = $id("jobImageName");
  if (nameEl) nameEl.textContent = name;
  var removeBtn = $id("jobImageRemoveBtn");
  if (removeBtn) {
    if (name) removeBtn.classList.remove("d-none");
    else removeBtn.classList.add("d-none");
  }
}
function updateJobStreamPreview() {
  var streams = loadStreams();
  var stream = streams[jobsTargetStreamIndex >= 0 ? jobsTargetStreamIndex : jobsStreamIndex];
  var sName = (stream && stream.image) ? stream.image : "";
  var btnIcon = $id("jobStreamBtnIcon");
  if (btnIcon) {
    var sim = btnIcon.querySelector("smd-image");
    if (sim) {
      if (sName) sim.setAttribute("image", sName);
      else sim.removeAttribute("image");
    }
  }
  var btnText = $id("jobStreamBtnText");
  if (btnText) {
    btnText.textContent = stream ? stream.title : "";
  }
  var menu = $id("jobStreamDropdownMenu");
  if (menu) {
    var items = menu.querySelectorAll(".dropdown-item");
    var targetIdx = jobsTargetStreamIndex >= 0 ? jobsTargetStreamIndex : jobsStreamIndex;
    items.forEach(function(item) {
      if (parseInt(item.getAttribute("data-stream-idx")) === targetIdx) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }
}
function jobChangeStream(newIdx) {
  jobsTargetStreamIndex = newIdx;
  updateJobStreamPreview();
  closeJobStreamMenu();
}

function initJobStreamDropdown() {
  const btn = $id("jobStreamDropdownBtn");
  if (!btn || btn._smdDropdownBound) return;
  btn._smdDropdownBound = true;
  btn.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();
    const open = toggleJobStreamMenu();
    document.addEventListener("click", function onDoc(e2) {
      document.removeEventListener("click", onDoc);
      if (!open) return;
      const menu = $id("jobStreamDropdownMenu");
      const btnEl = $id("jobStreamDropdownBtn");
      if (!menu || !btnEl) return;
      if (menu.contains(e2.target) || btnEl.contains(e2.target)) return;
      menu.classList.remove("show");
    });
  });
}

function toggleJobStreamMenu() {
  const menu = $id("jobStreamDropdownMenu");
  if (!menu) return false;
  const willOpen = !menu.classList.contains("show");
  menu.classList.toggle("show", willOpen);
  return willOpen;
}

function closeJobStreamMenu() {
  const menu = $id("jobStreamDropdownMenu");
  if (menu) menu.classList.remove("show");
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

// JOBS EDITOR
var jobsStreamIndex = -1;
var jobsEditingIdx = -1;
var jobsBuffer = null;
var isNewJob = false;
var jobsTargetStreamIndex = -1;
var jobTasksSortable = null;

function jobField(field, value) {
  if (!jobsBuffer) return;
  jobsBuffer[field] = value;
}
function jobTimeChanged() {
  const h = $id("jobTimeHour").value;
  const m = $id("jobTimeMin").value;
  jobField("time", h && m ? h + ":" + m : "");
}
function clearSleepUntil() {
  jobField("sleepUntil", "");
  const fpInput = $id("jobSleepUntil");
  if (fpInput) {
    if (fpInput._flatpickr) fpInput._flatpickr.clear();
    fpInput.value = "";
  }
  const btn = $id("jobSleepUntilClearBtn");
  if (btn) btn.classList.add("d-none");
}
function updateJobEditOkBtn() {
  const okBtn = getJobEditFooterBtn("done");
  if (!okBtn) return;
  const title = $id("jobTitleInput");
  okBtn.disabled = !title || !title.value.trim();
}
function updateSleepUntilClearBtn() {
  const btn = $id("jobSleepUntilClearBtn");
  if (!btn) return;
  const val = $id("jobSleepUntil").value;
  btn.classList.toggle("d-none", !val);
}

function jobAddTask() {
  if (!jobsBuffer) return;
  if (!jobsBuffer.tasks) jobsBuffer.tasks = [];
  jobsBuffer.tasks.push({ description: "", done: false, note: "" });
  renderJobTasks();
  var listEl = $id("jobTasksList");
  var inputs = listEl ? listEl.querySelectorAll(".task-desc-input") : [];
  var last = inputs[inputs.length - 1];
  if (last) {
    last.focus();
    last.scrollIntoView({ block: "nearest" });
  }
}

function jobAddTaskTop() {
  if (!jobsBuffer) return;
  if (!jobsBuffer.tasks) jobsBuffer.tasks = [];
  jobsBuffer.tasks.unshift({ description: "", done: false, note: "" });
  renderJobTasks();
  var first = $id("jobTasksList");
  first = first ? first.querySelector(".task-desc-input") : null;
  if (first) {
    first.focus();
    first.scrollIntoView({ block: "nearest" });
  }
}

function jobDeleteTask(index) {
  if (!jobsBuffer || !jobsBuffer.tasks) return;
  var taskText = (jobsBuffer.tasks[index] && jobsBuffer.tasks[index].description) ? jobsBuffer.tasks[index].description : "Unnamed task";
  showSmdModal({
    title: "Delete Task?",
    content: 'Delete task "' + escapeHtml(taskText) + '"?',
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function(detail) {
      if (detail.action !== "delete") return;
      jobsBuffer.tasks.splice(index, 1);
      renderJobTasks();
    }
  });
}

function jobTaskField(index, field, value) {
  if (!jobsBuffer || !jobsBuffer.tasks) return;
  jobsBuffer.tasks[index][field] = value;
  if (field === "note") {
    var list = $id("jobTasksList");
    if (list) {
      var row = list.querySelector('.task-row[data-task-index="' + index + '"]');
      if (row) setTaskNoteBtnClass(row.querySelector(".task-note-btn"), jobsBuffer.tasks[index]);
    }
  }
}

function taskNoteOpen(task) {
  if (!task) return false;
  if (task.noteOpen === undefined) return !!task.note;
  return task.noteOpen;
}

function setTaskNoteBtnClass(btn, task) {
  if (!btn) return;
  var hasNote = !!(task && task.note);
  btn.classList.toggle("btn-outline-info", hasNote);
  btn.classList.toggle("btn-info", !hasNote);
}

function renderJobTasks() {
  var el = $id("jobTasksList");
  if (!el || !jobsBuffer) return;
  var tasks = jobsBuffer.tasks || [];
  var html = "";
  tasks.forEach(function(task, i) {
    html += '<div class="d-flex align-items-center gap-2 mb-1 task-row task-drag-card" data-task-index="' + i + '">' +
      '<div class="drag-handle">&#9776;</div>' +
      '<input class="form-check-input task-done-cb" type="checkbox" id="taskDone' + i + '" ' + (task.done ? "checked" : "") + ' onchange="jobTaskField(' + i + ', \'done\', this.checked)">' +
      '<input class="form-control task-desc-input" value="' + escapeHtml(task.description || "") + '" placeholder="Task description" oninput="jobTaskField(' + i + ', \'description\', this.value)">' +
      '<button class="btn btn-sm ' + (task.note ? 'btn-outline-info' : 'btn-info') + ' task-note-btn" onclick="jobTaskToggleNote(this, ' + i + ')" title="Note"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.854 2.56a.5.5 0 0 0-.707 0L1.5 10.207V14.5h4.293L13.5 6.207zM12.793 3.207L4 12V14h2L13.793 4.207l-1-1z"/></svg></button>' +
      '<button class="btn btn-sm btn-danger d-flex align-items-center justify-content-center" style="width:32px;height:32px" onclick="jobDeleteTask(' + i + ')" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg></button>' +
      '</div>' +
      '<div class="task-note-row mb-1 ms-4" id="taskNoteRow' + i + '" style="display:' + (taskNoteOpen(task) ? 'block' : 'none') + '">' +
        '<textarea class="form-control" rows="2" placeholder="Note" oninput="jobTaskField(' + i + ', \'note\', this.value)">' + escapeHtml(task.note || "") + '</textarea>' +
      '</div>';
  });
  el.innerHTML = html;
  var topBtn = $id("jobAddTaskBtn");
  if (topBtn) {
    topBtn.style.display = tasks.length >= 1 ? "" : "none";
  }
  initJobTasksSortable();
}

function initJobTasksSortable() {
  if (jobTasksSortable) {
    jobTasksSortable.destroy();
    jobTasksSortable = null;
  }
  if (typeof Sortable === "undefined") return;
  var el = $id("jobTasksList");
  if (!el || !jobsBuffer) return;
  if (!el.querySelector(".drag-handle")) return;
  jobTasksSortable = new Sortable(el, {
    handle: ".drag-handle",
    draggable: ".task-row",
    animation: 150,
    onEnd: function() {
      if (!jobsBuffer || !jobsBuffer.tasks) return;
      var reordered = [];
      el.querySelectorAll(".task-row").forEach(function(row) {
        var idx = parseInt(row.getAttribute("data-task-index"), 10);
        if (idx >= 0 && idx < jobsBuffer.tasks.length) reordered.push(jobsBuffer.tasks[idx]);
      });
      if (reordered.length !== jobsBuffer.tasks.length) return;
      jobsBuffer.tasks = reordered;
      renderJobTasks();
    }
  });
}

function jobTaskToggleNote(btn, index) {
  var row = $id("taskNoteRow" + index);
  if (!row) return;
  row.style.display = row.style.display === "none" ? "block" : "none";
  var shown = row.style.display === "block";
  if (jobsBuffer && jobsBuffer.tasks && jobsBuffer.tasks[index]) {
    jobsBuffer.tasks[index].noteOpen = shown;
  }
  if (btn && jobsBuffer && jobsBuffer.tasks) {
    setTaskNoteBtnClass(btn, jobsBuffer.tasks[index]);
  }
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return dayNames[d.getDay()] + " " + d.getDate() + " " + monthNames[d.getMonth()] + " " + d.getFullYear();
}

function formatLongDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return dayNames[d.getDay()] + ", " + d.getDate() + " " + monthNames[d.getMonth()] + ", " + d.getFullYear();
}

function getDaysSinceEpoch(date) {
  return Math.floor(date.getTime() / 86400000);
}

function getNextDueText(interval, offset) {
  const today = getTodayDate();
  const todayEpoch = getDaysSinceEpoch(today);
  for (let i = 0; i <= 7; i++) {
    const checkDay = todayEpoch + i;
    if ((checkDay - offset) % interval === 0) {
      if (i === 0) return "next due: today";
      if (i === 1) return "next due: tomorrow";
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + i);
      const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return "next due: " + dayNames[dueDate.getDay()] + ", " + monthNames[dueDate.getMonth()] + " " + dueDate.getDate();
    }
  }
  return "";
}

function getScheduleText(schedule) {
  if (!schedule) return "Every day";
  const s = schedule.type || "daily";
  if (s === "daily") return "Every day";
  if (s === "weekdays") return "Weekdays (Mon\u2013Fri)";
  if (s === "weekends") return "Weekends (Sat\u2013Sun)";
  if (s === "days") {
    const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    return (schedule.days || []).map(d => names[d]).join(", ");
  }
  if (s === "monthly") return (schedule.date || 1) + "th of every month";
  if (s === "ndays") return "Every " + (schedule.interval || 2) + " day(s)";
  return "Every day";
}

var SCHEDULE_MODAL_STYLES = `
  .smd-body .form-check { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
  .smd-body .form-check-input { position: relative; flex: 0 0 auto; width: 1rem; height: 1rem; margin: 0; accent-color: var(--smd-primary, #0d6efd); }
  .smd-body .form-check-label { margin: 0; }
  .smd-body .form-label { margin-bottom: 0.25rem; font-weight: 500; color: var(--bs-body-color, #f8f9fa); }
  .smd-body .form-select {
    background-color: var(--bs-body-bg, #222);
    color: var(--bs-body-color, #eee);
    border: 1px solid var(--bs-border-color, #444);
    border-radius: 0.35rem;
    padding: 0.375rem 2rem 0.375rem 0.75rem;
    font-size: 0.9rem;
  }
  .smd-body .form-select option { background-color: var(--bs-body-bg, #222); }
  .smd-body .d-none { display: none !important; }
  .smd-body .ms-4 { margin-left: 1.5rem; }
  .smd-body .mb-0 { margin-bottom: 0; }
  .smd-body .mb-1 { margin-bottom: 0.25rem; }
  .smd-body .mb-2 { margin-bottom: 0.5rem; }
  .smd-body .mb-3 { margin-bottom: 1rem; }
  .smd-body .d-flex { display: flex; }
  .smd-body .align-items-center { align-items: center; }
  .smd-body .gap-2 { gap: 0.5rem; }
  .smd-body .flex-wrap { flex-wrap: wrap; }
  .smd-body .text-muted { opacity: 0.75; }
  .smd-body .small { font-size: 0.875em; }
`;

function scheduleEl(id) {
  const host = document.getElementById("smdConfirmModal");
  return host && host.shadowRoot ? host.shadowRoot.getElementById(id) : null;
}
function scheduleRadios() {
  const host = document.getElementById("smdConfirmModal");
  return host && host.shadowRoot ? host.shadowRoot.querySelectorAll('input[name="scheduleType"]') : [];
}

function getScheduleFormHTML() {
  return `
    <div class="mb-3">
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedDaily" value="daily" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedDaily">Every day</label>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedNDays" value="ndays" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedNDays">Every n days</label>
      </div>
      <div id="schedNDaysOptions" class="d-none ms-4 mb-2">
        <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
          <label class="form-label mb-0">Every</label>
          <select class="form-select" id="schedNInterval" onchange="onScheduleNDaysChange()" style="width:auto;min-width:60px"></select>
          <label class="form-label mb-0">day(s)</label>
          <label class="form-label mb-0 ms-2">Offset</label>
          <select class="form-select" id="schedNOffset" onchange="onScheduleNDaysChange()" style="width:auto;min-width:60px"></select>
        </div>
        <div id="schedNextDue" class="text-muted small"></div>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedWeekdays" value="weekdays" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedWeekdays">Weekdays (Mon&ndash;Fri)</label>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedWeekends" value="weekends" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedWeekends">Weekends (Sat&ndash;Sun)</label>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedDays" value="days" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedDays">Specific days</label>
      </div>
      <div id="schedDaysOptions" class="d-none ms-4 mb-2 d-flex gap-2 flex-wrap">
        <div class="form-check"><input class="form-check-input" type="checkbox" id="schedDay0" value="0"><label class="form-check-label" for="schedDay0">Sun</label></div>
        <div class="form-check"><input class="form-check-input" type="checkbox" id="schedDay1" value="1"><label class="form-check-label" for="schedDay1">Mon</label></div>
        <div class="form-check"><input class="form-check-input" type="checkbox" id="schedDay2" value="2"><label class="form-check-label" for="schedDay2">Tue</label></div>
        <div class="form-check"><input class="form-check-input" type="checkbox" id="schedDay3" value="3"><label class="form-check-label" for="schedDay3">Wed</label></div>
        <div class="form-check"><input class="form-check-input" type="checkbox" id="schedDay4" value="4"><label class="form-check-label" for="schedDay4">Thu</label></div>
        <div class="form-check"><input class="form-check-input" type="checkbox" id="schedDay5" value="5"><label class="form-check-label" for="schedDay5">Fri</label></div>
        <div class="form-check"><input class="form-check-input" type="checkbox" id="schedDay6" value="6"><label class="form-check-label" for="schedDay6">Sat</label></div>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedMonthly" value="monthly" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedMonthly">Day of month</label>
      </div>
      <div id="schedMonthlyOptions" class="d-none ms-4 mb-2">
        <select class="form-select" id="schedMonthlyDay" style="width:auto"></select>
      </div>
    </div>
  `;
}

function openScheduleModal() {
  const s = (jobsBuffer && jobsBuffer.schedule) || { type: "daily" };
  showSmdModal({
    title: "Schedule",
    content: getScheduleFormHTML(),
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "OK", variant: "primary", action: "ok" }
    ],
    onAction: function(detail) {
      if (detail.action === "ok") saveScheduleModal();
    }
  });
  const host = document.getElementById("smdConfirmModal");
  if (host && host.shadowRoot) injectStyleInto(host.shadowRoot, SCHEDULE_MODAL_STYLES);
  scheduleRadios().forEach(r => r.checked = r.value === s.type);
  scheduleEl("schedDaysOptions").classList.toggle("d-none", s.type !== "days");
  scheduleEl("schedMonthlyOptions").classList.toggle("d-none", s.type !== "monthly");
  scheduleEl("schedNDaysOptions").classList.toggle("d-none", s.type !== "ndays");
  for (let i = 0; i < 7; i++) {
    scheduleEl("schedDay" + i).checked = (s.days || []).includes(i);
  }
  const mSel = scheduleEl("schedMonthlyDay");
  mSel.innerHTML = "";
  for (let i = 1; i <= 31; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i;
    if (i === (s.date || 1)) opt.selected = true;
    mSel.appendChild(opt);
  }
  const intervalSel = scheduleEl("schedNInterval");
  intervalSel.innerHTML = "";
  for (let i = 2; i <= 7; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i;
    if (i === (s.interval || 2)) opt.selected = true;
    intervalSel.appendChild(opt);
  }
  const curInterval = s.interval || 2;
  const offsetSel = scheduleEl("schedNOffset");
  offsetSel.innerHTML = "";
  for (let i = 0; i < curInterval; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i;
    if (i === (s.offset ?? 0)) opt.selected = true;
    offsetSel.appendChild(opt);
  }
  if (s.type === "ndays") onScheduleNDaysChange();
}

function onScheduleTypeChange() {
  let checked = null;
  scheduleRadios().forEach(r => { if (r.checked) checked = r; });
  const type = checked ? checked.value : "daily";
  scheduleEl("schedDaysOptions").classList.toggle("d-none", type !== "days");
  scheduleEl("schedMonthlyOptions").classList.toggle("d-none", type !== "monthly");
  scheduleEl("schedNDaysOptions").classList.toggle("d-none", type !== "ndays");
  if (type === "ndays") onScheduleNDaysChange();
}

function onScheduleNDaysChange() {
  const interval = parseInt(scheduleEl("schedNInterval").value, 10) || 2;
  const offsetSel = scheduleEl("schedNOffset");
  const currentOffset = parseInt(offsetSel.value, 10) || 0;
  offsetSel.innerHTML = "";
  for (let i = 0; i < interval; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i;
    if (i === Math.min(currentOffset, interval - 1)) opt.selected = true;
    offsetSel.appendChild(opt);
  }
  const offset = parseInt(offsetSel.value, 10) || 0;
  scheduleEl("schedNextDue").textContent = getNextDueText(interval, offset);
}

function saveScheduleModal() {
  let checked = null;
  scheduleRadios().forEach(r => { if (r.checked) checked = r; });
  const type = checked ? checked.value : "daily";
  let schedule = { type: type };
  if (type === "days") {
    schedule.days = [];
    for (let i = 0; i < 7; i++) {
      if (scheduleEl("schedDay" + i).checked) schedule.days.push(i);
    }
    if (schedule.days.length === 0) schedule = { type: "daily" };
  } else if (type === "monthly") {
    schedule.date = parseInt(scheduleEl("schedMonthlyDay").value, 10) || 1;
  } else if (type === "ndays") {
    schedule.interval = parseInt(scheduleEl("schedNInterval").value, 10) || 2;
    schedule.offset = parseInt(scheduleEl("schedNOffset").value, 10) || 0;
  }
  jobField("schedule", schedule);
  const el = $id("jobScheduleText");
  if (el) el.textContent = getScheduleText(schedule);
}

function shouldShowJobToday(job) {
  if (job.sleepUntil) {
    const today = getTodayStr();
    if (today < job.sleepUntil) return false;
  }
  const s = job.schedule || { type: "daily" };
  const type = s.type || "daily";
  const now = getTodayDate();
  if (type === "daily") return true;
  if (type === "weekdays") { const d = now.getDay(); return d >= 1 && d <= 5; }
  if (type === "weekends") { const d = now.getDay(); return d === 0 || d === 6; }
  if (type === "days") return (s.days || []).includes(now.getDay());
  if (type === "monthly") return now.getDate() === (s.date || 1);
  if (type === "ndays") {
    const interval = s.interval || 2;
    const offset = s.offset ?? 0;
    const daysSinceEpoch = getDaysSinceEpoch(now);
    return ((daysSinceEpoch - offset) % interval + interval) % interval === 0;
  }
  return true;
}

function getJobEditPageContent(data, readOnly) {
  const disabled = readOnly ? "disabled" : "";
  const ro = readOnly ? "readonly" : "";
  return `
    <div class="row mb-1">
      <div class="col">
        <label class="form-label">Title</label>
      </div>
      <div class="col-auto d-flex align-items-center">
        <div class="form-check mb-0">
          <input class="form-check-input" type="checkbox" id="jobActiveCb" ${data.active !== false ? "checked" : ""} ${disabled} onchange="jobField('active', this.checked)">
          <label class="form-check-label" for="jobActiveCb">Active</label>
        </div>
      </div>
    </div>
    <div class="mb-2">
      <input class="form-control" id="jobTitleInput" value="${escapeHtml(data.title || "")}" ${ro} oninput="jobField('title', this.value);updateJobEditOkBtn()" ${readOnly ? "" : "onkeydown=\"if(event.key==='Enter') jobEditOk()\""}>
    </div>
    <smd-tabs id="jobEditTabs"></smd-tabs>
  `;
}

function getJobEditSections(data, readOnly) {
  return [
    { title: "General", id: "jobGeneral-tab", content: getJobGeneralTabHTML(data, readOnly) },
    { title: "Schedule", id: "jobSchedule-tab", content: getJobScheduleTabHTML(data, readOnly) },
    { title: "Tasks", id: "jobTasks-tab", content: getJobTasksTabHTML(data, readOnly) }
  ];
}

function getJobGeneralTabHTML(data, readOnly) {
  const streams = loadStreams();
  const currentStream = streams[jobsTargetStreamIndex >= 0 ? jobsTargetStreamIndex : jobsStreamIndex] || {};
  const disabled = readOnly ? "disabled" : "";
  return `
    <div class="row mb-2 mt-2">
      <div class="col-6 d-flex flex-column" style="min-height:61px">
        <label class="form-label mb-0">Stream</label>
        <div class="dropdown mt-1" id="jobStreamDropdown" style="flex-grow:1">
          <button class="btn btn-outline-secondary dropdown-toggle w-100 d-flex align-items-center gap-2 h-100" type="button" id="jobStreamDropdownBtn" ${disabled} style="text-align:left">
            <span id="jobStreamBtnIcon" style="width:45px;height:45px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;border:1px solid var(--bs-border-color);border-radius:6px">
              <smd-image key-prefix="planmydays_" image="${escapeHtml(currentStream.image || "")}" style="width:100%;height:100%"></smd-image>
            </span>
            <span id="jobStreamBtnText" class="flex-grow-1">${escapeHtml(currentStream.title || "")}</span>
          </button>
          <ul class="dropdown-menu w-100" id="jobStreamDropdownMenu">
            ${streams.map((s, i) => {
              return `
                <li>
                  <a class="dropdown-item d-flex align-items-center gap-2 ${i === (jobsTargetStreamIndex >= 0 ? jobsTargetStreamIndex : jobsStreamIndex) ? "active" : ""}" href="#" data-stream-idx="${i}" onclick="event.preventDefault();jobChangeStream(${i})">
                    <span style="width:45px;height:45px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;border:1px solid var(--bs-border-color);border-radius:6px">
                      <smd-image key-prefix="planmydays_" image="${escapeHtml(s.image || "")}" style="width:100%;height:100%"></smd-image>
                    </span>
                    ${escapeHtml(s.title)}
                  </a>
                </li>
              `;
            }).join("")}
          </ul>
        </div>
      </div>
      <div class="col-6 d-flex flex-column" style="min-height:61px">
        <label class="form-label mb-0">Image</label>
        <div class="d-flex align-items-center mt-1" style="flex-grow:1">
          <smd-image-select id="jobImageSelect" key-prefix="planmydays_" image="${escapeHtml(data.image || "")}" label-id="jobImageName" button-id="btnJobImageChange" ${readOnly ? "disabled" : ""}></smd-image-select>
        </div>
      </div>
    </div>
    <div class="mb-2">
      <label class="form-label">Description</label>
      <textarea class="form-control" rows="3" ${readOnly ? "readonly" : ""} oninput="jobField('description', this.value)">${escapeHtml(data.description || "")}</textarea>
    </div>
    <div class="row mb-2">
      <div class="col-auto d-flex align-items-center">
        <div class="form-check mb-0">
          <input class="form-check-input" type="checkbox" id="jobSuffixCb" ${data.suffix ? "checked" : ""} ${disabled} onchange="jobField('suffix', this.checked)">
          <label class="form-check-label" for="jobSuffixCb">Suffix</label>
        </div>
      </div>
      <div class="col">
        <select class="form-select" ${disabled} onchange="jobField('dayType', this.value)">
          <option value="dayOfYear" ${(data.dayType || "dayOfYear") === "dayOfYear" ? "selected" : ""}>Day of Year</option>
          <option value="dayOfMonth" ${data.dayType === "dayOfMonth" ? "selected" : ""}>Day of Month</option>
          <option value="dayOfWeek" ${data.dayType === "dayOfWeek" ? "selected" : ""}>Day of Week</option>
        </select>
      </div>
      <div class="col">
        <select class="form-select" ${disabled} onchange="jobField('mod', this.value)">
          <option value="" ${!data.mod ? "selected" : ""}>None</option>
          <option value="2" ${data.mod === "2" ? "selected" : ""}>2</option>
          <option value="3" ${data.mod === "3" ? "selected" : ""}>3</option>
          <option value="4" ${data.mod === "4" ? "selected" : ""}>4</option>
          <option value="5" ${data.mod === "5" ? "selected" : ""}>5</option>
          <option value="6" ${data.mod === "6" ? "selected" : ""}>6</option>
          <option value="7" ${data.mod === "7" ? "selected" : ""}>7</option>
        </select>
      </div>
    </div>
  `;
}

function getJobScheduleTabHTML(data, readOnly) {
  const disabled = readOnly ? "disabled" : "";
  const ro = readOnly ? "readonly" : "";
  return `
    <div class="mb-2 mt-2">
      <label class="form-label">Schedule</label>
      <div class="d-flex align-items-center gap-2">
        <span id="jobScheduleText">${escapeHtml(getScheduleText(data.schedule))}</span>
        <button class="btn btn-primary btn-sm" id="btnScheduleChange" ${disabled} onclick="openScheduleModal()">Edit</button>
      </div>
    </div>
    <div class="row mb-2">
      <div class="col">
        <label class="form-label">Sleep Until</label>
        <div class="d-flex gap-2">
          <input class="form-control" id="jobSleepUntil" value="${escapeHtml(readOnly ? formatDate(data.sleepUntil) : (data.sleepUntil || ""))}" ${ro} placeholder="Pick a date">
          <button class="btn btn-danger btn-sm ${data.sleepUntil ? "" : "d-none"}" id="jobSleepUntilClearBtn" ${disabled} onclick="clearSleepUntil()">Clear</button>
        </div>
      </div>
    </div>
    <div class="row mb-2">
      <div class="col">
        <label class="form-label">Wait for</label>
        <input class="form-control" id="jobWaitFor" value="${escapeHtml(data.waitFor || "")}" ${ro} placeholder="e.g. the delivery to arrive" oninput="jobField('waitFor', this.value)">
      </div>
    </div>
    <div class="row mb-2">
      <div class="col">
        <label class="form-label">Schedule Time</label>
        <div class="d-flex gap-2">
          <select class="form-select" id="jobTimeHour" ${disabled} onchange="jobTimeChanged()" style="width:auto">
            <option value="" ${!data.time ? "selected" : ""}>-</option>
            ${Array.from({length: 24}, (_, i) => {
              const h = String(i).padStart(2, "0");
              const cur = data.time ? data.time.split(":")[0] : "";
              return `<option value="${h}" ${cur === h ? "selected" : ""}>${h}</option>`;
            }).join("")}
          </select>
          <span class="align-self-center">:</span>
          <select class="form-select" id="jobTimeMin" ${disabled} onchange="jobTimeChanged()" style="width:auto">
            <option value="" ${!data.time ? "selected" : ""}>-</option>
            <option value="00" ${data.time && data.time.split(":")[1] === "00" ? "selected" : ""}>00</option>
            <option value="15" ${data.time && data.time.split(":")[1] === "15" ? "selected" : ""}>15</option>
            <option value="30" ${data.time && data.time.split(":")[1] === "30" ? "selected" : ""}>30</option>
            <option value="45" ${data.time && data.time.split(":")[1] === "45" ? "selected" : ""}>45</option>
          </select>
        </div>
      </div>
    </div>
  `;
}

function getJobTasksTabHTML(data, readOnly) {
  const disabled = readOnly ? "disabled" : "";
  const ro = readOnly ? "readonly" : "";
  const tasks = data.tasks || [];
  let tasksHTML = "";
  tasks.forEach(function(task, i) {
    var dragHandleHtml = readOnly ? "" : '<div class="drag-handle">&#9776;</div>';
    tasksHTML += `
      <div class="d-flex align-items-center gap-2 mb-1 task-row task-drag-card" data-task-index="${i}">
        ${dragHandleHtml}
        <input class="form-check-input task-done-cb" type="checkbox" ${task.done ? "checked" : ""} ${disabled} onchange="jobTaskField(${i}, 'done', this.checked)">
        <input class="form-control task-desc-input" value="${escapeHtml(task.description || "")}" ${ro} placeholder="Task description" oninput="jobTaskField(${i}, 'description', this.value)">
        <button class="btn btn-sm ${task.note ? 'btn-outline-info' : 'btn-info'} task-note-btn" ${disabled} onclick="jobTaskToggleNote(this, ${i})" title="Note"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.854 2.56a.5.5 0 0 0-.707 0L1.5 10.207V14.5h4.293L13.5 6.207zM12.793 3.207L4 12V14h2L13.793 4.207l-1-1z"/></svg></button>
        <button class="btn btn-sm btn-danger d-flex align-items-center justify-content-center" style="width:32px;height:32px" ${disabled} onclick="jobDeleteTask(${i})" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg></button>
      </div>
      <div class="task-note-row mb-1 ms-4" id="taskNoteRow${i}" style="display:${taskNoteOpen(task) ? 'block' : 'none'}">
        <textarea class="form-control" rows="2" placeholder="Note" ${ro} oninput="jobTaskField(${i}, 'note', this.value)">${escapeHtml(task.note || "")}</textarea>
      </div>`;
  });
  return `
    <div class="mt-2">
      <button class="btn btn-primary btn-sm mb-2" id="jobAddTaskBtn" ${disabled} onclick="jobAddTaskTop()">Add Task</button>
      <div id="jobTasksList">${tasksHTML}</div>
      <div class="mt-2">
        <button class="btn btn-primary btn-sm" id="jobAddTaskBottomBtn" ${disabled} onclick="jobAddTask()">Add Task</button>
      </div>
    </div>
  `;
}

var _jobEditButtons = [];
var _jobEditCloseTimer = null;

function buildJobEditPage(readOnly, activeTabIndex) {
  if (!jobsBuffer) return;
  const data = jobsBuffer;
  const title = readOnly ? "View Job" : (isNewJob ? "Add Job" : "Edit Job");
  const page = document.getElementById("jobEditPage");
  if (!page) return;

  destroyJobEditTransient();
  if (_jobEditCloseTimer) {
    clearTimeout(_jobEditCloseTimer);
    _jobEditCloseTimer = null;
  }
  jobsTargetStreamIndex = jobsStreamIndex;

  _jobEditButtons = readOnly
    ? [
        { text: "Edit", variant: "primary", action: "edit", id: "btnViewJobEdit", close: false },
        { text: "OK", variant: "success", action: "cancel", id: "jobEditOkBtn" }
      ]
    : [
        { text: "Cancel", variant: "secondary", action: "cancel", id: "jobEditCancelBtn" },
        ...(isNewJob ? [] : [{ text: "Delete", variant: "danger", action: "delete", id: "jobEditDelBtn" }]),
        { text: "OK", variant: "success", action: "done", id: "jobEditOkBtn" }
      ];

  page.classList.remove("d-none");
  page.title = title;
  page.content = getJobEditPageContent(data, readOnly);
  page.buttons = _jobEditButtons;

  const tabsEl = $id("jobEditTabs");
  if (tabsEl) {
    tabsEl.tabs = getJobEditSections(data, readOnly);
    if (typeof activeTabIndex === "number" && activeTabIndex > 0 && activeTabIndex < tabsEl.tabs.length) {
      tabsEl.activeIndex = activeTabIndex;
    }
  }
  injectJobEditStyles();
  initJobStreamDropdown();
  initJobSleepUntilPicker(readOnly);
  if (!readOnly) {
    initJobTasksSortable();
    renderJobTasks();
    updateJobEditOkBtn();
  }
  page.show();
  if (!readOnly && isNewJob) focusJobTitle();
}

function destroyJobEditTransient() {
  if (jobTasksSortable) {
    jobTasksSortable.destroy();
    jobTasksSortable = null;
  }
  const fp = $id("jobSleepUntil");
  if (fp && fp._flatpickr) {
    try { fp._flatpickr.destroy(); } catch (e) {}
  }
}

function hideJobEditPage() {
  destroyJobEditTransient();
  const page = document.getElementById("jobEditPage");
  if (page) {
    page.hide();
    clearTimeout(_jobEditCloseTimer);
    _jobEditCloseTimer = setTimeout(function() {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
}

function initJobSleepUntilPicker(readOnly) {
  const fpInput = $id("jobSleepUntil");
  if (!fpInput) return;
  if (readOnly) return;
  flatpickr(fpInput, {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "D j M Y",
    altInputClass: "form-control",
    allowInput: false,
    monthSelectorType: "dropdown",
    disableMobile: true,
    locale: { firstDayOfWeek: parseInt(localStorage.getItem(smdKey("startWeek")) || "1", 10) },
    onChange: function(selectedDates, dateStr) {
      jobField("sleepUntil", dateStr);
      updateSleepUntilClearBtn();
    }
  });
  if (fpInput._flatpickr && fpInput._flatpickr.altInput) fpInput._flatpickr.altInput.id = "jobSleepUntilDisplay";
}

function focusJobTitle() {
  requestAnimationFrame(function() {
    var el = $id("jobTitleInput");
    if (el) el.focus();
  });
}

function getJobEditFooterBtn(action) {
  const page = document.getElementById("jobEditPage");
  if (!page || !page.shadowRoot) return null;
  const config = _jobEditButtons.find(function(b) { return b.action === action; });
  if (!config || !config.id) return null;
  return page.shadowRoot.getElementById(config.id);
}

function jobEditOk() {
  const okBtn = getJobEditFooterBtn("done");
  if (okBtn && okBtn.disabled) return;
  doneJobEdit();
}

function editJobFromView() {
  if (!jobsBuffer) return;
  var activeIdx = 0;
  var tabsEl = $id("jobEditTabs");
  if (tabsEl) activeIdx = tabsEl.activeIndex;
  buildJobEditPage(false, activeIdx);
}

function viewJobReadOnly(streamIdx, jobIdx) {
  const streams = loadStreams();
  const stream = streams[streamIdx];
  if (!stream) return;
  const jobs = stream.jobs || [];
  const job = jobs[jobIdx];
  if (!job) return;
  jobsBuffer = JSON.parse(JSON.stringify(job));
  if (jobsBuffer.sleepUntil) {
    const today = getTodayStr();
    if (jobsBuffer.sleepUntil < today) jobsBuffer.sleepUntil = "";
  }
  jobsStreamIndex = streamIdx;
  jobsEditingIdx = jobIdx;
  isNewJob = false;
  buildJobEditPage(true);
}

function editJob(index) {
  var streams = loadStreams();
  var jobs = streams[jobsStreamIndex].jobs || [];
  jobsBuffer = JSON.parse(JSON.stringify(jobs[index]));
  if (jobsBuffer.sleepUntil) {
    var today = getTodayStr();
    if (jobsBuffer.sleepUntil < today) jobsBuffer.sleepUntil = "";
  }
  jobsEditingIdx = index; isNewJob = false;
  buildJobEditPage(false);
}

function cancelJobEdit() {
  hideJobEditPage();
  var searchOpen = document.getElementById("jobSearchEditor") && !document.getElementById("jobSearchEditor").classList.contains("d-none");
  var fromMain = document.getElementById("streamsEditor").classList.contains("d-none");
  if (isNewJob && jobsEditingIdx >= 0) {
    var streams = loadStreams();
    var jobs = streams[jobsStreamIndex].jobs || [];
    jobs.splice(jobsEditingIdx, 1);
    streams[jobsStreamIndex].jobs = jobs;
    saveStreams(streams);
  }
  jobsEditingIdx = -1; jobsBuffer = null; isNewJob = false; jobsTargetStreamIndex = -1;
  if (searchOpen) { renderSearchJobs(); } else if (fromMain) { renderMain(); } else { renderStreamsEditor(); }
}

function doneJobEdit() {
  var searchOpen = document.getElementById("jobSearchEditor") && !document.getElementById("jobSearchEditor").classList.contains("d-none");
  var fromMain = document.getElementById("streamsEditor").classList.contains("d-none");
  var savedId = null;
  if (jobsEditingIdx >= 0 && jobsBuffer) {
    var streams = loadStreams();
    savedId = jobsBuffer.id;
    if (jobsTargetStreamIndex >= 0 && jobsTargetStreamIndex !== jobsStreamIndex) {
      var oldJobs = streams[jobsStreamIndex].jobs || [];
      oldJobs.splice(jobsEditingIdx, 1);
      oldJobs.forEach(function(j, i) { j.sequence = i + 1; });
      streams[jobsStreamIndex].jobs = oldJobs;
      var newJobs = streams[jobsTargetStreamIndex].jobs || [];
      jobsBuffer.sequence = newJobs.length + 1;
      newJobs.push(jobsBuffer);
      streams[jobsTargetStreamIndex].jobs = newJobs;
    } else {
      var jobs = streams[jobsStreamIndex].jobs || [];
      jobs[jobsEditingIdx] = jobsBuffer;
      streams[jobsStreamIndex].jobs = jobs;
    }
    saveStreams(streams);
  }
  hideJobEditPage();
  jobsEditingIdx = -1; jobsBuffer = null; isNewJob = false; jobsTargetStreamIndex = -1;
  if (searchOpen) { renderSearchJobs(); } else if (fromMain) {
    var streams = loadStreams();
    var order = loadTodayOrder() || [];
    var allActive = [];
    streams.forEach(function(t) { (t.jobs || []).forEach(function(j) { if (j.active !== false) allActive.push(j.id); }); });
    var remaining = order.filter(function(id) { return allActive.includes(id); });
    allActive.forEach(function(id) { if (!remaining.includes(id)) remaining.push(id); });
    if (savedId && !remaining.includes(savedId)) remaining.push(savedId);
    saveTodayOrder(remaining);
    renderMain();
  } else {
    var editorStreams = loadStreams();
    var savedJob = null;
    editorStreams.forEach(function(t) {
      if (!savedJob) {
        var found = (t.jobs || []).find(function(j) { return j.id === savedId; });
        if (found) savedJob = found;
      }
    });
    if (savedId && savedJob && savedJob.active !== false && shouldShowJobToday(savedJob)) {
      var editorOrder = loadTodayOrder() || [];
      if (editorOrder.indexOf(savedId) === -1) {
        editorOrder.push(savedId);
        saveTodayOrder(editorOrder);
      }
    }
    renderStreamsEditor();
  }
}

function deleteJobFromEdit() {
  var idx = jobsEditingIdx;
  hideJobEditPage();
  confirmDeleteJob(idx);
}

function confirmDeleteJob(index) {
  jobsEditingIdx = index;
  var streams = loadStreams();
  var stream = streams[jobsStreamIndex] || {};
  var jobs = stream.jobs || [];
  var job = jobs[index] || {};
  showSmdModal({
    title: "Delete Job?",
    content: 'Delete "' + escapeHtml(job.title || "") + '" from "' + escapeHtml(stream.title || "") + '"?',
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function(detail) {
      if (detail.action !== "delete") return;
      var s = loadStreams();
      var jbs = s[jobsStreamIndex].jobs || [];
      var deletedId = (jbs[index] || {}).id;
      jbs.splice(index, 1);
      jbs.forEach(function(j, i) { j.sequence = i + 1; });
      s[jobsStreamIndex].jobs = jbs;
      saveStreams(s);
      if (deletedId) {
        var order = loadTodayOrder();
        if (order) {
          order = order.filter(function(id) { return id !== deletedId; });
          saveTodayOrder(order);
        }
        var completed = loadCompletedJobs();
        if (completed.indexOf(deletedId) !== -1) {
          saveCompletedJobs(completed.filter(function(id) { return id !== deletedId; }));
        }
      }
      jobsEditingIdx = -1; jobsBuffer = null; isNewJob = false;
      if (document.getElementById("streamsEditor").classList.contains("d-none")) {
        renderMain();
      } else {
        renderStreamsEditor();
      }
    }
  });
}

function addNewJob() {
  var streams = loadStreams();
  var jobs = streams[jobsStreamIndex].jobs || [];
  var seq = jobs.length + 1;
  var newJob = { id: "job_" + Date.now(), title: "", sequence: seq, description: "", active: true, frequency: "daily", time: "", sleepUntil: "", waitFor: "", schedule: { type: "daily" }, tasks: [] };
  jobs.push(newJob);
  streams[jobsStreamIndex].jobs = jobs;
  saveStreams(streams);
  jobsBuffer = JSON.parse(JSON.stringify(newJob));
  jobsEditingIdx = jobs.length - 1; isNewJob = true;
  buildJobEditPage(false);
}

function getJobSuffix(job) {
  if (!job.suffix) return "";
  const today = getTodayDate();
  const dayType = job.dayType || "dayOfYear";
  let dayNum;

  if (dayType === "dayOfWeek") {
    dayNum = today.getDay();
    const mondaySetting = localStorage.getItem(smdKey("monday")) || "1";
    if (mondaySetting === "1") {
      dayNum = dayNum === 0 ? 7 : dayNum;
    } else {
      dayNum = dayNum === 0 ? 6 : dayNum - 1;
    }
  } else if (dayType === "dayOfMonth") {
    dayNum = today.getDate();
  } else {
    const startOfYear = new Date(today.getFullYear(), 0, 0);
    dayNum = Math.floor((today - startOfYear) / 86400000);
    const jan1Setting = localStorage.getItem(smdKey("jan1")) || "0";
    if (jan1Setting === "0") {
      dayNum -= 1;
    }
  }

  if (job.mod && job.mod !== "") {
    const modVal = parseInt(job.mod, 10);
    if (modVal > 0) {
      dayNum = dayNum % modVal;
    }
  }

  const suffixStart = localStorage.getItem(smdKey("suffixStart")) || "0";
  if (suffixStart === "1") dayNum += 1;

  return ` (${dayNum})`;
}

// SETTINGS
let _settingsSections = null;
let _settingsFooterHtml = null;
let _settingsCloseTimer = null;

// PMD-specific settings (kept out of the shared smd-settings.js library).
function changeSplitList(enabled) {
  localStorage.setItem(smdKey("splitList"), enabled);
}

function changeDevToday(value) {
  localStorage.setItem("devToday", value);
  if (typeof renderMain === "function") renderMain();
}

function changeDevLastGen(value) {
  localStorage.setItem("devLastGen", value);
}

function changeHideDone(enabled) {
  localStorage.setItem(smdKey("hideDone"), enabled);
}

function changeSuffixStart(value) {
  localStorage.setItem(smdKey("suffixStart"), value);
  if (typeof renderMain === "function") renderMain();
}

function changeJan1(value) {
  localStorage.setItem(smdKey("jan1"), value);
  if (typeof renderMain === "function") renderMain();
}

function changeMonday(value) {
  localStorage.setItem(smdKey("monday"), value);
  if (typeof renderMain === "function") renderMain();
}

function changeStartWeek(value) {
  localStorage.setItem(smdKey("startWeek"), value);
}

function changeShowDanger(enabled) {
  localStorage.setItem(smdKey("showDanger"), enabled);
  const dangerIds = ["clearAllDataRow", "refreshAppRow", "regenerateTilesRow", "sortJobsInStreamsRow", "uploadStandardImagesRow"];
  if (isDevMode) dangerIds.push("devTodayRow", "devLastGenRow");
  dangerIds.forEach(id => {
    const el = $id(id);
    if (el) el.classList.toggle("d-none", !enabled);
  });
}

function changeSkipAdhocConfirm(enabled) {
  localStorage.setItem(smdKey("skipAdhocConfirm"), enabled);
}

function getSettingsSections() {
  if (_settingsSections) return { sections: _settingsSections, footerHtml: _settingsFooterHtml };
  const template = document.getElementById("settingsTemplate");
  if (!template) return { sections: [], footerHtml: "" };
  const clone = template.content.cloneNode(true);
  _settingsSections = Array.from(clone.querySelectorAll(".smd-settings-tab")).map(sec => ({
    id: sec.dataset.tabId || null,
    title: sec.dataset.tab,
    content: sec.innerHTML
  }));
  const footer = clone.querySelector("#settingsFooter");
  _settingsFooterHtml = (footer ? footer.outerHTML : "").replace('id="buildNumber"></span>', 'id="buildNumber">' + (typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "") + '</span>');
  template.remove();
  return { sections: _settingsSections, footerHtml: _settingsFooterHtml };
}

var JOBS_EDITOR_STYLES = `
  .smd-page-body *, .smd-page-body *::before, .smd-page-body *::after,
  .smd-tab-panel *, .smd-tab-panel *::before, .smd-tab-panel *::after {
    box-sizing: border-box;
  }
  .smd-page-body .row, .smd-tab-panel .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    width: 100%;
    max-width: 1040px;
    margin-bottom: 1rem;
  }
  .smd-page-body .col, .smd-page-body .col-auto, .smd-page-body .col-6,
  .smd-tab-panel .col, .smd-tab-panel .col-auto, .smd-tab-panel .col-6 {
    position: relative;
    padding-right: 0.75rem;
    padding-left: 0.75rem;
  }
  .smd-page-body .col, .smd-tab-panel .col { flex: 1 0 0%; }
  .smd-page-body .col-auto, .smd-tab-panel .col-auto { flex: 0 0 auto; width: auto; }
  .smd-page-body .col-6, .smd-tab-panel .col-6 { flex: 0 0 50%; max-width: 50%; }
  .smd-page-body .form-label, .smd-tab-panel .form-label {
    margin-bottom: 0.25rem;
    font-weight: 500;
    color: var(--bs-body-color, #f8f9fa);
  }
  .smd-page-body .form-control, .smd-tab-panel .form-control {
    display: block;
    width: 100%;
    padding: 0.375rem 0.75rem;
    font-size: 0.95rem;
    font-weight: 400;
    line-height: 1.5;
    color: var(--bs-body-color, #f8f9fa);
    background-color: var(--bs-body-bg, #222222);
    background-clip: padding-box;
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
  }
  .smd-page-body .form-select, .smd-tab-panel .form-select {
    display: block;
    width: 100%;
    padding: 0.375rem 0.75rem;
    font-size: 0.95rem;
    color: var(--bs-body-color, #f8f9fa);
    background-color: var(--bs-body-bg, #222222);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
  }
  .smd-page-body .form-check, .smd-tab-panel .form-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.5rem;
  }
  .smd-page-body .form-check-label, .smd-tab-panel .form-check-label {
    color: var(--bs-body-color, #f8f9fa);
  }
  .smd-page-body .form-check-input, .smd-tab-panel .form-check-input {
    width: 1.1em;
    height: 1.1em;
    margin: 0;
    flex-shrink: 0;
    appearance: none;
    -webkit-appearance: none;
    vertical-align: middle;
    background-color: var(--bs-secondary-bg, #495057);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.25em;
    cursor: pointer;
  }
  .smd-page-body .form-check-input:checked, .smd-tab-panel .form-check-input:checked {
    background-color: var(--bs-primary, #0d6efd);
    border-color: var(--bs-primary, #0d6efd);
  }
  .smd-page-body .form-check-input:disabled, .smd-tab-panel .form-check-input:disabled { opacity: 0.55; }
  .smd-tab-panel .form-switch { padding-left: 0; }
  .smd-tab-panel .form-switch .form-check-input {
    width: 2.5em;
    height: 1.5em;
    border-radius: 2em;
    position: relative;
  }
  .smd-tab-panel .form-switch .form-check-input::before {
    content: "";
    position: absolute;
    top: 0.15em;
    left: 0.15em;
    width: 1.2em;
    height: 1.2em;
    border-radius: 50%;
    background-color: #fff;
    transition: transform 0.15s ease-in-out;
  }
  .smd-tab-panel .form-switch .form-check-input:checked::before { transform: translateX(1em); }
  .smd-tab-panel .input-group {
    display: flex;
    align-items: stretch;
    width: 100%;
  }
  .smd-tab-panel .input-group > .form-control {
    flex: 1 1 auto;
    width: 1%;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .smd-tab-panel .input-group > .btn-outline-secondary {
    flex: 0 0 auto;
    border: 1px solid var(--bs-border-color, #6c757d);
    border-left: 0;
    background: var(--bs-tertiary-bg, #303030);
    color: var(--bs-secondary-color, #adb5bd);
    padding: 0.375rem 0.75rem;
    border-radius: 0 0.375rem 0.375rem 0;
    cursor: pointer;
  }
  .smd-page-body .btn, .smd-tab-panel .btn {
    display: inline-block;
    padding: 0.375rem 0.75rem;
    font-size: 0.95rem;
    font-weight: 400;
    line-height: 1.5;
    text-align: center;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    cursor: pointer;
    text-decoration: none;
  }
  .smd-page-body .btn:disabled, .smd-tab-panel .btn:disabled { opacity: 0.55; pointer-events: none; }
  .smd-tab-panel .btn-primary { background: var(--bs-primary, #0d6efd); color: #fff; }
  .smd-tab-panel .btn-danger { background: var(--bs-danger, #e74c3c); color: #fff; }
  .smd-tab-panel .btn-info { background: var(--bs-info, #0dcaf0); color: #000; }
  .smd-tab-panel .btn-outline-info { background: transparent; color: var(--bs-info, #31d2f2); border-color: var(--bs-info, #31d2f2); }
  .smd-tab-panel .btn-outline-secondary { background: transparent; color: var(--bs-secondary-color, #adb5bd); border-color: var(--bs-secondary-color, #6c757d); }
  .smd-tab-panel .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.85rem; border-radius: 0.25rem; }
  .smd-tab-panel .btn-wide, .smd-tab-panel .w-100 { width: 100%; }
  .smd-tab-panel .dropdown { position: relative; }
  .smd-tab-panel .dropdown-toggle {
    border: 1px solid var(--bs-border-color, #6c757d);
    background: var(--bs-tertiary-bg, #303030);
    color: var(--bs-body-color, #eee);
    text-align: left;
  }
  .smd-tab-panel .dropdown-toggle::after {
    content: "";
    display: inline-block;
    margin-left: 0.5rem;
    vertical-align: middle;
    border-top: 0.3em solid;
    border-right: 0.3em solid transparent;
    border-bottom: 0;
    border-left: 0.3em solid transparent;
    opacity: 0.7;
  }
  .smd-tab-panel .dropdown-menu {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 1000;
    min-width: 100%;
    padding: 0.25rem 0;
    margin: 0.125rem 0 0;
    list-style: none;
    background: var(--bs-body-bg, #222);
    border: 1px solid var(--bs-border-color, #444);
    border-radius: 0.375rem;
  }
  .smd-tab-panel .dropdown-menu.show { display: block; }
  .smd-tab-panel .dropdown-menu-end { right: 0; left: auto; }
  .smd-tab-panel .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.35rem 1rem;
    color: var(--bs-body-color, #eee);
    text-decoration: none;
    cursor: pointer;
    background: transparent;
    border: none;
    text-align: left;
  }
  .smd-tab-panel .dropdown-item:hover, .smd-tab-panel .dropdown-item.active {
    background: var(--bs-primary, #0d6efd);
    color: #fff;
  }
  .smd-page-body .d-flex, .smd-tab-panel .d-flex { display: flex; }
  .smd-page-body .flex-column, .smd-tab-panel .flex-column { flex-direction: column; }
  .smd-page-body .flex-grow-1, .smd-tab-panel .flex-grow-1 { flex-grow: 1; }
  .smd-page-body .flex-shrink-0, .smd-tab-panel .flex-shrink-0 { flex-shrink: 0; }
  .smd-page-body .align-items-center, .smd-tab-panel .align-items-center { align-items: center; }
  .smd-page-body .align-self-center, .smd-tab-panel .align-self-center { align-self: center; }
  .smd-page-body .text-truncate, .smd-tab-panel .text-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .smd-page-body .gap-1, .smd-tab-panel .gap-1 { gap: 0.25rem; }
  .smd-page-body .gap-2, .smd-tab-panel .gap-2 { gap: 0.5rem; }
  .smd-page-body .gap-3, .smd-tab-panel .gap-3 { gap: 1rem; }
  .smd-page-body .mb-0, .smd-tab-panel .mb-0 { margin-bottom: 0; }
  .smd-page-body .mb-1, .smd-tab-panel .mb-1 { margin-bottom: 0.25rem; }
  .smd-page-body .mb-2, .smd-tab-panel .mb-2 { margin-bottom: 0.5rem; }
  .smd-tab-panel .mb-3 { margin-bottom: 1rem; }
  .smd-tab-panel .mb-4 { margin-bottom: 1.5rem; }
  .smd-tab-panel .mt-1 { margin-top: 0.25rem; }
  .smd-tab-panel .mt-2 { margin-top: 0.5rem; }
  .smd-tab-panel .mt-3 { margin-top: 1rem; }
  .smd-tab-panel .ms-4 { margin-left: 1.5rem; }
  .smd-tab-panel .text-secondary { color: var(--bs-secondary-color, #adb5bd); }
  .smd-tab-panel .h-100 { height: 100%; }
  .smd-tab-panel .position-relative { position: relative; }
  .smd-tab-panel .task-drag-card {
    background: var(--bs-tertiary-bg, #2a2a2a);
    border-radius: 6px;
    padding: 0.25rem 0.5rem;
  }
  .smd-tab-panel .drag-handle {
    cursor: grab;
    color: var(--bs-secondary-color, #aaa);
    padding: 0 0.25rem;
    user-select: none;
  }
  .smd-tab-panel .task-desc-input { flex: 1 1 auto; min-width: 0; }
  .d-none { display: none !important; }
`;

// Accordion styling for the streams editor, scoped to the smd-page shadow root.
var STREAMS_EDITOR_STYLES = `
  #streamEditorList { padding-bottom: 40px; }
  .accordion-collapse:not(.show) { display: none !important; }
  .stream-accordion-item {
    border: 1px solid var(--bs-border-color);
    border-radius: 0.375rem;
    overflow: hidden;
  }
  .stream-accordion-item.stream-drag-card { cursor: default; user-select: none; }
  .stream-accordion-body { padding: 0 !important; }
  #streamsEditorHeader { flex-shrink: 0; }
  .sortable-ghost { opacity: 0.4; }
  .sortable-chosen, .sortable-drag { cursor: grabbing; }
  .stream-accordion-body .job-drag-card {
    margin-bottom: 0;
  }
`;

var SETTINGS_STYLES = `
  .smd-tab-btn {
    padding: 0.5rem 0.25rem;
  }
  .smd-tab-panel *, .smd-tab-panel *::before, .smd-tab-panel *::after,
  #settingsFooter *, #settingsFooter *::before, #settingsFooter *::after {
    box-sizing: border-box;
  }
  .smd-tab-panel .row, #settingsFooter .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    width: 100%;
    max-width: 1040px;
    margin-bottom: 1.5rem;
  }
  .smd-tab-panel .col-md-8, #settingsFooter .col-md-8 { max-width: 1040px; }
  .smd-tab-panel .col-4, #settingsFooter .col-4 {
    flex: 0 0 33.333333%;
    max-width: 33.333333%;
    padding-right: 0.75rem;
  }
  .smd-tab-panel .col-8, #settingsFooter .col-8 {
    flex: 0 0 66.666667%;
    max-width: 66.666667%;
    padding-left: 0.75rem;
  }
  .smd-tab-panel .text-end, #settingsFooter .text-end { text-align: right; }
  .smd-tab-panel .form-label, #settingsFooter .form-label {
    margin-bottom: 0;
    font-weight: 500;
    color: var(--bs-body-color, #f8f9fa);
  }
  .smd-tab-panel .form-select,
  .smd-tab-panel .form-control {
    display: block;
    width: 100%;
    padding: 0.375rem 0.75rem;
    font-size: 0.95rem;
    font-weight: 400;
    line-height: 1.5;
    color: var(--bs-body-color, #f8f9fa);
    background-color: var(--bs-body-bg, #222222);
    background-clip: padding-box;
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
  }
  .smd-tab-panel .form-control-plaintext {
    display: block;
    width: 100%;
    padding: 0.375rem 0.75rem;
    color: var(--bs-body-color, #f8f9fa);
  }
  .smd-tab-panel .form-switch { padding-left: 0; }
  .smd-tab-panel .form-check-input[type="checkbox"] {
    width: 2.5em;
    height: 1.5em;
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
    vertical-align: middle;
    position: relative;
    background-color: var(--bs-secondary-bg, #495057);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 2em;
    cursor: pointer;
    transition: background-color 0.15s ease-in-out;
  }
  .smd-tab-panel .form-check-input[type="checkbox"]::before {
    content: "";
    position: absolute;
    top: 0.15em;
    left: 0.15em;
    width: 1.2em;
    height: 1.2em;
    border-radius: 50%;
    background-color: #fff;
    transition: transform 0.15s ease-in-out;
  }
  .smd-tab-panel .form-check-input[type="checkbox"]:checked {
    background-color: var(--bs-primary, #0d6efd);
    border-color: var(--bs-primary, #0d6efd);
  }
  .smd-tab-panel .form-check-input[type="checkbox"]:checked::before {
    transform: translateX(1em);
  }
  .smd-tab-panel .input-group {
    display: flex;
    align-items: stretch;
    width: 100%;
  }
  .smd-tab-panel .input-group > .form-control {
    flex: 1 1 auto;
    width: 1%;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .smd-tab-panel .input-group > .btn-outline-secondary {
    flex: 0 0 auto;
    border: 1px solid var(--bs-border-color, #6c757d);
    border-left: 0;
    background: var(--bs-tertiary-bg, #303030);
    color: var(--bs-secondary-color, #adb5bd);
    padding: 0.375rem 0.75rem;
    border-radius: 0 0.375rem 0.375rem 0;
    cursor: pointer;
  }
  .smd-tab-panel .btn {
    display: inline-block;
    padding: 0.375rem 0.75rem;
    font-size: 0.95rem;
    line-height: 1.5;
    text-align: center;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    cursor: pointer;
  }
  .smd-tab-panel .btn-danger { background: var(--bs-danger, #e74c3c); color: #fff; }
  .smd-tab-panel .btn-warning { background: var(--bs-warning, #f39c12); color: #000; }
  .smd-tab-panel .btn-primary { background: var(--bs-primary, #0d6efd); color: #fff; }
  .smd-tab-panel .editor-btn, .smd-tab-panel .btn-wide, .smd-tab-panel .w-100 { display: block; width: 100%; }
  .smd-tab-panel .mb-2 { margin-bottom: 0.5rem; }
  .smd-tab-panel .mb-3 { margin-bottom: 1rem; }
  .smd-tab-panel .mb-4 { margin-bottom: 1.5rem; }
  .smd-tab-panel .mt-1 { margin-top: 0.25rem; }
  .smd-tab-panel .mt-3 { margin-top: 1rem; }
  .d-none { display: none !important; }
  #settingsFooter .mt-3 { margin-top: 1rem; }
  #settingsFooter .mt-5 { margin-top: 3rem; }
  #settingsFooter .mb-3 { margin-bottom: 1rem; }
  #settingsFooter .small { font-size: 0.875em; }
  #settingsFooter .build-number { color: var(--bs-secondary-color, #adb5bd); }
`;

function injectSettingsStyles() {
  var sp = document.getElementById("settingsPage");
  if (sp && sp.shadowRoot) {
    injectStyleInto(sp.shadowRoot);
  }
  var tabs = $id("settingsTabs");
  if (tabs && tabs.shadowRoot) {
    injectStyleInto(tabs.shadowRoot);
  }
}

function injectJobEditStyles() {
  var page = document.getElementById("jobEditPage");
  if (page && page.shadowRoot) {
    injectStyleInto(page.shadowRoot, JOBS_EDITOR_STYLES);
  }
  var tabs = $id("jobEditTabs");
  if (tabs && tabs.shadowRoot) {
    injectStyleInto(tabs.shadowRoot, JOBS_EDITOR_STYLES);
  }
}

function buildSettingsContent() {
  const settingsPage = document.getElementById("settingsPage");
  if (!settingsPage) return;
  const { sections, footerHtml } = getSettingsSections();

  settingsPage.title = "Settings";
  settingsPage.content = '<smd-tabs id="settingsTabs"></smd-tabs>' + footerHtml;
  settingsPage.buttons = [{ text: "Done", variant: "success", action: "done" }];

  const tabsEl = $id("settingsTabs");
  if (tabsEl) {
    tabsEl.tabs = sections;
    tabsEl.bottomline = true;
  }
  injectSettingsStyles();
}

function openSettings() {
  document.getElementById("countdownContainer").classList.add("d-none");
  document.getElementById("streamsEditor").classList.add("d-none");
  document.getElementById("imagesEditor").classList.add("d-none");
  document.getElementById("jobSearchEditor").classList.add("d-none");

  const settingsPage = document.getElementById("settingsPage");
  if (_settingsCloseTimer) {
    clearTimeout(_settingsCloseTimer);
    _settingsCloseTimer = null;
  }
  settingsPage.classList.remove("d-none");
  buildSettingsContent();
  settingsPage.show();
  if (typeof bindMinioSettingsTabBehavior === "function") bindMinioSettingsTabBehavior();

  const savedTheme = localStorage.getItem(smdKey("theme")) || "darkly";
  const themeSel = $id("themeSelector");
  if (themeSel) themeSel.setAttribute("theme", savedTheme);
  const savedFontSize = localStorage.getItem(smdKey("fontSize")) || "xlarge";
  const fontSizeSel = $id("fontSizeSelector");
  if (fontSizeSel) fontSizeSel.value = savedFontSize;
  const splitList = localStorage.getItem(smdKey("splitList")) === "true";
  const splitListCb = $id("splitList");
  if (splitListCb) splitListCb.checked = splitList;
  const autoHide = localStorage.getItem(smdKey("autoHideMenu")) === "true";
  const autoHideCb = $id("autoHideMenu");
  if (autoHideCb) autoHideCb.checked = autoHide;
  const hideDone = localStorage.getItem(smdKey("hideDone")) === "true";
  const hideDoneCb = $id("hideDone");
  if (hideDoneCb) hideDoneCb.checked = hideDone;
  const suffixStart = localStorage.getItem(smdKey("suffixStart")) || "0";
  const suffixStartSel = $id("suffixStartSelector");
  if (suffixStartSel) suffixStartSel.value = suffixStart;
  const jan1 = localStorage.getItem(smdKey("jan1")) || "1";
  const jan1Sel = $id("jan1Selector");
  if (jan1Sel) jan1Sel.value = jan1;
  const monday = localStorage.getItem(smdKey("monday")) || "1";
  const mondaySel = $id("mondaySelector");
  if (mondaySel) mondaySel.value = monday;
  const startWeek = localStorage.getItem(smdKey("startWeek")) || "1";
  const startWeekSel = $id("startWeekSelector");
  if (startWeekSel) startWeekSel.value = startWeek;
  const showDanger = localStorage.getItem(smdKey("showDanger")) === "true";
  const showDangerCb = $id("showDanger");
  if (showDangerCb) showDangerCb.checked = showDanger;
  const skipAdhoc = localStorage.getItem(smdKey("skipAdhocConfirm")) === "true";
  const skipAdhocCb = $id("skipAdhocConfirm");
  if (skipAdhocCb) skipAdhocCb.checked = skipAdhoc;
  const dangerIds = ["clearAllDataRow", "refreshAppRow", "regenerateTilesRow", "sortJobsInStreamsRow", "uploadStandardImagesRow"];
  if (isDevMode) dangerIds.push("devTodayRow", "devLastGenRow");
  dangerIds.forEach(id => {
    const el = $id(id);
    if (el) el.classList.toggle("d-none", !showDanger);
  });

  if (typeof loadMinioSettings === "function") loadMinioSettings();

  if (isDevMode) {
    ["devTodayInput", "devLastGenInput"].forEach(id => {
      const el = $id(id);
      if (!el) return;
      const key = id === "devTodayInput" ? "devToday" : "devLastGen";
      const saved = localStorage.getItem(key) || "";
      if (el._flatpickr) el._flatpickr.destroy();
      flatpickr(el, {
        dateFormat: "Y-m-d",
        allowInput: true,
        monthSelectorType: "dropdown",
        defaultDate: saved || undefined,
        onChange: function(selectedDates, dateStr) {
          localStorage.setItem(key, dateStr);
          if (key === "devToday" && typeof renderMain === "function") renderMain();
        }
      });
    });
  }

  const qrContainer = $id("shareQrCode");
  if (qrContainer) {
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
      text: "https://ownimage.github.io/PlanMyDay",
      width: 120,
      height: 120,
      margin: 8
    });
  }

  const savedIconSize = localStorage.getItem(smdKey("iconSize")) || "large";
  const iconSel = $id("iconSizeSelector");
  if (iconSel) iconSel.value = savedIconSize;
  const savedDensity = localStorage.getItem(smdKey("density")) || "normal";
  const densitySel = $id("densitySelector");
  if (densitySel) densitySel.value = savedDensity;
  const savedDragSize = localStorage.getItem(smdKey("dragSize")) || "large";
  const dragSizeSel = $id("dragSizeSelector");
  if (dragSizeSel) dragSizeSel.value = savedDragSize;
  const savedSlideDuration = localStorage.getItem(smdKey("slideDuration")) || "0";
  const slideSel = $id("slideDurationSelector");
  if (slideSel) slideSel.value = savedSlideDuration;

  if (typeof updateScreenResolution === "function") updateScreenResolution();
}

function closeSettings() {
  const settingsPage = document.getElementById("settingsPage");
  if (settingsPage) {
    settingsPage.hide();
    if (_settingsCloseTimer) clearTimeout(_settingsCloseTimer);
    _settingsCloseTimer = setTimeout(function() {
      settingsPage.classList.add("d-none");
    }, Math.max(0, (settingsPage.slideDuration || 0) + 50));
  }
  document.getElementById("countdownContainer").classList.remove("d-none");
  delete document.getElementById("countdownContainer").dataset.showAll;
  renderMain();
}

function regenerateTiles() {
  const streams = loadStreams();
  const today = getTodayStr();
  streams.forEach(stream => {
    (stream.jobs || []).forEach(job => {
      if (job.sleepUntil && job.sleepUntil <= today) {
        job.sleepUntil = "";
      }
    });
  });
  saveStreams(streams);
  const merged = addScheduleJobsToOrder([]);
  saveTodayOrder(merged);
  saveCompletedJobs([]);
  localStorage.setItem(smdKey("last_gen"), getTodayStr());
  closeSettings();
  renderMain();
}

function sortJobsInStreams() {
  const streams = loadStreams();
  streams.forEach(stream => {
    const jobs = stream.jobs || [];
    if (jobs.length < 2) return;
    const sorted = sortJobsByRules(jobs);
    sorted.forEach((j, i) => { j.sequence = i + 1; });
    stream.jobs = sorted;
  });
  saveStreams(streams);
  closeSettings();
  renderMain();
}

function confirmClearAllData() {
  showSmdModal({
    title: "Clear All Data?",
    content: "Clear ALL data? This cannot be undone.",
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Clear", variant: "danger", action: "clear" }
    ],
    onAction: function(detail) {
      if (detail.action !== "clear") return;
      const keys = Object.keys(localStorage);
      keys.forEach(k => localStorage.removeItem(k));
      closeSettings();
    }
  });
}

function exportData() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    streams: JSON.parse(localStorage.getItem(smdKey("streams")) || "[]"),
    images: JSON.parse(localStorage.getItem(smdKey("images")) || "[]")
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const d = new Date();
  const ts = d.getFullYear() + String(d.getMonth()+1).padStart(2,"0") + String(d.getDate()).padStart(2,"0") + String(d.getHours()).padStart(2,"0") + String(d.getMinutes()).padStart(2,"0");
  a.download = `planmydays-${ts}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!data || (!data.streams && !data.images)) {
          alert("Invalid backup file: missing streams or images data.");
          return;
        }
        if (data.streams) localStorage.setItem(smdKey("streams"), JSON.stringify(data.streams));
        if (data.images) localStorage.setItem(smdKey("images"), JSON.stringify(data.images));
        regenerateTiles();
      } catch (err) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

document.addEventListener("DOMContentLoaded", () => {
  const settingsPage = document.getElementById("settingsPage");
  if (settingsPage) {
    settingsPage.addEventListener("smd-page-action", () => closeSettings());
  }

  const jobEditPage = document.getElementById("jobEditPage");
  if (jobEditPage) {
    jobEditPage.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (!action) return;
      if (action === "edit") {
        editJobFromView();
      } else if (action === "cancel") {
        cancelJobEdit();
      } else if (action === "done") {
        doneJobEdit();
      } else if (action === "delete") {
        deleteJobFromEdit();
      }
    });
  }

  const streamEditPage = document.getElementById("streamEditPage");
  if (streamEditPage) {
    streamEditPage.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "cancel") {
        cancelEdit();
      } else if (action === "done") {
        doneEdit();
      }
    });
  }

  const streamsEditorPage = document.getElementById("streamsEditor");
  if (streamsEditorPage) {
    streamsEditorPage.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "add") {
        addNewStream();
      } else if (action === "done") {
        closeStreamsEditor();
      }
    });

    streamsEditorPage.addEventListener("pmd-header-toggle", (e) => {
      setStreamExpanded(e.detail.streamIdx, e.detail.expanded);
    });
    streamsEditorPage.addEventListener("pmd-edit", (e) => {
      editStream(e.detail.streamIdx);
    });
    streamsEditorPage.addEventListener("pmd-add-job", (e) => {
      addNewJobForStream(e.detail.streamIdx);
    });
    streamsEditorPage.addEventListener("pmd-delete", (e) => {
      confirmDeleteStream(e.detail.streamIdx);
    });
    streamsEditorPage.addEventListener("pmd-job-edit", (e) => {
      editJobInAccordion(e.detail.streamIdx, e.detail.jobIdx);
    });
    streamsEditorPage.addEventListener("pmd-job-toggle-active", (e) => {
      handleAccordionJobActiveToggle(e.detail.streamIdx, e.detail.jobIdx, e.detail.checked);
    });
  }

  const jobSearchEditorPage = document.getElementById("jobSearchEditor");
  if (jobSearchEditorPage) {
    jobSearchEditorPage.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "add") {
        addNewJobFromSearch();
      } else if (action === "done") {
        closeSearchJobs();
      }
    });
  }

  const imagesEditor = document.getElementById("imagesEditor");
  if (imagesEditor) {
    imagesEditor.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "add") {
        addNewImage();
      } else if (action === "done") {
        closeImagesEditor();
      }
    });
    imagesEditor.addEventListener("smd-image-card-action", (e) => {
      const action = e.detail && e.detail.action;
      const idx = e.detail && e.detail.index;
      if (action === "delete") {
        confirmDeleteImage(idx);
      } else if (action === "duplicate") {
        duplicateImage(idx);
      } else if (action === "edit") {
        startEditImage(idx);
      }
    });
  }

  const savedTheme = localStorage.getItem(smdKey("theme")) || "darkly";
  applyTheme(savedTheme);
  if (typeof seedSampleImages === "function") seedSampleImages();

  renderMain();

  // The settings Display tab uses the shared <smd-theme> component; apply the
  // chosen theme when it fires smd-theme-change.
  document.addEventListener("smd-theme-change", function(e) {
    const theme = e.detail && e.detail.theme;
    if (theme && typeof changeTheme === "function") changeTheme(theme);
  });

  // smd-image-select "Edit" buttons open the SHARED image picker on
  // #imagePickerPage. Selection/no-image/cancel resolve the callback.
  let pickerCallback = null;
  let pickerHost = null;
  window.__openImagePicker = function(callback) {
    pickerCallback = callback || null;
    pickerHost = document.getElementById("imagePickerPage");
    if (!pickerHost) return;
    pickerHost.title = "Choose Image";
    pickerHost.content = '<smd-image-picker id="pickerHost" key-prefix="planmydays_"></smd-image-picker>';
    pickerHost.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "No Image", variant: "secondary", action: "no-image" }
    ];
    if (!pickerHost.__pickerBound) {
      pickerHost.__pickerBound = true;
      pickerHost.addEventListener("smd-page-action", function(e) {
        const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
        if (action === "cancel" || action === "no-image") window.__finishImagePick(null);
      });
    }
    pickerHost.classList.remove("d-none");
    pickerHost.show();
  };
  window.__finishImagePick = function(name) {
    if (pickerCallback) {
      const cb = pickerCallback;
      pickerCallback = null;
      cb(name);
    }
    if (pickerHost) {
      pickerHost.hide();
      // The page slides off-screen on hide(), but Playwright counts an off-canvas
      // element as visible. Add d-none (immediately for tests; after slide for UI).
      const ms = pickerHost.slideDuration || 0;
      setTimeout(function() { pickerHost.classList.add("d-none"); }, ms > 0 ? ms + 50 : 0);
    }
  };
  document.addEventListener("smd-image-picker-select", function(e) {
    window.__finishImagePick(e.detail ? e.detail.name : null);
  });

  document.addEventListener("smd-image-select-action", function(e) {
    const path = e.composedPath ? e.composedPath() : [];
    const sel = (path && path.find(function(el) { return el && el.tagName === "SMD-IMAGE-SELECT"; })) || null;
    if (!sel || !sel.id) return;
    if (sel.id === "streamImageSelect") {
      window.__openImagePicker(function(name) { editField("image", name); updateStreamImagePreview(name); });
    } else if (sel.id === "jobImageSelect") {
      window.__openImagePicker(function(name) { jobField("image", name); updateJobImagePreview(name); });
    }
  });

  if (typeof updateMinioMenu === "function") updateMinioMenu();
});

// PWA PULL-TO-REFRESH
(function() {
  if (!("serviceWorker" in navigator)) return;
  const THRESHOLD = 80;
  let startY = 0, pulling = false, pullDist = 0;
  const indicator = document.createElement("div");
  indicator.id = "pwa-pull-indicator";
  indicator.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;align-items:center;justify-content:center;height:0;overflow:hidden;background:var(--bs-body-bg);transition:height 0.1s;color:var(--bs-body-color)";
  indicator.textContent = "\u21E9 Pull to refresh";
  document.body.appendChild(indicator);
  const spinner = document.createElement("div");
  spinner.id = "pwa-pull-spinner";
  spinner.style.cssText = "position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);z-index:10000;display:none;width:40px;height:40px;border:4px solid var(--bs-border-color);border-top-color:var(--bs-primary);border-radius:50%;animation:pwa-spin 0.6s linear infinite";
  document.body.appendChild(spinner);
  const style = document.createElement("style");
  style.textContent = "@keyframes pwa-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}";
  document.head.appendChild(style);
  function adjustIcon(dist) {
    indicator.innerHTML = dist >= THRESHOLD ? "\u21E9 Release to refresh" : "\u21E9 Pull to refresh";
    indicator.style.height = Math.min(dist, 50) + "px";
  }
  document.addEventListener("touchstart", e => {
    if (window.scrollY !== 0) return;
    if (e.target.closest(".modal")) return;
    startY = e.touches[0].clientY; pulling = true; pullDist = 0;
  }, { passive: true });
  document.addEventListener("touchmove", e => {
    if (!pulling) return;
    if (e.defaultPrevented) { pulling = false; pullDist = 0; indicator.style.height = "0"; return; }
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { pullDist = 0; return; }
    pullDist = dy; adjustIcon(dy);
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (!pulling) return;
    pulling = false; indicator.style.height = "0";
    if (pullDist >= THRESHOLD) { spinner.style.display = "block"; setTimeout(() => { location.reload(); }, 400); }
    pullDist = 0;
  }, { passive: true });
})();







