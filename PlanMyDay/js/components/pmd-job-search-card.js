const pmdJobSearchCardTemplate = document.createElement('template');
pmdJobSearchCardTemplate.innerHTML = `
  <div class="row1">
    <div class="thumb stream-thumb"><smd-image key-prefix="shared-"></smd-image></div>
    <div class="thumb job-thumb"><smd-image key-prefix="shared-"></smd-image></div>
    <div class="title">
      <span class="job-title"></span><smd-badge class="suffix" variant="secondary" hidden></smd-badge>
    </div>
    <button type="button" class="btn btn-primary" data-action="edit">Edit</button>
  </div>
  <div class="row2">
    <smd-checkbox class="active-toggle"></smd-checkbox>
    <span class="stream-title"></span>
    <smd-badge class="tab-badge" variant="success"></smd-badge>
    <smd-badge class="extra" variant="info" hidden></smd-badge>
    <smd-badge class="schedule" variant="primary"></smd-badge>
    <smd-badge class="time" variant="secondary" hidden></smd-badge>
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
    // Chromium connects elements DURING an innerHTML parse into an already
    // connected host, so attributeChangedCallback can fire before our
    // connectedCallback has stamped the template. Only render once _bound.
    if (this.isConnected && this._bound) this._render();
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

    const setThumb = (thumbCls, src) => {
      const thumb = root.querySelector(thumbCls);
      const sImg = thumb.querySelector('smd-image');
      sImg.setAttribute('key-prefix', this.getAttribute('key-prefix') || smdImagePrefix());
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