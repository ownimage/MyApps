// PhoneButtons — REST layer.
//
// The app is served by the same Flask server it talks to, so every path is
// same-origin (no base URL, no auth, no CORS).
var pbApi = {
  _fetch: function (path, options) {
    return fetch(path, options).then(function (resp) {
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

  // The cached application icons (used by the Edit Layout icon picker).
  getAppIcons: function () {
    return this._fetch("/api/app-icons").then(function (data) {
      return data.icons || [];
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

  // Persist a layout definition (display name + icon + orientation).
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
