// <smd-image-dropdown> — shared dropdown picker for a list of named options,
// each optionally carrying an image rendered via <smd-image>. It is a generic
// selector any app can use (CountMyDays category filter, PlanMyDay job stream
// selector, ...).
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
// smdImageDropdownMenu) are stable so tests pierce the shadow root with plain
// selectors.
const smdImageDropdownSheet = SmdStyles.sheetFor(`
  :host { display: block; position: relative; min-width: 0; }
  .btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.375rem 0.75rem;
    background-color: transparent;
    color: var(--bs-body-color, #eee);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
    cursor: pointer;
    text-align: left;
  }
  :host([disabled]) .btn { opacity: 0.65; cursor: default; }
  .thumb {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 6px;
  }
  .thumb[hidden] { display: none !important; }
  .title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .caret { flex: 0 0 auto; opacity: 0.7; font-size: 0.75rem; }
  .menu {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    z-index: 20;
    margin: 0.125rem 0 0;
    padding: 0.25rem 0;
    list-style: none;
    background-color: var(--bs-body-bg, #222);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
    box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.25);
    max-height: 16rem;
    overflow-y: auto;
  }
  .menu[hidden] { display: none !important; }
  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    color: inherit;
    cursor: pointer;
    text-decoration: none;
  }
  .item .thumb {
    width: 1.5rem;
    height: 1.5rem;
  }
  .item .thumb.thumb-blank { border-color: transparent; }
  .item:hover { background-color: var(--bs-secondary-bg, #303030); }
  .item.active { background-color: var(--bs-primary, #0d6efd); color: var(--smd-primary-text, #fff); }
`);

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
    this.attachShadow({ mode: 'open' });
    SmdStyles.adoptStyles(this.shadowRoot, [SmdStyles.hiddenSheet, smdImageDropdownSheet]);
    this.shadowRoot.appendChild(smdImageDropdownTemplate.content.cloneNode(true));
    this._options = [];
    this._selected = "";
  }

  connectedCallback() {
    this.shadowRoot.querySelector('#smdImageDropdownBtn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.hasAttribute('disabled')) return;
      const menu = this.shadowRoot.querySelector('#smdImageDropdownMenu');
      if (menu) menu.hidden = !menu.hidden;
    });
    this._onDocClick = (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      if (path.indexOf(this) !== -1) return;
      const menu = this.shadowRoot.querySelector('#smdImageDropdownMenu');
      if (menu) menu.hidden = true;
    };
    document.addEventListener('click', this._onDocClick);
    this._render();
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._onDocClick);
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  set options(list) {
    this._options = Array.isArray(list) ? list : [];
    if (this.isConnected) this._render();
  }

  get options() {
    return this._options;
  }

  set selected(name) {
    this._selected = name == null ? "" : String(name);
    if (this.isConnected) this._render();
  }

  get selected() {
    return this._selected;
  }

  _render() {
    const root = this.shadowRoot;
    const keyPrefix = this.getAttribute('key-prefix') || smdImagePrefix();
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