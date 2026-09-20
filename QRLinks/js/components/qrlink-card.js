// <qrlink-card> — one link tile on the QRLinks main view.
//
// Owns its layout (thumbnail via <smd-image>, title, description and the QR
// button) and its styling (QRLinks/css/styles.css, element-scoped). Body
// display settings (font size / density) reach the card through CSS custom
// properties (`--qrlink-*`, defined in QRLinks/css/styles.css) by inheritance.
//
// Attributes:
//   index       — link index (echoed on qrlink-qr)
//   title       — link title
//   description — optional description line
//   url         — the link URL; when empty the QR button is hidden
//   image       — image name (rendered via smd-image)
//   key-prefix  — smd-image storage prefix (default: SmdConfig.imagePrefix)
//
// Events:
//   qrlink-qr — detail { index, url, title }
const qrLinkCardTemplate = document.createElement("template");
qrLinkCardTemplate.innerHTML = `
  <div class="row">
    <div class="thumb"><smd-image class="link-thumb"></smd-image></div>
    <div class="content">
      <h4 class="title"></h4>
      <div class="description"></div>
    </div>
    <div class="actions">
      <button type="button" class="btn btn-primary btn-sm qr-btn" title="QR code">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 16 16">
          <path d="M0 0h6v6H0V0zm2 2v2h2V2H2z"/>
          <path d="M10 0h6v6h-6V0zm2 2v2h2V2h-2z"/>
          <path d="M0 10h6v6H0v-6zm2 2v2h2v-2H2z"/>
          <path d="M13 10h1v1h-1v-1zm-1 1h1v1h-1v-1zm-1 1h1v1h-1v-1zm2 0h1v1h-1v-1zm-1 1h1v1h-1v-1zm1 1h1v1h-1v-1zm-1 1h1v1h-1v-1zm3 0h1v1h-1v-1zm1-1h1v1h-1v-1zm-1-4h1v1h-1v-1zm1 2h1v1h-1v-1zm-5 1h1v1h-1v-1zm-1 1h1v1h-1v-1zm2-1h1v1h-1v-1z"/>
        </svg>
      </button>
    </div>
  </div>
`;

class QrLinkCard extends HTMLElement {
  static get observedAttributes() {
    return ["index", "title", "description", "url", "image", "key-prefix"];
  }

  constructor() {
    super();
    this._bound = false;
  }

  connectedCallback() {
    if (!this._bound) {
      this._bound = true;
      this.appendChild(qrLinkCardTemplate.content.cloneNode(true));
      this.querySelector(".qr-btn").addEventListener("click", () => {
        if (!this.getAttribute("url")) return;
        const idx = parseInt(this.getAttribute("index"), 10);
        this.dispatchEvent(new CustomEvent("qrlink-qr", {
          bubbles: true,
          composed: true,
          detail: {
            index: isNaN(idx) ? -1 : idx,
            url: this.getAttribute("url") || "",
            title: this.getAttribute("title") || ""
          }
        }));
      });
    }
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  _render() {
    const root = this;
    const keyPrefix = this.getAttribute("key-prefix") ||
      (typeof smdImagePrefix === "function" ? smdImagePrefix() : "shared-");

    root.querySelector(".title").textContent = this.getAttribute("title") || "";

    const descEl = root.querySelector(".description");
    const description = this.getAttribute("description") || "";
    descEl.textContent = description;
    descEl.hidden = !description;

    root.querySelector(".qr-btn").hidden = !this.getAttribute("url");

    const sImg = root.querySelector(".link-thumb");
    sImg.setAttribute("key-prefix", keyPrefix);
    const image = this.getAttribute("image");
    if (image) sImg.setAttribute("image", image);
    else sImg.removeAttribute("image");
  }
}

customElements.define("qrlink-card", QrLinkCard);