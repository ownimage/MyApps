// PlanMyDay — the main "today" view (date heading, split-list tabs, cards).

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
    const stream = streams[streamIdx] || {};
    const streamImageName = stream.image || "";
    const jobImageName = job.image || "";
    const suffixLabel = getJobSuffix(job);
    const scheduleType = job.schedule && job.schedule.type ? job.schedule.type : "daily";
    const card = document.createElement("pmd-today-card");
    card.className = "today-drag-card";
    card.dataset.jobId = job.id;
    card.dataset.streamIdx = streamIdx;
    card.setAttribute("job-id", job.id);
    card.setAttribute("stream-idx", streamIdx);
    card.setAttribute("job-idx", jobIdx);
    card.setAttribute("title", job.title || "");
    if (suffixLabel) card.setAttribute("suffix", suffixLabel.trim());
    if (scheduleType === "daily") card.setAttribute("daily", "");
    if (isDone) card.setAttribute("done", "");
    card.setAttribute("checked", isDone ? "true" : "false");
    if (streamImageName) card.setAttribute("stream-image", streamImageName);
    if (jobImageName) card.setAttribute("job-image", jobImageName);
    card.setAttribute("stream-title", streamTitle || "");
    card.setAttribute("tab", stream.tab || "progress");
    if (job.description) card.setAttribute("description", job.description);
    card.setAttribute("key-prefix", "planmydays_");
    const handle = document.createElement("div");
    handle.className = "drag-handle";
    handle.setAttribute("slot", "drag-handle");
    handle.setAttribute("title", "drag");
    handle.innerHTML = "&#9776;";
    card.appendChild(handle);
    if (matchingStreams && !matchingStreams.has(streamIdx)) card.hidden = true;
    cardContainer.appendChild(card);
  });

  scrollBody.appendChild(cardContainer);

  // checkbox + view handlers (composed events emitted by pmd-today-card)
  cardContainer.addEventListener("pmd-today-toggle", (e) => {
    const jobId = e.detail.jobId;
    const card = e.target;
    if (e.detail.checked) {
      const streamIdx = card ? parseInt(card.dataset.streamIdx) : -1;
      const streams = loadStreams();
      const stream = streams[streamIdx];
      if (stream && stream.title === "Ad Hoc") {
        const skipConfirm = localStorage.getItem(smdKey("skipAdhocConfirm")) === "true";
        if (!skipConfirm) {
          const job = (stream.jobs || []).find(j => j.id === jobId);
          showSmdModal({
            title: "Remove from Ad Hoc?",
            content: `Remove "<strong>${escapeHtml(job?.title || jobId)}</strong>" from Ad Hoc?`,
            buttons: [
              { text: "Cancel", variant: "secondary", action: "cancel" },
              { text: "Remove", variant: "danger", action: "remove" }
            ],
            onAction: (detail) => {
              if (detail.action === "remove") removeAdhocJob(streamIdx, jobId, card);
              else if (card) card.checked = false;
            }
          });
          return;
        }
        removeAdhocJob(streamIdx, jobId, card);
      } else {
        markJobDone(jobId, card);
      }
    } else {
      let completed = loadCompletedJobs();
      completed = completed.filter(id => id !== jobId);
      saveCompletedJobs(completed);
      if (card) card.removeAttribute("done");
    }
  });

  cardContainer.addEventListener("pmd-today-view", (e) => {
    viewJobReadOnly(e.detail.streamIdx, e.detail.jobIdx);
  });

function removeAdhocJob(streamIdx, jobId, card) {
  const streams = loadStreams();
  const stream = streams[streamIdx];
  if (stream) {
    const jobs = stream.jobs || [];
    const idx = jobs.findIndex(j => j.id === jobId);
    if (idx >= 0) jobs.splice(idx, 1);
    stream.jobs = jobs;
    saveStreams(streams);
  }
  markJobDone(jobId, card);
  renderMain();
}

function markJobDone(jobId, card) {
  let completed = loadCompletedJobs();
  if (!completed.includes(jobId)) completed.push(jobId);
  saveCompletedJobs(completed);
  if (card) card.setAttribute("done", "");
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
