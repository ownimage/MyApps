// <solar-top-tiles> — displays date, time (split-flap), and battery charge.
//
// Attributes:
//   power-date  — ISO date string (e.g. "2026-09-15")
//   power-time  — time string (e.g. "14:30:00")
//   battery-level — battery charge percentage (0-100), or empty for unknown
//
// Date/time are the latest fetched reading; no wall-clock timer runs.

(function (global) {
  if (global.document.getElementById("solar-top-tiles-style")) return;
  var style = global.document.createElement("style");
  style.id = "solar-top-tiles-style";
  style.textContent = `
    solar-top-tiles { display: block; margin-bottom: 1rem; padding-top: var(--smd-nav-content-gap, 1rem); }
    solar-top-tiles .top-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 1rem; }
    @media (max-width: 991px) { solar-top-tiles .top-tiles { grid-template-columns: 1fr; } }
    solar-top-tiles .tile { min-width: 0; min-height: 120px; padding: 1rem; }
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
      background: var(--bs-body-color);
      border-radius: 50%;
    }
    solar-top-tiles .flap-card {
      /* Invert the accessible theme ink/surface for the clock face. */
      background: var(--bs-body-color);
      color: var(--solar-clock-ink, var(--bs-body-bg));
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
      color: var(--bs-body-color);
      margin: 0 0.06rem;
      position: relative;
      top: -0.12rem;
    }
    solar-top-tiles .battery-icon {
      position: relative;
      width: 56px;
      height: 28px;
      border: 3px solid var(--bs-body-color);
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
      background: var(--bs-body-color);
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
  <div class="top-tiles">
    <div class="tile card smd-card border rounded-4 d-flex flex-column align-items-center justify-content-center text-center p-3">
      <div class="date-dd display-1 fw-lighter lh-1 mb-1" id="dateDay"></div>
      <div class="date-meta d-flex align-items-center justify-content-center gap-2">
        <span class="date-mon text-body fw-bold" id="dateMonth"></span>
        <span class="date-dot flex-shrink-0"></span>
        <span class="date-yyy text-body fw-light" id="dateYear"></span>
      </div>
      <span class="tile-label small text-body text-uppercase fw-bold mt-2">Latest Date</span>
    </div>
    <div class="tile card smd-card border rounded-4 d-flex flex-column align-items-center justify-content-center text-center p-3">
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
      <span class="tile-label small text-body text-uppercase fw-bold mt-2">Latest Time</span>
    </div>
    <div class="tile card smd-card border rounded-4 d-flex flex-column align-items-center justify-content-center text-center p-3">
      <div class="battery-icon flex-shrink-0 mb-1">
        <div class="battery-fill" id="batteryFill"></div>
      </div>
      <div class="battery-info h5 fw-bold mb-0 text-body" id="batteryPercent"></div>
      <span class="tile-label small text-body text-uppercase fw-bold mt-2">Battery Charge</span>
    </div>
  </div>
`;

class SolarTopTiles extends HTMLElement {
  static get observedAttributes() {
    return ["power-date", "power-time", "battery-level", "no-data"];
  }

  connectedCallback() {
    if (!this.querySelector(".top-tiles")) {
      this.appendChild(solarTopTilesTemplate.content.cloneNode(true));
    }
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected && this.querySelector(".top-tiles")) this._render();
  }

  _render() {
    var root = this;
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    var dateStr = this.getAttribute("power-date");
    var timeStr = this.getAttribute("power-time");
    var batteryLevel = this.getAttribute("battery-level");

    if (!dateStr && !timeStr) {
      // `no-data` is an OBSERVED attribute, so setting it from inside _render()
      // re-entered attributeChangedCallback -> _render() -> setAttribute ... and
      // blew the stack with `RangeError: Maximum call stack size exceeded` on
      // EVERY load without data (e.g. before the API answers). Only mutate when
      // the state actually changes.
      if (!this.hasAttribute("no-data")) this.setAttribute("no-data", "");
      return;
    }
    if (this.hasAttribute("no-data")) this.removeAttribute("no-data");

    // Date
    if (dateStr) {
      var parts = dateStr.split("-");
      if (parts.length === 3) {
        root.querySelector("#dateDay").textContent = parts[2];
        root.querySelector("#dateMonth").textContent = months[parseInt(parts[1], 10) - 1] || "";
        root.querySelector("#dateYear").textContent = parts[0];
      }
    }

    // Latest fetched sample time (also used by the Now table)
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
      fill.style.background = "var(--bs-body-color)";
      pct.textContent = "Unknown";
    } else {
      fill.style.width = Math.max(0, level - 6) + "%";
      if (level <= 20) fill.style.background = "var(--solar-card-danger)";
      else if (level <= 50) fill.style.background = "var(--solar-card-warning)";
      else fill.style.background = "var(--solar-card-success)";
      pct.textContent = Math.round(level) + "%";
    }
  }
}

customElements.define("solar-top-tiles", SolarTopTiles);