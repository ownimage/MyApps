// Storyboard - board + item storage.
//
// Every board is { id, name, background, items }. Items are either
//   sticker: { id, type:"sticker", sticker, x, y, scale, rotation, z, flipX, flipY }
//   text:    { id, type:"text", text, bg, color, border, x, y, scale, rotation, z, font }
// `flipX`/`flipY` mirror the sticker ARTWORK only (the object box, handles and
// connectors stay put). x/y are PERCENTAGES of the board so a board keeps its
// layout on any screen.
// All keys live under the app's `storyboard_` prefix via smdKey().
//
// The whole app is classic scripts with globals, like every other app here:
// generated markup uses inline handlers and the shared settings code calls
// `renderMain()` / `applyImageSize()` when it needs to.

var SB_BACKGROUNDS = [
  { id: "space", name: "Space", file: "assets/backgrounds/space.svg", width: 2560, height: 1440 },
  { id: "underwater", name: "Underwater", file: "assets/backgrounds/underwater.svg", width: 2560, height: 1440 }
];

var SB_STICKERS = [
  { id: "mermaid", name: "Mermaid", file: "assets/stickers/mermaid.svg" },
  { id: "shark", name: "Shark", file: "assets/stickers/shark.svg" },
  { id: "seaweed", name: "Seaweed", file: "assets/stickers/seaweed.svg" },
  { id: "spaceman", name: "Spaceman", file: "assets/stickers/spaceman.svg" },
  { id: "spaceship", name: "Spaceship", file: "assets/stickers/spaceship.svg" }
];

var SB_TEXT_BORDERS = [
  { id: "none", name: "None" },
  { id: "fancy", name: "Fancy" },
  { id: "hand", name: "Hand-drawn" },
  { id: "stamp", name: "Stamp" }
];

// Families declared in shared/css/fonts/fonts.css (loaded by the theme sheet's
// @import), plus the theme stack and two system fallbacks. The CSS owns the
// actual font stacks (`.sb-font-<id>` in storyboard.css).
var SB_TEXT_FONTS = [
  { id: "theme", name: "Theme font" },
  { id: "serif", name: "Serif" },
  { id: "mono", name: "Monospace" },
  { id: "roboto", name: "Roboto" },
  { id: "lato", name: "Lato" },
  { id: "open-sans", name: "Open Sans" },
  { id: "montserrat", name: "Montserrat" },
  { id: "ubuntu", name: "Ubuntu" },
  { id: "nunito", name: "Nunito" },
  { id: "nunito-sans", name: "Nunito Sans" },
  { id: "source-sans-pro", name: "Source Sans Pro" },
  { id: "inter", name: "Inter" },
  { id: "news-cycle", name: "News Cycle" },
  { id: "cabin-sketch", name: "Cabin Sketch" },
  { id: "neucha", name: "Neucha" }
];

var SB_BG_TOKENS = ["transparent", "white", "black", "primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];
var SB_TEXT_TOKENS = ["auto", "white", "black", "primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];

// Zoom factors the rail's magnifier buttons step through. 1 = the fitted view
// (the whole board visible, exactly as before zooming existed).
var SB_ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

// Runtime state (deliberately not persisted, except boards/active/pinned/zoom).
var sbState = {
  boards: [],
  activeId: "",
  selectedId: "",
  selectedIds: [],
  selectedConnectorId: "",
  connectFrom: "",
  tool: "",
  pinned: false,
  zoom: 1,
  editingTextId: "",
  drag: null,
  pointers: new Map(),
  panReady: false,
  pan: null,
  saveTimer: null
};

function sbUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function sbClamp(value, min, max) {
  value = Number(value);
  if (!isFinite(value)) value = min;
  return Math.min(max, Math.max(min, value));
}

// Snap any stored zoom to the nearest supported step.
function sbNormalizeZoom(value) {
  var v = Number(value);
  if (!isFinite(v) || v <= 0) return 1;
  var best = SB_ZOOM_LEVELS[0];
  SB_ZOOM_LEVELS.forEach(function (level) {
    if (Math.abs(level - v) < Math.abs(best - v)) best = level;
  });
  return best;
}

function sbBackgroundById(id) {
  for (var i = 0; i < SB_BACKGROUNDS.length; i++) {
    if (SB_BACKGROUNDS[i].id === id) return SB_BACKGROUNDS[i];
  }
  return null;
}

function sbStickerById(id) {
  for (var i = 0; i < SB_STICKERS.length; i++) {
    if (SB_STICKERS[i].id === id) return SB_STICKERS[i];
  }
  return null;
}

function sbHasBorder(id) {
  return SB_TEXT_BORDERS.some(function (b) { return b.id === id; });
}

function sbHasFont(id) {
  return SB_TEXT_FONTS.some(function (f) { return f.id === id; });
}

function sbNormalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  var type = raw.type === "text" ? "text" : "sticker";
  var item = {
    id: String(raw.id || sbUid()),
    type: type,
    x: sbClamp(raw.x, 2, 98),
    y: sbClamp(raw.y, 2, 98),
    scale: sbClamp(raw.scale, 0.2, 5),
    rotation: isFinite(Number(raw.rotation)) ? Number(raw.rotation) : 0,
    z: isFinite(Number(raw.z)) ? Number(raw.z) : 1
  };
  if (type === "sticker") {
    item.sticker = sbStickerById(raw.sticker) ? raw.sticker : SB_STICKERS[0].id;
    item.flipX = raw.flipX === true;
    item.flipY = raw.flipY === true;
  } else {
    item.text = String(raw.text == null ? "" : raw.text);
    item.bg = SB_BG_TOKENS.indexOf(raw.bg) >= 0 ? raw.bg : "transparent";
    item.color = SB_TEXT_TOKENS.indexOf(raw.color) >= 0 ? raw.color : "auto";
    item.border = sbHasBorder(raw.border) ? raw.border : "none";
    item.font = sbHasFont(raw.font) ? raw.font : "theme";
  }
  return item;
}

function sbNormalizeBoard(raw) {
  if (!raw || typeof raw !== "object") return null;
  var board = {
    id: String(raw.id || sbUid()),
    name: String(raw.name || "Board").trim() || "Board",
    background: sbBackgroundById(raw.background) ? raw.background : "",
    items: [],
    connectors: [],
    groups: []
  };
  if (Array.isArray(raw.items)) {
    raw.items.forEach(function (it) {
      var item = sbNormalizeItem(it);
      if (item) board.items.push(item);
    });
  }

  // Connectors are directional links between two TEXT boxes. Drop anything that
  // points at a missing/non-text item (or at itself), and keep at most one link
  // per pair so two arrows can never overlap.
  var textIds = {};
  board.items.forEach(function (item) {
    if (item.type === "text") textIds[item.id] = true;
  });
  var seenPairs = {};
  if (Array.isArray(raw.connectors)) {
    raw.connectors.forEach(function (rawConn) {
      if (!rawConn || typeof rawConn !== "object") return;
      var from = String(rawConn.from || "");
      var to = String(rawConn.to || "");
      if (!textIds[from] || !textIds[to] || from === to) return;
      var pair = from < to ? from + "|" + to : to + "|" + from;
      if (seenPairs[pair]) return;
      seenPairs[pair] = true;
      board.connectors.push({ id: String(rawConn.id || sbUid()), from: from, to: to });
    });
  }

  // Groups are a SEPARATE forest over the flat item list: a group's children are
  // leaf item ids or other group ids, which is what makes nesting possible
  // without changing how items render, connect or export.
  board.groups = sbNormalizeGroups(board, raw.groups);
  return board;
}

// Sanitise a persisted group forest:
//  - children must reference a known leaf or group, once, and never themselves;
//  - a node has at most ONE parent (a forest, not a DAG);
//  - cycles are severed;
//  - a group with fewer than 2 children is dissolved (its children take its
//    place in its parent, or become top-level), so a group is never a pointless
//    wrapper around one object.
function sbNormalizeGroups(board, rawGroups) {
  var raw = Array.isArray(rawGroups) ? rawGroups : [];
  var leaves = {};
  (board.items || []).forEach(function (it) { leaves[it.id] = true; });
  var byId = {};
  var ids = [];
  raw.forEach(function (g) {
    if (!g || typeof g !== "object") return;
    var id = String(g.id || "");
    if (!id || byId[id]) return;
    var children = [];
    if (Array.isArray(g.children)) {
      g.children.forEach(function (c) {
        var cid = String(c || "");
        if (cid && cid !== id && children.indexOf(cid) === -1) children.push(cid);
      });
    }
    byId[id] = { id: id, children: children };
    ids.push(id);
  });
  var isGroup = {};
  ids.forEach(function (id) { isGroup[id] = true; });

  // One parent per node; drop unknown ids.
  var parentOf = {};
  ids.forEach(function (id) {
    byId[id].children = byId[id].children.filter(function (cid) {
      if (!leaves[cid] && !isGroup[cid]) return false;
      if (parentOf[cid]) return false;
      parentOf[cid] = id;
      return true;
    });
  });

  function isAncestor(ancestorId, nodeId) {
    var cur = parentOf[nodeId];
    var guard = 0;
    while (cur && guard++ <= ids.length) {
      if (cur === ancestorId) return true;
      cur = parentOf[cur];
    }
    return false;
  }
  ids.forEach(function (id) {
    byId[id].children = byId[id].children.filter(function (cid) {
      if (isGroup[cid] && isAncestor(cid, id)) {
        delete parentOf[cid];
        return false;
      }
      return true;
    });
  });

  // Dissolve wrappers with fewer than 2 children, repeatedly.
  var changed = true;
  while (changed) {
    changed = false;
    ids.forEach(function (id) {
      var g = byId[id];
      if (!g || !isGroup[id]) return;
      if (g.children.length >= 2) return;
      delete byId[id];
      isGroup[id] = false;
      var parentId = parentOf[id];
      var parent = parentId && isGroup[parentId] ? byId[parentId] : null;
      delete parentOf[id];
      if (parent) {
        parent.children = parent.children.filter(function (c) { return c !== id; });
      }
      g.children.forEach(function (cid) {
        delete parentOf[cid];
        if (parent) {
          parentOf[cid] = parent.id;
          parent.children.push(cid);
        }
      });
      changed = true;
    });
  }

  var out = [];
  ids.forEach(function (id) {
    if (isGroup[id] && byId[id]) out.push({ id: id, children: byId[id].children.slice() });
  });
  return out;
}

function sbLoadState() {
  var boards = null;
  try {
    boards = JSON.parse(localStorage.getItem(smdKey("boards")) || "null");
  } catch (e) {
    boards = null;
  }
  if (!Array.isArray(boards)) boards = [];
  sbState.boards = boards.map(sbNormalizeBoard).filter(Boolean);
  if (!sbState.boards.length) {
    sbState.boards.push({ id: sbUid(), name: "My Storyboard", background: "", items: [], connectors: [], groups: [] });
  }
  var savedActive = localStorage.getItem(smdKey("activeBoard")) || "";
  sbState.activeId = sbFindBoard(savedActive) ? savedActive : sbState.boards[0].id;
  sbState.pinned = localStorage.getItem(smdKey("toolbarPinned")) === "true";
  var savedZoom = localStorage.getItem(smdKey("zoom"));
  sbState.zoom = savedZoom == null ? 1 : sbNormalizeZoom(savedZoom);
  sbSaveState();
}

function sbSaveState() {
  if (sbState.saveTimer) {
    clearTimeout(sbState.saveTimer);
    sbState.saveTimer = null;
  }
  try {
    localStorage.setItem(smdKey("boards"), JSON.stringify(sbState.boards));
    localStorage.setItem(smdKey("activeBoard"), sbState.activeId);
    localStorage.setItem(smdKey("toolbarPinned"), sbState.pinned ? "true" : "false");
    localStorage.setItem(smdKey("zoom"), String(sbState.zoom));
  } catch (e) { /* storage unavailable: the board still works for this visit */ }
}

// Persist during a drag without writing on every pointermove.
function sbSaveSoon() {
  if (sbState.saveTimer) clearTimeout(sbState.saveTimer);
  sbState.saveTimer = setTimeout(function () {
    sbState.saveTimer = null;
    sbSaveState();
  }, 150);
}

function sbFindBoard(id) {
  for (var i = 0; i < sbState.boards.length; i++) {
    if (sbState.boards[i].id === id) return sbState.boards[i];
  }
  return null;
}

function sbActiveBoard() {
  var board = sbFindBoard(sbState.activeId);
  if (!board) {
    board = sbState.boards[0] || null;
    if (board) sbState.activeId = board.id;
  }
  return board;
}

function sbFindItem(id) {
  var board = sbActiveBoard();
  if (!board || !id) return null;
  for (var i = 0; i < board.items.length; i++) {
    if (board.items[i].id === id) return board.items[i];
  }
  return null;
}

function sbSelectedItem() {
  return sbFindItem(sbState.selectedId);
}

function sbMaxZ(board) {
  board = board || sbActiveBoard();
  var max = 0;
  if (board) board.items.forEach(function (it) { max = Math.max(max, Number(it.z) || 0); });
  return max;
}

// ---- Groups ----------------------------------------------------------------
//
// board.groups = [{ id, children: [leafId | groupId] }]. It is a FOREST over the
// flat item list, so rendering, connectors, export and z-order are unchanged;
// a group only adds selection/transform semantics. Helpers below are all
// board-scoped (they never reach across boards).

function sbGroups() {
  var board = sbActiveBoard();
  return board && Array.isArray(board.groups) ? board.groups : [];
}

function sbGroupById(id) {
  if (!id) return null;
  var groups = sbGroups();
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].id === id) return groups[i];
  }
  return null;
}

function sbParentGroupId(id) {
  if (!id) return "";
  var groups = sbGroups();
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].children.indexOf(id) !== -1) return groups[i].id;
  }
  return "";
}

// The OUTERMOST node containing this leaf/group (what a click selects).
function sbTopGroupId(id) {
  var cur = id || "";
  var guard = 0;
  while (cur && guard++ <= sbGroups().length + 1) {
    var parent = sbParentGroupId(cur);
    if (!parent) return cur;
    cur = parent;
  }
  return cur;
}

function sbGroupLeafIds(groupId, out) {
  out = out || [];
  var group = sbGroupById(groupId);
  if (!group) return out;
  group.children.forEach(function (cid) {
    if (sbFindItem(cid)) {
      if (out.indexOf(cid) === -1 && !sbGroupById(cid)) out.push(cid);
    } else if (sbGroupById(cid)) {
      sbGroupLeafIds(cid, out);
    }
  });
  return out;
}

function sbNodeLeafIds(nodeId) {
  if (sbFindItem(nodeId)) return [nodeId];
  return sbGroupLeafIds(nodeId, []);
}

function sbCollectGroupIds(groupId, out) {
  out = out || [];
  var group = sbGroupById(groupId);
  if (!group) return out;
  if (out.indexOf(group.id) === -1) out.push(group.id);
  group.children.forEach(function (cid) {
    if (sbGroupById(cid)) sbCollectGroupIds(cid, out);
  });
  return out;
}

// Wrap SELECTED top-level nodes in a new group. Returns the new group or null.
function sbCreateGroup(childIds) {
  var board = sbActiveBoard();
  if (!board) return null;
  var children = [];
  (childIds || []).forEach(function (id) {
    var cid = String(id || "");
    if (!cid || children.indexOf(cid) !== -1) return;
    if (!sbFindItem(cid) && !sbGroupById(cid)) return;
    if (sbParentGroupId(cid)) return;
    children.push(cid);
  });
  if (children.length < 2) return null;
  if (!Array.isArray(board.groups)) board.groups = [];
  var group = { id: sbUid(), children: children };
  board.groups.push(group);
  board.groups = sbNormalizeGroups(board, board.groups);
  var created = sbGroupById(group.id);
  if (created) sbSaveState();
  return created;
}

// Remove ONE level: the group's children take its place (inside its parent when
// it has one, otherwise they become top-level). Nested groups stay intact.
function sbDissolveGroup(id) {
  var board = sbActiveBoard();
  var group = sbGroupById(id);
  if (!board || !group) return [];
  var kids = group.children.slice();
  var parentId = sbParentGroupId(id);
  var parent = parentId ? sbGroupById(parentId) : null;
  if (parent) {
    var at = parent.children.indexOf(id);
    parent.children.splice(at, 1);
    kids.forEach(function (cid) { parent.children.push(cid); });
  }
  board.groups = board.groups.filter(function (g) { return g.id !== id; });
  board.groups = sbNormalizeGroups(board, board.groups);
  sbSaveState();
  return kids;
}

// Deep-copy one node (leaf or group subtree) for Duplicate. `counter.value`
// tracks the next z so every copied leaf lands above the originals.
function sbCloneNode(nodeId, board, counter, offset) {
  if (!board) return "";
  var item = sbFindItem(nodeId);
  if (item) {
    var copy = JSON.parse(JSON.stringify(item));
    copy.id = sbUid();
    copy.x = sbClamp(item.x + offset, 0, 100);
    copy.y = sbClamp(item.y + offset, 0, 100);
    copy.z = ++counter.value;
    board.items.push(copy);
    return copy.id;
  }
  var group = sbGroupById(nodeId);
  if (!group) return "";
  if (!Array.isArray(board.groups)) board.groups = [];
  var next = { id: sbUid(), children: [] };
  board.groups.push(next);
  group.children.forEach(function (cid) {
    var cloned = sbCloneNode(cid, board, counter, offset);
    if (cloned) next.children.push(cloned);
  });
  return next.id;
}

function sbUniqueBoardName() {
  var n = sbState.boards.length + 1;
  var names = {};
  sbState.boards.forEach(function (b) { names[b.name] = true; });
  var name = "Board " + n;
  while (names[name]) {
    n++;
    name = "Board " + n;
  }
  return name;
}

function sbAddBoard() {
  var board = { id: sbUid(), name: sbUniqueBoardName(), background: "", items: [], connectors: [], groups: [] };
  sbState.boards.push(board);
  sbState.activeId = board.id;
  sbState.selectedId = "";
  sbState.selectedIds = [];
  sbState.selectedConnectorId = "";
  sbState.connectFrom = "";
  sbState.editingTextId = "";
  sbSaveState();
  sbRender();
  sbRenderPanel();
  return board;
}

function sbDeleteBoard(id) {
  if (sbState.boards.length < 2) return false;
  var index = -1;
  for (var i = 0; i < sbState.boards.length; i++) {
    if (sbState.boards[i].id === id) index = i;
  }
  if (index < 0) return false;
  sbState.boards.splice(index, 1);
  if (sbState.activeId === id || !sbFindBoard(sbState.activeId)) {
    sbState.activeId = sbState.boards[Math.min(index, sbState.boards.length - 1)].id;
  }
  sbState.selectedId = "";
  sbState.selectedIds = [];
  sbState.selectedConnectorId = "";
  sbState.connectFrom = "";
  sbState.editingTextId = "";
  sbSaveState();
  sbRender();
  sbRenderPanel();
  return true;
}

function sbRenameBoard(id, name) {
  var board = sbFindBoard(id);
  if (!board) return;
  var trimmed = String(name || "").trim();
  if (!trimmed) return;
  board.name = trimmed;
  sbSaveState();
  sbRender();
  sbRenderPanel();
}

function sbSetActiveBoard(id) {
  if (!sbFindBoard(id) || id === sbState.activeId) return;
  sbState.activeId = id;
  sbState.selectedId = "";
  sbState.selectedIds = [];
  sbState.selectedConnectorId = "";
  sbState.connectFrom = "";
  sbState.editingTextId = "";
  sbSaveState();
  sbRender();
  sbRenderPanel();
}

function sbSetBackground(id) {
  var board = sbActiveBoard();
  if (!board) return;
  board.background = sbBackgroundById(id) ? id : "";
  sbSaveState();
  sbRender();
  sbRenderPanel();
}

function sbAddItem(raw) {
  var board = sbActiveBoard();
  if (!board) return null;
  var item = sbNormalizeItem(raw);
  if (!item) return null;
  item.z = sbMaxZ(board) + 1;
  board.items.push(item);
  sbState.selectedId = item.id;
  sbSaveState();
  return item;
}

function sbUpdateItem(id, patch) {
  var item = sbFindItem(id);
  if (!item) return null;
  Object.keys(patch || {}).forEach(function (key) {
    if (key === "id" || key === "type") return;
    item[key] = patch[key];
  });
  sbSaveSoon();
  return item;
}

function sbRemoveItem(id) {
  var board = sbActiveBoard();
  if (!board) return false;
  var before = board.items.length;
  board.items = board.items.filter(function (it) { return it.id !== id; });
  if (board.items.length === before) return false;
  // A connector needs BOTH ends: drop every link to/from the deleted box.
  if (Array.isArray(board.connectors)) {
    board.connectors = board.connectors.filter(function (c) {
      return c.from !== id && c.to !== id;
    });
  }
  // A group is only a wrapper: drop the leaf from it and dissolve a group that
  // is left with fewer than 2 children.
  if (Array.isArray(board.groups)) board.groups = sbNormalizeGroups(board, board.groups);
  if (sbState.selectedId === id) sbState.selectedId = "";
  sbState.selectedIds = (sbState.selectedIds || []).filter(function (x) { return x !== id; });
  if (sbState.editingTextId === id) sbState.editingTextId = "";
  if (sbState.connectFrom === id) sbState.connectFrom = "";
  if (sbState.selectedConnectorId && !sbFindConnector(sbState.selectedConnectorId)) {
    sbState.selectedConnectorId = "";
  }
  sbSaveState();
  return true;
}

// ---- Connectors ------------------------------------------------------------

function sbFindConnector(id) {
  var board = sbActiveBoard();
  if (!board || !Array.isArray(board.connectors) || !id) return null;
  for (var i = 0; i < board.connectors.length; i++) {
    if (board.connectors[i].id === id) return board.connectors[i];
  }
  return null;
}

function sbSelectedConnector() {
  return sbFindConnector(sbState.selectedConnectorId);
}

function sbConnectorBetween(from, to) {
  var board = sbActiveBoard();
  if (!board || !Array.isArray(board.connectors)) return null;
  for (var i = 0; i < board.connectors.length; i++) {
    var c = board.connectors[i];
    if ((c.from === from && c.to === to) || (c.from === to && c.to === from)) return c;
  }
  return null;
}

// Add a directional link from one text box to another. Returns the new (or the
// existing) connector. Only text-to-text links are allowed.
function sbAddConnector(from, to) {
  var board = sbActiveBoard();
  if (!board) return null;
  if (!from || !to || from === to) return null;
  var fromItem = sbFindItem(from);
  var toItem = sbFindItem(to);
  if (!fromItem || !toItem || fromItem.type !== "text" || toItem.type !== "text") return null;
  var existing = sbConnectorBetween(from, to);
  if (existing) {
    // The newly requested direction wins: connecting A -> B when B -> A already
    // exists flips the arrow instead of silently creating nothing.
    if (existing.from !== from) {
      existing.from = from;
      existing.to = to;
      sbSaveState();
    }
    return existing;
  }
  if (!Array.isArray(board.connectors)) board.connectors = [];
  var conn = { id: sbUid(), from: from, to: to };
  board.connectors.push(conn);
  sbSaveState();
  return conn;
}

function sbRemoveConnector(id) {
  var board = sbActiveBoard();
  if (!board || !Array.isArray(board.connectors)) return false;
  var before = board.connectors.length;
  board.connectors = board.connectors.filter(function (c) { return c.id !== id; });
  if (board.connectors.length === before) return false;
  if (sbState.selectedConnectorId === id) sbState.selectedConnectorId = "";
  sbSaveState();
  return true;
}

function sbReverseConnector(id) {
  var conn = sbFindConnector(id);
  if (!conn) return false;
  var from = conn.from;
  conn.from = conn.to;
  conn.to = from;
  sbSaveState();
  return true;
}

function sbDuplicateItem(id) {
  var source = sbFindItem(id);
  var board = sbActiveBoard();
  if (!source || !board) return null;
  var copy = JSON.parse(JSON.stringify(source));
  copy.id = sbUid();
  copy.x = sbClamp(source.x + 4, 2, 98);
  copy.y = sbClamp(source.y + 4, 2, 98);
  copy.z = sbMaxZ(board) + 1;
  board.items.push(copy);
  sbState.selectedId = copy.id;
  sbSaveState();
  sbRender();
  return copy;
}

function sbBringToFront(id) {
  var board = sbActiveBoard();
  var item = sbFindItem(id);
  if (!board || !item) return;
  item.z = sbMaxZ(board) + 1;
  sbSaveState();
  sbRender();
}

// Mirror a sticker's artwork. `axis` is "x" (horizontal mirror) or "y"
// (vertical). The flag lives on the item, so it survives reloads and copies.
function sbFlipItem(id, axis) {
  var item = sbFindItem(id);
  if (!item || item.type !== "sticker") return null;
  if (axis === "y") item.flipY = !item.flipY;
  else item.flipX = !item.flipX;
  sbSaveState();
  return item;
}

// ---- Colour / frame helpers ------------------------------------------------

// Resolve a stored colour token to a concrete CSS colour (needed when a token is
// baked into an SVG border image, which cannot inherit currentColor).
function sbResolveColor(token) {
  if (token === "white") return "#ffffff";
  if (token === "black") return "#000000";
  var vars = {
    auto: "--bs-body-color",
    body: "--bs-body-color",
    primary: "--bs-primary",
    secondary: "--bs-secondary",
    success: "--bs-success",
    danger: "--bs-danger",
    warning: "--bs-warning",
    info: "--bs-info",
    light: "--bs-light",
    dark: "--bs-dark"
  };
  var name = vars[token] || vars.auto;
  var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) value = getComputedStyle(document.body).color || "#111111";
  return value;
}

function sbTokenCss(token) {
  if (token === "transparent") return "transparent";
  if (token === "white") return "#ffffff";
  if (token === "black") return "#000000";
  if (token === "auto") return "var(--bs-body-color)";
  return "var(--bs-" + token + ")";
}

// 120x120 frame art used with `border-image` (slice 30). The stroke colour is
// substituted, so a text border follows the text colour on every theme.
function sbFrameDataUri(kind, color) {
  var c = String(color || "#111111").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  var body = "";
  if (kind === "fancy") {
    body =
      '<rect x="5" y="5" width="110" height="110" rx="12" fill="none" stroke="' + c + '" stroke-width="3.4"/>' +
      '<rect x="15" y="15" width="90" height="90" rx="8" fill="none" stroke="' + c + '" stroke-width="1.4" opacity="0.85"/>' +
      '<path d="M5 22c7-9 16-9 23 0M97 5c9 7 9 16 0 23M115 98c-7 9-16 9-23 0M23 115c-9-7-9-16 0-23" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M8 8l10 3-10 3zM112 8l-10 3 10 3zM8 112l10-3-10-3zM112 112l-10-3 10-3z" fill="' + c + '"/>';
  } else if (kind === "hand") {
    body =
      '<path d="M9 13c19-6 39 3 57-2 20-6 39 2 46 4 4 14-2 29 2 43 3 18-2 38 1 49-18 6-37-2-55 3-20 5-42-2-54 0-4-16 2-32-1-46-3-16 2-34 4-51z" fill="none" stroke="' + c + '" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M16 22c28-5 57 4 88-2M14 98c30 5 58-5 91 0" fill="none" stroke="' + c + '" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>' +
      '<path d="M20 8c2 8-3 16 0 24M101 89c-3 9 2 17-1 25" fill="none" stroke="' + c + '" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>';
  } else if (kind === "stamp") {
    body =
      '<rect x="9" y="9" width="102" height="102" rx="6" fill="none" stroke="' + c + '" stroke-width="7" stroke-dasharray="0.1 10" stroke-linecap="round"/>' +
      '<rect x="21" y="21" width="78" height="78" rx="2" fill="none" stroke="' + c + '" stroke-width="1.4" opacity="0.75"/>';
  } else {
    return "";
  }
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' + body + '</svg>';
  return "data:image/svg+xml," + encodeURIComponent(svg);
}
