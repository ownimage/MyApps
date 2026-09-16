// SolarControlar — the main "Settings" tab: edit the solar control settings
// stored server-side in settings.json. The Flask app serves these in its
// rendered index.html (GET /) as <tr data-key> rows + a csrf_token. This tab
// fetches that page, parses it with DOMParser, renders editable controls and
// POSTs the changes back to the same endpoint (mirroring the Flask template).

var _solarSettings = null;   // [{ key, label, description, value, readonly, slider:{min,max,step} | null, original }]
var _solarCsrfToken = "";
var _solarSettingsLoading = false;

function renderSolarSettingsTab() {
  var container = document.getElementById("tab-settings");
  if (!container) return;

  if (!_solarSettings) {
    if (!_solarSettingsLoading) {
      container.innerHTML = '<p class="text-secondary loading">Loading settings...</p>';
      loadSolarSettings();
    }
    return;
  }

  container.innerHTML = buildSolarSettingsHtml();
  wireSolarSettingsChangeDetection();
}

// Fetch + parse the server-rendered index page for the settings table + CSRF.
function loadSolarSettings() {
  if (_solarSettingsLoading) return;
  _solarSettingsLoading = true;
  var container = document.getElementById("tab-settings");
  if (container) container.innerHTML = '<p class="text-secondary loading">Loading settings...</p>';

  var base = getFlaskUrl().replace(/\/+$/, "");
  fetch(base + "/", solarApi._withAuth({ credentials: "same-origin" }))
    .then(function (resp) {
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return resp.text();
    })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var form = doc.getElementById("settingsForm");
      if (!form) {
        throw new Error("settings form not found in server response");
      }
      var tokenInput = form.querySelector('input[name="csrf_token"]');
      _solarCsrfToken = tokenInput ? tokenInput.value : "";

      var settings = [];
      form.querySelectorAll("tr[data-key]").forEach(function (tr) {
        var key = tr.getAttribute("data-key");
        var original = tr.getAttribute("data-original") || "";
        var label = tr.children[0] ? tr.children[0].textContent.trim() : key;
        var desc = tr.children[3] ? tr.children[3].textContent.trim() : "";
        var visibleInput = tr.querySelector('input[name="' + key + '"]:not([type="hidden"])');
        var sliderInput = tr.querySelector('input[type="range"]');
        var hiddenInput = tr.querySelector('input[name="' + key + '"][type="hidden"]') ||
                          form.querySelector('input[name="' + key + '"][type="hidden"]');
        var value = hiddenInput ? hiddenInput.value : (visibleInput ? visibleInput.value : original);
        var readonly = !!(visibleInput && visibleInput.readOnly);
        var slider = null;
        if (sliderInput) {
          slider = {
            min: sliderInput.getAttribute("min"),
            max: sliderInput.getAttribute("max"),
            step: sliderInput.getAttribute("step") || "1"
          };
        }
        settings.push({
          key: key,
          label: label,
          description: desc,
          value: value,
          original: original,
          readonly: readonly,
          slider: slider
        });
      });
      _solarSettings = settings;
      _solarSettingsLoading = false;
      renderSolarSettingsTab();
    })
    .catch(function (err) {
      _solarSettingsLoading = false;
      var container = document.getElementById("tab-settings");
      if (container) {
        container.innerHTML =
          '<div class="flash flash-error">Error loading settings: ' + escapeHtml(err.message) + '</div>' +
          '<p class="text-secondary">Check the Flask URL in the app Settings (hamburger menu).</p>';
      }
    });
}

function buildSolarSettingsHtml() {
  var rows = _solarSettings.map(function (f) {
    var valueInput;

    if (f.readonly) {
      valueInput = '<input type="text" class="form-control" name="' + escapeHtml(f.key) + '" value="' + escapeHtml(String(f.value)) + '" readonly>';
    } else if (f.slider) {
      valueInput =
        '<div class="d-flex align-items-center gap-2">' +
          '<input type="range" class="flex-grow-1" id="slider-' + escapeHtml(f.key) + '"' +
            ' min="' + escapeHtml(String(f.slider.min)) + '" max="' + escapeHtml(String(f.slider.max)) + '" step="' + escapeHtml(String(f.slider.step)) + '"' +
            ' value="' + escapeHtml(String(f.value)) + '"' +
            ' oninput="solarSettingSlider(this)">' +
          '<output id="output-' + escapeHtml(f.key) + '" style="min-width:3rem;text-align:right;font-weight:600">' + escapeHtml(String(f.value)) + '</output>' +
        '</div>' +
        '<input type="hidden" name="' + escapeHtml(f.key) + '" id="hidden-' + escapeHtml(f.key) + '" value="' + escapeHtml(String(f.value)) + '">';
    } else {
      valueInput = '<input type="number" class="form-control" name="' + escapeHtml(f.key) + '" value="' + escapeHtml(String(f.value)) + '" step="any">';
    }

    return '<tr data-key="' + escapeHtml(f.key) + '" data-original="' + escapeHtml(String(f.original)) + '">' +
      '<td>' + escapeHtml(f.label) + '</td>' +
      '<td>' + valueInput + '</td>' +
      '<td>' +
        '<span class="access-badge ' + (f.readonly ? "badge-ro" : "badge-rw") + '">' +
          (f.readonly ? "Read Only" : "Read/Write") +
        '</span>' +
        '<span class="was-text" style="display:none;"> Was: <strong class="was-val"></strong></span>' +
      '</td>' +
      '<td>' + escapeHtml(f.description) + '</td>' +
    '</tr>';
  }).join("");

  return '<form id="solarSettingsForm" onsubmit="return saveSolarSettings(event)">' +
    '<table class="power-table settings-table">' +
      '<thead><tr><th>Setting</th><th>Value</th><th>Access</th><th>Description</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +
    '<div class="actions mt-3 text-end">' +
      '<button type="submit" class="btn btn-primary btn-sm">Save Changes</button>' +
    '</div>' +
  '</form>';

}

function solarSettingSlider(slider) {
  var output = document.getElementById("output-" + slider.id.replace("slider-", ""));
  var hidden = document.getElementById("hidden-" + slider.id.replace("slider-", ""));
  if (output) output.textContent = slider.value;
  if (hidden) hidden.value = slider.value;
}

// Mirrors the Flask index.html behaviour: show "Changed" + the original value
// on the access badge whenever a setting diverges from its server value.
function wireSolarSettingsChangeDetection() {
  var rows = document.querySelectorAll("#solarSettingsForm tr[data-key]");
  rows.forEach(function (row) {
    var key = row.getAttribute("data-key");
    var original = row.getAttribute("data-original") || "";
    var badge = row.querySelector(".access-badge");
    var wasText = row.querySelector(".was-text");
    var wasVal = row.querySelector(".was-val");

    if (!badge) return;
    wasVal.textContent = original;

    var hiddenInput = document.getElementById("hidden-" + key);
    var visibleInput = row.querySelector('input[name="' + key + '"]:not([type="hidden"])');

    if (visibleInput && visibleInput.readOnly) return;

    function checkChange() {
      var current;
      if (hiddenInput) {
        current = hiddenInput.value;
      } else if (visibleInput) {
        current = visibleInput.value;
      } else {
        return;
      }

      if (current != original) {
        badge.className = "access-badge badge-changed";
        badge.textContent = "Changed";
        wasText.style.display = "inline";
      } else {
        badge.className = "access-badge badge-rw";
        badge.textContent = "Read/Write";
        wasText.style.display = "none";
      }
    }

    var slider = document.getElementById("slider-" + key);
    if (slider) {
      slider.addEventListener("input", checkChange);
    } else if (visibleInput && !visibleInput.readOnly) {
      visibleInput.addEventListener("input", checkChange);
    }
  });
}

function saveSolarSettings(e) {
  e.preventDefault();
  var form = document.getElementById("solarSettingsForm");
  if (!form) return false;

  var formData = new FormData(form);
  if (_solarCsrfToken) formData.append("csrf_token", _solarCsrfToken);

  var base = getFlaskUrl().replace(/\/+$/, "");
  fetch(base + "/", solarApi._withAuth({
    method: "POST",
    credentials: "same-origin",
    body: formData
  }))
    .then(function (resp) {
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return resp.text();
    })
    .then(function () {
      showFlash("Settings saved successfully.", "success");
      // Re-fetch so the (possibly recalibrated server) values are shown.
      _solarSettings = null;
      renderSolarSettingsTab();
    })
    .catch(function (err) {
      showFlash("Error saving settings: " + err.message, "error");
    });

  return false;
}