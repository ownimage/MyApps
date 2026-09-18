// CountMyDays — dates editor: the dates list <smd-page> plus the single date
// add/edit <smd-page>. Card actions arrive as cmd-date-edit / cmd-date-delete
// events delegated on the host page.

let dateCategoryFilter = "";
let dateTitleSearch = "";
let filterShowLocal = true;
let filterShowGoogle = true;
let filterShowGoogleHidden = false;
let dateEditIndex = -1;
let dateEditBuffer = null;
let isNewDate = false;

const DATE_CATEGORY_NONE = "__none__";

function openDatesEditor() {
  hideMainPages("datesEditor");
  const page = document.getElementById("datesEditor");
  if (!page) return;
  page.classList.remove("d-none");
  injectEditorStyles(page);
  if (!page.__cmdBound) {
    page.__cmdBound = true;
    page.addEventListener("smd-page-action", handleDatesPageAction);
    page.addEventListener("cmd-date-edit", e => editUnifiedDateEntry(e.detail.source, e.detail.index));
    page.addEventListener("cmd-date-delete", e => confirmDeleteDate(e.detail.index));
  }
  renderDatesEditor();
  page.show();
}

function handleDatesPageAction(e) {
  const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
  if (action === "add") addNewDate();
  else if (action === "done") closeDatesEditor();
}

function closeDatesEditor() {
  const page = document.getElementById("datesEditor");
  if (page) {
    page.hide();
    setTimeout(() => page.classList.add("d-none"), Math.max(0, (page.slideDuration || 0) + 50));
  }
  document.getElementById("countdownContainer").classList.remove("d-none");
  dateEditIndex = -1;
  dateEditBuffer = null;
  isNewDate = false;
  renderMain();
}

function renderDatesEditor() {
  const page = document.getElementById("datesEditor");
  if (!page) return;
  if (!$id("dateList")) {
    page.title = "Edit Dates";
    page.content =
      '<div id="dateFilters" class="mb-3">' +
        '<div class="d-flex gap-2 align-items-center flex-wrap">' +
          '<input class="form-control" id="dateTitleSearch" type="search" placeholder="Search titles..." style="flex:1;min-width:150px" oninput="setDateTitleSearch(this.value)">' +
          '<button type="button" class="btn btn-danger btn-sm" onclick="clearDateFilters()">Clear</button>' +
        '</div>' +
        '<div class="d-flex gap-3 align-items-center flex-wrap mt-2">' +
          `<smd-image-dropdown id="dateCategoryFilter" key-prefix="${escAttr(smdImagePrefix())}" style="min-width:180px"></smd-image-dropdown>` +
          '<label class="d-flex gap-1 align-items-center"><input class="form-check-input" type="checkbox" id="filterShowLocal" onchange="setFilterShowLocal(this.checked)"> Local</label>' +
          '<label class="d-flex gap-1 align-items-center"><input class="form-check-input" type="checkbox" id="filterShowGoogle" onchange="setFilterShowGoogle(this.checked)"> Google</label>' +
          '<label class="d-flex gap-1 align-items-center"><input class="form-check-input" type="checkbox" id="filterShowGoogleHidden" onchange="setFilterShowGoogleHidden(this.checked)"> Google hidden</label>' +
        '</div>' +
      '</div>' +
      '<div id="dateList"></div>';
    page.buttons = [
      { text: "Add Date", variant: "primary", action: "add", close: false },
      { text: "Done", variant: "success", action: "done" }
    ];
  }
  if (!page.__cmdFiltersBound) {
    page.__cmdFiltersBound = true;
    const dd = $id("dateCategoryFilter");
    if (dd) {
      dd.addEventListener("smd-image-dropdown-change", e => {
        const name = e.detail && e.detail.name;
        if (!name || name === "All") setDateCategoryFilter("");
        else if (name === "None") setDateCategoryFilter(DATE_CATEGORY_NONE);
        else setDateCategoryFilter(name);
      });
    }
  }
  renderDateFilters();
  syncDateFilterCheckboxes();
  renderDateList();
}

function renderDateFilters() {
  const dd = $id("dateCategoryFilter");
  if (dd) {
    const cats = loadCategories().map(c => c.name).filter(Boolean);
    const catImages = {};
    loadCategories().forEach(c => { if (c.name) catImages[c.name] = c.image || ""; });
    dd.options = [{ name: "All", image: "" }, { name: "None", image: "" }].concat(cats.map(c => ({ name: c, image: catImages[c] })));
    dd.selected = dateCategoryFilter === DATE_CATEGORY_NONE ? "None" : (dateCategoryFilter || "All");
  }
  const input = $id("dateTitleSearch");
  if (input && input.value !== dateTitleSearch) input.value = dateTitleSearch;
}

function setDateCategoryFilter(val) {
  dateCategoryFilter = val;
  renderDateList();
}

function setDateTitleSearch(val) {
  dateTitleSearch = val;
  renderDateList();
}

function setFilterShowLocal(val) {
  filterShowLocal = !!val;
  renderDateList();
}

function setFilterShowGoogle(val) {
  filterShowGoogle = !!val;
  renderDateList();
}

function setFilterShowGoogleHidden(val) {
  filterShowGoogleHidden = !!val;
  renderDateList();
}

function clearDateFilters() {
  dateCategoryFilter = "";
  dateTitleSearch = "";
  filterShowLocal = true;
  filterShowGoogle = true;
  filterShowGoogleHidden = false;
  renderDateFilters();
  syncDateFilterCheckboxes();
  renderDateList();
}

function syncDateFilterCheckboxes() {
  const map = {
    filterShowLocal: filterShowLocal,
    filterShowGoogle: filterShowGoogle,
    filterShowGoogleHidden: filterShowGoogleHidden
  };
  Object.keys(map).forEach(id => {
    const el = $id(id);
    if (el) el.checked = map[id];
  });
}

// Local dates + Google Calendar events, tagged with their source.
function getUnifiedDateEntries() {
  const entries = loadDates().map((d, index) => ({ source: "local", index: index, d: d }));
  if (typeof loadGoogleCalFeed === "function" && typeof gcalEventToDate === "function") {
    const feed = loadGoogleCalFeed();
    if (feed && Array.isArray(feed.items)) {
      feed.items.forEach((evt, index) => {
        const d = gcalEventToDate(evt);
        // Include hidden events in the editor list (the filters decide visibility).
        if (d) entries.push({ source: "google", index: index, d: d, evt: evt });
      });
    }
  }
  return entries;
}

function editUnifiedDateEntry(source, index) {
  if (source === "google") {
    if (typeof openGoogleEventFromDates === "function") openGoogleEventFromDates(index);
    return;
  }
  editDate(index);
}

function renderDateList() {
  const list = $id("dateList");
  if (!list) return;
  list.innerHTML = "";

  const categories = loadCategories();

  const filtered = getUnifiedDateEntries()
    .filter(entry => {
      const d = entry.d;
      if (dateCategoryFilter === DATE_CATEGORY_NONE) {
        if (d.category) return false;
      } else if (dateCategoryFilter && d.category !== dateCategoryFilter) {
        return false;
      }
      if (dateTitleSearch && !(d.name || "").toLowerCase().includes(dateTitleSearch.toLowerCase())) return false;
      if (entry.source === "local") return filterShowLocal;
      if (d.show === false) return filterShowGoogleHidden;
      return filterShowGoogle;
    })
    .sort((a, b) => targetDate(a.d) - targetDate(b.d));

  filtered.forEach(entry => {
    const d = entry.d;
    const category = d.category ? categories.find(c => c.name === d.category) : null;
    const catImage = category ? (category.image || "") : "";

    let dateStr;
    if (entry.source === "google") {
      dateStr = formatDateShort(d);
    } else {
      const month = d.month || 1;
      const day = d.day || 1;
      const year = d.year || new Date().getFullYear();
      dateStr = d.type === "once"
        ? `${day} ${CMD_MONTHS[month - 1]} ${year}`
        : `${day} ${CMD_MONTHS[month - 1]}`;
    }

    const card = document.createElement("cmd-date-card");
    card.setAttribute("index", entry.index);
    card.setAttribute("name", d.name || "");
    card.setAttribute("category", d.category || "");
    card.setAttribute("date-text", dateStr);
    card.setAttribute("type", entry.source === "google"
      ? (d.recurring ? "recurring" : "once")
      : (d.type || "annual"));
    card.setAttribute("source", entry.source);
    card.setAttribute("recurring", d.recurring ? "true" : "false");
    card.setAttribute("hidden", d.show === false ? "true" : "false");
    card.setAttribute("key-prefix", smdImagePrefix());
    if (catImage) card.setAttribute("category-image", catImage);
    if (d.image) card.setAttribute("image", d.image);
    list.appendChild(card);
  });
}

// ---- single date add/edit page ----

function addNewDate() {
  const dates = loadDates();
  const categories = loadCategories();
  const newDate = {
    name: "New Event",
    category: categories.length > 0 ? categories[0].name : "",
    image: "",
    type: "annual",
    month: 1,
    day: 1
  };
  dates.push(newDate);
  saveDates(dates);
  dateCategoryFilter = "";
  dateTitleSearch = "";
  dateEditIndex = dates.length - 1;
  dateEditBuffer = JSON.parse(JSON.stringify(newDate));
  isNewDate = true;
  openDateEditPage();
}

function editDate(index) {
  const dates = loadDates();
  if (!dates[index]) return;
  dateEditBuffer = JSON.parse(JSON.stringify(dates[index]));
  dateEditIndex = index;
  isNewDate = false;
  openDateEditPage();
}

function openDateEditPage() {
  const page = document.getElementById("dateEditPage");
  if (!page) return;
  page.classList.remove("d-none");
  injectEditorStyles(page);
  if (!page.__cmdBound) {
    page.__cmdBound = true;
    page.addEventListener("smd-page-action", handleDateEditAction);
  }
  if (!page.__cmdDateCategoryBound) {
    page.__cmdDateCategoryBound = true;
    page.addEventListener("smd-image-dropdown-change", e => {
      // e.target is retargeted to this page host across the shadow boundary,
      // so identify the originating dropdown via composedPath().
      const path = e.composedPath ? e.composedPath() : [];
      if (!path.some(n => n && n.id === "dateCategorySelect")) return;
      const name = e.detail && e.detail.name;
      dateField("category", !name || name === "No Category" ? "" : name);
    });
  }
  if (!page.__cmdDatePickerBound) {
    page.__cmdDatePickerBound = true;
    page.addEventListener("smd-date-picker-change", e => {
      const path = e.composedPath ? e.composedPath() : [];
      if (!path.some(n => n && n.tagName === "SMD-DATE-PICKER")) return;
      applyOnceDateValue(e.detail && e.detail.value);
    });
  }
  page.title = isNewDate ? "Add Date" : "Edit Date";
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel", close: false },
    { text: "OK", variant: "success", action: "ok", close: false }
  ];
  renderDateEditContent();
  page.show();
}

function handleDateEditAction(e) {
  const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
  if (action === "ok") doneDateEdit();
  else if (action === "cancel") cancelDateEdit();
}

function renderDateEditContent() {
  const page = document.getElementById("dateEditPage");
  if (!page || !dateEditBuffer) return;
  const d = dateEditBuffer;
  const categories = loadCategories().slice().sort((a, b) => a.name.localeCompare(b.name));
  const day = d.day || 1;
  const month = d.month || 1;

  const catDropOptions = [{ name: "No Category", image: "" }]
    .concat(categories.map(c => ({ name: c.name, image: c.image || "" })));

  let dateHtml;
  if (d.type === "once") {
    dateHtml = '<smd-date-picker no-clear value="' + onceDateValue(d) + '" format="d/m/Y" alt-format="d/m/Y" style="min-width:130px"></smd-date-picker>';
  } else {
    dateHtml =
      '<select class="form-select" id="dateDaySelect" style="width:auto" onchange="dateField(\'day\', parseInt(this.value, 10))">' +
        Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${i + 1 === day ? "selected" : ""}>${i + 1}</option>`).join("") +
      '</select>' +
      '<select class="form-select" id="dateMonthSelect" style="width:auto" onchange="dateField(\'month\', parseInt(this.value, 10))">' +
        CMD_MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === month ? "selected" : ""}>${m}</option>`).join("") +
      '</select>';
  }

  page.content =
    '<div class="mb-3">' +
      '<label class="form-label mb-1">Title</label>' +
      `<input class="form-control" id="dateNameInput" value="${escAttr(d.name || "")}" oninput="dateField('name', this.value)">` +
    '</div>' +
    '<div class="d-flex gap-3 align-items-start flex-wrap mb-3">' +
      '<div>' +
        '<label class="form-label mb-1">Category</label>' +
        `<smd-image-dropdown id="dateCategorySelect" key-prefix="${escAttr(smdImagePrefix())}" style="min-width:220px"></smd-image-dropdown>` +
      '</div>' +
      '<div>' +
        '<label class="form-label mb-1">Image</label>' +
        `<smd-image-select id="dateImageSelect" key-prefix="${escAttr(smdImagePrefix())}" label-id="dateImageName" button-id="btnDateImageChoose"></smd-image-select>` +
      '</div>' +
    '</div>' +
    '<div class="d-flex gap-2 align-items-center flex-wrap">' +
      dateHtml +
      '<select class="form-select" id="dateTypeSelect" style="width:auto" onchange="dateField(\'type\', this.value)">' +
        `<option value="once" ${d.type === "once" ? "selected" : ""}>Once</option>` +
        `<option value="annual" ${d.type !== "once" ? "selected" : ""}>Annual</option>` +
      '</select>' +
    '</div>';

  updateDateImagePreview();
  const catSel = $id("dateCategorySelect");
  if (catSel) {
    catSel.options = catDropOptions;
    catSel.selected = d.category || "No Category";
  }
}

function dateField(field, value) {
  if (!dateEditBuffer) return;
  if (field === "type") {
    dateEditBuffer.type = value;
    if (value === "annual") delete dateEditBuffer.year;
    else dateEditBuffer.year = new Date().getFullYear();
    renderDateEditContent();
    return;
  }
  dateEditBuffer[field] = value;
}

function updateDateImagePreview() {
  const sel = $id("dateImageSelect");
  if (!sel || !dateEditBuffer) return;
  if (dateEditBuffer.image) sel.setAttribute("image", dateEditBuffer.image);
  else sel.removeAttribute("image");
}

// The once-date field is the shared <smd-date-picker>, which stores day/month/year
// here rather than an ISO string, so hand it a "d/m/Y" value (its `format`).
function onceDateValue(d) {
  const pad = n => String(n).padStart(2, "0");
  const y = d.year || new Date().getFullYear();
  return pad(d.day || 1) + "/" + pad(d.month || 1) + "/" + y;
}

// <smd-date-picker> emits the picked date (in `format`, i.e. "d/m/Y") on every
// change; round-trip it into the day/month/year buffer fields.
function applyOnceDateValue(value) {
  if (!dateEditBuffer) return;
  const m = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return;
  dateEditBuffer.day = parseInt(m[1], 10);
  dateEditBuffer.month = parseInt(m[2], 10);
  dateEditBuffer.year = parseInt(m[3], 10);
}

function doneDateEdit() {
  if (dateEditIndex >= 0 && dateEditBuffer) {
    const dates = loadDates();
    const buffer = dateEditBuffer;
    buffer.name = (buffer.name || "").trim() || "Untitled";
    if (buffer.type === "annual") {
      delete buffer.year;
    } else {
      // Safety net: whatever the field currently shows (picked via the
      // read-only date picker) is committed to the buffer even if the change
      // event did not fire, before saving.
      const input = $id("smdDatePickerInput");
      if (input) applyOnceDateValue(input.value);
    }
    dates[dateEditIndex] = buffer;
    saveDates(dates);
  }
  closeDateEditPage();
  renderDatesEditor();
}

function cancelDateEdit() {
  if (isNewDate && dateEditIndex >= 0) {
    const dates = loadDates();
    dates.splice(dateEditIndex, 1);
    saveDates(dates);
  }
  closeDateEditPage();
  renderDatesEditor();
}

function closeDateEditPage() {
  const page = document.getElementById("dateEditPage");
  if (page) {
    page.hide();
    setTimeout(() => page.classList.add("d-none"), Math.max(0, (page.slideDuration || 0) + 50));
  }
  dateEditIndex = -1;
  dateEditBuffer = null;
  isNewDate = false;
}

// ---- delete ----

function confirmDeleteDate(index) {
  const dates = loadDates();
  const name = dates[index] ? dates[index].name : "";
  showSmdModal({
    title: "Delete Date?",
    content: `Delete date "<strong>${escapeHtml(name)}</strong>"?`,
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function (detail) {
      if (detail.action !== "delete") return;
      deleteDate(index);
    }
  });
}

function deleteDate(index) {
  const dates = loadDates();
  dates.splice(index, 1);
  saveDates(dates);
  renderDateList();
}
