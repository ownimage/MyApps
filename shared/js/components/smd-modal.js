const smdModalSheet = SmdStyles.sheetFor(`
  :host {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 1050;
  }
  :host([open]) {
    display: block;
  }
  .smd-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
  }
  .smd-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--bs-body-bg, #222);
    color: var(--bs-body-color, #eee);
    border: 1px solid var(--bs-border-color, #444);
    border-radius: 0.5rem;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    overflow: hidden;
  }
  .smd-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.5rem;
    border-bottom: 1px solid var(--bs-border-color, #444);
    background: color-mix(in srgb, var(--bs-body-bg, #222) 85%, white);
    flex-shrink: 0;
  }
  .smd-header h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 500;
    color: color-mix(in srgb, var(--bs-body-color, #eee) 60%, white);
  }
  .smd-body {
    padding: 1rem 1.25rem;
    overflow-y: auto;
    flex: 1;
  }
  .smd-footer {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--bs-border-color, #444);
  }
  .smd-footer button {
    flex: 1;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    color: #fff;
    background: var(--smd-primary, #0d6efd);
    transition: opacity 0.15s;
  }
  .smd-footer button:hover { opacity: 0.85; }
  .smd-footer button[variant="secondary"] { background: var(--smd-secondary, #6c757d); }
  .smd-footer button[variant="success"] { background: var(--smd-success, #198754); }
  .smd-footer button[variant="danger"] { background: var(--smd-danger, #dc3545); }
  .smd-footer button[variant="warning"] { background: var(--smd-warning, #ffc107); color: #000; }
`);

class SmdModal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    SmdStyles.adoptStyles(this.shadowRoot, [smdModalSheet]);
    this._buttons = [];
    this._title = '';
    this._content = '';
  }

  get title() { return this._title; }
  set title(val) { this._title = val; this._render(); }

  get content() { return this._content; }
  set content(val) { this._content = val; this._render(); }

  get buttons() { return this._buttons; }
  set buttons(val) { this._buttons = val || []; this._render(); }

  show() {
    this.setAttribute('open', '');
    this._render();
    this.shadowRoot.querySelector('.smd-dialog').focus();
  }

  hide() {
    this.removeAttribute('open');
  }

  _render() {
    const buttonsHtml = this._buttons.map((btn, i) => {
      const variant = btn.variant || 'primary';
      const text = btn.text || 'OK';
      return `<button data-index="${i}" variant="${variant}">${text}</button>`;
    }).join('');

    this.shadowRoot.innerHTML = `
      <div class="smd-overlay"></div>
      <div class="smd-dialog" role="dialog" aria-modal="true">
        <div class="smd-header">
          <h3>${this._escapeHtml(this._title)}</h3>
        </div>
        <div class="smd-body">${this._content}</div>
        <div class="smd-footer">${buttonsHtml}</div>
      </div>
    `;

    this.shadowRoot.querySelectorAll('.smd-footer button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        const config = this._buttons[index];
        if (config.close !== false) this.hide();
        this.dispatchEvent(new CustomEvent('smd-modal-action', {
          bubbles: true,
          composed: true,
          detail: { index, action: config.action || null, text: config.text },
        }));
      });
    });
  }

  _escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

customElements.define('smd-modal', SmdModal);
