// <launch-app-menu> — one app row on the Launch app's settings "Menu" tab (light DOM).
//
// Shows the app icon + name plus three controls:
//   - a drag handle (Sortable reorders the rows)
//   - a "Show on Launch" tick  -> whether the app appears on the Launch grid
//   - a "Show in Menu" tick    -> whether the app appears in the "Launch" flyout
//     submenu of every app's hamburger menu
//
// Attributes:
//   path        — the app path (registry key, e.g. "PlanMyDay/"; "" = Launch)
//   name        — display name
//   icon        — shared sample-image name (rendered via smd-image)
//   on-launch   — boolean tick state
//   on-menu     — boolean tick state
//   key-prefix  — smd-image storage prefix (default: the app's image prefix)
//
// Events:
//   launch-app-menu-change — detail { path, field: "onLaunch"|"onMenu", value }

const launchAppMenuTemplate = document.createElement("template");
launchAppMenuTemplate.innerHTML = `
  <div class="d-flex align-items-center gap-2 py-2 px-2 border rounded-3">
    <smd-draghandle class="drag-handle"></smd-draghandle>
    <div class="thumb d-flex align-items-center justify-content-center flex-shrink-0">
      <smd-image key-prefix="shared-"></smd-image>
    </div>
    <smd-h2 class="app-name flex-grow-1 text-truncate mb-0"></smd-h2>
    <div class="d-flex flex-column gap-1 flex-shrink-0">
      <smd-checkbox class="launch-toggle">Launch</smd-checkbox>
      <smd-checkbox class="menu-toggle">Menu</smd-checkbox>
    </div>
  </div>
`;

class LaunchAppMenu extends HTMLElement {
  static get observedAttributes() {
    return ["path", "name", "icon", "on-launch", "on-menu", "key-prefix"];
  }

  constructor() {
    super();
    this._bound = false;
  }

  connectedCallback() {
    // Clone-safe: a Sortable fallback ghost is cloneNode(true) of this host, so
    // the `data-smd-built` attribute (copied by cloneNode, unlike the `_bound` JS
    // property) stops the template being appended a second time in the ghost.
    if (!this._bound && !this.hasAttribute("data-smd-built")) {
      this._bound = true;
      this.setAttribute("data-smd-built", "");
      this.classList.add("d-block", "launch-app-menu");
      this.appendChild(launchAppMenuTemplate.content.cloneNode(true));
      this.querySelector("smd-checkbox.launch-toggle").addEventListener("change", (e) => {
        this._emit("onLaunch", !!(e.detail ? e.detail.checked : e.target.checked));
      });
      this.querySelector("smd-checkbox.menu-toggle").addEventListener("change", (e) => {
        this._emit("onMenu", !!(e.detail ? e.detail.checked : e.target.checked));
      });
    }
    this._bound = true;
    this._render();
  }

  attributeChangedCallback() {
    if (this._bound && this.isConnected) this._render();
  }

  get path() { return this.getAttribute("path") || ""; }

  _emit(field, value) {
    this.dispatchEvent(new CustomEvent("launch-app-menu-change", {
      bubbles: true,
      composed: true,
      detail: { path: this.getAttribute("path") || "", field, value }
    }));
  }

  _render() {
    const icon = this.getAttribute("icon") || "";
    this.querySelector(".app-name").textContent = this.getAttribute("name") || "";

    const img = this.querySelector(".thumb smd-image");
    if (img) {
      const prefix = this.getAttribute("key-prefix") ||
        (typeof smdImagePrefix === "function" ? smdImagePrefix() : "shared-");
      img.setAttribute("key-prefix", prefix);
      if (icon) img.setAttribute("image", icon);
      else img.removeAttribute("image");
    }

    this.querySelector("smd-checkbox.launch-toggle").checked = this.hasAttribute("on-launch");
    this.querySelector("smd-checkbox.menu-toggle").checked = this.hasAttribute("on-menu");
  }
}

if (!window.customElements.get("launch-app-menu")) {
  customElements.define("launch-app-menu", LaunchAppMenu);
}

window.LaunchAppMenu = LaunchAppMenu;
