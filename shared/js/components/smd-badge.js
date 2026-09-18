// <smd-badge> — themed Bootstrap badge.
//
// Renders the exact colours the loaded Bootswatch theme gives its
// `.badge.text-bg-<variant>` badges: `applySmdVars()` probes them in the light
// DOM and publishes `--smd-badge-<variant>-{bg,text}` on <html>, which this
// component's own sheet consumes (document CSS cannot style a shadow root, and
// Bootstrap sets its badge vars on the .badge element, not on :root).
//
// Attributes:
//   variant — primary | secondary | success | danger | warning | info | light | dark (default primary)
//   pill    — rounded-pill instead of the theme's badge radius
const smdBadgeSheet = SmdStyles.sheetFor(`
  :host {
    display: inline-block;
    padding: 0.35em 0.65em;
    font-size: var(--smd-type-badge, 0.75em);
    font-weight: 700;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
    vertical-align: baseline;
    border-radius: var(--bs-border-radius, 0.375rem);
    color: var(--smd-badge-primary-text, #fff);
    background-color: var(--smd-badge-primary-bg, var(--bs-primary, #0d6efd));
  }
  :host([hidden]) { display: none !important; }
  :host([pill]) { border-radius: var(--bs-border-radius-pill, 50rem); }

  :host([variant="primary"]) { color: var(--smd-badge-primary-text, #fff); background-color: var(--smd-badge-primary-bg, var(--bs-primary, #0d6efd)); }
  :host([variant="secondary"]) { color: var(--smd-badge-secondary-text, #fff); background-color: var(--smd-badge-secondary-bg, var(--bs-secondary, #6c757d)); }
  :host([variant="success"]) { color: var(--smd-badge-success-text, #fff); background-color: var(--smd-badge-success-bg, var(--bs-success, #198754)); }
  :host([variant="danger"]) { color: var(--smd-badge-danger-text, #fff); background-color: var(--smd-badge-danger-bg, var(--bs-danger, #dc3545)); }
  :host([variant="warning"]) { color: var(--smd-badge-warning-text, #000); background-color: var(--smd-badge-warning-bg, var(--bs-warning, #ffc107)); }
  :host([variant="info"]) { color: var(--smd-badge-info-text, #000); background-color: var(--smd-badge-info-bg, var(--bs-info, #0dcaf0)); }
  :host([variant="light"]) { color: var(--smd-badge-light-text, #000); background-color: var(--smd-badge-light-bg, var(--bs-light, #f8f9fa)); }
  :host([variant="dark"]) { color: var(--smd-badge-dark-text, #fff); background-color: var(--smd-badge-dark-bg, var(--bs-dark, #212529)); }
`);

class SmdBadge extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    SmdStyles.adoptStyles(this.shadowRoot, [smdBadgeSheet]);
    this.shadowRoot.appendChild(document.createElement("slot"));
  }
}

if (!window.customElements.get("smd-badge")) {
  window.customElements.define("smd-badge", SmdBadge);
}
window.SmdBadge = SmdBadge;
