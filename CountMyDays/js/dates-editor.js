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
          '<select class="form-select" id="dateCategoryFilter" style="width:auto;min-width:160px" onchange="setDateCategoryFilter(this.value)"></select>' +
          '<input class="form-control" id="dateTitleSearch" type="search" placeholder="Search titles..." style="flex:1;min-width:150px" oninput="setDateTitleSearch(this.value)">' +
          '<button type="button" class="btn btn-outline-secondary btn-sm" onclick="clearDateFilters()">Clear</button>' +
        '</div>' +
        '<div class="d-flex gap-3 align-items-center flex-wrap mt-2">' +
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
  renderDateFilters();
  syncDateFilterCheckboxes();
  renderDateList();
}

function renderDateFilters() {
  const select = $id("dateCategoryFilter");
  if (select) {
    const cats = loadCategories().map(c => c.name).filter(Boolean);
    select.innerHTML = '<option value="">All</option>' +
      cats.map(c => `<option value="${escAttr(c)}" ${dateCategoryFilter === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
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
      if (dateCategoryFilter && d.category !== dateCategoryFilter) return false;
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
  page.title = isNewDate ? "Add Date" : "Edit Date";
  page.buttons = [
    { text: "OK", variant: "success", action: "ok", close: false },
    { text: "Cancel", variant: "secondary", action: "cancel", close: false }
  ];
  renderDateEditContent();
  page.show();
  initDateFlatpickr();
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

  const catOptions = ['<option value="">No Category</option>']
    .concat(categories.map(c =>
      `<option value="${escAttr(c.name)}" ${d.category === c.name ? "selected" : ""}>${escapeHtml(c.name)}</option>`))
    .join("");

  let dateHtml;
  if (d.type === "once") {
    dateHtml = '<input type="text" id="dateOnceInput" class="form-control" placeholder="dd/mm/yyyy" style="min-width:130px;width:auto">';
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
    '<div class="d-flex gap-3 align-items-start flex-wrap">' +
      '<div class="flex-shrink-0 text-center">' +
        `<smd-image id="dateCategoryPreview" key-prefix="${escAttr(smdImagePrefix())}"></smd-image>` +
        `<select class="form-select mt-2" id="dateCategorySelect" onchange="dateField('category', this.value); updateDateCategoryPreview()">${catOptions}</select>` +
      '</div>' +
      '<div class="flex-grow-1" style="min-width:220px">' +
        '<div class="mb-2">' +
          '<label class="form-label mb-1">Name</label>' +
          `<input class="form-control" id="dateNameInput" value="${escAttr(d.name || "")}" oninput="dateField('name', this.value)">` +
        '</div>' +
        '<div class="d-flex gap-2 align-items-center flex-wrap mb-2">' +
          dateHtml +
          '<select class="form-select" id="dateTypeSelect" style="width:auto" onchange="dateField(\'type\', this.value)">' +
            `<option value="annual" ${d.type !== "once" ? "selected" : ""}>Annual</option>` +
            `<option value="once" ${d.type === "once" ? "selected" : ""}>Once</option>` +
          '</select>' +
        '</div>' +
        '<div class="mb-1">' +
          '<label class="form-label mb-1">Image</label>' +
          `<smd-image-select id="dateImageSelect" key-prefix="${escAttr(smdImagePrefix())}" label-id="dateImageName" button-id="btnDateImageChoose"></smd-image-select>` +
        '</div>' +
      '</div>' +
    '</div>';

  updateDateImagePreview();
  updateDateCategoryPreview();
}

function dateField(field, value) {
  if (!dateEditBuffer) return;
  if (field === "type") {
    dateEditBuffer.type = value;
    if (value === "annual") delete dateEditBuffer.year;
    else dateEditBuffer.year = new Date().getFullYear();
    renderDateEditContent();
    initDateFlatpickr();
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

function updateDateCategoryPreview() {
  const preview = $id("dateCategoryPreview");
  if (!preview || !dateEditBuffer) return;
  const category = loadCategories().find(c => c.name === dateEditBuffer.category);
  const name = category ? (category.image || "") : "";
  if (name) preview.setAttribute("image", name);
  else preview.removeAttribute("image");
}

function initDateFlatpickr() {
  if (typeof flatpickr === "undefined" || !dateEditBuffer) return;
  const input = $id("dateOnceInput");
  if (!input) return;
  if (input._flatpickr) input._flatpickr.destroy();
  const day = dateEditBuffer.day || 1;
  const month = dateEditBuffer.month || 1;
  const year = dateEditBuffer.year || new Date().getFullYear();
  flatpickr(input, {
    dateFormat: "d/m/Y",
    defaultDate: new Date(year, month - 1, day),
    allowInput: true,
    onChange: function (selectedDates) {
      if (selectedDates.length > 0 && dateEditBuffer) {
        const sel = selectedDates[0];
        dateEditBuffer.day = sel.getDate();
        dateEditBuffer.month = sel.getMonth() + 1;
        dateEditBuffer.year = sel.getFullYear();
      }
    }
  });
}

function doneDateEdit() {
  if (dateEditIndex >= 0 && dateEditBuffer) {
    const dates = loadDates();
    const buffer = dateEditBuffer;
    buffer.name = (buffer.name || "").trim() || "Untitled";
    if (buffer.type === "annual") delete buffer.year;
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
