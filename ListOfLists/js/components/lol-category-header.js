const lolCategoryHeaderTemplate = document.createElement('template');
lolCategoryHeaderTemplate.innerHTML = `
<div class="category-accordion-header bg-body-secondary text-body d-flex align-items-center w-100 p-1 ps-2">
    <smd-draghandle class="drag-handle"></smd-draghandle>
    <div class="thumb d-flex align-items-center justify-content-center flex-shrink-0 mx-2">
        <smd-image key-prefix="shared-"></smd-image>
    </div>
    <div class="category-header-body d-flex flex-column gap-1 flex-grow-1 overflow-hidden me-2">
        <button type="button"
                class="category-header-main btn btn-link w-100 text-start text-reset text-decoration-none p-0 border-0 overflow-hidden"
                aria-expanded="false">
            <span class="editor-title d-block fw-bold text-truncate"></span>
        </button>
        <div class="category-header-meta d-flex align-items-center gap-1 flex-wrap">
            <smd-badge class="tab-badge" variant="success" pill></smd-badge>
            <smd-badge class="count-badge" variant="secondary" pill hidden></smd-badge>
            <div class="header-actions d-flex align-items-center flex-shrink-0 gap-1 ms-auto px-1">
                <button type="button" class="btn btn-sm btn-secondary" data-action="add-list">Add List</button>
                <button type="button" class="btn btn-sm btn-primary" data-action="edit">Edit</button>
                <button type="button" class="btn btn-sm btn-danger m-2" data-action="delete" hidden>Delete</button>
            </div>
        </div>
    </div>
    <button type="button" class="chevron btn btn-link p-0 border-0 text-reset me-2" aria-label="Expand"></button>
</div>
`;

class LolCategoryHeader extends HTMLElement {
  static get observedAttributes() {
    return ['category-idx', 'title', 'image', 'tab', 'expanded', 'can-delete', 'listcounts', 'key-prefix'];
  }

  constructor() {
    super();
    this._bound = false;
  }

  connectedCallback() {
    // Clone-safe: a Sortable fallback ghost is cloneNode(true) of this host, so
    // the `data-smd-built` attribute (copied by cloneNode, unlike the `_bound` JS
    // property) stops the template being appended a second time in the ghost.
    if (!this._bound && !this.hasAttribute("data-smd-built")) {
      this._bound = true;
      this.setAttribute("data-smd-built", "");
      if (typeof injectSmdComponentStyle === 'function') {
        // Chevron mechanics that used to live in shared/css/styles.css. The ::after
        // glyph moves whole (its border uses currentColor, so it cannot be split
        // from the rotate/transition without leaving the arrow unrotatable); the
        // button's own width/min-height and transparent background stay in the
        // shared sheet as size/colour. Selectors are kept verbatim so both the
        // scope and the specificity the theme sheets compete with are unchanged.
        injectSmdComponentStyle('lol-category-header-layout', `
          #smd-app #categoriesEditor lol-category-header .chevron { position: relative; flex: 0 0 auto; margin-right: 0.5rem; border: 0; cursor: pointer; opacity: 1; visibility: inherit; }
          #smd-app #categoriesEditor lol-category-header .chevron::after { content: ""; position: absolute; top: 50%; left: 50%; width: 0.7rem; height: 0.7rem; margin-top: -0.45rem; margin-left: -0.35rem; border-right: 2.5px solid currentColor; border-bottom: 2.5px solid currentColor; transform: rotate(45deg); transition: transform 0.2s ease; }
          #smd-app #categoriesEditor lol-category-header[expanded] .chevron::after { transform: rotate(225deg); }
        `);
      }
      this.classList.add("d-block");
      this.appendChild(lolCategoryHeaderTemplate.content.cloneNode(true));
      this._adoptSlottedHandle();
      this.querySelector('.category-header-main').addEventListener('click', () => this._emitToggle());
      this.querySelector('.chevron').addEventListener('click', () => this._emitToggle());
      this.querySelector('[data-action="add-list"]').addEventListener('click', () => this._emit('lol-add-list'));
      this.querySelector('[data-action="edit"]').addEventListener('click', () => this._emit('lol-edit'));
      this.querySelector('[data-action="delete"]').addEventListener('click', () => this._emit('lol-delete'));
    }
    this._bound = true;
    this._render();
  }

  attributeChangedCallback(name) {
    if (this._bound && this.isConnected) this._render();
  }

  get categoryIdx() {
    return parseInt(this.getAttribute('category-idx'), 10);
  }

  set expanded(v) {
    if (v) this.setAttribute('expanded', '');
    else this.removeAttribute('expanded');
  }

  set listCounts(v) {
    if (v && v !== '') this.setAttribute('listcounts', String(v));
    else this.removeAttribute('listcounts');
  }

  // Move a consumer-provided drag handle (appended straight onto the host with
  // slot="drag-handle") into the header and drop our built-in fallback.
  _adoptSlottedHandle() {
    const external = this.querySelector(':scope > smd-draghandle.drag-handle');
    if (!external) return;
    const header = this.querySelector('.category-accordion-header');
    if (!header) return;
    const fallback = header.querySelector(':scope > smd-draghandle.drag-handle');
    if (fallback) fallback.remove();
    external.removeAttribute('slot');
    header.insertBefore(external, header.firstChild);
  }

  _emitToggle() {
    const toggled = !this.hasAttribute('expanded');
    this.dispatchEvent(new CustomEvent('lol-category-toggle', {
      bubbles: true,
      composed: true,
      detail: { categoryIdx: this.categoryIdx, expanded: toggled }
    }));
  }

  _emit(type) {
    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail: { categoryIdx: this.categoryIdx }
    }));
  }

  _render() {
    const root = this;
    const expanded = this.hasAttribute('expanded');
    const title = this.getAttribute('title') || '';
    const image = this.getAttribute('image') || '';
    const tab = this.getAttribute('tab') || 'progress';
    const canDelete = this.hasAttribute('can-delete');
    const listcounts = this.getAttribute('listcounts') || '';
    const header = root.querySelector('.category-accordion-header');
    header.classList.toggle('bg-body-tertiary', !expanded);
    header.classList.toggle('bg-info-subtle', expanded);

    root.querySelector('.editor-title').textContent = title;
    root.querySelector('.category-header-main').setAttribute('aria-expanded', String(expanded));

    const sImg = root.querySelector('.thumb smd-image');
    sImg.setAttribute('key-prefix', this.getAttribute('key-prefix') || smdImagePrefix());
    // The thumb wrapper always stays in place (even with no image) so the
    // category headings line up.
    if (image) {
      sImg.setAttribute('image', image);
    } else {
      sImg.removeAttribute('image');
    }

    const tabBadge = root.querySelector('.tab-badge');
    // The tab is shown as a Font Awesome icon: fast-forward for "progress",
    // play for "maintenance". Both badges use the primary variant.
    tabBadge.innerHTML = '<i class="fa-solid ' + (tab === 'maintenance' ? 'fa-play' : 'fa-forward') + '" aria-hidden="true"></i>';
    tabBadge.setAttribute('variant', 'primary');

    const countBadge = root.querySelector('.count-badge');
    if (listcounts) {
      countBadge.textContent = listcounts;
      countBadge.hidden = false;
    } else {
      countBadge.hidden = true;
    }

    // Hide chevron if there are no lists
    const chevron = root.querySelector('.chevron');
    if (listcounts === '' || listcounts === '0') {
      chevron.hidden = true;
    } else {
      chevron.hidden = false;
    }

    // Update delete button to use Font Awesome trash-can icon and maintain spacing
    const deleteBtn = root.querySelector('[data-action="delete"]');
    deleteBtn.hidden = !canDelete;
    if (canDelete) {
      deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    }

    // Ensure all buttons within header-actions have consistent spacing
    const headerActions = root.querySelector('.header-actions');
    if (headerActions) {
      // Add margin to buttons except the chevron
      const buttons = headerActions.querySelectorAll('button');
      buttons.forEach((button, index) => {
        if (!button.classList.contains('chevron')) {
          // Add margin to all buttons except the last one, ensuring consistent spacing
          if (index < buttons.length - 1) { 
            button.classList.add('me-2');
          } else {
            button.classList.remove('me-2'); // Ensure last button has no trailing margin
          }
        }
      });
    }
  }
}

customElements.define('lol-category-header', LolCategoryHeader);