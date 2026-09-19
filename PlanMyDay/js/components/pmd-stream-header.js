const pmdStreamHeaderTemplate = document.createElement('template');
pmdStreamHeaderTemplate.innerHTML = `
  <div class="stream-accordion-header">
    <smd-draghandle class="drag-handle"></smd-draghandle>
    <div class="thumb"><smd-image key-prefix="shared-"></smd-image></div>
    <div class="body">
      <div class="row1">
        <button type="button" class="stream-header-main" aria-expanded="false">
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
    this._bound = false;
  }

  connectedCallback() {
    if (!this._bound) {
      this._bound = true;
      this.appendChild(pmdStreamHeaderTemplate.content.cloneNode(true));
      this._adoptSlottedHandle();
      this.querySelector('.stream-header-main').addEventListener('click', () => this._emitToggle());
      this.querySelector('.chevron').addEventListener('click', () => this._emitToggle());
      this.querySelector('[data-action="add-job"]').addEventListener('click', () => this._emit('pmd-add-job'));
      this.querySelector('[data-action="edit"]').addEventListener('click', () => this._emit('pmd-edit'));
      this.querySelector('[data-action="delete"]').addEventListener('click', () => this._emit('pmd-delete'));
    }
    this._render();
  }

  attributeChangedCallback(name) {
    // Chromium connects elements DURING an innerHTML parse into an already
    // connected host, so attributeChangedCallback can fire before our
    // connectedCallback has stamped the template. Only render once _bound.
    if (this.isConnected && this._bound) this._render();
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

  // Move a consumer-provided drag handle (appended straight onto the host with
  // slot="drag-handle") into the header and drop our built-in fallback.
  _adoptSlottedHandle() {
    const external = this.querySelector(':scope > smd-draghandle.drag-handle');
    if (!external) return;
    const header = this.querySelector('.stream-accordion-header');
    if (!header) return;
    const fallback = header.querySelector(':scope > smd-draghandle.drag-handle');
    if (fallback) fallback.remove();
    external.removeAttribute('slot');
    header.insertBefore(external, header.firstChild);
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
    const root = this;
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