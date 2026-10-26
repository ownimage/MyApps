// Storyboard — app entry point.
//
// Classic scripts + globals, matching every other app in this repo: generated
// HTML uses inline handlers and the shared settings engine calls global hooks
// (`renderMain`, `changeTheme`, ...) directly.
//
// Boot order matters: storage must be loaded before the board paints, and the
// toolbar before the first render so the pin state is applied.

// All boards, the active board and the pin state live under this namespace.
SmdConfig.storagePrefix = "storyboard_";
// Storyboard has no image picker, but the shared sample-image library is still
// used by the Launch grid; keep the prefix consistent with every app.
SmdConfig.imagePrefix = "shared-";
// OneDrive default backup directory (each app keeps its own, inside the drive).
SmdConfig.oneDriveDefaultDirectory = "MyApps/Storyboard";

document.addEventListener("DOMContentLoaded", function () {
  applyTheme(getStoredTheme());

  // Text borders are SVG images with the resolved text colour baked in, while
  // the text itself uses a live CSS colour. applyTheme() only re-points the
  // stylesheet links, so their new colours can land after the first render (or
  // after the smd-theme-change render). Repaint once the sheets arrive so a
  // stamp/fancy/hand edge always matches the live text (and the JPG export).
  var themeRepaint = 0;
  var repaintAfterThemeSheet = function () {
    if (themeRepaint) return;
    themeRepaint = requestAnimationFrame(function () {
      themeRepaint = 0;
      if (typeof sbRender === "function") sbRender();
    });
  };
  ["bootstrap-theme-css", "theme-override-mode", "theme-override-specific"].forEach(function (id) {
    var link = document.getElementById(id);
    if (link) link.addEventListener("load", repaintAfterThemeSheet);
  });

  sbLoadState();
  sbInitBoard();
  sbInitToolbar();
  sbRender();

  // OneDrive sticker artwork can be edited outside the app: refresh the sticker
  // libraries at boot (so a reload picks up a re-saved PNG even with the Stickers
  // panel shut) and whenever the window regains focus. Files whose eTag changed
  // lose their cached bytes and are re-downloaded.
  if (typeof sbStickerInitRefresh === "function") sbStickerInitRefresh();
  if (typeof sbBgInitRefresh === "function") sbBgInitRefresh();

  // Show/hide the Minio menu entries (only when MinIO is enabled).
  if (typeof updateFileSyncMenu === "function") updateFileSyncMenu();
  else if (typeof updateMinioMenu === "function") updateMinioMenu();

  // The JPG baseline nudge depends on the live font's metrics. Recompute it
  // when a webfont finishes loading (the first render may have used a fallback).
  if (document.fonts) {
    var refreshTextNudges = function () {
      if (typeof sbApplyAllTextNudges === "function") sbApplyAllTextNudges();
    };
    if (document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(refreshTextNudges);
    }
    if (document.fonts.addEventListener) {
      document.fonts.addEventListener("loadingdone", refreshTextNudges);
    }
  }

  // The shared <smd-theme> only announces a change; apply it and repaint so the
  // generated text-border colours (resolved from CSS variables) follow the theme.
  document.addEventListener("smd-theme-change", function (e) {
    var detail = e.detail || {};
    if (detail.source === "mode" && typeof changeThemeMode === "function") {
      changeThemeMode(detail.mode);
    } else if (detail.theme && typeof changeTheme === "function") {
      changeTheme(detail.theme);
    }
    if (typeof sbRender === "function") sbRender();
  });
});
