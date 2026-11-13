SmdConfig.storagePrefix = "bigtext_";
SmdConfig.imagePrefix = "shared-";
SmdConfig.appName = "BigText";

const BIG_TEXT_DEFAULT_FONT = "atkinson";
const BIG_TEXT_FONTS = {
  atkinson: "'Atkinson Hyperlegible Next', Arial, sans-serif",
  inter: "'Inter', Arial, sans-serif",
  roboto: "'Roboto', Arial, sans-serif",
  lato: "'Lato', Arial, sans-serif",
  montserrat: "'Montserrat', Arial, sans-serif",
  opensans: "'Open Sans', Arial, sans-serif",
  sourcesans: "'Source Sans Pro', Arial, sans-serif",
  nunito: "'Nunito', Arial, sans-serif",
  ubuntu: "'Ubuntu', Arial, sans-serif",
  newscycle: "'News Cycle', Arial, sans-serif",
  neucha: "'Neucha', cursive",
  cabinsketch: "'Cabin Sketch', cursive",
  arial: "Arial, Helvetica, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  times: "'Times New Roman', Times, serif",
  monospace: "Consolas, 'Courier New', monospace"
};

function bigTextFont() {
  const saved = localStorage.getItem(smdKey("textFont"));
  return Object.prototype.hasOwnProperty.call(BIG_TEXT_FONTS, saved) ? saved : BIG_TEXT_DEFAULT_FONT;
}

function changeBigTextFont(value) {
  const font = Object.prototype.hasOwnProperty.call(BIG_TEXT_FONTS, value) ? value : BIG_TEXT_DEFAULT_FONT;
  localStorage.setItem(smdKey("textFont"), font);
  document.getElementById("bigTextDisplay").setAttribute("font-family", BIG_TEXT_FONTS[font]);
}

function commitBigText(input) {
  if (!input.value.trim()) {
    input.setCustomValidity("Enter some text to display.");
    input.reportValidity();
    return false;
  }
  input.setCustomValidity("");
  const display = document.getElementById("bigTextDisplay");
  display.value = input.value;
  display.hidden = false;
  display.focus({ preventScroll: true });
  display.fit();
  return true;
}

function editBigText() {
  const page = document.getElementById("textEditPage");
  page.title = "Text";
  page.content = '<textarea id="editBigTextInput" class="form-control" aria-label="Text" placeholder="Type your message…" required></textarea>';
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel", close: false },
    { text: "OK", variant: "success", action: "ok", close: false }
  ];
  const input = document.getElementById("editBigTextInput");
  input.value = document.getElementById("bigTextDisplay").value;
  input.addEventListener("input", function () { input.setCustomValidity(""); });
  page.show();
  requestAnimationFrame(function () { input.focus(); });
}

function openSettings() {
  smdSetupSettingsPage({
    dangerIds: ["noCacheRow", "refreshAppRow", "clearAllDataRow"],
    restore: function () { document.getElementById("bigTextFont").value = bigTextFont(); }
  });
}

function closeSettings() {
  smdHideSettingsPage();
  document.getElementById("bigTextDisplay").fit();
}

function changeShowDanger(enabled) {
  smdChangeShowDanger(enabled, ["noCacheRow", "refreshAppRow", "clearAllDataRow"]);
}

function confirmClearAllData() {
  smdConfirmClearAllData({ content: "Clear all BigText text and settings?", onClear: function () { location.reload(); } });
}

document.addEventListener("DOMContentLoaded", function () {
  applyTheme(getStoredTheme());
  document.getElementById("textEditPage").addEventListener("smd-page-action", function (event) {
    const action = event.detail && event.detail.action;
    if (action === "cancel" || (action === "ok" && commitBigText(document.getElementById("editBigTextInput")))) {
      this.hide();
    }
  });
  document.getElementById("bigTextDisplay").setAttribute("font-family", BIG_TEXT_FONTS[bigTextFont()]);
});
