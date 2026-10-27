// <myhid-image-dropdown> — MyHID-specific dropdown picker.
//
// Same data API as the shared <smd-image-dropdown>, but option thumbnails are
// plain <img> elements pointing at a SERVER url (e.g. /app-icon-cache/<name>)
// instead of the shared localStorage image library. This is why it exists as a
// MyHID component rather than a change to smd-image-dropdown.
//
// Host sets the data and listens for `myhid-image-dropdown-change`:
//   options  = [{ name, value, imageUrl }]  — imageUrl is OPTIONAL; options
//              without one render a blank placeholder so rows stay aligned.
//   selected = the selected option's NAME (empty falls back to the first).
// The change event detail is { name, value }.
//
// Internal ids (myhidImageDropdownBtn / myhidImageBtnIcon / myhidImageBtnText /
// myhidImageDropdownMenu) are stable for tests.
(function (global) {
  "use strict";

  const myhidImageDropdownTemplate = document.createElement("template");
  myhidImageDropdownTemplate.innerHTML = `
    <button type="button" class="form-select gap-2" id="myhidImageDropdownBtn" aria-haspopup="listbox">
      <span class="thumb" id="myhidImageBtnIcon" hidden><img alt=""></span>
      <span class="labels"><span class="title" id="myhidImageBtnText"></span></span>
      <span class="caret">&#9662;</span>
    </button>
    <ul class="menu list-unstyled rounded shadow-sm mb-0" id="myhidImageDropdownMenu" hidden></ul>
  `;

  class MyhidImageDropdown extends HTMLElement {
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
      this.appendChild(myhidImageDropdownTemplate.content.cloneNode(true));
    }

    connectedCallback() {
      this.classList.add("d-block", "position-relative");
      if (typeof injectSmdComponentStyle === "function") {
        // Layout + theme colours (same --smd-dropdown-* palette the shared
        // dropdown consumes) owned by THIS component.
        injectSmdComponentStyle("myhid-image-dropdown-layout", `
          myhid-image-dropdown .form-select { display: flex; align-items: center; width: 100%; padding: 0.375rem 0.75rem; background-image: none; }
          myhid-image-dropdown .thumb { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; width: 1.5rem; height: 1.5rem; }
          myhid-image-dropdown .thumb img { width: 100%; height: 100%; object-fit: contain; }
          myhid-image-dropdown .labels { flex: 1 1 auto; min-width: 0; display: grid; }
          myhid-image-dropdown .labels > * { grid-area: 1 / 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
          myhid-image-dropdown .labels .sizer { visibility: hidden; }
          myhid-image-dropdown .menu { position: absolute; left: 0; right: 0; top: 100%; z-index: 20; max-height: 16rem; overflow-y: auto; background-color: var(--smd-dropdown-menu-background); color: var(--smd-dropdown-menu-foreground); border: 1px solid var(--smd-dropdown-menu-border-color); }
          myhid-image-dropdown .item { display: flex; align-items: center; color: var(--smd-dropdown-menu-foreground); }
          myhid-image-dropdown .item:hover, myhid-image-dropdown .item:focus { background-color: var(--smd-dropdown-item-hover-background); color: var(--smd-dropdown-item-hover-foreground); }
          myhid-image-dropdown .item.active, myhid-image-dropdown .item.active:hover, myhid-image-dropdown .item.active:focus { background-color: var(--smd-dropdown-item-active-background); color: var(--smd-dropdown-item-active-foreground); }
          myhid-image-dropdown .item .thumb { width: 1.5rem; height: 1.5rem; }
          myhid-image-dropdown .thumb-blank { width: 1.5rem; height: 1.5rem; flex-shrink: 0; }
        `);
      }
      this._build();
      if (!this._bound) {
        this._bound = true;
        this.querySelector("#myhidImageDropdownBtn").addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.hasAttribute("disabled")) return;
          const menu = this.querySelector("#myhidImageDropdownMenu");
          if (menu) menu.hidden = !menu.hidden;
        });
        this._onDocClick = (e) => {
          if (e.composedPath && e.composedPath().indexOf(this) !== -1) return;
          const menu = this.querySelector("#myhidImageDropdownMenu");
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

      const btn = this.querySelector("#myhidImageDropdownBtn");
      btn.disabled = disabled;

      const thumb = this.querySelector("#myhidImageBtnIcon");
      thumb.innerHTML = "";
      if (current.imageUrl) {
        thumb.appendChild(this._thumbImg(current.imageUrl));
        thumb.hidden = false;
      } else {
        thumb.hidden = true;
      }

      this.querySelector("#myhidImageBtnText").textContent = current.name || "";

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

      const menu = this.querySelector("#myhidImageDropdownMenu");
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
          this.dispatchEvent(new CustomEvent("myhid-image-dropdown-change", {
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

  if (!global.customElements.get("myhid-image-dropdown")) {
    global.customElements.define("myhid-image-dropdown", MyhidImageDropdown);
  }
  global.MyhidImageDropdown = MyhidImageDropdown;
})(window);
