// CountMyDays — localStorage helpers (dates, categories) plus the one-time
// legacy key migration. All keys are namespaced through smdKey() with the app
// prefix ("countmydays_"). Images use the shared smd-images.js loadImages()/
// saveImages(), which read the SHARED image library ("shared-images") — all
// apps on the origin use one list.

function loadDates() {
  return JSON.parse(localStorage.getItem(smdKey("dates")) || "[]");
}

function saveDates(dates) {
  localStorage.setItem(smdKey("dates"), JSON.stringify(dates));
}

function loadCategories() {
  return JSON.parse(localStorage.getItem(smdKey("categories")) || "[]");
}

function saveCategories(categories) {
  localStorage.setItem(smdKey("categories"), JSON.stringify(categories));
}

function loadGoogleCalFeed() {
  return JSON.parse(localStorage.getItem(googleCalCacheKey()) || "null");
}

function storeGoogleCalFeed(feed) {
  localStorage.setItem(googleCalCacheKey(), JSON.stringify(feed));
}

// Legacy storage migration for installs created before CountMyDays moved into
// the multi-app repo (those stored every key unprefixed, including the
// cmd_gcal_* Google Calendar keys and the cmd_google_cal feed cache). While
// this code is active, every startup shows a reminder modal — remove the
// migration AND showLegacyMigrationReminder() together once users have moved.
var CMD_LEGACY_STORAGE_MAP = {
  "dates": "dates",
  "categories": "categories",
  "images": "images",
  "theme": "theme",
  "fontSize": "fontSize",
  "iconSize": "iconSize",
  "density": "density",
  "maxCountdowns": "maxCountdowns",
  "countdownFormat": "countdownFormat",
  "autoHideMenu": "autoHideMenu",
  "showDanger": "showDanger",
  "selectedCategory": "selectedCategory",
  "cmd_gcal_enabled": "gcal_enabled",
  "cmd_gcal_name": "gcal_name",
  "cmd_gcal_client_id": "gcal_client_id",
  "cmd_gcal_calendar_id": "gcal_calendar_id",
  "cmd_gcal_access_token": "gcal_access_token",
  "cmd_gcal_access_token_exp": "gcal_access_token_exp",
  "cmd_google_cal": "google_cal"
};

function migrateLegacyStorage() {
  Object.keys(CMD_LEGACY_STORAGE_MAP).forEach(function (legacyKey) {
    var legacy = localStorage.getItem(legacyKey);
    if (legacy === null) return;
    var namespacedKey = smdKey(CMD_LEGACY_STORAGE_MAP[legacyKey]);
    // Only copy when the namespaced key has no value yet, so seeded or newer
    // data is never overwritten by a stale legacy key.
    if (localStorage.getItem(namespacedKey) === null) {
      localStorage.setItem(namespacedKey, legacy);
    }
    localStorage.removeItem(legacyKey);
  });
}

// Startup reminder: this code is intentionally temporary.
function showLegacyMigrationReminder() {
  if (typeof showSmdModal !== "function") return;
  showSmdModal({
    title: "Legacy migration still active",
    content: "CountMyDays is still running the legacy storage migration " +
      "(storage.js migrateLegacyStorage). Remove it once existing installs " +
      "have migrated.",
    buttons: [{ text: "OK", variant: "primary", action: "ok" }]
  });
}
