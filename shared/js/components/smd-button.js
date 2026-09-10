const smdButtonSheet = SmdStyles.sheetFor(`
  :host {
    display: inline-block;
  }
  button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    background: var(--smd-primary, #0d6efd);
    color: var(--smd-primary-text, #fff);
    transition: opacity 0.2s;
  }
  button:hover {
    opacity: 0.85;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  button[variant="secondary"] {
    background: var(--smd-secondary, #6c757d);
  }
  button[variant="danger"] {
    background: var(--smd-danger, #dc3545);
  }
  button[variant="success"] {
    background: var(--smd-success, #198754);
  }
  button[variant="info"] {
    background: var(--smd-info, #0dcaf0);
    color: var(--smd-info-text, #fff);
  }
`);

const template = document.createElement('template');
template.innerHTML = `
  <button part="button">
    <slot>Button</slot>
  </button>
`;

class SmdButton extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'disabled'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    SmdStyles.adoptStyles(this.shadowRoot, [smdButtonSheet]);
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  get variant() {
    return this.getAttribute('variant') || 'primary';
  }

  set variant(val) {
    this.setAttribute('variant', val);
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    if (val) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }

  attributeChangedCallback(name) {
    if (name === 'disabled') {
      this.shadowRoot.querySelector('button').disabled = this.disabled;
    }
    if (name === 'variant') {
      this.shadowRoot.querySelector('button').setAttribute('variant', this.variant);
    }
  }

  connectedCallback() {
    this.shadowRoot.querySelector('button').disabled = this.disabled;
    this.shadowRoot.querySelector('button').setAttribute('variant', this.variant);
  }
}

customElements.define('smd-button', SmdButton);
