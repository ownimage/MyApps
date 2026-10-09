// PhoneButtons — "Manage Layout" page (main menu).
//
// ONE smd-page: pick a layout from the <pb-image-dropdown> (which also offers
// "Add Layout…"), edit its display name / icon / grid (rows x cols) / buttons,
// and Finish to save via POST /api/save-layout. Choosing "Add Layout…"
// auto-generates a unique key from the display name. `layoutDropdownOptions()`
// is reused by the Edit App wizard's layout picker.
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
    '<div class="row mb-3 g-2">' +
      '<div class="col-6">' +
        '<label class="form-label" for="manageLayoutCols">Columns</label>' +
        '<input type="number" id="manageLayoutCols" class="form-control" min="1" max="12" value="3" oninput="onManageGridInput()">' +
      '</div>' +
      '<div class="col-6">' +
        '<label class="form-label" for="manageLayoutRows">Rows</label>' +
        '<input type="number" id="manageLayoutRows" class="form-control" min="1" max="12" value="2" oninput="onManageGridInput()">' +
      '</div>' +
    '</div>' +
    '<div id="manageLayoutGrid" class="pb-layout-grid mb-3"></div>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel" },
    { text: "Finish", variant: "success", action: "finish", close: false }
  ];
}

function setManageHint(msg) {
  var hint = document.getElementById("manageLayoutHint");
  if (hint) hint.textContent = msg || "";
}

function openManageLayout(preselect) {
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
  loadManageLayout(preselect);
}

function loadManageLayout(preselect) {
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
    if (preselect === "__add__") {
      if (dropdown) dropdown.selected = "Add Layout\u2026";
      applyAddLayout();
    } else if (preselect && _layoutsByKey[preselect]) {
      var wanted = _layoutsByKey[preselect];
      if (dropdown) dropdown.selected = wanted.displayName || wanted.key;
      applySelectedLayout(wanted);
    } else if (layouts.length) {
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
  setManageGridDims(layout.rows, layout.cols);
  applyLayoutIcon(layout);
  renderManageGrid();
}

// Blank the fields for a brand-new layout (its key is auto-generated on save).
function applyAddLayout() {
  _addingLayout = true;
  _selectedLayoutKey = "";
  var nameInput = document.getElementById("manageLayoutNameInput");
  if (nameInput) nameInput.value = "";
  setManageHint("");
  setManageGridDims(2, 3);
  applyLayoutIcon({ image: "" });
  renderManageGrid();
}

function applyLayoutIcon(layout) {
  _selectedIconName = layout.image || "";
  loadLayoutIconOptions(layout);
}

function finishManageLayout() {
  var nameInput = document.getElementById("manageLayoutNameInput");
  var displayName = nameInput ? nameInput.value.trim() : "";
  var key = _selectedLayoutKey;
  if (_addingLayout) {
    if (!displayName) { setManageHint("Enter a display name."); return; }
    // The key is auto-generated (and made unique) from the display name.
    key = uniqueKey(slugify(displayName));
  }
  if (!key) { setManageHint("Select or add a layout."); return; }
  var cols = clampInt((document.getElementById("manageLayoutCols") || {}).value, 1, 12, 3);
  var rows = clampInt((document.getElementById("manageLayoutRows") || {}).value, 1, 12, 2);
  var existing = _layoutsByKey[key] || {};
  var buttons = (existing.buttons || []).slice(0, rows * cols);
  while (buttons.length < rows * cols) buttons.push({});
  setManageHint("");
  var payload = {
    key: key,
    displayName: displayName || key,
    image: _selectedIconName || "",
    rows: rows,
    cols: cols,
    // Persist the buttons as part of the layout.
    buttons: buttons
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

// ---- Layout grid (editable) ----

function setManageGridDims(rows, cols) {
  var colsInput = document.getElementById("manageLayoutCols");
  if (colsInput) colsInput.value = clampInt(cols, 1, 12, 3);
  var rowsInput = document.getElementById("manageLayoutRows");
  if (rowsInput) rowsInput.value = clampInt(rows, 1, 12, 2);
}

// Clamp the Rows/Columns inputs to 1..12 as they are typed, then re-render.
function onManageGridInput() {
  ["manageLayoutCols", "manageLayoutRows"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var n = parseInt(el.value, 10);
    if (!isNaN(n)) {
      var clamped = Math.min(12, Math.max(1, n));
      if (String(clamped) !== el.value) el.value = clamped;
    }
  });
  renderManageGrid();
}

// Render the layout's rows x cols grid of equal cells (sized from the Image-size
// display setting). Clicking a cell edits that button.
function renderManageGrid() {
  var grid = document.getElementById("manageLayoutGrid");
  if (!grid) return;
  var cols = clampInt((document.getElementById("manageLayoutCols") || {}).value, 1, 12, 3);
  var rows = clampInt((document.getElementById("manageLayoutRows") || {}).value, 1, 12, 2);
  var px = getIconSizePx();
  grid.style.gridTemplateColumns = "repeat(" + cols + ", " + px + "px)";
  var layout = _layoutsByKey[_selectedLayoutKey] || {};
  var buttons = layout.buttons || [];
  var html = "";
  for (var i = 0; i < rows * cols; i++) {
    var b = buttons[i];
    var real = pbButtonHasContent(b);
    html += '<button type="button" id="layoutButton' + (i + 1) + '" data-index="' + i +
      '" class="pb-grid-cell' + (real ? "" : " empty") + '" ' +
      'style="width:' + px + "px;height:" + px + "px;font-size:" + pbCellFontPx(px) + 'px">' +
      (real ? pbButtonThumbsHtml(b, px) + (b.name ? '<span class="pb-cell-name">' + escapeHtml(b.name) + '</span>' : "") : "") +
      '</button>';
  }
  grid.innerHTML = html;
  grid.querySelectorAll(".pb-grid-cell").forEach(function (el) {
    el.addEventListener("pointerdown", function (e) {
      startGridDrag(e, parseInt(el.getAttribute("data-index"), 10));
    });
  });
}

// ---- Drag one cell onto another to swap them (pointer events → touch + mouse) ----

var _gridDrag = null;

function startGridDrag(e, index) {
  if (_addingLayout || !_selectedLayoutKey) return;   // no layout to edit yet
  if (e.pointerType === "mouse" && e.button !== 0) return;
  _gridDrag = { startIndex: index, x: e.clientX, y: e.clientY, dragging: false, overIndex: -1 };
}

function moveGridDrag(e) {
  if (!_gridDrag) return;
  if (!_gridDrag.dragging) {
    if (Math.abs(e.clientX - _gridDrag.x) < 8 && Math.abs(e.clientY - _gridDrag.y) < 8) return;
    _gridDrag.dragging = true;
    var startEl = document.getElementById("layoutButton" + (_gridDrag.startIndex + 1));
    if (startEl) startEl.classList.add("dragging");
  }
  var el = document.elementFromPoint(e.clientX, e.clientY);
  var cell = el && el.closest ? el.closest(".pb-grid-cell") : null;
  var over = cell ? parseInt(cell.getAttribute("data-index"), 10) : -1;
  if (over !== _gridDrag.overIndex) {
    document.querySelectorAll("#manageLayoutGrid .drag-over").forEach(function (c) { c.classList.remove("drag-over"); });
    _gridDrag.overIndex = over;
    if (cell) cell.classList.add("drag-over");
  }
}

function endGridDrag() {
  if (!_gridDrag) return;
  var drag = _gridDrag;
  _gridDrag = null;
  document.querySelectorAll("#manageLayoutGrid .dragging, #manageLayoutGrid .drag-over").forEach(function (c) {
    c.classList.remove("dragging");
    c.classList.remove("drag-over");
  });
  if (!drag.dragging) {
    openButtonEditor(drag.startIndex);   // a tap edits the button
    return;
  }
  if (drag.overIndex >= 0 && drag.overIndex !== drag.startIndex) {
    swapLayoutButtons(drag.startIndex, drag.overIndex);
  }
}

// Swap the button data of two cells and persist both.
function swapLayoutButtons(a, b) {
  var layout = _layoutsByKey[_selectedLayoutKey];
  if (!layout) return;
  layout.buttons = layout.buttons || [];
  while (layout.buttons.length <= Math.max(a, b)) layout.buttons.push({});
  var tmp = layout.buttons[a];
  layout.buttons[a] = layout.buttons[b];
  layout.buttons[b] = tmp;
  renderManageGrid();
  saveLayoutButtonAt(a);
  saveLayoutButtonAt(b);
  _commLine("Manage Layout: swapped buttons " + (a + 1) + " and " + (b + 1), "info");
}

function saveLayoutButtonAt(index) {
  var layout = _layoutsByKey[_selectedLayoutKey] || {};
  var b = (layout.buttons && layout.buttons[index]) || {};
  pbApi.saveLayoutButton({
    layout: _selectedLayoutKey, index: index,
    name: b.name || "", image1: b.image1 || "", image2: b.image2 || "",
    key: b.key || "", press: b.press || "regular"
  }).catch(function (err) {
    _commLine("Manage Layout: swap save failed: " + err.message, "error");
  });
}

document.addEventListener("pointermove", moveGridDrag, { passive: false });
document.addEventListener("pointerup", endGridDrag);
document.addEventListener("pointercancel", endGridDrag);

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
var _buttonImage1 = "";
var _buttonImage2 = "";

// Named keys the server's _KEY_MAP understands (plus media keys).
var BUTTON_NAMED_KEYS = [
  "BACKSPACE", "TAB", "ENTER", "ESCAPE", "SPACE", "DELETE",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
  "LEFT", "RIGHT", "UP", "DOWN",
  "VOLUME_MUTE", "VOLUME_DOWN", "VOLUME_UP",
  "MEDIA_NEXT_TRACK", "MEDIA_PREV_TRACK", "MEDIA_STOP", "MEDIA_PLAY_PAUSE"
];

// Shared image picker routes for the Button editor's two <smd-image-select>s.
function buttonImage1SelectHandler(name) {
  _buttonImage1 = name || "";
  var sel = document.getElementById("buttonImage1Select");
  if (sel) sel.setAttribute("image", _buttonImage1);
}

function buttonImage2SelectHandler(name) {
  _buttonImage2 = name || "";
  var sel = document.getElementById("buttonImage2Select");
  if (sel) sel.setAttribute("image", _buttonImage2);
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
    '<div class="row mb-3">' +
      '<div class="col-6">' +
        '<label class="form-label">Image 1</label>' +
        '<smd-image-select id="buttonImage1Select" key-prefix="shared-"></smd-image-select>' +
      '</div>' +
      '<div class="col-6">' +
        '<label class="form-label">Image 2</label>' +
        '<smd-image-select id="buttonImage2Select" key-prefix="shared-"></smd-image-select>' +
      '</div>' +
    '</div>' +
    '<div class="mb-3">' +
      '<label class="form-label">Key</label>' +
      '<div class="d-flex gap-2">' +
        '<input type="text" id="buttonKeyChar" class="form-control" maxlength="1" placeholder="Key" style="max-width:5rem" oninput="onButtonKeyChar()">' +
        '<select id="buttonKeyNamed" class="form-select" aria-label="Special key" onchange="onButtonKeyNamed()">' +
          '<option value="">&mdash; Special key &mdash;</option>' + namedOptions +
        '</select>' +
      '</div>' +
      '<div class="form-text">Choose a Key <em>or</em> a Special key — picking one clears the other.</div>' +
      '<smd-checkbox id="buttonKeyNone" onchange="onButtonKeyNone()">No key (modifiers only)</smd-checkbox>' +
    '</div>' +
    '<div class="mb-3">' +
      '<label class="form-label d-block">Modifiers</label>' +
      '<div class="d-flex gap-3">' +
        '<smd-checkbox id="buttonKeyCtrl">Ctrl</smd-checkbox>' +
        '<smd-checkbox id="buttonKeyAlt">Alt</smd-checkbox>' +
        '<smd-checkbox id="buttonKeyShift">Shift</smd-checkbox>' +
      '</div>' +
    '</div>' +
    '<div class="mb-3">' +
      '<label class="form-label" for="buttonPressSelect">Press</label>' +
      '<select id="buttonPressSelect" class="form-select">' +
        '<option value="regular">Regular (single press)</option>' +
        '<option value="extended">Extended (press &amp; hold)</option>' +
      '</select>' +
      '<div class="form-text">Extended sends separate key-down / key-up so the key(s) can be held.</div>' +
    '</div>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel" },
    { text: "OK", variant: "success", action: "ok" }
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
  named.disabled = false;
  char.disabled = false;
  var none = document.getElementById("buttonKeyNone");
  if (none) none.checked = !parsed.key;
  var upper = parsed.key.toUpperCase();
  if (BUTTON_NAMED_KEYS.indexOf(upper) !== -1) {
    named.value = upper;
    char.value = "";
  } else if (parsed.key) {
    named.value = "";
    char.value = parsed.key;
  } else {
    named.value = "";
    char.value = "";
  }
}

// Key / Special key / "No key" are mutually exclusive.
function onButtonKeyChar() {
  var char = document.getElementById("buttonKeyChar");
  var named = document.getElementById("buttonKeyNamed");
  if (!char || !named) return;
  if (char.value) {
    named.value = "";
    var none = document.getElementById("buttonKeyNone");
    if (none) none.checked = false;
  }
}

function onButtonKeyNamed() {
  var char = document.getElementById("buttonKeyChar");
  var named = document.getElementById("buttonKeyNamed");
  if (!char || !named) return;
  if (named.value) {
    char.value = "";
    var none = document.getElementById("buttonKeyNone");
    if (none) none.checked = false;
  }
}

// "No key" = modifiers only (e.g. hold Ctrl+Shift with no main key).
function onButtonKeyNone() {
  var none = document.getElementById("buttonKeyNone");
  if (!none || !none.checked) return;
  var char = document.getElementById("buttonKeyChar"); if (char) char.value = "";
  var named = document.getElementById("buttonKeyNamed"); if (named) named.value = "";
}

function readButtonKey() {
  var none = document.getElementById("buttonKeyNone");
  var char = document.getElementById("buttonKeyChar");
  var named = document.getElementById("buttonKeyNamed");
  var raw = "";
  if (!(none && none.checked)) {
    raw = ((named && named.value) || (char && char.value) || "").toLowerCase().trim();
  }
  var mods = [];
  var ctrl = document.getElementById("buttonKeyCtrl");
  var alt = document.getElementById("buttonKeyAlt");
  var shift = document.getElementById("buttonKeyShift");
  if (ctrl && ctrl.checked) mods.push("ctrl");
  if (alt && alt.checked) mods.push("alt");
  if (shift && shift.checked) mods.push("shift");
  if (!mods.length) return raw;
  return raw ? mods.join("+") + "+" + raw : mods.join("+");
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
  _buttonImage1 = button.image1 || button.image || "";
  _buttonImage2 = button.image2 || "";
  var sel1 = document.getElementById("buttonImage1Select");
  if (sel1) sel1.setAttribute("image", _buttonImage1);
  var sel2 = document.getElementById("buttonImage2Select");
  if (sel2) sel2.setAttribute("image", _buttonImage2);
  var nameInput = document.getElementById("buttonNameInput");
  if (nameInput) nameInput.value = button.name || "";
  var pressSel = document.getElementById("buttonPressSelect");
  if (pressSel) pressSel.value = button.press === "extended" ? "extended" : "regular";
  setButtonKeyControls(button.key || "");
}

function saveButtonEditor() {
  var nameInput = document.getElementById("buttonNameInput");
  var sel1 = document.getElementById("buttonImage1Select");
  var sel2 = document.getElementById("buttonImage2Select");
  var name = nameInput ? nameInput.value.trim() : "";
  var image1 = sel1 ? (sel1.getAttribute("image") || "") : "";
  var image2 = sel2 ? (sel2.getAttribute("image") || "") : "";
  var key = readButtonKey();
  var pressSel = document.getElementById("buttonPressSelect");
  var press = (pressSel && pressSel.value === "extended") ? "extended" : "regular";
  var index = _editingButtonIndex;
  pbApi.saveLayoutButton({
    layout: _selectedLayoutKey, index: index, name: name,
    image1: image1, image2: image2, key: key, press: press
  }).then(function () {
    var layout = _layoutsByKey[_selectedLayoutKey];
    if (layout) {
      layout.buttons = layout.buttons || [];
      while (layout.buttons.length <= index) layout.buttons.push({});
      layout.buttons[index] = { name: name, image1: image1, image2: image2, key: key, press: press };
      renderManageGrid();
    }
    _commLine("Manage Layout: saved button " + (index + 1) + " (" + (name || "unnamed") +
      ", key " + (key || "none") + ")", "ok");
  }).catch(function (err) {
    _commLine("Manage Layout: save button failed: " + err.message, "error");
  });
}
