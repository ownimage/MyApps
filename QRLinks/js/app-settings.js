// QRLinks — the settings page (General / Danger tabs) plus the app-specific
// settings handlers. Generic appearance settings (theme, font size, icon size,
// density, auto-hide) live in shared/js/smd-settings.js.

// Danger-tab rows toggled by the shared "Show danger" switch.
const QRLINK_DANGER_IDS = ["loadSampleLinksRow", "uploadStandardImagesRow", "clearAllDataRow", "refreshAppRow"];

function changeShowDanger(enabled) {
  smdChangeShowDanger(enabled, QRLINK_DANGER_IDS);
}

function toggleDangerRows(enabled) {
  smdToggleDangerRows(enabled, QRLINK_DANGER_IDS);
}

// Icon size setting -> the shared <smd-image> render size (px), wired as a
// VALUE; narrow screens cap the size.
function applyImageSize() {
  smdApplyImageSize(true);
}

function getSettingsSections() {
  return smdGetSettingsSections();
}

function buildSettingsContent() {
  smdBuildSettingsPage(typeof QRLINK_EDITOR_STYLES !== "undefined" ? QRLINK_EDITOR_STYLES : undefined);
}

function openSettings() {
  hideMainPages("settingsPage");
  smdSetupSettingsPage({ dangerIds: QRLINK_DANGER_IDS });
}

function closeSettings() {
  smdHideSettingsPage();
  document.getElementById("countdownContainer").classList.remove("d-none");
  renderMain();
}

// Danger tab: replace the current links with the bundled sample set.
function loadSampleLinks() {
  const v = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now();
  fetch("sampleLinks.json?v=" + v)
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(data => {
      const links = (data && data.streams) || data.links || [];
      links.forEach((link, i) => { link.sequence = i + 1; });
      saveLinks(links);
      closeSettings();
      renderMain();
      showSmdModal({
        title: "Sample Links",
        content: "Sample links loaded.",
        buttons: [{ text: "OK", variant: "primary", action: "ok" }]
      });
    })
    .catch(err => {
      showSmdModal({
        title: "Sample Links",
        content: "Failed to load sample links: " + escapeHtml(err.message),
        buttons: [{ text: "OK", variant: "primary", action: "ok" }]
      });
    });
}

// Clear this app's own data. The shared image library is NOT touched (other
// apps use it too).
function confirmClearAllData() {
  smdConfirmClearAllData({ content: "Clear ALL QRLinks data (links and settings)? This cannot be undone." });
}
