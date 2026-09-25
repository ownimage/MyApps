// <pmd-job-search-card> — a single matching job row on the Search Jobs page
// (light DOM).
//
// Attributes:
//   stream-idx    — stream index (echoed on pmd-job-edit / pmd-job-toggle-active)
//   job-idx       — job index   (echoed on pmd-job-edit / pmd-job-toggle-active)
//   title         — job title
//   image         — job image name (rendered via smd-image)
//   stream-image  — stream image name (rendered via smd-image)
//   stream-title  — stream title shown under the thumbnails
//   tab           — "progress" (success badge) | "maintenance" (info badge)
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

const pmdJobSearchCardTemplate = document.createElement('template');
pmdJobSearchCardTemplate.innerHTML = `
  <div class="card smd-card border-0 w-100">

    <div class="d-flex py-2 border rounded-3">

      <!-- 1️⃣ Checkbox -->
      <div class="d-flex flex-column align-items-center justify-content-center flex-shrink-0">
        <smd-checkbox class="active-toggle flex-shrink-0"></smd-checkbox>
      </div>

      <!-- 2️⃣ Stream / Job thumbnails + stream name -->
      <div class="d-flex flex-column flex-shrink-0 images-col align-self-start">
        <div class="d-flex gap-1">
          <div class="thumb stream-thumb d-flex align-items-center justify-content-center flex-shrink-0"><smd-image key-prefix="shared-"></smd-image></div>
          <div class="thumb job-thumb d-flex align-items-center justify-content-center flex-shrink-0"><smd-image key-prefix="shared-"></smd-image></div>
        </div>
        <span class="stream-title text-truncate d-block mb-0 small fw-semibold"></span>
      </div>

      <div class="d-flex flex-column flex-grow-1 overflow-hidden">

        <!-- FULL-WIDTH TITLE, suffix badge straight after the text with a fixed gap -->
        <div class="d-flex align-items-center">
          <smd-h2 class="job-title text-truncate fw-bold mb-0"></smd-h2>
          <smd-badge class="suffix ms-2" variant="secondary" hidden></smd-badge>
        </div>

        <!-- BADGES + EDIT ROW -->
        <div class="d-flex flex-grow-1">
          <div class="flex-grow-1 d-flex flex-wrap gap-1 align-items-center">
            <smd-badge class="tab-badge" pill></smd-badge>
            <smd-badge class="extra" variant="info" pill hidden></smd-badge>
            <smd-badge class="schedule" variant="primary" pill></smd-badge>
            <smd-badge class="time" variant="secondary" pill hidden></smd-badge>
          </div>
          <div class="d-flex align-items-end me-2 flex-shrink-0">
            <smd-button class="job-edit-btn" variant="primary" size="small" data-action="edit">Edit</smd-button>
          </div>
        </div>

      </div>
    </div>

  </div>
`;

class PmdJobSearchCard extends HTMLElement {
  static get observedAttributes() {
    return ['stream-idx', 'job-idx', 'title', 'image', 'stream-image', 'stream-title', 'tab', 'suffix', 'schedule', 'time', 'extra', 'active', 'key-prefix'];
  }

  constructor() {
    super();
    this._bound = false;
  }

  connectedCallback() {
    if (!this._bound) {
      this._bound = true;
      this.classList.add("d-block", "mb-2");
      this.appendChild(pmdJobSearchCardTemplate.content.cloneNode(true));
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

    const setThumb = (thumbCls, src) => {
      const thumb = root.querySelector(thumbCls);
      const sImg = thumb.querySelector('smd-image');
      sImg.setAttribute('key-prefix', keyPrefix);
      // The thumb wrapper always stays in place (even with no image) so job
      // titles line up in the results list.
      if (src) {
        sImg.setAttribute('image', src);
      } else {
        sImg.removeAttribute('image');
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
    tabBadge.setAttribute('variant', tab === 'progress' ? 'success' : 'info');

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

    root.querySelector('smd-checkbox.active-toggle').checked = active;
  }
}

customElements.define('pmd-job-search-card', PmdJobSearchCard);