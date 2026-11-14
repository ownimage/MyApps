// <solar-date-tile power-date="YYYY-MM-DD">; .value is the same date input.
(function () {
  'use strict';
  class SolarDateTile extends SolarTile {
    static get observedAttributes() { return ['power-date']; }
    static get valueAttribute() { return 'power-date'; }
    static get css() { return `
      solar-date-tile .date-dd { font-size: 30cqw; line-height: 1; margin-bottom: 2cqw; }
      solar-date-tile .date-mon, solar-date-tile .date-yyy { font-size: 13cqw; }
      solar-date-tile .date-mon { letter-spacing: .04em; }
      solar-date-tile .date-yyy { letter-spacing: .06em; }
      solar-date-tile .date-meta { gap: 3cqw; white-space: nowrap; }
      solar-date-tile .date-dot { width: 4px; height: 4px; background: var(--bs-body-color); border-radius: 50%; }
    `; }
    static get markup() { return `
      <div class="date-dd fw-lighter lh-1" id="dateDay"></div>
      <div class="date-meta d-flex align-items-center justify-content-center">
        <span class="date-mon text-body fw-bold" id="dateMonth"></span>
        <span class="date-dot flex-shrink-0"></span>
        <span class="date-yyy text-body fw-light" id="dateYear"></span>
      </div>
      <span class="tile-label small text-body text-uppercase fw-bold">Latest Date</span>
    `; }
    _render() {
      var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.value || '');
      var valid = parts && +parts[2] >= 1 && +parts[2] <= 12 && +parts[3] >= 1 && +parts[3] <= 31;
      this.querySelector('#dateDay').textContent = valid ? parts[3] : '--';
      this.querySelector('#dateMonth').textContent = valid ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+parts[2] - 1] : '---';
      this.querySelector('#dateYear').textContent = valid ? parts[1] : '----';
    }
  }
  if (!customElements.get('solar-date-tile')) customElements.define('solar-date-tile', SolarDateTile);
})();
