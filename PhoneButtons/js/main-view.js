// PhoneButtons — connection status + the comms test harness.
//
// The Connect/Disconnect/Ping/Send-test-key buttons and the connection log live
// in the Settings -> Server tab, whose markup is rebuilt every time Settings
// opens. The log therefore lives in memory and is re-rendered on demand.
//
// This is deliberately NOT the full remote UI yet. It exists to prove the
// client <-> server round trip: connect/disconnect, the server's initial
// `app_change` push, a `ping`/`pong`, and a real `button_press`.

var _pbCommLogLines = [];
var _pbCommLogMax = 200;

// Last foreground app pushed by the server (`{ name, icon, layout }`); the Edit
// App wizard shows it and the main view renders its layout buttons.
var _pbCurrentApp = null;

function _commLine(text, kind) {
  var ts = new Date().toTimeString().slice(0, 8);
  _pbCommLogLines.push({ text: "[" + ts + "] " + text, kind: kind || "" });
  if (_pbCommLogLines.length > _pbCommLogMax) {
    _pbCommLogLines = _pbCommLogLines.slice(-_pbCommLogMax);
  }
  _renderCommLog();
}

// Rebuild the log element from the in-memory lines (no-op when the Server tab
// is not mounted).
function _renderCommLog() {
  var log = document.getElementById("commLog");
  if (!log) return;
  log.innerHTML = "";
  _pbCommLogLines.forEach(function (entry) {
    var line = document.createElement("div");
    line.textContent = entry.text;
    if (entry.kind === "error") line.className = "text-danger";
    else if (entry.kind === "ok") line.className = "text-success";
    else if (entry.kind === "info") line.className = "text-body-secondary";
    log.appendChild(line);
  });
  log.scrollTop = log.scrollHeight;
}

function clearCommLog() {
  _pbCommLogLines = [];
  _renderCommLog();
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
    disconnected: ["danger", "Disconnected"],
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
  renderLayoutButtons(_pbCurrentApp && _pbCurrentApp.layout);
}

// ---- Shared grid helpers (also used by the Manage Layout grid) ----

// The Image-size display setting, in px (xsmall..jumbo).
function getIconSizePx() {
  var value = localStorage.getItem(smdKey("iconSize")) || "medium";
  return { xsmall: 32, small: 40, medium: 50, large: 64, xlarge: 80, jumbo: 100 }[value] || 50;
}

function clampInt(value, min, max, fallback) {
  var n = parseInt(value, 10);
  if (isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// The thumb(s) for a button, sized to fit a cell (smaller when there are two).
function pbButtonThumbsHtml(btn, cellPx) {
  var imgs = [btn.image1 || btn.image || "", btn.image2 || ""].filter(Boolean);
  if (!imgs.length) return "";
  var imgPx = Math.max(12, Math.round(cellPx * (imgs.length > 1 ? 0.42 : 0.6)));
  return '<span class="pb-cell-thumbs">' + imgs.map(function (img) {
    return '<smd-image size="' + imgPx + '" key-prefix="shared-" image="' + escAttr(img) + '"></smd-image>';
  }).join("") + '</span>';
}

function pbCellFontPx(cellPx) {
  return Math.max(9, Math.round(cellPx * 0.16));
}

function pbButtonHasContent(b) {
  return !!(b && (b.name || b.image1 || b.image2 || b.image || b.key));
}

// ---- Main-page layout grid ----

// Render the current application's layout as a rows x cols grid of equal cells,
// sized as large as possible to fit the viewport. Buttons arrive PUSHED in the
// server's `app_change` message. Pressing a cell sends its key.
function renderLayoutButtons(layout) {
  var container = document.getElementById("layoutButtons");
  if (!container) return;
  var buttons = (layout && layout.buttons) || [];
  var rows = clampInt(layout && layout.rows, 1, 12, 2);
  var cols = clampInt(layout && layout.cols, 1, 12, 3);
  if (!buttons.some(pbButtonHasContent)) {
    container.innerHTML = "";
    container.classList.add("d-none");
    return;
  }
  container.classList.remove("d-none");

  var gap = 8;
  var nav = document.getElementById("mainNav");
  var navH = nav ? nav.offsetHeight : 0;
  var availW = container.clientWidth || window.innerWidth;
  var availH = window.innerHeight - navH - 24;
  var cellW = (availW - (cols - 1) * gap) / cols;
  var cellH = (availH - (rows - 1) * gap) / rows;
  var px = Math.max(40, Math.floor(Math.min(cellW, cellH)));

  container.style.gridTemplateColumns = "repeat(" + cols + ", " + px + "px)";
  var html = "";
  for (var i = 0; i < rows * cols; i++) {
    var b = buttons[i];
    var real = pbButtonHasContent(b);
    html += '<button type="button" data-index="' + i + '" data-key="' + escAttr((b && b.key) || "") + '" data-press="' + escAttr((b && b.press) || "regular") + '" class="pb-grid-cell' + (real ? "" : " pb-grid-spacer") + '" ' +
      'style="width:' + px + "px;height:" + px + "px;font-size:" + pbCellFontPx(px) + 'px">' +
      (real ? pbButtonThumbsHtml(b, px) + (b.name ? '<span class="pb-cell-name">' + escapeHtml(b.name) + '</span>' : "") : "") +
      '</button>';
  }
  container.innerHTML = html;
  container.querySelectorAll(".pb-grid-cell:not(.pb-grid-spacer)").forEach(function (el) {
    if (el.getAttribute("data-press") === "extended") {
      // Press-and-hold: key_down while held, key_up on release.
      el.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
        pressMainCell(el);
      });
      el.addEventListener("pointerup", function () { releaseMainCell(el); });
      el.addEventListener("pointercancel", function () { releaseMainCell(el); });
    } else {
      // Regular: one press (the server sends down + up).
      el.addEventListener("click", function () { pressMainCellOnce(el); });
    }
  });
}

// Regular press: the server presses and releases the key.
function pressMainCellOnce(el) {
  var key = el.getAttribute("data-key");
  if (!key) return;
  pbSocket.emit("button_press", { key: key });
  _commLine("button_press {key: " + key + "}", "info");
}

// Press-and-hold: key_down while the button is held, key_up on release, so
// modifiers (or a key) can be held down while using the PC's mouse.
function pressMainCell(el) {
  var key = el.getAttribute("data-key");
  if (!key) return;
  el.classList.add("pressed");
  pbSocket.emit("key_down", { key: key });
  _commLine("key_down {key: " + key + "}", "info");
}

function releaseMainCell(el) {
  el.classList.remove("pressed");
  var key = el.getAttribute("data-key");
  if (!key) return;
  pbSocket.emit("key_up", { key: key });
  _commLine("key_up {key: " + key + "}", "info");
}

// Wire the socket callbacks into the UI exactly once.
function bindSocketUi() {
  if (window.__pbSocketUiBound) return;
  window.__pbSocketUiBound = true;

  pbSocket.onStatus(function (status, detail) {
    _renderConnStatus(status, detail);
    if (status === "connected") _commLine("connected (id=" + detail + ")", "ok");
    else if (status === "connecting") _commLine("connecting to this server \u2026", "info");
    else if (status === "disconnected") _commLine("disconnected" + (detail ? " (" + detail + ")" : ""), "info");
    else if (status === "error") _commLine("connection error: " + detail, "error");
  });

  pbSocket.on("app_change", function (data) {
    data = data || {};
    _pbCurrentApp = data;
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
    renderLayoutButtons(data.layout);
    _commLine("app_change \u2192 " + (data.name || "?") + (data.layout ? " (layout: " + data.layout.key + ")" : ""), "info");
  });

  pbSocket.on("pong", function (data) {
    _commLine("server pong " + JSON.stringify(data || {}), "ok");
  });

  // Re-fit the main-page grid when the viewport changes.
  window.addEventListener("resize", function () {
    renderLayoutButtons(_pbCurrentApp && _pbCurrentApp.layout);
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

// Fire a real key at the server. "X" is a safe, visible choice for a smoke test
// (an unmapped single character -> its virtual-key code on the server).
function sendTestKey() {
  var sent = pbSocket.emit("button_press", { key: "X" });
  _commLine(sent ? "sent button_press {key: X}" : "cannot send: not connected", sent ? "info" : "error");
}
