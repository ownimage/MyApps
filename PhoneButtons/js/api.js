// PhoneButtons — server address + REST layer.
//
// The app may be served by the very Flask server it talks to (same origin, so
// every path stays relative) OR from somewhere else (an installed PWA / GitHub
// Pages) pointed at a LAN server via Settings -> Server. pbServerBase() resolves
// that to either "" (same origin) or an absolute "http://host:port".

// Fresh-install defaults: a LAN prefix the user completes + the app server's port
// (PhoneButtons/server/app.py runs on 5000).
var PB_DEFAULT_IP = "192.168.1.";
var PB_DEFAULT_PORT = "5000";

function pbServerIp() {
  return (localStorage.getItem(smdKey("serverIp")) || "").trim();
}

function pbServerPort() {
  return (localStorage.getItem(smdKey("serverPort")) || "").trim();
}

function pbServerHttps() {
  return localStorage.getItem(smdKey("serverHttps")) === "true";
}

// A COMPLETE host: not blank, no scheme/path/space, and not ending in ".". The
// "192.168.1." default is deliberately an incomplete PREFIX, and an incomplete
// address means "this origin" so the app keeps working when served by the server.
function pbHostComplete(host) {
  return !!host && !/[\s/%]/.test(host) && !/\.$/.test(host);
}

// The base URL for API + socket calls: "" (same origin) when the configured
// address is incomplete or IS the current origin, else "http://host:port".
function pbServerBase() {
  var ip = pbServerIp();
  if (!pbHostComplete(ip)) return "";
  var port = pbServerPort() || PB_DEFAULT_PORT;
  var scheme = pbServerHttps() ? "https" : "http";
  var herePort = location.port || (location.protocol === "https:" ? "443" : "80");
  if (location.hostname === ip && String(herePort) === String(port) && location.protocol === scheme + ":") return "";
  return scheme + "://" + ip + ":" + port;
}

var pbApi = {
  _fetch: function (path, options) {
    return fetch(pbServerBase() + path, options).then(function (resp) {
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
