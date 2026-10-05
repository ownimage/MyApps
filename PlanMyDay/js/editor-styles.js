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
  /* The Edit Stream "Tab" picker: the shared smd-image-dropdown stretches its
     button to 100% width; the tab picker only has two short options, so pin it
     to a fixed minimum width that holds the WIDEST option ("Maintenance") so it
     does not resize as the selection changes. em scales with the button font, so
     it tracks the Settings -> Font size ramp. */
  #streamEditPage .stream-tab-picker {
    width: fit-content;
  }
  #streamEditPage .stream-tab-picker smd-image-dropdown {
    display: inline-block;
    width: auto;
  }
  #streamEditPage .stream-tab-picker smd-image-dropdown .btn {
    width: auto;
    min-width: 13.5em;
  }
  #streamEditPage .stream-tab-picker smd-image-dropdown .menu {
    min-width: 100%;
  }
  /* The Edit Job "Stream" picker gets the same treatment: the dropdown button
     otherwise stretches to its column width. The component sizes the button to
     the WIDEST stream title (stable across selections); here we let it hug that
     width but never exceed the column, so it cannot overlap the Image selector
     on a narrow screen (the title ellipsises instead). */
  #jobEditPage .job-stream-picker {
    width: fit-content;
    max-width: 100%;
  }
  #jobEditPage .job-stream-picker smd-image-dropdown {
    display: inline-block;
    width: auto;
    max-width: 100%;
  }
  #jobEditPage .job-stream-picker smd-image-dropdown .btn {
    width: fit-content;
    max-width: 100%;
  }
  #jobEditPage .job-stream-picker smd-image-dropdown .menu {
    min-width: 100%;
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
