const pmdStreamJobCardTemplate = document.createElement('template');
pmdStreamJobCardTemplate.innerHTML = `
  <div class="row1">
    <smd-draghandle class="drag-handle"></smd-draghandle>
    <div class="thumb"><smd-image key-prefix="shared-"></smd-image></div>
    <div class="title">
      <span class="job-title"></span><smd-badge class="suffix" variant="secondary" pill hidden></smd-badge>
    </div>
    <button type="button" class="btn btn-primary" data-action="edit">Edit</button>
  </div>
  <div class="row2">
    <smd-checkbox class="active-toggle"><span>Active</span></smd-checkbox>
    <smd-badge class="schedule" variant="primary" pill></smd-badge>
    <smd-badge class="time" variant="secondary" pill hidden></smd-badge>
    <smd-badge class="extra" variant="info" pill hidden></smd-badge>
  </div>
`;

class PmdStreamJobCard extends HTMLElement {
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
      this.appendChild(pmdStreamJobCardTemplate.content.cloneNode(true));
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
    if (this.isConnected) this._render();
  }

  // Move a consumer-provided drag handle (appended straight onto the host with
  // slot="drag-handle") into row 1 and drop our built-in fallback. Sortable's
  // handle needs to sit next to the built-in UI, so it is re-slotted by hand.
  _adoptSlottedHandle() {
    const external = this.querySelector(':scope > smd-draghandle.drag-handle');
    if (!external) return;
    const fallback = this.querySelector('.row1 > smd-draghandle.drag-handle');
    if (fallback) fallback.remove();
    external.removeAttribute('slot');
    const row1 = this.querySelector('.row1');
    if (row1) row1.insertBefore(external, row1.firstChild);
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

    const sImg = root.querySelector('.thumb smd-image');
    sImg.setAttribute('key-prefix', this.getAttribute('key-prefix') || smdImagePrefix());
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

customElements.define('pmd-stream-job-card', PmdStreamJobCard);