const smdPageSheet = SmdStyles.sheetFor(`
  :host {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 1040;
    pointer-events: none;
    overflow: hidden;
  }
  :host(.d-none) {
    display: none;
  }
  .smd-page {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bs-body-bg, #222);
    color: var(--bs-body-color, #eee);
    transform: translateX(-100%);
    transition: transform var(--smd-slide-duration, 0s) ease;
    pointer-events: auto;
  }
  :host([open]) .smd-page {
    transform: translateX(0);
  }
  .smd-page-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.75rem 1.25rem;
    background: color-mix(in srgb, var(--bs-body-bg, #222) 85%, white);
    border-bottom: 1px solid var(--bs-border-color, #444);
    flex-shrink: 0;
  }
  .smd-page-header h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 500;
    color: color-mix(in srgb, var(--bs-body-color, #eee) 60%, white);
  }
  .smd-page-header .badge {
    vertical-align: middle;
  }
  .badge {
    display: inline-block;
    padding: 0.35em 0.65em;
    font-size: 0.75em;
    font-weight: 700;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
    border-radius: 0.375rem;
  }
  .bg-info { background: var(--bs-info, #0dcaf0); color: #000; }
  .bg-secondary { background: var(--bs-secondary, #6c757d); color: #fff; }
  .smd-page-body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.25rem;
  }
  .smd-page-footer {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--bs-border-color, #444);
    flex-shrink: 0;
  }
  .smd-page-footer smd-button {
    flex: 1;
    min-width: 0;
  }
  .smd-page-footer smd-button::part(button) {
    width: 100%;
    box-sizing: border-box;
    font-size: 0.9rem;
  }
`);

class SmdPage extends HTMLElement {
  static get observedAttributes() {
    return ['slide-duration'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    SmdStyles.adoptStyles(this.shadowRoot, [smdPageSheet]);
    this._buttons = [];
    this._title = '';
    this._content = '';
    this._headerHtml = '';
  }

  get title() { return this._title; }
  set title(val) { this._title = val; this._render(); }

  get headerHtml() { return this._headerHtml; }
  set headerHtml(val) { this._headerHtml = val || ''; this._render(); }

  get content() { return this._content; }
  set content(val) { this._content = val; this._render(); }

  get buttons() { return this._buttons; }
  set buttons(val) { this._buttons = val || []; this._render(); }

  get slideDuration() { return parseFloat(this.getAttribute('slide-duration')) || 0; }
  set slideDuration(ms) { this.setAttribute('slide-duration', ms); }

  show() {
    requestAnimationFrame(() => {
      this.setAttribute('open', '');
    });
  }

  hide() {
    this.removeAttribute('open');
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name !== 'slide-duration') return;
    const ms = parseFloat(newValue);
    this.style.setProperty('--smd-slide-duration', (isNaN(ms) ? 0 : ms / 1000) + 's');
  }

  _render() {
    const buttonsHtml = this._buttons.map((btn, i) => {
      const variant = btn.variant || 'primary';
      const text = btn.text || 'OK';
      const idAttr = btn.id ? ` id="${this._escapeAttr(btn.id)}"` : '';
      const disabledAttr = btn.disabled ? ' disabled' : '';
      const closeAttr = btn.close === false ? ' data-close-on-click="false"' : '';
      return `<smd-button data-index="${i}" variant="${variant}"${idAttr}${disabledAttr}${closeAttr}>${text}</smd-button>`;
    }).join('');

    this.shadowRoot.innerHTML = `
      <div class="smd-page">
        <div class="smd-page-header">
          <h2>${this._escapeHtml(this._title)}</h2>${this._headerHtml}
        </div>
        <div class="smd-page-body">${this._content}</div>
        <div class="smd-page-footer">${buttonsHtml}</div>
      </div>
    `;

    this.shadowRoot.querySelectorAll('.smd-page-footer smd-button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        const config = this._buttons[index];
        if (config && config.close !== false) this.hide();
        this.dispatchEvent(new CustomEvent('smd-page-action', {
          bubbles: true,
          composed: true,
          detail: { index, action: config ? (config.action || null) : null, text: config ? config.text : null },
        }));
      });
    });
  }

  _escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;');
  }
}

customElements.define('smd-page', SmdPage);
