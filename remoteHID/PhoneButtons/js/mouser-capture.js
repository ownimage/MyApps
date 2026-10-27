// PhoneButtons — "Manage mouser-capture" page (main menu).
//
// The capture client (remoteHID/Mouser) runs on the PC that has the mouse. It
// serves a small JSON management API on its own socket, optionally published
// through a Cloudflare quick tunnel, and prints a QR for
// `<panel-url>/?t=<token>`. This page is the CONFIGURATION UI for it: paste the
// address or scan the QR, then pick the mouse, the mode buttons and the telemetry
// target, and start/stop the capture.
//
// When the capture runs on THIS box (server started with --mouser) the server
// reports its address on /api/mouser-capture and the page adopts it automatically,
// so there is nothing to scan.
//
// The capture panel itself is deliberately not a UI: one configuration surface
// (this one, with the shared smd-* components) beats two divergent copies.

var _mouserState = null;        // last /api/state payload
var _mouserTimer = null;        // polling while the page is open
var _mouserDeviceSignature = ""; // hardware ids, so the radio list is only rebuilt on change
var _mouserScanCloseTimer = null;

// ---- stored address --------------------------------------------------------

function pbMouserUrl() {
  return (localStorage.getItem(smdKey("mouserUrl")) || "").trim();
}

function pbMouserToken() {
  return (localStorage.getItem(smdKey("mouserToken")) || "").trim();
}

function pbSetMouserAddress(base, token) {
  localStorage.setItem(smdKey("mouserUrl"), String(base || "").replace(/\/+$/, ""));
  localStorage.setItem(smdKey("mouserToken"), String(token || ""));
}

// Parse what the capture panel printed (or its QR contains):
//   https://quiet-fox.trycloudflare.com/?t=abc
//   http://192.168.1.60:7802/?t=abc
//   http://192.168.1.60:7802
// The token is SPLIT OUT of the address (it travels in a header, not every URL).
function pbParseMouserUrl(text) {
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

function pbMouserApi(path, options) {
  var base = pbMouserUrl();
  if (!base) {
    return Promise.reject(new Error("no capture address yet - paste the one the panel shows, or scan its QR"));
  }

  var headers = { "X-Mouser-Token": pbMouserToken() };
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
        var mine = pbMouserToken();
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

function buildMouserCapturePage(page) {
  page.title = "Manage mouser-capture";
  page.content =
    '<div class="mb-3">' +
      '<label class="form-label" for="mouserUrlInput">Capture panel address</label>' +
      '<div class="d-flex gap-2 align-items-stretch flex-wrap">' +
        '<input type="text" id="mouserUrlInput" class="form-control flex-grow-1" ' +
          'placeholder="https://something.trycloudflare.com/?t=..." ' +
          'autocapitalize="off" autocomplete="off" spellcheck="false">' +
        '<smd-button id="btnMouserScan" variant="secondary" size="small" icon="fa-solid fa-qrcode">Scan QR</smd-button>' +
        '<smd-button id="btnMouserSave" variant="primary" size="small">Save</smd-button>' +
      '</div>' +
      '<div id="mouserAddressHint" class="form-text">' +
        'The capture client prints this address (and a QR) when it starts.' +
      '</div>' +
    '</div>' +
    '<div id="mouserStatus" class="alert alert-secondary py-2 px-3 mb-3" role="status">Not connected.</div>' +
    mouserConfigHtml();

  page.buttons = [
    { text: "Close", variant: "secondary", action: "close", id: "btnMouserClose" }
  ];
}

function mouserConfigHtml() {
  function buttonRow(id, learnId) {
    return '<div class="col-8 d-flex gap-2 align-items-stretch flex-wrap">' +
      '<smd-select id="' + id + '"></smd-select>' +
      '<smd-button id="' + learnId + '" variant="secondary" size="small" ' +
        'icon="fa-solid fa-crosshairs">Learn</smd-button>' +
      '</div>';
  }

  return '' +
    '<div class="row mb-4 align-items-start col-md-8">' +
      '<div class="col-4 text-end pt-2"><label class="form-label mb-0">Mouse</label></div>' +
      '<div class="col-8">' +
        '<div id="mouserDevices" class="mb-2"><span class="text-body-secondary small">Loading mice&hellip;</span></div>' +
        '<div class="d-flex gap-2 flex-wrap">' +
          '<smd-button id="btnMouserRefresh" variant="secondary" size="small" icon="fa-solid fa-rotate">Refresh</smd-button>' +
          '<smd-button id="btnMouserIdentify" variant="primary" size="small" ' +
            'icon="fa-solid fa-bullseye">Identify</smd-button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="row mb-4 align-items-center col-md-8">' +
      '<div class="col-4 text-end"><label class="form-label mb-0">Rotate button</label></div>' +
      buttonRow("mouserRotate", "btnMouserLearnRotate") +
    '</div>' +
    '<div class="row mb-4 align-items-center col-md-8">' +
      '<div class="col-4 text-end"><label class="form-label mb-0">Translate button</label></div>' +
      buttonRow("mouserTranslate", "btnMouserLearnTranslate") +
    '</div>' +
    '<div class="row mb-4 align-items-center col-md-8">' +
      '<div class="col-4 text-end"><label class="form-label mb-0">Mode buttons</label></div>' +
      '<div class="col-8"><smd-checkbox id="mouserPassMode">Also click in the app (do not swallow)</smd-checkbox></div>' +
    '</div>' +
    '<div class="row mb-4 align-items-center col-md-8">' +
      '<div class="col-4 text-end"><label class="form-label mb-0">Auto-start</label></div>' +
      '<div class="col-8"><smd-checkbox id="mouserAutoStart">Start the previous session when the panel opens</smd-checkbox></div>' +
    '</div>' +
    '<div class="row mb-4 align-items-start col-md-8">' +
      '<div class="col-4 text-end pt-2"><label class="form-label mb-0" for="mouserUdp">Server (UDP)</label></div>' +
      '<div class="col-8">' +
        '<div class="d-flex gap-2 align-items-stretch flex-wrap">' +
          '<input type="text" id="mouserUdp" class="form-control flex-grow-1" placeholder="192.168.1.50:7801" ' +
            'autocapitalize="off" autocomplete="off" spellcheck="false">' +
          '<smd-button id="btnMouserPing" variant="secondary" size="small">Ping</smd-button>' +
        '</div>' +
        '<div id="mouserPingResult" class="form-text"></div>' +
      '</div>' +
    '</div>' +
    '<div class="d-flex gap-2 mb-3 flex-wrap">' +
      '<smd-button id="btnMouserStart" variant="success" icon="fa-solid fa-play">Start capture</smd-button>' +
      '<smd-button id="btnMouserStop" variant="danger" icon="fa-solid fa-stop">Stop</smd-button>' +
    '</div>' +
    '<div id="mouserTelemetry" class="small text-body-secondary"></div>';
}

function openMouserCapture() {
  var page = document.getElementById("mouserCapturePage");
  if (!page) return;

  // A SMALL badge whose space is RESERVED while the mouse is still: "moving" flips
  // constantly, and a badge that appears/disappears re-flows the hardware-id line
  // (and the whole list, if the rows are rebuilt). This is the app's only styling.
  if (typeof injectSmdComponentStyle === "function") {
    injectSmdComponentStyle("pb-mouser-devices", [
      "#mouserDevices .pb-mouser-badge { font-size: 0.62em; line-height: 1;",
      "  padding: 0.2em 0.45em; vertical-align: 0.1em; margin-right: 0.4em; }",
      "#mouserDevices .pb-mouser-moving-off { visibility: hidden; }"
    ].join(""));
  }

  if (!page.__mouserBound) {
    page.__mouserBound = true;

    page.addEventListener("click", mouserOnClick);
    page.addEventListener("change", mouserOnChange);
    page.addEventListener("smd-select-change", mouserOnSelect);
    page.addEventListener("smd-page-action", function () { hideMouserCapture(); });
  }

  buildMouserCapturePage(page);
  _openWizardPage(page);

  var rotate = document.getElementById("mouserRotate");
  var translate = document.getElementById("mouserTranslate");
  var options = [
    { value: "0", label: "Off" },
    { value: "3", label: "Middle button" },
    { value: "4", label: "MB4 (side)" },
    { value: "5", label: "MB5 (side)" }
  ];
  if (rotate) rotate.options = options;
  if (translate) translate.options = options;

  restoreMouserAddress();
  _mouserState = null;
  _mouserDeviceSignature = "";
  _mouserIdentify = null;
  _mouserPollMs = 1500;
  _mouserUdpDefaultDone = false;
  mouserSetButtonVariant("btnMouserIdentify", "primary");
  mouserSetHint("");

  // A same-box capture is picked up without a scan; a remote one needs the address
  // the user pasted/scanned, so only discover when nothing is stored.
  Promise.resolve(pbMouserUrl() ? false : mouserAdoptFromServer()).then(function () {
    restoreMouserAddress();
    mouserRefresh();
  });

  clearInterval(_mouserTimer);
  _mouserTimer = setInterval(mouserRefresh, _mouserPollMs);
}

function hideMouserCapture() {
  var page = document.getElementById("mouserCapturePage");
  if (_mouserIdentify) mouserStopIdentify(null);
  clearInterval(_mouserTimer);
  _mouserTimer = null;
  if (page) _hideWizardPage(page);
}

function restoreMouserAddress() {
  var input = document.getElementById("mouserUrlInput");
  // The field always shows the FULL address, token included: copying it out of the
  // app must give the next device everything it needs (the token is stored apart).
  if (input) input.value = mouserFullAddress();
}

function mouserFullAddress() {
  var base = pbMouserUrl();
  if (!base) return "";
  var token = pbMouserToken();
  return base + (token ? "/?t=" + token : "");
}

// ---- handlers --------------------------------------------------------------

function mouserOnClick(event) {
  var button = event.target && event.target.closest ? event.target.closest("smd-button") : null;
  if (!button || !button.id) return;

  switch (button.id) {
    case "btnMouserSave":
      mouserSaveAddress();
      break;
    case "btnMouserScan":
      openMouserScan();
      break;
    case "btnMouserRefresh":
      pbMouserApi("/api/devices", { method: "POST" })
        .then(function (res) { mouserRenderDevices(res.devices || []); })
        .catch(function (err) { mouserSetHint(err.message, true); });
      break;
    case "btnMouserStart":
      mouserStart();
      break;
    case "btnMouserStop":
      mouserStop();
      break;
    case "btnMouserPing":
      mouserPing();
      break;
    case "btnMouserIdentify":
      mouserToggleIdentify();
      break;
    case "btnMouserLearnRotate":
      mouserLearnButton("rotate");
      break;
    case "btnMouserLearnTranslate":
      mouserLearnButton("translate");
      break;
  }
}

function mouserOnChange(event) {
  var el = event.target;
  if (!el) return;

  // Pasting/typing an address and leaving the field IS "use this" - the user should
  // not have to find Save first (and a half-applied address is exactly what makes a
  // panel answer 403 with a token the app never picked up).
  if (el.id === "mouserUrlInput") {
    mouserSaveAddress();
    return;
  }

  // The mouse list is native radios (smd-checkbox is checkbox-only).
  if (el.name === "pbMouserDevice") {
    mouserSaveConfig({ device: el.value });
    return;
  }

  // smd-checkbox also dispatches a composed change on the HOST; ignore the inner
  // input so one toggle does not save twice.
  if (el.tagName === "INPUT") return;

  if (el.id === "mouserPassMode") mouserSaveConfig({ passModeButtons: !!el.checked });
  if (el.id === "mouserAutoStart") mouserSaveConfig({ autoStart: !!el.checked });
}

function mouserOnSelect(event) {
  var el = event.target;
  if (!el || !el.id) return;
  var detail = event.detail;
  var value = detail && detail.value !== undefined ? detail.value : "";

  if (el.id === "mouserRotate") mouserSaveConfig({ rotateButton: value });
  if (el.id === "mouserTranslate") mouserSaveConfig({ translateButton: value });
}

// ---- actions ---------------------------------------------------------------

function mouserSaveAddress() {
  var input = document.getElementById("mouserUrlInput");
  var parsed = pbParseMouserUrl(input ? input.value : "");

  if (!parsed) {
    mouserSetHint("That is not a capture address. Paste the URL the panel shows (it ends with ?t=...).", true);
    return;
  }

  // Leaving the field unchanged must not wipe the live state and re-poll for nothing.
  if (parsed.base === pbMouserUrl() && parsed.token === pbMouserToken()) {
    restoreMouserAddress();
    return;
  }

  pbSetMouserAddress(parsed.base, parsed.token);
  restoreMouserAddress();
  mouserSetHint(parsed.token
    ? "Address saved (token ends \"" + parsed.token.slice(-4) + "\")."
    : "Address saved, but it has no ?t= token, so the panel will refuse it (403). "
      + "Copy the FULL address the panel page shows.", !parsed.token);

  _mouserState = null;
  _mouserDeviceSignature = "";
  mouserRefresh();
}

function mouserSaveConfig(patch, options) {
  var silent = !!(options && options.silent);
  var current = (_mouserState && _mouserState.config) || null;
  if (!current) {
    if (!silent) mouserSetHint("No state from the capture panel yet.", true);
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
  return pbMouserApi("/api/config", { method: "POST", body: merged })
    .then(function (res) {
      if (_mouserState) _mouserState.config = res.config;
      if (!silent) {
        mouserSetHint(needsRestart && _mouserState && _mouserState.capture.running
          ? "Saved. Stop and start the capture to apply it."
          : "Saved.");
      }
      mouserRenderStatus();
      return true;
    })
    .catch(function (err) {
      if (!silent) mouserSetHint(err.message, true);
      return false;
    });
}

function mouserStart() {
  mouserSetHint("");
  pbMouserApi("/api/capture/start", { method: "POST" })
    .then(function () { mouserRefresh(); })
    .catch(function (err) { mouserSetHint(err.message, true); });
}

function mouserStop() {
  mouserSetHint("");
  pbMouserApi("/api/capture/stop", { method: "POST" })
    .then(function () { mouserRefresh(); })
    .catch(function (err) { mouserSetHint(err.message, true); });
}

function mouserPing() {
  var input = document.getElementById("mouserUdp");
  var out = document.getElementById("mouserPingResult");
  var target = input ? input.value.trim() : "";

  if (out) out.textContent = "pinging " + (target || "the saved server") + " ...";

  // A UDP target typed here is saved as well, so "Ping" doubles as "test and keep".
  var patch = target ? mouserSaveConfig({ udp: target }) : Promise.resolve();

  patch.then(function () {
    return pbMouserApi("/api/ping", { method: "POST", body: target ? { udp: target } : {} });
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

var _mouserIdentify = null;    // { until, baseline: {hardwareId: motion} }
var _mouserPollMs = 1500;

function mouserSetButtonVariant(id, variant) {
  var el = document.getElementById(id);
  // <smd-button> re-applies variant/size/disabled after build; only its LABEL is
  // captured once, so colour is the safe "this is armed" signal.
  if (el) el.setAttribute("variant", variant);
}

function mouserSetDisabled(id, disabled) {
  var el = document.getElementById(id);
  if (!el) return;
  if (disabled) el.setAttribute("disabled", "");
  else el.removeAttribute("disabled");
  // A disabled control explains itself on hover (the host's title reaches the
  // inner button, which is the real hover target).
  el.title = disabled ? "Stop the capture first" : "";
}

// The PhoneButtons server receives telemetry on UDP 7801; Settings | Server holds the
// host, so an unset capture target defaults to <that host>:7801.
var _mouserUdpDefaultDone = false;

function mouserDefaultUdp() {
  var host = typeof pbServerAddress === "function" ? pbServerAddress() : "";
  var complete = typeof pbHostComplete === "function" ? pbHostComplete(host) : !!host;
  return complete ? host + ":7801" : "";
}

function mouserApplyUdpDefault(config) {
  if (_mouserUdpDefaultDone) return;
  if (config && config.udp) {
    _mouserUdpDefaultDone = true;
    return;
  }

  var fallback = mouserDefaultUdp();
  if (!fallback) return;

  _mouserUdpDefaultDone = true;
  // SAVE it, not just show it: a field that looks configured while the capture sends
  // nowhere is worse than an empty one.
  mouserSaveConfig({ udp: fallback }, { silent: true });
}

function mouserSetPollInterval(ms) {
  _mouserPollMs = ms;
  if (!_mouserTimer) return;
  clearInterval(_mouserTimer);
  _mouserTimer = setInterval(mouserRefresh, ms);
}

function mouserToggleIdentify() {
  if (_mouserIdentify) {
    mouserStopIdentify("Identify cancelled.");
    return;
  }

  if (!_mouserState) {
    mouserSetHint("No state from the capture panel yet.", true);
    return;
  }

  if (_mouserState.capture && _mouserState.capture.running) {
    mouserSetHint("Stop the capture first - identify and learn only work while it is stopped.", true);
    return;
  }

  var baseline = {};
  (_mouserState.devices || []).forEach(function (device) {
    baseline[device.hardwareId] = device.motion || 0;
  });

  _mouserIdentify = { until: Date.now() + 8000, baseline: baseline };
  mouserSetButtonVariant("btnMouserIdentify", "warning");

  var gated = _mouserState.capture && _mouserState.capture.running
    ? " (do not hold a mode button while it listens)"
    : "";
  mouserSetHint("Listening for 8 seconds - move the mouse you want to use" + gated + " ...");
  mouserSetPollInterval(500);
}

function mouserStopIdentify(message) {
  if (!_mouserIdentify) return;
  _mouserIdentify = null;
  mouserSetButtonVariant("btnMouserIdentify", "primary");
  mouserSetPollInterval(1500);
  if (message) mouserSetHint(message);
}

function mouserIdentifyStep(state) {
  if (!_mouserIdentify) return;

  var best = null;
  var bestDelta = 0;

  (state.devices || []).forEach(function (device) {
    var key = device.hardwareId;
    var previous = _mouserIdentify.baseline[key];
    _mouserIdentify.baseline[key] = device.motion || 0;
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
    // Save FIRST: mouserSaveConfig sets its own "Saved." hint, so the confirmation
    // has to come after it or it would be overwritten immediately.
    mouserStopIdentify(null);
    mouserSaveConfig({ device: best.hardwareId }).then(function () {
      mouserSetHint("Selected " + name + ".");
    });
    return;
  }

  if (Date.now() > _mouserIdentify.until) {
    mouserStopIdentify("No movement detected - try again and move the mouse while it listens.");
  }
}

// ---- learn a mode button ---------------------------------------------------

function mouserLearnButton(which) {
  if (!_mouserState) {
    mouserSetHint("No state from the capture panel yet.", true);
    return;
  }

  if (_mouserState.capture && _mouserState.capture.running) {
    mouserSetHint("Stop the capture first - identify and learn only work while it is stopped.", true);
    return;
  }

  var buttonId = which === "rotate" ? "btnMouserLearnRotate" : "btnMouserLearnTranslate";
  var label = which === "rotate" ? "Rotate" : "Translate";

  mouserSetButtonVariant(buttonId, "warning");
  mouserSetHint("Learning the " + label.toLowerCase() + " button: click a mouse button now ...");

  // The panel arms a short-lived session for the learn (so the click is swallowed);
  // the user's own capture stays stopped, which is why no start happens here.
  pbMouserApi("/api/learn-button", { method: "POST", body: { timeoutMs: 10000 } })
    .then(function (result) {
      if (!result || result.ok !== true) {
        mouserSetHint(result && result.message ? result.message : "no button was pressed - try again", true);
        return null;
      }

      var button = Number(result.button);
      if (button !== 3 && button !== 4 && button !== 5) {
        mouserSetHint("That is the " + (button === 1 ? "left" : button === 2 ? "right" : "extra") +
          " button - use the middle (3) or a side button (4/5).", true);
        return null;
      }

      var patch = which === "rotate" ? { rotateButton: button } : { translateButton: button };
      return mouserSaveConfig(patch).then(function (saved) {
        // Only claim success when the panel ACCEPTED it. A rejected save (e.g. both
        // modes on the same button) used to be masked by this message, which looked
        // exactly like "the button was learned but the dropdown did not change".
        if (saved) mouserSetHint(label + " = MB" + button + ". Stop and start the capture to apply it.");
      });
    })
    .catch(function (err) {
      mouserSetHint(err && err.message ? err.message : "could not learn a button", true);
    })
    .then(function () {
      mouserSetButtonVariant(buttonId, "secondary");
      mouserRefresh();
    });
}

// ---- server-side discovery (--mouser on this box) --------------------------

function mouserAdoptFromServer() {
  return fetch(pbServerBase() + "/api/mouser-capture", { cache: "no-store" })
    .then(function (resp) { return resp.ok ? resp.json() : null; })
    .then(function (info) {
      if (!info || !info.url) return false;
      var parsed = pbParseMouserUrl(info.url);
      if (!parsed) return false;
      pbSetMouserAddress(parsed.base, parsed.token || info.token || "");
      mouserSetHint("Using the capture running on this server: " + parsed.base);
      return true;
    })
    .catch(function () { return false; });
}

// ---- render ----------------------------------------------------------------

function mouserRefresh() {
  if (!pbMouserUrl()) {
    mouserRenderUnconfigured();
    return Promise.resolve();
  }

  return pbMouserApi("/api/state")
    .then(function (state) {
      _mouserState = state;
      mouserRenderState(state);
      mouserIdentifyStep(state);
    })
    .catch(function (err) {
      _mouserState = null;
      mouserRenderError(err);
    });
}

function mouserRenderUnconfigured() {
  var status = document.getElementById("mouserStatus");
  if (status) {
    status.className = "alert alert-warning py-2 px-3 mb-3";
    status.textContent = "No capture address yet. Start mouser-capture on the PC with the mouse, "
      + "then scan its QR (or paste the address it printed).";
  }

  var devices = document.getElementById("mouserDevices");
  if (devices) devices.innerHTML = '<span class="text-body-secondary small">Not connected.</span>';

  var telemetry = document.getElementById("mouserTelemetry");
  if (telemetry) telemetry.textContent = "";
}

function mouserRenderError(err) {
  var status = document.getElementById("mouserStatus");
  if (status) {
    status.className = "alert alert-danger py-2 px-3 mb-3";
    status.textContent = err && err.message ? err.message : "cannot reach the capture panel";
  }
}

function mouserRenderStatus() {
  if (_mouserState) mouserRenderState(_mouserState);
}

function mouserRenderState(state) {
  var status = document.getElementById("mouserStatus");
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

  mouserRenderDevices(state.devices || []);

  var config = state.config || {};
  mouserSetSelect("mouserRotate", config.rotateButton);
  mouserSetSelect("mouserTranslate", config.translateButton);
  mouserSetChecked("mouserPassMode", config.passModeButtons);
  mouserSetChecked("mouserAutoStart", config.autoStart);
  // An unset capture target defaults to the Settings | Server host on UDP 7801 (the
  // port the PhoneButtons server receives telemetry on), and is saved once so the
  // field showing it is not a lie.
  mouserSetValue("mouserUdp", config.udp || mouserDefaultUdp());
  mouserApplyUdpDefault(config);

  // Identify/Learn are STOPPED-ONLY: while a capture runs, a held mode button gates
  // motion (Identify sees nothing) and the pump swallows the mode buttons (Learn
  // could not see them), so both would silently do nothing.
  mouserSetDisabled("btnMouserIdentify", !!capture.running);
  mouserSetDisabled("btnMouserLearnRotate", !!capture.running);
  mouserSetDisabled("btnMouserLearnTranslate", !!capture.running);

  var start = document.getElementById("btnMouserStart");
  if (start) start.disabled = !!capture.running || state.canStart === false;
  var stop = document.getElementById("btnMouserStop");
  if (stop) stop.disabled = !capture.running;

  var telemetry = document.getElementById("mouserTelemetry");
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

function mouserRenderDevices(devices) {
  var container = document.getElementById("mouserDevices");
  if (!container) return;

  var selected = (_mouserState && _mouserState.config && _mouserState.config.device) || "";
  // Rebuild only when the DEVICE SET changes. "moving" is deliberately NOT part of
  // the signature: it flips as the mouse moves, and rebuilding then re-flows the list
  // (and steals the radio focus). The badge is toggled in place instead.
  var signature = devices.map(function (d) { return d.hardwareId; }).join("|");

  // Rebuild only when the list (or who is moving) changes: rebuilding while the
  // user is picking would steal the focus of the radio they just tapped.
  if (signature === _mouserDeviceSignature) {
    var radios = container.querySelectorAll('input[name="pbMouserDevice"]');
    for (var i = 0; i < radios.length; i++) {
      if (selected && radios[i].value === selected && !radios[i].checked) radios[i].checked = true;
    }
    mouserSyncMovingBadges(container, devices);
    return;
  }
  _mouserDeviceSignature = signature;

  if (!devices.length) {
    container.innerHTML = '<span class="text-body-secondary small">The capture panel sees no mouse.</span>';
    return;
  }

  container.innerHTML = devices.map(function (device) {
    var checked = device.hardwareId === selected ? " checked" : "";

    // The badges belong on the SECOND line, at its left edge, in front of the id.
    // "moving" is ALWAYS rendered (hidden when still) so its space is reserved and
    // the id never shifts while the mouse moves.
    var badges = '<smd-badge variant="success" pill class="pb-mouser-badge pb-mouser-moving' +
      (device.moving ? "" : " pb-mouser-moving-off") + '">moving</smd-badge>';
    if (device.simulated) {
      badges += '<smd-badge variant="secondary" pill class="pb-mouser-badge">simulated</smd-badge>';
    }

    return '<label class="d-flex align-items-start gap-2 mb-1">' +
        '<input class="form-check-input mt-1" type="radio" name="pbMouserDevice" value="' +
          escAttr(device.hardwareId) + '"' + checked + '>' +
        '<span class="flex-grow-1">' +
          '<span class="fw-semibold d-block">' + escapeHtml(device.name || device.hardwareId) + '</span>' +
          '<span class="small text-body-secondary d-block text-break">' + badges +
            '<span class="pb-mouser-id">' + escapeHtml(device.hardwareId) + '</span></span>' +
        '</span>' +
      '</label>';
  }).join("");

  mouserSyncMovingBadges(container, devices);
}

// Shows/hides the "moving" badge WITHOUT touching the layout (visibility, not
// display), keyed by row order - the list is only rebuilt when the device set
// changes, so row N is always device N.
function mouserSyncMovingBadges(container, devices) {
  var radios = container.querySelectorAll('input[name="pbMouserDevice"]');

  for (var i = 0; i < radios.length && i < devices.length; i++) {
    var label = radios[i].closest ? radios[i].closest("label") : null;
    var badge = label && label.querySelector(".pb-mouser-moving");
    if (!badge) continue;
    badge.classList.toggle("pb-mouser-moving-off", !devices[i].moving);
  }
}

function mouserSetSelect(id, value) {
  var el = document.getElementById(id);
  if (el && value !== undefined && value !== null) el.value = String(value);
}

function mouserSetChecked(id, value) {
  var el = document.getElementById(id);
  if (el) el.checked = !!value;
}

function mouserSetValue(id, value) {
  var el = document.getElementById(id);
  // Never fight the user's cursor.
  if (el && document.activeElement !== el && el.value !== value) el.value = value;
}

function mouserSetHint(text, isError) {
  var hint = document.getElementById("mouserAddressHint");
  if (!hint) return;
  hint.textContent = text || "The capture client prints this address (and a QR) when it starts.";
  hint.className = "form-text" + (isError ? " text-danger" : "");
}

// ---- scan the capture QR ---------------------------------------------------

function openMouserScan() {
  var page = document.getElementById("mouserScanPage");
  if (!page) return;

  clearTimeout(_mouserScanCloseTimer);
  page.classList.remove("d-none");
  page.title = "Scan capture QR";
  page.content = '<smd-qr-import id="mouserQrImport" raw autostart></smd-qr-import>';
  page.buttons = [{ text: "Cancel", variant: "secondary", action: "cancel", id: "btnMouserScanCancel" }];

  if (!page.__mouserScanBound) {
    page.__mouserScanBound = true;
    page.addEventListener("smd-page-action", function () { hideMouserScan(); });
    page.addEventListener("smd-qr-import-complete", function (event) {
      var parsed = pbParseMouserUrl(event.detail && event.detail.data);
      if (!parsed) {
        mouserSetHint("That QR is not a capture panel address.", true);
        hideMouserScan();
        return;
      }
      pbSetMouserAddress(parsed.base, parsed.token);
      restoreMouserAddress();
      _mouserState = null;
      _mouserDeviceSignature = "";
      mouserSetHint("Address set from QR: " + parsed.base);
      hideMouserScan();
      mouserRefresh();
    });
  }

  page.show();
}

function hideMouserScan() {
  var page = document.getElementById("mouserScanPage");
  if (!page) return;
  // The page is hidden, not removed, so stop the camera explicitly.
  var imp = page.querySelector("smd-qr-import");
  if (imp && imp.stop) imp.stop();
  page.hide();
  clearTimeout(_mouserScanCloseTimer);
  _mouserScanCloseTimer = setTimeout(function () {
    page.classList.add("d-none");
  }, Math.max(0, (page.slideDuration || 0) + 50));
}
