// Resolve the buy-me-a-coffee image relative to THIS component file so it works
// whether the shared library is served from a sibling `shared/` folder or under a sub-path.
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
    this.attachShadow({ mode: 'open' });
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
    img.style.height = `${this.height}px`;

    link.appendChild(img);

    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(link);
  }
}

customElements.define('smd-buymeacoffee', SmdBuyMeACoffee);
