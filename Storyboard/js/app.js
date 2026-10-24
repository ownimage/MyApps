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

// One-time rename of the old `whiteboard_` keys. Copy each value to the new
// prefix first (an existing new key wins), then remove the old key so there is
// a single source of truth. Runs before wbLoadState() reads anything.
(function wbMigrateLegacyStorage() {
  try {
    var oldPrefix = "whiteboard_";
    var newPrefix = "storyboard_";
    var legacy = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf(oldPrefix) === 0) legacy.push(key);
    }
    legacy.forEach(function (oldKey) {
      var newKey = newPrefix + oldKey.slice(oldPrefix.length);
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, localStorage.getItem(oldKey));
      }
      localStorage.removeItem(oldKey);
    });
  } catch (e) { /* private mode / storage disabled */ }
})();

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
