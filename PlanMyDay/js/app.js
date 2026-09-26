// PlanMyDay app entry point: dev-mode flag, shared image library wiring, and
// the DOM event wiring that binds the page/editor components to their logic.
//
// The app is split into classic scripts (no modules) so every top-level
// function stays a global — generated HTML uses inline onclick handlers and
// the Playwright suite calls these functions from page.evaluate(). Sibling
// files carry the actual features:
//   js/display.js      — Font/Image/Touch size display settings
//   js/image-picker.js — shared image picker glue + image "Edit" buttons
//   js/pwa.js          — PWA pull-to-refresh

// DEV MODE
window.isDevMode = new URLSearchParams(window.location.search).get("dev") === "true";

// All apps share ONE image library on this origin (`shared-images`).
SmdConfig.imagePrefix = "shared-";

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

  const savedTheme = getStoredTheme();
  applyTheme(savedTheme);
  if (typeof migrateImagesToShared === "function") migrateImagesToShared();
  if (typeof seedSampleImages === "function") seedSampleImages();

  applyImageSize();
  applyTouchSize();
  renderMain();

  // The settings Display tab uses the shared <smd-theme> component; apply the
  // chosen theme when it fires smd-theme-change.
  document.addEventListener("smd-theme-change", function (e) {
    const detail = e.detail || {};
    if (detail.source === "mode" && typeof changeThemeMode === "function") {
      changeThemeMode(detail.mode);
    } else if (detail.theme && typeof changeTheme === "function") {
      changeTheme(detail.theme);
    }
  });

  if (typeof updateMinioMenu === "function") updateMinioMenu();
});