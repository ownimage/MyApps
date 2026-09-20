// <solar-top-tiles> — displays date, time (split-flap), and battery charge.
// Light DOM; styling lives in SolarControlar/css/styles.css.
//
// Attributes:
//   power-date  — ISO date string (e.g. "2026-09-15")
//   power-time  — time string (e.g. "14:30:00")
//   battery-level — battery charge percentage (0-100), or empty for unknown
//
// The component updates its own clock every second when connected.

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