// <smd-badge> — themed Bootstrap badge (light DOM).
//
// Renders straight onto the host element using the real Bootstrap badge classes
// (`.badge.text-bg-<variant>`, optionally `rounded-pill`), so the colours always
// match the loaded theme exactly. The text is the element's own light text node
// (consumers set textContent), so no template is needed. Base sizing and the
// `[hidden]` rule live in shared/css/styles.css.
//
// Attributes:
//   variant — primary | secondary | success | danger | warning | info | light | dark (default primary)
//   pill    — rounded-pill instead of the theme's badge radius
(function (global) {
  "use strict";

  const VARIANTS = ["primary", "secondary", "success", "danger", "warning", "info", "light", "dark"];

  class SmdBadge extends HTMLElement {
    static get observedAttributes() {
      return ["variant", "pill"];
    }

    connectedCallback() {
      this._sync();
    }

    attributeChangedCallback() {
      if (this.isConnected) this._sync();
    }

    _sync() {
      const requested = this.getAttribute("variant");
      const variant = VARIANTS.indexOf(requested) !== -1 ? requested : "primary";
      for (const v of VARIANTS) this.classList.toggle("text-bg-" + v, v === variant);
      this.classList.toggle("rounded-pill", this.hasAttribute("pill"));
      this.classList.add("badge");
    }
  }

  if (!global.customElements.get("smd-badge")) {
    global.customElements.define("smd-badge", SmdBadge);
  }
  global.SmdBadge = SmdBadge;
})(window);