// <smd-openmoji-credit> - the OpenMoji attribution line, shown in the settings
// footer beneath <smd-fontawesome-credit> (light DOM). The shared library vendors
// the OpenMoji colour emoji font, which is CC BY-SA 4.0 and requires credit back
// to the OpenMoji project.
//
// Self-contained: no attributes, no external assets (the links are plain text).
// Honours the current theme via the inherited text colour. Styles live in
// shared/css/styles.css.
(function (global) {
  "use strict";

  class SmdOpenMojiCredit extends HTMLElement {
    constructor() {
      super();
      this._rendered = false;
    }

    connectedCallback() {
      if (this._rendered) return;
      this._rendered = true;
      // Own its layout (the shared sheet is colour/size only): a block so the
      // attribution sits on its own line UNDER <smd-fontawesome-credit>, which is
      // inline.
      if (typeof injectSmdComponentStyle === "function") {
        injectSmdComponentStyle("smd-openmoji-credit", "smd-openmoji-credit { display: block; }");
      }
      this.innerHTML =
        '<span class="credit">All emojis designed by ' +
        '<a href="https://openmoji.org/" target="_blank" rel="noopener">OpenMoji</a>. ' +
        'License: <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a></span>';
    }
  }

  if (!global.customElements.get("smd-openmoji-credit")) {
    global.customElements.define("smd-openmoji-credit", SmdOpenMojiCredit);
  }
})(window);
