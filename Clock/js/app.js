SmdConfig.storagePrefix = "clock_";

var CLOCK_FONT_FAMILIES = {
  flip: "Arial Black, Arial, sans-serif",
  seven: "'Courier New', monospace",
  arial: "Arial, sans-serif",
  courier: "'Courier New', monospace",
  mondaine: "'Clock Inter', Arial, sans-serif",
  nixie: "'Clock Inter', Arial, sans-serif"
};
var clockTimer = null;
var clockDrag = null;
var clockLastText = null;
var clockLastStyle = null;

function clockSetting(name, fallback) {
  return localStorage.getItem(smdKey(name)) || fallback;
}

// Measure one natural layout, then apply a single scale to the whole clock.
function fitClockLayout() {
  var display = document.getElementById("clockDisplay");
  var surface = document.getElementById("clockMain");
  var group = document.getElementById("clockFaceGroup");
  var date = document.getElementById("clockDate");
  var main = surface && surface.parentElement;
  if (!display || !surface || !group || !date || !main) return;
  group.style.setProperty("--clock-group-scale", "1");
  var width = display.getBoundingClientRect().width;
  if (!width) return;
  group.style.width = width + "px";
  date.style.setProperty("--clock-date-scale", "1");
  date.style.marginBottom = "0px";
  if (!date.classList.contains("d-none") && date.offsetWidth) {
    var dateBounds = date.getBoundingClientRect();
    var dateScale = width / dateBounds.width;
    date.style.setProperty("--clock-date-scale", String(dateScale));
    date.style.marginBottom = (dateBounds.height * (dateScale - 1)) + "px";
  }
  var top = Math.max(0, main.getBoundingClientRect().top);
  main.style.height = Math.max(0, window.innerHeight - top) + "px";
  var style = getComputedStyle(main);
  var availableWidth = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  var availableHeight = main.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  var height = group.getBoundingClientRect().height;
  if (!height || availableWidth <= 0 || availableHeight <= 0) return;
  var scale = Math.min(availableWidth / width, availableHeight / height);
  group.style.setProperty("--clock-group-scale", String(scale));
  surface.style.width = (width * scale) + "px";
  surface.style.height = (height * scale) + "px";
}
function fitClockDate() { fitClockLayout(); }
function fitClockDisplay() { fitClockLayout(); }

function formatClockTime(date) {
  var mode = clockSetting("format", "24");
  var hours = date.getHours();
  if (mode === "12") hours = hours % 12 || 12;
  var value = String(hours).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
  if (clockSetting("showSeconds", "true") !== "false") {
    value += ":" + String(date.getSeconds()).padStart(2, "0");
  }
  return value;
}

function updateClockColon() {
  var hidden = clockSetting("colonMode", "always") === "flashing" && Math.floor(Date.now() / 1000) % 2 === 1;
  document.querySelectorAll("#clockDisplay .seven-colon").forEach(function (colon) {
    colon.style.opacity = hidden ? "0" : "1";
  });
}

function syncClockColonSetting() {
  var row = document.getElementById("clockColonModeRow");
  if (row) row.classList.toggle("d-none", clockSetting("font", "flip") !== "seven");
  var textRow = document.getElementById("clockMondaineTextFontRow");
  if (textRow) textRow.classList.toggle("d-none", !["mondaine", "nixie"].includes(clockSetting("font", "flip")));
  var selector = document.getElementById("clockMondaineTextFont");
  if (selector) selector.value = clockSetting("mondaineTextFont", "inter");
}

function changeClockColonMode(value) {
  localStorage.setItem(smdKey("colonMode"), value === "flashing" ? "flashing" : "always");
  updateClockColon();
}

function renderClock() {
  var display = document.getElementById("clockDisplay");
  if (!display) return;
  var font = clockSetting("font", "flip");
  var style = CLOCK_FONT_FAMILIES[font] ? font : "flip";
  display.className = "flip-clock clock-style-" + style + (clockSetting("showBoxes", "true") === "false" ? " clock-no-boxes" : "");
  var text = formatClockTime(new Date());
  var previousText = clockLastStyle === style ? clockLastText : null;
  document.getElementById("clockMain").classList.toggle("clock-mondaine-layout", style === "mondaine");
  if (style === "mondaine") {
    renderMondaineClock(display);
  } else if (style === "nixie") {
    renderNixieClock(display, text);
  } else {
  display.innerHTML = "";
  text.split("").forEach(function (character, index) {
    if (character === ":") {
      var separator = document.createElement("span");
      separator.className = style === "seven" ? "seven-colon" : "flip-separator";
      separator.textContent = ":";
      display.appendChild(separator);
      return;
    }
    var digit = document.createElement("span");
    digit.className = "flip-digit";
    if (style === "seven") {
      digit.className += " seven-digit";
      digit.textContent = character;
    } else if (style === "flip") {
      digit.className += " split-flap-digit";
      digit.setAttribute("aria-label", character);
      var surface = document.createElement("span");
      surface.className = "split-flap-surface";
      ["top", "bottom"].forEach(function (halfName) {
        var half = document.createElement("span");
        half.className = "split-flap-half split-flap-" + halfName;
        var glyph = document.createElement("span");
        glyph.className = "split-flap-glyph";
        glyph.textContent = character;
        half.appendChild(glyph);
        surface.appendChild(half);
      });
      var previous = previousText && previousText[index];
      if (previous && previous !== character) {
        digit.classList.add("split-flap-changing");
        var falling = document.createElement("span");
        falling.className = "split-flap-half split-flap-top split-flap-falling";
        var fallingGlyph = document.createElement("span");
        fallingGlyph.className = "split-flap-glyph";
        fallingGlyph.textContent = previous;
        falling.appendChild(fallingGlyph);
        surface.appendChild(falling);
      }
      var seam = document.createElement("span");
      seam.className = "split-flap-seam";
      surface.appendChild(seam);
      digit.appendChild(surface);
    } else {
      digit.textContent = character;
    }
    display.appendChild(digit);
  });
  }
  updateClockColon();
  clockLastText = text;
  clockLastStyle = style;
  fitClockDisplay();
  var date = document.getElementById("clockDate");
  if (date) {
    date.classList.toggle("clock-date-seven", style === "seven");
    var now = new Date();
    var weekday = now.toLocaleDateString(undefined, { weekday: "short" });
    var day = now.toLocaleDateString(undefined, { day: "numeric" });
    var month = now.toLocaleDateString(undefined, { month: "short" });
    var year = now.toLocaleDateString(undefined, { year: "numeric" });
    date.textContent = weekday + ", " + day + " " + month + ", " + year;
    date.classList.toggle("d-none", clockSetting("showDate", "true") === "false");
    if (style === "mondaine") fitClockDisplay();
    fitClockDate();
  }
  if (typeof updateClockAlarmIndicator === "function") updateClockAlarmIndicator();
}

function applyClockFont() {
  var font = clockSetting("font", "flip");
  var family = CLOCK_FONT_FAMILIES[font] || CLOCK_FONT_FAMILIES.flip;
  if (["mondaine", "nixie"].includes(font) && clockSetting("mondaineTextFont", "inter") === "london") family = "'Clock London Tube', Arial, sans-serif";
  document.documentElement.style.setProperty("--clock-font", family);
}

function applyClockBackground() {
  document.body.classList.toggle("clock-pure-black", clockSetting("pureBlack", "false") === "true");
}

function applyClockAppearance() {
  var color = clockSetting("color", "#b6ffbd");
  if (!/^#[0-9a-f]{6}$/i.test(color)) color = "#b6ffbd";
  var amount = Math.max(0, Math.min(1, Number(clockSetting("glow", "0.35")) || 0));
  var brightness = Math.max(0, Math.min(1, Number(clockSetting("brightness", "1")) || 0));
  var glowShadow = amount ? "0 0 " + (amount * 0.08).toFixed(3) + "em " + color + ", 0 0 " + (amount * 0.35).toFixed(3) + "em " + color : "none";
  document.documentElement.style.setProperty("--clock-glow-amount", String(amount));
  document.documentElement.style.setProperty("--clock-color", color);
  document.documentElement.style.setProperty("--seven-color", color);
  document.documentElement.style.setProperty("--seven-glow", glowShadow);
  document.documentElement.style.setProperty("--clock-glow", glowShadow);
  document.documentElement.style.setProperty("--clock-brightness", String(brightness));
}

function changeClockFormat(value) {
  localStorage.setItem(smdKey("format"), value === "12" ? "12" : "24");
  renderClock();
}

function changeClockShowSeconds(checked) {
  localStorage.setItem(smdKey("showSeconds"), checked ? "true" : "false");
  renderClock();
}

function changeClockFont(value) {
  localStorage.setItem(smdKey("font"), CLOCK_FONT_FAMILIES[value] ? value : "flip");
  applyClockFont();
  syncClockColonSetting();
  renderClock();
  if (document.fonts) document.fonts.ready.then(renderClock);
}

function changeClockMondaineTextFont(value) {
  localStorage.setItem(smdKey("mondaineTextFont"), value === "london" ? "london" : "inter");
  applyClockFont();
  renderClock();
  if (document.fonts) document.fonts.ready.then(renderClock);
}

function changeClockColor(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return;
  localStorage.setItem(smdKey("color"), value.toLowerCase());
  applyClockAppearance();
  renderClock();
}

function changeClockGlow(value) {
  localStorage.setItem(smdKey("glow"), String(Math.max(0, Math.min(1, Number(value) || 0))));
  applyClockAppearance();
  renderClock();
}

function changeClockBrightness(value) {
  localStorage.setItem(smdKey("brightness"), String(Math.max(0, Math.min(1, Number(value) || 0))));
  applyClockAppearance();
  renderClock();
}

function changeClockShowDate(checked) {
  localStorage.setItem(smdKey("showDate"), checked ? "true" : "false");
  renderClock();
}

function changeClockShowBoxes(checked) {
  localStorage.setItem(smdKey("showBoxes"), checked ? "true" : "false");
  renderClock();
}

function changeClockPureBlack(checked) {
  localStorage.setItem(smdKey("pureBlack"), checked ? "true" : "false");
  applyClockBackground();
}

function openSettings() {
  smdSetupSettingsPage({
    dangerIds: ["noCacheRow", "refreshAppRow", "clearAllDataRow"],
    restore: function () {
      restoreClockAlarmSettings();
      var format = document.getElementById("clockFormatSelector");
      var showSeconds = document.getElementById("clockShowSeconds");
      var font = document.getElementById("clockFontSelector");
      var showDate = document.getElementById("clockShowDate");
      var showBoxes = document.getElementById("clockShowBoxes");
      var pureBlack = document.getElementById("clockPureBlack");
      var color = document.getElementById("clockColorPicker");
      var glow = document.getElementById("clockGlowSlider");
      var brightness = document.getElementById("clockBrightnessSlider");
      var colonMode = document.getElementById("clockColonModeSelector");
      if (colonMode) colonMode.value = clockSetting("colonMode", "always");
      syncClockColonSetting();
      if (format) format.value = clockSetting("format", "24");
      if (showSeconds) showSeconds.checked = clockSetting("showSeconds", "true") !== "false";
      if (font) font.value = clockSetting("font", "flip");
      if (showDate) showDate.checked = clockSetting("showDate", "true") !== "false";
      if (showBoxes) showBoxes.checked = clockSetting("showBoxes", "true") !== "false";
      if (pureBlack) pureBlack.checked = clockSetting("pureBlack", "false") === "true";
      if (color) color.value = clockSetting("color", "#b6ffbd");
      if (glow) glow.value = clockSetting("glow", "0.35");
      if (brightness) brightness.value = clockSetting("brightness", "1");
    }
  });
}

function changeShowDanger(enabled) {
  smdChangeShowDanger(enabled, ["noCacheRow", "refreshAppRow", "clearAllDataRow"]);
}

function confirmClearAllData() {
  smdConfirmClearAllData({ content: "Clear all Clock settings? This cannot be undone." });
}

function closeSettings() {
  smdHideSettingsPage();
}

document.addEventListener("DOMContentLoaded", function () {
  applyTheme(getStoredTheme());
  smdBindThemeChange();
  applyClockFont();
  applyClockBackground();
  applyClockAppearance();
  renderClock();
  window.addEventListener("resize", function () {
    fitClockDisplay();
    fitClockDate();
    updateClockAlarmIndicator();
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
    fitClockDisplay();
    fitClockDate();
    updateClockAlarmIndicator();
  });
  if (typeof ResizeObserver !== "undefined") {
    var layoutObserver = new ResizeObserver(fitClockLayout);
    layoutObserver.observe(document.querySelector("main"));
    layoutObserver.observe(document.getElementById("mainNav"));
  }
  var navObserver = new MutationObserver(function () { requestAnimationFrame(fitClockLayout); });
  navObserver.observe(document.getElementById("mainNav"), { attributes: true, attributeFilter: ["class"] });
  clockTimer = setInterval(renderClock, 1000);
  setInterval(updateClockColon, 100);
});

document.addEventListener("smd-color-picker-change", function (event) {
  if (event.target && event.target.id === "clockColorPicker") changeClockColor(event.detail && event.detail.value);
});
document.addEventListener("smd-slider-change", function (event) {
  if (event.target && event.target.id === "clockGlowSlider") changeClockGlow(event.detail && event.detail.value);
  if (event.target && event.target.id === "clockBrightnessSlider") changeClockBrightness(event.detail && event.detail.value);
});

document.addEventListener("smd-theme-change", function () {
  requestAnimationFrame(function () {
    applyClockFont();
    applyClockAppearance();
    renderClock();
  });
});

document.addEventListener("DOMContentLoaded", function () {
  var surface = document.getElementById("clockMain");
  if (!surface) return;
  surface.addEventListener("pointerdown", function (event) {
    if (clockAlarmRinging) return;
    if (event.target.closest && event.target.closest("smd-slider, smd-color-picker")) return;
    clockDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, glow: Number(clockSetting("glow", "0.35")), brightness: Number(clockSetting("brightness", "1")) };
    surface.setPointerCapture(event.pointerId);
  });
  document.addEventListener("pointermove", function (event) {
    if (!clockDrag || event.pointerId !== clockDrag.id) return;
    event.preventDefault();
    changeClockGlow(clockDrag.glow + (event.clientX - clockDrag.x) / 300);
    changeClockBrightness(clockDrag.brightness - (event.clientY - clockDrag.y) / 300);
    var glow = document.getElementById("clockGlowSlider");
    var brightness = document.getElementById("clockBrightnessSlider");
    if (glow) glow.value = clockSetting("glow", "0.35");
    if (brightness) brightness.value = clockSetting("brightness", "1");
  });
  var endDrag = function (event) { if (clockDrag && event.pointerId === clockDrag.id) clockDrag = null; };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
});

window.formatClockTime = formatClockTime;
