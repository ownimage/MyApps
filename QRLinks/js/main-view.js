// QRLinks — main view: one <qrlink-card> per link, ordered by sequence.

function renderMain() {
  const container = document.getElementById("countdownContainer");
  if (!container) return;
  container.innerHTML = "";

  const links = loadLinks().slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  if (links.length === 0) {
    const msg = document.createElement("p");
    msg.className = "text-secondary";
    msg.textContent = "No links yet. Add some from the Links editor.";
    container.appendChild(msg);
    return;
  }

  links.forEach((link, index) => {
    const card = document.createElement("qrlink-card");
    card.setAttribute("index", index);
    card.setAttribute("key-prefix", smdImagePrefix());
    card.setAttribute("title", link.title || "");
    if (link.description) card.setAttribute("description", link.description);
    if (link.url) card.setAttribute("url", link.url);
    if (link.image) card.setAttribute("image", link.image);
    container.appendChild(card);
  });
}
