// ListOfLists — helpers shared by the editor screens: list count badges,
// image/category selector previews, and active-view refresh.

function getListCountBadgeText(categories) {
  var totalDue = 0, totalActive = 0, totalLists = 0;
  categories.forEach(function(s) {
    var jbs = s.lists || [];
    totalDue += jbs.filter(function(j) { return j.active !== false && shouldShowListToday(j); }).length;
    totalActive += jbs.filter(function(j) { return j.active !== false; }).length;
    totalLists += jbs.length;
  });
  return totalDue + "/" + totalActive + "/" + totalLists + " list" + (totalLists !== 1 ? "s" : "");
}

function updateEditorListCountBadges() {
  var categories = loadCategories();
  var text = getListCountBadgeText(categories);
  ["editListsTotalBadge", "listSearchTotalBadge"].forEach(function(id) {
    var el = $id(id);
    if (el) el.textContent = text;
  });
  var page = document.getElementById("categoriesEditor");
  if (page) {
    page.querySelectorAll("lol-category-header").forEach(function(header) {
      var idx = parseInt(header.getAttribute("category-idx"), 10);
      if (isNaN(idx) || !categories[idx]) return;
      var lists = categories[idx].lists || [];
      var activeLists = lists.filter(function(j) { return j.active !== false; });
      var counts = "";
      if (lists.length > 0) {
        counts = activeLists.filter(function(j) { return shouldShowListToday(j); }).length + '/' +
                 activeLists.length + '/' + lists.length + ' list' + (lists.length !== 1 ? 's' : '');
      }
      if (counts) header.setAttribute("listcounts", counts);
      else header.removeAttribute("listcounts");
    });
  }
  return text;
}

function updateCategoryImagePreview(name) {
  var sel = $id("categoryImageSelect");
  if (sel) {
    if (name) sel.setAttribute("image", name);
    else sel.removeAttribute("image");
  }
  var nameEl = $id("categoryImageName");
  if (nameEl) nameEl.textContent = name;
}
function updateListImagePreview(name) {
  var sel = $id("listImageSelect");
  if (sel) {
    if (name) sel.setAttribute("image", name);
    else sel.removeAttribute("image");
  }
  var nameEl = $id("listImageName");
  if (nameEl) nameEl.textContent = name;
  var removeBtn = $id("listImageRemoveBtn");
  if (removeBtn) {
    if (name) removeBtn.classList.remove("d-none");
    else removeBtn.classList.add("d-none");
  }
}
// The category dropdown is the shared <smd-image-dropdown> component: the app
// only feeds it the category names (+ images) and the current selection, and
// reacts to smd-image-dropdown-change (detail { name }) mapped back to an index.
function categoryNameAt(idx) {
  var categories = loadCategories();
  return (categories[idx] && categories[idx].title) || "";
}
function categoryIndexByName(name) {
  var categories = loadCategories();
  return categories.findIndex(function (s) { return s.title === name; });
}
function initListCategorySelect() {
  const sel = $id("listCategoryDropdown");
  if (!sel) return;
  sel.options = loadCategories().map(function(s) {
    return { name: s.title || "", image: s.image || "" };
  });
  sel.selected = categoryNameAt(listsTargetCategoryIndex >= 0 ? listsTargetCategoryIndex : listsCategoryIndex);
}
function updateListCategoryPreview() {
  const sel = $id("listCategoryDropdown");
  if (sel) sel.selected = categoryNameAt(listsTargetCategoryIndex >= 0 ? listsTargetCategoryIndex : listsCategoryIndex);
}
function listChangeCategory(newIdx) {
  listsTargetCategoryIndex = newIdx;
  updateListCategoryPreview();
}

// Which screen is currently visible, so an editor that closes can re-render
// the right one (main view / categories editor / list search).
function activeEditorView() {
  var searchOpen = document.getElementById("listSearchEditor") && !document.getElementById("listSearchEditor").classList.contains("d-none");
  if (searchOpen) return "search";
  var fromMain = document.getElementById("categoriesEditor").classList.contains("d-none");
  return fromMain ? "main" : "categories";
}
function refreshActiveView() {
  var view = activeEditorView();
  if (view === "search") renderSearchLists();
  else if (view === "main") renderMain();
  else renderCategoriesEditor();
}
