// <smd-draghandle> — the shared drag handle used by every sortable list.
//
// Renders the Font Awesome solid `fa-bars` glyph. The glyph is a plain text span
// with an inline font-family/weight (like smd-image) because CSS rules never
// cross into a shadow root; the document-level Font Awesome <link> registers the
// @font-face document-wide.
//
// The size is a VALUE, not a style: the app calls
// `SmdDragHandle.setDefaultSize("normal" | "large")` once at boot (and whenever
// the Touch size setting changes). Every handle picks it up — including handles
// nested inside pmd-* components — and an optional `size` attribute overrides it
// per instance. No styles are injected from outside.
(function (global) {
  "use strict";

  // Font Awesome solid fa-bars (fontawesome-icons.json: fa.bars.h = f0c9, w = 900).
  const GLYPH = "\uf0c9";

  const SIZE_CSS = {
    normal: ":host { font-size: 1.2rem; padding: 0.15rem 0.25rem; }",
    large: ":host { font-size: 1.6rem; padding: 0.4rem 0.5rem; }"
  };

  const baseSheet = SmdStyles.sheetFor(`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      line-height: 1;
      cursor: grab;
      touch-action: none;
      -webkit-touch-callout: none;
      color: inherit;
      opacity: 0.55;
      user-select: none;
      -webkit-user-select: none;
    }
    :host(:active) { cursor: grabbing; }
    .glyph {
      font-family: "Font Awesome 6 Free";
      font-weight: 900;
      font-style: normal;
      font-variant: normal;
      text-transform: none;
      line-height: 1;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
  `);

  const sizeSheetCache = Object.create(null);
  function sizeSheet(size) {
    if (!sizeSheetCache[size]) sizeSheetCache[size] = SmdStyles.sheetFor(SIZE_CSS[size]);
    return sizeSheetCache[size];
  }

  // Connected instances, so a global size change can refresh every handle.
  const liveInstances = new Set();

  const template = document.createElement("template");
  template.innerHTML = '<span class="glyph" aria-hidden="true"></span>';

  class SmdDragHandle extends HTMLElement {
    static get observedAttributes() {
      return ["size"];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      this.shadowRoot.querySelector(".glyph").textContent = GLYPH;
    }

    connectedCallback() {
      liveInstances.add(this);
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
      return SIZE_CSS[value] ? value : "normal";
    }

    _applySize() {
      // Size sheet kept LAST and replaced (not appended) so a later size always
      // wins — adoptStyles dedups and would otherwise leave the older sheet last.
      this.shadowRoot.adoptedStyleSheets = [baseSheet, sizeSheet(this._size())];
    }
  }

  SmdDragHandle.defaultSize = "normal";

  SmdDragHandle.setDefaultSize = function (value) {
    const v = SIZE_CSS[value] ? value : "normal";
    SmdDragHandle.defaultSize = v;
    liveInstances.forEach((el) => el._applySize());
  };

  if (!global.customElements.get("smd-draghandle")) {
    global.customElements.define("smd-draghandle", SmdDragHandle);
  }
  global.SmdDragHandle = SmdDragHandle;
})(window);
