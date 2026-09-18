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
const cmdDateCardSheet = SmdStyles.sheetFor(`
  :host { display: block; }
  .card {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    background-color: var(--bs-dark-border-subtle, #303030);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
    padding: 1rem;
    margin-bottom: 0.75rem;
    min-width: 0;
  }
  .thumbs { display: flex; align-items: flex-start; gap: 0.5rem; flex: 0 0 auto; }
  .thumb { display: flex; align-items: center; justify-content: center; }
  .content { flex: 1 1 auto; min-width: 0; }
  .title {
    font-weight: 700;
    margin-bottom: 0.5rem;
    overflow-wrap: anywhere;
  }
  .event-badge {
    display: inline-block;
    font-size: 0.7em;
    font-weight: 600;
    line-height: 1;
    padding: 0.25em 0.5em;
    border-radius: 0.35rem;
    vertical-align: middle;
    margin-left: 0.35rem;
  }
  .event-badge-local { background: var(--bs-secondary, #6c757d); color: var(--smd-secondary-text, #fff); }
  .event-badge-google { background: var(--bs-primary, #0d6efd); color: var(--smd-primary-text, #fff); }
  .event-badge-repeat { background: var(--bs-info, #0dcaf0); color: var(--smd-info-text, #fff); }
  .event-badge-hidden { background: var(--bs-secondary, #6c757d); color: var(--smd-secondary-text, #fff); }
  .meta { display: flex; gap: 1rem; align-items: center; margin-bottom: 0.5rem; }
  .actions { display: flex; gap: 0.5rem; }
  .actions .btn { padding: 0.375rem 0.75rem; }
  .actions .btn-danger { margin-left: auto; }
`);

const cmdDateCardTemplate = document.createElement("template");
cmdDateCardTemplate.innerHTML = `
  <div class="card">
    <div class="thumbs">
      <div class="thumb"><smd-image class="category-thumb"></smd-image></div>
      <div class="thumb"><smd-image class="date-thumb"></smd-image></div>
    </div>
    <div class="content">
      <div class="title"><span class="title-text"></span></div>
      <div class="meta">
        <span class="date-text"></span>
        <span class="type-text"></span>
        <span class="badges"></span>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-primary" data-action="edit">Edit</button>
        <button type="button" class="btn btn-danger" data-action="delete">Delete</button>
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
    this.attachShadow({ mode: "open" });
    SmdStyles.adoptStyles(this.shadowRoot, [SmdStyles.hiddenSheet, SmdStyles.btnBadgeSheet, cmdDateCardSheet]);
    this.shadowRoot.appendChild(cmdDateCardTemplate.content.cloneNode(true));
  }

  connectedCallback() {
    this.shadowRoot.querySelector('[data-action="edit"]').addEventListener("click", () => this._emit("cmd-date-edit"));
    this.shadowRoot.querySelector('[data-action="delete"]').addEventListener("click", () => this._emit("cmd-date-delete"));
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
    const root = this.shadowRoot;
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
