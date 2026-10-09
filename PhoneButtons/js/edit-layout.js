// PhoneButtons — "Manage Layout" page (main menu).
//
// ONE smd-page: pick a layout from the <pb-image-dropdown> (which also offers
// "Add Layout…"), edit its display name / icon / orientation / buttons, and
// Finish to save via POST /api/save-layout. Choosing "Add Layout…" reveals a
// unique Key field used as the layout id. `layoutDropdownOptions()` is reused by
// the Edit App wizard's layout picker.

var _layoutsByKey = {};        // key -> layout object (from GET /api/layouts)
var _selectedLayoutKey = "";   // currently selected layout key ("" while adding)
var _selectedIconName = "";    // icon filename chosen for the layout
var _addingLayout = false;     // true while the "Add Layout…" option is active
var _appIcons = null;          // cached GET /api/app-icons list

// Map the server's layouts catalog to <pb-image-dropdown> options: the visible
// label is the displayName, `value` carries the layout KEY, and `imageUrl`
// points at the server's app-icon cache (blank until a layout has an image).
function layoutDropdownOptions(layouts) {
  return (layouts || []).map(function (layout) {
    return {
      name: layout.displayName || layout.key,
      value: layout.key,
      imageUrl: layout.image ? iconCacheUrl(layout.image) : ""
    };
  });
}

function iconCacheUrl(name) {
  return "/app-icon-cache/" + encodeURIComponent(name);
}

// Slug a display name into a layout key, kept unique against the loaded set.
function slugify(name) {
  return String(name || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueKey(base) {
  var key = base || "layout";
  if (!_layoutsByKey[key]) return key;
  var i = 2;
  while (_layoutsByKey[key + "-" + i]) i++;
  return key + "-" + i;
}

// ---- Manage Layout page ----

function buildManageLayoutContent(page) {
  page.title = "Manage Layout";
  page.content =
    '<div class="mb-3">' +
      '<label class="form-label" for="manageLayoutDropdown">Layout</label>' +
      '<pb-image-dropdown id="manageLayoutDropdown"></pb-image-dropdown>' +
      '<div id="manageLayoutHint" class="form-text"></div>' +
    '</div>' +
    '<div class="mb-3">' +
      '<label class="form-label" for="manageLayoutNameInput">Display name</label>' +
      '<input type="text" id="manageLayoutNameInput" class="form-control" placeholder="Layout name">' +
    '</div>' +
    '<div class="row mb-3 align-items-center">' +
      '<div class="col-4 text-end"><label class="form-label mb-0" for="layoutIconDropdown">Icon</label></div>' +
      '<div class="col-8">' +
        '<div class="d-flex align-items-center gap-2">' +
          '<img id="layoutIconPreview" class="rounded border" width="48" height="48" alt="" hidden>' +
          '<div class="flex-grow-1 min-w-0"><pb-image-dropdown id="layoutIconDropdown"></pb-image-dropdown></div>' +
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
    '</div>' +
    '<div id="manageLayoutButtons" class="d-grid gap-2 mb-3"></div>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel" },
    { text: "Finish", variant: "success", action: "finish", close: false }
  ];
}

function setManageHint(msg) {
  var hint = document.getElementById("manageLayoutHint");
  if (hint) hint.textContent = msg || "";
}

function openManageLayout() {
  var page = document.getElementById("manageLayoutPage");
  if (!page) return;
  if (!page.__pbWizardBound) {
    page.__pbWizardBound = true;
    page.addEventListener("pb-image-dropdown-change", function (e) {
      var id = e.target && e.target.id;
      var value = (e.detail && e.detail.value) || "";
      if (id === "manageLayoutDropdown") {
        if (value === "__add__") applyAddLayout();
        else if (_layoutsByKey[value]) applySelectedLayout(_layoutsByKey[value]);
      } else if (id === "layoutIconDropdown") {
        _selectedIconName = value;
        changeLayoutIcon(_selectedIconName);
      }
    });
    page.addEventListener("smd-page-action", function (e) {
      var action = e.detail && e.detail.action;
      if (action === "finish") finishManageLayout();
    });
  }
  buildManageLayoutContent(page);
  _openWizardPage(page);
  loadManageLayout();
}

function loadManageLayout() {
  var dropdown = document.getElementById("manageLayoutDropdown");
  setManageHint("Loading layouts\u2026");
  pbApi.getLayouts().then(function (layouts) {
    _layoutsByKey = {};
    layouts.forEach(function (layout) { _layoutsByKey[layout.key] = layout; });
    // "Add Layout…" is the TOP option, then the existing layouts.
    var options = [{ name: "Add Layout\u2026", value: "__add__", imageUrl: "" }]
      .concat(layoutDropdownOptions(layouts));
    if (dropdown) dropdown.options = options;
    setManageHint("");
    if (layouts.length) {
      var first = layouts[0];
      if (dropdown) dropdown.selected = first.displayName || first.key;
      applySelectedLayout(first);
    } else {
      if (dropdown) dropdown.selected = "Add Layout\u2026";
      applyAddLayout();
    }
  }).catch(function (err) {
    setManageHint("Could not load layouts: " + err.message);
    _commLine("Manage Layout: load layouts failed: " + err.message, "error");
  });
}

// Populate the fields from an existing layout.
function applySelectedLayout(layout) {
  _addingLayout = false;
  _selectedLayoutKey = layout.key;
  var nameInput = document.getElementById("manageLayoutNameInput");
  if (nameInput) nameInput.value = layout.displayName || layout.key;
  applyLayoutIconAndOrientation(layout);
  renderManageButtons(layout);
}

// Blank the fields for a brand-new layout (its key is auto-generated on save).
function applyAddLayout() {
  _addingLayout = true;
  _selectedLayoutKey = "";
  var nameInput = document.getElementById("manageLayoutNameInput");
  if (nameInput) nameInput.value = "";
  setManageHint("");
  applyLayoutIconAndOrientation({ image: "", orientation: "landscape" });
  renderManageButtons({ buttons: [] });
}

function applyLayoutIconAndOrientation(layout) {
  var orientation = document.getElementById("layoutOrientationSelect");
  if (orientation) orientation.value = layout.orientation === "portrait" ? "portrait" : "landscape";
  _selectedIconName = layout.image || "";
  loadLayoutIconOptions(layout);
}

function finishManageLayout() {
  var nameInput = document.getElementById("manageLayoutNameInput");
  var orientation = document.getElementById("layoutOrientationSelect");
  var displayName = nameInput ? nameInput.value.trim() : "";
  var orient = orientation ? orientation.value : "landscape";
  var key = _selectedLayoutKey;
  if (_addingLayout) {
    if (!displayName) { setManageHint("Enter a display name."); return; }
    // The key is auto-generated (and made unique) from the display name.
    key = uniqueKey(slugify(displayName));
  }
  if (!key) { setManageHint("Select or add a layout."); return; }
  var existing = _layoutsByKey[key] || {};
  setManageHint("");
  var payload = {
    key: key,
    displayName: displayName || key,
    image: _selectedIconName || "",
    orientation: orient,
    // Persist the buttons as part of the layout.
    buttons: existing.buttons || []
  };
  pbApi.saveLayout(payload).then(function () {
    _layoutsByKey[key] = payload;
    _commLine("Manage Layout: saved '" + key + "'", "ok");
    closeManageLayout();
  }).catch(function (err) {
    setManageHint("Save failed: " + err.message);
  });
}

function closeManageLayout() {
  _hideWizardPage(document.getElementById("manageLayoutPage"));
}

// ---- Layout buttons (image + name) ----

function renderManageButtons(layout) {
  var container = document.getElementById("manageLayoutButtons");
  if (container) container.innerHTML = layoutButtonHtml(layout, 0) + layoutButtonHtml(layout, 1);
}

// A layout button shows its shared image (if set) with the name beside it.
function layoutButtonHtml(layout, index) {
  var btn = (layout.buttons && layout.buttons[index]) || {};
  var name = btn.name || ("Button " + (index + 1));
  var image = btn.image || "";
  return '<button type="button" id="layoutButton' + (index + 1) +
    '" class="btn btn-outline-primary d-flex align-items-center gap-2 text-start" onclick="openButtonEditor(' + index + ')">' +
    '<smd-image key-prefix="shared-"' + (image ? ' image="' + escAttr(image) + '"' : '') + '></smd-image>' +
    '<span id="layoutButtonName' + (index + 1) + '">' + escapeHtml(name) + '</span>' +
    '</button>';
}

// Reflect a saved button back onto the (possibly suspended) manage page.
function refreshLayoutButton(index) {
  var layout = _layoutsByKey[_selectedLayoutKey] || {};
  var btn = (layout.buttons && layout.buttons[index]) || {};
  var nameEl = document.getElementById("layoutButtonName" + (index + 1));
  if (nameEl) nameEl.textContent = btn.name || ("Button " + (index + 1));
  var img = document.querySelector("#layoutButton" + (index + 1) + " smd-image");
  if (img) {
    if (btn.image) img.setAttribute("image", btn.image);
    else img.removeAttribute("image");
  }
}

// ---- Layout icon picker (server app-icon cache) ----

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
  img.src = iconCacheUrl(name);
}

function loadLayoutIconOptions(layout) {
  var dropdown = document.getElementById("layoutIconDropdown");
  var hint = document.getElementById("layoutIconHint");
  if (!dropdown) return;
  var apply = function (icons) {
    var options = [{ name: "None", value: "", imageUrl: "" }];
    icons.forEach(function (name) {
      options.push({ name: name, value: name, imageUrl: iconCacheUrl(name) });
    });
    var stored = layout.image || "";
    var missing = !!stored && icons.indexOf(stored) === -1;
    if (missing) {
      // An explicit option for an icon that is no longer in the cache, so the
      // user can see what was set and replace it.
      options.push({ name: stored + " (missing)", value: stored, imageUrl: iconCacheUrl(stored) });
    }
    dropdown.options = options;
    dropdown.selected = missing ? (stored + " (missing)") : (stored || "None");
    _selectedIconName = stored;
    if (hint) hint.textContent = missing ? "Saved icon '" + stored + "' is no longer in the server cache." : "";
    changeLayoutIcon(stored);
  };
  if (_appIcons) { apply(_appIcons); return; }
  pbApi.getAppIcons().then(function (icons) {
    _appIcons = icons;
    apply(icons);
  }).catch(function (err) {
    if (hint) hint.textContent = "Could not load icons: " + err.message;
    _commLine("Manage Layout: load icons failed: " + err.message, "error");
  });
}

// ---- Button editor (smd-page) ----
//
// Edits one layout button: a shared-library image (via <smd-image-select> + the
// shared image picker) and a key combination (Ctrl/Alt/Shift + a character or a
// named/media key). Saved per layout through POST /api/save-layout-button.

var _editingButtonIndex = 0;
var _buttonImage = "";

// Named keys the server's _KEY_MAP understands (plus media keys).
var BUTTON_NAMED_KEYS = [
  "BACKSPACE", "TAB", "ENTER", "ESCAPE", "SPACE", "DELETE",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
  "LEFT", "RIGHT", "UP", "DOWN",
  "VOLUME_MUTE", "VOLUME_DOWN", "VOLUME_UP",
  "MEDIA_NEXT_TRACK", "MEDIA_PREV_TRACK", "MEDIA_STOP", "MEDIA_PLAY_PAUSE"
];

// Shared image picker route for the Button editor's <smd-image-select>.
function buttonImageSelectHandler(name) {
  _buttonImage = name || "";
  var sel = document.getElementById("buttonImageSelect");
  if (sel) sel.setAttribute("image", _buttonImage);
}

function buildButtonEditPage() {
  var page = document.getElementById("buttonEditPage");
  if (!page) return null;
  var namedOptions = BUTTON_NAMED_KEYS.map(function (k) {
    return '<option value="' + k + '">' + k.replace(/_/g, " ") + '</option>';
  }).join("");
  page.title = "Edit Button";
  page.content =
    '<div class="mb-3">' +
      '<label class="form-label" for="buttonNameInput">Name</label>' +
      '<input type="text" id="buttonNameInput" class="form-control" placeholder="Button name">' +
    '</div>' +
    '<div class="mb-3">' +
      '<label class="form-label">Image</label>' +
      '<smd-image-select id="buttonImageSelect" key-prefix="shared-"></smd-image-select>' +
    '</div>' +
    '<div class="mb-3">' +
      '<label class="form-label">Key</label>' +
      '<div class="d-flex gap-2">' +
        '<input type="text" id="buttonKeyChar" class="form-control" maxlength="1" placeholder="Key" style="max-width:5rem" oninput="onButtonKeyChar()">' +
        '<select id="buttonKeyNamed" class="form-select" aria-label="Special key" onchange="onButtonKeyNamed()">' +
          '<option value="">&mdash; Special key &mdash;</option>' + namedOptions +
        '</select>' +
      '</div>' +
      '<div class="form-text">Enter a single Key <em>or</em> choose a Special key (not both).</div>' +
    '</div>' +
    '<div class="mb-3">' +
      '<label class="form-label d-block">Modifiers</label>' +
      '<div class="d-flex gap-3">' +
        '<smd-checkbox id="buttonKeyCtrl">Ctrl</smd-checkbox>' +
        '<smd-checkbox id="buttonKeyAlt">Alt</smd-checkbox>' +
        '<smd-checkbox id="buttonKeyShift">Shift</smd-checkbox>' +
      '</div>' +
    '</div>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel" },
    { text: "OK", variant: "primary", action: "ok" }
  ];
  return page;
}

// "ctrl+shift+X" -> { mods: { ctrl, alt, shift }, key: "X" }
function parseButtonKey(value) {
  var parts = String(value || "").split("+");
  var mods = { ctrl: false, alt: false, shift: false };
  while (parts.length && Object.prototype.hasOwnProperty.call(mods, parts[0].toLowerCase())) {
    mods[parts.shift().toLowerCase()] = true;
  }
  return { mods: mods, key: parts.join("+") };
}

function setButtonKeyControls(value) {
  var parsed = parseButtonKey(value);
  var ctrl = document.getElementById("buttonKeyCtrl"); if (ctrl) ctrl.checked = parsed.mods.ctrl;
  var alt = document.getElementById("buttonKeyAlt"); if (alt) alt.checked = parsed.mods.alt;
  var shift = document.getElementById("buttonKeyShift"); if (shift) shift.checked = parsed.mods.shift;
  var named = document.getElementById("buttonKeyNamed");
  var char = document.getElementById("buttonKeyChar");
  if (!named || !char) return;
  var upper = parsed.key.toUpperCase();
  if (BUTTON_NAMED_KEYS.indexOf(upper) !== -1) {
    named.value = upper;
    char.value = "";
    char.disabled = true;
    named.disabled = false;
  } else if (parsed.key) {
    named.value = "";
    char.value = parsed.key;
    named.disabled = true;
    char.disabled = false;
  } else {
    named.value = "";
    char.value = "";
    named.disabled = false;
    char.disabled = false;
  }
}

// Only one of Key / Special key is enterable.
function onButtonKeyChar() {
  var char = document.getElementById("buttonKeyChar");
  var named = document.getElementById("buttonKeyNamed");
  if (!char || !named) return;
  var has = !!char.value;
  named.disabled = has;
  if (has) named.value = "";
}

function onButtonKeyNamed() {
  var char = document.getElementById("buttonKeyChar");
  var named = document.getElementById("buttonKeyNamed");
  if (!char || !named) return;
  var has = !!named.value;
  char.disabled = has;
  if (has) char.value = "";
}

function readButtonKey() {
  var char = document.getElementById("buttonKeyChar");
  var named = document.getElementById("buttonKeyNamed");
  var raw = ((named && named.value) || (char && char.value) || "").toLowerCase().trim();
  var mods = [];
  var ctrl = document.getElementById("buttonKeyCtrl");
  var alt = document.getElementById("buttonKeyAlt");
  var shift = document.getElementById("buttonKeyShift");
  if (ctrl && ctrl.checked) mods.push("ctrl");
  if (alt && alt.checked) mods.push("alt");
  if (shift && shift.checked) mods.push("shift");
  return mods.length ? mods.join("+") + "+" + raw : raw;
}

function openButtonEditor(index) {
  if (_addingLayout || !_selectedLayoutKey) {
    _commLine("Manage Layout: save the layout before editing its buttons.", "info");
    return;
  }
  _editingButtonIndex = index;
  var page = buildButtonEditPage();
  if (!page) return;
  if (!page.__pbBound) {
    page.__pbBound = true;
    page.addEventListener("smd-page-action", function (e) {
      var action = e.detail && e.detail.action;
      if (action === "ok") saveButtonEditor();
    });
  }
  _openWizardPage(page);
  var layout = _layoutsByKey[_selectedLayoutKey] || {};
  var button = (layout.buttons && layout.buttons[index]) || {};
  _buttonImage = button.image || "";
  var sel = document.getElementById("buttonImageSelect");
  if (sel) sel.setAttribute("image", _buttonImage);
  var nameInput = document.getElementById("buttonNameInput");
  if (nameInput) nameInput.value = button.name || "";
  setButtonKeyControls(button.key || "");
}

function saveButtonEditor() {
  var nameInput = document.getElementById("buttonNameInput");
  var sel = document.getElementById("buttonImageSelect");
  var name = nameInput ? nameInput.value.trim() : "";
  var image = sel ? (sel.getAttribute("image") || "") : "";
  var key = readButtonKey();
  var index = _editingButtonIndex;
  pbApi.saveLayoutButton({ layout: _selectedLayoutKey, index: index, name: name, image: image, key: key }).then(function () {
    var layout = _layoutsByKey[_selectedLayoutKey];
    if (layout) {
      layout.buttons = layout.buttons || [];
      while (layout.buttons.length <= index) layout.buttons.push({});
      layout.buttons[index] = { name: name, image: image, key: key };
    }
    refreshLayoutButton(index);
    _commLine("Manage Layout: saved button " + (index + 1) + " (" + (name || "unnamed") + ", image " +
      (image || "none") + ", key " + (key || "none") + ")", "ok");
  }).catch(function (err) {
    _commLine("Manage Layout: save button failed: " + err.message, "error");
  });
}
