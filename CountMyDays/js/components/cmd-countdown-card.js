// <cmd-countdown-card> — one countdown tile on the main view.
//
// Owns its layout (category + date image thumbnails, title, event date and the
// big countdown numbers) and its styling (CountMyDays/css/styles.css,
// element-scoped). Body display settings (font size / density) reach the card
// through CSS custom properties (`--cmd-countdown-*`, defined in
// CountMyDays/css/styles.css) by inheritance.
//
// Attributes:
//   title           — event title
//   date-text       — formatted event date (e.g. "Sat 12 Sep 2026")
//   source          — "local" (default) | "google"; shown as a badge under the date
//   count1          — first countdown line ("12" or "3 weeks")
//   count2          — optional second line ("4 days")
//   category        — category label (shown under the category thumbnail)
//   category-image  — category image name (rendered via smd-image)
//   image           — date image name (rendered via smd-image)
//   key-prefix      — smd-image storage prefix (default: SmdConfig.imagePrefix)
const cmdCountdownCardTemplate = document.createElement("template");
cmdCountdownCardTemplate.innerHTML = `
  <div class="row">
    <div class="thumbs">
      <div class="thumb-block">
        <div class="thumb"><smd-image class="category-thumb"></smd-image></div>
        <div class="category-label"></div>
      </div>
      <div class="thumb-block">
        <div class="thumb"><smd-image class="date-thumb"></smd-image></div>
      </div>
    </div>
    <div class="content">
      <h4 class="title"></h4>
      <div class="date-text"></div>
      <div class="source-row"><smd-badge class="source-badge" variant="secondary"></smd-badge></div>
    </div>
    <div class="counts">
      <div class="count count-1"></div>
      <div class="count count-2"></div>
    </div>
  </div>
`;

class CmdCountdownCard extends HTMLElement {
  static get observedAttributes() {
    return ["title", "date-text", "source", "count1", "count2", "category",
      "category-image", "image", "key-prefix"];
  }

  constructor() {
    super();
    this._bound = false;
  }

  connectedCallback() {
    if (!this._bound) this._bound = true;
    if (!this.querySelector(".counts")) {
      this.appendChild(cmdCountdownCardTemplate.content.cloneNode(true));
    }
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  _render() {
    const root = this;
    const keyPrefix = this.getAttribute("key-prefix") || smdImagePrefix();

    root.querySelector(".title").textContent = this.getAttribute("title") || "";
    root.querySelector(".date-text").textContent = this.getAttribute("date-text") || "";

    // Source badge: variant colours are the standard (button) theme variants
    // for now — the exact styling will be refined later.
    const source = this.getAttribute("source") || "local";
    const badge = root.querySelector(".source-badge");
    badge.textContent = source === "google" ? "Google" : "Local";
    badge.setAttribute("variant", source === "google" ? "secondary" : "primary");

    const count1 = this.getAttribute("count1") || "";
    const count2 = this.getAttribute("count2") || "";
    root.querySelector(".count-1").textContent = count1;
    const count2El = root.querySelector(".count-2");
    count2El.textContent = count2;
    count2El.hidden = !count2;

    root.querySelector(".category-label").textContent = this.getAttribute("category") || "";

    const setThumb = (selector, name) => {
      const sImg = root.querySelector(selector);
      sImg.setAttribute("key-prefix", keyPrefix);
      if (name) sImg.setAttribute("image", name);
      else sImg.removeAttribute("image");
    };
    setThumb(".category-thumb", this.getAttribute("category-image") || "");
    setThumb(".date-thumb", this.getAttribute("image") || "");
  }
}

customElements.define("cmd-countdown-card", CmdCountdownCard);