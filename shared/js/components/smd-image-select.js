// <smd-image-select> — image thumbnail + name + an "Edit" (picker) button
// (light DOM). Styles live in shared/css/styles.css.
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

  const smdImageSelectTemplate = document.createElement("template");
  smdImageSelectTemplate.innerHTML = `
  <div class="thumb"><smd-image></smd-image><span class="placeholder">none</span></div>
  <div class="meta">
    <span class="name"></span>
    <smd-button variant="primary" class="edit-btn">Edit</smd-button>
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
      this._bound = false;
      this._built = false;
    }

    _build() {
      if (this._built) return;
      this._built = true;
      this.appendChild(smdImageSelectTemplate.content.cloneNode(true));
    }

    connectedCallback() {
      this._build();
      if (!this._bound) {
        this._bound = true;
        this.querySelector("smd-button.edit-btn").addEventListener("click", () => {
          if (this.hasAttribute("disabled")) return;
          this.dispatchEvent(new CustomEvent("smd-image-select-action", {
            bubbles: true,
            composed: true,
            detail: { action: "edit" }
          }));
        });
      }
      this._render();
    }

    attributeChangedCallback() {
      if (this._built) this._render();
    }

    _render() {
      const name = this.getAttribute("image") || "";
      const label = this.getAttribute("label") || name;
      const idAttr = (id) => id ? ` id="${id}"` : "";

      const sImg = this.querySelector(".thumb smd-image");
      sImg.setAttribute("key-prefix", this.keyPrefix);
      // Keep the <smd-image> mounted even with no image so it reserves the
      // configured image size; the placeholder is overlaid on top.
      if (name) {
        sImg.setAttribute("image", name);
      } else {
        sImg.removeAttribute("image");
      }

      const thumb = this.querySelector(".thumb");
      const ph = this.querySelector(".placeholder");
      ph.hidden = !!name;

      const labelEl = this.querySelector(".name");
      labelEl.textContent = label;
      if (this.getAttribute("label-id")) {
        if (!labelEl.id) labelEl.id = this.getAttribute("label-id");
      }

      const btn = this.querySelector("smd-button.edit-btn");
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