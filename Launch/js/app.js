// Launch app entry point: the grid of app tiles plus the settings page
// (theme, image size, Buy Me a Coffee, share QR, FontAwesome credit).
//
// Classic script (no modules): top-level functions stay global for inline
// onclick/onchange handlers. Shared services (smd-app.js, smd-settings.js)
// provide SmdConfig, the theme engine and injectSettingsStyles().

// Launch keeps its own settings namespace; the image library is shared by
// every app on the origin (`shared-images`).
SmdConfig.storagePrefix = "launch_";
SmdConfig.imagePrefix = "shared-";

// The app registry + the Launch menu order/visibility config live in the shared
// `shared/js/smd-apps.js` (window.SmdApps), so the grid, the settings "Menu" tab
// and every app's "Launch" flyout submenu read ONE source. Each app's `icon` is
// the NAME of a shared sample image (seeded into `shared-images`), rendered by
// <smd-image> rather than a raw file path.

function renderAppGrid() {
  const grid = document.getElementById("appGrid");
  if (!grid) return;
  grid.innerHTML = "";
  if (typeof SmdApps === "undefined") return;
  // The grid shows every app ticked "Show on Launch", in the Menu order set on
  // the settings Menu tab.
  SmdApps.launchApps().forEach(app => {
    const col = document.createElement("div");
    col.className = "col";

    const tile = document.createElement("a");
    tile.className = "app-tile card smd-card border-0 h-100 d-flex flex-column text-decoration-none";
    tile.href = SmdApps.href(app.path) || "./";

    // Same card pattern as pmd-job-today-card: a bordered rounded surface holding
    // the content, on the theme's card background.
    const card = document.createElement("div");
    card.className = "d-flex flex-column flex-grow-1 align-items-center justify-content-center text-center gap-2 p-4 border rounded-3";

    const img = document.createElement("smd-image");
    img.setAttribute("key-prefix", smdImagePrefix());
    img.setAttribute("image", app.icon);
    img.setAttribute("alt", "");
    // No explicit `size`: the tile follows the Settings Icon size (the app
    // applies SmdImage.setDefaultSize from launch_iconSize at boot).

    const name = document.createElement("smd-h2");
    name.className = "fw-bold mb-0";
    name.textContent = app.name;

    const desc = document.createElement("div");
    desc.className = "small text-body mb-0";
    desc.textContent = app.description;

    card.appendChild(img);
    card.appendChild(name);
    card.appendChild(desc);

    tile.appendChild(card);
    col.appendChild(tile);
    grid.appendChild(col);
  });
  // Re-render once the shared sample library is seeded on first visit.
  if (grid.__launchSeedTimeout) return;
  grid.__launchSeedTimeout = setInterval(() => {
    if (!localStorage.getItem(smdImagesKey())) return;
    clearInterval(grid.__launchSeedTimeout);
    grid.__launchSeedTimeout = null;
    document.querySelectorAll("#appGrid smd-image").forEach(el => el.refresh());
  }, 200);
}

// Image size setting -> the shared <smd-image> render size (px), wired as a
// VALUE (one unified six-size scheme across every app).
function applyImageSize() {
  smdApplyImageSize();
}

// -------------------------------
// SETTINGS PAGE
// -------------------------------

function getSettingsSections() {
  return smdGetSettingsSections();
}

function buildSettingsContent() {
  smdBuildSettingsPage();
}

function openSettings() {
  smdSetupSettingsPage({ restore: renderAppMenuTab, dangerIds: launchDangerIds() });
}

// Danger rows toggled by the "Show danger" switch (shared worker mode + the two
// app actions). Kept in the canonical Danger order - see AGENTS.md.
function launchDangerIds() {
  return ["noCacheRow", "refreshAppRow", "clearAllDataRow"];
}

function changeShowDanger(enabled) {
  smdChangeShowDanger(enabled, launchDangerIds());
}

// Clear ONLY Launch's own data (its storage prefix). The shared app-menu config
// (`launch_appMenu`) and the shared image library live outside that prefix, so
// both are deliberately kept.
function confirmClearAllData() {
  smdConfirmClearAllData({ content: "Clear ALL Launch data? This cannot be undone." });
}

function closeSettings() {
  smdHideSettingsPage();
}

// -------------------------------
// SETTINGS: MENU TAB
// -------------------------------

var appMenuSortable = null;

// Render the re-orderable app list (one <launch-app-menu> per app, in the stored
// Menu order) into the settings Menu tab.
function renderAppMenuTab() {
  const list = $id("appMenuList");
  if (!list || typeof SmdApps === "undefined") return;
  list.innerHTML = "";
  SmdApps.entries().forEach(app => {
    const tile = document.createElement("launch-app-menu");
    tile.setAttribute("path", app.path);
    tile.setAttribute("name", app.name);
    tile.setAttribute("icon", app.icon);
    tile.setAttribute("key-prefix", smdImagePrefix());
    if (app.onLaunch) tile.setAttribute("on-launch", "");
    if (app.onMenu) tile.setAttribute("on-menu", "");
    list.appendChild(tile);
  });
  initAppMenuSortable();
}

// Drag to reorder (Sortable; the drag handle is the only grab target). The Launch
// grid follows the Menu order, so it re-renders on every drop.
function initAppMenuSortable() {
  const list = $id("appMenuList");
  if (!list || typeof Sortable === "undefined") return;
  if (appMenuSortable) { appMenuSortable.destroy(); appMenuSortable = null; }
  appMenuSortable = new Sortable(list, {
    handle: ".drag-handle",
    animation: 150,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 0,
    onEnd: function () {
      const paths = Array.from(list.querySelectorAll("launch-app-menu"))
        .map(el => el.getAttribute("path") || "");
      SmdApps.reorder(paths);
      renderAppGrid();
    }
  });
}

// A tile tick changed: persist it and keep the grid in step.
function onAppMenuChange(e) {
  const detail = e.detail || {};
  if (typeof detail.path !== "string") return;
  SmdApps.setFlag(detail.path, detail.field, detail.value);
  if (detail.field === "onLaunch") renderAppGrid();
}

// -------------------------------
// BOOT
// -------------------------------

document.addEventListener("DOMContentLoaded", () => {
  applyImageSize();
  applyTheme(getStoredTheme());

  // Delegated: the settings page rebuilds its Menu tab on every open, so bind the
  // tile-tick handler on the persistent page element.
  const settingsPage = document.getElementById("settingsPage");
  if (settingsPage) settingsPage.addEventListener("launch-app-menu-change", onAppMenuChange);

  renderAppGrid();
  // Seed the shared sample library on first visit so the tiles' <smd-image>
  // icons resolve by name; renderAppGrid's interval re-renders once it lands.
  if (typeof seedSampleImages === "function") seedSampleImages();

  document.addEventListener("smd-theme-change", e => {
    const detail = e.detail || {};
    if (detail.source === "mode" && typeof changeThemeMode === "function") {
      changeThemeMode(detail.mode);
    } else if (detail.theme && typeof changeTheme === "function") {
      changeTheme(detail.theme);
    }
  });
});
