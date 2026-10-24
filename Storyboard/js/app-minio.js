// Storyboard - MinIO board backup.
//
// The shared smd-minio.js owns the settings, the signed S3 requests and the
// import page. This file only decides WHAT Storyboard saves and loads:
//
//   Save:  <Directory>/<board name>/board-YYYYMMDDHHMM.json
//          (one directory level below the app's configured Directory, so every
//          board keeps its own version history)
//   Load:  the shared import page lists the app Directory, its subdirectories
//          and "<board name>:latest" shortcuts. A loaded file becomes a NEW
//          board and is switched to; the current board is never overwritten.

// The timestamp half of the backup file name (same YYYYMMDDHHMM shape as the
// other apps' backups, so filename ordering is chronological).
function sbMinioTimestamp(date) {
  var d = date || new Date();
  return String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0") +
    String(d.getHours()).padStart(2, "0") +
    String(d.getMinutes()).padStart(2, "0");
}

// A board name becomes one S3 "directory" segment: path separators and the
// characters Windows/S3 UIs dislike are replaced so the subdirectory is always
// a single level. Spaces are preserved.
function sbMinioBoardDirName(board) {
  var name = String(board && board.name ? board.name : "").trim();
  if (!name) return "board";
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-");
  name = name.replace(/\s+/g, " ").trim();
  if (!name || name === "." || name === "..") return "board";
  return name;
}

function sbMinioBoardFileName(date) {
  return "board-" + sbMinioTimestamp(date) + ".json";
}

function sbSaveBoardToMinio() {
  var config = getMinioConfig();
  if (!config.enabled) return;
  if (!config.server || !config.username || !config.password || !config.bucket) {
    showMinioAlert("Please configure all Minio settings first.", "error");
    return;
  }
  var board = sbActiveBoard();
  if (!board) {
    showMinioAlert("There is no board to save.", "error");
    return;
  }

  // Persist the zoom/pan the user is looking at right now in the saved file.
  if (typeof sbCaptureView === "function") sbCaptureView();
  sbSaveState();

  var key = minioBuildKey(config.directory, sbMinioBoardDirName(board), sbMinioBoardFileName(new Date()));
  var payload = {
    version: 1,
    app: "storyboard",
    exportedAt: new Date().toISOString(),
    board: board
  };

  minioPutObject(config.bucket, key, JSON.stringify(payload, null, 2), config).then(function() {
    showMinioAlert("Saved " + key + " to Minio bucket " + config.bucket, "info");
  }).catch(function(e) {
    showMinioAlert("Minio save failed: " + minioFriendlyError(e), "error");
  });
}

// A loaded board is ADDED, so a name clash gets a numeric suffix ("My Board 2").
function sbUniqueImportedBoardName(name) {
  var base = String(name || "Board").trim() || "Board";
  var names = {};
  sbState.boards.forEach(function(b) { names[b.name] = true; });
  if (!names[base]) return base;
  var n = 2;
  while (names[base + " " + n]) n++;
  return base + " " + n;
}

function sbFindBoardByName(name) {
  for (var i = 0; i < sbState.boards.length; i++) {
    if (sbState.boards[i].name === name) return sbState.boards[i];
  }
  return null;
}

// Make a stored board active, with the usual "outgoing view is captured first"
// and selection reset. Shared by the add and overwrite paths.
function sbActivateImportedBoard(board) {
  if (typeof sbCaptureView === "function") sbCaptureView();
  sbState.activeId = board.id;
  sbState.zoom = board.view ? board.view.zoom : 1;
  sbState.selectedId = "";
  sbState.selectedIds = [];
  sbState.selectedConnectorId = "";
  sbState.connectFrom = "";
  sbState.editingTextId = "";
  sbSaveState();
  sbRender();
  if (typeof sbRenderPanel === "function") sbRenderPanel();
}

function sbAddImportedBoard(board) {
  board.id = sbUid();
  board.name = sbUniqueImportedBoardName(board.name);
  sbState.boards.push(board);
  sbActivateImportedBoard(board);
  return board;
}

// Overwrite keeps the EXISTING board's id (and position in the board list), so
// "load a newer version of this board" does not fork it into a duplicate.
function sbOverwriteImportedBoard(existing, board) {
  existing.name = board.name;
  existing.background = board.background;
  existing.items = board.items;
  existing.connectors = board.connectors;
  existing.groups = board.groups;
  existing.view = board.view;
  sbActivateImportedBoard(existing);
  return existing;
}

// Shared hook: receives the parsed JSON from the import page (also from the
// "<directory>:latest" shortcut). Return true when the file is a Storyboard
// backup; the hook owns closing the page.
SmdConfig.onMinioImport = function(data, key) {
  var raw = data && data.board && typeof data.board === "object"
    ? data.board
    : (data && Array.isArray(data.items) ? data : null);
  if (!raw) return false;

  var board = sbNormalizeBoard(raw);
  if (!board) return false;

  // A same-named board already exists: ASK before replacing it (smd-modal).
  // Cancel returns to the file list so another backup can be chosen.
  var existing = sbFindBoardByName(board.name);
  if (existing) {
    showSmdModal({
      title: "Board already exists",
      content: '<p style="margin:0">A board named <strong>' + escapeHtml(existing.name) +
        '</strong> already exists. Do you want to overwrite the current board with this saved version?</p>',
      buttons: [
        { text: "Cancel", variant: "secondary", action: "cancel" },
        { text: "Overwrite", variant: "primary", action: "overwrite" }
      ],
      onAction: function(detail) {
        if (detail && detail.action === "overwrite") {
          sbOverwriteImportedBoard(existing, board);
          closeMinioImport();
          showMinioAlert("Loaded " + key + " and overwrote board \"" + existing.name + "\".", "info");
        } else {
          var config = getMinioConfig();
          loadMinioBucketFiles(config.bucket, _minioCurrentPrefix);
        }
      }
    });
    return true;
  }

  sbAddImportedBoard(board);
  closeMinioImport();
  showMinioAlert("Loaded " + key + " as board \"" + board.name + "\".", "info");
  return true;
};
