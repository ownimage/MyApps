// Original scalable Nixie artwork: ten shaped wire cathodes, anode mesh,
// mica supports, ceramic socket, metal contacts and a reflective envelope.
// Every luminous layer takes its hue from --clock-color; no baked-in glow.
var NIXIE_WIRE_PATHS = [
  "M72 68C49 68 44 88 44 122C44 156 49 177 72 177C95 177 100 156 100 122C100 88 95 68 72 68Z",
  "M54 86L74 69V176M55 176H94",
  "M46 92C46 61 98 61 98 92C98 112 83 119 68 132C52 145 46 158 46 176H99",
  "M47 80C63 61 99 65 99 92C99 111 80 119 65 119M65 119C89 118 101 132 101 149C101 180 64 187 45 168",
  "M85 176V69L43 141H103",
  "M98 70H49L46 119C62 105 98 111 100 142C106 185 65 188 45 168",
  "M94 77C70 54 45 79 45 125C45 155 49 179 74 179C109 179 109 122 77 121C61 120 51 131 45 143",
  "M44 70H102L60 177",
  "M72 122C39 109 40 69 72 69C104 69 105 109 72 122C33 135 37 179 72 179C107 179 111 137 72 122Z",
  "M98 113C91 132 67 137 52 122C33 104 45 69 71 69C101 69 101 101 98 142C95 171 68 188 46 163"
];
var nixieSerial = 0;
function createNixieDigit() {
  var tube = document.createElement("span");
  tube.className = "flip-digit nixie-digit";
  var id = "nixie-" + (++nixieSerial);
  var envelopePath = "M16 200V67C16 31 37 11 72 11C107 11 128 31 128 67V200C128 211 112 216 72 216C32 216 16 211 16 200Z";
  var wires = NIXIE_WIRE_PATHS.map(function (path, digit) {
    return '<path class="nixie-numeral" id="' + id + '-wire-' + digit + '" d="' + path + '"/>';
  }).join("");
  // Actual tubes contain the unlit numerals too, at slightly different depths.
  var unlit = NIXIE_WIRE_PATHS.map(function (_, digit) {
    return '<use href="#' + id + '-wire-' + digit + '" transform="translate(' + ((digit - 4.5) * .28) + ',' + ((digit - 4.5) * .38) + ')"/>';
  }).join("");
  var contacts = [37, 51, 65, 79, 93, 107].map(function (x) {
    return '<rect x="' + x + '" y="216" width="3.8" height="20" rx="1.2" fill="url(#' + id + '-metal)"/><path d="M' + (x + 1) + ' 219v14" stroke="#e7e4ce" stroke-opacity=".26" stroke-width=".65"/>';
  }).join("");
  tube.innerHTML = `<svg class="nixie-tube" viewBox="0 0 144 240" role="img" aria-label="0">
    <defs>
      ${wires}
      <linearGradient id="${id}-metal"><stop stop-color="#181d20"/><stop offset=".22" stop-color="#b7b3a2"/><stop offset=".42" stop-color="#555c5b"/><stop offset=".66" stop-color="#dfdbcb"/><stop offset="1" stop-color="#292e30"/></linearGradient>
      <linearGradient id="${id}-interior" x2="0" y2="1"><stop class="nixie-interior-top"/><stop class="nixie-interior-middle" offset=".35"/><stop class="nixie-interior-bottom" offset="1"/></linearGradient>
      <linearGradient id="${id}-cover-shading"><stop stop-color="#abc6d3" stop-opacity=".18"/><stop offset=".12" stop-color="#d4e5ed" stop-opacity=".025"/><stop offset=".55" stop-color="#fff" stop-opacity=".005"/><stop offset=".88" stop-color="#d3e3e6" stop-opacity=".035"/><stop offset="1" stop-color="#c7d9e0" stop-opacity=".24"/></linearGradient>
      <linearGradient id="${id}-rim"><stop stop-color="#e4f3f6" stop-opacity=".45"/><stop offset=".24" stop-color="#a1bdc7" stop-opacity=".11"/><stop offset=".76" stop-color="#9cb8c5" stop-opacity=".11"/><stop offset="1" stop-color="#dceff3" stop-opacity=".5"/></linearGradient>
      <linearGradient id="${id}-reflection" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".56"/><stop offset=".25" stop-color="#e6f3ff" stop-opacity=".25"/><stop offset=".73" stop-color="#e6f3ff" stop-opacity=".035"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}-base" x2="0" y2="1"><stop stop-color="#555350"/><stop offset=".15" stop-color="#171b1d"/><stop offset=".63" stop-color="#292d2e"/><stop offset="1" stop-color="#090b0c"/></linearGradient>
      <pattern id="${id}-mesh" width="7" height="12" patternUnits="userSpaceOnUse"><path d="M3.5 0L7 2V6L3.5 8L0 6V2ZM0 6V10L3.5 12L7 10V6" fill="none" stroke="#78807c" stroke-width=".5"/></pattern>
      <clipPath id="${id}-inside"><path d="${envelopePath}"/></clipPath>
      <filter id="${id}-grain"><feTurbulence baseFrequency=".82" numOctaves="3" seed="8" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".065"/></feComponentTransfer></filter>
      <filter id="${id}-soft" x="-60%" y="-40%" width="220%" height="180%"><feGaussianBlur stdDeviation="1.8"/></filter>
      <filter id="${id}-bloom" x="-90%" y="-50%" width="280%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
    </defs>
    <g class="nixie-base"><ellipse cx="72" cy="231" rx="62" ry="7" fill="#000" opacity=".35"/>
    ${contacts}</g>
    <path class="nixie-envelope" d="${envelopePath}" fill="url(#${id}-interior)" stroke="#151c20" stroke-width="2"/>
    <g clip-path="url(#${id}-inside)">
      <rect class="nixie-envelope" x="18" y="13" width="108" height="200" filter="url(#${id}-grain)" opacity=".6"/>
      <ellipse class="nixie-bloom" cx="72" cy="133" rx="39" ry="60" filter="url(#${id}-bloom)"/>
      <path d="M33 55H111V194H33Z" fill="url(#${id}-mesh)" opacity=".36"/>
      <path class="nixie-uprights" d="M35 54V198M109 54V198" stroke="url(#${id}-metal)" stroke-width="2.2"/>
      <path d="M31 61Q72 53 113 61M29 193Q72 201 115 193" fill="none" stroke="#8e8c78" stroke-opacity=".42" stroke-width="2.4"/>
      <g class="nixie-inactive">${unlit}</g>
      <path d="M47 199L49 176M58 199L60 177M69 199V178M80 199L78 178M92 199L94 176" stroke="#797467" stroke-opacity=".6" stroke-width="1" fill="none"/>
      <g class="nixie-active">
        <use class="nixie-wire-edge" href="#${id}-wire-0"/>
        <use class="nixie-halo" href="#${id}-wire-0" filter="url(#${id}-bloom)"/>
        <use class="nixie-gas" href="#${id}-wire-0" filter="url(#${id}-soft)"/>
        <use class="nixie-lit-wire" href="#${id}-wire-0"/>
        <use class="nixie-core" href="#${id}-wire-0"/>
      </g>
      <path d="M31 62H113V191H31Z" fill="url(#${id}-mesh)" opacity=".12"/>
      <g class="nixie-reflections"><path class="nixie-cover" d="${envelopePath}" fill="url(#${id}-cover-shading)"/>
      <path d="M23 170V67C23 39 37 22 58 19C40 29 34 42 34 69V174Z" fill="url(#${id}-reflection)"/>
      <path d="M116 62C114 43 103 26 84 22C108 26 122 43 122 65V180L117 187Z" fill="#d6eaff" opacity=".065"/>
      <path d="M43 26Q72 14 96 28" fill="none" stroke="#f4fcff" stroke-width="1.6" opacity=".22"/>
      <path d="M20 71V188" stroke="#e4f4f8" stroke-opacity=".2" stroke-width=".6"/>
      <path d="M124 81V186" stroke="#e4f4f8" stroke-opacity=".25" stroke-width=".7"/>
      <path d="M28 201Q72 212 116 202" fill="none" stroke="#e7f0ed" stroke-opacity=".18" stroke-width="2.3"/>
      <path d="M22 196Q71 207 122 197" fill="none" stroke="#d3e2d9" stroke-width=".8" opacity=".16"/></g>
    </g>
    <path class="nixie-envelope nixie-rim" d="${envelopePath}" fill="none" stroke="url(#${id}-rim)" stroke-width="1.1"/>
    <g class="nixie-base"><ellipse cx="72" cy="205" rx="51" ry="7" fill="#090c0c" stroke="#78786b" stroke-opacity=".38"/>
    <path d="M24 205Q72 216 120 205V217Q72 231 24 217Z" fill="url(#${id}-base)" stroke="#111719" stroke-width=".8"/>
    <path d="M26 213Q72 225 118 213" fill="none" stroke="#a0a29a" stroke-opacity=".25" stroke-width=".8"/>
    <path d="M33 210v8M111 210v8" stroke="#0a0c0d" stroke-width="2"/>
    <text x="72" y="220" text-anchor="middle" font-family="monospace" font-size="5" letter-spacing="1" fill="#a29e89" opacity=".65">N - 14</text></g>
  </svg>`;
  return tube;
}
function updateNixieDigit(tube, digit) {
  if (!/^[0-9]$/.test(digit)) return;
  if (tube.dataset.digit === digit) return;
  tube.dataset.digit = digit;
  var svg = tube.querySelector("svg");
  svg.setAttribute("aria-label", digit);
  var first = svg.querySelector(".nixie-numeral").id;
  var target = "#" + first.replace(/wire-0$/, "wire-" + digit);
  svg.querySelectorAll(".nixie-active use").forEach(function (wire) { wire.setAttribute("href", target); });
}
function createNixieSeparator() {
  var colon = document.createElement("span");
  colon.className = "nixie-separator";
  colon.setAttribute("aria-hidden", "true");
  colon.innerHTML = '<svg viewBox="0 0 28 240"><g class="nixie-colon-enclosure"><rect x="5" y="80" width="18" height="96" rx="9" fill="#0b1014" stroke="#a9c4d3" stroke-opacity=".22"/><path d="M10 90V164" stroke="#e4f2ff" stroke-opacity=".12" stroke-width="2"/><path d="M12 108V150M16 108V150" stroke="#5e6664" stroke-width="1"/></g><circle class="nixie-colon-glow" cx="14" cy="105" r="4"/><circle class="nixie-colon-glow" cx="14" cy="151" r="4"/><circle class="nixie-colon-core" cx="14" cy="105" r="1.3"/><circle class="nixie-colon-core" cx="14" cy="151" r="1.3"/></svg>';
  return colon;
}
function renderNixieClock(display, text) {
  var details = clockSetting("nixieDetails", "true") !== "false";
  display.classList.toggle("nixie-no-details", !details);
  var digits = text.replace(/:/g, "");
  if (display.querySelectorAll(".nixie-digit").length !== digits.length) {
    display.replaceChildren();
    text.split("").forEach(function (character) {
      display.appendChild(character === ":" ? createNixieSeparator() : createNixieDigit());
    });
  }
  var box = details ? [0, 0, 144, 240] : [24, 53, 96, 151];
  var height = 108 * box[3] / box[2];
  display.querySelectorAll(".nixie-digit").forEach(function (tube, index) {
    tube.querySelector("svg").setAttribute("viewBox", box.join(" "));
    tube.style.height = height + "px";
    updateNixieDigit(tube, digits[index]);
  });
  display.querySelectorAll(".nixie-separator").forEach(function (colon) {
    colon.style.height = height + "px";
    colon.querySelector("svg").setAttribute("viewBox", [0, box[1], 28, box[3]].join(" "));
  });
}

function syncClockNixieSettings() {
  var row = document.getElementById("clockNixieDetailsRow");
  if (row) row.classList.toggle("d-none", clockSetting("font", "flip") !== "nixie");
  var control = document.getElementById("clockNixieDetails");
  if (control) control.checked = clockSetting("nixieDetails", "true") !== "false";
}
function changeClockNixieDetails(checked) {
  localStorage.setItem(smdKey("nixieDetails"), checked ? "true" : "false");
  renderClock();
}
