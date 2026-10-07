// <smd-tabs> — tabbed panels (light DOM). Layout is applied by the component;
// theme/cascade rules live in shared/css/styles.css.
//
// Renders a tab button list, an underline, and the panels straight into the host
// in the light DOM. Panels are shown coincident with the active tab. A
// `hide-panels` attribute hides the panels entirely (used when a parent renders
// its own content after the tab bar, e.g. the today/maintenance tabs on the
// PlanMyDay home screen).
//
// `tabs = [{title, id?, content?, panelClass?}]`; the active tab is
// `activeIndex`; changes dispatch `smd-tabs-change` ({index, tab}).
let smdTabsNextId = 0;
class SmdTabs extends HTMLElement {
    constructor() {
        super();
        this._tabs = [];
        this._activeIndex = 0;
        this._instanceId = ++smdTabsNextId;
    }

    get tabs() {
        return this._tabs;
    }

    set tabs(val) {
        this._tabs = val || [];
        this._activeIndex = 0;
        this._render();
    }

    static get observedAttributes() {
        return ['bottomline', 'wrap', 'padding', 'narrow'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'bottomline' && oldValue !== newValue && this._tabs) {
            this._render();
        }
    }

    get activeIndex() {
        return this._activeIndex;
    }

    set activeIndex(val) {
        if (val >= 0 && val < this._tabs.length) {
            this._activeIndex = val;
            this._updateActive();
        }
    }

    get bottomline() {
        const attr = this.getAttribute('bottomline');
        return attr !== null && attr !== 'false';
    }

    set bottomline(val) {
        this.toggleAttribute('bottomline', !!val);
    }

    get wrap() {
        return this.hasAttribute('wrap');
    }

    set wrap(val) {
        this.toggleAttribute('wrap', !!val);
    }

    get narrow() {
        return this.hasAttribute('narrow');
    }

    set narrow(val) {
        this.toggleAttribute('narrow', !!val);
    }

    get padding() {
        return this.getAttribute('padding') || 'normal';
    }

    set padding(val) {
        if (val === 'small') {
            this.setAttribute('padding', 'small');
        } else {
            this.removeAttribute('padding');
        }
    }

    _render() {
        if (typeof injectSmdComponentStyle === "function") {
            injectSmdComponentStyle("smd-tabs-layout", `
              smd-tabs { display: block; width: 100%; box-sizing: border-box; }
              smd-tabs .smd-tab-list { display: flex; flex-wrap: nowrap; }
              smd-tabs[wrap] .smd-tab-list { flex-wrap: wrap; }
              smd-tabs[narrow] .smd-tab-btn { padding-left: 0.25rem; padding-right: 0.25rem; }
              smd-tabs .smd-tab-panel { display: none; }
              smd-tabs .smd-tab-panel.active,
              smd-tabs .smd-tab-panel[active] { display: block; }
              smd-tabs[hide-panels] .smd-tab-panel { display: none !important; }
            `);
            // Layout that used to live in shared/css/styles.css. The selector text
            // is kept verbatim (including the #smd-app prefix and the unscoped
            // .nav-tabs alternatives) so the cascade is unchanged; injected styles
            // are appended to <head>, so these win over the theme links that
            // applyTheme re-points. Colours/sizes stay in the shared sheet.
            injectSmdComponentStyle("smd-tabs-nav", `
              #smd-app smd-tabs .smd-tab-list { border-bottom: 0; margin-bottom: 0; }
              #smd-app smd-tabs .smd-tab-btn { margin: 0 4px 0 0; }
              #smd-app smd-tabs .smd-tab-btn.active,
              #smd-app smd-tabs .smd-tab-btn[active] { margin-bottom: 0; }
              #smd-app smd-tabs .nav-tabs .nav-item.show .nav-link, .nav-tabs .nav-link { border: none; margin-bottom: 2px; }
              #smd-app smd-tabs .nav-tabs .nav-item.show .nav-link, .nav-tabs .nav-link.active { border: none; }
            `);
        }
        const instanceId = `smd-tabs-${this._instanceId}`;
        const headersHtml = this._tabs.map((tab, i) => {
            const active = i === this._activeIndex;
            const baseId = tab.id || `${instanceId}-tab-${i}`;
            const buttonId = this._escapeAttr(baseId);
            const panelId = this._escapeAttr(`${baseId}-panel`);
            return `<li class="nav-item" role="presentation"><button type="button" class="nav-link smd-tab-btn${active ? ' active' : ''}" id="${buttonId}" data-index="${i}" data-bs-toggle="tab" data-bs-target="#${panelId}" role="tab" aria-controls="${panelId}" aria-selected="${active ? 'true' : 'false'}" tabindex="${active ? '0' : '-1'}">${this._escapeHtml(tab.title)}</button></li>`;
        }).join('');

        const panelsHtml = this._tabs.map((tab, i) => {
            const active = i === this._activeIndex;
            const baseId = tab.id || `${instanceId}-tab-${i}`;
            const buttonId = this._escapeAttr(baseId);
            const panelId = this._escapeAttr(`${baseId}-panel`);
            const panelClasses = ['tab-pane', 'fade', 'smd-tab-panel'];
            if (active) panelClasses.push('show', 'active');
            if (tab.panelClass) panelClasses.push(tab.panelClass);
            return `<div class="${panelClasses.join(' ')}" id="${panelId}" data-panel="${i}" role="tabpanel" aria-labelledby="${buttonId}" aria-hidden="${active ? 'false' : 'true'}" tabindex="${active ? '0' : '-1'}">${tab.content || ''}</div>`;
        }).join('');

        const topLineHtml = '<div class="smd-tab-line" aria-hidden="true"></div>';
        const bottomLineHtml = this.bottomline ? '<div class="smd-tab-line" aria-hidden="true"></div>' : '';

        this.innerHTML = `
      <ul class="nav nav-tabs smd-tab-list" role="tablist">${headersHtml}</ul>
      ${topLineHtml}
      <div class="tab-content">${panelsHtml}</div>
      ${bottomLineHtml}
    `;

        this.querySelectorAll('.smd-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                this._activate(parseInt(btn.dataset.index, 10));
            });
        });
        this._updateActive();
    }

    _activate(index) {
        if (isNaN(index) || index < 0 || index >= this._tabs.length) return;
        this._activeIndex = index;
        this._updateActive();
        this.dispatchEvent(new CustomEvent('smd-tabs-change', {
            bubbles: true,
            composed: true,
            detail: {index: this._activeIndex, tab: this._tabs[this._activeIndex]},
        }));
    }

    _updateActive() {
        this.querySelectorAll('.smd-tab-btn').forEach((btn, i) => {
            const active = i === this._activeIndex;
            btn.classList.toggle('active', active);
            // Bootstrap owns the tab colours: the active tab is a filled
            // primary surface and inactive tabs are a secondary surface, and
            // the .text-bg-* helpers supply the matching contrast text (so a
            // light theme whose secondary is near-white no longer gets white
            // text on a white tab).
            btn.classList.toggle('text-bg-primary', active);
            btn.classList.toggle('text-bg-secondary', !active);
            btn.toggleAttribute('active', active);
            btn.setAttribute('aria-selected', String(active));
            btn.setAttribute('tabindex', active ? '0' : '-1');
        });
        this.querySelectorAll('.smd-tab-panel').forEach((panel, i) => {
            const active = i === this._activeIndex;
            panel.classList.toggle('active', active);
            panel.classList.toggle('show', active);
            panel.toggleAttribute('active', active);
            panel.toggleAttribute('hidden', !active);
            panel.setAttribute('aria-hidden', String(!active));
            panel.setAttribute('tabindex', active ? '0' : '-1');
        });
    }

    _escapeHtml(str) {
        if (!str && str !== 0) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    _escapeAttr(str) {
        if (!str) return '';
        return this._escapeHtml(str).replace(/'/g, '&#39;');
    }
}

if (!window.customElements.get('smd-tabs')) {
    customElements.define('smd-tabs', SmdTabs);
}
window.SmdTabs = SmdTabs;
