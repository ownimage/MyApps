// <smd-checkbox> — the shared, themed checkbox used across the app (light DOM).
//
// Renders a native checkbox inside the host in the light DOM so every checkbox
// shares one look (styles live in shared/css/styles.css, element-scoped). The
// host itself is ARIA-checkable (`role=checkbox|switch` + `aria-checked`) so
// assistive tech — and Playwright's check()/toBeChecked() — treat it like a real
// checkbox. Clicking anywhere on the built-in label toggles it; a `switch`
// attribute renders a pill toggle instead of a square.
//
// The light text inside the host is the label (captured on first connect, like
// smd-button). The checkbox input also carries the host-id suffix "-input" for
// stable test locators.
//
// Attributes:
//   checked   — boolean; the checkbox state
//   disabled  — boolean
//   switch    — render as a switch (pill) instead of a square checkbox
//   name      — forwarded to the inner input
//   value     — forwarded to the inner input
//   size      — "normal" | "large" (Touch size); defaults to SmdCheckbox.defaultSize
// Events:
//   change / input — composed + bubbling; detail = { checked }
// Property:
//   checked (get/set)
(function (global) {
  "use strict";

  const smdCheckboxTemplate = document.createElement("template");
  smdCheckboxTemplate.innerHTML = `<label><input type="checkbox"><span class="checkbox-label"></span></label>`;

  // Touch size is a VALUE: the shared css maps html[data-smd-touch-size] (and a
  // per-instance size attribute) onto --smd-checkbox-input-size. setDefaultSize()
  // only mirrors the value onto the html attribute for CSS; no inline styles.
  const SIZES = {
    normal: "1em",
    large: "1.4em"
  };

  class SmdCheckbox extends HTMLElement {
    static get observedAttributes() {
      return ["checked", "disabled", "switch", "name", "value", "size"];
    }

    constructor() {
      super();
      this._label = undefined;
    }

    connectedCallback() {
      // Capture the authored label once (before our render replaces light text).
      if (this._label === undefined) {
        this._label = this.textContent.replace(/^\s+|\s+$/g, "");
      }
      this.innerHTML = "";
      this.appendChild(smdCheckboxTemplate.content.cloneNode(true));
      this._input = this.querySelector("input");
      this.querySelector(".checkbox-label").textContent = this._label || "";
      this._input.addEventListener("change", () => {
        this._syncCheckedAttr();
        this._emit();
      });

      // If the host was assigned `.checked`/`.disabled` as a plain property
      // before it upgraded, that own property shadows our accessor. Fold it in.
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

    disconnectedCallback() {}

    attributeChangedCallback() {
      if (this.isConnected && this._input) {
        this._sync();
      }
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
      if (!input) return;
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

  SmdCheckbox.defaultSize = "normal";

  SmdCheckbox.setDefaultSize = function (value) {
    const v = SIZES[value] ? value : "normal";
    SmdCheckbox.defaultSize = v;
    document.documentElement.dataset.smdTouchSize = v;
  };

  if (!global.customElements.get("smd-checkbox")) {
    global.customElements.define("smd-checkbox", SmdCheckbox);
  }
  global.SmdCheckbox = SmdCheckbox;
})(window);