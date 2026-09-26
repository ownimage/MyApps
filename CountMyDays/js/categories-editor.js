// CountMyDays — categories editor: the categories list <smd-page> plus the
// single category add/edit <smd-page>. Card actions arrive as
// cmd-category-edit / cmd-category-delete events delegated on the host page.

let categoryNameSearch = "";
let categoryEditIndex = -1;
let editCategoryBuffer = null;
let isNewCategory = false;

function openCategoriesEditor() {
  hideMainPages("categoriesEditor");
  const page = document.getElementById("categoriesEditor");
  if (!page) return;
  page.classList.remove("d-none");
  injectEditorStyles(page);
  if (!page.__cmdBound) {
    page.__cmdBound = true;
    page.addEventListener("smd-page-action", handleCategoriesPageAction);
    page.addEventListener("cmd-category-edit", e => editCategory(e.detail.index));
    page.addEventListener("cmd-category-delete", e => confirmDeleteCategory(e.detail.index));
  }
  renderCategoriesEditor();
  page.show();
}

function handleCategoriesPageAction(e) {
  const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
  if (action === "add") addNewCategory();
  else if (action === "done") closeCategoriesEditor();
}

function closeCategoriesEditor() {
  const page = document.getElementById("categoriesEditor");
  if (page) {
    page.hide();
    setTimeout(() => page.classList.add("d-none"), Math.max(0, (page.slideDuration || 0) + 50));
  }
  document.getElementById("countdownContainer").classList.remove("d-none");
  categoryEditIndex = -1;
  editCategoryBuffer = null;
  isNewCategory = false;
  renderMain();
}

function renderCategoriesEditor() {
  const page = document.getElementById("categoriesEditor");
  if (!page) return;
  if (!$id("categoryList")) {
    page.title = "Edit Categories";
    page.content =
      '<div id="categoryFilters" class="mb-3">' +
        '<div class="d-flex gap-2 align-items-center flex-wrap">' +
          '<input class="form-control flex-grow-1" id="categoryNameSearch" type="search" placeholder="Search category names..." style="min-width:150px" oninput="setCategoryNameSearch(this.value)">' +
          '<button type="button" class="btn btn-outline-secondary btn-sm" onclick="clearCategoryNameSearch()">Clear</button>' +
        '</div>' +
      '</div>' +
      '<div id="categoryList"></div>';
    page.buttons = [
      { text: "Add Category", variant: "primary", action: "add", close: false },
      { text: "OK", variant: "success", action: "done" }
    ];
  }
  const input = $id("categoryNameSearch");
  if (input && input.value !== categoryNameSearch) input.value = categoryNameSearch;
  renderCategoryList();
}

function setCategoryNameSearch(val) {
  categoryNameSearch = val;
  renderCategoryList();
}

function clearCategoryNameSearch() {
  categoryNameSearch = "";
  const input = $id("categoryNameSearch");
  if (input) input.value = "";
  renderCategoryList();
}

function renderCategoryList() {
  const list = $id("categoryList");
  if (!list) return;
  list.innerHTML = "";

  const categories = loadCategories();
  const filtered = categories
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => {
      if (categoryNameSearch && !c.name.toLowerCase().includes(categoryNameSearch.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => a.c.name.localeCompare(b.c.name));

  filtered.forEach(({ c, index }) => {
    const card = document.createElement("cmd-category-card");
    card.className = "d-block mb-2";
    card.setAttribute("index", index);
    card.setAttribute("name", c.name || "");
    card.setAttribute("key-prefix", smdImagePrefix());
    if (c.image) card.setAttribute("image", c.image);
    list.appendChild(card);
  });
}

// ---- single category add/edit page ----

function addNewCategory() {
  const categories = loadCategories();
  categories.push({ name: "New Category", image: null });
  saveCategories(categories);
  categoryNameSearch = "";
  categoryEditIndex = categories.length - 1;
  editCategoryBuffer = JSON.parse(JSON.stringify(categories[categories.length - 1]));
  isNewCategory = true;
  openCategoryEditPage();
}

function editCategory(index) {
  const categories = loadCategories();
  if (!categories[index]) return;
  editCategoryBuffer = JSON.parse(JSON.stringify(categories[index]));
  categoryEditIndex = index;
  isNewCategory = false;
  openCategoryEditPage();
}

function openCategoryEditPage() {
  const page = document.getElementById("categoryEditPage");
  if (!page) return;
  page.classList.remove("d-none");
  injectEditorStyles(page);
  if (!page.__cmdBound) {
    page.__cmdBound = true;
    page.addEventListener("smd-page-action", handleCategoryEditAction);
  }
  page.title = isNewCategory ? "Add Category" : "Edit Category";
  page.buttons = [
    { text: "OK", variant: "success", action: "ok", close: false },
    { text: "Cancel", variant: "secondary", action: "cancel", close: false }
  ];
  renderCategoryEditContent();
  page.show();
  checkDuplicateCategoryName();
}

function handleCategoryEditAction(e) {
  const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
  if (action === "ok") doneCategoryEditing();
  else if (action === "cancel") cancelCategoryEditing();
}

function renderCategoryEditContent() {
  const page = document.getElementById("categoryEditPage");
  if (!page || !editCategoryBuffer) return;
  page.content =
    '<div class="d-flex gap-3 align-items-start flex-wrap">' +
      '<div class="flex-shrink-0 text-center">' +
        `<smd-image id="categoryImagePreview" key-prefix="${escAttr(smdImagePrefix())}"></smd-image>` +
      '</div>' +
      '<div class="flex-grow-1" style="min-width:220px">' +
        '<div class="mb-2">' +
          '<label class="form-label mb-1">Name</label>' +
          `<input class="form-control" id="categoryNameInput" value="${escAttr(editCategoryBuffer.name || "")}" oninput="categoryField('name', this.value); checkDuplicateCategoryName()">` +
          '<div id="categoryNameError" class="text-danger mt-1 d-none">ERROR: There is already a category with this name.</div>' +
        '</div>' +
        '<div class="mb-1">' +
          '<label class="form-label mb-1">Image</label>' +
          `<smd-image-select id="categoryImageSelect" key-prefix="${escAttr(smdImagePrefix())}" label-id="categoryImageName" button-id="btnCategoryImageChoose"></smd-image-select>` +
        '</div>' +
      '</div>' +
    '</div>';
  updateCategoryImagePreview();
}

function categoryField(field, value) {
  if (!editCategoryBuffer) return;
  editCategoryBuffer[field] = value;
}

function updateCategoryImagePreview() {
  const sel = $id("categoryImageSelect");
  const preview = $id("categoryImagePreview");
  const image = editCategoryBuffer ? (editCategoryBuffer.image || "") : "";
  [sel, preview].forEach(el => {
    if (!el) return;
    if (image) el.setAttribute("image", image);
    else el.removeAttribute("image");
  });
}

function checkDuplicateCategoryName() {
  const input = $id("categoryNameInput");
  if (!input || !editCategoryBuffer) return;
  const trimmed = input.value.trim();
  const categories = loadCategories();
  const hasDuplicate = categories.some((c, i) => i !== categoryEditIndex && c.name === trimmed);
  const errorEl = $id("categoryNameError");
  if (errorEl) errorEl.classList.toggle("d-none", !hasDuplicate);
  return !hasDuplicate;
}

function doneCategoryEditing() {
  if (!checkDuplicateCategoryName()) return;
  if (categoryEditIndex >= 0 && editCategoryBuffer) {
    editCategoryBuffer.name = (editCategoryBuffer.name || "").trim();
    if (!editCategoryBuffer.name) return;
    if (!editCategoryBuffer.image) editCategoryBuffer.image = null;
    const categories = loadCategories();
    const oldName = categories[categoryEditIndex] ? categories[categoryEditIndex].name : "";
    categories[categoryEditIndex] = editCategoryBuffer;
    saveCategories(categories);
    if (oldName !== editCategoryBuffer.name) {
      const dates = loadDates();
      dates.forEach(d => { if (d.category === oldName) d.category = editCategoryBuffer.name; });
      saveDates(dates);
    }
  }
  closeCategoryEditPage();
  renderCategoriesEditor();
}

function cancelCategoryEditing() {
  if (isNewCategory && categoryEditIndex >= 0) {
    const categories = loadCategories();
    categories.splice(categoryEditIndex, 1);
    saveCategories(categories);
  }
  closeCategoryEditPage();
  renderCategoriesEditor();
}

function closeCategoryEditPage() {
  const page = document.getElementById("categoryEditPage");
  if (page) {
    page.hide();
    setTimeout(() => page.classList.add("d-none"), Math.max(0, (page.slideDuration || 0) + 50));
  }
  categoryEditIndex = -1;
  editCategoryBuffer = null;
  isNewCategory = false;
}

// ---- delete ----

function confirmDeleteCategory(index) {
  const categories = loadCategories();
  const name = categories[index] ? categories[index].name : "";
  const usedByDates = loadDates().filter(d => d.category === name).length;
  let content = `Delete category "<strong>${escapeHtml(name)}</strong>"?`;
  if (usedByDates > 0) {
    content += `<br><br><span class="text-warning">This category is used by ${usedByDates} date${usedByDates === 1 ? "" : "s"}. The references will be cleared.</span>`;
  }
  showSmdModal({
    title: "Delete Category?",
    content: content,
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function (detail) {
      if (detail.action !== "delete") return;
      deleteCategory(index);
    }
  });
}

function deleteCategory(index) {
  const categories = loadCategories();
  const removed = categories[index] ? categories[index].name : "";
  categories.splice(index, 1);
  saveCategories(categories);

  const dates = loadDates();
  dates.forEach(d => { if (d.category === removed) d.category = null; });
  saveDates(dates);
  renderCategoryList();
}
