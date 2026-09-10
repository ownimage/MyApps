const pmdJobSearchCardSheet = SmdStyles.sheetFor(`
  :host {
    display: flex;
    flex-direction: column;
    position: relative;
    min-width: 0;
    word-wrap: break-word;
    background-color: var(--bs-body-bg, #303030);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .row1 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .row2 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
    font-size: 0.875em;
    min-width: 0;
  }
  .thumb {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thumb smd-image { width: 100%; height: 100%; }
  .title {
    font-weight: 700;
    min-width: 0;
    flex: 1;
    color: inherit;
  }
  .suffix { margin-left: 0.25rem; }
  .stream-title {
    font-weight: 700;
    flex-shrink: 0;
    color: inherit;
  }
  .btn {
    min-width: 50px;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    line-height: 1.5;
    flex-shrink: 0;
    align-self: center;
    margin-left: 1rem;
    touch-action: manipulation;
  }
  input.active-toggle {
    width: 1.1em;
    height: 1.1em;
    margin: 0;
    flex-shrink: 0;
    appearance: none;
    -webkit-appearance: none;
    vertical-align: middle;
    background-color: var(--bs-secondary-bg, #495057);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.25em;
    cursor: pointer;
    position: static;
  }
  input.active-toggle:checked {
    background-color: var(--bs-primary, #0d6efd);
    border-color: var(--bs-primary, #0d6efd);
  }
`);

const pmdJobSearchCardTemplate = document.createElement('template');
pmdJobSearchCardTemplate.innerHTML = `
  <div class="row1">
    <div class="thumb stream-thumb" hidden><smd-image key-prefix="planmydays_"></smd-image></div>
    <div class="thumb job-thumb" hidden><smd-image key-prefix="planmydays_"></smd-image></div>
    <div class="title">
      <span class="job-title"></span><span class="suffix badge bg-secondary" hidden></span>
    </div>
    <button type="button" class="btn btn-primary" data-action="edit">Edit</button>
  </div>
  <div class="row2">
    <input type="checkbox" class="active-toggle">
    <span class="stream-title"></span>
    <span class="badge tab-badge"></span>
    <span class="badge bg-info extra" hidden></span>
    <span class="badge bg-primary schedule"></span>
    <span class="badge bg-secondary time" hidden></span>
  </div>
`;

class PmdJobSearchCard extends HTMLElement {
  static get observedAttributes() {
    return ['stream-idx', 'job-idx', 'title', 'image', 'stream-image', 'stream-title', 'tab', 'suffix', 'schedule', 'time', 'extra', 'active', 'key-prefix'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    SmdStyles.adoptStyles(this.shadowRoot, [SmdStyles.hiddenSheet, SmdStyles.btnBadgeSheet, pmdJobSearchCardSheet]);
    this.shadowRoot.appendChild(pmdJobSearchCardTemplate.content.cloneNode(true));
  }

  connectedCallback() {
    const root = this.shadowRoot;
    root.querySelector('[data-action="edit"]').addEventListener('click', () => this._emit('pmd-job-edit'));
    root.querySelector('input.active-toggle').addEventListener('change', (e) => {
      this.dispatchEvent(new CustomEvent('pmd-job-toggle-active', {
        bubbles: true,
        composed: true,
        detail: {
          streamIdx: parseInt(this.getAttribute('stream-idx'), 10),
          jobIdx: parseInt(this.getAttribute('job-idx'), 10),
          checked: e.target.checked
        }
      }));
    });
    this._render();
  }

  attributeChangedCallback(name) {
    if (this.isConnected) this._render();
  }

  _emit(type) {
    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail: {
        streamIdx: parseInt(this.getAttribute('stream-idx'), 10),
        jobIdx: parseInt(this.getAttribute('job-idx'), 10)
      }
    }));
  }

  _render() {
    const root = this.shadowRoot;
    const title = this.getAttribute('title') || '';
    const image = this.getAttribute('image') || '';
    const streamImage = this.getAttribute('stream-image') || '';
    const streamTitle = this.getAttribute('stream-title') || '';
    const tab = this.getAttribute('tab') || 'progress';
    const suffix = this.getAttribute('suffix') || '';
    const schedule = this.getAttribute('schedule') || '';
    const time = this.getAttribute('time') || '';
    const extra = this.getAttribute('extra') || '';
    const active = this.getAttribute('active') !== 'false';

    root.querySelector('.job-title').textContent = title;

    const setThumb = (thumbCls, src) => {
      const thumb = root.querySelector(thumbCls);
      const sImg = thumb.querySelector('smd-image');
      sImg.setAttribute('key-prefix', this.getAttribute('key-prefix') || 'planmydays_');
      if (src) {
        sImg.setAttribute('image', src);
        thumb.hidden = false;
      } else {
        sImg.removeAttribute('image');
        thumb.hidden = true;
      }
    };
    setThumb('.stream-thumb', streamImage);
    setThumb('.job-thumb', image);

    const suffixEl = root.querySelector('.suffix');
    if (suffix.trim()) {
      suffixEl.textContent = suffix.trim();
      suffixEl.hidden = false;
    } else {
      suffixEl.hidden = true;
    }

    root.querySelector('.stream-title').textContent = streamTitle;

    const tabBadge = root.querySelector('.tab-badge');
    tabBadge.textContent = tab;
    tabBadge.className = 'badge tab-badge bg-' + (tab === 'progress' ? 'success' : 'info');

    const extraEl = root.querySelector('.extra');
    if (extra) {
      extraEl.textContent = extra;
      extraEl.hidden = false;
    } else {
      extraEl.hidden = true;
    }

    root.querySelector('.schedule').textContent = schedule;

    const timeEl = root.querySelector('.time');
    if (time) {
      timeEl.textContent = time;
      timeEl.hidden = false;
    } else {
      timeEl.hidden = true;
    }

    root.querySelector('input.active-toggle').checked = active;
  }
}

customElements.define('pmd-job-search-card', PmdJobSearchCard);