var MAIN_TAB_STYLES = `
  #mainTabs .smd-tab-panel { background-color: var(--bs-body-bg); color: var(--solar-ink, var(--bs-body-color)); --bs-body-color: var(--solar-ink); --bs-body-color-rgb: var(--solar-ink-rgb); }
  #topTiles .tile { color: var(--solar-card-ink, var(--solar-ink)); }
  #topTiles { --bs-body-color: var(--solar-card-ink, var(--solar-ink)); --bs-body-color-rgb: var(--solar-card-ink-rgb, var(--solar-ink-rgb)); }
  #mainTabs .power-table { --bs-table-color: var(--solar-ink); --bs-table-striped-color: var(--solar-ink); --bs-table-hover-color: var(--solar-ink); }
  #mainTabs .form-control:not(:disabled):not([readonly]), #mainTabs .smd-select-btn { background-color: var(--smd-form-background) !important; color: var(--solar-field-ink) !important; }
  #smd-app #mainTabs .smd-select-menu { background-color: var(--bs-body-bg); color: var(--solar-ink); }
  #smd-app #mainTabs .smd-select-item { background: var(--bs-body-bg); color: var(--solar-ink); }
  #smd-app #mainTabs .smd-select-item:is(.active, :hover, :focus-visible) { background: var(--bs-primary-bg-subtle) !important; color: var(--solar-action-ink) !important; }
  #mainTabs .access-badge { background-image: none; opacity: 1; }

  .smd-tab-panel .log-output,
  .smd-tab-panel .forecast-output {
    font-family: monospace;
    white-space: pre-wrap;
    overflow-y: auto;
    line-height: 1.5;
  }
  .smd-tab-panel .log-output { height: 60vh; }
  .smd-tab-panel .forecast-output { height: 50vh; }
  .smd-tab-panel .graph-wrap { height: 60vh; }
  @media (max-width: 480px) {
    .smd-tab-panel .log-select { width: 100%; }
  }
`;
