// <smd-image-editor> â€” the shared image edit form.
//
// Renders the body of the image edit dialog for one entry of an app's
// localStorage image list: name + duplicate check, themed preview + Upload,
// the per-theme colour sections and OK/Cancel.
//
// It renders in the LIGHT DOM on purpose: the host is #imageEditModal, which is
// an <smd-page> (it was a Bootstrap modal until 2026-09-27), so the app's
// document CSS must style the content, and existing app/test selectors such as
// `#imageEditModalBody input.form-control` keep working.
//
// The field controls call the shared smd-images.js globals (editImageField,
// checkDuplicateName, editImageColor, ...). Upload dispatches
// <code>smd-image-editor-action</code> (detail = { action: "upload", index })
// so the controller (smd-images.js) owns the behaviour and the component stays a
// view. OK / Cancel are NOT here: they are the hosting <smd-page>'s footer
// buttons (Cancel then OK, ids btnImageEditCancel / btnImageEditOk), which is
// where the other app dialogs put them.
//
// Properties:
//   image       â€” the images[] entry being edited (required)
//   index       â€” images[] index (echoed in the action events)
//   isNew       â€” true while adding a new image
//   isDuplicate â€” true while editing a duplicate
//
// Usage: call render() after setting the properties.
class SmdImageEditor extends HTMLElement {
  get image() { return this._image; }
  set image(val) { this._image = val; }

  get index() { return this._index; }
  set index(val) { this._index = val; }

  get isNew() { return this._isNew === true; }
  set isNew(val) { this._isNew = val === true; }

  get isDuplicate() { return this._isDuplicate === true; }
  set isDuplicate(val) { this._isDuplicate = val === true; }

  connectedCallback() {
    if (this._image) this.render();
  }

  _emit(action) {
    this.dispatchEvent(new CustomEvent("smd-image-editor-action", {
      bubbles: true,
      composed: true,
      detail: {
        action: action,
        index: typeof this._index === "number" ? this._index : -1
      }
    }));
  }

  render() {
    const img = this._image;
    if (!img) return;
    const index = typeof this._index === "number" ? this._index : -1;
    const hasData = img.data && img.data.length > 0;
    const colorEditorHtml = hasData
      ? buildThemeSection(0, "Light theme", img) + buildThemeSection(1, "Dark theme", img)
      : "";
    // The preview follows the Settings Icon size (clamped, see
    // smdImagePreviewSizePx in smd-images.js). Applied inline because size is a
    // VALUE here, not a style; `data-img` is only a hook class (there is
    // deliberately no CSS rule for it).
    const previewPx = typeof smdImagePreviewSizePx === "function" ? smdImagePreviewSizePx() : 100;
    const previewStyle = `width:${previewPx}px;height:${previewPx}px;object-fit:contain;flex-shrink:0`;

    // No wrapper <div class="card">: the host is an <smd-page>, which already
    // provides the surface and padding, so a card inside it was a second frame
    // around the content. The form's own blocks are all that is needed.
    this.innerHTML = `
      <div class="mb-2">
        <label class="form-label mb-1">Name</label>
        <input class="form-control" value="${escapeHtml(img.name)}" onchange="editImageField('name', this.value); checkDuplicateName()" oninput="checkDuplicateName()">
        <div id="imageNameError" class="text-danger mt-1" style="display:none">ERROR: There is already an image with this name.</div>
      </div>
      <div class="d-flex gap-2 align-items-center mb-2">
        <div style="width:45px;flex-shrink:0"></div>
        ${hasData
          ? `<img src="" data-smdsrc="${escAttr(getThemedImageDataUrl(img))}" class="data-img" style="${previewStyle}" hidden>`
          : `<div class="data-img d-flex align-items-center justify-content-center text-secondary border rounded" style="${previewStyle}">No image</div>`
        }
        <button id="btnImageUpload" class="btn btn-primary btn-sm text-nowrap" type="button">Upload</button>
      </div>
      ${colorEditorHtml}
    `;

    this.querySelector("#btnImageUpload").addEventListener("click", () => this._emit("upload"));

    const smdSetSrc = typeof window.smdSetImageSrc === "function" ? window.smdSetImageSrc : null;
    this.querySelectorAll("[data-smdsrc]").forEach((el) => {
      const src = el.getAttribute("data-smdsrc");
      if (smdSetSrc) smdSetSrc(el, src);
      else { el.src = src; el.hidden = false; }
    });
  }
}

if (!window.customElements.get("smd-image-editor")) {
  window.customElements.define("smd-image-editor", SmdImageEditor);
}
window.SmdImageEditor = SmdImageEditor;
