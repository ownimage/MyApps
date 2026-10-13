// <smd-select> — text-only custom dropdown with the SHAPE of a Bootstrap
// <select> (it reuses `.form-select` on its button) but a THEMED option list:
// a native <select>'s open list is rendered by the browser/OS (Windows Chrome =
// the OS accent blue) and cannot be styled from CSS, so the hovered/selected row
// here uses the theme primary.
//
// Light DOM (layout is applied by the component; theme colours live in
// shared/css/styles.css). Data-driven, like <smd-image-dropdown>:
//   options = [{ value, label }, ...]
//   value   = the selected option's value (string)
// and it dispatches `smd-select-change` ({ value, label }) when the user picks.
//
// Attributes: `disabled`; `value` (reflected so tests/labels can read it).
// Stable hooks for tests: `.smd-select-btn`, `.smd-select-item` (each carries
// `data-value`), `.smd-select-item.active` (the selected row).
const smdSelectTemplate = document.createElement('template');
smdSelectTemplate.innerHTML = '<button type="button" class="form-select smd-select-btn" aria-haspopup="listbox" aria-expanded="false"><span class="smd-select-label"></span></button><ul class="smd-select-menu list-unstyled rounded shadow-sm mb-0" role="listbox" hidden></ul>';

class SmdSelect extends HTMLElement {
  static get observedAttributes() {
    return ['disabled', 'value'];
  }

  constructor() {
    super();
    this._options = [];
    this._value = "";
    this._built = false;
    this._bound = false;
    this._onDocClick = null;
  }

  get options() {
    return this._options;
  }

  set options(list) {
    this._options = Array.isArray(list) ? list.slice() : [];
    if (this._built) this._render();
  }

  get value() {
    return this._value;
  }

  set value(v) {
    this._value = v == null ? "" : String(v);
    if (this._built) this._render();
  }

  get disabled() {
    return this.hasAttribute("disabled");
  }

  set disabled(v) {
    if (v) this.setAttribute("disabled", "");
    else this.removeAttribute("disabled");
  }

  connectedCallback() {
    if (typeof injectSmdComponentStyle === "function") {
      injectSmdComponentStyle("smd-select-layout", `
        smd-select { display: block; width: 100%; position: relative; }
        smd-select.w-auto { display: inline-block; }
        smd-select .smd-select-btn { display: block; width: 100%; text-align: left; cursor: pointer; }
        smd-select .smd-select-menu { position: absolute; left: 0; right: 0; top: 100%; z-index: 1030; max-height: 16rem; overflow-y: auto; }
        smd-select .smd-select-item { display: block; cursor: pointer; }
      `);
    }
    // The control SHAPE comes from `.form-select` on the inner button, so drop a
    // `form-select`/`form-select-sm` left on the host by a <select> -> <smd-select>
    // tag swap (otherwise the host double-styles). `.w-auto` is kept; a small
    // control (`.form-select-sm` or size="small") moves to the button.
    this._small = this.classList.contains("form-select-sm") || this.getAttribute("size") === "small";
    this.classList.remove("form-select", "form-select-sm");
    this._readOptionChildren();
    this._build();
    if (!this._bound) {
      this._bound = true;
      const btn = this.querySelector('.smd-select-btn');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.hasAttribute('disabled')) return;
        this._toggleMenu();
      });
      this.addEventListener('keydown', (e) => this._onKeydown(e));
      this._onDocClick = (e) => {
        if (e.composedPath && e.composedPath().indexOf(this) !== -1) return;
        this._closeMenu();
      };
      document.addEventListener('click', this._onDocClick);
    }
    this._render();
  }

  disconnectedCallback() {
    if (this._bound) {
      this._bound = false;
      document.removeEventListener('click', this._onDocClick);
      this._onDocClick = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'value' && newValue != null) this._value = String(newValue);
    if (this._built) this._render();
  }

  _build() {
    if (this._built) return;
    this._built = true;
    // The declarative `<option>` children (already read + removed) leave their
    // inter-tag WHITESPACE text nodes behind, which render as a stray line/space
    // in the host. Clear everything, then mount the button + menu.
    this.textContent = "";
    this.appendChild(smdSelectTemplate.content.cloneNode(true));
  }

  // Declarative form: `<smd-select><option value="x">Label</option>…</smd-select>`
  // is read into `options` on connect, so a JS-built `<select>…</select>` only
  // needs the TAG swapped (the `<option>` children are then removed).
  _readOptionChildren() {
    const opts = Array.from(this.querySelectorAll(":scope > option"));
    if (!opts.length) return;
    const valueOf = (o) => (o.getAttribute("value") != null ? o.getAttribute("value") : o.textContent.trim());
    if (!this._options.length) {
      this._options = opts.map((o) => ({ value: valueOf(o), label: o.textContent.trim() }));
    }
    const sel = opts.find((o) => o.hasAttribute("selected"));
    if (sel && !this._value) this._value = valueOf(sel);
    opts.forEach((o) => o.remove());
  }

  // Minimal keyboard support: Escape closes, Arrow/Enter opens and moves through
  // the options (the rows are focusable <a>s, so Enter activates natively).
  _onKeydown(e) {
    const btn = this.querySelector('.smd-select-btn');
    const menu = this.querySelector('.smd-select-menu');
    if (!btn || !menu) return;
    const items = Array.from(this.querySelectorAll('.smd-select-item'));
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      if (!menu.hidden) { e.preventDefault(); this._closeMenu(); btn.focus(); }
      return;
    }
    const nav = e.key === 'ArrowDown' || e.key === 'ArrowUp';
    if ((nav || e.key === 'Enter' || e.key === ' ') && menu.hidden) {
      e.preventDefault();
      this._toggleMenu();
      const active = items.find((i) => i.classList.contains('active')) || items[0];
      if (active) active.focus();
      return;
    }
    if (nav && idx >= 0) {
      e.preventDefault();
      const next = e.key === 'ArrowUp' ? (idx <= 0 ? items.length - 1 : idx - 1) : (idx >= items.length - 1 ? 0 : idx + 1);
      items[next].focus();
    }
  }

  _toggleMenu() {
    const menu = this.querySelector('.smd-select-menu');
    const btn = this.querySelector('.smd-select-btn');
    if (!menu) return;
    menu.hidden = !menu.hidden;
    if (btn) btn.setAttribute('aria-expanded', String(!menu.hidden));
    // When the menu opens UNDER the pointer, the item under it gets no
    // `mouseenter`; highlight whichever row the pointer is already over.
    if (!menu.hidden) requestAnimationFrame(() => this._syncHoverFromPointer());
  }

  _syncHoverFromPointer() {
    this.querySelectorAll('.smd-select-item').forEach((item) => {
      const over = item.matches(':hover');
      if (over) item.classList.add('text-bg-primary');
      else if (!item.classList.contains('active')) item.classList.remove('text-bg-primary');
    });
  }

  _closeMenu() {
    const menu = this.querySelector('.smd-select-menu');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    const btn = this.querySelector('.smd-select-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  _render() {
    const btn = this.querySelector('.smd-select-btn');
    const label = this.querySelector('.smd-select-label');
    const menu = this.querySelector('.smd-select-menu');
    if (!btn || !label || !menu) return;

    btn.disabled = this.hasAttribute('disabled');
    btn.classList.toggle("form-select-sm", !!this._small);

    if (!this._value && this._options.length) this._value = String(this._options[0].value);
    const current = this._options.find((o) => String(o.value) === String(this._value)) || this._options[0] || null;
    label.textContent = current ? current.label : '';
    // Reflect the value for tests/labels (not an event source; guarded to avoid
    // an attributeChangedCallback loop).
    const reflected = current ? String(current.value) : '';
    if (this.getAttribute('value') !== reflected) this.setAttribute('value', reflected);

    menu.innerHTML = '';
    this._options.forEach((o) => {
      const value = String(o.value);
      const selected = value === String(this._value);
      const li = document.createElement('li');
      const item = document.createElement('a');
      item.href = '#';
      item.className = 'smd-select-item' + (selected ? ' active text-bg-primary' : '');
      item.setAttribute('data-value', value);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(selected));
      item.textContent = o.label;
      // Hover and selected both use the theme PRIMARY BUTTON variant: Bootstrap's
      // `.text-bg-primary` supplies the surface AND its designed contrast text
      // (so brite's light-green primary keeps BLACK text; a plain `--bs-primary`
      // + white would be unreadable there).
      item.addEventListener('mouseenter', () => item.classList.add('text-bg-primary'));
      item.addEventListener('mouseleave', () => {
        if (!item.classList.contains('active')) item.classList.remove('text-bg-primary');
      });
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._value = value;
        this._closeMenu();
        this._render();
        this.dispatchEvent(new CustomEvent('smd-select-change', {
          bubbles: true,
          composed: true,
          detail: { value: value, label: o.label }
        }));
        // Also emit a native `change` so existing `onchange="fn(this.value)"`
        // markup keeps working after a <select> -> <smd-select> tag swap.
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      });
      li.appendChild(item);
      menu.appendChild(li);
    });
  }
}

if (!window.customElements.get('smd-select')) {
  window.customElements.define('smd-select', SmdSelect);
}
window.SmdSelect = SmdSelect;
