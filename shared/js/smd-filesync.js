// FileSync settings tab (shared by PlanMyDay, CountMyDays, ListOfLists and
// Storyboard).
//
// The app's Settings page shows ONE "FileSync" tab with two sub-tabs:
//   Minio    - the existing shared smd-minio.js fields (markup and ids
//              unchanged, kept in <template id="fileSyncMinioTpl"> in each
//              shell)
//   OneDrive - the shared smd-onedrive.js fields
//
// Why <template>: smdGetSettingsSections() caches each settings section's
// innerHTML, so the two blocks must live in the declarative markup. Templates
// keep their ids out of the live document until the sub-tabs clone them, so
// there are never duplicate ids (loadMinioSettings/loadOneDriveSettings would
// otherwise find the template copy first).
//
// Each app needs exactly two calls:
//   loadFileSyncSettings()  from its settings `restore()` hook
//   updateFileSyncMenu()    at boot and whenever either provider is toggled

// Build the OneDrive/Minio sub-tabs from the two <template>s. Safe to call on
// every settings open: smd-tabs replaces its content each time. OneDrive is
// first (the newer integration); Minio keeps its existing ids.
function setupFileSyncTabs() {
  var tabsEl = $id("fileSyncTabs");
  if (!tabsEl) return;
  var minioTpl = document.getElementById("fileSyncMinioTpl");
  var oneDriveTpl = document.getElementById("fileSyncOneDriveTpl");
  tabsEl.tabs = [
    { title: "OneDrive", id: "filesync-onedrive-tab", content: oneDriveTpl ? oneDriveTpl.innerHTML : "" },
    { title: "Minio", id: "filesync-minio-tab", content: minioTpl ? minioTpl.innerHTML : "" }
  ];
}

// Restore both providers' fields and wire the tab-away behaviour. The MinIO
// helper lives in smd-minio.js; the OneDrive one in smd-onedrive.js.
function loadFileSyncSettings() {
  setupFileSyncTabs();
  if (typeof loadMinioSettings === "function") loadMinioSettings();
  if (typeof loadOneDriveSettings === "function") loadOneDriveSettings();
  if (typeof bindMinioSettingsTabBehavior === "function") bindMinioSettingsTabBehavior();
}

// Show/hide the hamburger groups for BOTH providers. Keeping one entry point
// means an app boot (and each provider's Enable switch) never has to remember
// the other provider.
function updateFileSyncMenu() {
  if (typeof updateMinioMenu === "function") updateMinioMenu();
  if (typeof updateOneDriveMenu === "function") updateOneDriveMenu();
}

// Provider-neutral helpers for the app-owned import hooks. A hook receives the
// provider ("minio" | "onedrive") and must close the page it came from.
function closeFileSyncImport(provider) {
  if (provider === "onedrive") {
    if (typeof closeOneDrivePage === "function") closeOneDrivePage();
  } else if (typeof closeMinioImport === "function") {
    closeMinioImport();
  }
}

function showFileSyncAlert(provider, message, type) {
  if (provider === "onedrive") {
    if (typeof showOneDriveAlert === "function") showOneDriveAlert(message, type);
  } else if (typeof showMinioAlert === "function") {
    showMinioAlert(message, type);
  }
}

// Activate the FileSync tab (and one of its sub-tabs). Used by the OneDrive
// page's "Open Settings" shortcut so the user lands on the right fields.
function focusFileSyncSettingsTab(which) {
  var outer = $id("settingsTabs");
  if (outer && Array.isArray(outer.tabs)) {
    for (var i = 0; i < outer.tabs.length; i++) {
      if (outer.tabs[i].id === "filesync-tab") {
        outer.activeIndex = i;
        break;
      }
    }
  }
  var inner = $id("fileSyncTabs");
  if (inner && Array.isArray(inner.tabs)) {
    var target = which === "onedrive" ? "filesync-onedrive-tab" : "filesync-minio-tab";
    for (var j = 0; j < inner.tabs.length; j++) {
      if (inner.tabs[j].id === target) {
        inner.activeIndex = j;
        break;
      }
    }
  }
}
