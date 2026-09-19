// <smd-theme> — a self-contained theme selector component (light DOM).
//
// Renders a <select class="form-select"> (Bootstrap styles it) listing every
// theme from the shared `themeConfig` global (SmdConfig of the lib), labelled
// "Name (light|dark)". The current value is held in the `theme` attribute
// (settable for restore). On change it updates that attribute and dispatches a
// composing `smd-theme-change` event with detail = { theme }. It does NOT apply
// the theme itself — the host app listens and calls applyTheme()/changeTheme(),
// so the component stays reusable.
//
// Attributes:
//   theme  — the currently selected theme name
//   id     — forwarded to the inner <select> (for $id()/tests)
(function (global) {
  "use strict";

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  class SmdTheme extends HTMLElement {
    static get observedAttributes() {
      return ["theme"];
    }

    constructor() {
      super();
      this._rendered = false;
    }

    get theme() {
      return this.getAttribute("theme") || (typeof themeConfig !== "undefined" && themeConfig.superhero ? "superhero" : "");
    }

    set theme(val) {
      this.setAttribute("theme", val || "");
    }

    connectedCallback() {
      this._render();
      const sel = this.querySelector("select");
      if (sel && !sel.__smdThemeBound) {
        sel.__smdThemeBound = true;
        sel.addEventListener("change", () => {
          const value = sel.value;
          this.setAttribute("theme", value);
          this.dispatchEvent(new CustomEvent("smd-theme-change", {
            bubbles: true,
            composed: true,
            detail: { theme: value }
          }));
        });
      }
    }

    attributeChangedCallback() {
      // Chromium connects elements DURING an innerHTML parse into an already
      // connected host, so attributeChangedCallback can fire before our
      // connectedCallback has stamped the <select>. Only render once rendered.
      if (this.isConnected && this._rendered) this._render();
    }

    _render() {
      if (!this._rendered) {
        this._rendered = true;
        this.innerHTML = '<select class="form-select"></select>';
      }
      const config = typeof themeConfig !== "undefined" ? themeConfig : {};
      const sel = this.querySelector("select");
      if (!sel) return;

      const names = Object.keys(config);
      const sig = names.join(",");
      const current = this.theme;
      const hasCurrent = config && Object.prototype.hasOwnProperty.call(config, current);
      // (Re)build when the theme set changes, OR while it is still being loaded
      // (services load after the component; first render sees an empty config).
      if (!sel.__smdThemeSig || sel.__smdThemeSig !== sig || (current && !hasCurrent)) {
        if (!names.length) return; // config not loaded yet; retry next render
        sel.__smdThemeSig = sig;
        sel.innerHTML = names.map((name) => {
          const meta = config[name] || {};
          const label = name.charAt(0).toUpperCase() + name.slice(1) + " (" + (meta.bsTheme || "light") + ")";
          return '<option value="' + escapeHtml(name) + '">' + escapeHtml(label) + "</option>";
        }).join("");
      }
      if (hasCurrent) sel.value = current;
    }
  }

  if (!global.customElements.get("smd-theme")) {
    global.customElements.define("smd-theme", SmdTheme);
  }
})(window);