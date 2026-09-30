// Shared helpers for <smd-qr-export> / <smd-qr-import>: resolve the vendored
// script root and lazy-load the lz-string compressor (plus any named vendor
// script). Both QR components used to copy this block; it lives here once.
// Loaded before the QR components in the app shells + the storybook.
(function (global) {
  "use strict";
  if (global.SmdQr) return;

  // vendor/ is a sibling of this file's js/ folder (.../shared/vendor/).
  const VENDOR_ROOT = (function () {
    const src = document.currentScript && document.currentScript.src;
    if (src) {
      try { return new URL("../vendor/", src).href; } catch (e) { /* ignore */ }
    }
    return "vendor/";
  })();

  const scriptPromises = Object.create(null);
  function loadScript(name) {
    if (!scriptPromises[name]) {
      scriptPromises[name] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = VENDOR_ROOT + name;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load " + name));
        document.head.appendChild(s);
      });
    }
    return scriptPromises[name];
  }

  function loadLzString() {
    if (typeof global.LZString !== "undefined") return Promise.resolve();
    return loadScript("lz-string.min.js");
  }

  global.SmdQr = { vendorRoot: VENDOR_ROOT, loadScript, loadLzString };
})(window);
