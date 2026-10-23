// Whiteboard — painting the board and all direct-manipulation gestures.
//
// Objects are absolutely positioned by PERCENTAGE (left/top) so their relative
// place survives a resize, then rotated around their centre. Selection shows two
// handles: bottom-right = scale, top = rotate. Two fingers on one object pinch
// to scale, twist to rotate and slide to move. Every gesture writes into the
// stored item and saves (throttled while dragging).

var wbEls = {};
var wbTap = null;
var WB_SVG_NS = "http://www.w3.org/2000/svg";

function wbInitBoard() {
  wbEls.area = document.getElementById("whiteboardArea");
  wbEls.canvas = document.getElementById("wbCanvas");
  wbEls.bg = document.getElementById("wbBackground");
  wbEls.items = document.getElementById("wbItems");
  wbEls.hint = document.getElementById("wbEmptyHint");
  wbEls.selBar = document.getElementById("wbSelectionBar");
  wbEls.boardName = document.getElementById("wbBoardName");
  wbEls.connectors = document.getElementById("wbConnectors");
  wbEls.connectorPaths = document.getElementById("wbConnectorPaths");
  wbEls.connectHint = document.getElementById("wbConnectHint");

  if (wbEls.items) wbEls.items.addEventListener("pointerdown", wbOnPointerDown);
  if (wbEls.canvas) wbEls.canvas.addEventListener("pointerdown", wbOnCanvasPointerDown);
  if (wbEls.items) wbEls.items.addEventListener("dblclick", wbOnDoubleClick);
  if (wbEls.connectors) wbEls.connectors.addEventListener("pointerdown", wbOnConnectorPointerDown);
  if (wbEls.boardName) {
    wbEls.boardName.addEventListener("click", function () { wbOpenTool("boards"); });
    wbEls.boardName.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      wbOpenTool("boards");
    });
  }

  var connect = document.getElementById("wbSelConnect");
  var front = document.getElementById("wbSelFront");
  var duplicate = document.getElementById("wbSelDuplicate");
  var flipH = document.getElementById("wbSelFlipH");
  var flipV = document.getElementById("wbSelFlipV");
  var del = document.getElementById("wbSelDelete");
  var connReverse = document.getElementById("wbConnReverse");
  var connDelete = document.getElementById("wbConnDelete");
  var connectCancel = document.getElementById("wbConnectCancel");
  if (connect) connect.addEventListener("click", wbStartConnect);
  if (front) front.addEventListener("click", wbFrontSelected);
  if (duplicate) duplicate.addEventListener("click", wbDuplicateSelected);
  if (flipH) flipH.addEventListener("click", function () { wbFlipSelected("x"); });
  if (flipV) flipV.addEventListener("click", function () { wbFlipSelected("y"); });
  if (del) del.addEventListener("click", wbDeleteSelected);
  if (connReverse) connReverse.addEventListener("click", wbReverseSelectedConnector);
  if (connDelete) connDelete.addEventListener("click", wbDeleteSelectedConnector);
  if (connectCancel) connectCancel.addEventListener("click", wbCancelConnect);

  document.addEventListener("pointermove", wbOnPointerMove, { passive: false });
  document.addEventListener("pointerup", wbOnPointerUp);
  document.addEventListener("pointercancel", wbOnPointerUp);
  document.addEventListener("keydown", wbOnKeyDown);
  window.addEventListener("resize", function () {
    wbRenderConnectors();
    wbPositionSelectionBar();
  });

  // Text metrics change when a font loads or the font size setting moves, which
  // moves the box edges a connector must attach to.
  if (window.ResizeObserver) {
    wbEls.objectObserver = new ResizeObserver(function () {
      wbRenderConnectors();
      wbPositionSelectionBar();
    });
  }
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
  if (wbEls.objectObserver) wbEls.objectObserver.disconnect();
  var ordered = board.items.slice().sort(function (a, b) {
    return (Number(a.z) || 0) - (Number(b.z) || 0);
  });
  ordered.forEach(function (item) {
    var el = wbBuildItem(item);
    wbEls.items.appendChild(el);
    if (wbEls.objectObserver) wbEls.objectObserver.observe(el);
  });

  wbRenderConnectors();
  wbApplyConnectClasses();

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
    wbApplyStickerFlip(el, item);
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
  wbApplyStickerFlip(el, item);
  var text = el.querySelector(".wb-text");
  if (text) text.style.setProperty("--wb-text-scale", item.scale);
  wbRenderConnectors();
}

// Mirror ONLY the sticker artwork. The flags become CSS custom properties on the
// object and `.wb-sticker`'s transform consumes them, so the object's own
// translate/rotate transform (and its handles/outline) are untouched.
function wbApplyStickerFlip(el, item) {
  if (!el || !item) return;
  if (item.type !== "sticker") {
    el.style.removeProperty("--wb-flip-x");
    el.style.removeProperty("--wb-flip-y");
    return;
  }
  el.style.setProperty("--wb-flip-x", item.flipX ? "-1" : "1");
  el.style.setProperty("--wb-flip-y", item.flipY ? "-1" : "1");
}

// Re-style one text object in place (used while typing in the panel, so the
// board updates without a full re-render that would lose focus).
function wbApplyTextStyle(item) {
  if (!wbEls.items) return;
  var el = wbEls.items.querySelector('.wb-object[data-id="' + item.id + '"] .wb-text');
  if (el) wbStyleTextElement(el, item);
  wbRenderConnectors();
  wbPositionSelectionBar();
}

// ---- Connectors ------------------------------------------------------------
//
// One SVG layer sits between the background and the objects. Every connector is
// a primary-coloured line with a background-coloured halo (so it stays readable
// over the photo backgrounds) and an arrowhead marker at the TARGET end. The
// endpoints are recomputed from the two text boxes' ORIENTED rectangles, so they
// stay glued to the edges while a box is moved, scaled or rotated.

function wbRenderConnectors() {
  if (!wbEls.connectorPaths || !wbEls.items) return;
  var board = wbActiveBoard();
  var layer = wbEls.connectorPaths;
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  if (!board || !Array.isArray(board.connectors) || !board.connectors.length) return;

  var canvasRect = wbEls.canvas.getBoundingClientRect();
  board.connectors.forEach(function (conn) {
    var ends = wbConnectorEnds(conn, canvasRect);
    if (!ends) return;
    var d = "M" + ends.x1.toFixed(2) + " " + ends.y1.toFixed(2) +
      " L" + ends.x2.toFixed(2) + " " + ends.y2.toFixed(2);

    var g = document.createElementNS(WB_SVG_NS, "g");
    g.setAttribute("class", "wb-connector" + (conn.id === wbState.selectedConnectorId ? " selected" : ""));
    g.setAttribute("data-id", conn.id);

    var halo = document.createElementNS(WB_SVG_NS, "path");
    halo.setAttribute("class", "wb-connector-halo");
    halo.setAttribute("d", d);
    g.appendChild(halo);

    var line = document.createElementNS(WB_SVG_NS, "path");
    line.setAttribute("class", "wb-connector-line");
    line.setAttribute("d", d);
    line.setAttribute("marker-end", "url(#wbConnectorArrow)");
    g.appendChild(line);

    // A fat invisible stroke makes the thin arrow easy to hit with a finger.
    var hit = document.createElementNS(WB_SVG_NS, "path");
    hit.setAttribute("class", "wb-connector-hit");
    hit.setAttribute("d", d);
    g.appendChild(hit);

    layer.appendChild(g);
  });
}

function wbConnectorEnds(conn, canvasRect) {
  var fromItem = wbFindItem(conn.from);
  var toItem = wbFindItem(conn.to);
  if (!fromItem || !toItem) return null;
  var fromEl = wbEls.items.querySelector('.wb-object[data-id="' + conn.from + '"]');
  var toEl = wbEls.items.querySelector('.wb-object[data-id="' + conn.to + '"]');
  if (!fromEl || !toEl) return null;

  var aRect = fromEl.getBoundingClientRect();
  var bRect = toEl.getBoundingClientRect();
  var ax = aRect.left + aRect.width / 2 - canvasRect.left;
  var ay = aRect.top + aRect.height / 2 - canvasRect.top;
  var bx = bRect.left + bRect.width / 2 - canvasRect.left;
  var by = bRect.top + bRect.height / 2 - canvasRect.top;

  var aEdge = wbEdgePoint(ax, ay, bx, by,
    Math.max(1, fromEl.offsetWidth / 2), Math.max(1, fromEl.offsetHeight / 2),
    fromItem.rotation * Math.PI / 180);
  var bEdge = wbEdgePoint(bx, by, ax, ay,
    Math.max(1, toEl.offsetWidth / 2), Math.max(1, toEl.offsetHeight / 2),
    toItem.rotation * Math.PI / 180);

  // Stop 5px short of each box so the arrowhead never touches the border.
  var gap = 5;
  var aOut = wbPushOut(ax, ay, aEdge, gap);
  var bOut = wbPushOut(bx, by, bEdge, gap);
  return { x1: aOut.x, y1: aOut.y, x2: bOut.x, y2: bOut.y };
}

// Intersect the ray centre -> target with the rotated rectangle's edge.
function wbEdgePoint(cx, cy, tx, ty, halfW, halfH, angle) {
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

function wbPushOut(cx, cy, pt, gap) {
  var dx = pt.x - cx;
  var dy = pt.y - cy;
  var len = Math.hypot(dx, dy) || 1;
  return { x: pt.x + dx / len * gap, y: pt.y + dy / len * gap };
}

function wbOnConnectorPointerDown(e) {
  var g = e.target.closest ? e.target.closest(".wb-connector") : null;
  if (!g) return;
  e.preventDefault();
  e.stopPropagation();
  if (wbState.connectFrom) wbCancelConnect();
  wbSelectConnector(g.getAttribute("data-id"));
}

function wbSelect(id) {
  wbState.selectedId = id || "";
  wbState.selectedConnectorId = "";
  wbUpdateSelectionUi();
}

function wbSelectConnector(id) {
  wbState.selectedId = "";
  wbState.selectedConnectorId = id || "";
  wbUpdateSelectionUi();
}

function wbSetBarButton(id, show) {
  var el = document.getElementById(id);
  if (el) el.classList.toggle("d-none", !show);
}

function wbSetBarPressed(id, on) {
  var el = document.getElementById(id);
  if (el) el.setAttribute("aria-pressed", on ? "true" : "false");
}

function wbUpdateSelectionUi() {
  if (!wbEls.items) return;
  var conn = wbSelectedConnector();
  var selected = conn ? "" : wbState.selectedId;
  wbEls.items.querySelectorAll(".wb-object").forEach(function (el) {
    el.classList.toggle("selected", el.dataset.id === selected);
  });
  if (wbEls.connectorPaths) {
    wbEls.connectorPaths.querySelectorAll(".wb-connector").forEach(function (g) {
      g.classList.toggle("selected", g.getAttribute("data-id") === wbState.selectedConnectorId);
    });
  }

  var bar = wbEls.selBar;
  if (!bar) return;
  if (wbState.connectFrom) {
    bar.classList.add("d-none");
    return;
  }

  if (conn) {
    bar.classList.remove("d-none");
    wbSetBarButton("wbSelConnect", false);
    wbSetBarButton("wbSelFront", false);
    wbSetBarButton("wbSelDuplicate", false);
    wbSetBarButton("wbSelFlipH", false);
    wbSetBarButton("wbSelFlipV", false);
    wbSetBarButton("wbSelDelete", false);
    wbSetBarButton("wbConnReverse", true);
    wbSetBarButton("wbConnDelete", true);
    wbPositionSelectionBar();
    return;
  }

  wbSetBarButton("wbConnReverse", false);
  wbSetBarButton("wbConnDelete", false);
  var item = wbSelectedItem();
  if (!item) {
    bar.classList.add("d-none");
    return;
  }
  bar.classList.remove("d-none");
  wbSetBarButton("wbSelFront", true);
  wbSetBarButton("wbSelDuplicate", true);
  wbSetBarButton("wbSelDelete", true);
  wbSetBarButton("wbSelConnect", item.type === "text");
  // Flip only makes sense for sticker artwork; the pressed state shows which
  // mirrors are currently on.
  var sticker = item.type === "sticker";
  wbSetBarButton("wbSelFlipH", sticker);
  wbSetBarButton("wbSelFlipV", sticker);
  wbSetBarPressed("wbSelFlipH", !!item.flipX);
  wbSetBarPressed("wbSelFlipV", !!item.flipY);
  wbPositionSelectionBar();
}

function wbPositionSelectionBar() {
  if (!wbEls.selBar || !wbEls.items || !wbEls.area || wbEls.selBar.classList.contains("d-none")) return;
  var el;
  if (wbState.selectedConnectorId) {
    el = wbEls.connectorPaths.querySelector('.wb-connector[data-id="' + wbState.selectedConnectorId + '"] .wb-connector-line');
  } else {
    el = wbEls.items.querySelector('.wb-object[data-id="' + wbState.selectedId + '"]');
  }
  if (!el) return;
  var r = el.getBoundingClientRect();
  var a = wbEls.area.getBoundingClientRect();
  var barW = wbEls.selBar.offsetWidth || 110;
  var barH = wbEls.selBar.offsetHeight || 42;
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
    left = Math.min(Math.max(left, halfBarW), Math.max(halfBarW, a.width - halfBarW));
    top = Math.min(Math.max(top, barH + 8), Math.max(barH + 8, a.height - 8));
  } else {
    wbEls.selBar.style.transform = "translate(-50%, 0)";
    left = Math.min(Math.max(left, halfBarW), Math.max(halfBarW, a.width - halfBarW));
    top = Math.min(Math.max(top, 8), Math.max(8, a.height - barH - 8));
  }

  wbEls.selBar.style.left = left + "px";
  wbEls.selBar.style.top = top + "px";
}

// ---- Selection actions -----------------------------------------------------

function wbDeleteSelectedConnector() {
  if (!wbState.selectedConnectorId) return;
  if (!wbRemoveConnector(wbState.selectedConnectorId)) return;
  wbRenderConnectors();
  wbUpdateSelectionUi();
}

function wbReverseSelectedConnector() {
  var conn = wbSelectedConnector();
  if (!conn) return;
  wbReverseConnector(conn.id);
  wbRenderConnectors();
  wbUpdateSelectionUi();
}

function wbDeleteSelected() {
  if (wbState.selectedConnectorId) {
    wbDeleteSelectedConnector();
    return;
  }
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

function wbFlipSelected(axis) {
  if (!wbState.selectedId) return;
  var item = wbFlipItem(wbState.selectedId, axis);
  if (!item) return;
  wbApplyItemTransform(item);
  wbUpdateSelectionUi();
  wbPositionSelectionBar();
}

// ---- Connector mode --------------------------------------------------------

function wbApplyConnectClasses() {
  var on = !!wbState.connectFrom;
  if (wbEls.items) {
    wbEls.items.classList.toggle("wb-connecting", on);
    wbEls.items.querySelectorAll(".wb-object").forEach(function (el) {
      el.classList.toggle("wb-connect-source", on && el.dataset.id === wbState.connectFrom);
    });
  }
  if (wbEls.connectHint) wbEls.connectHint.classList.toggle("d-none", !on);
}

function wbStartConnect() {
  var item = wbSelectedItem();
  if (!item || item.type !== "text") return;
  wbState.connectFrom = item.id;
  wbState.selectedConnectorId = "";
  // Give the board room to show the target boxes; a pinned panel stays put.
  if (!wbState.pinned && wbState.tool) wbClosePanel();
  wbApplyConnectClasses();
  wbUpdateSelectionUi();
}

function wbCancelConnect() {
  if (!wbState.connectFrom) return;
  wbState.connectFrom = "";
  wbApplyConnectClasses();
  wbUpdateSelectionUi();
}

function wbCreateConnection(toId) {
  var fromId = wbState.connectFrom;
  if (!fromId || !toId || fromId === toId) return;
  var conn = wbAddConnector(fromId, toId);
  wbState.connectFrom = "";
  wbApplyConnectClasses();
  wbRenderConnectors();
  if (conn) wbSelectConnector(conn.id);
  else wbUpdateSelectionUi();
}

// ---- Pointer gestures ------------------------------------------------------

function wbOnCanvasPointerDown(e) {
  var t = e.target;
  if (t.closest && (t.closest(".wb-object") || t.closest(".wb-connector") || t.closest(".wb-toolbar") || t.closest(".wb-selection-bar") || t.closest(".wb-board-chip"))) return;
  if (wbState.connectFrom) wbCancelConnect();
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

  // Connector mode: the next TEXT box becomes the arrow's target.
  if (wbState.connectFrom) {
    if (item.type === "text" && item.id !== wbState.connectFrom) {
      e.preventDefault();
      wbCreateConnection(item.id);
      return;
    }
    // Clicking the source (or a sticker) cancels the mode and behaves normally.
    wbCancelConnect();
  }

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
    if (!wbState.selectedId && !wbState.selectedConnectorId) return;
    e.preventDefault();
    wbDeleteSelected();
  } else if (e.key === "Escape") {
    if (wbState.connectFrom) wbCancelConnect();
    else if (wbState.tool) wbClosePanel();
    else wbSelect("");
  }
}

// ---- Save the board as a JPG ----------------------------------------------
//
// Drawn from the STORED items + the live layout metrics (not a DOM screenshot),
// so the toolbar, board chip, selection outlines/handles and the empty hint are
// never in the image. Paint order matches the board: surface -> connectors ->
// items (z order). The canvas is 2x for readable text, capped on huge boards.

function wbItemEl(id) {
  if (!wbEls.items || !id) return null;
  return wbEls.items.querySelector('.wb-object[data-id="' + id + '"]');
}

function wbSlug(name) {
  return String(name || "whiteboard").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function wbLoadCanvasImage(src) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error("Could not load " + src)); };
    img.src = src;
  });
}

function wbImageReady(img) {
  return new Promise(function (resolve, reject) {
    if (img.complete) return resolve(img);
    img.addEventListener("load", function () { resolve(img); }, { once: true });
    img.addEventListener("error", function () { reject(new Error("Image failed")); }, { once: true });
  });
}

function wbCanvasRoundRect(ctx, x, y, w, h, r) {
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
function wbCanvasWrapText(ctx, text, maxWidth) {
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

function wbDrawCanvasText(ctx, item, el, frame, frameImg) {
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
    wbCanvasRoundRect(ctx, x + frame, y + frame, w - frame * 2, h - frame * 2, frame ? 8 : 10);
    ctx.fill();
  }

  // The SVG frame as a 9-slice (source slice 30 of 120).
  if (frame && frameImg) {
    var s = 30, src = 120, d = frame;
    ctx.drawImage(frameImg, 0, 0, s, s, x, y, d, d);
    ctx.drawImage(frameImg, src - s, 0, s, s, x + w - d, y, d, d);
    ctx.drawImage(frameImg, 0, src - s, s, s, x, y + h - d, d, d);
    ctx.drawImage(frameImg, src - s, src - s, s, s, x + w - d, y + h - d, d, d);
    ctx.drawImage(frameImg, s, 0, src - s * 2, s, x + d, y, w - d * 2, d);
    ctx.drawImage(frameImg, s, src - s, src - s * 2, s, x + d, y + h - d, w - d * 2, d);
    ctx.drawImage(frameImg, 0, s, s, src - s * 2, x, y + d, d, h - d * 2);
    ctx.drawImage(frameImg, src - s, s, s, src - s * 2, x + w - d, y + d, d, h - d * 2);
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
  var lines = wbCanvasWrapText(ctx, item.text || " ", contentW + 1.5);
  var ty = contentTop + lineH / 2;
  lines.forEach(function (line, i) { ctx.fillText(line, tx, ty + i * lineH); });
  ctx.restore();
}

async function wbDownloadJpg() {
  var board = wbActiveBoard();
  if (!board || !wbEls.canvas) return;
  var visW = wbEls.canvas.clientWidth;
  var visH = wbEls.canvas.clientHeight;
  if (!visW || !visH) return;
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* draw with the fallback */ }
  }

  // A board with a background image exports the WHOLE artwork, not the visible
  // `cover` crop. The canvas is the image's natural size (capped at 4096px);
  // items are mapped from screen space back into the artwork's coordinates so
  // they stay on the same part of the picture as on screen.
  var bgMeta = board.background ? wbBackgroundById(board.background) : null;
  var bgImg = bgMeta ? await wbLoadCanvasImage(bgMeta.file).catch(function () { return null; }) : null;
  var hasBg = !!(bgImg && bgImg.naturalWidth && bgImg.naturalHeight);

  var W, H, outScale;
  if (hasBg) {
    W = bgImg.naturalWidth;
    H = bgImg.naturalHeight;
    outScale = Math.min(1, 4096 / Math.max(W, H));
  } else {
    W = visW;
    H = visH;
    outScale = Math.max(1, Math.min(2, 4096 / Math.max(W, H)));
  }

  // `cover` on the live board: how many CSS px one artwork px occupies, and the
  // (negative) offset of the artwork inside the visible window.
  var coverScale = hasBg ? Math.max(visW / W, visH / H) : 1;
  var offsetX = hasBg ? (visW - W * coverScale) / 2 : 0;
  var offsetY = hasBg ? (visH - H * coverScale) / 2 : 0;
  var artScale = 1 / coverScale;
  var toArt = function (px, py) {
    return { x: (px - offsetX) / coverScale, y: (py - offsetY) / coverScale };
  };

  var canvas = document.createElement("canvas");
  canvas.width = Math.round(W * outScale);
  canvas.height = Math.round(H * outScale);
  var ctx = canvas.getContext("2d");
  ctx.scale(outScale, outScale);

  var baseBg = getComputedStyle(wbEls.canvas).backgroundColor || "#ffffff";
  var bodyColor = getComputedStyle(document.body).color;
  ctx.fillStyle = baseBg;
  ctx.fillRect(0, 0, W, H);

  if (hasBg) {
    var bgStyle = getComputedStyle(wbEls.bg);
    if (bgStyle.backgroundColor && bgStyle.backgroundColor !== "rgba(0, 0, 0, 0)") {
      ctx.fillStyle = bgStyle.backgroundColor;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.drawImage(bgImg, 0, 0, W, H);
  } else {
    // The empty board's dot grid: 1px dots at 24px spacing, 22% body colour.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = bodyColor;
    for (var gy = 12; gy < H; gy += 24) {
      for (var gx = 12; gx < W; gx += 24) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Connectors sit below the objects, exactly like the live SVG layer. Endpoints
  // are computed in artwork space; widths are converted from CSS px so the line
  // keeps the same thickness relative to the picture.
  (board.connectors || []).forEach(function (conn) {
    var from = wbFindItem(conn.from);
    var to = wbFindItem(conn.to);
    var fromEl = wbItemEl(conn.from);
    var toEl = wbItemEl(conn.to);
    if (!from || !to || !fromEl || !toEl) return;
    var a = toArt(from.x / 100 * visW, from.y / 100 * visH);
    var b = toArt(to.x / 100 * visW, to.y / 100 * visH);
    var aEdge = wbEdgePoint(a.x, a.y, b.x, b.y,
      Math.max(1, fromEl.offsetWidth / 2) * artScale,
      Math.max(1, fromEl.offsetHeight / 2) * artScale,
      from.rotation * Math.PI / 180);
    var bEdge = wbEdgePoint(b.x, b.y, a.x, a.y,
      Math.max(1, toEl.offsetWidth / 2) * artScale,
      Math.max(1, toEl.offsetHeight / 2) * artScale,
      to.rotation * Math.PI / 180);
    var aOut = wbPushOut(a.x, a.y, aEdge, 5 * artScale);
    var bOut = wbPushOut(b.x, b.y, bEdge, 5 * artScale);
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = baseBg;
    ctx.lineWidth = 7 * artScale;
    ctx.beginPath(); ctx.moveTo(aOut.x, aOut.y); ctx.lineTo(bOut.x, bOut.y); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 2.5 * artScale;
    ctx.beginPath(); ctx.moveTo(aOut.x, aOut.y); ctx.lineTo(bOut.x, bOut.y); ctx.stroke();
    ctx.translate(bOut.x, bOut.y);
    ctx.rotate(Math.atan2(bOut.y - aOut.y, bOut.x - aOut.x));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-11 * artScale, -5.5 * artScale);
    ctx.lineTo(-11 * artScale, 5.5 * artScale);
    ctx.closePath();
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = baseBg;
    ctx.lineWidth = 3 * artScale;
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
    var el = wbItemEl(item.id);
    if (!el) continue;
    var art = toArt(item.x / 100 * visW, item.y / 100 * visH);
    ctx.save();
    ctx.translate(art.x, art.y);
    ctx.rotate((Number(item.rotation) || 0) * Math.PI / 180);
    // Draw with the live CSS-pixel metrics, then shrink/grow them to the
    // artwork's scale so an item covers the same fraction of the picture.
    ctx.scale(artScale, artScale);

    if (item.type === "sticker") {
      var img = el.querySelector(".wb-sticker");
      if (img) {
        if (!img.complete) { try { await wbImageReady(img); } catch (e) { /* skip */ } }
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
      var textEl = el.querySelector(".wb-text");
      if (textEl) {
        var frame = item.border && item.border !== "none" ? 18 : 0;
        var frameImg = null;
        if (frame) {
          var uri = wbFrameDataUri(item.border, wbResolveColor(item.color));
          if (!frameCache[uri]) {
            frameCache[uri] = await wbLoadCanvasImage(uri).catch(function () { return null; });
          }
          frameImg = frameCache[uri];
        }
        wbDrawCanvasText(ctx, item, textEl, frame, frameImg);
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
  a.download = (wbSlug(board.name) || "whiteboard") + ".jpg";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}


