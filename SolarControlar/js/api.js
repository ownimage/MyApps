// SolarControlar — Flask API communication layer. All API calls go through
// the configurable Flask URL stored in localStorage.

var solarApi = {
  _baseUrl: function () {
    var url = getFlaskUrl();
    return url.replace(/\/+$/, "");
  },

  _fetch: function (path, options) {
    var base = this._baseUrl();
    return fetch(base + path, options || {}).then(function (resp) {
      if (!resp.ok) throw new Error("HTTP " + resp.status);
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
    var base = this._baseUrl();
    return fetch(base + "/", {
      method: "POST",
      body: formData
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  },

  saveConfig: function (formData) {
    var base = this._baseUrl();
    return fetch(base + "/api/config", {
      method: "POST",
      body: formData
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  },

  runForecast: function () {
    var base = this._baseUrl();
    return fetch(base + "/api/run_forecast", {
      method: "POST"
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }
};
