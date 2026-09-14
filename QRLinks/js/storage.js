// QRLinks — localStorage helpers (links) plus the one-time legacy key
// migration. All keys are namespaced through smdKey() with the app prefix
// ("qrlinks_"). Images use the shared smd-images.js library ("shared-images").

function loadLinks() {
  return JSON.parse(localStorage.getItem(smdKey("links")) || "[]");
}

function saveLinks(links) {
  localStorage.setItem(smdKey("links"), JSON.stringify(links));
}

// Legacy storage migration for installs created before QRLinks moved into the
// multi-app repo (those stored every key unprefixed with a qr_ prefix). While
// this code is active, every startup shows a reminder modal — remove the
// migration AND showLegacyMigrationReminder() together once users have moved.
var QRLINK_LEGACY_STORAGE_MAP = {
  "qr_links": "links",
  "qr_theme": "theme",
  "qr_fontSize": "fontSize",
  "qr_iconSize": "iconSize",
  "qr_density": "density",
  "qr_autoHideMenu": "autoHideMenu",
  "qr_showDanger": "showDanger"
};

function migrateLegacyStorage() {
  Object.keys(QRLINK_LEGACY_STORAGE_MAP).forEach(function (legacyKey) {
    var legacy = localStorage.getItem(legacyKey);
    if (legacy === null) return;
    var namespacedKey = smdKey(QRLINK_LEGACY_STORAGE_MAP[legacyKey]);
    // Only copy when the namespaced key has no value yet, so seeded or newer
    // data is never overwritten by a stale legacy key.
    if (localStorage.getItem(namespacedKey) === null) {
      localStorage.setItem(namespacedKey, legacy);
    }
    localStorage.removeItem(legacyKey);
  });
}

// Startup reminder: this code is intentionally temporary.
// (`qr_images` is handled by the shared migrateImagesToShared().)
function showLegacyMigrationReminder() {
  if (typeof showSmdModal !== "function") return;
  showSmdModal({
    title: "Legacy migration still active",
    content: "QRLinks is still running the legacy storage migration " +
      "(storage.js migrateLegacyStorage). Remove it once existing installs " +
      "have migrated.",
    buttons: [{ text: "OK", variant: "primary", action: "ok" }]
  });
}
