// <smd-buymeacoffee> — a Buy Me A Coffee button (light DOM).
//
// Resolve the image relative to THIS component file so it works whether the
// shared library is served from a sibling `shared/` folder or under a sub-path.
const BMC_IMAGE = (function () {
  const src = document.currentScript && document.currentScript.src;
  if (src) return new URL('../../vendor/bmc-default-yellow.png', src).href;
  return 'vendor/bmc-default-yellow.png';
})();

class SmdBuyMeACoffee extends HTMLElement {
  static get observedAttributes() {
    return ['username', 'height'];
  }

  constructor() {
    super();
    this._rendered = false;
  }

  get username() {
    return this.getAttribute('username') || 'ownimage';
  }

  set username(val) {
    this.setAttribute('username', val);
  }

  get height() {
    return this.getAttribute('height') || '50';
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  render() {
    const link = document.createElement('a');
    link.href = `https://buymeacoffee.com/${this.username}`;
    link.target = '_blank';
    link.rel = 'noopener';

    const img = document.createElement('img');
    img.src = BMC_IMAGE;
    img.alt = 'Buy Me A Coffee';
    const height = Math.max(1, parseInt(this.height, 10) || 50);
    img.width = Math.round(height * 545 / 153);
    img.height = height;
    img.className = 'd-block';
    img.style.width = img.width + 'px';
    img.style.height = height + 'px';

    link.appendChild(img);

    this.innerHTML = '';
    this.appendChild(link);
  }
}

if (!window.customElements.get('smd-buymeacoffee')) {
  customElements.define('smd-buymeacoffee', SmdBuyMeACoffee);
}
window.SmdBuyMeACoffee = SmdBuyMeACoffee;