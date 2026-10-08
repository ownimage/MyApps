// PhoneButtons — Socket.IO client layer.
//
// The socket.io client is loaded LAZILY from the vendored copy
// (shared/vendor/socket.io.min.js) the first time connect() runs. Keeping the
// <script> out of index.html matters for two reasons: nothing pays for the
// library until the user connects, and tests can inject a fake `window.io`
// before connect() so the whole layer is driven without a live server.
//
// Status changes and server events are published through callbacks so the UI
// (main-view.js) never touches the underlying socket directly.
var pbSocket = (function () {
  "use strict";

  var socket = null;
  var ioPromise = null;
  var status = "disconnected";
  var statusDetail = "";
  var statusListeners = [];
  var eventListeners = {};

  // Resolve the vendored library relative to THIS file so it works whether the
  // app is at the domain root, under a sub-path, or in a test origin.
  function vendorUrl() {
    var src = document.currentScript && document.currentScript.src;
    if (src) return new URL("../../shared/vendor/socket.io.min.js", src).href;
    return "../shared/vendor/socket.io.min.js";
  }

  function ensureIo() {
    if (window.io) return Promise.resolve(window.io);
    if (ioPromise) return ioPromise;
    ioPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = vendorUrl();
      script.onload = function () {
        if (window.io) resolve(window.io);
        else reject(new Error("Socket.IO loaded but window.io is undefined"));
      };
      script.onerror = function () { reject(new Error("Failed to load Socket.IO client")); };
      document.head.appendChild(script);
    });
    return ioPromise;
  }

  function setStatus(next, detail) {
    status = next;
    statusDetail = detail || "";
    statusListeners.forEach(function (cb) {
      try { cb(status, statusDetail); } catch (e) { /* listener error must not break the socket */ }
    });
  }

  function fire(event, data) {
    (eventListeners[event] || []).forEach(function (cb) {
      try { cb(data); } catch (e) { /* ignore */ }
    });
  }

  function wire(sock) {
    sock.on("connect", function () { setStatus("connected", sock.id || ""); });
    sock.on("disconnect", function (reason) { setStatus("disconnected", reason || ""); });
    sock.on("connect_error", function (err) {
      setStatus("error", (err && err.message) ? err.message : String(err));
    });
    sock.on("app_change", function (data) { fire("app_change", data); });
    sock.on("pong", function (data) { fire("pong", data); });
  }

  return {
    getStatus: function () { return { status: status, detail: statusDetail }; },
    isConnected: function () { return !!(socket && socket.connected); },

    onStatus: function (cb) { statusListeners.push(cb); return cb; },
    on: function (event, cb) {
      (eventListeners[event] = eventListeners[event] || []).push(cb);
      return cb;
    },

    // Connect to the configured server. Resolves with the socket (already
    // wired); rejects if the library fails to load.
    connect: function () {
      if (socket) return Promise.resolve(socket);
      setStatus("connecting", "");
      return ensureIo().then(function (io) {
        var base = serverBase();
        var token = getServerToken();
        var opts = {
          reconnection: true,
          reconnectionDelay: 500,
          reconnectionDelayMax: 5000,
          timeout: 8000,
          auth: token ? { token: token } : {}
        };
        socket = base ? io(base, opts) : io(opts);
        wire(socket);
        return socket;
      }).catch(function (err) {
        setStatus("error", (err && err.message) ? err.message : String(err));
        throw err;
      });
    },

    disconnect: function () {
      if (socket) {
        try { socket.disconnect(); } catch (e) { /* already gone */ }
        socket = null;
      }
      setStatus("disconnected", "closed by user");
    },

    emit: function (event, data) {
      if (!socket) return false;
      socket.emit(event, data);
      return true;
    },

    // Round-trip probe: emit `ping`, resolve on the server's `pong`. The server
    // side is a one-line handler; the timeout guards a silent server.
    ping: function (timeoutMs) {
      return new Promise(function (resolve, reject) {
        if (!socket || !socket.connected) { reject(new Error("Not connected")); return; }
        var settled = false;
        function finish(fn, arg) {
          if (settled) return;
          settled = true;
          fn(arg);
        }
        var timer = setTimeout(function () { finish(reject, new Error("Ping timed out")); }, timeoutMs || 5000);
        socket.once("pong", function (data) {
          clearTimeout(timer);
          finish(resolve, data);
        });
        socket.emit("ping", { t: Date.now() });
      });
    }
  };
})();
