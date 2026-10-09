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
    '<div class="d-flex align-items-center gap-3">' + iconHtml +
      '<div>' +
        '<div class="small text-body-secondary">Application</div>' +
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

// ---- Page 2: Layout (boilerplate) ----

function buildEditLayoutPage() {
  var page = document.getElementById("editLayoutPage");
  if (!page) return null;
  page.title = "Layout";
  page.content =
    '<div class="mb-3">' +
      '<label class="form-label" for="editLayoutSelect">Choose a layout</label>' +
      '<select id="editLayoutSelect" class="form-select">' +
        '<option value="">&mdash; Select a layout &mdash;</option>' +
        '<option value="default">Default (4 &times; 4)</option>' +
        '<option value="media">Media controls</option>' +
        '<option value="presenter">Presenter</option>' +
      '</select>' +
    '</div>' +
    '<button type="button" class="btn btn-outline-primary" onclick="createEditLayout()">Create new layout&hellip;</button>' +
    '<p class="form-text mt-3">Layout editing is not wired up yet.</p>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel" },
    { text: "Finish", variant: "success", action: "finish" }
  ];
  return page;
}

function createEditLayout() {
  _commLine("Edit App: layout editor not implemented yet", "info");
}

function openEditLayout() {
  var page = buildEditLayoutPage();
  if (!page) return;
  if (!page.__pbWizardBound) {
    page.__pbWizardBound = true;
    page.addEventListener("smd-page-action", function (e) {
      var action = e.detail && e.detail.action;
      if (action === "finish") _commLine("Edit App: finished (layout storage TBD)", "info");
      // "Cancel"/"Finish" just close (the page already hid itself).
    });
  }
  _openWizardPage(page);
}
