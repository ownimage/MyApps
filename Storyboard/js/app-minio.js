// Storyboard - MinIO story backup.
//
// The shared smd-minio.js owns the settings, the signed S3 requests and the
// import page. This file only decides WHAT Storyboard saves and loads:
//
//   Save:  <Directory>/<story name>/story-YYYYMMDDHHMM.json
//          The WHOLE story (all of its scenes) is written in one file, one
//          directory level below the app's configured Directory, so every story
//          keeps its own version history.
//   Load:  the shared import page lists the app Directory, its subdirectories
//          and "<story name>:latest" shortcuts. A loaded file becomes a NEW
//          story (with all of its scenes) and is switched to; if a story with
//          the same name already exists the app asks before overwriting it.

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

// A story name becomes one S3 "directory" segment: path separators and the
// characters Windows/S3 UIs dislike are replaced so the subdirectory is always
// a single level. Spaces are preserved.
function sbMinioStoryDirName(name) {
  var dir = String(name == null ? "" : name).trim();
  if (!dir) return "story";
  dir = dir.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-");
  dir = dir.replace(/\s+/g, " ").trim();
  if (!dir || dir === "." || dir === "..") return "story";
  return dir;
}

function sbMinioStoryFileName(date) {
  return "story-" + sbMinioTimestamp(date) + ".json";
}

function sbSaveStoryToMinio() {
  var config = getMinioConfig();
  if (!config.enabled) return;
  if (!config.server || !config.username || !config.password || !config.bucket) {
    showMinioAlert("Please configure all Minio settings first.", "error");
    return;
  }
  var story = sbActiveStory();
  if (!story) {
    showMinioAlert("There is no story to save.", "error");
    return;
  }

  // Persist the zoom/pan the user is looking at right now in the saved file.
  if (typeof sbCaptureView === "function") sbCaptureView();
  sbSaveState();

  var key = minioBuildKey(config.directory, sbMinioStoryDirName(story.name), sbMinioStoryFileName(new Date()));
  var payload = {
    version: 1,
    app: "storyboard",
    exportedAt: new Date().toISOString(),
    story: story
  };

  minioPutObject(config.bucket, key, JSON.stringify(payload, null, 2), config).then(function() {
    showMinioAlert("Saved " + key + " to Minio bucket " + config.bucket, "info");
  }).catch(function(e) {
    showMinioAlert("Minio save failed: " + minioFriendlyError(e), "error");
  });
}

// Keep the old name working for callers/tests that still use it.
function sbSaveBoardToMinio() {
  return sbSaveStoryToMinio();
}

function sbFindStoryByName(name) {
  for (var i = 0; i < sbState.stories.length; i++) {
    if (sbState.stories[i].name === name) return sbState.stories[i];
  }
  return null;
}

// Normalise a loaded story and give its story + scene ids fresh values, so a
// loaded file can never collide with an existing in-memory story. The scene
// that was active when the file was saved stays the active one.
function sbPrepareImportedStory(raw) {
  var story = sbNormalizeStory(raw);
  if (!story) return null;
  var oldActive = story.activeSceneId;
  var activeIndex = 0;
  story.scenes.forEach(function (scene, index) {
    if (scene.id === oldActive) activeIndex = index;
  });
  story.id = sbUid();
  story.scenes.forEach(function (scene) { scene.id = sbUid(); });
  story.activeSceneId = story.scenes[activeIndex].id;
  return story;
}

function sbActivateLoadedStory(story) {
  var board = story.scenes[0];
  story.scenes.forEach(function (scene) {
    if (scene.id === story.activeSceneId) board = scene;
  });
  sbActivateScene(story, board);
}

function sbOverwriteStory(existing, incoming) {
  existing.name = incoming.name;
  existing.scenes = incoming.scenes;
  existing.activeSceneId = incoming.activeSceneId;
  sbState.activeStoryId = existing.id;
  sbActivateLoadedStory(existing);
  return existing;
}

// OneDrive save: the SAME whole-story payload and path shape as the MinIO save,
// under the app's OneDrive Directory (<dir>/<story>/story-<timestamp>.json).
function sbSaveStoryToOneDrive(config) {
  var story = sbActiveStory();
  if (!story) {
    showOneDriveAlert("There is no story to save.", "error");
    return;
  }
  if (typeof sbCaptureView === "function") sbCaptureView();
  sbSaveState();

  var key = oneDriveJoinPath(
    config.directory,
    sbMinioStoryDirName(story.name),
    sbMinioStoryFileName(new Date())
  );
  var payload = {
    version: 1,
    app: "storyboard",
    exportedAt: new Date().toISOString(),
    story: story
  };

  oneDrivePutFile(key, JSON.stringify(payload, null, 2)).then(function () {
    showOneDriveAlert("Saved " + key + " to OneDrive.", "info");
  }).catch(function (e) {
    showOneDriveAlert("OneDrive save failed: " + oneDriveFriendlyError(e), "error");
  });
}

// FileSync (Minio/OneDrive) export hook. OneDrive replaces the MinIO upload;
// the MinIO menu entry keeps using sbSaveStoryToMinio().
SmdConfig.onFileSyncExport = function (provider, config) {
  if (provider === "onedrive") sbSaveStoryToOneDrive(config);
};

// Shared import: receives the parsed JSON from either import page (also from
// the "<directory>:latest" shortcut). Returns true for a Storyboard backup; the
// hook owns closing the page it came from.
function sbHandleImportedStory(provider, data, key) {
  if (!data || !data.story || typeof data.story !== "object") return false;
  // Whole-story backups only: a story must carry at least one scene. Old
  // single-board files (data.board) are deliberately NOT supported.
  if (!Array.isArray(data.story.scenes) || !data.story.scenes.length) return false;

  var incoming = sbPrepareImportedStory(data.story);
  if (!incoming) return false;

  // A same-named story already exists: ASK before replacing it (smd-modal).
  // Cancel returns to the file list so another backup can be chosen.
  var existing = sbFindStoryByName(incoming.name);
  if (existing) {
    showSmdModal({
      title: "Story already exists",
      content: '<p style="margin:0">A story named <strong>' + escapeHtml(existing.name) +
        '</strong> already exists. Do you want to overwrite the current story with this saved version?</p>',
      buttons: [
        { text: "Cancel", variant: "secondary", action: "cancel" },
        { text: "Overwrite", variant: "primary", action: "overwrite" }
      ],
      onAction: function(detail) {
        if (detail && detail.action === "overwrite") {
          sbOverwriteStory(existing, incoming);
          closeFileSyncImport(provider);
          showFileSyncAlert(provider, "Loaded " + key + " and overwrote story \"" + existing.name + "\".", "info");
        } else if (provider === "onedrive") {
          oneDriveLoadFolder(oneDriveCurrentPath);
        } else {
          var config = getMinioConfig();
          loadMinioBucketFiles(config.bucket, _minioCurrentPrefix);
        }
      }
    });
    return true;
  }

  sbState.stories.push(incoming);
  sbActivateLoadedStory(incoming);
  closeFileSyncImport(provider);
  showFileSyncAlert(provider, "Loaded " + key + " as story \"" + incoming.name + "\".", "info");
  return true;
}

SmdConfig.onMinioImport = function(data, key) {
  return sbHandleImportedStory("minio", data, key);
};
SmdConfig.onFileSyncImport = function(provider, data, key) {
  return sbHandleImportedStory(provider, data, key);
};
