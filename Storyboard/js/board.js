// Storyboard - painting the board and all direct-manipulation gestures.
//
// Objects are absolutely positioned by PERCENTAGE (left/top) so their relative
// place survives a resize, then rotated around their centre. A single selection
// shows the two handles on the object (bottom-right = scale, top = rotate); a
// group or a loose multi-selection uses ONE #sbSelectionBox around the union of
// the members instead. Two fingers on the selection pinch to scale, twist to
// rotate and slide to move. Groups are metadata only (board.groups): every
// gesture composes the result into the stored LEAVES and saves (throttled).

var sbEls = {};
var sbTap = null;
var SB_SVG_NS = "http://www.w3.org/2000/svg";

// Reference board height (the 655px board of a 1280x720 window). Every piece of
// ARTWORK - text, stickers, dot grid, connector widths - is sized as a fraction
// of the board using this scale, so it stays glued to the picture when the board
// re-fits or is zoomed. The UI is not scaled here; browser page zoom handles that.
var SB_DESIGN_HEIGHT = 655;
// Pasteboard margins used only when the board is zoomed past the fitted view.
var SB_BOARD_PAD = 56;
var SB_PASTE_GAP = 8;
var sbResizeTimer = null;
var sbScrollRaf = 0;

// Current artwork scale: board height / SB_DESIGN_HEIGHT.
function sbDesignScale() {
  if (!sbEls.canvas) return 1;
  var v = parseFloat(sbEls.canvas.style.getPropertyValue("--sb-design-scale"));
  return isFinite(v) && v > 0 ? v : 1;
}

function sbZoom() {
  var v = Number(sbState.zoom);
  return isFinite(v) && v > 0 ? v : 1;
}

// Size the board to the background artwork's aspect, fit it (contain) into the
// space the UI leaves, then multiply by the zoom factor. At zoom 1 this is
// exactly the old fitted view (whole image visible, bars when the window shape
// differs). Everything inside scales from --sb-design-scale.
function sbLayoutBoard(anchor) {
  if (!sbEls.area || !sbEls.canvas) return;
  var view = sbEls.scroller || sbEls.area;
  var vw = view.clientWidth;
  var vh = view.clientHeight;
  if (!vw || !vh) return;
  var story = typeof sbActiveStory === "function" ? sbActiveStory() : null;
  // The STORY owns the canvas shape (not the background image), so a portrait
  // story is a portrait board and the background is fitted INSIDE it.
  var boardW = typeof sbStoryWidth === "function" ? sbStoryWidth(story) : 2560;
  var boardH = typeof sbStoryHeight === "function" ? sbStoryHeight(story) : 1440;
  var fit = Math.min(vw / boardW, vh / boardH);
  var fitW = boardW * fit;
  var fitH = boardH * fit;
  var zoom = sbZoom();
  var w = fitW * zoom;
  var h = fitH * zoom;
  sbEls.fitW = fitW;
  sbEls.fitH = fitH;
  sbEls.canvas.style.width = w + "px";
  sbEls.canvas.style.height = h + "px";
  sbEls.canvas.dataset.zoom = String(zoom);
  // Set the artwork scale BEFORE measuring overhangs: text and handles must be
  // at their final size when their rects are read below.
  sbEls.canvas.style.setProperty("--sb-design-scale", h / SB_DESIGN_HEIGHT);
  sbEls.canvas.style.setProperty("--sb-sticker-base", (Math.min(w, h) * 0.15) + "px");
  sbSizeStage(vw, vh, w, h, zoom);
  if (anchor) sbApplyZoomAnchor(anchor);
  sbUpdateZoomUi();
}

// The stage is at least the viewport (so a small board stays centred). When the
// board is zoomed in it also reserves pasteboard on every side, big enough for
// the objects AND their grab handles, so nothing at the artwork edge is
// unreachable. At zoom 1 no margin is added: the fitted view is unchanged and
// there are no scrollbars.
function sbSizeStage(vw, vh, w, h, zoom) {
  if (!sbEls.stage) return;
  var padX = 0;
  var padY = 0;
  if (zoom > 1) {
    var over = sbBoardOverhang();
    padX = Math.max(SB_BOARD_PAD, over.left + SB_PASTE_GAP, over.right + SB_PASTE_GAP);
    padY = Math.max(SB_BOARD_PAD, over.top + SB_PASTE_GAP, over.bottom + SB_PASTE_GAP);
  }
  sbEls.stage.style.width = Math.max(vw, w + padX * 2) + "px";
  sbEls.stage.style.height = Math.max(vh, h + padY * 2) + "px";
}

// How far the rendered objects (and any visible grab handles) reach outside the
// artwork, in CSS px. Measuring the DOM means a huge sticker or a long text box
// at the edge gets exactly the pasteboard it needs - a fixed margin could not.
function sbBoardOverhang() {
  var out = { left: 0, right: 0, top: 0, bottom: 0 };
  if (!sbEls.canvas || !sbEls.items) return out;
  var cr = sbEls.canvas.getBoundingClientRect();
  if (!cr.width || !cr.height) return out;
  sbEls.items.querySelectorAll(".sb-object").forEach(function (obj) {
    sbMeasureOverhang(out, cr, obj.getBoundingClientRect());
    obj.querySelectorAll(".sb-handle").forEach(function (handle) {
      var r = handle.getBoundingClientRect();
      if (r.width || r.height) sbMeasureOverhang(out, cr, r);
    });
  });
  // A group/multi selection puts its handles on #sbSelectionBox instead of on the
  // objects, so the pasteboard must cover that box too.
  if (sbEls.selectionBox && !sbEls.selectionBox.classList.contains("d-none")) {
    sbMeasureOverhang(out, cr, sbEls.selectionBox.getBoundingClientRect());
    sbEls.selectionBox.querySelectorAll(".sb-handle").forEach(function (handle) {
      var r = handle.getBoundingClientRect();
      if (r.width || r.height) sbMeasureOverhang(out, cr, r);
    });
  }
  return out;
}

function sbMeasureOverhang(out, cr, r) {
  out.left = Math.max(out.left, cr.left - r.left);
  out.right = Math.max(out.right, r.right - cr.right);
  out.top = Math.max(out.top, cr.top - r.top);
  out.bottom = Math.max(out.bottom, r.bottom - cr.bottom);
}

// Re-measure the pasteboard after the selection changes (handles appear) or a
// drag finishes near an edge. The selected item is held at the same screen
// position so growing the margin does not make the board jump.
function sbRefreshPasteboard() {
  if (!sbEls.stage || !sbEls.scroller || !sbEls.canvas) return;
  var zoom = sbZoom();
  if (zoom <= 1) return;
  var vw = sbEls.scroller.clientWidth;
  var vh = sbEls.scroller.clientHeight;
  var w = sbEls.canvas.offsetWidth;
  var h = sbEls.canvas.offsetHeight;
  if (!vw || !vh || !w || !h) return;
  var anchor = sbZoomAnchorPoint();
  sbSizeStage(vw, vh, w, h, zoom);
  sbApplyZoomAnchor(anchor);
  // A clamped anchor scroll can move the board slightly; keep the action bar
  // glued to the object after the margin change.
  sbPositionSelectionBox();
  sbPositionSelectionBar();
}

// Zoom around the selected object/handlebox when there is one, otherwise around
// whatever sits at the middle of the visible area. Returns the board fraction
// plus the screen position that must stay put.
function sbZoomAnchorPoint() {
  var vw = sbEls.scroller ? sbEls.scroller.clientWidth : (sbEls.area ? sbEls.area.clientWidth : 0);
  var vh = sbEls.scroller ? sbEls.scroller.clientHeight : (sbEls.area ? sbEls.area.clientHeight : 0);
  var fallback = { fx: 0.5, fy: 0.5, sx: vw / 2, sy: vh / 2 };
  if (!sbEls.canvas || !sbEls.scroller) return fallback;
  var cr = sbEls.canvas.getBoundingClientRect();
  if (!cr.width || !cr.height) return fallback;
  var sr = sbEls.scroller.getBoundingClientRect();
  var el = null;
  if (sbState.selectedConnectorId && sbEls.connectorPaths) {
    el = sbEls.connectorPaths.querySelector('.sb-connector[data-id="' + sbState.selectedConnectorId + '"] .sb-connector-line');
  } else if (sbState.selectedId) {
    el = sbItemEl(sbState.selectedId);
  }
  var r = el ? el.getBoundingClientRect() : null;
  if (r && (r.width || r.height)) {
    return {
      fx: (r.left + r.width / 2 - cr.left) / cr.width,
      fy: (r.top + r.height / 2 - cr.top) / cr.height,
      sx: r.left + r.width / 2 - sr.left,
      sy: r.top + r.height / 2 - sr.top
    };
  }
  return {
    fx: (sr.left + vw / 2 - cr.left) / cr.width,
    fy: (sr.top + vh / 2 - cr.top) / cr.height,
    sx: vw / 2,
    sy: vh / 2
  };
}

// Scroll so the anchored board point sits at the same screen position again.
function sbApplyZoomAnchor(anchor) {
  if (!anchor || !sbEls.scroller || !sbEls.canvas) return;
  var sr = sbEls.scroller.getBoundingClientRect();
  var cr = sbEls.canvas.getBoundingClientRect();
  if (!cr.width || !cr.height) return;
  var currentX = cr.left - sr.left + anchor.fx * cr.width;
  var currentY = cr.top - sr.top + anchor.fy * cr.height;
  sbEls.scroller.scrollLeft += currentX - anchor.sx;
  sbEls.scroller.scrollTop += currentY - anchor.sy;
}

function sbCentreBoard() {
  if (!sbEls.scroller) return;
  sbEls.scroller.scrollLeft = Math.max(0, (sbEls.scroller.scrollWidth - sbEls.scroller.clientWidth) / 2);
  sbEls.scroller.scrollTop = Math.max(0, (sbEls.scroller.scrollHeight - sbEls.scroller.clientHeight) / 2);
}

// ---- Per-board view (zoom + pan) -------------------------------------------
//
// Each board stores its own view in the board data: `view = { zoom, fx, fy }`,
// where fx/fy is the BOARD fraction sitting at the centre of the visible
// scroller. Fractions (not scrollLeft/Top) survive a window-size change between
// visits. A default 0.5/0.5 is exactly "fitted and centred".

// The board fraction currently at the viewport centre.
function sbViewCentre() {
  if (!sbEls.scroller || !sbEls.canvas) return null;
  var sr = sbEls.scroller.getBoundingClientRect();
  var cr = sbEls.canvas.getBoundingClientRect();
  if (!cr.width || !cr.height) return null;
  return {
    fx: (sr.left + sbEls.scroller.clientWidth / 2 - cr.left) / cr.width,
    fy: (sr.top + sbEls.scroller.clientHeight / 2 - cr.top) / cr.height
  };
}

// Snapshot the ACTIVE board's zoom + centre fraction into its own data.
function sbCaptureView() {
  var board = sbActiveBoard();
  if (!board) return;
  if (!board.view) board.view = { zoom: sbZoom(), fx: 0.5, fy: 0.5 };
  board.view.zoom = sbZoom();
  var centre = sbViewCentre();
  if (centre) {
    board.view.fx = Math.min(1.25, Math.max(-0.25, centre.fx));
    board.view.fy = Math.min(1.25, Math.max(-0.25, centre.fy));
  }
}

function sbSaveViewSoon() {
  sbCaptureView();
  sbSaveSoon();
}

function sbSaveViewNow() {
  sbCaptureView();
  sbSaveState();
}

// Put a board's saved fraction back at the centre of the viewport (after the
// final layout, so a zoomed pasteboard already exists).
function sbRestoreBoardView(board) {
  if (!sbEls.scroller || !sbEls.canvas) { sbCentreBoard(); return; }
  var view = board && board.view ? board.view : null;
  if (!view) { sbCentreBoard(); return; }
  sbApplyZoomAnchor({
    fx: view.fx,
    fy: view.fy,
    sx: sbEls.scroller.clientWidth / 2,
    sy: sbEls.scroller.clientHeight / 2
  });
}

// ---- Zoom controls ---------------------------------------------------------

function sbZoomIn() {
  sbZoomStep(1);
}

function sbZoomOut() {
  sbZoomStep(-1);
}

function sbZoomFit() {
  sbZoomTo(1);
}

function sbZoomStep(direction) {
  var index = SB_ZOOM_LEVELS.indexOf(sbNormalizeZoom(sbZoom()));
  if (index < 0) index = SB_ZOOM_LEVELS.indexOf(1);
  var next = SB_ZOOM_LEVELS[Math.min(SB_ZOOM_LEVELS.length - 1, Math.max(0, index + direction))];
  sbZoomTo(next);
}

function sbZoomTo(next) {
  var zoom = sbNormalizeZoom(next);
  if (zoom === sbZoom()) return;
  var anchor = sbZoomAnchorPoint();
  sbState.zoom = zoom;
  var board = sbActiveBoard();
  if (board) {
    if (!board.view) board.view = { zoom: zoom, fx: 0.5, fy: 0.5 };
    else board.view.zoom = zoom;
  }
  sbLayoutBoard(anchor);
  sbRenderConnectors();
  sbPositionSelectionBar();
  // Capture the post-layout centre too (clamping can shift it slightly) and
  // persist the zoom + position together, on the board.
  sbSaveViewNow();
}

function sbUpdateZoomUi() {
  var zoom = sbNormalizeZoom(sbZoom());
  var index = SB_ZOOM_LEVELS.indexOf(zoom);
  var out = document.getElementById("sbZoomOut");
  var inn = document.getElementById("sbZoomIn");
  var fit = document.getElementById("sbZoomFit");
  if (out) out.disabled = index <= 0;
  if (inn) inn.disabled = index >= SB_ZOOM_LEVELS.length - 1;
  if (fit) fit.disabled = zoom === 1;
}

function sbInitBoard() {
  sbEls.area = document.getElementById("storyboardArea");
  sbEls.scroller = document.getElementById("sbScroller");
  sbEls.stage = document.getElementById("sbStage");
  sbEls.canvas = document.getElementById("sbCanvas");
  sbEls.bg = document.getElementById("sbBackground");
  sbEls.items = document.getElementById("sbItems");
  sbEls.hint = document.getElementById("sbEmptyHint");
  sbEls.selBar = document.getElementById("sbSelectionBar");
  sbEls.connectors = document.getElementById("sbConnectors");
  sbEls.connectorPaths = document.getElementById("sbConnectorPaths");
  sbEls.connectHint = document.getElementById("sbConnectHint");
  sbEls.selectionBox = document.getElementById("sbSelectionBox");
  sbLayoutBoard();

  if (sbEls.items) sbEls.items.addEventListener("pointerdown", sbOnPointerDown);
  // The board no longer fills the whole area (it is the artwork, centred with
  // bars around it), so deselect on a click anywhere in the area - the handler
  // ignores objects, connectors, the toolbar, the action bar and the board chip.
  if (sbEls.area) sbEls.area.addEventListener("pointerdown", sbOnCanvasPointerDown);
  if (sbEls.scroller) {
    // Space panning captures pointerdown BEFORE the object/group handlers, so a
    // drag that starts on a sticker pans instead of moving/selecting it.
    sbEls.scroller.addEventListener("pointerdown", sbOnPanPointerDownCapture, true);
    // The action bar is a viewport overlay, so it follows the board while the
    // user scrolls instead of scrolling away with it.
    sbEls.scroller.addEventListener("scroll", function () {
      if (sbScrollRaf) return;
      sbScrollRaf = requestAnimationFrame(function () {
        sbScrollRaf = 0;
        sbPositionSelectionBar();
        // Every pan (scrollbar, wheel, touchpad or Space+drag) updates the
        // active board's saved view (debounced by sbSaveSoon).
        sbSaveViewSoon();
      });
    }, { passive: true });
  }
  if (sbEls.items) sbEls.items.addEventListener("dblclick", sbOnDoubleClick);
  if (sbEls.connectors) sbEls.connectors.addEventListener("pointerdown", sbOnConnectorPointerDown);

  var connect = document.getElementById("sbSelConnect");
  var front = document.getElementById("sbSelFront");
  var duplicate = document.getElementById("sbSelDuplicate");
  var flipH = document.getElementById("sbSelFlipH");
  var flipV = document.getElementById("sbSelFlipV");
  var del = document.getElementById("sbSelDelete");
  var connReverse = document.getElementById("sbConnReverse");
  var connDelete = document.getElementById("sbConnDelete");
  var connectCancel = document.getElementById("sbConnectCancel");
  var groupBtn = document.getElementById("sbSelGroup");
  var ungroupBtn = document.getElementById("sbSelUngroup");
  if (connect) connect.addEventListener("click", sbStartConnect);
  if (front) front.addEventListener("click", sbFrontSelected);
  if (duplicate) duplicate.addEventListener("click", sbDuplicateSelected);
  if (flipH) flipH.addEventListener("click", function () { sbFlipSelected("x"); });
  if (flipV) flipV.addEventListener("click", function () { sbFlipSelected("y"); });
  if (del) del.addEventListener("click", sbDeleteSelected);
  if (groupBtn) groupBtn.addEventListener("click", sbGroupSelected);
  if (ungroupBtn) ungroupBtn.addEventListener("click", sbUngroupSelected);
  // Copy/Paste/Set-default act on the SELECTED text box.
  var copyStyle = document.getElementById("sbSelCopyStyle");
  var pasteStyle = document.getElementById("sbSelPasteStyle");
  var setDefault = document.getElementById("sbSelSetDefault");
  if (copyStyle) copyStyle.addEventListener("click", sbCopySelectedTextStyle);
  if (pasteStyle) pasteStyle.addEventListener("click", sbPasteSelectedTextStyle);
  if (setDefault) setDefault.addEventListener("click", sbSetSelectedTextDefault);
  if (connReverse) connReverse.addEventListener("click", sbReverseSelectedConnector);
  if (connDelete) connDelete.addEventListener("click", sbDeleteSelectedConnector);
  if (connectCancel) connectCancel.addEventListener("click", sbCancelConnect);
  if (sbEls.selectionBox) sbEls.selectionBox.addEventListener("pointerdown", sbOnSelectionPointerDown);
  // "Group with <sticker>?" after a tail drop (ignorable; it expires by itself).
  var promptYes = document.getElementById("sbGroupPromptYes");
  var promptNo = document.getElementById("sbGroupPromptNo");
  if (promptYes) promptYes.addEventListener("click", sbGroupTailWith);
  if (promptNo) promptNo.addEventListener("click", function () { sbHideTailGroupPrompt(); });

  // One Align button; its option row expands on hover (mouse) or tap (touch).
  var alignBtn = document.getElementById("sbSelAlign");
  var alignRow = document.getElementById("sbSelAlignRow");
  if (alignBtn) {
    alignBtn.addEventListener("mouseenter", function () {
      sbCancelAlignHide();
      sbShowAlignMenu(true);
    });
    alignBtn.addEventListener("mouseleave", sbHideAlignMenuSoon);
    alignBtn.addEventListener("focus", function () { sbShowAlignMenu(true); });
    alignBtn.addEventListener("click", function (e) {
      e.preventDefault();
      // Hover-capable pointers already expanded it; a tap toggles.
      var hoverable = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      sbShowAlignMenu(hoverable ? true : !sbState.alignOpen);
    });
  }
  if (alignRow) {
    alignRow.addEventListener("mouseenter", sbCancelAlignHide);
    alignRow.addEventListener("mouseleave", sbHideAlignMenuSoon);
    alignRow.addEventListener("click", function (e) {
      var align = e.target.closest ? e.target.closest("[data-align]") : null;
      if (align) { sbAlignSelection(align.dataset.align); return; }
      var dist = e.target.closest ? e.target.closest("[data-distribute]") : null;
      if (dist) sbDistributeSelection(dist.dataset.distribute);
    });
  }
  if (sbEls.selBar) {
    sbEls.selBar.addEventListener("mouseenter", sbCancelAlignHide);
    sbEls.selBar.addEventListener("mouseleave", sbHideAlignMenuSoon);
  }

  document.addEventListener("pointermove", sbOnPointerMove, { passive: false });
  document.addEventListener("pointerup", sbOnPointerUp);
  document.addEventListener("pointercancel", sbOnPointerUp);
  document.addEventListener("keydown", sbOnKeyDown);
  document.addEventListener("keyup", sbOnPanKeyUp);
  // Without this an alt-tab while Space is held would leave the hand stuck on.
  window.addEventListener("blur", sbOnPanBlur);
  window.addEventListener("resize", function () {
    clearTimeout(sbResizeTimer);
    sbResizeTimer = setTimeout(function () {
      // Re-fit on window resize AND browser zoom: the UI grows/shrinks with the
      // page, the board takes the remaining space, and the artwork scale keeps
      // the text/stickers/connectors in place on the picture. Anchor on the
      // selection (or the view centre) so a resize does not lose the user's place.
      var anchor = sbZoomAnchorPoint();
      sbLayoutBoard(anchor);
      sbApplyAllTextNudges();
      sbRenderConnectors();
      sbPositionSelectionBar();
    }, 120);
  });

  // Persist the view when the page goes away (reload/close/backgrounded PWA).
  window.addEventListener("pagehide", function () { sbSaveViewNow(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sbSaveViewNow();
  });

  // Text metrics change when a font loads or the font size setting moves, which
  // moves the box edges a connector must attach to.
  if (window.ResizeObserver) {
    sbEls.objectObserver = new ResizeObserver(function () {
      sbRenderConnectors();
      sbPositionSelectionBar();
      // The text box resized (text/font/scale): re-measure the bubbles.
      sbUpdateAllBubbles();
    });
  }
}

function renderMain() {
  sbRender();
}

// Paint the active scene's background. `data-background` is PART of the painting,
// not just a colour hook: the empty-board state carries the dot grid's 24px
// `background-size`, so an image painted while the element still says "none"
// renders as ONE tiny tile in the middle of the board (reported as "the
// background is only a small image in the centre"). Every paint path must go
// through here - sbRender() and the async OneDrive resolve alike.
function sbPaintBackground() {
  if (!sbEls.bg) return;
  var board = sbActiveBoard();
  if (!board) return;
  // The painting is a built-in asset path, a cached object URL, a restored data
  // URL, or (until the full image lands) a OneDrive thumbnail.
  var src = board.background && typeof sbBackgroundSrcFor === "function"
    ? sbBackgroundSrcFor(board.background) : "";
  if (!src) {
    // REMOVE the inline property rather than assigning "": an empty inline
    // background-image would override the CSS dot-grid for the empty board.
    sbEls.bg.style.removeProperty("background-image");
    sbEls.bg.dataset.background = "none";
    return;
  }
  sbEls.bg.style.backgroundImage = 'url("' + src + '")';
  var isOd = typeof sbIsOdBackground === "function" && sbIsOdBackground(board.background);
  var meta = isOd || typeof sbBackgroundById !== "function" ? null : sbBackgroundById(board.background);
  // Built-in paintings keep their brand colour; anything else (OneDrive, an id
  // this build no longer knows) is a plain "custom" painting. NEVER leave the
  // attribute at "none" while an image is set, and never throw here - an
  // exception used to abandon the rest of the render.
  sbEls.bg.dataset.background = meta ? meta.id : "custom";
}

function sbRender() {
  if (!sbEls.items) sbInitBoard();
  var board = sbActiveBoard();
  if (!board || !sbEls.items) return;

  // Size the board to the artwork BEFORE building items: the sticker width is
  // board-relative and the item % positions live in this box.
  sbLayoutBoard();

  var story = typeof sbActiveStory === "function" ? sbActiveStory() : null;
  // Fit = contain (letterboxed over the board colour); stretch = fill the size.
  sbEls.bg.dataset.fit = typeof sbStoryFit === "function" ? sbStoryFit(story) : "fit";
  sbPaintBackground();

  sbEls.items.innerHTML = "";
  if (sbEls.objectObserver) sbEls.objectObserver.disconnect();
  var ordered = board.items.slice().sort(function (a, b) {
    return (Number(a.z) || 0) - (Number(b.z) || 0);
  });
  ordered.forEach(function (item) {
    var el = sbBuildItem(item);
    sbEls.items.appendChild(el);
    if (sbEls.objectObserver) sbEls.objectObserver.observe(el);
  });
  // A bubble needs the BUILT, laid-out text box to measure its body and tail.
  sbUpdateAllBubbles();

  sbApplyAllTextNudges();
  // Re-run the layout now the items exist: the pasteboard must cover the
  // rendered objects and the selected item's grab handles. A board/background
  // change also recentres the scroller, so a remembered zoom opens on the
  // middle of the board instead of its top-left corner.
  sbLayoutBoard();
  var layoutKey = board.id + "|" + board.background;
  if (sbEls.layoutKey !== layoutKey) {
    sbEls.layoutKey = layoutKey;
    // First paint after a reload, or a board/background switch: reopen at the
    // board's OWN saved fraction (a never-panned 0.5/0.5 is simply centred).
    sbRestoreBoardView(board);
  }
  sbRenderConnectors();
  sbApplyConnectClasses();

  // The hint coaches a BLANK board. A chosen background already makes it a board,
  // so it must not sit over the artwork ("Choose a background..." in the middle of
  // a painting was reported).
  if (sbEls.hint) {
    sbEls.hint.classList.toggle("d-none", board.items.length > 0 || !!board.background);
  }
  // The nav bar carries the only "where am I" readout now that the floating
  // board chip is gone: "Storyboard - <story>/<scene>".
  sbUpdateNavTitle();
  sbUpdateSelectionUi();

  // The OneDrive background (if any) may need its bytes after a reload: resolve
  // from the sticker-style cache first, then the network.
  if (typeof sbBgEnsureStoryBackground === "function") sbBgEnsureStoryBackground();

  // OneDrive stickers on this scene may not have their bytes in memory yet (a
  // reload, or a scene opened before its library tab was ever shown). Resolve
  // them from the sticker cache (offline-safe), then fetch any misses - guarded
  // by the id set, so an unchanged board costs one cheap comparison.
  if (typeof sbStickerEnsureStoryImages === "function") sbStickerEnsureStoryImages();
}

function sbBuildItem(item) {
  var el = document.createElement("div");
  el.className = "sb-object sb-object-" + item.type;
  if (item.id === sbState.selectedId) el.classList.add("selected");
  el.dataset.id = item.id;
  el.style.left = item.x + "%";
  el.style.top = item.y + "%";
  el.style.zIndex = String(Number(item.z) || 1);
  el.style.transform = "translate(-50%, -50%) rotate(" + item.rotation + "deg)";

  if (item.type === "sticker") {
    el.style.setProperty("--sb-scale", item.scale);
    var img = document.createElement("img");
    img.className = "sb-sticker";
    // Built-in SVG asset, a cached blob: URL for a OneDrive sticker, a data:
    // URL restored from a backup, or the placeholder until its bytes arrive.
    img.src = sbStickerSrcFor(item);
    img.alt = sbStickerNameFor(item);
    img.draggable = false;
    el.appendChild(img);
    sbApplyStickerFlip(el, item);
  } else if (item.type === "note") {
    // A note is an EDITOR CUE: an icon whose text is the tooltip (and the
    // panel). It is deliberately not drawn on the artwork or in the JPG.
    el.style.setProperty("--sb-scale", item.scale);
    var glyph = document.createElement("span");
    glyph.className = "sb-note";
    glyph.style.color = item.color;
    glyph.innerHTML = '<i class="fa-solid fa-sticky-note" aria-hidden="true"></i>';
    el.appendChild(glyph);
    el.title = item.text || "Note";
  } else {
    var text = document.createElement("div");
    sbStyleTextElement(text, item);
    el.appendChild(text);
  }

  var scaleHandle = document.createElement("span");
  scaleHandle.className = "sb-handle sb-handle-scale";
  scaleHandle.dataset.handle = "scale";
  scaleHandle.setAttribute("aria-hidden", "true");
  el.appendChild(scaleHandle);

  // Notes scale but never rotate, so they get NO rotate handle at all.
  if (item.type !== "note") {
    var rotateHandle = document.createElement("span");
    rotateHandle.className = "sb-handle sb-handle-rotate";
    rotateHandle.dataset.handle = "rotate";
    rotateHandle.setAttribute("aria-hidden", "true");
    rotateHandle.innerHTML = '<i class="fa-solid fa-rotate"></i>';
    el.appendChild(rotateHandle);
  }

  return el;
}

function sbStyleTextElement(el, item) {
  el.className = "sb-text sb-font-" + item.font;
  el.dataset.frame = item.border;
  // A theme TOKEN keeps a class (legacy scenes); a fixed hex from the colour
  // picker is an inline declaration, so a swap cannot repaint it.
  // A BUBBLE paints its fill on the generated shape instead, so the box itself
  // must stay transparent (otherwise a rectangle shows inside the bubble).
  sbApplyTextPaint(el, "bg", sbHasBubble(item.bubble) ? "transparent" : item.bg);
  sbApplyTextPaint(el, "color", item.color);
  var body = el.querySelector(".sb-text-body");
  if (!body) {
    body = document.createElement("span");
    body.className = "sb-text-body";
    el.textContent = "";
    el.appendChild(body);
  }
  body.textContent = item.text || " ";
  el.style.setProperty("--sb-text-scale", item.scale);
  // The background's corner radius (the CSS multiplies it by the design scale).
  el.style.setProperty("--sb-text-radius", (Number(item.radius) || 0) + "px");
  // A frame's thickness/space come from the shared Line controls (the CSS
  // multiplies these by --sb-design-scale, so a resize keeps them right).
  el.style.setProperty("--sb-frame-width", (Number(item.lineWidth) || SB_FRAME_DEFAULT_WIDTH) + "px");
  el.style.setProperty("--sb-frame-gap", (Number(item.lineGap) || 0) + "px");
  if (item.border && item.border !== "none") {
    el.style.setProperty("--sb-frame-image", 'url("' + sbFrameDataUri(item.border, sbResolveColor(item.color)) + '")');
  } else {
    el.style.removeProperty("--sb-frame-image");
  }
}

// Live repaint of ONE note (its colour + tooltip) without rebuilding the board:
// the panel edits as you type, and a rebuild would steal the textarea focus.
function sbApplyNoteStyle(item) {
  var el = sbItemEl(item.id);
  if (!el) return;
  var glyph = el.querySelector(".sb-note");
  if (glyph) glyph.style.color = item.color;
  el.title = item.text || "Note";
}

// ---- Speech bubbles ---------------------------------------------------------
//
// The bubble is ONE generated SVG path (body + tail) in the text box's local
// pixels, centred on the box: the FILL and the LINE use the same path (the line
// inset by lineGap + lineWidth/2), which is what makes the border flow round the
// tail. The exporter builds the identical path, so the JPG matches the board.

var SB_BUBBLE_PAD = 10;        // design-scaled gap between the text box and the body
var SB_BUBBLE_MIN_TAIL = 16;   // design-scaled minimum body edge -> tip distance
var SB_TAIL_PROMPT_MS = 5000;  // how long "Group with ..." waits before expiring

function sbApplyTextPaint(el, field, value) {
  var prefix = "sb-" + field + "-";
  Array.prototype.slice.call(el.classList).forEach(function (name) {
    if (name.indexOf(prefix) === 0) el.classList.remove(name);
  });
  var prop = field === "bg" ? "backgroundColor" : "color";
  if (sbIsHexColor(value)) {
    el.style[prop] = String(value).toLowerCase();
    return;
  }
  el.style.removeProperty(field === "bg" ? "background-color" : "color");
  var tokens = field === "bg" ? SB_BG_TOKENS : SB_TEXT_TOKENS;
  if (tokens.indexOf(value) >= 0) el.classList.add(prefix + value);
}

// Local px metrics for one bubble, centred on the text box (w/h = the text box's
// offsetWidth/Height, cw/ch = the canvas size used to turn the stored tail % into
// px). The exporter passes the live values, so both paths are identical.
function sbBubbleMetrics(item, w, h, cw, ch) {
  var scale = sbDesignScale();
  var pad = SB_BUBBLE_PAD * scale;
  var tail = item.tail || { dx: 0, dy: 14 };
  return {
    shape: item.bubble === "oval" ? "oval" : "round",
    scale: scale,
    stroke: Math.max(0, Number(item.lineWidth) || 0) * scale,
    gap: Math.max(0, Number(item.lineGap) || 0) * scale,
    minTail: SB_BUBBLE_MIN_TAIL * scale,
    body: {
      x: -w / 2 - pad,
      y: -h / 2 - pad,
      w: w + pad * 2,
      h: h + pad * 2,
      // The bubble body follows the same corner radius as the box.
      r: Math.min((Number(item.radius) || 0) * scale, (Math.min(w, h) + pad * 2) / 2)
    },
    // The user's tip is in BOARD % of the item's centre; the drawn tip is pushed
    // outside a body the user dragged it into (a tail that points inward would
    // self-intersect the fill).
    rawTip: {
      x: (Number(tail.dx) || 0) / 100 * (cw || w),
      y: (Number(tail.dy) || 0) / 100 * (ch || h)
    }
  };
}

function sbBubbleTipPoint(m, inset) {
  var b = m.body;
  var x = b.x + inset, y = b.y + inset;
  var w = Math.max(2, b.w - inset * 2), h = Math.max(2, b.h - inset * 2);
  var tip = { x: m.rawTip.x, y: m.rawTip.y };
  var minTail = m.minTail + inset;
  var cx = x + w / 2, cy = y + h / 2;
  var px, py;
  if (m.shape === "oval") {
    var rx = Math.max(1, w / 2), ry = Math.max(1, h / 2);
    var ang = Math.atan2((tip.y - cy) / ry, (tip.x - cx) / rx);
    px = cx + rx * Math.cos(ang);
    py = cy + ry * Math.sin(ang);
  } else {
    px = Math.min(Math.max(tip.x, x), x + w);
    py = Math.min(Math.max(tip.y, y), y + h);
    if (px === tip.x && py === tip.y) {
      // Inside the body: push out through the nearest edge.
      var dl = tip.x - x, dr = x + w - tip.x, dt = tip.y - y, db = y + h - tip.y;
      var best = Math.min(dl, dr, dt, db);
      if (best === dl) px = x;
      else if (best === dr) px = x + w;
      else if (best === dt) py = y;
      else py = y + h;
    }
  }
  // Enforce a minimum tail length by pushing the tip along ITS OWN direction: a
  // tip that is only slightly past a CORNER must not be dragged onto the corner
  // (that diagonal pull is what used to shorten the tail there).
  var dxp = tip.x - px, dyp = tip.y - py;
  var lenp = Math.hypot(dxp, dyp);
  if (lenp < 0.001) {
    var ox = px - cx, oy = py - cy;
    var olen = Math.hypot(ox, oy) || 1;
    tip.x = px + ox / olen * minTail;
    tip.y = py + oy / olen * minTail;
  } else if (lenp < minTail) {
    tip.x = px + dxp / lenp * minTail;
    tip.y = py + dyp / lenp * minTail;
  }
  return tip;
}

// The base width of the tail: wider for a longer tail, clamped to a sane range.
function sbTailBaseWidth(m, tip, base) {
  var dist = Math.hypot(tip.x - base.x, tip.y - base.y);
  return Math.min(64 * m.scale, Math.max(14 * m.scale, dist * 0.5));
}

// One side of the tail as a quadratic bowing AWAY from the tail's AXIS: the
// control point is offset perpendicular to the axis, and the two sides take
// opposite signs. The old version offset perpendicular to each side's OWN chord,
// which flipped sides whenever the mouth was pinched against a corner - the two
// curves then crossed and a diagonal tail collapsed to an empty sliver.
function sbTailSideCurve(p0, tip, nx, ny, bow) {
  var mx = (p0.x + tip.x) / 2 + nx * bow;
  var my = (p0.y + tip.y) / 2 + ny * bow;
  return " Q " + mx + " " + my + " " + tip.x + " " + tip.y;
}

// Both tail sides for one mouth (the axis runs from the mouth centre to the tip).
function sbTailSides(base, tip, baseStart, baseEnd, bow) {
  var dx = tip.x - base.x, dy = tip.y - base.y;
  var len = Math.hypot(dx, dy) || 1;
  var nx = -dy / len, ny = dx / len;
  var s1 = ((baseStart.x - base.x) * nx + (baseStart.y - base.y) * ny) >= 0 ? 1 : -1;
  var s2 = ((baseEnd.x - base.x) * nx + (baseEnd.y - base.y) * ny) >= 0 ? 1 : -1;
  return {
    fromStart: sbTailSideCurve(baseStart, tip, nx * s1, ny * s1, bow),
    toEnd: sbTailSideCurve(tip, baseEnd, nx * s2, ny * s2, bow)
  };
}

// Move the tail tip along its OWN axis: the LINE and the selection ring are the
// same shape pulled in (or pushed out) by the inset, so the "space" parameter has
// to reach the tip as well - otherwise the line runs into the fill's tip.
function sbTailShrinkTip(base, tip, shrink) {
  if (!shrink) return tip;
  var dx = tip.x - base.x, dy = tip.y - base.y;
  var len = Math.hypot(dx, dy) || 1;
  var next = Math.max(1, len - shrink);
  return { x: base.x + dx / len * next, y: base.y + dy / len * next };
}

function sbPt(p) {
  return p.x + " " + p.y;
}

// The rounded body's outline as 8 CLOCKWISE segments (the 4 straight edges and
// the 4 corner arcs) addressed by ARC LENGTH. The tail's mouth is placed by arc
// length from the point the tail points at, so it can straddle a CORNER - one
// mouth point on each of two adjacent sides. Clamping both onto one straight run
// squashed the mouth against the corner as the tail went round the box.
function sbRoundOutline(x, y, w, h, r) {
  var segs = [];
  function addLine(x0, y0, x1, y1) {
    var len = Math.hypot(x1 - x0, y1 - y0);
    segs.push({
      type: "line", len: len,
      at: function (u) {
        var k = len ? Math.min(Math.max(u / len, 0), 1) : 0;
        return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k };
      }
    });
  }
  function addArc(cx, cy, a0, a1) {
    var len = Math.abs(a1 - a0) * r;
    segs.push({
      type: "arc", len: len, r: r,
      at: function (u) {
        var k = len ? Math.min(Math.max(u / len, 0), 1) : 0;
        var ang = a0 + (a1 - a0) * k;
        return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
      }
    });
  }
  var q = Math.PI / 2;
  // top edge (left -> right), then clockwise: TR arc, right, BR arc, bottom,
  // BL arc, left, TL arc.
  addLine(x + r, y, x + w - r, y);
  addArc(x + w - r, y + r, -q, 0);
  addLine(x + w, y + r, x + w, y + h - r);
  addArc(x + w - r, y + h - r, 0, q);
  addLine(x + w - r, y + h, x + r, y + h);
  addArc(x + r, y + h - r, q, Math.PI);
  addLine(x, y + h - r, x, y + r);
  addArc(x + r, y + r, Math.PI, Math.PI * 1.5);
  var total = 0;
  for (var i = 0; i < segs.length; i++) { segs[i].s0 = total; total += segs[i].len; }
  return { segs: segs, total: Math.max(4, total) };
}

function sbOutlineSegmentAt(outline, s) {
  var segs = outline.segs;
  var total = outline.total;
  var t = ((s % total) + total) % total;
  // A position exactly on a SEGMENT BOUNDARY (most importantly the outline's
  // SEAM at arc length 0/total) must belong to the segment that STARTS there.
  // Floating point could land a hair past the end, which matched no segment and
  // returned the last one's END - sbOutlineWalk then broke out of its loop and the
  // path jumped straight across the box.
  if (t >= total - 1e-6) t = 0;
  for (var i = 0; i < segs.length; i++) {
    if (t < segs[i].s0 + segs[i].len - 1e-9) return { seg: segs[i], u: Math.max(0, t - segs[i].s0) };
  }
  return { seg: segs[segs.length - 1], u: segs[segs.length - 1].len };
}

function sbOutlinePointAt(outline, s) {
  var hit = sbOutlineSegmentAt(outline, s);
  return hit.seg.at(hit.u);
}

// Walk CLOCKWISE from arc length `from` to `to` (to > from), emitting path pieces.
function sbOutlineWalk(outline, from, to) {
  var out = "";
  var s = from;
  var guard = 0;
  while (to - s > 0.001 && guard++ < 64) {
    var hit = sbOutlineSegmentAt(outline, s);
    var seg = hit.seg;
    var take = Math.min(seg.len - hit.u, to - s);
    if (!(take > 0)) {
      // Nudge past a degenerate boundary rather than abandoning the rest of the
      // outline (that left the path with a straight jump to the other mouth point).
      s += 1e-4;
      continue;
    }
    s += take;
    var pt = seg.at(hit.u + take);
    out += seg.type === "arc"
      ? " A " + seg.r + " " + seg.r + " 0 0 1 " + pt.x + " " + pt.y
      : " L " + pt.x + " " + pt.y;
  }
  return out;
}

// The bubble outline (body + tail) as one closed path. `inset` contracts the whole
// shape - a NEGATIVE inset grows it, which is the selection ring.
function sbBubblePathD(m, inset) {
  var g = Number(inset) || 0;
  var b = m.body;
  var x = b.x + g, y = b.y + g;
  var w = Math.max(2, b.w - g * 2), h = Math.max(2, b.h - g * 2);
  var tip = sbBubbleTipPoint(m, g);
  if (m.shape === "oval") return sbOvalBubbleD(x, y, w, h, tip, m, g);
  return sbRoundBubbleD(x, y, w, h, Math.max(0.5, Math.min(b.r - g, Math.min(w, h) / 2)), tip, m, g);
}

// Rounded rect + tail. The body is walked CLOCKWISE from one mouth point round to
// the other, so the outline never crosses the tail's opening.
function sbRoundBubbleD(x, y, w, h, r, tip, m, shrink) {
  var outline = sbRoundOutline(x, y, w, h, r);
  var total = outline.total;
  var cx = x + w / 2, cy = y + h / 2;
  var dxr = tip.x - cx, dyr = tip.y - cy;
  var e, t;
  // Which edge does the tip point at? The RAY from the body centre (a tip past a
  // corner must leave through the edge it points at).
  if (Math.abs(dyr) * (w / 2 || 1) >= Math.abs(dxr) * (h / 2 || 1)) {
    var yEdge = dyr >= 0 ? y + h : y;
    var crossX = cy === yEdge ? cx : cx + dxr * ((yEdge - cy) / (dyr || 1));
    e = dyr >= 0 ? 2 : 0;
    t = e === 2 ? (x + w - r) - crossX : crossX - (x + r);
  } else {
    var xEdge = dxr >= 0 ? x + w : x;
    var crossY = cx === xEdge ? cy : cy + dyr * ((xEdge - cx) / (dxr || 1));
    e = dxr >= 0 ? 1 : 3;
    t = e === 1 ? crossY - (y + r) : (y + h - r) - crossY;
  }
  // The straight edges are segments 0/2/4/6; an out-of-range t simply continues
  // into the neighbouring corner ARC - that is what lets the mouth wrap a corner.
  var s0 = outline.segs[e * 2].s0 + t;
  var mouth = sbOutlinePointAt(outline, s0);
  tip = sbTailShrinkTip(mouth, tip, shrink);
  var baseW = sbTailBaseWidth(m, tip, mouth);
  var half = Math.min(baseW / 2, total * 0.45);
  var baseStart = sbOutlinePointAt(outline, s0 - half);
  var baseEnd = sbOutlinePointAt(outline, s0 + half);
  var d = "M " + sbPt(baseEnd);
  d += sbOutlineWalk(outline, s0 + half, s0 - half + total);
  var sides = sbTailSides(mouth, tip, baseStart, baseEnd, baseW * 0.22);
  d += sides.fromStart;
  d += sides.toEnd;
  d += " Z";
  return d;
}

// Ellipse body + tail: the arc goes the LONG way round from one base point to the
// other.
function sbOvalBubbleD(x, y, w, h, tip, m, shrink) {
  var cx = x + w / 2, cy = y + h / 2;
  var rx = Math.max(1, w / 2), ry = Math.max(1, h / 2);
  var ang = Math.atan2((tip.y - cy) / ry, (tip.x - cx) / rx);
  var base = { x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) };
  tip = sbTailShrinkTip(base, tip, shrink);
  var baseW = sbTailBaseWidth(m, tip, base);
  var dAng = Math.min(0.6, Math.max(0.06, (baseW / 2) / Math.max(rx, ry, 1)));
  function at(a) { return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }; }
  var baseStart = at(ang - dAng);
  var baseEnd = at(ang + dAng);
  var d = "M " + sbPt(baseEnd);
  d += " A " + rx + " " + ry + " 0 1 1 " + sbPt(baseStart);
  var sides = sbTailSides(base, tip, baseStart, baseEnd, baseW * 0.22);
  d += sides.fromStart;
  d += sides.toEnd;
  d += " Z";
  return d;
}

function sbEnsureBubbleSvg(textEl) {
  var svg = textEl.querySelector(":scope > .sb-bubble");
  if (svg) return svg;
  svg = document.createElementNS(SB_SVG_NS, "svg");
  svg.setAttribute("class", "sb-bubble");
  svg.setAttribute("aria-hidden", "true");
  // The LINE is the fill shape stroked WIDE, clipped to the shape and masked back
  // by the space (see sbUpdateBubble). That is the only way to keep the margin
  // uniform all the way round - a separately generated "inset path" drifts where
  // the tail meets the body and pinches on one side.
  var defs = document.createElementNS(SB_SVG_NS, "defs");
  var clip = document.createElementNS(SB_SVG_NS, "clipPath");
  clip.setAttribute("class", "sb-bubble-clip");
  clip.setAttribute("clipPathUnits", "userSpaceOnUse");
  clip.appendChild(document.createElementNS(SB_SVG_NS, "path"));
  var mask = document.createElementNS(SB_SVG_NS, "mask");
  mask.setAttribute("class", "sb-bubble-mask");
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  var maskRect = document.createElementNS(SB_SVG_NS, "rect");
  maskRect.setAttribute("fill", "#ffffff");
  var maskPath = document.createElementNS(SB_SVG_NS, "path");
  maskPath.setAttribute("fill", "none");
  maskPath.setAttribute("stroke", "#000000");
  mask.appendChild(maskRect);
  mask.appendChild(maskPath);
  defs.appendChild(clip);
  defs.appendChild(mask);
  svg.appendChild(defs);
  // fill -> line -> selection ring (the ring is CSS-hidden unless selected).
  ["sb-bubble-fill", "sb-bubble-line", "sb-bubble-outline"].forEach(function (cls) {
    var path = document.createElementNS(SB_SVG_NS, "path");
    path.setAttribute("class", cls);
    svg.appendChild(path);
  });
  textEl.insertBefore(svg, textEl.firstChild);
  return svg;
}

// Paint (or clear) one bubble: the generated shape, its line and the tail handle.
function sbUpdateBubble(item) {
  if (!sbEls.items) return;
  var obj = sbEls.items.querySelector('.sb-object[data-id="' + item.id + '"]');
  if (!obj) return;
  var textEl = obj.querySelector(".sb-text");
  if (!textEl) return;
  if (!sbHasBubble(item.bubble)) {
    var stale = textEl.querySelector(":scope > .sb-bubble");
    if (stale) stale.remove();
    var staleHandle = obj.querySelector(".sb-handle-tail");
    if (staleHandle) staleHandle.remove();
    return;
  }
  var cw = sbEls.canvas ? sbEls.canvas.clientWidth : textEl.offsetWidth;
  var ch = sbEls.canvas ? sbEls.canvas.clientHeight : textEl.offsetHeight;
  var m = sbBubbleMetrics(item, textEl.offsetWidth, textEl.offsetHeight, cw, ch);
  // The FILL tip is the extreme point (the line stops lineGap short of it).
  var tip = sbBubbleTipPoint(m, 0);
  var svg = sbEnsureBubbleSvg(textEl);
  var fill = svg.querySelector(".sb-bubble-fill");
  var line = svg.querySelector(".sb-bubble-line");

  var shapeD = sbBubblePathD(m, 0);
  var uid = "sbb-" + String(item.id).replace(/[^A-Za-z0-9_-]/g, "_");
  fill.setAttribute("d", shapeD);
  fill.setAttribute("stroke", "none");
  fill.setAttribute("fill", item.bg === "transparent" ? "none" : sbResolveColor(item.bg));

  // The ring: stroke the SAME path wide enough to reach lineGap + lineWidth in
  // from the edge, clip it to the shape (nothing outside) and mask the inner
  // lineGap away. The visible band is therefore [lineGap, lineGap + lineWidth]
  // from the edge EVERYWHERE - body, corners and both sides of the tail.
  var clipEl = svg.querySelector(".sb-bubble-clip");
  var maskEl = svg.querySelector(".sb-bubble-mask");
  if (clipEl) {
    clipEl.setAttribute("id", uid + "-clip");
    clipEl.firstChild.setAttribute("d", shapeD);
  }
  if (maskEl) {
    maskEl.setAttribute("id", uid + "-mask");
    var maskStroke = maskEl.querySelector("path");
    if (maskStroke) {
      maskStroke.setAttribute("d", shapeD);
      maskStroke.setAttribute("stroke-width", String(m.gap * 2));
    }
  }
  line.setAttribute("d", shapeD);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", sbResolveColor(item.stroke) || SB_BUBBLE_DEFAULT_STROKE);
  line.setAttribute("stroke-width", String((m.gap + m.stroke) * 2));
  line.setAttribute("stroke-linejoin", "round");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("clip-path", "url(#" + uid + "-clip)");
  line.setAttribute("mask", "url(#" + uid + "-mask)");
  var ring = svg.querySelector(".sb-bubble-outline");
  if (ring) ring.setAttribute("d", sbBubblePathD(m, -(2 + 4 * m.scale)));

  // The SVG is centred on the text box, then shifted by the view centre so the
  // local coordinates map 1:1 (the tail may hang outside the box).
  var margin = m.stroke + 2 + 8 * m.scale;
  var minX = Math.min(m.body.x, tip.x) - margin;
  var minY = Math.min(m.body.y, tip.y) - margin;
  var maxX = Math.max(m.body.x + m.body.w, tip.x) + margin;
  var maxY = Math.max(m.body.y + m.body.h, tip.y) + margin;
  var vw = Math.max(1, maxX - minX);
  var vh = Math.max(1, maxY - minY);
  svg.setAttribute("viewBox", minX + " " + minY + " " + vw + " " + vh);
  if (maskEl) {
    // The mask's REGION must be set explicitly: with maskUnits="userSpaceOnUse"
    // its -10%..120% default resolves against the viewport ORIGIN, so anything
    // left of/above that is clipped away (that hid the whole left side of the
    // line and made the ring look asymmetric).
    maskEl.setAttribute("x", String(minX));
    maskEl.setAttribute("y", String(minY));
    maskEl.setAttribute("width", String(vw));
    maskEl.setAttribute("height", String(vh));
    var mrect = maskEl.querySelector("rect");
    if (mrect) {
      mrect.setAttribute("x", String(minX));
      mrect.setAttribute("y", String(minY));
      mrect.setAttribute("width", String(vw));
      mrect.setAttribute("height", String(vh));
    }
  }
  svg.style.width = vw + "px";
  svg.style.height = vh + "px";
  svg.style.left = "50%";
  svg.style.top = "50%";
  svg.style.transform = "translate(-50%, -50%) translate(" + (minX + vw / 2) + "px," + (minY + vh / 2) + "px)";

  sbPositionTailHandle(obj, tip);
}

function sbPositionTailHandle(obj, tip) {
  var handle = obj.querySelector(".sb-handle-tail");
  if (!handle) {
    handle = document.createElement("span");
    handle.className = "sb-handle sb-handle-tail";
    handle.dataset.handle = "tail";
    handle.setAttribute("aria-hidden", "true");
    handle.title = "Drag to point the tail";
    obj.appendChild(handle);
  }
  handle.style.left = "calc(50% + " + tip.x + "px)";
  handle.style.top = "calc(50% + " + tip.y + "px)";
}

function sbUpdateAllBubbles() {
  if (!sbEls.items) return;
  sbEls.items.querySelectorAll(".sb-object-text").forEach(function (obj) {
    var item = sbFindItem(obj.dataset.id);
    if (item && sbHasBubble(item.bubble)) sbUpdateBubble(item);
  });
}

// Where the tail tip is, on screen (used by the drop hit-test and the prompt).
function sbTailClientPoint(item) {
  var obj = sbItemEl(item.id);
  var textEl = obj ? obj.querySelector(".sb-text") : null;
  if (!textEl) return null;
  var rect = textEl.getBoundingClientRect();
  var cw = sbEls.canvas ? sbEls.canvas.clientWidth : 0;
  var ch = sbEls.canvas ? sbEls.canvas.clientHeight : 0;
  var m = sbBubbleMetrics(item, textEl.offsetWidth, textEl.offsetHeight, cw, ch);
  var tip = sbBubbleTipPoint(m, 0);
  var rad = (Number(item.rotation) || 0) * Math.PI / 180;
  return {
    x: rect.left + rect.width / 2 + tip.x * Math.cos(rad) - tip.y * Math.sin(rad),
    y: rect.top + rect.height / 2 + tip.x * Math.sin(rad) + tip.y * Math.cos(rad)
  };
}

// The tail tip in BOARD % (what the drag saves), i.e. the DRAWN tip so a clamped
// tail never jumps when it is grabbed.
function sbBubbleTipPct(item) {
  var obj = sbItemEl(item.id);
  var textEl = obj ? obj.querySelector(".sb-text") : null;
  var cw = sbEls.canvas ? sbEls.canvas.clientWidth : 0;
  var ch = sbEls.canvas ? sbEls.canvas.clientHeight : 0;
  if (!textEl || !cw || !ch) return item.tail || { dx: 0, dy: 14 };
  var m = sbBubbleMetrics(item, textEl.offsetWidth, textEl.offsetHeight, cw, ch);
  var tip = sbBubbleTipPoint(m, 0);
  return { dx: tip.x / cw * 100, dy: tip.y / ch * 100 };
}

// ---- "Group with this sticker?" (the tail was dropped on a sticker) ---------

function sbHideTailGroupPrompt() {
  if (sbState.tailPromptTimer) {
    clearTimeout(sbState.tailPromptTimer);
    sbState.tailPromptTimer = 0;
  }
  var box = document.getElementById("sbGroupPrompt");
  if (!box || box.classList.contains("d-none")) return;
  box.classList.add("d-none");
  box.dataset.textId = "";
  box.dataset.stickerId = "";
}

function sbShowTailGroupPrompt(item, other) {
  var box = document.getElementById("sbGroupPrompt");
  var label = document.getElementById("sbGroupPromptText");
  if (!box || !label) return;
  sbHideTailGroupPrompt();
  var name = (typeof sbStickerNameFor === "function" ? sbStickerNameFor(other) : "") || "sticker";
  label.textContent = 'Group with "' + name + '"?';
  box.dataset.textId = item.id;
  box.dataset.stickerId = other.id;
  box.classList.remove("d-none");
  sbPositionTailGroupPrompt(item);
  sbState.tailPromptTimer = setTimeout(sbHideTailGroupPrompt, SB_TAIL_PROMPT_MS);
}

function sbPositionTailGroupPrompt(item) {
  var box = document.getElementById("sbGroupPrompt");
  if (!box || !sbEls.area) return;
  var tip = sbTailClientPoint(item);
  if (!tip) return;
  var area = sbEls.area.getBoundingClientRect();
  var w = box.offsetWidth || 240;
  var h = box.offsetHeight || 40;
  var left = Math.min(Math.max(tip.x - area.left - w / 2, 8), Math.max(8, area.width - w - 8));
  var top = tip.y - area.top + 18;
  if (top + h > area.height - 8) top = Math.max(8, tip.y - area.top - h - 18);
  box.style.left = left + "px";
  box.style.top = top + "px";
}

// The topmost STICKER under the tail tip (the handle itself is ignored, or the
// hit-test would always find the bubble).
function sbStickerUnderTail(item) {
  var tip = sbTailClientPoint(item);
  if (!tip) return null;
  var stack = document.elementsFromPoint(tip.x, tip.y) || [];
  for (var i = 0; i < stack.length; i++) {
    var el = stack[i];
    if (!el || !el.closest) continue;
    if (el.closest(".sb-handle") || el.closest("#sbGroupPrompt")) continue;
    var obj = el.closest(".sb-object");
    if (!obj) continue;
    var other = sbFindItem(obj.dataset.id);
    if (other && other.type === "sticker" && other.id !== item.id) return other;
  }
  return null;
}

function sbTailDrop(textId) {
  var item = sbFindItem(textId);
  if (!item || !sbHasBubble(item.bubble)) return;
  var other = sbStickerUnderTail(item);
  if (!other) return;
  // Already together? Then there is nothing to offer.
  var group = sbTopGroupId(item.id);
  if (group === sbTopGroupId(other.id)) return;
  sbShowTailGroupPrompt(item, other);
}

function sbGroupTailWith() {
  var box = document.getElementById("sbGroupPrompt");
  if (!box) return;
  var textId = box.dataset.textId;
  var stickerId = box.dataset.stickerId;
  sbHideTailGroupPrompt();
  if (!textId || !stickerId || !sbFindItem(textId) || !sbFindItem(stickerId)) return;
  sbSetSelection([textId, stickerId]);
  sbGroupSelected();
}

// One shared canvas for text metrics (created lazily: the exporter and the
// live board both measure through here, so they can never disagree).
var sbTextMetricsCanvas = null;

function sbTextMeasureCtx() {
  if (!sbTextMetricsCanvas) {
    sbTextMetricsCanvas = document.createElement("canvas");
  }
  return sbTextMetricsCanvas.getContext("2d");
}

// Everything needed to place a text box's INK: how much of the line box is empty
// above/below the glyphs (so the box can hug the text instead of reserving space
// for descenders it does not have), plus where the FIRST BASELINE sits inside the
// trimmed box - the JPG exporter draws from that, so live and export agree.
//
// The trim is applied as an equal pair of negative margins on the inner span, and
// the top/bottom PADDING is equal, so the glyphs end up exactly centred in the box.
function sbTextInkMetrics(el, item) {
  if (!el) return null;
  var cs = getComputedStyle(el);
  var size = parseFloat(cs.fontSize);
  if (!size) return null;
  var lineH = parseFloat(cs.lineHeight);
  if (!isFinite(lineH) || lineH <= 0) lineH = size * 1.22;
  var ctx = sbTextMeasureCtx();
  if (!ctx) return null;
  ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
  var text = String((item && item.text) || "");
  var lines = text.split("\n");
  var firstLine = lines[0] || "";
  var lastLine = lines[lines.length - 1] || "";
  ctx.textBaseline = "alphabetic";
  var first = ctx.measureText(firstLine);
  var last = ctx.measureText(lastLine);
  var ascent = first.fontBoundingBoxAscent;
  var descent = first.fontBoundingBoxDescent;
  var inkTop = first.actualBoundingBoxAscent;
  var inkBottom = last.actualBoundingBoxDescent;
  if (!isFinite(ascent) || !isFinite(descent) || !isFinite(inkTop) || !isFinite(inkBottom)) return null;
  var leading = (lineH - (ascent + descent)) / 2;
  var trimTop = Math.max(0, leading + (ascent - inkTop));
  var trimBottom = Math.max(0, leading + (descent - inkBottom));
  // Keep the box from collapsing around a glyph with almost no ink (a space, a
  // dot): leave at least ~0.6em of text height.
  var keep = lines.length * lineH - trimTop - trimBottom;
  var minKeep = size * 0.6;
  if (keep < minKeep) {
    var give = Math.min(trimTop, trimBottom, (minKeep - keep) / 2);
    trimTop -= give;
    trimBottom -= give;
  }
  return {
    size: size,
    lineH: lineH,
    trimTop: trimTop,
    trimBottom: trimBottom,
    // Distance from the top of the TRIMMED content box down to line 1's baseline
    // (the line box starts trimTop ABOVE that point).
    firstBaseline: leading + ascent - trimTop,
    inkHeight: lines.length * lineH - trimTop - trimBottom
  };
}

// Hug the glyphs: trim the unused line-box space on each side. The margins are
// equal on a centred box, which is what vertically centres the text.
function sbApplyTextNudge(el) {
  var body = el && el.querySelector(".sb-text-body");
  if (!body) return;
  var obj = el.closest ? el.closest(".sb-object") : null;
  var item = obj ? sbFindItem(obj.dataset.id) : null;
  var m = sbTextInkMetrics(el, item);
  if (!m) {
    body.style.removeProperty("margin-top");
    body.style.removeProperty("margin-bottom");
    return;
  }
  body.style.marginTop = (-m.trimTop).toFixed(2) + "px";
  body.style.marginBottom = (-m.trimBottom).toFixed(2) + "px";
}

function sbApplyAllTextNudges() {
  if (!sbEls.items) return;
  sbEls.items.querySelectorAll(".sb-text").forEach(sbApplyTextNudge);
  // A font load changes the box size, which moves the bubble body + tail.
  sbUpdateAllBubbles();
}

function sbApplyItemTransform(item) {
  if (!sbEls.items) return;
  var el = sbEls.items.querySelector('.sb-object[data-id="' + item.id + '"]');
  if (!el) return;
  el.style.left = item.x + "%";
  el.style.top = item.y + "%";
  el.style.transform = "translate(-50%, -50%) rotate(" + item.rotation + "deg)";
  el.style.setProperty("--sb-scale", item.scale);
  sbApplyStickerFlip(el, item);
  var text = el.querySelector(".sb-text");
  if (text) text.style.setProperty("--sb-text-scale", item.scale);
  sbRenderConnectors();
}

// Mirror ONLY the sticker artwork. The flags become CSS custom properties on the
// object and `.sb-sticker`'s transform consumes them, so the object's own
// translate/rotate transform (and its handles/outline) are untouched.
function sbApplyStickerFlip(el, item) {
  if (!el || !item) return;
  if (item.type !== "sticker") {
    el.style.removeProperty("--sb-flip-x");
    el.style.removeProperty("--sb-flip-y");
    return;
  }
  el.style.setProperty("--sb-flip-x", item.flipX ? "-1" : "1");
  el.style.setProperty("--sb-flip-y", item.flipY ? "-1" : "1");
}

// Re-style one text object in place (used while typing in the panel, so the
// board updates without a full re-render that would lose focus).
function sbApplyTextStyle(item) {
  if (!sbEls.items) return;
  var el = sbEls.items.querySelector('.sb-object[data-id="' + item.id + '"] .sb-text');
  if (el) {
    sbStyleTextElement(el, item);
    sbApplyTextNudge(el);
  }
  // The bubble follows the text style (fill, line, size and type).
  sbUpdateBubble(item);
  sbRenderConnectors();
  sbPositionSelectionBar();
}

// ---- Connectors ------------------------------------------------------------
//
// One SVG layer sits between the background and the objects. Every connector is
// a primary-coloured line with a background-coloured halo (so it stays readable
// over the photo backgrounds) and an arrowhead marker at the TARGET end. The
// endpoints are recomputed from the two text boxes' ORIENTED rectangles, so they
// stay glued to the edges while a box is moved, scaled or rotated.

function sbRenderConnectors() {
  if (!sbEls.connectorPaths || !sbEls.items) return;
  var board = sbActiveBoard();
  var layer = sbEls.connectorPaths;
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  if (!board || !Array.isArray(board.connectors) || !board.connectors.length) return;

  var canvasRect = sbEls.canvas.getBoundingClientRect();
  board.connectors.forEach(function (conn) {
    var ends = sbConnectorEnds(conn, canvasRect);
    if (!ends) return;
    var d = "M" + ends.x1.toFixed(2) + " " + ends.y1.toFixed(2) +
      " L" + ends.x2.toFixed(2) + " " + ends.y2.toFixed(2);

    var g = document.createElementNS(SB_SVG_NS, "g");
    g.setAttribute("class", "sb-connector" + (conn.id === sbState.selectedConnectorId ? " selected" : ""));
    g.setAttribute("data-id", conn.id);

    var halo = document.createElementNS(SB_SVG_NS, "path");
    halo.setAttribute("class", "sb-connector-halo");
    halo.setAttribute("d", d);
    g.appendChild(halo);

    var line = document.createElementNS(SB_SVG_NS, "path");
    line.setAttribute("class", "sb-connector-line");
    line.setAttribute("d", d);
    line.setAttribute("marker-end", "url(#sbConnectorArrow)");
    g.appendChild(line);

    // A fat invisible stroke makes the thin arrow easy to hit with a finger.
    var hit = document.createElementNS(SB_SVG_NS, "path");
    hit.setAttribute("class", "sb-connector-hit");
    hit.setAttribute("d", d);
    g.appendChild(hit);

    layer.appendChild(g);
  });
}

function sbConnectorEnds(conn, canvasRect) {
  var fromItem = sbFindItem(conn.from);
  var toItem = sbFindItem(conn.to);
  if (!fromItem || !toItem) return null;
  var fromEl = sbEls.items.querySelector('.sb-object[data-id="' + conn.from + '"]');
  var toEl = sbEls.items.querySelector('.sb-object[data-id="' + conn.to + '"]');
  if (!fromEl || !toEl) return null;

  var aRect = fromEl.getBoundingClientRect();
  var bRect = toEl.getBoundingClientRect();
  var ax = aRect.left + aRect.width / 2 - canvasRect.left;
  var ay = aRect.top + aRect.height / 2 - canvasRect.top;
  var bx = bRect.left + bRect.width / 2 - canvasRect.left;
  var by = bRect.top + bRect.height / 2 - canvasRect.top;

  var aEdge = sbEdgePoint(ax, ay, bx, by,
    Math.max(1, fromEl.offsetWidth / 2), Math.max(1, fromEl.offsetHeight / 2),
    fromItem.rotation * Math.PI / 180);
  var bEdge = sbEdgePoint(bx, by, ax, ay,
    Math.max(1, toEl.offsetWidth / 2), Math.max(1, toEl.offsetHeight / 2),
    toItem.rotation * Math.PI / 180);

  // Stop 5px short of each box so the arrowhead never touches the border. The
  // gap is artwork-sized, like the connector's stroke.
  var gap = 5 * sbDesignScale();
  var aOut = sbPushOut(ax, ay, aEdge, gap);
  var bOut = sbPushOut(bx, by, bEdge, gap);
  return { x1: aOut.x, y1: aOut.y, x2: bOut.x, y2: bOut.y };
}

// Intersect the ray centre -> target with the rotated rectangle's edge.
function sbEdgePoint(cx, cy, tx, ty, halfW, halfH, angle) {
  var dx = tx - cx;
  var dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  var cos = Math.cos(angle);
  var sin = Math.sin(angle);
  // World vector -> the box's local (unrotated) frame.
  var lx = dx * cos + dy * sin;
  var ly = -dx * sin + dy * cos;
  var txEdge = lx ? halfW / Math.abs(lx) : Infinity;
  var tyEdge = ly ? halfH / Math.abs(ly) : Infinity;
  var t = Math.min(txEdge, tyEdge);
  if (!isFinite(t)) return { x: cx, y: cy };
  var ex = lx * t;
  var ey = ly * t;
  // Local -> world.
  return { x: cx + ex * cos - ey * sin, y: cy + ex * sin + ey * cos };
}

function sbPushOut(cx, cy, pt, gap) {
  var dx = pt.x - cx;
  var dy = pt.y - cy;
  var len = Math.hypot(dx, dy) || 1;
  return { x: pt.x + dx / len * gap, y: pt.y + dy / len * gap };
}

function sbOnConnectorPointerDown(e) {
  var g = e.target.closest ? e.target.closest(".sb-connector") : null;
  if (!g) return;
  e.preventDefault();
  e.stopPropagation();
  if (sbState.connectFrom) sbCancelConnect();
  sbSelectConnector(g.getAttribute("data-id"));
}

// ---- Selection -------------------------------------------------------------
//
// `sbState.selectedIds` holds the selected TOP-LEVEL nodes: leaf item ids or
// group ids. `sbState.selectedId` remains the compatibility field for the ONE
// selected leaf (text editing, Connect, Flip), and is empty for a group or a
// multi-selection. A click on a grouped object selects the outer-most group.

function sbSelectionNodes() {
  var out = [];
  (sbState.selectedIds || []).forEach(function (id) {
    if (!id) return;
    if (!sbFindItem(id) && !sbGroupById(id)) return;
    if (out.indexOf(id) === -1) out.push(id);
  });
  return out;
}

function sbSyncSelectedId() {
  var nodes = sbSelectionNodes();
  sbState.selectedIds = nodes;
  sbState.selectedId = (nodes.length === 1 && sbFindItem(nodes[0])) ? nodes[0] : "";
}

function sbSetSelection(ids) {
  sbState.selectedConnectorId = "";
  sbState.selectedIds = [];
  (ids || []).forEach(function (id) {
    if (!id) return;
    if (!sbFindItem(id) && !sbGroupById(id)) return;
    if (sbState.selectedIds.indexOf(id) === -1) sbState.selectedIds.push(id);
  });
  sbSyncSelectedId();
  sbUpdateSelectionUi();
}

function sbSelect(id) {
  sbHideTailGroupPrompt();
  sbSetSelection(id ? [sbTopGroupId(id)] : []);
}

function sbToggleNode(nodeId) {
  if (!nodeId) return;
  var nodes = sbSelectionNodes();
  var at = nodes.indexOf(nodeId);
  if (at === -1) nodes.push(nodeId);
  else nodes.splice(at, 1);
  sbSetSelection(nodes);
}

function sbAddNodeToSelection(nodeId) {
  if (!nodeId) return;
  var nodes = sbSelectionNodes();
  if (nodes.indexOf(nodeId) === -1) nodes.push(nodeId);
  sbSetSelection(nodes);
}

function sbSelectConnector(id) {
  sbState.selectedIds = [];
  sbState.selectedId = "";
  sbState.selectedConnectorId = id || "";
  sbUpdateSelectionUi();
}

// Union of the rendered member rects, in canvas-local pixels. Rotated text and
// stickers contribute their axis-aligned bounding rect, which is the standard
// multi-selection box.
function sbSelectionRect() {
  if (!sbEls.items || !sbEls.canvas) return null;
  var nodes = sbSelectionNodes();
  if (!nodes.length) return null;
  var cr = sbEls.canvas.getBoundingClientRect();
  var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  var any = false;
  nodes.forEach(function (node) {
    sbNodeLeafIds(node).forEach(function (id) {
      var el = sbItemEl(id);
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      any = true;
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    });
  });
  if (!any) return null;
  return {
    left: left - cr.left,
    top: top - cr.top,
    width: right - left,
    height: bottom - top,
    centreX: (left + right) / 2 - cr.left,
    centreY: (top + bottom) / 2 - cr.top,
    canvasLeft: cr.left,
    canvasTop: cr.top,
    canvasW: Math.max(1, cr.width),
    canvasH: Math.max(1, cr.height)
  };
}

function sbShowSelectionBox() {
  if (sbEls.selectionBox) sbEls.selectionBox.classList.remove("d-none");
}

function sbHideSelectionBox() {
  if (sbEls.selectionBox) sbEls.selectionBox.classList.add("d-none");
}

function sbPositionSelectionBox() {
  var box = sbEls.selectionBox;
  if (!box || box.classList.contains("d-none")) return;
  var rect = sbSelectionRect();
  if (!rect) { box.classList.add("d-none"); return; }
  box.style.left = rect.left + "px";
  box.style.top = rect.top + "px";
  box.style.width = rect.width + "px";
  box.style.height = rect.height + "px";
}

function sbSetBarButton(id, show) {
  var el = document.getElementById(id);
  if (el) el.classList.toggle("d-none", !show);
}

function sbSetBarPressed(id, on) {
  var el = document.getElementById(id);
  if (el) el.setAttribute("aria-pressed", on ? "true" : "false");
}

function sbUpdateSelectionUi() {
  if (!sbEls.items) return;
  var conn = sbSelectedConnector();
  var nodes = conn ? [] : sbSelectionNodes();
  var singleLeaf = (nodes.length === 1 && sbFindItem(nodes[0])) ? sbFindItem(nodes[0]) : null;

  var memberLeaf = {};
  nodes.forEach(function (node) {
    sbNodeLeafIds(node).forEach(function (id) { memberLeaf[id] = true; });
  });
  sbEls.items.querySelectorAll(".sb-object").forEach(function (el) {
    var id = el.dataset.id;
    el.classList.toggle("selected", !!(singleLeaf && id === singleLeaf.id));
    el.classList.toggle("sb-member", !singleLeaf && !!memberLeaf[id]);
  });
  if (sbEls.connectorPaths) {
    sbEls.connectorPaths.querySelectorAll(".sb-connector").forEach(function (g) {
      g.classList.toggle("selected", g.getAttribute("data-id") === sbState.selectedConnectorId);
    });
  }

  var bar = sbEls.selBar;
  if (!bar) return;
  if (sbState.connectFrom) {
    bar.classList.add("d-none");
    sbSetBarButton("sbSelAlign", false);
    sbShowAlignMenu(false);
    sbHideSelectionBox();
    return;
  }

  if (conn) {
    bar.classList.remove("d-none");
    sbSetBarButton("sbSelConnect", false);
    sbSetBarButton("sbSelFront", false);
    sbSetBarButton("sbSelDuplicate", false);
    sbSetBarButton("sbSelGroup", false);
    sbSetBarButton("sbSelUngroup", false);
    sbSetBarButton("sbSelFlipH", false);
    sbSetBarButton("sbSelFlipV", false);
    sbSetBarButton("sbSelDelete", false);
    sbSetBarButton("sbConnReverse", true);
    sbSetBarButton("sbConnDelete", true);
    sbSetBarButton("sbSelAlign", false);
    sbShowAlignMenu(false);
    sbHideSelectionBox();
    sbPositionSelectionBar();
    sbRefreshPasteboard();
    return;
  }

  sbSetBarButton("sbConnReverse", false);
  sbSetBarButton("sbConnDelete", false);

  if (!nodes.length) {
    bar.classList.add("d-none");
    sbSetBarButton("sbSelAlign", false);
    sbShowAlignMenu(false);
    sbHideSelectionBox();
    return;
  }

  bar.classList.remove("d-none");
  sbSetBarButton("sbSelFront", true);
  sbSetBarButton("sbSelDuplicate", true);
  sbSetBarButton("sbSelDelete", true);
  sbSetBarButton("sbSelConnect", !!singleLeaf && singleLeaf.type === "text");
  // Style actions live here now (next to connect/front/duplicate/delete) and only
  // make sense for ONE selected text box.
  var textSel = !!singleLeaf && singleLeaf.type === "text";
  var styleRow = document.getElementById("sbSelStyleRow");
  if (styleRow) styleRow.classList.toggle("d-none", !textSel);
  var pasteBtn = document.getElementById("sbSelPasteStyle");
  if (pasteBtn) pasteBtn.toggleAttribute("disabled", !sbState.styleClipboard);
  // Flip only makes sense for sticker artwork; the pressed state shows which
  // mirrors are currently on.
  var sticker = !!singleLeaf && singleLeaf.type === "sticker";
  sbSetBarButton("sbSelFlipH", sticker);
  sbSetBarButton("sbSelFlipV", sticker);
  sbSetBarPressed("sbSelFlipH", sticker && !!singleLeaf.flipX);
  sbSetBarPressed("sbSelFlipV", sticker && !!singleLeaf.flipY);
  // Group needs at least two top-level nodes; Ungroup exactly one group.
  sbSetBarButton("sbSelGroup", nodes.length >= 2);
  sbSetBarButton("sbSelUngroup", nodes.length === 1 && !!sbGroupById(nodes[0]));

  // One Align button for a multi-selection. Its option row is collapsed until
  // the button is hovered/tapped; distribute needs three or more nodes.
  var multi = nodes.length >= 2;
  sbSetBarButton("sbSelAlign", multi);
  ["sbAlignLeft", "sbAlignCenterH", "sbAlignRight", "sbAlignTop", "sbAlignMiddleV", "sbAlignBottom"].forEach(function (id) {
    sbSetBarButton(id, multi);
  });
  sbSetBarButton("sbDistributeH", nodes.length >= 3);
  sbSetBarButton("sbDistributeV", nodes.length >= 3);
  var alignSig = nodes.join("|");
  if (alignSig !== sbState.alignSig || !multi) {
    sbState.alignSig = alignSig;
    sbShowAlignMenu(false);
  }

  if (singleLeaf) {
    sbHideSelectionBox();
  } else {
    sbShowSelectionBox();
    sbPositionSelectionBox();
  }
  sbPositionSelectionBar();
  sbRefreshPasteboard();
}

function sbPositionSelectionBar() {
  if (!sbEls.selBar || !sbEls.items || !sbEls.area || sbEls.selBar.classList.contains("d-none")) return;
  var el;
  if (sbState.selectedConnectorId) {
    el = sbEls.connectorPaths.querySelector('.sb-connector[data-id="' + sbState.selectedConnectorId + '"] .sb-connector-line');
  } else {
    var nodes = sbSelectionNodes();
    if (nodes.length === 1 && sbFindItem(nodes[0])) el = sbItemEl(nodes[0]);
    else if (sbEls.selectionBox && !sbEls.selectionBox.classList.contains("d-none")) el = sbEls.selectionBox;
  }
  if (!el) return;
  var r = el.getBoundingClientRect();
  var a = sbEls.area.getBoundingClientRect();
  var barW = sbEls.selBar.offsetWidth || 110;
  var barH = sbEls.selBar.offsetHeight || 42;
  // Centred modes clamp by the bar's own half-width so a wide bar (the sticker
  // actions add flip buttons) can never hang off a narrow screen.
  var halfBarW = barW / 2 + 8;
  var gap = 12;
  var mode = "right";
  var left = 0;
  var top = 0;

  // Beside the object is the safest place: the action bar can never cover the
  // TOP rotate handle (the reported bug) or the bottom-right scale handle,
  // because it sits outside the object's whole bounding box.
  if (a.right - r.right >= barW + gap + 4) {
    mode = "right";
    left = r.right - a.left + gap;
    top = r.top - a.top + r.height / 2;
  } else if (r.left - a.left >= barW + gap + 4) {
    mode = "left";
    left = r.left - a.left - gap;
    top = r.top - a.top + r.height / 2;
  } else {
    // No room either side (narrow screen): above the object AND its rotate
    // handle, or below it when even that would leave the board.
    var rotate = el.querySelector(".sb-handle-rotate");
    var rotateRect = rotate ? rotate.getBoundingClientRect() : r;
    var aboveTop = Math.min(r.top, rotateRect.top) - a.top - gap;
    if (aboveTop - barH >= 4) {
      mode = "above";
      left = r.left - a.left + r.width / 2;
      top = aboveTop;
    } else {
      mode = "below";
      var scale = el.querySelector(".sb-handle-scale");
      var scaleRect = scale ? scale.getBoundingClientRect() : r;
      left = r.left - a.left + r.width / 2;
      top = Math.max(r.bottom, scaleRect.bottom) - a.top + gap;
    }
  }

  if (mode === "right") {
    sbEls.selBar.style.transform = "translate(0, -50%)";
    left = Math.min(Math.max(left, 8), Math.max(8, a.width - barW - 8));
    top = Math.min(Math.max(top, barH / 2 + 8), Math.max(barH / 2 + 8, a.height - barH / 2 - 8));
  } else if (mode === "left") {
    sbEls.selBar.style.transform = "translate(-100%, -50%)";
    left = Math.min(Math.max(left, barW + 8), Math.max(barW + 8, a.width - 8));
    top = Math.min(Math.max(top, barH / 2 + 8), Math.max(barH / 2 + 8, a.height - barH / 2 - 8));
  } else if (mode === "above") {
    sbEls.selBar.style.transform = "translate(-50%, -100%)";
    left = Math.min(Math.max(left, halfBarW), Math.max(halfBarW, a.width - halfBarW));
    top = Math.min(Math.max(top, barH + 8), Math.max(barH + 8, a.height - 8));
  } else {
    sbEls.selBar.style.transform = "translate(-50%, 0)";
    left = Math.min(Math.max(left, halfBarW), Math.max(halfBarW, a.width - halfBarW));
    top = Math.min(Math.max(top, 8), Math.max(8, a.height - barH - 8));
  }

  sbEls.selBar.style.left = left + "px";
  sbEls.selBar.style.top = top + "px";
}

// ---- Align / distribute -----------------------------------------------------
//
// The selection bar has ONE align button; its option row expands on hover (or
// tap on touch). Align uses each selected TOP-LEVEL node's rendered AABB (a
// group counts as one unit). Distribute equalises the gaps between adjacent
// edges, keeping the first and last objects fixed.

var sbAlignHideTimer = null;

function sbShowAlignMenu(open) {
  var row = document.getElementById("sbSelAlignRow");
  var btn = document.getElementById("sbSelAlign");
  if (!row || !btn) return;
  var multi = sbSelectionNodes().length >= 2;
  open = !!open && multi;
  // Expanding the bar changes its height, so the positioner moves it. Re-anchor
  // on the Align button so the pointer stays over it (otherwise hovering would
  // immediately mouseleave and collapse the row again).
  var before = btn.getBoundingClientRect();
  sbState.alignOpen = open;
  row.classList.toggle("d-none", !open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  sbPositionSelectionBar();
  if (open && sbEls.selBar) {
    var after = btn.getBoundingClientRect();
    var dy = before.top - after.top;
    if (Math.abs(dy) > 0.5) {
      sbEls.selBar.style.top = ((parseFloat(sbEls.selBar.style.top) || 0) + dy) + "px";
    }
  }
}

function sbHideAlignMenuSoon() {
  if (sbAlignHideTimer) return;
  sbAlignHideTimer = setTimeout(function () {
    sbAlignHideTimer = null;
    sbShowAlignMenu(false);
  }, 180);
}

function sbCancelAlignHide() {
  if (sbAlignHideTimer) {
    clearTimeout(sbAlignHideTimer);
    sbAlignHideTimer = null;
  }
}

// Union of a selected node's rendered leaves, in viewport pixels. A group is
// measured as one box, which is exactly what alignment should treat as a unit.
function sbNodeRect(nodeId) {
  var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  var any = false;
  sbNodeLeafIds(nodeId).forEach(function (id) {
    var el = sbItemEl(id);
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    any = true;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  });
  if (!any) return null;
  return {
    left: left, top: top, right: right, bottom: bottom,
    width: right - left, height: bottom - top,
    cx: (left + right) / 2, cy: (top + bottom) / 2
  };
}

function sbSelectionNodeRects() {
  var out = [];
  sbSelectionNodes().forEach(function (id) {
    var rect = sbNodeRect(id);
    if (rect) out.push({ id: id, rect: rect });
  });
  return out;
}

// Move every leaf inside a node by a viewport-pixel delta. Groups keep their
// shape because each leaf gets the same delta.
function sbMoveNode(nodeId, dx, dy) {
  if (!dx && !dy) return;
  var canvas = sbEls.canvas.getBoundingClientRect();
  var w = Math.max(1, canvas.width);
  var h = Math.max(1, canvas.height);
  sbNodeLeafIds(nodeId).forEach(function (id) {
    var item = sbFindItem(id);
    if (!item) return;
    item.x = sbClamp(item.x + dx / w * 100, 0, 100);
    item.y = sbClamp(item.y + dy / h * 100, 0, 100);
    sbWriteItemTransform(item);
  });
}

function sbCommitAlignment() {
  sbRenderConnectors();
  sbPositionSelectionBox();
  sbPositionSelectionBar();
  sbRefreshPasteboard();
  sbSaveState();
}

function sbAlignSelection(mode) {
  var nodes = sbSelectionNodeRects();
  if (nodes.length < 2) return;
  var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  nodes.forEach(function (n) {
    left = Math.min(left, n.rect.left);
    top = Math.min(top, n.rect.top);
    right = Math.max(right, n.rect.right);
    bottom = Math.max(bottom, n.rect.bottom);
  });
  var cx = (left + right) / 2;
  var cy = (top + bottom) / 2;
  nodes.forEach(function (n) {
    var dx = 0, dy = 0;
    if (mode === "left") dx = left - n.rect.left;
    else if (mode === "centerH") dx = cx - n.rect.cx;
    else if (mode === "right") dx = right - n.rect.right;
    else if (mode === "top") dy = top - n.rect.top;
    else if (mode === "middleV") dy = cy - n.rect.cy;
    else if (mode === "bottom") dy = bottom - n.rect.bottom;
    sbMoveNode(n.id, dx, dy);
  });
  sbCommitAlignment();
}

function sbDistributeSelection(axis) {
  var nodes = sbSelectionNodeRects();
  if (nodes.length < 3) return;
  var horizontal = axis === "h";
  nodes.sort(function (a, b) {
    return horizontal ? (a.rect.left - b.rect.left) : (a.rect.top - b.rect.top);
  });
  var first = nodes[0].rect;
  var last = nodes[nodes.length - 1].rect;
  var span = horizontal ? (last.right - first.left) : (last.bottom - first.top);
  var total = 0;
  nodes.forEach(function (n) { total += horizontal ? n.rect.width : n.rect.height; });
  var gap = (span - total) / (nodes.length - 1);
  var cursor = horizontal ? first.left : first.top;
  nodes.forEach(function (n) {
    var start = horizontal ? n.rect.left : n.rect.top;
    var size = horizontal ? n.rect.width : n.rect.height;
    if (horizontal) sbMoveNode(n.id, cursor - start, 0);
    else sbMoveNode(n.id, 0, cursor - start);
    cursor += size + gap;
  });
  sbCommitAlignment();
}

// ---- Selection actions -----------------------------------------------------

function sbDeleteSelectedConnector() {
  if (!sbState.selectedConnectorId) return;
  if (!sbRemoveConnector(sbState.selectedConnectorId)) return;
  sbRenderConnectors();
  sbUpdateSelectionUi();
}

function sbReverseSelectedConnector() {
  var conn = sbSelectedConnector();
  if (!conn) return;
  sbReverseConnector(conn.id);
  sbRenderConnectors();
  sbUpdateSelectionUi();
}

function sbSelectionLeafIds(nodes) {
  var leaves = [];
  (nodes || sbSelectionNodes()).forEach(function (node) {
    sbNodeLeafIds(node).forEach(function (id) {
      if (leaves.indexOf(id) === -1) leaves.push(id);
    });
  });
  return leaves;
}

function sbDeleteSelected() {
  if (sbState.selectedConnectorId) {
    sbDeleteSelectedConnector();
    return;
  }
  var nodes = sbSelectionNodes();
  if (!nodes.length) return;
  var board = sbActiveBoard();
  if (!board) return;
  var leaves = sbSelectionLeafIds(nodes);
  var groupIds = [];
  nodes.forEach(function (node) {
    if (sbGroupById(node)) sbCollectGroupIds(node, groupIds);
  });
  board.items = board.items.filter(function (it) { return leaves.indexOf(it.id) === -1; });
  board.connectors = (board.connectors || []).filter(function (c) {
    return leaves.indexOf(c.from) === -1 && leaves.indexOf(c.to) === -1;
  });
  board.groups = (board.groups || []).filter(function (g) { return groupIds.indexOf(g.id) === -1; });
  board.groups = sbNormalizeGroups(board, board.groups);
  sbState.selectedIds = [];
  sbState.selectedId = "";
  sbState.editingTextId = "";
  sbSaveState();
  sbRender();
  // Deleting the text currently open in the panel leaves it in edit mode with
  // no item; drop back to the "new text" form.
  if (sbState.tool === "text") sbRenderPanel();
}

function sbDuplicateSelected() {
  var nodes = sbSelectionNodes();
  if (!nodes.length) return;
  var board = sbActiveBoard();
  var counter = { value: sbMaxZ(board) };
  var copies = [];
  nodes.forEach(function (node) {
    var copy = sbCloneNode(node, board, counter, 4);
    if (copy) copies.push(copy);
  });
  if (!copies.length) return;
  board.groups = sbNormalizeGroups(board, board.groups);
  sbState.selectedConnectorId = "";
  sbState.selectedIds = copies;
  sbSyncSelectedId();
  sbSaveState();
  sbRender();
}

function sbFrontSelected() {
  var nodes = sbSelectionNodes();
  if (!nodes.length) return;
  var board = sbActiveBoard();
  var leaves = sbSelectionLeafIds(nodes);
  leaves.sort(function (a, b) {
    var ia = sbFindItem(a), ib = sbFindItem(b);
    return ((ia && Number(ia.z)) || 0) - ((ib && Number(ib.z)) || 0);
  });
  var max = sbMaxZ(board);
  leaves.forEach(function (id, i) {
    var item = sbFindItem(id);
    if (item) item.z = max + 1 + i;
  });
  sbSaveState();
  sbRender();
}

// Group every selected TOP-LEVEL node (leaves and/or groups) into a new group.
// The selection becomes that group. Nested groups are allowed: a selected group
// simply becomes a child of the new one.
function sbGroupSelected() {
  var nodes = sbSelectionNodes();
  if (nodes.length < 2) return;
  var group = sbCreateGroup(nodes);
  if (!group) return;
  sbState.selectedConnectorId = "";
  sbState.selectedIds = [group.id];
  sbSyncSelectedId();
  sbRender();
}

// Remove ONE level: its children take its place (inside its parent if nested)
// and become the selection. Repeated ungrouping peels the nesting.
function sbUngroupSelected() {
  var nodes = sbSelectionNodes();
  if (nodes.length !== 1 || !sbGroupById(nodes[0])) return;
  var children = sbDissolveGroup(nodes[0]);
  sbState.selectedIds = children;
  sbSyncSelectedId();
  sbRender();
}

function sbFlipSelected(axis) {
  if (!sbState.selectedId) return;
  var item = sbFlipItem(sbState.selectedId, axis);
  if (!item) return;
  sbApplyItemTransform(item);
  sbUpdateSelectionUi();
  sbPositionSelectionBar();
}

// ---- Connector mode --------------------------------------------------------

function sbApplyConnectClasses() {
  var on = !!sbState.connectFrom;
  if (sbEls.items) {
    sbEls.items.classList.toggle("sb-connecting", on);
    sbEls.items.querySelectorAll(".sb-object").forEach(function (el) {
      el.classList.toggle("sb-connect-source", on && el.dataset.id === sbState.connectFrom);
    });
  }
  if (sbEls.connectHint) sbEls.connectHint.classList.toggle("d-none", !on);
}

function sbStartConnect() {
  var item = sbSelectedItem();
  if (!item || item.type !== "text") return;
  sbState.connectFrom = item.id;
  sbState.selectedConnectorId = "";
  // Give the board room to show the target boxes; a pinned panel stays put.
  if (!sbState.pinned && sbState.tool) sbClosePanel();
  sbApplyConnectClasses();
  sbUpdateSelectionUi();
}

function sbCancelConnect() {
  if (!sbState.connectFrom) return;
  sbState.connectFrom = "";
  sbApplyConnectClasses();
  sbUpdateSelectionUi();
}

function sbCreateConnection(toId) {
  var fromId = sbState.connectFrom;
  if (!fromId || !toId || fromId === toId) return;
  var conn = sbAddConnector(fromId, toId);
  sbState.connectFrom = "";
  sbApplyConnectClasses();
  sbRenderConnectors();
  if (conn) sbSelectConnector(conn.id);
  else sbUpdateSelectionUi();
}

// ---- Space-drag panning -----------------------------------------------------
//
// Holding Space turns the board into a hand: the scroller (and everything in
// it) gets the grab cursor, and a left drag scrolls the view. The pointerdown is
// captured on the SCROLLER before the object/group handlers run, so a pan that
// starts on a sticker pans instead of selecting or moving it, and an empty-area
// pan does not deselect. Pan mode is armed only when the board actually
// overflows: at 100% the board is fitted, so Space is deliberately inert.

function sbCanPan() {
  var s = sbEls.scroller;
  if (!s) return false;
  return s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 1;
}

function sbSyncPanCursor() {
  if (!sbEls.scroller) return;
  sbEls.scroller.classList.toggle("sb-pan-ready", !!sbState.panReady);
  sbEls.scroller.classList.toggle("sb-pan-active", !!sbState.pan);
}

function sbEnterPanMode() {
  if (sbState.panReady || !sbCanPan()) return;
  sbState.panReady = true;
  sbSyncPanCursor();
}

// force=true (window blur) also abandons an in-flight drag. A plain Space keyup
// must NOT: an active pan keeps going (and keeps the grabbing cursor) until the
// mouse button is released.
function sbLeavePanMode(force) {
  sbState.panReady = false;
  if (force) sbEndPanDrag();
  sbSyncPanCursor();
}

function sbEndPanDrag() {
  if (!sbState.pan) return;
  var s = sbEls.scroller;
  var pointerId = sbState.pan.pointerId;
  sbState.pan = null;
  if (s) {
    try { s.releasePointerCapture(pointerId); } catch (err) { /* not captured */ }
  }
  sbSyncPanCursor();
}

function sbOnPanPointerDownCapture(e) {
  if (!sbState.panReady || sbState.pan) return;
  if (typeof e.button === "number" && e.button !== 0) return;
  if (!sbCanPan()) {
    // Zoomed back out while Space was held: there is nothing to pan any more.
    sbState.panReady = false;
    sbSyncPanCursor();
    return;
  }
  var s = sbEls.scroller;
  e.preventDefault();
  e.stopPropagation();
  sbState.pan = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    startLeft: s.scrollLeft,
    startTop: s.scrollTop
  };
  try { s.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers */ }
  sbSyncPanCursor();
}

// Returns true when the move belonged to the pan drag.
function sbPanPointerMove(e) {
  if (!sbState.pan || e.pointerId !== sbState.pan.pointerId) return false;
  var s = sbEls.scroller;
  // Grabbing the canvas and moving it right/down moves the CONTENT right/down,
  // so the scroll offset goes the other way. The browser clamps at the edges.
  s.scrollLeft = sbState.pan.startLeft - (e.clientX - sbState.pan.startX);
  s.scrollTop = sbState.pan.startTop - (e.clientY - sbState.pan.startY);
  e.preventDefault();
  return true;
}

function sbOnPanKeyUp(e) {
  if (e.code !== "Space" && e.key !== " ") return;
  sbLeavePanMode(false);
}

function sbOnPanBlur() {
  sbLeavePanMode(true);
}

// Space belongs to a focused control that uses it (button/link/select/role
// button) - activating the Board chip or a rail button must keep working.
function sbIsInteractiveKeyTarget(t) {
  if (!t || !t.closest) return false;
  return !!t.closest("input, textarea, select, button, a, [contenteditable='true'], [role='button'], [role='checkbox'], [role='switch'], [role='slider'], [role='tab'], [role='menuitem']");
}

// ---- Pointer gestures ------------------------------------------------------

function sbOnCanvasPointerDown(e) {
  var t = e.target;
  if (t.closest && (t.closest(".sb-object") || t.closest(".sb-connector") || t.closest(".sb-toolbar") ||
      t.closest(".sb-selection-bar") || t.closest(".sb-selection-box") || t.closest(".sb-group-prompt"))) return;
  // A modifier-click on empty space keeps the selection (only a plain click
  // clears it), which is what multi-select users expect.
  if (e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (sbState.connectFrom) sbCancelConnect();
  sbSelect("");
}

function sbOnDoubleClick(e) {
  var obj = e.target.closest ? e.target.closest(".sb-object") : null;
  if (!obj) return;
  var item = sbFindItem(obj.dataset.id);
  if (!item || item.type !== "text") return;
  e.preventDefault();
  sbOpenTextEditor(item.id);
}

// ---- Multi-selection gestures ----------------------------------------------
//
// Every transform is applied to a SNAPSHOT of the selected leaves, so a group
// move/scale/rotate composes the same result into each member and nesting works
// recursively. The selection rect (union of rendered member rects) supplies the
// centre for scale and rotation.

function sbSelectionSnapshot(nodes) {
  var leaves = [];
  (nodes || sbSelectionNodes()).forEach(function (node) {
    sbNodeLeafIds(node).forEach(function (id) {
      if (leaves.some(function (leaf) { return leaf.id === id; })) return;
      var item = sbFindItem(id);
      if (!item) return;
      leaves.push({ id: id, x: item.x, y: item.y, scale: item.scale, rotation: item.rotation });
    });
  });
  return leaves;
}

function sbWriteItemTransform(item) {
  var el = sbItemEl(item.id);
  if (!el) return;
  el.style.left = item.x + "%";
  el.style.top = item.y + "%";
  el.style.transform = "translate(-50%, -50%) rotate(" + item.rotation + "deg)";
  el.style.setProperty("--sb-scale", item.scale);
  sbApplyStickerFlip(el, item);
  var text = el.querySelector(".sb-text");
  if (text) text.style.setProperty("--sb-text-scale", item.scale);
}

// factor = scale multiplier, deltaDeg = rigid rotation about the selection centre,
// moveX/moveY = extra translation in canvas pixels. All three are composed, which
// is what a two-finger pinch needs.
function sbApplyDrag(drag, factor, deltaDeg, moveX, moveY) {
  if (!drag || !drag.leaves || !drag.rect) return;
  var width = drag.canvasW;
  var height = drag.canvasH;

  // The TAIL handle only moves the tip: no rotation, no scale, no body move. The
  // stored offset is in the item's local frame, so inverse-rotate the delta.
  if (drag.mode === "tail") {
    var tailItem = sbFindItem(drag.leaves[0].id);
    if (!tailItem || !drag.tail) return;
    var tRad = -(Number(tailItem.rotation) || 0) * Math.PI / 180;
    var tlx = moveX * Math.cos(tRad) - moveY * Math.sin(tRad);
    var tly = moveX * Math.sin(tRad) + moveY * Math.cos(tRad);
    tailItem.tail = {
      dx: sbClampNumber(drag.tail.dx + tlx / width * 100, -80, 80, drag.tail.dx),
      dy: sbClampNumber(drag.tail.dy + tly / height * 100, -80, 80, drag.tail.dy)
    };
    sbUpdateBubble(tailItem);
    sbPositionSelectionBar();
    return;
  }
  var rect = drag.rect;
  var single = drag.leaves.length === 1;

  // A group must not deform at the board edge: clamp the WHOLE translation by the
  // selection box. A single item keeps the historical 2..98 clamp per item.
  if (!single) {
    if (moveX < -rect.left) moveX = -rect.left;
    if (moveX > width - rect.left - rect.width) moveX = width - rect.left - rect.width;
    if (moveY < -rect.top) moveY = -rect.top;
    if (moveY > height - rect.top - rect.height) moveY = height - rect.top - rect.height;
  }

  var cpx = rect.centreX;
  var cpy = rect.centreY;
  var rad = deltaDeg * Math.PI / 180;
  var cos = Math.cos(rad);
  var sin = Math.sin(rad);

  // Keep every member's scale in 0.2..5 by clamping the shared factor.
  var minF = 0;
  var maxF = Infinity;
  drag.leaves.forEach(function (leaf) {
    var s = Number(leaf.scale) || 1;
    minF = Math.max(minF, 0.2 / s);
    maxF = Math.min(maxF, 5 / s);
  });
  var f = Math.min(maxF, Math.max(minF, factor));

  drag.leaves.forEach(function (leaf) {
    var item = sbFindItem(leaf.id);
    if (!item) return;
    var px = leaf.x / 100 * width;
    var py = leaf.y / 100 * height;
    var rx = (px - cpx) * f;
    var ry = (py - cpy) * f;
    var nx = cpx + (rx * cos - ry * sin) + moveX;
    var ny = cpy + (rx * sin + ry * cos) + moveY;
    item.x = sbClamp(nx / width * 100, single ? 2 : 0, single ? 98 : 100);
    item.y = sbClamp(ny / height * 100, single ? 2 : 0, single ? 98 : 100);
    item.scale = sbClamp((Number(leaf.scale) || 1) * f, 0.2, 5);
    // A note NEVER rotates (it has no rotate handle and a group twist skips it),
    // so it can orbit the selection centre but stays upright.
    if (item.type !== "note") item.rotation = (Number(leaf.rotation) || 0) + deltaDeg;
    sbWriteItemTransform(item);
  });

  sbRenderConnectors();
  sbPositionSelectionBox();
  sbPositionSelectionBar();
}

function sbBeginDrag(e, mode, rect, centre) {
  var nodes = sbSelectionNodes();
  var leaves = sbSelectionSnapshot(nodes);
  if (!leaves.length || !rect) return false;
  sbCancelLongPress();
  var tailStart = null;
  if (mode === "tail" && leaves.length === 1) {
    var tailItem = sbFindItem(leaves[0].id);
    if (tailItem) tailStart = sbBubbleTipPct(tailItem);
  }
  sbState.drag = {
    itemId: "",
    tail: tailStart,
    mode: mode,
    leaves: leaves,
    rect: rect,
    centre: centre,
    canvasW: rect.canvasW,
    canvasH: rect.canvasH,
    startClientX: e.clientX,
    startClientY: e.clientY,
    downX: e.clientX,
    downY: e.clientY,
    startDist: Math.max(1, Math.hypot(e.clientX - centre.x, e.clientY - centre.y)),
    startAngle: Math.atan2(e.clientY - centre.y, e.clientX - centre.x),
    startMidX: e.clientX,
    startMidY: e.clientY
  };
  return true;
}

function sbBeginPinch(e) {
  var pts = Array.from(sbState.pointers.values());
  if (pts.length < 2) return;
  var p0 = pts[0], p1 = pts[1];
  var rect = sbSelectionRect();
  var leaves = sbSelectionSnapshot(sbSelectionNodes());
  if (!rect || !leaves.length) { sbState.pointers.clear(); return; }
  sbCancelLongPress();
  sbState.drag = {
    itemId: "",
    mode: "pinch",
    leaves: leaves,
    rect: rect,
    centre: { x: rect.canvasLeft + rect.centreX, y: rect.canvasTop + rect.centreY },
    canvasW: rect.canvasW,
    canvasH: rect.canvasH,
    startDist: Math.max(1, Math.hypot(p1.x - p0.x, p1.y - p0.y)),
    startAngle: Math.atan2(p1.y - p0.y, p1.x - p0.x),
    startMidX: (p0.x + p1.x) / 2,
    startMidY: (p0.y + p1.y) / 2,
    downX: e.clientX,
    downY: e.clientY
  };
}

// Scale/rotate handles live on #sbSelectionBox (outside #sbItems).
function sbOnSelectionPointerDown(e) {
  var handle = e.target.closest ? e.target.closest(".sb-handle") : null;
  if (!handle) return;
  var nodes = sbSelectionNodes();
  if (!(nodes.length > 1 || (nodes.length === 1 && sbGroupById(nodes[0])))) return;
  e.preventDefault();
  e.stopPropagation();
  var rect = sbSelectionRect();
  if (!rect) return;
  var centre = { x: rect.canvasLeft + rect.centreX, y: rect.canvasTop + rect.centreY };
  sbState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  sbBeginDrag(e, handle.dataset.handle === "rotate" ? "rotate" : "scale", rect, centre);
}

// Touch: a press-and-hold adds the object to the selection instead of starting a
// drag. Cancelled by movement or a second finger.
var sbLongPressTimer = null;

function sbStartLongPress(e, item, priorNodes) {
  sbCancelLongPress();
  if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
  var node = sbTopGroupId(item.id);
  var prior = (priorNodes || []).slice();
  sbLongPressTimer = setTimeout(function () {
    sbLongPressTimer = null;
    sbState.drag = null;
    sbState.pointers.clear();
    sbTap = null;
    // The press already replaced the selection with this object; restore the
    // previous selection and ADD this one so long-press means "select more".
    sbState.selectedIds = prior;
    sbAddNodeToSelection(node);
  }, 450);
}

function sbCancelLongPress() {
  if (sbLongPressTimer) {
    clearTimeout(sbLongPressTimer);
    sbLongPressTimer = null;
  }
}

function sbOnPointerDown(e) {
  var objEl = e.target.closest ? e.target.closest(".sb-object") : null;
  if (!objEl) return;
  var item = sbFindItem(objEl.dataset.id);
  if (!item) return;

  // Connector mode: the next TEXT box becomes the arrow's target.
  if (sbState.connectFrom) {
    if (item.type === "text" && item.id !== sbState.connectFrom) {
      e.preventDefault();
      sbCreateConnection(item.id);
      return;
    }
    // Clicking the source (or a sticker) cancels the mode and behaves normally.
    sbCancelConnect();
  }

  var now = Date.now();
  var handleEl = e.target.closest ? e.target.closest(".sb-handle") : null;
  if (!handleEl && item.type === "text" && sbTap && sbTap.id === item.id && now - sbTap.time < 340) {
    sbTap = null;
    sbSelect(item.id);
    sbOpenTextEditor(item.id);
    e.preventDefault();
    return;
  }
  sbTap = { id: item.id, time: now };

  var node = sbTopGroupId(item.id);

  // Ctrl/Cmd/Shift toggles this object (or its whole group) in/out of the
  // selection; it never starts a drag.
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    e.preventDefault();
    sbCancelLongPress();
    sbToggleNode(node);
    return;
  }

  // Pressing a member of the current multi/group selection keeps that selection
  // so the whole set can be dragged; pressing anything else selects just it.
  // `priorNodes` is kept so a touch long-press can ADD to the old selection.
  var priorNodes = sbSelectionNodes();
  var nodes = sbSelectionNodes();
  if (nodes.indexOf(node) === -1) {
    sbState.selectedConnectorId = "";
    sbState.selectedIds = [node];
    sbSyncSelectedId();
    sbUpdateSelectionUi();
  }

  var handle = handleEl;
  try { objEl.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers */ }
  sbState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (sbState.pointers.size === 2) {
    sbBeginPinch(e);
    e.preventDefault();
    return;
  }

  var rect = sbSelectionRect();
  if (!rect) return;
  var centre = { x: rect.canvasLeft + rect.centreX, y: rect.canvasTop + rect.centreY };
  var mode = "move";
  if (handle) {
    var which = handle.dataset.handle;
    mode = which === "rotate" ? "rotate" : which === "tail" ? "tail" : "scale";
  }
  sbBeginDrag(e, mode, rect, centre);
  // A note's whole point is its text: a plain CLICK (no drag) opens its editor.
  if (item.type === "note" && mode === "move" && sbState.drag) sbState.drag.tapNote = item.id;
  // A click (no drag) on a member of a multi/group selection collapses to it;
  // a drag moves the whole set. The collapse is applied on pointerup.
  if (sbState.drag && nodes.length > 1 && nodes.indexOf(node) !== -1) {
    sbState.drag.collapseOnTap = node;
  }
  sbStartLongPress(e, item, priorNodes);
  e.preventDefault();
}

function sbOnPointerMove(e) {
  if (sbPanPointerMove(e)) return;
  if (!sbState.pointers.has(e.pointerId) || !sbState.drag) return;
  sbState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  var drag = sbState.drag;

  // Any real movement means this was a drag, not a tap/long-press: don't let it
  // pair with the next tap to open the text editor.
  if (Math.abs(e.clientX - drag.downX) > 6 || Math.abs(e.clientY - drag.downY) > 6) {
    drag.moved = true;
    sbTap = null;
    sbCancelLongPress();
  }

  if (drag.mode === "pinch") {
    if (sbState.pointers.size < 2) return;
    var pts = Array.from(sbState.pointers.values());
    var p0 = pts[0], p1 = pts[1];
    var dist = Math.max(1, Math.hypot(p1.x - p0.x, p1.y - p0.y));
    var angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    var midX = (p0.x + p1.x) / 2;
    var midY = (p0.y + p1.y) / 2;
    sbApplyDrag(drag, dist / drag.startDist,
      (angle - drag.startAngle) * 180 / Math.PI,
      midX - drag.startMidX, midY - drag.startMidY);
  } else if (drag.mode === "rotate") {
    var rotAngle = Math.atan2(e.clientY - drag.centre.y, e.clientX - drag.centre.x);
    sbApplyDrag(drag, 1, (rotAngle - drag.startAngle) * 180 / Math.PI, 0, 0);
  } else if (drag.mode === "scale") {
    var sDist = Math.hypot(e.clientX - drag.centre.x, e.clientY - drag.centre.y);
    sbApplyDrag(drag, sDist / drag.startDist, 0, 0, 0);
  } else {
    sbApplyDrag(drag, 1, 0, e.clientX - drag.startClientX, e.clientY - drag.startClientY);
  }

  sbSaveSoon();
  e.preventDefault();
}

function sbOnPointerUp(e) {
  if (sbState.pan && e.pointerId === sbState.pan.pointerId) {
    sbEndPanDrag();
    return;
  }
  sbCancelLongPress();
  if (!sbState.pointers.has(e.pointerId)) return;
  sbState.pointers.delete(e.pointerId);
  if (!sbState.drag) return;
  var drag = sbState.drag;
  var collapse = drag.collapseOnTap && !drag.moved ? drag.collapseOnTap : "";
  // A plain click on a note (no movement) opens its editor.
  var tapNote = drag.tapNote && !drag.moved ? drag.tapNote : "";
  // A dropped tail offers to group the bubble with the sticker it points at.
  var tailId = drag.mode === "tail" && drag.leaves[0] ? drag.leaves[0].id : "";
  sbState.pointers.clear();
  sbState.drag = null;
  sbSaveState();
  if (collapse) sbSetSelection([collapse]);
  sbPositionSelectionBox();
  sbPositionSelectionBar();
  sbRefreshPasteboard();
  if (tapNote) sbOpenNoteEditor(tapNote);
  if (tailId) sbTailDrop(tailId);
}

function sbOnKeyDown(e) {
  var t = e.target;
  var tag = (t && t.tagName ? t.tagName : "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
  // Undo / redo. A focused text field keeps its own Ctrl+Z (it returned above),
  // and an open page/modal owns the keyboard.
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    var key = String(e.key || "").toLowerCase();
    var redoKey = key === "y" || (key === "z" && e.shiftKey);
    if ((key === "z" && !e.shiftKey) || redoKey) {
      if (document.querySelector("smd-page[open], smd-modal[open]")) return;
      e.preventDefault();
      if (redoKey) sbRedo(); else sbUndo();
      return;
    }
  }
  if (e.code === "Space" || e.key === " ") {
    // A focused control that uses Space (a button/link/role button) keeps it;
    // the settings page and modals own the keyboard too.
    if (sbIsInteractiveKeyTarget(t)) return;
    if (!sbEls.area || sbEls.area.classList.contains("invisible")) return;
    if (document.querySelector("smd-page[open], smd-modal[open]")) return;
    e.preventDefault();
    sbEnterPanMode();
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (!sbSelectionNodes().length && !sbState.selectedConnectorId) return;
    e.preventDefault();
    sbDeleteSelected();
  } else if (e.key === "Escape") {
    if (sbState.alignOpen) sbShowAlignMenu(false);
    else if (sbState.connectFrom) sbCancelConnect();
    else if (sbState.tool) sbClosePanel();
    else sbSelect("");
  }
}

// ---- Save the board as a JPG ----------------------------------------------
//
// Drawn from the STORED items + the live layout metrics (not a DOM screenshot),
// so the toolbar, board chip, selection outlines/handles and the empty hint are
// never in the image. Paint order matches the board: surface -> connectors ->
// items (z order). The canvas is 2x for readable text, capped on huge boards.

function sbItemEl(id) {
  if (!sbEls.items || !id) return null;
  return sbEls.items.querySelector('.sb-object[data-id="' + id + '"]');
}

function sbSlug(name) {
  return String(name || "storyboard").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function sbLoadCanvasImage(src) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error("Could not load " + src)); };
    img.src = src;
  });
}

function sbImageReady(img) {
  return new Promise(function (resolve, reject) {
    if (img.complete) return resolve(img);
    img.addEventListener("load", function () { resolve(img); }, { once: true });
    img.addEventListener("error", function () { reject(new Error("Image failed")); }, { once: true });
  });
}

function sbCanvasRoundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Match white-space:pre-wrap + overflow-wrap:break-word without a DOM measure per
// line: explicit newlines are kept, words wrap at the box width, long words break.
function sbCanvasWrapText(ctx, text, maxWidth) {
  var lines = [];
  String(text == null ? "" : text).split("\n").forEach(function (para) {
    if (para === "") { lines.push(""); return; }
    var words = para.split(/\s+/);
    var line = "";
    words.forEach(function (word) {
      var test = line ? line + " " + word : word;
      if (ctx.measureText(test).width <= maxWidth) { line = test; return; }
      if (line) { lines.push(line); line = ""; }
      // A single word wider than the box: break it character by character.
      var chunk = "";
      for (var i = 0; i < word.length; i++) {
        var next = chunk + word[i];
        if (chunk && ctx.measureText(next).width > maxWidth) {
          lines.push(chunk);
          chunk = word[i];
        } else {
          chunk = next;
        }
      }
      line = chunk;
    });
    lines.push(line);
  });
  return lines;
}

// Draw one middle edge slice the way the live `border-image-repeat: round`
// does: scale it across the border to the frame width, then repeat it along the
// edge an integer number of times. Without this the exporter stretches a single
// 60px slice over the whole side, which turns the stamp dots into long dashes.
function sbDrawCanvasFrameEdge(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh, vertical) {
  var natural = vertical ? sh * (dw / sw) : sw * (dh / sh);
  var count = Math.max(1, Math.round((vertical ? dh : dw) / natural));
  var tile = (vertical ? dh : dw) / count;
  for (var i = 0; i < count; i++) {
    if (vertical) {
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy + i * tile, dw, tile);
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, dx + i * tile, dy, tile, dh);
    }
  }
}

// The bubble's line as an INNER RING, drawn on a transparent tile so it also
// works over a transparent fill: stroke the shape wide and clipped, then erase
// the inner band with destination-out. `box` is the shape's local bbox.
function sbCanvasBubbleRing(ctx, d, box, gap, lineWidth, colour) {
  if (!(lineWidth > 0) || !(box.w > 0) || !(box.h > 0)) return;
  var pad = Math.ceil(lineWidth + gap + 2);
  var w = Math.ceil(box.w) + pad * 2;
  var h = Math.ceil(box.h) + pad * 2;
  var tf = ctx.getTransform ? ctx.getTransform() : null;
  var scale = tf ? Math.hypot(tf.a, tf.b) || 1 : 1;
  scale = Math.max(0.5, Math.min(4, scale));
  var tile = document.createElement("canvas");
  tile.width = Math.max(1, Math.round(w * scale));
  tile.height = Math.max(1, Math.round(h * scale));
  var tctx = tile.getContext("2d");
  if (!tctx) return;
  tctx.scale(scale, scale);
  tctx.translate(-(box.x - pad), -(box.y - pad));
  var path = new Path2D(d);
  tctx.save();
  tctx.clip(path);
  tctx.strokeStyle = colour;
  tctx.lineJoin = "round";
  tctx.lineCap = "round";
  tctx.lineWidth = (gap + lineWidth) * 2;
  tctx.stroke(path);
  if (gap > 0) {
    tctx.globalCompositeOperation = "destination-out";
    tctx.lineWidth = gap * 2;
    tctx.stroke(path);
  }
  tctx.restore();
  ctx.drawImage(tile, box.x - pad, box.y - pad, w, h);
}

function sbDrawCanvasText(ctx, item, el, frame, frameImg, geom) {
  var cs = getComputedStyle(el);
  var w = el.offsetWidth;
  var h = el.offsetHeight;
  if (!w || !h) return;
  var x = -w / 2;
  var y = -h / 2;

  if (geom) {
    // SPEECH BUBBLE: the same generated shape as the board, filled and then
    // stroked with the line inset by lineGap + lineWidth/2.
    var fillColour = item.bg === "transparent" ? null : sbResolveColor(item.bg);
    if (fillColour) {
      ctx.save();
      ctx.fillStyle = fillColour;
      ctx.fill(new Path2D(sbBubblePathD(geom, 0)));
      ctx.restore();
    }
    if (geom.stroke > 0) {
      var shapeD = sbBubblePathD(geom, 0);
      var tipPt = sbBubbleTipPoint(geom, 0);
      var bx0 = Math.min(geom.body.x, tipPt.x), by0 = Math.min(geom.body.y, tipPt.y);
      var bx1 = Math.max(geom.body.x + geom.body.w, tipPt.x);
      var by1 = Math.max(geom.body.y + geom.body.h, tipPt.y);
      ctx.save();
      sbCanvasBubbleRing(ctx, shapeD,
        { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 },
        geom.gap, geom.stroke,
        sbResolveColor(item.stroke) || SB_BUBBLE_DEFAULT_STROKE);
      ctx.restore();
    }
  } else {
    // Surface FIRST and over the WHOLE box: a frame is drawn ON it (the live
    // rule keeps the default background-clip: border-box), with the text's own
    // corner radius.
    var bg = cs.backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      ctx.fillStyle = bg;
      sbCanvasRoundRect(ctx, x, y, w, h, (Number(item.radius) || 0) * sbDesignScale());
      ctx.fill();
    }
  }

  // The SVG frame as a 9-slice (source slice 30 of 120).
  if (frame && frameImg) {
    var s = 30, src = 120, d = frame;
    ctx.drawImage(frameImg, 0, 0, s, s, x, y, d, d);
    ctx.drawImage(frameImg, src - s, 0, s, s, x + w - d, y, d, d);
    ctx.drawImage(frameImg, 0, src - s, s, s, x, y + h - d, d, d);
    ctx.drawImage(frameImg, src - s, src - s, s, s, x + w - d, y + h - d, d, d);
    sbDrawCanvasFrameEdge(ctx, frameImg, s, 0, src - s * 2, s,
      x + d, y, w - d * 2, d, false);
    sbDrawCanvasFrameEdge(ctx, frameImg, s, src - s, src - s * 2, s,
      x + d, y + h - d, w - d * 2, d, false);
    sbDrawCanvasFrameEdge(ctx, frameImg, 0, s, s, src - s * 2,
      x, y + d, d, h - d * 2, true);
    sbDrawCanvasFrameEdge(ctx, frameImg, src - s, s, s, src - s * 2,
      x + w - d, y + d, d, h - d * 2, true);
  }

  var padL = frame + parseFloat(cs.paddingLeft || 0);
  var padR = frame + parseFloat(cs.paddingRight || 0);
  var padT = frame + parseFloat(cs.paddingTop || 0);
  var padB = frame + parseFloat(cs.paddingBottom || 0);
  var contentLeft = x + padL;
  var contentTop = y + padT;
  var contentW = w - padL - padR;
  var contentH = h - padT - padB;
  if (contentW <= 0 || contentH <= 0) return;

  var size = parseFloat(cs.fontSize) || 16;
  var lineH = parseFloat(cs.lineHeight);
  if (!isFinite(lineH) || lineH <= 0) lineH = size * 1.22;
  var align = cs.textAlign === "center" ? "center"
    : (cs.textAlign === "right" || cs.textAlign === "end") ? "right" : "left";
  var tx = align === "center" ? contentLeft + contentW / 2
    : align === "right" ? contentLeft + contentW : contentLeft;

  ctx.save();
  ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
  ctx.fillStyle = cs.color;
  ctx.textAlign = align;
  // Alphabetic + the LIVE first baseline: no leading/middle-baseline guessing.
  ctx.textBaseline = "alphabetic";
  // offsetWidth/offsetHeight are rounded integers, while the browser lays the
  // text out on fractional pixels - without the small tolerance a line that fits
  // on screen (e.g. by 0.42px) would wrap in the canvas and lose its second line
  // to the box height. No clip: the live box is already sized to its content.
  var ink = sbTextInkMetrics(el, item);
  var lines = sbCanvasWrapText(ctx, item.text || " ", contentW + 1.5);
  // The live box trims the empty line-box space, so line 1's baseline sits
  // firstBaseline below the top of the TRIMMED content box.
  var ty = ink ? contentTop + ink.firstBaseline : contentTop + lineH / 2;
  lines.forEach(function (line, i) { ctx.fillText(line, tx, ty + i * lineH); });
  ctx.restore();
}

// Draw the ACTIVE scene to a JPEG blob (the export used by "Save scene" and by
// the story ZIP). Returns the blob; nothing is downloaded here.
async function sbBoardJpegBlob() {
  var board = sbActiveBoard();
  if (!board || !sbEls.canvas) return null;
  var visW = sbEls.canvas.clientWidth;
  var visH = sbEls.canvas.clientHeight;
  if (!visW || !visH) return null;
  var designScale = sbDesignScale();
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* draw with the fallback */ }
  }

  // A board with a background image exports the WHOLE artwork, not the visible
  // `cover` crop. The canvas is the image's natural size (capped at 4096px);
  // items are mapped from screen space back into the artwork's coordinates so
  // they stay on the same part of the picture as on screen.
  // OneDrive backgrounds resolve to a cached blob URL / restored data URL; the
  // built-ins keep their asset path.
  var bgMeta = board.background ? sbBackgroundById(board.background) : null;
  var bgSrc = board.background && typeof sbBackgroundSrcFor === "function"
    ? sbBackgroundSrcFor(board.background)
    : (bgMeta ? bgMeta.file : "");
  var bgImg = bgSrc ? await sbLoadCanvasImage(bgSrc).catch(function () { return null; }) : null;
  var hasBg = !!(bgImg && bgImg.naturalWidth && bgImg.naturalHeight);

  // The export IS the story's canvas: the same width/height the user set, so
  // what they lay out is what they get (capped on the long edge so a huge story
  // stays encodable).
  var story = typeof sbActiveStory === "function" ? sbActiveStory() : null;
  var W = typeof sbStoryWidth === "function" ? sbStoryWidth(story) : (hasBg ? bgImg.naturalWidth : visW);
  var H = typeof sbStoryHeight === "function" ? sbStoryHeight(story) : (hasBg ? bgImg.naturalHeight : visH);
  var outScale = Math.min(1, 4096 / Math.max(W, H));

  // The live board is fitted to the same aspect, so cover is uniform and the
  // offsets are ~0; keeping them makes the mapping robust to rounding.
  var coverScale = Math.max(visW / W, visH / H);
  var offsetX = (visW - W * coverScale) / 2;
  var offsetY = (visH - H * coverScale) / 2;
  var artScale = 1 / coverScale;
  var toArt = function (px, py) {
    return { x: (px - offsetX) / coverScale, y: (py - offsetY) / coverScale };
  };

  var canvas = document.createElement("canvas");
  canvas.width = Math.round(W * outScale);
  canvas.height = Math.round(H * outScale);
  var ctx = canvas.getContext("2d");
  ctx.scale(outScale, outScale);

  var baseBg = getComputedStyle(sbEls.canvas).backgroundColor || "#ffffff";
  var bodyColor = getComputedStyle(document.body).color;
  ctx.fillStyle = baseBg;
  ctx.fillRect(0, 0, W, H);

  if (hasBg) {
    var bgStyle = getComputedStyle(sbEls.bg);
    if (bgStyle.backgroundColor && bgStyle.backgroundColor !== "rgba(0, 0, 0, 0)") {
      ctx.fillStyle = bgStyle.backgroundColor;
      ctx.fillRect(0, 0, W, H);
    }
    // Fit letterboxes the artwork inside the story size (the bars keep the
    // board colour painted above); stretch fills it, distorting if needed.
    var stretch = typeof sbStoryFit === "function" ? sbStoryFit(story) === "stretch" : true;
    if (stretch) {
      ctx.drawImage(bgImg, 0, 0, W, H);
    } else {
      var bgScale = Math.min(W / bgImg.naturalWidth, H / bgImg.naturalHeight);
      var dw = bgImg.naturalWidth * bgScale;
      var dh = bgImg.naturalHeight * bgScale;
      ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
  } else {
    // The empty board's dot grid, at the same artwork scale as the live board.
    var artPerCss = W / visW;
    var dotGap = 24 * designScale * artPerCss;
    var dotR = 1 * designScale * artPerCss;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = bodyColor;
    for (var gy = dotGap / 2; gy < H; gy += dotGap) {
      for (var gx = dotGap / 2; gx < W; gx += dotGap) {
        ctx.beginPath();
        ctx.arc(gx, gy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Connectors sit below the objects, exactly like the live SVG layer. Endpoints
  // are computed in artwork space; widths are converted from CSS px so the line
  // keeps the same thickness relative to the picture.
  (board.connectors || []).forEach(function (conn) {
    var from = sbFindItem(conn.from);
    var to = sbFindItem(conn.to);
    var fromEl = sbItemEl(conn.from);
    var toEl = sbItemEl(conn.to);
    if (!from || !to || !fromEl || !toEl) return;
    var a = toArt(from.x / 100 * visW, from.y / 100 * visH);
    var b = toArt(to.x / 100 * visW, to.y / 100 * visH);
    var aEdge = sbEdgePoint(a.x, a.y, b.x, b.y,
      Math.max(1, fromEl.offsetWidth / 2) * artScale,
      Math.max(1, fromEl.offsetHeight / 2) * artScale,
      from.rotation * Math.PI / 180);
    var bEdge = sbEdgePoint(b.x, b.y, a.x, a.y,
      Math.max(1, toEl.offsetWidth / 2) * artScale,
      Math.max(1, toEl.offsetHeight / 2) * artScale,
      to.rotation * Math.PI / 180);
    var aOut = sbPushOut(a.x, a.y, aEdge, 5 * designScale * artScale);
    var bOut = sbPushOut(b.x, b.y, bEdge, 5 * designScale * artScale);
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = baseBg;
    ctx.lineWidth = 7 * designScale * artScale;
    ctx.beginPath(); ctx.moveTo(aOut.x, aOut.y); ctx.lineTo(bOut.x, bOut.y); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 2.5 * designScale * artScale;
    ctx.beginPath(); ctx.moveTo(aOut.x, aOut.y); ctx.lineTo(bOut.x, bOut.y); ctx.stroke();
    ctx.translate(bOut.x, bOut.y);
    ctx.rotate(Math.atan2(bOut.y - aOut.y, bOut.x - aOut.x));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-11 * designScale * artScale, -5.5 * designScale * artScale);
    ctx.lineTo(-11 * designScale * artScale, 5.5 * designScale * artScale);
    ctx.closePath();
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = baseBg;
    ctx.lineWidth = 3 * designScale * artScale;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  });

  var ordered = board.items.slice().sort(function (a, b) {
    return (Number(a.z) || 0) - (Number(b.z) || 0);
  });
  var frameCache = Object.create(null);
  for (var i = 0; i < ordered.length; i++) {
    var item = ordered[i];
    // A note is an editor cue - it is NEVER drawn into the image.
    if (item.type === "note") continue;
    var el = sbItemEl(item.id);
    if (!el) continue;
    var art = toArt(item.x / 100 * visW, item.y / 100 * visH);
    ctx.save();
    ctx.translate(art.x, art.y);
    ctx.rotate((Number(item.rotation) || 0) * Math.PI / 180);
    // Draw with the live CSS-pixel metrics, then shrink/grow them to the
    // artwork's scale so an item covers the same fraction of the picture.
    ctx.scale(artScale, artScale);

    if (item.type === "sticker") {
      var img = el.querySelector(".sb-sticker");
      if (img) {
        if (!img.complete) { try { await sbImageReady(img); } catch (e) { /* skip */ } }
        var w = img.offsetWidth;
        var h = img.offsetHeight;
        if (w && h) {
          ctx.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
          // CSS drop-shadow(0 5px 8px rgba(0,0,0,.22)) survives the flip.
          ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 5 * (item.flipY ? -1 : 1);
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
        }
      }
    } else {
      var textEl = el.querySelector(".sb-text");
      if (textEl) {
        // The live frame border is design-scaled, so measure it instead of
        // assuming 18px.
        var frame = 0;
        if (item.border && item.border !== "none") {
          frame = parseFloat(getComputedStyle(textEl).borderTopWidth) || 0;
        }
        var frameImg = null;
        if (frame) {
          var uri = sbFrameDataUri(item.border, sbResolveColor(item.color));
          if (!frameCache[uri]) {
            frameCache[uri] = await sbLoadCanvasImage(uri).catch(function () { return null; });
          }
          frameImg = frameCache[uri];
        }
        var geom = sbHasBubble(item.bubble)
          ? sbBubbleMetrics(item, textEl.offsetWidth, textEl.offsetHeight, visW, visH)
          : null;
        sbDrawCanvasText(ctx, item, textEl, frame, frameImg, geom);
      }
    }
    ctx.restore();
  }

  var blob = await new Promise(function (resolve) {
    canvas.toBlob(function (b) { resolve(b); }, "image/jpeg", 0.92);
  });
  if (!blob) throw new Error("JPG encoding failed");
  return blob;
}

function sbDownloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}

// "Download Scene": the hamburger menu action that saves the ACTIVE scene.
async function sbDownloadJpg() {
  var board = sbActiveBoard();
  var blob = await sbBoardJpegBlob();
  if (!blob) return;
  sbDownloadBlob(blob, (sbSlug(board && board.name) || "storyboard") + ".jpg");
}

// ---- story ZIP -------------------------------------------------------------

// Store-only ZIP (JPEGs are already compressed). `files` = [{name, data:Uint8Array}].
var sbZipCrcTable = null;

function sbZipCrc32(bytes) {
  if (!sbZipCrcTable) {
    sbZipCrcTable = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      sbZipCrcTable[n] = c >>> 0;
    }
  }
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) {
    crc = sbZipCrcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function sbZipDosTime(date) {
  var d = date || new Date();
  var time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() / 2) & 0x1F);
  var day = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F);
  return { time: time & 0xFFFF, date: day & 0xFFFF };
}

function sbZipWrite(files) {
  var encoder = new TextEncoder();
  var stamp = sbZipDosTime();
  var chunks = [];
  var central = [];
  var offset = 0;

  (files || []).forEach(function (file) {
    var name = encoder.encode(file.name);
    var data = file.data;
    var crc = sbZipCrc32(data);

    var header = new Uint8Array(30 + name.length);
    var view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);   // local file header
    view.setUint16(4, 20, true);           // version needed
    view.setUint16(6, 0x0800, true);       // UTF-8 names
    view.setUint16(8, 0, true);            // store
    view.setUint16(10, stamp.time, true);
    view.setUint16(12, stamp.date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true); // compressed size
    view.setUint32(22, data.length, true); // uncompressed size
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);           // extra length
    header.set(name, 30);
    chunks.push(header, data);

    var entry = new Uint8Array(46 + name.length);
    var entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);  // central directory header
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint16(8, 0x0800, true);
    entryView.setUint16(10, 0, true);
    entryView.setUint16(12, stamp.time, true);
    entryView.setUint16(14, stamp.date, true);
    entryView.setUint32(16, crc, true);
    entryView.setUint32(20, data.length, true);
    entryView.setUint32(24, data.length, true);
    entryView.setUint16(28, name.length, true);
    entryView.setUint16(30, 0, true);          // extra length
    entryView.setUint16(32, 0, true);          // comment length
    entryView.setUint16(34, 0, true);          // disk number
    entryView.setUint16(36, 0, true);          // internal attributes
    entryView.setUint32(38, 0, true);          // external attributes
    entryView.setUint32(42, offset, true);     // local header offset
    entry.set(name, 46);
    central.push(entry);

    offset += header.length + data.length;
  });

  var centralSize = central.reduce(function (sum, entry) { return sum + entry.length; }, 0);
  var end = new Uint8Array(22);
  var endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);   // end of central directory
  endView.setUint16(8, central.length, true);
  endView.setUint16(10, central.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);       // central directory offset

  return new Blob(chunks.concat(central, [end]), { type: "application/zip" });
}

// One entry per scene: "<zero-padded number> - <scene name>.jpg", padded to the
// width of the HIGHEST number so the names sort alphabetically inside the zip.
function sbZipEntryName(index, total, name) {
  var width = String(Math.max(1, total)).length;
  var number = String(index + 1);
  while (number.length < width) number = "0" + number;
  var safe = String(name || "Scene").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim() || "Scene";
  return number + " - " + safe + ".jpg";
}

function sbNextFrame() {
  return new Promise(function (resolve) {
    requestAnimationFrame(function () { requestAnimationFrame(resolve); });
  });
}

// "Save story": render EVERY scene of the active story to a JPG and download them
// as <story>.zip. The active scene is restored afterwards (and its view/pan too).
async function sbDownloadStoryZip() {
  var story = sbActiveStory();
  if (!story || !story.scenes.length) return null;
  var original = sbActiveBoard();
  var entries = [];
  try {
    for (var i = 0; i < story.scenes.length; i++) {
      var scene = story.scenes[i];
      if (sbActiveBoard() !== scene) {
        sbActivateScene(story, scene);
        await sbNextFrame();
      }
      var blob = await sbBoardJpegBlob();
      if (!blob) continue;
      var buffer = await blob.arrayBuffer();
      entries.push({
        name: sbZipEntryName(i, story.scenes.length, scene.name),
        data: new Uint8Array(buffer)
      });
    }
  } finally {
    // Put the user back on the scene they were editing.
    var back = original && story.scenes.indexOf(original) !== -1 ? original : story.scenes[0];
    if (sbActiveBoard() !== back) {
      sbActivateScene(story, back);
      await sbNextFrame();
    }
  }
  if (!entries.length) return null;
  sbDownloadBlob(sbZipWrite(entries), (sbSlug(story.name) || "storyboard") + ".zip");
  return entries.length;
}

// ---- nav bar readout + menu entry points -----------------------------------

// The floating board chip was removed, so the nav bar is the only readout of
// where you are: "Storyboard - <story>/<scene>". The shared SmdApps.mountAppTitle()
// puts the plain app name there first; this only rewrites its TEXT (its
// show/hide while a page is open stays shared).
function sbNavTitleText() {
  var story = typeof sbActiveStory === "function" ? sbActiveStory() : null;
  var scene = typeof sbActiveBoard === "function" ? sbActiveBoard() : null;
  if (!story || !scene) return "Storyboard";
  return "Storyboard - " + story.name + "/" + scene.name;
}

function sbUpdateNavTitle() {
  var el = document.getElementById("appNavTitle");
  if (!el) return;
  var text = sbNavTitleText();
  if (el.textContent !== text) el.textContent = text;
}

// Menu wrappers keep the friendly failure message the rail button used to have
// (an inline onclick cannot catch a rejected promise).
function sbDownloadScene() {
  return sbDownloadJpg().catch(function (err) {
    console.error(err);
    alert("Could not download this scene as a JPG.");
  });
}

function sbDownloadStory() {
  return sbDownloadStoryZip().catch(function (err) {
    console.error(err);
    alert("Could not download this story as a ZIP.");
  });
}
