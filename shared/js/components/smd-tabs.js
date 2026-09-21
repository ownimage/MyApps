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
class SmdTabs extends HTMLElement {
    constructor() {
        super();
        this._tabs = [];
        this._activeIndex = 0;
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
        const headersHtml = this._tabs.map((tab, i) => {
            const active = i === this._activeIndex ? ' active' : '';
            const idAttr = tab.id ? ` id="${this._escapeAttr(tab.id)}"` : '';
            return `<button class="smd-tab-btn" data-index="${i}"${idAttr}${active}>${this._escapeHtml(tab.title)}</button>`;
        }).join('');

        const panelsHtml = this._tabs.map((tab, i) => {
            const active = i === this._activeIndex ? ' active' : '';
            const idAttr = tab.id ? ` id="${this._escapeAttr(tab.id)}-panel"` : '';
            const panelClass = tab.panelClass ? `smd-tab-panel ${tab.panelClass}` : 'smd-tab-panel';
            return `<div class="${panelClass}"${idAttr}${active} data-panel="${i}">${tab.content || ''}</div>`;
        }).join('');

        const bottomLineHtml = this.bottomline ? '<div class="smd-tab-line"></div>' : '';

        this.innerHTML = `
      <div class="smd-tab-list">${headersHtml}</div>
      <div class="smd-tab-line"></div>
      ${panelsHtml}
      ${bottomLineHtml}
    `;

        this.querySelectorAll('.smd-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                this._activeIndex = parseInt(btn.dataset.index);
                this._updateActive();
                this.dispatchEvent(new CustomEvent('smd-tabs-change', {
                    bubbles: true,
                    composed: true,
                    detail: {index: this._activeIndex, tab: this._tabs[this._activeIndex]},
                }));
            });
        });
    }

    _updateActive() {
        this.querySelectorAll('.smd-tab-btn').forEach((btn, i) => {
            btn.toggleAttribute('active', i === this._activeIndex);
        });
        this.querySelectorAll('.smd-tab-panel').forEach((panel, i) => {
            panel.toggleAttribute('active', i === this._activeIndex);
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