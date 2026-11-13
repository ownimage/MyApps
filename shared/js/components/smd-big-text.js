// <smd-big-text> fits plain text into the space supplied by its parent.
// API: .value / text="...", .lines = [{text, scale, weight, style, gap}],
// font-family="...", font-weight="400", .fit(). All text is rendered safely.
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
      this._lines = null;
      this._value = String(value == null ? "" : value).replace(/\r\n?/g, "\n");
      this._renderText();
    }

    get lines() { return this._lines ? this._lines.map(line => ({...line})) : null; }
    set lines(value) {
      const finite = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
      this._lines = Array.isArray(value) ? value.map(line => {
        if (typeof line !== "object" || line === null) line = {text: line};
        return {text: String(line.text ?? "").replace(/\r\n?/g, "\n"), scale: finite(line.scale, 1, .1, 4),
          weight: String(line.weight || "inherit"), style: line.style === "italic" ? "italic" : "normal", gap: finite(line.gap, 0, 0, 4)};
      }) : [];
      this._value = this._lines.map(line => line.text).join("\n");
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
      if (name === "text") { this._lines = null; this._value = String(newValue || "").replace(/\r\n?/g, "\n"); }
      this._renderText();
    }

    _renderText() {
      if (!this._content) return;
      // A trailing newline needs a zero-width character to retain its final
      // empty line in browser layout. .value remains the original plain text.
      this._content.replaceChildren();
      if (this._lines) {
        this._lines.forEach((line, index) => {
          const element = document.createElement("div");
          element.className = "smd-big-text-line";
          element.textContent = line.text + (line.text.endsWith("\n") ? "\u200b" : "");
          element.style.fontSize = line.scale + "em";
          element.style.fontWeight = line.weight;
          element.style.fontStyle = line.style;
          element.style.marginTop = (index ? line.gap : 0) + "em";
          this._content.appendChild(element);
        });
      } else this._content.textContent = this.value + (this.value.endsWith("\n") ? "\u200b" : "");
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
      // Whole-node ranges include invisible hanging wrap spaces. Their bounds
      // vary non-monotonically at word-wrap points and can shrink text far too
      // much. Measure actual words; scroll dimensions still count blank lines.
      const ranges = [];
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (const word of node.textContent.matchAll(/\S+/gu)) {
          const range = document.createRange();
          range.setStart(node, word.index);
          range.setEnd(node, word.index + word[0].length);
          ranges.push(range);
        }
      }
      const fits = size => {
        content.style.fontSize = size + "px";
        return content.scrollWidth <= width && content.scrollHeight <= height && ranges.every(range => {
          const glyphs = range.getBoundingClientRect();
          return glyphs.left >= bounds.left && glyphs.right <= bounds.right &&
            glyphs.top >= bounds.top && glyphs.bottom <= bounds.bottom;
        });
      };
      let low = 0;
      let high = height / Math.min(1, ...(this._lines || []).map(line => line.scale));
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
