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
  sbEls.boardName = document.getElementById("sbBoardName");
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
  if (sbEls.boardName) {
    sbEls.boardName.addEventListener("click", function () { sbOpenTool("boards"); });
    sbEls.boardName.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      sbOpenTool("boards");
    });
  }

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
  if (connReverse) connReverse.addEventListener("click", sbReverseSelectedConnector);
  if (connDelete) connDelete.addEventListener("click", sbDeleteSelectedConnector);
  if (connectCancel) connectCancel.addEventListener("click", sbCancelConnect);
  if (sbEls.selectionBox) sbEls.selectionBox.addEventListener("pointerdown", sbOnSelectionPointerDown);

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
    });
  }
}

function renderMain() {
  sbRender();
}

function sbRender() {
  if (!sbEls.items) sbInitBoard();
  var board = sbActiveBoard();
  if (!board || !sbEls.items) return;

  // Size the board to the artwork BEFORE building items: the sticker width is
  // board-relative and the item % positions live in this box.
  sbLayoutBoard();

  var meta = sbBackgroundById(board.background);
  var story = typeof sbActiveStory === "function" ? sbActiveStory() : null;
  // Fit = contain (letterboxed over the board colour); stretch = fill the size.
  sbEls.bg.dataset.fit = typeof sbStoryFit === "function" ? sbStoryFit(story) : "fit";
  if (meta) {
    sbEls.bg.style.backgroundImage = 'url("' + meta.file + '")';
    sbEls.bg.dataset.background = meta.id;
  } else {
    // REMOVE the inline property rather than assigning "": an empty inline
    // background-image would override the CSS dot-grid for the empty board.
    sbEls.bg.style.removeProperty("background-image");
    sbEls.bg.dataset.background = "none";
  }

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

  if (sbEls.hint) sbEls.hint.classList.toggle("d-none", board.items.length > 0);
  if (sbEls.boardName) {
    var activeStory = typeof sbActiveStory === "function" ? sbActiveStory() : null;
    sbEls.boardName.textContent = activeStory ? activeStory.name + " / " + board.name : board.name;
    sbEls.boardName.title = activeStory ? activeStory.name + " - " + board.name : board.name;
  }
  sbUpdateSelectionUi();

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

  var rotateHandle = document.createElement("span");
  rotateHandle.className = "sb-handle sb-handle-rotate";
  rotateHandle.dataset.handle = "rotate";
  rotateHandle.setAttribute("aria-hidden", "true");
  rotateHandle.innerHTML = '<i class="fa-solid fa-rotate"></i>';
  el.appendChild(rotateHandle);

  return el;
}

function sbStyleTextElement(el, item) {
  el.className = "sb-text sb-bg-" + item.bg + " sb-color-" + item.color + " sb-font-" + item.font;
  el.dataset.frame = item.border;
  var body = el.querySelector(".sb-text-body");
  if (!body) {
    body = document.createElement("span");
    body.className = "sb-text-body";
    el.textContent = "";
    el.appendChild(body);
  }
  body.textContent = item.text || " ";
  el.style.setProperty("--sb-text-scale", item.scale);
  if (item.border && item.border !== "none") {
    el.style.setProperty("--sb-frame-image", 'url("' + sbFrameDataUri(item.border, sbResolveColor(item.color)) + '")');
  } else {
    el.style.removeProperty("--sb-frame-image");
  }
}

// The JPG exporter centres each line on the CSS line box with
// textBaseline="middle". CSS itself positions the glyphs from the font's
// ascent/descent, which leaves the live text a little lower than the export.
// Keep only the text (not the frame/background/handles) on the exported
// baseline by nudging the inner span. The nudge is stored in em so it follows
// text scale and board resizes without recalculating.
function sbApplyTextNudge(el) {
  var body = el && el.querySelector(".sb-text-body");
  if (!body) return;
  var cs = getComputedStyle(el);
  var ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return;
  ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
  ctx.textBaseline = "alphabetic";
  var alpha = ctx.measureText("Mg");
  ctx.textBaseline = "middle";
  var middle = ctx.measureText("Mg");
  var ascent = alpha.fontBoundingBoxAscent;
  var descent = alpha.fontBoundingBoxDescent;
  var middleAscent = middle.fontBoundingBoxAscent;
  if (!isFinite(ascent) || !isFinite(descent) || !isFinite(middleAscent)) {
    body.style.removeProperty("top");
    return;
  }
  var size = parseFloat(cs.fontSize);
  if (!size) return;
  var shift = ((ascent - middleAscent) - (ascent - descent) / 2) / size;
  if (Math.abs(shift) < 0.0001) body.style.removeProperty("top");
  else body.style.top = shift.toFixed(4) + "em";
}

function sbApplyAllTextNudges() {
  if (!sbEls.items) return;
  sbEls.items.querySelectorAll(".sb-text").forEach(sbApplyTextNudge);
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
  if (t.closest && (t.closest(".sb-object") || t.closest(".sb-connector") || t.closest(".sb-toolbar") || t.closest(".sb-selection-bar") || t.closest(".sb-selection-box") || t.closest(".sb-board-chip"))) return;
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
    item.rotation = (Number(leaf.rotation) || 0) + deltaDeg;
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
  sbState.drag = {
    itemId: "",
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
  if (item.type === "text" && sbTap && sbTap.id === item.id && now - sbTap.time < 340) {
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

  var handle = e.target.closest(".sb-handle");
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
  if (handle) mode = handle.dataset.handle === "rotate" ? "rotate" : "scale";
  sbBeginDrag(e, mode, rect, centre);
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
  sbState.pointers.clear();
  sbState.drag = null;
  sbSaveState();
  if (collapse) sbSetSelection([collapse]);
  sbPositionSelectionBox();
  sbPositionSelectionBar();
  sbRefreshPasteboard();
}

function sbOnKeyDown(e) {
  var t = e.target;
  var tag = (t && t.tagName ? t.tagName : "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
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

function sbDrawCanvasText(ctx, item, el, frame, frameImg) {
  var cs = getComputedStyle(el);
  var w = el.offsetWidth;
  var h = el.offsetHeight;
  if (!w || !h) return;
  var x = -w / 2;
  var y = -h / 2;

  // Surface first (the live rule is background-clip: padding-box, so a framed
  // box paints only inside the 18px border).
  var bg = cs.backgroundColor;
  if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
    ctx.fillStyle = bg;
    sbCanvasRoundRect(ctx, x + frame, y + frame, w - frame * 2, h - frame * 2, frame ? 8 : 10);
    ctx.fill();
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
  ctx.textBaseline = "middle";
  // offsetWidth/offsetHeight are rounded integers, while the browser lays the
  // text out on fractional pixels - without the small tolerance a line that fits
  // on screen (e.g. by 0.42px) would wrap in the canvas and lose its second line
  // to the box height. No clip: the live box is already sized to its content.
  var lines = sbCanvasWrapText(ctx, item.text || " ", contentW + 1.5);
  var ty = contentTop + lineH / 2;
  lines.forEach(function (line, i) { ctx.fillText(line, tx, ty + i * lineH); });
  ctx.restore();
}

async function sbDownloadJpg() {
  var board = sbActiveBoard();
  if (!board || !sbEls.canvas) return;
  var visW = sbEls.canvas.clientWidth;
  var visH = sbEls.canvas.clientHeight;
  if (!visW || !visH) return;
  var designScale = sbDesignScale();
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* draw with the fallback */ }
  }

  // A board with a background image exports the WHOLE artwork, not the visible
  // `cover` crop. The canvas is the image's natural size (capped at 4096px);
  // items are mapped from screen space back into the artwork's coordinates so
  // they stay on the same part of the picture as on screen.
  var bgMeta = board.background ? sbBackgroundById(board.background) : null;
  var bgImg = bgMeta ? await sbLoadCanvasImage(bgMeta.file).catch(function () { return null; }) : null;
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
        sbDrawCanvasText(ctx, item, textEl, frame, frameImg);
      }
    }
    ctx.restore();
  }

  var blob = await new Promise(function (resolve) {
    canvas.toBlob(function (b) { resolve(b); }, "image/jpeg", 0.92);
  });
  if (!blob) throw new Error("JPG encoding failed");
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = (sbSlug(board.name) || "storyboard") + ".jpg";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}
