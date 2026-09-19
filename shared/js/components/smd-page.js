// <smd-page> — full-screen slide-in page (light DOM). Styles live in
// shared/css/styles.css. Renders header/body/footer buttons straight into the
// host; the app pumps `title`/`headerHtml`/`content`/`buttons` properties.
class SmdPage extends HTMLElement {
  static get observedAttributes() {
    return ['slide-duration'];
  }

  constructor() {
    super();
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

    this.innerHTML = `
      <div class="smd-page">
        <div class="smd-page-header">
          <h1>${this._escapeHtml(this._title)}</h1>${this._headerHtml}
        </div>
        <div class="smd-page-body">${this._content}</div>
        <div class="smd-page-footer">${buttonsHtml}</div>
      </div>
    `;

    this.querySelectorAll('.smd-page-footer smd-button').forEach((btn) => {
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

if (!window.customElements.get('smd-page')) {
  customElements.define('smd-page', SmdPage);
}
window.SmdPage = SmdPage;