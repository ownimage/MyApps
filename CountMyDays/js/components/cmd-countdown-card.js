// <cmd-countdown-card> — one countdown tile on the main view.
//
// Attributes:
//   title           — event title
//   date-text       — formatted event date (e.g. "Sat 12 Sep 2026")
//   source          — "local" (default) | "google"; shown as a badge under the date
//   count1          — first countdown line ("12" or "3 weeks")
//   count2          — optional second line ("4 days")
//   category        — category label (shown under the category thumbnail)
//   category-image  — category image name (rendered via smd-image)
//   image           — date image name (rendered via smd-image)
//   key-prefix      — smd-image storage prefix (default: SmdConfig.imagePrefix)
//   hide-count      — presence suppresses the countdown column entirely (used
//                     for "today" tiles where a "0 days" countdown is noise)
//
// The card is a swipe-to-dismiss target only when the consumer adds the
// `dismissable` attribute (PlanMyDay's main page does; CountMyDays does not).
// `touch-action: pan-y` keeps vertical scrolling working while a horizontal
// drag reaches the component. Layout stays Bootstrap utilities in the template.
(function (global) {
  if (global.document.getElementById("cmd-countdown-card-style")) return;
  const s = global.document.createElement("style");
  s.id = "cmd-countdown-card-style";
  s.textContent =
    "cmd-countdown-card { display: block; }" +
    "cmd-countdown-card[dismissable] { touch-action: pan-y; }";
  global.document.head.appendChild(s);
})(window);

const cmdCountdownCardTemplate = document.createElement("template");
cmdCountdownCardTemplate.innerHTML = `
  <div class="card border-0 w-100">
    <div class="d-flex align-items-center gap-3 px-3 py-2 border rounded-3">
      <div class="thumbs d-flex flex-shrink-0 align-items-start gap-1">
        <div class="thumb-block d-flex flex-column align-items-center">
          <div class="thumb mb-1 d-flex align-items-center justify-content-center"><smd-image class="category-thumb"></smd-image></div>
          <div class="category-label small text-center"></div>
        </div>
        <div class="thumb-block d-flex flex-column align-items-center">
          <div class="thumb d-flex align-items-center justify-content-center"><smd-image class="date-thumb"></smd-image></div>
        </div>
      </div>
      <div class="content flex-grow-1 overflow-hidden">
        <h4 class="title fw-bold text-truncate mb-1"></h4>
        <div class="date-text text-secondary mb-1"></div>
        <div class="source-row">
          <smd-badge class="source-badge" variant="secondary"></smd-badge>
        </div>
      </div>
      <div class="counts d-flex flex-column text-end flex-shrink-0">
        <div class="count count-1 h3 mb-0"></div>
        <div class="count count-2 small text-secondary"></div>
      </div>
    </div>
  </div>
`;

class CmdCountdownCard extends HTMLElement {
  static get observedAttributes() {
    return ["title", "date-text", "source", "count1", "count2", "category",
      "category-image", "image", "key-prefix", "dismissable", "hide-count"];
  }

  constructor() {
    super();
    this._bound = false;
  }

  connectedCallback() {
    if (!this._bound) {
      this._bound = true;
      this.appendChild(cmdCountdownCardTemplate.content.cloneNode(true));
    }
    this._render();
  }

  attributeChangedCallback() {
    if (this._bound && this.isConnected) this._render();
  }

  _render() {
    const root = this;
    const keyPrefix = this.getAttribute("key-prefix") || smdImagePrefix();

    root.querySelector(".title").textContent = this.getAttribute("title") || "";
    root.querySelector(".date-text").textContent = this.getAttribute("date-text") || "";

    // Source badge: variant colours are the standard (button) theme variants
    // for now — the exact styling will be refined later.
    const source = this.getAttribute("source") || "local";
    const badge = root.querySelector(".source-badge");
    badge.textContent = source === "google" ? "Google" : "Local";
    badge.setAttribute("variant", source === "google" ? "secondary" : "primary");

    const count1 = this.getAttribute("count1") || "";
    const count2 = this.getAttribute("count2") || "";
    root.querySelector(".count-1").textContent = count1;
    const count2El = root.querySelector(".count-2");
    count2El.textContent = count2;
    count2El.hidden = !count2;

    // `hide-count` suppresses the whole countdown column (e.g. for "today"
    // tiles, where "0 days" is noise).
    root.querySelector(".counts").hidden = this.hasAttribute("hide-count");

    root.querySelector(".category-label").textContent = this.getAttribute("category") || "";

    const setThumb = (selector, name) => {
      const sImg = root.querySelector(selector);
      sImg.setAttribute("key-prefix", keyPrefix);
      if (name) sImg.setAttribute("image", name);
      else sImg.removeAttribute("image");
    };
    setThumb(".category-thumb", this.getAttribute("category-image") || "");
    setThumb(".date-thumb", this.getAttribute("image") || "");

    if (this.hasAttribute("dismissable")) this._setupSwipe();
  }

  // Swipe left OR right past the threshold animates the card off, then emits
  // `cmd-countdown-dismiss` ({ key }) so the consumer can persist the dismissal
  // and remove the node. No confirmation, no snap-back.
  _setupSwipe() {
    if (this._swipeBound) return;
    this._swipeBound = true;
    const root = this;
    let s = null;

    const thresholdFor = () => {
      const w = root.offsetWidth || 320;
      return Math.min(120, Math.max(60, w * 0.25));
    };

    root.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      s = { id: e.pointerId, startX: e.clientX, startY: e.clientY, active: false };
    });

    root.addEventListener("pointermove", (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (!s.active) {
        if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy)) return;
        s.active = true;
        try { root.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer in tests */ }
      }
      s.dx = dx;
      const th = thresholdFor();
      root.style.transition = "none";
      root.style.transform = "translateX(" + dx + "px)";
      root.style.opacity = String(1 - 0.75 * Math.max(0, Math.min(1, Math.abs(dx) / th)));
    });

    root.addEventListener("pointerup", (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = s.dx || 0;
      const th = thresholdFor();
      const dir = dx <= -th ? "left" : dx >= th ? "right" : null;
      root.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
      if (dir) {
        const w = root.offsetWidth || 320;
        root.style.transform = "translateX(" + (dir === "left" ? -(w + 40) : (w + 40)) + "px)";
        root.style.opacity = "0";
        this._pendingSwipe = dir;
        setTimeout(() => {
          if (this._pendingSwipe !== dir) return;
          this._pendingSwipe = null;
          this.dispatchEvent(new CustomEvent("cmd-countdown-dismiss", {
            bubbles: true,
            composed: true,
            detail: { key: this.getAttribute("event-key") || "" }
          }));
        }, 200);
      } else {
        root.style.transform = "translateX(0)";
        root.style.opacity = "1";
      }
      s = null;
    });

    root.addEventListener("pointercancel", () => {
      if (!s) return;
      s = null;
      root.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
      root.style.transform = "translateX(0)";
      root.style.opacity = "1";
    });
  }
}

customElements.define("cmd-countdown-card", CmdCountdownCard);