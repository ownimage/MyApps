// PlanMyDay — date/schedule domain helpers shared by the views and editors.

function getTodayDate() {
  const dev = localStorage.getItem("devToday");
  return dev ? new Date(dev + "T00:00:00") : new Date();
}
function getTodayStr() {
  const d = getTodayDate();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function getTomorrowStr() {
  const d = getTodayDate();
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function getStoredLastGen() {
  if (isDevMode) {
    const dev = localStorage.getItem("devLastGen");
    if (dev) return dev;
  }
  return localStorage.getItem(smdKey("last_gen"));
}

function sortJobsByRules(jobs) {
  // rule 1: has sleepUntil → end (ordered by sleepUntil date, then time)
  // rule 2: no sleepUntil, has time → start (ordered by time)
  // rule 3: no sleepUntil, no time → middle (ordered by sequence)
  return [].concat(jobs).sort(function(a, b) {
    var aSleep = a.sleepUntil && a.sleepUntil.trim();
    var bSleep = b.sleepUntil && b.sleepUntil.trim();
    var aTime = a.time && a.time.trim();
    var bTime = b.time && b.time.trim();
    // groups: 0=rule2(noSleep+time), 1=rule3(noSleep+noTime), 2=rule1(sleepUntil)
    var aGroup = aSleep ? 2 : (aTime ? 0 : 1);
    var bGroup = bSleep ? 2 : (bTime ? 0 : 1);
    if (aGroup !== bGroup) return aGroup - bGroup;
    if (aGroup === 0) {
      var t = aTime.localeCompare(bTime);
      if (t !== 0) return t;
      return (a.sequence || 0) - (b.sequence || 0);
    }
    if (aGroup === 2) {
      var d = aSleep.localeCompare(bSleep);
      if (d !== 0) return d;
      if (aTime && bTime) return aTime.localeCompare(bTime);
      if (aTime) return 1;
      if (bTime) return -1;
      return (a.sequence || 0) - (b.sequence || 0);
    }
    return (a.sequence || 0) - (b.sequence || 0);
  });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return dayNames[d.getDay()] + " " + d.getDate() + " " + monthNames[d.getMonth()] + " " + d.getFullYear();
}

function formatLongDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return dayNames[d.getDay()] + ", " + d.getDate() + " " + monthNames[d.getMonth()] + ", " + d.getFullYear();
}

function getDaysSinceEpoch(date) {
  return Math.floor(date.getTime() / 86400000);
}

function getNextDueText(interval, offset) {
  const today = getTodayDate();
  const todayEpoch = getDaysSinceEpoch(today);
  for (let i = 0; i <= 7; i++) {
    const checkDay = todayEpoch + i;
    if ((checkDay - offset) % interval === 0) {
      if (i === 0) return "next due: today";
      if (i === 1) return "next due: tomorrow";
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + i);
      const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return "next due: " + dayNames[dueDate.getDay()] + ", " + monthNames[dueDate.getMonth()] + " " + dueDate.getDate();
    }
  }
  return "";
}

function getScheduleText(schedule) {
  if (!schedule) return "Every day";
  const s = schedule.type || "daily";
  if (s === "daily") return "Every day";
  if (s === "weekdays") return "Weekdays (Mon\u2013Fri)";
  if (s === "weekends") return "Weekends (Sat\u2013Sun)";
  if (s === "days") {
    const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    return (schedule.days || []).map(d => names[d]).join(", ");
  }
  if (s === "monthly") return (schedule.date || 1) + "th of every month";
  if (s === "ndays") return "Every " + (schedule.interval || 2) + " day(s)";
  return "Every day";
}

function shouldShowJobToday(job) {
  if (job.sleepUntil) {
    const today = getTodayStr();
    if (today < job.sleepUntil) return false;
  }
  const s = job.schedule || { type: "daily" };
  const type = s.type || "daily";
  const now = getTodayDate();
  if (type === "daily") return true;
  if (type === "weekdays") { const d = now.getDay(); return d >= 1 && d <= 5; }
  if (type === "weekends") { const d = now.getDay(); return d === 0 || d === 6; }
  if (type === "days") return (s.days || []).includes(now.getDay());
  if (type === "monthly") return now.getDate() === (s.date || 1);
  if (type === "ndays") {
    const interval = s.interval || 2;
    const offset = s.offset ?? 0;
    const daysSinceEpoch = getDaysSinceEpoch(now);
    return ((daysSinceEpoch - offset) % interval + interval) % interval === 0;
  }
  return true;
}

function getJobSuffix(job) {
  if (!job.suffix) return "";
  const today = getTodayDate();
  const dayType = job.dayType || "dayOfYear";
  let dayNum;

  if (dayType === "dayOfWeek") {
    dayNum = today.getDay();
    const mondaySetting = localStorage.getItem(smdKey("monday")) || "1";
    if (mondaySetting === "1") {
      dayNum = dayNum === 0 ? 7 : dayNum;
    } else {
      dayNum = dayNum === 0 ? 6 : dayNum - 1;
    }
  } else if (dayType === "dayOfMonth") {
    dayNum = today.getDate();
  } else {
    const startOfYear = new Date(today.getFullYear(), 0, 0);
    dayNum = Math.floor((today - startOfYear) / 86400000);
    const jan1Setting = localStorage.getItem(smdKey("jan1")) || "0";
    if (jan1Setting === "0") {
      dayNum -= 1;
    }
  }

  if (job.mod && job.mod !== "") {
    const modVal = parseInt(job.mod, 10);
    if (modVal > 0) {
      dayNum = dayNum % modVal;
    }
  }

  const suffixStart = localStorage.getItem(smdKey("suffixStart")) || "0";
  if (suffixStart === "1") dayNum += 1;

  return ` (${dayNum})`;
}
