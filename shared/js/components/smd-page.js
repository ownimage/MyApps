// <smd-page> — full-screen slide-in page (light DOM). Layout is applied by the
// component; surface/theme rules live in shared/css/styles.css. Renders
// header/body/footer buttons straight into the
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

  connectedCallback() {
    this._installLayout();
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
        // Trigger the slide-OUT transition instead of instantly hiding: the
        // host's `visibility` only becomes hidden once [open] is removed, so
        // removing it here would make the whole close-instant regardless of the
        // configured slide speed. Adding .smd-page-closing keeps the page
        // visible while its inner panel slides back to translateX(-100%), and
        // [open] is dropped after the transition finishes (the app also adds
        // d-none at slideDuration + 50ms, so a missed timer cannot leak a
        // visible ghost). The slide duration is re-read here so the close
        // honours the Settings -> Display -> Slide speed at the moment of close.
        const token = this._showToken;
        const duration = this.slideDuration || 0;
        if (duration > 0) {
            this.classList.add('smd-page-closing');
        }
        window.setTimeout(() => {
            if (token !== this._showToken) return;
            this.classList.remove('smd-page-closing');
            this.removeAttribute('open');
        }, duration + 50);
        if (wasSuspended) {
            removeSmdPageFromBackgrounds(this);
        } else {
            restoreSmdPageBackgrounds(this);
        }
    }

    // Run `callback` once the page's slide-in transition has finished. Callers
    // that must measure/position against the page (e.g. opening a flatpickr) would
    // otherwise act on the panel's transient mid-slide location. Falls back to the
    // next frame when there is no slide, and to a timeout if the `transitionend`
    // event never arrives, so the callback always runs exactly once.
    whenSlideDone(callback) {
        let done = false;
        const finish = () => { if (done) return; done = true; callback(); };
        const panel = this.querySelector('.smd-page');
        if (!panel) { requestAnimationFrame(finish); return; }
        const cs = getComputedStyle(panel);
        const seconds = (parseFloat(cs.transitionDuration) || 0) + (parseFloat(cs.transitionDelay) || 0);
        if (seconds <= 0) { requestAnimationFrame(finish); return; }
        const onEnd = (event) => {
            if (event.target === panel && event.propertyName === 'transform') {
                panel.removeEventListener('transitionend', onEnd);
                finish();
            }
        };
        panel.addEventListener('transitionend', onEnd);
        setTimeout(() => { panel.removeEventListener('transitionend', onEnd); finish(); }, seconds * 1000 + 250);
    }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name !== 'slide-duration') return;
    const ms = parseFloat(newValue);
    this.style.setProperty('--smd-slide-duration', (isNaN(ms) ? 0 : ms / 1000) + 's');
  }

  _render() {
    this._installLayout();
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
        // Bootstrap's `.btn:disabled` sets `pointer-events: none`, so a click on a
        // "disabled" button actually TARGETS THE HOST `<smd-button>` (the inner
        // <button> is disabled and never fires). Without this guard a page whose
        // footer button was disabled (e.g. an empty mandatory Title) still fired
        // its action: "it looks disabled but is actually clickable".
        if (btn.disabled || btn.hasAttribute('disabled')) return;
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

  _installLayout() {
    if (typeof injectSmdComponentStyle === "function") {
      injectSmdComponentStyle("smd-page-layout", `
        smd-page { display: block; position: fixed; inset: 0; z-index: 1040; pointer-events: none; overflow: hidden; visibility: hidden; }
        smd-page[open], smd-page.smd-page-closing { visibility: visible; }
        smd-page.d-none, smd-page.smd-page-suspended { display: none !important; }
        smd-page .smd-page { position: absolute; inset: 0; display: flex; flex-direction: column; transform: translateX(-100%); transition: transform var(--smd-slide-duration, 0s) ease; pointer-events: auto; }
        smd-page[open] .smd-page { transform: translateX(0); }
        smd-page.smd-page-closing .smd-page { transform: translateX(-100%); }
        smd-page .smd-page-header { display: flex; align-items: center; flex-wrap: wrap; flex-shrink: 0; padding: 0.75rem 1.25rem; }
        smd-page .smd-page-body { flex: 1; overflow-y: auto; }
        smd-page .smd-page-footer { display: flex; gap: 0.5rem; flex-shrink: 0; }
        smd-page .smd-page-footer smd-button { flex: 1; min-width: 0; }
        smd-page .smd-page-footer smd-button button { width: 100%; box-sizing: border-box; }
      `);
    }
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
