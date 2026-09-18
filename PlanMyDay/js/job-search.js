// PlanMyDay — the job search page.

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
  page.headerHtml = '<smd-badge id="jobSearchTotalBadge" variant="info" style="font-size:0.8em;vertical-align:middle"></smd-badge>';
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
    { text: "OK", variant: "success", action: "done", id: "btnJobSearchDone" }
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
  card.setAttribute("key-prefix", smdImagePrefix());
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
