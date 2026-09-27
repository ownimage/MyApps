// PlanMyDay — display settings wiring (image size + touch size) that push the
// shared <smd-image> / <smd-draghandle> / <smd-checkbox> components as VALUES
// (not styles). Kept in its own file so app.js stays a thin entry point.

// Display / Image size setting -> the shared <smd-image> render size (px), wired
// into the component as a VALUE (not a style). Non-SVG images are sourced from
// the matching higher-res thumbnail tier (px -> px*2 -> data100/80/64).
const PMD_IMAGE_SIZE_PX = { xsmall: 32, small: 40, medium: 50, large: 64, xlarge: 80, jumbo: 100 };
function pmdImageSize() {
  const value = localStorage.getItem(smdKey("iconSize")) || "medium";
  return PMD_IMAGE_SIZE_PX[value] || 50;
}
function applyImageSize() {
  if (typeof SmdImage !== "undefined" && SmdImage.setDefaultSize) {
    SmdImage.setDefaultSize(pmdImageSize());
  }
}

// Display / Touch size setting -> the shared <smd-draghandle> and <smd-checkbox>
// size value ("normal" | "large"), wired as a VALUE (not a style). The legacy
// "dragSize" key is honoured so an existing preference survives the rename.
function pmdTouchSize() {
  return localStorage.getItem(smdKey("touchSize")) ||
    localStorage.getItem(smdKey("dragSize")) || "large";
}
function applyTouchSize() {
  const size = pmdTouchSize();
  if (typeof SmdDragHandle !== "undefined" && SmdDragHandle.setDefaultSize) {
    SmdDragHandle.setDefaultSize(size);
  }
  if (typeof SmdCheckbox !== "undefined" && SmdCheckbox.setDefaultSize) {
    SmdCheckbox.setDefaultSize(size);
  }
}