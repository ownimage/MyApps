// <cmd-date-card> — one date row in the dates editor list.
//
// Attributes:
//   index           — date index (echoed on the action events)
//   name            — date title
//   category        — category name shown under the category thumbnail
//   type            — "annual" | "once" | "recurring"
//   date-text       — formatted day/month (and year for once/google)
//   source          — "local" (default) | "google"
//   recurring       — presence/true adds the Repeat badge (google events)
//   data-google-hidden — presence/true adds the Hidden badge (google events)
//   category-image  — category image name (rendered via smd-image)
//   image           — date image name (rendered via smd-image)
//   key-prefix      — smd-image storage prefix (default: SmdConfig.imagePrefix)
//
// Events:
//   cmd-date-edit   — detail { index, source }
//   cmd-date-delete — detail { index, source } (local entries only)
const cmdDateCardTemplate = document.createElement("template");
cmdDateCardTemplate.innerHTML = `
  <div class="card border-0 w-100">
    <div class="d-flex align-items-start gap-3 p-3 border rounded-3">
      <div class="d-flex gap-2 flex-shrink-0">
        <smd-image class="category-thumb"></smd-image>
        <smd-image class="date-thumb"></smd-image>
      </div>
      <div class="content flex-grow-1 overflow-hidden">
        <div class="title fw-bold text-truncate mb-1"><span class="title-text"></span></div>
        <div class="meta d-flex flex-wrap align-items-center gap-2 mb-1">
          <span class="date-text"></span>
          <span class="type-text"></span>
          <span class="badges d-flex gap-1"></span>
        </div>
      </div>
      <div class="actions d-flex gap-2 flex-shrink-0">
        <smd-button variant="primary" size="small" title="Edit" data-action="edit">Edit</smd-button>
        <smd-button variant="danger" size="small" title="Delete" data-action="delete">Delete</smd-button>
      </div>
    </div>
  </div>
`;

class CmdDateCard extends HTMLElement {
  static get observedAttributes() {
    return ["index", "name", "category", "type", "date-text", "source",
      "recurring", "data-google-hidden", "category-image", "image", "key-prefix"];
  }

  constructor() {
    super();
    this._bound = false;
  }

  connectedCallback() {
    if (!this._bound) {
      this._bound = true;
      this.appendChild(cmdDateCardTemplate.content.cloneNode(true));
      this.querySelector('[data-action="edit"]').addEventListener("click", () => this._emit("cmd-date-edit"));
      this.querySelector('[data-action="delete"]').addEventListener("click", () => this._emit("cmd-date-delete"));
    }
    this._render();
  }

  attributeChangedCallback() {
    if (this._bound && this.isConnected) this._render();
  }

  get source() {
    return this.getAttribute("source") || "local";
  }

  _emit(type) {
    const idx = parseInt(this.getAttribute("index"), 10);
    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail: {
        index: isNaN(idx) ? -1 : idx,
        source: this.source
      }
    }));
  }

  _addBadge(root, text, className) {
    const badge = document.createElement("smd-badge");
    badge.className = "event-badge " + className;
    badge.setAttribute("variant", className === "event-badge-google" ? "primary" : className === "event-badge-repeat" ? "info" : "secondary");
    badge.setAttribute("pill", "");
    badge.textContent = text;
    root.querySelector(".badges").appendChild(badge);
  }

  _render() {
    const root = this;
    const keyPrefix = this.getAttribute("key-prefix") || smdImagePrefix();
    const isGoogle = this.source === "google";

    root.querySelector(".title-text").textContent = this.getAttribute("name") || "";
    root.querySelector(".date-text").textContent = this.getAttribute("date-text") || "";

    root.querySelector(".badges").innerHTML = "";
    this._addBadge(root, isGoogle ? "Google" : "Local", isGoogle ? "event-badge-google" : "event-badge-local");
    if (this.getAttribute("recurring") === "true") this._addBadge(root, "Repeat", "event-badge-repeat");
    if (this.getAttribute("data-google-hidden") === "true") this._addBadge(root, "Hidden", "event-badge-hidden");

    const type = this.getAttribute("type");
    root.querySelector(".type-text").textContent = isGoogle
      ? (type === "recurring" ? "Recurring" : "Once")
      : (type === "once" ? "Once" : "Annual");

    root.querySelector('[data-action="delete"]').hidden = isGoogle;

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

customElements.define("cmd-date-card", CmdDateCard);