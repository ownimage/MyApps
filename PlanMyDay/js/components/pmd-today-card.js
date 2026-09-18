// <pmd-today-card> — a single job row on the Today list.
//
// Owns its own layout (drag handle, completion checkbox + daily-repeat icon,
// stream/job thumbnails, title + suffix, stream title, View button, tab badge,
// description) and styling. The host carries the light-DOM class the app/Sortable
// relies on (`today-drag-card`; the app sets it on the element), so the document
// theme styles the card chrome while the shadow root holds the content.
//
// The body `font-size-*` / `compact` display settings reach the card through CSS
// custom properties (`--pmd-today-*`, set in PlanMyDay/css/styles.css) because
// `:host-context()` is NOT supported by WebKit/Safari (iPhone).
//
// An `<smd-draghandle class="drag-handle" slot="drag-handle">` is slotted in by
// the consumer (Sortable needs a light-DOM handle); when none is provided the
// built-in fallback handle is shown.
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
//   stream-title  — stream title shown under the stream thumbnail, on the badge row
//   tab           — "progress" (success badge) | "maintenance" (info badge)
//   description   — optional description line
//   key-prefix    — smd-image storage prefix (default: SmdConfig.imagePrefix)
//
// Events:
//   pmd-today-toggle — detail { jobId, checked }
//   pmd-today-view   — detail { streamIdx, jobIdx }
//   pmd-today-delete — horizontal swipe LEFT past the threshold (detail { jobId, streamIdx, jobIdx });
//                      the card animates off before this fires — the app opens the delete confirm.
//   pmd-today-tomorrow — horizontal swipe RIGHT past the threshold (same detail); the card animates
//                      off before it fires — the app snoozes the job (sleepUntil = tomorrow).
//   Methods:
//   snapBackSwipe() — slide a swiped-out card back into place (used when a delete confirm is cancelled).
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
    padding: var(--pmd-today-padding, 0.5rem 0.75rem);
    margin-bottom: var(--pmd-today-margin, 0.5rem);
    /* let the browser keep vertical scrolling while the card claims horizontal
       gestures for the swipe actions; Sortable's own preventDefault on the
       .drag-handle still wins there. */
    touch-action: pan-y;
  }
  :host([hidden]) { display: none !important; }
  :host([done]) { opacity: 0.5; }
  :host([done]) .title { text-decoration: line-through; }

  .row {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 0.75rem;
  }
  .row > * {
    padding-top: var(--pmd-today-cell-padding, 0);
    padding-bottom: var(--pmd-today-cell-padding, 0);
  }
  .handle-col {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
  }

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
    align-self: flex-start;
  }
  .thumb {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .content-col { flex: 1 1 auto; min-width: 0; }
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: var(--pmd-today-title-margin, 0.25rem);
  }
  .title {
    margin: 0;
    font-size: var(--pmd-today-title-size, var(--smd-type-h1, 1.5rem));
    font-weight: 800;
    min-width: 0;
  }
  .suffix { margin-left: 0.25rem; }

  /* stream name + View + badge share one line under the title; long badges
     wrap to a second line rather than truncating the stream name */
  .meta-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.15rem 0.4rem;
  }
  .stream-title {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--smd-type-p, 0.875em);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .job-view-btn {
    flex: 0 0 auto;
    padding: 0.25em 0.5em;
    font-size: var(--smd-type-badge, 0.7em);
    line-height: 1;
    font-weight: 700;
  }
  .tab-badge {
    flex: 0 0 auto;
    padding: 0.25em 0.5em;
    font-size: var(--smd-type-badge, 0.7em);
  }
  .description {
    margin-top: var(--pmd-today-description-margin, 0.25rem);
    font-size: var(--smd-type-p, 0.875em);
    color: var(--bs-secondary-color, #aaa);
  }
`);

const pmdTodayCardTemplate = document.createElement('template');
pmdTodayCardTemplate.innerHTML = `
  <div class="row">
    <div class="handle-col">
      <slot name="drag-handle"><smd-draghandle class="drag-handle"></smd-draghandle></slot>
      <div class="check-col">
        <div class="check-row"><smd-checkbox class="job-checkbox"></smd-checkbox></div>
        <smd-image class="daily-repeat-icon" key-prefix="shared-" size="16" title="Every day" hidden></smd-image>
      </div>
    </div>
    <div class="images-col">
      <div class="thumb stream-thumb"><smd-image key-prefix="shared-"></smd-image></div>
      <div class="thumb job-thumb"><smd-image key-prefix="shared-"></smd-image></div>
    </div>
    <div class="content-col">
      <div class="title-row">
        <h4 class="title"><span class="job-title"></span><smd-badge class="suffix" variant="secondary" hidden></smd-badge></h4>
      </div>
      <div class="meta-row">
        <span class="stream-title"></span>
        <button type="button" class="btn btn-primary job-view-btn" title="View job">View</button>
        <smd-badge class="tab-badge" pill></smd-badge>
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
    this._setupSwipe();
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  // Horizontal swipe gesture on the card body (pointer events = mouse + touch).
  // Left past the threshold -> pmd-today-delete, right past the threshold ->
  // pmd-today-tomorrow. The card follows the pointer with resistance and fades,
  // slides fully off past the threshold, then emits the event. Vertical pans are
  // left to the browser (touch-action: pan-y) and a *small* horizontal drag starts
  // no gesture, so taps on the checkbox/View button and Sortable'd drag-handle
  // drags still work.
  _setupSwipe() {
    if (this._swipeBound) return;
    this._swipeBound = true;
    const root = this;
    let s = null;

    const thresholdFor = () => {
      const w = root.offsetWidth || 320;
      return Math.min(120, Math.max(60, w * 0.25));
    };

    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.composedPath().some((el) => el && el.classList && el.classList.contains('drag-handle'))) return;
      s = { id: e.pointerId, startX: e.clientX, startY: e.clientY, active: false };
    });

    root.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (!s.active) {
        if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy)) return;
        s.active = true;
        this._suppressClick = true;
        try { root.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer in tests */ }
      }
      s.dx = dx;
      const th = thresholdFor();
      root.style.transition = 'none';
      root.style.transform = 'translateX(' + dx + 'px)';
      root.style.opacity = String(1 - 0.75 * Math.max(0, Math.min(1, Math.abs(dx) / th)));
    });

    root.addEventListener('pointerup', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = s.dx || 0;
      const th = thresholdFor();
      const dir = dx <= -th ? 'left' : dx >= th ? 'right' : null;
      root.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
      if (dir) {
        const w = root.offsetWidth || 320;
        root.style.transform = 'translateX(' + (dir === 'left' ? -(w + 40) : (w + 40)) + 'px)';
        root.style.opacity = '0';
        this._pendingSwipe = dir;
        setTimeout(() => {
          if (this._pendingSwipe !== dir) return;
          this._pendingSwipe = null;
          this.dispatchEvent(new CustomEvent(dir === 'left' ? 'pmd-today-delete' : 'pmd-today-tomorrow', {
            bubbles: true,
            composed: true,
            detail: {
              jobId: this.getAttribute('job-id') || '',
              streamIdx: parseInt(this.getAttribute('stream-idx'), 10),
              jobIdx: parseInt(this.getAttribute('job-idx'), 10)
            }
          }));
        }, 200);
      } else {
        root.style.transform = 'translateX(0)';
        root.style.opacity = '1';
      }
      s = null;
      if (this._suppressClick) {
        setTimeout(() => { this._suppressClick = false; }, 500);
      }
    });

    root.addEventListener('pointercancel', () => {
      if (s) {
        s = null;
        this.snapBackSwipe();
      }
    });

    // consume the (late) click that a completed swipe would otherwise deliver to
    // whatever was under the finger — e.g. toggling the checkbox or opening View.
    root.addEventListener('click', (e) => {
      if (!this._suppressClick) return;
      e.stopPropagation();
      e.preventDefault();
      this._suppressClick = false;
    }, true);
  }

  // Slide a swiped-out card back into place (cancelled delete confirm, or a
  // pointercancel mid-swipe).
  snapBackSwipe() {
    this._pendingSwipe = null;
    this.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
    this.style.transform = 'translateX(0)';
    this.style.opacity = '1';
  }

  get checked() {
    return this.getAttribute('checked') === 'true';
  }

  set checked(value) {
    this.setAttribute('checked', value ? 'true' : 'false');
  }

  _render() {
    const root = this.shadowRoot;
    const keyPrefix = this.getAttribute('key-prefix') || smdImagePrefix();

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
      // The thumb wrapper always stays in place (even with no image) so the
      // job thumbnail keeps its slot and job images line up across cards.
      if (name) {
        sImg.setAttribute('image', name);
      } else {
        sImg.removeAttribute('image');
      }
    };
    setThumb('.stream-thumb', this.getAttribute('stream-image') || '');
    setThumb('.job-thumb', this.getAttribute('job-image') || '');

    root.querySelector('.stream-title').textContent = this.getAttribute('stream-title') || '';

    const tab = this.getAttribute('tab') || 'progress';
    const tabBadge = root.querySelector('.tab-badge');
    tabBadge.textContent = tab;
    tabBadge.setAttribute('variant', tab === 'progress' ? 'success' : 'info');

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
