// PlanMyDay x CountMyDays bridge.
//
// The PlanMyDay main page shows any CountMyDays event that falls TODAY as a
// <cmd-countdown-card> between the date heading and the tabs. Each such card can
// be swiped (left OR right, mouse or touch) to hide it for the rest of today
// only — no confirmation, and CountMyDays' own data is never touched.
//
// CountMyDays stores its data under its OWN namespace, so we read the raw keys:
//   countmydays_dates       — local date events
//   countmydays_google_cal  — the CACHED Google feed (never fetched from here)
//   countmydays_gcal_name   — the name the feed payload is keyed by
//   countmydays_categories  — for the category thumbnail
// Google events are included only when they have been downloaded already AND
// CountMyDays would show them (SmdGcal.visibleGoogleEntries drops hidden ones).

const CMD_EVENTS_PREFIX = "countmydays_";

function cmdReadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function cmdCountdownFormat() {
  return localStorage.getItem(CMD_EVENTS_PREFIX + "countdownFormat") || "days";
}

// Same occurrence maths as CountMyDays/js/utils.js targetDate(): an annual date
// rolls to next year once it has passed this year.
function cmdTargetDate(d) {
  const now = getTodayDate();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let year = now.getFullYear();
  if (d.type === "once") year = d.year;
  const target = new Date(year, (d.month || 1) - 1, d.day || 1);
  if (d.type === "annual" && target < today) target.setFullYear(target.getFullYear() + 1);
  return target;
}

function cmdIsToday(d) {
  const now = getTodayDate();
  const t = cmdTargetDate(d);
  return t.getFullYear() === now.getFullYear() &&
    t.getMonth() === now.getMonth() &&
    t.getDate() === now.getDate();
}

function cmdFormatDate(date) {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return dayNames[date.getDay()] + " " + date.getDate() + " " + monthNames[date.getMonth()] + " " + date.getFullYear();
}

// Countdown text lines, mirroring CountMyDays/js/utils.js countdownLines().
function cmdCountdownLines(days, format) {
  if (format === "weeksAndDays") {
    const weeks = Math.floor(days / 7);
    const remainDays = days % 7;
    return {
      line1: weeks > 0 ? weeks + " week" + (weeks !== 1 ? "s" : "") : "",
      line2: remainDays > 0 ? remainDays + " day" + (remainDays !== 1 ? "s" : "") : ""
    };
  }
  return { line1: String(days), line2: "day" + (days !== 1 ? "s" : "") };
}

// Local date events (countmydays_dates) that fall today.
function cmdLocalTodayEvents() {
  return cmdReadJson(CMD_EVENTS_PREFIX + "dates", [])
    .filter(cmdIsToday)
    .map(function (d) { return Object.assign({}, d, { gcal: false }); });
}

// Downloaded Google events that CountMyDays would show and that fall today.
function cmdGoogleTodayEvents() {
  if (typeof SmdGcal === "undefined") return [];
  const feed = cmdReadJson(CMD_EVENTS_PREFIX + "google_cal", null);
  const userName = localStorage.getItem(CMD_EVENTS_PREFIX + "gcal_name") || "";
  return SmdGcal.visibleGoogleEntries(feed, userName).filter(cmdIsToday);
}

function cmdTodayEvents() {
  return cmdLocalTodayEvents().concat(cmdGoogleTodayEvents());
}

// One key per event; the date-independent part of the identity.
function cmdEventKey(d) {
  return (d.gcal ? "g" : "l") + "|" + (d.name || "");
}

// Dismissals are stored as { date, keys } for TODAY only. A record for any
// other day is dropped on read, so the list can never build up across days: it
// holds at most the events dismissed on the current day.
function cmdDismissedKeys() {
  const flag = cmdReadJson(smdKey("cmdDismissed"), null);
  if (!flag || flag.date !== getTodayStr() || !Array.isArray(flag.keys)) {
    if (flag) localStorage.removeItem(smdKey("cmdDismissed"));
    return [];
  }
  return flag.keys;
}

function cmdDismissEvent(key) {
  const keys = cmdDismissedKeys();
  if (key && keys.indexOf(key) === -1) keys.push(key);
  localStorage.setItem(smdKey("cmdDismissed"), JSON.stringify({ date: getTodayStr(), keys: keys }));
}

// Render the (non-dismissed) today cards into the given container, and wire the
// dismiss handler for the cards inside it.
function renderCmdTodayCards(container) {
  if (!container) return;
  container.innerHTML = "";
  if (!container.__cmdDismissBound) {
    container.__cmdDismissBound = true;
    container.addEventListener("cmd-countdown-dismiss", function (e) {
      const key = e.detail && e.detail.key;
      if (key) cmdDismissEvent(key);
      const card = e.target;
      if (card && card.parentNode) card.parentNode.removeChild(card);
    });
  }

  const dismissed = cmdDismissedKeys();
  const format = cmdCountdownFormat();
  const categories = cmdReadJson(CMD_EVENTS_PREFIX + "categories", []);

  cmdTodayEvents().forEach(function (d) {
    const key = cmdEventKey(d);
    if (dismissed.indexOf(key) !== -1) return;

    const card = document.createElement("cmd-countdown-card");
    card.className = "d-block mb-1";
    card.setAttribute("dismissable", "");
    card.setAttribute("event-key", key);
    card.setAttribute("key-prefix", smdImagePrefix());
    card.setAttribute("title", d.name || "");
    card.setAttribute("date-text", cmdFormatDate(cmdTargetDate(d)));
    card.setAttribute("source", d.gcal ? "google" : "local");
    const lines = cmdCountdownLines(0, format);
    card.setAttribute("count1", lines.line1);
    if (lines.line2) card.setAttribute("count2", lines.line2);
    if (d.category) {
      card.setAttribute("category", d.category);
      const category = categories.find(c => c.name === d.category);
      if (category && category.image) card.setAttribute("category-image", category.image);
    }
    if (d.image) card.setAttribute("image", d.image);
    container.appendChild(card);
  });
}
