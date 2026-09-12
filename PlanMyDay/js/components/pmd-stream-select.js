// <pmd-stream-select> — the job-edit stream dropdown.
//
// Renders the selected stream's image (via <smd-image>) + title on a button, and
// a dropdown listing every stream with its image. Images have no fixed size, so
// they follow the shared <smd-image> size (Settings/Display/Image size).
//
// The host app sets the DATA (no DOM): `streams` = [{ title, image }, ...] and
// `selected` = index; it listens for `pmd-stream-select-change` (detail =
// { streamIdx }) when a stream is picked.
//
// Attributes:
//   key-prefix — smd-image storage prefix (default "planmydays_")
//   disabled   — disables the control (view-only mode)
const pmdStreamSelectSheet = SmdStyles.sheetFor(`
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
  .item:hover { background-color: var(--bs-secondary-bg, #303030); }
  .item.active { background-color: var(--bs-primary, #0d6efd); color: var(--smd-primary-text, #fff); }
`);

const pmdStreamSelectTemplate = document.createElement('template');
pmdStreamSelectTemplate.innerHTML = `
  <button type="button" class="btn" id="jobStreamDropdownBtn">
    <span class="thumb" id="jobStreamBtnIcon"><smd-image key-prefix="planmydays_"></smd-image></span>
    <span class="title" id="jobStreamBtnText"></span>
    <span class="caret">&#9662;</span>
  </button>
  <ul class="menu" id="jobStreamDropdownMenu" hidden></ul>
`;

class PmdStreamSelect extends HTMLElement {
  static get observedAttributes() {
    return ['key-prefix', 'disabled'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    SmdStyles.adoptStyles(this.shadowRoot, [SmdStyles.hiddenSheet, pmdStreamSelectSheet]);
    this.shadowRoot.appendChild(pmdStreamSelectTemplate.content.cloneNode(true));
    this._streams = [];
    this._selected = -1;
  }

  connectedCallback() {
    this.shadowRoot.querySelector('#jobStreamDropdownBtn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.hasAttribute('disabled')) return;
      const menu = this.shadowRoot.querySelector('#jobStreamDropdownMenu');
      if (menu) menu.hidden = !menu.hidden;
    });
    this._onDocClick = (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      if (path.indexOf(this) !== -1) return;
      const menu = this.shadowRoot.querySelector('#jobStreamDropdownMenu');
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

  set streams(list) {
    this._streams = Array.isArray(list) ? list : [];
    if (this.isConnected) this._render();
  }

  get streams() {
    return this._streams;
  }

  set selected(idx) {
    const n = parseInt(idx, 10);
    this._selected = isNaN(n) ? -1 : n;
    if (this.isConnected) this._render();
  }

  get selected() {
    return this._selected;
  }

  _render() {
    const root = this.shadowRoot;
    const keyPrefix = this.getAttribute('key-prefix') || 'planmydays_';
    const disabled = this.hasAttribute('disabled');
    const selected = this._selected >= 0 ? this._selected : 0;
    const current = this._streams[selected] || {};

    const btn = root.querySelector('#jobStreamDropdownBtn');
    btn.disabled = disabled;

    const btnImg = root.querySelector('#jobStreamBtnIcon smd-image');
    btnImg.setAttribute('key-prefix', keyPrefix);
    if (current.image) btnImg.setAttribute('image', current.image);
    else btnImg.removeAttribute('image');

    root.querySelector('#jobStreamBtnText').textContent = current.title || '';

    const menu = root.querySelector('#jobStreamDropdownMenu');
    menu.innerHTML = '';
    this._streams.forEach((s, i) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'item dropdown-item' + (i === selected ? ' active' : '');
      a.setAttribute('data-stream-idx', String(i));
      const thumb = document.createElement('span');
      thumb.className = 'thumb';
      const img = document.createElement('smd-image');
      img.setAttribute('key-prefix', keyPrefix);
      if (s.image) img.setAttribute('image', s.image);
      thumb.appendChild(img);
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = s.title || '';
      a.appendChild(thumb);
      a.appendChild(title);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._selected = i;
        menu.hidden = true;
        this._render();
        this.dispatchEvent(new CustomEvent('pmd-stream-select-change', {
          bubbles: true,
          composed: true,
          detail: { streamIdx: i }
        }));
      });
      li.appendChild(a);
      menu.appendChild(li);
    });
  }
}

customElements.define('pmd-stream-select', PmdStreamSelect);
