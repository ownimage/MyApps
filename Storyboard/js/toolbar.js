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
    // <smd-select> dispatches a bubbling `change`; number inputs fire it on
    // blur/Enter. That is what applies a story property change.
    sbToolbarEls.body.addEventListener("change", sbOnPanelChange);
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
      '<smd-button class="sb-story-pick" variant="secondary" data-act="pick-story" data-id="' + story.id + '">' +
        '<i class="fa-solid ' + (expanded ? "fa-chevron-down" : "fa-chevron-right") + ' sb-story-chevron" aria-hidden="true"></i>' +
        '<i class="fa-solid fa-book-open" aria-hidden="true"></i>' +
        '<span>' + escapeHtml(story.name) + '</span>' +
      '</smd-button>' +
      '<smd-button class="sb-story-act" variant="secondary" size="small" data-act="story-props" data-id="' + story.id + '" title="Story properties" aria-label="Story properties" icon="fa-solid fa-cog"></smd-button>' +
      '<smd-button class="sb-story-act" variant="secondary" size="small" data-act="rename-story" data-id="' + story.id + '" title="Rename story" aria-label="Rename story" icon="fa-solid fa-pen"></smd-button>' +
      '<smd-button class="sb-story-act" variant="secondary" size="small" data-act="delete-story" data-id="' + story.id + '" title="Delete story" aria-label="Delete story" icon="fa-solid fa-trash"' +
        (sbState.stories.length < 2 ? " disabled" : "") + '></smd-button>' +
    '</div>';
    // The cog's inline form sits directly under its row (the scene list is a
    // SIBLING of the row, so this block is another sibling).
    if (sbState.storyPropsId === story.id) html += sbStoryPropsHtml(story);
    if (!expanded) return;
    html += '<div class="sb-story-scenes">';
    story.scenes.forEach(function (board) {
      html += '<div class="sb-board-row' + (active && board.id === active.id ? " active" : "") + '" data-board-id="' + board.id + '">' +
        '<smd-button class="sb-board-pick" variant="secondary" data-act="pick" data-id="' + board.id + '">' +
          '<i class="fa-solid fa-clapperboard" aria-hidden="true"></i>' +
          '<span>' + escapeHtml(board.name) + '</span>' +
        '</smd-button>' +
        '<smd-button class="sb-board-act" variant="secondary" size="small" data-act="rename" data-id="' + board.id + '" title="Rename scene" aria-label="Rename scene" icon="fa-solid fa-pen"></smd-button>' +
        '<smd-button class="sb-board-act" variant="secondary" size="small" data-act="delete" data-id="' + board.id + '" title="Delete scene" aria-label="Delete scene" icon="fa-solid fa-trash"' +
          (story.scenes.length < 2 ? " disabled" : "") + '></smd-button>' +
      '</div>';
    });
    html += '<smd-button class="sb-add-scene" variant="primary" size="small" data-act="add-scene" data-id="' + story.id + '" icon="fa-solid fa-plus">New scene</smd-button>';
    html += '</div>';
  });
  html += '</div>';
  html += '<smd-button id="sbAddStory" variant="primary" block icon="fa-solid fa-plus">New story</smd-button>';
  html += '<p class="sb-panel-note">A story contains scenes. Each scene is its own board with a background, stickers and text.</p>';
  sbToolbarEls.body.innerHTML = html;

  // The declarative <option>s are read by <smd-select> on connect; set the
  // current values explicitly so the selects match the stored properties.
  var presetEl = document.getElementById("sbStoryPreset");
  var fitEl = document.getElementById("sbStoryFit");
  var propsStory = sbState.storyPropsId ? sbFindStory(sbState.storyPropsId) : null;
  // Set the ATTRIBUTE (not the property): if the element is still upgrading, the
  // attribute is applied on connect, whereas a pre-upgrade property assignment
  // would shadow the accessor.
  if (presetEl && propsStory) {
    presetEl.setAttribute("value", sbState.storyPropsOther ? "other" : sbStoryPresetId(propsStory));
  }
  if (fitEl && propsStory) fitEl.setAttribute("value", sbStoryFit(propsStory));
}

// The cog's inline form: canvas SIZE (presets + "Other" with free width/height)
// and how the background fills it. Every change applies immediately (the board
// resizes live), so this is the layout iteration loop.
function sbStoryPropsHtml(story) {
  var width = sbStoryWidth(story);
  var height = sbStoryHeight(story);
  var preset = sbState.storyPropsOther ? "other" : sbStoryPresetId(story);
  var html = '<div class="sb-story-props" data-story-id="' + story.id + '">';
  html += '<div class="sb-field-label">Size</div>';
  html += '<smd-select id="sbStoryPreset" class="form-select form-select-sm">';
  SB_STORY_PRESETS.forEach(function (item) {
    html += '<option value="' + item.id + '">' + item.name + '</option>';
  });
  html += '<option value="other">Other...</option></smd-select>';
  if (preset === "other") {
    html += '<div class="sb-story-size">' +
      '<input id="sbStoryWidth" class="form-control form-control-sm" type="number" inputmode="numeric" ' +
        'min="' + SB_STORY_MIN_SIZE + '" max="' + SB_STORY_MAX_SIZE + '" step="1" value="' + width + '" aria-label="Width">' +
      '<span class="sb-story-size-x">x</span>' +
      '<input id="sbStoryHeight" class="form-control form-control-sm" type="number" inputmode="numeric" ' +
        'min="' + SB_STORY_MIN_SIZE + '" max="' + SB_STORY_MAX_SIZE + '" step="1" value="' + height + '" aria-label="Height">' +
      '</div>';
  }
  html += '<div class="sb-field-label">Background</div>';
  html += '<smd-select id="sbStoryFit" class="form-select form-select-sm">';
  SB_STORY_FITS.forEach(function (item) {
    html += '<option value="' + item.id + '">' + item.name + '</option>';
  });
  html += '</smd-select>';
  html += '<smd-button class="w-100" variant="success" size="small" block data-act="story-props-close" data-id="' + story.id + '">Done</smd-button>';
  html += '</div>';
  return html;
}

// Open/close a story''s inline properties form. `id` of "" closes whatever is
// open; passing a different story moves the form to that row.
function sbToggleStoryProps(id, closeId) {
  if (closeId) sbState.storyPropsId = "";
  else sbState.storyPropsId = sbState.storyPropsId === id ? "" : id;
  // Reopening always starts from the story's real size (a preset when it matches
  // one), so a previous "Other" entry never hides the free fields unexpectedly.
  sbState.storyPropsOther = false;
  sbRenderPanel();
}

// Story-properties form changes (all apply LIVE so the board resizes as you try
// sizes out). A preset sets width+height; Other reveals the free fields.
function sbOnPanelChange(e) {
  var t = e.target;
  if (!t || !t.id) return;
  var story = sbState.storyPropsId ? sbFindStory(sbState.storyPropsId) : null;
  if (!story) return;

  if (t.id === "sbStoryPreset") {
    if (t.value === "other") {
      // Reveal the free width/height fields (no size change until they are set).
      sbState.storyPropsOther = true;
      sbRenderPanel();
      var widthEl = document.getElementById("sbStoryWidth");
      if (widthEl) widthEl.focus();
      return;
    }
    var preset = sbStoryPresetById(t.value);
    if (preset) {
      sbState.storyPropsOther = false;
      sbSetStoryProperties(story.id, { width: preset.width, height: preset.height });
    }
    return;
  }

  if (t.id === "sbStoryWidth" || t.id === "sbStoryHeight") {
    var widthEl = document.getElementById("sbStoryWidth");
    var heightEl = document.getElementById("sbStoryHeight");
    sbSetStoryProperties(story.id, {
      width: widthEl ? widthEl.value : sbStoryWidth(story),
      height: heightEl ? heightEl.value : sbStoryHeight(story)
    });
    return;
  }

  if (t.id === "sbStoryFit") {
    sbSetStoryProperties(story.id, { backgroundFit: t.value });
  }
}

// Replace a row's clickable label with an input; Enter/blur saves, Escape cancels.
// `validate(value)` returns "" to accept or a message to show; a rejected value
// keeps the editor open (and the old name intact) so the user can correct it.
function sbBeginInlineRename(row, pickSelector, currentName, onSave, validate) {
  var pick = row && row.querySelector(pickSelector);
  if (!pick) return;
  // The pick is an <smd-button> host now: replace the INNER button's content so
  // the editor takes the same place the label had (the host itself must keep its
  // real <button>).
  var field = pick.querySelector("button") || pick;
  field.innerHTML = '<input class="form-control form-control-sm sb-board-name-input" value="' + escAttr(currentName) + '">';
  var input = field.querySelector("input");
  var done = false;
  var errorEl = null;

  function clearError() {
    if (errorEl && errorEl.parentNode) errorEl.parentNode.removeChild(errorEl);
    errorEl = null;
    input.classList.remove("is-invalid");
  }
  function showError(message) {
    clearError();
    errorEl = document.createElement("p");
    errorEl.className = "sb-panel-note sb-rename-error text-danger";
    errorEl.textContent = message;
    row.parentNode.insertBefore(errorEl, row.nextSibling);
    input.classList.add("is-invalid");
  }

  var finish = function (save, refocus) {
    if (done) return;
    if (save && typeof validate === "function") {
      var message = validate(input.value);
      if (message) {
        showError(message);
        if (refocus) { input.focus(); input.select(); }
        return;
      }
    }
    done = true;
    if (save) onSave(input.value);
    else sbRenderPanel();
  };
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); finish(true, true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
  input.addEventListener("input", clearError);
  // A blur with an invalid value shows the reason but does not steal focus back.
  input.addEventListener("blur", function () { if (!done) finish(true, false); });
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
  // Story names must be unique (they also name the OneDrive folder), so the
  // editor refuses a duplicate and says which story already has it.
  sbBeginInlineRename(row, ".sb-story-pick", story.name, function (name) {
    sbRenameStory(id, name);
  }, function (name) {
    return typeof sbStoryNameError === "function" ? sbStoryNameError(name, id) : "";
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

// The Background panel is the Standard grid (None / Space / Underwater) plus,
// when OneDrive is enabled and signed in, Library (<Directory>/Backgrounds) and
// Board (<Directory>/<story>/Backgrounds) tabs. Their grids use small Graph
// thumbnails; the full painting is fetched when one is chosen. See
// js/background-library.js.
var SB_BG_PANEL_NOTE = "Backgrounds cover the whole board. Items keep their place when you switch.";

function sbBgTileHtml(bg, current) {
  return '<button type="button" class="sb-bg-option' + (current === bg.id ? " active" : "") + '" data-bg="' + bg.id + '">' +
    '<img class="sb-bg-preview" src="' + bg.img + '" alt="">' +
    '<span>' + escapeHtml(bg.name) + '</span></button>';
}

function sbBgStandardGridHtml(current) {
  var html = '<div class="sb-bg-grid">';
  html += '<button type="button" class="sb-bg-option' + (current === "" ? " active" : "") + '" data-bg="">' +
    '<span class="sb-bg-preview sb-bg-preview-none"><i class="fa-solid fa-border-none"></i></span>' +
    '<span>None</span></button>';
  SB_BACKGROUNDS.forEach(function (bg) {
    html += sbBgTileHtml({ id: bg.id, name: bg.name, img: bg.file }, current);
  });
  html += '</div>';
  return html;
}

function sbBgLibraryGridHtml(which, current) {
  var tiles = typeof sbBgPanelTiles === "function" ? sbBgPanelTiles(which) : [];
  var html = '<div class="sb-bg-grid">';
  tiles.forEach(function (bg) { html += sbBgTileHtml(bg, current); });
  html += '</div>';
  if (!tiles.length) html += '<p class="sb-panel-note">No images in this folder yet.</p>';
  return html;
}

function sbRenderBackgroundPanel(skipRefresh) {
  var board = sbActiveBoard();
  var current = board ? board.background : "";
  var tabs = typeof sbBgTabs === "function" ? sbBgTabs() : [];
  var note = '<p class="sb-panel-note">' + SB_BG_PANEL_NOTE + '</p>';
  var status = typeof sbBgStatusNote === "function" ? sbBgStatusNote() : "";
  if (status) {
    var kind = typeof sbBgStatusKind === "function" ? sbBgStatusKind() : "";
    var signIn = kind === "signin"
      ? '<smd-button class="sb-bg-signin" variant="primary" size="small" icon="fa-solid fa-right-to-bracket">Sign in</smd-button> '
      : "";
    note += '<p class="sb-panel-note sb-bg-status">' + escapeHtml(status) + ' ' + signIn +
      '<smd-button class="sb-bg-retry" variant="secondary" size="small">Retry</smd-button></p>';
  }

  if (!tabs.length) {
    sbState.bgTab = "standard";
    sbToolbarEls.body.innerHTML = sbBgStandardGridHtml(current) + note;
    if (!skipRefresh) sbBgRefreshPanel();
    return;
  }

  sbToolbarEls.body.innerHTML = '<smd-tabs id="sbBgTabs" wrap padding="small"></smd-tabs>' + note;
  var tabsEl = document.getElementById("sbBgTabs");
  if (!tabsEl) return;
  var active = sbState.bgTab || "standard";
  var index = 0;
  tabs.forEach(function (tab, i) { if (tab.id === active) index = i; });

  tabsEl.tabs = tabs.map(function (tab) {
    var content = tab.id === "standard"
      ? sbBgStandardGridHtml(current)
      : sbBgLibraryGridHtml(tab.id, current);
    return { title: tab.title, content: content };
  });
  tabsEl.activeIndex = index;
  tabsEl.addEventListener("smd-tabs-change", function (event) {
    var detail = event.detail || {};
    var picked = tabs[detail.index] || tabs[0];
    if (picked) sbSelectBgTab(picked.id);
  });

  sbSelectBgTab(tabs[index].id);
  if (!skipRefresh) sbBgRefreshPanel();
}

// Remember the open tab and fetch that folder's thumbnails (only the visible tab
// costs any traffic).
function sbSelectBgTab(id) {
  sbState.bgTab = id;
  if (typeof sbBgEnsureThumbs !== "function") return;
  if (id === "library" || id === "board") sbBgEnsureThumbs(id);
}

// Rebuild the panel only when what it SHOWS changed (tab set or status); a plain
// listing change just refreshes the open tab's thumbnails.
function sbBgRefreshPanel() {
  if (typeof sbBgRefreshFolders !== "function") return;
  if (typeof sbBgLibraryEnabled === "function" && !sbBgLibraryEnabled()) return;
  var before = typeof sbBgPanelSignature === "function" ? sbBgPanelSignature() : "";
  sbBgRefreshFolders(!sbBgTabs().length).then(function () {
    if (sbState.tool !== "background") return;
    var after = typeof sbBgPanelSignature === "function" ? sbBgPanelSignature() : "";
    if (after !== before) {
      sbRenderBackgroundPanel(true);
      return;
    }
    sbSelectBgTab(sbState.bgTab || "standard");
  }).catch(function () { /* offline: cached artwork remains */ });
}

// ---- Stickers --------------------------------------------------------------

// The Stickers panel is the Standard gallery plus (when OneDrive is enabled and
// signed in) a Library and a Board tab listing <Directory>/Stickers and
// <Directory>/<story>/Stickers. See js/sticker-library.js.
var SB_STICKER_PANEL_NOTE =
  "Tap a sticker to place it, then drag it, use the handles, or pinch and twist with two fingers.";

function sbRenderStickersPanel(skipRefresh) {
  var tabs = typeof sbStickerTabs === "function" ? sbStickerTabs() : [];
  var note = '<p class="sb-panel-note">' + SB_STICKER_PANEL_NOTE + "</p>";
  var status = typeof sbStickerStatusNote === "function" ? sbStickerStatusNote() : "";
  if (status) {
    // A failed listing must never be invisible: say what went wrong, which
    // folders were tried, and offer the action that fixes it.
    var kind = typeof sbStickerStatusKind === "function" ? sbStickerStatusKind() : "";
    var signIn = kind === "signin"
      ? '<smd-button class="sb-sticker-signin" variant="primary" size="small" icon="fa-solid fa-right-to-bracket">Sign in</smd-button> '
      : "";
    note += '<p class="sb-panel-note sb-sticker-status">' + escapeHtml(status) + ' ' + signIn +
      '<smd-button class="sb-sticker-retry" variant="secondary" size="small">Retry</smd-button></p>';
  }

  if (!tabs.length) {
    // No OneDrive (or no library folders): exactly the list the panel had before.
    sbState.stickerTab = "standard";
    sbToolbarEls.body.innerHTML = '<sb-sticker-gallery source="standard"></sb-sticker-gallery>' + note;
    sbApplyStickerGalleries();
    if (!skipRefresh) sbStickerRefreshPanel();
    return;
  }

  sbToolbarEls.body.innerHTML = '<smd-tabs id="sbStickerTabs" wrap padding="small"></smd-tabs>' + note;
  var tabsEl = document.getElementById("sbStickerTabs");
  if (!tabsEl) return;
  var active = sbState.stickerTab || "standard";
  var index = 0;
  tabs.forEach(function (tab, i) { if (tab.id === active) index = i; });

  tabsEl.tabs = tabs.map(function (tab) {
    return {
      title: tab.title,
      content: '<sb-sticker-gallery source="' + tab.id + '"></sb-sticker-gallery>'
    };
  });
  tabsEl.activeIndex = index;
  tabsEl.addEventListener("smd-tabs-change", function (event) {
    var detail = event.detail || {};
    var picked = tabs[detail.index] || tabs[0];
    if (picked) sbSelectStickerTab(picked.id);
  });

  sbApplyStickerGalleries();
  sbSelectStickerTab(tabs[index].id);
  if (!skipRefresh) sbStickerRefreshPanel();
}

// Remember the open tab and make sure its images are cached/downloaded (only
// the tab the user actually opens costs any network traffic).
function sbSelectStickerTab(id) {
  sbState.stickerTab = id;
  if (typeof sbStickerEnsureImages !== "function") return;
  if (id === "library" || id === "board") sbStickerEnsureImages(id);
}

function sbApplyStickerGalleries() {
  if (!sbToolbarEls.body || typeof sbStickerGalleryData !== "function") return;
  var galleries = sbToolbarEls.body.querySelectorAll("sb-sticker-gallery");
  for (var i = 0; i < galleries.length; i++) {
    var which = galleries[i].getAttribute("source") || "standard";
    galleries[i].stickers = sbStickerGalleryData(which);
  }
}

// A folder can appear or disappear between visits, and a failed listing adds a
// status line: rebuild the panel only when what it SHOWS actually changed
// (`sbStickerPanelSignature`), otherwise just re-apply the gallery data.
function sbStickerRefreshPanel() {
  if (typeof sbStickerRefreshFolders !== "function") return;
  if (typeof sbStickerLibraryEnabled === "function" && !sbStickerLibraryEnabled()) return;
  var before = typeof sbStickerPanelSignature === "function" ? sbStickerPanelSignature() : "";
  // Opening the panel always lists once, even inside the 5s guard: otherwise a
  // refresh that ran at boot (and failed) would leave the tabs hidden until the
  // panel was closed and reopened.
  sbStickerRefreshFolders(!sbStickerTabs().length).then(function () {
    if (sbState.tool !== "stickers") return;
    var after = typeof sbStickerPanelSignature === "function" ? sbStickerPanelSignature() : "";
    if (after !== before) {
      sbRenderStickersPanel(true);
      return;
    }
    sbApplyStickerGalleries();
    sbSelectStickerTab(sbState.stickerTab || "standard");
  }).catch(function () { /* offline: cached stickers remain */ });
}

function sbAddSticker(id) {
  var board = sbActiveBoard();
  var meta = sbStickerById(id);
  if (!board || !meta) return;
  var n = board.items.length;
  var item = {
    type: "sticker",
    sticker: id,
    x: 50 + (n % 4) * 4,
    y: 50 + (n % 3) * 4,
    scale: 1,
    rotation: 0
  };
  // OneDrive stickers keep their file name in the board data: it is the caption
  // shown before the library has been listed again (and in a restored backup).
  if (meta.fileName) item.stickerName = meta.fileName;
  sbAddItem(item);
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
    html += '<smd-button id="sbDoneText" variant="primary" block>Done</smd-button>';
  } else {
    html += '<smd-button id="sbPlaceText" variant="primary" block' + (text.trim() ? "" : " disabled") + '>Place text</smd-button>';
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
  // The shared component mirrors `disabled` onto its inner button; set the
  // ATTRIBUTE so it also works before the element has upgraded.
  if (input.value.trim()) btn.removeAttribute("disabled");
  else btn.setAttribute("disabled", "");
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
    else if (act.dataset.act === "story-props") sbToggleStoryProps(id);
    else if (act.dataset.act === "story-props-close") sbToggleStoryProps("", id);
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

  if (t.closest && t.closest(".sb-bg-signin")) {
    if (typeof sbBgSignIn === "function") sbBgSignIn();
    return;
  }
  if (t.closest && t.closest(".sb-bg-retry")) {
    if (typeof sbBgRetry === "function") sbBgRetry();
    return;
  }
  if (t.closest && t.closest(".sb-sticker-signin")) {
    if (typeof sbStickerSignIn === "function") sbStickerSignIn();
    return;
  }
  if (t.closest && t.closest(".sb-sticker-retry")) {
    if (typeof sbStickerRetry === "function") sbStickerRetry();
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
