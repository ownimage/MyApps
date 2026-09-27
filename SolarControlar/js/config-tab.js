// SolarControlar — Config tab: edit charge_to_percentage. Mirrors the Flask
// app's "Config" tab.

var _configData = null;

function renderConfigTab() {
  var container = $id("tab-config");
  if (!container) return;

  if (!_configData) {
    container.innerHTML = '<p class="loading text-secondary fst-italic mb-0">Loading config...</p>';
    loadConfigData();
    return;
  }

  var val = _configData.charge_to_percentage !== undefined ? _configData.charge_to_percentage : 50;

  container.innerHTML =
    '<form id="configForm" class="config-form" onsubmit="return saveConfig(event)">' +
      '<div class="table-responsive">' +
        '<table class="table table-striped table-hover align-middle w-100 power-table mb-3">' +
          '<thead><tr><th scope="col">Setting</th><th scope="col">Value</th><th scope="col">Access</th><th scope="col">Description</th></tr></thead>' +
          '<tbody>' +
            '<tr data-key="charge_to_percentage" data-original="' + val + '">' +
              '<td class="fw-semibold">Charge To Percentage</td>' +
              '<td>' +
                '<div class="d-flex align-items-center gap-2">' +
                  '<input type="range" class="form-range flex-grow-1" id="configSlider" min="0" max="100" step="1" value="' + val + '" ' +
                    'oninput="updateConfigSlider(this.value)">' +
                  '<output id="configOutput" class="output-value w-auto text-end fw-semibold">' + val + '%</output>' +
                '</div>' +
                '<input type="hidden" name="charge_to_percentage" id="configHidden" value="' + val + '">' +
              '</td>' +
              '<td>' +
                '<span class="access-badge badge rounded-pill text-bg-success badge-rw">Read/Write</span>' +
                '<span class="was-text d-none text-danger small"> Was: <strong class="was-val"></strong>%</span>' +
              '</td>' +
              '<td>Target battery percentage for overnight charging (applied between 02:00-05:00)</td>' +
            '</tr>' +
          '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="actions d-flex justify-content-end mt-3">' +
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
  var output = $id("configOutput");
  var hidden = $id("configHidden");
  if (output) output.textContent = value + "%";
  if (hidden) hidden.value = value;
}

function saveConfig(e) {
  e.preventDefault();
  var form = $id("configForm");
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
  var form = $id("configForm");
  if (!form) return;
  var row = form.querySelector("tr[data-key]");
  if (!row) return;

  var key = row.getAttribute("data-key");
  var original = row.getAttribute("data-original") || "";
  var badge = row.querySelector(".access-badge");
  var wasText = row.querySelector(".was-text");
  var wasVal = row.querySelector(".was-val");
  if (!badge) return;
  wasVal.textContent = original;

  var hiddenInput = $id("configHidden");
  var slider = $id("configSlider");

  function checkChange() {
    var current = hiddenInput ? hiddenInput.value : null;
    if (current === null) return;
    if (current != original) {
      badge.className = "access-badge badge rounded-pill text-bg-warning badge-changed";
      badge.textContent = "Changed";
      wasText.classList.remove("d-none");
      wasText.classList.add("d-inline");
    } else {
      badge.className = "access-badge badge rounded-pill text-bg-success badge-rw";
      badge.textContent = "Read/Write";
      wasText.classList.add("d-none");
      wasText.classList.remove("d-inline");
    }
  }

  if (slider) slider.addEventListener("input", checkChange);
}
