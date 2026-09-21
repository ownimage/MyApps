// <smd-fontawesome-credit> — the Font Awesome attribution line, shown in the
// settings footer (light DOM). The shared library vendors Font Awesome Free
// icons (CC BY 4.0), which requires credit back to Fonticons, Inc.
//
// Self-contained: no attributes, no external assets (the link is plain text).
// Honours the current theme via --bs-secondary-color. Styles live in
// shared/css/styles.css.
(function (global) {
  "use strict";

  class SmdFontAwesomeCredit extends HTMLElement {
    constructor() {
      super();
      this._rendered = false;
    }

    connectedCallback() {
      if (this._rendered) return;
      this._rendered = true;
      this.innerHTML =
        '<span class="credit">Font Awesome icons by ' +
        '<a href="https://fontawesome.com" target="_blank" rel="noopener">Fonticons, Inc.</a> (CC BY 4.0)</span>';
    }
  }

  if (!global.customElements.get("smd-fontawesome-credit")) {
    global.customElements.define("smd-fontawesome-credit", SmdFontAwesomeCredit);
  }
})(window);