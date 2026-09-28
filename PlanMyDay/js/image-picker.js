// PlanMyDay — wires the shared image picker (<smd-image-picker> inside an
// <smd-page>) to the job/stream image "Edit" buttons. The picker itself and the
// background-page stacking live in the shared library (smdBindImagePicker with
// manageBackground), so this file only maps PlanMyDay's <smd-image-select> ids
// to its job/stream models.

(function () {
  smdBindImagePicker({ manageBackground: true });
  smdBindImageSelectActions({
    streamImageSelect: name => { editField("image", name); updateStreamImagePreview(name); },
    jobImageSelect: name => { jobField("image", name); updateJobImagePreview(name); }
  });
})();
