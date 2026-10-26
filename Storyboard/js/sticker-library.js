// Storyboard - the OneDrive sticker libraries behind the Stickers fly-out.
//
// When OneDrive is enabled AND signed in the panel gains tabs:
//   Standard  the five built-in SVG stickers (SB_STICKERS, always available)
//   Library   images in <OneDrive Directory>/Stickers
//   Board     images in <OneDrive Directory>/<story name>/Stickers
// A folder that does not exist (Graph 404) hides its tab, and a Storyboard with
// OneDrive off (or signed out) keeps the old single list untouched.
//
// EFFICIENCY + OFFLINE
//   * folders are listed once per panel visit (5s guard) and the result is
//     persisted in localStorage, so the tabs and their contents survive a
//     reload - even offline, where the listing simply fails and the cached
//     index is kept;
//   * images are downloaded only when the matching tab is first opened, four at
//     a time, and each payload is cached in Cache Storage (`myapps-stickers`,
//     which sw.js keeps across activates) keyed by the sticker id;
//   * the grid is data-driven (`<sb-sticker-gallery>` diffs by id), so a
//     resolving image updates ONE tile instead of re-rendering the panel.
//
// BOARD DATA keeps only `{ sticker: "od:<hash>", stickerName: "shark.png" }`, so
// a story stays small. The BYTES are embedded in the MinIO / OneDrive story
// backup (`stickers: { "od:<hash>": { name, fileName, dataUrl } }`, one entry per
// sticker however many times it is placed), and a backup opened on another
// device restores them straight into the registry.

var SB_STICKER_CACHE = "myapps-stickers";
var SB_STICKER_FOLDER_NAME = "Stickers";
var SB_STICKER_IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
var SB_STICKER_DOWNLOAD_LIMIT = 4;
var SB_STICKER_LIST_GUARD_MS = 5000;
// Re-check the folders when the window regains focus (the user is iterating on
// the artwork in another program and expects the board to pick the new pixels
// up when they switch back). `var` on purpose: a test can zero it.
var SB_STICKER_FOCUS_GUARD_MS = 15000;
var SB_STICKER_INDEX_LIMIT = 500;

var sbStickerLib = {
  items: { library: [], board: [] },
  exists: { library: false, board: false },
  loaded: { library: false, board: false },
  paths: { library: "", board: "" },
  lastRefresh: 0,
  lastFocusRefresh: 0,
  pending: { library: null, board: null },
  // Why a folder could not be read (shown in the panel, so a failed listing is
  // never invisible). Cleared by the next successful listing or Retry.
  errors: { library: null, board: null },
  // Per-id download dedupe + invalidation generation (see sbStickerDownload /
  // sbStickerInvalidate): a re-saved file must never be overwritten by a
  // download that started before its eTag changed.
  downloading: {},
  generation: {},
  refreshBound: false
};

// ---- ids, names, paths -----------------------------------------------------

// Deterministic short id: FNV-1a twice, so the same OneDrive item keeps the same
// sticker id, cache key and artwork reference across sessions.
function sbStickerHash(value) {
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

// Caption: the file name without its extension ("holiday-shark.png" ->
// "holiday-shark"); the full name stays in the tile's title.
function sbStickerDisplayName(fileName) {
  var name = String(fileName == null ? "" : fileName).trim();
  var dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

// The story folder used by the ONE DRIVE STORY BACKUP (<dir>/<story>/story-*),
// so the Board stickers sit next to the story they belong to.
function sbStickerStoryDir() {
  var story = typeof sbActiveStory === "function" ? sbActiveStory() : null;
  var name = story ? story.name : "";
  return typeof sbMinioStoryDirName === "function" ? sbMinioStoryDirName(name) : "story";
}

function sbStickerFolderPath(which) {
  var directory = typeof getOneDriveConfig === "function" ? getOneDriveConfig().directory : "";
  if (which === "board") {
    return oneDriveJoinPath(directory, sbStickerStoryDir(), SB_STICKER_FOLDER_NAME);
  }
  return oneDriveJoinPath(directory, SB_STICKER_FOLDER_NAME);
}

function sbStickerLibraryEnabled() {
  if (typeof getOneDriveConfig !== "function") return false;
  var config = getOneDriveConfig();
  return !!(config.enabled && config.account);
}

// Switching stories (or the Directory) changes the folder paths: the in-memory
// list belongs to the OLD path, so forget it and let the cached index answer.
function sbStickerSyncPaths() {
  var changed = false;
  ["library", "board"].forEach(function (which) {
    var path = sbStickerFolderPath(which);
    if (sbStickerLib.paths[which] === path) return;
    sbStickerLib.paths[which] = path;
    sbStickerLib.items[which] = [];
    sbStickerLib.exists[which] = false;
    sbStickerLib.loaded[which] = false;
    sbStickerHydrateFromIndex(which);
    changed = true;
  });
  return changed;
}

// A reload (or an offline start) has no listing yet: seed the folder from the
// persisted index so its tab, its tiles and the cached images still work.
function sbStickerHydrateFromIndex(which) {
  if (sbStickerLib.loaded[which] || (sbStickerLib.items[which] || []).length) return;
  var path = sbStickerLib.paths[which] || sbStickerFolderPath(which);
  var files = sbStickerIndexGet(path);
  if (!files) return;
  sbStickerLib.items[which] = files;
  sbStickerLib.exists[which] = true;
  files.forEach(function (meta) { sbRegisterOdSticker(meta); });
}

// ---- listing index (small, persisted, survives offline) --------------------

function sbStickerIndexAll() {
  try {
    var raw = JSON.parse(localStorage.getItem(smdKey("odStickerIndex")) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch (e) {
    return {};
  }
}

function sbStickerIndexGet(path) {
  var entry = sbStickerIndexAll()[path];
  return entry && Array.isArray(entry.files) ? entry.files : null;
}

function sbStickerIndexPut(path, files) {
  var all = sbStickerIndexAll();
  if (files && files.length) {
    all[path] = { updatedAt: Date.now(), files: files.slice(0, SB_STICKER_INDEX_LIMIT) };
  } else {
    delete all[path];
  }
  try {
    localStorage.setItem(smdKey("odStickerIndex"), JSON.stringify(all));
  } catch (e) { /* quota: the cache still works, tabs just need the network */ }
}

// ---- tabs ------------------------------------------------------------------

function sbStickerFolderAvailable(which) {
  if (sbStickerLib.exists[which]) return true;
  return !!sbStickerIndexGet(sbStickerLib.paths[which] || sbStickerFolderPath(which));
}

// [] means "no tab UI at all" (OneDrive off/signed out, or neither folder
// exists) - the panel then renders the plain Standard list exactly as before.
function sbStickerTabs() {
  sbStickerSyncPaths();
  if (!sbStickerLibraryEnabled()) return [];
  var tabs = [{ id: "standard", title: "Standard" }];
  if (sbStickerFolderAvailable("library")) tabs.push({ id: "library", title: "Library" });
  if (sbStickerFolderAvailable("board")) tabs.push({ id: "board", title: "Board" });
  return tabs.length > 1 ? tabs : [];
}

// ---- folder listing --------------------------------------------------------

function sbStickerMetaFromFile(which, folderPath, file) {
  var fileName = String((file && file.name) || "");
  // The Graph item id is stable across renames; the path is the fallback.
  var key = String((file && file.id) || oneDriveJoinPath(folderPath, fileName));
  return {
    id: "od:" + sbStickerHash(key),
    name: sbStickerDisplayName(fileName),
    fileName: fileName,
    path: (file && file.key) || oneDriveJoinPath(folderPath, fileName),
    source: which,
    size: (file && file.size) || 0,
    etag: (file && file.eTag) || "",
    lastModified: (file && file.lastModified) || ""
  };
}

// Has the file's CONTENT changed since it was listed? Graph bumps eTag on a
// save; size/lastModified cover a server that omits eTag. An entry with no
// usable metadata is treated as unchanged (never a needless re-download).
function sbStickerFileChanged(previous, next) {
  if (!previous || !next) return false;
  if (previous.etag && next.etag) {
    return previous.etag !== next.etag || (previous.size || 0) !== (next.size || 0);
  }
  var before = String(previous.lastModified || "") + "|" + (previous.size || 0);
  var after = String(next.lastModified || "") + "|" + (next.size || 0);
  if (before === "|0" || after === "|0") return false;
  return before !== after;
}

// The file changed on the drive: forget its cached bytes and mark the registry
// entry STALE. The old image stays on screen until the fresh download lands, so
// the board never flashes a placeholder (and keeps the last good artwork if the
// refresh happens offline).
function sbStickerInvalidate(ids) {
  if (!ids || !ids.length) return Promise.resolve();
  ids.forEach(function (id) {
    sbStickerLib.generation[id] = (sbStickerLib.generation[id] || 0) + 1;
    var meta = SB_OD_STICKERS[id];
    if (meta) meta.stale = true;
  });
  // The scene hydration guard is keyed by the sticker id SET, which has not
  // changed - reset it so a forced/next render re-resolves the new bytes.
  sbStickerStorySig = "";
  return sbStickerCacheOpen().then(function (cache) {
    if (!cache) return null;
    return Promise.all(ids.map(function (id) {
      return cache.delete(sbStickerCacheKey(id)).catch(function () { return false; });
    }));
  }).catch(function () { return null; });
}

function sbStickerRefreshFolder(which) {
  var path = sbStickerLib.paths[which] || sbStickerFolderPath(which);
  return oneDriveListFolder(path).then(function (list) {
    var files = ((list && list.files) || [])
      .filter(function (file) { return SB_STICKER_IMAGE_RE.test(String((file && file.name) || "")); })
      .map(function (file) { return sbStickerMetaFromFile(which, path, file); });

    // A file re-saved on the drive keeps its item id but gets a new eTag, so its
    // cached bytes are stale: drop them BEFORE anything can paint them again.
    var previous = {};
    (sbStickerIndexGet(path) || []).forEach(function (meta) {
      if (meta && meta.id) previous[meta.id] = meta;
    });
    var changed = [];
    files.forEach(function (meta) {
      if (sbStickerFileChanged(previous[meta.id], meta)) changed.push(meta.id);
    });

    sbStickerLib.items[which] = files;
    sbStickerLib.exists[which] = true;
    sbStickerLib.loaded[which] = true;
    sbStickerLib.errors[which] = null;
    sbStickerIndexPut(path, files);
    files.forEach(function (meta) { sbRegisterOdSticker(meta); });

    if (!changed.length) return true;
    return sbStickerInvalidate(changed).then(function () {
      // Repaint the scene with the new artwork (the panel hydrates its own tab).
      sbStickerEnsureStoryImages(true);
      return true;
    });
  }).catch(function (err) {
    if (err && err.status === 404) {
      // The folder does not exist: hide the tab and forget the cached list.
      var wasListed = sbStickerLib.exists[which];
      sbStickerLib.items[which] = [];
      sbStickerLib.exists[which] = false;
      sbStickerLib.loaded[which] = true;
      sbStickerLib.errors[which] = null;
      sbStickerIndexPut(path, null);
      return wasListed;
    }
    // Offline / token failure: keep the persisted list so cached stickers and
    // the tabs still work, and remember WHY so the panel can say so instead of
    // silently hiding the libraries. `loaded` stays false so a later open retries.
    sbStickerLib.errors[which] = {
      message: sbStickerListErrorMessage(err),
      signIn: err && err.code === "sign_in_required",
      at: Date.now()
    };
    return false;
  });
}

// Resolves true when the visible tab set may have changed (so the panel needs
// re-rendering) - never rejects.
function sbStickerRefreshFolders(force) {
  sbStickerSyncPaths();
  if (!sbStickerLibraryEnabled()) return Promise.resolve(false);
  var now = Date.now();
  if (!force && sbStickerLib.lastRefresh && now - sbStickerLib.lastRefresh < SB_STICKER_LIST_GUARD_MS) {
    return Promise.resolve(false);
  }
  var changed = false;
  return Promise.all(["library", "board"].map(function (which) {
    return sbStickerRefreshFolder(which).then(function (result) {
      if (result) changed = true;
    });
  })).then(function () {
    sbStickerLib.lastRefresh = Date.now();
    return changed;
  }).catch(function () {
    return changed;
  });
}

// ---- Cache Storage ---------------------------------------------------------

function sbStickerCacheKey(id) {
  return location.origin + "/sb-sticker/" + String(id).replace(/^od:/, "");
}

function sbStickerCacheOpen() {
  if (typeof caches === "undefined" || !caches.open) return Promise.resolve(null);
  return caches.open(SB_STICKER_CACHE).catch(function () { return null; });
}

function sbStickerBlobToDataUrl(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(String(reader.result || "")); };
    reader.onerror = function () { reject(reader.error || new Error("read failed")); };
    reader.readAsDataURL(blob);
  });
}

// Read ONE sticker's cached bytes into the registry. The generation guard is
// essential: a match that started BEFORE an invalidation resolves with the OLD
// bytes and must not paint them over the fresh download.
function sbStickerCacheReadOne(id) {
  var generation = sbStickerLib.generation[id] || 0;
  function stale() { return (sbStickerLib.generation[id] || 0) !== generation; }
  return sbStickerCacheOpen().then(function (cache) {
    if (!cache) return null;
    return cache.match(sbStickerCacheKey(id)).then(function (response) {
      if (!response || stale()) return null;
      return response.blob().then(function (blob) {
        if (stale()) return null;
        sbStickerApplyBlob(id, blob);
        return blob;
      });
    });
  }).catch(function () { return null; });
}

function sbStickerCacheRead(which) {
  var items = sbStickerLib.items[which] || [];
  if (!items.length) return Promise.resolve();
  return Promise.all(items.map(function (meta) {
    if (!sbStickerNeedsDownload(SB_OD_STICKERS[meta.id])) return null;
    return sbStickerCacheReadOne(meta.id);
  }));
}

function sbStickerCacheWrite(id, blob) {
  return sbStickerCacheOpen().then(function (cache) {
    if (!cache) return null;
    return cache.put(sbStickerCacheKey(id), new Response(blob, {
      headers: { "Content-Type": blob.type || "image/png" }
    })).catch(function () { return null; });
  });
}

function sbStickerCacheWriteDataUrl(id, dataUrl) {
  if (!dataUrl) return Promise.resolve();
  return fetch(dataUrl).then(function (response) { return response.blob(); })
    .then(function (blob) { return sbStickerCacheWrite(id, blob); })
    .catch(function () { return null; });
}

// ---- downloads -------------------------------------------------------------

function sbStickerApplyBlob(id, blob) {
  var meta = sbRegisterOdSticker({ id: id });
  if (!meta) return;
  meta.blob = blob;
  // New bytes: any data: URL cached for a backup payload is out of date.
  delete meta.dataUrl;
  if (meta.objectUrl) {
    try { URL.revokeObjectURL(meta.objectUrl); } catch (e) { /* ignore */ }
  }
  try {
    meta.objectUrl = URL.createObjectURL(blob);
    meta.src = meta.objectUrl;
  } catch (e) {
    // No createObjectURL (very old browser): fall back to a data URL later.
  }
  sbStickerOnResolved(id);
}

// A registry entry "has bytes" only when a download/restore put them there. Do
// NOT test `src`: a listed-but-not-downloaded sticker already carries the
// placeholder data: URL, which would look resolved and never download.
function sbStickerHasImage(meta) {
  return !!(meta && (meta.blob || meta.dataUrl || meta.objectUrl));
}

// The bytes are on the drive but changed since we cached them: keep painting the
// OLD artwork until the fresh download lands (no placeholder flash, and a
// refresh that fails offline never loses the image).
function sbStickerNeedsDownload(meta) {
  return !sbStickerHasImage(meta) || !!meta.stale;
}

function sbStickerDownload(meta) {
  var registered = SB_OD_STICKERS[meta.id];
  if (!sbStickerNeedsDownload(registered)) return Promise.resolve();
  if (typeof oneDriveDownloadBlob !== "function") return Promise.resolve();
  // One download per sticker even when the panel and the board both want it.
  if (sbStickerLib.downloading[meta.id]) return sbStickerLib.downloading[meta.id];
  // An invalidation while this fetch is in flight must win: the blob it returns
  // belongs to the OLD artwork.
  var generation = sbStickerLib.generation[meta.id] || 0;
  // Promise-wrap the call: a synchronous throw (a malformed image, a stub that
  // fails) must not abort the whole queue or the other stickers would stay
  // placeholders.
  var task = Promise.resolve().then(function () {
    return oneDriveDownloadBlob(meta.path);
  }).then(function (blob) {
    if (!blob) return null;
    if ((sbStickerLib.generation[meta.id] || 0) !== generation) return null;
    var meta2 = SB_OD_STICKERS[meta.id];
    if (meta2) delete meta2.stale;
    sbStickerApplyBlob(meta.id, blob);
    return sbStickerCacheWrite(meta.id, blob);
  }).catch(function () { return null; });
  sbStickerLib.downloading[meta.id] = task;
  task.then(function () { delete sbStickerLib.downloading[meta.id]; });
  return task;
}

// Small worker pool: `limit` downloads in flight, failures ignored (the tile
// keeps its placeholder and a later open retries).
function sbStickerRunQueue(list, limit, worker) {
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

function sbStickerEnsureImages(which) {
  if (!sbStickerLibraryEnabled()) return Promise.resolve();
  if (which !== "library" && which !== "board") return Promise.resolve();
  if (sbStickerLib.pending[which]) return sbStickerLib.pending[which];

  var task = sbStickerCacheRead(which).then(function () {
    var items = (sbStickerLib.items[which] || []).filter(function (meta) {
      return sbStickerNeedsDownload(SB_OD_STICKERS[meta.id]);
    });
    if (!items.length) return null;
    return sbStickerRunQueue(items, SB_STICKER_DOWNLOAD_LIMIT, sbStickerDownload);
  }).catch(function () { return null; }).then(function (result) {
    sbStickerLib.pending[which] = null;
    return result;
  });

  sbStickerLib.pending[which] = task;
  return task;
}

// One sticker's bytes just arrived: refresh its panel tile and any board object
// using it (a full board re-render would be wasteful while ~30 images load).
function sbStickerOnResolved(id) {
  var tile = document.querySelector('#sbPanelBody sb-sticker[sticker-id="' + id + '"]');
  var meta = SB_OD_STICKERS[id];
  if (tile && meta && meta.src) tile.setAttribute("src", meta.src);

  var board = typeof sbActiveBoard === "function" ? sbActiveBoard() : null;
  if (!board || !meta || !meta.src) return;
  var changed = false;
  (board.items || []).forEach(function (item) {
    if (item.type !== "sticker" || item.sticker !== id) return;
    changed = true;
    var object = document.querySelector('#sbItems .sb-object[data-id="' + item.id + '"]');
    var img = object ? object.querySelector("img.sb-sticker") : null;
    if (img && img.getAttribute("src") !== meta.src) img.src = meta.src;
  });
  return changed;
}

// ---- panel data ------------------------------------------------------------

// Rows for <sb-sticker-gallery>: the built-in list for "standard", otherwise the
// listed OneDrive items with whatever image is available right now.
function sbStickerGalleryData(which) {
  if (which === "standard") {
    return SB_STICKERS.map(function (sticker) {
      return { id: sticker.id, name: sticker.name, src: sticker.file, source: "standard" };
    });
  }
  return (sbStickerLib.items[which] || []).map(function (meta) {
    var registered = SB_OD_STICKERS[meta.id] || {};
    return {
      id: meta.id,
      name: meta.name,
      src: registered.src || SB_STICKER_PLACEHOLDER,
      source: which
    };
  });
}

// Why a listing failed, in words a user can act on. `oneDriveGetToken` throws
// `sign_in_required` (no `.status`) when the cached Microsoft token can no longer
// be renewed, which is the common "signed in yesterday, not today" case.
function sbStickerListErrorMessage(err) {
  if (!err) return "";
  if (err.code === "sign_in_required") {
    // Surface Microsoft''s own code (login_required, consent_required, ...) when
    // there is one: it separates "token went stale" from "the Azure app is not
    // consented", which have different fixes.
    var auth = err.authError || null;
    var code = auth && (auth.errorCode || auth.subError || auth.name);
    var detail = code && code !== "sign_in_required" ? " (" + code + ")" : "";
    return "OneDrive sign-in has expired" + detail + ". Sign in again from Settings > FileSync > OneDrive.";
  }
  if (typeof err.status === "number") {
    return typeof oneDriveFriendlyError === "function"
      ? oneDriveFriendlyError(err)
      : "OneDrive returned HTTP " + err.status + ".";
  }
  var message = String(err.message || err);
  if (/Failed to fetch|NetworkError|ERR_|Load failed/i.test(message)) {
    return "Cannot reach OneDrive. Check your internet connection.";
  }
  return message;
}

// The panel's status line: "" when everything is fine (or OneDrive is off).
function sbStickerStatusNote() {
  if (typeof getOneDriveConfig !== "function") return "";
  var config = getOneDriveConfig();
  if (!config.enabled) return "";
  if (!config.account) {
    return "OneDrive is enabled but no account is signed in, so the sticker libraries are hidden. " +
      "Sign in from Settings > FileSync > OneDrive.";
  }
  var reasons = [];
  ["library", "board"].forEach(function (which) {
    var error = sbStickerLib.errors[which];
    if (!error || !error.message) return;
    reasons.push((which === "library" ? "Library" : "Board") + ": " + error.message);
  });
  if (!reasons.length) return "";
  var libraryPath = sbStickerLib.paths.library || sbStickerFolderPath("library");
  var boardPath = sbStickerLib.paths.board || sbStickerFolderPath("board");
  return "OneDrive is enabled, but the sticker folders could not be read. " +
    reasons.join(" ") + " Tried " + libraryPath + " and " + boardPath + ".";
}

// "signin" | "error" | "": which action the panel should offer alongside Retry.
function sbStickerStatusKind() {
  if (typeof getOneDriveConfig !== "function") return "";
  var config = getOneDriveConfig();
  if (!config.enabled) return "";
  if (!config.account) return "signin";
  var any = false;
  var signIn = false;
  ["library", "board"].forEach(function (which) {
    var error = sbStickerLib.errors[which];
    if (!error) return;
    any = true;
    if (error.signIn) signIn = true;
  });
  if (signIn) return "signin";
  return any ? "error" : "";
}

// Interactive re-sign-in, then re-list. Used by the panel's Sign in button.
function sbStickerSignIn() {
  if (typeof signInToOneDrive !== "function") return Promise.resolve(null);
  return Promise.resolve().then(function () {
    return signInToOneDrive({ silent: true });
  }).then(function (name) {
    if (!name) return null;
    return sbStickerRetry().then(function () { return name; });
  }).catch(function () { return null; });
}

// Identity of what the panel currently SHOWS, so a failed refresh that only
// changes the status line still repaints exactly once (no render loop).
function sbStickerPanelSignature() {
  var tabs = sbStickerTabs().map(function (tab) { return tab.id; }).join(",");
  return tabs + "|" + sbStickerStatusNote();
}

// Re-list on demand (the Retry button), then rebuild the panel.
function sbStickerRetry() {
  sbStickerLib.lastRefresh = 0;
  sbStickerLib.lastFocusRefresh = 0;
  sbStickerLib.errors = { library: null, board: null };
  return sbStickerRefreshFolders(true).then(function () {
    if (sbState.tool === "stickers" && typeof sbRenderStickersPanel === "function") {
      sbRenderStickersPanel(true);
    }
  }).catch(function () { return null; });
}

// Console helper for support: window.sbStickerDebug(). Reports the build, the
// OneDrive config, the RESOLVED folder paths, the tab list and any error.
function sbStickerDebug() {
  var config = typeof getOneDriveConfig === "function" ? getOneDriveConfig() : {};
  var story = typeof sbActiveStory === "function" ? sbActiveStory() : null;
  function folder(which) {
    return {
      listed: !!sbStickerLib.loaded[which],
      exists: !!sbStickerLib.exists[which],
      count: (sbStickerLib.items[which] || []).length,
      error: sbStickerLib.errors[which] ? sbStickerLib.errors[which].message : ""
    };
  }
  return {
    build: typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "",
    enabled: !!config.enabled,
    signedIn: !!config.account,
    account: config.account || "",
    clientId: config.clientId ? "(set)" : "",
    directory: config.directory || "",
    story: story ? story.name : "",
    paths: { library: sbStickerFolderPath("library"), board: sbStickerFolderPath("board") },
    tabs: sbStickerTabs().map(function (tab) { return tab.id; }),
    library: folder("library"),
    board: folder("board"),
    index: sbStickerIndexAll()
  };
}
if (typeof window !== "undefined") window.sbStickerDebug = sbStickerDebug;

// ---- board hydration -------------------------------------------------------

// A saved scene may contain OneDrive stickers long before its tab is opened
// (e.g. straight after a reload). Resolve them from Cache Storage first - that
// is what keeps a stored board working offline - then download the misses in the
// background. Called from sbRender(), guarded by the id set so it is a no-op
// while the board is unchanged.
var sbStickerStorySig = "";

function sbStickerMetaForId(id) {
  var found = null;
  ["library", "board"].forEach(function (which) {
    (sbStickerLib.items[which] || []).forEach(function (meta) {
      if (!found && meta.id === id) found = meta;
    });
  });
  return found;
}

function sbStickerEnsureStoryImages(force) {
  var board = typeof sbActiveBoard === "function" ? sbActiveBoard() : null;
  if (!board) return Promise.resolve();
  var ids = {};
  (board.items || []).forEach(function (item) {
    if (item && item.type === "sticker" && sbIsOdSticker(item.sticker)) ids[item.sticker] = true;
  });
  var list = Object.keys(ids);
  var signature = list.join(",");
  if (!force && signature === sbStickerStorySig) return Promise.resolve();
  sbStickerStorySig = signature;
  if (!list.length) return Promise.resolve();

  sbStickerSyncPaths();
  sbStickerHydrateFromIndex("library");
  sbStickerHydrateFromIndex("board");
  var missing = list.map(sbStickerMetaForId).filter(function (meta) {
    return !!meta && sbStickerNeedsDownload(SB_OD_STICKERS[meta.id]);
  });
  if (!missing.length) return Promise.resolve();

  return Promise.all(missing.map(function (meta) {
    return sbStickerCacheReadOne(meta.id);
  })).then(function () {
    if (!sbStickerLibraryEnabled()) return null;
    var still = missing.filter(function (meta) { return sbStickerNeedsDownload(SB_OD_STICKERS[meta.id]); });
    if (!still.length) return null;
    return sbStickerRunQueue(still, SB_STICKER_DOWNLOAD_LIMIT, sbStickerDownload);
  }).catch(function () { return null; });
}

// ---- story backups ---------------------------------------------------------
function sbStickerDataUrl(id, retried) {
  var meta = SB_OD_STICKERS[id];
  if (!meta) return Promise.resolve("");
  // A backup must carry the CURRENT artwork: if the file changed on the drive,
  // fetch the fresh bytes before embedding them (once - never recurse on a
  // failed download, the old bytes are still a better payload than none).
  if (meta.stale && !retried) {
    return sbStickerDownload(meta).then(function () { return sbStickerDataUrl(id, true); });
  }
  if (meta.dataUrl) return Promise.resolve(meta.dataUrl);
  if (meta.blob) {
    return sbStickerBlobToDataUrl(meta.blob).then(function (url) {
      meta.dataUrl = url;
      return url;
    }).catch(function () { return ""; });
  }
  return sbStickerCacheOpen().then(function (cache) {
    if (!cache) return null;
    return cache.match(sbStickerCacheKey(id)).then(function (response) {
      return response ? response.blob() : null;
    });
  }).then(function (blob) {
    if (blob) return blob;
    // Not cached yet (the tab was never opened, or the save happened while the
    // download was still running): fetch it now so a backup is never missing
    // the bytes of a sticker the story uses.
    if (!meta.path || typeof oneDriveDownloadBlob !== "function") return null;
    return oneDriveDownloadBlob(meta.path).then(function (download) {
      if (download) sbStickerApplyBlob(id, download);
      return download || null;
    }).catch(function () { return null; });
  }).then(function (blob) {
    if (!blob) return "";
    meta.blob = blob;
    return sbStickerBlobToDataUrl(blob).then(function (url) {
      if (url) meta.dataUrl = url;
      return url || "";
    });
  }).catch(function () { return ""; });
}

// The ONE entry per sticker used anywhere in the story - placing the same
// sticker twice must not embed its bytes twice.
function sbStickerStoryExtra(story) {
  var ids = {};
  ((story && story.scenes) || []).forEach(function (scene) {
    ((scene && scene.items) || []).forEach(function (item) {
      if (item && item.type === "sticker" && sbIsOdSticker(item.sticker)) ids[item.sticker] = true;
    });
  });
  var list = Object.keys(ids);
  if (!list.length) return Promise.resolve({});
  return Promise.all(list.map(function (id) {
    return sbStickerDataUrl(id).then(function (dataUrl) {
      if (!dataUrl) return null;
      var meta = SB_OD_STICKERS[id] || {};
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

// Restore the payload written by sbStickerStoryExtra(). Synchronous so the
// import hook can activate the story immediately: the data URL IS the image
// source, and the bytes are written into Cache Storage in the background.
function sbStickerRestorePayload(map) {
  if (!map || typeof map !== "object") return;
  Object.keys(map).forEach(function (id) {
    var entry = map[id] || {};
    if (!sbIsOdSticker(id) || !entry.dataUrl) return;
    sbRegisterOdSticker({
      id: id,
      name: entry.name || sbStickerDisplayName(entry.fileName || ""),
      fileName: entry.fileName || "",
      src: entry.dataUrl,
      dataUrl: entry.dataUrl
    });
    sbStickerCacheWriteDataUrl(id, entry.dataUrl);
    sbStickerOnResolved(id);
  });
}

// ---- keeping artwork fresh --------------------------------------------------

// Does anything on screen care about the OneDrive stickers right now? (The
// Stickers panel is open, or the scene uses one.) The focus refresh is skipped
// otherwise, so a board that never uses the libraries costs no Graph calls.
function sbStickerHasLibraryContent() {
  if (sbState.tool === "stickers") return true;
  var board = typeof sbActiveBoard === "function" ? sbActiveBoard() : null;
  return !!(board && (board.items || []).some(function (item) {
    return item && item.type === "sticker" && sbIsOdSticker(item.sticker);
  }));
}

// Re-list the folders when the window regains focus. Re-listing also invalidates
// files whose eTag changed, so artwork edited in another program appears when the
// user switches back - no reload needed. Throttled by
// SB_STICKER_FOCUS_GUARD_MS.
function sbStickerRefreshOnDemand() {
  if (!sbStickerLibraryEnabled() || !sbStickerHasLibraryContent()) return Promise.resolve(false);
  var now = Date.now();
  if (sbStickerLib.lastFocusRefresh && now - sbStickerLib.lastFocusRefresh < SB_STICKER_FOCUS_GUARD_MS) {
    return Promise.resolve(false);
  }
  sbStickerLib.lastFocusRefresh = now;
  return sbStickerRefreshFolders(true).then(function (listed) {
    if (!listed) return false;
    sbStickerEnsureStoryImages(true);
    if (sbState.tool === "stickers" && typeof sbSelectStickerTab === "function") {
      sbSelectStickerTab(sbState.stickerTab || "standard");
    }
    return true;
  }).catch(function () { return false; });
}

// Boot: one refresh so a RELOAD picks up new artwork even with the panel shut,
// then keep watching for the window becoming active again.
function sbStickerInitRefresh() {
  if (sbStickerLib.refreshBound) return;
  sbStickerLib.refreshBound = true;
  window.addEventListener("focus", sbStickerRefreshOnDemand);
  sbStickerRefreshOnDemand();
}
