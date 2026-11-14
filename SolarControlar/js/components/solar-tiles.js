// <solar-tiles> arranges three independent tiles. Use stacked for one column,
// or --solar-tiles-columns for a layout supplied by the containing application.
(function () {
  'use strict';
  class SolarTiles extends HTMLElement {
    static get observedAttributes() { return ['power-date','power-time','battery-level','no-data']; }
    connectedCallback() {
      SolarTile.addStyle('solar-tiles-style', `
        solar-tiles { display: block; min-width: 0; }
        solar-tiles .solar-tiles__grid { display: grid; grid-template-columns: repeat(var(--solar-tiles-columns, 3), minmax(0, 1fr)); grid-auto-rows: 1fr; gap: clamp(.25rem, 1vw, 1rem); }
        solar-tiles[stacked] { --solar-tiles-columns: 1; }
        solar-tiles[no-data] .solar-tiles__grid { display: none; }
      `);
      if (!this._built) {
        this.innerHTML = '<div class="solar-tiles__grid"><solar-date-tile></solar-date-tile><solar-time-tile></solar-time-tile><solar-battery-tile></solar-battery-tile></div>';
        this._built = true;
      }
      this._render();
    }
    attributeChangedCallback() { if (this._built) this._render(); }
    _render() {
      var date = this.getAttribute('power-date');
      var time = this.getAttribute('power-time');
      if (!date && !time) {
        if (!this.hasAttribute('no-data')) this.setAttribute('no-data', '');
        return;
      }
      if (this.hasAttribute('no-data')) this.removeAttribute('no-data');
      this.querySelector('solar-date-tile').value = date;
      this.querySelector('solar-time-tile').value = time;
      this.querySelector('solar-battery-tile').value = this.getAttribute('battery-level');
    }
  }
  if (!customElements.get('solar-tiles')) customElements.define('solar-tiles', SolarTiles);
})();
