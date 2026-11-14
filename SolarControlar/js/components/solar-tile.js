// Shared light-DOM behaviour for the three independently usable Solar tiles.
(function () {
  'use strict';
  class SolarTile extends HTMLElement {
    static addStyle(id, css) {
      if (document.getElementById(id)) return;
      var style = document.createElement('style');
      style.id = id;
      style.textContent = css;
      document.head.appendChild(style);
    }

    connectedCallback() {
      var tags = ['solar-date-tile', 'solar-time-tile', 'solar-battery-tile'];
      SolarTile.addStyle('solar-tile-style', `
        ${tags.join(', ')} { display: flex; min-width: 0; }
        ${tags.map(tag => tag + ' .tile').join(', ')} { flex: 1; min-width: 0; width: 100%; container-type: inline-size; padding: clamp(.25rem, 1vw, 1rem); color: var(--solar-card-ink, var(--bs-body-color)); --bs-body-color: var(--solar-card-ink); --bs-body-color-rgb: var(--solar-card-ink-rgb); }
        ${tags.map(tag => 'body.compact ' + tag + ' .tile').join(', ')} { padding: clamp(.125rem, .5vw, .5rem); }
        ${tags.map(tag => tag + ' .tile-label').join(', ')} { font-size: 7cqw; line-height: 1.2; white-space: nowrap; margin-top: 4cqw; }
      `);
      SolarTile.addStyle(this.localName + '-style', this.constructor.css);
      if (!this._built) {
        this.innerHTML = '<div class="tile card smd-card border rounded-4 d-flex flex-column align-items-center justify-content-center text-center">' + this.constructor.markup + '</div>';
        this._built = true;
      }
      this._render();
    }

    attributeChangedCallback() { if (this._built) this._render(); }
    get value() { return this.getAttribute(this.constructor.valueAttribute); }
    set value(value) {
      if (value === null || value === undefined) this.removeAttribute(this.constructor.valueAttribute);
      else if (this.value !== String(value)) this.setAttribute(this.constructor.valueAttribute, String(value));
    }
  }
  window.SolarTile = SolarTile;
})();
