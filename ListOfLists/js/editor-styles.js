var LISTS_EDITOR_STYLES = `
  .item-drag-card {
    -webkit-user-select: none;
    user-select: none;
  }
  .item-desc-input {
    min-width: 0;
  }
  .item-note-btn {
    transition: none;
  }
  .item-note-btn.btn-outline-info:hover,
  .item-note-btn.btn-outline-info:focus,
  .item-note-btn.btn-outline-info:active {
    background-color: transparent;
    color: var(--bs-info);
    border-color: var(--bs-info);
  }
  /* The Edit Category "Tab" picker: the shared smd-image-dropdown stretches its
     button to 100% width; the tab picker only has two short options, so pin it
     to a fixed minimum width that holds the WIDEST option ("Maintenance") so it
     does not resize as the selection changes. em scales with the button font, so
     it tracks the Settings -> Font size ramp. */
  #categoryEditPage .category-tab-picker {
    width: fit-content;
  }
  #categoryEditPage .category-tab-picker smd-image-dropdown {
    display: inline-block;
    width: auto;
  }
  #categoryEditPage .category-tab-picker smd-image-dropdown .form-select {
    width: auto;
    min-width: 13.5em;
  }
  #categoryEditPage .category-tab-picker smd-image-dropdown .menu {
    min-width: 100%;
  }
  /* The Edit List "Category" picker gets the same treatment: the dropdown button
     otherwise stretches to its column width. The component sizes the button to
     the WIDEST category title (stable across selections); here we let it hug that
     width but never exceed the column, so it cannot overlap the Image selector
     on a narrow screen (the title ellipsises instead). */
  #listEditPage .list-category-picker {
    width: fit-content;
    max-width: 100%;
  }
  #listEditPage .list-category-picker smd-image-dropdown {
    display: inline-block;
    width: auto;
    max-width: 100%;
  }
  #listEditPage .list-category-picker smd-image-dropdown .form-select {
    width: fit-content;
    max-width: 100%;
  }
  #listEditPage .list-category-picker smd-image-dropdown .menu {
    min-width: 100%;
  }
`;

function injectListEditStyles() {
  if (!document.getElementById("listEditPage")) return;
  injectStyleInto(LISTS_EDITOR_STYLES);
}

function injectCategoriesEditorStyles() {
  if (!document.getElementById("categoriesEditor")) return;
  injectStyleInto(LISTS_EDITOR_STYLES);
}
