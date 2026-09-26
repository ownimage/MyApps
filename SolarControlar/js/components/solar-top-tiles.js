// <solar-top-tiles> — displays date, time (split-flap), and battery charge.
//
// Attributes:
//   power-date  — ISO date string (e.g. "2026-09-15")
//   power-time  — time string (e.g. "14:30:00")
//   battery-level — battery charge percentage (0-100), or empty for unknown
//
// The component updates its own clock every second when connected.

(function (global) {
  if (global.document.getElementById("solar-top-tiles-style")) return;
  var style = global.document.createElement("style");
  style.id = "solar-top-tiles-style";
  style.textContent = `
    solar-top-tiles { display: block; margin-bottom: 1rem; }
    solar-top-tiles .tile { min-height: 120px; padding: 1rem; }
    body.compact solar-top-tiles .tile { padding: 0.5rem; }
    solar-top-tiles .date-dd {
      font-size: var(--smd-type-h1, 2em);
      line-height: 1;
    }
    solar-top-tiles .date-mon,
    solar-top-tiles .date-yyy {
      font-size: var(--smd-type-h2, 1.25em);
    }
    solar-top-tiles .date-mon { letter-spacing: 0.04em; }
    solar-top-tiles .date-yyy { letter-spacing: 0.06em; }
    solar-top-tiles .date-dot {
      width: 4px;
      height: 4px;
      background: var(--bs-secondary-color, #adb5bd);
      border-radius: 50%;
    }
    solar-top-tiles .flap-card {
      background: linear-gradient(180deg, #4a5568 0%, #2d3748 48%, #1a202c 52%, #171923 100%);
      color: #f7fafc;
      font-size: var(--smd-type-h1, 2em);
      font-weight: 300;
      width: 0.75em;
      text-align: center;
      border-radius: 4px;
      padding: 0.35rem 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06);
      position: relative;
      letter-spacing: 0.06em;
    }
    solar-top-tiles .flap-card::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      height: 1px;
      background: rgba(0,0,0,0.45);
      box-shadow: 0 1px 2px rgba(255,255,255,0.04);
    }
    solar-top-tiles .flap-sep {
      font-size: var(--smd-type-h1, 1.8em);
      font-weight: 700;
      color: #fc8181;
      margin: 0 0.06rem;
      position: relative;
      top: -0.12rem;
      animation: solarFlapPulse 1s ease-in-out infinite;
    }
    @keyframes solarFlapPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.35; }
    }
    solar-top-tiles .battery-icon {
      position: relative;
      width: 56px;
      height: 28px;
      border: 3px solid var(--bs-secondary-color, #adb5bd);
      border-radius: 4px;
    }
    solar-top-tiles .battery-icon::after {
      content: '';
      position: absolute;
      right: -7px;
      top: 50%;
      transform: translateY(-50%);
      width: 4px;
      height: 10px;
      background: var(--bs-secondary-color, #adb5bd);
      border-radius: 0 2px 2px 0;
    }
    solar-top-tiles .battery-fill {
      position: absolute;
      top: 3px;
      left: 3px;
      bottom: 3px;
      border-radius: 1px;
      transition: width 0.3s, background 0.3s;
    }
    solar-top-tiles .battery-info {
      font-size: var(--smd-type-h2, 1.3em);
    }
    solar-top-tiles[no-data] .top-tiles { display: none; }
    @media (max-width: 480px) {
      solar-top-tiles .date-dd { font-size: calc(var(--smd-type-h1, 2em) * 0.7333); }
      solar-top-tiles .date-mon,
      solar-top-tiles .date-yyy { font-size: calc(var(--smd-type-h2, 1.25em) * 0.8333); }
      solar-top-tiles .flap-card {
        font-size: calc(var(--smd-type-h1, 2em) * 0.75);
        width: 0.8em;
        padding: 0.25rem 0;
      }
      solar-top-tiles .flap-sep { font-size: calc(var(--smd-type-h1, 2em) * 0.7); }
      solar-top-tiles .tile { min-height: 90px; padding: 0.75rem; }
      body.compact solar-top-tiles .tile { padding: 0.5rem; }
      solar-top-tiles .battery-info { font-size: calc(var(--smd-type-h2, 1.3em) * 0.8462); }
    }
  `;
  global.document.head.appendChild(style);
})(window);

const solarTopTilesTemplate = document.createElement("template");
solarTopTilesTemplate.innerHTML = `
  <div class="top-tiles row row-cols-1 row-cols-md-3 g-3">
    <div class="tile card bg-body-tertiary border rounded-4 h-100 d-flex flex-column align-items-center justify-content-center text-center p-3">
      <div class="date-dd display-1 fw-lighter lh-1 mb-1" id="dateDay"></div>
      <div class="date-meta d-flex align-items-center justify-content-center gap-2">
        <span class="date-mon text-secondary fw-bold" id="dateMonth"></span>
        <span class="date-dot flex-shrink-0"></span>
        <span class="date-yyy text-secondary fw-light" id="dateYear"></span>
      </div>
      <span class="tile-label small text-secondary text-uppercase fw-bold mt-2">Date</span>
    </div>
    <div class="tile card bg-body-tertiary border rounded-4 h-100 d-flex flex-column align-items-center justify-content-center text-center p-3">
      <div class="split-flap d-flex align-items-center gap-1">
        <div class="flap-card" id="h1"></div>
        <div class="flap-card" id="h2"></div>
        <div class="flap-sep">:</div>
        <div class="flap-card" id="m1"></div>
        <div class="flap-card" id="m2"></div>
        <div class="flap-sep">:</div>
        <div class="flap-card" id="s1"></div>
        <div class="flap-card" id="s2"></div>
      </div>
      <span class="tile-label small text-secondary text-uppercase fw-bold mt-2">Local Time</span>
    </div>
    <div class="tile card bg-body-tertiary border rounded-4 h-100 d-flex flex-column align-items-center justify-content-center text-center p-3">
      <div class="battery-icon flex-shrink-0 mb-1">
        <div class="battery-fill" id="batteryFill"></div>
      </div>
      <div class="battery-info h5 fw-bold mb-0 text-body" id="batteryPercent"></div>
      <span class="tile-label small text-secondary text-uppercase fw-bold mt-2">Battery Charge</span>
    </div>
  </div>
`;

class SolarTopTiles extends HTMLElement {
  static get observedAttributes() {
    return ["power-date", "power-time", "battery-level", "no-data"];
  }

  constructor() {
    super();
    this._clockTimer = null;
  }

  connectedCallback() {
    if (!this.querySelector(".top-tiles")) {
      this.appendChild(solarTopTilesTemplate.content.cloneNode(true));
    }
    this._render();
    this._startClock();
  }

  disconnectedCallback() {
    this._stopClock();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  _startClock() {
    this._stopClock();
    var self = this;
    this._clockTimer = setInterval(function () { self._updateClock(); }, 1000);
  }

  _stopClock() {
    if (this._clockTimer) {
      clearInterval(this._clockTimer);
      this._clockTimer = null;
    }
  }

  _updateClock() {
    var root = this;
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, "0");
    var mm = String(now.getMinutes()).padStart(2, "0");
    var ss = String(now.getSeconds()).padStart(2, "0");
    root.querySelector("#h1").textContent = hh[0];
    root.querySelector("#h2").textContent = hh[1];
    root.querySelector("#m1").textContent = mm[0];
    root.querySelector("#m2").textContent = mm[1];
    root.querySelector("#s1").textContent = ss[0];
    root.querySelector("#s2").textContent = ss[1];
  }

  _render() {
    var root = this;
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    var dateStr = this.getAttribute("power-date");
    var timeStr = this.getAttribute("power-time");
    var batteryLevel = this.getAttribute("battery-level");

    if (!dateStr && !timeStr) {
      this.setAttribute("no-data", "");
      return;
    }
    this.removeAttribute("no-data");

    // Date
    if (dateStr) {
      var parts = dateStr.split("-");
      if (parts.length === 3) {
        root.querySelector("#dateDay").textContent = parts[2];
        root.querySelector("#dateMonth").textContent = months[parseInt(parts[1], 10) - 1] || "";
        root.querySelector("#dateYear").textContent = parts[0];
      }
    }

    // Clock from server time
    if (timeStr) {
      var tParts = timeStr.split(":");
      if (tParts.length >= 3) {
        root.querySelector("#h1").textContent = tParts[0][0];
        root.querySelector("#h2").textContent = tParts[0][1];
        root.querySelector("#m1").textContent = tParts[1][0];
        root.querySelector("#m2").textContent = tParts[1][1];
        root.querySelector("#s1").textContent = tParts[2][0];
        root.querySelector("#s2").textContent = tParts[2][1];
      }
    }

    // Battery
    var fill = root.querySelector("#batteryFill");
    var pct = root.querySelector("#batteryPercent");
    var level = batteryLevel !== null ? parseFloat(batteryLevel) : NaN;
    if (isNaN(level) || level < 0 || level > 100) {
      fill.style.width = "0%";
      fill.style.background = "var(--bs-secondary-color, #adb5bd)";
      pct.textContent = "Unknown";
    } else {
      fill.style.width = Math.max(0, level - 6) + "%";
      if (level <= 20) fill.style.background = "#e53e3e";
      else if (level <= 50) fill.style.background = "#dd6b20";
      else fill.style.background = "#38a169";
      pct.textContent = Math.round(level) + "%";
    }
  }
}

customElements.define("solar-top-tiles", SolarTopTiles);