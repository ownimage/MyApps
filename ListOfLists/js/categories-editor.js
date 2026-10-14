// ListOfLists — the categories editor (accordion list + category edit page).

// THREADS EDITOR
let editingIndex = -1;
let editBuffer = null;
let isNew = false;

var _categoriesCloseTimer = null;

function openCategoriesEditor() {
  document.getElementById("mainContainer").classList.add("d-none");
  document.getElementById("settingsPage").classList.add("d-none");
  document.getElementById("imagesEditor").classList.add("d-none");
  document.getElementById("listSearchEditor").classList.add("d-none");

  const page = document.getElementById("categoriesEditor");
  if (_categoriesCloseTimer) {
    clearTimeout(_categoriesCloseTimer);
    _categoriesCloseTimer = null;
  }
  page.classList.remove("d-none");
  renderCategoriesEditor();
  page.show();
}

function closeCategoriesEditor() {
  const page = document.getElementById("categoriesEditor");
  if (page) {
    page.hide();
    clearTimeout(_categoriesCloseTimer);
    _categoriesCloseTimer = setTimeout(function() {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
  document.getElementById("mainContainer").classList.remove("d-none");
  editingIndex = -1; editBuffer = null; isNew = false;
  renderMain();
}

var _categoryEditCloseTimer = null;

function openCategoryEditPage() {
  const categories = loadCategories();
  const t = categories[editingIndex];
  const data = editBuffer || t;
  const page = document.getElementById("categoryEditPage");
  if (!page) return;
  page.classList.remove("d-none");
  page.title = isNew ? "Add Category" : "Edit Category";
  page.content = getCategoryEditFormHTML(data);
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel", id: "btnCategoryEditCancel" },
    { text: "OK", variant: "success", action: "done", id: "btnCategoryEditOk" }
  ];
  page.show();
  updateCategoryEditOkBtn();
  if (isNew) {
    requestAnimationFrame(function() {
      const input = $id("categoryTitleInput");
      if (input) input.focus();
    });
  }
}

function hideCategoryEditPage() {
  const page = document.getElementById("categoryEditPage");
  if (page) {
    page.hide();
    clearTimeout(_categoryEditCloseTimer);
    _categoryEditCloseTimer = setTimeout(function() {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
}

function updateCategoryEditOkBtn() {
  const okBtn = $id("btnCategoryEditOk");
  const title = $id("categoryTitleInput");
  if (okBtn) okBtn.disabled = !title || !title.value.trim();
}

function categoryEditSubmit() {
  const okBtn = $id("btnCategoryEditOk");
  if (okBtn && !okBtn.disabled) doneEdit();
}

function getCategoryEditFormHTML(data) {
  return `
    <div class="mb-2">
      <label class="form-label">Title</label>
      <input class="form-control" id="categoryTitleInput" value="${escapeHtml(data.title || "")}" oninput="editField('title', this.value);updateCategoryEditOkBtn()" onkeydown="if(event.key==='Enter') categoryEditSubmit()">
    </div>
    <div class="mb-2">
      <label class="form-label">Image</label>
      <smd-image-select id="categoryImageSelect" key-prefix="${escAttr(smdImagePrefix())}" image="${escapeHtml(data.image || "")}" label-id="categoryImageName" button-id="btnCategoryImageChoose"></smd-image-select>
    </div>
    <div class="mb-2">
      <label class="form-label">Description</label>
      <textarea class="form-control" rows="3" oninput="editField('description', this.value)">${escapeHtml(data.description || "")}</textarea>
    </div>
  `;
}

function renderCategoriesEditor() {
  const page = document.getElementById("categoriesEditor");
  if (!page) return;

  // remember which accordion items are expanded (by index; after a drag the
  // captured indices are translated through the reorder so the same category stays open)
  const categories = loadCategories();
  var expandedCategories = [];
  if (categoriesEditorExpandedIdxs !== null) {
    // drag capture (onStart + onEnd) is authoritative: the DOM collapse ids no
    // longer match category indices once the reorder has been saved
    expandedCategories = categoriesEditorExpandedIdxs;
    categoriesEditorExpandedIdxs = null;
  } else {
    var openCollapses = page.querySelectorAll(".accordion-collapse.show");
    for (var ec = 0; ec < openCollapses.length; ec++) {
      var m = openCollapses[ec].id.match(/categoryCollapse_(\d+)/);
      if (m) expandedCategories.push(parseInt(m[1]));
    }
  }

  var sorted = [].concat(categories).sort(function(a, b) { return (a.sequence || 0) - (b.sequence || 0); });

  var accordionHtml = "";
  sorted.forEach(function(t, displayIdx) {
    var realIdx = categories.indexOf(t);
    var categoryImageName = t.image || "";
    var lists = t.lists || [];
    var collapseId = "categoryCollapse_" + realIdx;
    var isExpanded = expandedCategories.indexOf(realIdx) !== -1;

    var activeLists = lists.filter(function(j) { return j.active !== false; });
    var headerListCounts = lists.length > 0
      ? activeLists.filter(function(j) { return shouldShowListToday(j); }).length + '/' + activeLists.length + '/' + lists.length + ' list' + (lists.length !== 1 ? 's' : '')
      : "";
    var headerAttrs = [
      'category-idx="' + realIdx + '"',
      'title="' + escAttr(t.title || "") + '"',
      'key-prefix="' + escAttr(smdImagePrefix()) + '"',
      (isExpanded ? 'expanded' : ''),
      (lists.length === 0 ? 'can-delete' : '')
    ];
    if (categoryImageName) headerAttrs.push('image="' + escAttr(categoryImageName) + '"');
    if (headerListCounts) headerAttrs.push('listcounts="' + escAttr(headerListCounts) + '"');
    var headerHtml = '<lol-category-header class="d-block" ' + headerAttrs.filter(Boolean).join(" ") + '></lol-category-header>';

    var bodyHtml = '<div id="' + collapseId + '" class="accordion-collapse collapse' + (isExpanded ? " show" : "") + '">' +
      '<div class="accordion-body category-accordion-body p-0">' +
        (lists.length > 0 ? renderListsInAccordion(t, lists, realIdx) : '<div class="text-secondary small p-2">No lists</div>') +
      '</div>' +
    '</div>';

    accordionHtml += '<div class="accordion-item category-accordion-item category-drag-card mb-2 user-select-none border rounded overflow-hidden' + (isExpanded ? " expanded" : "") + '" data-category-idx="' + realIdx + '">' + headerHtml + bodyHtml + '</div>';
  });

  page.headerHtml = '<smd-badge id="editListsTotalBadge" variant="secondary" pill class="small align-middle"></smd-badge>';
  page.content =
    '<div id="categoriesEditorHeader" class="flex-shrink-0">' +
      '<div id="addCategoryTileTop" class="mb-3"></div>' +
      '<div id="categoryEditorFilters" class="mb-3"></div>' +
    '</div>' +
    '<div id="categoryEditorList" class="accordion pb-5">' + accordionHtml + '</div>' +
    '<div id="addCategoryTile" class="mt-3"></div>' +
    '<div id="singleCategoryEditor" class="d-none"></div>';

  page.buttons = [
    { text: "Add Category", variant: "primary", action: "add", id: "btnAddCategory", close: false },
    { text: "OK", variant: "success", action: "done", id: "btnCategoriesDone" }
  ];
  page.title = "Edit Categories";

  if (editingIndex >= 0) {
    openCategoryEditPage();
  }

  updateEditorListCountBadges();
  updateNavState();
  injectCategoriesEditorStyles();
  initCategoriesEditorSortable();
  initCategoryListsSortables();
}

function setCategoryExpanded(index, expanded) {
  const page = document.getElementById("categoriesEditor");
  if (!page) return;
  const root = page;
  const collapseEl = root.querySelector("#categoryCollapse_" + index);
  const itemEl = collapseEl ? collapseEl.closest(".category-accordion-item") : null;
  if (expanded) {
    // only one accordion section open at a time
    root.querySelectorAll(".accordion-collapse.show").forEach(function(coll) {
      if (coll === collapseEl) return;
      coll.classList.remove("show");
      const it = coll.closest(".category-accordion-item");
      if (it) {
        it.classList.remove("expanded");
        const h = it.querySelector("lol-category-header");
        if (h) h.removeAttribute("expanded");
      }
    });
  }
  if (collapseEl) collapseEl.classList.toggle("show", expanded);
  if (itemEl) itemEl.classList.toggle("expanded", expanded);
  if (itemEl) {
    const header = itemEl.querySelector("lol-category-header");
    if (header) {
      if (expanded) header.setAttribute("expanded", "");
      else header.removeAttribute("expanded");
    }
  }
}

var categoriesEditorSortable = null;
var categoriesEditorExpandedIdxs = null;

function initCategoriesEditorSortable() {
  if (categoriesEditorSortable) {
    categoriesEditorSortable.destroy();
    categoriesEditorSortable = null;
  }
  if (typeof Sortable === "undefined") return;
  var el = $id("categoryEditorList");
  if (!el || !el.querySelector(".category-accordion-item")) return;
  categoriesEditorSortable = new Sortable(el, {
    handle: ".category-accordion-header .drag-handle",
    draggable: ".category-accordion-item",
    animation: 150,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 0,
    fallbackClass: "sortable-fallback",
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    onStart: function(evt) {
      var idxs = [];
      el.querySelectorAll(".accordion-collapse.show").forEach(function(coll) {
        var m = coll.id.match(/categoryCollapse_(\d+)/);
        if (m) idxs.push(parseInt(m[1]));
      });
      categoriesEditorExpandedIdxs = idxs.length ? idxs : null;
      // Collapse every currently-open category (usually just one) so the whole
      // list compresses while dragging any header; onEnd re-expands the
      // captured (translated) set to its original state.
      var ghost = document.querySelector(".sortable-fallback");
      var ghostCollapse = ghost ? ghost.querySelector(".accordion-collapse.show") : null;
      var ghostHeader = ghost ? ghost.querySelector("lol-category-header") : null;
      idxs.forEach(function(idx) {
        setCategoryExpanded(idx, false);
      });
      // The fallback ghost is a deep clone made BEFORE onStart, so collapse its
      // copy of the open collapse too, or the drag preview stays expanded.
      if (ghostCollapse) ghostCollapse.classList.remove("show");
      if (ghostHeader) ghostHeader.removeAttribute("expanded");
      // Sortable pins a fixed inline height on the ghost; release it so the
      // collapsed preview is as short as the real collapsed header.
      if (ghost) ghost.style.height = "";
    },
    onEnd: function() {
      var categories = loadCategories();
      var order = [];
      el.querySelectorAll(".category-accordion-item").forEach(function(item) {
        var idx = parseInt(item.getAttribute("data-category-idx"), 10);
        if (!isNaN(idx) && order.indexOf(idx) === -1) order.push(idx);
      });
      if (order.length !== categories.length) return;
      // translate the captured pre-drag indices to their post-reorder positions
      // (order[k] is the old index now sitting at new position k)
      if (categoriesEditorExpandedIdxs !== null) {
        var translated = categoriesEditorExpandedIdxs.map(function(e) { return order.indexOf(e); })
                     .filter(function(k) { return k !== -1; });
        categoriesEditorExpandedIdxs = translated.length ? translated : null;
      }
      var reordered = order.map(function(idx) { return categories[idx]; });
      reordered.forEach(function(s, i) { s.sequence = i + 1; });
      saveCategories(reordered);
      renderCategoriesEditor();
    }
  });
}

var categoryListsSortables = [];

function initCategoryListsSortables() {
  categoryListsSortables.forEach(function(s) { if (s) s.destroy(); });
  categoryListsSortables = [];
  if (typeof Sortable === "undefined") return;
  var list = $id("categoryEditorList");
  if (!list) return;
  list.querySelectorAll(".accordion-body").forEach(function(body) {
    if (!body.querySelector(".list-drag-card")) return;
    var item = body.closest(".category-accordion-item");
    if (!item) return;
    categoryListsSortables.push(new Sortable(body, {
      handle: ".list-drag-card .drag-handle",
      draggable: ".list-drag-card",
      animation: 150,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 0,
      fallbackClass: "sortable-fallback",
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      onEnd: function() {
        var categoryIdx = parseInt(item.getAttribute("data-category-idx"), 10);
        if (isNaN(categoryIdx)) return;
        var categories = loadCategories();
        var lists = categories[categoryIdx].lists || [];
        var order = [];
        body.querySelectorAll(".list-drag-card").forEach(function(card) {
          var idx = parseInt(card.getAttribute("data-list-idx"), 10);
          if (!isNaN(idx) && order.indexOf(idx) === -1) order.push(idx);
        });
        if (order.length !== lists.length) return;
        var reordered = order.map(function(idx) { return lists[idx]; });
        reordered.forEach(function(j, i) { j.sequence = i + 1; });
        categories[categoryIdx].lists = reordered;
        saveCategories(categories);
        renderCategoriesEditor();
      }
    }));
  });
}

function renderListsInAccordion(category, lists, categoryIdx) {
  return lists.map(function(j, realIdx) {
    var scheduleText = getScheduleText(j.schedule);
    var listImageName = j.image || "";
    var hasSleep = j.sleepUntil && j.sleepUntil.trim();
    var hasWait = j.waitFor && j.waitFor.trim();
    var suffix = (getListSuffix(j) || "").trim();
    var extra = "";
    if (hasSleep) extra = "Sleep: " + formatDate(j.sleepUntil);
    else if (hasWait) extra = "Wait: " + j.waitFor.trim();
    var attrs = [
      'category-idx="' + categoryIdx + '"',
      'list-idx="' + realIdx + '"',
      'title="' + escAttr(j.title || "") + '"',
      'schedule="' + escAttr(scheduleText) + '"',
      'active="' + (j.active !== false ? "true" : "false") + '"',
      'key-prefix="' + escAttr(smdImagePrefix()) + '"'
    ];
    if (listImageName) attrs.push('image="' + escAttr(listImageName) + '"');
    if (j.time && j.time.trim()) attrs.push('time="' + escAttr(j.time.trim()) + '"');
    if (suffix) attrs.push('suffix="' + escAttr(suffix) + '"');
    if (extra) attrs.push('extra="' + escAttr(extra) + '"');
    return '<div class="list-drag-card mb-0 user-select-none" data-list-idx="' + realIdx + '">' +
      '<lol-list-summary-card class="d-block" variant="category" ' + attrs.join(" ") + '>' +
        '<smd-draghandle class="drag-handle" title="drag" slot="drag-handle"></smd-draghandle>' +
      '</lol-list-summary-card>' +
    '</div>';
  }).join("");
}

function addNewListForCategory(categoryIdx) {
  listsCategoryIndex = categoryIdx;
  addNewList();
}
function editListInAccordion(categoryIdx, listIdx) {
  listsCategoryIndex = categoryIdx;
  editList(listIdx);
}
function editField(field, value) {
  if (!editBuffer) return;
  editBuffer[field] = value;
}

function editCategory(index) {
  var categories = loadCategories();
  editBuffer = JSON.parse(JSON.stringify(categories[index]));
  editingIndex = index; isNew = false;
  openCategoryEditPage();
}

function cancelEdit() {
  hideCategoryEditPage();
  if (isNew && editingIndex >= 0) {
    var categories = loadCategories();
    categories.splice(editingIndex, 1);
    saveCategories(categories);
  }
  editingIndex = -1; editBuffer = null; isNew = false;
  renderCategoriesEditor();
}

function doneEdit() {
  if (editingIndex >= 0 && editBuffer) {
    var categories = loadCategories();
    categories[editingIndex] = editBuffer;
    saveCategories(categories);
  }
  hideCategoryEditPage();
  editingIndex = -1; editBuffer = null; isNew = false;
  renderCategoriesEditor();
}

function confirmDeleteCategory(index) {
  editingIndex = index;
  var categories = loadCategories();
  var category = categories[index] || {};
  showSmdModal({
    title: "Delete Category?",
    content: 'Delete category "' + escapeHtml(category.title || "") + '"?',
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function(detail) {
      if (detail.action !== "delete") return;
      var s = loadCategories();
      s.splice(index, 1);
      s.forEach(function(t, i) { t.sequence = i + 1; });
      saveCategories(s);
      editingIndex = -1; editBuffer = null; isNew = false;
      renderCategoriesEditor();
    }
  });
}

function addNewCategory() {
  var categories = loadCategories();
  var seq = categories.length + 1;
  var newCategory = { title: "", sequence: seq, description: "", lists: [] };
  categories.push(newCategory);
  saveCategories(categories);
  editBuffer = JSON.parse(JSON.stringify(newCategory));
  editingIndex = categories.length - 1; isNew = true;
  openCategoryEditPage();
}
