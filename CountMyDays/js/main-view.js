// CountMyDays — main countdown view. Render logic only; the tiles are
// <cmd-countdown-card> elements and images resolve by name through <smd-image>.

function renderMain() {
  renderCountdowns();
}

function renderCountdowns() {
  const container = document.getElementById("countdownContainer");
  if (!container) return;
  container.innerHTML = "";

  const dates = loadDates();
  const categories = loadCategories();

  const maxCountdowns = parseInt(localStorage.getItem(smdKey("maxCountdowns")) || "10", 10);
  const showAll = container.dataset.showAll === "true" || maxCountdowns === 0;
  const format = localStorage.getItem(smdKey("countdownFormat")) || "days";

  // Local dates plus visible Google Calendar events (hidden ones are editor-only).
  const gcalEntries = typeof loadGoogleCalendarEntries === "function" ? loadGoogleCalendarEntries() : [];
  const withDays = dates.concat(gcalEntries)
    .map(d => ({ ...d, days: daysUntil(d) }))
    .sort((a, b) => a.days - b.days);

  const todayEvents = withDays.filter(d => d.days === 0);
  const futureEvents = withDays.filter(d => d.days > 0);

  function renderCard(d) {
    const category = categories.find(c => c.name === d.category);
    const lines = countdownLines(d.days, format);

    const card = document.createElement("cmd-countdown-card");
    card.className = "d-block mb-2";
    card.setAttribute("key-prefix", smdImagePrefix());
    card.setAttribute("title", d.name || "");
    card.setAttribute("date-text", formatDate(targetDate(d)));
    card.setAttribute("source", d.gcal ? "google" : "local");
    card.setAttribute("count1", lines.line1);
    if (lines.line2) card.setAttribute("count2", lines.line2);
    if (d.category) card.setAttribute("category", d.category);
    if (category && category.image) card.setAttribute("category-image", category.image);
    if (d.image) card.setAttribute("image", d.image);
    container.appendChild(card);
  }

  if (todayEvents.length > 0) {
    const heading = document.createElement("h1");
    heading.className = "h1";
    heading.textContent = "Today!";
    container.appendChild(heading);
    todayEvents.forEach(renderCard);
  }

  if (futureEvents.length > 0) {
    const visible = showAll ? futureEvents : futureEvents.slice(0, maxCountdowns);

    const heading = document.createElement("h1");
    heading.className = "h1";
    heading.textContent = "From " + formatDate(new Date()) + " :";
    container.appendChild(heading);
    visible.forEach(renderCard);

    if (!showAll && futureEvents.length > maxCountdowns) {
      const more = document.createElement("div");
      more.className = "text-center mt-2";
      const moreBtn = document.createElement("a");
      moreBtn.href = "#";
      moreBtn.className = "btn btn-outline-primary btn-sm";
      moreBtn.textContent = "+ " + (futureEvents.length - maxCountdowns) + " more";
      moreBtn.onclick = e => {
        e.preventDefault();
        container.dataset.showAll = "true";
        renderCountdowns();
      };
      more.appendChild(moreBtn);
      container.appendChild(more);
    }
  }
}

function resetShowAll() {
  const container = document.getElementById("countdownContainer");
  if (container) delete container.dataset.showAll;
}
