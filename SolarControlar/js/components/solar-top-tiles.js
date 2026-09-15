// <solar-top-tiles> — displays date, time (split-flap), and battery charge.
//
// Attributes:
//   power-date  — ISO date string (e.g. "2026-09-15")
//   power-time  — time string (e.g. "14:30:00")
//   battery-level — battery charge percentage (0-100), or empty for unknown
//
// The component updates its own clock every second when connected.

const solarTopTilesSheet = SmdStyles.sheetFor(`
  :host {
    display: block;
    margin-bottom: 1rem;
  }
  .top-tiles {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.75rem;
  }
  .tile {
    background: var(--solar-tile-bg, #303030);
    border: 1px solid var(--solar-tile-border, #495057);
    border-radius: var(--solar-tile-radius, 0.5rem);
    padding: var(--solar-tile-padding, 1rem);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 120px;
  }
  .tile-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--bs-secondary-color, #adb5bd);
    font-weight: 700;
    margin-top: 0.5rem;
  }

  /* Date tile */
  .date-dd {
    font-size: 3rem;
    font-weight: 200;
    color: var(--bs-body-color, #eee);
    line-height: 1;
    margin-bottom: 0.4rem;
  }
  .date-meta {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }
  .date-mon {
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--bs-secondary-color, #adb5bd);
    letter-spacing: 0.04em;
  }
  .date-dot {
    width: 4px;
    height: 4px;
    background: var(--bs-secondary-color, #adb5bd);
    border-radius: 50%;
    flex-shrink: 0;
  }
  .date-yyy {
    font-size: 1.2rem;
    font-weight: 300;
    color: var(--bs-secondary-color, #adb5bd);
    letter-spacing: 0.06em;
  }

  /* Split-flap time */
  .split-flap {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .flap-card {
    background: linear-gradient(180deg, #4a5568 0%, #2d3748 48%, #1a202c 52%, #171923 100%);
    color: #f7fafc;
    font-size: 2rem;
    font-weight: 300;
    width: 1.5rem;
    text-align: center;
    border-radius: 4px;
    padding: 0.35rem 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06);
    position: relative;
    letter-spacing: 0.06em;
  }
  .flap-card::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 1px;
    background: rgba(0,0,0,0.45);
    box-shadow: 0 1px 2px rgba(255,255,255,0.04);
  }
  .flap-sep {
    font-size: 1.8rem;
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

  /* Battery tile */
  .battery-icon {
    position: relative;
    width: 56px;
    height: 28px;
    border: 3px solid var(--bs-secondary-color, #adb5bd);
    border-radius: 4px;
    flex-shrink: 0;
    margin-bottom: 0.4rem;
  }
  .battery-icon::after {
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
  .battery-fill {
    position: absolute;
    top: 3px;
    left: 3px;
    bottom: 3px;
    border-radius: 1px;
    transition: width 0.3s, background 0.3s;
  }
  .battery-info {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--bs-body-color, #eee);
  }

  /* Hide when no data */
  :host([no-data]) .top-tiles { display: none; }

  @media (max-width: 480px) {
    .date-dd { font-size: 2.2rem; }
    .date-mon, .date-yyy { font-size: 1rem; }
    .flap-card { font-size: 1.5rem; width: 1.2rem; padding: 0.25rem 0; }
    .flap-sep { font-size: 1.4rem; }
    .tile { min-height: 90px; padding: 0.75rem; }
    .battery-info { font-size: 1.1rem; }
  }
`);

const solarTopTilesTemplate = document.createElement("template");
solarTopTilesTemplate.innerHTML = `
  <div class="top-tiles">
    <div class="tile">
      <div class="date-dd" id="dateDay"></div>
      <div class="date-meta">
        <span class="date-mon" id="dateMonth"></span>
        <span class="date-dot"></span>
        <span class="date-yyy" id="dateYear"></span>
      </div>
      <span class="tile-label">Date</span>
    </div>
    <div class="tile">
      <div class="split-flap">
        <div class="flap-card" id="h1"></div>
        <div class="flap-card" id="h2"></div>
        <div class="flap-sep">:</div>
        <div class="flap-card" id="m1"></div>
        <div class="flap-card" id="m2"></div>
        <div class="flap-sep">:</div>
        <div class="flap-card" id="s1"></div>
        <div class="flap-card" id="s2"></div>
      </div>
      <span class="tile-label">Local Time</span>
    </div>
    <div class="tile">
      <div class="battery-icon">
        <div class="battery-fill" id="batteryFill"></div>
      </div>
      <div class="battery-info" id="batteryPercent"></div>
      <span class="tile-label">Battery Charge</span>
    </div>
  </div>
`;

class SolarTopTiles extends HTMLElement {
  static get observedAttributes() {
    return ["power-date", "power-time", "battery-level", "no-data"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    SmdStyles.adoptStyles(this.shadowRoot, solarTopTilesSheet);
    this.shadowRoot.appendChild(solarTopTilesTemplate.content.cloneNode(true));
    this._clockTimer = null;
  }

  connectedCallback() {
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
    var root = this.shadowRoot;
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, "0");
    var mm = String(now.getMinutes()).padStart(2, "0");
    var ss = String(now.getSeconds()).padStart(2, "0");
    root.getElementById("h1").textContent = hh[0];
    root.getElementById("h2").textContent = hh[1];
    root.getElementById("m1").textContent = mm[0];
    root.getElementById("m2").textContent = mm[1];
    root.getElementById("s1").textContent = ss[0];
    root.getElementById("s2").textContent = ss[1];
  }

  _render() {
    var root = this.shadowRoot;
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
        root.getElementById("dateDay").textContent = parts[2];
        root.getElementById("dateMonth").textContent = months[parseInt(parts[1], 10) - 1] || "";
        root.getElementById("dateYear").textContent = parts[0];
      }
    }

    // Clock from server time
    if (timeStr) {
      var tParts = timeStr.split(":");
      if (tParts.length >= 3) {
        root.getElementById("h1").textContent = tParts[0][0];
        root.getElementById("h2").textContent = tParts[0][1];
        root.getElementById("m1").textContent = tParts[1][0];
        root.getElementById("m2").textContent = tParts[1][1];
        root.getElementById("s1").textContent = tParts[2][0];
        root.getElementById("s2").textContent = tParts[2][1];
      }
    }

    // Battery
    var fill = root.getElementById("batteryFill");
    var pct = root.getElementById("batteryPercent");
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
