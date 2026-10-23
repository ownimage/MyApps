// Whiteboard — the floating left toolbar (boards, background, stickers, text)
// and its fly-out panel. The rail is always visible; one tool's panel slides out
// beside it. Pin keeps the panel open while the board is used.

var wbToolbarEls = {};

function wbInitToolbar() {
  wbState.textDraft = { bg: "transparent", color: "auto", border: "none", font: "theme" };

  wbToolbarEls.toolbar = document.getElementById("wbToolbar");
  wbToolbarEls.panel = document.getElementById("wbPanel");
  wbToolbarEls.title = document.getElementById("wbPanelTitle");
  wbToolbarEls.body = document.getElementById("wbPanelBody");
  wbToolbarEls.pin = document.getElementById("wbPinBtn");
  wbToolbarEls.save = document.getElementById("wbSaveBtn");
  wbToolbarEls.close = document.getElementById("wbPanelClose");
  wbToolbarEls.railBtns = Array.prototype.slice.call(document.querySelectorAll(".wb-rail-btn[data-tool]"));

  if (wbToolbarEls.toolbar) {
    wbToolbarEls.toolbar.dataset.pinned = wbState.pinned ? "true" : "false";
  }
  if (wbToolbarEls.pin) {
    wbToolbarEls.pin.classList.toggle("active", wbState.pinned);
    wbToolbarEls.pin.setAttribute("aria-pressed", wbState.pinned ? "true" : "false");
    wbToolbarEls.pin.addEventListener("click", wbTogglePin);
  }
  wbToolbarEls.railBtns.forEach(function (btn) {
    btn.addEventListener("click", function () { wbSetTool(btn.dataset.tool); });
  });
  if (wbToolbarEls.save) {
    wbToolbarEls.save.addEventListener("click", function () {
      wbDownloadJpg().catch(function (err) {
        console.error(err);
        alert("Could not save this board as a JPG.");
      });
    });
  }
  if (wbToolbarEls.close) wbToolbarEls.close.addEventListener("click", wbClosePanel);
  if (wbToolbarEls.body) {
    wbToolbarEls.body.addEventListener("click", wbOnPanelClick);
    wbToolbarEls.body.addEventListener("input", wbOnPanelInput);
  }

  document.addEventListener("click", function (e) {
    if (!wbState.tool || wbState.pinned) return;
    // A panel button often re-renders the panel, which DETACHES the clicked
    // element before this document listener runs - so `target.closest()`
    // would no longer find #wbToolbar and the panel would close itself. The
    // panel's own delegation stamps the time instead.
    if (Date.now() - (wbState.panelClickAt || 0) < 150) return;
    var t = e.target;
    if (t.closest && (t.closest("#wbToolbar") || t.closest(".wb-selection-bar") || t.closest(".wb-board-chip"))) return;
    wbClosePanel();
  });

  // A pinned toolbar is meant to stay OUT, so on a fresh load show a panel
  // instead of an open pin with nothing beside it.
  if (wbState.pinned) wbOpenTool("boards");
}

function wbTogglePin() {
  wbState.pinned = !wbState.pinned;
  wbSaveState();
  if (wbToolbarEls.toolbar) wbToolbarEls.toolbar.dataset.pinned = wbState.pinned ? "true" : "false";
  if (wbToolbarEls.pin) {
    wbToolbarEls.pin.classList.toggle("active", wbState.pinned);
    wbToolbarEls.pin.setAttribute("aria-pressed", wbState.pinned ? "true" : "false");
  }
  if (wbState.pinned && !wbState.tool) wbOpenTool("boards");
}

function wbSetTool(tool) {
  if (!tool) return wbClosePanel();
  if (wbState.tool === tool) return wbClosePanel();
  wbOpenTool(tool);
}

function wbOpenTool(tool) {
  wbState.tool = tool;
  if (wbToolbarEls.toolbar) wbToolbarEls.toolbar.dataset.open = tool;
  wbToolbarEls.railBtns.forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
  wbRenderPanel();
}

function wbClosePanel() {
  wbState.tool = "";
  wbState.editingTextId = "";
  if (wbToolbarEls.toolbar) wbToolbarEls.toolbar.dataset.open = "";
  if (wbToolbarEls.body) wbToolbarEls.body.innerHTML = "";
  if (wbToolbarEls.title) wbToolbarEls.title.textContent = "";
  wbToolbarEls.railBtns.forEach(function (btn) { btn.classList.remove("active"); });
}

function wbRenderPanel() {
  if (!wbToolbarEls.body) return;
  var tool = wbState.tool;
  if (!tool) {
    wbToolbarEls.body.innerHTML = "";
    return;
  }
  if (wbToolbarEls.title) {
    wbToolbarEls.title.textContent =
      tool === "boards" ? "Boards" :
      tool === "background" ? "Background" :
      tool === "stickers" ? "Stickers" :
      (wbState.editingTextId ? "Edit text" : "Text");
  }
  if (tool === "boards") wbRenderBoardsPanel();
  else if (tool === "background") wbRenderBackgroundPanel();
  else if (tool === "stickers") wbRenderStickersPanel();
  else if (tool === "text") wbRenderTextPanel();
}

// ---- Boards ----------------------------------------------------------------

function wbRenderBoardsPanel() {
  var active = wbActiveBoard();
  var html = '<div class="wb-board-list">';
  wbState.boards.forEach(function (board) {
    html += '<div class="wb-board-row' + (active && board.id === active.id ? " active" : "") + '" data-board-id="' + board.id + '">' +
      '<button type="button" class="wb-board-pick" data-act="pick" data-id="' + board.id + '">' +
        '<i class="fa-solid fa-chalkboard" aria-hidden="true"></i>' +
        '<span>' + escapeHtml(board.name) + '</span>' +
      '</button>' +
      '<button type="button" class="wb-board-act" data-act="rename" data-id="' + board.id + '" title="Rename board" aria-label="Rename board"><i class="fa-solid fa-pen"></i></button>' +
      '<button type="button" class="wb-board-act" data-act="delete" data-id="' + board.id + '" title="Delete board" aria-label="Delete board"' +
        (wbState.boards.length < 2 ? " disabled" : "") + '><i class="fa-solid fa-trash"></i></button>' +
    '</div>';
  });
  html += '</div>';
  html += '<button type="button" id="wbAddBoard" class="btn btn-success w-100"><i class="fa-solid fa-plus me-1"></i>New board</button>';
  html += '<p class="wb-panel-note">Each board keeps its own background, stickers and text.</p>';
  wbToolbarEls.body.innerHTML = html;
}

function wbStartRename(id) {
  var row = wbToolbarEls.body.querySelector('.wb-board-row[data-board-id="' + id + '"]');
  var board = wbFindBoard(id);
  if (!row || !board) return;
  var pick = row.querySelector(".wb-board-pick");
  pick.innerHTML = '<input class="form-control form-control-sm wb-board-name-input" value="' + escAttr(board.name) + '">';
  var input = pick.querySelector("input");
  var done = false;
  var finish = function (save) {
    if (done) return;
    done = true;
    if (save) wbRenameBoard(id, input.value);
    else wbRenderPanel();
  };
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", function () { finish(true); });
  input.focus();
  input.select();
}

function wbConfirmDeleteBoard(id) {
  var board = wbFindBoard(id);
  if (!board) return;
  showSmdModal({
    title: "Delete board?",
    content: 'Delete "' + escapeHtml(board.name) + '" and everything on it? This cannot be undone.',
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function (detail) {
      if (detail.action === "delete") wbDeleteBoard(id);
    }
  });
}

// ---- Background ------------------------------------------------------------

function wbRenderBackgroundPanel() {
  var board = wbActiveBoard();
  var current = board ? board.background : "";
  var html = '<div class="wb-bg-grid">';
  html += '<button type="button" class="wb-bg-option' + (current === "" ? " active" : "") + '" data-bg="">' +
    '<span class="wb-bg-preview wb-bg-preview-none"><i class="fa-solid fa-border-none"></i></span>' +
    '<span>None</span></button>';
  WB_BACKGROUNDS.forEach(function (bg) {
    html += '<button type="button" class="wb-bg-option' + (current === bg.id ? " active" : "") + '" data-bg="' + bg.id + '">' +
      '<img class="wb-bg-preview" src="' + bg.file + '" alt="">' +
      '<span>' + bg.name + '</span></button>';
  });
  html += '</div>';
  html += '<p class="wb-panel-note">Backgrounds cover the whole board. Items keep their place when you switch.</p>';
  wbToolbarEls.body.innerHTML = html;
}

// ---- Stickers --------------------------------------------------------------

function wbRenderStickersPanel() {
  var html = '<div class="wb-sticker-grid">';
  WB_STICKERS.forEach(function (sticker) {
    html += '<button type="button" class="wb-sticker-option" data-sticker="' + sticker.id + '">' +
      '<img src="' + sticker.file + '" alt="">' +
      '<span>' + sticker.name + '</span></button>';
  });
  html += '</div>';
  html += '<p class="wb-panel-note">Tap a sticker to place it, then drag it, use the handles, or pinch and twist with two fingers.</p>';
  wbToolbarEls.body.innerHTML = html;
}

function wbAddSticker(id) {
  var board = wbActiveBoard();
  if (!board || !wbStickerById(id)) return;
  var n = board.items.length;
  wbAddItem({
    type: "sticker",
    sticker: id,
    x: 50 + (n % 4) * 4,
    y: 50 + (n % 3) * 4,
    scale: 1,
    rotation: 0
  });
  wbRender();
}

// ---- Text ------------------------------------------------------------------

function wbRenderTextPanel() {
  if (wbState.editingTextId && !wbFindItem(wbState.editingTextId)) wbState.editingTextId = "";
  var item = wbState.editingTextId ? wbFindItem(wbState.editingTextId) : null;
  var draft = wbState.textDraft || { bg: "transparent", color: "auto", border: "none", font: "theme" };
  var text = item ? item.text : "";
  var bg = item ? item.bg : draft.bg;
  var color = item ? item.color : draft.color;
  var border = item ? item.border : draft.border;
  var font = item ? item.font : draft.font;

  var html = '<label class="form-label wb-field-label" for="wbTextInput">Text</label>';
  html += '<textarea id="wbTextInput" class="form-control" rows="3" placeholder="Type your text">' + escapeHtml(text) + '</textarea>';

  html += '<div class="wb-field-label">Font</div>';
  html += '<smd-select id="wbFontSelector" class="form-select">';
  WB_TEXT_FONTS.forEach(function (f) {
    html += '<option value="' + f.id + '"' + (font === f.id ? " selected" : "") + '>' + f.name + '</option>';
  });
  html += '</smd-select>';
  html += '<div id="wbFontPreview" class="wb-font-preview wb-font-' + font + '">The quick brown fox</div>';

  html += '<div class="wb-field-label">Background</div><div class="wb-swatches">';
  WB_BG_TOKENS.forEach(function (token) { html += wbSwatchHtml("bg", token, bg === token); });
  html += '</div>';

  html += '<div class="wb-field-label">Border</div><div class="wb-border-grid">';
  WB_TEXT_BORDERS.forEach(function (b) { html += wbBorderOptionHtml(b, border === b.id); });
  html += '</div>';

  html += '<div class="wb-field-label">Text colour</div><div class="wb-swatches">';
  WB_TEXT_TOKENS.forEach(function (token) { html += wbSwatchHtml("color", token, color === token); });
  html += '</div>';

  if (item) {
    html += '<button type="button" id="wbDoneText" class="btn btn-primary w-100">Done</button>';
  } else {
    html += '<button type="button" id="wbPlaceText" class="btn btn-primary w-100"' + (text.trim() ? "" : " disabled") + '>Place text</button>';
  }
  html += '<p class="wb-panel-note">Double-click or double-tap a text box on the board to edit it again.</p>';

  wbToolbarEls.body.innerHTML = html;
  var fontSel = document.getElementById("wbFontSelector");
  if (fontSel) {
    if (fontSel.value !== font) fontSel.value = font;
    fontSel.addEventListener("change", function () { wbTextField("font", fontSel.value); });
  }
  var input = document.getElementById("wbTextInput");
  if (input) {
    wbTogglePlaceButton();
    if (item) {
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
    }
  }
}

function wbSwatchHtml(field, token, active) {
  var label = token === "transparent" ? "Transparent" : token === "auto" ? "Automatic" : token.charAt(0).toUpperCase() + token.slice(1);
  var cls = "wb-swatch" + (token === "transparent" ? " wb-swatch-transparent" : "") + (active ? " active" : "");
  return '<button type="button" class="' + cls + '" data-field="' + field + '" data-token="' + token + '" title="' + label +
    '" aria-label="' + label + '" style="--wb-swatch:' + wbTokenCss(token) + '"></button>';
}

function wbBorderOptionHtml(border, active) {
  return '<button type="button" class="wb-border-option' + (active ? " active" : "") + '" data-border="' + border.id + '" title="' + border.name + '">' +
    '<span class="wb-border-preview wb-border-preview-' + border.id + '">Aa</span>' +
    '<span>' + border.name + '</span></button>';
}

function wbTogglePlaceButton() {
  var btn = document.getElementById("wbPlaceText");
  var input = document.getElementById("wbTextInput");
  if (!btn || !input || wbState.editingTextId) return;
  btn.disabled = !input.value.trim();
}

function wbTextField(field, value) {
  var item = wbState.editingTextId ? wbFindItem(wbState.editingTextId) : null;
  if (item) {
    item[field] = value;
    wbSaveSoon();
    wbApplyTextStyle(item);
  } else {
    if (!wbState.textDraft) wbState.textDraft = { bg: "transparent", color: "auto", border: "none", font: "theme" };
    wbState.textDraft[field] = value;
  }
  if (field === "font") {
    var preview = document.getElementById("wbFontPreview");
    if (preview) preview.className = "wb-font-preview wb-font-" + value;
  }
  wbMarkTextChoice(field, value);
}

function wbMarkTextChoice(field, value) {
  if (field === "border") {
    wbToolbarEls.body.querySelectorAll(".wb-border-option").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.border === value);
    });
    return;
  }
  wbToolbarEls.body.querySelectorAll('.wb-swatch[data-field="' + field + '"]').forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.token === value);
  });
}

function wbPlaceText() {
  var input = document.getElementById("wbTextInput");
  var text = input ? input.value.trim() : "";
  if (!text) return;
  var board = wbActiveBoard();
  if (!board) return;
  var draft = wbState.textDraft || { bg: "transparent", color: "auto", border: "none", font: "theme" };
  var n = board.items.length;
  var item = wbAddItem({
    type: "text",
    text: text,
    bg: draft.bg,
    color: draft.color,
    border: draft.border,
    font: draft.font,
    x: 50 + (n % 4) * 4,
    y: 50 + (n % 3) * 5,
    scale: 1,
    rotation: 0
  });
  if (!item) return;
  wbState.editingTextId = item.id;
  wbRender();
  wbRenderPanel();
}

function wbDoneText() {
  wbState.editingTextId = "";
  wbClosePanel();
}

// Double-click / double-tap a text object: open the panel in edit mode.
function wbOpenTextEditor(id) {
  var item = wbFindItem(id);
  if (!item || item.type !== "text") return;
  // A double-tap opens the panel on the second POINTERDOWN, but the click that
  // follows it would reach the outside-click handler and close the panel again
  // (touch browsers may not fire a dblclick). Stamp the open so that click is
  // treated as part of the same gesture.
  wbState.panelClickAt = Date.now();
  wbState.editingTextId = id;
  wbSelect(id);
  wbOpenTool("text");
}

// ---- Panel event delegation ------------------------------------------------

function wbOnPanelClick(e) {
  wbState.panelClickAt = Date.now();
  var t = e.target;

  var act = t.closest ? t.closest("[data-act]") : null;
  if (act) {
    var id = act.dataset.id;
    if (act.dataset.act === "pick") wbSetActiveBoard(id);
    else if (act.dataset.act === "rename") wbStartRename(id);
    else if (act.dataset.act === "delete") wbConfirmDeleteBoard(id);
    return;
  }

  if (t.closest && t.closest("#wbAddBoard")) {
    wbAddBoard();
    return;
  }
  if (t.closest && t.closest("#wbPlaceText")) {
    wbPlaceText();
    return;
  }
  if (t.closest && t.closest("#wbDoneText")) {
    wbDoneText();
    return;
  }

  var bgOpt = t.closest ? t.closest(".wb-bg-option") : null;
  if (bgOpt) {
    wbSetBackground(bgOpt.dataset.bg || "");
    return;
  }

  var stickerOpt = t.closest ? t.closest(".wb-sticker-option") : null;
  if (stickerOpt) {
    wbAddSticker(stickerOpt.dataset.sticker);
    return;
  }

  var swatch = t.closest ? t.closest(".wb-swatch") : null;
  if (swatch) {
    wbTextField(swatch.dataset.field, swatch.dataset.token);
    return;
  }

  var borderOpt = t.closest ? t.closest(".wb-border-option") : null;
  if (borderOpt) {
    wbTextField("border", borderOpt.dataset.border);
  }
}

function wbOnPanelInput(e) {
  if (!e.target || e.target.id !== "wbTextInput") return;
  var item = wbState.editingTextId ? wbFindItem(wbState.editingTextId) : null;
  if (item) {
    item.text = e.target.value;
    wbSaveSoon();
    wbApplyTextStyle(item);
  }
  wbTogglePlaceButton();
}
