// <smd-draghandle> — the shared drag handle used by every sortable list (light DOM).
//
// Renders the Font Awesome solid `fa-bars` glyph as a plain light-DOM span with
// an inline font-family/weight (the document-level Font Awesome <link> registers
// the @font-face document-wide). Base layout rules live in shared/css/styles.css.
//
// Size is a VALUE: the shared css maps html[data-smd-touch-size] (and a
// per-instance size attribute) onto --smd-draghandle-size, which sets the host
// font-size (the glyph and em padding scale with it). setDefaultSize() only
// mirrors the value onto the html attribute for CSS; no inline styles.
(function (global) {
  "use strict";

  // Font Awesome solid fa-bars (fontawesome-icons.json: fa.bars.h = f0c9, w = 900).
  const GLYPH = "\uf0c9";

  const SIZES = { normal: true, large: true };

  class SmdDragHandle extends HTMLElement {
    constructor() {
      super();
      this._glyph = document.createElement("span");
      this._glyph.className = "glyph";
      this._glyph.setAttribute("aria-hidden", "true");
      this._glyph.textContent = GLYPH;
    }

    connectedCallback() {
      if (!this._rendered) {
        this._rendered = true;
        // Merge in fresh light children (e.g. a slotted handle moved in by a
        // parent component) — the glyph is rendered with them, not in a shadow.
        this.appendChild(this._glyph);
      }
    }
  }

  SmdDragHandle.defaultSize = "normal";

  SmdDragHandle.setDefaultSize = function (value) {
    const v = SIZES[value] ? value : "normal";
    SmdDragHandle.defaultSize = v;
    document.documentElement.dataset.smdTouchSize = v;
  };

  if (!global.customElements.get("smd-draghandle")) {
    global.customElements.define("smd-draghandle", SmdDragHandle);
  }
  global.SmdDragHandle = SmdDragHandle;
})(window);