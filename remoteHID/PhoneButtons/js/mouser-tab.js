// PhoneButtons — "Manage Layout" -> Mouser tab.
//
// A layout owns an optional `mouser` block:
//   { enabled, axes: { rx: {positive, negative, gain, step, deadband}, ... } }
// The server watches the capture client's UDP frames and presses `positive`
// when the accumulated value grows by `step`. `gain` is units per mouse count,
// so a press happens every `step / gain` counts. Keys are any key string the
// server understands: F13, A, LEFT, or a chord such as ctrl+shift+K. F13-F24
// are the defaults because games/Blender/Unity bind them happily and no normal
// keyboard has them.

var PB_MOUSER_AXES = [
  { axis: "rx", label: "Rotate X", source: "vertical (dy)" },
  { axis: "ry", label: "Rotate Y", source: "horizontal (dx)" },
  { axis: "rz", label: "Rotate Z", source: "wheel" },
  { axis: "tx", label: "Translate X", source: "horizontal (dx)" },
  { axis: "ty", label: "Translate Y", source: "wheel" },
  { axis: "tz", label: "Translate Z", source: "vertical (dy)" }
];

// F13-F24 first: they are the conflict-free defaults. The rest mirror the
// server's `_KEY_MAP` (plus A-Z / 0-9 / punctuation, which the server resolves
// through VkKeyScanW) so the datalist can offer the full set.
var PB_MOUSER_KEYS = (function () {
  var keys = ["F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24"];
  for (var i = 1; i <= 12; i++) keys.push("F" + i);
  keys = keys.concat([
    "BACKSPACE", "TAB", "ENTER", "ESCAPE", "SPACE", "DELETE",
    "LEFT", "RIGHT", "UP", "DOWN", "HOME", "END", "INSERT", "PAGEUP", "PAGEDOWN",
    "VOLUME_MUTE", "VOLUME_DOWN", "VOLUME_UP",
    "MEDIA_NEXT_TRACK", "MEDIA_PREV_TRACK", "MEDIA_STOP", "MEDIA_PLAY_PAUSE"
  ]);
  for (var c = 65; c <= 90; c++) keys.push(String.fromCharCode(c));
  for (var n = 0; n <= 9; n++) keys.push(String(n));
  keys = keys.concat(["-", "=", "[", "]", ";", "'", ",", ".", "/", "\\", "`"]);
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

function pbMouserKeyId(axis, direction) {
  return "mouser-" + axis + "-" + direction;
}

function pbMouserModifierId(axis, direction, modifier) {
  return pbMouserKeyId(axis, direction) + "-" + modifier;
}

function pbMouserNumberId(axis, field) {
  return "mouser-" + axis + "-" + field;
}

function pbMouserClamp(value, fallback, minimum) {
  var n = parseFloat(value);
  if (!isFinite(n)) n = fallback;
  return Math.max(minimum, n);
}

// "ctrl+shift+K" -> { mods: {ctrl, alt, shift}, key: "K" }
function pbMouserParseKey(value) {
  var parts = String(value == null ? "" : value).split("+");
  var mods = { ctrl: false, alt: false, shift: false };
  while (parts.length) {
    var first = parts[0].trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(mods, first)) break;
    mods[first] = true;
    parts.shift();
  }
  return { mods: mods, key: parts.join("+").trim() };
}

// Build the server-compatible string. A direction with no main key is UNSET,
// even if a modifier box was left checked: a Mouser ratchet needs a main key.
function pbMouserComposeKey(key, ctrl, alt, shift) {
  var base = String(key == null ? "" : key).trim();
  if (!base) return "";
  var parts = [];
  if (ctrl) parts.push("ctrl");
  if (alt) parts.push("alt");
  if (shift) parts.push("shift");
  parts.push(base.toUpperCase());
  return parts.join("+");
}

function pbMouserCanonicalKey(value) {
  var parsed = pbMouserParseKey(value);
  return pbMouserComposeKey(parsed.key, parsed.mods.ctrl, parsed.mods.alt, parsed.mods.shift);
}

function pbMouserSetBinding(axis, direction, value) {
  var parsed = pbMouserParseKey(value);
  var input = document.getElementById(pbMouserKeyId(axis, direction));
  if (input) input.value = parsed.key ? parsed.key.toUpperCase() : "";
  ["ctrl", "alt", "shift"].forEach(function (modifier) {
    var box = document.getElementById(pbMouserModifierId(axis, direction, modifier));
    if (box) box.checked = !!parsed.mods[modifier];
  });
}

function pbMouserReadBinding(axis, direction) {
  var input = document.getElementById(pbMouserKeyId(axis, direction));
  // Accept both "type K + tick Ctrl" and typing the whole "ctrl+K" chord.
  var parsed = pbMouserParseKey(input ? input.value : "");
  function checked(modifier) {
    var box = document.getElementById(pbMouserModifierId(axis, direction, modifier));
    return !!(box && box.checked);
  }
  return pbMouserComposeKey(
    parsed.key,
    parsed.mods.ctrl || checked("ctrl"),
    parsed.mods.alt || checked("alt"),
    parsed.mods.shift || checked("shift")
  );
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
      positive: pbMouserCanonicalKey(raw.positive == null ? d.positive : raw.positive),
      negative: pbMouserCanonicalKey(raw.negative == null ? d.negative : raw.negative),
      gain: pbMouserClamp(raw.gain, d.gain, 0.000001),
      step: pbMouserClamp(raw.step, d.step, 0.000001),
      deadband: pbMouserClamp(raw.deadband, d.deadband, 0)
    };
  });
  return { enabled: !!block.enabled, axes: axes };
}

function pbMouserBindingHTML(item, direction, label, value) {
  var keyId = pbMouserKeyId(item.axis, direction);
  var parsed = pbMouserParseKey(value);
  var modifiers = [
    ["ctrl", "Ctrl"],
    ["alt", "Alt"],
    ["shift", "Shift"]
  ].map(function (pair) {
    return '<smd-checkbox id="' + pbMouserModifierId(item.axis, direction, pair[0]) + '"' +
      (parsed.mods[pair[0]] ? ' checked' : '') + '>' + pair[1] + '</smd-checkbox>';
  }).join("");

  return '<div class="col-6">' +
    '<label class="form-label small mb-0" for="' + keyId + '">' + label + ' key</label>' +
    '<input type="text" class="form-control form-control-sm" id="' + keyId + '" ' +
      'list="pbMouserKeyList" value="' + pbMouserEscape(parsed.key.toUpperCase()) + '" ' +
      'placeholder="F13, A, LEFT" autocomplete="off" autocapitalize="characters" spellcheck="false" ' +
      'aria-label="' + item.label + ' ' + label + ' key">' +
    '<div class="d-flex flex-wrap gap-2 mt-1">' + modifiers + '</div>' +
  '</div>';
}

function pbMouserAxisHTML(item, cfg) {
  return '<div class="card mb-2">' +
    '<div class="card-body py-2">' +
      '<div class="d-flex justify-content-between align-items-baseline">' +
        '<strong>' + item.label + '</strong>' +
        '<span class="form-text">' + item.source + '</span>' +
      '</div>' +
      '<div class="row g-2 mt-0">' +
        pbMouserBindingHTML(item, "positive", "+", cfg.positive) +
        pbMouserBindingHTML(item, "negative", "-", cfg.negative) +
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
  var keyList = '<datalist id="pbMouserKeyList">' + PB_MOUSER_KEYS.map(function (key) {
    return '<option value="' + pbMouserEscape(key) + '"></option>';
  }).join("") + '</datalist>';

  return keyList +
    '<div class="mb-2">' +
      '<smd-checkbox id="mouserEnabled">Enable Mouser for this layout</smd-checkbox>' +
      '<div class="form-text">When off, mouse motion still reaches the PC normally; no keys are pressed.</div>' +
    '</div>' +
    '<div class="alert alert-secondary py-2 small mb-3">' +
      'Hold <strong>MB4</strong> to rotate and <strong>MB5</strong> to translate. ' +
      'Each axis presses its key once per <em>Step</em>; <em>Gain</em> is units per mouse count ' +
      '(a press every <code>Step / Gain</code> counts). The live value is approximate and resets when the mode is released.' +
    '</div>' +
    '<div class="form-text mb-2">' +
      'Type a key or pick one from the list (F13, A, LEFT, ...), then tick Ctrl / Alt / Shift. ' +
      'Leave the key blank to leave that direction unbound. A chord may also be typed as <code>ctrl+shift+K</code>.' +
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
    pbMouserSetBinding(item.axis, "positive", cfg.positive);
    pbMouserSetBinding(item.axis, "negative", cfg.negative);
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
    axes[item.axis] = {
      positive: pbMouserReadBinding(item.axis, "positive"),
      negative: pbMouserReadBinding(item.axis, "negative"),
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
    pbMouserSetBinding(item.axis, "positive", d.positive);
    pbMouserSetBinding(item.axis, "negative", d.negative);
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
