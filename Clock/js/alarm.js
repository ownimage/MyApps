// Daily local-time alarm; snooze is an absolute timestamp, daily time survives DST.
var clockAlarmRinging = false;
var clockAlarmAudioPrimed = false;

function clockAlarmEnabled() { return clockSetting("alarmEnabled", "false") === "true"; }
function clockAlarmTime() {
  var time = clockSetting("alarmTime", "07:00");
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "07:00";
}
function nextClockAlarm(now) {
  var time = clockAlarmTime().split(":");
  var next = new Date(now);
  next.setHours(Number(time[0]), Number(time[1]), 0, 0);
  if (next.getTime() <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}
function updateClockAlarmIndicator() {
  var label = document.getElementById("clockAlarmIndicator");
  if (!label) return;
  label.classList.toggle("d-none", !clockAlarmEnabled());
  label.classList.toggle("clock-alarm-seven", clockSetting("font", "flip") === "seven");
  if (clockSetting("font", "flip") === "mondaine") { label.style.top = ""; fitClockDisplay(); fitClockDate(); return; }
  var display = document.getElementById("clockDisplay");
  var surface = document.getElementById("clockMain");
  label.style.top = (display.getBoundingClientRect().top - surface.getBoundingClientRect().top - 12) + "px";
}
function restoreClockAlarmSettings() {
  var enabled = document.getElementById("clockAlarmEnabled");
  if (!enabled) return;
  enabled.checked = clockAlarmEnabled();
  var format = clockSetting("alarmFormat", "24");
  var time = clockAlarmTime().split(":");
  var hour = Number(time[0]);
  document.getElementById("clockAlarmFormat").value = format;
  var input = document.getElementById("clockAlarmHour");
  input.options = Array.from({ length: format === "12" ? 12 : 24 }, function (_, index) {
    var value = String(index + (format === "12" ? 1 : 0)).padStart(2, "0");
    return { value: value, label: value };
  });
  document.getElementById("clockAlarmMinute").options = Array.from({ length: 60 }, function (_, index) {
    var value = String(index).padStart(2, "0");
    return { value: value, label: value };
  });
  input.value = String(format === "12" ? (hour % 12 || 12) : hour).padStart(2, "0");
  document.getElementById("clockAlarmMinute").value = time[1];
  var period = document.getElementById("clockAlarmPeriod");
  period.value = hour >= 12 ? "PM" : "AM";
  period.classList.toggle("d-none", format !== "12");
  document.getElementById("clockAlarmSleep").value = clockSetting("alarmSleep", "5");
}
function stopClockAlarmSound() {
  var audio = document.getElementById("clockAlarmAudio");
  audio.pause();
  audio.currentTime = 0;
  clockAlarmRinging = false;
  localStorage.removeItem(smdKey("alarmRinging"));
}
function changeClockAlarmEnabled(enabled) {
  localStorage.setItem(smdKey("alarmEnabled"), enabled ? "true" : "false");
  stopClockAlarmSound();
  localStorage.removeItem(smdKey("alarmSnooze"));
  if (enabled) {
    localStorage.setItem(smdKey("alarmNext"), String(nextClockAlarm(Date.now())));
    if (navigator.userActivation && navigator.userActivation.isActive) primeClockAlarmAudio();
  }
  else localStorage.removeItem(smdKey("alarmNext"));
  document.getElementById("clockAlarmModal").hide();
  updateClockAlarmIndicator();
}
function changeClockAlarmFormat(value) {
  localStorage.setItem(smdKey("alarmFormat"), value === "12" ? "12" : "24");
  restoreClockAlarmSettings();
}
function changeClockAlarmTime() {
  var hourInput = document.getElementById("clockAlarmHour");
  var minuteInput = document.getElementById("clockAlarmMinute");
  if (!hourInput.options.some(function (option) { return option.value === hourInput.value; }) ||
      !minuteInput.options.some(function (option) { return option.value === minuteInput.value; })) return;
  var hour = Number(hourInput.value);
  var minute = Number(minuteInput.value);
  if (clockSetting("alarmFormat", "24") === "12") {
    hour = hour % 12 + (document.getElementById("clockAlarmPeriod").value === "PM" ? 12 : 0);
  }
  localStorage.setItem(smdKey("alarmTime"), String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0"));
  if (clockAlarmEnabled()) changeClockAlarmEnabled(true);
}
function changeClockAlarmSleep(value) {
  localStorage.setItem(smdKey("alarmSleep"), ["5", "10", "15"].includes(String(value)) ? String(value) : "5");
}
function playClockAlarm() {
  clockAlarmRinging = true;
  localStorage.setItem(smdKey("alarmRinging"), "true");
  var audio = document.getElementById("clockAlarmAudio");
  audio.muted = false;
  var play = audio.play();
  if (play) play.catch(function () {
    document.getElementById("clockAlarmIndicator").title = "Alarm ringing. Touch the screen to turn off or sleep.";
  });
}
function checkClockAlarm() {
  if (!clockAlarmEnabled() || clockAlarmRinging) return;
  var now = Date.now();
  var snooze = Number(clockSetting("alarmSnooze", "0"));
  if (snooze) {
    if (now >= snooze) { localStorage.removeItem(smdKey("alarmSnooze")); playClockAlarm(); }
    return;
  }
  var next = Number(clockSetting("alarmNext", "0"));
  if (!Number.isFinite(next) || !next) {
    localStorage.setItem(smdKey("alarmNext"), String(nextClockAlarm(now)));
    return;
  }
  if (now >= next) {
    localStorage.setItem(smdKey("alarmNext"), String(nextClockAlarm(now)));
    playClockAlarm();
  }
}
function showClockAlarmModal() {
  var modal = document.getElementById("clockAlarmModal");
  if (modal.hasAttribute("open")) return;
  modal.title = "Alarm";
  modal.content = "Turn off the alarm or sleep for " + clockSetting("alarmSleep", "5") + " minutes?";
  modal.buttons = [
    { text: "Turn off", action: "off", variant: "secondary" },
    { text: "Sleep", action: "sleep", variant: "primary" }
  ];
  modal.show();
}
// Unlock the bundled media on a real user gesture (needed by mobile browsers).
function primeClockAlarmAudio() {
  if (!clockAlarmEnabled() || clockAlarmRinging || clockAlarmAudioPrimed) return;
  var audio = document.getElementById("clockAlarmAudio");
  clockAlarmAudioPrimed = true;
  audio.muted = true;
  var promise = audio.play();
  if (promise) promise.then(function () {
    if (!clockAlarmRinging) { audio.pause(); audio.currentTime = 0; }
    audio.muted = false;
  }).catch(function () { clockAlarmAudioPrimed = false; audio.muted = false; });
}
document.addEventListener("pointerdown", function (event) {
  if (event.isTrusted) primeClockAlarmAudio();
}, true);
document.addEventListener("click", function (event) {
  if (!clockAlarmRinging || event.target.closest("#clockAlarmModal")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  showClockAlarmModal();
}, true);
document.addEventListener("smd-modal-action", function (event) {
  if (event.target.id !== "clockAlarmModal" || !clockAlarmRinging) return;
  stopClockAlarmSound();
  if (event.detail.action === "sleep") {
    localStorage.setItem(smdKey("alarmSnooze"), String(Date.now() + Number(clockSetting("alarmSleep", "5")) * 60000));
  } else localStorage.removeItem(smdKey("alarmSnooze"));
  updateClockAlarmIndicator();
});
document.addEventListener("DOMContentLoaded", function () {
  if (clockAlarmEnabled() && clockSetting("alarmRinging", "false") === "true") playClockAlarm();
  checkClockAlarm();
  updateClockAlarmIndicator();
  setInterval(checkClockAlarm, 250);
});
document.addEventListener("visibilitychange", function () { if (!document.hidden) checkClockAlarm(); });
