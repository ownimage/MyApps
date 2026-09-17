// CountMyDays — localStorage helpers (dates, categories, Google feed cache).
// All keys are namespaced through smdKey() with the app prefix
// ("countmydays_"). Images use the shared smd-images.js loadImages()/
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