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

  // The settings Display tab uses the shared <smd-theme> component.
  smdBindThemeChange();

  // Shared image picker (#imagePickerPage) + the "Edit" buttons on this app's
  // <smd-image-select> fields.
  smdBindImagePicker();
  smdBindImageSelectActions({
    dateImageSelect: name => { dateField("image", name); updateDateImagePreview(); },
    categoryImageSelect: name => { categoryField("image", name); updateCategoryImagePreview(); },
    gcalImageSelect: name => { gcalEditBufferField("image", name); updateGcalImagePreview(); }
  });

  // Images editor (shared smd-images.js) page + card actions.
  smdBindImagesEditor();

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
smdEnablePullToRefresh();
