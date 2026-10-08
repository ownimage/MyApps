// PhoneButtons — REST layer for the Flask/Socket.IO server. Every request goes
// through the target in app Settings (serverBase()).

// Network-level guidance based on the URL that failed and the page's context.
// The two causes worth naming: an HTTPS page cannot fetch an HTTP target
// (mixed content), and `localhost` on a phone is the phone, not the PC.
function networkDiagnostics(url) {
  var tips = [];
  var targetIsHttp = String(url).toLowerCase().indexOf("http://") === 0;
  var pageIsHttps = typeof window !== "undefined" &&
                    window.location && window.location.protocol === "https:";
  if (pageIsHttps && targetIsHttp) {
    tips.push("this app is served over HTTPS but the server URL is HTTP, which browsers block as mixed content " +
              "(serve this app over http:// too, or get a secure (https/wss) URL for the server)");
  }
  if (/https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(url)) {
    tips.push("'localhost' means this device itself — on your phone it will NOT reach your PC; " +
              "use your PC's LAN IP instead (e.g. http://192.168.1.50:5000)");
  }
  return tips.length ? " Likely cause(s): " + tips.join("; ") + "." : "";
}

// An Error carrying the server's message (JSON "error" field or raw body) plus
// the URL requested. status === 0 means no response reached the app (CORS,
// server down, wrong URL).
function serverError(status, message, url, body) {
  var detail = body ? String(body).trim() : "";
  if (detail) {
    try {
      var parsed = JSON.parse(detail);
      if (parsed && typeof parsed.error === "string") detail = parsed.error;
    } catch (e) {
      // not JSON; keep the raw body
    }
    message = message + (detail ? ": " + detail : "");
  }
  message = message + " — " + url;
  if (status === 0) {
    message = message + networkDiagnostics(url) +
      " (The server may be down or unreachable, CORS may be blocking the request," +
      " or the server URL in Settings may be wrong.)";
  }
  var err = new Error(message);
  err.status = status;
  err.serverMessage = message;
  err.isApiError = true;
  return err;
}

var pbApi = {
  _baseUrl: function () {
    return serverBase();
  },

  _withAuth: function (options) {
    var opts = options || {};
    var token = getServerToken();
    if (token) {
      opts.headers = opts.headers || {};
      opts.headers["Authorization"] = "Bearer " + token;
    }
    return opts;
  },

  _fetch: function (path, options) {
    var url = this._baseUrl() + path;
    return fetch(url, this._withAuth(options)).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (body) {
          throw serverError(resp.status, "HTTP " + resp.status, url, body);
        });
      }
      return resp;
    }).catch(function (err) {
      if (err && err.isApiError) throw err;
      throw serverError(0, (err && err.message) ? err.message : "Network error", url);
    });
  },

  // Health probe — the first thing "Test connection" calls.
  getHealth: function () {
    return this._fetch("/api/health").then(function (r) { return r.json(); });
  },

  // The server's configured app -> template map (icons inlined as data URLs).
  getAllApplications: function () {
    return this._fetch("/all-applications").then(function (r) { return r.json(); });
  },

  getTemplates: function () {
    return this._fetch("/api/templates").then(function (r) { return r.json(); });
  }
};
