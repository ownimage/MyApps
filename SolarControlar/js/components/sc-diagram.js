// Signed instantaneous power in watts. Grid + = import; battery + = discharge;
// solar + = generation; home + = consumption. Null/absent inputs mean no data.
(function () {
  'use strict';
  var flows = ['solar', 'battery', 'grid', 'home'];
  var labels = { solar: 'Solar', battery: 'Batteries', grid: 'Grid', home: 'Home' };
  var icons = {
    solar: '<circle cx="47" cy="13" r="6"/><path d="M47 2v2m0 18v2M36 13h-2m26 0h-2M39 5l-2-2m18 18 2 2M55 5l2-2M11 27h36l6 23H5l6-23Zm-3 11h42M23 27l-2 23m14-23 2 23M29 50v8m-10 0h20"/>',
    battery: '<rect x="8" y="9" width="46" height="20" rx="4"/><rect x="8" y="35" width="46" height="20" rx="4"/><path d="M54 15h4v8h-4m0 18h4v8h-4M17 19h10m-5-5v10m15-5h8M17 45h10m-5-5v10m15-5h8"/>',
    home: '<path d="m5 29 27-23 27 23M12 24v32h40V24M26 56V38h12v18"/><rect x="19" y="27" width="6" height="7" rx="1"/><rect x="39" y="27" width="6" height="7" rx="1"/>',
    grid: '<path d="M27 5h10l14 54M27 5 13 59M20 21h24M16 35h32M23 21l20 14m-2-14L21 35m0 0 25 24m-3-24L18 59M32 5v54M8 59h48M12 21h40M7 35h50M12 21v6m40-6v6M7 35v6m50-6v6"/>',
    inverter: '<rect x="13" y="5" width="38" height="50" rx="6"/><path d="M22 15h20M23 24h7m-7 4h7m5-4c3-6 4 6 7 0M22 48h20m-22 7v5m24-5v5"/><circle cx="32" cy="38" r="4"/>'
  };
  var style = `
    sc-diagram { display: block; container-type: inline-size; color: var(--solar-ink, var(--bs-body-color)); background: var(--bs-body-bg); }
    sc-diagram .sc-diagram__board { display: grid; grid-template-columns: minmax(0, 1fr) .55fr minmax(0, 1fr) .55fr minmax(0, 1fr); grid-template-rows: auto clamp(24px, 6cqw, 52px) auto clamp(24px, 6cqw, 52px) auto; align-items: stretch; width: 100%; max-width: 880px; margin: 0 auto; padding: clamp(8px, 2cqw, 24px); box-sizing: border-box; }
    sc-diagram .sc-diagram__node { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .2em; min-width: 0; padding: .65em .15em; border: 1px solid var(--bs-border-color, currentColor); border-radius: 1em; text-align: center; font-size: clamp(.8rem, 3.2cqw, 1rem); line-height: 1.3; }
    sc-diagram [data-node="solar"] { grid-area: 1 / 3; }
    sc-diagram [data-node="battery"] { grid-area: 3 / 1; }
    sc-diagram [data-node="inverter"] { grid-area: 3 / 3; border: 2px solid currentColor; }
    sc-diagram [data-node="grid"] { grid-area: 3 / 5; }
    sc-diagram [data-node="home"] { grid-area: 5 / 3; }
    sc-diagram .sc-diagram__icon { width: clamp(34px, 9cqw, 64px); height: clamp(34px, 9cqw, 64px); flex: none; }
    sc-diagram [data-node="solar"] .sc-diagram__icon, sc-diagram [data-flow="solar"] { color: var(--solar-series-solar, currentColor); }
    sc-diagram [data-node="battery"] .sc-diagram__icon, sc-diagram [data-flow="battery"] { color: var(--solar-series-battery, currentColor); }
    sc-diagram [data-node="home"] .sc-diagram__icon, sc-diagram [data-flow="home"] { color: var(--solar-series-home, currentColor); }
    sc-diagram [data-node="grid"] .sc-diagram__icon, sc-diagram [data-flow="grid"] { color: var(--solar-series-grid, currentColor); }
    sc-diagram .sc-diagram__label { font-weight: 600; }
    sc-diagram .sc-diagram__value { font-size: 1.12em; font-variant-numeric: tabular-nums; white-space: nowrap; }
    sc-diagram .sc-diagram__state { font-size: .8em; }
    sc-diagram .sc-diagram__link { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 0; }
    sc-diagram [data-flow="solar"] { grid-area: 2 / 3; }
    sc-diagram [data-flow="battery"] { grid-area: 3 / 2; }
    sc-diagram [data-flow="grid"] { grid-area: 3 / 4; }
    sc-diagram [data-flow="home"] { grid-area: 4 / 3; }
    sc-diagram .sc-diagram__link svg { display: block; width: 100%; height: 24px; overflow: visible; }
    sc-diagram .sc-diagram__link--vertical svg { width: 24px; height: 100%; }
    sc-diagram .sc-diagram__track { stroke-width: 2; }
    sc-diagram .sc-diagram__chevron { stroke-width: 3; }
    sc-diagram .sc-diagram__arrow { animation: sc-diagram-horizontal 1.5s linear infinite; }
    sc-diagram .sc-diagram__link--vertical .sc-diagram__arrow { animation-name: sc-diagram-vertical; }
    sc-diagram [data-motion="backward"] .sc-diagram__arrow { animation-direction: reverse; }
    sc-diagram [data-direction="idle"] .sc-diagram__arrow, sc-diagram [data-direction="unknown"] .sc-diagram__arrow { display: none; }
    sc-diagram [data-direction="idle"] .sc-diagram__track, sc-diagram [data-direction="unknown"] .sc-diagram__track { stroke-dasharray: 3 5; }
    @keyframes sc-diagram-horizontal { 0% { transform: translate(9px, 12px); opacity: 0; } 15%, 85% { opacity: 1; } 100% { transform: translate(91px, 12px); opacity: 0; } }
    @keyframes sc-diagram-vertical { 0% { transform: translate(12px, 9px); opacity: 0; } 15%, 85% { opacity: 1; } 100% { transform: translate(12px, 91px); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      sc-diagram .sc-diagram__arrow { animation: none; transform: translate(50px, 12px); }
      sc-diagram .sc-diagram__link--vertical .sc-diagram__arrow { transform: translate(12px, 50px); }
    }
  `;

  function number(value) {
    if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function icon(name) {
    return '<svg class="sc-diagram__icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
  }

  function node(name) {
    return '<div class="sc-diagram__node" data-node="' + name + '">' + icon(name) +
      '<span class="sc-diagram__label">' + (labels[name] || 'Inverter') + '</span>' +
      (name === 'inverter' ? '' : '<strong class="sc-diagram__value"></strong><span class="sc-diagram__state"></span>') + '</div>';
  }

  function link(name) {
    var vertical = name === 'solar' || name === 'home';
    return '<div class="sc-diagram__link' + (vertical ? ' sc-diagram__link--vertical' : '') + '" data-flow="' + name + '" aria-hidden="true">' +
      '<svg viewBox="' + (vertical ? '0 0 24 100' : '0 0 100 24') + '" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
      '<path class="sc-diagram__track" vector-effect="non-scaling-stroke" d="' + (vertical ? 'M12 4v92' : 'M4 12h92') + '"/>' +
      '<g class="sc-diagram__arrow"><path class="sc-diagram__chevron" vector-effect="non-scaling-stroke" d="' + (vertical ? 'm-5-5 5 5 5-5' : 'm-5-5 5 5-5 5') + '"/></g></svg></div>';
  }

  class ScDiagram extends HTMLElement {
    static get observedAttributes() { return flows; }

    connectedCallback() {
      if (!document.getElementById('sc-diagram-styles')) {
        var sheet = document.createElement('style');
        sheet.id = 'sc-diagram-styles';
        sheet.textContent = style;
        document.head.appendChild(sheet);
      }
      if (!this._built) {
        this.innerHTML = '<div class="sc-diagram__board">' + node('inverter') + flows.map(function (name) { return node(name) + link(name); }).join('') + '</div>';
        this._built = true;
      }
      if (!this.hasAttribute('role')) this.setAttribute('role', 'group');
      if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', 'Power flow');
      this._render();
    }

    attributeChangedCallback() { if (this._built) this._render(); }

    get flows() {
      var values = {};
      flows.forEach(name => { values[name] = number(this.getAttribute(name)); });
      return values;
    }

    set flows(values) {
      values = values || {};
      flows.forEach(name => { this[name] = values[name]; });
    }

    _render() {
      var values = this.flows;
      flows.forEach(name => {
        var value = values[name];
        var incoming = name === 'home' ? value < 0 : value > 0;
        var direction = value === null ? 'unknown' : value === 0 ? 'idle' : incoming ? 'incoming' : 'outgoing';
        var nodeEl = this.querySelector('[data-node="' + name + '"]');
        var flowEl = this.querySelector('[data-flow="' + name + '"]');
        var state = value === null ? 'No data' : value === 0 ? 'Idle' : ({
          solar: incoming ? 'Generating' : 'Receiving',
          battery: incoming ? 'Discharging' : 'Charging',
          grid: incoming ? 'Importing' : 'Exporting',
          home: incoming ? 'Supplying' : 'Consuming'
        })[name];
        var watts = value === null ? '\u2014' : Math.abs(value).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + ' W';
        nodeEl.querySelector('.sc-diagram__value').textContent = watts;
        nodeEl.querySelector('.sc-diagram__state').textContent = state;
        nodeEl.setAttribute('aria-label', labels[name] + ': ' + watts + ', ' + state.toLowerCase() + (value === null || value === 0 ? '' : incoming ? ', to inverter' : ', from inverter'));
        flowEl.dataset.direction = direction;
        var forward = (name === 'solar' || name === 'battery') === incoming;
        flowEl.dataset.motion = forward ? 'forward' : 'backward';
        flowEl.querySelector('.sc-diagram__chevron').setAttribute('transform', forward ? 'rotate(0)' : 'rotate(180)');
      });
    }
  }

  flows.forEach(function (name) {
    Object.defineProperty(ScDiagram.prototype, name, {
      get: function () { return number(this.getAttribute(name)); },
      set: function (value) {
        var n = number(value);
        if (n === null) this.removeAttribute(name);
        else if (this.getAttribute(name) !== String(n)) this.setAttribute(name, String(n));
      }
    });
  });
  if (!customElements.get('sc-diagram')) customElements.define('sc-diagram', ScDiagram);
})();
