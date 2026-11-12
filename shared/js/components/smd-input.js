// Shared text/number/password field. The inner native input remains the form
// control: validation, labels, autofill, FormData, keyboard and date-picker APIs
// all keep their browser behavior. input-id preserves existing app selectors.
(function (global) {
  "use strict";
  var FORWARDED = ["type", "value", "placeholder", "disabled", "readonly", "required",
    "min", "max", "step", "minlength", "maxlength", "pattern", "name", "autocomplete",
    "inputmode", "spellcheck", "autofocus", "title", "aria-label", "aria-labelledby",
    "aria-describedby", "aria-invalid", "class", "style", "input-id", "size", "form"];
  class SmdInput extends HTMLElement {
    static get observedAttributes() { return FORWARDED; }
    constructor() { super(); this._syncing = false; this._pendingValue = undefined; }
    get input() { return this.querySelector('input[data-smd-input-control]'); }
    get value() { return this.input ? this.input.value : (this._pendingValue ?? this.getAttribute("value") ?? ""); }
    set value(value) {
      this._pendingValue = value == null ? "" : String(value);
      if (this.input) this.input.value = this._pendingValue;
    }
    get disabled() { return this.input ? this.input.disabled : this.hasAttribute("disabled"); }
    set disabled(value) { this.toggleAttribute("disabled", !!value); }
    get readOnly() { return this.input ? this.input.readOnly : this.hasAttribute("readonly"); }
    set readOnly(value) { this.toggleAttribute("readonly", !!value); }
    get type() { return this.input ? this.input.type : (this.getAttribute("type") || "text"); }
    set type(value) { this.setAttribute("type", value); }
    get validity() { return this.input && this.input.validity; }
    checkValidity() { return this.input ? this.input.checkValidity() : true; }
    reportValidity() { return this.input ? this.input.reportValidity() : true; }
    setCustomValidity(message) { if (this.input) this.input.setCustomValidity(message); }
    focus(options) { if (this.input) this.input.focus(options); }
    blur() { if (this.input) this.input.blur(); }
    select() { if (this.input) this.input.select(); }
    connectedCallback() {
      if (!document.getElementById("smd-input-layout")) {
        var style = document.createElement("style");
        style.id = "smd-input-layout";
        // Contents preserves the original field's flex/grid placement and sizes.
        style.textContent = "smd-input { display: contents; } smd-input[hidden] { display: none !important; }";
        document.head.appendChild(style);
      }
      if (this.input) return; // Reconnects and DOM clones keep one native control.
      var input = document.createElement("input");
      input.setAttribute("data-smd-input-control", "");
      this._syncing = true;
      Array.from(this.attributes).forEach(function (attr) {
        if (attr.name === "id" || attr.name === "input-id") return;
        input.setAttribute(attr.name, attr.value);
      });
      input.classList.add("form-control");
      if (this.hasAttribute("input-id")) input.id = this.getAttribute("input-id");
      else if (this.id) input.id = this.id + "-input";
      // Inline handlers run on the real field exactly once, with native `this`.
      // Move classes/data too so existing queries still find a single control.
      Array.from(this.attributes).forEach((attr) => {
        if (/^on|^data-/.test(attr.name) || attr.name === "class" || attr.name === "style") this.removeAttribute(attr.name);
      });
      this.appendChild(input);
      if (this._pendingValue !== undefined) input.value = this._pendingValue;
      this._syncing = false;
    }
    attributeChangedCallback(name, oldValue, value) {
      var input = this.input;
      if (!input || this._syncing || value === oldValue) return;
      if (name === "input-id") { input.id = value || ""; return; }
      if (value === null) input.removeAttribute(name); else input.setAttribute(name, value);
      if (name === "value") input.value = value || "";
      if (name === "class") input.classList.add("form-control");
      if (name === "class" || name === "style") {
        this._syncing = true; this.removeAttribute(name); this._syncing = false;
      }
    }
  }
  if (!global.customElements.get("smd-input")) global.customElements.define("smd-input", SmdInput);
  global.SmdInput = SmdInput;
})(window);
