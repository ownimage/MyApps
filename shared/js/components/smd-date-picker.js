// <smd-date-picker> — a read-only date field backed by flatpickr, generalised
// from the PlanMyDay "Sleep Until" picker. Renders a raw input holding the value
// in `format`, a human-readable display input (alt-format) and a Clear button.
//
// Host contract:
//   attributes: value              a date string in `format` (default ISO "Y-m-d")
//               format             raw value format (default "Y-m-d")
//               alt-format         display format (default "D j M Y")
//               placeholder        display placeholder (default "Pick a date")
//               first-day-of-week  flatpickr weekday index 0-6 (default 1=Mon)
//               no-clear           hide the Clear button
//               readonly           display-only: picker won't open, Clear disabled
//               disabled           controls disabled entirely
//   property:   .value             get/set date string (in `format`); setting
//                                  syncs the picker and emits the change event
//                                  (the value attribute only seeds it silently)
//   events:     smd-date-picker-change (composed, bubbles) detail = { value }
//
// Internal ids (smdDatePickerInput / smdDatePickerAlt / smdDatePickerClearBtn)
// are stable so tests pierce the shadow roots with plain selectors. The
// flatpickr calendar is appended to document.body so its stylesheet (loaded in
// the page) still applies.
const smdDatePickerSheet = SmdStyles.sheetFor(`
  :host { display: block; }
  .smd-date-picker { display: flex; align-items: center; gap: 0.5rem; }
  .form-control {
    display: block;
    width: 100%;
    min-width: 0;
    padding: 0.375rem 0.75rem;
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--bs-body-color, #eee);
    background-color: var(--bs-body-bg, #222);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
  }
`);

const smdDatePickerTemplate = document.createElement('template');
smdDatePickerTemplate.innerHTML = `
  <div class="smd-date-picker">
    <input type="text" class="form-control" id="smdDatePickerInput" placeholder="Pick a date" readonly="readonly">
    <button type="button" class="btn btn-danger btn-sm" id="smdDatePickerClearBtn" style="display:none">Clear</button>
  </div>
`;

class SmdDatePicker extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'format', 'alt-format', 'placeholder', 'first-day-of-week', 'readonly', 'disabled', 'no-clear'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    SmdStyles.adoptStyles(this.shadowRoot, [SmdStyles.hiddenSheet, SmdStyles.btnBadgeSheet, smdDatePickerSheet]);
    this.shadowRoot.appendChild(smdDatePickerTemplate.content.cloneNode(true));
    this._value = "";
    this._flatpickr = null;
  }

  connectedCallback() {
    this._bind();
    this._reinit();
    this._applyAttrs();
  }

  disconnectedCallback() {
    this._destroy();
    this._unbind();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'value') {
      this._value = newValue == null ? "" : String(newValue);
      this._sync();
    } else {
      this._applyAttrs();
    }
  }

  get value() {
    return this._value || "";
  }

  set value(v) {
    this._value = v == null ? "" : String(v);
    this._sync();
    this._emit();
  }

  _bind() {
    if (this._bound) return;
    this._bound = true;
    const btn = this.shadowRoot.getElementById('smdDatePickerClearBtn');
    this._onClearClick = () => {
      this._value = "";
      this._sync();
      this._emit();
    };
    btn.addEventListener('click', this._onClearClick);
  }

  _unbind() {
    if (!this._bound) return;
    this._bound = false;
    this.shadowRoot.getElementById('smdDatePickerClearBtn').removeEventListener('click', this._onClearClick);
    this._onClearClick = null;
  }

  _applyAttrs() {
    const readonly = this.hasAttribute('readonly');
    const disabled = this.hasAttribute('disabled');
    const placeholder = this.getAttribute('placeholder') || "Pick a date";
    const raw = this.shadowRoot.getElementById('smdDatePickerInput');
    raw.placeholder = placeholder;
    raw.readOnly = true;
    raw.disabled = disabled;
    const alt = this.shadowRoot.getElementById('smdDatePickerAlt');
    if (alt) {
      alt.placeholder = placeholder;
      alt.disabled = disabled;
    }
    const clearBtn = this.shadowRoot.getElementById('smdDatePickerClearBtn');
    clearBtn.disabled = disabled;
    clearBtn.style.display = (this.hasAttribute('no-clear') || readonly || !this._value) ? "none" : "";
    if (this._flatpickr) this._flatpickr.set('clickOpens', !readonly);
  }

  _config() {
    return {
      dateFormat: this.getAttribute('format') || "Y-m-d",
      altFormat: this.getAttribute('alt-format') || "D j M Y",
      altInput: true,
      altInputClass: "form-control",
      allowInput: false,
      static: false,
      monthSelectorType: "dropdown",
      disableMobile: true,
      appendTo: document.body,
      clickOpens: !this.hasAttribute('readonly'),
      locale: { firstDayOfWeek: parseInt(this.getAttribute('first-day-of-week') || "1", 10) },
      onChange: (_selectedDates, dateStr) => {
        this._value = dateStr || "";
        this._applyAttrs();
        this._emit();
      }
    };
  }

  _reinit() {
    if (this._flatpickr) this._destroy();
    if (typeof flatpickr === "undefined") return;
    const raw = this.shadowRoot.getElementById('smdDatePickerInput');
    this._flatpickr = flatpickr(raw, this._config());
    if (this._flatpickr && this._flatpickr.altInput) {
      this._flatpickr.altInput.id = "smdDatePickerAlt";
    }
  }

  _destroy() {
    if (this._flatpickr) {
      try { this._flatpickr.destroy(); } catch (e) {}
      this._flatpickr = null;
    }
  }

  _sync() {
    const fp = this._flatpickr;
    if (fp) {
      if (this._value) {
        const parsed = fp.parseDate(this._value, this._config().dateFormat);
        if (parsed) fp.setDate(parsed, false);
        else fp.setDate(this._value, false);
      } else {
        fp.clear();
      }
    } else {
      const raw = this.shadowRoot.getElementById('smdDatePickerInput');
      raw.value = this._value;
    }
    this._applyAttrs();
  }

  _emit() {
    this.dispatchEvent(new CustomEvent('smd-date-picker-change', {
      bubbles: true,
      composed: true,
      detail: { value: this._value }
    }));
  }
}

if (!window.customElements.get('smd-date-picker')) {
  window.customElements.define('smd-date-picker', SmdDatePicker);
}
window.SmdDatePicker = SmdDatePicker;