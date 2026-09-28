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

  applyTheme(getStoredTheme());

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
  smdBindThemeChange();

  // Shared image picker (#imagePickerPage) + the "Edit" button on the link
  // <smd-image-select> field.
  smdBindImagePicker();
  smdBindImageSelectActions({
    linkImageSelect: name => { linkField("image", name); updateLinkImagePreview(); }
  });

  // Images editor (shared smd-images.js) page + card actions.
  smdBindImagesEditor();
});

// PWA PULL-TO-REFRESH
smdEnablePullToRefresh();
