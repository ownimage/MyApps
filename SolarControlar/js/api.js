// SolarControlar — Flask API communication layer. All API calls go through
// the configurable Flask URL stored in localStorage.

// Build an Error that carries the server's actual message (JSON "error" field
// or raw body) plus the URL it was requested from, so callers can show the
// full details to the user. status === 0 means a network-level failure (no
// response reached the app, e.g. CORS blocked or server unreachable).
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
    message = message +
      " (The Flask server may be down or unreachable, CORS may be blocking the request," +
      " or the Flask URL in app Settings may be wrong.)";
  }
  var err = new Error(message);
  err.status = status;
  err.serverMessage = message;
  err.isApiError = true;
  return err;
}

var solarApi = {
  _baseUrl: function () {
    var url = getFlaskUrl();
    return url.replace(/\/+$/, "");
  },

  _fetch: function (path, options) {
    var url = this._baseUrl() + path;
    return fetch(url, options || {}).then(function (resp) {
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

  _post: function (path, formData) {
    var url = this._baseUrl() + path;
    var options = { method: "POST" };
    if (formData) options.body = formData;
    return fetch(url, options).then(function (resp) {
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

  getPowerDates: function () {
    return this._fetch("/api/power_data").then(function (r) { return r.json(); });
  },

  getPowerData: function (date) {
    return this._fetch("/api/power_data?date=" + encodeURIComponent(date))
      .then(function (r) { return r.json(); });
  },

  getFiles: function (file, count) {
    var params = "file=" + encodeURIComponent(file || "config_apply");
    if (count) params += "&count=" + encodeURIComponent(count);
    return this._fetch("/api/files?" + params).then(function (r) { return r.text(); });
  },

  saveSettings: function (formData) {
    return this._post("/", formData).then(function (r) { return r.text(); });
  },

  saveConfig: function (formData) {
    return this._post("/api/config", formData).then(function (r) { return r.text(); });
  },

  runForecast: function () {
    return this._post("/api/run_forecast").then(function (r) { return r.text(); });
  }
};
