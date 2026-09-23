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
//   hidden          — presence/true adds the Hidden badge (google events)
//   category-image  — category image name (rendered via smd-image)
//   image           — date image name (rendered via smd-image)
//   key-prefix      — smd-image storage prefix (default: SmdConfig.imagePrefix)
//
// Events:
//   cmd-date-edit   — detail { index, source }
//   cmd-date-delete — detail { index, source } (local entries only)
const cmdDateCardTemplate = document.createElement("template");
cmdDateCardTemplate.innerHTML = `
  <div class="card bg-dark text-white border-0 mb-3">
    <div class="d-flex align-items-center gap-3">
      <div class="d-flex gap-1 flex-shrink-0">
        <smd-image class="category-thumb" style="width: 48px; height: 48px;"></smd-image>
        <smd-image class="date-thumb" style="width: 48px; height: 48px;"></smd-image>
      </div>
      <div class="flex-grow-1 overflow-hidden">
        <div class="fw-bold text-truncate mb-1"><span class="title-text"></span></div>
        <div class="d-flex flex-wrap align-items-center gap-2 text-secondary small">
          <span class="date-text"></span>
          <span class="type-text"></span>
          <span class="badges d-flex gap-1"></span>
        </div>
      </div>
      <div class="d-flex flex-column gap-1 flex-shrink-0">
        <smd-button data-action="edit" class="btn-sm">Edit</smd-button>
        <smd-button data-action="delete" class="btn-sm">Delete</smd-button>
      </div>
    </div>
  </div>
`;

class CmdDateCard extends HTMLElement {
  static get observedAttributes() {
    return ["index", "name", "category", "type", "date-text", "source",
      "recurring", "hidden", "category-image", "image", "key-prefix"];
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
    if (this.isConnected) this._render();
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
    const badge = document.createElement("span");
    badge.className = "event-badge " + className;
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
    if (this.getAttribute("hidden") === "true") this._addBadge(root, "Hidden", "event-badge-hidden");

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