// PhoneButtons — "Edit Layout" wizard (main menu).
//
// Page 1 picks a layout from the shared <smd-image-dropdown>, fed by
// GET /api/layouts. Page 2 edits the layout's icon (chosen from the server's
// app-icon cache) and orientation, saved back via POST /api/save-layout.
// `layoutDropdownOptions()` is reused by the Edit App wizard's layout picker.

var _selectedLayoutKey = "";   // layout key chosen on page 1
var _layoutsByKey = {};        // key -> layout object (from GET /api/layouts)

// Map the server's layouts catalog to <pb-image-dropdown> options: the visible
// label is the displayName, `value` carries the layout KEY, and `imageUrl`
// points at the server's app-icon cache (blank until a layout has an image).
function layoutDropdownOptions(layouts) {
  return (layouts || []).map(function (layout) {
    return {
      name: layout.displayName || layout.key,
      value: layout.key,
      imageUrl: layout.image ? "/app-icon-cache/" + encodeURIComponent(layout.image) : ""
    };
  });
}

function buildLayoutSelectPage() {
  var page = document.getElementById("layoutSelectPage");
  if (!page) return null;
  page.title = "Select Layout";
  page.content =
    '<div class="mb-3">' +
      '<label class="form-label" for="layoutDropdown">Layout</label>' +
      '<pb-image-dropdown id="layoutDropdown"></pb-image-dropdown>' +
      '<div id="layoutSelectHint" class="form-text"></div>' +
    '</div>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel" },
    { text: "Next", variant: "primary", action: "next" }
  ];
  return page;
}

function loadLayoutsIntoDropdown() {
  var dropdown = document.getElementById("layoutDropdown");
  if (!dropdown) return;
  var hint = document.getElementById("layoutSelectHint");
  if (hint) hint.textContent = "Loading layouts\u2026";
  pbApi.getLayouts().then(function (layouts) {
    _layoutsByKey = {};
    layouts.forEach(function (layout) { _layoutsByKey[layout.key] = layout; });
    dropdown.options = layoutDropdownOptions(layouts);
    dropdown.selected = layouts.length ? (layouts[0].displayName || layouts[0].key) : "";
    _selectedLayoutKey = layouts.length ? layouts[0].key : "";
    var h = document.getElementById("layoutSelectHint");
    if (h) h.textContent = layouts.length ? "" : "No layouts found on the server.";
  }).catch(function (err) {
    var h = document.getElementById("layoutSelectHint");
    if (h) h.textContent = "Could not load layouts: " + err.message;
    _commLine("Edit Layout: load layouts failed: " + err.message, "error");
  });
}

function openEditLayoutWizard() {
  var page = buildLayoutSelectPage();
  if (!page) return;
  if (!page.__pbWizardBound) {
    page.__pbWizardBound = true;
    page.addEventListener("pb-image-dropdown-change", function (e) {
      var detail = e.detail || {};
      _selectedLayoutKey = detail.value || detail.name || "";
    });
    page.addEventListener("smd-page-action", function (e) {
      var action = e.detail && e.detail.action;
      if (action === "next") openEditLayoutPage();
    });
  }
  _openWizardPage(page);
  loadLayoutsIntoDropdown();
}

// ---- Page 2: the layout editor (icon + orientation) ----

function buildLayoutEditPage(layout) {
  var page = document.getElementById("layoutEditPage");
  if (!page) return null;
  page.title = "Layout";
  page.content =
    '<p class="text-body-secondary small mb-3">Editing <strong>' +
      escapeHtml(layout.displayName || layout.key) + '</strong></p>' +
    '<div class="row mb-3 align-items-center">' +
      '<div class="col-4 text-end"><label class="form-label mb-0" for="layoutIconSelect">Icon</label></div>' +
      '<div class="col-8">' +
        '<div class="d-flex align-items-center gap-2">' +
          '<img id="layoutIconPreview" class="rounded border" width="48" height="48" alt="" hidden>' +
          '<select id="layoutIconSelect" class="form-select" onchange="changeLayoutIcon(this.value)">' +
            '<option value="">&mdash; None &mdash;</option>' +
          '</select>' +
        '</div>' +
        '<div id="layoutIconHint" class="form-text"></div>' +
      '</div>' +
    '</div>' +
    '<div class="row mb-3 align-items-center">' +
      '<div class="col-4 text-end"><label class="form-label mb-0" for="layoutOrientationSelect">Orientation</label></div>' +
      '<div class="col-8">' +
        '<select id="layoutOrientationSelect" class="form-select">' +
          '<option value="landscape">Landscape</option>' +
          '<option value="portrait">Portrait</option>' +
        '</select>' +
      '</div>' +
    '</div>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel" },
    { text: "Finish", variant: "success", action: "finish" }
  ];
  return page;
}

// Show the chosen cached icon (or hide the preview for "None"). A missing file
// (the cache entry was deleted) is reported instead of leaving a broken image.
function changeLayoutIcon(name) {
  var img = document.getElementById("layoutIconPreview");
  var hint = document.getElementById("layoutIconHint");
  if (!name) {
    if (img) img.hidden = true;
    if (hint) hint.textContent = "";
    return;
  }
  if (!img) return;
  img.onload = function () {
    img.hidden = false;
    if (hint) hint.textContent = "";
  };
  img.onerror = function () {
    img.hidden = true;
    if (hint) hint.textContent = "Icon '" + name + "' is no longer in the server cache.";
  };
  img.src = "/app-icon-cache/" + encodeURIComponent(name);
}

function loadLayoutIconOptions(layout) {
  var select = document.getElementById("layoutIconSelect");
  var hint = document.getElementById("layoutIconHint");
  if (!select) return;
  pbApi.getAppIcons().then(function (icons) {
    select.innerHTML = '<option value="">&mdash; None &mdash;</option>';
    icons.forEach(function (name) {
      var opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    var stored = layout.image || "";
    // A saved icon that is no longer in the cache keeps an explicit "(missing)"
    // option so the user can see what was set and replace it.
    if (stored && icons.indexOf(stored) === -1) {
      var opt = document.createElement("option");
      opt.value = stored;
      opt.textContent = stored + " (missing)";
      select.appendChild(opt);
      if (hint) hint.textContent = "Saved icon '" + stored + "' is no longer in the server cache.";
    }
    select.value = stored;
    changeLayoutIcon(stored);
  }).catch(function (err) {
    if (hint) hint.textContent = "Could not load icons: " + err.message;
    _commLine("Edit Layout: load icons failed: " + err.message, "error");
  });
}

function saveLayout() {
  var select = document.getElementById("layoutIconSelect");
  var orientation = document.getElementById("layoutOrientationSelect");
  var existing = _layoutsByKey[_selectedLayoutKey] || {};
  var payload = {
    key: _selectedLayoutKey,
    displayName: existing.displayName || _selectedLayoutKey,
    image: select ? select.value : "",
    orientation: orientation ? orientation.value : "landscape"
  };
  pbApi.saveLayout(payload).then(function () {
    _layoutsByKey[_selectedLayoutKey] = payload;
    _commLine("Edit Layout: saved '" + payload.key + "' (icon " + (payload.image || "none") +
      ", " + payload.orientation + ")", "ok");
  }).catch(function (err) {
    _commLine("Edit Layout: save failed: " + err.message, "error");
  });
}

function openEditLayoutPage() {
  var layout = _layoutsByKey[_selectedLayoutKey] ||
    { key: _selectedLayoutKey, displayName: _selectedLayoutKey, image: "", orientation: "landscape" };
  var page = buildLayoutEditPage(layout);
  if (!page) return;
  if (!page.__pbWizardBound) {
    page.__pbWizardBound = true;
    page.addEventListener("smd-page-action", function (e) {
      var action = e.detail && e.detail.action;
      if (action === "finish") saveLayout();
    });
  }
  _openWizardPage(page);

  var orientation = document.getElementById("layoutOrientationSelect");
  if (orientation) orientation.value = layout.orientation === "portrait" ? "portrait" : "landscape";
  loadLayoutIconOptions(layout);
}
