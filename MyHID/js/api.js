// MyHID — server address + REST layer.
//
// The app may be served BY the same Flask server it talks to (same origin, so every
// path stays relative) OR from elsewhere (GitHub Pages, or a Cloudflare-tunnelled
// https server) and pointed at the server via Settings -> Server. myhidServerBase()
// resolves that to "" (same origin) or an absolute "<scheme>://<host>[:<port>]".

var MYHID_DEFAULT_ADDRESS = "192.168.1."; // an incomplete prefix = "not configured"

function myhidServerHttps() { return localStorage.getItem(smdKey("serverHttps")) === "true"; }
function myhidServerAddress() { return (localStorage.getItem(smdKey("serverAddress")) || MYHID_DEFAULT_ADDRESS).trim(); }
function myhidServerPort() { return (localStorage.getItem(smdKey("serverPort")) || "").trim(); }

// A COMPLETE host: not blank, no scheme/path/space/colon, not ending in ".". Accepts
// an IP (192.168.1.60) OR a DNS name (something.trycloudflare.com). ":" is rejected
// because the port has its own field (else `host:5000` + port 5000 -> :5000:5000).
function myhidHostComplete(host) { return !!host && !/[\s/%:]/.test(host) && !/\.$/.test(host); }

// The base URL for API + socket calls. "" when the address is incomplete or IS this
// origin (relative paths then), else "<scheme>://<host>[:<port>]". An EMPTY port
// means the scheme's default (80/443) — which is what a Cloudflare tunnel needs.
function myhidServerBase() {
  var host = myhidServerAddress();
  if (!myhidHostComplete(host)) return "";
  var scheme = myhidServerHttps() ? "https" : "http";
  var port = myhidServerPort();
  var herePort = location.port || (location.protocol === "https:" ? "443" : "80");
  var wantPort = port || (scheme === "https" ? "443" : "80");
  if (location.hostname === host && String(herePort) === String(wantPort) && location.protocol === scheme + ":") return "";
  return scheme + "://" + host + (port ? ":" + port : "");
}

// Parse a scanned server URL — "https://something.trycloudflare.com",
// "http://192.168.1.60:5000", "host:5000" or a bare host — into the two fields.
// A URL with NO port yields port "" so the scheme's default is used.
function myhidParseServerUrl(text) {
  text = String(text || "").trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = "http://" + text;
  try {
    var u = new URL(text);
    var host = u.hostname;
    // A real host only: dot-separated labels (IPv4 or a name). `new URL()` happily
    // percent-encodes free text, so validate rather than trust it.
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i.test(host)) return null;
    var port = u.port || "";
    if (port && (!/^\d{1,5}$/.test(port) || +port < 1 || +port > 65535)) return null;
    return { https: u.protocol === "https:", address: host, port: String(port) };
  } catch (e) {
    return null;
  }
}

// Resolve a SERVER-relative URL (e.g. "/app-icon-cache/x.png") against the
// configured server base. The Flask server answers with ROOT-RELATIVE paths, which
// are only correct when the app is served BY that server; from another origin
// (GitHub Pages, or the tunnel) an unprefixed path is requested from the APP's host
// instead (e.g. ownimage.github.io/app-icon-cache/...). An empty base (same origin)
// leaves the path untouched.
function myhidServerUrl(path) {
  var p = String(path == null ? "" : path);
  // Absolute ("http://…"), protocol-relative ("//host/…") or relative -> as-is.
  if (!p || p.charAt(0) !== "/" || p.charAt(1) === "/") return p;
  return myhidServerBase() + p;
}

var myhidApi = {
  _fetch: function (path, options) {
    return fetch(myhidServerBase() + path, options).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (body) {
          throw new Error("HTTP " + resp.status + (body ? ": " + body.trim() : ""));
        });
      }
      return resp.json();
    });
  },

  // The layout catalog for the Edit App wizard's "Select Layout" dropdown.
  getLayouts: function () {
    return this._fetch("/api/layouts").then(function (data) {
      return data.layouts || [];
    });
  },

  // The cached application icons (used by the Manage Layout icon picker).
  getAppIcons: function () {
    return this._fetch("/api/app-icons").then(function (data) {
      return data.icons || [];
    });
  },

  // The running applications (used by the Manage App page's app dropdown).
  getApps: function () {
    return this._fetch("/api/apps").then(function (data) {
      return data.apps || [];
    });
  },

  // Persist which layout the given app uses (the Edit App wizard's Finish).
  saveAppLayout: function (name, layout) {
    return this._fetch("/api/save-app-layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, layout: layout || "" })
    });
  },

  // Persist a layout definition (display name + icon + grid dims).
  saveLayout: function (layout) {
    return this._fetch("/api/save-layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layout)
    });
  },

  // Persist one button (image + key combination) of a layout.
  saveLayoutButton: function (button) {
    return this._fetch("/api/save-layout-button", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(button)
    });
  }
};
