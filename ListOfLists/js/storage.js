// ListOfLists — localStorage storage helpers (categories, completed lists,
// main-page order). Loaded as a classic script so the functions stay global.

// STORAGE HELPERS
function loadCategories() {
  const categories = JSON.parse(localStorage.getItem(smdKey("categories")) || "[]");
  let nextId = Date.now();
  let changed = false;
  categories.forEach(t => {
    (t.lists || []).forEach(j => {
      if (!j.id) { j.id = "list_" + (nextId++); changed = true; }
    });
  });
  if (changed) saveCategories(categories);
  return categories;
}
function saveCategories(categories) {
  localStorage.setItem(smdKey("categories"), JSON.stringify(categories));
}

// LIST COMPLETION STORAGE
function loadCompletedLists() {
  const data = localStorage.getItem(smdKey("completed"));
  return data ? JSON.parse(data) : [];
}
function saveCompletedLists(ids) {
  localStorage.setItem(smdKey("completed"), JSON.stringify(ids));
}

// MAIN PAGE ORDER
function loadMainOrder() {
  const data = localStorage.getItem(smdKey("main_order"));
  return data ? JSON.parse(data) : null;
}
function saveMainOrder(order) {
  localStorage.setItem(smdKey("main_order"), JSON.stringify(order));
}
