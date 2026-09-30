let editingImageIndex = -1;
let isNewImage = false;
let isDuplicateImage = false;
let editImageBackup = null;
let imageNameSearch = "";
let imagesPage = 0;
let imagesTotalPages = 1;
const IMAGES_PAGE_SIZE = 30;
const MAX_RASTER_DIM = 1024;

// The image list key. Apps that share one library across the origin set
// SmdConfig.imagePrefix = "shared-" (key `shared-images`).
function smdImagesKey() {
  return smdImagePrefix() + "images";
}

function loadImages() {
  return JSON.parse(localStorage.getItem(smdImagesKey()) || "[]");
}

function saveImages(images) {
  localStorage.setItem(smdImagesKey(), JSON.stringify(images));
  scheduleImageCacheGc();
}

// ---- User-image cache (Cache Storage-backed render URLs) ----
//
// Every <smd-image> / editor preview used to embed the FULL painted data URL
// into the DOM via img.src (SVGs re-derived on every render), bloating the
// document. Instead the page caches the bytes once (a `myapps-images` Cache
// Storage entry under an immutable URL) and points <img src> at that file, so
// the DOM holds a short URL and the bytes live on the device.
//
// URL scheme: <origin>/.../smd-img/<64-bit-hash-of-painted-url>. The repo-root
// prefix is derived from THIS script's own src, so it resolves inside the
// single repo-root service worker's scope under any deployment sub-path
// (apps, the Launch root index, tests/subpath-server.py).
const SMD_IMAGE_CACHE_NAME = "myapps-images";

const SMD_IMAGE_CACHE_BASE = (function () {
  let src = "";
  try { if (document.currentScript && document.currentScript.src) src = document.currentScript.src; } catch (e) { /* ignore */ }
  const i = src.indexOf("/shared/");
  if (i === -1) return "/smd-img/";
  return src.substring(0, i + 1) + "smd-img/";
})();

// Session memo: painted data URL -> render URL (cache URL or blob URL).
const _imgUrlMemo = new Map();
const _imgUrlPending = new Map();
let _imageCacheGcTimer = null;

// The cache URL is only fetchable when this origin's service worker has claimed
// the page (it serves /smd-img/ entries). Before that (first-ever visit, or
// tests that load and assert immediately) the browser would 404, so fall back
// to an in-memory blob URL until the SW controls the page.
function smdSwControls() {
  try {
    return !!(window.navigator && window.navigator.serviceWorker &&
      window.navigator.serviceWorker.controller);
  } catch (e) { return false; }
}

// Two 32-bit FNV-1a passes -> 16 hex chars. Fast, synchronous, deterministic
// across sessions (needed so the cache URL matches the entry written earlier).
function smdImageHash(str) {
  let h1 = 0x811c9dc5, h2 = 0x9e3779b1;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x1bdd7f81) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function smdImageBlobUrl(dataUrl) {
  return fetch(dataUrl).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.blob();
  }).then(function (blob) {
    return URL.createObjectURL(blob);
  });
}

// Resolves a painted data URL to a render URL: the persistent /smd-img/ cache
// URL when the service worker controls the page, else an in-memory blob URL.
// The entry is written into Cache Storage once (immutable per content).
function smdImageCacheUrl(dataUrl) {
  const cacheUrl = SMD_IMAGE_CACHE_BASE + smdImageHash(dataUrl);
  return caches.open(SMD_IMAGE_CACHE_NAME).then(function (cache) {
    return cache.match(cacheUrl).then(function (hit) {
      if (hit) {
        return smdSwControls() ? cacheUrl : hit.blob().then(function (b) { return URL.createObjectURL(b); });
      }
      return fetch(dataUrl).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.blob();
      }).then(function (blob) {
        const body = new Response(blob, {
          headers: { "Content-Type": blob.type || "image/svg+xml", "Cache-Control": "immutable" }
        });
        return cache.put(cacheUrl, body).then(function () {
          return smdSwControls() ? cacheUrl : URL.createObjectURL(blob);
        });
      });
    });
  });
}

// The render URL for a painted data URL. Memoised per session and deduped, so N
// cards of the same image/theme share ONE cached file and (in the happy path)
// reuse the previous session's entry without re-fetching the bytes.
function smdImageRenderUrl(dataUrl) {
  if (!dataUrl || dataUrl.indexOf("data:") !== 0) return Promise.resolve(dataUrl);
  if (_imgUrlMemo.has(dataUrl)) return Promise.resolve(_imgUrlMemo.get(dataUrl));
  if (_imgUrlPending.has(dataUrl)) return _imgUrlPending.get(dataUrl);
  // Only touch Cache Storage when the service worker controls the page: that is
  // the only case a /smd-img/ URL is fetchable, and cold/first-visit pages (and
  // automated tests) avoid the per-origin Cache Storage serialisation entirely.
  const p = (typeof caches !== "undefined" && smdSwControls()
    ? smdImageCacheUrl(dataUrl)
    : smdImageBlobUrl(dataUrl)
  ).catch(function () { return smdImageBlobUrl(dataUrl); })
   .catch(function () { return dataUrl; }); // last resort: data URL in DOM
  p.then(function (url) { _imgUrlMemo.set(dataUrl, url); }, function () {});
  _imgUrlPending.set(dataUrl, p);
  p.then(function () { _imgUrlPending.delete(dataUrl); }, function () { _imgUrlPending.delete(dataUrl); });
  return p;
}

// Sync fill helper for plain <img> writers (editor previews). Keeps consumers
// DOM-bloat-free without duplicating the async render dance.
function smdSetImageSrc(el, src) {
  if (!el) return;
  if (!src) { el.removeAttribute("src"); el.hidden = true; return; }
  if (typeof smdImageRenderUrl !== "function") { el.src = src; el.hidden = false; return; }
  smdImageRenderUrl(src).then(function (url) {
    if (el.isConnected) { el.src = url; el.hidden = false; }
  }).catch(function () {
    if (el.isConnected) { el.src = src; el.hidden = false; }
  });
}

// Preview box size for the image edit dialog (the main image and the two
// per-theme previews). It follows the Settings "Icon size" value â€” each app
// pushes that to SmdImage.defaultSize via applyImageSize() â€” so the preview
// shows the image at the size the app actually renders it at. Clamped to
// 40-100px: xsmall (32px) is too small to judge an image in the dialog, and the
// clamp also stops a future larger setting from overflowing the panel.
//
// Applied inline (width/height/object-fit) rather than via a CSS rule because
// size is a VALUE in this codebase, not a style: <smd-image> sizes itself the
// same way, from the same value. There is deliberately no `.data-img` rule in
// shared/css/styles.css; the class is only a hook for tests/selectors.
function smdImagePreviewSizePx() {
  const base = (typeof SmdImage !== "undefined" && SmdImage.defaultSize) || 100;
  const px = parseInt(base, 10);
  if (isNaN(px) || px <= 0) return 100;
  return Math.min(100, Math.max(40, px));
}

// Every painted data URL a stored image can render as (all tiers x themes), so
// the GC can tell exactly which /smd-img/ cache entries are still live.
function smdImagePaintVariants(img) {
  if (!img) return [];
  const out = [];
  ["data", "data100", "data80", "data64"].forEach(function (tier) {
    const src = img[tier];
    if (!src) return;
    ["light", "dark"].forEach(function (theme) {
      const t = (img.themes && img.themes[theme]) || {};
      let painted = src;
      if (isSvgDataUrl(src)) {
        if (t.line != null && t.line !== "") painted = applySvgAttr(painted, "stroke", t.line);
        if (t.fill != null && t.fill !== "") painted = applySvgAttr(painted, "fill", t.fill);
        if (t.width != null && t.width !== "") painted = applySvgAttr(painted, "stroke-width", t.width);
      }
      out.push(painted);
    });
  });
  return out;
}

// Prune /smd-img/ entries whose hash no longer matches any stored image variant
// (deleted images, or re-uploaded/re-coloured images whose old content is gone).
function purgeStaleImageCache() {
  if (typeof caches === "undefined" || !smdSwControls()) return Promise.resolve();
  const live = new Set();
  loadImages().forEach(function (img) {
    smdImagePaintVariants(img).forEach(function (painted) {
      live.add(SMD_IMAGE_CACHE_BASE + smdImageHash(painted));
    });
  });
  return caches.open(SMD_IMAGE_CACHE_NAME).then(function (cache) {
    return cache.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        const u = typeof k === "string" ? k : k.url;
        return !!u && !live.has(u);
      }).map(function (k) { return cache.delete(k); }));
    });
  }).catch(function () {});
}

// Debounced GC kicker â€” saveImages() runs on every edit keystroke, so collapse
// a burst of edits into one sweep once they settle.
function scheduleImageCacheGc() {
  if (typeof caches === "undefined") return;
  if (_imageCacheGcTimer) clearTimeout(_imageCacheGcTimer);
  _imageCacheGcTimer = setTimeout(function () {
    _imageCacheGcTimer = null;
    purgeStaleImageCache();
  }, 1500);
}

// One-time migration to the shared image library: when `shared-images` does
// not exist yet, merge the per-app lists (and the pre-multi-app unprefixed
// `images`) into it, then drop the old keys. Safe to call on every boot; it is
// a no-op once the shared list exists.
function migrateImagesToShared() {
  const sharedKey = "shared-images";
  const sources = ["planmydays_images", "countmydays_images", "qr_images", "images"];
  if (localStorage.getItem(sharedKey) !== null) {
    // Shared library already in use: drop any stale per-app copies.
    sources.forEach(function (key) { localStorage.removeItem(key); });
    return;
  }
  const merged = [];
  const seen = Object.create(null);
  sources.forEach(function (key) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { list = []; }
    if (!Array.isArray(list)) return;
    list.forEach(function (img) {
      if (!img || !img.name || seen[img.name]) return;
      seen[img.name] = true;
      merged.push(img);
    });
    localStorage.removeItem(key);
  });
  if (merged.length) localStorage.setItem(sharedKey, JSON.stringify(merged));
}

function getImageColors(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:image/svg+xml,")) {
    return { line: "", fill: "", strokeWidth: "" };
  }
  const svgPart = dataUrl.substring("data:image/svg+xml,".length);
  const decoded = decodeURIComponent(svgPart);
  const decodeVal = v => v && v.startsWith("%23") ? "#" + v.substring(3) : v;
  const lineMatch = decoded.match(/\bstroke\s*=\s*["']([^"']+)["']/i);
  const fillMatch = decoded.match(/\bfill\s*=\s*["']([^"']+)["']/i);
  const swMatch = decoded.match(/\bstroke-width\s*=\s*["']([^"']+)["']/i);
  return {
    line: lineMatch ? decodeVal(lineMatch[1]) : "",
    fill: fillMatch ? decodeVal(fillMatch[1]) : "",
    strokeWidth: swMatch ? swMatch[1] : ""
  };
}

function updateSvgColor(dataUrl, attr, newColor) {
  if (!dataUrl || !dataUrl.startsWith("data:image/svg+xml,")) return dataUrl;
  const svgPart = dataUrl.substring("data:image/svg+xml,".length);
  const decoded = decodeURIComponent(svgPart);
  const regex = new RegExp(`\\b${attr}\\s*=\\s*["'][^"']*["']`, 'g');
  const encoded = newColor && newColor.startsWith("#")
    ? newColor
    : newColor || "none";
  const updated = decoded.replace(regex, (m) => {
    const quote = m.includes('"') ? '"' : "'";
    return `${attr}=${quote}${encoded}${quote}`;
  });
  return "data:image/svg+xml," + encodeURIComponent(updated);
}

function isSvgDataUrl(dataUrl) {
  return !!dataUrl && dataUrl.indexOf("data:image/svg+xml,") === 0;
}

function isDarkTheme() {
  // --smd-image-theme drives image colour rendering (default: mirrors
  // html[data-bs-theme] via styles.css). Falls back to the attribute.
  const v = getComputedStyle(document.documentElement).getPropertyValue("--smd-image-theme").trim().toLowerCase();
  if (v === "dark" || v === "light") return v === "dark";
  return (document.documentElement.getAttribute("data-bs-theme") || "dark") === "dark";
}

function getThemeKey() {
  return isDarkTheme() ? "dark" : "light";
}

function themeKey(themeIdx) {
  return themeIdx === 0 ? "light" : "dark";
}

function getThemeOverride(img, themeIdx) {
  return (img.themes && img.themes[themeKey(themeIdx)]) || {};
}

function ensureThemeOverride(img, themeIdx) {
  const key = themeKey(themeIdx);
  if (!img.themes) img.themes = {};
  if (!img.themes[key]) img.themes[key] = { line: null, fill: null, width: null };
  return img.themes[key];
}

function getThemedImageDataUrl(img, themeKey) {
  if (!img) return null;
  const data = img.data || img.data100 || img.data80 || img.data64;
  if (!data) return null;
  if (!isSvgDataUrl(data)) return data;
  const key = themeKey || getThemeKey();
  const t = (img.themes && img.themes[key]) || {};
  let out = data;
  if (t.line != null && t.line !== "") out = applySvgAttr(out, "stroke", t.line);
  if (t.fill != null && t.fill !== "") out = applySvgAttr(out, "fill", t.fill);
  if (t.width != null && t.width !== "") out = applySvgAttr(out, "stroke-width", t.width);
  return out;
}

function applySvgAttr(dataUrl, attr, value) {
  const svgPart = dataUrl.substring("data:image/svg+xml,".length);
  const decoded = decodeURIComponent(svgPart);
  const rx = new RegExp(`\\b${attr}\\s*=\\s*["'][^"']*["']`);
  if (rx.test(decoded)) {
    return updateSvgColor(dataUrl, attr, value);
  }
  const encoded = value && value.startsWith("#") ? value : value || "none";
  const updated = decoded.replace(/<svg([\s>])/i, `<svg ${attr}="${encoded}"$1`);
  return "data:image/svg+xml," + encodeURIComponent(updated);
}

function updateEditPreview(img, themeIdx) {
  const key = themeKey(themeIdx);
  const previewEl = document.getElementById(key === "light" ? "themePreviewLight" : "themePreviewDark");
  if (previewEl) smdSetImageSrc(previewEl, getThemedImageDataUrl(img, key));
}

function buildThemeSection(themeIdx, label, imageOverride) {
  const images = loadImages();
  const img = imageOverride || images[editingImageIndex];
  if (!img) return "";
  const key = themeKey(themeIdx);
  const base = getImageColors(img.data);
  const override = getThemeOverride(img, themeIdx);
  const effLine = override.line != null ? override.line : base.line;
  const effFill = override.fill != null ? override.fill : base.fill;
  const lineVal = effLine !== "none" && effLine ? effLine : "#000000";
  const fillVal = effFill !== "none" && effFill ? effFill : "#ffffff";
  const widthVal = override.width != null ? override.width : (base.strokeWidth || "2");
  const isLight = themeIdx === 0;
  const panelStyle = isLight
    ? "background-color:#f8f9fa;border:1px solid #dee2e6;color:#212529"
    : "background-color:#212529;border:1px solid #495057;color:#f8f9fa";
  const panelTheme = isLight ? "light" : "dark";
  const previewId = isLight ? "themePreviewLight" : "themePreviewDark";
  const previewSrc = getThemedImageDataUrl(img, key);
  const showControls = isSvgDataUrl(img.data);
  const controlsHtml = showControls ? `
          <div class="d-flex gap-2 align-items-center">
            <label class="form-label mb-0" style="min-width:45px">Line:</label>
            <input type="color" value="${lineVal}" oninput="editImageColor(${editingImageIndex}, ${themeIdx}, 'stroke', this.value, this)">
            <smd-checkbox ${effLine === 'none' || !effLine ? 'checked' : ''} onchange="editImageStrokeNone(${editingImageIndex}, ${themeIdx}, this.checked)">none</smd-checkbox>
          </div>
          <div class="d-flex gap-2 align-items-center">
            <label class="form-label mb-0" style="min-width:45px">Fill:</label>
            <input type="color" value="${fillVal}" oninput="editImageColor(${editingImageIndex}, ${themeIdx}, 'fill', this.value, this)">
            <smd-checkbox ${effFill === 'none' || !effFill ? 'checked' : ''} onchange="editImageFillNone(${editingImageIndex}, ${themeIdx}, this.checked)">none</smd-checkbox>
          </div>
          <div class="d-flex gap-2 align-items-center">
            <label class="form-label mb-0" style="min-width:45px">Width:</label>
            <input type="number" min="0.5" max="10" step="0.5" value="${widthVal}" style="width:70px" class="form-control form-control-sm d-inline-block" oninput="editImageStrokeWidth(${editingImageIndex}, ${themeIdx}, this.value)">
          </div>` : "";
  const previewPx = smdImagePreviewSizePx();
  return `
    <div class="p-3 rounded mb-2" data-bs-theme="${panelTheme}" style="${panelStyle}">
      <div class="fw-bold mb-1">${label}</div>
      <div class="d-flex gap-3 align-items-start">
        <div class="d-flex flex-column gap-2 flex-grow-1">
          ${controlsHtml}
        </div>
        <div class="flex-shrink-0 d-flex align-items-center justify-content-center" style="width:${previewPx}px;height:${previewPx}px">
          <img id="${previewId}" src="" data-smdsrc="${escAttr(previewSrc)}" class="data-img" style="width:${previewPx}px;height:${previewPx}px;object-fit:contain" hidden>
        </div>
      </div>
    </div>
  `;
}

function renderImagesEditor() {
  const page = document.getElementById("imagesEditor");
  if (!page) return;

  if (!page.__imageSearchBound) {
    page.__imageSearchBound = true;
    page.addEventListener("smd-search-input", e => setImageNameSearch(e.detail.value));
    page.addEventListener("smd-search-clear", () => clearImageNameSearch());
  }

  const images = loadImages();

  if (editingImageIndex >= 0) {
    const img = images[editingImageIndex];

    const page = document.getElementById("imageEditModal");
    if (!page) return;
    // The form itself is the shared <smd-image-editor> component (light DOM so
    // the page + app styles apply, exactly like PlanMyDay). It is mounted into
    // #imageEditModalBody, which is this page's content, so the many existing
    // `#imageEditModalBody ...` selectors keep working.
    //
    // ORDER MATTERS: every smd-page property setter (title / content / buttons)
    // re-renders the whole page via innerHTML, which detaches anything already
    // mounted in it. So set ALL the page properties first, then mount the form
    // LAST - otherwise the editor is thrown away and the page renders empty.
    page.title = isNewImage ? "Add Image" : (isDuplicateImage ? "Duplicate Image" : "Edit Image");
    page.content = '<div id="imageEditModalBody"></div>';
    // OK / Cancel are the page's footer buttons (Cancel first, then OK, the
    // order every other app dialog uses). The ids are kept so the existing
    // #btnImageEditOk / #btnImageEditCancel selectors still resolve - they now
    // land on the <smd-button> host.
    page.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel", id: "btnImageEditCancel" },
      { text: "OK", variant: "success", action: "ok", id: "btnImageEditOk", disabled: imageEditOkDisabled }
    ];
    if (!page.__smdPageActionsBound) {
      page.__smdPageActionsBound = true;
      page.addEventListener("smd-page-action", (e) => {
        const action = e.detail && e.detail.action;
        // detail.index is the BUTTON index (0 = Cancel, 1 = OK), so the image
        // being edited comes from the module state, not the event.
        if (action === "ok") doneImageEdit(editingImageIndex);
        else if (action === "cancel") cancelImageEdit();
      });
    }
    // From here on nothing may re-render the page.
    const body = page.querySelector("#imageEditModalBody");
    if (!body) return;
    const editor = document.createElement("smd-image-editor");
    body.appendChild(editor);
    editor.addEventListener("smd-image-editor-action", (e) => {
      const detail = e.detail || {};
      if (detail.action === "upload") openImageUpload(detail.index);
    });
    editor.index = editingImageIndex;
    editor.isNew = isNewImage;
    editor.isDuplicate = isDuplicateImage;
    editor.image = img;
    editor.render();

    page.classList.remove("d-none");
    page.show();
    updateNavState();
    return;
  }

  const filtered = images.filter((img, index) => {
    if (imageNameSearch && !img.name.toLowerCase().includes(imageNameSearch.toLowerCase())) return false;
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  imagesTotalPages = Math.ceil(filtered.length / IMAGES_PAGE_SIZE) || 1;
  if (imagesPage >= imagesTotalPages) imagesPage = imagesTotalPages - 1;
  const start = imagesPage * IMAGES_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + IMAGES_PAGE_SIZE);

  if (!$id("imageSearchHeader")) {
    page.title = "Edit Images";
    page.headerHtml = "";
    page.content =
      '<div id="imageSearchHeader">' +
        '<div id="imageSearchFilters" class="mt-1 mb-3 mx-2">' +
          '<smd-search id="imageNameSearch" input-id="imageNameSearchInput" button-id="btnImageFilterClear" placeholder="Search image names..." value="' + escAttr(imageNameSearch) + '"></smd-search>' +
        '</div>' +
      '</div>' +
      '<div id="imagesList"></div>';
    page.buttons = [
      { text: "Add Image", variant: "primary", action: "add", close: false },
      { text: "OK", variant: "success", action: "done" },
    ];
  } else {
    const input = $id("imageNameSearchInput");
    if (input && input.value !== imageNameSearch) {
      const pos = input.selectionStart;
      input.value = imageNameSearch;
      try { input.setSelectionRange(pos, pos); } catch (err) {}
    }
  }

  const listEl = $id("imagesList");
  listEl.innerHTML = "";

  pageItems.forEach((img) => {
    const card = document.createElement("smd-image-card");
    const inUse = isImageInUse(img.name);
    card.setAttribute("index", images.indexOf(img));
    card.setAttribute("title", img.name);
    card.setAttribute("image", img.name);
    card.setAttribute("key-prefix", smdImagePrefix());
    if (inUse) card.setAttribute("in-use", "");
    listEl.appendChild(card);
  });

  if (imagesTotalPages > 1) {
    const nav = document.createElement("div");
    nav.className = "d-flex justify-content-center align-items-center gap-3 mt-3 mb-2";
    nav.innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="imagesPage=Math.max(0,imagesPage-1);renderImagesEditor()" ${imagesPage === 0 ? 'disabled' : ''}>Previous</button>
      <span class="text-nowrap">Page ${imagesPage + 1} of ${imagesTotalPages}</span>
      <button class="btn btn-primary btn-sm" onclick="imagesPage=Math.min(imagesTotalPages-1,imagesPage+1);renderImagesEditor()" ${imagesPage >= imagesTotalPages - 1 ? 'disabled' : ''}>Next</button>
    `;
    listEl.appendChild(nav);
  }
  updateNavState();
}

function clearImageNameSearch() {
  imageNameSearch = "";
  imagesPage = 0;
  renderImagesEditor();
}

function setImageNameSearch(val) {
  imageNameSearch = val;
  imagesPage = 0;
  const input = $id("imageNameSearchInput");
  const pos = input ? input.selectionStart : null;
  renderImagesEditor();
  if (input && pos !== null) {
    input.focus();
    try { input.setSelectionRange(pos, pos); } catch (err) {}
  }
}

function startEditImage(index) {
  const images = loadImages();
  editImageBackup = JSON.parse(JSON.stringify(images[index]));
  editingImageIndex = index;
  isNewImage = false;
  isDuplicateImage = false;
  renderImagesEditor();
  checkDuplicateName();
}

function duplicateImage(index) {
  const images = loadImages();
  if (index < 0 || index >= images.length) return;
  const src = images[index];

  let baseName = src.name.replace(/\s*\(\d+\)\s*$/, "").trim();
  const trailingNum = baseName.match(/^(.*?)\s+(\d+)$/);

  const existingNames = new Set(images.map(i => i.name));
  let newName;

  if (trailingNum) {
    const namePart = trailingNum[1];
    let num = parseInt(trailingNum[2], 10);
    while (existingNames.has(`${namePart} ${num + 1}`)) num++;
    newName = `${namePart} ${num + 1}`;
  } else {
    let n = 2;
    while (existingNames.has(`${baseName} ${n}`)) n++;
    newName = `${baseName} ${n}`;
  }

  const copy = JSON.parse(JSON.stringify(src));
  copy.name = newName;
  images.push(copy);
  saveImages(images);

  editingImageIndex = images.length - 1;
  isNewImage = false;
  isDuplicateImage = true;
  editImageBackup = JSON.parse(JSON.stringify(copy));
  renderImagesEditor();
}

function editImageField(field, value) {
  const images = loadImages();
  if (editingImageIndex < 0 || editingImageIndex >= images.length) return;
  const trimmed = value.trim();
  if (field === 'name') {
    const oldName = images[editingImageIndex].name;
    if (oldName !== trimmed) {
      images[editingImageIndex].name = trimmed;
      saveImages(images);
      // Let the host app follow the rename in its own data (optional hook).
      if (typeof SmdConfig !== "undefined" && typeof SmdConfig.onImageRename === "function") {
        SmdConfig.onImageRename(oldName, trimmed);
      }
      return;
    }
  }
  images[editingImageIndex][field] = trimmed;
  saveImages(images);
}

function editImageColor(index, themeIdx, attr, value, el) {
  const images = loadImages();
  if (index < 0 || index >= images.length) return;
  const img = images[index];
  const override = ensureThemeOverride(img, themeIdx);
  if (attr === 'stroke') override.line = value;
  else if (attr === 'fill') override.fill = value;
  saveImages(images);
  updateEditPreview(img, themeIdx);
  if (el) {
    const cb = el.parentElement && el.parentElement.querySelector('smd-checkbox');
    if (cb && cb.checked) cb.checked = false;
  }
}

function editImageFillNone(index, themeIdx, checked) {
  const images = loadImages();
  if (index < 0 || index >= images.length) return;
  const img = images[index];
  const override = ensureThemeOverride(img, themeIdx);
  if (checked) {
    override.fill = "none";
  } else {
    const base = getImageColors(img.data);
    override.fill = base.fill && base.fill !== "none" ? base.fill : "#000000";
  }
  saveImages(images);
  updateEditPreview(img, themeIdx);
}

function editImageStrokeNone(index, themeIdx, checked) {
  const images = loadImages();
  if (index < 0 || index >= images.length) return;
  const img = images[index];
  const override = ensureThemeOverride(img, themeIdx);
  if (checked) {
    override.line = "none";
  } else {
    const base = getImageColors(img.data);
    override.line = base.line && base.line !== "none" ? base.line : "#000000";
  }
  saveImages(images);
  updateEditPreview(img, themeIdx);
}

function editImageStrokeWidth(index, themeIdx, value) {
  const images = loadImages();
  if (index < 0 || index >= images.length) return;
  const img = images[index];
  const override = ensureThemeOverride(img, themeIdx);
  override.width = value || "2";
  saveImages(images);
  updateEditPreview(img, themeIdx);
}

function normalizeSvgForEditing(svgText) {
  svgText = svgText.replace(/<\?xml[^>]*\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const rootHasStroke = /<svg[^>]*\bstroke\s*=/i.test(svgText);
  const rootHasFill = /<svg[^>]*\bfill\s*=/i.test(svgText);
  const firstStroke = svgText.match(/\bstroke\s*=\s*["']([^"']+)["']/i);
  const firstFill = svgText.match(/\bfill\s*=\s*["']([^"']+)["']/i);
  if (!rootHasStroke) {
    const val = firstStroke ? firstStroke[1] : "currentColor";
    svgText = svgText.replace(/<svg/i, `<svg stroke="${val}"`);
  }
  if (!rootHasFill) {
    const val = firstFill ? firstFill[1] : "none";
    svgText = svgText.replace(/<svg/i, `<svg fill="${val}"`);
  }
  return svgText;
}

function openImageUpload(index) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".png,.jpg,.jpeg,.gif,.ico,.svg,.webp";
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const images = loadImages();
      if (index < 0 || index >= images.length) return;
      const img = images[index];
      if (isSvgFile(file)) {
        const svgText = normalizeSvgForEditing(evt.target.result);
        img.data = "data:image/svg+xml," + encodeURIComponent(svgText);
        img.themes = { light: { line: null, fill: null, width: null }, dark: { line: null, fill: null, width: null } };
      } else {
        processRasterUpload(evt.target.result, file, result => {
          img.data = result;
          img.themes = null;
          saveImages(images);
          renderImagesEditor();
        });
        return;
      }
      saveImages(images);
      renderImagesEditor();
    };
    if (isSvgFile(file)) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  };
  input.click();
}

function isSvgFile(file) {
  return file.type === "image/svg+xml" || (file.name && file.name.toLowerCase().endsWith(".svg"));
}

function processRasterUpload(dataUrl, file, callback) {
  const isGif = file.type === "image/gif" || (file.name && file.name.toLowerCase().endsWith(".gif"));
  const isIco = file.type === "image/x-icon" || file.type === "image/vnd.microsoft.icon" || (file.name && file.name.toLowerCase().endsWith(".ico"));
  if (isGif) {
    callback(dataUrl);
    return;
  }
  const isJpg = file.type === "image/jpeg" || (file.name && /\.jpe?g$/i.test(file.name));
  const image = new Image();
  image.onload = () => {
    if (!image.naturalWidth && !image.naturalHeight) {
      callback(dataUrl);
      return;
    }
    const scale = Math.min(1, MAX_RASTER_DIM / Math.max(image.naturalWidth, image.naturalHeight));
    if (scale >= 1 && !isIco) {
      callback(dataUrl);
      return;
    }
    const w = Math.max(1, Math.round(image.naturalWidth * scale));
    const h = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, w, h);
    const mime = isIco || !isJpg ? "image/png" : "image/jpeg";
    const out = mime === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.85) : canvas.toDataURL("image/png");
    callback(out.length > dataUrl.length ? dataUrl : out);
  };
  image.onerror = () => callback(dataUrl);
  image.src = dataUrl;
}

function addNewImage() {
  const images = loadImages();
  const name = "New Image " + (images.length + 1);
  images.push({ name, data: "" });
  saveImages(images);
  imageNameSearch = "";
  editingImageIndex = images.length - 1;
  isNewImage = true;
  isDuplicateImage = false;
  renderImagesEditor();
  checkDuplicateName();
}

// Close the image edit page. Mirrors the app pages' pattern (PlanMyDay
// closeSettings()): smd-page hides itself, then `d-none` is re-applied once the
// slide-out has finished, otherwise the page would stay hit-testable at its
// resting position. (A footer button already auto-hides the page before
// dispatching, so this is idempotent for those.)
let imageEditHideTimer = null;
let imageEditOkDisabled = false;

function hideImageEditPage() {
  const page = document.getElementById("imageEditModal");
  if (!page) return;
  page.hide();
  if (imageEditHideTimer) clearTimeout(imageEditHideTimer);
  imageEditHideTimer = setTimeout(() => {
    imageEditHideTimer = null;
    page.classList.add("d-none");
  }, Math.max(0, (page.slideDuration || 0) + 50));
}

// The OK button lives in the page footer, so the duplicate-name guard toggles it
// through the <smd-button> host's `disabled` attribute (smd-button mirrors it
// onto the inner <button>). Done via the attribute rather than re-assigning
// page.buttons, which would re-render the page and wipe the form mid-typing.
function setImageEditOkDisabled(disabled) {
  imageEditOkDisabled = !!disabled;
  const host = document.getElementById("btnImageEditOk");
  if (!host) return;
  if (imageEditOkDisabled) host.setAttribute("disabled", "");
  else host.removeAttribute("disabled");
}

function checkDuplicateName() {
  const images = loadImages();
  // The Name field is the dialog's only `input.form-control` WITHOUT
  // `form-control-sm` (the stroke-width input has both), so this stays precise
  // now that the form has no wrapping .card to scope it with.
  const input = document.querySelector('#imageEditModalBody input.form-control:not(.form-control-sm)');
  if (!input) return;
  const trimmed = input.value.trim();
  const hasDuplicate = images.some((img, i) => i !== editingImageIndex && img.name === trimmed);
  const errorEl = document.getElementById("imageNameError");
  if (errorEl) errorEl.style.display = hasDuplicate ? "block" : "none";
  setImageEditOkDisabled(hasDuplicate);
}

function doneImageEdit(index) {
  const images = loadImages();
  if (images.some((img, i) => i !== index && img.name === images[index].name)) return;
  imageNameSearch = "";
  const sorted = images.slice().sort((a, b) => a.name.localeCompare(b.name));
  const pos = sorted.findIndex(img => img.name === images[index].name);
  imagesPage = pos >= 0 ? Math.floor(pos / IMAGES_PAGE_SIZE) : 0;
  editingImageIndex = -1;
  isNewImage = false;
  isDuplicateImage = false;
  editImageBackup = null;
  hideImageEditPage();
  renderImagesEditor();
}

function cancelImageEdit() {
  if (editingImageIndex >= 0) {
    const images = loadImages();
    if (isNewImage) {
      images.splice(editingImageIndex, 1);
    } else if (editImageBackup) {
      images[editingImageIndex] = editImageBackup;
    }
    saveImages(images);
  }
  editingImageIndex = -1;
  isNewImage = false;
  isDuplicateImage = false;
  editImageBackup = null;
  hideImageEditPage();
  renderImagesEditor();
}

function confirmDeleteImage(index) {
  const images = loadImages();
  const name = images[index].name;

  showSmdModal({
    title: "Delete Image?",
    content: `Delete image "<strong>${escapeHtml(name)}</strong>"?`,
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function(detail) {
      if (detail.action !== "delete") return;
      deleteImage(index);
    }
  });
}

function deleteImage(index) {
  const images = loadImages();
  const removed = images[index] ? images[index].name : "";
  images.splice(index, 1);
  saveImages(images);
  // Let the host app clear references to the deleted image (optional hook).
  if (removed && typeof SmdConfig !== "undefined" && typeof SmdConfig.onImageDelete === "function") {
    SmdConfig.onImageDelete(removed);
  }
  renderImagesEditor();
}

function openImagesEditor() {
  // Page hosts differ per app; hide whatever this app has (null-safe).
  ["countdownContainer", "streamsEditor", "settingsPage", "jobSearchEditor", "datesEditor", "categoriesEditor"].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("d-none");
  });
  imagesPage = 0;
  const page = document.getElementById("imagesEditor");
  if (!page) return;
  page.classList.remove("d-none");
  renderImagesEditor();
  if (typeof injectStyleInto === "function") {
    injectStyleInto(typeof JOBS_EDITOR_STYLES !== "undefined" ? JOBS_EDITOR_STYLES : undefined);
  }
  page.show();
}

function closeImagesEditor() {
  const page = document.getElementById("imagesEditor");
  if (page) {
    page.hide();
    setTimeout(function() {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
  const main = document.getElementById("countdownContainer");
  if (main) main.classList.remove("d-none");
  editingImageIndex = -1;
  isNewImage = false;
  isDuplicateImage = false;
  editImageBackup = null;
  if (typeof renderMain === "function") renderMain();
}

function getImageByName(name) {
  if (!name) return null;
  const images = loadImages();
  return images.find(i => i.name === name) || null;
}
function isImageInUse(name) {
  if (!name) return false;
  // Apps with a different data model can plug in their own usage check.
  if (typeof SmdConfig !== "undefined" && typeof SmdConfig.imageInUse === "function") {
    return !!SmdConfig.imageInUse(name);
  }
  if (typeof loadStreams !== "function") return false;
  const streams = loadStreams();
  return streams.some(s => s.image === name || (s.jobs || []).some(j => j.image === name));
}
function getImageDataUrl(name) {
  const img = getImageByName(name);
  return img ? getThemedImageDataUrl(img) : null;
}

function seedSampleImages() {
  if (localStorage.getItem(smdImagesKey())) return;
  const root = typeof smdAppRoot === "function" ? smdAppRoot() : "";
  fetch(root + "sampleImages.json?v=" + (typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now()))
    .then(res => res.json())
    .then(data => {
      // Someone may have seeded/imported images while the fetch was in flight.
      if (data && data.images && localStorage.getItem(smdImagesKey()) === null) {
        saveImages(data.images);
      }
    })
    .catch(() => {});
}

function showUploadDialog() {
  let dlg = document.getElementById("uploadProgressDialog");
  if (!dlg) {
    dlg = document.createElement("div");
    dlg.id = "uploadProgressDialog";
    dlg.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center";
    dlg.innerHTML = '<div style="background:var(--bs-body-bg,#1e1e1e);padding:2rem;border-radius:12px;text-align:center;min-width:200px;box-shadow:0 8px 32px rgba(0,0,0,0.3)">'
      + '<div class="spinner-border mb-3" role="status"></div>'
      + '<div>Uploading Standard Imagesâ€¦</div></div>';
    document.body.appendChild(dlg);
  }
  dlg.classList.remove("d-none");
}

function hideUploadDialog() {
  const dlg = document.getElementById("uploadProgressDialog");
  if (dlg) dlg.classList.add("d-none");
}

function uploadStandardImages() {
  showUploadDialog();
  const root = typeof smdAppRoot === "function" ? smdAppRoot() : "";
  fetch(root + "sampleImages.json?v=" + (typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now()))
    .then(res => res.json())
    .then(data => {
      if (!data || !data.images) return;
      const existing = loadImages();
      const existingNames = new Set(existing.map(img => img.name));
      let added = 0;
      data.images.forEach(img => {
        if (!existingNames.has(img.name)) {
          existing.push(img);
          existingNames.add(img.name);
          added++;
        }
      });
      if (added > 0) {
        saveImages(existing);
        renderImagesEditor();
      }
      const total = data.images.length;
      const ignored = total - added;
      showInfoConfirm(`${total} image${total === 1 ? "" : "s"} uploaded.\n${added} added\n${ignored} duplicate${ignored === 1 ? "" : "s"} ignored.`);
    })
    .catch(() => {})
    .finally(() => hideUploadDialog());
}
