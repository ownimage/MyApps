// ListOfLists — date/order domain helpers shared by the views and editors.

function getTodayDate() {
  const dev = localStorage.getItem("devToday");
  return dev ? new Date(dev + "T00:00:00") : new Date();
}
function getTodayStr() {
  const d = getTodayDate();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function getStoredLastGen() {
  if (isDevMode) {
    const dev = localStorage.getItem("devLastGen");
    if (dev) return dev;
  }
  return localStorage.getItem(smdKey("last_gen"));
}

function sortListsByRules(lists) {
  // rule 1: has sleepUntil -> end (ordered by sleepUntil date, then time)
  // rule 2: no sleepUntil, has time -> start (ordered by time)
  // rule 3: no sleepUntil, no time -> middle (ordered by sequence)
  return [].concat(lists).sort(function(a, b) {
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

function getDaysSinceEpoch(date) {
  return Math.floor(date.getTime() / 86400000);
}

function shouldShowListToday(list) {
  if (list.sleepUntil) {
    const today = getTodayStr();
    if (today < list.sleepUntil) return false;
  }
  const s = list.schedule || { type: "daily" };
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
