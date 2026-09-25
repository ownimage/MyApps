// PlanMyDay — the shared image picker (<smd-image-picker> inside an <smd-page>)
// plus the job/stream image "Edit" buttons. This is the glue between the shared
// components and PlanMyDay's jobField/editField models; the picker itself lives
// in the shared library. Split out of app.js so the entry point stays minimal.

(function () {
  let pickerCallback = null;
  let pickerHost = null;
  let pickerCloseTimer = null;
  let pickerBackground = [];

  function hideImagePickerBackground() {
    if (pickerBackground.length) return;
    const picker = document.getElementById("imagePickerPage");
    document.querySelectorAll("smd-page").forEach(function (page) {
      if (page === picker || !page.hasAttribute("open")) return;
      page.hide();
      page.classList.add("d-none");
      pickerBackground.push({ element: page, isPage: true });
    });
    const main = document.getElementById("countdownContainer");
    if (main && !main.classList.contains("d-none")) {
      main.classList.add("d-none");
      pickerBackground.push({ element: main, isPage: false });
    }
  }

  function restoreImagePickerBackground() {
    pickerBackground.forEach(function (entry) {
      entry.element.classList.remove("d-none");
      if (entry.isPage) entry.element.show();
    });
    pickerBackground = [];
  }

  window.__openImagePicker = function (callback) {
    pickerCallback = callback || null;
    pickerHost = document.getElementById("imagePickerPage");
    if (!pickerHost) return;
    pickerHost.title = "Choose Image";
    pickerHost.content = '<smd-image-picker id="pickerHost" key-prefix="' + escAttr(smdImagePrefix()) + '"></smd-image-picker>';
    pickerHost.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "No Image", variant: "primary", action: "no-image" }
    ];
    if (!pickerHost.__pickerBound) {
      pickerHost.__pickerBound = true;
      pickerHost.addEventListener("smd-page-action", function (e) {
        const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
        if (action === "cancel" || action === "no-image") window.__finishImagePick(null);
      });
    }
    if (pickerCloseTimer) {
      clearTimeout(pickerCloseTimer);
      pickerCloseTimer = null;
    }
    hideImagePickerBackground();
    pickerHost.classList.remove("d-none");
    pickerHost.show();
  };

  window.__finishImagePick = function (name) {
    if (pickerCallback) {
      const cb = pickerCallback;
      pickerCallback = null;
      cb(name);
    }
    if (pickerHost) {
      pickerHost.hide();
      restoreImagePickerBackground();
      // The page slides off-screen on hide(), but Playwright counts an off-canvas
      // element as visible. Add d-none (immediately for tests; after slide for UI).
      const ms = pickerHost.slideDuration || 0;
      if (pickerCloseTimer) clearTimeout(pickerCloseTimer);
      pickerCloseTimer = setTimeout(function () {
        pickerHost.classList.add("d-none");
        pickerCloseTimer = null;
      }, ms > 0 ? ms + 50 : 0);
    }
  };

  document.addEventListener("smd-image-picker-select", function (e) {
    window.__finishImagePick(e.detail ? e.detail.name : null);
  });

  document.addEventListener("smd-image-select-action", function (e) {
    const path = e.composedPath ? e.composedPath() : [];
    const sel = (path && path.find(function (el) { return el && el.tagName === "SMD-IMAGE-SELECT"; })) || null;
    if (!sel || !sel.id) return;
    if (sel.id === "streamImageSelect") {
      window.__openImagePicker(function (name) { editField("image", name); updateStreamImagePreview(name); });
    } else if (sel.id === "jobImageSelect") {
      window.__openImagePicker(function (name) { jobField("image", name); updateJobImagePreview(name); });
    }
  });
})();