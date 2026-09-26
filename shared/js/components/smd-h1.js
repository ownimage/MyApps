// <smd-h1> — heading that follows the Font Size setting (light DOM).
//
// Renders a REAL <h1> into the light DOM, so heading semantics, theme colour
// and theme weight all still apply to a genuine heading. The host carries the
// h1 type token as an em multiplier of the body font-size (shared/css/styles.css
// TYPESCALE), so the heading scales with the Font Size setting; the scoped
// `smd-h1 h1` rule in shared/css/styles.css (specificity 0,0,2) beats the
// theme's own rem-based `h1` rule (0,0,1) regardless of how applyTheme reorders
// the stylesheet links — keeping the heading on the em ramp instead of frozen
// to the root rem.
//
// Usage: `<smd-h1 class="mb-0">Tue 22 Sep, 2026</smd-h1>` — static light text
// is captured on first connect; if the HOST's textContent is replaced wholesale
// later (as components that re-render do), a childList MutationObserver
// re-mounts the inner <h1> with the new label. Styles live in
// shared/css/styles.css (element-scoped).
(function (global) {
  "use strict";

  const template = document.createElement("template");
  template.innerHTML = `<h1></h1>`;

  class SmdH1 extends HTMLElement {
    connectedCallback() {
      if (this._mo) return;
      this._mount();
      this._mo = new MutationObserver(() => this._mount());
      this._mo.observe(this, { childList: true });
    }

    disconnectedCallback() {
      if (this._mo) {
        this._mo.disconnect();
        this._mo = null;
      }
    }

    _mount() {
      if (this.querySelector("h1")) return;
      const label = (this.textContent || "").replace(/^\s+|\s+$/g, "");
      this.innerHTML = "";
      const h = template.content.firstElementChild.cloneNode(true);
      h.textContent = label;
      this.appendChild(h);
    }
  }

  if (!global.customElements.get("smd-h1")) {
    global.customElements.define("smd-h1", SmdH1);
  }
  global.SmdH1 = SmdH1;
})(window);