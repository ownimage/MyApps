// MyHID — "Manage mouse-capture" page (main menu).
//
// The capture client (MyHID/mouse-capture) runs on the PC that has the mouse. It
// serves a small JSON management API on its own socket, optionally published
// through a Cloudflare quick tunnel, and prints a QR for
// `<panel-url>/?t=<token>`. This page is the CONFIGURATION UI for it: paste the
// address or scan the QR, then pick the mouse, the mode buttons and the telemetry
// target, and start/stop the capture.
//
// When the capture runs on THIS box (server started with --mouse-capture) the server
// reports its address on /api/mouse-capture and the page adopts it automatically,
// so there is nothing to scan.
//
// The capture panel itself is deliberately not a UI: one configuration surface
// (this one, with the shared smd-* components) beats two divergent copies.

var _mouseCaptureState = null;        // last /api/state payload
var _mouseCaptureTimer = null;        // polling while the page is open
var _mouseCaptureDeviceSignature = ""; // hardware ids, so the radio list is only rebuilt on change
var _mouseCaptureScanCloseTimer = null;
var _mouseCaptureLearnBusy = false;   // a /api/learn-button call is in flight
var _mouseCaptureBusy = false;        // a start/stop POST is in flight

// ---- stored address --------------------------------------------------------

function myhidCaptureUrl() {
  return (localStorage.getItem(smdKey("mouseCaptureUrl")) || "").trim();
}

function myhidCaptureToken() {
  return (localStorage.getItem(smdKey("mouseCaptureToken")) || "").trim();
}

function myhidSetHidAddress(base, token) {
  localStorage.setItem(smdKey("mouseCaptureUrl"), String(base || "").replace(/\/+$/, ""));
  localStorage.setItem(smdKey("mouseCaptureToken"), String(token || ""));
}

// Parse what the capture panel printed (or its QR contains):
//   https://quiet-fox.trycloudflare.com/?t=abc
//   http://192.168.1.60:7802/?t=abc
//   http://192.168.1.60:7802
// The token is SPLIT OUT of the address (it travels in a header, not every URL).
function myhidParseHidUrl(text) {
  var raw = String(text == null ? "" : text).trim();
  if (!raw) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = "http://" + raw;

  try {
    var url = new URL(raw);
    var host = url.hostname;
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i.test(host)) return null;
    var port = url.port || "";
    if (port && (!/^\d{1,5}$/.test(port) || +port < 1 || +port > 65535)) return null;

    return {
      base: url.protocol + "//" + host + (port ? ":" + port : ""),
      token: url.searchParams.get("t") || ""
    };
  } catch (e) {
    return null;
  }
}

// ---- API -------------------------------------------------------------------

function myhidCaptureApi(path, options) {
  var base = myhidCaptureUrl();
  if (!base) {
    return Promise.reject(new Error("no capture address yet - paste the one the panel shows, or scan its QR"));
  }

  var headers = { "X-HID-Token": myhidCaptureToken() };
  var init = { method: (options && options.method) || "GET", headers: headers, cache: "no-store" };
  if (options && options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  return fetch(base + path, init).then(function (resp) {
    return resp.text().then(function (text) {
      var data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }

      if (resp.status === 403) {
        var hint = data && data.tokenHint ? String(data.tokenHint) : "";
        var mine = myhidCaptureToken();
        var mineHint = mine ? mine.slice(-4) : "none";
        throw new Error("the capture panel rejected the token (403)"
          + (hint ? ": the panel's token ends \"" + hint + "\" but this app is using \"" + mineHint + "\"" : "")
          + " - scan the panel's QR again, or paste its full address (it ends with ?t=)");
      }
      if (!resp.ok) {
        throw new Error("HTTP " + resp.status + (data && data.error ? ": " + data.error : ""));
      }
      return data;
    });
  }, function () {
    throw new Error("cannot reach the capture panel at " + base + " - is it running, and is the tunnel up?");
  });
}

// ---- page ------------------------------------------------------------------

function buildMouseCapturePage(page) {
  page.title = "Manage mouse-capture";
  page.content =
    '<div class="mb-3">' +
      '<label class="form-label" for="mouseCaptureUrlInput">Capture panel address</label>' +
      '<div class="d-flex gap-2 align-items-stretch flex-wrap myhid-capture-row">' +
        '<input type="text" id="mouseCaptureUrlInput" class="form-control flex-grow-1" ' +
          'placeholder="https://something.trycloudflare.com/?t=..." ' +
          'autocapitalize="off" autocomplete="off" spellcheck="false">' +
        '<smd-button id="btnHidScan" variant="secondary" size="small" icon="fa-solid fa-qrcode">Scan QR</smd-button>' +
        '<smd-button id="btnHidSave" variant="primary" size="small">Save</smd-button>' +
      '</div>' +
      '<div id="mouseCaptureAddressHint" class="form-text">' +
        'The capture client prints this address (and a QR) when it starts.' +
      '</div>' +
    '</div>' +
    '<div id="mouseCaptureStatus" class="alert alert-secondary py-2 px-3 mb-3" role="status">Not connected.</div>' +
    mouseCaptureConfigHtml();

  page.buttons = [
    { text: "Close", variant: "secondary", action: "close", id: "btnHidClose" }
  ];
}

function mouseCaptureConfigHtml() {
  function buttonRow(id, learnId) {
    return '<div class="col-8 d-flex gap-2 align-items-stretch flex-wrap myhid-capture-row">' +
      '<smd-select id="' + id + '"></smd-select>' +
      '<smd-button id="' + learnId + '" variant="primary" size="small" ' +
        'icon="fa-solid fa-crosshairs">Learn</smd-button>' +
      '</div>';
  }

  return '' +
    '<div class="row mb-4 align-items-start col-md-8">' +
      '<div class="col-4 text-end pt-2"><label class="form-label mb-0">Mouse</label></div>' +
      '<div class="col-8">' +
        '<div id="mouseCaptureDevices" class="mb-2"><span class="text-body-secondary small">Loading mice&hellip;</span></div>' +
        '<div class="d-flex gap-2 flex-wrap myhid-capture-row">' +
          '<smd-button id="btnHidRefresh" variant="secondary" size="small" icon="fa-solid fa-rotate">Refresh</smd-button>' +
          '<smd-button id="btnHidIdentify" variant="primary" size="small" ' +
            'icon="fa-solid fa-bullseye">Identify</smd-button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="row mb-4 align-items-center col-md-8">' +
      '<div class="col-4 text-end"><label class="form-label mb-0">Rotate button</label></div>' +
      buttonRow("mouseCaptureRotate", "btnHidLearnRotate") +
    '</div>' +
    '<div class="row mb-4 align-items-center col-md-8">' +
      '<div class="col-4 text-end"><label class="form-label mb-0">Translate button</label></div>' +
      buttonRow("mouseCaptureTranslate", "btnHidLearnTranslate") +
    '</div>' +
    '<div class="row mb-4 align-items-center col-md-8">' +
      '<div class="col-4 text-end"><label class="form-label mb-0">Mode buttons</label></div>' +
      '<div class="col-8"><smd-checkbox id="mouseCapturePassMode">Also click in the app (do not swallow)</smd-checkbox></div>' +
    '</div>' +
    '<div class="row mb-4 align-items-center col-md-8">' +
      '<div class="col-4 text-end"><label class="form-label mb-0">Auto-start</label></div>' +
      '<div class="col-8"><smd-checkbox id="mouseCaptureAutoStart">Start the previous session when the panel opens</smd-checkbox></div>' +
    '</div>' +
    '<div class="row mb-4 align-items-start col-md-8">' +
      '<div class="col-4 text-end pt-2"><label class="form-label mb-0" for="mouseCaptureUdp">Server (UDP)</label></div>' +
      '<div class="col-8">' +
        '<div class="d-flex gap-2 align-items-stretch flex-wrap myhid-capture-row">' +
          '<input type="text" id="mouseCaptureUdp" class="form-control flex-grow-1" placeholder="192.168.1.50:7801" ' +
            'autocapitalize="off" autocomplete="off" spellcheck="false">' +
          '<smd-button id="btnHidPing" variant="primary" size="small">Ping</smd-button>' +
        '</div>' +
        '<div id="mouseCapturePingResult" class="form-text"></div>' +
      '</div>' +
    '</div>' +
    '<div class="myhid-capture-actions d-flex mb-3">' +
      '<smd-button id="btnHidStart" variant="primary" icon="fa-solid fa-play">Start capture</smd-button>' +
      '<smd-button id="btnHidStop" variant="danger" icon="fa-solid fa-stop">Stop</smd-button>' +
    '</div>' +
    '<div id="mouseCaptureTelemetry" class="small text-body-secondary"></div>';
}

function openMouseCapture() {
  var page = document.getElementById("mouseCapturePage");
  if (!page) return;

  // A SMALL badge whose space is RESERVED while the mouse is still: "moving" flips
  // constantly, and a badge that appears/disappears re-flows the hardware-id line
  // (and the whole list, if the rows are rebuilt). This is the app's only styling.
  if (typeof injectSmdComponentStyle === "function") {
    injectSmdComponentStyle("myhid-devices", [
      "#mouseCaptureDevices .myhid-badge { font-size: 0.62em; line-height: 1;",
      "  padding: 0.2em 0.45em; vertical-align: 0.1em; margin-right: 0.4em; }",
      "#mouseCaptureDevices .myhid-moving-off { visibility: hidden; }",
      // Every FORM button takes a quarter of its row, so the rows line up whatever
      // the labels say; the input/select beside it takes the rest. The Start/Stop
      // pair is the exception (see .myhid-capture-actions).
      //
      // A flat 25% clips the labels on a phone (97px for "Scan QR"), so the host is
      // a flex container whose min-width is its own content: it is a quarter while
      // that fits and grows to fit the label when it does not (the input shrinks /
      // the row wraps instead of truncating).
      "#mouseCapturePage .smd-page-body .myhid-capture-row smd-button { display: flex !important; flex: 0 0 25%; min-width: fit-content; }",
      "#mouseCapturePage .smd-page-body .myhid-capture-row smd-select { flex: 1 1 auto; min-width: 0; }",
      // <smd-button> is a HOST wrapping a real <button>: sizing the host alone leaves
      // the visible button content-sized in the middle of its slot, so let the inner
      // button fill the host.
      "#mouseCapturePage .smd-page-body smd-button > button { flex: 1 1 auto; width: 100%; }",
      // .form-control is width:100%, so without this its basis fills the row and the
      // button wraps onto its own line.
      "#mouseCapturePage .smd-page-body .myhid-capture-row .form-control { flex: 1 1 0; width: auto; min-width: 0; }",
      // Start/Stop: equal halves of the space left after the gaps, inset from both
      // ends (flex:1 1 0 rather than width:50%, which a gap would overflow).
      "#mouseCapturePage .smd-page-body .myhid-capture-actions { gap: 0.5rem; padding-inline: 0.5rem; }",
      "#mouseCapturePage .smd-page-body .myhid-capture-actions smd-button { flex: 1 1 0; }"
    ].join(""));
  }

  if (!page.__mouseCaptureBound) {
    page.__mouseCaptureBound = true;

    page.addEventListener("click", mouseCaptureOnClick);
    page.addEventListener("change", mouseCaptureOnChange);
    page.addEventListener("smd-select-change", mouseCaptureOnSelect);
    page.addEventListener("smd-page-action", function () { hideMouseCapture(); });
  }

  buildMouseCapturePage(page);
  _openWizardPage(page);

  var rotate = document.getElementById("mouseCaptureRotate");
  var translate = document.getElementById("mouseCaptureTranslate");
  var options = [
    { value: "0", label: "Off" },
    { value: "3", label: "Middle button" },
    { value: "4", label: "MB4 (side)" },
    { value: "5", label: "MB5 (side)" }
  ];
  if (rotate) rotate.options = options;
  if (translate) translate.options = options;

  restoreHidAddress();
  _mouseCaptureState = null;
  _mouseCaptureDeviceSignature = "";
  _mouseCaptureIdentify = null;
  _mouseCaptureLearnBusy = false;
  _mouseCaptureBusy = false;
  _mouseCapturePollMs = 1500;
  _mouseCaptureUdpDefaultDone = false;
  mouseCaptureSetButtonVariant("btnHidIdentify", "primary");
  mouseCaptureSetHint("");
  mouseCaptureDisableActions("There is no capture to control yet");

  // A same-box capture is picked up without a scan; a remote one needs the address
  // the user pasted/scanned, so only discover when nothing is stored.
  Promise.resolve(myhidCaptureUrl() ? false : mouseCaptureAdoptFromServer()).then(function () {
    restoreHidAddress();
    mouseCaptureRefresh();
  });

  clearInterval(_mouseCaptureTimer);
  _mouseCaptureTimer = setInterval(mouseCaptureRefresh, _mouseCapturePollMs);
}

function hideMouseCapture() {
  var page = document.getElementById("mouseCapturePage");
  if (_mouseCaptureIdentify) mouseCaptureStopIdentify(null);
  clearInterval(_mouseCaptureTimer);
  _mouseCaptureTimer = null;
  if (page) _hideWizardPage(page);
}

function restoreHidAddress() {
  var input = document.getElementById("mouseCaptureUrlInput");
  // The field always shows the FULL address, token included: copying it out of the
  // app must give the next device everything it needs (the token is stored apart).
  if (input) input.value = mouseCaptureFullAddress();
}

function mouseCaptureFullAddress() {
  var base = myhidCaptureUrl();
  if (!base) return "";
  var token = myhidCaptureToken();
  return base + (token ? "/?t=" + token : "");
}

// ---- handlers --------------------------------------------------------------

function mouseCaptureOnClick(event) {
  var button = event.target && event.target.closest ? event.target.closest("smd-button") : null;
  if (!button || !button.id) return;

  switch (button.id) {
    case "btnHidSave":
      mouseCaptureSaveAddress();
      break;
    case "btnHidScan":
      openHidScan();
      break;
    case "btnHidRefresh":
      myhidCaptureApi("/api/devices", { method: "POST" })
        .then(function (res) { mouseCaptureRenderDevices(res.devices || []); })
        .catch(function (err) { mouseCaptureSetHint(err.message, true); });
      break;
    case "btnHidStart":
      mouseCaptureStart();
      break;
    case "btnHidStop":
      mouseCaptureStop();
      break;
    case "btnHidPing":
      mouseCapturePing();
      break;
    case "btnHidIdentify":
      mouseCaptureToggleIdentify();
      break;
    case "btnHidLearnRotate":
      mouseCaptureLearnButton("rotate");
      break;
    case "btnHidLearnTranslate":
      mouseCaptureLearnButton("translate");
      break;
  }
}

function mouseCaptureOnChange(event) {
  var el = event.target;
  if (!el) return;

  // Pasting/typing an address and leaving the field IS "use this" - the user should
  // not have to find Save first (and a half-applied address is exactly what makes a
  // panel answer 403 with a token the app never picked up).
  if (el.id === "mouseCaptureUrlInput") {
    mouseCaptureSaveAddress();
    return;
  }

  // The mouse list is native radios (smd-checkbox is checkbox-only).
  if (el.name === "myhidCaptureDevice") {
    mouseCaptureSaveConfig({ device: el.value });
    return;
  }

  // smd-checkbox also dispatches a composed change on the HOST; ignore the inner
  // input so one toggle does not save twice.
  if (el.tagName === "INPUT") return;

  if (el.id === "mouseCapturePassMode") mouseCaptureSaveConfig({ passModeButtons: !!el.checked });
  if (el.id === "mouseCaptureAutoStart") mouseCaptureSaveConfig({ autoStart: !!el.checked });
}

function mouseCaptureOnSelect(event) {
  var el = event.target;
  if (!el || !el.id) return;
  var detail = event.detail;
  var value = detail && detail.value !== undefined ? detail.value : "";

  if (el.id === "mouseCaptureRotate") mouseCaptureSaveConfig({ rotateButton: value });
  if (el.id === "mouseCaptureTranslate") mouseCaptureSaveConfig({ translateButton: value });
}

// ---- actions ---------------------------------------------------------------

function mouseCaptureSaveAddress() {
  var input = document.getElementById("mouseCaptureUrlInput");
  var parsed = myhidParseHidUrl(input ? input.value : "");

  if (!parsed) {
    mouseCaptureSetHint("That is not a capture address. Paste the URL the panel shows (it ends with ?t=...).", true);
    return;
  }

  // Leaving the field unchanged must not wipe the live state and re-poll for nothing.
  if (parsed.base === myhidCaptureUrl() && parsed.token === myhidCaptureToken()) {
    restoreHidAddress();
    return;
  }

  myhidSetHidAddress(parsed.base, parsed.token);
  restoreHidAddress();
  mouseCaptureSetHint(parsed.token
    ? "Address saved (token ends \"" + parsed.token.slice(-4) + "\")."
    : "Address saved, but it has no ?t= token, so the panel will refuse it (403). "
      + "Copy the FULL address the panel page shows.", !parsed.token);

  _mouseCaptureState = null;
  _mouseCaptureDeviceSignature = "";
  mouseCaptureRefresh();
}

function mouseCaptureSaveConfig(patch, options) {
  var silent = !!(options && options.silent);
  var current = (_mouseCaptureState && _mouseCaptureState.config) || null;
  if (!current) {
    if (!silent) mouseCaptureSetHint("No state from the capture panel yet.", true);
    return Promise.resolve(false);
  }

  var merged = {
    device: patch.device !== undefined ? patch.device : current.device || null,
    rotateButton: Number(patch.rotateButton !== undefined ? patch.rotateButton : current.rotateButton),
    translateButton: Number(patch.translateButton !== undefined ? patch.translateButton : current.translateButton),
    passModeButtons: patch.passModeButtons !== undefined ? !!patch.passModeButtons : !!current.passModeButtons,
    autoStart: patch.autoStart !== undefined ? !!patch.autoStart : !!current.autoStart,
    udp: patch.udp !== undefined ? patch.udp : current.udp || null,
    panelPort: current.panelPort,
    bindLan: !!current.bindLan,
    tunnel: !!current.tunnel,
    publicUrl: current.publicUrl || null
  };

  // What is running was armed with the OLD setting; tell the user it needs a restart.
  var needsRestart = patch.device !== undefined || patch.rotateButton !== undefined
    || patch.translateButton !== undefined || patch.passModeButtons !== undefined;

  // Resolves TRUE only when the panel accepted it: a caller that reports success
  // must not claim it after a rejected save (that masked a real 400 - "learned MB5"
  // with the dropdown unchanged).
  return myhidCaptureApi("/api/config", { method: "POST", body: merged })
    .then(function (res) {
      if (_mouseCaptureState) _mouseCaptureState.config = res.config;
      if (!silent) {
        mouseCaptureSetHint(needsRestart && _mouseCaptureState && _mouseCaptureState.capture.running
          ? "Saved. Stop and start the capture to apply it."
          : "Saved.");
      }
      mouseCaptureRenderStatus();
      return true;
    })
    .catch(function (err) {
      if (!silent) mouseCaptureSetHint(err.message, true);
      return false;
    });
}

function mouseCaptureStart() {
  if (_mouseCaptureBusy) return;
  mouseCaptureSetHint("");
  mouseCaptureSetBusy(true);
  myhidCaptureApi("/api/capture/start", { method: "POST" })
    .then(function () { return mouseCaptureRefresh(); })
    .catch(function (err) { mouseCaptureSetHint(err.message, true); })
    .then(function () {
      mouseCaptureSetBusy(false);
      // Re-render from the state the panel just gave us: that is what flips the
      // pair over (Start disabled, Stop enabled).
      mouseCaptureRenderStatus();
    });
}

function mouseCaptureStop() {
  if (_mouseCaptureBusy) return;
  mouseCaptureSetHint("");
  mouseCaptureSetBusy(true);
  myhidCaptureApi("/api/capture/stop", { method: "POST" })
    .then(function () { return mouseCaptureRefresh(); })
    .catch(function (err) { mouseCaptureSetHint(err.message, true); })
    .then(function () {
      mouseCaptureSetBusy(false);
      mouseCaptureRenderStatus();
    });
}

function mouseCapturePing() {
  var input = document.getElementById("mouseCaptureUdp");
  var out = document.getElementById("mouseCapturePingResult");
  var target = input ? input.value.trim() : "";

  if (out) out.textContent = "pinging " + (target || "the saved server") + " ...";

  // A UDP target typed here is saved as well, so "Ping" doubles as "test and keep".
  var patch = target ? mouseCaptureSaveConfig({ udp: target }) : Promise.resolve();

  patch.then(function () {
    return myhidCaptureApi("/api/ping", { method: "POST", body: target ? { udp: target } : {} });
  }).then(function (res) {
    if (!out) return;
    out.textContent = res.ok
      ? "reply from " + res.target + " - " + Math.round(res.rttMs) + " ms (" + res.replies + "/" + res.attempts + ")"
      : (res.message || "no reply");
  }).catch(function (err) {
    if (out) out.textContent = err.message;
  });
}

// ---- identify the mouse by moving it ---------------------------------------
//
// The panel reports CUMULATIVE motion per device, so two polls give a delta. The
// mouse that moves most while Identify is listening is the one that gets selected.

var _mouseCaptureIdentify = null;    // { until, baseline: {hardwareId: motion} }
var _mouseCapturePollMs = 1500;

function mouseCaptureSetButtonVariant(id, variant) {
  var el = document.getElementById(id);
  // <smd-button> re-applies variant/size/disabled after build; only its LABEL is
  // captured once, so colour is the safe "this is armed" signal.
  if (el) el.setAttribute("variant", variant);
}

function mouseCaptureSetDisabled(id, disabled, reason) {
  var el = document.getElementById(id);
  if (!el) return;
  if (disabled) el.setAttribute("disabled", "");
  else el.removeAttribute("disabled");
  // A disabled control explains itself on hover (the host's title reaches the
  // inner button, which is the real hover target).
  el.title = disabled ? (reason || "Stop the capture first") : "";
}

// Start/Stop are the ONLY pair that must never both be usable: whichever one
// cannot act is disabled, and while a start/stop POST is in flight neither can.
function mouseCaptureDisableActions(reason) {
  mouseCaptureSetDisabled("btnHidStart", true, reason || "There is no capture to control");
  mouseCaptureSetDisabled("btnHidStop", true, reason || "There is no capture to control");
}

function mouseCaptureSetBusy(busy) {
  _mouseCaptureBusy = !!busy;
  if (_mouseCaptureBusy) mouseCaptureDisableActions("Waiting for the capture panel");
}

// The MyHID server receives telemetry on UDP 7801; Settings | Server holds the
// host, so an unset capture target defaults to <that host>:7801.
var _mouseCaptureUdpDefaultDone = false;

function mouseCaptureDefaultUdp() {
  var host = typeof myhidServerAddress === "function" ? myhidServerAddress() : "";
  var complete = typeof myhidHostComplete === "function" ? myhidHostComplete(host) : !!host;
  return complete ? host + ":7801" : "";
}

function mouseCaptureApplyUdpDefault(config) {
  if (_mouseCaptureUdpDefaultDone) return;
  if (config && config.udp) {
    _mouseCaptureUdpDefaultDone = true;
    return;
  }

  var fallback = mouseCaptureDefaultUdp();
  if (!fallback) return;

  _mouseCaptureUdpDefaultDone = true;
  // SAVE it, not just show it: a field that looks configured while the capture sends
  // nowhere is worse than an empty one.
  mouseCaptureSaveConfig({ udp: fallback }, { silent: true });
}

function mouseCaptureSetPollInterval(ms) {
  _mouseCapturePollMs = ms;
  if (!_mouseCaptureTimer) return;
  clearInterval(_mouseCaptureTimer);
  _mouseCaptureTimer = setInterval(mouseCaptureRefresh, ms);
}

function mouseCaptureToggleIdentify() {
  if (_mouseCaptureLearnBusy) {
    mouseCaptureSetHint("Already listening for a button - finish that first.");
    return;
  }
  if (_mouseCaptureIdentify) {
    mouseCaptureStopIdentify("Identify cancelled.");
    return;
  }

  if (!_mouseCaptureState) {
    mouseCaptureSetHint("No state from the capture panel yet.", true);
    return;
  }

  if (_mouseCaptureState.capture && _mouseCaptureState.capture.running) {
    mouseCaptureSetHint("Stop the capture first - identify and learn only work while it is stopped.", true);
    return;
  }

  var baseline = {};
  (_mouseCaptureState.devices || []).forEach(function (device) {
    baseline[device.hardwareId] = device.motion || 0;
  });

  _mouseCaptureIdentify = { until: Date.now() + 8000, baseline: baseline };
  mouseCaptureSetButtonVariant("btnHidIdentify", "warning");

  var gated = _mouseCaptureState.capture && _mouseCaptureState.capture.running
    ? " (do not hold a mode button while it listens)"
    : "";
  mouseCaptureSetHint("Listening for 8 seconds - move the mouse you want to use" + gated + " ...");
  mouseCaptureSetPollInterval(500);
}

function mouseCaptureStopIdentify(message) {
  if (!_mouseCaptureIdentify) return;
  _mouseCaptureIdentify = null;
  mouseCaptureSetButtonVariant("btnHidIdentify", "primary");
  mouseCaptureSetPollInterval(1500);
  if (message) mouseCaptureSetHint(message);
}

function mouseCaptureIdentifyStep(state) {
  if (!_mouseCaptureIdentify) return;

  var best = null;
  var bestDelta = 0;

  (state.devices || []).forEach(function (device) {
    var key = device.hardwareId;
    var previous = _mouseCaptureIdentify.baseline[key];
    _mouseCaptureIdentify.baseline[key] = device.motion || 0;
    if (previous === undefined) return;   // the first sample has no delta yet

    var delta = (device.motion || 0) - previous;
    if (delta > bestDelta) {
      bestDelta = delta;
      best = device;
    }
  });

  // A few counts filters out the jitter of a resting mouse.
  if (best && bestDelta >= 5) {
    var name = best.name || best.hardwareId;
    // Save FIRST: mouseCaptureSaveConfig sets its own "Saved." hint, so the confirmation
    // has to come after it or it would be overwritten immediately.
    mouseCaptureStopIdentify(null);
    mouseCaptureSaveConfig({ device: best.hardwareId }).then(function () {
      mouseCaptureSetHint("Selected " + name + ".");
    });
    return;
  }

  if (Date.now() > _mouseCaptureIdentify.until) {
    mouseCaptureStopIdentify("No movement detected - try again and move the mouse while it listens.");
  }
}

// ---- learn a mode button ---------------------------------------------------

function mouseCaptureLearnButton(which) {
  // One learn at a time: a second click while the panel is still waiting would
  // POST again and the panel answers 409 ("already learning"), which used to show
  // up as a red error for what looked like a normal click.
  if (_mouseCaptureLearnBusy) {
    mouseCaptureSetHint("Already listening - click the mouse button now, or wait for the timeout.");
    return;
  }

  if (!_mouseCaptureState) {
    mouseCaptureSetHint("No state from the capture panel yet.", true);
    return;
  }

  if (_mouseCaptureState.capture && _mouseCaptureState.capture.running) {
    mouseCaptureSetHint("Stop the capture first - identify and learn only work while it is stopped.", true);
    return;
  }

  var buttonId = which === "rotate" ? "btnHidLearnRotate" : "btnHidLearnTranslate";
  var label = which === "rotate" ? "Rotate" : "Translate";

  _mouseCaptureLearnBusy = true;
  mouseCaptureSetButtonVariant(buttonId, "warning");
  // Lock the whole group (Identify + both Learn buttons) for the duration.
  mouseCaptureSetDisabled("btnHidIdentify", true, "Already listening for a button");
  mouseCaptureSetDisabled("btnHidLearnRotate", true, "Already listening for a button");
  mouseCaptureSetDisabled("btnHidLearnTranslate", true, "Already listening for a button");
  mouseCaptureSetHint("Learning the " + label.toLowerCase() + " button: click a mouse button now ...");

  // The panel arms a short-lived session for the learn (so the click is swallowed);
  // the user's own capture stays stopped, which is why no start happens here.
  myhidCaptureApi("/api/learn-button", { method: "POST", body: { timeoutMs: 10000 } })
    .then(function (result) {
      if (!result || result.ok !== true) {
        mouseCaptureSetHint(result && result.message ? result.message : "no button was pressed - try again", true);
        return null;
      }

      var button = Number(result.button);
      if (button !== 3 && button !== 4 && button !== 5) {
        mouseCaptureSetHint("That is the " + (button === 1 ? "left" : button === 2 ? "right" : "extra") +
          " button - use the middle (3) or a side button (4/5).", true);
        return null;
      }

      var patch = which === "rotate" ? { rotateButton: button } : { translateButton: button };
      return mouseCaptureSaveConfig(patch).then(function (saved) {
        // Only claim success when the panel ACCEPTED it. A rejected save (e.g. both
        // modes on the same button) used to be masked by this message, which looked
        // exactly like "the button was learned but the dropdown did not change".
        if (saved) mouseCaptureSetHint(label + " = MB" + button + ". Stop and start the capture to apply it.");
      });
    })
    .catch(function (err) {
      mouseCaptureSetHint(err && err.message ? err.message : "could not learn a button", true);
    })
    .then(function () {
      _mouseCaptureLearnBusy = false;
      mouseCaptureSetButtonVariant(buttonId, "primary");
      // The refresh re-renders the disabled states from the panel's own state.
      return mouseCaptureRefresh();
    });
}

// ---- server-side discovery (--mouse-capture on this box) --------------------------

function mouseCaptureAdoptFromServer() {
  return fetch(myhidServerBase() + "/api/mouse-capture", { cache: "no-store" })
    .then(function (resp) { return resp.ok ? resp.json() : null; })
    .then(function (info) {
      if (!info || !info.url) return false;
      var parsed = myhidParseHidUrl(info.url);
      if (!parsed) return false;
      myhidSetHidAddress(parsed.base, parsed.token || info.token || "");
      mouseCaptureSetHint("Using the capture running on this server: " + parsed.base);
      return true;
    })
    .catch(function () { return false; });
}

// ---- render ----------------------------------------------------------------

function mouseCaptureRefresh() {
  if (!myhidCaptureUrl()) {
    mouseCaptureRenderUnconfigured();
    return Promise.resolve();
  }

  return myhidCaptureApi("/api/state")
    .then(function (state) {
      _mouseCaptureState = state;
      mouseCaptureRenderState(state);
      mouseCaptureIdentifyStep(state);
    })
    .catch(function (err) {
      _mouseCaptureState = null;
      mouseCaptureRenderError(err);
    });
}

function mouseCaptureRenderUnconfigured() {
  var status = document.getElementById("mouseCaptureStatus");
  if (status) {
    status.className = "alert alert-warning py-2 px-3 mb-3";
    status.textContent = "No capture address yet. Start mouse-capture on the PC with the mouse, "
      + "then scan its QR (or paste the address it printed).";
  }

  var devices = document.getElementById("mouseCaptureDevices");
  if (devices) devices.innerHTML = '<span class="text-body-secondary small">Not connected.</span>';

  mouseCaptureDisableActions("No capture panel to control yet");

  var telemetry = document.getElementById("mouseCaptureTelemetry");
  if (telemetry) telemetry.textContent = "";
}

function mouseCaptureRenderError(err) {
  var status = document.getElementById("mouseCaptureStatus");
  if (status) {
    status.className = "alert alert-danger py-2 px-3 mb-3";
    status.textContent = err && err.message ? err.message : "cannot reach the capture panel";
  }
  // Nothing to start or stop while the panel is unreachable, so neither button
  // may pretend it would work.
  mouseCaptureDisableActions("The capture panel is unreachable");
}

function mouseCaptureRenderStatus() {
  if (_mouseCaptureState) mouseCaptureRenderState(_mouseCaptureState);
}

function mouseCaptureRenderState(state) {
  var status = document.getElementById("mouseCaptureStatus");
  var capture = state.capture || {};
  var driver = state.driver || {};
  var tunnel = state.tunnel || {};

  var driverText = driver.simulated ? "simulated (no driver)"
    : driver.available ? (state.elevated ? "driver ready" : "driver ready (not elevated)")
    : (driver.error || "driver not available");

  var parts = [];
  parts.push(capture.running ? "capturing" + (capture.modeName && capture.modeName !== "off" ? " (" + capture.modeName + ")" : "") : "stopped");
  parts.push(driverText);
  if (tunnel.state === "up" && tunnel.url) parts.push("tunnel " + tunnel.url);
  else if (tunnel.state === "starting") parts.push("tunnel starting");
  else if (tunnel.error) parts.push("tunnel: " + tunnel.error);

  if (status) {
    var bad = state.canStart === false || capture.error;
    status.className = "alert py-2 px-3 mb-3 " + (bad ? (state.canStart === false ? "alert-warning" : "alert-danger") : "alert-success");
    status.textContent = (capture.error ? capture.error + " - " : "") + parts.join(" \u00b7 ");
    if (state.canStart === false && state.blockReason) {
      status.textContent = state.blockReason;
    }
  }

  mouseCaptureRenderDevices(state.devices || []);

  var config = state.config || {};
  mouseCaptureSetSelect("mouseCaptureRotate", config.rotateButton);
  mouseCaptureSetSelect("mouseCaptureTranslate", config.translateButton);
  mouseCaptureSetChecked("mouseCapturePassMode", config.passModeButtons);
  mouseCaptureSetChecked("mouseCaptureAutoStart", config.autoStart);
  // An unset capture target defaults to the Settings | Server host on UDP 7801 (the
  // port the MyHID server receives telemetry on), and is saved once so the
  // field showing it is not a lie.
  mouseCaptureSetValue("mouseCaptureUdp", config.udp || mouseCaptureDefaultUdp());
  mouseCaptureApplyUdpDefault(config);

  // Identify/Learn are STOPPED-ONLY: while a capture runs, a held mode button gates
  // motion (Identify sees nothing) and the pump swallows the mode buttons (Learn
  // could not see them), so both would silently do nothing. A learn in flight locks
  // the whole group too - the panel refuses a concurrent one (409).
  var locked = !!capture.running || _mouseCaptureLearnBusy;
  var lockReason = _mouseCaptureLearnBusy ? "Already listening for a button" : "Stop the capture first";
  mouseCaptureSetDisabled("btnHidIdentify", locked, lockReason);
  mouseCaptureSetDisabled("btnHidLearnRotate", locked, lockReason);
  mouseCaptureSetDisabled("btnHidLearnTranslate", locked, lockReason);

  // Exactly one of Start/Stop is usable: the other one has nothing to do.
  mouseCaptureSetDisabled("btnHidStart", _mouseCaptureBusy || !!capture.running || state.canStart === false,
    capture.running ? "The capture is already running" : (state.blockReason || "Start the capture"));
  mouseCaptureSetDisabled("btnHidStop", _mouseCaptureBusy || !capture.running,
    "The capture is already stopped");

  var telemetry = document.getElementById("mouseCaptureTelemetry");
  if (telemetry) {
    telemetry.textContent = capture.running
      ? "target: " + (capture.target || "?")
        + " \u00b7 gated " + Math.round(capture.gatedPerSecond || 0) + "/s"
        + " \u00b7 loop p50 " + (capture.loopP50Ms || 0).toFixed(2) + " ms"
        + " \u00b7 errors " + (capture.sendErrors || 0)
      : (state.hotkey && state.hotkey.registered
        ? "Stopped. Ctrl+Alt+Shift+Q on the capture PC disarms it immediately."
        : "Stopped.");
  }
}

function mouseCaptureRenderDevices(devices) {
  var container = document.getElementById("mouseCaptureDevices");
  if (!container) return;

  var selected = (_mouseCaptureState && _mouseCaptureState.config && _mouseCaptureState.config.device) || "";
  // Rebuild only when the DEVICE SET changes. "moving" is deliberately NOT part of
  // the signature: it flips as the mouse moves, and rebuilding then re-flows the list
  // (and steals the radio focus). The badge is toggled in place instead.
  var signature = devices.map(function (d) { return d.hardwareId; }).join("|");

  // Rebuild only when the list (or who is moving) changes: rebuilding while the
  // user is picking would steal the focus of the radio they just tapped.
  if (signature === _mouseCaptureDeviceSignature) {
    var radios = container.querySelectorAll('input[name="myhidCaptureDevice"]');
    for (var i = 0; i < radios.length; i++) {
      if (selected && radios[i].value === selected && !radios[i].checked) radios[i].checked = true;
    }
    mouseCaptureSyncMovingBadges(container, devices);
    return;
  }
  _mouseCaptureDeviceSignature = signature;

  if (!devices.length) {
    container.innerHTML = '<span class="text-body-secondary small">The capture panel sees no mouse.</span>';
    return;
  }

  container.innerHTML = devices.map(function (device) {
    var checked = device.hardwareId === selected ? " checked" : "";

    // The badges belong on the SECOND line, at its left edge, in front of the id.
    // "moving" is ALWAYS rendered (hidden when still) so its space is reserved and
    // the id never shifts while the mouse moves.
    var badges = '<smd-badge variant="success" pill class="myhid-badge myhid-moving' +
      (device.moving ? "" : " myhid-moving-off") + '">moving</smd-badge>';
    if (device.simulated) {
      badges += '<smd-badge variant="secondary" pill class="myhid-badge">simulated</smd-badge>';
    }

    return '<label class="d-flex align-items-start gap-2 mb-1">' +
        '<input class="form-check-input mt-1" type="radio" name="myhidCaptureDevice" value="' +
          escAttr(device.hardwareId) + '"' + checked + '>' +
        '<span class="flex-grow-1">' +
          '<span class="fw-semibold d-block">' + escapeHtml(device.name || device.hardwareId) + '</span>' +
          '<span class="small text-body-secondary d-block text-break">' + badges +
            '<span class="myhid-id">' + escapeHtml(device.hardwareId) + '</span></span>' +
        '</span>' +
      '</label>';
  }).join("");

  mouseCaptureSyncMovingBadges(container, devices);
}

// Shows/hides the "moving" badge WITHOUT touching the layout (visibility, not
// display), keyed by row order - the list is only rebuilt when the device set
// changes, so row N is always device N.
function mouseCaptureSyncMovingBadges(container, devices) {
  var radios = container.querySelectorAll('input[name="myhidCaptureDevice"]');

  for (var i = 0; i < radios.length && i < devices.length; i++) {
    var label = radios[i].closest ? radios[i].closest("label") : null;
    var badge = label && label.querySelector(".myhid-moving");
    if (!badge) continue;
    badge.classList.toggle("myhid-moving-off", !devices[i].moving);
  }
}

function mouseCaptureSetSelect(id, value) {
  var el = document.getElementById(id);
  if (el && value !== undefined && value !== null) el.value = String(value);
}

function mouseCaptureSetChecked(id, value) {
  var el = document.getElementById(id);
  if (el) el.checked = !!value;
}

function mouseCaptureSetValue(id, value) {
  var el = document.getElementById(id);
  // Never fight the user's cursor.
  if (el && document.activeElement !== el && el.value !== value) el.value = value;
}

function mouseCaptureSetHint(text, isError) {
  var hint = document.getElementById("mouseCaptureAddressHint");
  if (!hint) return;
  hint.textContent = text || "The capture client prints this address (and a QR) when it starts.";
  hint.className = "form-text" + (isError ? " text-danger" : "");
}

// ---- scan the capture QR ---------------------------------------------------

function openHidScan() {
  var page = document.getElementById("mouseCaptureScanPage");
  if (!page) return;

  clearTimeout(_mouseCaptureScanCloseTimer);
  page.classList.remove("d-none");
  page.title = "Scan capture QR";
  page.content = '<smd-qr-import id="mouseCaptureQrImport" raw autostart></smd-qr-import>';
  page.buttons = [{ text: "Cancel", variant: "secondary", action: "cancel", id: "btnHidScanCancel" }];

  if (!page.__mouseCaptureScanBound) {
    page.__mouseCaptureScanBound = true;
    page.addEventListener("smd-page-action", function () { hideHidScan(); });
    page.addEventListener("smd-qr-import-complete", function (event) {
      var parsed = myhidParseHidUrl(event.detail && event.detail.data);
      if (!parsed) {
        mouseCaptureSetHint("That QR is not a capture panel address.", true);
        hideHidScan();
        return;
      }
      myhidSetHidAddress(parsed.base, parsed.token);
      restoreHidAddress();
      _mouseCaptureState = null;
      _mouseCaptureDeviceSignature = "";
      mouseCaptureSetHint("Address set from QR: " + parsed.base);
      hideHidScan();
      mouseCaptureRefresh();
    });
  }

  page.show();
}

function hideHidScan() {
  var page = document.getElementById("mouseCaptureScanPage");
  if (!page) return;
  // The page is hidden, not removed, so stop the camera explicitly.
  var imp = page.querySelector("smd-qr-import");
  if (imp && imp.stop) imp.stop();
  page.hide();
  clearTimeout(_mouseCaptureScanCloseTimer);
  _mouseCaptureScanCloseTimer = setTimeout(function () {
    page.classList.add("d-none");
  }, Math.max(0, (page.slideDuration || 0) + 50));
}
