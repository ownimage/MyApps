// <smd-button> — themed Bootstrap button (light DOM).
//
// Renders a real `<button class="btn btn-<variant>">` straight into the light
// DOM, so the loaded theme styles it exactly like a native button. The label is
// captured from the host's light text on first connect (consumers author it as
// static text, e.g. `<smd-button variant="danger" onclick="...">Delete</smd-button>`);
// clicks bubble from the inner button up to the host, so host-level onclick
// handlers keep firing. `disabled` and `id` are mirrored onto the inner button.
//
// Attributes:
//   variant  — primary | secondary | success | danger | info | warning | light | dark (default primary)
//   size     — normal (default) | small (adds Bootstrap's `btn-sm`)
//   disabled — boolean
(function (global) {
  "use strict";

  const VARIANTS = ["primary", "secondary", "success", "danger", "info", "warning", "light", "dark"];
  const template = document.createElement("template");
  template.innerHTML = `<button class="btn btn-primary"></button>`;

  class SmdButton extends HTMLElement {
    static get observedAttributes() {
      return ["variant", "disabled", "size"];
    }

    constructor() {
      super();
      this._label = undefined;
    }

    get variant() {
      return this.getAttribute("variant") || "primary";
    }

    set variant(val) {
      this.setAttribute("variant", val);
    }

    get disabled() {
      return this.hasAttribute("disabled");
    }

    set disabled(val) {
      if (val) this.setAttribute("disabled", "");
      else this.removeAttribute("disabled");
    }

    attributeChangedCallback(name) {
      if (!this.isConnected) return;
      if (name === "disabled") this._applyDisabled();
      if (name === "variant" || name === "size") {
        this._applyVariant();
        this._applySize();
      }
    }

    connectedCallback() {
      if (this._label === undefined) {
        this._label = this.textContent.replace(/^\s+|\s+$/g, "");
      }
      this.innerHTML = "";
      const btn = template.content.firstElementChild.cloneNode(true);
      btn.textContent = this._label || "Button";
      if (this.id) btn.id = this.id + "-button";
      this.appendChild(btn);
      this._applyVariant();
      this._applySize();
      this._applyDisabled();
    }

    _btn() {
      return this.querySelector("button");
    }

    _applyVariant() {
      const btn = this._btn();
      if (!btn) return;
      const requested = this.getAttribute("variant");
      btn.className = "btn btn-" + (VARIANTS.indexOf(requested) !== -1 ? requested : "primary");
    }

    _applySize() {
      const btn = this._btn();
      if (!btn) return;
      btn.classList.toggle("btn-sm", (this.getAttribute("size") || "normal").toLowerCase() === "small");
    }

    _applyDisabled() {
      const btn = this._btn();
      if (btn) btn.disabled = this.disabled;
    }
  }

  if (!global.customElements.get("smd-button")) {
    global.customElements.define("smd-button", SmdButton);
  }
  global.SmdButton = SmdButton;
})(window);