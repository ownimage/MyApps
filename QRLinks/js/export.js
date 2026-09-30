// QRLinks — JSON export/import (links + the shared image library).

function exportData() {
  smdDownloadJson({
    version: 1,
    exportedAt: new Date().toISOString(),
    links: loadLinks(),
    images: loadImages()
  }, "qr-backup");
}

function importData() {
  smdReadJsonFile(function (data) {
    if (data === undefined) {
      showSmdModal({
        title: "Import",
        content: "Invalid JSON file.",
        buttons: [{ text: "OK", variant: "primary", action: "ok" }]
      });
      return;
    }
    if (!data || (!data.links && !data.images)) {
      showSmdModal({
        title: "Import",
        content: "Invalid backup file: missing links or images data.",
        buttons: [{ text: "OK", variant: "primary", action: "ok" }]
      });
      return;
    }
    if (data.links) saveLinks(loadLinks().concat(data.links));
    if (data.images) saveImages(loadImages().concat(data.images));
    renderMain();
    showSmdModal({
      title: "Import",
      content: "Import complete.",
      buttons: [{ text: "OK", variant: "primary", action: "ok" }]
    });
  });
}
