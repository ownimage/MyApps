// PhoneButtons — "Edit Layout" wizard (main menu).
//
// Page 1 picks a layout from the shared <smd-image-dropdown>, fed by
// GET /api/layouts. Page 2 edits the layout's icon (chosen from the server's
// app-icon cache) and orientation, saved back via POST /api/save-layout.
// `layoutDropdownOptions()` is reused by the Edit App wizard's layout picker.

var _selectedLayoutKey = "";   // layout key chosen on page 1
var _layoutsByKey = {};        // key -> layout object (from GET /api/layouts)
var _selectedIconName = "";    // icon filename chosen in the layout editor

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
    '<div class="d-grid gap-2 mb-3">' +
      layoutButtonHtml(layout, 0) +
      layoutButtonHtml(layout, 1) +
    '</div>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel" },
    { text: "Finish", variant: "success", action: "finish" }
  ];
  return page;
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

// Reflect a saved button back onto the (possibly suspended) layout page.
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

function iconCacheUrl(name) {
  return "/app-icon-cache/" + encodeURIComponent(name);
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
    _commLine("Edit Layout: saved button " + (index + 1) + " (" + (name || "unnamed") + ", image " +
      (image || "none") + ", key " + (key || "none") + ")", "ok");
  }).catch(function (err) {
    _commLine("Edit Layout: save button failed: " + err.message, "error");
  });
}

// Populate the icon <pb-image-dropdown> from the server's app-icon cache (small
// thumbs in the menu) while the chosen icon shows large in the preview.
function loadLayoutIconOptions(layout) {
  var dropdown = document.getElementById("layoutIconDropdown");
  var hint = document.getElementById("layoutIconHint");
  if (!dropdown) return;
  pbApi.getAppIcons().then(function (icons) {
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
    if (missing && hint) hint.textContent = "Saved icon '" + stored + "' is no longer in the server cache.";
    changeLayoutIcon(stored);
  }).catch(function (err) {
    if (hint) hint.textContent = "Could not load icons: " + err.message;
    _commLine("Edit Layout: load icons failed: " + err.message, "error");
  });
}

function saveLayout() {
  var orientation = document.getElementById("layoutOrientationSelect");
  var existing = _layoutsByKey[_selectedLayoutKey] || {};
  var payload = {
    key: _selectedLayoutKey,
    displayName: existing.displayName || _selectedLayoutKey,
    image: _selectedIconName || "",
    orientation: orientation ? orientation.value : "landscape",
    // Persist the buttons as part of the layout.
    buttons: existing.buttons || []
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
    page.addEventListener("pb-image-dropdown-change", function (e) {
      if (e.target && e.target.id === "layoutIconDropdown") {
        _selectedIconName = (e.detail && e.detail.value) || "";
        changeLayoutIcon(_selectedIconName);
      }
    });
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
