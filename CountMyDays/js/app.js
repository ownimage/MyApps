// CountMyDays app entry point: storage namespace, boot wiring for the editors,
// image picker plumbing, sample-data seeding, service-worker update prompt and
// PWA pull-to-refresh.
//
// The app is split into classic scripts (no modules) so every top-level
// function stays global — generated HTML uses inline onclick handlers and the
// Playwright suite calls these functions from page.evaluate().

// One storage namespace for every CountMyDays key (shared services read keys
// through smdKey()). All apps share ONE image library (`shared-images`).
SmdConfig.storagePrefix = "countmydays_";
SmdConfig.imagePrefix = "shared-";

// All apps on this origin share one image library (`shared-images`), so no
// per-app image migration is needed here.

// Hide every main/editor page except one (null hides them all). Page hosts are
// light-DOM elements so document.getElementById works.
function hideMainPages(exceptId) {
  [
    "countdownContainer",
    "datesEditor", "dateEditPage",
    "googleEventsPage", "googleEventEditPage",
    "categoriesEditor", "categoryEditPage",
    "imagesEditor", "settingsPage",
    "exportWizardPage", "qrExportPage", "qrImportPage", "importWizardPage"
  ].forEach(id => {
    if (id === exceptId) return;
    const el = document.getElementById(id);
    if (el) el.classList.add("d-none");
  });
}

// Seed the bundled sample data into empty stores (first visit / cleared data).
// Returns a promise resolving true when anything was seeded.
function seedSampleData() {
  const v = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now();
  return fetch("js/sampleData.json?v=" + v)
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(data => {
      if (!data) return false;
      let seeded = false;
      if (data.dates && localStorage.getItem(smdKey("dates")) === null) {
        saveDates(data.dates);
        seeded = true;
      }
      if (data.categories && localStorage.getItem(smdKey("categories")) === null) {
        saveCategories(data.categories);
        seeded = true;
      }
      if (data.images && localStorage.getItem(smdImagesKey()) === null) {
        saveImages(data.images);
        seeded = true;
      }
      return seeded;
    })
    .catch(() => false);
}

// The shared smd-images.js calls these hooks so CountMyDays' own data model
// stays consistent when images are renamed/deleted and the "in use" flag
// reflects category/date references (the shared default only knows streams).
SmdConfig.imageInUse = function (name) {
  if (!name) return false;
  if (loadCategories().some(c => c.image === name)) return true;
  return loadDates().some(d => d.image === name);
};

SmdConfig.onImageDelete = function (name) {
  if (!name) return;
  const categories = loadCategories();
  let changed = false;
  categories.forEach(c => { if (c.image === name) { c.image = null; changed = true; } });
  if (changed) saveCategories(categories);

  const dates = loadDates();
  let changedDates = false;
  dates.forEach(d => { if (d.image === name) { d.image = null; changedDates = true; } });
  if (changedDates) saveDates(dates);
};

SmdConfig.onImageRename = function (oldName, newName) {
  if (!oldName || !newName) return;
  const categories = loadCategories();
  let changed = false;
  categories.forEach(c => { if (c.image === oldName) { c.image = newName; changed = true; } });
  if (changed) saveCategories(categories);

  const dates = loadDates();
  let changedDates = false;
  dates.forEach(d => { if (d.image === oldName) { d.image = newName; changedDates = true; } });
  if (changedDates) saveDates(dates);
};

document.addEventListener("DOMContentLoaded", () => {
  applyImageSize();
  window.addEventListener("resize", applyImageSize);

  const savedTheme = getStoredTheme();
  applyTheme(savedTheme);

  // Show/hide the Google menu entries and G Cal settings options.
  if (typeof setGCalVisible === "function") setGCalVisible(isGCalEnabled());

  renderMain();

  seedSampleData().then(seeded => {
    if (seeded) renderMain();
  });

  // The settings Display tab uses the shared <smd-theme> component; apply the
  // chosen theme when it fires smd-theme-change.
  document.addEventListener("smd-theme-change", function (e) {
    const detail = e.detail || {};
    if (detail.source === "mode" && typeof changeThemeMode === "function") {
      changeThemeMode(detail.mode);
    } else if (detail.theme && typeof changeTheme === "function") {
      changeTheme(detail.theme);
    }
  });

  // smd-image-select "Edit" buttons open the SHARED image picker on
  // #imagePickerPage. Selection/no-image/cancel resolve the callback.
  let pickerCallback = null;
  let pickerHost = null;
  window.__openImagePicker = function (callback) {
    pickerCallback = callback || null;
    pickerHost = document.getElementById("imagePickerPage");
    if (!pickerHost) return;
    pickerHost.title = "Choose Image";
    pickerHost.content = `<smd-image-picker id="pickerHost" key-prefix="${smdImagePrefix()}"></smd-image-picker>`;
    pickerHost.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "No Image", variant: "primary", action: "no-image" }
    ];
    if (!pickerHost.__pickerBound) {
      pickerHost.__pickerBound = true;
      pickerHost.addEventListener("smd-page-action", function (e) {
        const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
        if (action === "cancel" || action === "no-image") window.__finishImagePick(null);
      });
    }
    pickerHost.classList.remove("d-none");
    pickerHost.show();
  };
  window.__finishImagePick = function (name) {
    if (pickerCallback) {
      const cb = pickerCallback;
      pickerCallback = null;
      cb(name);
    }
    if (pickerHost) {
      pickerHost.hide();
      const ms = pickerHost.slideDuration || 0;
      setTimeout(function () { pickerHost.classList.add("d-none"); }, ms > 0 ? ms + 50 : 0);
    }
  };
  document.addEventListener("smd-image-picker-select", function (e) {
    window.__finishImagePick(e.detail ? e.detail.name : null);
  });

  document.addEventListener("smd-image-select-action", function (e) {
    const path = e.composedPath ? e.composedPath() : [];
    const sel = (path && path.find(function (el) { return el && el.tagName === "SMD-IMAGE-SELECT"; })) || null;
    if (!sel || !sel.id) return;
    if (sel.id === "dateImageSelect") {
      window.__openImagePicker(function (name) {
        dateField("image", name || "");
        updateDateImagePreview();
      });
    } else if (sel.id === "categoryImageSelect") {
      window.__openImagePicker(function (name) {
        categoryField("image", name || "");
        updateCategoryImagePreview();
      });
    } else if (sel.id === "gcalImageSelect") {
      window.__openImagePicker(function (name) {
        gcalEditBufferField("image", name || "");
        updateGcalImagePreview();
      });
    }
  });

  // Images editor (shared smd-images.js) page + card actions.
  const imagesEditorPage = document.getElementById("imagesEditor");
  if (imagesEditorPage) {
    imagesEditorPage.addEventListener("smd-page-action", function (e) {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "add") addNewImage();
      else if (action === "done") closeImagesEditor();
    });
    imagesEditorPage.addEventListener("smd-image-card-action", function (e) {
      const action = e.detail && e.detail.action;
      const idx = e.detail && e.detail.index;
      if (action === "delete") confirmDeleteImage(idx);
      else if (action === "duplicate") duplicateImage(idx);
      else if (action === "edit") startEditImage(idx);
    });
  }

  // QR import completes with the decoded JSON payload.
  document.addEventListener("smd-qr-import-complete", function (e) {
    cancelQRImport();
    const data = e.detail && e.detail.data;
    if (data && data.dates && data.categories && data.images) {
      startImportWizard(data);
    } else {
      showSmdModal({
        title: "Import QR",
        content: "The scanned data is not a Count My Days export.",
        buttons: [{ text: "OK", variant: "primary", action: "ok" }]
      });
    }
  });

  document.addEventListener("smd-qr-import-error", function () {
    cancelQRImport();
    showSmdModal({
      title: "Import QR",
      content: "Failed to import QR data.",
      buttons: [{ text: "OK", variant: "primary", action: "ok" }]
    });
  });
});

// PWA PULL-TO-REFRESH
(function () {
  if (!("serviceWorker" in navigator)) return;
  const THRESHOLD = 80;
  let startY = 0, pulling = false, pullDist = 0;
  const indicator = document.createElement("div");
  indicator.id = "pwa-pull-indicator";
  indicator.className = "position-fixed top-0 start-0 w-100 d-flex align-items-center justify-content-center overflow-hidden";
  indicator.style.cssText = "height:0;z-index:9999;background:var(--bs-body-bg);transition:height 0.1s;color:var(--bs-body-color)";
  indicator.textContent = "\u21E9 Pull to refresh";
  document.body.appendChild(indicator);
  const spinner = document.createElement("div");
  spinner.id = "pwa-pull-spinner";
  spinner.className = "position-fixed d-none";
  spinner.style.cssText = "top:30%;left:50%;transform:translate(-50%,-50%);z-index:10000;width:40px;height:40px;border:4px solid var(--bs-border-color);border-top-color:var(--bs-primary);border-radius:50%;animation:pwa-spin 0.6s linear infinite";
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
    if (pullDist >= THRESHOLD) { spinner.classList.remove("d-none"); setTimeout(() => { location.reload(); }, 400); }
    pullDist = 0;
  }, { passive: true });
})();
