// <smd-image-picker> — a self-contained image + icon picker component
// (light DOM). Styles live in shared/css/styles.css.
//
// Displays the app's localStorage images (list key = key-prefix + "images")
// plus reusable icon sets (Bootstrap, Font Awesome, FA Brands). It owns all of
// its state, DOM and styles, so it is reusable in its entirety: host it on an
// <smd-page>, in a modal, or inline, and just listen for the
// `smd-image-picker-select` event (detail = { name }) / `smd-image-picker-close`.
//
// The tabs use the shared <smd-tabs> component (padding="small"); each tab's panel
// holds its own `.grid` (all in the light DOM).
//
// It needs the vendored icon-font stylesheets loaded document-wide (the app
// declares them in its styles config) so glyphs actually render.
//
// Icon-set glyph data is fetched and parsed from each set's OWN vendored
// source (bootstrap-icons.css / fontawesome-icons.json) when its tab is first
// activated. No pre-generated metadata file is needed; the sets are small and
// fetch/parse fast enough to do on demand (one per set, cached thereafter).
//
// Attributes:
//   key-prefix  — localStorage prefix for the images list (default "")
//   searchable  — show the search box (default true)
(function (global) {
  "use strict";

  // ---- minimal helpers (self-contained; no dependency on other files) ----

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Resolve the shared-lib root like smdAppRoot() does (theme <link> derived),
  // so vendor/ + icon data resolve whether the app is at /, under a sub-path, or
  // under the library.
  function smdRoot() {
    const link = document.getElementById("bootstrap-theme-css");
    if (!link) return "";
    const rel = link.getAttribute("href") || "";
    const m = rel.match(/^(.*?)css\/themes\/.*$/);
    return m ? m[1] : "";
  }

  const ICON_SETS = [
    { key: "bi", title: "Bootstrap", css: "vendor/bootstrap-icons.css", family: "bootstrap-icons" },
    { key: "fa", title: "FontAwesome", json: "vendor/fontawesome-icons.json", slot: "fa", family: "Font Awesome 6 Free" },
    { key: "fab", title: "FABrands", json: "vendor/fontawesome-icons.json", slot: "fab", family: "Font Awesome 6 Brands" }
  ];

  const loadedIcons = Object.create(null);
  const loadingIcons = Object.create(null);

  const BI_CODEPOINT_RE = /\.bi-([a-z0-9][a-z0-9-]*)::before\s*\{\s*content:\s*["']\\([0-9a-fA-F]+)["']/g;

  // Fetch + parse ONE icon set from its own source and cache the result.
  // bi parses bootstrap-icons.css for `.bi-<name>::before{content:"\fXXX"}`;
  // fa/fab read the { name: {h,w} } maps from fontawesome-icons.json.
  function loadIconSet(cfg) {
    if (loadedIcons[cfg.key]) return Promise.resolve(loadedIcons[cfg.key]);
    if (!loadingIcons[cfg.key]) {
      const v = typeof global.BUILD_NUMBER !== "undefined" ? global.BUILD_NUMBER : Date.now();
      const root = smdRoot();
      loadingIcons[cfg.key] = (cfg.css
        ? global.fetch(root + cfg.css + "?v=" + v).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
            .then((txt) => {
              const map = {};
              let m;
              while ((m = BI_CODEPOINT_RE.exec(txt))) map[m[1]] = m[2];
              return Object.keys(map).map((name) => ({ name, hex: map[name] }));
            })
        : global.fetch(root + cfg.json + "?v=" + v).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then((data) => {
              const slot = data[cfg.slot] || {};
              return Object.keys(slot).map((name) => ({ name, hex: slot[name].h, weight: slot[name].w }));
            })
      ).then((names) => {
        const byName = Object.create(null);
        names.forEach((n) => { byName[n.name] = { hex: n.hex, weight: n.weight }; });
        loadedIcons[cfg.key] = { names: names.map((n) => n.name), byName };
        return loadedIcons[cfg.key];
      }).catch((err) => {
        loadingIcons[cfg.key] = null;
        throw err;
      });
    }
    return loadingIcons[cfg.key];
  }

  // ---- component ----

  class SmdImagePicker extends HTMLElement {
    static get observedAttributes() {
      return ["key-prefix", "searchable"];
    }

    constructor() {
      super();
      this._activeSet = null; // null = local images
      this._search = "";
      this._tabsEl = null;
      this._bound = false;
    }

    get keyPrefix() {
      return this.getAttribute("key-prefix") || "";
    }

    get searchable() {
      const a = this.getAttribute("searchable");
      return a === null || a !== "false";
    }

    connectedCallback() {
      const root = this;
      // Light DOM: constructors may not use innerHTML; the shell is built here.
      if (!root.querySelector(".picker")) {
        root.innerHTML = `
          <div class="picker">
            <div class="search" hidden>
              <input type="search" class="form-control" placeholder="Search images or icons...">
              <button type="button" class="btn btn-secondary clear">Clear</button>
            </div>
            <smd-tabs padding="small" narrow></smd-tabs>
          </div>
        `;
      }
      const input = root.querySelector("input[type=search]");
      if (!this._bound) {
        this._bound = true;
        input.addEventListener("input", () => {
          this._search = input.value.trim().toLowerCase();
          this._renderGrid();
        });
        root.querySelector(".clear").addEventListener("click", () => {
          input.value = "";
          this._search = "";
          this._renderGrid();
        });
      }

      const tabsEl = root.querySelector("smd-tabs");
      this._tabsEl = tabsEl;
      this._keys = [null].concat(ICON_SETS.map((s) => s.key));
      this._activeSet = null;
      tabsEl.tabs = this._keys.map((key) => ({
        title: key === null ? "Local" : (ICON_SETS.find((s) => s.key === key) || {}).title,
        content: '<div class="grid"></div>'
      }));
      if (!tabsEl.__smdPickerBound) {
        tabsEl.__smdPickerBound = true;
        tabsEl.addEventListener("smd-tabs-change", (e) => {
          this._activeSet = this._keys[e.detail.index];
          this._renderGrid();
        });
      }
      this._renderGrid();
    }

    attributeChangedCallback() {
      if (this.isConnected) {
        rootSearchShown(this);
        this._renderGrid();
      }
    }

    _loadImages() {
      try {
        return JSON.parse(localStorage.getItem(this.keyPrefix + "images") || "[]");
      } catch (e) {
        return [];
      }
    }

    // The active tab's grid element (the panels live inside the nested smd-tabs).
    _activeGrid() {
      const tabsEl = this._tabsEl;
      if (!tabsEl) return null;
      const panels = tabsEl.querySelectorAll(".smd-tab-panel");
      const panel = panels[tabsEl.activeIndex];
      return panel ? panel.querySelector(".grid") : null;
    }

    _renderGrid() {
      const root = this;
      root.querySelector(".search").hidden = !this.searchable;
      const grid = this._activeGrid();
      if (!grid) return;
      // Keep only the active tab's grid populated, so hidden sibling panels
      // don't leave stale items in the DOM (visible to querySelector/locators).
      if (this._tabsEl) {
        this._tabsEl.querySelectorAll(".grid").forEach((g) => {
          if (g !== grid) g.innerHTML = "";
        });
      }
      grid.innerHTML = "";

      if (this._activeSet === null) {
        const images = this._loadImages();
        const filtered = images
          .filter((img) => !this._search || (img.name || "").toLowerCase().includes(this._search))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        if (filtered.length === 0) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = this._search ? "No images match your search." : "No images available.";
          grid.appendChild(empty);
          return;
        }
        filtered.forEach((img) => {
          const el = document.createElement("div");
          el.className = "item";
          el.innerHTML = '<div class="thumb"><smd-image key-prefix="' + escapeHtml(this.keyPrefix) + '" image="' + escapeHtml(img.name) + '"></smd-image></div><div class="label">' + escapeHtml(img.name) + "</div>";
          el.addEventListener("click", () => this._select(img.name));
          grid.appendChild(el);
        });
        return;
      }

      // Icon set
      const cfg = ICON_SETS.find((s) => s.key === this._activeSet);
      if (!cfg) return;
      const cached = loadedIcons[cfg.key];
      if (!cached) {
        grid.innerHTML = '<div class="empty">Loading icons...</div>';
        loadIconSet(cfg).then((data) => {
          if (this._activeSet !== cfg.key) return; // tab changed meanwhile
          this._renderIconGrid(cfg, data);
        }).catch(() => {
          if (this._activeSet !== cfg.key) return;
          grid.innerHTML = '<div class="empty">Icons unavailable.</div>';
        });
        return;
      }
      this._renderIconGrid(cfg, cached);
    }

    _renderIconGrid(cfg, data) {
      const grid = this._activeGrid();
      if (!grid) return;
      grid.innerHTML = "";
      const q = this._search || "";
      const filtered = q ? data.names.filter((n) => n.toLowerCase().includes(q)) : data.names;
      if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = q ? "No icons match your search." : "No icons available.";
        grid.appendChild(empty);
        return;
      }
      filtered.forEach((name) => {
        const entry = data.byName[name] || {};
        const glyph = entry.hex ? String.fromCodePoint(parseInt(entry.hex, 16)) : "";
        const el = document.createElement("div");
        el.className = "item";
        const glyphEl = document.createElement("span");
        glyphEl.className = "glyph";
        glyphEl.textContent = glyph;
        glyphEl.style.setProperty("font-family", '"' + cfg.family + '"');
        if (entry.weight != null) glyphEl.style.setProperty("font-weight", entry.weight);
        const label = document.createElement("div");
        label.className = "label";
        label.textContent = name;
        el.appendChild(glyphEl);
        el.appendChild(label);
        el.addEventListener("click", () => this._select(cfg.key + ":" + name));
        grid.appendChild(el);
      });
    }

    _select(name) {
      this.dispatchEvent(new CustomEvent("smd-image-picker-select", {
        bubbles: true,
        composed: true,
        detail: { name }
      }));
    }

    cancel() {
      this.dispatchEvent(new CustomEvent("smd-image-picker-close", {
        bubbles: true,
        composed: true,
        detail: {}
      }));
    }
  }

  function rootSearchShown(host) {
    host.querySelector(".search").hidden = !host.searchable;
  }

  if (!global.customElements.get("smd-image-picker")) {
    global.customElements.define("smd-image-picker", SmdImagePicker);
  }
})(window);