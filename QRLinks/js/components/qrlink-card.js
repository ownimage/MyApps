const qrLinkCardTemplate = document.createElement("template");
qrLinkCardTemplate.innerHTML = `
  <div class="card smd-card border-0 w-100">
    <div class="d-flex align-items-center gap-3 p-2 border rounded-3">
      <div class="flex-shrink-0">
        <smd-image class="link-thumb"></smd-image>
      </div>
      <div class="flex-grow-1 overflow-hidden">
        <smd-h2 class="title fw-bold mb-0 text-break"></smd-h2>
        <div class="description small text-body mb-0 text-break"></div>
      </div>
      <div class="flex-shrink-0">
        <button type="button" class="btn btn-primary btn-sm qr-btn p-1 lh-1" title="QR code">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 16 16">
            <path d="M0 0h6v6H0V0zm2 2v2h2V2H2z"/>
            <path d="M10 0h6v6h-6V0zm2 2v2h2V2h-2z"/>
            <path d="M0 10h6v6H0v-6zm2 2v2h2v-2H2z"/>
            <path d="M13 10h1v1h-1v-1zm-1 1h1v1h-1v-1zm-1 1h1v1h-1v-1zm2 0h1v1h-1v-1zm-1 1h1v1h-1v-1zm1 1h1v1h-1v-1zm-1 1h1v1h-1v-1zm3 0h1v1h-1v-1zm1-1h1v1h-1v-1zm-1-4h1v1h-1v-1zm1 2h1v1h-1v-1zm-5 1h1v1h-1v-1zm-1 1h1v1h-1v-1zm2-1h1v1h-1v-1z"/>
          </svg>
        </button>
      </div>
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
    this.classList.add("d-block");
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
    if (this._bound && this.isConnected) this._render();
  }

  _render() {
    const keyPrefix = this.getAttribute("key-prefix") ||
      (typeof smdImagePrefix === "function" ? smdImagePrefix() : "shared-");

    this.querySelector(".title").textContent = this.getAttribute("title") || "";

    const descEl = this.querySelector(".description");
    const description = this.getAttribute("description") || "";
    descEl.textContent = description;
    descEl.hidden = !description;

    this.querySelector(".qr-btn").hidden = !this.getAttribute("url");

    const sImg = this.querySelector(".link-thumb");
    sImg.setAttribute("key-prefix", keyPrefix);
    const image = this.getAttribute("image");
    if (image) sImg.setAttribute("image", image);
    else sImg.removeAttribute("image");
  }
}

if (!customElements.get("qrlink-card")) {
  customElements.define("qrlink-card", QrLinkCard);
}
