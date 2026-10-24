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

document.addEventListener("DOMContentLoaded", function () {
  applyTheme(getStoredTheme());

  wbLoadState();
  wbInitBoard();
  wbInitToolbar();
  wbRender();

  // The shared <smd-theme> only announces a change; apply it and repaint so the
  // generated text-border colours (resolved from CSS variables) follow the theme.
  document.addEventListener("smd-theme-change", function (e) {
    var detail = e.detail || {};
    if (detail.source === "mode" && typeof changeThemeMode === "function") {
      changeThemeMode(detail.mode);
    } else if (detail.theme && typeof changeTheme === "function") {
      changeTheme(detail.theme);
    }
    if (typeof wbRender === "function") wbRender();
  });
});
