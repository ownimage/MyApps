// <smd-search> — shared one-line search input + Clear button (light DOM).
// Styles live in shared/css/styles.css. It replaces the hand-rolled
// "search input + Clear button" rows that used to live in every editor.
//
// The host app supplies the placeholder/value via attributes and reacts to the
// events (so no inline handlers are needed):
//   smd-search-input — detail { value } on every keystroke
//   smd-search-clear — detail { value: "" } when Clear is pressed
//
// Attributes:
//   placeholder — input placeholder text
//   value       — initial input value
//   input-id    — id applied to the inner <input>, so callers that keep
//                 document.getElementById lookups still work (omitted -> no id)
//   button-id   — id applied to the inner Clear <button> (omitted -> no id)
//   clear-label — Clear button label (default "Clear")
//   variant     — Clear button Bootstrap variant (default "danger")
//   size        — normal | small (default small, adds Bootstrap's `btn-sm`)
//   disabled    — boolean (input + button disabled)
(function (global) {
  "use strict";

  const template = document.createElement("template");
  template.innerHTML = `
    <div class="d-flex gap-2 align-items-center">
      <input type="search" class="form-control flex-grow-1" autocomplete="off">
      <button type="button" class="btn btn-danger btn-sm flex-shrink-0">Clear</button>
    </div>
  `;

  class SmdSearch extends HTMLElement {
    static get observedAttributes() {
      return ["placeholder", "value", "disabled", "clear-label", "variant", "size", "input-id", "button-id"];
    }

    constructor() {
      super();
      this._built = false;
      this._bound = false;
    }

    get value() {
      const input = this._input();
      return input ? input.value : "";
    }

    set value(val) {
      const input = this._input();
      const next = val == null ? "" : String(val);
      if (input && input.value !== next) input.value = next;
    }

    connectedCallback() {
      this._build();
      if (!this._bound) {
        this._bound = true;
        const input = this._input();
        input.addEventListener("input", () => {
          this.dispatchEvent(new CustomEvent("smd-search-input", {
            bubbles: true,
            composed: true,
            detail: { value: input.value }
          }));
        });
        this._btn().addEventListener("click", (e) => {
          e.preventDefault();
          input.value = "";
          this.dispatchEvent(new CustomEvent("smd-search-input", {
            bubbles: true,
            composed: true,
            detail: { value: "" }
          }));
          this.dispatchEvent(new CustomEvent("smd-search-clear", {
            bubbles: true,
            composed: true,
            detail: { value: "" }
          }));
        });
      }
      this._applyIds();
      this._apply();
    }

    attributeChangedCallback() {
      if (this._built) {
        this._applyIds();
        this._apply();
      }
    }

    _build() {
      if (this._built) return;
      this._built = true;
      this.appendChild(template.content.cloneNode(true));
    }

    _input() {
      return this.querySelector("input");
    }

    _btn() {
      return this.querySelector("button");
    }

    _applyIds() {
      const input = this._input();
      const btn = this._btn();
      if (!input || !btn) return;
      const inputId = this.getAttribute("input-id");
      const buttonId = this.getAttribute("button-id");
      if (inputId) input.id = inputId;
      if (buttonId) btn.id = buttonId;
    }

    _apply() {
      const input = this._input();
      const btn = this._btn();
      if (!input || !btn) return;
      input.placeholder = this.getAttribute("placeholder") || "";
      const value = this.getAttribute("value");
      if (value !== null && document.activeElement !== input && input.value !== value) input.value = value;
      const disabled = this.hasAttribute("disabled");
      input.disabled = disabled;
      btn.disabled = disabled;
      btn.textContent = this.getAttribute("clear-label") || "Clear";
      const variant = this.getAttribute("variant") || "danger";
      const size = (this.getAttribute("size") || "small").toLowerCase();
      btn.className = "btn btn-" + variant + (size === "small" ? " btn-sm" : "") + " flex-shrink-0";
    }
  }

  if (!global.customElements.get("smd-search")) {
    global.customElements.define("smd-search", SmdSearch);
  }
  global.SmdSearch = SmdSearch;
})(window);
