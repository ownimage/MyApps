// <smd-slider> — shared numeric range control.
// Attributes: min, max, step, value, disabled.
// Property: .value (stringified numeric value).
// Event: smd-slider-change — detail { value } (bubbles + composed).
(function (global) {
  "use strict";
  const template = document.createElement("template");
  template.innerHTML = '<div class="smd-slider-row"><input class="smd-slider-input" type="range"><output class="smd-slider-value"></output></div>';

  class SmdSlider extends HTMLElement {
    static get observedAttributes() { return ["min", "max", "step", "value", "disabled"]; }
    constructor() { super(); this._built = false; this._bound = false; }
    connectedCallback() {
      if (!this._built) { this._built = true; this.appendChild(template.content.cloneNode(true)); }
      if (typeof global.injectSmdComponentStyle === "function") global.injectSmdComponentStyle("smd-slider-style", `
        smd-slider { display: block; }
        smd-slider .smd-slider-row { display: flex; align-items: center; gap: .75rem; }
        smd-slider .smd-slider-input { flex: 1 1 auto; min-width: 8rem; }
        smd-slider .smd-slider-value { min-width: 3.5rem; text-align: end; font-variant-numeric: tabular-nums; }
      `);
      if (!this._bound) {
        this._bound = true;
        this.querySelector(".smd-slider-input").addEventListener("input", () => {
          this._syncOutput();
          this.dispatchEvent(new CustomEvent("smd-slider-change", { bubbles: true, composed: true, detail: { value: this.value } }));
        });
      }
      this._syncInput();
    }
    attributeChangedCallback() { if (this._built) this._syncInput(); }
    get value() { const input = this.querySelector(".smd-slider-input"); return input ? input.value : (this.getAttribute("value") || ""); }
    set value(value) { this.setAttribute("value", value == null ? "" : String(value)); }
    _syncInput() {
      const input = this.querySelector(".smd-slider-input");
      if (!input) return;
      ["min", "max", "step", "value"].forEach((name) => {
        if (this.hasAttribute(name)) input.setAttribute(name, this.getAttribute(name));
      });
      input.disabled = this.hasAttribute("disabled");
      this._syncOutput();
    }
    _syncOutput() {
      const output = this.querySelector(".smd-slider-value");
      if (output) output.textContent = this.value;
    }
  }
  if (!global.customElements.get("smd-slider")) global.customElements.define("smd-slider", SmdSlider);
  global.SmdSlider = SmdSlider;
})(window);
