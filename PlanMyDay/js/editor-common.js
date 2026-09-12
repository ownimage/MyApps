// PlanMyDay — helpers shared by the editor screens: job count badges,
// image/stream selector previews, and active-view refresh.

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
// The stream dropdown is the <pmd-stream-select> component: the app only feeds
// it the streams + selected index and reacts to pmd-stream-select-change.
function initJobStreamSelect() {
  const sel = $id("jobStreamDropdown");
  if (!sel) return;
  sel.streams = loadStreams().map(function(s) {
    return { title: s.title || "", image: s.image || "" };
  });
  sel.selected = jobsTargetStreamIndex >= 0 ? jobsTargetStreamIndex : jobsStreamIndex;
}
function updateJobStreamPreview() {
  const sel = $id("jobStreamDropdown");
  if (sel) sel.selected = jobsTargetStreamIndex >= 0 ? jobsTargetStreamIndex : jobsStreamIndex;
}
function jobChangeStream(newIdx) {
  jobsTargetStreamIndex = newIdx;
  updateJobStreamPreview();
}

// Which screen is currently visible, so an editor that closes can re-render
// the right one (main view / streams editor / job search).
function activeEditorView() {
  var searchOpen = document.getElementById("jobSearchEditor") && !document.getElementById("jobSearchEditor").classList.contains("d-none");
  if (searchOpen) return "search";
  var fromMain = document.getElementById("streamsEditor").classList.contains("d-none");
  return fromMain ? "main" : "streams";
}
function refreshActiveView() {
  var view = activeEditorView();
  if (view === "search") renderSearchJobs();
  else if (view === "main") renderMain();
  else renderStreamsEditor();
}
