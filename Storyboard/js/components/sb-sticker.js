// <sb-sticker> - one tile in the Storyboard Stickers fly-out.
//
// The panel shows Standard (built-in SVG), Library (OneDrive <Directory>/Stickers)
// and Board (<Directory>/<story>/Stickers) stickers side by side, so every entry
// renders through this one component. It is LIGHT DOM on purpose: the panel's
// delegated click handler looks for `.sb-sticker-option` / `data-sticker`, and
// storyboard.css owns the tile look (the same rules the panel always used).
//
// Attributes (reflected so a test can read them):
//   sticker-id  the sticker id placed on the board ("mermaid", "od:<hash>", ...)
//   name        the visible caption (file name without its extension)
//   src         the image URL - an asset path, a blob: URL from the sticker cache
//               or a data: URL restored from a story backup
//   source      "standard" | "library" | "board"
//
// Clicking the tile dispatches `sb-sticker-pick` ({id, name, src, source}); the
// click still bubbles, so the panel's existing handler keeps working too.
class SbSticker extends HTMLElement {
  static get observedAttributes() {
    return ["sticker-id", "name", "src", "source"];
  }

  connectedCallback() {
    // Attributes survive cloneNode(), JS own-properties do not: build once.
    if (!this.hasAttribute("data-smd-built")) {
      this.setAttribute("data-smd-built", "");
      this._build();
    }
    this._render();
  }

  attributeChangedCallback() {
    if (this.hasAttribute("data-smd-built") && this.isConnected) this._render();
  }

  _build() {
    var self = this;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "sb-sticker-option";

    var img = document.createElement("img");
    img.alt = "";
    img.draggable = false;

    var label = document.createElement("span");
    label.className = "sb-sticker-name";

    button.appendChild(img);
    button.appendChild(label);
    button.addEventListener("click", function () {
      self.dispatchEvent(new CustomEvent("sb-sticker-pick", {
        bubbles: true,
        composed: true,
        detail: {
          id: self.getAttribute("sticker-id") || "",
          name: self.getAttribute("name") || "",
          src: self.getAttribute("src") || "",
          source: self.getAttribute("source") || ""
        }
      }));
    });

    this.textContent = "";
    this.appendChild(button);
    this._button = button;
    this._img = img;
    this._label = label;
  }

  _render() {
    if (!this._button) return;
    var id = this.getAttribute("sticker-id") || "";
    var name = this.getAttribute("name") || "";
    var src = this.getAttribute("src") || "";
    this._button.dataset.sticker = id;
    this._button.title = name;
    this._label.textContent = name;
    if (src) {
      if (this._img.getAttribute("src") !== src) this._img.src = src;
      this._img.hidden = false;
    } else {
      this._img.removeAttribute("src");
      this._img.hidden = true;
    }
  }
}

customElements.define("sb-sticker", SbSticker);
