// PhoneButtons app entry point: storage namespace + boot wiring for the
// connection status view. Focused on prototyping client <-> server comms; the
// full remote-control UI is intentionally not migrated yet.
//
// Classic script (no modules): top-level functions stay global for inline
// onclick/onchange handlers and for the Playwright suite.

// One storage namespace for every PhoneButtons key (shared services read
// through smdKey()). The shared image library is used by the suite's tiles.
SmdConfig.storagePrefix = "pb";
SmdConfig.imagePrefix = "shared-";

document.addEventListener("DOMContentLoaded", function () {
  applyTheme(getStoredTheme());
  smdBindThemeChange();

  renderMain();
  bindSocketUi();
  _commLine("Phone Buttons ready. Set the server URL in Settings \u2192 Server, then Connect.", "info");

  if (isAutoConnect()) connectServer();

  smdEnablePullToRefresh();
});
