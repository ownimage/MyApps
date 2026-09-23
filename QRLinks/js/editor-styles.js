var JOBS_EDITOR_STYLES = "";

var QRLINK_EDITOR_STYLES = `
  .qrlink-list-card {
    user-select: none;
    -webkit-user-select: none;
  }
  .sortable-ghost {
    opacity: 0.4;
  }
  .sortable-chosen,
  .sortable-drag {
    cursor: grabbing;
  }
  .smd-tab-panel smd-button {
    display: block;
    width: 100%;
  }
  .smd-tab-panel smd-button button {
    width: 100%;
    box-sizing: border-box;
  }
`;

function injectEditorStyles(page) {
  if (page) injectStyleInto(QRLINK_EDITOR_STYLES);
}
