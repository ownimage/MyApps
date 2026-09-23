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
const cmdCategoryCardTemplate = document.createElement("template");
cmdCategoryCardTemplate.innerHTML = `
  <div class="card bg-body-tertiary text-body border-0 p-3">
    <div class="d-flex align-items-center gap-3">
      <div class="thumb flex-shrink-0">
        <smd-image class="category-thumb"></smd-image>
      </div>
      <div class="content flex-grow-1 overflow-hidden">
        <div class="title fw-bold text-truncate"><span></span></div>
      </div>
      <div class="actions d-flex gap-2 flex-shrink-0">
        <smd-button variant="primary" size="small" title="Edit" data-action="edit">Edit</smd-button>
        <smd-button variant="danger" size="small" title="Delete" data-action="delete">Delete</smd-button>
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
    this._bound = false;
  }

  connectedCallback() {
    if (!this._bound) {
      this._bound = true;
      this.appendChild(cmdCategoryCardTemplate.content.cloneNode(true));
      this.querySelector('[data-action="edit"]').addEventListener("click", () => this._emit("cmd-category-edit"));
      this.querySelector('[data-action="delete"]').addEventListener("click", () => this._emit("cmd-category-delete"));
    }
    this._render();
  }

  attributeChangedCallback() {
    if (this._bound && this.isConnected) this._render();
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
    const root = this;
    root.querySelector(".title").textContent = this.getAttribute("name") || "";
    const sImg = root.querySelector(".category-thumb");
    sImg.setAttribute("key-prefix", this.getAttribute("key-prefix") || smdImagePrefix());
    const image = this.getAttribute("image");
    if (image) sImg.setAttribute("image", image);
    else sImg.removeAttribute("image");
  }
}

customElements.define("cmd-category-card", CmdCategoryCard);