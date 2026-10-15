// ListOfLists — wires the shared image picker (<smd-image-picker> inside an
// <smd-page>) to the list/category image "Edit" buttons. The picker itself and the
// background-page stacking live in the shared library (smdBindImagePicker with
// manageBackground), so this file only maps ListOfLists's <smd-image-select> ids
// to its list/category models.

(function () {
  smdBindImagePicker({ manageBackground: true });
  smdBindImageSelectActions({
    categoryImageSelect: name => { editField("image", name); updateCategoryImagePreview(name); },
    listImageSelect: name => { listField("image", name); updateListImagePreview(name); }
  });
})();
