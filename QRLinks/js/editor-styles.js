// QRLinks — shadow-root CSS constants for the editors and the style injection
// helpers (adopted via the shared SmdStyles). JOBS_EDITOR_STYLES is the generic
// page/tab form style set shared (copied) with PlanMyDay/CountMyDays; the
// QRLINK_EDITOR_STYLES block holds the QRLinks additions. The shared
// injectSettingsStyles() (shared/js/smd-settings.js) handles the settings page.

var JOBS_EDITOR_STYLES = `
  .smd-page-body *, .smd-page-body *::before, .smd-page-body *::after,
  .smd-tab-panel *, .smd-tab-panel *::before, .smd-tab-panel *::after {
    box-sizing: border-box;
  }
  .smd-page-body .row, .smd-tab-panel .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    width: 100%;
    max-width: 1040px;
    margin-bottom: 1rem;
  }
  .smd-page-body .col, .smd-page-body .col-auto, .smd-page-body .col-6,
  .smd-tab-panel .col, .smd-tab-panel .col-auto, .smd-tab-panel .col-6 {
    position: relative;
    padding-right: 0.75rem;
    padding-left: 0.75rem;
  }
  .smd-page-body .col, .smd-tab-panel .col { flex: 1 0 0%; }
  .smd-page-body .col-auto, .smd-tab-panel .col-auto { flex: 0 0 auto; width: auto; }
  .smd-page-body .col-6, .smd-tab-panel .col-6 { flex: 0 0 50%; max-width: 50%; }
  .smd-page-body .form-label, .smd-tab-panel .form-label {
    margin-bottom: 0.25rem;
    font-weight: 500;
    color: var(--bs-body-color, #f8f9fa);
  }
  .smd-page-body .form-control, .smd-tab-panel .form-control {
    display: block;
    width: 100%;
    padding: 0.375rem 0.75rem;
    font-size: var(--smd-type-p, 0.95rem);
    font-weight: 400;
    line-height: 1.5;
    color: var(--bs-body-color, #f8f9fa);
    background-color: var(--bs-body-bg, #222222);
    background-clip: padding-box;
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
  }
  .smd-page-body .form-select, .smd-tab-panel .form-select {
    display: block;
    width: 100%;
    padding: 0.375rem 0.75rem;
    font-size: var(--smd-type-p, 0.95rem);
    color: var(--bs-body-color, #f8f9fa);
    background-color: var(--bs-body-bg, #222222);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
  }
  .smd-page-body .form-check, .smd-tab-panel .form-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.5rem;
  }
  .smd-page-body .form-check-label, .smd-tab-panel .form-check-label {
    color: var(--bs-body-color, #f8f9fa);
  }
  .smd-page-body .form-check-input, .smd-tab-panel .form-check-input {
    width: 1.1em;
    height: 1.1em;
    margin: 0;
    flex-shrink: 0;
    appearance: none;
    -webkit-appearance: none;
    vertical-align: middle;
    background-color: var(--bs-secondary-bg, #495057);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.25em;
    cursor: pointer;
  }
  .smd-page-body .form-check-input:checked, .smd-tab-panel .form-check-input:checked {
    background-color: var(--bs-primary, #0d6efd);
    border-color: var(--bs-primary, #0d6efd);
  }
  .smd-page-body .form-check-input:disabled, .smd-tab-panel .form-check-input:disabled { opacity: 0.55; }
  .smd-tab-panel .form-switch { padding-left: 0; }
  .smd-tab-panel .form-switch .form-check-input {
    width: 2.5em;
    height: 1.5em;
    border-radius: 2em;
    position: relative;
  }
  .smd-tab-panel .form-switch .form-check-input::before {
    content: "";
    position: absolute;
    top: 0.15em;
    left: 0.15em;
    width: 1.2em;
    height: 1.2em;
    border-radius: 50%;
    background-color: #fff;
    transition: transform 0.15s ease-in-out;
  }
  .smd-tab-panel .form-switch .form-check-input:checked::before { transform: translateX(1em); }
  .smd-tab-panel .input-group {
    display: flex;
    align-items: stretch;
    width: 100%;
  }
  .smd-tab-panel .input-group > .form-control {
    flex: 1 1 auto;
    width: 1%;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .smd-tab-panel .input-group > .btn-outline-secondary {
    flex: 0 0 auto;
    border: 1px solid var(--bs-border-color, #6c757d);
    border-left: 0;
    background: var(--bs-tertiary-bg, #303030);
    color: var(--bs-secondary-color, #adb5bd);
    padding: 0.375rem 0.75rem;
    border-radius: 0 0.375rem 0.375rem 0;
    cursor: pointer;
  }
  .smd-page-body .btn, .smd-tab-panel .btn {
    display: inline-block;
    padding: 0.375rem 0.75rem;
    font-size: var(--smd-type-p, 0.95rem);
    font-weight: 400;
    line-height: 1.5;
    text-align: center;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    cursor: pointer;
    text-decoration: none;
  }
  .smd-page-body .btn:disabled, .smd-tab-panel .btn:disabled { opacity: 0.55; pointer-events: none; }
  .smd-tab-panel .btn-primary { background: var(--bs-primary, #0d6efd); color: var(--smd-primary-text, #fff); }
  .smd-tab-panel .btn-danger { background: var(--bs-danger, #e74c3c); color: var(--smd-danger-text, #fff); }
  .smd-tab-panel .btn-info { background: var(--bs-info, #0dcaf0); color: var(--smd-info-text, #fff); }
  .smd-tab-panel .btn-outline-info { background: transparent; color: var(--bs-info, #31d2f2); border-color: var(--bs-info, #31d2f2); }
  .smd-tab-panel .btn-outline-secondary { background: transparent; color: var(--bs-secondary-color, #adb5bd); border-color: var(--bs-secondary-color, #6c757d); }
  .smd-tab-panel .btn-sm { padding: 0.25rem 0.5rem; font-size: var(--smd-type-p, 0.85rem); border-radius: 0.25rem; }
  .smd-tab-panel .btn-wide, .smd-tab-panel .w-100 { width: 100%; }
  .smd-tab-panel .dropdown { position: relative; }
  .smd-tab-panel .dropdown-toggle {
    border: 1px solid var(--bs-border-color, #6c757d);
    background: var(--bs-tertiary-bg, #303030);
    color: var(--bs-body-color, #eee);
    text-align: left;
  }
  .smd-tab-panel .dropdown-toggle::after {
    content: "";
    display: inline-block;
    margin-left: 0.5rem;
    vertical-align: middle;
    border-top: 0.3em solid;
    border-right: 0.3em solid transparent;
    border-bottom: 0;
    border-left: 0.3em solid transparent;
    opacity: 0.7;
  }
  .smd-tab-panel .dropdown-menu {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 1000;
    min-width: 100%;
    padding: 0.25rem 0;
    margin: 0.125rem 0 0;
    list-style: none;
    background: var(--bs-body-bg, #222);
    border: 1px solid var(--bs-border-color, #444);
    border-radius: 0.375rem;
  }
  .smd-tab-panel .dropdown-menu.show { display: block; }
  .smd-tab-panel .dropdown-menu-end { right: 0; left: auto; }
  .smd-tab-panel .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.35rem 1rem;
    color: var(--bs-body-color, #eee);
    text-decoration: none;
    cursor: pointer;
    background: transparent;
    border: none;
    text-align: left;
  }
  .smd-tab-panel .dropdown-item:hover, .smd-tab-panel .dropdown-item.active {
    background: var(--bs-primary, #0d6efd);
    color: #fff;
  }
  .smd-page-body .d-flex, .smd-tab-panel .d-flex { display: flex; }
  .smd-page-body .flex-column, .smd-tab-panel .flex-column { flex-direction: column; }
  .smd-page-body .flex-grow-1, .smd-tab-panel .flex-grow-1 { flex-grow: 1; }
  .smd-page-body .flex-shrink-0, .smd-tab-panel .flex-shrink-0 { flex-shrink: 0; }
  .smd-page-body .align-items-center, .smd-tab-panel .align-items-center { align-items: center; }
  .smd-page-body .align-self-center, .smd-tab-panel .align-self-center { align-self: center; }
  .smd-page-body .text-truncate, .smd-tab-panel .text-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .smd-page-body .gap-1, .smd-tab-panel .gap-1 { gap: 0.25rem; }
  .smd-page-body .gap-2, .smd-tab-panel .gap-2 { gap: 0.5rem; }
  .smd-page-body .gap-3, .smd-tab-panel .gap-3 { gap: 1rem; }
  .smd-page-body .mb-0, .smd-tab-panel .mb-0 { margin-bottom: 0; }
  .smd-page-body .mb-1, .smd-tab-panel .mb-1 { margin-bottom: 0.25rem; }
  .smd-page-body .mb-2, .smd-tab-panel .mb-2 { margin-bottom: 0.5rem; }
  .smd-tab-panel .mb-3 { margin-bottom: 1rem; }
  .smd-tab-panel .mb-4 { margin-bottom: 1.5rem; }
  .smd-tab-panel .mt-1 { margin-top: 0.25rem; }
  .smd-tab-panel .mt-2 { margin-top: 0.5rem; }
  .smd-tab-panel .mt-3 { margin-top: 1rem; }
  .smd-tab-panel .ms-4 { margin-left: 1.5rem; }
  .smd-tab-panel .text-secondary { color: var(--bs-secondary-color, #adb5bd); }
  .smd-tab-panel .h-100 { height: 100%; }
  .smd-tab-panel .position-relative { position: relative; }
  .smd-tab-panel .task-drag-card {
    background: var(--bs-tertiary-bg, #2a2a2a);
    border-radius: 6px;
    padding: 0.25rem 0.5rem;
  }
  .smd-tab-panel .task-desc-input { flex: 1 1 auto; min-width: 0; }
  .d-none { display: none !important; }
`;

// QRLinks additions: the draggable link rows in the links editor list.
var QRLINK_EDITOR_STYLES = `
  .qrlink-list-card {
    background-color: var(--bs-dark-border-subtle, #303030);
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
    padding: 0.75rem 1rem;
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .qrlink-list-card .link-thumb { flex: 0 0 auto; display: flex; align-items: center; }
  .qrlink-list-card .link-body { flex: 1 1 auto; min-width: 0; }
  .qrlink-list-card .link-title { font-weight: 700; overflow-wrap: anywhere; }
  .qrlink-list-card .link-url {
    font-size: var(--smd-type-p, 0.85rem);
    color: var(--bs-primary, #0d6efd);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .qrlink-list-card .link-desc { font-size: var(--smd-type-p, 0.85rem); color: var(--bs-secondary-color, #adb5bd); }
  .qrlink-list-card .link-actions { display: flex; gap: 0.5rem; flex: 0 0 auto; }
  .sortable-ghost { opacity: 0.4; }
  .sortable-chosen, .sortable-drag { cursor: grabbing; }
  .smd-tab-panel smd-button {
    display: block;
    width: 100%;
  }
  .smd-tab-panel smd-button::part(button) {
    width: 100%;
    box-sizing: border-box;
  }
`;

function injectEditorStyles(page) {
  if (page && page.shadowRoot) {
    injectStyleInto(page.shadowRoot, JOBS_EDITOR_STYLES + QRLINK_EDITOR_STYLES);
  }
}
