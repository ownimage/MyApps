// <pmd-tasks> — the PlanMyDay job-edit Tasks list (light DOM).
//
// Data-driven: the host sets
//   tasks    = [{ description, done, note, noteOpen }, ...]
//   readOnly = boolean (or the `read-only` attribute)
// and the component renders one row per task plus its collapsible note row.
// The host is `#jobTasksList` and every row keeps the ids/classes the
// regression suite targets: .task-row / .task-drag-card / .drag-handle /
// .task-done-cb / .task-desc-input / .task-note-btn / #taskNoteRow<i>.
//
// Styling lives in shared/css/styles.css via the --pmd-tasks-* palette at the
// top of that file (overridable per theme in shared/css/themes/<theme>/<theme>.css).
//
// Events (bubble + composed):
//   pmd-task-change      — detail { index, field, value }  (done|description|note)
//   pmd-task-note-toggle — detail { index, open }
//   pmd-task-delete      — detail { index }

const PMD_TASKS_NOTE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.854 2.56a.5.5 0 0 0-.707 0L1.5 10.207V14.5h4.293L13.5 6.207zM12.793 3.207L4 12V14h2L13.793 4.207l-1-1z"/></svg>';
const PMD_TASKS_DELETE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>';

function pmdTasksEscape(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class PmdTasks extends HTMLElement {
  static get observedAttributes() {
    return ['read-only'];
  }

  constructor() {
    super();
    this._tasks = [];
    this._bound = false;
  }

  get tasks() {
    return this._tasks;
  }

  set tasks(list) {
    this._tasks = Array.isArray(list) ? list : [];
    if (this.isConnected) this._render();
  }

  get readOnly() {
    return this.hasAttribute('read-only');
  }

  set readOnly(value) {
    if (value) this.setAttribute('read-only', '');
    else this.removeAttribute('read-only');
  }

  connectedCallback() {
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
    const row = node && node.closest ? node.closest('[data-task-index]') : null;
    if (!row) return -1;
    const index = parseInt(row.getAttribute('data-task-index'), 10);
    return isNaN(index) ? -1 : index;
  }

  _noteOpen(task) {
    if (!task) return false;
    return task.noteOpen === undefined ? !!task.note : !!task.noteOpen;
  }

  _dispatch(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail: detail }));
  }

  _onChange(e) {
    const target = e.target;
    if (!target || !target.classList || !target.classList.contains('task-done-cb')) return;
    const index = this._indexFrom(target);
    if (index < 0) return;
    this._dispatch('pmd-task-change', { index: index, field: 'done', value: !!target.checked });
  }

  _onInput(e) {
    const target = e.target;
    if (!target || !target.classList) return;
    if (target.classList.contains('task-desc-input')) {
      this._dispatch('pmd-task-change', { index: this._indexFrom(target), field: 'description', value: target.value });
      return;
    }
    if (target.closest && target.closest('.task-note-row')) {
      const index = this._indexFrom(target);
      const btn = this.querySelector('.task-row[data-task-index="' + index + '"] .task-note-btn');
      if (btn) {
        const hasNote = !!target.value;
        btn.classList.toggle('btn-outline-info', hasNote);
        btn.classList.toggle('btn-info', !hasNote);
      }
      this._dispatch('pmd-task-change', { index: index, field: 'note', value: target.value });
    }
  }

  _onClick(e) {
    const target = e.target;
    if (!target || !target.closest) return;
    const noteBtn = target.closest('.task-note-btn');
    if (noteBtn) {
      const index = this._indexFrom(noteBtn);
      const noteRow = this.querySelector('#taskNoteRow' + index);
      if (noteRow) {
        const hidden = noteRow.classList.toggle('d-none');
        this._dispatch('pmd-task-note-toggle', { index: index, open: !hidden });
      }
      return;
    }
    const deleteBtn = target.closest('.btn-danger');
    if (deleteBtn && deleteBtn.closest('.task-row')) {
      this._dispatch('pmd-task-delete', { index: this._indexFrom(deleteBtn) });
    }
  }

  _render() {
    const readOnly = this.readOnly;
    const disabled = readOnly ? 'disabled' : '';
    const ro = readOnly ? 'readonly' : '';
    const tasks = this._tasks || [];
    let html = '';
    tasks.forEach((task, i) => {
      const note = task.note || '';
      const handle = readOnly ? '' : '<smd-draghandle class="drag-handle"></smd-draghandle>';
      html +=
        '<div class="d-flex align-items-center gap-2 mb-1 task-row task-drag-card user-select-none rounded px-2 py-1" data-task-index="' + i + '">' +
          handle +
          '<smd-checkbox class="task-done-cb" id="taskDone' + i + '" ' + (task.done ? 'checked' : '') + ' ' + disabled + '></smd-checkbox>' +
          '<input class="form-control task-desc-input flex-grow-1" value="' + pmdTasksEscape(task.description || '') + '" ' + ro + ' placeholder="Task description">' +
          '<button type="button" class="btn btn-sm ' + (note ? 'btn-outline-info' : 'btn-info') + ' task-note-btn" ' + disabled + ' title="Note">' + PMD_TASKS_NOTE_SVG + '</button>' +
          '<button type="button" class="btn btn-sm btn-danger d-flex align-items-center justify-content-center p-2 flex-shrink-0" ' + disabled + ' title="Delete">' + PMD_TASKS_DELETE_SVG + '</button>' +
        '</div>' +
        '<div class="task-note-row mb-1 ms-4' + (this._noteOpen(task) ? '' : ' d-none') + '" id="taskNoteRow' + i + '" data-task-index="' + i + '">' +
          '<textarea class="form-control" rows="2" placeholder="Note" ' + ro + '>' + pmdTasksEscape(note) + '</textarea>' +
        '</div>';
    });
    this.innerHTML = html;
  }
}

if (!window.customElements.get('pmd-tasks')) {
  window.customElements.define('pmd-tasks', PmdTasks);
}
window.PmdTasks = PmdTasks;
