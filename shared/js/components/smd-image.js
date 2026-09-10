// <smd-image> — displays an image looked up from a localStorage images list.
//
// Shared/reusable: the storage key prefix is supplied via the key-prefix
// attribute (e.g. "planmydays_"), the image to show via `image` (its name),
// and the theme via `theme` (auto | light | dark; default auto resolves from
// the document's data-bs-theme). The list key is keyPrefix + "images".
//
// Each stored image is { name, data, themes: { light: {line,fill,width}, dark: {...} } }.
// data is a data: URL; SVG data URLs are recoloured from the matching theme
// override (stroke/fill/stroke-width) on render.
(function (global) {
  "use strict";

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function applySvgAttr(dataUrl, attr, value) {
    const svgPart = dataUrl.substring("data:image/svg+xml,".length);
    const decoded = decodeURIComponent(svgPart);
    const encoded = value && value.startsWith("#") ? value : value || "none";
    const rx = new RegExp(`\\b${attr}\\s*=\\s*["'][^"']*["']`);
    if (rx.test(decoded)) {
      return "data:image/svg+xml," + encodeURIComponent(decoded.replace(new RegExp(rx.source, "g"), function (m) {
        const quote = m.indexOf('"') !== -1 ? '"' : "'";
        return attr + "=" + quote + encoded + quote;
      }));
    }
    const updated = decoded.replace(/<svg([\s>])/i, `<svg ${attr}="${encoded}"$1`);
    return "data:image/svg+xml," + encodeURIComponent(updated);
  }

  function themedSrc(data, theme, overrides) {
    if (!data || data.indexOf("data:image/svg+xml,") !== 0 || !overrides) return data;
    let out = data;
    if (overrides.line != null && overrides.line !== "") out = applySvgAttr(out, "stroke", overrides.line);
    if (overrides.fill != null && overrides.fill !== "") out = applySvgAttr(out, "fill", overrides.fill);
    if (overrides.width != null && overrides.width !== "") out = applySvgAttr(out, "stroke-width", overrides.width);
    return out;
  }

  const ICON_SETS = {
    bi: { css: "vendor/bootstrap-icons.css", family: "bootstrap-icons", mode: "codepoint" },
    fa: { json: "vendor/fontawesome-icons.json", slot: "fa", family: "Font Awesome 6 Free", mode: "codepoint" },
    fab: { json: "vendor/fontawesome-icons.json", slot: "fab", family: "Font Awesome 6 Brands", mode: "codepoint" }
  };

  const iconDataBySet = Object.create(null);
  const iconLoadPromises = Object.create(null);

  function parseCssGlyphs(cssText, selectorRe) {
    const map = {};
    let m;
    while ((m = selectorRe.exec(cssText))) map[m[1]] = m[2];
    return map;
  }

  function loadIconSet(set) {
    if (iconLoadPromises[set]) return iconLoadPromises[set];
    const cfg = ICON_SETS[set];
    const v = typeof global.BUILD_NUMBER !== "undefined" ? global.BUILD_NUMBER : Date.now();
    const root = typeof global.smdAppRoot === "function" ? global.smdAppRoot() : "";
    const fail = (err) => {
      iconLoadPromises[set] = null;
      throw err;
    };
    const finish = (names) => {
      const map = {};
      names.forEach((n) => { map[n.name] = { hex: n.hex, weight: n.weight }; });
      iconDataBySet[set] = map;
      return map;
    };
    if (cfg.css) {
      iconLoadPromises[set] = global.fetch(root + cfg.css + "?v=" + v)
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then((txt) => {
          const glyphs = parseCssGlyphs(txt, /\.bi-([a-z0-9][a-z0-9-]*)::before\s*\{\s*content:\s*["']\\([0-9a-fA-F]+)["']/g);
          return finish(Object.keys(glyphs).map((name) => ({ name, hex: glyphs[name] })));
        })
        .catch(fail);
    } else {
      iconLoadPromises[set] = global.fetch(root + cfg.json + "?v=" + v)
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then((data) => {
          if (cfg.slot) {
            const slot = data[cfg.slot] || {};
            return finish(Object.keys(slot).map((name) => ({ name, hex: slot[name].h, weight: slot[name].w })));
          }
          return finish(data.map((name) => ({ name })));
        })
        .catch(fail);
    }
    return iconLoadPromises[set];
  }

  function iconEntry(set, name) {
    if (!ICON_SETS[set] || !iconDataBySet[set]) return null;
    return iconDataBySet[set][name] || null;
  }

  class SmdImage extends HTMLElement {
    static get observedAttributes() {
      return ["image", "key-prefix", "theme", "alt", "size"];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      SmdStyles.adoptStyles(this.shadowRoot, [
        SmdStyles.hiddenSheet,
        SmdStyles.sheetFor(`
          :host {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          img {
            display: block;
            max-width: 100%;
            max-height: 100%;
          }
          .smd-bi {
            font-family: "bootstrap-icons";
            font-style: normal;
            font-weight: normal;
            font-variant: normal;
            text-transform: none;
            line-height: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
        `)
      ]);
      this.shadowRoot.innerHTML = '<img alt="">';
    }

    get keyPrefix() {
      return this.getAttribute("key-prefix") || "";
    }

    get theme() {
      const t = (this.getAttribute("theme") || "auto").toLowerCase();
      return t === "auto" ? this._autoTheme() : t;
    }

    connectedCallback() {
      this._themeObserver = new MutationObserver(() => this._render());
      this._themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-bs-theme", "data-theme"]
      });
      this._render();
    }

    disconnectedCallback() {
      if (this._themeObserver) {
        this._themeObserver.disconnect();
        this._themeObserver = null;
      }
    }

    attributeChangedCallback() {
      if (this.isConnected) this._render();
    }

    _autoTheme() {
      return (document.documentElement.getAttribute("data-bs-theme") || "dark") === "dark" ? "dark" : "light";
    }

    // Requested render size in px (attr `size`), or 0 when not set.
    _sizePx() {
      const v = parseInt(this.getAttribute("size"), 10);
      return isNaN(v) || v <= 0 ? 0 : v;
    }

    _findImage() {
      const key = this.keyPrefix + "images";
      let images = [];
      try {
        images = JSON.parse(global.localStorage.getItem(key) || "[]");
      } catch (e) {
        images = [];
      }
      if (!Array.isArray(images)) return null;
      const name = this.getAttribute("image");
      if (!name) return null;
      return images.find(function (img) { return img && img.name === name; }) || null;
    }

    // Re-reads storage and re-renders (call after the underlying store changes).
    refresh() {
      this._render();
    }

    _render() {
      const name = this.getAttribute("image") || "";
      const px = this._sizePx();

      // Sized renders get a shared, cached `:host` stylesheet (one sheet per px).
      if (px > 0) {
        SmdStyles.adoptStyles(this.shadowRoot, SmdStyles.sheetFor(":host { width: " + px + "px; height: " + px + "px; }"));
      }

      const colon = name.indexOf(":");
      if (colon > 0) {
        const set = name.slice(0, colon);
        if (ICON_SETS[set]) {
          this._renderIcon(set, name.slice(colon + 1), px);
          return;
        }
      }
      this._renderStored(name, px);
    }

    _renderStored(name, px) {
      const img = this.shadowRoot.querySelector("img");
      const span = this.shadowRoot.querySelector(".smd-bi");
      if (!img) return;
      if (span) span.hidden = true;
      const stored = this._findImage();
      const alt = this.getAttribute("alt") || "";

      // Non-SVG images may only carry downscaled thumbnails (data64/80/100) when
      // the full-size `data` has been stripped for size; prefer the thumbnail for
      // the requested size, then any larger one.
      const src = stored ? (stored.data || stored["data" + px] || stored.data100 || stored.data80 || stored.data64) : null;
      if (!stored || !src) {
        img.removeAttribute("src");
        img.hidden = true;
        return;
      }
      const theme = this.theme;
      const overrides = (stored.themes && stored.themes[theme]) || {};
      img.src = themedSrc(src, theme, overrides);
      img.alt = alt || escapeHtml(this.getAttribute("image") || "");
      img.hidden = false;
    }

    _renderIcon(set, iconName, px) {
      const img = this.shadowRoot.querySelector("img");
      if (img) {
        img.removeAttribute("src");
        img.hidden = true;
      }
      let span = this.shadowRoot.querySelector(".smd-bi");
      const cfg = ICON_SETS[set];
      const entry = iconEntry(set, iconName);
      const glyph = entry && entry.hex ? String.fromCodePoint(parseInt(entry.hex, 16)) : (iconName || "");
      const ready = !!iconDataBySet[set];
      if (!entry || !cfg) {
        if (span) span.hidden = true;
        if (!ready) {
          loadIconSet(set).then(() => {
            if (this.isConnected && (this.getAttribute("image") || "") === set + ":" + iconName) this._render();
          }).catch(() => {});
        }
        return;
      }
      if (!span) {
        span = document.createElement("span");
        span.className = "smd-bi";
        this.shadowRoot.appendChild(span);
      }
      span.textContent = glyph;
      span.style.setProperty("font-family", '"' + cfg.family + '"');
      if (entry.weight != null) span.style.setProperty("font-weight", entry.weight);
      else span.style.removeProperty("font-weight");
      span.style.removeProperty("white-space");
      span.style.fontSize = px > 0 ? Math.max(8, Math.round(px * 0.8)) + "px" : "1.5rem";
      span.hidden = false;
    }
  }

  if (!global.customElements.get("smd-image")) {
    global.customElements.define("smd-image", SmdImage);
  }
})(window);