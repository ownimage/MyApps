// <lol-list-summary-card> — one list row, shared by the categories accordion and the
// Search Lists results list (light DOM). Replaces the former lol-list-category-card
// and lol-list-search-card.
//
// `variant` selects the layout:
//   "category" (default) — drag-handle column, list thumbnail only, an inline
//                        "Active" checkbox in the badge row. The categories editor
//                        slots an `<smd-draghandle class="drag-handle"
//                        slot="drag-handle">`; when none is supplied the built-in
//                        fallback handle is shown and adopted on connect.
//   "search"           — leading checkbox column, category + list thumbnails with
//                        the category title under them. No drag handle (Sortable
//                        does not run here).
//
// Attributes:
//   variant       — "category" (default) | "search"
//   category-idx    — category index (echoed on lol-list-edit / lol-list-toggle-active)
//   list-idx       — list index   (echoed on lol-list-edit / lol-list-toggle-active)
//   title         — list title
//   image         — list image name (rendered via smd-image)
//   category-image  — category image name  (search variant)
//   category-title  — category title under the thumbnails (search variant)
//   active        — checkbox state ("true"/"false")
//   key-prefix    — smd-image storage prefix (default: SmdConfig.imagePrefix)
//
// Events:
//   lol-list-edit          — detail { categoryIdx, listIdx }
//   lol-list-toggle-active — detail { categoryIdx, listIdx, checked }

const lolListSummaryCardTemplate = document.createElement('template');
lolListSummaryCardTemplate.innerHTML = `
  <div class="card smd-card border-0 w-100">

    <div class="d-flex py-2 border rounded-3">

      <!-- 1️⃣ Drag handle (category variant only) -->
      <div class="handle-col d-flex align-items-center flex-shrink-0 ms-2">
        <smd-draghandle class="drag-handle"></smd-draghandle>
      </div>

      <!-- 1️⃣ Active checkbox column (search variant only) -->
      <div class="check-col d-flex flex-column align-items-center justify-content-center flex-shrink-0 ms-2">
        <smd-checkbox class="active-toggle flex-shrink-0"></smd-checkbox>
      </div>

      <!-- 2️⃣ Thumbnails (+ category title, search variant only) -->
      <div class="d-flex flex-column flex-shrink-0 images-col align-self-start">
        <div class="d-flex gap-1">
          <div class="thumb category-thumb d-flex align-items-center justify-content-center flex-shrink-0"><smd-image key-prefix="shared-"></smd-image></div>
          <div class="thumb list-thumb d-flex align-items-center justify-content-center flex-shrink-0"><smd-image key-prefix="shared-"></smd-image></div>
        </div>
        <span class="category-title text-truncate d-block mb-0 small fw-semibold"></span>
      </div>

      <div class="d-flex flex-column flex-grow-1 overflow-hidden ms-2">

        <!-- FULL-WIDTH TITLE -->
        <div class="d-flex align-items-center">
          <smd-h2 class="list-title text-truncate fw-bold mb-0"></smd-h2>
        </div>

        <!-- BADGES + EDIT ROW -->
        <div class="d-flex flex-grow-1">
          <div class="flex-grow-1 d-flex flex-wrap gap-1 align-items-center">
            <smd-checkbox class="active-toggle active-toggle-inline fw-bold flex-shrink-0"><span>Active</span></smd-checkbox>
          </div>
          <div class="d-flex align-items-end me-2 flex-shrink-0">
            <smd-button class="list-edit-btn" variant="primary" size="small" data-action="edit">Edit</smd-button>
          </div>
        </div>

      </div>
    </div>

  </div>
`;

class LolListSummaryCard extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'category-idx', 'list-idx', 'title', 'image', 'category-image', 'category-title',
      'active', 'key-prefix'];
  }

  constructor() {
    super();
    this._bound = false;
  }

  get _variant() {
    return this.getAttribute('variant') === 'search' ? 'search' : 'category';
  }

  connectedCallback() {
    // Clone-safe: a Sortable fallback ghost is cloneNode(true) of this host, so
    // the `data-smd-built` attribute (copied by cloneNode, unlike the `_bound` JS
    // property) stops the template being appended a second time in the ghost.
    if (!this._bound && !this.hasAttribute("data-smd-built")) {
      this._bound = true;
      this.setAttribute("data-smd-built", "");
      this.classList.add('d-block');
      this.appendChild(lolListSummaryCardTemplate.content.cloneNode(true));
      this._applyVariant();
      if (this._variant === 'category') this._adoptSlottedHandle();
      this.querySelector('[data-action="edit"]').addEventListener('click', () => this._emit('lol-list-edit'));
      this.querySelector('smd-checkbox.active-toggle').addEventListener('change', (e) => {
        const checked = e.detail ? e.detail.checked : e.target.checked;
        this.dispatchEvent(new CustomEvent('lol-list-toggle-active', {
          bubbles: true,
          composed: true,
          detail: {
            categoryIdx: parseInt(this.getAttribute('category-idx'), 10),
            listIdx: parseInt(this.getAttribute('list-idx'), 10),
            checked
          }
        }));
      });
    }
    this._bound = true;
    this._render();
  }

  attributeChangedCallback(name) {
    if (this._bound && this.isConnected) this._render();
  }

  // Drop the nodes that do not belong to the current variant so exactly one
  // `.active-toggle` and the right column/thumbnail layout remain.
  _applyVariant() {
    const drop = (sel) => {
      const el = this.querySelector(sel);
      if (el) el.remove();
    };
    if (this._variant === 'search') {
      this.classList.add('mb-2');
      drop('.handle-col');
      drop('.active-toggle-inline');
    } else {
      drop('.check-col');
      drop('.category-thumb');
      drop('.category-title');
    }
  }

  // Move a consumer-provided drag handle (appended straight onto the host with
  // slot="drag-handle") into the handle cell and drop our built-in fallback.
  // Sortable's handle needs to sit next to the built-in UI, so it is re-slotted
  // by hand.
  _adoptSlottedHandle() {
    const external = this.querySelector(':scope > smd-draghandle.drag-handle');
    if (!external) return;
    const fallback = this.querySelector('.handle-col > smd-draghandle.drag-handle');
    if (fallback) fallback.remove();
    external.removeAttribute('slot');
    const cell = this.querySelector('.handle-col');
    if (cell) cell.insertBefore(external, cell.firstChild);
  }

  _emit(type) {
    this.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail: {
        categoryIdx: parseInt(this.getAttribute('category-idx'), 10),
        listIdx: parseInt(this.getAttribute('list-idx'), 10)
      }
    }));
  }

  _render() {
    const root = this;
    const search = this._variant === 'search';
    const title = this.getAttribute('title') || '';
    const image = this.getAttribute('image') || '';
    const categoryImage = this.getAttribute('category-image') || '';
    const categoryTitle = this.getAttribute('category-title') || '';
    const active = this.getAttribute('active') !== 'false';

    root.querySelector('.list-title').textContent = title;

    const keyPrefix = this.getAttribute('key-prefix') || smdImagePrefix();
    const setThumb = (thumbSel, src) => {
      const thumb = root.querySelector(thumbSel);
      if (!thumb) return;
      const sImg = thumb.querySelector('smd-image');
      sImg.setAttribute('key-prefix', keyPrefix);
      // The thumb wrapper always stays in place (even with no image) so list
      // titles line up in the list.
      if (src) {
        sImg.setAttribute('image', src);
      } else {
        sImg.removeAttribute('image');
      }
    };
    setThumb('.list-thumb', image);
    if (search) setThumb('.category-thumb', categoryImage);

    if (search) {
      const categoryTitleEl = root.querySelector('.category-title');
      if (categoryTitleEl) categoryTitleEl.textContent = categoryTitle;
    }

    root.querySelector('smd-checkbox.active-toggle').checked = active;
  }
}

if (!window.customElements.get('lol-list-summary-card')) {
  customElements.define('lol-list-summary-card', LolListSummaryCard);
}

window.LolListSummaryCard = LolListSummaryCard;
