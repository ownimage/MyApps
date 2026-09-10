// <smd-fontawesome-credit> — the Font Awesome attribution line, shown in the
// settings footer. The shared library vendors Font Awesome Free icons (CC BY
// 4.0), which requires credit back to Fonticons, Inc.
//
// Self-contained: no attributes, no external assets (the link is plain text).
// Honours the current theme via --bs-secondary-color.
(function (global) {
  "use strict";

  const smdFaCreditSheet = SmdStyles.sheetFor(`
  :host { display: block; }
  .credit {
    font-size: 0.875em;
    color: var(--bs-secondary-color, #adb5bd);
  }
  .credit a {
    color: var(--bs-secondary-color, #adb5bd);
    text-decoration: underline;
  }
  `);

  class SmdFontAwesomeCredit extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      SmdStyles.adoptStyles(this.shadowRoot, [smdFaCreditSheet]);
      this.shadowRoot.innerHTML =
        '<span class="credit">Font Awesome icons by ' +
        '<a href="https://fontawesome.com" target="_blank" rel="noopener">Fonticons, Inc.</a> (CC BY 4.0)</span>';
    }
  }

  if (!global.customElements.get("smd-fontawesome-credit")) {
    global.customElements.define("smd-fontawesome-credit", SmdFontAwesomeCredit);
  }
})(window);