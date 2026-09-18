const pmdStreamHeaderSheet = SmdStyles.sheetFor(`
  :host {
    display: block;
  }
  .stream-accordion-header {
    display: flex;
    align-items: center;
    width: 100%;
    box-sizing: border-box;
    padding: 0.25rem 0 0.25rem 0.5rem;
    background-color: var(--bs-light-border-subtle);
    color: var(--bs-emphasis-color, var(--smd-primary-text, #fff));
  }
  :host([expanded]) .stream-accordion-header {
    background-color: var(--bs-info-border-subtle);
    color: var(--bs-emphasis-color, var(--smd-primary-text, #fff));
  }
  .thumb {
    flex-shrink: 0;
    margin: 0 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
    gap: 0.25rem;
    overflow: hidden;
    margin-right: 0.5rem;
  }
  .row1 { display: flex; align-items: center; gap: 0.35rem; min-width: 0; }
  .stream-header-main {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .editor-title {
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .header-actions {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 0.35rem;
    padding: 0 0.35rem;
    color: inherit;
  }
  .row2 { display: flex; gap: 0.25rem; flex-wrap: nowrap; }
  .chevron {
    flex: 0 0 auto;
    width: 2.5rem;
    min-height: 3rem;
    border: 0;
    background: transparent;
    position: relative;
    cursor: pointer;
    margin-right: 0.5rem;
  }
  .chevron::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0.7rem;
    height: 0.7rem;
    margin-top: -0.45rem;
    margin-left: -0.35rem;
    border-right: 2.5px solid currentColor;
    border-bottom: 2.5px solid currentColor;
    transform: rotate(45deg);
    transition: transform 0.2s ease;
  }
  :host([expanded]) .chevron::after {
    transform: rotate(225deg);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0.5rem;
    font-size: var(--smd-type-p, 0.85rem);
    line-height: 1.5;
    text-align: center;
    border-radius: 0.25rem;
    cursor: pointer;
    white-space: nowrap;
  }
`);

const pmdStreamHeaderTemplate = document.createElement('template');
pmdStreamHeaderTemplate.innerHTML = `
  <div class="stream-accordion-header">
    <smd-draghandle class="drag-handle"></smd-draghandle>
    <div class="thumb"><smd-image key-prefix="shared-"></smd-image></div>
    <div class="body">
      <div class="row1">
        <button type="button" class="stream-header-main" part="header-main" aria-expanded="false">
          <span class="editor-title"></span>
        </button>
        <div class="header-actions">
          <button type="button" class="btn btn-secondary" data-action="add-job">Add Job</button>
          <button type="button" class="btn btn-primary" data-action="edit">Edit</button>
          <button type="button" class="btn btn-danger" data-action="delete" hidden>Delete</button>
        </div>
      </div>
      <div class="row2">
        <smd-badge class="tab-badge" variant="success" pill></smd-badge>
        <smd-badge class="count-badge" variant="secondary" pill hidden></smd-badge>
      </div>
    </div>
    <button type="button" class="chevron" aria-label="Expand"></button>
  </div>
`;

class PmdStreamHeader extends HTMLElement {
  static get observedAttributes() {
    return ['stream-idx', 'title', 'image', 'tab', 'expanded', 'can-delete', 'jobcounts', 'key-prefix'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    SmdStyles.adoptStyles(this.shadowRoot, [SmdStyles.hiddenSheet, SmdStyles.btnBadgeSheet, pmdStreamHeaderSheet]);
    this.shadowRoot.appendChild(pmdStreamHeaderTemplate.content.cloneNode(true));
  }

  connectedCallback() {
    const root = this.shadowRoot;
    root.querySelector('.stream-header-main').addEventListener('click', () => this._emitToggle());
    root.querySelector('.chevron').addEventListener('click', () => this._emitToggle());
    root.querySelector('[data-action="add-job"]').addEventListener('click', () => this._emit('pmd-add-job'));
    root.querySelector('[data-action="edit"]').addEventListener('click', () => this._emit('pmd-edit'));
    root.querySelector('[data-action="delete"]').addEventListener('click', () => this._emit('pmd-delete'));
    this._render();
  }

  attributeChangedCallback(name) {
    if (this.isConnected) this._render();
  }

  get streamIdx() {
    return parseInt(this.getAttribute('stream-idx'), 10);
  }

  set expanded(v) {
    if (v) this.setAttribute('expanded', '');
    else this.removeAttribute('expanded');
  }

  set jobCounts(v) {
    if (v && v !== '') this.setAttribute('jobcounts', String(v));
    else this.removeAttribute('jobcounts');
  }

  _emitToggle() {
    const toggled = !this.hasAttribute('expanded');
    this.dispatchEvent(new CustomEvent('pmd-header-toggle', {
      bubbles: true,
      composed: true,
      detail: { streamIdx: this.streamIdx, expanded: toggled }
    }));
  }

  _emit(type) {
    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail: { streamIdx: this.streamIdx }
    }));
  }

  _render() {
    const root = this.shadowRoot;
    const expanded = this.hasAttribute('expanded');
    const title = this.getAttribute('title') || '';
    const image = this.getAttribute('image') || '';
    const tab = this.getAttribute('tab') || 'progress';
    const canDelete = this.hasAttribute('can-delete');
    const jobcounts = this.getAttribute('jobcounts') || '';

    root.querySelector('.editor-title').textContent = title;
    root.querySelector('.stream-header-main').setAttribute('aria-expanded', String(expanded));

    const sImg = root.querySelector('.thumb smd-image');
    sImg.setAttribute('key-prefix', this.getAttribute('key-prefix') || smdImagePrefix());
    // The thumb wrapper always stays in place (even with no image) so the
    // stream headings line up.
    if (image) {
      sImg.setAttribute('image', image);
    } else {
      sImg.removeAttribute('image');
    }

    const tabBadge = root.querySelector('.tab-badge');
    tabBadge.textContent = tab;
    tabBadge.setAttribute('variant', tab === 'progress' ? 'success' : 'info');

    const countBadge = root.querySelector('.count-badge');
    if (jobcounts) {
      countBadge.textContent = jobcounts;
      countBadge.hidden = false;
    } else {
      countBadge.hidden = true;
    }

    root.querySelector('[data-action="delete"]').hidden = !canDelete;
  }
}

customElements.define('pmd-stream-header', PmdStreamHeader);
