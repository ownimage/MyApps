// MyHID app entry point: storage namespace + boot wiring for the
// connection status view. Focused on prototyping client <-> server comms; the
// full remote-control UI is intentionally not migrated yet.
//
// Classic script (no modules): top-level functions stay global for inline
// onclick/onchange handlers and for the Playwright suite.

// One storage namespace for every MyHID key (shared services read
// through smdKey()).
SmdConfig.storagePrefix = "myhid_";
SmdConfig.imagePrefix = "shared-";

// ---------------------------------------------------------------------------
// TEMPORARY (2026-10-27): the app used to be "Phone Buttons" with the `pb_`
// storage prefix. Copy every `pb_*` value into the new `myhid_*` namespace
// (an existing target wins, so a half-migrated browser is never clobbered),
// then drop the old copies so this can only ever run once. REMOVE THIS BLOCK
// AND showMyHidMigrationNotice() once every install has moved.
// ---------------------------------------------------------------------------
var MYHID_LEGACY_PREFIX = "pb_";

// Two keys were renamed as well as re-prefixed: the capture address/token used
// to be called "mouser" (mouserUrl / mouserToken).
var MYHID_LEGACY_KEY_MAP = {
  pb_mouserUrl: "myhid_mouseCaptureUrl",
  pb_mouserToken: "myhid_mouseCaptureToken"
};

function myhidMigrateLegacyStorage() {
  var moved = 0;
  var oldKeys = [];
  try {
    // Collect first: removing entries while walking the index would skip keys.
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf(MYHID_LEGACY_PREFIX) === 0) oldKeys.push(key);
    }
    oldKeys.forEach(function (key) {
      var value = localStorage.getItem(key);
      if (value === null) return;
      var target = MYHID_LEGACY_KEY_MAP[key] ||
        SmdConfig.storagePrefix + key.slice(MYHID_LEGACY_PREFIX.length);
      if (localStorage.getItem(target) === null) {
        localStorage.setItem(target, value);
        moved++;
      }
      localStorage.removeItem(key);
    });
  } catch (e) {
    return 0;
  }
  return moved;
}

// Run at PARSE time (this is the last script in the shell), so every later
// DOMContentLoaded restore already sees the new keys.
var myhidLegacyMigrated = myhidMigrateLegacyStorage();

// TEMPORARY: tell the user what happened. Remove with the migration above.
function showMyHidMigrationNotice(count) {
  showSmdModal({
    title: "Settings moved",
    content: "This app is now called <b>My HID</b>, so its saved settings were " +
      "copied to new storage keys (" + count + " setting" +
      (count === 1 ? "" : "s") + " moved) and the old Phone Buttons copies " +
      "removed.<br><br>Nothing needs doing - this notice is temporary and will " +
      "be removed in a future update.",
    buttons: [{ text: "OK", variant: "primary", action: "ok" }]
  });
}

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

  _commLine("My HID ready.", "info");

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

  // TEMPORARY: one-shot notice for the `pb_` -> `myhid_` migration above.
  if (myhidLegacyMigrated > 0) showMyHidMigrationNotice(myhidLegacyMigrated);

  smdEnablePullToRefresh();
});
