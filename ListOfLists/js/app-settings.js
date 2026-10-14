// ListOfLists — the settings page plus data import/export/regenerate actions.

// Danger rows toggled by the "Show danger" switch (dev rows only in dev mode).
function lolDangerIds() {
  const ids = ["clearAllDataRow", "refreshAppRow", "regenerateTilesRow", "sortListsInCategoriesRow", "uploadStandardImagesRow", "noCacheRow"];
  if (isDevMode) ids.push("devTodayRow", "devLastGenRow");
  return ids;
}

// LOL-specific settings (kept out of the shared smd-settings.js library).
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
  smdChangeShowDanger(enabled, lolDangerIds());
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
    dangerIds: lolDangerIds(),
    onBeforeOpen: function () {
      document.getElementById("mainContainer").classList.add("d-none");
      document.getElementById("categoriesEditor").classList.add("d-none");
      document.getElementById("imagesEditor").classList.add("d-none");
      document.getElementById("listSearchEditor").classList.add("d-none");
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
          text: "https://ownimage.github.io/MyApps/ListOfLists",
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
  }
  });
}

function closeSettings() {
  smdHideSettingsPage();
  document.getElementById("mainContainer").classList.remove("d-none");
  delete document.getElementById("mainContainer").dataset.showAll;
  renderMain();
}

function regenerateTiles() {
  const categories = loadCategories();
  const today = getTodayStr();
  categories.forEach(category => {
    (category.lists || []).forEach(list => {
      if (list.sleepUntil && list.sleepUntil <= today) {
        list.sleepUntil = "";
      }
    });
  });
  saveCategories(categories);
  const merged = addScheduleListsToOrder([]);
  saveMainOrder(merged);
  saveCompletedLists([]);
  localStorage.setItem(smdKey("last_gen"), getTodayStr());
  closeSettings();
  renderMain();
}

function sortListsInCategories() {
  const categories = loadCategories();
  categories.forEach(category => {
    const lists = category.lists || [];
    if (lists.length < 2) return;
    const sorted = sortListsByRules(lists);
    sorted.forEach((j, i) => { j.sequence = i + 1; });
    category.lists = sorted;
  });
  saveCategories(categories);
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
    categories: JSON.parse(localStorage.getItem(smdKey("categories")) || "[]"),
    images: loadImages()
  }, "listoflists");
}

function importData() {
  smdReadJsonFile(function (data) {
    if (data === undefined) { alert("Invalid JSON file."); return; }
    if (!data || (!data.categories && !data.images)) {
      alert("Invalid backup file: missing categories or images data.");
      return;
    }
    if (data.categories) localStorage.setItem(smdKey("categories"), JSON.stringify(data.categories));
    if (data.images) saveImages(data.images);
    regenerateTiles();
  });
}
