// <pmd-job-summary-card> — one job row, shared by the streams accordion and the
// Search Jobs results list (light DOM). Replaces the former pmd-job-stream-card
// and pmd-job-search-card.
//
// `variant` selects the layout:
//   "stream" (default) — drag-handle column, job thumbnail only, an inline
//                        "Active" checkbox in the badge row. The streams editor
//                        slots an `<smd-draghandle class="drag-handle"
//                        slot="drag-handle">`; when none is supplied the built-in
//                        fallback handle is shown and adopted on connect.
//   "search"           — leading checkbox column, stream + job thumbnails with
//                        the stream title under them, and a progress/maintenance
//                        tab badge. No drag handle (Sortable does not run here).
//
// Attributes:
//   variant       — "stream" (default) | "search"
//   stream-idx    — stream index (echoed on pmd-job-edit / pmd-job-toggle-active)
//   job-idx       — job index   (echoed on pmd-job-edit / pmd-job-toggle-active)
//   title         — job title
//   image         — job image name (rendered via smd-image)
//   stream-image  — stream image name  (search variant)
//   stream-title  — stream title under the thumbnails (search variant)
//   tab           — "progress" (success badge) | "maintenance" (info badge) (search)
//   suffix        — optional suffix badge text
//   schedule      — schedule text badge
//   time          — optional time badge
//   extra         — optional extra badge (Sleep/Wait)
//   active        — checkbox state ("true"/"false")
//   key-prefix    — smd-image storage prefix (default: SmdConfig.imagePrefix)
//
// Events:
//   pmd-job-edit          — detail { streamIdx, jobIdx }
//   pmd-job-toggle-active — detail { streamIdx, jobIdx, checked }

const pmdJobSummaryCardTemplate = document.createElement('template');
pmdJobSummaryCardTemplate.innerHTML = `
  <div class="card smd-card border-0 w-100">

    <div class="d-flex py-2 border rounded-3">

      <!-- 1️⃣ Drag handle (stream variant only) -->
      <div class="handle-col d-flex align-items-center flex-shrink-0 ms-2">
        <smd-draghandle class="drag-handle"></smd-draghandle>
      </div>

      <!-- 1️⃣ Active checkbox column (search variant only) -->
      <div class="check-col d-flex flex-column align-items-center justify-content-center flex-shrink-0 ms-2">
        <smd-checkbox class="active-toggle flex-shrink-0"></smd-checkbox>
      </div>

      <!-- 2️⃣ Thumbnails (+ stream title, search variant only) -->
      <div class="d-flex flex-column flex-shrink-0 images-col align-self-start">
        <div class="d-flex gap-1">
          <div class="thumb stream-thumb d-flex align-items-center justify-content-center flex-shrink-0"><smd-image key-prefix="shared-"></smd-image></div>
          <div class="thumb job-thumb d-flex align-items-center justify-content-center flex-shrink-0"><smd-image key-prefix="shared-"></smd-image></div>
        </div>
        <span class="stream-title text-truncate d-block mb-0 small fw-semibold"></span>
      </div>

      <div class="d-flex flex-column flex-grow-1 overflow-hidden ms-2">

        <!-- FULL-WIDTH TITLE, suffix badge straight after the text with a fixed gap -->
        <div class="d-flex align-items-center">
          <smd-h2 class="job-title text-truncate fw-bold mb-0"></smd-h2>
          <smd-badge class="suffix ms-2" variant="secondary" pill hidden></smd-badge>
        </div>

        <!-- BADGES + EDIT ROW -->
        <div class="d-flex flex-grow-1">
          <div class="flex-grow-1 d-flex flex-wrap gap-1 align-items-center">
            <smd-checkbox class="active-toggle active-toggle-inline fw-bold flex-shrink-0"><span>Active</span></smd-checkbox>
            <smd-badge class="tab-badge" pill></smd-badge>
            <smd-badge class="schedule" variant="primary" pill></smd-badge>
            <smd-badge class="time" variant="secondary" pill hidden></smd-badge>
            <smd-badge class="extra" variant="info" pill hidden></smd-badge>
          </div>
          <div class="d-flex align-items-end me-2 flex-shrink-0">
            <smd-button class="job-edit-btn" variant="primary" size="small" data-action="edit">Edit</smd-button>
          </div>
        </div>

      </div>
    </div>

  </div>
`;

class PmdJobSummaryCard extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'stream-idx', 'job-idx', 'title', 'image', 'stream-image', 'stream-title',
      'tab', 'suffix', 'schedule', 'time', 'extra', 'active', 'key-prefix'];
  }

  constructor() {
    super();
    this._bound = false;
  }

  get _variant() {
    return this.getAttribute('variant') === 'search' ? 'search' : 'stream';
  }

  connectedCallback() {
    // Clone-safe: a Sortable fallback ghost is cloneNode(true) of this host, so
    // the `data-smd-built` attribute (copied by cloneNode, unlike the `_bound` JS
    // property) stops the template being appended a second time in the ghost.
    if (!this._bound && !this.hasAttribute("data-smd-built")) {
      this._bound = true;
      this.setAttribute("data-smd-built", "");
      this.classList.add('d-block');
      this.appendChild(pmdJobSummaryCardTemplate.content.cloneNode(true));
      this._applyVariant();
      if (this._variant === 'stream') this._adoptSlottedHandle();
      this.querySelector('[data-action="edit"]').addEventListener('click', () => this._emit('pmd-job-edit'));
      this.querySelector('smd-checkbox.active-toggle').addEventListener('change', (e) => {
        const checked = e.detail ? e.detail.checked : e.target.checked;
        this.dispatchEvent(new CustomEvent('pmd-job-toggle-active', {
          bubbles: true,
          composed: true,
          detail: {
            streamIdx: parseInt(this.getAttribute('stream-idx'), 10),
            jobIdx: parseInt(this.getAttribute('job-idx'), 10),
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
      drop('.tab-badge');
      drop('.stream-thumb');
      drop('.stream-title');
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
        streamIdx: parseInt(this.getAttribute('stream-idx'), 10),
        jobIdx: parseInt(this.getAttribute('job-idx'), 10)
      }
    }));
  }

  _render() {
    const root = this;
    const search = this._variant === 'search';
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

    const keyPrefix = this.getAttribute('key-prefix') || smdImagePrefix();
    const setThumb = (thumbSel, src) => {
      const thumb = root.querySelector(thumbSel);
      if (!thumb) return;
      const sImg = thumb.querySelector('smd-image');
      sImg.setAttribute('key-prefix', keyPrefix);
      // The thumb wrapper always stays in place (even with no image) so job
      // titles line up in the list.
      if (src) {
        sImg.setAttribute('image', src);
      } else {
        sImg.removeAttribute('image');
      }
    };
    setThumb('.job-thumb', image);
    if (search) setThumb('.stream-thumb', streamImage);

    const suffixEl = root.querySelector('.suffix');
    if (suffix.trim()) {
      suffixEl.textContent = suffix.trim();
      suffixEl.hidden = false;
    } else {
      suffixEl.hidden = true;
    }

    if (search) {
      const streamTitleEl = root.querySelector('.stream-title');
      if (streamTitleEl) streamTitleEl.textContent = streamTitle;
      const tabBadge = root.querySelector('.tab-badge');
      if (tabBadge) {
        tabBadge.textContent = tab;
        tabBadge.setAttribute('variant', tab === 'progress' ? 'success' : 'info');
      }
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

    root.querySelector('smd-checkbox.active-toggle').checked = active;
  }
}

if (!window.customElements.get('pmd-job-summary-card')) {
  customElements.define('pmd-job-summary-card', PmdJobSummaryCard);
}

window.PmdJobSummaryCard = PmdJobSummaryCard;
