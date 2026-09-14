// PlanMyDay — the settings page plus data import/export/regenerate actions.

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
  const savedTouchSize = localStorage.getItem(smdKey("touchSize")) ||
    localStorage.getItem(smdKey("dragSize")) || "large";
  const touchSizeSel = $id("touchSizeSelector");
  if (touchSizeSel) touchSizeSel.value = savedTouchSize;
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
    images: loadImages()
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
        if (data.images) saveImages(data.images);
        regenerateTiles();
      } catch (err) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
