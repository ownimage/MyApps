// CountMyDays — date maths and formatting helpers (classic script; functions
// stay global for inline handlers and tests).

var CMD_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function targetDate(d) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let year = now.getFullYear();

  if (d.type === "once") {
    year = d.year;
  }

  const target = new Date(year, d.month - 1, d.day);

  if (d.type === "annual" && target < today) {
    target.setFullYear(target.getFullYear() + 1);
  }

  return target;
}

function daysUntil(d) {
  const target = targetDate(d);
  const diff = target - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDateShort(d) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (d.type === "once") {
    return `${d.day} ${months[(d.month || 1) - 1]} ${d.year}`;
  }
  return `${d.day} ${months[(d.month || 1) - 1]}`;
}

// Countdown text lines for the "days" / "weeksAndDays" display setting.
function countdownLines(days, format) {
  if (format === "weeksAndDays") {
    const weeks = Math.floor(days / 7);
    const remainDays = days % 7;
    return {
      line1: weeks > 0 ? `${weeks} week${weeks !== 1 ? "s" : ""}` : "",
      line2: remainDays > 0 ? `${remainDays} day${remainDays !== 1 ? "s" : ""}` : ""
    };
  }
  return {
    line1: `${days}`,
    line2: `day${days !== 1 ? "s" : ""}`
  };
}
