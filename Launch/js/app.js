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

// The apps shown on the launch grid. Add a row when an app is added.
var LAUNCH_APPS = [
  {
    name: "Plan My Day",
    description: "Plan your day and track important events",
    path: "PlanMyDay/",
    icon: "PlanMyDay/icon-192.png"
  },
  {
    name: "Count My Days",
    description: "Track countdowns to important events",
    path: "CountMyDays/",
    icon: "CountMyDays/icon-192.png"
  },
   {
     name: "QR Links",
     description: "Share links as QR codes",
     path: "QRLinks/",
     icon: "QRLinks/icon-192.png"
   },
   {
     name: "FreeFormOX",
     description: "A tactical 5x5 Tic-Tac-Toe game",
     path: "FreeFormOX/",
     icon: "shared/sampleImages/Noughts_%26_Crosses.svg"
   }
];

function renderAppGrid() {
  const grid = document.getElementById("appGrid");
  if (!grid) return;
  grid.innerHTML = "";
  LAUNCH_APPS.forEach(app => {
    const tile = document.createElement("a");
    tile.className = "app-tile";
    tile.href = app.path;

    const img = document.createElement("img");
    img.src = app.icon;
    img.alt = "";
    img.width = 80;
    img.height = 80;

    const name = document.createElement("div");
    name.className = "app-name";
    name.textContent = app.name;

    const desc = document.createElement("div");
    desc.className = "app-desc";
    desc.textContent = app.description;

    tile.appendChild(img);
    tile.appendChild(name);
    tile.appendChild(desc);
    grid.appendChild(tile);
  });
}

// Icon size setting -> the shared <smd-image> render size (px), wired as a
// VALUE (matches the other apps' behaviour).
function applyImageSize() {
  const value = localStorage.getItem(smdKey("iconSize")) || "large";
  const px = { small: 48, medium: 64, large: 80 }[value] || 80;
  if (typeof SmdImage !== "undefined" && SmdImage.setDefaultSize) {
    SmdImage.setDefaultSize(px);
  }
}

// -------------------------------
// SETTINGS PAGE
// -------------------------------

let _settingsSections = null;
let _settingsFooterHtml = null;
let _settingsCloseTimer = null;

function getSettingsSections() {
  if (_settingsSections) return { sections: _settingsSections, footerHtml: _settingsFooterHtml };
  const template = document.getElementById("settingsTemplate");
  if (!template) return { sections: [], footerHtml: "" };
  const clone = template.content.cloneNode(true);
  _settingsSections = Array.from(clone.querySelectorAll(".smd-settings-tab")).map(sec => ({
    id: sec.dataset.tabId || null,
    title: sec.dataset.tab,
    content: sec.innerHTML
  }));
  const footer = clone.querySelector("#settingsFooter");
  _settingsFooterHtml = (footer ? footer.outerHTML : "").replace(
    'id="buildNumber"></span>',
    'id="buildNumber">' + (typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "") + '</span>'
  );
  template.remove();
  return { sections: _settingsSections, footerHtml: _settingsFooterHtml };
}

function buildSettingsContent() {
  const settingsPage = document.getElementById("settingsPage");
  if (!settingsPage) return;
  const { sections, footerHtml } = getSettingsSections();

  settingsPage.title = "Settings";
  settingsPage.content = '<smd-tabs id="settingsTabs"></smd-tabs>' + footerHtml;
  settingsPage.buttons = [{ text: "Done", variant: "success", action: "done" }];

  const tabsEl = $id("settingsTabs");
  if (tabsEl) {
    tabsEl.tabs = sections;
    tabsEl.bottomline = true;
  }
  injectSettingsStyles();
}

function openSettings() {
  const page = document.getElementById("settingsPage");
  if (!page) return;
  if (_settingsCloseTimer) {
    clearTimeout(_settingsCloseTimer);
    _settingsCloseTimer = null;
  }
  page.classList.remove("d-none");
  if (!page.__bound) {
    page.__bound = true;
    page.addEventListener("smd-page-action", e => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "done") closeSettings();
    });
  }
  buildSettingsContent();
  page.show();

  const savedTheme = localStorage.getItem(smdKey("theme")) || "darkly";
  const themeSel = $id("themeSelector");
  if (themeSel) themeSel.setAttribute("theme", savedTheme);

  const savedIconSize = localStorage.getItem(smdKey("iconSize")) || "large";
  const iconSel = $id("iconSizeSelector");
  if (iconSel) iconSel.value = savedIconSize;
}

function closeSettings() {
  const page = document.getElementById("settingsPage");
  if (page) {
    page.hide();
    if (_settingsCloseTimer) clearTimeout(_settingsCloseTimer);
    _settingsCloseTimer = setTimeout(() => {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
}

// -------------------------------
// BOOT
// -------------------------------

document.addEventListener("DOMContentLoaded", () => {
  applyImageSize();
  applyTheme(localStorage.getItem(smdKey("theme")) || "darkly");
  renderAppGrid();

  document.addEventListener("smd-theme-change", e => {
    const theme = e.detail && e.detail.theme;
    if (theme && typeof changeTheme === "function") changeTheme(theme);
  });
});
