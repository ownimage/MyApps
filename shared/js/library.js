// Shared pure utility library (window.SmdLib) for the MyApps shared library.
//
// A namespace of framework-agnostic helpers used across apps, components and
// services, so generic code has ONE home instead of being copied between files
// or buried in an image component. Loaded FIRST (before smd-app.js, the
// components and the services) in every shell.
//
// Sections:
//   string - escapeHtml / escAttr
//   dom    - $id (shadow-root-piercing getElementById)
//   colour - parseColor / relativeLuminance / effectiveBackgroundColor /
//            isDarkBackground  (drives <smd-image theme="auto">)
//   svg    - isSvgDataUrl / updateSvgColor / applySvgAttr / themedSvgSrc
(function (global) {
  "use strict";

  const SmdLib = {};

  // ---- String -------------------------------------------------------------

  SmdLib.escapeHtml = function (str) {
    if (!str && str !== 0) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };

  SmdLib.escAttr = function (str) {
    return SmdLib.escapeHtml(str).replace(/"/g, "&quot;");
  };

  // ---- DOM ----------------------------------------------------------------

  // getElementById that also walks into open shadow roots (the app components
  // are light DOM, but slotted/legacy content can still live in a shadow root).
  SmdLib.$id = function (id, root) {
    root = root || document;
    if (typeof root.getElementById === "function") {
      const el = root.getElementById(id);
      if (el) return el;
    }
    const base = root === document ? (root.body || root) : root;
    if (!base) return null;
    const walker = document.createTreeWalker(base, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.shadowRoot) {
        const found = SmdLib.$id(id, node.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  };

  // ---- Colour -------------------------------------------------------------

  // Parse a computed colour into opaque sRGB channels (0..255), or null when it
  // is transparent / unparseable. Handles `rgb()/rgba()` and the
  // `color(srgb ...)` form Chromium returns for color-mix() results (channels
  // are 0..1 there).
  SmdLib.parseColor = function (color) {
    if (!color) return null;
    let m = color.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      const alpha = parts.length > 3 ? parts[3] : 1;
      return alpha > 0 ? [parts[0], parts[1], parts[2]] : null;
    }
    m = color.match(/color\(\s*srgb\s+([^)]+)\)/);
    if (m) {
      const parts = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
      const alpha = parts.length > 3 ? parts[3] : 1;
      return alpha > 0 ? [parts[0] * 255, parts[1] * 255, parts[2] * 255] : null;
    }
    return null;
  };

  // WCAG relative luminance (0..1) of an sRGB triple.
  SmdLib.relativeLuminance = function (r, g, b) {
    const f = (c) => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  // First painted background up the tree from `el` (skipping transparent), as
  // sRGB channels, or null when every ancestor is transparent.
  SmdLib.effectiveBackgroundColor = function (el) {
    let node = el;
    while (node && node.nodeType === 1) {
      const c = SmdLib.parseColor(getComputedStyle(node).backgroundColor);
      if (c) return c;
      node = node.parentElement;
    }
    return null;
  };

  // True when the element sits on a dark background (0.179 is the WCAG
  // black/white contrast crossover), false when light, null when no ancestor
  // paints a background.
  SmdLib.isDarkBackground = function (el) {
    const bg = SmdLib.effectiveBackgroundColor(el);
    if (!bg) return null;
    return SmdLib.relativeLuminance(bg[0], bg[1], bg[2]) < 0.179;
  };

  // ---- SVG data-URL recolouring ------------------------------------------

  SmdLib.isSvgDataUrl = function (dataUrl) {
    return !!dataUrl && dataUrl.indexOf("data:image/svg+xml,") === 0;
  };

  // Replace EVERY occurrence of an attribute's value in the decoded SVG.
  SmdLib.updateSvgColor = function (dataUrl, attr, newColor) {
    if (!dataUrl || !SmdLib.isSvgDataUrl(dataUrl)) return dataUrl;
    const svgPart = dataUrl.substring("data:image/svg+xml,".length);
    const decoded = decodeURIComponent(svgPart);
    const regex = new RegExp(`\\b${attr}\\s*=\\s*["'][^"']*["']`, "g");
    const encoded = newColor && newColor.startsWith("#") ? newColor : newColor || "none";
    const updated = decoded.replace(regex, (m) => {
      const quote = m.includes('"') ? '"' : "'";
      return `${attr}=${quote}${encoded}${quote}`;
    });
    return "data:image/svg+xml," + encodeURIComponent(updated);
  };

  // Recolour every existing occurrence of `attr`, or add it to the root <svg>
  // when the document has none.
  SmdLib.applySvgAttr = function (dataUrl, attr, value) {
    if (!dataUrl || !SmdLib.isSvgDataUrl(dataUrl)) return dataUrl;
    const decoded = decodeURIComponent(dataUrl.substring("data:image/svg+xml,".length));
    const rx = new RegExp(`\\b${attr}\\s*=\\s*["'][^"']*["']`);
    if (rx.test(decoded)) return SmdLib.updateSvgColor(dataUrl, attr, value);
    const encoded = value && value.startsWith("#") ? value : value || "none";
    const updated = decoded.replace(/<svg([\s>])/i, `<svg ${attr}="${encoded}"$1`);
    return "data:image/svg+xml," + encodeURIComponent(updated);
  };

  // Apply a theme override { line, fill, width } to an SVG data URL. Non-SVG
  // data and empty overrides pass through unchanged.
  SmdLib.themedSvgSrc = function (data, overrides) {
    if (!SmdLib.isSvgDataUrl(data) || !overrides) return data;
    let out = data;
    if (overrides.line != null && overrides.line !== "") out = SmdLib.applySvgAttr(out, "stroke", overrides.line);
    if (overrides.fill != null && overrides.fill !== "") out = SmdLib.applySvgAttr(out, "fill", overrides.fill);
    if (overrides.width != null && overrides.width !== "") out = SmdLib.applySvgAttr(out, "stroke-width", overrides.width);
    return out;
  };

  global.SmdLib = SmdLib;
})(window);
