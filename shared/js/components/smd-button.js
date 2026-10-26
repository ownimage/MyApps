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
//   block    — boolean; the host becomes `d-block` and the inner button `w-100`, giving
//              a FULL-WIDTH action button (settings Danger rows, page bodies)
//   disabled — boolean
//   icon     — OPTIONAL Font Awesome class list, e.g. `icon="fa-solid fa-cog"`. Renders
//              `<i class="fa-solid fa-cog" aria-hidden="true">` before the label, so an
//              icon-only button is possible (no "Button" fallback then).
//   aria-label / aria-pressed — mirrored onto the inner button (the real control).
//
// RICH CONTENT: if the host contains ELEMENT children (e.g. two icons, or an icon
// and a `<span>`), they are MOVED into the inner button untouched instead of being
// flattened to text. That keeps composed rows (a chevron plus a badge) intact.
(function (global) {
  "use strict";

  // Component scripts are loaded before smd-app.js in the app shells. Define
  // the shared style injector early so a light-DOM component that upgrades
  // during body parsing can install its layout before the app boot script.
  if (typeof global.injectSmdComponentStyle !== "function") {
    global.injectSmdComponentStyle = function (id, css) {
      if (document.getElementById(id)) return;
      const style = document.createElement("style");
      style.id = id;
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    };
  }

  const VARIANTS = ["primary", "secondary", "success", "danger", "info", "warning", "light", "dark"];
  const template = document.createElement("template");
  template.innerHTML = `<button class="btn btn-primary"></button>`;

  class SmdButton extends HTMLElement {
    static get observedAttributes() {
      return ["variant", "disabled", "size", "block", "icon", "aria-label", "aria-pressed"];
    }

    constructor() {
      super();
      this._label = undefined;
      this._rich = null;
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
      if (name === "block") this._applyBlock();
      if (name === "icon") this._renderContent();
      if (name === "aria-label" || name === "aria-pressed") this._applyA11y();
    }

    connectedCallback() {
      // The host is a custom element (display:inline by default); give it the
      // Bootstrap display utility it needs so no shared `smd-button` CSS rule is
      // required. Consumers can still override with another `d-*` class (e.g.
      // `d-block`), which wins by source order.
      this.classList.add("d-inline-block");
      // A disabled button must be inert even for HOST-level click handlers: the
      // inner <button> is truly disabled but Bootstrap gives it
      // `pointer-events: none`, so a click "on" it targets this host instead.
      // Block the event so an inline `onclick` (or a parent listener such as
      // smd-page's footer action) cannot fire while the button looks disabled.
      if (!this._clickGuardBound) {
        this._clickGuardBound = true;
        this.addEventListener("click", (event) => {
          if (this.disabled) {
            event.stopImmediatePropagation();
            event.preventDefault();
          }
        }, true);
      }
      // Clone-safe: Sortable's fallback ghost is `cloneNode(true)`, which copies
      // ATTRIBUTES (including `data-smd-built`) but NOT the `_label` / `_rich` JS
      // fields. Rebuilding a clone would treat the ALREADY-BUILT inner <button> as
      // rich content and wrap it in a second one - a filled Bootstrap button
      // around a row's icons and name (the "drag ghost is not right" bug). A clone
      // keeps its built markup and only re-applies the attribute-driven styling.
      if (!this.hasAttribute("data-smd-built")) {
        this.setAttribute("data-smd-built", "");
        if (this._label === undefined) {
          this._label = this.textContent.replace(/^\s+|\s+$/g, "");
          // Element children (icons, spans) are RICH content: keep them, they are
          // moved into the inner button below. Plain text becomes the label.
          const elements = Array.prototype.filter.call(this.childNodes, (node) => node.nodeType === 1);
          this._rich = elements.length ? Array.prototype.slice.call(this.childNodes) : null;
        }
        const rich = this._rich;
        this.innerHTML = "";
        const btn = template.content.firstElementChild.cloneNode(true);
        if (this.id) btn.id = this.id + "-button";
        this.appendChild(btn);
        if (rich) rich.forEach((node) => btn.appendChild(node));
        this._renderContent();
      }
      this._applyVariant();
      this._applySize();
      this._applyBlock();
      this._applyDisabled();
      this._applyA11y();
    }

    _btn() {
      return this.querySelector("button");
    }

    // The inner button's contents: rich authored children (already moved in), or
    // an optional `<i class="icon">` plus the captured text label.
    _renderContent() {
      const btn = this._btn();
      if (!btn || this._rich) return;
      btn.textContent = "";
      const icon = (this.getAttribute("icon") || "").trim();
      if (icon) {
        const i = document.createElement("i");
        icon.split(/\s+/).forEach((cls) => { if (cls) i.classList.add(cls); });
        i.setAttribute("aria-hidden", "true");
        btn.appendChild(i);
      }
      const label = this._label || "";
      if (icon) {
        if (label) {
          const span = document.createElement("span");
          span.className = "smd-button-label";
          span.textContent = label;
          btn.appendChild(span);
        }
      } else {
        // Unchanged legacy behaviour: a text button (or the "Button" fallback).
        btn.textContent = label || "Button";
      }
    }

    // The inner <button> is the focusable control, so the accessible name and
    // pressed state must live there, not only on the host.
    _applyA11y() {
      const btn = this._btn();
      if (!btn) return;
      ["aria-label", "aria-pressed"].forEach((name) => {
        if (this.hasAttribute(name)) btn.setAttribute(name, this.getAttribute(name));
        else btn.removeAttribute(name);
      });
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

    // `block` = a FULL-WIDTH action button: the host becomes a block box and the
    // inner button fills it, so a column of these buttons is all one size.
    _applyBlock() {
      const btn = this._btn();
      if (!btn) return;
      const on = this.hasAttribute("block");
      btn.classList.toggle("w-100", on);
      this.classList.toggle("d-block", on);
      this.classList.toggle("d-inline-block", !on);
    }

    _applyDisabled() {
      const btn = this._btn();
      if (btn) btn.disabled = this.disabled;
    }
  }

  // Icon + label spacing for the `icon` attribute (apps may override, e.g.
  // Storyboard's rail stacks the icon above the label instead).
  global.injectSmdComponentStyle("smd-button-icon",
    "smd-button > button > i + .smd-button-label { margin-left: 0.35em; }");

  if (!global.customElements.get("smd-button")) {
    global.customElements.define("smd-button", SmdButton);
  }
  global.SmdButton = SmdButton;
})(window);
