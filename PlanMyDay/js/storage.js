// PlanMyDay — localStorage storage helpers (streams, completed jobs,
// today's order). Loaded as a classic script so the functions stay global.

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
