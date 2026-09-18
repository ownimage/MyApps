// QRLinks — localStorage helpers (links). All keys are namespaced through
// smdKey() with the app prefix ("qrlinks_"). Images use the shared
// smd-images.js library ("shared-images").

function loadLinks() {
  return JSON.parse(localStorage.getItem(smdKey("links")) || "[]");
}

function saveLinks(links) {
  localStorage.setItem(smdKey("links"), JSON.stringify(links));
}