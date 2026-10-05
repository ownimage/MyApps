// CountMyDays — the settings page (General / G Cal / Danger tabs) plus the
// app-specific settings handlers. Generic appearance settings (theme, font
// size, icon size, density, auto-hide) live in shared/js/smd-settings.js.

// Danger-tab rows toggled by the shared "Show danger" switch.
const CMD_DANGER_IDS = ["gcalDangerRow", "uploadStandardImagesRow", "clearAllDataRow", "refreshAppRow"];

function changeFormat(value) {
  localStorage.setItem(smdKey("countdownFormat"), value);
}

// -------------------------------
// GOOGLE CALENDAR SETTINGS
// -------------------------------

function changeGCalEnabled(enabled) {
  localStorage.setItem(smdKey("gcal_enabled"), enabled);
  setGCalVisible(enabled);
}

function saveGCalSettings() {
  const nameInput = $id("gcalName");
  const clientIdInput = $id("gcalClientId");
  const calIdInput = $id("gcalCalendarId");
  if (nameInput) localStorage.setItem(smdKey("gcal_name"), nameInput.value.trim());
  if (clientIdInput) localStorage.setItem(smdKey("gcal_client_id"), clientIdInput.value.trim());
  if (calIdInput) localStorage.setItem(smdKey("gcal_calendar_id"), calIdInput.value.trim() || "primary");
}

function setGCalVisible(enabled) {
  const options = $id("gcalOptions");
  if (options) options.classList.toggle("d-none", !enabled);
  document.querySelectorAll(".google-menu-item").forEach(el => {
    el.classList.toggle("d-none", !enabled);
  });
}

function changeMaxCountdowns(value) {
  localStorage.setItem(smdKey("maxCountdowns"), value);
}

function changeShowDanger(enabled) {
  smdChangeShowDanger(enabled, CMD_DANGER_IDS);
}

function toggleDangerRows(enabled) {
  smdToggleDangerRows(enabled, CMD_DANGER_IDS);
}

// Icon size setting -> the shared <smd-image> render size (px). CountMyDays
// uses the same six sizes as every other app (32/40/50/64/80/100); narrow
// screens cap the size (the original app shrank its thumbnails in a
// max-width:480px media query).
function applyImageSize() {
  smdApplyImageSize(true);
}

function getSettingsSections() {
  return smdGetSettingsSections();
}

function buildSettingsContent() {
  smdBuildSettingsPage();
}

function openSettings() {
  hideMainPages("settingsPage");
  smdSetupSettingsPage({
    dangerIds: CMD_DANGER_IDS,
    restore: function () {
      const savedFormat = localStorage.getItem(smdKey("countdownFormat")) || "days";
      const formatSel = $id("formatSelector");
      if (formatSel) formatSel.value = savedFormat;

      const savedMax = localStorage.getItem(smdKey("maxCountdowns")) || "10";
      const maxSel = $id("maxCountdownsSelector");
      if (maxSel) maxSel.value = savedMax;

      // Google Calendar settings
      const gcalName = $id("gcalName");
      if (gcalName) gcalName.value = localStorage.getItem(smdKey("gcal_name")) || "";
      const gcalClientId = $id("gcalClientId");
      if (gcalClientId) gcalClientId.value = localStorage.getItem(smdKey("gcal_client_id")) || "";
      const gcalCalId = $id("gcalCalendarId");
      if (gcalCalId) gcalCalId.value = localStorage.getItem(smdKey("gcal_calendar_id")) || "primary";
      const gcalEnabled = isGCalEnabled();
      const gcalEnabledCb = $id("gcalEnabled");
      if (gcalEnabledCb) gcalEnabledCb.checked = gcalEnabled;
      setGCalVisible(gcalEnabled);
    }
  });
}

function closeSettings() {
  smdHideSettingsPage();
  document.getElementById("countdownContainer").classList.remove("d-none");
  resetShowAll();
  renderMain();
}

function confirmClearAllData() {
  smdConfirmClearAllData({ content: "Clear ALL Count My Days data? This cannot be undone." });
}
