// PhoneButtons — "Manage Layout" -> Mouser tab.
//
// A layout owns an optional `mouser` block:
//   { enabled, axes: { rx: {positive, negative, gain, step, deadband}, ... } }
// The server watches the capture client's UDP frames and presses `positive`
// when the accumulated value grows by `step`. `gain` is units per mouse count,
// so a press happens every `step / gain` counts. Keys are F13-F24 by default
// because games/Blender/Unity bind them happily and no normal keyboard has them.

var PB_MOUSER_AXES = [
  { axis: "rx", label: "Rotate X", source: "vertical (dy)" },
  { axis: "ry", label: "Rotate Y", source: "horizontal (dx)" },
  { axis: "rz", label: "Rotate Z", source: "wheel" },
  { axis: "tx", label: "Translate X", source: "horizontal (dx)" },
  { axis: "ty", label: "Translate Y", source: "wheel" },
  { axis: "tz", label: "Translate Z", source: "vertical (dy)" }
];

// F13-F24 first: they are the conflict-free defaults. F1-F12 are offered for
// setups that cannot see F13+ (some remappers swallow them).
var PB_MOUSER_KEYS = (function () {
  var keys = ["F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24"];
  for (var i = 1; i <= 12; i++) keys.push("F" + i);
  return keys;
})();

var PB_MOUSER_DEFAULTS = {
  rx: { positive: "F13", negative: "F14", gain: 0.05, step: 5, deadband: 0 },
  ry: { positive: "F15", negative: "F16", gain: 0.05, step: 5, deadband: 0 },
  rz: { positive: "F17", negative: "F18", gain: 0.05, step: 5, deadband: 0 },
  tx: { positive: "F19", negative: "F20", gain: 0.0001, step: 0.01, deadband: 0 },
  ty: { positive: "F21", negative: "F22", gain: 0.0001, step: 0.01, deadband: 0 },
  tz: { positive: "F23", negative: "F24", gain: 0.0001, step: 0.01, deadband: 0 }
};

function pbMouserKeyOptions() {
  return [{ value: "", label: "None" }].concat(PB_MOUSER_KEYS.map(function (k) {
    return { value: k, label: k };
  }));
}

function pbMouserSelectId(axis, direction) {
  return "mouser-" + axis + "-" + direction;
}

function pbMouserNumberId(axis, field) {
  return "mouser-" + axis + "-" + field;
}

function pbMouserClamp(value, fallback, minimum) {
  var n = parseFloat(value);
  if (!isFinite(n)) n = fallback;
  return Math.max(minimum, n);
}

// Normalise a stored (possibly partial, possibly empty) block to all six axes.
function pbMouserNormalize(block) {
  block = block || {};
  var stored = block.axes || {};
  var axes = {};
  PB_MOUSER_AXES.forEach(function (item) {
    var d = PB_MOUSER_DEFAULTS[item.axis];
    var raw = stored[item.axis] || {};
    axes[item.axis] = {
      positive: raw.positive == null ? d.positive : String(raw.positive).toUpperCase(),
      negative: raw.negative == null ? d.negative : String(raw.negative).toUpperCase(),
      gain: pbMouserClamp(raw.gain, d.gain, 0.000001),
      step: pbMouserClamp(raw.step, d.step, 0.000001),
      deadband: pbMouserClamp(raw.deadband, d.deadband, 0)
    };
  });
  return { enabled: !!block.enabled, axes: axes };
}

function pbMouserAxisHTML(item, cfg) {
  var idPos = pbMouserSelectId(item.axis, "positive");
  var idNeg = pbMouserSelectId(item.axis, "negative");
  var options = pbMouserKeyOptions().map(function (o) {
    return '<option value="' + o.value + '">' + o.label + '</option>';
  }).join("");

  return '<div class="card mb-2">' +
    '<div class="card-body py-2">' +
      '<div class="d-flex justify-content-between align-items-baseline">' +
        '<strong>' + item.label + '</strong>' +
        '<span class="form-text">' + item.source + '</span>' +
      '</div>' +
      '<div class="row g-2 mt-0">' +
        '<div class="col-6">' +
          '<label class="form-label small mb-0" for="' + idPos + '">+ key</label>' +
          '<smd-select id="' + idPos + '" class="form-select form-select-sm" aria-label="' +
            item.label + ' positive key">' + options + '</smd-select>' +
        '</div>' +
        '<div class="col-6">' +
          '<label class="form-label small mb-0" for="' + idNeg + '">- key</label>' +
          '<smd-select id="' + idNeg + '" class="form-select form-select-sm" aria-label="' +
            item.label + ' negative key">' + options + '</smd-select>' +
        '</div>' +
      '</div>' +
      '<div class="row g-2 mt-0">' +
        '<div class="col-4">' +
          '<label class="form-label small mb-0" for="' + pbMouserNumberId(item.axis, "gain") + '">Gain</label>' +
          '<input type="number" step="any" min="0.000001" class="form-control form-control-sm" ' +
            'id="' + pbMouserNumberId(item.axis, "gain") + '" value="' + cfg.gain + '">' +
        '</div>' +
        '<div class="col-4">' +
          '<label class="form-label small mb-0" for="' + pbMouserNumberId(item.axis, "step") + '">Step</label>' +
          '<input type="number" step="any" min="0.000001" class="form-control form-control-sm" ' +
            'id="' + pbMouserNumberId(item.axis, "step") + '" value="' + cfg.step + '">' +
        '</div>' +
        '<div class="col-4">' +
          '<label class="form-label small mb-0" for="' + pbMouserNumberId(item.axis, "deadband") + '">Deadband</label>' +
          '<input type="number" step="any" min="0" class="form-control form-control-sm" ' +
            'id="' + pbMouserNumberId(item.axis, "deadband") + '" value="' + cfg.deadband + '">' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function buildMouserTabHTML() {
  var cards = PB_MOUSER_AXES.map(function (item) {
    return pbMouserAxisHTML(item, PB_MOUSER_DEFAULTS[item.axis]);
  }).join("");

  return '<div class="mb-2">' +
      '<smd-checkbox id="mouserEnabled">Enable Mouser for this layout</smd-checkbox>' +
      '<div class="form-text">When off, mouse motion still reaches the PC normally; no keys are pressed.</div>' +
    '</div>' +
    '<div class="alert alert-secondary py-2 small mb-3">' +
      'Hold <strong>MB4</strong> to rotate and <strong>MB5</strong> to translate. ' +
      'Each axis presses its key once per <em>Step</em>; <em>Gain</em> is units per mouse count ' +
      '(a press every <code>Step / Gain</code> counts). The live value is approximate and resets when the mode is released.' +
    '</div>' +
    '<div class="d-flex flex-wrap gap-2 mb-3">' +
      '<button type="button" class="btn btn-sm btn-outline-secondary" onclick="resetMouserKeys()">Recommended F13&ndash;F24</button>' +
    '</div>' +
    '<div id="mouserLive" class="mb-2 small"></div>' +
    cards;
}

function applyMouserLayout(layout) {
  var block = pbMouserNormalize((layout || {}).mouser);
  var enabled = document.getElementById("mouserEnabled");
  if (enabled) enabled.checked = block.enabled;

  PB_MOUSER_AXES.forEach(function (item) {
    var cfg = block.axes[item.axis];
    var pos = document.getElementById(pbMouserSelectId(item.axis, "positive"));
    var neg = document.getElementById(pbMouserSelectId(item.axis, "negative"));
    if (pos) pos.value = cfg.positive;
    if (neg) neg.value = cfg.negative;
    ["gain", "step", "deadband"].forEach(function (field) {
      var el = document.getElementById(pbMouserNumberId(item.axis, field));
      if (el) el.value = cfg[field];
    });
  });

  applyMouserState(null);
}

function collectMouserLayout() {
  var enabled = document.getElementById("mouserEnabled");
  var axes = {};
  PB_MOUSER_AXES.forEach(function (item) {
    var d = PB_MOUSER_DEFAULTS[item.axis];
    var pos = document.getElementById(pbMouserSelectId(item.axis, "positive"));
    var neg = document.getElementById(pbMouserSelectId(item.axis, "negative"));
    axes[item.axis] = {
      positive: (pos && pos.value ? String(pos.value) : "").toUpperCase(),
      negative: (neg && neg.value ? String(neg.value) : "").toUpperCase(),
      gain: pbMouserClamp((document.getElementById(pbMouserNumberId(item.axis, "gain")) || {}).value, d.gain, 0.000001),
      step: pbMouserClamp((document.getElementById(pbMouserNumberId(item.axis, "step")) || {}).value, d.step, 0.000001),
      deadband: pbMouserClamp((document.getElementById(pbMouserNumberId(item.axis, "deadband")) || {}).value, d.deadband, 0)
    };
  });
  return { enabled: !!(enabled && enabled.checked), axes: axes };
}

function resetMouserKeys() {
  PB_MOUSER_AXES.forEach(function (item) {
    var d = PB_MOUSER_DEFAULTS[item.axis];
    var pos = document.getElementById(pbMouserSelectId(item.axis, "positive"));
    var neg = document.getElementById(pbMouserSelectId(item.axis, "negative"));
    if (pos) pos.value = d.positive;
    if (neg) neg.value = d.negative;
  });
  if (typeof _commLine === "function") {
    _commLine("Mouser: recommended F13-F24 keys applied (save with Finish)", "info");
  }
}

function pbMouserEscape(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}

function pbMouserModeName(mode) {
  if (mode === 1) return "Rotate (MB4)";
  if (mode === 2) return "Translate (MB5)";
  return "Off";
}

// Called at 10 Hz from the socket `mouser_state` event, and once when a layout
// is selected (state = null clears the readout).
function applyMouserState(state) {
  var host = document.getElementById("mouserLive");
  if (!host) return;

  if (!state) {
    host.innerHTML = '<span class="text-body-secondary">Waiting for the server\u2026</span>';
    return;
  }

  var rows = PB_MOUSER_AXES.map(function (item) {
    var a = (state.axes || {})[item.axis] || {};
    var value = typeof a.value === "number" ? a.value : 0;
    var presses = typeof a.presses === "number" ? a.presses : 0;
    return '<tr><td>' + item.axis + '</td>' +
      '<td class="text-end">' + value.toFixed(2) + '</td>' +
      '<td class="text-end">' + presses + '</td></tr>';
  }).join("");

  host.innerHTML =
    '<div class="d-flex flex-wrap gap-2 mb-1">' +
      '<span class="badge text-bg-' + (state.enabled ? "success" : "secondary") + '">' +
        (state.enabled ? "enabled" : "disabled") + '</span>' +
      '<span class="badge text-bg-primary">' + pbMouserModeName(state.mode) + '</span>' +
      '<span class="text-body-secondary">' + pbMouserEscape(state.app || "no app") +
        (state.layout ? " / " + pbMouserEscape(state.layout) : "") + '</span>' +
      '<span class="text-body-secondary">' + (state.pressesPerSecond || 0) + ' presses/s</span>' +
    '</div>' +
    '<table class="table table-sm table-borderless mb-0">' +
      '<thead><tr><th>Axis</th><th class="text-end">Value</th><th class="text-end">Presses</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
}
