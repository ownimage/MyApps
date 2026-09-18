// <smd-qr-export> — a self-contained "export any JSON string as chunked QR
// codes" component.
//
// The component owns its dependencies: it lazily loads the shared vendored
// lz-string (compression) and qrcode.js (rendering) when it first has a value,
// compresses the string, splits it into chunks and renders one labelled QR per
// chunk. The payload of every QR is a generic envelope:
//
//   { "index": 0, "total": 3, "chunk": "<compressed text>" }
//
// <smd-qr-import> understands the same envelope, so any JSON value round-trips.
//
// Attributes:
//   value       — the string to export (usually JSON.stringify(data))
//   chunk-size  — max compressed characters per QR (default 400)
//   size        — QR image size in px (default 280)
//   label       — label prefix (default "QR")
//
// Events (composed, bubble):
//   smd-qr-export-rendered  detail = { total }
//   smd-qr-export-error     detail = { error }
(function (global) {
  "use strict";

  // Resolve vendor/ relative to THIS component file so the component works
  // whether the shared library is at the repo root, under a sub-path, or in the
  // storybook (same approach as smd-qrcode.js).
  const VENDOR_ROOT = (function () {
    const src = document.currentScript && document.currentScript.src;
    if (src) {
      try { return new URL("../../vendor/", src).href; } catch (e) { /* ignore */ }
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

  function loadQrCode() {
    if (typeof global.QRCode !== "undefined") return Promise.resolve();
    return loadScript("qrcode.min.js");
  }

  const smdQrExportSheet = SmdStyles.sheetFor(`
  :host { display: block; }
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
  }
  .item { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; }
  .box { background: #fff; padding: 0.75rem; border-radius: 8px; display: inline-block; }
  .label { font-size: var(--smd-type-p, 0.85rem); color: var(--bs-body-color, #eee); }
  .empty, .error { width: 100%; text-align: center; padding: 1.5rem 0; }
  .empty { color: var(--bs-secondary-color, #aaa); }
  .error { color: var(--bs-danger, #dc3545); }
  `);

  class SmdQrExport extends HTMLElement {
    static get observedAttributes() {
      return ["value", "chunk-size", "size", "label"];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      SmdStyles.adoptStyles(this.shadowRoot, [smdQrExportSheet]);
      this._token = 0;
    }

    get value() { return this.getAttribute("value") || ""; }
    set value(val) {
      if (val === null || val === undefined) this.removeAttribute("value");
      else this.setAttribute("value", String(val));
    }

    connectedCallback() { this._render(); }

    attributeChangedCallback() {
      if (this.isConnected) this._render();
    }

    _render() {
      const token = ++this._token;
      const value = this.getAttribute("value");
      if (!value) {
        this.shadowRoot.innerHTML = '<div class="empty">Nothing to export.</div>';
        return;
      }
      this.shadowRoot.innerHTML = '<div class="empty">Preparing QR codes\u2026</div>';

      Promise.all([loadLzString(), loadQrCode()]).then(() => {
        if (token !== this._token) return; // value changed while loading
        const current = this.getAttribute("value");
        if (!current) return;
        const chunkSize = Math.max(50, parseInt(this.getAttribute("chunk-size"), 10) || 400);
        const size = parseInt(this.getAttribute("size"), 10) || 280;
        const labelPrefix = this.getAttribute("label") || "QR";

        const compressed = global.LZString.compressToEncodedURIComponent(current);
        const chunks = [];
        for (let i = 0; i < compressed.length; i += chunkSize) {
          chunks.push(compressed.substring(i, i + chunkSize));
        }

        const grid = document.createElement("div");
        grid.className = "grid";
        chunks.forEach((chunk, index) => {
          const item = document.createElement("div");
          item.className = "item";
          const box = document.createElement("div");
          box.className = "box";
          const qr = document.createElement("div");
          box.appendChild(qr);
          const label = document.createElement("div");
          label.className = "label";
          label.textContent = labelPrefix + " " + (index + 1) + " of " + chunks.length;
          item.appendChild(box);
          item.appendChild(label);
          grid.appendChild(item);
          new global.QRCode(qr, {
            text: JSON.stringify({ index: index, total: chunks.length, chunk: chunk }),
            width: size,
            height: size,
            margin: 16
          });
        });

        this.shadowRoot.innerHTML = "";
        this.shadowRoot.appendChild(grid);
        this.dispatchEvent(new CustomEvent("smd-qr-export-rendered", {
          bubbles: true,
          composed: true,
          detail: { total: chunks.length }
        }));
      }).catch((err) => {
        if (token !== this._token) return;
        this.shadowRoot.innerHTML = '<div class="error">Failed to load the QR libraries.</div>';
        this.dispatchEvent(new CustomEvent("smd-qr-export-error", {
          bubbles: true,
          composed: true,
          detail: { error: err }
        }));
      });
    }
  }

  if (!global.customElements.get("smd-qr-export")) {
    global.customElements.define("smd-qr-export", SmdQrExport);
  }
})(window);
