// Whiteboard — painting the board and all direct-manipulation gestures.
//
// Objects are absolutely positioned by PERCENTAGE (left/top) so their relative
// place survives a resize, then rotated around their centre. Selection shows two
// handles: bottom-right = scale, top = rotate. Two fingers on one object pinch
// to scale, twist to rotate and slide to move. Every gesture writes into the
// stored item and saves (throttled while dragging).

var wbEls = {};
var wbTap = null;

function wbInitBoard() {
  wbEls.area = document.getElementById("whiteboardArea");
  wbEls.canvas = document.getElementById("wbCanvas");
  wbEls.bg = document.getElementById("wbBackground");
  wbEls.items = document.getElementById("wbItems");
  wbEls.hint = document.getElementById("wbEmptyHint");
  wbEls.selBar = document.getElementById("wbSelectionBar");
  wbEls.boardName = document.getElementById("wbBoardName");

  if (wbEls.items) wbEls.items.addEventListener("pointerdown", wbOnPointerDown);
  if (wbEls.canvas) wbEls.canvas.addEventListener("pointerdown", wbOnCanvasPointerDown);
  if (wbEls.items) wbEls.items.addEventListener("dblclick", wbOnDoubleClick);
  if (wbEls.boardName) {
    wbEls.boardName.addEventListener("click", function () { wbOpenTool("boards"); });
    wbEls.boardName.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      wbOpenTool("boards");
    });
  }

  var front = document.getElementById("wbSelFront");
  var duplicate = document.getElementById("wbSelDuplicate");
  var del = document.getElementById("wbSelDelete");
  if (front) front.addEventListener("click", wbFrontSelected);
  if (duplicate) duplicate.addEventListener("click", wbDuplicateSelected);
  if (del) del.addEventListener("click", wbDeleteSelected);

  document.addEventListener("pointermove", wbOnPointerMove, { passive: false });
  document.addEventListener("pointerup", wbOnPointerUp);
  document.addEventListener("pointercancel", wbOnPointerUp);
  document.addEventListener("keydown", wbOnKeyDown);
  window.addEventListener("resize", wbPositionSelectionBar);
}

function renderMain() {
  wbRender();
}

function wbRender() {
  if (!wbEls.items) wbInitBoard();
  var board = wbActiveBoard();
  if (!board || !wbEls.items) return;

  var meta = wbBackgroundById(board.background);
  if (meta) {
    wbEls.bg.style.backgroundImage = 'url("' + meta.file + '")';
    wbEls.bg.dataset.background = meta.id;
  } else {
    // REMOVE the inline property rather than assigning "": an empty inline
    // background-image would override the CSS dot-grid for the empty board.
    wbEls.bg.style.removeProperty("background-image");
    wbEls.bg.dataset.background = "none";
  }

  wbEls.items.innerHTML = "";
  var ordered = board.items.slice().sort(function (a, b) {
    return (Number(a.z) || 0) - (Number(b.z) || 0);
  });
  ordered.forEach(function (item) {
    wbEls.items.appendChild(wbBuildItem(item));
  });

  if (wbEls.hint) wbEls.hint.classList.toggle("d-none", board.items.length > 0);
  if (wbEls.boardName) wbEls.boardName.textContent = board.name;
  wbUpdateSelectionUi();
}

function wbBuildItem(item) {
  var el = document.createElement("div");
  el.className = "wb-object wb-object-" + item.type;
  if (item.id === wbState.selectedId) el.classList.add("selected");
  el.dataset.id = item.id;
  el.style.left = item.x + "%";
  el.style.top = item.y + "%";
  el.style.zIndex = String(Number(item.z) || 1);
  el.style.transform = "translate(-50%, -50%) rotate(" + item.rotation + "deg)";

  if (item.type === "sticker") {
    var meta = wbStickerById(item.sticker) || WB_STICKERS[0];
    el.style.setProperty("--wb-scale", item.scale);
    var img = document.createElement("img");
    img.className = "wb-sticker";
    img.src = meta.file;
    img.alt = meta.name;
    img.draggable = false;
    el.appendChild(img);
  } else {
    var text = document.createElement("div");
    wbStyleTextElement(text, item);
    el.appendChild(text);
  }

  var scaleHandle = document.createElement("span");
  scaleHandle.className = "wb-handle wb-handle-scale";
  scaleHandle.dataset.handle = "scale";
  scaleHandle.setAttribute("aria-hidden", "true");
  el.appendChild(scaleHandle);

  var rotateHandle = document.createElement("span");
  rotateHandle.className = "wb-handle wb-handle-rotate";
  rotateHandle.dataset.handle = "rotate";
  rotateHandle.setAttribute("aria-hidden", "true");
  rotateHandle.innerHTML = '<i class="fa-solid fa-rotate"></i>';
  el.appendChild(rotateHandle);

  return el;
}

function wbStyleTextElement(el, item) {
  el.className = "wb-text wb-bg-" + item.bg + " wb-color-" + item.color + " wb-font-" + item.font;
  el.dataset.frame = item.border;
  el.textContent = item.text || " ";
  el.style.setProperty("--wb-text-scale", item.scale);
  if (item.border && item.border !== "none") {
    el.style.setProperty("--wb-frame-image", 'url("' + wbFrameDataUri(item.border, wbResolveColor(item.color)) + '")');
  } else {
    el.style.removeProperty("--wb-frame-image");
  }
}

function wbApplyItemTransform(item) {
  if (!wbEls.items) return;
  var el = wbEls.items.querySelector('.wb-object[data-id="' + item.id + '"]');
  if (!el) return;
  el.style.left = item.x + "%";
  el.style.top = item.y + "%";
  el.style.transform = "translate(-50%, -50%) rotate(" + item.rotation + "deg)";
  el.style.setProperty("--wb-scale", item.scale);
  var text = el.querySelector(".wb-text");
  if (text) text.style.setProperty("--wb-text-scale", item.scale);
}

// Re-style one text object in place (used while typing in the panel, so the
// board updates without a full re-render that would lose focus).
function wbApplyTextStyle(item) {
  if (!wbEls.items) return;
  var el = wbEls.items.querySelector('.wb-object[data-id="' + item.id + '"] .wb-text');
  if (el) wbStyleTextElement(el, item);
  wbPositionSelectionBar();
}

function wbSelect(id) {
  wbState.selectedId = id || "";
  wbUpdateSelectionUi();
}

function wbUpdateSelectionUi() {
  if (!wbEls.items) return;
  var selected = wbState.selectedId;
  wbEls.items.querySelectorAll(".wb-object").forEach(function (el) {
    el.classList.toggle("selected", el.dataset.id === selected);
  });
  var item = wbSelectedItem();
  if (!item) {
    if (wbEls.selBar) wbEls.selBar.classList.add("d-none");
    return;
  }
  if (wbEls.selBar) wbEls.selBar.classList.remove("d-none");
  wbPositionSelectionBar();
}

function wbPositionSelectionBar() {
  if (!wbEls.selBar || !wbEls.items || !wbEls.area || wbEls.selBar.classList.contains("d-none")) return;
  var el = wbEls.items.querySelector('.wb-object[data-id="' + wbState.selectedId + '"]');
  if (!el) return;
  var r = el.getBoundingClientRect();
  var a = wbEls.area.getBoundingClientRect();
  var barW = wbEls.selBar.offsetWidth || 110;
  var barH = wbEls.selBar.offsetHeight || 42;
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
    var rotate = el.querySelector(".wb-handle-rotate");
    var rotateRect = rotate ? rotate.getBoundingClientRect() : r;
    var aboveTop = Math.min(r.top, rotateRect.top) - a.top - gap;
    if (aboveTop - barH >= 4) {
      mode = "above";
      left = r.left - a.left + r.width / 2;
      top = aboveTop;
    } else {
      mode = "below";
      var scale = el.querySelector(".wb-handle-scale");
      var scaleRect = scale ? scale.getBoundingClientRect() : r;
      left = r.left - a.left + r.width / 2;
      top = Math.max(r.bottom, scaleRect.bottom) - a.top + gap;
    }
  }

  if (mode === "right") {
    wbEls.selBar.style.transform = "translate(0, -50%)";
    left = Math.min(Math.max(left, 8), Math.max(8, a.width - barW - 8));
    top = Math.min(Math.max(top, barH / 2 + 8), Math.max(barH / 2 + 8, a.height - barH / 2 - 8));
  } else if (mode === "left") {
    wbEls.selBar.style.transform = "translate(-100%, -50%)";
    left = Math.min(Math.max(left, barW + 8), Math.max(barW + 8, a.width - 8));
    top = Math.min(Math.max(top, barH / 2 + 8), Math.max(barH / 2 + 8, a.height - barH / 2 - 8));
  } else if (mode === "above") {
    wbEls.selBar.style.transform = "translate(-50%, -100%)";
    left = Math.min(Math.max(left, 100), Math.max(100, a.width - 100));
    top = Math.min(Math.max(top, barH + 8), Math.max(barH + 8, a.height - 8));
  } else {
    wbEls.selBar.style.transform = "translate(-50%, 0)";
    left = Math.min(Math.max(left, 100), Math.max(100, a.width - 100));
    top = Math.min(Math.max(top, 8), Math.max(8, a.height - barH - 8));
  }

  wbEls.selBar.style.left = left + "px";
  wbEls.selBar.style.top = top + "px";
}

// ---- Selection actions -----------------------------------------------------

function wbDeleteSelected() {
  if (!wbState.selectedId) return;
  if (!wbRemoveItem(wbState.selectedId)) return;
  wbRender();
  // Deleting the text currently open in the panel leaves it in edit mode with
  // no item; drop back to the "new text" form.
  if (wbState.tool === "text") wbRenderPanel();
}

function wbDuplicateSelected() {
  if (!wbState.selectedId) return;
  wbDuplicateItem(wbState.selectedId);
  wbPositionSelectionBar();
}

function wbFrontSelected() {
  if (!wbState.selectedId) return;
  wbBringToFront(wbState.selectedId);
  wbPositionSelectionBar();
}

// ---- Pointer gestures ------------------------------------------------------

function wbOnCanvasPointerDown(e) {
  var t = e.target;
  if (t.closest && (t.closest(".wb-object") || t.closest(".wb-toolbar") || t.closest(".wb-selection-bar") || t.closest(".wb-board-chip"))) return;
  wbSelect("");
}

function wbOnDoubleClick(e) {
  var obj = e.target.closest ? e.target.closest(".wb-object") : null;
  if (!obj) return;
  var item = wbFindItem(obj.dataset.id);
  if (!item || item.type !== "text") return;
  e.preventDefault();
  wbOpenTextEditor(item.id);
}

function wbOnPointerDown(e) {
  var objEl = e.target.closest ? e.target.closest(".wb-object") : null;
  if (!objEl) return;
  var item = wbFindItem(objEl.dataset.id);
  if (!item) return;
  if (wbState.drag && wbState.drag.itemId !== item.id) return;

  var now = Date.now();
  if (item.type === "text" && wbTap && wbTap.id === item.id && now - wbTap.time < 340) {
    wbTap = null;
    wbSelect(item.id);
    wbOpenTextEditor(item.id);
    e.preventDefault();
    return;
  }
  wbTap = { id: item.id, time: now };

  wbSelect(item.id);

  var handle = e.target.closest(".wb-handle");
  try { objEl.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers */ }
  wbState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  var rect = objEl.getBoundingClientRect();
  var centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

  if (wbState.pointers.size === 2) {
    var pts = Array.from(wbState.pointers.values());
    var p0 = pts[0], p1 = pts[1];
    wbState.drag = {
      itemId: item.id,
      mode: "pinch",
      el: objEl,
      centre: centre,
      startScale: item.scale,
      startRotation: item.rotation,
      startX: item.x,
      startY: item.y,
      startDist: Math.max(1, Math.hypot(p1.x - p0.x, p1.y - p0.y)),
      startAngle: Math.atan2(p1.y - p0.y, p1.x - p0.x),
      startMidX: (p0.x + p1.x) / 2,
      startMidY: (p0.y + p1.y) / 2,
      downX: e.clientX,
      downY: e.clientY
    };
  } else {
    var mode = "move";
    if (handle) mode = handle.dataset.handle === "rotate" ? "rotate" : "scale";
    wbState.drag = {
      itemId: item.id,
      mode: mode,
      el: objEl,
      centre: centre,
      startScale: item.scale,
      startRotation: item.rotation,
      startX: item.x,
      startY: item.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      downX: e.clientX,
      downY: e.clientY,
      startDist: Math.max(1, Math.hypot(e.clientX - centre.x, e.clientY - centre.y)),
      startAngle: Math.atan2(e.clientY - centre.y, e.clientX - centre.x)
    };
  }
  e.preventDefault();
}

function wbOnPointerMove(e) {
  if (!wbState.pointers.has(e.pointerId) || !wbState.drag) return;
  wbState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  var drag = wbState.drag;
  var item = wbFindItem(drag.itemId);
  if (!item) return;
  var canvasRect = wbEls.canvas.getBoundingClientRect();
  var width = Math.max(1, canvasRect.width);
  var height = Math.max(1, canvasRect.height);

  // Any real movement means this was a drag, not a tap: don't let it pair with
  // the next tap to open the text editor.
  if (Math.abs(e.clientX - drag.downX) > 6 || Math.abs(e.clientY - drag.downY) > 6) wbTap = null;

  if (drag.mode === "pinch") {
    if (wbState.pointers.size < 2) return;
    var pts = Array.from(wbState.pointers.values());
    var p0 = pts[0], p1 = pts[1];
    var dist = Math.max(1, Math.hypot(p1.x - p0.x, p1.y - p0.y));
    var angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    var midX = (p0.x + p1.x) / 2;
    var midY = (p0.y + p1.y) / 2;
    item.scale = wbClamp(drag.startScale * (dist / drag.startDist), 0.2, 5);
    item.rotation = drag.startRotation + (angle - drag.startAngle) * 180 / Math.PI;
    item.x = wbClamp(drag.startX + (midX - drag.startMidX) / width * 100, 2, 98);
    item.y = wbClamp(drag.startY + (midY - drag.startMidY) / height * 100, 2, 98);
  } else if (drag.mode === "rotate") {
    var rotAngle = Math.atan2(e.clientY - drag.centre.y, e.clientX - drag.centre.x);
    item.rotation = drag.startRotation + (rotAngle - drag.startAngle) * 180 / Math.PI;
  } else if (drag.mode === "scale") {
    var sDist = Math.hypot(e.clientX - drag.centre.x, e.clientY - drag.centre.y);
    item.scale = wbClamp(drag.startScale * (sDist / drag.startDist), 0.2, 5);
  } else {
    item.x = wbClamp(drag.startX + (e.clientX - drag.startClientX) / width * 100, 2, 98);
    item.y = wbClamp(drag.startY + (e.clientY - drag.startClientY) / height * 100, 2, 98);
  }

  wbApplyItemTransform(item);
  wbPositionSelectionBar();
  wbSaveSoon();
  e.preventDefault();
}

function wbOnPointerUp(e) {
  if (!wbState.pointers.has(e.pointerId)) return;
  wbState.pointers.delete(e.pointerId);
  if (!wbState.drag) return;
  wbState.pointers.clear();
  var item = wbFindItem(wbState.drag.itemId);
  wbState.drag = null;
  wbSaveState();
  if (item) {
    wbApplyItemTransform(item);
    wbPositionSelectionBar();
  }
}

function wbOnKeyDown(e) {
  var t = e.target;
  var tag = (t && t.tagName ? t.tagName : "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
  if (e.key === "Delete" || e.key === "Backspace") {
    if (!wbState.selectedId) return;
    e.preventDefault();
    wbDeleteSelected();
  } else if (e.key === "Escape") {
    if (wbState.tool) wbClosePanel();
    else wbSelect("");
  }
}
