// <pmd-job-today-card> — a single job row on the Today list (light DOM).
//
// Naming: pmd = PlanMyDay, job = the data it displays. The card takes the WHOLE
// job object (and the whole stream object it belongs to) as one attribute each,
// and unpicks the display fields itself — so changing what a job shows (e.g. a
// future task count) only touches this component, never the callers.
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
//   job            — the WHOLE job JSON (id, title, image, description, suffix,
//                    dayType, mod, schedule…). Display fields are derived here.
//   stream         — the WHOLE stream JSON (title, image, tab…). Derived here.
//   stream-idx     — stream index (echoed on pmd-job-today-view)
//   job-idx        — job index (echoed on pmd-job-today-view)
//   done           — presence dims the card + strikes through the title
//   checked        — checkbox state ("true"/"false")
//   key-prefix     — smd-image storage prefix (default: SmdConfig.imagePrefix)
//
// .job / .stream are also exposed as JS properties (getter parses the matching
// attribute; setter JSON-stringifies into it), so callers can pass objects
// without escaping.
//
// Events:
//   pmd-job-today-toggle — detail { jobId, checked }
//   pmd-job-today-view   — detail { streamIdx, jobIdx }
//   pmd-job-today-delete — horizontal swipe LEFT past the threshold (detail { jobId, streamIdx, jobIdx });
//                          the card animates off before this fires — the app opens the delete confirm.
//   pmd-job-today-tomorrow — horizontal swipe RIGHT past the threshold (same detail); the card animates
//                          off before it fires — the app snoozes the job (sleepUntil = tomorrow).
//   Methods:
//   snapBackSwipe() — slide a swiped-out card back into place (used when a delete confirm is cancelled).
const pmdJobTodayCardTemplate = document.createElement('template');
pmdJobTodayCardTemplate.innerHTML = `
  <div class="row">
    <div class="handle-col">
      <smd-draghandle class="drag-handle"></smd-draghandle>
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
        <h2 class="title"><span class="job-title"></span><smd-badge class="suffix" variant="secondary" hidden></smd-badge></h2>
      </div>
      <div class="meta-row">
        <span class="stream-title"></span>
        <smd-badge class="tab-badge" pill></smd-badge>
        <button type="button" class="btn btn-primary job-view-btn" title="View job">View</button>
      </div>
      <div class="description" hidden></div>
    </div>
  </div>
`;

class PmdJobTodayCard extends HTMLElement {
  static get observedAttributes() {
    return ['job', 'stream', 'stream-idx', 'job-idx', 'done', 'checked', 'key-prefix'];
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
          detail: { jobId: this._jobId(), checked }
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
    // Chromium connects elements DURING an innerHTML parse into an already
    // connected host, so attributeChangedCallback can fire before our
    // connectedCallback has stamped the template. Only render once _bound.
    if (this.isConnected && this._bound) this._render();
  }

  get job() {
    return this._parseAttr('job');
  }

  set job(value) {
    if (value === undefined || value === null) this.removeAttribute('job');
    else this.setAttribute('job', JSON.stringify(value));
  }

  get stream() {
    return this._parseAttr('stream');
  }

  set stream(value) {
    if (value === undefined || value === null) this.removeAttribute('stream');
    else this.setAttribute('stream', JSON.stringify(value));
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

  _parseAttr(name) {
    const raw = this.getAttribute(name);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  _jobId() {
    return this.job.id || '';
  }

  _today() {
    const dev = localStorage.getItem('devToday');
    return dev ? new Date(dev + 'T00:00:00') : new Date();
  }

  // Ported from PlanMyDay getJobSuffix() so the job-derived suffix display lives
  // entirely in the component (changing it never touches the callers).
  _jobSuffix(job) {
    if (!job || !job.suffix) return '';
    const today = this._today();
    const dayType = job.dayType || 'dayOfYear';
    let dayNum;

    if (dayType === 'dayOfWeek') {
      dayNum = today.getDay();
      const mondaySetting = localStorage.getItem(smdKey('monday')) || '1';
      if (mondaySetting === '1') {
        dayNum = dayNum === 0 ? 7 : dayNum;
      } else {
        dayNum = dayNum === 0 ? 6 : dayNum - 1;
      }
    } else if (dayType === 'dayOfMonth') {
      dayNum = today.getDate();
    } else {
      const startOfYear = new Date(today.getFullYear(), 0, 0);
      dayNum = Math.floor((today - startOfYear) / 86400000);
      const jan1Setting = localStorage.getItem(smdKey('jan1')) || '0';
      if (jan1Setting === '0') {
        dayNum -= 1;
      }
    }

    if (job.mod && job.mod !== '') {
      const modVal = parseInt(job.mod, 10);
      if (modVal > 0) {
        dayNum = dayNum % modVal;
      }
    }

    const suffixStart = localStorage.getItem(smdKey('suffixStart')) || '0';
    if (suffixStart === '1') dayNum += 1;

    return ' (' + dayNum + ')';
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
              jobId: this._jobId(),
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
    const job = this.job;
    const stream = this.stream;

    root.querySelector('.job-title').textContent = job.title || '';

    const suffixEl = root.querySelector('.suffix');
    const suffix = this._jobSuffix(job).trim();
    if (suffix) {
      suffixEl.textContent = suffix;
      suffixEl.hidden = false;
    } else {
      suffixEl.hidden = true;
    }

    const repeat = root.querySelector('.daily-repeat-icon');
    const scheduleType = job.schedule && job.schedule.type ? job.schedule.type : 'daily';
    if (scheduleType === 'daily') {
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
    setThumb('.stream-thumb', stream.image || '');
    setThumb('.job-thumb', job.image || '');

    root.querySelector('.stream-title').textContent = stream.title || '';

    const tab = stream.tab || 'progress';
    const tabBadge = root.querySelector('.tab-badge');
    tabBadge.textContent = tab;
    tabBadge.setAttribute('variant', tab === 'progress' ? 'success' : 'info');

    const descEl = root.querySelector('.description');
    const description = job.description || '';
    if (description) {
      descEl.textContent = description;
      descEl.hidden = false;
    } else {
      descEl.hidden = true;
    }

    const checkbox = root.querySelector('smd-checkbox.job-checkbox');
    checkbox.dataset.jobId = job.id || '';
    checkbox.checked = this.getAttribute('checked') === 'true';
  }
}

if (!window.customElements.get('pmd-job-today-card')) {
  customElements.define('pmd-job-today-card', PmdJobTodayCard);
}
window.PmdJobTodayCard = PmdJobTodayCard;