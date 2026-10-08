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

// The apps shown on the launch grid. Add a row when an app is added. Each
// `icon` is the NAME of a shared sample image (seeded into `shared-images`),
// rendered by <smd-image> rather than a raw file path.
var LAUNCH_APPS = [
  {
    name: "Plan My Day",
    description: "Plan your day and track important events",
    path: "PlanMyDay/",
    icon: "Plan My Day"
  },
  {
    name: "Count My Days",
    description: "Track countdowns to important events",
    path: "CountMyDays/",
    icon: "Count My Days"
  },
  {
    name: "QR Links",
    description: "Share links as QR codes",
    path: "QRLinks/",
    icon: "QR Links"
  },
  {
    name: "Solar Controlar",
    description: "Solar energy monitoring dashboard",
    path: "SolarControlar/",
    icon: "Solar Controlar"
  },
  {
    name: "FreeFormOX",
    description: "A tactical 5x5 Tic-Tac-Toe game",
    path: "FreeFormOX/",
    icon: "Noughts & Crosses"
  },
  {
    name: "Phone Buttons",
    description: "Remote key control for your PC",
    path: "PhoneButtons/",
    icon: "Home Server"
  }
];

function renderAppGrid() {
  const grid = document.getElementById("appGrid");
  if (!grid) return;
  grid.innerHTML = "";
  LAUNCH_APPS.forEach(app => {
    const col = document.createElement("div");
    col.className = "col";

    const tile = document.createElement("a");
    tile.className = "app-tile card smd-card border-0 h-100 d-flex flex-column text-decoration-none";
    tile.href = app.path;

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
  smdSetupSettingsPage();
}

function closeSettings() {
  smdHideSettingsPage();
}

// -------------------------------
// BOOT
// -------------------------------

document.addEventListener("DOMContentLoaded", () => {
  applyImageSize();
  applyTheme(getStoredTheme());
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
