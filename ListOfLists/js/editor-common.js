// ListOfLists — helpers shared by the editor screens: image/category selector
// previews and active-view refresh.

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
