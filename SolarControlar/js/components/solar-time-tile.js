// <solar-time-tile power-time="HH:MM:SS">; renders the sample, never a wall clock.
(function () {
  'use strict';
  class SolarTimeTile extends SolarTile {
    static get observedAttributes() { return ['power-time']; }
    static get valueAttribute() { return 'power-time'; }
    static get css() { return `
      solar-time-tile .split-flap { gap: 1cqw; }
      solar-time-tile .flap-card { background: var(--bs-body-color); color: var(--solar-clock-ink, var(--bs-body-bg)); font-size: 16cqw; font-weight: 300; width: .75em; text-align: center; border-radius: 4px; padding: .18em 0; box-shadow: 0 2px 8px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.06); position: relative; letter-spacing: .06em; }
      solar-time-tile .flap-card::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: rgba(0,0,0,.45); box-shadow: 0 1px 2px rgba(255,255,255,.04); }
      solar-time-tile .flap-sep { font-size: 16cqw; font-weight: 700; color: var(--bs-body-color); margin: 0; position: relative; top: -.06em; }
    `; }
    static get markup() { return `
      <div class="split-flap d-flex align-items-center">
        <div class="flap-card" id="h1"></div><div class="flap-card" id="h2"></div><div class="flap-sep">:</div>
        <div class="flap-card" id="m1"></div><div class="flap-card" id="m2"></div><div class="flap-sep">:</div>
        <div class="flap-card" id="s1"></div><div class="flap-card" id="s2"></div>
      </div>
      <span class="tile-label small text-body text-uppercase fw-bold">Latest Time</span>
    `; }
    _render() {
      var parts = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(this.value || '');
      var digits = parts && +parts[1] < 24 && +parts[2] < 60 && +parts[3] < 60 ? parts.slice(1).join('') : '------';
      this.querySelectorAll('.flap-card').forEach(function (el, index) { el.textContent = digits[index]; });
    }
  }
  if (!customElements.get('solar-time-tile')) customElements.define('solar-time-tile', SolarTimeTile);
})();
