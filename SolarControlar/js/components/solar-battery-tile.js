// <solar-battery-tile battery-level="0..100">; .value sets the same input.
(function () {
  'use strict';
  class SolarBatteryTile extends SolarTile {
    static get observedAttributes() { return ['battery-level']; }
    static get valueAttribute() { return 'battery-level'; }
    static get css() { return `
      solar-battery-tile .battery-icon { position: relative; width: 42cqw; height: 21cqw; border: 3px solid var(--bs-body-color); border-radius: 4px; margin-bottom: 2cqw; }
      solar-battery-tile .battery-icon::after { content: ''; position: absolute; right: -7px; top: 50%; transform: translateY(-50%); width: 4px; height: 10px; background: var(--bs-body-color); border-radius: 0 2px 2px 0; }
      solar-battery-tile .battery-fill { position: absolute; top: 3px; left: 3px; bottom: 3px; border-radius: 1px; transition: width .3s, background .3s; }
      solar-battery-tile .battery-info { font-size: 18cqw; }
    `; }
    static get markup() { return `
      <div class="battery-icon flex-shrink-0"><div class="battery-fill" id="batteryFill"></div></div>
      <div class="battery-info h5 fw-bold mb-0 text-body" id="batteryPercent"></div>
      <span class="tile-label small text-body text-uppercase fw-bold">Battery Charge</span>
    `; }
    _render() {
      var raw = this.value;
      var level = raw === null || raw.trim() === '' ? NaN : Number(raw);
      var valid = Number.isFinite(level) && level >= 0 && level <= 100;
      var fill = this.querySelector('#batteryFill');
      fill.style.width = valid ? Math.max(0, level - 6) + '%' : '0%';
      fill.style.background = !valid ? 'var(--bs-body-color)' : level <= 20 ? 'var(--solar-card-danger)' : level <= 50 ? 'var(--solar-card-warning)' : 'var(--solar-card-success)';
      this.querySelector('#batteryPercent').textContent = valid ? Math.round(level) + '%' : 'Unknown';
    }
  }
  if (!customElements.get('solar-battery-tile')) customElements.define('solar-battery-tile', SolarBatteryTile);
})();
