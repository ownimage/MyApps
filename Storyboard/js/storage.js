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

// OneDrive stickers (the Stickers panel's Library/Board tabs) are not known at
// parse time: their bytes are downloaded on demand and cached, so they live in a
// RUNTIME registry keyed by `od:<hash>` (see js/sticker-library.js). A board item
// only stores that id plus the original file name, which keeps the story JSON
// small; the byte payloads travel in the story backup instead.
var SB_OD_STICKERS = {};

// Placeholder shown when a library sticker's bytes are not available yet (first
// paint before the download lands, or a backup opened on a device that has never
// seen it). A serialized SVG cannot read CSS variables, so this neutral grey is
// the one deliberate colour literal in the app: it has to read on a light AND a
// dark board.
var SB_STICKER_PLACEHOLDER = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">' +
  '<rect x="3" y="3" width="90" height="90" rx="12" fill="none" stroke="#8a8a8a" stroke-width="3" stroke-dasharray="9 7"/>' +
  '<path d="M34 34 L62 62 M62 34 L34 62" stroke="#8a8a8a" stroke-width="4" stroke-linecap="round"/>' +
  "</svg>"
);


// Story SIZE presets (px). A story owns its canvas size, so every scene in it
// shares the same shape. QHD matches the bundled backgrounds (2560x1440), so a
// story that never set a size looks exactly as it always did.
var SB_STORY_PRESETS = [
  { id: "hd", name: "HD (16:9) 1280×720", width: 1280, height: 720 },
  { id: "fhd", name: "Full HD (16:9) 1920×1080", width: 1920, height: 1080 },
  { id: "qhd", name: "QHD / 1440p (16:9) 2560×1440", width: 2560, height: 1440 },
  { id: "uwqhd", name: "UWQHD (21:9) 3440×1440", width: 3440, height: 1440 },
  { id: "uhd4k", name: "4K UHD (16:9) 3840×2160", width: 3840, height: 2160 }
];
var SB_STORY_DEFAULT_WIDTH = 2560;
var SB_STORY_DEFAULT_HEIGHT = 1440;
var SB_STORY_MIN_SIZE = 64;
var SB_STORY_MAX_SIZE = 8192;
// "fit" shows the WHOLE background (letterboxed over the board colour);
// "stretch" fills the story size, distorting when the ratios differ.
var SB_STORY_FITS = [
  { id: "fit", name: "Fit (whole image)" },
  { id: "stretch", name: "Stretch (fill the size)" }
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

// Runtime state (deliberately not persisted, except the Stories - each SCENE
// carries its own `view` {zoom, fx, fy} - plus the active story/scene and pin
// state). A Story owns an ordered list of Scenes; every Scene is the same
// "board" shape the canvas/render/export code already understands.
var sbState = {
  stories: [],
  activeStoryId: "",
  activeId: "",
  selectedId: "",
  selectedIds: [],
  selectedConnectorId: "",
  connectFrom: "",
  tool: "",
  pinned: false,
  zoom: 1,
  editingTextId: "",
  alignOpen: false,
  alignSig: "",
  drag: null,
  pointers: new Map(),
  panReady: false,
  pan: null,
  saveTimer: null,
  // Which story's properties form is open in the Stories panel ("" = none), and
  // whether the user picked "Other" (free width/height) rather than a preset.
  storyPropsId: "",
  storyPropsOther: false,
  // Stickers panel: the tab the user last picked and the story folder that tab
  // list was built for (see js/sticker-library.js).
  stickerTab: "standard"
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

// A board fraction: 0 = the board's left/top edge, 0.5 = centre, 1 = right/bottom.
// A panned view can sit slightly outside the artwork (over the pasteboard), so a
// small margin is allowed. Anything invalid falls back to "centred".
function sbNormalizeViewFraction(value) {
  var v = Number(value);
  if (!isFinite(v)) return 0.5;
  return Math.min(1.25, Math.max(-0.25, v));
}

function sbBackgroundById(id) {
  for (var i = 0; i < SB_BACKGROUNDS.length; i++) {
    if (SB_BACKGROUNDS[i].id === id) return SB_BACKGROUNDS[i];
  }
  return null;
}

function sbIsOdSticker(id) {
  return /^od:[a-z0-9]+$/i.test(String(id || ""));
}

// Register (or merge) one OneDrive sticker. Metadata arrives first from the
// folder listing (name/path) and later from the download (src/blob), so the
// registry is merged rather than replaced.
function sbRegisterOdSticker(meta) {
  if (!meta || !sbIsOdSticker(meta.id)) return null;
  var current = SB_OD_STICKERS[meta.id] || {};
  Object.keys(meta).forEach(function (key) {
    if (meta[key] !== undefined) current[key] = meta[key];
  });
  if (!current.src) current.src = SB_STICKER_PLACEHOLDER;
  SB_OD_STICKERS[meta.id] = current;
  return current;
}

// Every sticker goes through here: the built-in set first, then the OneDrive
// registry. An unknown `od:` id is registered with the placeholder so a board
// loaded before the library has been listed keeps its sticker instead of
// silently falling back to the first built-in one.
function sbStickerById(id) {
  for (var i = 0; i < SB_STICKERS.length; i++) {
    if (SB_STICKERS[i].id === id) return SB_STICKERS[i];
  }
  if (sbIsOdSticker(id)) {
    return SB_OD_STICKERS[id] || sbRegisterOdSticker({ id: id, name: "" });
  }
  return null;
}

// Image URL and caption for a sticker item (built-in asset, cached blob URL,
// restored data URL or the placeholder).
function sbStickerSrcFor(item) {
  var meta = item ? sbStickerById(item.sticker) : null;
  if (!meta) return SB_STICKERS[0].file;
  return meta.src || meta.file || SB_STICKER_PLACEHOLDER;
}

function sbStickerNameFor(item) {
  var meta = item ? sbStickerById(item.sticker) : null;
  return (meta && meta.name) || (item && item.stickerName) || "";
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
    // Kept for OneDrive stickers: the display name survives a reload (and a
    // story backup) before the library has listed the folder again.
    item.stickerName = raw.stickerName ? String(raw.stickerName) : "";
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

  // Every board carries its own view (zoom + the board point at the viewport
  // centre), so reopening the app restores the same place on the artwork. A
  // missing view means "fitted and centred", which is the old behaviour.
  var rawView = raw.view && typeof raw.view === "object" ? raw.view : null;
  board.view = {
    zoom: sbNormalizeZoom(rawView ? rawView.zoom : 1),
    fx: sbNormalizeViewFraction(rawView ? rawView.fx : 0.5),
    fy: sbNormalizeViewFraction(rawView ? rawView.fy : 0.5)
  };
  return board;
}

// ---- Stories and scenes -----------------------------------------------------
//
// A Story is { id, name, scenes: [scene], activeSceneId }. A SCENE is exactly
// the board shape above (background, items, connectors, groups, view), so every
// existing board-scoped render/edit/export helper keeps working unchanged:
// sbActiveBoard() simply returns the active scene of the active story.

function sbNewScene(name) {
  return {
    id: sbUid(),
    name: String(name || "Scene").trim() || "Scene",
    background: "",
    items: [],
    connectors: [],
    groups: [],
    view: { zoom: 1, fx: 0.5, fy: 0.5 }
  };
}

function sbNewStory(name, firstSceneName) {
  var scene = sbNewScene(firstSceneName || "Scene 1");
  return {
    id: sbUid(),
    name: String(name || "Story").trim() || "Story",
    scenes: [scene],
    activeSceneId: scene.id,
    width: SB_STORY_DEFAULT_WIDTH,
    height: SB_STORY_DEFAULT_HEIGHT,
    backgroundFit: "fit"
  };
}

function sbNormalizeStory(raw) {
  if (!raw || typeof raw !== "object") return null;
  var story = {
    id: String(raw.id || sbUid()),
    name: String(raw.name || "Story").trim() || "Story",
    scenes: [],
    activeSceneId: "",
    // Older stories have no size: QHD + Fit keeps their previous look.
    width: sbStorySizeValue(raw.width, SB_STORY_DEFAULT_WIDTH),
    height: sbStorySizeValue(raw.height, SB_STORY_DEFAULT_HEIGHT),
    backgroundFit: raw.backgroundFit === "stretch" ? "stretch" : "fit"
  };
  if (Array.isArray(raw.scenes)) {
    raw.scenes.forEach(function (sceneRaw) {
      var scene = sbNormalizeBoard(sceneRaw);
      if (scene) story.scenes.push(scene);
    });
  }
  if (!story.scenes.length) story.scenes.push(sbNewScene("Scene 1"));
  var active = String(raw.activeSceneId || "");
  story.activeSceneId = story.scenes.some(function (s) { return s.id === active; })
    ? active
    : story.scenes[0].id;
  return story;
}

// ---- story properties (size + background fit) -------------------------------
//
// The size belongs to the STORY (every scene is a slide of it) and is stored in
// "design px"; the board is fitted into the window and the JPG export uses the
// same numbers, so a portrait story is a portrait board.

function sbStorySizeValue(value, fallback) {
  var n = Math.round(Number(value));
  if (!isFinite(n)) return fallback;
  return Math.min(SB_STORY_MAX_SIZE, Math.max(SB_STORY_MIN_SIZE, n));
}

function sbStoryWidth(story) {
  return sbStorySizeValue(story && story.width, SB_STORY_DEFAULT_WIDTH);
}

function sbStoryHeight(story) {
  return sbStorySizeValue(story && story.height, SB_STORY_DEFAULT_HEIGHT);
}

function sbStoryFit(story) {
  return story && story.backgroundFit === "stretch" ? "stretch" : "fit";
}

function sbStoryPresetById(id) {
  for (var i = 0; i < SB_STORY_PRESETS.length; i++) {
    if (SB_STORY_PRESETS[i].id === id) return SB_STORY_PRESETS[i];
  }
  return null;
}

// The matching preset id, or "other" for a custom size (so the form can show the
// free width/height fields).
function sbStoryPresetId(story) {
  var width = sbStoryWidth(story);
  var height = sbStoryHeight(story);
  for (var i = 0; i < SB_STORY_PRESETS.length; i++) {
    if (SB_STORY_PRESETS[i].width === width && SB_STORY_PRESETS[i].height === height) {
      return SB_STORY_PRESETS[i].id;
    }
  }
  return "other";
}

// Apply a partial properties patch. Values are clamped, the story is saved and
// the board repaints at its new shape (the panel is rebuilt too, so the form and
// the preset select reflect what was applied).
function sbSetStoryProperties(id, patch) {
  var story = sbFindStory(id);
  if (!story || !patch) return null;
  if (patch.width != null) story.width = sbStorySizeValue(patch.width, sbStoryWidth(story));
  if (patch.height != null) story.height = sbStorySizeValue(patch.height, sbStoryHeight(story));
  if (patch.backgroundFit != null) {
    story.backgroundFit = patch.backgroundFit === "stretch" ? "stretch" : "fit";
  }
  sbSaveState();
  if (typeof sbRender === "function") sbRender();
  if (typeof sbRenderPanel === "function") sbRenderPanel();
  return story;
}

function sbFindStory(id) {
  for (var i = 0; i < sbState.stories.length; i++) {
    if (sbState.stories[i].id === id) return sbState.stories[i];
  }
  return null;
}

// The story that owns a scene (scene ids are unique across all stories).
function sbStoryForScene(sceneId) {
  for (var i = 0; i < sbState.stories.length; i++) {
    var scenes = sbState.stories[i].scenes || [];
    for (var j = 0; j < scenes.length; j++) {
      if (scenes[j].id === sceneId) return sbState.stories[i];
    }
  }
  return null;
}

function sbActiveStory() {
  var story = sbFindStory(sbState.activeStoryId);
  if (!story) {
    story = sbState.stories[0] || null;
    if (story) sbState.activeStoryId = story.id;
  }
  return story;
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
  var stories = null;
  try {
    stories = JSON.parse(localStorage.getItem(smdKey("stories")) || "null");
  } catch (e) {
    stories = null;
  }
  if (!Array.isArray(stories)) stories = [];
  sbState.stories = stories.map(sbNormalizeStory).filter(Boolean);
  if (!sbState.stories.length) {
    sbState.stories.push(sbNewStory("Story 1", "Scene 1"));
  }
  var savedStory = localStorage.getItem(smdKey("activeStory")) || "";
  var story = sbFindStory(savedStory) || sbState.stories[0];
  sbState.activeStoryId = story.id;
  var savedScene = localStorage.getItem(smdKey("activeScene")) || story.activeSceneId;
  var scene = null;
  for (var i = 0; i < story.scenes.length; i++) {
    if (story.scenes[i].id === savedScene) scene = story.scenes[i];
  }
  if (!scene) scene = story.scenes[0];
  story.activeSceneId = scene.id;
  sbState.activeId = scene.id;
  sbState.pinned = localStorage.getItem(smdKey("toolbarPinned")) === "true";
  // The zoom is part of each SCENE's own view; sbState.zoom mirrors the ACTIVE
  // scene so the layout/zoom code keeps working unchanged.
  sbState.zoom = scene.view ? scene.view.zoom : 1;
  sbSaveState();
}

function sbSaveState() {
  if (sbState.saveTimer) {
    clearTimeout(sbState.saveTimer);
    sbState.saveTimer = null;
  }
  var story = sbActiveStory();
  if (story && sbState.activeId) story.activeSceneId = sbState.activeId;
  try {
    localStorage.setItem(smdKey("stories"), JSON.stringify(sbState.stories));
    localStorage.setItem(smdKey("activeStory"), sbState.activeStoryId);
    localStorage.setItem(smdKey("activeScene"), sbState.activeId);
    localStorage.setItem(smdKey("toolbarPinned"), sbState.pinned ? "true" : "false");
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

// Scene lookup across every story (scene ids are globally unique).
function sbFindBoard(id) {
  for (var i = 0; i < sbState.stories.length; i++) {
    var scenes = sbState.stories[i].scenes || [];
    for (var j = 0; j < scenes.length; j++) {
      if (scenes[j].id === id) return scenes[j];
    }
  }
  return null;
}

function sbActiveBoard() {
  var story = sbActiveStory();
  if (!story) return null;
  var board = null;
  for (var i = 0; i < story.scenes.length; i++) {
    if (story.scenes[i].id === sbState.activeId) board = story.scenes[i];
  }
  if (!board) {
    for (var j = 0; j < story.scenes.length; j++) {
      if (story.scenes[j].id === story.activeSceneId) board = story.scenes[j];
    }
  }
  if (!board) board = story.scenes[0] || null;
  if (board) {
    sbState.activeId = board.id;
    story.activeSceneId = board.id;
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

function sbUniqueStoryName() {
  var n = sbState.stories.length + 1;
  var names = {};
  sbState.stories.forEach(function (s) { names[s.name] = true; });
  var name = "Story " + n;
  while (names[name]) {
    n++;
    name = "Story " + n;
  }
  return name;
}

function sbUniqueSceneName(story) {
  var scenes = (story && story.scenes) || [];
  var n = scenes.length + 1;
  var names = {};
  scenes.forEach(function (s) { names[s.name] = true; });
  var name = "Scene " + n;
  while (names[name]) {
    n++;
    name = "Scene " + n;
  }
  return name;
}

// Reset the runtime selection when the active scene/story changes.
function sbResetSceneSelection() {
  sbState.selectedId = "";
  sbState.selectedIds = [];
  sbState.selectedConnectorId = "";
  sbState.connectFrom = "";
  sbState.editingTextId = "";
}

function sbActivateScene(story, board) {
  sbState.activeStoryId = story.id;
  story.activeSceneId = board.id;
  sbState.activeId = board.id;
  sbState.zoom = board.view ? board.view.zoom : 1;
  sbResetSceneSelection();
  sbSaveState();
  sbRender();
  sbRenderPanel();
}

function sbAddStory() {
  // Keep the outgoing scene's current zoom/position before switching away.
  if (typeof sbCaptureView === "function") sbCaptureView();
  var story = sbNewStory(sbUniqueStoryName(), "Scene 1");
  sbState.stories.push(story);
  sbActivateScene(story, story.scenes[0]);
  return story;
}

function sbSetActiveStory(id) {
  var story = sbFindStory(id);
  if (!story) return;
  if (story.id === sbState.activeStoryId) {
    // Clicking the already-active story just makes sure its scenes are showing.
    sbRenderPanel();
    return;
  }
  if (typeof sbCaptureView === "function") sbCaptureView();
  var board = null;
  for (var i = 0; i < story.scenes.length; i++) {
    if (story.scenes[i].id === story.activeSceneId) board = story.scenes[i];
  }
  if (!board) board = story.scenes[0];
  sbActivateScene(story, board);
}

function sbRenameStory(id, name) {
  var story = sbFindStory(id);
  if (!story) return;
  var trimmed = String(name || "").trim();
  if (!trimmed) return;
  story.name = trimmed;
  sbSaveState();
  sbRender();
  sbRenderPanel();
}

function sbDeleteStory(id) {
  if (sbState.stories.length < 2) return false;
  var index = -1;
  for (var i = 0; i < sbState.stories.length; i++) {
    if (sbState.stories[i].id === id) index = i;
  }
  if (index < 0) return false;
  if (typeof sbCaptureView === "function") sbCaptureView();
  sbState.stories.splice(index, 1);
  if (sbState.activeStoryId === id || !sbFindStory(sbState.activeStoryId)) {
    var nextStory = sbState.stories[Math.min(index, sbState.stories.length - 1)];
    var nextBoard = nextStory.scenes[0];
    sbActivateScene(nextStory, nextBoard);
    return true;
  }
  sbSaveState();
  sbRenderPanel();
  return true;
}

// Scenes live inside the ACTIVE story's ordered list. "New scene" adds and
// switches to it; the story keeps its previous scene's activeSceneId otherwise.
function sbAddBoard() {
  return sbAddSceneToStory(sbState.activeStoryId);
}

function sbAddSceneToStory(storyId) {
  var story = sbFindStory(storyId) || sbActiveStory();
  if (!story) return null;
  if (typeof sbCaptureView === "function") sbCaptureView();
  var board = sbNewScene(sbUniqueSceneName(story));
  story.scenes.push(board);
  sbActivateScene(story, board);
  return board;
}

function sbDeleteBoard(id) {
  var story = sbStoryForScene(id);
  if (!story || story.scenes.length < 2) return false;
  var index = -1;
  for (var i = 0; i < story.scenes.length; i++) {
    if (story.scenes[i].id === id) index = i;
  }
  if (index < 0) return false;
  story.scenes.splice(index, 1);
  if (sbState.activeId === id || !sbFindBoard(sbState.activeId)) {
    var next = story.scenes[Math.min(index, story.scenes.length - 1)];
    sbState.activeStoryId = story.id;
    sbActivateScene(story, next);
    return true;
  }
  if (story.activeSceneId === id) story.activeSceneId = story.scenes[Math.min(index, story.scenes.length - 1)].id;
  sbSaveState();
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
  var story = sbStoryForScene(id);
  if (!story) return;
  // Snapshot the outgoing scene's zoom/position before the switch.
  if (typeof sbCaptureView === "function") sbCaptureView();
  sbActivateScene(story, sbFindBoard(id));
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
