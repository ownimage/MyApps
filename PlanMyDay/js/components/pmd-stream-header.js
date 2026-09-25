const pmdStreamHeaderTemplate = document.createElement('template');
pmdStreamHeaderTemplate.innerHTML = `
  <div class="stream-accordion-header bg-body-secondary text-body d-flex align-items-center w-100 p-1 ps-2">
    <smd-draghandle class="drag-handle"></smd-draghandle>
    <div class="thumb d-flex align-items-center justify-content-center flex-shrink-0 mx-2"><smd-image key-prefix="shared-"></smd-image></div>
    <div class="body d-flex flex-column flex-grow-1 gap-1 overflow-hidden me-2">
      <div class="row1 d-flex align-items-center gap-1 flex-nowrap">
        <button type="button" class="stream-header-main btn btn-link flex-grow-1 text-start text-reset text-decoration-none p-0 border-0" aria-expanded="false">
          <span class="editor-title d-block fw-bold text-truncate"></span>
        </button>
        <div class="header-actions d-flex align-items-center flex-shrink-0 gap-1 px-1">
          <button type="button" class="btn btn-sm btn-secondary" data-action="add-job">Add Job</button>
          <button type="button" class="btn btn-sm btn-primary" data-action="edit">Edit</button>
          <button type="button" class="btn btn-sm btn-danger" data-action="delete" hidden>Delete</button>
        </div>
      </div>
      <div class="row2 d-flex gap-1 flex-nowrap">
        <smd-badge class="tab-badge" variant="success" pill></smd-badge>
        <smd-badge class="count-badge" variant="secondary" pill hidden></smd-badge>
      </div>
    </div>
    <button type="button" class="chevron btn btn-link p-0 border-0 text-reset me-2" aria-label="Expand"></button>
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
      this.classList.add("d-block");
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
    if (this._bound && this.isConnected) this._render();
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
    const header = root.querySelector('.stream-accordion-header');
    header.classList.toggle('bg-body-tertiary', !expanded);
    header.classList.toggle('bg-info-subtle', expanded);

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