// <lol-list-items> — the ListOfLists list-edit Items list (light DOM).
//
// Data-driven: the host sets
//   items    = [{ description, done, note, noteOpen }, ...]
//   viewOnly = boolean (or the `view-only` attribute) — view mode: no drag handle
//              and NO delete button, the description input is READONLY, but the
//              done checkbox and the note (pencil) button/text stay LIVE.
// and the component renders one row per item plus its collapsible note row.
// The host is `#listItemsList` and every row keeps the ids/classes the
// regression suite targets: .item-row / .item-drag-card / .drag-handle /
// .item-done-cb / .item-desc-input / .item-note-btn / #itemNoteRow<i>.
//
// Events (bubble + composed):
//   lol-list-item-change      — detail { index, field, value }  (done|description|note)
//   lol-list-item-note-toggle — detail { index, open }
//   lol-list-item-delete      — detail { index }

const LOL_LIST_ITEMS_NOTE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.854 2.56a.5.5 0 0 0-.707 0L1.5 10.207V14.5h4.293L13.5 6.207zM12.793 3.207L4 12V14h2L13.793 4.207l-1-1z"/></svg>';
const LOL_LIST_ITEMS_DELETE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>';

function lolListItemsEscape(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class LolListItems extends HTMLElement {
  static get observedAttributes() {
    return ['view-only'];
  }

  constructor() {
    super();
    this._items = [];
    this._bound = false;
  }

  get items() {
    return this._items;
  }

  set items(list) {
    this._items = Array.isArray(list) ? list : [];
    if (this.isConnected) this._render();
  }

  get viewOnly() {
    return this.hasAttribute('view-only');
  }

  set viewOnly(value) {
    if (value) this.setAttribute('view-only', '');
    else this.removeAttribute('view-only');
  }

  connectedCallback() {
    this.classList.add("d-block");
    if (!this._bound) {
      this._bound = true;
      this.addEventListener('change', (e) => this._onChange(e));
      this.addEventListener('input', (e) => this._onInput(e));
      this.addEventListener('click', (e) => this._onClick(e));
    }
    this._render();
  }

  attributeChangedCallback() {
    if (this._bound) this._render();
  }

  _indexFrom(node) {
    const row = node && node.closest ? node.closest('[data-item-index]') : null;
    if (!row) return -1;
    const index = parseInt(row.getAttribute('data-item-index'), 10);
    return isNaN(index) ? -1 : index;
  }

  _noteOpen(item) {
    if (!item) return false;
    return item.noteOpen === undefined ? !!item.note : !!item.noteOpen;
  }

  _dispatch(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail: detail }));
  }

  _onChange(e) {
    const target = e.target;
    if (!target || !target.classList || !target.classList.contains('item-done-cb')) return;
    const index = this._indexFrom(target);
    if (index < 0) return;
    this._dispatch('lol-list-item-change', { index: index, field: 'done', value: !!target.checked });
  }

  _onInput(e) {
    const target = e.target;
    if (!target || !target.classList) return;
    if (target.classList.contains('item-desc-input')) {
      this._dispatch('lol-list-item-change', { index: this._indexFrom(target), field: 'description', value: target.value });
      return;
    }
    if (target.closest && target.closest('.item-note-row')) {
      const index = this._indexFrom(target);
      const btn = this.querySelector('.item-row[data-item-index="' + index + '"] .item-note-btn');
      if (btn) {
        const hasNote = !!target.value;
        btn.classList.toggle('btn-outline-info', hasNote);
        btn.classList.toggle('btn-info', !hasNote);
      }
      this._dispatch('lol-list-item-change', { index: index, field: 'note', value: target.value });
    }
  }

  _onClick(e) {
    const target = e.target;
    if (!target || !target.closest) return;
    const noteBtn = target.closest('.item-note-btn');
    if (noteBtn) {
      const index = this._indexFrom(noteBtn);
      const noteRow = this.querySelector('#itemNoteRow' + index);
      if (noteRow) {
        const hidden = noteRow.classList.toggle('d-none');
        this._dispatch('lol-list-item-note-toggle', { index: index, open: !hidden });
      }
      return;
    }
    const deleteBtn = target.closest('.btn-danger');
    if (deleteBtn && deleteBtn.closest('.item-row')) {
      this._dispatch('lol-list-item-delete', { index: this._indexFrom(deleteBtn) });
    }
  }

  _render() {
    const viewOnly = this.viewOnly;
    // In view mode only the DESCRIPTION input is locked: the done checkbox and
    // the note button/text stay live so lists can be ticked/annotated while
    // viewing. The drag handle and the delete button are dropped entirely.
    const ro = viewOnly ? 'readonly' : '';
    const items = this._items || [];
    let html = '';
    items.forEach((item, i) => {
      const note = item.note || '';
      const handle = viewOnly ? '' : '<smd-draghandle class="drag-handle"></smd-draghandle>';
      const del = viewOnly ? '' : '<button type="button" class="btn btn-sm btn-danger d-flex align-items-center justify-content-center p-2 flex-shrink-0" title="Delete">' + LOL_LIST_ITEMS_DELETE_SVG + '</button>';
      html +=
        '<div class="d-flex align-items-center gap-2 mb-1 item-row item-drag-card user-select-none rounded px-2 py-1" data-item-index="' + i + '">' +
          handle +
          '<smd-checkbox class="item-done-cb" id="itemDone' + i + '" ' + (item.done ? 'checked' : '') + '></smd-checkbox>' +
          '<input class="form-control item-desc-input flex-grow-1" value="' + lolListItemsEscape(item.description || '') + '" ' + ro + ' placeholder="Item description">' +
          '<button type="button" class="btn btn-sm ' + (note ? 'btn-outline-info' : 'btn-info') + ' item-note-btn" title="Note">' + LOL_LIST_ITEMS_NOTE_SVG + '</button>' +
          del +
        '</div>' +
        '<div class="item-note-row mb-1 ms-4' + (this._noteOpen(item) ? '' : ' d-none') + '" id="itemNoteRow' + i + '" data-item-index="' + i + '">' +
          '<textarea class="form-control" rows="2" placeholder="Note">' + lolListItemsEscape(note) + '</textarea>' +
        '</div>';
    });
    this.innerHTML = html;
  }
}

if (!window.customElements.get('lol-list-items')) {
  window.customElements.define('lol-list-items', LolListItems);
}
window.LolListItems = LolListItems;
