// PhoneButtons app entry point: storage namespace + boot wiring for the
// connection status view. Focused on prototyping client <-> server comms; the
// full remote-control UI is intentionally not migrated yet.
//
// Classic script (no modules): top-level functions stay global for inline
// onclick/onchange handlers and for the Playwright suite.

// One storage namespace for every PhoneButtons key (shared services read
// through smdKey()).
SmdConfig.storagePrefix = "pb_";
SmdConfig.imagePrefix = "shared-";

document.addEventListener("DOMContentLoaded", function () {
  applyTheme(getStoredTheme());
  smdBindThemeChange();

  renderMain();
  bindSocketUi();

  // Shared image library + picker, used by the Button editor's image field.
  if (typeof seedSampleImages === "function") seedSampleImages();
  smdBindImagePicker();
  smdBindImageSelectActions({
    buttonImage1Select: buttonImage1SelectHandler,
    buttonImage2Select: buttonImage2SelectHandler
  });

  _commLine("Phone Buttons ready.", "info");

  // The app is served by the server it controls, so connect automatically.
  connectServer();

  // The server opens the browser with ?showQr=1 on startup. Show the Settings
  // page (which holds the "Share app" QR) and scroll the QR into view so it can
  // be scanned straight away with a phone.
  if (new URLSearchParams(window.location.search).get("showQr")) {
    openSettings();
    setTimeout(function () {
      var qr = document.getElementById("shareQrCode");
      if (qr && qr.scrollIntoView) qr.scrollIntoView({ block: "center" });
    }, 400);
  }

  smdEnablePullToRefresh();
});
