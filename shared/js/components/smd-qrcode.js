// Resolve the QR library relative to THIS component file so it works whether the
// shared library is served from a sibling `shared/` folder or under a sub-path.
const QR_CODE_CDN = (function () {
  const src = document.currentScript && document.currentScript.src;
  if (src) return new URL('../../vendor/qrcode.min.js', src).href;
  return 'vendor/qrcode.min.js';
})();

let qrLibLoaded = false;

function loadQrLibrary() {
  if (qrLibLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (typeof QRCode !== 'undefined') {
      qrLibLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = QR_CODE_CDN;
    script.onload = () => { qrLibLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

class SmdQrCode extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'size'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._renderQueued = false;
  }

  get value() {
    return this.getAttribute('value') || '';
  }

  set value(val) {
    this.setAttribute('value', val);
  }

  get size() {
    return parseInt(this.getAttribute('size')) || 120;
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) {
      this._render();
    }
  }

  async _render() {
    if (this._renderQueued) return;
    this._renderQueued = true;

    await customElements.whenDefined('smd-qrcode');
    await Promise.resolve();

    this._renderQueued = false;
    this.shadowRoot.innerHTML = '';
    if (!this.value) return;

    await loadQrLibrary();

    const container = document.createElement('div');
    container.style.cssText = 'background:white;padding:10px;display:inline-block;border-radius:8px;';
    this.shadowRoot.appendChild(container);

    new QRCode(container, {
      text: this.value,
      width: this.size,
      height: this.size,
      margin: 4,
    });
  }
}

customElements.define('smd-qrcode', SmdQrCode);
