// <smd-modal> — confirm/info modal (light DOM). Layout is applied by the
// component; surface/theme rules live in shared/css/styles.css. Renders
// overlay/dialog/header/body/footer buttons
// straight into the host; the app pumps `title`/`content`/`buttons` properties
// and footer buttons use real Bootstrap `btn btn-*` classes.
class SmdModal extends HTMLElement {
  constructor() {
    super();
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
    const dialog = this.querySelector('.smd-dialog');
    if (dialog) dialog.focus();
  }

  hide() {
    this.removeAttribute('open');
  }

  _render() {
    if (typeof injectSmdComponentStyle === "function") {
      injectSmdComponentStyle("smd-modal-layout", `
        smd-modal { display: none; position: fixed; inset: 0; z-index: 1050; }
        smd-modal[open] { display: block; }
        smd-modal .smd-overlay { position: fixed; inset: 0; }
        smd-modal .smd-dialog { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 500px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
        smd-modal .smd-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem 0.5rem; flex-shrink: 0; }
        smd-modal .smd-header h3 { margin: 0; }
        smd-modal .smd-body { padding: 1rem 1.25rem; overflow-y: auto; flex: 1; }
        smd-modal .smd-footer { display: flex; gap: 0.5rem; padding: 0.75rem 1.25rem; }
        smd-modal .smd-footer button { flex: 1; }
      `);
    }
    const buttonsHtml = this._buttons.map((btn, i) => {
      const variant = btn.variant || 'primary';
      const text = btn.text || 'OK';
      return `<button type="button" data-index="${i}" variant="${variant}" class="btn btn-${variant}">${text}</button>`;
    }).join('');

    this.innerHTML = `
      <div class="smd-overlay"></div>
      <div class="smd-dialog" role="dialog" aria-modal="true" tabindex="-1">
        <div class="smd-header">
          <h3>${this._escapeHtml(this._title)}</h3>
        </div>
        <div class="smd-body">${this._content}</div>
        <div class="smd-footer">${buttonsHtml}</div>
      </div>
    `;

    this.querySelectorAll('.smd-footer button').forEach((btn) => {
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

if (!window.customElements.get('smd-modal')) {
  customElements.define('smd-modal', SmdModal);
}
window.SmdModal = SmdModal;
