// CountMyDays — import wizard (JSON file / sample data / QR) rendered on
// #importWizardPage, plus the QR camera import page. The wizard steps mirror
// the original modal flow, with native <select>s instead of Bootstrap
// dropdowns (Bootstrap JS does not work inside shadow roots).

// <import-wizard-page> content is light DOM (native <select>s work in the
// document, no shadow-root workaround needed).
let importWizardState = null;

function iwPage() {
  return document.getElementById("importWizardPage");
}

function iwQuery(sel) {
  const page = iwPage();
  return page ? page.querySelector(sel) : document.querySelector(sel);
}

function iwQueryAll(sel) {
  const page = iwPage();
  return page
    ? Array.from(page.querySelectorAll(sel))
    : Array.from(document.querySelectorAll(sel));
}

function iwThumb(name, size) {
  if (!name) return `<div class="ew-thumb-empty" style="width:${size || 32}px;height:${size || 32}px"></div>`;
  return `<smd-image key-prefix="${escAttr(smdImagePrefix())}" image="${escAttr(name)}" size="${size || 32}"></smd-image>`;
}

// ---- entry points ----

function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";

  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const json = JSON.parse(evt.target.result);
        if (!json.dates || !json.categories || !json.images) {
          alert("Invalid JSON file — missing required fields.");
          return;
        }
        startImportWizard(json);
      } catch (err) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function importSampleData() {
  const cacheBuster = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now();
  showSpinner();
  fetch("js/sampleData.json?v=" + cacheBuster)
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(json => {
      hideSpinner();
      if (!json.dates || !json.categories || !json.images) {
        alert("Sample data file is missing required fields.");
        return;
      }
      startImportWizard(json);
    })
    .catch(err => {
      hideSpinner();
      alert("Failed to load sample data: " + err.message);
    });
}

function showSpinner() {
  let el = document.getElementById("spinnerOverlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "spinnerOverlay";
    el.className = "d-none";
    el.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;";
    el.innerHTML = '<div class="spinner-border text-light" style="width:3rem;height:3rem" role="status"><span class="visually-hidden">Loading…</span></div>';
    document.body.appendChild(el);
  }
  el.classList.remove("d-none");
}

function hideSpinner() {
  const el = document.getElementById("spinnerOverlay");
  if (el) el.classList.add("d-none");
}

// ---- wizard ----

function startImportWizard(data) {
  (data.images || []).forEach(img => { img.name = (img.name || "").trim(); });
  (data.categories || []).forEach(c => { c.name = (c.name || "").trim(); });
  (data.dates || []).forEach(d => { d.name = (d.name || "").trim(); });

  importWizardState = {
    data: data,
    step: "sectionPrompt",
    sectionPrompt: null,
    imageStatus: [],
    imageDecisions: [],
    conflictImages: [],
    conflictIdx: 0,
    renameMap: {},
    catStatus: [],
    catDecisions: [],
    catConflicts: [],
    catConflictIdx: 0,
    catRenameMap: {},
    catRenameMapGlobal: {},
    dateStatus: [],
    dateDecisions: [],
    dateConflicts: [],
    dateConflictIdx: 0,
    dateRenameMap: {}
  };

  openImportWizardPage();
  showNextSectionPrompt();
}

function openImportWizardPage() {
  hideMainPages("importWizardPage");
  const page = iwPage();
  if (!page) return;
  page.classList.remove("d-none");
  injectEditorStyles(page);
  if (!page.__cmdBound) {
    page.__cmdBound = true;
    page.addEventListener("smd-page-action", e => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "cancel" || action === "close") closeImportWizard();
      else if (action === "skip") answerSectionPrompt(false);
      else if (action === "import") answerSectionPrompt(true);
      else if (action === "resolve-image") resolveImageConflict();
      else if (action === "apply-images") finishImageStage();
      else if (action === "resolve-category") resolveCategoryConflict();
      else if (action === "apply-categories") finishCategoryStage();
      else if (action === "resolve-date") resolveDateConflict();
      else if (action === "apply-dates") finishDateStage();
    });
  }
  page.show();
}

function showNextSectionPrompt(afterSection) {
  const state = importWizardState;
  const sections = ["images", "categories", "dates"];
  const startIdx = afterSection ? sections.indexOf(afterSection) + 1 : 0;

  for (let i = startIdx; i < sections.length; i++) {
    const sec = sections[i];
    if ((state.data[sec] || []).length > 0) {
      state.sectionPrompt = sec;
      state.step = "sectionPrompt";
      renderImportWizard();
      return;
    }
  }

  state.step = "complete";
  renderImportWizard();
}

function answerSectionPrompt(importIt) {
  const state = importWizardState;
  const section = state.sectionPrompt;

  if (importIt) {
    if (section === "images") {
      preprocessImages();
      state.step = "images";
      state.sectionPrompt = null;
    } else if (section === "categories") {
      preprocessCategories();
      state.step = "categories";
      state.sectionPrompt = null;
    } else if (section === "dates") {
      preprocessDates();
      state.step = "dates";
      state.sectionPrompt = null;
    }
  } else {
    if (section === "images") {
      state.imageDecisions = (state.data.images || []).map(() => ({ action: "discard" }));
      state.imageStatus = (state.data.images || []).map(() => "autoDiscard");
      state.conflictImages = [];
      state.conflictIdx = 0;
      finishImageStage();
      return;
    } else if (section === "categories") {
      state.catDecisions = (state.data.categories || []).map(() => ({ action: "discard" }));
      state.catStatus = (state.data.categories || []).map(() => "autoDiscard");
      state.catConflicts = [];
      state.catConflictIdx = 0;
      finishCategoryStage();
      return;
    } else if (section === "dates") {
      state.dateDecisions = (state.data.dates || []).map(() => ({ action: "discard" }));
      state.dateStatus = (state.data.dates || []).map(() => "autoDiscard");
      state.dateConflicts = [];
      state.dateConflictIdx = 0;
      finishDateStage();
      return;
    }
  }

  renderImportWizard();
}

function closeImportWizard() {
  importWizardState = null;
  const page = iwPage();
  if (page) {
    page.hide();
    setTimeout(() => page.classList.add("d-none"), Math.max(0, (page.slideDuration || 0) + 50));
  }
  renderMain();
}

function imagesEqual(imgA, imgB) {
  if (imgA.data !== imgB.data) return false;
  if (imgA.data && imgA.data.startsWith("data:image/svg+xml,") &&
      imgB.data && imgB.data.startsWith("data:image/svg+xml,")) {
    const ca = getImageColors(imgA.data);
    const cb = getImageColors(imgB.data);
    if (ca.line !== cb.line || ca.fill !== cb.fill) return false;
  }
  return true;
}

function preprocessImages() {
  const state = importWizardState;
  const existingImages = loadImages();
  const imageStatus = [];
  const imageDecisions = [];
  const conflictImages = [];

  (state.data.images || []).forEach((img, idx) => {
    const existing = existingImages.find(e => e.name === img.name);
    if (!existing) {
      imageStatus[idx] = "autoImport";
      imageDecisions[idx] = { action: "import" };
    } else if (imagesEqual(img, existing)) {
      imageStatus[idx] = "autoDiscard";
      imageDecisions[idx] = { action: "discard" };
    } else {
      imageStatus[idx] = "conflict";
      conflictImages.push(idx);
      imageDecisions[idx] = null;
    }
  });

  state.imageStatus = imageStatus;
  state.imageDecisions = imageDecisions;
  state.conflictImages = conflictImages;
  state.conflictIdx = 0;
  state.renameMap = {};
}

function renderImportWizard() {
  const page = iwPage();
  const state = importWizardState;
  if (!page || !state) return;

  if (state.step === "sectionPrompt") renderSectionPrompt(page);
  else if (state.step === "images") renderImageStage(page);
  else if (state.step === "categories") renderCategoryStage(page);
  else if (state.step === "dates") renderDateStage(page);
  else if (state.step === "complete") renderComplete(page);
}

function renderSectionPrompt(page) {
  const state = importWizardState;
  const section = state.sectionPrompt;
  const count = (state.data[section] || []).length;
  const sectionLabel = section.charAt(0).toUpperCase() + section.slice(1);
  page.title = sectionLabel;
  page.content = `<p>Do you want to import the <strong>${count} ${section}</strong> included in this data?</p>`;
  page.buttons = [
    { text: "Cancel", variant: "secondary", action: "cancel", close: false },
    { text: "Skip", variant: "danger", action: "skip", close: false },
    { text: "Import", variant: "primary", action: "import", close: false }
  ];
}

function getImageColorDisplay(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:image/svg+xml,")) return { line: null, fill: null };
  const colors = getImageColors(dataUrl);
  return {
    line: colors.line || null,
    fill: colors.fill || null
  };
}

function renderImageStage(page) {
  const state = importWizardState;
  const totalConflicts = state.conflictImages.length;

  if (state.conflictIdx < totalConflicts) {
    const imgIdx = state.conflictImages[state.conflictIdx];
    const importImg = state.data.images[imgIdx];
    const existingImages = loadImages();
    const existingImg = existingImages.find(e => e.name === importImg.name);

    const colorsImport = getImageColorDisplay(importImg.data);
    const colorsExisting = getImageColorDisplay(existingImg ? existingImg.data : "");

    page.title = `Image ${state.conflictIdx + 1} of ${totalConflicts}`;

    page.content = `
      <p class="mb-3">An image with the name "<strong>${escapeHtml(importImg.name)}</strong>" already exists but the content is different. Choose what to do:</p>
      <div class="d-flex gap-3 mb-3 justify-content-center flex-wrap">
        <div class="text-center" style="flex:1;min-width:140px">
          <h6>Current Image</h6>
          ${existingImg && existingImg.data ? `<smd-image key-prefix="${escAttr(smdImagePrefix())}" image="${escAttr(existingImg.name)}"></smd-image>` : '<div class="text-secondary">No preview</div>'}
          <div class="small mt-1 text-secondary">${colorsExisting.line !== null ? `Line: ${escapeHtml(colorsExisting.line)}` : ""}${colorsExisting.line !== null && colorsExisting.fill !== null ? " | " : ""}${colorsExisting.fill !== null ? `Fill: ${escapeHtml(colorsExisting.fill)}` : ""}</div>
        </div>
        <div class="text-center" style="flex:1;min-width:140px">
          <h6>Imported Image</h6>
          ${importImg.data ? `<img src="${importImg.data}" style="max-width:100%;max-height:150px;object-fit:contain" class="border rounded p-1">` : '<div class="text-secondary">No preview</div>'}
          <div class="small mt-1 text-secondary">${colorsImport.line !== null ? `Line: ${escapeHtml(colorsImport.line)}` : ""}${colorsImport.line !== null && colorsImport.fill !== null ? " | " : ""}${colorsImport.fill !== null ? `Fill: ${escapeHtml(colorsImport.fill)}` : ""}</div>
        </div>
      </div>
      <div class="mb-2">
        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="imgConflictChoice" id="imgSkip" value="skip" checked onchange="toggleImageRenameInput();toggleImageUseExisting()">
          <label class="form-check-label" for="imgSkip">Skip - don't import this image</label>
        </div>
        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="imgConflictChoice" id="imgOverwrite" value="overwrite" onchange="toggleImageRenameInput();toggleImageUseExisting()">
          <label class="form-check-label" for="imgOverwrite">Replace - overwrite the existing image with the imported one</label>
        </div>
        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="imgConflictChoice" id="imgKeepBoth" value="keepBoth" onchange="toggleImageRenameInput();toggleImageUseExisting()">
          <label class="form-check-label" for="imgKeepBoth">
            <span style="display:inline-block;min-width:240px">Keep Both - import with a different name:</span>
            <input type="text" id="imgNewName" class="form-control" style="width:auto;min-width:200px;display:inline-block" value="${escAttr(importImg.name)}" disabled oninput="validateNewImageName(this)">
          </label>
          <div class="text-danger small" style="display:none" id="imgNewNameError">ERROR: There is already an image with this name.</div>
        </div>
        <div class="form-check">
          <input class="form-check-input" type="radio" name="imgConflictChoice" id="imgUseExisting" value="useExisting" onchange="toggleImageRenameInput();toggleImageUseExisting()">
          <label class="form-check-label" for="imgUseExisting">
            <span style="display:inline-block;min-width:240px">Use Existing - map import to another image:</span>
            <select class="form-select" id="imgExistingSelect" style="width:auto;min-width:180px;display:inline-block" disabled>
              <option value="">Select image</option>
              ${existingImages.filter(e => e.name !== importImg.name).sort((a, b) => a.name.localeCompare(b.name)).map(e => `<option value="${escAttr(e.name)}">${escapeHtml(e.name)}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
    `;

    page.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel", close: false },
      { text: "Next", variant: "primary", action: "resolve-image", close: false }
    ];
  } else {
    const imported = state.imageDecisions.filter(d => d && (d.action === "import" || d.action === "overwrite" || d.action === "keepBoth")).length;
    const discarded = state.imageDecisions.filter(d => d && d.action === "discard").length;
    const total = state.data.images.length;
    const autoImport = state.imageStatus.filter(s => s === "autoImport").length;
    const autoDiscard = state.imageStatus.filter(s => s === "autoDiscard").length;

    page.title = "Image Summary";

    page.content = `
      <p>Image processing complete.</p>
      <ul>
        <li>${autoImport} new image(s) - will be imported</li>
        <li>${autoDiscard} duplicate(s) - will be skipped</li>
        ${state.conflictImages.length > 0 ? `<li>${state.conflictImages.length} conflict(s) resolved: ${imported - autoImport} to import, ${discarded - autoDiscard} skipped</li>` : ""}
      </ul>
      <p class="text-secondary">Total: ${total} image(s) in import.</p>
    `;

    page.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel", close: false },
      { text: "Apply & Continue", variant: "primary", action: "apply-images", close: false }
    ];
  }
}

function validateNewImageName(input) {
  const name = input.value.trim();
  const errorEl = iwQuery("#imgNewNameError");
  const existingImages = loadImages();
  const state = importWizardState;
  const imgIdx = state.conflictImages[state.conflictIdx];
  const importName = state.data.images[imgIdx].name;

  const existingConflict = existingImages.some(e => e.name === name && e.name !== importName);

  const otherDecisionsConflict = state.imageDecisions.some((d, i) => {
    if (i === imgIdx || !d) return false;
    if (d.action === "import") return state.data.images[i].name === name;
    if (d.action === "keepBoth") return d.renameTo === name;
    return false;
  });

  const conflict = existingConflict || otherDecisionsConflict;

  if (errorEl) {
    errorEl.style.display = (name && !conflict) ? "none" : "block";
  }
}

function toggleImageRenameInput() {
  const keepBoth = iwQuery("#imgKeepBoth");
  const input = iwQuery("#imgNewName");
  if (keepBoth && input) {
    input.disabled = !keepBoth.checked;
    if (keepBoth.checked) input.focus();
  }
}

function toggleImageUseExisting() {
  const useExisting = iwQuery("#imgUseExisting");
  const select = iwQuery("#imgExistingSelect");
  if (useExisting && select) {
    select.disabled = !useExisting.checked;
  }
}

function resolveImageConflict() {
  const state = importWizardState;
  const imgIdx = state.conflictImages[state.conflictIdx];
  const choice = iwQuery('input[name="imgConflictChoice"]:checked');
  if (!choice) return;

  if (choice.value === "skip") {
    state.imageDecisions[imgIdx] = { action: "discard" };
  } else if (choice.value === "overwrite") {
    state.imageDecisions[imgIdx] = { action: "overwrite" };
  } else if (choice.value === "keepBoth") {
    const newName = iwQuery("#imgNewName").value.trim();
    const errorEl = iwQuery("#imgNewNameError");
    if (!newName || (errorEl && errorEl.style.display !== "none")) return;
    state.imageDecisions[imgIdx] = { action: "keepBoth", renameTo: newName };
    state.renameMap[imgIdx] = newName;
    applyImageRename(state.data.images[imgIdx].name, newName);
  } else if (choice.value === "useExisting") {
    const select = iwQuery("#imgExistingSelect");
    const replaceWith = select ? select.value : "";
    if (!replaceWith) return;
    state.imageDecisions[imgIdx] = { action: "useExisting", replaceWith: replaceWith };
    state.renameMap[imgIdx] = replaceWith;
    applyImageRename(state.data.images[imgIdx].name, replaceWith);
  }

  state.conflictIdx++;
  renderImportWizard();
}

function applyImageRename(oldName, newName) {
  const state = importWizardState;
  (state.data.categories || []).forEach(c => {
    if (c.image === oldName) c.image = newName;
  });
  (state.data.dates || []).forEach(d => {
    if (d.image === oldName) d.image = newName;
  });
}

function finishImageStage() {
  const state = importWizardState;
  const existingImages = loadImages();
  const renameMap = {};

  state.data.images.forEach((img, idx) => {
    const decision = state.imageDecisions[idx];
    if (!decision) return;

    if (decision.action === "import") {
      const newImg = { name: img.name, data: img.data };
      if (img.lineColor) newImg.lineColor = img.lineColor;
      if (img.fillColor) newImg.fillColor = img.fillColor;
      existingImages.push(newImg);
    } else if (decision.action === "overwrite") {
      const existing = existingImages.find(e => e.name === img.name);
      if (existing) {
        existing.data = img.data;
        if (img.lineColor || img.fillColor) {
          if (img.lineColor) existing.lineColor = img.lineColor;
          if (img.fillColor) existing.fillColor = img.fillColor;
        }
      }
    } else if (decision.action === "keepBoth") {
      const renamed = { name: decision.renameTo, data: img.data };
      if (img.lineColor) renamed.lineColor = img.lineColor;
      if (img.fillColor) renamed.fillColor = img.fillColor;
      existingImages.push(renamed);
      renameMap[img.name] = decision.renameTo;
    } else if (decision.action === "useExisting") {
      renameMap[img.name] = decision.replaceWith;
    }
  });

  saveImages(existingImages);

  state.renameMapGlobal = renameMap;

  (state.data.categories || []).forEach(c => {
    if (c.image && renameMap[c.image]) c.image = renameMap[c.image];
  });
  (state.data.dates || []).forEach(d => {
    if (d.image && renameMap[d.image]) d.image = renameMap[d.image];
  });

  showNextSectionPrompt("images");
}

// ---- categories ----

function preprocessCategories() {
  const state = importWizardState;
  const existingCategories = loadCategories();
  const catStatus = [];
  const catDecisions = [];
  const catConflicts = [];

  (state.data.categories || []).forEach((cat, idx) => {
    const existing = existingCategories.find(e => e.name === cat.name);
    if (!existing) {
      catStatus[idx] = "autoImport";
      catDecisions[idx] = { action: "import" };
    } else if (existing.image === cat.image) {
      catStatus[idx] = "autoDiscard";
      catDecisions[idx] = { action: "discard" };
    } else {
      catStatus[idx] = "conflict";
      catConflicts.push(idx);
      catDecisions[idx] = null;
    }
  });

  state.catStatus = catStatus;
  state.catDecisions = catDecisions;
  state.catConflicts = catConflicts;
  state.catConflictIdx = 0;
  state.catRenameMap = {};
}

function renderCategoryStage(page) {
  const state = importWizardState;
  const totalConflicts = state.catConflicts.length;

  if (state.catConflictIdx < totalConflicts) {
    const catIdx = state.catConflicts[state.catConflictIdx];
    const importCat = state.data.categories[catIdx];
    const existingCategories = loadCategories();
    const existingCat = existingCategories.find(e => e.name === importCat.name);
    const allImages = loadImages();

    const existingImg = existingCat && existingCat.image ? allImages.find(i => i.name === existingCat.image) : null;

    page.title = `Category ${state.catConflictIdx + 1} of ${totalConflicts}`;

    page.content = `
      <p class="mb-3">A category with the name "<strong>${escapeHtml(importCat.name)}</strong>" already exists with a different image. Choose what to do:</p>
      <div class="d-flex gap-3 mb-3 justify-content-center flex-wrap">
        <div class="text-center" style="flex:1;min-width:140px">
          <h6>Current Category</h6>
          <div class="fw-bold mb-1">${escapeHtml(existingCat ? existingCat.name : "")}</div>
          ${existingImg ? `<smd-image key-prefix="${escAttr(smdImagePrefix())}" image="${escAttr(existingImg.name)}"></smd-image>` : '<div class="text-secondary">No image</div>'}
          <div class="small mt-1 text-secondary">Image: ${existingCat && existingCat.image ? escapeHtml(existingCat.image) : "None"}</div>
        </div>
        <div class="text-center" style="flex:1;min-width:140px">
          <h6>Imported Category</h6>
          <div class="fw-bold mb-1">${escapeHtml(importCat.name)}</div>
          ${iwThumb(importCat.image, 64)}
          <div class="small mt-1 text-secondary">Image: ${importCat.image ? escapeHtml(importCat.image) : "None"}</div>
        </div>
      </div>
      <div class="mb-2">
        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="catConflictChoice" id="catSkip" value="skip" checked onchange="toggleCategoryRenameInput();toggleCategoryUseExisting()">
          <label class="form-check-label" for="catSkip">Skip - don't import this category</label>
        </div>
        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="catConflictChoice" id="catOverwrite" value="overwrite" onchange="toggleCategoryRenameInput();toggleCategoryUseExisting()">
          <label class="form-check-label" for="catOverwrite">Replace - overwrite the existing category with the imported one</label>
        </div>
        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="catConflictChoice" id="catKeepBoth" value="keepBoth" onchange="toggleCategoryRenameInput();toggleCategoryUseExisting()">
          <label class="form-check-label" for="catKeepBoth">
            <span style="display:inline-block;min-width:240px">Keep Both - import with a different name:</span>
            <input type="text" id="catNewName" class="form-control" style="width:auto;min-width:200px;display:inline-block" value="${escAttr(importCat.name)}" disabled oninput="validateNewCategoryName(this)">
          </label>
          <div class="text-danger small" style="display:none" id="catNewNameError">ERROR: There is already a category with this name.</div>
        </div>
        <div class="form-check">
          <input class="form-check-input" type="radio" name="catConflictChoice" id="catUseExisting" value="useExisting" onchange="toggleCategoryRenameInput();toggleCategoryUseExisting()">
          <label class="form-check-label" for="catUseExisting">
            <span style="display:inline-block;min-width:240px">Use Existing - map import to another category:</span>
            <select class="form-select" id="catExistingSelect" style="width:auto;min-width:180px;display:inline-block" disabled>
              <option value="">Select category</option>
              ${existingCategories.filter(e => e.name !== importCat.name).sort((a, b) => a.name.localeCompare(b.name)).map(e => `<option value="${escAttr(e.name)}">${escapeHtml(e.name)}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
    `;

    page.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel", close: false },
      { text: "Next", variant: "primary", action: "resolve-category", close: false }
    ];
  } else {
    const imported = state.catDecisions.filter(d => d && (d.action === "import" || d.action === "overwrite" || d.action === "keepBoth")).length;
    const discarded = state.catDecisions.filter(d => d && d.action === "discard").length;
    const total = (state.data.categories || []).length;
    const autoImport = state.catStatus.filter(s => s === "autoImport").length;
    const autoDiscard = state.catStatus.filter(s => s === "autoDiscard").length;

    page.title = "Category Summary";

    page.content = `
      <p>Category processing complete.</p>
      <ul>
        <li>${autoImport} new categor(ies) - will be imported</li>
        <li>${autoDiscard} duplicate(s) - will be skipped</li>
        ${state.catConflicts.length > 0 ? `<li>${state.catConflicts.length} conflict(s) resolved: ${imported - autoImport} to import, ${discarded - autoDiscard} skipped</li>` : ""}
      </ul>
      <p class="text-secondary">Total: ${total} categor(ies) in import.</p>
    `;

    page.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel", close: false },
      { text: "Apply & Continue", variant: "primary", action: "apply-categories", close: false }
    ];
  }
}

function toggleCategoryUseExisting() {
  const choice = iwQuery('input[name="catConflictChoice"]:checked');
  const select = iwQuery("#catExistingSelect");
  if (select) select.disabled = !choice || choice.value !== "useExisting";
}

function toggleCategoryRenameInput() {
  const keepBoth = iwQuery("#catKeepBoth");
  const input = iwQuery("#catNewName");
  if (keepBoth && input) {
    input.disabled = !keepBoth.checked;
    if (keepBoth.checked) input.focus();
  }
}

function validateNewCategoryName(input) {
  const name = input.value.trim();
  const errorEl = iwQuery("#catNewNameError");
  const existingCategories = loadCategories();
  const state = importWizardState;
  const catIdx = state.catConflicts[state.catConflictIdx];
  const importName = state.data.categories[catIdx].name;

  const existingConflict = existingCategories.some(e => e.name === name && e.name !== importName);

  const otherDecisionsConflict = state.catDecisions.some((d, i) => {
    if (i === catIdx || !d) return false;
    if (d.action === "import") return state.data.categories[i].name === name;
    if (d.action === "keepBoth") return d.renameTo === name;
    return false;
  });

  const conflict = existingConflict || otherDecisionsConflict;

  if (errorEl) {
    errorEl.style.display = (name && !conflict) ? "none" : "block";
  }
}

function resolveCategoryConflict() {
  const state = importWizardState;
  const catIdx = state.catConflicts[state.catConflictIdx];
  const choice = iwQuery('input[name="catConflictChoice"]:checked');
  if (!choice) return;

  if (choice.value === "skip") {
    state.catDecisions[catIdx] = { action: "discard" };
  } else if (choice.value === "overwrite") {
    state.catDecisions[catIdx] = { action: "overwrite" };
  } else if (choice.value === "keepBoth") {
    const newName = iwQuery("#catNewName").value.trim();
    const errorEl = iwQuery("#catNewNameError");
    if (!newName || (errorEl && errorEl.style.display !== "none")) return;
    state.catDecisions[catIdx] = { action: "keepBoth", renameTo: newName };
    state.catRenameMap[catIdx] = newName;
  } else if (choice.value === "useExisting") {
    const select = iwQuery("#catExistingSelect");
    const selected = select ? select.value : "";
    if (!selected) return;
    state.catDecisions[catIdx] = { action: "useExisting", useExisting: selected };
    state.catRenameMap[catIdx] = selected;
  }

  state.catConflictIdx++;
  renderImportWizard();
}

function finishCategoryStage() {
  const state = importWizardState;
  const existingCategories = loadCategories();
  const catRenameMap = {};

  (state.data.categories || []).forEach((cat, idx) => {
    const decision = state.catDecisions[idx];
    if (!decision) return;

    if (decision.action === "import") {
      existingCategories.push({ name: cat.name, image: cat.image || null });
    } else if (decision.action === "overwrite") {
      const existing = existingCategories.find(e => e.name === cat.name);
      if (existing) {
        existing.image = cat.image || null;
      }
    } else if (decision.action === "keepBoth") {
      existingCategories.push({ name: decision.renameTo, image: cat.image || null });
      catRenameMap[cat.name] = decision.renameTo;
    } else if (decision.action === "useExisting") {
      catRenameMap[cat.name] = decision.useExisting;
    }
  });

  saveCategories(existingCategories);

  state.catRenameMapGlobal = catRenameMap;

  (state.data.dates || []).forEach(d => {
    if (d.category && catRenameMap[d.category]) d.category = catRenameMap[d.category];
  });

  showNextSectionPrompt("categories");
}

// ---- dates ----

function datesEqual(a, b) {
  if (a.type !== b.type) return false;
  if (a.day !== b.day) return false;
  if (a.month !== b.month) return false;
  if (a.type === "once" && a.year !== b.year) return false;
  if ((a.category || "") !== (b.category || "")) return false;
  if ((a.image || "") !== (b.image || "")) return false;
  return true;
}

function preprocessDates() {
  const state = importWizardState;
  const existingDates = loadDates();
  const dateStatus = [];
  const dateDecisions = [];
  const dateConflicts = [];

  (state.data.dates || []).forEach((d, idx) => {
    const existing = existingDates.filter(e => e.name === d.name);
    if (existing.length === 0) {
      dateStatus[idx] = "autoImport";
      dateDecisions[idx] = { action: "import" };
    } else if (existing.some(e => datesEqual(d, e))) {
      dateStatus[idx] = "autoDiscard";
      dateDecisions[idx] = { action: "discard" };
    } else {
      dateStatus[idx] = "conflict";
      dateConflicts.push(idx);
      dateDecisions[idx] = null;
    }
  });

  state.dateStatus = dateStatus;
  state.dateDecisions = dateDecisions;
  state.dateConflicts = dateConflicts;
  state.dateConflictIdx = 0;
  state.dateRenameMap = {};
}

function renderDateStage(page) {
  const state = importWizardState;
  const totalConflicts = state.dateConflicts.length;

  if (state.dateConflictIdx < totalConflicts) {
    const dIdx = state.dateConflicts[state.dateConflictIdx];
    const importDate = state.data.dates[dIdx];
    const existingDates = loadDates();
    const existingSameName = existingDates.filter(e => e.name === importDate.name);
    const categories = loadCategories();

    const existingPick = existingSameName[0];

    function catImg(name) {
      const cat = categories.find(c => c.name === name);
      if (!cat || !cat.image) return null;
      const img = loadImages().find(i => i.name === cat.image);
      return img ? img.name : null;
    }

    page.title = `Date ${state.dateConflictIdx + 1} of ${totalConflicts}`;

    page.content = `
      <p class="mb-3">A date with the title "<strong>${escapeHtml(importDate.name)}</strong>" already exists but the details are different. Choose what to do:</p>
      <div class="d-flex gap-3 mb-3 justify-content-center flex-wrap">
        <div class="text-center" style="flex:1;min-width:140px">
          <h6>Current Date</h6>
          <div class="fw-bold mb-1">${escapeHtml(existingPick ? existingPick.name : "")}</div>
          <div>${existingPick ? formatDateShort(existingPick) : ""}</div>
          ${existingPick ? `<div class="small text-secondary">${existingPick.type}</div>` : ""}
          <div class="d-flex justify-content-center gap-2 mt-2">
            <div>
              ${catImg(existingPick.category) ? `<smd-image key-prefix="${escAttr(smdImagePrefix())}" image="${escAttr(catImg(existingPick.category))}" size="32"></smd-image>` : '<div class="ew-thumb-empty"></div>'}
              <div class="small mt-1 text-secondary">${escapeHtml(existingPick.category || "None")}</div>
            </div>
            <div>
              ${existingPick.image ? `<smd-image key-prefix="${escAttr(smdImagePrefix())}" image="${escAttr(existingPick.image)}" size="32"></smd-image>` : '<div class="ew-thumb-empty"></div>'}
            </div>
          </div>
        </div>
        <div class="text-center" style="flex:1;min-width:140px">
          <h6>Imported Date</h6>
          <div class="fw-bold mb-1">${escapeHtml(importDate.name)}</div>
          <div>${formatDateShort(importDate)}</div>
          <div class="small text-secondary">${importDate.type}</div>
          <div class="d-flex justify-content-center gap-2 mt-2">
            <div>
              ${catImg(importDate.category) ? `<smd-image key-prefix="${escAttr(smdImagePrefix())}" image="${escAttr(catImg(importDate.category))}" size="32"></smd-image>` : '<div class="ew-thumb-empty"></div>'}
              <div class="small mt-1 text-secondary">${escapeHtml(importDate.category || "None")}</div>
            </div>
            <div>
              ${importDate.image ? `<smd-image key-prefix="${escAttr(smdImagePrefix())}" image="${escAttr(importDate.image)}" size="32"></smd-image>` : '<div class="ew-thumb-empty"></div>'}
            </div>
          </div>
        </div>
      </div>
      <div class="mb-2">
        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="dateConflictChoice" id="dateSkip" value="skip" checked onchange="toggleDateRenameInput();toggleDateUseExisting()">
          <label class="form-check-label" for="dateSkip">Skip - don't import this date</label>
        </div>
        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="dateConflictChoice" id="dateOverwrite" value="overwrite" onchange="toggleDateRenameInput();toggleDateUseExisting()">
          <label class="form-check-label" for="dateOverwrite">Replace - overwrite the existing date with the imported one</label>
        </div>
        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="dateConflictChoice" id="dateKeepBoth" value="keepBoth" onchange="toggleDateRenameInput();toggleDateUseExisting()">
          <label class="form-check-label" for="dateKeepBoth">
            <span style="display:inline-block;min-width:240px">Keep Both - import with a different name:</span>
            <input type="text" id="dateNewName" class="form-control" style="width:auto;min-width:200px;display:inline-block" value="${escAttr(importDate.name)}" disabled oninput="validateNewDateName(this)">
          </label>
          <div class="text-danger small" style="display:none" id="dateNewNameError">ERROR: There is already a date with this name.</div>
        </div>
        <div class="form-check">
          <input class="form-check-input" type="radio" name="dateConflictChoice" id="dateUseExisting" value="useExisting" onchange="toggleDateRenameInput();toggleDateUseExisting()">
          <label class="form-check-label" for="dateUseExisting">
            <span style="display:inline-block;min-width:240px">Use Existing - skip import, keep existing:</span>
            <select class="form-select" id="dateExistingSelect" style="width:auto;min-width:180px;display:inline-block" disabled>
              <option value="">Select date</option>
              ${existingDates.slice().sort((a, b) => a.name.localeCompare(b.name)).map(e => `<option value="${escAttr(e.name)}">${escapeHtml(e.name)} — ${formatDateShort(e)}${e.category ? " — " + escapeHtml(e.category) : ""}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
    `;

    page.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel", close: false },
      { text: "Next", variant: "primary", action: "resolve-date", close: false }
    ];
  } else {
    const imported = state.dateDecisions.filter(d => d && (d.action === "import" || d.action === "overwrite" || d.action === "keepBoth")).length;
    const total = (state.data.dates || []).length;
    const autoImport = state.dateStatus.filter(s => s === "autoImport").length;
    const autoDiscard = state.dateStatus.filter(s => s === "autoDiscard").length;

    page.title = "Date Summary";

    page.content = `
      <p>Date processing complete.</p>
      <ul>
        <li>${autoImport} new date(s) - will be imported</li>
        <li>${autoDiscard} duplicate(s) - will be skipped</li>
        ${state.dateConflicts.length > 0 ? `<li>${state.dateConflicts.length} conflict(s) resolved: ${imported - autoImport} to import</li>` : ""}
      </ul>
      <p class="text-secondary">Total: ${total} date(s) in import.</p>
    `;

    page.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel", close: false },
      { text: "Apply & Continue", variant: "primary", action: "apply-dates", close: false }
    ];
  }
}

function toggleDateRenameInput() {
  const keepBoth = iwQuery("#dateKeepBoth");
  const input = iwQuery("#dateNewName");
  if (keepBoth && input) {
    input.disabled = !keepBoth.checked;
    if (keepBoth.checked) input.focus();
  }
}

function toggleDateUseExisting() {
  const choice = iwQuery('input[name="dateConflictChoice"]:checked');
  const select = iwQuery("#dateExistingSelect");
  if (select) select.disabled = !choice || choice.value !== "useExisting";
}

function validateNewDateName(input) {
  const name = input.value.trim();
  const errorEl = iwQuery("#dateNewNameError");
  const existingDates = loadDates();
  const state = importWizardState;
  const dIdx = state.dateConflicts[state.dateConflictIdx];
  const importName = state.data.dates[dIdx].name;

  const existingConflict = existingDates.some(e => e.name === name && e.name !== importName);

  const otherDecisionsConflict = state.dateDecisions.some((d, i) => {
    if (i === dIdx || !d) return false;
    if (d.action === "import") return state.data.dates[i].name === name;
    if (d.action === "keepBoth") return d.renameTo === name;
    return false;
  });

  const conflict = existingConflict || otherDecisionsConflict;

  if (errorEl) {
    errorEl.style.display = (name && !conflict) ? "none" : "block";
  }
}

function resolveDateConflict() {
  const state = importWizardState;
  const dIdx = state.dateConflicts[state.dateConflictIdx];
  const choice = iwQuery('input[name="dateConflictChoice"]:checked');
  if (!choice) return;

  if (choice.value === "skip") {
    state.dateDecisions[dIdx] = { action: "discard" };
  } else if (choice.value === "overwrite") {
    state.dateDecisions[dIdx] = { action: "overwrite" };
  } else if (choice.value === "keepBoth") {
    const newName = iwQuery("#dateNewName").value.trim();
    const errorEl = iwQuery("#dateNewNameError");
    if (!newName || (errorEl && errorEl.style.display !== "none")) return;
    state.dateDecisions[dIdx] = { action: "keepBoth", renameTo: newName };
  } else if (choice.value === "useExisting") {
    const select = iwQuery("#dateExistingSelect");
    const selected = select ? select.value : "";
    if (!selected) return;
    state.dateDecisions[dIdx] = { action: "discard" };
  }

  state.dateConflictIdx++;
  renderImportWizard();
}

function finishDateStage() {
  const state = importWizardState;
  const existingDates = loadDates();

  (state.data.dates || []).forEach((d, idx) => {
    const decision = state.dateDecisions[idx];
    if (!decision) return;

    if (decision.action === "import") {
      existingDates.push({ ...d });
    } else if (decision.action === "overwrite") {
      const existing = existingDates.find(e => e.name === d.name);
      if (existing) {
        existing.type = d.type;
        existing.day = d.day;
        existing.month = d.month;
        if (d.type === "once") existing.year = d.year;
        existing.category = d.category || null;
        existing.image = d.image || null;
      }
    } else if (decision.action === "keepBoth") {
      const copy = { ...d, name: decision.renameTo };
      existingDates.push(copy);
    }
  });

  saveDates(existingDates);

  state.step = "complete";
  renderImportWizard();
}

function renderComplete(page) {
  const state = importWizardState;
  const totalImages = (state.data.images || []).length;
  const importedImages = state.imageDecisions.filter(d => d && (d.action === "import" || d.action === "overwrite" || d.action === "keepBoth")).length;
  const totalCats = (state.data.categories || []).length;
  const importedCats = state.catDecisions.filter(d => d && (d.action === "import" || d.action === "overwrite" || d.action === "keepBoth")).length;
  const totalDates = (state.data.dates || []).length;
  const importedDates = state.dateDecisions.filter(d => d && (d.action === "import" || d.action === "overwrite" || d.action === "keepBoth")).length;

  page.title = "Import Complete";

  page.content = `
    <p>Import complete!</p>
    <ul>
      <li>${importedImages} of ${totalImages} image(s) imported</li>
      <li>${importedCats} of ${totalCats} categor(ies) imported</li>
      <li>${importedDates} of ${totalDates} date(s) imported</li>
    </ul>
  `;

  page.buttons = [
    { text: "Close", variant: "success", action: "close", close: false }
  ];
}

// ---- QR import page ----

function startQRImport() {
  hideMainPages("qrImportPage");
  const page = document.getElementById("qrImportPage");
  if (!page) return;
  page.classList.remove("d-none");
  injectEditorStyles(page);
  if (!page.__cmdBound) {
    page.__cmdBound = true;
    page.addEventListener("smd-page-action", e => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "cancel" || action === "close") cancelQRImport();
    });
  }
  page.title = "Import via QR";
  page.content =
    '<p id="qrImportStatus" class="text-secondary">Waiting for QR scans…</p>' +
    '<smd-qr-import id="qrImportHost" autostart></smd-qr-import>';
  page.buttons = [{ text: "Cancel", variant: "danger", action: "cancel" }];
  page.show();
}

function cancelQRImport() {
  const host = $id("qrImportHost");
  if (host && typeof host.stop === "function") host.stop();
  const page = document.getElementById("qrImportPage");
  if (page) {
    page.hide();
    setTimeout(() => page.classList.add("d-none"), Math.max(0, (page.slideDuration || 0) + 50));
  }
}
