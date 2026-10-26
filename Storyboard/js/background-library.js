// Storyboard - OneDrive BACKGROUND libraries for the Background fly-out.
//
// Mirrors js/sticker-library.js (same folder rules, cache/offline behaviour and
// eTag change detection) with two differences that matter for large artwork:
//   * the GRID uses small Graph thumbnails (/thumbnails/0/medium/content), so a
//     folder of 2-8 MB backgrounds costs a few hundred KB to browse;
//   * the FULL image is downloaded only when a background is chosen (or when a
//     scene that already uses one is opened).
//
// Folders (relative to the app's OneDrive Directory, e.g. MyApps/Storyboard):
//   <Directory>/Backgrounds                    <- the "Library" tab
//   <Directory>/<story name>/Backgrounds       <- the story's own "Board" tab
// A folder that does not exist (Graph 404) hides its tab; OneDrive off/signed out
// keeps the old single grid (None / Space / Underwater).
//
// A scene stores ONLY `background: "od:<hash>"`. The bytes live in Cache Storage
// (`myapps-backgrounds`, keys /sb-bg/<id> and /sb-bg-thumb/<id>) and are embedded
// in the MinIO / OneDrive story backup (`backgrounds: { "<id>": {...dataUrl} }`,
// one entry per background however many scenes use it).

var SB_BG_CACHE = "myapps-backgrounds";
var SB_BG_FOLDER_NAME = "Backgrounds";
var SB_BG_IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
var SB_BG_THUMB_LIMIT = 3;
var SB_BG_LIST_GUARD_MS = 5000;
// A change on the drive is picked up at boot and when the window regains focus.
// `var` on purpose: a test can zero it.
var SB_BG_FOCUS_GUARD_MS = 15000;
var SB_BG_INDEX_LIMIT = 300;

var sbBgLib = {
  items: { library: [], board: [] },
  exists: { library: false, board: false },
  loaded: { library: false, board: false },
  paths: { library: "", board: "" },
  errors: { library: null, board: null },
  lastRefresh: 0,
  lastFocusRefresh: 0,
  pending: { library: null, board: null },
  downloading: {},
  thumbing: {},
  generation: {},
  refreshBound: false,
  storySig: ""
};

// ---- ids, names, paths -----------------------------------------------------

function sbBgHash(value) {
  var text = String(value == null ? "" : value);
  var h1 = 0x811c9dc5;
  var h2 = 0x01000193;
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    h1 ^= code;
    h1 = (h1 + ((h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24))) >>> 0;
    h2 = (h2 ^ code) >>> 0;
    h2 = Math.imul(h2, 16777619) >>> 0;
  }
  return ("00000000" + h1.toString(16)).slice(-8) + ("00000000" + h2.toString(16)).slice(-8);
}

function sbBgDisplayName(fileName) {
  var name = String(fileName == null ? "" : fileName).trim();
  var dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function sbBgStoryDir() {
  var story = typeof sbActiveStory === "function" ? sbActiveStory() : null;
  var name = story ? story.name : "";
  return typeof sbMinioStoryDirName === "function" ? sbMinioStoryDirName(name) : "story";
}

function sbBgFolderPath(which) {
  var directory = typeof getOneDriveConfig === "function" ? getOneDriveConfig().directory : "";
  if (which === "board") {
    return oneDriveJoinPath(directory, sbBgStoryDir(), SB_BG_FOLDER_NAME);
  }
  return oneDriveJoinPath(directory, SB_BG_FOLDER_NAME);
}

function sbBgLibraryEnabled() {
  if (typeof getOneDriveConfig !== "function") return false;
  var config = getOneDriveConfig();
  return !!(config.enabled && config.account);
}

function sbBgSyncPaths() {
  ["library", "board"].forEach(function (which) {
    var path = sbBgFolderPath(which);
    if (sbBgLib.paths[which] === path) return;
    sbBgLib.paths[which] = path;
    sbBgLib.items[which] = [];
    sbBgLib.exists[which] = false;
    sbBgLib.loaded[which] = false;
    sbBgHydrateFromIndex(which);
  });
}

// ---- listing index (persisted, so tabs + tiles survive offline) -------------

function sbBgIndexAll() {
  try {
    var raw = JSON.parse(localStorage.getItem(smdKey("odBgIndex")) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch (e) {
    return {};
  }
}

function sbBgIndexGet(path) {
  var entry = sbBgIndexAll()[path];
  return entry && Array.isArray(entry.files) ? entry.files : null;
}

function sbBgIndexPut(path, files) {
  var all = sbBgIndexAll();
  if (files && files.length) {
    all[path] = { updatedAt: Date.now(), files: files.slice(0, SB_BG_INDEX_LIMIT) };
  } else {
    delete all[path];
  }
  try {
    localStorage.setItem(smdKey("odBgIndex"), JSON.stringify(all));
  } catch (e) { /* quota: the cache still works, tabs just need the network */ }
}

function sbBgHydrateFromIndex(which) {
  if (sbBgLib.loaded[which] || (sbBgLib.items[which] || []).length) return;
  var path = sbBgLib.paths[which] || sbBgFolderPath(which);
  var files = sbBgIndexGet(path);
  if (!files) return;
  sbBgLib.items[which] = files;
  sbBgLib.exists[which] = true;
  files.forEach(function (meta) { sbRegisterOdBackground(meta); });
}

function sbBgFolderAvailable(which) {
  if (sbBgLib.exists[which]) return true;
  return !!sbBgIndexGet(sbBgLib.paths[which] || sbBgFolderPath(which));
}

// [] means "no tab UI at all" (OneDrive off/signed out, or neither folder exists).
function sbBgTabs() {
  sbBgSyncPaths();
  if (!sbBgLibraryEnabled()) return [];
  var tabs = [{ id: "standard", title: "Standard" }];
  if (sbBgFolderAvailable("library")) tabs.push({ id: "library", title: "Library" });
  if (sbBgFolderAvailable("board")) tabs.push({ id: "board", title: "Board" });
  return tabs.length > 1 ? tabs : [];
}

// ---- listing + change detection -------------------------------------------

function sbBgMetaFromFile(which, folderPath, file) {
  var fileName = String((file && file.name) || "");
  var key = String((file && file.id) || oneDriveJoinPath(folderPath, fileName));
  return {
    id: "od:" + sbBgHash(key),
    name: sbBgDisplayName(fileName),
    fileName: fileName,
    path: (file && file.key) || oneDriveJoinPath(folderPath, fileName),
    source: which,
    size: (file && file.size) || 0,
    etag: (file && file.eTag) || "",
    lastModified: (file && file.lastModified) || ""
  };
}

function sbBgFileChanged(previous, next) {
  if (!previous || !next) return false;
  if (previous.etag && next.etag) {
    return previous.etag !== next.etag || (previous.size || 0) !== (next.size || 0);
  }
  var before = String(previous.lastModified || "") + "|" + (previous.size || 0);
  var after = String(next.lastModified || "") + "|" + (next.size || 0);
  if (before === "|0" || after === "|0") return false;
  return before !== after;
}

// The file changed on the drive: forget BOTH cached renditions (full + thumbnail)
// and mark the entry stale. The old artwork stays on the board until the fresh
// full image lands, so there is no blank flash (and an offline refresh keeps it).
function sbBgInvalidate(ids) {
  if (!ids || !ids.length) return Promise.resolve();
  ids.forEach(function (id) {
    sbBgLib.generation[id] = (sbBgLib.generation[id] || 0) + 1;
    var meta = SB_OD_BACKGROUNDS[id];
    if (meta) {
      meta.stale = true;
      delete meta.thumbBlob;
      delete meta.thumbUrl;
      delete meta.thumbSrc;
    }
  });
  sbBgLib.storySig = "";
  return sbBgCacheOpen().then(function (cache) {
    if (!cache) return null;
    return Promise.all(ids.map(function (id) {
      return Promise.all([
        cache.delete(sbBgCacheKey(id, "full")).catch(function () { return false; }),
        cache.delete(sbBgCacheKey(id, "thumb")).catch(function () { return false; })
      ]);
    }));
  }).catch(function () { return null; });
}

function sbBgRefreshFolder(which) {
  var path = sbBgLib.paths[which] || sbBgFolderPath(which);
  return oneDriveListFolder(path).then(function (list) {
    var files = ((list && list.files) || [])
      .filter(function (file) { return SB_BG_IMAGE_RE.test(String((file && file.name) || "")); })
      .map(function (file) { return sbBgMetaFromFile(which, path, file); });

    var previous = {};
    (sbBgIndexGet(path) || []).forEach(function (meta) {
      if (meta && meta.id) previous[meta.id] = meta;
    });
    var changed = [];
    files.forEach(function (meta) {
      if (sbBgFileChanged(previous[meta.id], meta)) changed.push(meta.id);
    });

    sbBgLib.items[which] = files;
    sbBgLib.exists[which] = true;
    sbBgLib.loaded[which] = true;
    sbBgLib.errors[which] = null;
    sbBgIndexPut(path, files);
    files.forEach(function (meta) { sbRegisterOdBackground(meta); });

    if (!changed.length) return true;
    return sbBgInvalidate(changed).then(function () {
      sbBgEnsureStoryBackground();
      return true;
    });
  }).catch(function (err) {
    if (err && err.status === 404) {
      var wasListed = sbBgLib.exists[which];
      sbBgLib.items[which] = [];
      sbBgLib.exists[which] = false;
      sbBgLib.loaded[which] = true;
      sbBgLib.errors[which] = null;
      sbBgIndexPut(path, null);
      return wasListed;
    }
    sbBgLib.errors[which] = {
      message: typeof sbStickerListErrorMessage === "function"
        ? sbStickerListErrorMessage(err)
        : String((err && err.message) || err),
      signIn: !!(err && err.code === "sign_in_required"),
      at: Date.now()
    };
    return false;
  });
}

function sbBgRefreshFolders(force) {
  sbBgSyncPaths();
  if (!sbBgLibraryEnabled()) return Promise.resolve(false);
  var now = Date.now();
  if (!force && sbBgLib.lastRefresh && now - sbBgLib.lastRefresh < SB_BG_LIST_GUARD_MS) {
    return Promise.resolve(false);
  }
  var changed = false;
  return Promise.all(["library", "board"].map(function (which) {
    return sbBgRefreshFolder(which).then(function (result) {
      if (result) changed = true;
    });
  })).then(function () {
    sbBgLib.lastRefresh = Date.now();
    return changed;
  }).catch(function () { return changed; });
}

// ---- Cache Storage (full images + thumbnails) ------------------------------

function sbBgCacheKey(id, kind) {
  var base = String(id).replace(/^od:/, "");
  return location.origin + (kind === "thumb" ? "/sb-bg-thumb/" : "/sb-bg/") + base;
}

function sbBgCacheOpen() {
  if (typeof caches === "undefined" || !caches.open) return Promise.resolve(null);
  return caches.open(SB_BG_CACHE).catch(function () { return null; });
}

function sbBgBlobToDataUrl(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(String(reader.result || "")); };
    reader.onerror = function () { reject(reader.error || new Error("read failed")); };
    reader.readAsDataURL(blob);
  });
}

function sbBgCacheReadOne(id, kind) {
  var generation = sbBgLib.generation[id] || 0;
  function stale() { return (sbBgLib.generation[id] || 0) !== generation; }
  return sbBgCacheOpen().then(function (cache) {
    if (!cache) return null;
    return cache.match(sbBgCacheKey(id, kind)).then(function (response) {
      if (!response || stale()) return null;
      return response.blob().then(function (blob) {
        if (stale()) return null;
        if (kind === "thumb") sbBgApplyThumb(id, blob);
        else sbBgApplyFull(id, blob);
        return blob;
      });
    });
  }).catch(function () { return null; });
}

function sbBgCacheWrite(id, kind, blob) {
  return sbBgCacheOpen().then(function (cache) {
    if (!cache) return null;
    return cache.put(sbBgCacheKey(id, kind), new Response(blob, {
      headers: { "Content-Type": blob.type || "image/png" }
    })).catch(function () { return null; });
  });
}

function sbBgCacheWriteDataUrl(id, dataUrl) {
  if (!dataUrl) return Promise.resolve();
  return fetch(dataUrl).then(function (response) { return response.blob(); })
    .then(function (blob) { return sbBgCacheWrite(id, "full", blob); })
    .catch(function () { return null; });
}

// ---- downloads -------------------------------------------------------------

function sbBgApplyFull(id, blob) {
  var meta = sbRegisterOdBackground({ id: id });
  if (!meta) return;
  meta.blob = blob;
  delete meta.dataUrl;
  if (meta.objectUrl) {
    try { URL.revokeObjectURL(meta.objectUrl); } catch (e) { /* ignore */ }
  }
  try {
    meta.objectUrl = URL.createObjectURL(blob);
    meta.src = meta.objectUrl;
  } catch (e) { /* no createObjectURL: the thumbnail stays */ }
  sbBgOnResolved(id);
}

function sbBgApplyThumb(id, blob) {
  var meta = sbRegisterOdBackground({ id: id });
  if (!meta) return;
  meta.thumbBlob = blob;
  if (meta.thumbUrl) {
    try { URL.revokeObjectURL(meta.thumbUrl); } catch (e) { /* ignore */ }
  }
  try {
    meta.thumbUrl = URL.createObjectURL(blob);
    meta.thumbSrc = meta.thumbUrl;
  } catch (e) { /* ignore */ }
  sbBgOnThumbResolved(id);
}

function sbBgDownloadThumb(meta) {
  var registered = SB_OD_BACKGROUNDS[meta.id];
  if (registered && (registered.thumbBlob || (registered.thumbSrc && registered.thumbSrc.indexOf("data:") === 0))) {
    return Promise.resolve();
  }
  if (typeof oneDriveDownloadThumbnail !== "function") return Promise.resolve();
  if (sbBgLib.thumbing[meta.id]) return sbBgLib.thumbing[meta.id];
  var generation = sbBgLib.generation[meta.id] || 0;
  var task = Promise.resolve().then(function () {
    return oneDriveDownloadThumbnail(meta.path);
  }).then(function (blob) {
    if (!blob) return null;
    if ((sbBgLib.generation[meta.id] || 0) !== generation) return null;
    sbBgApplyThumb(meta.id, blob);
    return sbBgCacheWrite(meta.id, "thumb", blob);
  }).catch(function () { return null; });
  sbBgLib.thumbing[meta.id] = task;
  task.then(function () { delete sbBgLib.thumbing[meta.id]; });
  return task;
}

function sbBgDownloadFull(meta) {
  var registered = SB_OD_BACKGROUNDS[meta.id];
  if (registered && (registered.blob || (registered.src && registered.src.indexOf("data:") === 0)) && !registered.stale) {
    return Promise.resolve();
  }
  if (typeof oneDriveDownloadBlob !== "function") return Promise.resolve();
  if (sbBgLib.downloading[meta.id]) return sbBgLib.downloading[meta.id];
  var generation = sbBgLib.generation[meta.id] || 0;
  var task = Promise.resolve().then(function () {
    return oneDriveDownloadBlob(meta.path);
  }).then(function (blob) {
    if (!blob) return null;
    if ((sbBgLib.generation[meta.id] || 0) !== generation) return null;
    var current = SB_OD_BACKGROUNDS[meta.id];
    if (current) delete current.stale;
    sbBgApplyFull(meta.id, blob);
    return sbBgCacheWrite(meta.id, "full", blob);
  }).catch(function () { return null; });
  sbBgLib.downloading[meta.id] = task;
  task.then(function () { delete sbBgLib.downloading[meta.id]; });
  return task;
}

function sbBgRunQueue(list, limit, worker) {
  var index = 0;
  var workers = [];
  var count = Math.min(Math.max(1, limit), list.length);
  for (var i = 0; i < count; i++) {
    workers.push((function loop() {
      if (index >= list.length) return Promise.resolve();
      var item = list[index++];
      var result;
      try { result = worker(item); } catch (e) { result = null; }
      return Promise.resolve(result).then(loop, loop);
    })());
  }
  return Promise.all(workers);
}

// Thumbnails for one folder (the visible tab only).
function sbBgEnsureThumbs(which) {
  if (!sbBgLibraryEnabled()) return Promise.resolve();
  if (which !== "library" && which !== "board") return Promise.resolve();
  if (sbBgLib.pending[which]) return sbBgLib.pending[which];
  var items = (sbBgLib.items[which] || []).slice();
  if (!items.length) return Promise.resolve();

  var task = Promise.all(items.map(function (meta) {
    var registered = SB_OD_BACKGROUNDS[meta.id];
    if (registered && registered.thumbBlob) return null;
    return sbBgCacheReadOne(meta.id, "thumb");
  })).then(function () {
    var missing = items.filter(function (meta) {
      var registered = SB_OD_BACKGROUNDS[meta.id];
      return !registered || (!registered.thumbBlob && !(registered.thumbSrc && registered.thumbSrc.indexOf("data:") === 0));
    });
    if (!missing.length) return null;
    return sbBgRunQueue(missing, SB_BG_THUMB_LIMIT, sbBgDownloadThumb);
  }).catch(function () { return null; }).then(function (result) {
    sbBgLib.pending[which] = null;
    return result;
  });

  sbBgLib.pending[which] = task;
  return task;
}

function sbBgMetaForId(id) {
  var found = null;
  ["library", "board"].forEach(function (which) {
    (sbBgLib.items[which] || []).forEach(function (meta) {
      if (!found && meta.id === id) found = meta;
    });
  });
  return found;
}

// The full painting: from the cache first (offline-safe), then the network.
function sbBgEnsureFull(id) {
  if (!sbIsOdBackground(id)) return Promise.resolve();
  sbBgSyncPaths();
  sbBgHydrateFromIndex("library");
  sbBgHydrateFromIndex("board");
  var registered = SB_OD_BACKGROUNDS[id];
  if (registered && registered.blob && !registered.stale) return Promise.resolve();
  var meta = sbBgMetaForId(id) || { id: id, path: (registered && registered.path) || "" };
  if (!meta.path) return Promise.resolve();
  return sbBgCacheReadOne(id, "full").then(function (blob) {
    if (blob) return null;
    if (!sbBgLibraryEnabled()) return null;
    return sbBgDownloadFull(meta);
  }).catch(function () { return null; });
}

// A scene's OneDrive background may have no bytes yet after a reload: resolve it
// from the cache, then the network. Guarded by the id so a render is a no-op.
function sbBgEnsureStoryBackground(force) {
  var board = typeof sbActiveBoard === "function" ? sbActiveBoard() : null;
  var id = board && board.background ? board.background : "";
  if (!force && id === sbBgLib.storySig) return Promise.resolve();
  sbBgLib.storySig = id;
  if (!sbIsOdBackground(id)) return Promise.resolve();
  return sbBgEnsureFull(id);
}

function sbBgOnThumbResolved(id) {
  var meta = SB_OD_BACKGROUNDS[id] || {};
  if (!meta.thumbSrc) return;
  var tiles = document.querySelectorAll('#sbPanelBody .sb-bg-option[data-bg="' + id + '"] img');
  for (var i = 0; i < tiles.length; i++) {
    if (tiles[i].getAttribute("src") !== meta.thumbSrc) tiles[i].src = meta.thumbSrc;
  }
}

function sbBgOnResolved(id) {
  var board = typeof sbActiveBoard === "function" ? sbActiveBoard() : null;
  if (!board || board.background !== id) return;
  var src = typeof sbBackgroundSrcFor === "function" ? sbBackgroundSrcFor(id) : "";
  var el = document.getElementById("sbBackground");
  if (el && src) el.style.backgroundImage = 'url("' + src + '")';
}

// ---- panel data / status ---------------------------------------------------

// Tiles for one tab: `bg` is what sbSetBackground() receives.
function sbBgPanelTiles(which) {
  return (sbBgLib.items[which] || []).map(function (meta) {
    var registered = SB_OD_BACKGROUNDS[meta.id] || {};
    return {
      id: meta.id,
      name: meta.name,
      img: registered.thumbSrc || registered.src || SB_STICKER_PLACEHOLDER
    };
  });
}

function sbBgStatusNote() {
  if (typeof getOneDriveConfig !== "function") return "";
  var config = getOneDriveConfig();
  if (!config.enabled) return "";
  if (!config.account) {
    return "OneDrive is enabled but no account is signed in, so the background libraries are hidden. " +
      "Sign in from Settings > FileSync > OneDrive.";
  }
  var reasons = [];
  ["library", "board"].forEach(function (which) {
    var error = sbBgLib.errors[which];
    if (!error || !error.message) return;
    reasons.push((which === "library" ? "Library" : "Board") + ": " + error.message);
  });
  if (!reasons.length) return "";
  var libraryPath = sbBgLib.paths.library || sbBgFolderPath("library");
  var boardPath = sbBgLib.paths.board || sbBgFolderPath("board");
  return "OneDrive is enabled, but the background folders could not be read. " +
    reasons.join(" ") + " Tried " + libraryPath + " and " + boardPath + ".";
}

function sbBgStatusKind() {
  if (typeof getOneDriveConfig !== "function") return "";
  var config = getOneDriveConfig();
  if (!config.enabled) return "";
  if (!config.account) return "signin";
  var any = false;
  var signIn = false;
  ["library", "board"].forEach(function (which) {
    var error = sbBgLib.errors[which];
    if (!error) return;
    any = true;
    if (error.signIn) signIn = true;
  });
  if (signIn) return "signin";
  return any ? "error" : "";
}

function sbBgPanelSignature() {
  var tabs = sbBgTabs().map(function (tab) { return tab.id; }).join(",");
  return tabs + "|" + sbBgStatusNote();
}

function sbBgRetry() {
  sbBgLib.lastRefresh = 0;
  sbBgLib.lastFocusRefresh = 0;
  sbBgLib.errors = { library: null, board: null };
  return sbBgRefreshFolders(true).then(function () {
    if (sbState.tool === "background" && typeof sbRenderBackgroundPanel === "function") {
      sbRenderBackgroundPanel(true);
    }
  }).catch(function () { return null; });
}

function sbBgSignIn() {
  if (typeof signInToOneDrive !== "function") return Promise.resolve(null);
  return Promise.resolve().then(function () {
    return signInToOneDrive({ silent: true });
  }).then(function (name) {
    if (!name) return null;
    return sbBgRetry().then(function () { return name; });
  }).catch(function () { return null; });
}

// ---- refresh triggers ------------------------------------------------------

function sbBgHasContent() {
  if (sbState.tool === "background") return true;
  var board = typeof sbActiveBoard === "function" ? sbActiveBoard() : null;
  return !!(board && sbIsOdBackground(board.background));
}

function sbBgRefreshOnDemand() {
  if (!sbBgLibraryEnabled() || !sbBgHasContent()) return Promise.resolve(false);
  var now = Date.now();
  if (sbBgLib.lastFocusRefresh && now - sbBgLib.lastFocusRefresh < SB_BG_FOCUS_GUARD_MS) {
    return Promise.resolve(false);
  }
  sbBgLib.lastFocusRefresh = now;
  return sbBgRefreshFolders(true).then(function (listed) {
    if (!listed) return false;
    sbBgEnsureStoryBackground(true);
    if (sbState.tool === "background" && typeof sbSelectBgTab === "function") {
      sbSelectBgTab(sbState.bgTab || "standard");
    }
    return true;
  }).catch(function () { return false; });
}

function sbBgInitRefresh() {
  if (sbBgLib.refreshBound) return;
  sbBgLib.refreshBound = true;
  window.addEventListener("focus", sbBgRefreshOnDemand);
  sbBgRefreshOnDemand();
}

// ---- story backups ---------------------------------------------------------

function sbBgDataUrl(id) {
  var meta = SB_OD_BACKGROUNDS[id];
  if (!meta) return Promise.resolve("");
  if (meta.stale && !meta.__retried) {
    meta.__retried = true;
    return sbBgEnsureFull(id).then(function () {
      return sbBgDataUrl(id);
    });
  }
  if (meta.dataUrl) return Promise.resolve(meta.dataUrl);
  if (meta.blob) {
    return sbBgBlobToDataUrl(meta.blob).then(function (url) {
      meta.dataUrl = url;
      return url;
    }).catch(function () { return ""; });
  }
  return sbBgEnsureFull(id).then(function () {
    var fetched = SB_OD_BACKGROUNDS[id];
    if (!fetched || !fetched.blob) return "";
    return sbBgBlobToDataUrl(fetched.blob).then(function (url) {
      fetched.dataUrl = url;
      return url;
    });
  }).catch(function () { return ""; });
}

// ONE entry per background used by ANY scene of the story.
function sbBgStoryExtra(story) {
  var ids = {};
  ((story && story.scenes) || []).forEach(function (scene) {
    if (scene && sbIsOdBackground(scene.background)) ids[scene.background] = true;
  });
  var list = Object.keys(ids);
  if (!list.length) return Promise.resolve({});
  return Promise.all(list.map(function (id) {
    return sbBgDataUrl(id).then(function (dataUrl) {
      if (!dataUrl) return null;
      var meta = SB_OD_BACKGROUNDS[id] || {};
      return [id, {
        name: meta.name || "",
        fileName: meta.fileName || "",
        dataUrl: dataUrl
      }];
    });
  })).then(function (pairs) {
    var out = {};
    pairs.forEach(function (pair) {
      if (pair) out[pair[0]] = pair[1];
    });
    return out;
  });
}

// Restore the payload written by sbBgStoryExtra(). Synchronous registration (the
// data URL is the immediate painting), cache write in the background.
function sbBgRestorePayload(map) {
  if (!map || typeof map !== "object") return;
  Object.keys(map).forEach(function (id) {
    var entry = map[id] || {};
    if (!sbIsOdBackground(id) || !entry.dataUrl) return;
    sbRegisterOdBackground({
      id: id,
      name: entry.name || sbBgDisplayName(entry.fileName || ""),
      fileName: entry.fileName || "",
      src: entry.dataUrl,
      dataUrl: entry.dataUrl
    });
    sbBgCacheWriteDataUrl(id, entry.dataUrl);
    sbBgOnResolved(id);
  });
}

// ---- console helper --------------------------------------------------------

function sbBackgroundDebug() {
  var config = typeof getOneDriveConfig === "function" ? getOneDriveConfig() : {};
  var story = typeof sbActiveStory === "function" ? sbActiveStory() : null;
  function folder(which) {
    return {
      listed: !!sbBgLib.loaded[which],
      exists: !!sbBgLib.exists[which],
      count: (sbBgLib.items[which] || []).length,
      error: sbBgLib.errors[which] ? sbBgLib.errors[which].message : ""
    };
  }
  return {
    build: typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "",
    enabled: !!config.enabled,
    signedIn: !!config.account,
    directory: config.directory || "",
    story: story ? story.name : "",
    paths: { library: sbBgFolderPath("library"), board: sbBgFolderPath("board") },
    tabs: sbBgTabs().map(function (tab) { return tab.id; }),
    library: folder("library"),
    board: folder("board"),
    current: story && typeof sbActiveBoard === "function" ? (sbActiveBoard() || {}).background : "",
    index: sbBgIndexAll()
  };
}
if (typeof window !== "undefined") window.sbBackgroundDebug = sbBackgroundDebug;
