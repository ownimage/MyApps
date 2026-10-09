// PhoneButtons — "Manage App" page (main menu).
//
// ONE smd-page: pick a running application (server /api/apps) and the layout it
// uses (server /api/layouts, with an "Add Layout…" option underneath), then:
//   Cancel      — close.
//   Finish      — save the app -> layout assignment (POST /api/save-app-layout).
//   Edit Layout — open the Manage Layout page for the selected layout.
// This file also owns the shared <smd-page> open/close helpers used by the
// Manage Layout and Button editor pages.

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

// ---- Manage App page ----

var _manageAppName = "";      // selected running app name
var _manageAppLayoutKey = ""; // selected layout key
var _manageAppShowBackground = false; // "Show background apps" checkbox
var _manageAppsByName = {};           // app name -> app object (from /api/apps)
var _manageAppLayoutsByKey = {};      // layout key -> layout object

function buildManageAppPage(page) {
  page.title = "Manage App";
  page.content =
    '<div class="mb-3">' +
      '<smd-checkbox id="manageAppShowBackground" onchange="changeManageAppBackground(this.checked)">Show background apps</smd-checkbox>' +
    '</div>' +
    '<div class="mb-3">' +
      '<label class="form-label" for="manageAppDropdown">Application</label>' +
      '<pb-image-dropdown id="manageAppDropdown"></pb-image-dropdown>' +
      '<div id="manageAppHint" class="form-text"></div>' +
    '</div>' +
    '<div class="mb-3">' +
      '<label class="form-label" for="manageAppLayoutDropdown">Layout</label>' +
      '<pb-image-dropdown id="manageAppLayoutDropdown"></pb-image-dropdown>' +
    '</div>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel" },
    { text: "Finish", variant: "success", action: "finish", close: false },
    { text: "Edit Layout", variant: "primary", action: "edit-layout", close: false }
  ];
}

function setManageAppHint(msg) {
  var hint = document.getElementById("manageAppHint");
  if (hint) hint.textContent = msg || "";
}

function openManageApp() {
  var page = document.getElementById("manageAppPage");
  if (!page) return;
  if (!page.__pbBound) {
    page.__pbBound = true;
    page.addEventListener("pb-image-dropdown-change", function (e) {
      var id = e.target && e.target.id;
      var value = (e.detail && e.detail.value) || "";
      if (id === "manageAppDropdown") {
        _manageAppName = value;
        // The layout reflects the selected application.
        applyAppLayout(_manageAppsByName[value]);
      } else if (id === "manageAppLayoutDropdown") {
        if (value === "__add__") { openManageLayout("__add__"); return; }
        _manageAppLayoutKey = value;
      }
    });
    page.addEventListener("smd-page-action", function (e) {
      var action = e.detail && e.detail.action;
      if (action === "finish") finishManageApp();
      else if (action === "edit-layout") openManageLayout(_manageAppLayoutKey);
    });
  }
  _manageAppShowBackground = false;
  buildManageAppPage(page);
  _openWizardPage(page);
  loadManageApp();
}

function loadManageApp() {
  setManageAppHint("Loading\u2026");
  Promise.all([pbApi.getApps(), pbApi.getLayouts()]).then(function (res) {
    var apps = res[0], layouts = res[1];
    _manageAppsByName = {};
    apps.forEach(function (a) { _manageAppsByName[a.name] = a; });
    _manageAppLayoutsByKey = {};
    layouts.forEach(function (l) { _manageAppLayoutsByKey[l.key] = l; });

    // Layout dropdown: "Add Layout…" then the layouts.
    var layoutDd = document.getElementById("manageAppLayoutDropdown");
    if (layoutDd) {
      layoutDd.options = [{ name: "Add Layout\u2026", value: "__add__", imageUrl: "" }]
        .concat(layoutDropdownOptions(layouts));
    }
    renderManageAppOptions();
    setManageAppHint(apps.length ? "" : "No applications found.");
  }).catch(function (err) {
    setManageAppHint("Could not load: " + err.message);
    _commLine("Manage App: load failed: " + err.message, "error");
  });
}

// (Re)build the app dropdown from the loaded apps, honouring the background
// checkbox, and reflect the selected app's layout.
function renderManageAppOptions() {
  var appDd = document.getElementById("manageAppDropdown");
  if (!appDd) return;
  var apps = Object.keys(_manageAppsByName).map(function (k) { return _manageAppsByName[k]; })
    .filter(function (a) { return _manageAppShowBackground || !a.background; })
    .sort(function (a, b) { return a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
  appDd.options = apps.map(function (a) {
    return { name: a.name, value: a.name, imageUrl: a.icon || "" };
  });
  var pick = apps.filter(function (a) { return a.name === _manageAppName; })[0];
  if (!pick) {
    var current = _pbCurrentApp && _pbCurrentApp.name;
    pick = apps.filter(function (a) { return a.name === current; })[0] || apps[0];
  }
  if (pick) {
    appDd.selected = pick.name;
    _manageAppName = pick.name;
    applyAppLayout(_manageAppsByName[pick.name]);
  } else {
    _manageAppName = "";
  }
}

// Point the layout dropdown at the layout assigned to the given app (or the
// "Add Layout…" first option when the app has none).
function applyAppLayout(app) {
  var layoutDd = document.getElementById("manageAppLayoutDropdown");
  if (!layoutDd) return;
  var key = (app && app.layout) || "";
  if (key && _manageAppLayoutsByKey[key]) {
    layoutDd.selected = _manageAppLayoutsByKey[key].displayName || key;
    _manageAppLayoutKey = key;
  } else {
    layoutDd.selected = "";
    _manageAppLayoutKey = "";
  }
}

function changeManageAppBackground(showBackground) {
  _manageAppShowBackground = !!showBackground;
  renderManageAppOptions();
}

function finishManageApp() {
  if (!_manageAppName) { setManageAppHint("Select an application."); return; }
  var layout = _manageAppLayoutKey === "__add__" ? "" : _manageAppLayoutKey;
  pbApi.saveAppLayout(_manageAppName, layout).then(function () {
    _commLine("Manage App: saved " + _manageAppName + " \u2192 " + (layout || "none"), "ok");
    _hideWizardPage(document.getElementById("manageAppPage"));
  }).catch(function (err) {
    setManageAppHint("Save failed: " + err.message);
  });
}
