// <pmd-job-today-card> — a single job row on the Today list (light DOM).
//
// Owns its own layout (drag handle, completion checkbox + daily-repeat icon,
// stream/job thumbnails, title + suffix, stream title, View button, tab badge,
// description) and styling (PlanMyDay/css/styles.css, element-scoped). The host
// carries the light-DOM class the app/Sortable relies on (`today-drag-card`; the
// app sets it on the element), so the document theme styles the card chrome
// while the content lives in the light DOM with it.
//
// The body `font-size-*` / `compact` display settings reach the card through CSS
// custom properties (`--pmd-today-*`, set in PlanMyDay/css/styles.css) by
// inheritance.
//
// An `<smd-draghandle class="drag-handle" slot="drag-handle">` is appended by
// the consumer (Sortable needs a light-DOM handle); when none is provided the
// built-in fallback handle is shown. On connect the component moves a slotted
// handle into the handle cell and drops its own fallback.
//
// Attributes:
//   job-id        — job id (echoed on pmd-job-today-toggle, set as data-job-id on the checkbox)
//   stream-idx    — stream index (echoed on pmd-job-today-view)
//   job-idx       — job index (echoed on pmd-job-today-view)
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
//   pmd-job-today-toggle — detail { jobId, checked }
//   pmd-job-today-view   — detail { streamIdx, jobIdx }
//   pmd-job-today-delete — horizontal swipe LEFT past the threshold (detail { jobId, streamIdx, jobIdx });
//                      the card animates off before this fires — the app opens the delete confirm.
//   pmd-job-today-tomorrow — horizontal swipe RIGHT past the threshold (same detail); the card animates
//                      off before it fires — the app snoozes the job (sleepUntil = tomorrow).
//   Methods:
//   snapBackSwipe() — slide a swiped-out card back into place (used when a delete confirm is cancelled).
const pmdJobTodayCardTemplate = document.createElement('template');
pmdJobTodayCardTemplate.innerHTML = `
    <div class="card bg-dark text-white border-0">

        <div class="d-flex align-items-center justify-content-between gap-3 py-2 border rounded-lg">

            <!-- 1️⃣ Drag Handle -->
            <div class="d-flex align-items-center handle-col">
                <smd-draghandle class="drag-handle"></smd-draghandle>
            </div>

            <!-- 2️⃣ Checkbox + Repeat -->
            <div class="d-flex flex-column align-items-center flex-shrink-0" style="width: 70px;">
                <smd-checkbox class="job-checkbox"></smd-checkbox>
                <smd-image class="daily-repeat-icon" key-prefix="shared-" size="16" title="Every day" hidden></smd-image>
            </div>

            <!-- 3️⃣ Stream / Job / Stream Name -->
            <div class="d-flex flex-column flex-shrink-0 images-col" style="max-width: 80px;">
                <div class="d-flex">
                    <div class="thumb stream-thumb"><smd-image key-prefix="shared-"></smd-image></div>
                    <div class="thumb job-thumb"><smd-image key-prefix="shared-"></smd-image></div>
                </div>
                <span class="truncate mb-0 stream-title"></span>
            </div>

            <div class="d-flex flex-column flex-grow-1">

                <!-- FULL-WIDTH TITLE -->
                <h2 class="title"><span class="job-title"></span><smd-badge class="suffix" variant="secondary" hidden></smd-badge></h2>

                <!-- TWO-COLUMN ROW UNDER TITLE -->
                <div class="d-flex flex-grow-1">

                    <!-- LEFT COLUMN: Description hogs space -->
                    <div class="flex-grow-1 d-flex flex-column">
                        <div class="truncate-2-lines flex-grow-1 description" hidden></div>
                    </div>

                    <!-- RIGHT COLUMN: Badges + View aligned bottom -->
                    <div class="d-flex flex-column justify-content-end text-end">
                        <div class="d-flex align-items-center">
                            <smd-badge class="tab-badge" pill></smd-badge>
                            <button type="button" class="btn btn-primary job-view-btn" title="View job">View</button>
                        </div>
                    </div>

                </div>
            </div>
        </div>

    </div>
`;

class PmdJobTodayCard extends HTMLElement {
  static get observedAttributes() {
    return ['job-id', 'title', 'suffix', 'daily', 'done', 'checked',
      'stream-image', 'job-image', 'stream-title', 'tab', 'description', 'key-prefix'];
  }

  constructor() {
    super();
    this._bound = false;
  }

  connectedCallback() {
    if (!this._bound) {
      this._bound = true;
      this.appendChild(pmdJobTodayCardTemplate.content.cloneNode(true));
      this._adoptSlottedHandle();
      this.querySelector('smd-checkbox.job-checkbox').addEventListener('change', (e) => {
        const checked = e.detail ? e.detail.checked : e.target.checked;
        this.setAttribute('checked', checked ? 'true' : 'false');
        this.dispatchEvent(new CustomEvent('pmd-job-today-toggle', {
          bubbles: true,
          composed: true,
          detail: { jobId: this.getAttribute('job-id') || '', checked }
        }));
      });
      this.querySelector('.job-view-btn').addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('pmd-job-today-view', {
          bubbles: true,
          composed: true,
          detail: {
            streamIdx: parseInt(this.getAttribute('stream-idx'), 10),
            jobIdx: parseInt(this.getAttribute('job-idx'), 10)
          }
        }));
      });
      this._setupSwipe();
    }
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  // Move a consumer-provided drag handle (appended straight onto the host with
  // slot="drag-handle") into the handle cell and drop our built-in fallback.
  _adoptSlottedHandle() {
    const external = this.querySelector(':scope > smd-draghandle.drag-handle');
    if (!external) return;
    const fallback = this.querySelector('.handle-col > smd-draghandle.drag-handle');
    if (fallback) fallback.remove();
    external.removeAttribute('slot');
    const cell = this.querySelector('.handle-col');
    if (cell) cell.insertBefore(external, cell.firstChild);
  }

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
          this.dispatchEvent(new CustomEvent(dir === 'left' ? 'pmd-job-today-delete' : 'pmd-job-today-tomorrow', {
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
    const root = this;
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

if (!window.customElements.get('pmd-job-today-card')) {
  customElements.define('pmd-job-today-card', PmdJobTodayCard);
}
window.PmdJobTodayCard = PmdJobTodayCard;