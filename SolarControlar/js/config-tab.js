// SolarControlar — Config tab: edit charge_to_percentage. Mirrors the Flask
// app's "Config" tab.

var _configData = null;

function renderConfigTab() {
  var container = document.getElementById("tab-config");
  if (!container) return;

  if (!_configData) {
    container.innerHTML = '<p class="text-secondary loading">Loading config...</p>';
    loadConfigData();
    return;
  }

  var val = _configData.charge_to_percentage !== undefined ? _configData.charge_to_percentage : 50;

  container.innerHTML =
    '<form id="configForm" onsubmit="return saveConfig(event)">' +
      '<table class="power-table">' +
        '<thead><tr><th>Setting</th><th>Value</th><th>Access</th><th>Description</th></tr></thead>' +
        '<tbody>' +
          '<tr data-key="charge_to_percentage" data-original="' + val + '">' +
            '<td>Charge To Percentage</td>' +
            '<td>' +
              '<div class="d-flex align-items-center gap-2">' +
                '<input type="range" id="configSlider" min="0" max="100" step="1" value="' + val + '" ' +
                  'oninput="updateConfigSlider(this.value)">' +
                '<output id="configOutput" style="min-width:3rem;text-align:right;font-weight:600">' + val + '%</output>' +
              '</div>' +
              '<input type="hidden" name="charge_to_percentage" id="configHidden" value="' + val + '">' +
            '</td>' +
            '<td>' +
              '<span class="access-badge badge-rw">Read/Write</span>' +
              '<span class="was-text" style="display:none;"> Was: <strong class="was-val"></strong>%</span>' +
            '</td>' +
            '<td>Target battery percentage for overnight charging (applied between 02:00-05:00)</td>' +
          '</tr>' +
        '</tbody>' +
      '</table>' +
      '<div class="mt-3 text-end">' +
        '<button type="submit" class="btn btn-primary btn-sm">Save Changes</button>' +
      '</div>' +
    '</form>';

  wireConfigChangeDetection();
}

function loadConfigData() {
  if (_configData) return renderConfigTab();
  var base = getFlaskUrl().replace(/\/+$/, "");
  fetch(base + "/", solarApi._withAuth({ credentials: "same-origin" }))
    .then(function (resp) {
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return resp.text();
    })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var val = 50;
      var hidden = doc.querySelector('#hidden-charge_to_percentage') ||
                   doc.querySelector('input[name="charge_to_percentage"][type="hidden"]');
      if (hidden && hidden.value !== "") {
        var parsed = parseFloat(hidden.value);
        if (!isNaN(parsed)) val = parsed;
      }
      _configData = { charge_to_percentage: val };
      renderConfigTab();
    })
    .catch(function () {
      _configData = { charge_to_percentage: 50 };
      renderConfigTab();
    });
}

function updateConfigSlider(value) {
  var output = document.getElementById("configOutput");
  var hidden = document.getElementById("configHidden");
  if (output) output.textContent = value + "%";
  if (hidden) hidden.value = value;
}

function saveConfig(e) {
  e.preventDefault();
  var form = document.getElementById("configForm");
  if (!form) return false;

  var formData = new FormData(form);

  solarApi.saveConfig(formData)
    .then(function () {
      showFlash("Config saved successfully.", "success");
      _configData = null;
      renderConfigTab();
    })
    .catch(function (err) {
      showFlash("Error saving config: " + err.message, "error");
    });

  return false;
}

// Mirrors the Flask behaviour: "Changed" badge + original value when the
// slider diverges from the server value.
function wireConfigChangeDetection() {
  var row = document.querySelector("#configForm tr[data-key]");
  if (!row) return;

  var key = row.getAttribute("data-key");
  var original = row.getAttribute("data-original") || "";
  var badge = row.querySelector(".access-badge");
  var wasText = row.querySelector(".was-text");
  var wasVal = row.querySelector(".was-val");
  if (!badge) return;
  wasVal.textContent = original;

  var hiddenInput = document.getElementById("configHidden");
  var slider = document.getElementById("configSlider");

  function checkChange() {
    var current = hiddenInput ? hiddenInput.value : null;
    if (current === null) return;
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

  if (slider) slider.addEventListener("input", checkChange);
}
