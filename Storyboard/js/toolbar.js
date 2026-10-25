// Storyboard - the floating left toolbar (stories/scenes, background, stickers,
// text) and its fly-out panel. The rail is always visible; one tool's panel
// slides out beside it. Pin keeps the panel open while the board is used.

var sbToolbarEls = {};

function sbInitToolbar() {
  sbState.textDraft = { bg: "transparent", color: "auto", border: "none", font: "theme" };

  sbToolbarEls.toolbar = document.getElementById("sbToolbar");
  sbToolbarEls.panel = document.getElementById("sbPanel");
  sbToolbarEls.title = document.getElementById("sbPanelTitle");
  sbToolbarEls.body = document.getElementById("sbPanelBody");
  sbToolbarEls.pin = document.getElementById("sbPinBtn");
  sbToolbarEls.save = document.getElementById("sbSaveBtn");
  sbToolbarEls.close = document.getElementById("sbPanelClose");
  sbToolbarEls.zoomOut = document.getElementById("sbZoomOut");
  sbToolbarEls.zoomIn = document.getElementById("sbZoomIn");
  sbToolbarEls.zoomFit = document.getElementById("sbZoomFit");
  sbToolbarEls.railBtns = Array.prototype.slice.call(document.querySelectorAll(".sb-rail-btn[data-tool]"));

  if (sbToolbarEls.toolbar) {
    sbToolbarEls.toolbar.dataset.pinned = sbState.pinned ? "true" : "false";
  }
  if (sbToolbarEls.pin) {
    sbToolbarEls.pin.classList.toggle("active", sbState.pinned);
    sbToolbarEls.pin.setAttribute("aria-pressed", sbState.pinned ? "true" : "false");
    sbToolbarEls.pin.addEventListener("click", sbTogglePin);
  }
  sbToolbarEls.railBtns.forEach(function (btn) {
    btn.addEventListener("click", function () { sbSetTool(btn.dataset.tool); });
  });
  if (sbToolbarEls.save) {
    sbToolbarEls.save.addEventListener("click", function () {
      sbDownloadJpg().catch(function (err) {
        console.error(err);
        alert("Could not save this board as a JPG.");
      });
    });
  }
  if (sbToolbarEls.zoomOut) sbToolbarEls.zoomOut.addEventListener("click", sbZoomOut);
  if (sbToolbarEls.zoomIn) sbToolbarEls.zoomIn.addEventListener("click", sbZoomIn);
  if (sbToolbarEls.zoomFit) sbToolbarEls.zoomFit.addEventListener("click", sbZoomFit);
  sbUpdateZoomUi();
  if (sbToolbarEls.close) sbToolbarEls.close.addEventListener("click", sbClosePanel);
  if (sbToolbarEls.body) {
    sbToolbarEls.body.addEventListener("click", sbOnPanelClick);
    sbToolbarEls.body.addEventListener("input", sbOnPanelInput);
  }

  document.addEventListener("click", function (e) {
    if (!sbState.tool || sbState.pinned) return;
    // A panel button often re-renders the panel, which DETACHES the clicked
    // element before this document listener runs - so `target.closest()`
    // would no longer find #sbToolbar and the panel would close itself. The
    // panel's own delegation stamps the time instead.
    if (Date.now() - (sbState.panelClickAt || 0) < 150) return;
    var t = e.target;
    // Clicks inside a modal belong to the dialog flow (e.g. a delete confirm
    // opened from this panel). Treating them as "outside" closed the panel just
    // before the confirmed action re-rendered it - the story/scene row then
    // vanished and the confirm appeared to do nothing.
    if (t.closest && (t.closest("#sbToolbar") || t.closest(".sb-selection-bar") ||
      t.closest(".sb-board-chip") || t.closest("smd-modal"))) return;
    sbClosePanel();
  });

  // A pinned toolbar is meant to stay OUT, so on a fresh load show a panel
  // instead of an open pin with nothing beside it.
  if (sbState.pinned) sbOpenTool("boards");
}

function sbTogglePin() {
  sbState.pinned = !sbState.pinned;
  sbSaveState();
  if (sbToolbarEls.toolbar) sbToolbarEls.toolbar.dataset.pinned = sbState.pinned ? "true" : "false";
  if (sbToolbarEls.pin) {
    sbToolbarEls.pin.classList.toggle("active", sbState.pinned);
    sbToolbarEls.pin.setAttribute("aria-pressed", sbState.pinned ? "true" : "false");
  }
  if (sbState.pinned && !sbState.tool) sbOpenTool("boards");
}

function sbSetTool(tool) {
  if (!tool) return sbClosePanel();
  if (sbState.tool === tool) return sbClosePanel();
  sbOpenTool(tool);
}

function sbOpenTool(tool) {
  sbState.tool = tool;
  if (sbToolbarEls.toolbar) sbToolbarEls.toolbar.dataset.open = tool;
  sbToolbarEls.railBtns.forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
  sbRenderPanel();
}

function sbClosePanel() {
  sbState.tool = "";
  sbState.editingTextId = "";
  if (sbToolbarEls.toolbar) sbToolbarEls.toolbar.dataset.open = "";
  if (sbToolbarEls.body) sbToolbarEls.body.innerHTML = "";
  if (sbToolbarEls.title) sbToolbarEls.title.textContent = "";
  sbToolbarEls.railBtns.forEach(function (btn) { btn.classList.remove("active"); });
}

function sbRenderPanel() {
  if (!sbToolbarEls.body) return;
  var tool = sbState.tool;
  if (!tool) {
    sbToolbarEls.body.innerHTML = "";
    return;
  }
  if (sbToolbarEls.title) {
    sbToolbarEls.title.textContent =
      tool === "boards" ? "Stories" :
      tool === "background" ? "Background" :
      tool === "stickers" ? "Stickers" :
      (sbState.editingTextId ? "Edit text" : "Text");
  }
  if (tool === "boards") sbRenderBoardsPanel();
  else if (tool === "background") sbRenderBackgroundPanel();
  else if (tool === "stickers") sbRenderStickersPanel();
  else if (tool === "text") sbRenderTextPanel();
}

// ---- Stories / scenes ------------------------------------------------------
//
// The rail's first tool (still data-tool="boards" internally) is now the STORY
// tree: a Story row, and - when it is the active story - its Scenes indented
// beneath it. Clicking a story selects/expands it; clicking a scene edits it.

function sbRenderBoardsPanel() {
  var activeStory = sbActiveStory();
  var active = sbActiveBoard();
  var html = '<div class="sb-board-list">';
  sbState.stories.forEach(function (story) {
    var expanded = !!activeStory && story.id === activeStory.id;
    html += '<div class="sb-story-row' + (expanded ? " active" : "") + '" data-story-id="' + story.id + '">' +
      '<button type="button" class="sb-story-pick" data-act="pick-story" data-id="' + story.id + '">' +
        '<i class="fa-solid ' + (expanded ? "fa-chevron-down" : "fa-chevron-right") + ' sb-story-chevron" aria-hidden="true"></i>' +
        '<i class="fa-solid fa-book-open" aria-hidden="true"></i>' +
        '<span>' + escapeHtml(story.name) + '</span>' +
      '</button>' +
      '<button type="button" class="sb-story-act" data-act="rename-story" data-id="' + story.id + '" title="Rename story" aria-label="Rename story"><i class="fa-solid fa-pen"></i></button>' +
      '<button type="button" class="sb-story-act" data-act="delete-story" data-id="' + story.id + '" title="Delete story" aria-label="Delete story"' +
        (sbState.stories.length < 2 ? " disabled" : "") + '><i class="fa-solid fa-trash"></i></button>' +
    '</div>';
    if (!expanded) return;
    html += '<div class="sb-story-scenes">';
    story.scenes.forEach(function (board) {
      html += '<div class="sb-board-row' + (active && board.id === active.id ? " active" : "") + '" data-board-id="' + board.id + '">' +
        '<button type="button" class="sb-board-pick" data-act="pick" data-id="' + board.id + '">' +
          '<i class="fa-solid fa-clapperboard" aria-hidden="true"></i>' +
          '<span>' + escapeHtml(board.name) + '</span>' +
        '</button>' +
        '<button type="button" class="sb-board-act" data-act="rename" data-id="' + board.id + '" title="Rename scene" aria-label="Rename scene"><i class="fa-solid fa-pen"></i></button>' +
        '<button type="button" class="sb-board-act" data-act="delete" data-id="' + board.id + '" title="Delete scene" aria-label="Delete scene"' +
          (story.scenes.length < 2 ? " disabled" : "") + '><i class="fa-solid fa-trash"></i></button>' +
      '</div>';
    });
    html += '<button type="button" class="btn btn-sm btn-success sb-add-scene" data-act="add-scene" data-id="' + story.id + '">' +
      '<i class="fa-solid fa-plus me-1"></i>New scene</button>';
    html += '</div>';
  });
  html += '</div>';
  html += '<button type="button" id="sbAddStory" class="btn btn-success w-100"><i class="fa-solid fa-plus me-1"></i>New story</button>';
  html += '<p class="sb-panel-note">A story contains scenes. Each scene is its own board with a background, stickers and text.</p>';
  sbToolbarEls.body.innerHTML = html;
}

// Replace a row's clickable label with an input; Enter/blur saves, Escape cancels.
function sbBeginInlineRename(row, pickSelector, currentName, onSave) {
  var pick = row && row.querySelector(pickSelector);
  if (!pick) return;
  pick.innerHTML = '<input class="form-control form-control-sm sb-board-name-input" value="' + escAttr(currentName) + '">';
  var input = pick.querySelector("input");
  var done = false;
  var finish = function (save) {
    if (done) return;
    done = true;
    if (save) onSave(input.value);
    else sbRenderPanel();
  };
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", function () { finish(true); });
  input.focus();
  input.select();
}

function sbStartRename(id) {
  var board = sbFindBoard(id);
  var row = sbToolbarEls.body.querySelector('.sb-board-row[data-board-id="' + id + '"]');
  if (!board || !row) return;
  sbBeginInlineRename(row, ".sb-board-pick", board.name, function (name) {
    sbRenameBoard(id, name);
  });
}

function sbStartRenameStory(id) {
  var story = sbFindStory(id);
  var row = sbToolbarEls.body.querySelector('.sb-story-row[data-story-id="' + id + '"]');
  if (!story || !row) return;
  sbBeginInlineRename(row, ".sb-story-pick", story.name, function (name) {
    sbRenameStory(id, name);
  });
}

function sbConfirmDeleteBoard(id) {
  var board = sbFindBoard(id);
  var story = sbStoryForScene(id);
  if (!board || !story) return;
  showSmdModal({
    title: "Delete scene?",
    content: 'Delete "' + escapeHtml(board.name) + '" from "' + escapeHtml(story.name) + '"? This cannot be undone.',
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function (detail) {
      if (detail.action === "delete") sbDeleteBoard(id);
    }
  });
}

function sbConfirmDeleteStory(id) {
  var story = sbFindStory(id);
  if (!story) return;
  showSmdModal({
    title: "Delete story?",
    content: 'Delete "' + escapeHtml(story.name) + '" and all ' + story.scenes.length +
      ' scene' + (story.scenes.length === 1 ? "" : "s") + '? This cannot be undone.',
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function (detail) {
      if (detail.action === "delete") sbDeleteStory(id);
    }
  });
}

// ---- Background ------------------------------------------------------------

function sbRenderBackgroundPanel() {
  var board = sbActiveBoard();
  var current = board ? board.background : "";
  var html = '<div class="sb-bg-grid">';
  html += '<button type="button" class="sb-bg-option' + (current === "" ? " active" : "") + '" data-bg="">' +
    '<span class="sb-bg-preview sb-bg-preview-none"><i class="fa-solid fa-border-none"></i></span>' +
    '<span>None</span></button>';
  SB_BACKGROUNDS.forEach(function (bg) {
    html += '<button type="button" class="sb-bg-option' + (current === bg.id ? " active" : "") + '" data-bg="' + bg.id + '">' +
      '<img class="sb-bg-preview" src="' + bg.file + '" alt="">' +
      '<span>' + bg.name + '</span></button>';
  });
  html += '</div>';
  html += '<p class="sb-panel-note">Backgrounds cover the whole board. Items keep their place when you switch.</p>';
  sbToolbarEls.body.innerHTML = html;
}

// ---- Stickers --------------------------------------------------------------

function sbRenderStickersPanel() {
  var html = '<div class="sb-sticker-grid">';
  SB_STICKERS.forEach(function (sticker) {
    html += '<button type="button" class="sb-sticker-option" data-sticker="' + sticker.id + '">' +
      '<img src="' + sticker.file + '" alt="">' +
      '<span>' + sticker.name + '</span></button>';
  });
  html += '</div>';
  html += '<p class="sb-panel-note">Tap a sticker to place it, then drag it, use the handles, or pinch and twist with two fingers.</p>';
  sbToolbarEls.body.innerHTML = html;
}

function sbAddSticker(id) {
  var board = sbActiveBoard();
  if (!board || !sbStickerById(id)) return;
  var n = board.items.length;
  sbAddItem({
    type: "sticker",
    sticker: id,
    x: 50 + (n % 4) * 4,
    y: 50 + (n % 3) * 4,
    scale: 1,
    rotation: 0
  });
  sbRender();
}

// ---- Text ------------------------------------------------------------------

function sbRenderTextPanel() {
  if (sbState.editingTextId && !sbFindItem(sbState.editingTextId)) sbState.editingTextId = "";
  var item = sbState.editingTextId ? sbFindItem(sbState.editingTextId) : null;
  var draft = sbState.textDraft || { bg: "transparent", color: "auto", border: "none", font: "theme" };
  var text = item ? item.text : "";
  var bg = item ? item.bg : draft.bg;
  var color = item ? item.color : draft.color;
  var border = item ? item.border : draft.border;
  var font = item ? item.font : draft.font;

  var html = '<label class="form-label sb-field-label" for="sbTextInput">Text</label>';
  html += '<textarea id="sbTextInput" class="form-control" rows="3" placeholder="Type your text">' + escapeHtml(text) + '</textarea>';

  html += '<div class="sb-field-label">Font</div>';
  html += '<smd-select id="sbFontSelector" class="form-select">';
  SB_TEXT_FONTS.forEach(function (f) {
    html += '<option value="' + f.id + '"' + (font === f.id ? " selected" : "") + '>' + f.name + '</option>';
  });
  html += '</smd-select>';
  html += '<div id="sbFontPreview" class="sb-font-preview sb-font-' + font + '">The quick brown fox</div>';

  html += '<div class="sb-field-label">Background</div><div class="sb-swatches">';
  SB_BG_TOKENS.forEach(function (token) { html += sbSwatchHtml("bg", token, bg === token); });
  html += '</div>';

  html += '<div class="sb-field-label">Border</div><div class="sb-border-grid">';
  SB_TEXT_BORDERS.forEach(function (b) { html += sbBorderOptionHtml(b, border === b.id); });
  html += '</div>';

  html += '<div class="sb-field-label">Text colour</div><div class="sb-swatches">';
  SB_TEXT_TOKENS.forEach(function (token) { html += sbSwatchHtml("color", token, color === token); });
  html += '</div>';

  if (item) {
    html += '<button type="button" id="sbDoneText" class="btn btn-primary w-100">Done</button>';
  } else {
    html += '<button type="button" id="sbPlaceText" class="btn btn-primary w-100"' + (text.trim() ? "" : " disabled") + '>Place text</button>';
  }
  html += '<p class="sb-panel-note">Double-click or double-tap a text box on the board to edit it again.</p>';

  sbToolbarEls.body.innerHTML = html;
  var fontSel = document.getElementById("sbFontSelector");
  if (fontSel) {
    if (fontSel.value !== font) fontSel.value = font;
    fontSel.addEventListener("change", function () { sbTextField("font", fontSel.value); });
  }
  var input = document.getElementById("sbTextInput");
  if (input) {
    sbTogglePlaceButton();
    if (item) {
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
    }
  }
}

function sbSwatchHtml(field, token, active) {
  var label = token === "transparent" ? "Transparent" : token === "auto" ? "Automatic" : token.charAt(0).toUpperCase() + token.slice(1);
  var cls = "sb-swatch" + (token === "transparent" ? " sb-swatch-transparent" : "") + (active ? " active" : "");
  return '<button type="button" class="' + cls + '" data-field="' + field + '" data-token="' + token + '" title="' + label +
    '" aria-label="' + label + '" style="--sb-swatch:' + sbTokenCss(token) + '"></button>';
}

function sbBorderOptionHtml(border, active) {
  return '<button type="button" class="sb-border-option' + (active ? " active" : "") + '" data-border="' + border.id + '" title="' + border.name + '">' +
    '<span class="sb-border-preview sb-border-preview-' + border.id + '">Aa</span>' +
    '<span>' + border.name + '</span></button>';
}

function sbTogglePlaceButton() {
  var btn = document.getElementById("sbPlaceText");
  var input = document.getElementById("sbTextInput");
  if (!btn || !input || sbState.editingTextId) return;
  btn.disabled = !input.value.trim();
}

function sbTextField(field, value) {
  var item = sbState.editingTextId ? sbFindItem(sbState.editingTextId) : null;
  if (item) {
    item[field] = value;
    sbSaveSoon();
    sbApplyTextStyle(item);
  } else {
    if (!sbState.textDraft) sbState.textDraft = { bg: "transparent", color: "auto", border: "none", font: "theme" };
    sbState.textDraft[field] = value;
  }
  if (field === "font") {
    var preview = document.getElementById("sbFontPreview");
    if (preview) preview.className = "sb-font-preview sb-font-" + value;
  }
  sbMarkTextChoice(field, value);
}

function sbMarkTextChoice(field, value) {
  if (field === "border") {
    sbToolbarEls.body.querySelectorAll(".sb-border-option").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.border === value);
    });
    return;
  }
  sbToolbarEls.body.querySelectorAll('.sb-swatch[data-field="' + field + '"]').forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.token === value);
  });
}

function sbPlaceText() {
  var input = document.getElementById("sbTextInput");
  var text = input ? input.value.trim() : "";
  if (!text) return;
  var board = sbActiveBoard();
  if (!board) return;
  var draft = sbState.textDraft || { bg: "transparent", color: "auto", border: "none", font: "theme" };
  var n = board.items.length;
  var item = sbAddItem({
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
  sbState.editingTextId = item.id;
  sbRender();
  sbRenderPanel();
}

function sbDoneText() {
  sbState.editingTextId = "";
  sbClosePanel();
}

// Double-click / double-tap a text object: open the panel in edit mode.
function sbOpenTextEditor(id) {
  var item = sbFindItem(id);
  if (!item || item.type !== "text") return;
  // A double-tap opens the panel on the second POINTERDOWN, but the click that
  // follows it would reach the outside-click handler and close the panel again
  // (touch browsers may not fire a dblclick). Stamp the open so that click is
  // treated as part of the same gesture.
  sbState.panelClickAt = Date.now();
  sbState.editingTextId = id;
  sbSelect(id);
  sbOpenTool("text");
}

// ---- Panel event delegation ------------------------------------------------

function sbOnPanelClick(e) {
  sbState.panelClickAt = Date.now();
  var t = e.target;

  var act = t.closest ? t.closest("[data-act]") : null;
  if (act) {
    var id = act.dataset.id;
    if (act.dataset.act === "pick") sbSetActiveBoard(id);
    else if (act.dataset.act === "pick-story") sbSetActiveStory(id);
    else if (act.dataset.act === "rename") sbStartRename(id);
    else if (act.dataset.act === "rename-story") sbStartRenameStory(id);
    else if (act.dataset.act === "delete") sbConfirmDeleteBoard(id);
    else if (act.dataset.act === "delete-story") sbConfirmDeleteStory(id);
    else if (act.dataset.act === "add-scene") sbAddSceneToStory(id);
    return;
  }

  if (t.closest && t.closest("#sbAddStory")) {
    sbAddStory();
    return;
  }
  if (t.closest && t.closest("#sbPlaceText")) {
    sbPlaceText();
    return;
  }
  if (t.closest && t.closest("#sbDoneText")) {
    sbDoneText();
    return;
  }

  var bgOpt = t.closest ? t.closest(".sb-bg-option") : null;
  if (bgOpt) {
    sbSetBackground(bgOpt.dataset.bg || "");
    return;
  }

  var stickerOpt = t.closest ? t.closest(".sb-sticker-option") : null;
  if (stickerOpt) {
    sbAddSticker(stickerOpt.dataset.sticker);
    return;
  }

  var swatch = t.closest ? t.closest(".sb-swatch") : null;
  if (swatch) {
    sbTextField(swatch.dataset.field, swatch.dataset.token);
    return;
  }

  var borderOpt = t.closest ? t.closest(".sb-border-option") : null;
  if (borderOpt) {
    sbTextField("border", borderOpt.dataset.border);
  }
}

function sbOnPanelInput(e) {
  if (!e.target || e.target.id !== "sbTextInput") return;
  var item = sbState.editingTextId ? sbFindItem(sbState.editingTextId) : null;
  if (item) {
    item.text = e.target.value;
    sbSaveSoon();
    sbApplyTextStyle(item);
  }
  sbTogglePlaceButton();
}
