// OneDrive (Microsoft Graph) integration, shared by PlanMyDay, CountMyDays,
// ListOfLists and Storyboard.
//
// PHASE 1 (this file today): the OneDrive settings fields, the FileSync menu
// gating and the "Open from OneDrive" page shell. Sign-in (MSAL), folder
// navigation, save and open are phase 2+; those helpers below are the single
// place that work lands, so the UI never has to change again.
//
// STORAGE
//   per app   smdKey("onedrive_enabled") / smdKey("onedrive_directory")
//   origin    smd_onedrive_clientId / smd_onedrive_tenant (+ the MSAL token
//             cache in phase 2). ONE Azure app registration and ONE sign-in
//             cover every MyApps PWA on this origin, while each app keeps its
//             own backups directory.
//
// The Client ID comes from an Azure app registration (Single-page application
// platform, delegated Files.ReadWrite). It is deliberately a settings field,
// not a hardcoded constant: the registration belongs to the person deploying
// the app.

var ONE_DRIVE_DEFAULT_TENANT = "common";

function oneDriveGlobalKey(name) {
  return "smd_onedrive_" + name;
}

// Same shape as minioNormalizeDirectory(): forward slashes, no leading or
// trailing slash, no empty/"."/".." segments, so the field, the save path and
// the folder browser always agree.
function oneDriveNormalizeDirectory(value) {
  return String(value == null ? "" : value)
    .replace(/\\/g, "/")
    .split("/")
    .map(function (part) { return part.trim(); })
    .filter(function (part) { return part && part !== "." && part !== ".."; })
    .join("/");
}

// Each app starts in its own folder so a backup never lands loose in the
// OneDrive root. An app can override it with SmdConfig.oneDriveDefaultDirectory;
// an empty stored value means "the OneDrive root" (the user can clear the field).
function oneDriveDefaultDirectory() {
  if (typeof SmdConfig !== "undefined" && SmdConfig.oneDriveDefaultDirectory) {
    return oneDriveNormalizeDirectory(SmdConfig.oneDriveDefaultDirectory);
  }
  return "MyApps";
}

function getOneDriveConfig() {
  var storedDirectory = localStorage.getItem(smdKey("onedrive_directory"));
  return {
    enabled: localStorage.getItem(smdKey("onedrive_enabled")) === "true",
    directory: storedDirectory === null
      ? oneDriveDefaultDirectory()
      : oneDriveNormalizeDirectory(storedDirectory),
    clientId: localStorage.getItem(oneDriveGlobalKey("clientId")) || "",
    tenant: localStorage.getItem(oneDriveGlobalKey("tenant")) || ONE_DRIVE_DEFAULT_TENANT,
    // Phase 2 fills this from the MSAL account cache.
    account: localStorage.getItem(oneDriveGlobalKey("account")) || ""
  };
}

function oneDriveIsConfigured() {
  return !!getOneDriveConfig().clientId;
}

// ---- Settings fields -------------------------------------------------------

function changeOneDriveEnabled(enabled) {
  localStorage.setItem(smdKey("onedrive_enabled"), String(enabled));
  updateFileSyncMenu();
  refreshOneDriveSettingsUi();
}

function changeOneDriveDirectory(value) {
  localStorage.setItem(smdKey("onedrive_directory"), oneDriveNormalizeDirectory(value));
}

function changeOneDriveClientId(value) {
  localStorage.setItem(oneDriveGlobalKey("clientId"), String(value == null ? "" : value).trim());
  refreshOneDriveSettingsUi();
}

function changeOneDriveTenant(value) {
  var tenant = String(value == null ? "" : value).trim() || ONE_DRIVE_DEFAULT_TENANT;
  localStorage.setItem(oneDriveGlobalKey("tenant"), tenant);
  refreshOneDriveSettingsUi();
}

function loadOneDriveSettings() {
  var config = getOneDriveConfig();
  var cb = $id("oneDriveEnabled");
  if (cb) cb.checked = config.enabled;
  var dir = $id("oneDriveDirectory");
  if (dir) dir.value = config.directory;
  var clientId = $id("oneDriveClientId");
  if (clientId) clientId.value = config.clientId;
  var tenant = $id("oneDriveTenant");
  if (tenant) tenant.value = config.tenant;
  refreshOneDriveSettingsUi();
}

// Account row: label + Sign in / Sign out state.
function refreshOneDriveSettingsUi() {
  var config = getOneDriveConfig();
  var account = $id("oneDriveAccount");
  if (account) {
    account.textContent = config.account
      ? config.account
      : (config.clientId ? "Not signed in" : "No Client ID configured");
  }
  var signIn = $id("btnOneDriveSignIn");
  if (signIn) signIn.toggleAttribute("disabled", !!config.account || !config.clientId);
  var signOut = $id("btnOneDriveSignOut");
  if (signOut) signOut.toggleAttribute("disabled", !config.account);
}

function showOneDriveAlert(message, type) {
  type = type || "info";
  var text = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  showSmdModal({
    title: type === "error" ? "OneDrive Error" : "OneDrive",
    content: '<p style="margin:0">' + text + '</p>',
    buttons: [
      { text: "OK", variant: type === "error" ? "danger" : "primary", action: "ok" }
    ]
  });
}

// Phase 2 replaces the bodies of these two with MSAL loginPopup/logoutPopup.
function signInToOneDrive() {
  var config = getOneDriveConfig();
  if (!config.clientId) {
    showOneDriveAlert("Add the Azure app registration Client ID in Settings > FileSync > OneDrive first.", "error");
    return;
  }
  showOneDriveAlert("OneDrive sign-in will be enabled in the next update.", "info");
}

function signOutOfOneDrive() {
  showOneDriveAlert("OneDrive sign-in will be enabled in the next update.", "info");
}

// ---- Hamburger menu --------------------------------------------------------

function updateOneDriveMenu() {
  var enabled = getOneDriveConfig().enabled;
  var items = document.querySelectorAll(".onedrive-menu-item");
  for (var i = 0; i < items.length; i++) {
    items[i].style.display = enabled ? "" : "none";
  }
}

// ---- Open from OneDrive page ----------------------------------------------

var _oneDriveCloseTimer = null;

var ONEDRIVE_PAGE_STYLES = `
  #oneDriveBody .od-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }
  #oneDriveBody .od-crumbs {
    color: var(--bs-secondary-color, #6c757d);
    word-break: break-word;
  }
  #oneDriveBody .od-status {
    text-align: center;
    padding: 2.5rem 1rem;
  }
  #oneDriveBody .od-status p { margin: 0.5rem 0 0; }
  #oneDriveBody .od-status button { margin-top: 1rem; }
  /* MINIO_IMPORT_STYLES makes every .btn transparent (it is written for the
     outline buttons on the MinIO page). A primary action needs the real theme
     surface, or the theme's primary text colour (dark on superhero's orange)
     lands on the page background. */
  #oneDriveBody .btn-primary {
    background-color: var(--bs-primary);
    border-color: var(--bs-primary);
  }
`;

function oneDriveBreadcrumb(directory) {
  var parts = ["OneDrive"].concat(oneDriveNormalizeDirectory(directory).split("/").filter(Boolean));
  return parts.map(function (part) { return escapeHtml(part); }).join(" / ");
}

function oneDriveStatusHtml(config) {
  if (!config.clientId) {
    return '<div class="od-status">' +
      '<p><strong>OneDrive is not configured.</strong></p>' +
      '<p>Add the Azure app registration Client ID in Settings &gt; FileSync &gt; OneDrive.</p>' +
      '<button class="btn btn-primary" onclick="openOneDriveSettings()">Open Settings</button>' +
      '</div>';
  }
  if (!config.account) {
    return '<div class="od-status">' +
      '<p><strong>Not signed in to OneDrive.</strong></p>' +
      '<p>Sign in with your Microsoft 365 account to browse your backups.</p>' +
      '<button class="btn btn-primary" onclick="signInToOneDrive()">Sign in</button>' +
      '</div>';
  }
  // Phase 2 replaces this branch with the folder listing.
  return '<div class="od-status">' +
    '<p><strong>Connected as ' + escapeHtml(config.account) + '.</strong></p>' +
    '<p>Folder browsing will be enabled in the next update.</p>' +
    '</div>';
}

function renderOneDrivePage() {
  var body = $id("oneDriveBody");
  if (!body) return;
  var config = getOneDriveConfig();
  body.innerHTML =
    '<div class="od-toolbar">' +
      '<button class="btn btn-sm btn-outline-secondary" disabled title="Up">Up</button>' +
      '<button class="btn btn-sm btn-outline-secondary" onclick="renderOneDrivePage()">Refresh</button>' +
      '<span class="od-crumbs">' + oneDriveBreadcrumb(config.directory) + '</span>' +
    '</div>' +
    oneDriveStatusHtml(config);
}

function openOneDrivePage() {
  var page = document.getElementById("oneDriveImportPage");
  if (!page) return;
  clearTimeout(_oneDriveCloseTimer);
  if (!page.__oneDriveBound) {
    page.__oneDriveBound = true;
    page.addEventListener("smd-page-action", function () { closeOneDrivePage(); });
  }
  page.classList.remove("d-none");
  page.title = "Open from OneDrive";
  page.headerHtml = "";
  page.content = '<div id="oneDriveBody"></div>';
  page.buttons = [{ text: "Close", variant: "secondary", action: "cancel" }];
  if (typeof MINIO_IMPORT_STYLES === "string") injectStyleInto(MINIO_IMPORT_STYLES);
  injectStyleInto(ONEDRIVE_PAGE_STYLES);
  page.show();
  renderOneDrivePage();
}

function closeOneDrivePage() {
  var page = document.getElementById("oneDriveImportPage");
  if (!page) return;
  page.hide();
  clearTimeout(_oneDriveCloseTimer);
  _oneDriveCloseTimer = setTimeout(function () {
    page.classList.add("d-none");
  }, Math.max(0, (page.slideDuration || 0) + 50));
}

// Shortcut from the page's "not configured" state: close the page, open
// Settings and land on FileSync > OneDrive.
function openOneDriveSettings() {
  closeOneDrivePage();
  if (typeof openSettings !== "function") return;
  openSettings();
  if (typeof focusFileSyncSettingsTab === "function") focusFileSyncSettingsTab("onedrive");
}

// ---- Save / Open entry points (phase 2+) ----------------------------------

// The hamburger's Save entry. Phase 2 adds the app hooks + Graph upload; for
// now it explains the missing configuration instead of failing silently.
function saveToOneDrive() {
  var config = getOneDriveConfig();
  if (!config.enabled) return;
  if (!config.clientId) {
    showOneDriveAlert("Add the Azure app registration Client ID in Settings > FileSync > OneDrive first.", "error");
    return;
  }
  showOneDriveAlert("OneDrive saving will be enabled once sign-in is connected.", "info");
}
