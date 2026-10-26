// <smd-color-picker> — shared FULL colour picker (light DOM).
//
// A native colour input dressed as a swatch, plus a hex field, so a caller can
// store an exact colour instead of a theme token (a scene built with fixed
// colours must look the same on every Bootswatch theme). Optionally offers an
// "empty" choice ("Automatic", "Transparent", ...) for callers that keep a
// theme-driven default.
//
// Attributes:
//   value       — the current colour (#rgb / #rrggbb / rgb() / color(srgb ...))
//                 or "" for the empty choice.
//   empty-label — label of the empty button (omitted -> no empty choice)
//   disabled    — boolean
//
// Property: .value (get/set; the setter does NOT emit).
// Event: smd-color-picker-change — detail { value } (value = "" for the empty
//        choice). Bubbles + composed.
(function (global) {
  "use strict";

  const template = document.createElement("template");
  // Whitespace-free: the host must not inherit stray text nodes.
  template.innerHTML = '<div class="smd-color-row"><input type="color" class="smd-color-input"><input type="text" class="form-control form-control-sm smd-color-hex" maxlength="7" spellcheck="false" autocomplete="off"><button type="button" class="btn btn-sm btn-secondary smd-color-empty"></button></div>';

  // Layout mechanics belong to the component (see the shared-CSS rule); colours
  // come from Bootstrap so it sits on any theme.
  const STYLE_ID = "smd-color-picker-style";
  function injectStyle() {
    if (typeof global.injectSmdComponentStyle !== "function") return;
    global.injectSmdComponentStyle(STYLE_ID, `
      smd-color-picker { display: block; }
      smd-color-picker .smd-color-row { display: flex; align-items: center; gap: .5rem; }
      smd-color-picker .smd-color-input {
        flex: none; width: 2.4rem; height: 2.4rem; padding: 0;
        border: 1px solid var(--bs-border-color); border-radius: .375rem;
        background: var(--bs-body-bg); cursor: pointer;
      }
      smd-color-picker .smd-color-input::-webkit-color-swatch-wrapper { padding: 2px; }
      smd-color-picker .smd-color-input::-webkit-color-swatch { border: none; border-radius: .25rem; }
      smd-color-picker .smd-color-input::-moz-color-swatch { border: none; border-radius: .25rem; }
      smd-color-picker .smd-color-hex {
        flex: none; width: 6.5rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      smd-color-picker .smd-color-empty { flex: none; }
    `);
  }

  // #rgb | #rrggbb | rgb()/rgba() | color(srgb r g b) -> "#rrggbb" (lowcase), else "".
  function toHex(input) {
    const raw = String(input == null ? "" : input).trim();
    if (!raw) return "";
    let m = /^#([0-9a-f]{3})$/i.exec(raw);
    if (m) {
      const s = m[1];
      return ("#" + s[0] + s[0] + s[1] + s[1] + s[2] + s[2]).toLowerCase();
    }
    m = /^#([0-9a-f]{6})$/i.exec(raw);
    if (m) return ("#" + m[1]).toLowerCase();
    m = /^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i.exec(raw);
    if (m) return rgbHex([m[1], m[2], m[3]]);
    // Chromium serialises a color-mix()/oklch background as color(srgb r g b)
    // with 0..1 channels, so accept that form too.
    m = /^color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i.exec(raw);
    if (m) return rgbHex([Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255]);
    return "";
  }

  function rgbHex(channels) {
    const parts = channels.map((v) => {
      const n = Math.max(0, Math.min(255, Math.round(Number(v))));
      return ("0" + n.toString(16)).slice(-2);
    });
    return ("#" + parts.join("")).toLowerCase();
  }

  class SmdColorPicker extends HTMLElement {
    static get observedAttributes() {
      return ["value", "empty-label", "disabled"];
    }

    constructor() {
      super();
      this._built = false;
      this._bound = false;
    }

    get value() {
      const hex = this.querySelector(".smd-color-hex");
      return hex ? hex.value.trim().toLowerCase() : "";
    }

    set value(val) {
      this._setValue(val, false);
    }

    connectedCallback() {
      this.classList.add("d-block");
      injectStyle();
      // `data-smd-built` survives cloneNode, so a dragged ghost never builds twice.
      const built = this._built || this.hasAttribute("data-smd-built");
      this._built = true;
      this.setAttribute("data-smd-built", "");
      if (!built) this.appendChild(template.content.cloneNode(true));
      if (!this._bound) {
        this._bound = true;
        const input = this._input();
        const hex = this._hex();
        const empty = this._emptyBtn();
        input.addEventListener("input", () => this._emit(input.value));
        hex.addEventListener("input", () => {
          const value = toHex(hex.value);
          if (!value) return;
          this._apply(value);
          this._emit(value);
        });
        hex.addEventListener("change", () => this._setValue(hex.value, true));
        hex.addEventListener("blur", () => this._setValue(hex.value, false));
        // Enter commits without submitting a surrounding form.
        hex.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          this._setValue(hex.value, true);
        });
        empty.addEventListener("click", (e) => {
          e.preventDefault();
          if (this.hasAttribute("disabled")) return;
          this._setValue("", true);
        });
      }
      this._apply(this.getAttribute("value"));
    }

    attributeChangedCallback() {
      if (this._built) this._apply(this.getAttribute("value"));
    }

    _input() { return this.querySelector(".smd-color-input"); }
    _hex() { return this.querySelector(".smd-color-hex"); }
    _emptyBtn() { return this.querySelector(".smd-color-empty"); }

    // Apply a colour without emitting (used by the attribute / property setter
    // and after a normalisation).
    _apply(value) {
      const input = this._input();
      const hex = this._hex();
      const empty = this._emptyBtn();
      if (!input || !hex || !empty) return;
      const colour = toHex(value);
      const disabled = this.hasAttribute("disabled");
      const last = this._lastColour || "#ffffff";
      input.disabled = disabled;
      hex.disabled = disabled;
      empty.disabled = disabled;
      input.value = colour || last;
      if (colour) this._lastColour = colour;
      input.title = colour || "No colour";
      if (document.activeElement !== hex) hex.value = colour;
      hex.placeholder = "#rrggbb";
      const label = this.getAttribute("empty-label") || "";
      empty.textContent = label || "None";
      // No `empty-label` -> no empty choice at all.
      empty.classList.toggle("d-none", !label);
      empty.classList.toggle("active", !colour);
      empty.setAttribute("aria-pressed", colour ? "false" : "true");
    }

    _setValue(value, emit) {
      const colour = toHex(value);
      this._apply(colour);
      if (colour) this.setAttribute("value", colour);
      else this.removeAttribute("value");
      if (emit) this._emit(colour);
    }

    _emit(value) {
      this.dispatchEvent(new CustomEvent("smd-color-picker-change", {
        bubbles: true,
        composed: true,
        detail: { value: value || "" }
      }));
    }
  }

  if (!global.customElements.get("smd-color-picker")) {
    global.customElements.define("smd-color-picker", SmdColorPicker);
  }
  global.SmdColorPicker = SmdColorPicker;
})(window);
