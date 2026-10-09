// <pb-image-dropdown> — PhoneButtons-specific dropdown picker.
//
// Same data API as the shared <smd-image-dropdown>, but option thumbnails are
// plain <img> elements pointing at a SERVER url (e.g. /app-icon-cache/<name>)
// instead of the shared localStorage image library. This is why it exists as a
// PhoneButtons component rather than a change to smd-image-dropdown.
//
// Host sets the data and listens for `pb-image-dropdown-change`:
//   options  = [{ name, value, imageUrl }]  — imageUrl is OPTIONAL; options
//              without one render a blank placeholder so rows stay aligned.
//   selected = the selected option's NAME (empty falls back to the first).
// The change event detail is { name, value }.
//
// Internal ids (pbImageDropdownBtn / pbImageBtnIcon / pbImageBtnText /
// pbImageDropdownMenu) are stable for tests.
(function (global) {
  "use strict";

  const pbImageDropdownTemplate = document.createElement("template");
  pbImageDropdownTemplate.innerHTML = `
    <button type="button" class="btn gap-2" id="pbImageDropdownBtn" aria-haspopup="listbox">
      <span class="thumb" id="pbImageBtnIcon" hidden><img alt=""></span>
      <span class="labels"><span class="title" id="pbImageBtnText"></span></span>
      <span class="caret">&#9662;</span>
    </button>
    <ul class="menu list-unstyled rounded shadow-sm mb-0" id="pbImageDropdownMenu" hidden></ul>
  `;

  class PbImageDropdown extends HTMLElement {
    static get observedAttributes() {
      return ["disabled"];
    }

    constructor() {
      super();
      this._options = [];
      this._selected = "";
      this._bound = false;
      this._built = false;
      this._onDocClick = null;
    }

    _build() {
      if (this._built) return;
      this._built = true;
      this.appendChild(pbImageDropdownTemplate.content.cloneNode(true));
    }

    connectedCallback() {
      this.classList.add("d-block", "position-relative");
      if (typeof injectSmdComponentStyle === "function") {
        // Layout + theme colours (same --smd-dropdown-* palette the shared
        // dropdown consumes) owned by THIS component.
        injectSmdComponentStyle("pb-image-dropdown-layout", `
          pb-image-dropdown .btn { display: flex; align-items: center; width: 100%; background-color: var(--smd-dropdown-background); color: var(--smd-dropdown-foreground); border-color: var(--smd-dropdown-border-color); }
          pb-image-dropdown .btn:hover, pb-image-dropdown .btn:focus-visible { background-color: var(--smd-dropdown-hover-background); color: var(--smd-dropdown-hover-foreground); border-color: var(--smd-dropdown-hover-background); }
          pb-image-dropdown .btn:disabled, pb-image-dropdown .btn.disabled { background-color: var(--smd-dropdown-disabled-background); color: var(--smd-dropdown-disabled-foreground); border-color: var(--smd-dropdown-disabled-foreground); }
          pb-image-dropdown .thumb { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; width: 1.5rem; height: 1.5rem; }
          pb-image-dropdown .thumb img { width: 100%; height: 100%; object-fit: contain; }
          pb-image-dropdown .labels { flex: 1 1 auto; min-width: 0; display: grid; }
          pb-image-dropdown .labels > * { grid-area: 1 / 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
          pb-image-dropdown .labels .sizer { visibility: hidden; }
          pb-image-dropdown .menu { position: absolute; left: 0; right: 0; top: 100%; z-index: 20; max-height: 16rem; overflow-y: auto; background-color: var(--smd-dropdown-menu-background); color: var(--smd-dropdown-menu-foreground); border: 1px solid var(--smd-dropdown-menu-border-color); }
          pb-image-dropdown .item { display: flex; align-items: center; color: var(--smd-dropdown-menu-foreground); }
          pb-image-dropdown .item:hover, pb-image-dropdown .item:focus { background-color: var(--smd-dropdown-item-hover-background); color: var(--smd-dropdown-item-hover-foreground); }
          pb-image-dropdown .item.active, pb-image-dropdown .item.active:hover, pb-image-dropdown .item.active:focus { background-color: var(--smd-dropdown-item-active-background); color: var(--smd-dropdown-item-active-foreground); }
          pb-image-dropdown .item .thumb { width: 1.5rem; height: 1.5rem; }
          pb-image-dropdown .thumb-blank { width: 1.5rem; height: 1.5rem; flex-shrink: 0; }
        `);
      }
      this._build();
      if (!this._bound) {
        this._bound = true;
        this.querySelector("#pbImageDropdownBtn").addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.hasAttribute("disabled")) return;
          const menu = this.querySelector("#pbImageDropdownMenu");
          if (menu) menu.hidden = !menu.hidden;
        });
        this._onDocClick = (e) => {
          if (e.composedPath && e.composedPath().indexOf(this) !== -1) return;
          const menu = this.querySelector("#pbImageDropdownMenu");
          if (menu) menu.hidden = true;
        };
        document.addEventListener("click", this._onDocClick);
      }
      this._render();
    }

    disconnectedCallback() {
      if (this._bound) {
        this._bound = false;
        document.removeEventListener("click", this._onDocClick);
        this._onDocClick = null;
      }
    }

    attributeChangedCallback() {
      if (this._built) this._render();
    }

    set options(list) {
      this._options = Array.isArray(list) ? list : [];
      if (this._built) this._render();
    }

    get options() {
      return this._options;
    }

    set selected(name) {
      this._selected = name == null ? "" : String(name);
      if (this._built) this._render();
    }

    get selected() {
      return this._selected;
    }

    // A server thumbnail. A missing file hides the image (keeping the box) so
    // the row/button stays aligned.
    _thumbImg(url) {
      const img = document.createElement("img");
      img.alt = "";
      img.addEventListener("error", () => { img.style.visibility = "hidden"; });
      img.src = url;
      return img;
    }

    _render() {
      const disabled = this.hasAttribute("disabled");
      const current = this._options.find((o) => String(o.name) === String(this._selected))
        || this._options[0] || {};

      const btn = this.querySelector("#pbImageDropdownBtn");
      btn.disabled = disabled;

      const thumb = this.querySelector("#pbImageBtnIcon");
      thumb.innerHTML = "";
      if (current.imageUrl) {
        thumb.appendChild(this._thumbImg(current.imageUrl));
        thumb.hidden = false;
      } else {
        thumb.hidden = true;
      }

      this.querySelector("#pbImageBtnText").textContent = current.name || "";

      // Size the closed button to the WIDEST option (same technique as
      // smd-image-dropdown): every label is stacked in one grid cell.
      const labels = this.querySelector(".labels");
      if (labels) {
        labels.querySelectorAll(".sizer").forEach((n) => n.remove());
        this._options.forEach((o) => {
          const sizer = document.createElement("span");
          sizer.className = "sizer";
          sizer.setAttribute("aria-hidden", "true");
          sizer.textContent = String(o.name || "");
          labels.appendChild(sizer);
        });
      }

      const menu = this.querySelector("#pbImageDropdownMenu");
      menu.innerHTML = "";
      this._options.forEach((o) => {
        const name = String(o.name);
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = "#";
        a.className = "item dropdown-item gap-2" + (name === String(this._selected) ? " active" : "");
        a.setAttribute("data-name", name);
        const itemThumb = document.createElement("span");
        itemThumb.className = "thumb";
        if (o.imageUrl) {
          itemThumb.appendChild(this._thumbImg(o.imageUrl));
        } else {
          itemThumb.classList.add("thumb-blank");
        }
        a.appendChild(itemThumb);
        const itemTitle = document.createElement("span");
        itemTitle.className = "title";
        itemTitle.textContent = o.name || "";
        a.appendChild(itemTitle);
        a.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._selected = name;
          menu.hidden = true;
          this._render();
          this.dispatchEvent(new CustomEvent("pb-image-dropdown-change", {
            bubbles: true,
            composed: true,
            detail: { name: name, value: o.value != null ? o.value : name }
          }));
        });
        li.appendChild(a);
        menu.appendChild(li);
      });
    }
  }

  if (!global.customElements.get("pb-image-dropdown")) {
    global.customElements.define("pb-image-dropdown", PbImageDropdown);
  }
  global.PbImageDropdown = PbImageDropdown;
})(window);
