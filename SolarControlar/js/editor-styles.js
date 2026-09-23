var MAIN_TAB_STYLES = `
  .smd-tab-panel .power-table {
    --bs-table-bg: var(--bs-dark-border-subtle, #303030);
    --bs-table-border-color: var(--bs-border-color, #495057);
    --bs-table-striped-bg: var(--bs-dark-border-subtle, #303030);
    --bs-table-striped-color: var(--bs-body-color, #eee);
    --bs-table-hover-bg: var(--bs-tertiary-bg, #222);
    --bs-table-hover-color: var(--bs-body-color, #eee);
  }
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
