// ListOfLists — the list edit page (general/schedule/items tabs, view + delete).

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
function listTimeChanged() {
  const h = $id("listTimeHour").value;
  const m = $id("listTimeMin").value;
  listField("time", h && m ? h + ":" + m : "");
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

function scheduleEl(id) {
  const host = document.getElementById("smdConfirmModal");
  return host ? host.querySelector("#" + id) : null;
}
function scheduleRadios() {
  const host = document.getElementById("smdConfirmModal");
  return host ? host.querySelectorAll('input[name="scheduleType"]') : [];
}

function getScheduleFormHTML() {
  return `
    <div class="mb-3">
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedDaily" value="daily" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedDaily">Every day</label>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedNDays" value="ndays" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedNDays">Every n days</label>
      </div>
      <div id="schedNDaysOptions" class="d-none ms-4 mb-2">
        <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
          <label class="form-label mb-0">Every</label>
          <smd-select class="form-select w-auto" id="schedNInterval" onchange="onScheduleNDaysChange()"></smd-select>
          <label class="form-label mb-0">day(s)</label>
          <label class="form-label mb-0 ms-2">Offset</label>
          <smd-select class="form-select w-auto" id="schedNOffset" onchange="onScheduleNDaysChange()"></smd-select>
        </div>
        <div id="schedNextDue" class="text-muted small"></div>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedWeekdays" value="weekdays" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedWeekdays">Weekdays (Mon&ndash;Fri)</label>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedWeekends" value="weekends" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedWeekends">Weekends (Sat&ndash;Sun)</label>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedDays" value="days" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedDays">Specific days</label>
      </div>
      <div id="schedDaysOptions" class="d-none ms-4 mb-2 d-flex gap-2 flex-wrap">
        <smd-checkbox id="schedDay0" value="0">Sun</smd-checkbox>
        <smd-checkbox id="schedDay1" value="1">Mon</smd-checkbox>
        <smd-checkbox id="schedDay2" value="2">Tue</smd-checkbox>
        <smd-checkbox id="schedDay3" value="3">Wed</smd-checkbox>
        <smd-checkbox id="schedDay4" value="4">Thu</smd-checkbox>
        <smd-checkbox id="schedDay5" value="5">Fri</smd-checkbox>
        <smd-checkbox id="schedDay6" value="6">Sat</smd-checkbox>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedMonthly" value="monthly" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedMonthly">Day of month</label>
      </div>
      <div id="schedMonthlyOptions" class="d-none ms-4 mb-2">
        <smd-select class="form-select w-auto" id="schedMonthlyDay"></smd-select>
      </div>
    </div>
  `;
}

function openScheduleModal() {
  const s = (listsBuffer && listsBuffer.schedule) || { type: "daily" };
  showSmdModal({
    title: "Schedule",
    content: getScheduleFormHTML(),
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "OK", variant: "primary", action: "ok" }
    ],
    onAction: function(detail) {
      if (detail.action === "ok") saveScheduleModal();
    }
  });
  scheduleRadios().forEach(r => r.checked = r.value === s.type);
  scheduleEl("schedDaysOptions").classList.toggle("d-none", s.type !== "days");
  scheduleEl("schedMonthlyOptions").classList.toggle("d-none", s.type !== "monthly");
  scheduleEl("schedNDaysOptions").classList.toggle("d-none", s.type !== "ndays");
  for (let i = 0; i < 7; i++) {
    scheduleEl("schedDay" + i).checked = (s.days || []).includes(i);
  }
  const mSel = scheduleEl("schedMonthlyDay");
  mSel.options = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
  mSel.value = String(s.date || 1);

  const intervalSel = scheduleEl("schedNInterval");
  intervalSel.options = Array.from({ length: 6 }, (_, i) => ({ value: String(i + 2), label: String(i + 2) }));
  intervalSel.value = String(s.interval || 2);

  const curInterval = s.interval || 2;
  const offsetSel = scheduleEl("schedNOffset");
  offsetSel.options = Array.from({ length: curInterval }, (_, i) => ({ value: String(i), label: String(i) }));
  offsetSel.value = String(s.offset != null ? s.offset : 0);
  if (s.type === "ndays") onScheduleNDaysChange();
}

function onScheduleTypeChange() {
  let checked = null;
  scheduleRadios().forEach(r => { if (r.checked) checked = r; });
  const type = checked ? checked.value : "daily";
  scheduleEl("schedDaysOptions").classList.toggle("d-none", type !== "days");
  scheduleEl("schedMonthlyOptions").classList.toggle("d-none", type !== "monthly");
  scheduleEl("schedNDaysOptions").classList.toggle("d-none", type !== "ndays");
  if (type === "ndays") onScheduleNDaysChange();
}

function onScheduleNDaysChange() {
  const interval = parseInt(scheduleEl("schedNInterval").value, 10) || 2;
  const offsetSel = scheduleEl("schedNOffset");
  const currentOffset = parseInt(offsetSel.value, 10) || 0;
  offsetSel.options = Array.from({ length: interval }, (_, i) => ({ value: String(i), label: String(i) }));
  offsetSel.value = String(Math.min(currentOffset, interval - 1));
  const offset = parseInt(offsetSel.value, 10) || 0;
  scheduleEl("schedNextDue").textContent = getNextDueText(interval, offset);
}

function saveScheduleModal() {
  let checked = null;
  scheduleRadios().forEach(r => { if (r.checked) checked = r; });
  const type = checked ? checked.value : "daily";
  let schedule = { type: type };
  if (type === "days") {
    schedule.days = [];
    for (let i = 0; i < 7; i++) {
      if (scheduleEl("schedDay" + i).checked) schedule.days.push(i);
    }
    if (schedule.days.length === 0) schedule = { type: "daily" };
  } else if (type === "monthly") {
    schedule.date = parseInt(scheduleEl("schedMonthlyDay").value, 10) || 1;
  } else if (type === "ndays") {
    schedule.interval = parseInt(scheduleEl("schedNInterval").value, 10) || 2;
    schedule.offset = parseInt(scheduleEl("schedNOffset").value, 10) || 0;
  }
  listField("schedule", schedule);
  const el = $id("listScheduleText");
  if (el) el.textContent = getScheduleText(schedule);
}

function getListEditPageContent(data, readOnly) {
  const disabled = readOnly ? "disabled" : "";
  const ro = readOnly ? "readonly" : "";
  return `
    <div class="row mb-1">
      <div class="col">
        <label class="form-label">Title</label>
      </div>
      <div class="col-auto d-flex align-items-center">
        <smd-checkbox id="listActiveCb" ${data.active !== false ? "checked" : ""} ${disabled} onchange="listField('active', this.checked)">Active</smd-checkbox>
      </div>
    </div>
    <div class="mb-2">
      <input class="form-control" id="listTitleInput" value="${escapeHtml(data.title || "")}" ${ro} oninput="listField('title', this.value);updateListEditOkBtn()" ${readOnly ? "" : "onkeydown=\"if(event.key==='Enter') listEditOk()\""}>
    </div>
    <smd-tabs id="listEditTabs"></smd-tabs>
  `;
}

function getListEditSections(data, readOnly) {
  return [
    { title: "General", id: "listGeneral-tab", content: getListGeneralTabHTML(data, readOnly) },
    { title: "Schedule", id: "listSchedule-tab", content: getListScheduleTabHTML(data, readOnly) },
    { title: "List Items", id: "listItems-tab", content: getListItemsTabHTML(data, readOnly), panelClass: "no-padding" }
  ];
}

function getListGeneralTabHTML(data, readOnly) {
  const disabled = readOnly ? "disabled" : "";
  return `
    <div class="row mb-2 mt-2">
      <div class="col-6 d-flex flex-column">
        <label class="form-label mb-0">Category</label>
        <div class="mt-1 flex-grow-1">
          <div class="list-category-picker">
            <smd-image-dropdown id="listCategoryDropdown" key-prefix="${escAttr(smdImagePrefix())}" ${readOnly ? "disabled" : ""}></smd-image-dropdown>
          </div>
        </div>
      </div>
      <div class="col-6 d-flex flex-column">
        <label class="form-label mb-0">Image</label>
        <div class="mt-1 flex-grow-1">
          <smd-image-select id="listImageSelect" key-prefix="${escAttr(smdImagePrefix())}" image="${escapeHtml(data.image || "")}" label-id="listImageName" button-id="btnListImageChange" ${readOnly ? "disabled" : ""}></smd-image-select>
        </div>
      </div>
    </div>
    <div class="mb-2">
      <label class="form-label">Description</label>
      <textarea class="form-control" rows="3" ${readOnly ? "readonly" : ""} oninput="listField('description', this.value)">${escapeHtml(data.description || "")}</textarea>
    </div>
    <div class="row mb-2">
      <div class="col-auto d-flex align-items-center">
        <smd-checkbox id="listSuffixCb" ${data.suffix ? "checked" : ""} ${disabled} onchange="listField('suffix', this.checked)">Suffix</smd-checkbox>
      </div>
      <div class="col">
        <smd-select class="form-select" ${disabled} onchange="listField('dayType', this.value)">
          <option value="dayOfYear" ${(data.dayType || "dayOfYear") === "dayOfYear" ? "selected" : ""}>Day of Year</option>
          <option value="dayOfMonth" ${data.dayType === "dayOfMonth" ? "selected" : ""}>Day of Month</option>
          <option value="dayOfWeek" ${data.dayType === "dayOfWeek" ? "selected" : ""}>Day of Week</option>
        </smd-select>
      </div>
      <div class="col">
        <smd-select class="form-select" ${disabled} onchange="listField('mod', this.value)">
          <option value="" ${!data.mod ? "selected" : ""}>None</option>
          <option value="2" ${data.mod === "2" ? "selected" : ""}>2</option>
          <option value="3" ${data.mod === "3" ? "selected" : ""}>3</option>
          <option value="4" ${data.mod === "4" ? "selected" : ""}>4</option>
          <option value="5" ${data.mod === "5" ? "selected" : ""}>5</option>
          <option value="6" ${data.mod === "6" ? "selected" : ""}>6</option>
          <option value="7" ${data.mod === "7" ? "selected" : ""}>7</option>
        </smd-select>
      </div>
    </div>
  `;
}

function getListScheduleTabHTML(data, readOnly) {
  const disabled = readOnly ? "disabled" : "";
  const ro = readOnly ? "readonly" : "";
  return `
    <div class="mb-2 mt-2">
      <label class="form-label">Schedule</label>
      <div class="d-flex align-items-center gap-2">
        <span id="listScheduleText">${escapeHtml(getScheduleText(data.schedule))}</span>
        <button class="btn btn-primary btn-sm" id="btnScheduleChange" ${disabled} onclick="openScheduleModal()">Edit</button>
      </div>
    </div>
    <div class="row mb-2">
      <div class="col">
        <label class="form-label">Sleep Until</label>
        <smd-date-picker id="listSleepPicker" ${readOnly ? "readonly" : ""} value="${escapeHtml(data.sleepUntil || "")}" first-day-of-week="${parseInt(localStorage.getItem(smdKey("startWeek")) || "1", 10)}"></smd-date-picker>
      </div>
    </div>
    <div class="row mb-2">
      <div class="col">
        <label class="form-label">Wait for</label>
        <input class="form-control" id="listWaitFor" value="${escapeHtml(data.waitFor || "")}" ${ro} placeholder="e.g. the delivery to arrive" oninput="listField('waitFor', this.value)">
      </div>
    </div>
    <div class="row mb-2">
      <div class="col">
        <label class="form-label">Schedule Time</label>
        <div class="d-flex gap-2">
          <smd-select class="form-select w-auto" id="listTimeHour" ${disabled} onchange="listTimeChanged()">
            <option value="" ${!data.time ? "selected" : ""}>-</option>
            ${Array.from({length: 24}, (_, i) => {
              const h = String(i).padStart(2, "0");
              const cur = data.time ? data.time.split(":")[0] : "";
              return `<option value="${h}" ${cur === h ? "selected" : ""}>${h}</option>`;
            }).join("")}
          </smd-select>
          <span class="align-self-center">:</span>
          <smd-select class="form-select w-auto" id="listTimeMin" ${disabled} onchange="listTimeChanged()">
            <option value="" ${!data.time ? "selected" : ""}>-</option>
            <option value="00" ${data.time && data.time.split(":")[1] === "00" ? "selected" : ""}>00</option>
            <option value="15" ${data.time && data.time.split(":")[1] === "15" ? "selected" : ""}>15</option>
            <option value="30" ${data.time && data.time.split(":")[1] === "30" ? "selected" : ""}>30</option>
            <option value="45" ${data.time && data.time.split(":")[1] === "45" ? "selected" : ""}>45</option>
          </smd-select>
        </div>
      </div>
    </div>
  `;
}

function getListItemsTabHTML(data, readOnly) {
  const disabled = readOnly ? "disabled" : "";
  return `
    <div class="mt-2">
      <button class="btn btn-primary mb-2" id="listAddItemBtn" ${disabled} onclick="listAddItemTop()">Add List Item</button>
      <lol-list-items id="listItemsList"${readOnly ? " read-only" : ""}></lol-list-items>
      <div class="mt-2">
        <button class="btn btn-primary" id="listAddItemBottomBtn" ${disabled} onclick="listAddItem()">Add List Item</button>
      </div>
    </div>
  `;
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

function buildListEditPage(readOnly, activeTabIndex) {
  if (!listsBuffer) return;
  const data = listsBuffer;
  const title = readOnly ? "View List" : (isNewList ? "Add List" : "Edit List");
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
        { text: "OK", variant: "success", action: "cancel", id: "listEditOkBtn" }
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

  const tabsEl = $id("listEditTabs");
  if (tabsEl) {
    tabsEl.tabs = getListEditSections(data, readOnly);
    if (typeof activeTabIndex === "number" && activeTabIndex > 0 && activeTabIndex < tabsEl.tabs.length) {
      tabsEl.activeIndex = activeTabIndex;
    }
  }
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
  var activeIdx = 0;
  var tabsEl = $id("listEditTabs");
  if (tabsEl) activeIdx = tabsEl.activeIndex;
  buildListEditPage(false, activeIdx);
}

function viewListReadOnly(categoryIdx, listIdx) {
  const categories = loadCategories();
  const category = categories[categoryIdx];
  if (!category) return;
  const lists = category.lists || [];
  const list = lists[listIdx];
  if (!list) return;
  listsBuffer = JSON.parse(JSON.stringify(list));
  if (listsBuffer.sleepUntil) {
    const today = getTodayStr();
    if (listsBuffer.sleepUntil < today) listsBuffer.sleepUntil = "";
  }
  listsCategoryIndex = categoryIdx;
  listsEditingIdx = listIdx;
  isNewList = false;
  buildListEditPage(true);
}

function editList(index) {
  var categories = loadCategories();
  var lists = categories[listsCategoryIndex].lists || [];
  listsBuffer = JSON.parse(JSON.stringify(lists[index]));
  if (listsBuffer.sleepUntil) {
    var today = getTodayStr();
    if (listsBuffer.sleepUntil < today) listsBuffer.sleepUntil = "";
  }
  listsEditingIdx = index; isNewList = false;
  buildListEditPage(false);
}

// Open the (editable) list editor on the Schedule tab with the "Sleep Until"
// picker pre-set to tomorrow and its calendar popped open. Used by the main
// view's swipe-right gesture (previously a silent "snooze until tomorrow").
function openListEditSchedule(categoryIdx, listIdx) {
  var categories = loadCategories();
  var category = categories[categoryIdx];
  var list = category && category.lists ? category.lists[listIdx] : null;
  if (!list) return;
  listsCategoryIndex = categoryIdx;
  listsBuffer = JSON.parse(JSON.stringify(list));
  listsBuffer.sleepUntil = getTomorrowStr();
  listsEditingIdx = listIdx;
  isNewList = false;
  buildListEditPage(false, 1);
  openListSleepPickerWhenReady();
}

// smd-page.show() defers the `open` attribute to the next frame and the page
// may then SLIDE in (slide-duration). Opening flatpickr while the page is still
// moving positions the calendar against the input's mid-slide location, so wait
// until the page is shown AND the picker's position is stable for two frames
// (i.e. the slide has finished) before opening. With slide-duration 0 the rect
// is stable immediately (opens on the second frame).
function openListSleepPickerWhenReady() {
  var page = document.getElementById("listEditPage");
  var attempts = 0;
  var lastLeft = null;
  var lastTop = null;
  function tryOpen() {
    var picker = $id("listSleepPicker");
    var raw = picker && picker.querySelector("#smdDatePickerInput");
    var fp = raw && raw._flatpickr;
    if (fp && page && page.hasAttribute("open") && picker) {
      var rect = picker.getBoundingClientRect();
      var settled = lastLeft !== null && rect.width > 0 &&
        Math.abs(rect.left - lastLeft) < 1 && Math.abs(rect.top - lastTop) < 1;
      lastLeft = rect.left;
      lastTop = rect.top;
      if (settled) {
        fp.open();
        return;
      }
    }
    if (attempts++ < 120) requestAnimationFrame(tryOpen);
  }
  requestAnimationFrame(tryOpen);
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
  var newList = { id: "list_" + Date.now(), title: "", sequence: seq, description: "", active: true, frequency: "daily", time: "", sleepUntil: "", waitFor: "", schedule: { type: "daily" }, items: [] };
  lists.push(newList);
  categories[listsCategoryIndex].lists = lists;
  saveCategories(categories);
  listsBuffer = JSON.parse(JSON.stringify(newList));
  listsEditingIdx = lists.length - 1; isNewList = true;
  buildListEditPage(false);
}
