// SolarControlar — shadow-root CSS constants for the settings page and the
// style injection helpers. JOBS_EDITOR_STYLES is the generic page/tab form
// style set shared with the other apps.

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
  .smd-tab-panel .btn-warning { background: var(--bs-warning, #ffc107); color: #000; }
  .smd-tab-panel .btn-wide, .smd-tab-panel .w-100 { width: 100%; }
  .smd-page-body .d-flex, .smd-tab-panel .d-flex { display: flex; }
  .smd-page-body .gap-1, .smd-tab-panel .gap-1 { gap: 0.25rem; }
  .smd-page-body .gap-2, .smd-tab-panel .gap-2 { gap: 0.5rem; }
  .smd-page-body .gap-3, .smd-tab-panel .gap-3 { gap: 1rem; }
  .smd-page-body .mb-0, .smd-tab-panel .mb-0 { margin-bottom: 0; }
  .smd-page-body .mb-1, .smd-tab-panel .mb-1 { margin-bottom: 0.25rem; }
  .smd-page-body .mb-2, .smd-tab-panel .mb-2 { margin-bottom: 0.5rem; }
  .smd-tab-panel .mb-3 { margin-bottom: 1rem; }
  .smd-tab-panel .mb-4 { margin-bottom: 1.5rem; }
  .smd-tab-panel .mt-2 { margin-top: 0.5rem; }
  .smd-tab-panel .mt-3 { margin-top: 1rem; }
  .smd-tab-panel .text-secondary { color: var(--bs-secondary-color, #adb5bd); }
  .smd-tab-panel .form-text { font-size: var(--smd-type-p, 0.8rem); color: var(--bs-secondary-color, #adb5bd); margin-top: 0.25rem; }
  .d-none { display: none !important; }
`;

var SOLAR_EDITOR_STYLES = `
  .smd-tab-panel smd-button {
    display: block;
    width: 100%;
  }
  .smd-tab-panel smd-button::part(button) {
    width: 100%;
    box-sizing: border-box;
  }
`;

// Main dashboard tab panel styles. The six main-tab panels live inside the
// #mainTabs smd-tabs shadow root, so the light-DOM app stylesheet cannot reach
// them: these rules re-create the original .tab-content look inside the panels
// (injected alongside JOBS_EDITOR_STYLES for the shared form/btn utilities).
var MAIN_TAB_STYLES = `
  .smd-tab-panel .btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: var(--smd-type-p, 0.875rem);
    border-radius: 0.25rem;
  }
  .smd-tab-panel .align-items-center { align-items: center; }
  .smd-tab-panel .text-end { text-align: right; }
  .smd-tab-panel .flex-grow-1 { flex-grow: 1; }

  .smd-tab-panel .power-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--bs-dark-border-subtle, #303030);
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid var(--bs-border-color, #495057);
  }
  .smd-tab-panel .power-table th,
  .smd-tab-panel .power-table td {
    padding: 0.6rem 0.8rem;
    text-align: left;
    border-bottom: 1px solid var(--bs-border-color, #495057);
  }
  .smd-tab-panel .power-table th {
    background: var(--bs-body-bg, #222);
    color: var(--bs-secondary-color, #adb5bd);
    font-weight: 600;
    font-size: var(--smd-type-badge, 0.8rem);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .smd-tab-panel .power-table tr:last-child td { border-bottom: none; }
  .smd-tab-panel .power-table tr:hover { background: var(--bs-body-bg, #222); }
  .smd-tab-panel .power-table td:first-child {
    font-weight: 600;
    color: var(--bs-body-color, #eee);
    width: 35%;
  }
  .smd-tab-panel .power-table td:nth-child(2) {
    color: var(--bs-primary, #0d6efd);
  }

  .smd-tab-panel .access-badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
    font-size: var(--smd-type-badge, 0.7rem);
    font-weight: 600;
    text-transform: uppercase;
  }
  .smd-tab-panel .access-badge.badge-ro {
    background: var(--bs-secondary-bg, #495057);
    color: var(--bs-secondary-color, #adb5bd);
  }
  .smd-tab-panel .access-badge.badge-rw {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }
  .smd-tab-panel .access-badge.badge-changed {
    background: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
  }
  .smd-tab-panel .was-text {
    font-size: var(--smd-type-badge, 0.75rem);
    color: #ef4444;
  }

  .smd-tab-panel .log-controls {
    margin-bottom: 1rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .smd-tab-panel .log-input {
    width: 8rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
    font-size: var(--smd-type-p, 0.9rem);
    background: var(--bs-body-bg, #222);
    color: var(--bs-body-color, #eee);
  }
  .smd-tab-panel .log-select {
    width: 16rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--bs-border-color, #495057);
    border-radius: 0.375rem;
    font-size: var(--smd-type-p, 0.9rem);
    background: var(--bs-body-bg, #222);
    color: var(--bs-body-color, #eee);
  }
  .smd-tab-panel .log-output {
    background: var(--bs-body-bg, #111);
    color: var(--bs-body-color, #e2e8f0);
    padding: 1rem;
    border-radius: 0.5rem;
    font-family: monospace;
    font-size: var(--smd-type-p, 0.85rem);
    white-space: pre-wrap;
    height: 60vh;
    overflow-y: auto;
    line-height: 1.5;
    border: 1px solid var(--bs-border-color, #495057);
  }
  .smd-tab-panel .loading {
    color: var(--bs-secondary-color, #adb5bd);
    font-style: italic;
  }

  .smd-tab-panel .graph-controls {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .smd-tab-panel .graph-checkboxes {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .smd-tab-panel .graph-checkboxes label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: var(--smd-type-p, 0.9rem);
    cursor: pointer;
  }
  .smd-tab-panel .graph-wrap {
    background: var(--bs-dark-border-subtle, #303030);
    border-radius: 0.5rem;
    border: 1px solid var(--bs-border-color, #495057);
    padding: 1rem;
    position: relative;
    height: 60vh;
  }

  .smd-tab-panel .forecast-output {
    background: var(--bs-body-bg, #111);
    color: var(--bs-body-color, #e2e8f0);
    padding: 1rem;
    border-radius: 0.5rem;
    font-family: monospace;
    font-size: var(--smd-type-p, 0.85rem);
    white-space: pre-wrap;
    height: 50vh;
    overflow-y: auto;
    line-height: 1.5;
    margin-top: 1rem;
    border: 1px solid var(--bs-border-color, #495057);
  }

  .smd-tab-panel .flash {
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    border-radius: 0.5rem;
  }
  .smd-tab-panel .flash-success {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }
  .smd-tab-panel .flash-error {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  @media (max-width: 480px) {
    .smd-tab-panel .log-select { width: 100%; }
  }
`;

function injectEditorStyles(page) {
  if (page && page.shadowRoot) {
    injectStyleInto(page.shadowRoot, JOBS_EDITOR_STYLES + SOLAR_EDITOR_STYLES);
  }
}
