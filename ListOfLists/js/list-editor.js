// ListOfLists — the list edit page (single page, view + delete).

// LISTS EDITOR
var listsCategoryIndex = -1;
var listsEditingIdx = -1;
var listsBuffer = null;
var isNewList = false;
var listsTargetCategoryIndex = -1;
var listItemsSortable = null;

function listField(field, value) {
  if (!listsBuffer) return;
  listsBuffer[field] = value;
}
function updateListEditOkBtn() {
  const okBtn = getListEditFooterBtn("done");
  if (!okBtn) return;
  const title = $id("listTitleInput");
  okBtn.disabled = !title || !title.value.trim();
}
function listAddItem() {
  if (!listsBuffer) return;
  if (!listsBuffer.items) listsBuffer.items = [];
  listsBuffer.items.push({ description: "", done: false, note: "" });
  renderListItems();
  var listEl = $id("listItemsList");
  var inputs = listEl ? listEl.querySelectorAll(".item-desc-input") : [];
  var last = inputs[inputs.length - 1];
  if (last) {
    last.focus();
    last.scrollIntoView({ block: "nearest" });
  }
}

function listAddItemTop() {
  if (!listsBuffer) return;
  if (!listsBuffer.items) listsBuffer.items = [];
  listsBuffer.items.unshift({ description: "", done: false, note: "" });
  renderListItems();
  var first = $id("listItemsList");
  first = first ? first.querySelector(".item-desc-input") : null;
  if (first) {
    first.focus();
    first.scrollIntoView({ block: "nearest" });
  }
}

function listDeleteItem(index) {
  if (!listsBuffer || !listsBuffer.items) return;
  var itemText = (listsBuffer.items[index] && listsBuffer.items[index].description) ? listsBuffer.items[index].description : "Unnamed list item";
  showSmdModal({
    title: "Delete List Item?",
    content: 'Delete list item "' + escapeHtml(itemText) + '"?',
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function(detail) {
      if (detail.action !== "delete") return;
      listsBuffer.items.splice(index, 1);
      renderListItems();
    }
  });
}

function listItemField(index, field, value) {
  if (!listsBuffer || !listsBuffer.items) return;
  listsBuffer.items[index][field] = value;
  if (field === "note") {
    var list = $id("listItemsList");
    if (list) {
      var row = list.querySelector('.item-row[data-item-index="' + index + '"]');
      if (row) setItemNoteBtnClass(row.querySelector(".item-note-btn"), listsBuffer.items[index]);
    }
  }
}

function setItemNoteBtnClass(btn, item) {
  if (!btn) return;
  var hasNote = !!(item && item.note);
  btn.classList.toggle("btn-outline-info", hasNote);
  btn.classList.toggle("btn-info", !hasNote);
}

function renderListItems() {
  var el = $id("listItemsList");
  if (!el || !listsBuffer) return;
  var items = listsBuffer.items || [];
  el.items = items;
  var topBtn = $id("listAddItemBtn");
  if (topBtn) {
    topBtn.classList.toggle("d-none", items.length < 1);
  }
  initListItemsSortable();
}

function initListItemsSortable() {
  if (listItemsSortable) {
    listItemsSortable.destroy();
    listItemsSortable = null;
  }
  if (typeof Sortable === "undefined") return;
  var el = $id("listItemsList");
  if (!el || !listsBuffer) return;
  if (!el.querySelector(".drag-handle")) return;
  listItemsSortable = new Sortable(el, {
    handle: ".drag-handle",
    draggable: ".item-row",
    animation: 150,
    onEnd: function() {
      if (!listsBuffer || !listsBuffer.items) return;
      var reordered = [];
      el.querySelectorAll(".item-row").forEach(function(row) {
        var idx = parseInt(row.getAttribute("data-item-index"), 10);
        if (idx >= 0 && idx < listsBuffer.items.length) reordered.push(listsBuffer.items[idx]);
      });
      if (reordered.length !== listsBuffer.items.length) return;
      listsBuffer.items = reordered;
      renderListItems();
    }
  });
}

function getListEditPageContent(data, readOnly) {
  // View mode is a lean view: the page h1 is the list title (set by
  // buildListEditPage) and the body shows ONLY the list items - the card already
  // showed the title/description/category/image, so those controls are dropped.
  // The items themselves are `view-only` (ticks + notes live, no delete/reorder).
  if (readOnly) {
    return `
      <div>
        <lol-list-items id="listItemsList" view-only></lol-list-items>
      </div>
    `;
  }
  const disabled = readOnly ? "disabled" : "";
  const ro = readOnly ? "readonly" : "";
  const showDescription = !!(data.description && data.description.trim());
  return `
    <div class="row mb-1">
      <div class="col">
        <label class="form-label">Title</label>
      </div>
      <div class="col-auto d-flex align-items-center">
        <smd-checkbox id="listActiveCb" ${data.active !== false ? "checked" : ""} ${disabled} onchange="listField('active', this.checked)">Show</smd-checkbox>
      </div>
    </div>
    <div class="mb-2">
      <input class="form-control" id="listTitleInput" value="${escapeHtml(data.title || "")}" ${ro} oninput="listField('title', this.value);updateListEditOkBtn()" ${readOnly ? "" : "onkeydown=\"if(event.key==='Enter') listEditOk()\""}>
    </div>
    <div class="d-flex align-items-center flex-wrap gap-2 mb-2">
      <div class="list-category-picker">
        <smd-image-dropdown id="listCategoryDropdown" key-prefix="${escAttr(smdImagePrefix())}" ${readOnly ? "disabled" : ""}></smd-image-dropdown>
      </div>
      <smd-image-select id="listImageSelect" key-prefix="${escAttr(smdImagePrefix())}" image="${escapeHtml(data.image || "")}" label-id="listImageName" button-id="btnListImageChange" ${readOnly ? "disabled" : ""}></smd-image-select>
      <smd-checkbox id="listShowDescription" ${showDescription ? "checked" : ""} onchange="toggleListDescription(this.checked)">Description</smd-checkbox>
    </div>
    <div id="listDescriptionWrap" class="mb-2${showDescription ? "" : " d-none"}">
      <textarea class="form-control" rows="3" ${readOnly ? "readonly" : ""} oninput="listField('description', this.value)">${escapeHtml(data.description || "")}</textarea>
    </div>
    <div>
      <button class="btn btn-primary mb-2" id="listAddItemBtn" ${disabled} onclick="listAddItemTop()">Add List Item</button>
      <lol-list-items id="listItemsList"></lol-list-items>
      <div class="mt-2">
        <button class="btn btn-primary" id="listAddItemBottomBtn" ${disabled} onclick="listAddItem()">Add List Item</button>
      </div>
    </div>
  `;
}

function toggleListDescription(show) {
  const wrap = $id("listDescriptionWrap");
  if (wrap) wrap.classList.toggle("d-none", !show);
}

var _listEditButtons = [];
var _listEditCloseTimer = null;
var _listEditReturnView = null;
var _listEditReturnPage = null;

function hideListEditBackground() {
  if (_listEditReturnView) return;
  const view = activeEditorView();
  _listEditReturnView = view;
  if (view === "categories") _listEditReturnPage = document.getElementById("categoriesEditor");
  else if (view === "search") _listEditReturnPage = document.getElementById("listSearchEditor");
  else _listEditReturnPage = null;

  const main = document.getElementById("mainContainer");
  if (view === "main" && main) main.classList.add("d-none");
  if (_listEditReturnPage) {
    _listEditReturnPage.hide();
    _listEditReturnPage.classList.add("d-none");
  }
}

function restoreListEditBackground() {
  const view = _listEditReturnView || "main";
  const page = _listEditReturnPage;
  _listEditReturnView = null;
  _listEditReturnPage = null;

  if (view === "categories" && page) {
    page.classList.remove("d-none");
    page.show();
  } else if (view === "search" && page) {
    page.classList.remove("d-none");
    page.show();
  } else {
    const main = document.getElementById("mainContainer");
    if (main) main.classList.remove("d-none");
  }
}

function buildListEditPage(readOnly) {
  if (!listsBuffer) return;
  const data = listsBuffer;
  const title = readOnly ? (data.title || "No Title") : (isNewList ? "Add List" : "Edit List");
  const page = document.getElementById("listEditPage");
  if (!page) return;

  hideListEditBackground();
  destroyListEditTransient();
  if (_listEditCloseTimer) {
    clearTimeout(_listEditCloseTimer);
    _listEditCloseTimer = null;
  }
  listsTargetCategoryIndex = listsCategoryIndex;

  _listEditButtons = readOnly
    ? [
        { text: "Edit", variant: "primary", action: "edit", id: "btnViewListEdit", close: false },
        { text: "OK", variant: "success", action: "done", id: "listEditOkBtn" }
      ]
    : [
        { text: "Cancel", variant: "secondary", action: "cancel", id: "listEditCancelBtn" },
        ...(isNewList ? [] : [{ text: "Delete", variant: "danger", action: "delete", id: "listEditDelBtn" }]),
        { text: "OK", variant: "success", action: "done", id: "listEditOkBtn" }
      ];

  page.classList.remove("d-none");
  page.title = title;
  page.content = getListEditPageContent(data, readOnly);
  page.buttons = _listEditButtons;

  injectListEditStyles();
  initListCategorySelect();
  renderListItems();
  if (!readOnly) {
    updateListEditOkBtn();
  }
  page.show();
  if (!readOnly && isNewList) focusListTitle();
}

function destroyListEditTransient() {
  if (listItemsSortable) {
    listItemsSortable.destroy();
    listItemsSortable = null;
  }
}

function hideListEditPage() {
  destroyListEditTransient();
  const page = document.getElementById("listEditPage");
  if (page) {
    page.hide();
    restoreListEditBackground();
    clearTimeout(_listEditCloseTimer);
    _listEditCloseTimer = setTimeout(function() {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
}

function focusListTitle() {
  requestAnimationFrame(function() {
    var el = $id("listTitleInput");
    if (el) el.focus();
  });
}

function getListEditFooterBtn(action) {
  const page = document.getElementById("listEditPage");
  if (!page) return null;
  const config = _listEditButtons.find(function(b) { return b.action === action; });
  if (!config || !config.id) return null;
  return page.querySelector("#" + config.id);
}

function listEditOk() {
  const okBtn = getListEditFooterBtn("done");
  if (okBtn && okBtn.disabled) return;
  doneListEdit();
}

function editListFromView() {
  if (!listsBuffer) return;
  buildListEditPage(false);
}

function viewListReadOnly(categoryIdx, listIdx) {
  const categories = loadCategories();
  const category = categories[categoryIdx];
  if (!category) return;
  const lists = category.lists || [];
  const list = lists[listIdx];
  if (!list) return;
  listsBuffer = JSON.parse(JSON.stringify(list));
  listsCategoryIndex = categoryIdx;
  listsEditingIdx = listIdx;
  isNewList = false;
  buildListEditPage(true);
}

function editList(index) {
  var categories = loadCategories();
  var lists = categories[listsCategoryIndex].lists || [];
  listsBuffer = JSON.parse(JSON.stringify(lists[index]));
  listsEditingIdx = index; isNewList = false;
  buildListEditPage(false);
}

function cancelListEdit() {
  hideListEditPage();
  if (isNewList && listsEditingIdx >= 0) {
    var categories = loadCategories();
    var lists = categories[listsCategoryIndex].lists || [];
    lists.splice(listsEditingIdx, 1);
    categories[listsCategoryIndex].lists = lists;
    saveCategories(categories);
  }
  listsEditingIdx = -1; listsBuffer = null; isNewList = false; listsTargetCategoryIndex = -1;
  refreshActiveView();
}

function doneListEdit() {
  var view = _listEditReturnView || activeEditorView();
  var savedId = null;
  if (listsEditingIdx >= 0 && listsBuffer) {
    var categories = loadCategories();
    savedId = listsBuffer.id;
    if (listsTargetCategoryIndex >= 0 && listsTargetCategoryIndex !== listsCategoryIndex) {
      var oldLists = categories[listsCategoryIndex].lists || [];
      oldLists.splice(listsEditingIdx, 1);
      oldLists.forEach(function(j, i) { j.sequence = i + 1; });
      categories[listsCategoryIndex].lists = oldLists;
      var newLists = categories[listsTargetCategoryIndex].lists || [];
      listsBuffer.sequence = newLists.length + 1;
      newLists.push(listsBuffer);
      categories[listsTargetCategoryIndex].lists = newLists;
    } else {
      var lists = categories[listsCategoryIndex].lists || [];
      lists[listsEditingIdx] = listsBuffer;
      categories[listsCategoryIndex].lists = lists;
    }
    saveCategories(categories);
  }
  hideListEditPage();
  listsEditingIdx = -1; listsBuffer = null; isNewList = false; listsTargetCategoryIndex = -1;
  if (view === "main") {
    var categories = loadCategories();
    var order = loadMainOrder() || [];
    var allActive = [];
    categories.forEach(function(t) { (t.lists || []).forEach(function(j) { if (j.active !== false) allActive.push(j.id); }); });
    var remaining = order.filter(function(id) { return allActive.includes(id); });
    allActive.forEach(function(id) { if (!remaining.includes(id)) remaining.push(id); });
    if (savedId && !remaining.includes(savedId)) remaining.push(savedId);
    saveMainOrder(remaining);
  } else if (view === "categories") {
    var editorCategories = loadCategories();
    var savedList = null;
    editorCategories.forEach(function(t) {
      if (!savedList) {
        var found = (t.lists || []).find(function(j) { return j.id === savedId; });
        if (found) savedList = found;
      }
    });
    if (savedId && savedList && savedList.active !== false && shouldShowListToday(savedList)) {
      var editorOrder = loadMainOrder() || [];
      if (editorOrder.indexOf(savedId) === -1) {
        editorOrder.push(savedId);
        saveMainOrder(editorOrder);
      }
    }
  }
  refreshActiveView();
}

function deleteListFromEdit() {
  var idx = listsEditingIdx;
  hideListEditPage();
  confirmDeleteList(idx);
}

function deleteListFromCategory(categoryIdx, index) {
  var s = loadCategories();
  var category = s[categoryIdx];
  if (!category) return null;
  var jbs = category.lists || [];
  var deletedId = (jbs[index] || {}).id;
  jbs.splice(index, 1);
  jbs.forEach(function(j, i) { j.sequence = i + 1; });
  category.lists = jbs;
  saveCategories(s);
  if (deletedId) {
    var order = loadMainOrder();
    if (order) {
      order = order.filter(function(id) { return id !== deletedId; });
      saveMainOrder(order);
    }
    var completed = loadCompletedLists();
    if (completed.indexOf(deletedId) !== -1) {
      saveCompletedLists(completed.filter(function(id) { return id !== deletedId; }));
    }
  }
  return deletedId;
}

function confirmDeleteList(index) {
  listsEditingIdx = index;
  var categories = loadCategories();
  var category = categories[listsCategoryIndex] || {};
  var lists = category.lists || [];
  var list = lists[index] || {};
  showSmdModal({
    title: "Delete List?",
    content: 'Delete "' + escapeHtml(list.title || "") + '" from "' + escapeHtml(category.title || "") + '"?',
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function(detail) {
      if (detail.action !== "delete") return;
      deleteListFromCategory(listsCategoryIndex, index);
      listsEditingIdx = -1; listsBuffer = null; isNewList = false;
      refreshActiveView();
    }
  });
}

function addNewList() {
  var categories = loadCategories();
  var lists = categories[listsCategoryIndex].lists || [];
  var seq = lists.length + 1;
  var newList = { id: "list_" + Date.now(), title: "", sequence: seq, description: "", active: true, items: [] };
  lists.push(newList);
  categories[listsCategoryIndex].lists = lists;
  saveCategories(categories);
  listsBuffer = JSON.parse(JSON.stringify(newList));
  listsEditingIdx = lists.length - 1; isNewList = true;
  buildListEditPage(false);
}
