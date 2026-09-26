var JOBS_EDITOR_STYLES = `
  .task-drag-card {
    -webkit-user-select: none;
    user-select: none;
  }
  .task-desc-input {
    min-width: 0;
  }
  .task-note-btn {
    transition: none;
  }
  .task-note-btn.btn-outline-info:hover,
  .task-note-btn.btn-outline-info:focus,
  .task-note-btn.btn-outline-info:active {
    background-color: transparent;
    color: var(--bs-info);
    border-color: var(--bs-info);
  }
`;

function injectJobEditStyles() {
  if (!document.getElementById("jobEditPage")) return;
  injectStyleInto(JOBS_EDITOR_STYLES);
}

function injectStreamsEditorStyles() {
  if (!document.getElementById("streamsEditor")) return;
  injectStyleInto(JOBS_EDITOR_STYLES);
}
