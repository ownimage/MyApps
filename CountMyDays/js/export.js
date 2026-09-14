// CountMyDays — export wizard (JSON download + chunked QR export) plus the QR
// export <smd-page>. The wizard renders into #exportWizardPage and reads its
// form through the page's shadow root.

let ew = null;

function exportData() {
  startExportWizard("json");
}

function exportToQR() {
  startExportWizard("qr");
}

function startExportWizard(type) {
  ew = {
    type: type,
    step: "main",
    backStack: [],
    scope: "all",
    datesCascade: false,
    datesChoice: "none",
    selectedDateIndices: [],
    dateFilterCategory: "",
    dateFilterName: "",
    categoriesCascade: false,
    categoriesChoice: "none",
    selectedCategoryIndices: [],
    catFilterName: "",
    imagesChoice: "none",
    selectedImageIndices: [],
    imageFilterName: ""
  };
  openExportWizard();
}

function openExportWizard() {
  hideMainPages("exportWizardPage");
  const page = document.getElementById("exportWizardPage");
  if (!page) return;
  page.classList.remove("d-none");
  injectEditorStyles(page);
  if (!page.__cmdBound) {
    page.__cmdBound = true;
    page.addEventListener("smd-page-action", handleExportWizardAction);
  }
  renderExportWizard();
  page.show();
}

function closeExportWizard() {
  ew = null;
  const page = document.getElementById("exportWizardPage");
  if (page) {
    page.hide();
    setTimeout(() => page.classList.add("d-none"), Math.max(0, (page.slideDuration || 0) + 50));
  }
}

function handleExportWizardAction(e) {
  const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
  if (action === "cancel") closeExportWizard();
  else if (action === "back") exportWizardBack();
  else if (action === "next") exportWizardNext();
}

function ewPage() {
  return document.getElementById("exportWizardPage");
}

function ewQuery(sel) {
  const page = ewPage();
  return page && page.shadowRoot ? page.shadowRoot.querySelector(sel) : document.querySelector(sel);
}

function ewQueryAll(sel) {
  const page = ewPage();
  return page && page.shadowRoot
    ? Array.from(page.shadowRoot.querySelectorAll(sel))
    : Array.from(document.querySelectorAll(sel));
}

function ewThumb(name, size) {
  if (!name) return '<div class="ew-thumb-empty"></div>';
  return `<smd-image key-prefix="${escAttr(smdImagePrefix())}" image="${escAttr(name)}" size="${size || 32}"></smd-image>`;
}

function ewBackNext(backText, nextText) {
  return [
    { text: backText || "Back", variant: "secondary", action: "back", close: false },
    { text: nextText || "Next", variant: "primary", action: "next", close: false }
  ];
}

function renderExportWizard() {
  const page = ewPage();
  if (!page || !ew) return;

  const active = page.shadowRoot ? page.shadowRoot.activeElement : null;
  let focusInfo = null;
  if (active && active.tagName === "INPUT" && active.id) {
    focusInfo = { id: active.id, pos: active.selectionStart };
  }

  if (ew.step === "main") {
    page.title = "Export";
    page.content = `
      <p class="mb-3">Choose what to export:</p>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="ewScope" id="ewAll" value="all" ${ew.scope !== "partial" ? "checked" : ""}>
        <label class="form-check-label" for="ewAll">Export everything</label>
      </div>
      <div class="form-check">
        <input class="form-check-input" type="radio" name="ewScope" id="ewPartial" value="partial" ${ew.scope === "partial" ? "checked" : ""}>
        <label class="form-check-label" for="ewPartial">Select specific items</label>
      </div>`;
    page.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel", close: false },
      { text: "Next", variant: "primary", action: "next", close: false }
    ];
  } else if (ew.step === "dates1") {
    page.title = "Export Dates";
    const showCascade = ew.datesChoice === "all" || ew.datesChoice === "specific";
    page.content = `
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="ewDatesChoice" id="ewDatesNone" value="none" ${ew.datesChoice === "none" ? "checked" : ""} onchange="toggleDatesCascade()">
        <label class="form-check-label" for="ewDatesNone">None</label>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="ewDatesChoice" id="ewDatesAll" value="all" ${ew.datesChoice === "all" ? "checked" : ""} onchange="toggleDatesCascade()">
        <label class="form-check-label" for="ewDatesAll">All dates</label>
      </div>
      <div class="form-check mb-3">
        <input class="form-check-input" type="radio" name="ewDatesChoice" id="ewDatesSpecific" value="specific" ${ew.datesChoice === "specific" ? "checked" : ""} onchange="toggleDatesCascade()">
        <label class="form-check-label" for="ewDatesSpecific">Select specific dates</label>
      </div>
      <div class="form-check" id="ewDatesCascadeWrapper" style="display:${showCascade ? "block" : "none"}">
        <input class="form-check-input" type="checkbox" id="ewDatesCascade" ${ew.datesCascade ? "checked" : ""}>
        <label class="form-check-label" for="ewDatesCascade">Cascade: include related categories and images</label>
      </div>`;
    page.buttons = ewBackNext();
  } else if (ew.step === "dates2") {
    page.title = "Select Dates";
    const allDates = loadDates();
    const categories = loadCategories();
    const catNames = [...new Set(allDates.map(d => d.category).filter(Boolean))];
    const filtered = allDates.filter(d => {
      if (ew.dateFilterCategory && d.category !== ew.dateFilterCategory) return false;
      if (ew.dateFilterName && !d.name.toLowerCase().includes(ew.dateFilterName.toLowerCase())) return false;
      return true;
    });
    const withDate = filtered
      .map(d => ({ ...d, index: allDates.indexOf(d), target: targetDate(d) }))
      .sort((a, b) => a.target - b.target);
    page.content = `
      <div class="d-flex gap-2 align-items-center mb-3 flex-wrap">
        <select class="form-select" style="width:auto;min-width:160px" onchange="ew.dateFilterCategory=this.value;ewSaveCheckboxes();renderExportWizard()">
          <option value="">All</option>
          ${catNames.map(c => `<option value="${escAttr(c)}" ${ew.dateFilterCategory === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
        </select>
        <input class="form-control" id="ewDateFilterName" type="search" placeholder="Search date names..." style="flex:1;min-width:150px" value="${escAttr(ew.dateFilterName)}" oninput="ew.dateFilterName=this.value;ewSaveCheckboxes();renderExportWizard()">
      </div>
      <div class="cmd-scroll-list">
      ${withDate.map(item => {
        const category = categories.find(c => c.name === item.category);
        const imgName = category ? (category.image || "") : "";
        return `
        <div class="d-flex align-items-center gap-2 mb-2">
          ${ewThumb(imgName)}
          ${ewThumb(item.image)}
          <div class="form-check mb-0">
            <input class="form-check-input ew-date-cb" type="checkbox" value="${item.index}" data-index="${item.index}" ${ew.selectedDateIndices.includes(item.index) ? "checked" : ""}>
            <label class="form-check-label">${escapeHtml(item.name)} — ${formatDate(item.target)} — ${escapeHtml(item.category || "No category")}</label>
          </div>
        </div>`;
      }).join("")}
      </div>`;
    page.buttons = ewBackNext();
  } else if (ew.step === "categories1") {
    page.title = "Export Categories";
    const showCatsCascade = ew.categoriesChoice === "all" || ew.categoriesChoice === "specific";
    page.content = `
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="ewCategoriesChoice" id="ewCatsNone" value="none" ${ew.categoriesChoice === "none" ? "checked" : ""} onchange="toggleCategoriesCascade()">
        <label class="form-check-label" for="ewCatsNone">None</label>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="ewCategoriesChoice" id="ewCatsAll" value="all" ${ew.categoriesChoice === "all" ? "checked" : ""} onchange="toggleCategoriesCascade()">
        <label class="form-check-label" for="ewCatsAll">All categories</label>
      </div>
      <div class="form-check mb-3">
        <input class="form-check-input" type="radio" name="ewCategoriesChoice" id="ewCatsSpecific" value="specific" ${ew.categoriesChoice === "specific" ? "checked" : ""} onchange="toggleCategoriesCascade()">
        <label class="form-check-label" for="ewCatsSpecific">Select specific categories</label>
      </div>
      <div class="form-check" id="ewCategoriesCascadeWrapper" style="display:${showCatsCascade ? "block" : "none"}">
        <input class="form-check-input" type="checkbox" id="ewCategoriesCascade" ${ew.categoriesCascade ? "checked" : ""}>
        <label class="form-check-label" for="ewCategoriesCascade">Cascade: include related images</label>
      </div>`;
    page.buttons = ewBackNext();
  } else if (ew.step === "categories2") {
    page.title = "Select Categories";
    const allCats = loadCategories();
    const filtered = allCats.filter(c => {
      if (ew.catFilterName && !c.name.toLowerCase().includes(ew.catFilterName.toLowerCase())) return false;
      return true;
    });
    const sorted = filtered.slice().sort((a, b) => a.name.localeCompare(b.name));
    page.content = `
      <div class="d-flex gap-2 align-items-center mb-3 flex-wrap">
        <input class="form-control" id="ewCatFilterName" type="search" placeholder="Search category names..." style="flex:1;min-width:150px" value="${escAttr(ew.catFilterName)}" oninput="ew.catFilterName=this.value;ewSaveCheckboxes();renderExportWizard()">
      </div>
      <div class="cmd-scroll-list">
      ${sorted.map(c => {
        const realIndex = allCats.indexOf(c);
        return `
        <div class="d-flex align-items-center gap-2 mb-2">
          ${ewThumb(c.image)}
          <div class="form-check mb-0">
            <input class="form-check-input ew-cat-cb" type="checkbox" value="${realIndex}" data-index="${realIndex}" ${ew.selectedCategoryIndices.includes(realIndex) ? "checked" : ""}>
            <label class="form-check-label">${escapeHtml(c.name)}</label>
          </div>
        </div>`;
      }).join("")}
      </div>`;
    page.buttons = ewBackNext();
  } else if (ew.step === "images1") {
    page.title = "Export Images";
    page.content = `
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="ewImagesChoice" id="ewImgsNone" value="none" ${ew.imagesChoice === "none" ? "checked" : ""}>
        <label class="form-check-label" for="ewImgsNone">None</label>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="ewImagesChoice" id="ewImgsAll" value="all" ${ew.imagesChoice === "all" ? "checked" : ""}>
        <label class="form-check-label" for="ewImgsAll">All images</label>
      </div>
      <div class="form-check">
        <input class="form-check-input" type="radio" name="ewImagesChoice" id="ewImgsSpecific" value="specific" ${ew.imagesChoice === "specific" ? "checked" : ""}>
        <label class="form-check-label" for="ewImgsSpecific">Select specific images</label>
      </div>`;
    page.buttons = ewBackNext();
  } else if (ew.step === "images2") {
    page.title = "Select Images";
    const images = loadImages();
    const filtered = images.filter(img => {
      if (ew.imageFilterName && !img.name.toLowerCase().includes(ew.imageFilterName.toLowerCase())) return false;
      return true;
    });
    const sorted = filtered.slice().sort((a, b) => a.name.localeCompare(b.name));
    page.content = `
      <div class="d-flex gap-2 align-items-center mb-3 flex-wrap">
        <input class="form-control" id="ewImageFilterName" type="search" placeholder="Search image names..." style="flex:1;min-width:150px" value="${escAttr(ew.imageFilterName)}" oninput="ew.imageFilterName=this.value;ewSaveCheckboxes();renderExportWizard()">
      </div>
      <div class="cmd-scroll-list">
      ${sorted.map(img => {
        const realIndex = images.indexOf(img);
        return `
        <div class="d-flex align-items-center gap-2 mb-2">
          ${ewThumb(img.name)}
          <div class="form-check mb-0">
            <input class="form-check-input ew-img-cb" type="checkbox" value="${realIndex}" data-index="${realIndex}" ${ew.selectedImageIndices.includes(realIndex) ? "checked" : ""}>
            <label class="form-check-label">${escapeHtml(img.name)}</label>
          </div>
        </div>`;
      }).join("")}
      </div>`;
    page.buttons = ewBackNext(null, "Export");
  } else if (ew.step === "summary") {
    const data = buildExportData();
    const categories = loadCategories();
    const images = loadImages();

    const dateRows = data.dates.map(d => {
      const cat = categories.find(c => c.name === d.category);
      const catImage = cat ? (cat.image || "") : "";
      const dateStr = d.type === "once"
        ? `${d.day} ${CMD_MONTHS[(d.month || 1) - 1]} ${d.year}`
        : `${d.day} ${CMD_MONTHS[(d.month || 1) - 1]}`;
      return { catImage, dateImage: d.image || "", name: d.name, dateStr, category: d.category || "" };
    });

    const catRows = data.categories.map(c => ({ image: c.image || "", name: c.name }));
    const imgRows = data.images.map(i => ({ image: i.name, name: i.name }));

    page.title = "Export Summary";
    page.content = `
      ${data.dates.length > 0 ? `
        <div class="card p-3 mb-3">
          <h5 class="mb-2">Dates (${data.dates.length})</h5>
          ${dateRows.map(r => `
            <div class="d-flex align-items-center gap-2 mb-1">
              ${ewThumb(r.catImage, 20)}
              ${ewThumb(r.dateImage, 20)}
              <span>${escapeHtml(r.name)} — ${r.dateStr} — ${escapeHtml(r.category)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${data.categories.length > 0 ? `
        <div class="card p-3 mb-3">
          <h5 class="mb-2">Categories (${data.categories.length})</h5>
          ${catRows.map(r => `
            <div class="d-flex align-items-center gap-2 mb-1">
              ${ewThumb(r.image, 20)}
              <span>${escapeHtml(r.name)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${data.images.length > 0 ? `
        <div class="card p-3">
          <h5 class="mb-2">Images (${data.images.length})</h5>
          ${imgRows.map(r => `
            <div class="d-flex align-items-center gap-2 mb-1">
              ${ewThumb(r.image, 20)}
              <span>${escapeHtml(r.name)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${data.dates.length === 0 && data.categories.length === 0 && data.images.length === 0 ? `<p class="text-secondary">Nothing selected for export.</p>` : ""}
    `;
    page.buttons = ewBackNext(null, "Export");
  }

  if (focusInfo) {
    const input = ewQuery("#" + focusInfo.id);
    if (input) {
      input.focus();
      try { input.setSelectionRange(focusInfo.pos, focusInfo.pos); } catch (e) { /* ignore */ }
    }
  }
}

function ewReadForm() {
  if (!ew) return;
  if (ew.step === "main") {
    const sel = ewQuery('input[name="ewScope"]:checked');
    if (sel) ew.scope = sel.value;
  } else if (ew.step === "dates1") {
    const cascade = ewQuery("#ewDatesCascade");
    if (cascade) ew.datesCascade = cascade.checked;
    const sel = ewQuery('input[name="ewDatesChoice"]:checked');
    if (sel) ew.datesChoice = sel.value;
  } else if (ew.step === "dates2") {
    ew.selectedDateIndices = ewQueryAll(".ew-date-cb:checked").map(cb => parseInt(cb.value, 10));
  } else if (ew.step === "categories1") {
    const sel = ewQuery('input[name="ewCategoriesChoice"]:checked');
    if (sel) ew.categoriesChoice = sel.value;
    const cascade = ewQuery("#ewCategoriesCascade");
    if (cascade) ew.categoriesCascade = cascade.checked;
  } else if (ew.step === "categories2") {
    ew.selectedCategoryIndices = ewQueryAll(".ew-cat-cb:checked").map(cb => parseInt(cb.value, 10));
  } else if (ew.step === "images1") {
    const sel = ewQuery('input[name="ewImagesChoice"]:checked');
    if (sel) ew.imagesChoice = sel.value;
  } else if (ew.step === "images2") {
    ew.selectedImageIndices = ewQueryAll(".ew-img-cb:checked").map(cb => parseInt(cb.value, 10));
  }
}

function getNextStep() {
  if (ew.step === "main") {
    return ew.scope === "partial" ? "dates1" : "summary";
  }
  if (ew.step === "dates1") {
    return ew.datesChoice === "specific" ? "dates2" : "categories1";
  }
  if (ew.step === "dates2") return "categories1";
  if (ew.step === "categories1") {
    return ew.categoriesChoice === "specific" ? "categories2" : "images1";
  }
  if (ew.step === "categories2") return "images1";
  if (ew.step === "images1") {
    return ew.imagesChoice === "specific" ? "images2" : "summary";
  }
  if (ew.step === "images2") return "summary";
  return null;
}

function exportWizardNext() {
  ewReadForm();
  const next = getNextStep();
  if (next) {
    ew.backStack.push(ew.step);
    ew.step = next;
    renderExportWizard();
  } else {
    finishExportWizard();
  }
}

function exportWizardBack() {
  if (ew && ew.backStack.length > 0) {
    ew.step = ew.backStack.pop();
    renderExportWizard();
  }
}

function ewSaveCheckboxes() {
  const save = (selector, current) => {
    const visible = ewQueryAll(selector);
    if (visible.length === 0) return current;
    const checked = new Set(ewQueryAll(selector + ":checked").map(cb => parseInt(cb.value, 10)));
    const visibleValues = new Set(visible.map(cb => parseInt(cb.value, 10)));
    const kept = new Set(current);
    checked.forEach(i => kept.add(i));
    visibleValues.forEach(i => { if (!checked.has(i)) kept.delete(i); });
    return Array.from(kept);
  };
  ew.selectedDateIndices = save(".ew-date-cb", ew.selectedDateIndices);
  ew.selectedCategoryIndices = save(".ew-cat-cb", ew.selectedCategoryIndices);
  ew.selectedImageIndices = save(".ew-img-cb", ew.selectedImageIndices);
}

function toggleDatesCascade() {
  const wrapper = ewQuery("#ewDatesCascadeWrapper");
  const all = ewQuery("#ewDatesAll");
  const specific = ewQuery("#ewDatesSpecific");
  if (!wrapper || !all || !specific) return;
  wrapper.style.display = (all.checked || specific.checked) ? "block" : "none";
}

function toggleCategoriesCascade() {
  const wrapper = ewQuery("#ewCategoriesCascadeWrapper");
  const all = ewQuery("#ewCatsAll");
  const specific = ewQuery("#ewCatsSpecific");
  if (!wrapper || !all || !specific) return;
  wrapper.style.display = (all.checked || specific.checked) ? "block" : "none";
}

function finishExportWizard() {
  ewReadForm();
  const data = buildExportData();
  const type = ew.type;
  closeExportWizard();
  if (type === "json") {
    doJSONExport(data);
  } else {
    openQrExportPage(data);
  }
}

function buildExportData() {
  if (!ew || ew.scope === "all") {
    return {
      dates: loadDates(),
      categories: loadCategories(),
      images: loadImages()
    };
  }

  let resultDates = [];
  let resultCategories = [];
  let resultImages = [];

  if (ew.datesChoice === "all") {
    resultDates = loadDates();
  } else if (ew.datesChoice === "specific") {
    const allDates = loadDates();
    resultDates = ew.selectedDateIndices.map(i => allDates[i]).filter(Boolean);
  }

  if (ew.datesCascade && resultDates.length > 0) {
    const allCats = loadCategories();
    const allImgs = loadImages();
    const usedCatNames = new Set(resultDates.map(d => d.category).filter(Boolean));
    resultCategories = allCats.filter(c => usedCatNames.has(c.name));
    const usedImgNames = new Set(resultCategories.map(c => c.image).filter(Boolean));
    resultDates.forEach(d => { if (d.image) usedImgNames.add(d.image); });
    resultImages = allImgs.filter(i => usedImgNames.has(i.name));
  }

  if (ew.categoriesChoice === "all") {
    const allCats = loadCategories();
    const existingNames = new Set(resultCategories.map(c => c.name));
    allCats.forEach(c => { if (!existingNames.has(c.name)) { resultCategories.push(c); existingNames.add(c.name); } });
  } else if (ew.categoriesChoice === "specific") {
    const allCats = loadCategories();
    const existingNames = new Set(resultCategories.map(c => c.name));
    ew.selectedCategoryIndices.forEach(i => {
      const c = allCats[i];
      if (c && !existingNames.has(c.name)) { resultCategories.push(c); existingNames.add(c.name); }
    });
  }

  if (ew.categoriesCascade && resultCategories.length > 0) {
    const allImgs = loadImages();
    const usedImgNames = new Set(resultCategories.map(c => c.image).filter(Boolean));
    const existingImgNames = new Set(resultImages.map(i => i.name));
    allImgs.forEach(img => { if (usedImgNames.has(img.name) && !existingImgNames.has(img.name)) resultImages.push(img); });
  }

  if (ew.imagesChoice === "all") {
    const allImgs = loadImages();
    const existingNames = new Set(resultImages.map(i => i.name));
    allImgs.forEach(img => { if (!existingNames.has(img.name)) { resultImages.push(img); existingNames.add(img.name); } });
  } else if (ew.imagesChoice === "specific") {
    const allImgs = loadImages();
    const existingNames = new Set(resultImages.map(i => i.name));
    ew.selectedImageIndices.forEach(i => {
      const img = allImgs[i];
      if (img && !existingNames.has(img.name)) { resultImages.push(img); existingNames.add(img.name); }
    });
  }

  return { dates: resultDates, categories: resultCategories, images: resultImages };
}

function doJSONExport(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "countmydays-export.json";
  a.click();
  URL.revokeObjectURL(url);
}

// ---- QR export page ----

function openQrExportPage(data) {
  const page = document.getElementById("qrExportPage");
  if (!page) return;
  page.classList.remove("d-none");
  injectEditorStyles(page);
  if (!page.__cmdBound) {
    page.__cmdBound = true;
    page.addEventListener("smd-page-action", e => {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "close" || action === "cancel") closeQrExportPage();
    });
  }
  page.title = "Exported QR Codes";
  page.content =
    '<p class="text-secondary">Scan all QR codes to restore your data.</p>' +
    '<smd-qr-export id="qrExportHost" label="QR" chunk-size="400" size="280"></smd-qr-export>';
  page.buttons = [{ text: "Close", variant: "success", action: "close" }];
  page.show();
  const host = $id("qrExportHost");
  if (host) host.value = JSON.stringify(data);
}

function closeQrExportPage() {
  const page = document.getElementById("qrExportPage");
  if (page) {
    page.hide();
    setTimeout(() => page.classList.add("d-none"), Math.max(0, (page.slideDuration || 0) + 50));
  }
}
