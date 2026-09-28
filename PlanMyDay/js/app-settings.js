// PlanMyDay — the settings page plus data import/export/regenerate actions.

// Danger rows toggled by the "Show danger" switch (dev rows only in dev mode).
function pmdDangerIds() {
  const ids = ["clearAllDataRow", "refreshAppRow", "regenerateTilesRow", "sortJobsInStreamsRow", "uploadStandardImagesRow", "noCacheRow"];
  if (isDevMode) ids.push("devTodayRow", "devLastGenRow");
  return ids;
}

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
  smdChangeShowDanger(enabled, pmdDangerIds());
}

// "No Cache": the worker stops serving its precache and re-reads every file from
// disk, so a deploy is visible on the next load. The switch only takes effect
// for files loaded AFTER it flips, hence the reload.
function changeNoCache(enabled) {
  const done = function() { window.location.reload(); };
  if (typeof smdSetNoCache !== "function") {
    localStorage.setItem(smdKey("noCache"), enabled);
    return done();
  }
  smdSetNoCache(enabled).then(done, done);
}

function changeSkipAdhocConfirm(enabled) {
  localStorage.setItem(smdKey("skipAdhocConfirm"), enabled);
}

function getSettingsSections() {
  return smdGetSettingsSections();
}

function buildSettingsContent() {
  smdBuildSettingsPage();
}

function openSettings() {
  smdSetupSettingsPage({
    bindDone: false,
    dangerIds: pmdDangerIds(),
    onBeforeOpen: function () {
      document.getElementById("countdownContainer").classList.add("d-none");
      document.getElementById("streamsEditor").classList.add("d-none");
      document.getElementById("imagesEditor").classList.add("d-none");
      document.getElementById("jobSearchEditor").classList.add("d-none");
    },
    restore: function () {
      if (typeof bindMinioSettingsTabBehavior === "function") bindMinioSettingsTabBehavior();

      const splitList = localStorage.getItem(smdKey("splitList")) === "true";
      const splitListCb = $id("splitList");
      if (splitListCb) splitListCb.checked = splitList;

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

      const noCache = localStorage.getItem(smdKey("noCache")) === "true";
      const noCacheCb = $id("noCache");
      if (noCacheCb) noCacheCb.checked = noCache;

      const skipAdhoc = localStorage.getItem(smdKey("skipAdhocConfirm")) === "true";
      const skipAdhocCb = $id("skipAdhocConfirm");
      if (skipAdhocCb) skipAdhocCb.checked = skipAdhoc;

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

      const savedTouchSize = localStorage.getItem(smdKey("touchSize")) ||
        localStorage.getItem(smdKey("dragSize")) || "large";
      const touchSizeSel = $id("touchSizeSelector");
      if (touchSizeSel) touchSizeSel.value = savedTouchSize;

      const savedSlideDuration = localStorage.getItem(smdKey("slideDuration")) || "0";
      const slideSel = $id("slideDurationSelector");
      if (slideSel) slideSel.value = savedSlideDuration;

  if (typeof updateScreenResolution === "function") updateScreenResolution();
  const showGantt = localStorage.getItem(smdKey("showGantt")) === "true";
  const showGanttCb = $id("showGantt");
  if (showGanttCb) showGanttCb.checked = showGantt;
  if (typeof updateGanttMenu === "function") updateGanttMenu();
  }
  });
}

function closeSettings() {
  smdHideSettingsPage();
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
  smdDownloadJson({
    version: 1,
    exportedAt: new Date().toISOString(),
    streams: JSON.parse(localStorage.getItem(smdKey("streams")) || "[]"),
    images: loadImages()
  }, "planmydays");
}

function importData() {
  smdReadJsonFile(function (data) {
    if (data === undefined) { alert("Invalid JSON file."); return; }
    if (!data || (!data.streams && !data.images)) {
      alert("Invalid backup file: missing streams or images data.");
      return;
    }
    if (data.streams) localStorage.setItem(smdKey("streams"), JSON.stringify(data.streams));
    if (data.images) saveImages(data.images);
    regenerateTiles();
  });
}
