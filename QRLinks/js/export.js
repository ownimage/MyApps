// QRLinks — JSON export/import (links + the shared image library).

function exportData() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    links: loadLinks(),
    images: loadImages()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const d = new Date();
  const ts = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") +
    String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
  a.download = `qr-backup-${ts}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      let data = null;
      try {
        data = JSON.parse(evt.target.result);
      } catch (err) {
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
      if (data.links) {
        saveLinks(loadLinks().concat(data.links));
      }
      if (data.images) {
        saveImages(loadImages().concat(data.images));
      }
      renderMain();
      showSmdModal({
        title: "Import",
        content: "Import complete.",
        buttons: [{ text: "OK", variant: "primary", action: "ok" }]
      });
    };
    reader.readAsText(file);
  };
  input.click();
}
