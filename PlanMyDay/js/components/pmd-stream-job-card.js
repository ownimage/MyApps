const pmdStreamJobCardSheet = SmdStyles.sheetFor(`
  :host {
    display: block;
    flex: 1 1 auto;
    min-width: 0;
    background-color: var(--bs-body-bg, #303030);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0;
    padding: 0.5rem;
  }
  .drag-handle,
  ::slotted(.drag-handle) {
    flex-shrink: 0;
    line-height: 1;
    font-size: 1.2rem;
    cursor: grab;
    touch-action: none;
    color: var(--bs-secondary-color, #6c757d);
    user-select: none;
    -webkit-user-select: none;
  }
  .drag-handle:active,
  ::slotted(.drag-handle:active) { cursor: grabbing; }
  :host([drag-handle]) .drag-handle { display: none; }
  .row1 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
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
  .row2 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
    font-size: 0.875em;
  }
  .time {
    margin-left: 0.25rem;
  }
  .btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    line-height: 1.5;
    flex-shrink: 0;
    align-self: center;
    margin-left: 0.75rem;
  }
  label.active-toggle {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 0;
    font-weight: 700;
    flex-shrink: 0;
    color: inherit;
    cursor: pointer;
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

const pmdStreamJobCardTemplate = document.createElement('template');
pmdStreamJobCardTemplate.innerHTML = `
  <div class="row1">
    <slot name="drag-handle"><div class="drag-handle">&#9776;</div></slot>
    <div class="thumb" hidden><smd-image key-prefix="planmydays_"></smd-image></div>
    <div class="title">
      <span class="job-title"></span><span class="suffix badge bg-secondary" hidden></span>
    </div>
    <button type="button" class="btn btn-primary" data-action="edit">Edit</button>
  </div>
  <div class="row2">
    <label class="active-toggle">
      <input type="checkbox" class="active-toggle">
      <span>Active</span>
    </label>
    <span class="badge bg-primary schedule"></span>
    <span class="badge bg-secondary time" hidden></span>
    <span class="badge bg-info extra" hidden></span>
  </div>
`;

class PmdStreamJobCard extends HTMLElement {
  static get observedAttributes() {
    return ['stream-idx', 'job-idx', 'title', 'image', 'suffix', 'schedule', 'time', 'active', 'extra', 'key-prefix'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    SmdStyles.adoptStyles(this.shadowRoot, [SmdStyles.hiddenSheet, SmdStyles.btnBadgeSheet, pmdStreamJobCardSheet]);
    this.shadowRoot.appendChild(pmdStreamJobCardTemplate.content.cloneNode(true));
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
    const suffix = this.getAttribute('suffix') || '';
    const schedule = this.getAttribute('schedule') || '';
    const time = this.getAttribute('time') || '';
    const extra = this.getAttribute('extra') || '';
    const active = this.getAttribute('active') !== 'false';

    root.querySelector('.job-title').textContent = title;

    const thumb = root.querySelector('.thumb');
    const sImg = root.querySelector('.thumb smd-image');
    sImg.setAttribute('key-prefix', this.getAttribute('key-prefix') || 'planmydays_');
    if (image) {
      sImg.setAttribute('image', image);
      thumb.hidden = false;
    } else {
      sImg.removeAttribute('image');
      thumb.hidden = true;
    }

    const suffixEl = root.querySelector('.suffix');
    if (suffix.trim()) {
      suffixEl.textContent = suffix.trim();
      suffixEl.hidden = false;
    } else {
      suffixEl.hidden = true;
    }

    root.querySelector('.schedule').textContent = schedule;

    const timeEl = root.querySelector('.time');
    if (time) {
      timeEl.textContent = time;
      timeEl.hidden = false;
    } else {
      timeEl.hidden = true;
    }

    const extraEl = root.querySelector('.extra');
    if (extra) {
      extraEl.textContent = extra;
      extraEl.hidden = false;
    } else {
      extraEl.hidden = true;
    }

    root.querySelector('input.active-toggle').checked = active;
  }
}

customElements.define('pmd-stream-job-card', PmdStreamJobCard);
