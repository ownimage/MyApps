// <smd-image-card> — a card for a single entry of a localStorage images list.
//
// Shared/reusable: image lookup is delegated to <smd-image>, so only the
// storage key prefix is needed (`key-prefix`, list key = keyPrefix + "images")
// plus the image NAME (`image`), never a data URL. `title` is the displayed
// label (defaults to the image name), `index` is echoed back in the action
// event, and setting `in-use` disables the Delete button.
//
// Card actions are surfaced as a single <code>smd-image-card-action</code>
// event: detail = { action: "delete" | "duplicate" | "edit", index }.
(function (global) {
  "use strict";

  const smdImageCardSheet = SmdStyles.sheetFor(`
  :host { display: block; }
  .card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background-color: var(--bs-body-bg, #303030);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
    padding: 1rem;
    margin-bottom: 0.5rem;
    min-width: 0;
  }
  .thumb {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thumb smd-image { width: 100%; height: 100%; }
  .editor-title {
    font-weight: 700;
    flex: 1;
    min-width: 0;
    color: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .image-actions { display: flex; gap: 1rem; flex-shrink: 0; }
  .image-actions .btn {
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #fff;
    flex-shrink: 0;
    transition: opacity 0.2s;
  }
  .image-actions .btn:hover { opacity: 0.85; }
  .image-actions .btn-danger { background: var(--bs-danger, #dc3545); }
  .image-actions .btn-info { background: var(--bs-info, #0dcaf0); color: #000; }
  .image-actions .btn-primary { background: var(--bs-primary, #0d6efd); }
  .image-actions .btn:disabled { opacity: 0.5; cursor: not-allowed; }
`);

  const smdImageCardTemplate = document.createElement("template");
  smdImageCardTemplate.innerHTML = `
  <div class="card">
    <div class="thumb"><smd-image></smd-image></div>
    <span class="editor-title"></span>
    <div class="image-actions">
      <button type="button" class="btn btn-danger btn-sm" title="Delete" data-action="delete">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>
      </button>
      <button type="button" class="btn btn-info btn-sm" title="Duplicate" data-action="duplicate">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="1" width="9" height="9" rx="1"/><rect x="6" y="6" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
      </button>
      <button type="button" class="btn btn-primary btn-sm" title="Edit" data-action="edit">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106a.5.5 0 0 1-.707-.708l-1.28 1.28-1.414-1.414 1.28-1.28a.5.5 0 0 1-.708-.708z"/></svg>
      </button>
    </div>
  </div>
`;

  class SmdImageCard extends HTMLElement {
    static get observedAttributes() {
      return ["key-prefix", "image", "title", "index", "in-use"];
    }

    get keyPrefix() {
      return this.getAttribute("key-prefix") || "";
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      SmdStyles.adoptStyles(this.shadowRoot, [SmdStyles.hiddenSheet, SmdStyles.btnBadgeSheet, smdImageCardSheet]);
      this.shadowRoot.appendChild(smdImageCardTemplate.content.cloneNode(true));
    }

    connectedCallback() {
      const root = this.shadowRoot;
      root.querySelector('[data-action="delete"]').addEventListener("click", () => this._emit("delete"));
      root.querySelector('[data-action="duplicate"]').addEventListener("click", () => this._emit("duplicate"));
      root.querySelector('[data-action="edit"]').addEventListener("click", () => this._emit("edit"));
      this._render();
    }

    attributeChangedCallback() {
      if (this.isConnected) this._render();
    }

    _emit(action) {
      const idx = parseInt(this.getAttribute("index"), 10);
      this.dispatchEvent(new CustomEvent("smd-image-card-action", {
        bubbles: true,
        composed: true,
        detail: {
          action: action,
          index: isNaN(idx) ? -1 : idx
        }
      }));
    }

    _render() {
      const root = this.shadowRoot;
      const name = this.getAttribute("image") || "";
      const title = this.getAttribute("title") || name;
      const inUse = this.hasAttribute("in-use");

      const sImg = root.querySelector(".thumb smd-image");
      sImg.setAttribute("key-prefix", this.keyPrefix);
      if (name) sImg.setAttribute("image", name);
      else sImg.removeAttribute("image");

      const thumb = root.querySelector(".thumb");
      thumb.hidden = !name;

      root.querySelector(".editor-title").textContent = title;

      const delBtn = root.querySelector('[data-action="delete"]');
      if (inUse) delBtn.setAttribute("disabled", "");
      else delBtn.removeAttribute("disabled");
    }
  }

  if (!global.customElements.get("smd-image-card")) {
    global.customElements.define("smd-image-card", SmdImageCard);
  }
})(window);