// <smd-draghandle> — the shared drag handle used by every sortable list (light DOM).
//
// Renders the Font Awesome solid `fa-bars` glyph as a plain light-DOM span with
// an inline font-family/weight (the document-level Font Awesome <link> registers
// the @font-face document-wide). Base layout rules live in shared/css/styles.css.
//
// The size is a VALUE, not a style: the app calls
// `SmdDragHandle.setDefaultSize("normal" | "large")` once at boot (and whenever
// the Touch size setting changes). Every handle picks it up — including handles
// nested inside pmd-* components — and an optional `size` attribute overrides it
// per instance. Sizing is applied as an inline font-size/padding on the host,
// scaled together with its em-based dimensions.
(function (global) {
  "use strict";

  // Font Awesome solid fa-bars (fontawesome-icons.json: fa.bars.h = f0c9, w = 900).
  const GLYPH = "\uf0c9";

  const SIZES = {
    normal: { fontSize: "1.2rem", padding: "0.15rem 0.25rem" },
    large: { fontSize: "1.6rem", padding: "0.4rem 0.5rem" }
  };

  // Connected instances, so a global size change can refresh every handle.
  const liveInstances = new Set();

  class SmdDragHandle extends HTMLElement {
    static get observedAttributes() {
      return ["size"];
    }

    constructor() {
      super();
      this._glyph = document.createElement("span");
      this._glyph.className = "glyph";
      this._glyph.setAttribute("aria-hidden", "true");
      this._glyph.textContent = GLYPH;
    }

    connectedCallback() {
      liveInstances.add(this);
      if (!this._rendered) {
        this._rendered = true;
        // Merge in fresh light children (e.g. a slotted handle moved in by a
        // parent component) — the glyph is rendered with them, not in a shadow.
        this.appendChild(this._glyph);
      }
      this._applySize();
    }

    disconnectedCallback() {
      liveInstances.delete(this);
    }

    attributeChangedCallback() {
      if (this.isConnected) this._applySize();
    }

    _size() {
      const value = (this.getAttribute("size") || SmdDragHandle.defaultSize || "normal").toLowerCase();
      return SIZES[value] ? value : "normal";
    }

    _applySize() {
      const size = SIZES[this._size()];
      this.style.fontSize = size.fontSize;
      this.style.padding = size.padding;
    }
  }

  SmdDragHandle.defaultSize = "normal";

  SmdDragHandle.setDefaultSize = function (value) {
    const v = SIZES[value] ? value : "normal";
    SmdDragHandle.defaultSize = v;
    liveInstances.forEach((el) => el._applySize());
  };

  if (!global.customElements.get("smd-draghandle")) {
    global.customElements.define("smd-draghandle", SmdDragHandle);
  }
  global.SmdDragHandle = SmdDragHandle;
})(window);