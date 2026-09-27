// <smd-image-card> — a card for a single entry of a localStorage images list
// (light DOM). Styles live in shared/css/styles.css.
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

  const smdImageCardTemplate = document.createElement("template");
  smdImageCardTemplate.innerHTML = `
  <div class="card d-flex border-0 w-100">
    <div class="d-flex flex-column gap-2 px-4 py-2 border rounded-3">
      <div class="d-flex flex-row align-items-center justify-content-between gap-2">
        <div class="thumb"><smd-image></smd-image></div>
        <button type="button" class="btn btn-danger btn-sm d-inline-flex align-items-center justify-content-center" title="Delete" data-action="delete"><i class="bi bi-trash" aria-hidden="true"></i></button>
        <button type="button" class="btn btn-info btn-sm d-inline-flex align-items-center justify-content-center" title="Duplicate" data-action="duplicate"><i class="bi bi-files" aria-hidden="true"></i></button>
        <button type="button" class="btn btn-primary btn-sm d-inline-flex align-items-center justify-content-center" title="Edit" data-action="edit"><i class="bi bi-pencil" aria-hidden="true"></i></button>
      </div>
      <span class="editor-title text-start text-truncate w-100"></span>
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
      this._bound = false;
      this._built = false;
    }

    _build() {
      if (this._built) return;
      this._built = true;
      this.appendChild(smdImageCardTemplate.content.cloneNode(true));
    }

    connectedCallback() {
      this._build();
      this.classList.add("d-block", "mb-2", "mx-2");
      if (!this._bound) {
        this._bound = true;
        this.querySelector('[data-action="delete"]').addEventListener("click", () => this._emit("delete"));
        this.querySelector('[data-action="duplicate"]').addEventListener("click", () => this._emit("duplicate"));
        this.querySelector('[data-action="edit"]').addEventListener("click", () => this._emit("edit"));
      }
      this._render();
    }

    attributeChangedCallback() {
      if (this._built) this._render();
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
      const name = this.getAttribute("image") || "";
      const title = this.getAttribute("title") || name;
      const inUse = this.hasAttribute("in-use");

      const sImg = this.querySelector(".thumb smd-image");
      sImg.setAttribute("key-prefix", this.keyPrefix);
      if (name) {
        sImg.setAttribute("image", name);
        sImg.hidden = false;
      } else {
        sImg.removeAttribute("image");
        sImg.hidden = true;
      }

      this.querySelector(".editor-title").textContent = title;

      const delBtn = this.querySelector('[data-action="delete"]');
      if (inUse) delBtn.setAttribute("disabled", "");
      else delBtn.removeAttribute("disabled");
    }
  }

  if (!global.customElements.get("smd-image-card")) {
    global.customElements.define("smd-image-card", SmdImageCard);
  }
})(window);