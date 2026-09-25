// <smd-page> — full-screen slide-in page (light DOM). Styles live in
// shared/css/styles.css. Renders header/body/footer buttons straight into the
// host; the app pumps `title`/`headerHtml`/`content`/`buttons` properties.

const SMD_PAGE_SUSPENDED = 'smd-page-suspended';

function restoreSmdPageBackgrounds(page) {
    const pages = page.__smdBackgroundPages || [];
    page.__smdBackgroundPages = [];
    pages.forEach((background) => background.classList.remove(SMD_PAGE_SUSPENDED));
}

function removeSmdPageFromBackgrounds(page) {
    document.querySelectorAll('smd-page').forEach((owner) => {
        const pages = owner.__smdBackgroundPages || [];
        const index = pages.indexOf(page);
        if (index !== -1) pages.splice(index, 1);
    });
    page.classList.remove(SMD_PAGE_SUSPENDED);
}

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
        this._showToken = (this._showToken || 0) + 1;
        const token = this._showToken;
        if (this.hasAttribute('open') && !this.classList.contains(SMD_PAGE_SUSPENDED)) return;
        restoreSmdPageBackgrounds(this);
        removeSmdPageFromBackgrounds(this);
        const backgrounds = Array.from(document.querySelectorAll('smd-page[open]')).filter((page) => (
            page !== this && !page.classList.contains(SMD_PAGE_SUSPENDED)
        ));
        backgrounds.forEach((page) => page.classList.add(SMD_PAGE_SUSPENDED));
        this.__smdBackgroundPages = backgrounds;
        requestAnimationFrame(() => {
            if (token === this._showToken) this.setAttribute('open', '');
        });
    }

    hide() {
        this._showToken = (this._showToken || 0) + 1;
        const wasSuspended = this.classList.contains(SMD_PAGE_SUSPENDED);
        this.removeAttribute('open');
        if (wasSuspended) {
            removeSmdPageFromBackgrounds(this);
        } else {
            restoreSmdPageBackgrounds(this);
        }
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
        <div class="smd-page-header gap-2">
          <h1 class="mb-0">${this._escapeHtml(this._title)}</h1>${this._headerHtml}
        </div>
        <div class="smd-page-body p-2">${this._content}</div>
        <div class="smd-page-footer p-2">${buttonsHtml}</div>
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