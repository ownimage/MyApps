// PlanMyDay app entry point: dev-mode flag, display/image-size wiring, DOM
// event wiring for the page/editor components, and PWA pull-to-refresh.
//
// The app is split into classic scripts (no modules) so every top-level
// function stays a global — generated HTML uses inline onclick handlers and
// the Playwright suite calls these functions from page.evaluate().

// DEV MODE
window.isDevMode = new URLSearchParams(window.location.search).get("dev") === "true";

// All apps share ONE image library on this origin (`shared-images`).
SmdConfig.imagePrefix = "shared-";

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

document.addEventListener("DOMContentLoaded", () => {
  const settingsPage = document.getElementById("settingsPage");
  if (settingsPage) {
    settingsPage.addEventListener("smd-page-action", () => closeSettings());
  }

  const jobEditPage = document.getElementById("jobEditPage");
  if (jobEditPage) {
    jobEditPage.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (!action) return;
      if (action === "edit") {
        editJobFromView();
      } else if (action === "cancel") {
        cancelJobEdit();
      } else if (action === "done") {
        doneJobEdit();
      } else if (action === "delete") {
        deleteJobFromEdit();
      }
    });
    jobEditPage.addEventListener("smd-image-dropdown-change", (e) => {
      var newIdx = streamIndexByName(e.detail.name);
      if (newIdx >= 0) jobChangeStream(newIdx);
    });
    jobEditPage.addEventListener("smd-date-picker-change", (e) => {
      jobField("sleepUntil", (e.detail && e.detail.value) || "");
    });
  }

  const streamEditPage = document.getElementById("streamEditPage");
  if (streamEditPage) {
    streamEditPage.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "cancel") {
        cancelEdit();
      } else if (action === "done") {
        doneEdit();
      }
    });
  }

  const streamsEditorPage = document.getElementById("streamsEditor");
  if (streamsEditorPage) {
    streamsEditorPage.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "add") {
        addNewStream();
      } else if (action === "done") {
        closeStreamsEditor();
      }
    });

    streamsEditorPage.addEventListener("pmd-header-toggle", (e) => {
      setStreamExpanded(e.detail.streamIdx, e.detail.expanded);
    });
    streamsEditorPage.addEventListener("pmd-edit", (e) => {
      editStream(e.detail.streamIdx);
    });
    streamsEditorPage.addEventListener("pmd-add-job", (e) => {
      addNewJobForStream(e.detail.streamIdx);
    });
    streamsEditorPage.addEventListener("pmd-delete", (e) => {
      confirmDeleteStream(e.detail.streamIdx);
    });
    streamsEditorPage.addEventListener("pmd-job-edit", (e) => {
      editJobInAccordion(e.detail.streamIdx, e.detail.jobIdx);
    });
    streamsEditorPage.addEventListener("pmd-job-toggle-active", (e) => {
      handleAccordionJobActiveToggle(e.detail.streamIdx, e.detail.jobIdx, e.detail.checked);
    });
  }

  const jobSearchEditorPage = document.getElementById("jobSearchEditor");
  if (jobSearchEditorPage) {
    jobSearchEditorPage.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "add") {
        addNewJobFromSearch();
      } else if (action === "done") {
        closeSearchJobs();
      }
    });
  }

  const imagesEditor = document.getElementById("imagesEditor");
  if (imagesEditor) {
    imagesEditor.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "add") {
        addNewImage();
      } else if (action === "done") {
        closeImagesEditor();
      }
    });
    imagesEditor.addEventListener("smd-image-card-action", (e) => {
      const action = e.detail && e.detail.action;
      const idx = e.detail && e.detail.index;
      if (action === "delete") {
        confirmDeleteImage(idx);
      } else if (action === "duplicate") {
        duplicateImage(idx);
      } else if (action === "edit") {
        startEditImage(idx);
      }
    });
  }

  const savedTheme = localStorage.getItem(smdKey("theme")) || "superhero";
  applyTheme(savedTheme);
  if (typeof migrateImagesToShared === "function") migrateImagesToShared();
  if (typeof seedSampleImages === "function") seedSampleImages();

  applyImageSize();
  applyTouchSize();
  renderMain();

  // The settings Display tab uses the shared <smd-theme> component; apply the
  // chosen theme when it fires smd-theme-change.
  document.addEventListener("smd-theme-change", function(e) {
    const theme = e.detail && e.detail.theme;
    if (theme && typeof changeTheme === "function") changeTheme(theme);
  });

  // smd-image-select "Edit" buttons open the SHARED image picker on
  // #imagePickerPage. Selection/no-image/cancel resolve the callback.
  let pickerCallback = null;
  let pickerHost = null;
  window.__openImagePicker = function(callback) {
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
      pickerHost.addEventListener("smd-page-action", function(e) {
        const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
        if (action === "cancel" || action === "no-image") window.__finishImagePick(null);
      });
    }
    pickerHost.classList.remove("d-none");
    pickerHost.show();
  };
  window.__finishImagePick = function(name) {
    if (pickerCallback) {
      const cb = pickerCallback;
      pickerCallback = null;
      cb(name);
    }
    if (pickerHost) {
      pickerHost.hide();
      // The page slides off-screen on hide(), but Playwright counts an off-canvas
      // element as visible. Add d-none (immediately for tests; after slide for UI).
      const ms = pickerHost.slideDuration || 0;
      setTimeout(function() { pickerHost.classList.add("d-none"); }, ms > 0 ? ms + 50 : 0);
    }
  };
  document.addEventListener("smd-image-picker-select", function(e) {
    window.__finishImagePick(e.detail ? e.detail.name : null);
  });

  document.addEventListener("smd-image-select-action", function(e) {
    const path = e.composedPath ? e.composedPath() : [];
    const sel = (path && path.find(function(el) { return el && el.tagName === "SMD-IMAGE-SELECT"; })) || null;
    if (!sel || !sel.id) return;
    if (sel.id === "streamImageSelect") {
      window.__openImagePicker(function(name) { editField("image", name); updateStreamImagePreview(name); });
    } else if (sel.id === "jobImageSelect") {
      window.__openImagePicker(function(name) { jobField("image", name); updateJobImagePreview(name); });
    }
  });

  if (typeof updateMinioMenu === "function") updateMinioMenu();
});

// PWA PULL-TO-REFRESH
(function() {
  if (!("serviceWorker" in navigator)) return;
  const THRESHOLD = 80;
  let startY = 0, pulling = false, pullDist = 0;
  const indicator = document.createElement("div");
  indicator.id = "pwa-pull-indicator";
  indicator.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;align-items:center;justify-content:center;height:0;overflow:hidden;background:var(--bs-body-bg);transition:height 0.1s;color:var(--bs-body-color)";
  indicator.textContent = "\u21E9 Pull to refresh";
  document.body.appendChild(indicator);
  const spinner = document.createElement("div");
  spinner.id = "pwa-pull-spinner";
  spinner.style.cssText = "position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);z-index:10000;display:none;width:40px;height:40px;border:4px solid var(--bs-border-color);border-top-color:var(--bs-primary);border-radius:50%;animation:pwa-spin 0.6s linear infinite";
  document.body.appendChild(spinner);
  const style = document.createElement("style");
  style.textContent = "@keyframes pwa-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}";
  document.head.appendChild(style);
  function adjustIcon(dist) {
    indicator.innerHTML = dist >= THRESHOLD ? "\u21E9 Release to refresh" : "\u21E9 Pull to refresh";
    indicator.style.height = Math.min(dist, 50) + "px";
  }
  document.addEventListener("touchstart", e => {
    if (window.scrollY !== 0) return;
    if (e.target.closest(".modal")) return;
    startY = e.touches[0].clientY; pulling = true; pullDist = 0;
  }, { passive: true });
  document.addEventListener("touchmove", e => {
    if (!pulling) return;
    if (e.defaultPrevented) { pulling = false; pullDist = 0; indicator.style.height = "0"; return; }
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { pullDist = 0; return; }
    pullDist = dy; adjustIcon(dy);
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (!pulling) return;
    pulling = false; indicator.style.height = "0";
    if (pullDist >= THRESHOLD) { spinner.style.display = "block"; setTimeout(() => { location.reload(); }, 400); }
    pullDist = 0;
  }, { passive: true });
})();
