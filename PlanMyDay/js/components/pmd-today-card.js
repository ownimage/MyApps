// <pmd-today-card> — a single job row on the Today list.
//
// Owns its own layout (drag handle, completion checkbox + daily-repeat icon,
// stream/job thumbnails, title + suffix, stream title, View button, tab badge,
// description) and styling. The host carries the light-DOM classes the app/Sortable
// rely on (`today-drag-card`; the app adds `card countdown-card mb-2`), so the
// document theme styles the card chrome while the shadow root holds the content.
//
// A `<div class="drag-handle" slot="drag-handle">` is slotted in by the consumer
// (Sortable needs a light-DOM handle); when none is provided the built-in
// fallback handle is shown.
//
// Attributes:
//   job-id        — job id (echoed on pmd-today-toggle, set as data-job-id on the checkbox)
//   stream-idx    — stream index (echoed on pmd-today-view)
//   job-idx       — job index (echoed on pmd-today-view)
//   title         — job title
//   suffix        — optional suffix badge text
//   daily         — presence shows the bootstrap `repeat-1` icon (Every day)
//   done          — presence dims the card + strikes through the title
//   checked       — checkbox state ("true"/"false")
//   stream-image  — stream image name (rendered via smd-image)
//   job-image     — job image name (rendered via smd-image)
//   stream-title  — stream title shown under the job title
//   tab           — "progress" (success badge) | "maintenance" (info badge)
//   description   — optional description line
//   key-prefix    — smd-image storage prefix (default "planmydays_")
//
// Events:
//   pmd-today-toggle — detail { jobId, checked }
//   pmd-today-view   — detail { streamIdx, jobIdx }
const pmdTodayCardSheet = SmdStyles.sheetFor(`
  :host {
    display: flex;
    flex-direction: column;
    position: relative;
    min-width: 0;
    word-wrap: break-word;
    background-color: var(--bs-dark-border-subtle, #303030);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
  }
  :host([hidden]) { display: none !important; }
  :host([done]) { opacity: 0.5; }
  :host([done]) .title { text-decoration: line-through; }
  :host-context(body.compact) {
    padding: 0.25rem 0.5rem;
    margin-bottom: 0.25rem;
  }

  .row {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 0.75rem;
  }
  .handle-col {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
  }
  .drag-handle,
  ::slotted(.drag-handle) {
    flex-shrink: 0;
    line-height: 1;
    font-size: 1.2rem;
    cursor: grab;
    touch-action: none;
    -webkit-touch-callout: none;
    color: var(--bs-body-color, #dee2e6);
    user-select: none;
    -webkit-user-select: none;
  }
  .drag-handle:active,
  ::slotted(.drag-handle:active) { cursor: grabbing; }

  .check-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-left: 0.25rem;
    padding-right: 0;
  }
  .check-row {
    display: flex;
    align-items: center;
    min-height: 0;
    padding-left: 0;
    margin-bottom: 0;
  }
  .daily-repeat-icon { margin-top: 0.1rem; }

  .images-col {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0;
    min-width: 68px;
    flex: 0 0 auto;
  }
  .thumb {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thumb smd-image { width: 100%; height: 100%; }

  .content-col { flex: 1 1 auto; min-width: 0; }
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }
  .title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 800;
    min-width: 0;
  }
  .suffix { margin-left: 0.25rem; }

  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
  }
  .stream-title { font-size: 0.875em; }
  .job-view-btn {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.35em 0.65em;
    font-size: 0.75em;
    line-height: 1;
    font-weight: 700;
  }
  .tab-badge { border-radius: 50rem !important; }
  .description {
    margin-top: 0.25rem;
    font-size: 0.875em;
    color: var(--bs-secondary-color, #aaa);
  }

  :host-context(body.font-size-large) .title { font-size: 1.6rem; }
  :host-context(body.font-size-xlarge) .title { font-size: 1.75rem; }
  :host-context(body.font-size-jumbo) .title { font-size: 2rem; }
  :host-context(body.compact) .title { font-size: 1rem !important; }
  :host-context(body.compact) .title-row { margin-bottom: 0; }
  :host-context(body.compact) .description { margin-top: 0; }
  :host-context(body.compact) .row > * {
    padding-top: 0.1rem;
    padding-bottom: 0.1rem;
  }
`);

const pmdTodayCardTemplate = document.createElement('template');
pmdTodayCardTemplate.innerHTML = `
  <div class="row">
    <div class="handle-col">
      <slot name="drag-handle"><div class="drag-handle">&#9776;</div></slot>
      <div class="check-col">
        <div class="check-row"><smd-checkbox class="job-checkbox"></smd-checkbox></div>
        <smd-image class="daily-repeat-icon" key-prefix="planmydays_" size="16" title="Every day" hidden></smd-image>
      </div>
    </div>
    <div class="images-col">
      <div class="thumb stream-thumb" hidden><smd-image key-prefix="planmydays_" size="32"></smd-image></div>
      <div class="thumb job-thumb" hidden><smd-image key-prefix="planmydays_" size="32"></smd-image></div>
    </div>
    <div class="content-col">
      <div class="title-row">
        <h4 class="title"><span class="job-title"></span><span class="suffix badge bg-secondary" hidden></span></h4>
      </div>
      <div class="meta-row">
        <span class="stream-title"></span>
        <button type="button" class="btn btn-primary job-view-btn" title="View job">View</button>
        <span class="badge tab-badge rounded-pill"></span>
      </div>
      <div class="description" hidden></div>
    </div>
  </div>
`;

class PmdTodayCard extends HTMLElement {
  static get observedAttributes() {
    return ['job-id', 'title', 'suffix', 'daily', 'done', 'checked',
      'stream-image', 'job-image', 'stream-title', 'tab', 'description', 'key-prefix'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    SmdStyles.adoptStyles(this.shadowRoot, [SmdStyles.hiddenSheet, SmdStyles.btnBadgeSheet, pmdTodayCardSheet]);
    this.shadowRoot.appendChild(pmdTodayCardTemplate.content.cloneNode(true));
  }

  connectedCallback() {
    const root = this.shadowRoot;
    root.querySelector('smd-checkbox.job-checkbox').addEventListener('change', (e) => {
      const checked = e.detail ? e.detail.checked : e.target.checked;
      this.setAttribute('checked', checked ? 'true' : 'false');
      this.dispatchEvent(new CustomEvent('pmd-today-toggle', {
        bubbles: true,
        composed: true,
        detail: { jobId: this.getAttribute('job-id') || '', checked }
      }));
    });
    root.querySelector('.job-view-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('pmd-today-view', {
        bubbles: true,
        composed: true,
        detail: {
          streamIdx: parseInt(this.getAttribute('stream-idx'), 10),
          jobIdx: parseInt(this.getAttribute('job-idx'), 10)
        }
      }));
    });
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  get checked() {
    return this.getAttribute('checked') === 'true';
  }

  set checked(value) {
    this.setAttribute('checked', value ? 'true' : 'false');
  }

  _render() {
    const root = this.shadowRoot;
    const keyPrefix = this.getAttribute('key-prefix') || 'planmydays_';

    root.querySelector('.job-title').textContent = this.getAttribute('title') || '';

    const suffixEl = root.querySelector('.suffix');
    const suffix = (this.getAttribute('suffix') || '').trim();
    if (suffix) {
      suffixEl.textContent = suffix;
      suffixEl.hidden = false;
    } else {
      suffixEl.hidden = true;
    }

    const repeat = root.querySelector('.daily-repeat-icon');
    if (this.hasAttribute('daily')) {
      repeat.setAttribute('image', 'bi:repeat-1');
      repeat.hidden = false;
    } else {
      repeat.removeAttribute('image');
      repeat.hidden = true;
    }

    const setThumb = (selector, name) => {
      const thumb = root.querySelector(selector);
      const sImg = thumb.querySelector('smd-image');
      sImg.setAttribute('key-prefix', keyPrefix);
      if (name) {
        sImg.setAttribute('image', name);
        thumb.hidden = false;
      } else {
        sImg.removeAttribute('image');
        thumb.hidden = true;
      }
    };
    setThumb('.stream-thumb', this.getAttribute('stream-image') || '');
    setThumb('.job-thumb', this.getAttribute('job-image') || '');

    root.querySelector('.stream-title').textContent = this.getAttribute('stream-title') || '';

    const tab = this.getAttribute('tab') || 'progress';
    const tabBadge = root.querySelector('.tab-badge');
    tabBadge.textContent = tab;
    tabBadge.className = 'badge tab-badge rounded-pill bg-' + (tab === 'progress' ? 'success' : 'info');

    const descEl = root.querySelector('.description');
    const description = this.getAttribute('description') || '';
    if (description) {
      descEl.textContent = description;
      descEl.hidden = false;
    } else {
      descEl.hidden = true;
    }

    const checkbox = root.querySelector('smd-checkbox.job-checkbox');
    checkbox.dataset.jobId = this.getAttribute('job-id') || '';
    checkbox.checked = this.getAttribute('checked') === 'true';
  }
}

customElements.define('pmd-today-card', PmdTodayCard);
