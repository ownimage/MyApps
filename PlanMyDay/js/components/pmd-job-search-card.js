// <pmd-job-search-card> — a single job row on the Search Jobs list (light DOM;
// the host carries bootstrap `card p-2 mb-2`).
//
// Takes the WHOLE job object (and the whole stream object it belongs to) as
// one attribute each, and unpicks the display fields itself — so changing what
// a search result shows only touches this component, never the callers.
//
// Attributes:
//   job          — the WHOLE job JSON (id, title, image, suffix, dayType, mod,
//                  schedule, time, sleepUntil, waitFor, active…). Derived here.
//   stream       — the WHOLE stream JSON (title, image, tab…). Derived here.
//   stream-idx   — stream index (echoed on pmd-job-edit / pmd-job-toggle-active)
//   job-idx      — job index (echoed on those events)
//
// .job / .stream are also exposed as JS properties (getter parses the matching
// attribute; setter JSON-stringifies into it), so callers can pass objects
// without escaping.
//
// Events:
//   pmd-job-edit         — detail { streamIdx, jobIdx }
//   pmd-job-toggle-active — detail { streamIdx, jobIdx, checked }
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
    return ['stream-idx', 'job-idx', 'job', 'stream'];
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
    const job = this.job;
    const stream = this.stream;

    root.querySelector('.job-title').textContent = job.title || '';

    const setThumb = (thumbCls, src) => {
      const thumb = root.querySelector(thumbCls);
      const sImg = thumb.querySelector('smd-image');
      // The thumb wrapper always stays in place (even with no image) so job
      // titles line up in the results list.
      if (src) {
        sImg.setAttribute('image', src);
      } else {
        sImg.removeAttribute('image');
      }
    };
    setThumb('.stream-thumb', stream.image || '');
    setThumb('.job-thumb', job.image || '');

    const suffixEl = root.querySelector('.suffix');
    const suffix = this._jobSuffix(job).trim();
    if (suffix) {
      suffixEl.textContent = suffix;
      suffixEl.hidden = false;
    } else {
      suffixEl.hidden = true;
    }

    root.querySelector('.stream-title').textContent = stream.title || '';

    const tab = stream.tab || 'progress';
    const tabBadge = root.querySelector('.tab-badge');
    tabBadge.textContent = tab;
    tabBadge.setAttribute('variant', tab === 'progress' ? 'success' : 'info');

    const extraEl = root.querySelector('.extra');
    const extra = (job.sleepUntil && job.sleepUntil.trim())
      ? 'Sleep: ' + this._formatDate(job.sleepUntil)
      : (job.waitFor && job.waitFor.trim())
        ? 'Wait: ' + job.waitFor.trim()
        : '';
    if (extra) {
      extraEl.textContent = extra;
      extraEl.hidden = false;
    } else {
      extraEl.hidden = true;
    }

    root.querySelector('.schedule').textContent = this._scheduleText(job.schedule);

    const timeEl = root.querySelector('.time');
    const time = (job.time && job.time.trim()) ? job.time.trim() : '';
    if (time) {
      timeEl.textContent = time;
      timeEl.hidden = false;
    } else {
      timeEl.hidden = true;
    }

    root.querySelector('smd-checkbox.active-toggle').checked = job.active !== false;
  }

  _today() {
    const dev = localStorage.getItem('devToday');
    return dev ? new Date(dev + 'T00:00:00') : new Date();
  }

  _formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return dayNames[d.getDay()] + ' ' + d.getDate() + ' ' + monthNames[d.getMonth()] + ' ' + d.getFullYear();
  }

  // Ported from PlanMyDay getScheduleText() so the job-derived schedule text
  // lives entirely in the component (changing it never touches the callers).
  _scheduleText(schedule) {
    if (!schedule) return 'Every day';
    const s = schedule.type || 'daily';
    if (s === 'daily') return 'Every day';
    if (s === 'weekdays') return 'Weekdays (Mon\u2013Fri)';
    if (s === 'weekends') return 'Weekends (Sat\u2013Sun)';
    if (s === 'days') {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return (schedule.days || []).map(d => names[d]).join(', ');
    }
    if (s === 'monthly') return (schedule.date || 1) + 'th of every month';
    if (s === 'ndays') return 'Every ' + (schedule.interval || 2) + ' day(s)';
    return 'Every day';
  }

  // Ported from PlanMyDay getJobSuffix() so the job-derived suffix display
  // lives entirely in the component (changing it never touches the callers).
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
}

customElements.define('pmd-job-search-card', PmdJobSearchCard);