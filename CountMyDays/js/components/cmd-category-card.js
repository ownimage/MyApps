// <cmd-category-card> — one category row in the categories editor list.
//
// Attributes:
//   index      — category index (echoed on the action events)
//   name       — category name
//   image      — category image name (rendered via smd-image)
//   key-prefix — smd-image storage prefix (default: SmdConfig.imagePrefix)
//
// Events:
//   cmd-category-edit   — detail { index }
//   cmd-category-delete — detail { index }
const cmdCategoryCardSheet = SmdStyles.sheetFor(`
  :host { display: block; }
  .card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background-color: var(--bs-dark-border-subtle, #303030);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
    padding: 1rem;
    margin-bottom: 0.75rem;
    min-width: 0;
  }
  .thumb { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; }
  .content { flex: 1 1 auto; min-width: 0; }
  .title {
    font-weight: 700;
    margin-bottom: 0.5rem;
    overflow-wrap: anywhere;
  }
  .actions { display: flex; gap: 0.5rem; }
  .actions .btn { padding: 0.375rem 0.75rem; }
  .actions .btn-danger { margin-left: auto; }
`);

const cmdCategoryCardTemplate = document.createElement("template");
cmdCategoryCardTemplate.innerHTML = `
  <div class="card">
    <div class="thumb"><smd-image class="category-thumb"></smd-image></div>
    <div class="content">
      <div class="title"></div>
      <div class="actions">
        <button type="button" class="btn btn-primary" data-action="edit">Edit</button>
        <button type="button" class="btn btn-danger" data-action="delete">Delete</button>
      </div>
    </div>
  </div>
`;

class CmdCategoryCard extends HTMLElement {
  static get observedAttributes() {
    return ["index", "name", "image", "key-prefix"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    SmdStyles.adoptStyles(this.shadowRoot, [SmdStyles.btnBadgeSheet, cmdCategoryCardSheet]);
    this.shadowRoot.appendChild(cmdCategoryCardTemplate.content.cloneNode(true));
  }

  connectedCallback() {
    this.shadowRoot.querySelector('[data-action="edit"]').addEventListener("click", () => this._emit("cmd-category-edit"));
    this.shadowRoot.querySelector('[data-action="delete"]').addEventListener("click", () => this._emit("cmd-category-delete"));
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  _emit(type) {
    const idx = parseInt(this.getAttribute("index"), 10);
    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail: { index: isNaN(idx) ? -1 : idx }
    }));
  }

  _render() {
    const root = this.shadowRoot;
    root.querySelector(".title").textContent = this.getAttribute("name") || "";
    const sImg = root.querySelector(".category-thumb");
    sImg.setAttribute("key-prefix", this.getAttribute("key-prefix") || smdImagePrefix());
    const image = this.getAttribute("image");
    if (image) sImg.setAttribute("image", image);
    else sImg.removeAttribute("image");
  }
}

customElements.define("cmd-category-card", CmdCategoryCard);
