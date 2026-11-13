// <smd-big-text> fits plain text into the space supplied by its parent.
// API: .value / text="...", font-family="...", font-weight="400", .fit().
// Set a definite height on the host or its layout container. Explicit newlines
// are preserved; additional lines wrap as needed. No app state/storage lives here.
(function () {
  "use strict";

  class SmdBigText extends HTMLElement {
    static get observedAttributes() { return ["text", "font-family", "font-weight"]; }

    constructor() {
      super();
      this._value = undefined;
      this._frame = 0;
      this._scheduleFit = this._scheduleFit.bind(this);
      this._fontLoaded = this._fontLoaded.bind(this);
    }

    get value() { return this._value === undefined ? (this.getAttribute("text") || "") : this._value; }
    set value(value) {
      this._value = String(value == null ? "" : value).replace(/\r\n?/g, "\n");
      this._renderText();
    }

    connectedCallback() {
      injectSmdComponentStyle("smd-big-text-layout", `
        smd-big-text { display: block; position: relative; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
        smd-big-text[hidden] { display: none !important; }
        smd-big-text > .smd-big-text-viewport { position: absolute; inset: var(--smd-big-text-padding, 0px); display: flex; align-items: center; min-width: 0; min-height: 0; }
        smd-big-text .smd-big-text-content { width: 100%; min-width: 0; margin: 0; padding: 0; border: 0; white-space: pre-wrap; overflow-wrap: normal; word-break: normal; text-align: center; line-height: 1.15; letter-spacing: normal; text-transform: none; }
      `);
      if (!this._content) {
        const initial = this._value === undefined ? (this.getAttribute("text") ?? this.textContent) : this._value;
        this.replaceChildren();
        this._viewport = document.createElement("div");
        this._viewport.className = "smd-big-text-viewport";
        this._content = document.createElement("div");
        this._content.className = "smd-big-text-content";
        this._content.dir = "auto";
        this._viewport.appendChild(this._content);
        this.appendChild(this._viewport);
        this._value = String(initial).replace(/\r\n?/g, "\n");
      }
      this._resizeObserver = new ResizeObserver(this._scheduleFit);
      this._resizeObserver.observe(this);
      window.addEventListener("resize", this._scheduleFit);
      if (window.visualViewport) window.visualViewport.addEventListener("resize", this._scheduleFit);
      if (document.fonts) document.fonts.addEventListener("loadingdone", this._fontLoaded);
      this._renderText();
    }

    disconnectedCallback() {
      if (this._resizeObserver) this._resizeObserver.disconnect();
      cancelAnimationFrame(this._frame);
      this._frame = 0;
      window.removeEventListener("resize", this._scheduleFit);
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", this._scheduleFit);
      if (document.fonts) document.fonts.removeEventListener("loadingdone", this._fontLoaded);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;
      if (name === "text") this._value = String(newValue || "").replace(/\r\n?/g, "\n");
      this._renderText();
    }

    _renderText() {
      if (!this._content) return;
      // A trailing newline needs a zero-width character to retain its final
      // empty line in browser layout. .value remains the original plain text.
      this._content.textContent = this.value + (this.value.endsWith("\n") ? "\u200b" : "");
      this._content.style.fontFamily = this.getAttribute("font-family") || "inherit";
      this._content.style.fontWeight = this.getAttribute("font-weight") || "400";
      this._scheduleFit();
    }

    _fontLoaded() { this._scheduleFit(); }

    _scheduleFit() {
      if (!this.isConnected || this._frame) return;
      this._frame = requestAnimationFrame(() => { this._frame = 0; this.fit(); });
    }

    fit() {
      if (!this.isConnected || !this._content || !this.value) return;
      const width = this._viewport.clientWidth;
      const height = this._viewport.clientHeight;
      if (!width || !height) return; // Refit when an initially hidden panel opens.
      const content = this._content;
      const bounds = this._viewport.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(content);
      const fits = size => {
        content.style.fontSize = size + "px";
        const glyphs = range.getBoundingClientRect();
        return content.scrollWidth <= width && content.scrollHeight <= height &&
          glyphs.left >= bounds.left && glyphs.right <= bounds.right &&
          glyphs.top >= bounds.top && glyphs.bottom <= bounds.bottom;
      };
      let low = 0;
      let high = height; // One line is already taller than this at line-height 1.15.
      for (let i = 0; i < 18 && high - low > 0.05; i++) {
        const mid = (low + high) / 2;
        if (fits(mid)) low = mid;
        else high = mid;
      }
      content.style.fontSize = low + "px";
    }
  }

  customElements.define("smd-big-text", SmdBigText);
})();
