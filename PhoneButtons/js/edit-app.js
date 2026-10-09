// PhoneButtons — "Edit App" wizard.
//
// A short wizard built from the shared <smd-page> stack:
//   page 1 "Select App"  — shows the current foreground app (icon + name, as on
//                          the main view); Cancel / Next.
//   page 2 "Layout"      — boilerplate for picking or creating a layout; the
//                          actual layout storage/editor is TBD. Cancel / Finish.
//
// Footer buttons auto-hide their page on click (unless `close:false`), so the
// "Next"/"Finish" handlers only need to open the next page.

function _openWizardPage(page) {
  if (!page) return;
  page.classList.remove("d-none");
  page.show();
}

// Mirrors smdHideSettingsPage: add d-none once the slide finishes, but only if
// the page was not reopened in the meantime.
function _hideWizardPage(page) {
  if (!page) return;
  page.hide();
  var ms = page.slideDuration || 0;
  setTimeout(function () {
    if (!page.hasAttribute("open")) page.classList.add("d-none");
  }, ms + 50);
}

// ---- Page 1: Select App ----

function buildEditAppPage() {
  var page = document.getElementById("editAppPage");
  if (!page) return null;
  var app = _pbCurrentApp || {};
  var name = app.name || "Unknown";
  var iconHtml = app.icon
    ? '<img src="' + escAttr(app.icon) + '" alt="" width="48" height="48" class="rounded flex-shrink-0">'
    : '';
  page.title = "Select App";
  page.content =
    '<div class="d-flex flex-column" style="height:100%">' +
      '<p class="text-body-secondary small mb-2">Select the App on the PC, wait for it to be shown on this page, then press Next.</p>' +
      '<div id="editAppCenter" class="d-flex align-items-center justify-content-center gap-3 flex-fill">' +
        iconHtml +
        '<div class="fw-semibold">' + escapeHtml(name) + '</div>' +
      '</div>' +
    '</div>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel" },
    { text: "Next", variant: "primary", action: "next" }
  ];
  return page;
}

function openEditApp() {
  var page = buildEditAppPage();
  if (!page) return;
  if (!page.__pbWizardBound) {
    page.__pbWizardBound = true;
    page.addEventListener("smd-page-action", function (e) {
      var action = e.detail && e.detail.action;
      // "Cancel" just closes (the page already hid itself).
      if (action === "next") openEditLayout();
    });
  }
  _openWizardPage(page);
}

// ---- Page 2: Layout ----

// The layout key chosen in the <smd-image-dropdown> (its change event carries
// the key as `value`).
var _editAppLayoutKey = "";

function buildEditLayoutPage() {
  var page = document.getElementById("editLayoutPage");
  if (!page) return null;
  page.title = "Layout";
  page.content =
    '<div class="mb-3">' +
      '<label class="form-label" for="editLayoutDropdown">Choose a layout</label>' +
      '<pb-image-dropdown id="editLayoutDropdown"></pb-image-dropdown>' +
      '<div id="editLayoutHint" class="form-text"></div>' +
    '</div>' +
    '<button type="button" class="btn btn-outline-primary" onclick="createEditLayout()">Create new layout&hellip;</button>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel" },
    { text: "Finish", variant: "success", action: "finish" }
  ];
  return page;
}

function createEditLayout() {
  _commLine("Edit App: layout editor not implemented yet", "info");
}

// Persist the wizard's result (which layout the app uses) to the server.
function saveEditAppLayout() {
  var app = (_pbCurrentApp && _pbCurrentApp.name) || "";
  pbApi.saveAppLayout(app, _editAppLayoutKey).then(function () {
    _commLine("Edit App: saved layout '" + (_editAppLayoutKey || "none") + "' for " + (app || "?"), "ok");
  }).catch(function (err) {
    _commLine("Edit App: save layout failed: " + err.message, "error");
  });
}

function openEditLayout() {
  var page = buildEditLayoutPage();
  if (!page) return;
  if (!page.__pbWizardBound) {
    page.__pbWizardBound = true;
    page.addEventListener("pb-image-dropdown-change", function (e) {
      var detail = e.detail || {};
      _editAppLayoutKey = detail.value || detail.name || "";
    });
    page.addEventListener("smd-page-action", function (e) {
      var action = e.detail && e.detail.action;
      if (action === "finish") saveEditAppLayout();
      // "Cancel"/"Finish" just close (the page already hid itself).
    });
  }
  _openWizardPage(page);

  var hint = document.getElementById("editLayoutHint");
  if (hint) hint.textContent = "Loading layouts\u2026";
  pbApi.getLayouts().then(function (layouts) {
    var dd = document.getElementById("editLayoutDropdown");
    if (dd) {
      dd.options = layoutDropdownOptions(layouts);
      dd.selected = layouts.length ? (layouts[0].displayName || layouts[0].key) : "";
    }
    _editAppLayoutKey = layouts.length ? layouts[0].key : "";
    var h = document.getElementById("editLayoutHint");
    if (h) h.textContent = layouts.length ? "" : "No layouts found on the server.";
  }).catch(function (err) {
    var h = document.getElementById("editLayoutHint");
    if (h) h.textContent = "Could not load layouts: " + err.message;
    _commLine("Edit App: load layouts failed: " + err.message, "error");
  });
}
