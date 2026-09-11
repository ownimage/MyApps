// <smd-checkbox> — the shared, themed checkbox used across the app.
//
// Renders a native checkbox inside the shadow root so every checkbox shares one
// look. The host itself is ARIA-checkable (`role=checkbox|switch` +
// `aria-checked`) so assistive tech — and Playwright's check()/toBeChecked() —
// treat it like a real checkbox. Clicking anywhere on the built-in label toggles
// it; a `switch` attribute renders a pill toggle instead of a square.
//
// Attributes:
//   checked   — boolean; the checkbox state
//   disabled  — boolean
//   switch    — render as a switch (pill) instead of a square checkbox
//   name      — forwarded to the inner input
//   value     — forwarded to the inner input
// Events:
//   change / input — composed + bubbling; detail = { checked }
// Property:
//   checked (get/set)
(function (global) {
  "use strict";

  const smdCheckboxSheet = SmdStyles.sheetFor(`
    :host {
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
      cursor: pointer;
    }
    :host([disabled]) { cursor: not-allowed; opacity: 0.55; }
    label {
      display: inline-flex;
      align-items: center;
      gap: 0.4em;
      margin: 0;
      cursor: inherit;
    }
    input {
      flex: 0 0 auto;
      display: inline-grid;
      place-content: center;
      width: 1.15em;
      height: 1.15em;
      margin: 0;
      padding: 0;
      vertical-align: middle;
      appearance: none;
      -webkit-appearance: none;
      background-color: var(--bs-secondary-bg, #495057);
      border: 1px solid var(--bs-secondary-color, #6c757d);
      border-radius: 0.25em;
      cursor: inherit;
      transition: background-color 0.15s ease-in-out, border-color 0.15s ease-in-out;
    }
    input::before {
      content: "";
      width: 0.65em;
      height: 0.65em;
      transform: scale(0);
      transform-origin: center;
      transition: transform 0.12s ease-in-out;
      box-shadow: inset 1em 1em var(--smd-primary-text, #fff);
      clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
    }
    input:checked {
      background-color: var(--bs-primary, #0d6efd);
      border-color: var(--bs-primary, #0d6efd);
    }
    input:checked::before { transform: scale(1); }
    input:focus-visible {
      outline: 2px solid var(--bs-primary, #0d6efd);
      outline-offset: 1px;
    }

    /* switch (pill) variant */
    :host([switch]) input {
      position: relative;
      display: inline-block;
      width: 2.5em;
      height: 1.5em;
      border-radius: 2em;
      background-color: var(--bs-secondary-bg, #495057);
      transition: background-color 0.15s ease-in-out, border-color 0.15s ease-in-out;
    }
    :host([switch]) input::before {
      content: "";
      position: absolute;
      top: 0.15em;
      left: 0.15em;
      width: 1.2em;
      height: 1.2em;
      border-radius: 50%;
      background-color: #fff;
      box-shadow: none;
      clip-path: none;
      transform: none;
      transition: transform 0.15s ease-in-out;
    }
    :host([switch]) input:checked {
      background-color: var(--bs-primary, #0d6efd);
      border-color: var(--bs-primary, #0d6efd);
    }
    :host([switch]) input:checked::before { transform: translateX(1em); }
  `);

  const smdCheckboxTemplate = document.createElement("template");
  smdCheckboxTemplate.innerHTML = `<label><input type="checkbox"><slot></slot></label>`;

  class SmdCheckbox extends HTMLElement {
    static get observedAttributes() {
      return ["checked", "disabled", "switch", "name", "value"];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      SmdStyles.adoptStyles(this.shadowRoot, [smdCheckboxSheet]);
      this.shadowRoot.appendChild(smdCheckboxTemplate.content.cloneNode(true));
      this._input = this.shadowRoot.querySelector("input");
      this._input.addEventListener("change", () => {
        this._syncCheckedAttr();
        this._emit();
      });
    }

    connectedCallback() {
      // If the host was assigned `.checked`/`.disabled` as a plain property
      // before it upgraded (common for nodes inside a freshly-created shadow
      // root), that own property shadows our accessor. Fold it into attributes.
      ["checked", "disabled"].forEach((prop) => {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
          const value = this[prop];
          delete this[prop];
          if (value) this.setAttribute(prop, "");
          else this.removeAttribute(prop);
        }
      });
      this._sync();
    }

    attributeChangedCallback() {
      if (this._input) this._sync();
    }

    get checked() { return this.hasAttribute("checked"); }
    set checked(value) {
      if (value) this.setAttribute("checked", "");
      else this.removeAttribute("checked");
    }

    get disabled() { return this.hasAttribute("disabled"); }
    set disabled(value) {
      if (value) this.setAttribute("disabled", "");
      else this.removeAttribute("disabled");
    }

    _sync() {
      const input = this._input;
      input.checked = this.hasAttribute("checked");
      input.disabled = this.hasAttribute("disabled");
      if (this.id) input.id = this.id + "-input";
      input.name = this.getAttribute("name") || "";
      input.value = this.getAttribute("value") || "on";
      this._syncAria();
    }

    _syncCheckedAttr() {
      if (this._input.checked) this.setAttribute("checked", "");
      else this.removeAttribute("checked");
    }

    _syncAria() {
      this.setAttribute("role", this.hasAttribute("switch") ? "switch" : "checkbox");
      this.setAttribute("aria-checked", this.hasAttribute("checked") ? "true" : "false");
      if (this.hasAttribute("disabled")) this.setAttribute("aria-disabled", "true");
      else this.removeAttribute("aria-disabled");
    }

    _emit() {
      const detail = { checked: this.checked };
      this.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true, detail }));
      this.dispatchEvent(new CustomEvent("input", { bubbles: true, composed: true, detail }));
    }
  }

  if (!global.customElements.get("smd-checkbox")) {
    global.customElements.define("smd-checkbox", SmdCheckbox);
  }
})(window);
