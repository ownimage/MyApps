// ListOfLists — the settings page plus data import/export/regenerate actions.

// Danger rows toggled by the "Show danger" switch (dev rows only in dev mode).
function lolDangerIds() {
  const ids = ["clearAllDataRow", "refreshAppRow", "regenerateTilesRow", "sortListsInCategoriesRow", "uploadStandardImagesRow", "noCacheRow"];
  if (isDevMode) ids.push("devTodayRow", "devLastGenRow");
  return ids;
}

// LOL-specific settings (kept out of the shared smd-settings.js library).
function changeDevToday(value) {
  localStorage.setItem("devToday", value);
  if (typeof renderMain === "function") renderMain();
}

function changeDevLastGen(value) {
  localStorage.setItem("devLastGen", value);
}

function changeShowDanger(enabled) {
  smdChangeShowDanger(enabled, lolDangerIds());
}

// "No Cache": the worker stops serving its precache and re-reads every file from
// disk, so a deploy is visible on the next load. The switch only takes effect
// for files loaded AFTER it flips, hence the reload.
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
      if (typeof loadFileSyncSettings === "function") loadFileSyncSettings();

      const noCache = localStorage.getItem(smdKey("noCache")) === "true";
      const noCacheCb = $id("noCache");
      if (noCacheCb) noCacheCb.checked = noCache;

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

// Danger tab: clear ONLY this app's own data (its storage prefix). Never other
// apps' keys, and never the shared image library.
function confirmClearAllData() {
  smdConfirmClearAllData({ content: "Clear ALL List of Lists data? This cannot be undone." });
}

// The JSON (download) and MinIO backups share ONE payload shape: the app's own
// categories (with their lists) plus the shared image library. ListOfLists does
// not use PlanMyDay's `streams` key.
function lolExportPayload() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: JSON.parse(localStorage.getItem(smdKey("categories")) || "[]"),
    images: loadImages()
  };
}

function exportData() {
  smdDownloadJson(lolExportPayload(), "listoflists");
}

// Apply a backup (JSON file or MinIO object). Returns false for anything that is
// not a ListOfLists backup, so the MinIO page can report an invalid file.
function lolImportBackup(data) {
  if (!data || (!data.categories && !data.images)) return false;
  if (data.categories) localStorage.setItem(smdKey("categories"), JSON.stringify(data.categories));
  if (data.images) saveImages(data.images);
  return true;
}

function importData() {
  smdReadJsonFile(function (data) {
    if (data === undefined) { alert("Invalid JSON file."); return; }
    if (!lolImportBackup(data)) {
      alert("Invalid backup file: missing categories or images data.");
      return;
    }
    regenerateTiles();
  });
}
