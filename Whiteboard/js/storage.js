// Whiteboard — board + item storage.
//
// Every board is { id, name, background, items }. Items are either
//   sticker: { id, type:"sticker", sticker, x, y, scale, rotation, z }
//   text:    { id, type:"text", text, bg, color, border, x, y, scale, rotation, z }
// x/y are PERCENTAGES of the board so a board keeps its layout on any screen.
// All keys live under the app's `whiteboard_` prefix via smdKey().
//
// The whole app is classic scripts with globals, like every other app here:
// generated markup uses inline handlers and the shared settings code calls
// `renderMain()` / `applyImageSize()` when it needs to.

var WB_BACKGROUNDS = [
  { id: "space", name: "Space", file: "assets/backgrounds/space.svg" },
  { id: "underwater", name: "Underwater", file: "assets/backgrounds/underwater.svg" }
];

var WB_STICKERS = [
  { id: "mermaid", name: "Mermaid", file: "assets/stickers/mermaid.svg" },
  { id: "shark", name: "Shark", file: "assets/stickers/shark.svg" },
  { id: "seaweed", name: "Seaweed", file: "assets/stickers/seaweed.svg" },
  { id: "spaceman", name: "Spaceman", file: "assets/stickers/spaceman.svg" },
  { id: "spaceship", name: "Spaceship", file: "assets/stickers/spaceship.svg" }
];

var WB_TEXT_BORDERS = [
  { id: "none", name: "None" },
  { id: "fancy", name: "Fancy" },
  { id: "hand", name: "Hand-drawn" },
  { id: "stamp", name: "Stamp" }
];

var WB_BG_TOKENS = ["transparent", "white", "black", "primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];
var WB_TEXT_TOKENS = ["auto", "white", "black", "primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];

// Runtime state (deliberately not persisted, except boards/active/pinned).
var wbState = {
  boards: [],
  activeId: "",
  selectedId: "",
  tool: "",
  pinned: false,
  editingTextId: "",
  drag: null,
  pointers: new Map(),
  saveTimer: null
};

function wbUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function wbClamp(value, min, max) {
  value = Number(value);
  if (!isFinite(value)) value = min;
  return Math.min(max, Math.max(min, value));
}

function wbBackgroundById(id) {
  for (var i = 0; i < WB_BACKGROUNDS.length; i++) {
    if (WB_BACKGROUNDS[i].id === id) return WB_BACKGROUNDS[i];
  }
  return null;
}

function wbStickerById(id) {
  for (var i = 0; i < WB_STICKERS.length; i++) {
    if (WB_STICKERS[i].id === id) return WB_STICKERS[i];
  }
  return null;
}

function wbHasBorder(id) {
  return WB_TEXT_BORDERS.some(function (b) { return b.id === id; });
}

function wbNormalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  var type = raw.type === "text" ? "text" : "sticker";
  var item = {
    id: String(raw.id || wbUid()),
    type: type,
    x: wbClamp(raw.x, 2, 98),
    y: wbClamp(raw.y, 2, 98),
    scale: wbClamp(raw.scale, 0.2, 5),
    rotation: isFinite(Number(raw.rotation)) ? Number(raw.rotation) : 0,
    z: isFinite(Number(raw.z)) ? Number(raw.z) : 1
  };
  if (type === "sticker") {
    item.sticker = wbStickerById(raw.sticker) ? raw.sticker : WB_STICKERS[0].id;
  } else {
    item.text = String(raw.text == null ? "" : raw.text);
    item.bg = WB_BG_TOKENS.indexOf(raw.bg) >= 0 ? raw.bg : "transparent";
    item.color = WB_TEXT_TOKENS.indexOf(raw.color) >= 0 ? raw.color : "auto";
    item.border = wbHasBorder(raw.border) ? raw.border : "none";
  }
  return item;
}

function wbNormalizeBoard(raw) {
  if (!raw || typeof raw !== "object") return null;
  var board = {
    id: String(raw.id || wbUid()),
    name: String(raw.name || "Board").trim() || "Board",
    background: wbBackgroundById(raw.background) ? raw.background : "",
    items: []
  };
  if (Array.isArray(raw.items)) {
    raw.items.forEach(function (it) {
      var item = wbNormalizeItem(it);
      if (item) board.items.push(item);
    });
  }
  return board;
}

function wbLoadState() {
  var boards = null;
  try {
    boards = JSON.parse(localStorage.getItem(smdKey("boards")) || "null");
  } catch (e) {
    boards = null;
  }
  if (!Array.isArray(boards)) boards = [];
  wbState.boards = boards.map(wbNormalizeBoard).filter(Boolean);
  if (!wbState.boards.length) {
    wbState.boards.push({ id: wbUid(), name: "My Whiteboard", background: "", items: [] });
  }
  var savedActive = localStorage.getItem(smdKey("activeBoard")) || "";
  wbState.activeId = wbFindBoard(savedActive) ? savedActive : wbState.boards[0].id;
  wbState.pinned = localStorage.getItem(smdKey("toolbarPinned")) === "true";
  wbSaveState();
}

function wbSaveState() {
  if (wbState.saveTimer) {
    clearTimeout(wbState.saveTimer);
    wbState.saveTimer = null;
  }
  try {
    localStorage.setItem(smdKey("boards"), JSON.stringify(wbState.boards));
    localStorage.setItem(smdKey("activeBoard"), wbState.activeId);
    localStorage.setItem(smdKey("toolbarPinned"), wbState.pinned ? "true" : "false");
  } catch (e) { /* storage unavailable: the board still works for this visit */ }
}

// Persist during a drag without writing on every pointermove.
function wbSaveSoon() {
  if (wbState.saveTimer) clearTimeout(wbState.saveTimer);
  wbState.saveTimer = setTimeout(function () {
    wbState.saveTimer = null;
    wbSaveState();
  }, 150);
}

function wbFindBoard(id) {
  for (var i = 0; i < wbState.boards.length; i++) {
    if (wbState.boards[i].id === id) return wbState.boards[i];
  }
  return null;
}

function wbActiveBoard() {
  var board = wbFindBoard(wbState.activeId);
  if (!board) {
    board = wbState.boards[0] || null;
    if (board) wbState.activeId = board.id;
  }
  return board;
}

function wbFindItem(id) {
  var board = wbActiveBoard();
  if (!board || !id) return null;
  for (var i = 0; i < board.items.length; i++) {
    if (board.items[i].id === id) return board.items[i];
  }
  return null;
}

function wbSelectedItem() {
  return wbFindItem(wbState.selectedId);
}

function wbMaxZ(board) {
  board = board || wbActiveBoard();
  var max = 0;
  if (board) board.items.forEach(function (it) { max = Math.max(max, Number(it.z) || 0); });
  return max;
}

function wbUniqueBoardName() {
  var n = wbState.boards.length + 1;
  var names = {};
  wbState.boards.forEach(function (b) { names[b.name] = true; });
  var name = "Board " + n;
  while (names[name]) {
    n++;
    name = "Board " + n;
  }
  return name;
}

function wbAddBoard() {
  var board = { id: wbUid(), name: wbUniqueBoardName(), background: "", items: [] };
  wbState.boards.push(board);
  wbState.activeId = board.id;
  wbState.selectedId = "";
  wbState.editingTextId = "";
  wbSaveState();
  wbRender();
  wbRenderPanel();
  return board;
}

function wbDeleteBoard(id) {
  if (wbState.boards.length < 2) return false;
  var index = -1;
  for (var i = 0; i < wbState.boards.length; i++) {
    if (wbState.boards[i].id === id) index = i;
  }
  if (index < 0) return false;
  wbState.boards.splice(index, 1);
  if (wbState.activeId === id || !wbFindBoard(wbState.activeId)) {
    wbState.activeId = wbState.boards[Math.min(index, wbState.boards.length - 1)].id;
  }
  wbState.selectedId = "";
  wbState.editingTextId = "";
  wbSaveState();
  wbRender();
  wbRenderPanel();
  return true;
}

function wbRenameBoard(id, name) {
  var board = wbFindBoard(id);
  if (!board) return;
  var trimmed = String(name || "").trim();
  if (!trimmed) return;
  board.name = trimmed;
  wbSaveState();
  wbRender();
  wbRenderPanel();
}

function wbSetActiveBoard(id) {
  if (!wbFindBoard(id) || id === wbState.activeId) return;
  wbState.activeId = id;
  wbState.selectedId = "";
  wbState.editingTextId = "";
  wbSaveState();
  wbRender();
  wbRenderPanel();
}

function wbSetBackground(id) {
  var board = wbActiveBoard();
  if (!board) return;
  board.background = wbBackgroundById(id) ? id : "";
  wbSaveState();
  wbRender();
  wbRenderPanel();
}

function wbAddItem(raw) {
  var board = wbActiveBoard();
  if (!board) return null;
  var item = wbNormalizeItem(raw);
  if (!item) return null;
  item.z = wbMaxZ(board) + 1;
  board.items.push(item);
  wbState.selectedId = item.id;
  wbSaveState();
  return item;
}

function wbUpdateItem(id, patch) {
  var item = wbFindItem(id);
  if (!item) return null;
  Object.keys(patch || {}).forEach(function (key) {
    if (key === "id" || key === "type") return;
    item[key] = patch[key];
  });
  wbSaveSoon();
  return item;
}

function wbRemoveItem(id) {
  var board = wbActiveBoard();
  if (!board) return false;
  var before = board.items.length;
  board.items = board.items.filter(function (it) { return it.id !== id; });
  if (board.items.length === before) return false;
  if (wbState.selectedId === id) wbState.selectedId = "";
  if (wbState.editingTextId === id) wbState.editingTextId = "";
  wbSaveState();
  return true;
}

function wbDuplicateItem(id) {
  var source = wbFindItem(id);
  var board = wbActiveBoard();
  if (!source || !board) return null;
  var copy = JSON.parse(JSON.stringify(source));
  copy.id = wbUid();
  copy.x = wbClamp(source.x + 4, 2, 98);
  copy.y = wbClamp(source.y + 4, 2, 98);
  copy.z = wbMaxZ(board) + 1;
  board.items.push(copy);
  wbState.selectedId = copy.id;
  wbSaveState();
  wbRender();
  return copy;
}

function wbBringToFront(id) {
  var board = wbActiveBoard();
  var item = wbFindItem(id);
  if (!board || !item) return;
  item.z = wbMaxZ(board) + 1;
  wbSaveState();
  wbRender();
}

// ---- Colour / frame helpers ------------------------------------------------

// Resolve a stored colour token to a concrete CSS colour (needed when a token is
// baked into an SVG border image, which cannot inherit currentColor).
function wbResolveColor(token) {
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

function wbTokenCss(token) {
  if (token === "transparent") return "transparent";
  if (token === "white") return "#ffffff";
  if (token === "black") return "#000000";
  if (token === "auto") return "var(--bs-body-color)";
  return "var(--bs-" + token + ")";
}

// 120x120 frame art used with `border-image` (slice 30). The stroke colour is
// substituted, so a text border follows the text colour on every theme.
function wbFrameDataUri(kind, color) {
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
