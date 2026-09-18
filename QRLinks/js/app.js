// QRLinks app entry point: storage namespace, boot wiring for the editors,
// image picker plumbing, sample-data seeding, the QR dialog, service-worker
// update prompt and PWA pull-to-refresh.
//
// The app is split into classic scripts (no modules) so every top-level
// function stays a global — generated HTML uses inline onclick handlers and
// the Playwright suite calls these functions from page.evaluate().

// One storage namespace for every QRLinks key (shared services read keys
// through smdKey()). All apps share ONE image library (`shared-images`).
SmdConfig.storagePrefix = "qrlinks_";
SmdConfig.imagePrefix = "shared-";

// All apps on this origin share one image library (`shared-images`), so no
// per-app image migration is needed here.

// Hide every main/editor page except one (null hides them all). Page hosts are
// light-DOM elements so document.getElementById works.
function hideMainPages(exceptId) {
  [
    "countdownContainer",
    "linksEditor", "linkEditPage",
    "imagesEditor", "settingsPage", "imagePickerPage"
  ].forEach(id => {
    if (id === exceptId) return;
    const el = document.getElementById(id);
    if (el) el.classList.add("d-none");
  });
}

// Seed the bundled sample links into an empty store (first visit).
function seedSampleLinks() {
  if (localStorage.getItem(smdKey("links")) !== null) return;
  const v = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now();
  fetch("sampleLinks.json?v=" + v)
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(data => {
      // Someone may have seeded/imported links while the fetch was in flight.
      if (localStorage.getItem(smdKey("links")) !== null) return;
      const links = (data && data.streams) || (data && data.links) || [];
      if (!links.length) return;
      links.forEach((link, i) => { link.sequence = i + 1; });
      saveLinks(links);
      renderMain();
    })
    .catch(() => {});
}

// The shared smd-images.js calls these hooks so QRLinks' own data model stays
// consistent when images are renamed/deleted and the "in use" flag reflects
// link references (the shared default only knows streams).
SmdConfig.imageInUse = function (name) {
  if (!name) return false;
  return loadLinks().some(l => l.image === name);
};

SmdConfig.onImageDelete = function (name) {
  if (!name) return;
  const links = loadLinks();
  let changed = false;
  links.forEach(l => { if (l.image === name) { l.image = ""; changed = true; } });
  if (changed) saveLinks(links);
};

SmdConfig.onImageRename = function (oldName, newName) {
  if (!oldName || !newName) return;
  const links = loadLinks();
  let changed = false;
  links.forEach(l => { if (l.image === oldName) { l.image = newName; changed = true; } });
  if (changed) saveLinks(links);
};

// QR dialog for a link (shared smd-modal + smd-qrcode).
function showQrModal(url, title) {
  if (!url) return;
  showSmdModal({
    title: title || "QR Code",
    content: '<div class="text-center">' +
      `<smd-qrcode value="${escAttr(url)}" size="180"></smd-qrcode>` +
      `<div class="mt-2 small text-secondary">${escapeHtml(url)}</div>` +
      '</div>',
    buttons: [
      { text: "Close", variant: "secondary", action: "close" },
      { text: "Open", variant: "primary", action: "open" }
    ],
    onAction: function (detail) {
      if (detail.action === "open") window.open(url, "_blank");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyImageSize();
  window.addEventListener("resize", applyImageSize);

  applyTheme(localStorage.getItem(smdKey("theme")) || "superhero");

  renderMain();
  if (typeof seedSampleImages === "function") seedSampleImages();
  seedSampleLinks();

  // Main view: the QR buttons on the link tiles.
  const container = document.getElementById("countdownContainer");
  if (container) {
    container.addEventListener("qrlink-qr", e => {
      const detail = e.detail || {};
      showQrModal(detail.url, detail.title);
    });
  }

  // The settings General tab uses the shared <smd-theme> component.
  document.addEventListener("smd-theme-change", function (e) {
    const theme = e.detail && e.detail.theme;
    if (theme && typeof changeTheme === "function") changeTheme(theme);
  });

  // smd-image-select "Edit" buttons open the SHARED image picker on
  // #imagePickerPage. Selection/no-image/cancel resolve the callback.
  let pickerCallback = null;
  let pickerHost = null;
  window.__openImagePicker = function (callback) {
    pickerCallback = callback || null;
    pickerHost = document.getElementById("imagePickerPage");
    if (!pickerHost) return;
    pickerHost.title = "Choose Image";
    pickerHost.content = `<smd-image-picker id="pickerHost" key-prefix="${smdImagePrefix()}"></smd-image-picker>`;
    pickerHost.buttons = [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "No Image", variant: "secondary", action: "no-image" }
    ];
    if (!pickerHost.__pickerBound) {
      pickerHost.__pickerBound = true;
      pickerHost.addEventListener("smd-page-action", function (e) {
        const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
        if (action === "cancel" || action === "no-image") window.__finishImagePick(null);
      });
    }
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
      const ms = pickerHost.slideDuration || 0;
      setTimeout(function () { pickerHost.classList.add("d-none"); }, ms > 0 ? ms + 50 : 0);
    }
  };
  document.addEventListener("smd-image-picker-select", function (e) {
    window.__finishImagePick(e.detail ? e.detail.name : null);
  });

  document.addEventListener("smd-image-select-action", function (e) {
    const path = e.composedPath ? e.composedPath() : [];
    const sel = (path && path.find(function (el) { return el && el.tagName === "SMD-IMAGE-SELECT"; })) || null;
    if (!sel || !sel.id) return;
    if (sel.id === "linkImageSelect") {
      window.__openImagePicker(function (name) {
        linkField("image", name || "");
        updateLinkImagePreview();
      });
    }
  });

  // Images editor (shared smd-images.js) page + card actions.
  const imagesEditorPage = document.getElementById("imagesEditor");
  if (imagesEditorPage) {
    imagesEditorPage.addEventListener("smd-page-action", function (e) {
      const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
      if (action === "add") addNewImage();
      else if (action === "done") closeImagesEditor();
    });
    imagesEditorPage.addEventListener("smd-image-card-action", function (e) {
      const action = e.detail && e.detail.action;
      const idx = e.detail && e.detail.index;
      if (action === "delete") confirmDeleteImage(idx);
      else if (action === "duplicate") duplicateImage(idx);
      else if (action === "edit") startEditImage(idx);
    });
  }
});

// PWA PULL-TO-REFRESH
(function () {
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
