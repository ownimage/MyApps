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

// ---- category ids ----
// A category is { id, name, image }. The ID is IMMUTABLE and is the reference
// stored in `category` on dates and in the Google Calendar {count_my_days{...}}
// payload. Legacy data referenced a category by NAME, so the temporary migration
// below defaults a missing id to that name: existing dates/Google payloads then
// already contain the id and need no rewriting. New categories use the next
// sequential numeric id (see nextCategoryId).
function categoryRef(category) {
  if (!category) return "";
  if (category.id !== undefined && category.id !== null && category.id !== "") {
    return String(category.id);
  }
  return category.name !== undefined && category.name !== null ? String(category.name) : "";
}

// Resolve an event's category reference. Id first (the canonical link), then
// name as a fallback for data written before ids existed / before CMD migrated.
function findCategoryByRef(ref, categories) {
  if (ref === undefined || ref === null || ref === "") return null;
  const cats = categories || loadCategories();
  const wanted = String(ref);
  return cats.find(c => categoryRef(c) === wanted)
    || cats.find(c => String(c.name) === wanted)
    || null;
}

function categoryNameForRef(ref, categories) {
  const category = findCategoryByRef(ref, categories);
  return category ? category.name : "";
}

// One more than the highest numeric id. A candidate that is already used as an
// id OR as a category NAME is skipped, so a category named "1" can never make a
// new id ambiguous.
function nextCategoryId(categories) {
  const cats = categories || loadCategories();
  const used = new Set();
  let highest = 0;
  cats.forEach(c => {
    const ref = categoryRef(c);
    if (ref) used.add(ref);
    if (c.name !== undefined && c.name !== null) used.add(String(c.name));
    const num = parseInt(ref, 10);
    if (!isNaN(num) && num > highest) highest = num;
  });
  let next = highest + 1;
  while (used.has(String(next))) next++;
  return String(next);
}

// TEMPORARY migration: give every legacy category an id (defaulting to its
// name). Returns the number of ids added. Remove this function, its boot call
// and the reminder modal once all stored data has ids.
function migrateCategoryIds() {
  const categories = loadCategories();
  let added = 0;
  categories.forEach(c => {
    if (!categoryRef(c)) return;
    if (c.id === undefined || c.id === null || c.id === "") {
      c.id = String(c.name || "");
      added++;
    }
  });
  if (added > 0) saveCategories(categories);
  return added;
}

function loadGoogleCalFeed() {
  return JSON.parse(localStorage.getItem(googleCalCacheKey()) || "null");
}

function storeGoogleCalFeed(feed) {
  localStorage.setItem(googleCalCacheKey(), JSON.stringify(feed));
}