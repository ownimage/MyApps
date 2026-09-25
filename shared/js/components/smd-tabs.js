// <smd-tabs> — tabbed panels (light DOM). Styles live in shared/css/styles.css.
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
        return ['bottomline', 'wrap', 'padding'];
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

        const bottomLineHtml = this.bottomline ? '<div class="smd-tab-line" aria-hidden="true"></div>' : '';

        this.innerHTML = `
      <ul class="nav nav-tabs smd-tab-list" role="tablist">${headersHtml}</ul>
      ${bottomLineHtml}
      <div class="tab-content">${panelsHtml}</div>
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