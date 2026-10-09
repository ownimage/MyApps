// PhoneButtons — "Edit Layout" wizard (main menu).
//
// Page 1 picks a layout from the shared <smd-image-dropdown>, fed by
// GET /api/layouts; page 2 is the layout editor (a stub for now). The
// `layoutDropdownOptions()` builder is the piece the Edit App wizard's
// "Create new layout" flow will reuse.

var _selectedLayoutKey = "";

// Map the server's layouts catalog to <smd-image-dropdown> options: the
// visible label is the displayName, `value` carries the layout KEY (the
// dropdown's change event reports `value`). Image is blank until layouts
// carry one.
function layoutDropdownOptions(layouts) {
  return (layouts || []).map(function (layout) {
    return { name: layout.displayName || layout.key, value: layout.key, image: "" };
  });
}

function buildLayoutSelectPage() {
  var page = document.getElementById("layoutSelectPage");
  if (!page) return null;
  page.title = "Select Layout";
  page.content =
    '<div class="mb-3">' +
      '<label class="form-label" for="layoutDropdown">Layout</label>' +
      '<smd-image-dropdown id="layoutDropdown" key-prefix="shared-"></smd-image-dropdown>' +
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
    page.addEventListener("smd-image-dropdown-change", function (e) {
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

// ---- Page 2: the layout editor (stub) ----

function buildLayoutEditPage() {
  var page = document.getElementById("layoutEditPage");
  if (!page) return null;
  page.title = "Layout";
  page.content =
    '<p class="text-body-secondary small mb-0">Layout editor coming soon' +
    (_selectedLayoutKey ? ' for <strong>' + escapeHtml(_selectedLayoutKey) + '</strong>' : '') +
    '.</p>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel" },
    { text: "Finish", variant: "success", action: "finish" }
  ];
  return page;
}

function openEditLayoutPage() {
  var page = buildLayoutEditPage();
  if (!page) return;
  if (!page.__pbWizardBound) {
    page.__pbWizardBound = true;
    page.addEventListener("smd-page-action", function (e) {
      var action = e.detail && e.detail.action;
      if (action === "finish") _commLine("Edit Layout: finished (editor TBD)", "info");
    });
  }
  _openWizardPage(page);
}
