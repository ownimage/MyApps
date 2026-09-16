// SolarControlar — Flask API communication layer. All API calls go through
// the configurable Flask URL stored in localStorage.

// Build an Error that carries the server's actual message (JSON "error" field
// or raw body) so callers can show the full details to the user.
function serverError(status, body) {
  var message = "HTTP " + status;
  var detail = body ? String(body) : "";
  if (detail) {
    try {
      var parsed = JSON.parse(detail);
      if (parsed && typeof parsed.error === "string") detail = parsed.error;
    } catch (e) {
      // not JSON; keep the raw body
    }
    message = message + ": " + detail;
  }
  var err = new Error(message);
  err.status = status;
  err.serverMessage = detail || message;
  return err;
}

var solarApi = {
  _baseUrl: function () {
    var url = getFlaskUrl();
    return url.replace(/\/+$/, "");
  },

  _fetch: function (path, options) {
    var base = this._baseUrl();
    return fetch(base + path, options || {}).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (body) {
          throw serverError(resp.status, body);
        });
      }
      return resp;
    });
  },

  _post: function (path, formData) {
    var base = this._baseUrl();
    var options = { method: "POST" };
    if (formData) options.body = formData;
    return fetch(base + path, options).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (body) {
          throw serverError(resp.status, body);
        });
      }
      return resp;
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
