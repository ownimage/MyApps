// <smd-image-dropdown> — shared dropdown picker for a list of named options,
// each optionally carrying an image rendered via <smd-image> (light DOM).
// Styles live in shared/css/styles.css. It is a generic selector any app can
// use (CountMyDays category filter, PlanMyDay job stream selector, ...).
//
// The host app sets the DATA (no DOM, so the host never builds the menu):
//   options  = [{ name, image }, ...] — image is OPTIONAL; options without one
//             render with a blank thumb placeholder so all rows stay aligned
//             (e.g. an "All" filter option or "No Category").
//   selected = the selected option's NAME (string; empty falls back to the
//             first option).
// and listens for `smd-image-dropdown-change` (detail = { name }) when an
// option is picked.
//
// Attributes:
//   key-prefix — smd-image storage prefix (default: SmdConfig.imagePrefix)
//   disabled   — view-only mode (button disabled, menu won't open)
//
// Internal ids (smdImageDropdownBtn / smdImageBtnIcon / smdImageBtnText /
// smdImageDropdownMenu) are stable so tests can target them with plain selectors.
const smdImageDropdownTemplate = document.createElement('template');
smdImageDropdownTemplate.innerHTML = `
  <button type="button" class="btn" id="smdImageDropdownBtn" aria-haspopup="listbox">
    <span class="thumb" id="smdImageBtnIcon" hidden><smd-image key-prefix="shared-"></smd-image></span>
    <span class="title" id="smdImageBtnText"></span>
    <span class="caret">&#9662;</span>
  </button>
  <ul class="menu" id="smdImageDropdownMenu" hidden></ul>
`;

class SmdImageDropdown extends HTMLElement {
  static get observedAttributes() {
    return ['key-prefix', 'disabled'];
  }

  constructor() {
    super();
    this._options = [];
    this._selected = "";
    this._bound = false;
    this._built = false;
    this._onDocClick = null;
  }

  _build() {
    if (this._built) return;
    this._built = true;
    this.appendChild(smdImageDropdownTemplate.content.cloneNode(true));
  }

  connectedCallback() {
    this._build();
    if (!this._bound) {
      this._bound = true;
      this.querySelector('#smdImageDropdownBtn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.hasAttribute('disabled')) return;
        const menu = this.querySelector('#smdImageDropdownMenu');
        if (menu) menu.hidden = !menu.hidden;
      });
      this._onDocClick = (e) => {
        if (e.composedPath && e.composedPath().indexOf(this) !== -1) return;
        const menu = this.querySelector('#smdImageDropdownMenu');
        if (menu) menu.hidden = true;
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

  attributeChangedCallback() {
    if (this._built) this._render();
  }

  set options(list) {
    this._options = Array.isArray(list) ? list : [];
    if (this._built) this._render();
  }

  get options() {
    return this._options;
  }

  set selected(name) {
    this._selected = name == null ? "" : String(name);
    if (this._built) this._render();
  }

  get selected() {
    return this._selected;
  }

  _render() {
    const root = this;
    const keyPrefix = this.getAttribute('key-prefix') || (typeof smdImagePrefix === "function" ? smdImagePrefix() : "");
    const disabled = this.hasAttribute('disabled');
    const current = this._options.find((o) => String(o.name) === String(this._selected))
      || this._options[0] || {};

    const btn = root.querySelector('#smdImageDropdownBtn');
    btn.disabled = disabled;

    const thumb = root.querySelector('#smdImageBtnIcon');
    const btnImg = root.querySelector('#smdImageBtnIcon smd-image');
    btnImg.setAttribute('key-prefix', keyPrefix);
    if (current.image) {
      btnImg.setAttribute('image', current.image);
      thumb.hidden = false;
    } else {
      btnImg.removeAttribute('image');
      thumb.hidden = true;
    }

    root.querySelector('#smdImageBtnText').textContent = current.name || '';

    const menu = root.querySelector('#smdImageDropdownMenu');
    menu.innerHTML = '';
    this._options.forEach((o) => {
      const name = String(o.name);
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'item dropdown-item' + (name === String(this._selected) ? ' active' : '');
      a.setAttribute('data-name', name);
      const itemThumb = document.createElement('span');
      itemThumb.className = 'thumb';
      if (o.image) {
        const img = document.createElement('smd-image');
        img.setAttribute('key-prefix', keyPrefix);
        img.setAttribute('image', o.image);
        itemThumb.appendChild(img);
      } else {
        itemThumb.classList.add('thumb-blank');
      }
      a.appendChild(itemThumb);
      const itemTitle = document.createElement('span');
      itemTitle.className = 'title';
      itemTitle.textContent = o.name || '';
      a.appendChild(itemTitle);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._selected = name;
        menu.hidden = true;
        this._render();
        this.dispatchEvent(new CustomEvent('smd-image-dropdown-change', {
          bubbles: true,
          composed: true,
          detail: { name: name }
        }));
      });
      li.appendChild(a);
      menu.appendChild(li);
    });
  }
}

if (!window.customElements.get('smd-image-dropdown')) {
  window.customElements.define('smd-image-dropdown', SmdImageDropdown);
}
window.SmdImageDropdown = SmdImageDropdown;