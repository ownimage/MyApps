(function (global) {
  "use strict";

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  class SmdTheme extends HTMLElement {
    static get observedAttributes() {
      return ["theme", "mode"];
    }

    constructor() {
      super();
      this._rendered = false;
    }

    get theme() {
      if (this.getAttribute("theme")) return this.getAttribute("theme");
      return typeof normalizeTheme === "function" ? normalizeTheme(null) : "superhero";
    }

    set theme(value) {
      this.setAttribute("theme", value || "");
    }

    get mode() {
      return typeof normalizeThemeMode === "function"
        ? normalizeThemeMode(this.getAttribute("mode"))
        : (this.getAttribute("mode") === "dark" ? "dark" : "light");
    }

    set mode(value) {
      this.setAttribute("mode", value || "light");
    }

    connectedCallback() {
      this._render();
      const themeSelect = this.querySelector(".smd-theme-select");
      const modeSelect = this.querySelector(".smd-theme-mode-select");
      if (themeSelect && !themeSelect.__smdThemeBound) {
        themeSelect.__smdThemeBound = true;
        themeSelect.addEventListener("change", () => {
          this.setAttribute("theme", themeSelect.value);
          this._dispatchChange("theme");
        });
      }
      if (modeSelect && !modeSelect.__smdThemeModeBound) {
        modeSelect.__smdThemeModeBound = true;
        modeSelect.addEventListener("change", () => {
          this.setAttribute("mode", modeSelect.value);
          this._dispatchChange("mode");
        });
      }
    }

    attributeChangedCallback() {
      if (this.isConnected) this._render();
    }

    _dispatchChange(source) {
      this.dispatchEvent(new CustomEvent("smd-theme-change", {
        bubbles: true,
        composed: true,
        detail: { theme: this.theme, mode: this.mode, source }
      }));
    }

    _render() {
      if (!this._rendered) {
        this._rendered = true;
        this.innerHTML =
          '<div class="smd-theme-field row mb-3 align-items-center">' +
            '<label class="col-4 text-end form-label mb-0">Theme</label>' +
            '<div class="col-8"><select class="form-select smd-theme-select"></select></div>' +
          '</div>' +
          '<div class="smd-theme-field row mb-3 align-items-center">' +
            '<label class="col-4 text-end form-label mb-0">Theme Mode</label>' +
            '<div class="col-8"><select class="form-select smd-theme-mode-select"></select></div>' +
          '</div>';
      }
      const config = typeof themeConfig !== "undefined" ? themeConfig : {};
      const themeSelect = this.querySelector(".smd-theme-select");
      const modeSelect = this.querySelector(".smd-theme-mode-select");
      if (!themeSelect || !modeSelect) return;
      if (!modeSelect.__smdThemeModeSig) {
        modeSelect.__smdThemeModeSig = true;
        modeSelect.innerHTML = '<option value="light">Light</option>' +
          '<option value="dark">Dark</option>';
      }
      modeSelect.value = this.mode;

      const names = Object.keys(config);
      const sig = names.join(",");
      const current = this.theme;
      const hasCurrent = Object.prototype.hasOwnProperty.call(config, current);
      if (!themeSelect.__smdThemeSig || themeSelect.__smdThemeSig !== sig || (current && !hasCurrent)) {
        if (!names.length) return;
        themeSelect.__smdThemeSig = sig;
        themeSelect.innerHTML = names.map((name) => {
          const label = name.charAt(0).toUpperCase() + name.slice(1);
          return '<option value="' + escapeHtml(name) + '">' + escapeHtml(label) + "</option>";
        }).join("");
      }
      if (hasCurrent) themeSelect.value = current;
    }
  }

  if (!global.customElements.get("smd-theme")) {
    global.customElements.define("smd-theme", SmdTheme);
  }
})(window);
