var MAIN_TAB_STYLES = `
  #mainTabs .smd-tab-panel { background-color: var(--bs-body-bg); color: var(--solar-ink, var(--bs-body-color)); --bs-body-color: var(--solar-ink); --bs-body-color-rgb: var(--solar-ink-rgb); }
  /* Keep translucent cards over the same page surface as shared cards. */
  #mainTabs #power-panel { background-color: transparent; }
  #tab-power { background-color: var(--bs-body-bg); }
  #topTiles .tile { color: var(--solar-card-ink, var(--solar-ink)); }
  #topTiles { --bs-body-color: var(--solar-card-ink, var(--solar-ink)); --bs-body-color-rgb: var(--solar-card-ink-rgb, var(--solar-ink-rgb)); }
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
