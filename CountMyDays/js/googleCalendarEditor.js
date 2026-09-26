// -------------------------------
// googleCalendarEditor.js - Edit Google Calendar events
// Ported from the newer standalone CountMyDays and adapted to the shared
// smd-page architecture:
//   - the list is #googleEventsPage (Edit Google Events), the single editor is
//     #googleEventEditPage; both use smd-page footers and the shared image
//     picker (smd-image-select).
//   - Title / Date / Once|Recurring are read-only. OK patches the event
//     description on Google and updates the cached feed.
// -------------------------------

let gcalEditingIndex = -1;
let gcalEditBuffer = null;
let gcalTitleSearch = "";
let gcalEditingEventId = null;
let gcalReturnToDates = false;

// ---- list page ----

function openGoogleEventsEditor() {
  gcalReturnToDates = false;
  hideMainPages("googleEventsPage");
  const page = document.getElementById("googleEventsPage");
  if (!page) return;
  page.classList.remove("d-none");
  injectEditorStyles(page);
  if (!page.__cmdBound) {
    page.__cmdBound = true;
    page.addEventListener("smd-page-action", e => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "done") closeGoogleEventsEditor();
    });
    page.addEventListener("cmd-date-edit", e => editGoogleEvent(e.detail.index));
  }
  gcalEditingIndex = -1;
  gcalEditBuffer = null;
  gcalEditingEventId = null;
  gcalTitleSearch = "";
  renderGoogleEventsEditor();
  page.show();
}

function closeGoogleEventsEditor() {
  const page = document.getElementById("googleEventsPage");
  if (page) {
    page.hide();
    setTimeout(() => page.classList.add("d-none"), Math.max(0, (page.slideDuration || 0) + 50));
  }
  gcalEditingIndex = -1;
  gcalEditBuffer = null;
  gcalEditingEventId = null;
  gcalTitleSearch = "";
  document.getElementById("countdownContainer").classList.remove("d-none");
  renderMain();
}

// Open a single Google event editor from Edit -> Dates, then return there on close.
function openGoogleEventFromDates(index) {
  gcalReturnToDates = true;
  const feed = loadGoogleCalFeed();
  if (!feed || !Array.isArray(feed.items) || !feed.items[index]) {
    gcalReturnToDates = false;
    return;
  }
  const d = gcalEventToDate(feed.items[index]);
  if (!d) {
    gcalReturnToDates = false;
    return;
  }
  gcalEditBuffer = JSON.parse(JSON.stringify(d));
  if (typeof gcalEditBuffer.show === "undefined") gcalEditBuffer.show = true;
  gcalEditingIndex = index;
  gcalEditingEventId = feed.items[index].id || null;
  openGcalEditPage();
}

function getGoogleEventEntries() {
  const feed = loadGoogleCalFeed();
  if (!feed || !Array.isArray(feed.items)) return [];
  return feed.items
    .map((evt, index) => {
      // Editor list needs hidden events too — gcalEventToDate always maps them.
      const d = gcalEventToDate(evt);
      if (!d) return null;
      return { d, index, evt };
    })
    .filter(Boolean)
    .sort((a, b) => targetDate(a.d) - targetDate(b.d));
}

function renderGoogleEventsEditor() {
  const page = document.getElementById("googleEventsPage");
  if (!page) return;

  if (!$id("gcalEditorList")) {
    page.title = "Edit Google Events";
    page.content =
      '<div id="gcalEditorFilters" class="mb-3">' +
        '<div class="d-flex gap-2 align-items-center flex-wrap">' +
          '<input class="form-control flex-grow-1" id="gcalTitleSearch" type="search" placeholder="Search titles..." style="min-width:150px" oninput="setGcalTitleSearch(this.value)">' +
          '<button type="button" class="btn btn-outline-secondary btn-sm" onclick="clearGcalTitleSearch()">Clear</button>' +
        '</div>' +
      '</div>' +
      '<div id="gcalEditorList"></div>';
    page.buttons = [{ text: "OK", variant: "success", action: "done" }];
  }

  const list = $id("gcalEditorList");
  if (!list) return;

  const searchInput = $id("gcalTitleSearch");
  if (searchInput && searchInput.value !== gcalTitleSearch) searchInput.value = gcalTitleSearch;

  const categories = loadCategories();
  const entries = getGoogleEventEntries();

  const filtered = entries.filter(({ d }) => {
    if (gcalTitleSearch && !d.name.toLowerCase().includes(gcalTitleSearch.toLowerCase())) return false;
    return true;
  });

  list.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "text-secondary mb-3";
    empty.textContent = entries.length === 0
      ? "No Google Calendar events cached. Use Google -> Refresh or Load sample data."
      : "No events match the search.";
    list.appendChild(empty);
  }

  filtered.forEach(({ d, index }) => {
    const card = document.createElement("cmd-date-card");
    card.className = "d-block mb-2";
    card.setAttribute("index", index);
    card.setAttribute("name", d.name || "");
    card.setAttribute("category", d.category || "");
    card.setAttribute("date-text", formatDateShort(d));
    card.setAttribute("type", d.recurring ? "recurring" : "once");
    card.setAttribute("source", "google");
    card.setAttribute("recurring", d.recurring ? "true" : "false");
    if (d.show === false) card.setAttribute("data-google-hidden", "true");
    else card.removeAttribute("data-google-hidden");
    card.setAttribute("key-prefix", smdImagePrefix());
    const category = d.category ? categories.find(c => c.name === d.category) : null;
    if (category && category.image) card.setAttribute("category-image", category.image);
    if (d.image) card.setAttribute("image", d.image);
    list.appendChild(card);
  });
}

function clearGcalTitleSearch() {
  gcalTitleSearch = "";
  const input = $id("gcalTitleSearch");
  if (input) input.value = "";
  renderGoogleEventsEditor();
}

function setGcalTitleSearch(val) {
  gcalTitleSearch = val;
  renderGoogleEventsEditor();
  const input = $id("gcalTitleSearch");
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function editGoogleEvent(index) {
  const entries = getGoogleEventEntries();
  const entry = entries.find(e => e.index === index);
  if (!entry) return;
  gcalEditBuffer = JSON.parse(JSON.stringify(entry.d));
  if (typeof gcalEditBuffer.show === "undefined") gcalEditBuffer.show = true;
  gcalEditingIndex = index;
  gcalEditingEventId = entry.evt && entry.evt.id ? entry.evt.id : null;
  openGcalEditPage();
}

// ---- single event edit page ----

function openGcalEditPage() {
  const page = document.getElementById("googleEventEditPage");
  if (!page) return;
  page.classList.remove("d-none");
  injectEditorStyles(page);
  if (!page.__cmdBound) {
    page.__cmdBound = true;
    page.addEventListener("smd-page-action", e => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "ok") doneGcalEditing();
      else if (action === "cancel") cancelGcalEditing();
    });
  }
  page.title = "Edit Google Event";
  page.buttons = [
    { text: "OK", variant: "success", action: "ok", close: false },
    { text: "Cancel", variant: "secondary", action: "cancel", close: false }
  ];
  renderGcalEditContent();
  page.show();
}

function renderGcalEditContent() {
  const page = document.getElementById("googleEventEditPage");
  if (!page || !gcalEditBuffer) return;
  const dateData = gcalEditBuffer;
  const categories = loadCategories().slice().sort((a, b) => a.name.localeCompare(b.name));
  const isRecurring = dateData.recurring === true;
  const typeStr = isRecurring ? "Recurring" : "Once";
  const dateStr = formatDateShort(dateData);
  const showChecked = dateData.show !== false;

  const catOptions = ['<option value="">No Category</option>']
    .concat(categories.map(c =>
      `<option value="${escAttr(c.name)}" ${dateData.category === c.name ? "selected" : ""}>${escapeHtml(c.name)}</option>`))
    .join("");

  page.content =
    '<div class="d-flex gap-3 align-items-start flex-wrap">' +
      '<div class="flex-shrink-0 text-center">' +
        `<smd-image id="gcalCategoryPreview" key-prefix="${escAttr(smdImagePrefix())}"></smd-image>` +
        `<select class="form-select mt-2" id="gcalCategorySelect" onchange="gcalEditBufferField('category', this.value)">${catOptions}</select>` +
      '</div>' +
      '<div class="flex-grow-1" style="min-width:220px">' +
        '<div class="mb-2">' +
          '<label class="form-label mb-1">Name</label>' +
          `<input class="form-control" value="${escAttr(dateData.name || "")}" readonly>` +
        '</div>' +
        '<div class="mb-2">' +
          '<label class="form-label mb-1">Date</label>' +
          `<input class="form-control" value="${escAttr(dateStr)}" readonly>` +
        '</div>' +
        '<div class="mb-2">' +
          '<label class="form-label mb-1">Type</label>' +
          `<input class="form-control" value="${escAttr(typeStr)}" readonly>` +
        '</div>' +
        '<div class="mb-3">' +
          `<smd-checkbox id="gcalShowCheck" ${showChecked ? "checked" : ""} onchange="gcalEditBufferField('show', this.checked)">Show</smd-checkbox>` +
        '</div>' +
        '<div class="mb-1">' +
          '<label class="form-label mb-1">Image</label>' +
          `<smd-image-select id="gcalImageSelect" key-prefix="${escAttr(smdImagePrefix())}" label-id="gcalImageName" button-id="btnGcalImageChoose"></smd-image-select>` +
        '</div>' +
      '</div>' +
    '</div>';

  updateGcalCategoryPreview();
  updateGcalImagePreview();
}

function cancelGcalEditing() {
  closeGcalEditPage();
  if (gcalReturnToDates) {
    gcalReturnToDates = false;
    if (typeof renderDatesEditor === "function") renderDatesEditor();
    return;
  }
  renderGoogleEventsEditor();
}

function closeGcalEditPage() {
  const page = document.getElementById("googleEventEditPage");
  if (page) {
    page.hide();
    setTimeout(() => page.classList.add("d-none"), Math.max(0, (page.slideDuration || 0) + 50));
  }
  gcalEditingIndex = -1;
  gcalEditBuffer = null;
  gcalEditingEventId = null;
}

function gcalEditBufferField(field, value) {
  if (!gcalEditBuffer) return;
  if (field !== "category" && field !== "image" && field !== "show") return;
  gcalEditBuffer[field] = value;
  if (field === "category") updateGcalCategoryPreview();
}

function updateGcalCategoryPreview() {
  const preview = $id("gcalCategoryPreview");
  if (!preview || !gcalEditBuffer) return;
  const category = loadCategories().find(c => c.name === gcalEditBuffer.category);
  const name = category ? (category.image || "") : "";
  if (name) preview.setAttribute("image", name);
  else preview.removeAttribute("image");
}

function updateGcalImagePreview() {
  const sel = $id("gcalImageSelect");
  if (!sel || !gcalEditBuffer) return;
  if (gcalEditBuffer.image) sel.setAttribute("image", gcalEditBuffer.image);
  else sel.removeAttribute("image");
}

// ---- save (PATCH description on Google) ----

function doneGcalEditing() {
  if (gcalEditingIndex < 0 || !gcalEditBuffer) {
    cancelGcalEditing();
    return;
  }

  if (!getGCalUserName()) {
    showAppInfoModal("Google Calendar", "Set your Name in Settings -> G Cal before saving event icons.");
    return;
  }

  const feed = loadGoogleCalFeed();
  if (!feed || !Array.isArray(feed.items)) {
    showAppInfoModal("Google Calendar", "No cached Google Calendar feed.");
    return;
  }

  const evt = feed.items[gcalEditingIndex];
  if (!evt) {
    showAppInfoModal("Google Calendar", "Event not found in cache.");
    return;
  }

  const category = gcalEditBuffer.category || "";
  const image = gcalEditBuffer.image || "";
  const show = gcalEditBuffer.show !== false;
  const cmd = { category: category, image: image, show: show };

  // Recurring instance: patch the master series event; apply settings to all local siblings.
  if (evt.recurringEventId) {
    const masterId = evt.recurringEventId;
    const seriesItems = feed.items.filter(item =>
      item && (item.recurringEventId === masterId || item.id === masterId)
    );
    const masterInCache = feed.items.find(item => item && item.id === masterId);
    const baseDescription = (masterInCache && masterInCache.description != null)
      ? masterInCache.description
      : evt.description;
    const newDescription = buildDescriptionWithCmdPayload(baseDescription, category, image, show);

    showSpinner();
    updateGoogleEventDescription(masterId, newDescription)
      .then(updated => {
        const desc = updated.description != null ? updated.description : newDescription;
        feed.items.forEach((item, i) => {
          if (!item) return;
          if (item.recurringEventId === masterId || item.id === masterId) {
            feed.items[i] = Object.assign({}, item, {
              description: item.id === masterId ? desc : item.description,
              _cmd: Object.assign({}, cmd)
            });
            if (item.id === masterId && updated && updated.etag) {
              feed.items[i].etag = updated.etag;
            }
          }
        });
        feed.items[gcalEditingIndex] = Object.assign({}, feed.items[gcalEditingIndex], {
          _cmd: Object.assign({}, cmd)
        });
        storeGoogleCalFeed(feed);
        hideSpinner();
        const n = seriesItems.length || 1;
        finishGcalSave("Series description updated. Applied settings to " + n + " local event(s).");
      })
      .catch(err => {
        hideSpinner();
        showAppInfoModal("Google Calendar", "Failed to update series: " + err.message);
      });
    return;
  }

  if (!evt.id) {
    showAppInfoModal("Google Calendar", "Event has no Google event id.");
    return;
  }

  const newDescription = buildDescriptionWithCmdPayload(evt.description, category, image, show);

  showSpinner();
  updateGoogleEventDescription(evt.id, newDescription)
    .then(updated => {
      feed.items[gcalEditingIndex] = Object.assign({}, evt, updated, {
        description: updated.description != null ? updated.description : newDescription,
        _cmd: Object.assign({}, cmd)
      });
      storeGoogleCalFeed(feed);
      hideSpinner();
      finishGcalSave("Event description updated.");
    })
    .catch(err => {
      hideSpinner();
      showAppInfoModal("Google Calendar", "Failed to update event: " + err.message);
    });
}

function finishGcalSave(message) {
  if (gcalReturnToDates) {
    closeGcalEditPage();
    gcalReturnToDates = false;
    if (typeof renderDatesEditor === "function") renderDatesEditor();
    showAppInfoModal("Google Calendar", message);
    return;
  }
  closeGcalEditPage();
  renderGoogleEventsEditor();
  showAppInfoModal("Google Calendar", message);
}
