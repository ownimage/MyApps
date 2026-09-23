// <pmd-job-stream-card> — a single job row in the streams accordion (light DOM).
//
// Mirrors the Bootstrap flex layout of <pmd-job-search-card>/<pmd-job-today-card>
// (drag handle, job thumbnail, full-width title with suffix badge, Active toggle
// + schedule/time/extra badges, Edit button) using Bootstrap utilities in the
// template so the component needs only a tiny injected functional stylesheet.
// The card surface uses `card bg-dark` like the other job cards so the stream
// editor, today list and search results all share the same theme background.
//
// An `<smd-draghandle class="drag-handle" slot="drag-handle">` is appended by the
// consumer (Sortable needs a light-DOM handle); when none is provided the
// built-in fallback handle is shown. On connect the component moves a slotted
// handle into the handle cell and drops its own fallback.
//
// Attributes:
//   stream-idx    — stream index (echoed on pmd-job-edit / pmd-job-toggle-active)
//   job-idx       — job index   (echoed on pmd-job-edit / pmd-job-toggle-active)
//   title         — job title
//   image         — job image name (rendered via smd-image)
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

(function (global) {
  if (global.document.getElementById("pmd-job-stream-card-style")) return;
  const s = global.document.createElement("style");
  s.id = "pmd-job-stream-card-style";
  s.textContent =
    "pmd-job-stream-card {" +
    "  display: block;" +
    "}";
  global.document.head.appendChild(s);
})(window);

const pmdJobStreamCardTemplate = document.createElement('template');
pmdJobStreamCardTemplate.innerHTML = `
  <div class="card bg-dark text-white border-0">

    <div class="d-flex py-2 border rounded-lg">

      <!-- 1️⃣ Drag Handle -->
      <div class="d-flex align-items-center handle-col ms-2">
        <smd-draghandle class="drag-handle"></smd-draghandle>
      </div>

      <!-- 2️⃣ Job Thumbnail -->
      <div class="d-flex flex-column flex-shrink-0 images-col">
        <div class="d-flex gap-1">
          <div class="thumb job-thumb"><smd-image key-prefix="shared-"></smd-image></div>
        </div>
      </div>

      <div class="d-flex flex-column flex-grow-1">

        <!-- FULL-WIDTH TITLE, suffix badge straight after the text with a fixed gap -->
        <div class="d-flex align-items-center">
          <smd-h2 class="job-title"></smd-h2>
          <smd-badge class="suffix ms-2" variant="secondary" pill hidden></smd-badge>
        </div>

        <!-- ACTIVE TOGGLE + BADGES + EDIT ROW -->
        <div class="d-flex flex-grow-1">
          <div class="flex-grow-1 d-flex flex-wrap gap-1 align-items-center">
            <smd-checkbox class="active-toggle"><span>Active</span></smd-checkbox>
            <smd-badge class="schedule" variant="primary" pill></smd-badge>
            <smd-badge class="time" variant="secondary" pill hidden></smd-badge>
            <smd-badge class="extra" variant="info" pill hidden></smd-badge>
          </div>
          <div class="d-flex align-items-end me-2">
            <smd-button class="job-edit-btn" variant="primary" size="small" data-action="edit">Edit</smd-button>
          </div>
        </div>

      </div>
    </div>

  </div>
`;

class PmdJobStreamCard extends HTMLElement {
  static get observedAttributes() {
    return ['stream-idx', 'job-idx', 'title', 'image', 'suffix', 'schedule', 'time', 'active', 'extra', 'key-prefix'];
  }

  constructor() {
    super();
    this._bound = false;
  }

  connectedCallback() {
    if (!this._bound) {
      this._bound = true;
      this.appendChild(pmdJobStreamCardTemplate.content.cloneNode(true));
      this._adoptSlottedHandle();
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
    this._render();
  }

  attributeChangedCallback(name) {
    if (this._bound && this.isConnected) this._render();
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
    const title = this.getAttribute('title') || '';
    const image = this.getAttribute('image') || '';
    const suffix = this.getAttribute('suffix') || '';
    const schedule = this.getAttribute('schedule') || '';
    const time = this.getAttribute('time') || '';
    const extra = this.getAttribute('extra') || '';
    const active = this.getAttribute('active') !== 'false';

    root.querySelector('.job-title').textContent = title;

    const keyPrefix = this.getAttribute('key-prefix') || smdImagePrefix();
    const sImg = root.querySelector('.job-thumb smd-image');
    sImg.setAttribute('key-prefix', keyPrefix);
    // The thumb wrapper always stays in place (even with no image) so job
    // titles line up in the list.
    if (image) {
      sImg.setAttribute('image', image);
    } else {
      sImg.removeAttribute('image');
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

    root.querySelector('smd-checkbox.active-toggle').checked = active;
  }
}

if (!window.customElements.get('pmd-job-stream-card')) {
  customElements.define('pmd-job-stream-card', PmdJobStreamCard);
}

window.PmdJobStreamCard = PmdJobStreamCard;