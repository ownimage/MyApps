// Adapted from ownimage/display's MondaineClock (display/src/app/mondaine_clock).
// Retains the original polygon geometry and 58-second sweep / two-second pause.
function mondaineHand(id, length, tail, tipWidth, tailWidth) {
  return '<polygon id="' + id + '" points="' + (-tail) + ',' + (-tailWidth) + ' ' + (-tail) + ',' + tailWidth + ' ' + length + ',' + tipWidth + ' ' + length + ',' + (-tipWidth) + '"/>';
}
function renderMondaineClock(display) {
  if (!display.querySelector(".mondaine-face")) {
    var ticks = "";
    for (var index = 0; index < 60; index++) {
      var major = index % 5 === 0;
      var length = major ? 30 : 11;
      var width = major ? 8 : 3;
      ticks += '<polygon class="mondaine-tick' + (major ? ' mondaine-hour-tick' : '') + '" points="' + (-length) + ',' + (-width) + ' ' + length + ',' + (-width) + ' ' + length + ',' + width + ' ' + (-length) + ',' + width + '" transform="rotate(' + (index * 6 - 90) + ') translate(' + (major ? 218 : 237) + ',0)"/>';
    }
    display.innerHTML = '<svg class="mondaine-face" viewBox="-300 -300 600 600" role="img" aria-label="Current time">' +
      '<defs><linearGradient id="mondaineMetal"><stop stop-color="#ddd"/><stop offset="1" stop-color="#999"/></linearGradient></defs>' +
      '<circle class="mondaine-dial" r="276" stroke="url(#mondaineMetal)" stroke-width="22"/>' + ticks +
      '<g class="mondaine-hands">' + mondaineHand('mondaineHour',175,60,12,17) + mondaineHand('mondaineMinute',236,56,10,15) + '</g>' +
      '<g class="mondaine-second">' + mondaineHand('mondaineSecond',170,80,3,3) + '<circle id="mondaineSecondCircle" cx="170" r="21"/><circle r="12"/></g><circle class="mondaine-center" r="6"/></svg>';
  }
  updateMondaineClock();
}
function updateMondaineClock() {
  var svg = document.querySelector(".mondaine-face");
  if (!svg) return;
  var now = new Date();
  var seconds = now.getSeconds() + now.getMilliseconds() / 1000;
  var rotation = "rotate(" + (seconds >= 58 ? -90 : seconds / 58 * 360 - 90) + ")";
  document.getElementById("mondaineSecond").setAttribute("transform", rotation);
  document.getElementById("mondaineSecondCircle").setAttribute("transform", rotation);
  document.getElementById("mondaineMinute").setAttribute("transform", "rotate(" + (now.getMinutes() * 6 - 90) + ")");
  document.getElementById("mondaineHour").setAttribute("transform", "rotate(" + ((now.getHours() % 12 + now.getMinutes() / 60) * 30 - 90) + ")");
  svg.querySelector(".mondaine-second").classList.toggle("d-none", clockSetting("showSeconds", "true") === "false");
  svg.setAttribute("aria-label", "Current time " + formatClockTime(now));
}
document.addEventListener("DOMContentLoaded", function () { setInterval(updateMondaineClock, 200); });
