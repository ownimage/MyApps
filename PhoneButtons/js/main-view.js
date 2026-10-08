// PhoneButtons — main view: connection status + the comms test harness.
//
// This is deliberately NOT the full remote UI yet. It exists to prove the
// client <-> server round trip: connect/disconnect, the server's initial
// `app_change` push, a `ping`/`pong`, and a real `button_press`.

var _pbCommLogMax = 200;

function _commLine(text, kind) {
  var log = document.getElementById("commLog");
  if (!log) return;
  var ts = new Date().toTimeString().slice(0, 8);
  var line = document.createElement("div");
  line.textContent = "[" + ts + "] " + text;
  if (kind === "error") line.className = "text-danger";
  else if (kind === "ok") line.className = "text-success";
  else if (kind === "info") line.className = "text-body-secondary";
  log.appendChild(line);
  while (log.childElementCount > _pbCommLogMax) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function clearCommLog() {
  var log = document.getElementById("commLog");
  if (log) log.innerHTML = "";
}

function _setDisabled(id, disabled) {
  var el = document.getElementById(id);
  if (el) el.disabled = disabled;
}

// Reflect the socket status in the badge + button states. Safe to call on every
// render (theme changes call renderMain through the shared engine).
function _renderConnStatus(status, detail) {
  var badge = document.getElementById("connBadge");
  var detailEl = document.getElementById("connDetail");
  var states = {
    disconnected: ["secondary", "Disconnected"],
    connecting: ["warning", "Connecting\u2026"],
    connected: ["success", "Connected"],
    error: ["danger", "Error"]
  };
  var state = states[status] || states.disconnected;
  if (badge) {
    badge.textContent = state[1];
    badge.setAttribute("variant", state[0]);
  }
  if (detailEl) detailEl.textContent = detail || "";

  var connected = status === "connected";
  var busy = status === "connecting";
  _setDisabled("btnConnect", connected || busy);
  _setDisabled("btnDisconnect", !(connected || busy));
  _setDisabled("btnPing", !connected);
  _setDisabled("btnTestKey", !connected);
}

function renderMain() {
  var state = pbSocket.getStatus();
  _renderConnStatus(state.status, state.detail);
}

// Wire the socket callbacks into the UI exactly once.
function bindSocketUi() {
  if (window.__pbSocketUiBound) return;
  window.__pbSocketUiBound = true;

  pbSocket.onStatus(function (status, detail) {
    _renderConnStatus(status, detail);
    if (status === "connected") _commLine("connected (id=" + detail + ")", "ok");
    else if (status === "connecting") _commLine("connecting to " + (serverBase() || "(same origin)") + " \u2026", "info");
    else if (status === "disconnected") _commLine("disconnected" + (detail ? " (" + detail + ")" : ""), "info");
    else if (status === "error") _commLine("connection error: " + detail, "error");
  });

  pbSocket.on("app_change", function (data) {
    data = data || {};
    var nameEl = document.getElementById("serverAppName");
    if (nameEl) nameEl.textContent = data.name || "Unknown";
    var iconEl = document.getElementById("serverAppIcon");
    if (iconEl) {
      if (data.icon) {
        iconEl.src = data.icon;
        iconEl.classList.remove("d-none");
      } else {
        iconEl.classList.add("d-none");
      }
    }
    _commLine("app_change \u2192 " + (data.name || "?") + (data.template ? " (template set)" : ""), "info");
  });

  pbSocket.on("pong", function (data) {
    _commLine("server pong " + JSON.stringify(data || {}), "ok");
  });
}

function connectServer() {
  pbSocket.connect().catch(function (err) {
    _commLine("connect failed: " + err.message, "error");
  });
}

function disconnectServer() {
  pbSocket.disconnect();
}

function pingServer() {
  var started = Date.now();
  pbSocket.ping().then(function (data) {
    _commLine("pong (" + (Date.now() - started) + " ms) " + JSON.stringify(data || {}), "ok");
  }).catch(function (err) {
    _commLine("ping failed: " + err.message, "error");
  });
}

// Fire a real key at the server. MEDIA_NEXT_TRACK is a safe, visible choice for
// a smoke test (it maps to a keyboard media key on the server).
function sendTestKey() {
  var sent = pbSocket.emit("button_press", { key: "MEDIA_NEXT_TRACK" });
  _commLine(sent ? "sent button_press {key: MEDIA_NEXT_TRACK}" : "cannot send: not connected", sent ? "info" : "error");
}
