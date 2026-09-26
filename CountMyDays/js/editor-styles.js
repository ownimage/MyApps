var CMD_EDITOR_STYLES = `
  .smd-tab-panel smd-button {
    display: block;
    width: 100%;
  }
  .smd-tab-panel smd-button button {
    width: 100%;
  }
  .ew-thumb-empty {
    width: var(--ew-thumb-size, 32px);
    height: var(--ew-thumb-size, 32px);
    flex: 0 0 auto;
  }
  .cmd-scroll-list {
    max-height: 55vh;
    overflow-y: auto;
  }
`;

function injectEditorStyles(page) {
  if (page) injectStyleInto(CMD_EDITOR_STYLES);
}
