// <smd-qr-import> — a self-contained camera QR scanner that reassembles the
// generic chunk envelope produced by <smd-qr-export> (light DOM):
//
//   { "index": 0, "total": 3, "chunk": "<compressed text>" }
//
// It collects every chunk, decompresses with the shared vendored lz-string and
// emits the decoded JSON. The component owns its dependencies (lazily loaded
// lz-string + jsQR) and its camera loop (getUserMedia + canvas), so it works
// anywhere in the light DOM. Styles live in shared/css/styles.css.
//
// Attributes:
//   autostart — start scanning as soon as the element is connected
//
// Methods:
//   start()  — (re)start scanning
//   stop()   — stop scanning / release the camera
//
// Events (composed, bubble):
//   smd-qr-import-progress  detail = { scanned, total }
//   smd-qr-import-complete  detail = { data }   (parsed JSON value)
//   smd-qr-import-error     detail = { error }
(function (global) {
  "use strict";

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

  function loadJsQr() {
    if (typeof global.jsQR === "function") return Promise.resolve();
    return loadScript("jsQR.js");
  }

  class SmdQrImport extends HTMLElement {
    static get observedAttributes() {
      return ["autostart"];
    }

    constructor() {
      super();
      this._reset();
    }

    connectedCallback() {
      // Light DOM: constructors may not use innerHTML; the shell is built here.
      if (!this.querySelector(".status")) {
        this.innerHTML =
          '<div class="status" role="status">Waiting for QR scans\u2026</div>' +
          '<div class="reader"></div>';
      }
      if (this.hasAttribute("autostart")) this.start();
    }

    disconnectedCallback() {
      this.stop();
    }

    attributeChangedCallback(name) {
      if (name === "autostart" && this.isConnected && this.hasAttribute("autostart")) this.start();
    }

    _reset() {
      this._total = null;
      this._chunks = {};
      this._stream = null;
      this._video = null;
      this._canvas = null;
      this._rafId = null;
      this._stopped = true;
    }

    _setStatus(text) {
      const el = this.querySelector(".status");
      if (el) el.textContent = text;
    }

    _reader() {
      return this.querySelector(".reader");
    }

    // ---- public API ----

    start() {
      this.stop();
      this._reset();
      this._stopped = false;
      this._setStatus("Preparing camera\u2026");

      Promise.all([loadLzString(), loadJsQr()]).then(() => {
        if (this._stopped) return;
        this._startCamera();
      }).catch((err) => {
        if (this._stopped) return;
        this._fail(err);
      });
    }

    stop() {
      this._stopped = true;
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
      if (this._video) {
        try { this._video.pause(); } catch (e) { /* ignore */ }
        if (this._video.srcObject) {
          try { this._video.srcObject.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ }
        }
        this._video.remove();
        this._video = null;
      }
      if (this._stream) {
        try { this._stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ }
        this._stream = null;
      }
      this._canvas = null;
      const reader = this._reader();
      if (reader) reader.innerHTML = "";
    }

    // ---- camera loop (jsQR) ----

    _startCamera() {
      const reader = this._reader();
      if (!reader) return;
      this._setStatus("Starting camera\u2026");
      reader.innerHTML = "";

      const video = document.createElement("video");
      video.setAttribute("playsinline", "true");
      video.style.width = "100%";
      reader.appendChild(video);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
        .then((stream) => {
          if (this._stopped) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            return;
          }
          this._stream = stream;
          video.srcObject = stream;
          return video.play().then(() => {
            if (this._stopped) return;
            const maxWidth = 640;
            const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
            canvas.width = Math.max(1, Math.round((video.videoWidth || 640) * scale));
            canvas.height = Math.max(1, Math.round((video.videoHeight || 480) * scale));
            this._video = video;
            this._canvas = canvas;
            this._setStatus("Scanning\u2026 (align a QR code inside the camera view)");
            const scanLoop = () => {
              try {
                if (!this._stopped && video.readyState === video.HAVE_ENOUGH_DATA) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const code = global.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
                  if (code && code.data) this._handleDecoded(code.data);
                }
              } catch (e) {
                // ignore per-frame errors
              }
              if (!this._stopped) this._rafId = requestAnimationFrame(scanLoop);
            };
            this._rafId = requestAnimationFrame(scanLoop);
          });
        })
        .catch((err) => {
          if (this._stopped) return;
          this._setStatus("Camera access failed: " + (err && err.message ? err.message : String(err)));
        });
    }

    // ---- shared decode handling ----

    _handleDecoded(decoded) {
      if (this._stopped) return;

      let obj = null;
      try {
        obj = JSON.parse(decoded);
      } catch (e) {
        this._setStatus("Ignored non-matching code");
        return;
      }
      if (!obj || typeof obj.index !== "number" || typeof obj.total !== "number" || typeof obj.chunk !== "string") {
        this._setStatus("Ignored non-matching JSON");
        return;
      }

      if (this._total === null) this._total = obj.total;
      this._chunks[obj.index] = obj.chunk;

      const scanned = Object.keys(this._chunks).length;
      const total = this._total;
      this._setStatus("Scanned " + scanned + " of " + total);
      this.dispatchEvent(new CustomEvent("smd-qr-import-progress", {
        bubbles: true,
        composed: true,
        detail: { scanned: scanned, total: total }
      }));

      if (scanned === total) {
        this.stop();
        this._finish();
      }
    }

    _finish() {
      const ordered = [];
      for (let i = 0; i < this._total; i++) {
        ordered.push(this._chunks[i]);
      }
      const compressed = ordered.join("");
      let data;
      try {
        data = JSON.parse(global.LZString.decompressFromEncodedURIComponent(compressed));
      } catch (err) {
        this._fail(new Error("Failed to decode QR data"));
        return;
      }
      this._setStatus("Import complete");
      this.dispatchEvent(new CustomEvent("smd-qr-import-complete", {
        bubbles: true,
        composed: true,
        detail: { data: data }
      }));
    }

    _fail(err) {
      this._setStatus("Import failed");
      this.dispatchEvent(new CustomEvent("smd-qr-import-error", {
        bubbles: true,
        composed: true,
        detail: { error: err }
      }));
    }
  }

  if (!global.customElements.get("smd-qr-import")) {
    global.customElements.define("smd-qr-import", SmdQrImport);
  }
})(window);