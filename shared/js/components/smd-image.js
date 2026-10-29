// <smd-image> — displays an image looked up from a localStorage images list
// (light DOM). Styles live in shared/css/styles.css.
//
// Shared/reusable: the storage key prefix is supplied via the key-prefix
// attribute (e.g. "planmydays_"), the image to show via `image` (its name),
// and the theme via `theme` (auto | light | dark; default auto resolves from
// the element's ACTUAL background colour, falling back to data-bs-theme). The
// list key is keyPrefix + "images".
//
// Each stored image is { name, data, themes: { light: {line,fill,width}, dark: {...} } }.
// data is a data: URL; SVG data URLs are recoloured from the matching theme
// override (stroke/fill/stroke-width) on render.
//
// The render size is a VALUE (px): it is applied as an inline width/height on
// the host so the box is exactly `size` px on every side and the selected
// thumbnail tier matches (see _renderStored).
(function (global) {
  "use strict";

  const ICON_SETS = {
    bi: { css: "vendor/bootstrap-icons.css", family: "bootstrap-icons", mode: "codepoint" },
    fa: { json: "vendor/fontawesome-icons.json", slot: "fa", family: "Font Awesome 6 Free", mode: "codepoint" },
    fab: { json: "vendor/fontawesome-icons.json", slot: "fab", family: "Font Awesome 6 Brands", mode: "codepoint" },
    // OpenMoji 17.0 colour emoji font (CC BY-SA 4.0). `h` is a hexcode that may
    // be a multi-codepoint sequence ("1F1FA-1F1F8" = a flag); the font's single
    // `ccmp` ligature lookup joins the parts into ONE glyph.
    om: { json: "vendor/openmoji-icons.json", slot: "om", family: "OpenMoji", mode: "sequence" }
  };

  // "1F600" -> the emoji character; "1F1FA-1F1F8" -> BOTH code points.
  function hexChars(hex) {
    return String(hex)
      .split("-")
      .map(function (h) {
        const code = parseInt(h, 16);
        return isNaN(code) ? "" : String.fromCodePoint(code);
      })
      .join("");
  }

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

  // Connected instances, so a global size change can refresh every image.
  const liveInstances = new Set();

  class SmdImage extends HTMLElement {
    static get observedAttributes() {
      return ["image", "key-prefix", "theme", "alt", "size"];
    }

    constructor() {
      super();
    }

    get keyPrefix() {
      return this.getAttribute("key-prefix") || "";
    }

    get theme() {
      const t = (this.getAttribute("theme") || "auto").toLowerCase();
      return t === "auto" ? this._autoTheme() : t;
    }

    connectedCallback() {
      if (typeof injectSmdComponentStyle === "function") {
        injectSmdComponentStyle("smd-image-layout", `
          smd-image { display: inline-flex; align-items: center; justify-content: center; overflow: hidden; background-color: inherit; }
          smd-image img { display: block; max-width: 100%; max-height: 100%; }
          smd-image .smd-bi { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
        `);
      }
      // Light DOM: an element's constructor must not touch attributes/innerHTML
      // ("The result must not have children" when createElement/parsing creates
      // it) — the <img> placeholder is added here instead, once per instance.
      if (!this.querySelector("img")) {
        const img = document.createElement("img");
        img.alt = "";
        this.appendChild(img);
      }
      // A Sortable fallback ghost is cloneNode(true) and already carries the
      // PAINTED <img>. Re-rendering on connect would resolve the URL again and
      // swap in a second bitmap while the ghost is moving (a visibly doubled /
      // broken image). Keep the clone's pixels; later attribute changes and
      // theme flips still re-render through attributeChangedCallback/observer.
      const alreadyPainted = !!this.querySelector("img[src]");
      liveInstances.add(this);
      this._themeObserver = new MutationObserver(() => this._render());
      this._themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-bs-theme", "data-theme", "style"]
      });
      if (!alreadyPainted) this._render();
    }

    disconnectedCallback() {
      liveInstances.delete(this);
      if (this._themeObserver) {
        this._themeObserver.disconnect();
        this._themeObserver = null;
      }
    }

    attributeChangedCallback() {
      if (this.isConnected) this._render();
    }

    _autoTheme() {
      // Pick the light or dark image variant from the element's ACTUAL
      // background, so an image on a dark surface inside an otherwise light
      // theme (e.g. pmd-stream-header / lol-category-header) still gets the light variant. Falls back
      // to the document theme mode when no ancestor paints a background.
      const dark = SmdLib.isDarkBackground(this);
      if (dark === true) return "dark";
      if (dark === false) return "light";
      return (document.documentElement.getAttribute("data-bs-theme") || "dark") === "dark" ? "dark" : "light";
    }

    // Requested render size in px. The per-instance `size` attribute wins; when
    // absent the app-wide default (SmdImage.defaultSize) applies; 0 = unstyled.
    _sizePx() {
      const v = parseInt(this.getAttribute("size"), 10);
      if (!isNaN(v) && v > 0) return v;
      return SmdImage.defaultSize > 0 ? SmdImage.defaultSize : 0;
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
      // Invalidate in-flight paints FIRST, in ONE place, so the token covers
      // stored images AND icon renders. (A stored-image promise that resolves
      // after the element switched to an icon must not repaint the img.)
      this._renderSeq = (this._renderSeq || 0) + 1;

      const name = this.getAttribute("image") || "";
      const px = this._sizePx();

      // Sized renders get an inline fixed box on the host (size is a value, not
      // a stylesheet; the CSS `smd-image` rule provides the centring layout).
      if (px > 0) {
        this.style.width = px + "px";
        this.style.height = px + "px";
      } else {
        this.style.removeProperty("width");
        this.style.removeProperty("height");
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
      const span = this.querySelector(".smd-bi");
      if (span) span.hidden = true;

      const seq = this._renderSeq;
      const stored = this._findImage();
      const alt = this.getAttribute("alt") || "";

      // Non-SVG images may only carry downscaled thumbnails (data64/80/100) when
      // the full-size `data` has been stripped. The icon-size setting renders at
      // 32/40/50 but sources the matching higher-res thumbnail (32->64, 40->80,
      // 50->100), then falls back to any larger one.
      let src = stored ? stored.data : null;
      if (stored && !src) {
        const tiers = [px, px * 2, 100, 80, 64];
        for (let i = 0; i < tiers.length && !src; i++) {
          if (tiers[i] > 0) src = stored["data" + tiers[i]] || null;
        }
      }
      const current = this.querySelector("img");
      if (!stored || !src) {
        if (current) {
          current.removeAttribute("src");
          current.hidden = true;
        }
        return;
      }
      const theme = this.theme;
      const overrides = (stored.themes && stored.themes[theme]) || {};
      const painted = SmdLib.themedSvgSrc(src, overrides);
      const altText = alt || SmdLib.escapeHtml(this.getAttribute("image") || "");

      const paint = (url) => this._paintImage(url, altText, seq);

      if (typeof global.smdImageRenderUrl === "function") {
        try {
          global.smdImageRenderUrl(painted).then(paint).catch(() => paint(painted));
        } catch (e) {
          paint(painted);
        }
      } else {
        paint(painted);
      }
    }

    // Reveal `url` by swapping in a FRESHLY-BUILT <img> once it has decoded.
    //
    // Re-sourcing the existing <img> in place (removeAttribute("src") then
    // img.src = url) is atomic only on paper: when the render URL is already
    // memoised (shared/js/smd-images.js `_imgUrlMemo`) the swap happens in one
    // frame, and WebKit (every iOS browser) can leave the PREVIOUS bitmap
    // composited with the new one inside the fixed-size, overflow-hidden host.
    // That is the "half of one image / half of the other" thumbnail seen when
    // switching the Job editor's stream/category. A new element starts with no
    // pixels, so the old and new bitmaps can never be shown together.
    _paintImage(url, alt, seq) {
      if (seq !== this._renderSeq || !this.isConnected) return;
      const current = this.querySelector("img");

      // Already showing this exact URL: keep the decoded bitmap and just make
      // sure it is visible (alt text may have changed).
      if (current && current.getAttribute("src") === url && current.complete) {
        current.alt = alt;
        current.hidden = false;
        return;
      }

      const next = document.createElement("img");
      next.alt = alt;
      next.hidden = true;

      const swap = () => {
        if (seq !== this._renderSeq || !this.isConnected) return;
        next.hidden = false;
        if (current && current.parentNode === this) current.replaceWith(next);
        else this.appendChild(next);
      };

      // decode() resolves when the image is ready to paint (SVG and raster);
      // fall back to load/error when it is unavailable or rejects.
      const ready = () => {
        if (typeof next.decode === "function") {
          return next.decode().catch(function () {
            if (next.complete) return;
            return new Promise(function (resolve) {
              next.addEventListener("load", resolve, { once: true });
              next.addEventListener("error", resolve, { once: true });
            });
          });
        }
        if (next.complete) return Promise.resolve();
        return new Promise(function (resolve) {
          next.addEventListener("load", resolve, { once: true });
          next.addEventListener("error", resolve, { once: true });
        });
      };

      next.src = url;
      ready().then(swap, swap);
    }

    _renderIcon(set, iconName, px) {
      const img = this.querySelector("img");
      if (img) {
        img.removeAttribute("src");
        img.hidden = true;
      }
      let span = this.querySelector(".smd-bi");
      const cfg = ICON_SETS[set];
      const entry = iconEntry(set, iconName);
      const glyph = entry && entry.hex
        ? (cfg.mode === "sequence" ? hexChars(entry.hex) : String.fromCodePoint(parseInt(entry.hex, 16)))
        : (iconName || "");
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
        this.appendChild(span);
      }
      span.textContent = glyph;
      span.style.setProperty("font-family", '"' + cfg.family + '"');
      if (entry.weight != null) span.style.setProperty("font-weight", entry.weight);
      else span.style.removeProperty("font-weight");
      span.style.removeProperty("white-space");
      // Glyph scale: the widest glyph in the vendored sets is Font Awesome's
      // `fa:braille`, whose INK is 1.31em wide (advance 1.25em); bootstrap-icons
      // tops out at 1.08em. At 0.8 the ink is 1.048x the square box, so the
      // outermost pixel column(s) were clipped. 0.75 leaves 1.31 * 0.75 = 0.98
      // of the box, so EVERY available icon fits inside its square.
      span.style.fontSize = px > 0 ? Math.max(8, Math.round(px * 0.75)) + "px" : "1.5rem";
      span.hidden = false;
    }
  }

  // App-wide render size used by every <smd-image> without an explicit `size`.
  // This is a VALUE (px), not a style: components receive it as the image size
  // so the correct thumbnail (data64/80/100) is chosen too. 64 is a safe base
  // for consumers that never set one.
  SmdImage.defaultSize = 64;

  SmdImage.setDefaultSize = function (px) {
    const v = parseInt(px, 10);
    SmdImage.defaultSize = isNaN(v) || v <= 0 ? 0 : v;
    liveInstances.forEach((el) => el.refresh());
  };

  if (!global.customElements.get("smd-image")) {
    global.customElements.define("smd-image", SmdImage);
  }
  global.SmdImage = SmdImage;
})(window);
