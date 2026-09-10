// <smd-image-select> — image thumbnail + name + an "Edit" (picker) button.
//
// Shared/reusable: the image is looked up by NAME via <smd-image> using the
// `key-prefix` (list key = keyPrefix + "images") + `image` attributes, never a
// data URL. `label` overrides the shown name text (defaults to the image name);
// `label-id`/`button-id` are forwarded to the name span / the smd-button so the
// host app can keep stable ids; `disabled` disables the Edit button (view mode).
//
// Clicking Edit dispatches <code>smd-image-select-action</code> with
// detail = { action: "edit" }; the host app decides what to do (open a picker).
(function (global) {
  "use strict";

  const smdImageSelectSheet = SmdStyles.sheetFor(`
  :host {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .thumb {
    width: var(--thumb-size, 45px);
    height: var(--thumb-size, 45px);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 6px;
    overflow: hidden;
  }
  .thumb smd-image { width: 100%; height: 100%; }
  .thumb .placeholder {
    font-size: 0.65rem;
    color: var(--bs-secondary-color, #aaa);
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }
  .name {
    font-size: 0.85rem;
    color: var(--bs-secondary-color, #aaa);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`);

  const smdImageSelectTemplate = document.createElement("template");
  smdImageSelectTemplate.innerHTML = `
  <div class="thumb"><smd-image></smd-image><span class="placeholder">none</span></div>
  <div class="meta">
    <span class="name"></span>
    <smd-button variant="primary" part="edit-btn">Edit</smd-button>
  </div>
`;

  class SmdImageSelect extends HTMLElement {
    static get observedAttributes() {
      return ["key-prefix", "image", "label", "disabled", "label-id", "button-id"];
    }

    get keyPrefix() {
      return this.getAttribute("key-prefix") || "";
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      SmdStyles.adoptStyles(this.shadowRoot, [SmdStyles.hiddenSheet, SmdStyles.btnBadgeSheet, smdImageSelectSheet]);
      this.shadowRoot.appendChild(smdImageSelectTemplate.content.cloneNode(true));
    }

    connectedCallback() {
      this.shadowRoot.querySelector("smd-button[part='edit-btn']").addEventListener("click", () => {
        if (this.hasAttribute("disabled")) return;
        this.dispatchEvent(new CustomEvent("smd-image-select-action", {
          bubbles: true,
          composed: true,
          detail: { action: "edit" }
        }));
      });
      this._render();
    }

    attributeChangedCallback() {
      if (this.isConnected) this._render();
    }

    _render() {
      const root = this.shadowRoot;
      const name = this.getAttribute("image") || "";
      const label = this.getAttribute("label") || name;
      const idAttr = (id) => id ? ` id="${id}"` : "";

      const sImg = root.querySelector(".thumb smd-image");
      sImg.setAttribute("key-prefix", this.keyPrefix);
      if (name) {
        sImg.hidden = false;
        sImg.setAttribute("image", name);
      } else {
        sImg.hidden = true;
        sImg.removeAttribute("image");
      }

      const thumb = root.querySelector(".thumb");
      const ph = root.querySelector(".placeholder");
      ph.hidden = !!name;

      const labelEl = root.querySelector(".name");
      labelEl.textContent = label;
      if (this.getAttribute("label-id")) {
        if (!labelEl.id) labelEl.id = this.getAttribute("label-id");
      }

      const btn = root.querySelector("smd-button[part='edit-btn']");
      if (this.getAttribute("button-id")) {
        if (!btn.id) btn.id = this.getAttribute("button-id");
      }
      btn.disabled = this.hasAttribute("disabled");
    }
  }

  if (!global.customElements.get("smd-image-select")) {
    global.customElements.define("smd-image-select", SmdImageSelect);
  }
})(window);