// ListOfLists app entry point: dev-mode flag, shared image library wiring, and
// the DOM event wiring that binds the page/editor components to their logic.
//
// The app is split into classic scripts (no modules) so every top-level
// function stays a global — generated HTML uses inline onclick handlers and
// the Playwright suite calls these functions from page.evaluate(). Sibling
// files carry the actual features:
//   js/display.js      — Font/Image/Touch size display settings
//   js/image-picker.js — shared image picker glue + image "Edit" buttons

// DEV MODE
window.isDevMode = new URLSearchParams(window.location.search).get("dev") === "true";

// App namespace: every localStorage key this app writes is prefixed with it.
SmdConfig.storagePrefix = "lol_";
SmdConfig.appName = "List of Lists";

// All apps share ONE image library on this origin (`shared-images`).
SmdConfig.imagePrefix = "shared-";
// OneDrive default backup directory (each app keeps its own, inside the drive).
SmdConfig.oneDriveDefaultDirectory = "MyApps/ListOfLists";

// MinIO: ListOfLists backs up its OWN categories (with nested lists) + images,
// not PlanMyDay's `streams`, and names the object listoflists-<timestamp>.json.
// The import page hands the parsed JSON to the shared app hook, which restores
// the same data and closes the page itself.
SmdConfig.minioExportPrefix = "listoflists";
SmdConfig.minioExportData = lolExportPayload;
SmdConfig.onMinioImport = function (data, key) {
  if (!lolImportBackup(data)) return false;
  closeMinioImport();
  showMinioAlert("Imported " + key + " successfully.", "info");
  if (typeof regenerateTiles === "function") regenerateTiles();
  return true;
};

// FileSync (Minio/OneDrive) hooks: same payload, provider-neutral UI.
SmdConfig.fileSyncExportPrefix = "listoflists";
SmdConfig.fileSyncExportData = lolExportPayload;
SmdConfig.onFileSyncImport = function (provider, data, key) {
  if (!lolImportBackup(data)) return false;
  closeFileSyncImport(provider);
  showFileSyncAlert(provider, "Imported " + key + " successfully.", "info");
  if (typeof regenerateTiles === "function") regenerateTiles();
  return true;
};

document.addEventListener("DOMContentLoaded", () => {
  const settingsPage = document.getElementById("settingsPage");
  if (settingsPage) {
    settingsPage.addEventListener("smd-page-action", () => closeSettings());
  }

  const listEditPage = document.getElementById("listEditPage");
  if (listEditPage) {
    listEditPage.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (!action) return;
      if (action === "edit") {
        editListFromView();
      } else if (action === "cancel") {
        cancelListEdit();
      } else if (action === "done") {
        doneListEdit();
      } else if (action === "delete") {
        deleteListFromEdit();
      }
    });
    listEditPage.addEventListener("smd-image-dropdown-change", (e) => {
      var newIdx = categoryIndexByName(e.detail.name);
      if (newIdx >= 0) listChangeCategory(newIdx);
    });
    listEditPage.addEventListener("lol-list-item-change", (e) => {
      listItemField(e.detail.index, e.detail.field, e.detail.value);
    });
    listEditPage.addEventListener("lol-list-item-note-toggle", (e) => {
      if (listsBuffer && listsBuffer.items && listsBuffer.items[e.detail.index]) {
        listsBuffer.items[e.detail.index].noteOpen = e.detail.open;
      }
    });
    listEditPage.addEventListener("lol-list-item-delete", (e) => {
      listDeleteItem(e.detail.index);
    });
  }

  const categoryEditPage = document.getElementById("categoryEditPage");
  if (categoryEditPage) {
    categoryEditPage.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "cancel") {
        cancelEdit();
      } else if (action === "done") {
        doneEdit();
      }
    });
  }

  const categoriesEditorPage = document.getElementById("categoriesEditor");
  if (categoriesEditorPage) {
    categoriesEditorPage.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "add") {
        addNewCategory();
      } else if (action === "done") {
        closeCategoriesEditor();
      }
    });

    categoriesEditorPage.addEventListener("lol-category-toggle", (e) => {
      setCategoryExpanded(e.detail.categoryIdx, e.detail.expanded);
    });
    categoriesEditorPage.addEventListener("lol-edit", (e) => {
      editCategory(e.detail.categoryIdx);
    });
    categoriesEditorPage.addEventListener("lol-add-list", (e) => {
      addNewListForCategory(e.detail.categoryIdx);
    });
    categoriesEditorPage.addEventListener("lol-delete", (e) => {
      confirmDeleteCategory(e.detail.categoryIdx);
    });
    categoriesEditorPage.addEventListener("lol-list-edit", (e) => {
      editListInAccordion(e.detail.categoryIdx, e.detail.listIdx);
    });
    categoriesEditorPage.addEventListener("lol-list-toggle-active", (e) => {
      handleAccordionListActiveToggle(e.detail.categoryIdx, e.detail.listIdx, e.detail.checked);
    });
  }

  const listSearchEditorPage = document.getElementById("listSearchEditor");
  if (listSearchEditorPage) {
    listSearchEditorPage.addEventListener("smd-page-action", (e) => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "add") {
        addNewListFromSearch();
      } else if (action === "done") {
        closeSearchLists();
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

  if (typeof updateFileSyncMenu === "function") updateFileSyncMenu();
  else if (typeof updateMinioMenu === "function") updateMinioMenu();
});