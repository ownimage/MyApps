// <lol-list-main-card> — a single list row on the main list (light DOM).
//
// Owns its own layout (category/list thumbnails, title, category title, View
// button, description). The host carries the light-DOM class the app sets on the
// element, so the document theme styles the card chrome while the content lives
// in the light DOM with it. All layout is Bootstrap utilities in the template;
// the card's own minimal functional CSS (done state, compact title hook, swipe
// touch-action, card margin) is injected into the document head once by this
// module.
//
// There is NO drag handle and NO Sortable here: the main list is NOT reorderable.
//
// Attributes:
//   list-id        — list id (echoed on lol-list-main-delete)
//   category-idx    — category index (echoed on lol-list-main-view)
//   list-idx       — list index (echoed on lol-list-main-view)
//   title         — list title
//   done          — presence dims the card + strikes through the title
//   category-image  — category image name (rendered via smd-image)
//   list-image     — list image name (rendered via smd-image)
//   category-title  — category title shown under the category thumbnail, on the badge row
//   description   — optional description line
//   key-prefix    — smd-image storage prefix (default: SmdConfig.imagePrefix)
//
// Events:
//   lol-list-main-view   — detail { categoryIdx, listIdx }
//   lol-list-main-delete — horizontal swipe LEFT past the threshold (detail { listId, categoryIdx, listIdx });
//                      the card animates off before this fires — the app opens the delete confirm.
//   Methods:
//   snapBackSwipe() — slide a swiped-out card back into place (used when a delete confirm is cancelled).

(function (global) {
  if (global.document.getElementById("lol-list-main-card-style")) return;
  const s = global.document.createElement("style");
  s.id = "lol-list-main-card-style";
  s.textContent =
    "lol-list-main-card {" +
    "  --lol-main-title-size: var(--smd-type-h2, 1.25em);" +
    "  display: block;" +
    "  touch-action: pan-y;" +
    "}" +
    "body.compact lol-list-main-card {" +
    "  --lol-main-title-size: var(--smd-type-p, 1em);" +
    "}" +
    "lol-list-main-card[done] { opacity: 0.5; }" +
    "lol-list-main-card[done] .list-title { text-decoration: line-through; }" +
    "lol-list-main-card .list-title {" +
    "  min-width: 0;" +
    "  font-size: var(--lol-main-title-size, var(--smd-type-h2, 1.25em));" +
    "}" +
    "lol-list-main-card .description {" +
    "  display: -webkit-box;" +
    "  -webkit-box-orient: vertical;" +
    "  -webkit-line-clamp: 2;" +
    "  overflow: hidden;" +
    "}";
  global.document.head.appendChild(s);
})(window);

const lolListMainCardTemplate = document.createElement('template');
lolListMainCardTemplate.innerHTML = `
    <div class="card smd-card border-0 w-100">

        <div class="d-flex py-2 border rounded-3">

            <!-- Category / List / Category Name -->
            <div class="d-flex flex-column flex-shrink-0 images-col align-self-start ms-2">
                <div class="d-flex gap-1">
                    <div class="thumb category-thumb d-flex align-items-center justify-content-center flex-shrink-0"><smd-image key-prefix="shared-"></smd-image></div>
                    <div class="thumb list-thumb d-flex align-items-center justify-content-center flex-shrink-0"><smd-image key-prefix="shared-"></smd-image></div>
                </div>
                <span class="category-title text-truncate d-block mb-0 small fw-semibold"></span>
            </div>

            <div class="d-flex flex-column flex-grow-1 overflow-hidden ms-2">

                <!-- FULL-WIDTH TITLE -->
                <div class="d-flex align-items-center">
                    <smd-h2 class="list-title text-truncate fw-bold mb-0"></smd-h2>
                </div>

                <!-- TWO-COLUMN ROW UNDER TITLE -->
                <div class="d-flex flex-grow-1">

                    <!-- LEFT COLUMN: Description hogs space -->
                    <div class="flex-grow-1 d-flex flex-column">
                        <div class="flex-grow-1 description small text-body" hidden></div>
                    </div>

                    <!-- RIGHT COLUMN: Badges + View aligned bottom -->
                    <div class="d-flex flex-column justify-content-end text-end flex-shrink-0">
                        <div class="d-flex align-items-center gap-2 me-2">
                            <smd-button class="list-view-btn flex-shrink-0" variant="primary" size="small" title="View list">View</smd-button>
                        </div>
                    </div>

                </div>
            </div>
        </div>

    </div>
`;

class LolListMainCard extends HTMLElement {
  static get observedAttributes() {
    return ['list-id', 'title', 'done',
      'category-image', 'list-image', 'category-title', 'description', 'key-prefix'];
  }

  constructor() {
    super();
    this._bound = false;
  }

  connectedCallback() {
    // `cloneNode` copies attributes (including the `data-smd-built` marker) but
    // NOT the `_bound` JS property: without the marker a re-connected clone would
    // append the template a SECOND time and show doubled content.
    if (!this._bound && !this.hasAttribute("data-smd-built")) {
      this._bound = true;
      this.setAttribute("data-smd-built", "");
      this.classList.add("d-block");
      this.appendChild(lolListMainCardTemplate.content.cloneNode(true));
      this.querySelector('.list-view-btn').addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('lol-list-main-view', {
          bubbles: true,
          composed: true,
          detail: {
            categoryIdx: parseInt(this.getAttribute('category-idx'), 10),
            listIdx: parseInt(this.getAttribute('list-idx'), 10)
          }
        }));
      });
      this._setupSwipe();
    }
    this._bound = true;
    this._render();
  }

  attributeChangedCallback() {
    if (this._bound && this.isConnected) this._render();
  }

  _setupSwipe() {
    if (this._swipeBound) return;
    this._swipeBound = true;
    const root = this;
    let s = null;

    const thresholdFor = () => {
      const w = root.offsetWidth || 320;
      return Math.min(120, Math.max(60, w * 0.25));
    };

    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      s = { id: e.pointerId, startX: e.clientX, startY: e.clientY, active: false };
    });

    root.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (!s.active) {
        if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy)) return;
        s.active = true;
        this._suppressClick = true;
        try { root.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer in tests */ }
      }
      s.dx = dx;
      const th = thresholdFor();
      root.style.transition = 'none';
      root.style.transform = 'translateX(' + dx + 'px)';
      root.style.opacity = String(1 - 0.75 * Math.max(0, Math.min(1, Math.abs(dx) / th)));
    });

    root.addEventListener('pointerup', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = s.dx || 0;
      const th = thresholdFor();
      const dir = dx <= -th ? 'left' : null;
      root.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
      if (dir) {
        const w = root.offsetWidth || 320;
        root.style.transform = 'translateX(' + (dir === 'left' ? -(w + 40) : (w + 40)) + 'px)';
        root.style.opacity = '0';
        this._pendingSwipe = dir;
        setTimeout(() => {
          if (this._pendingSwipe !== dir) return;
          this._pendingSwipe = null;
          this.dispatchEvent(new CustomEvent('lol-list-main-delete', {
            bubbles: true,
            composed: true,
            detail: {
              listId: this.getAttribute('list-id') || '',
              categoryIdx: parseInt(this.getAttribute('category-idx'), 10),
              listIdx: parseInt(this.getAttribute('list-idx'), 10)
            }
          }));
        }, 200);
      } else {
        root.style.transform = 'translateX(0)';
        root.style.opacity = '1';
      }
      s = null;
      if (this._suppressClick) {
        setTimeout(() => { this._suppressClick = false; }, 500);
      }
    });

    root.addEventListener('pointercancel', () => {
      if (s) {
        s = null;
        this.snapBackSwipe();
      }
    });

    // consume the (late) click that a completed swipe would otherwise deliver to
    // whatever was under the finger — e.g. toggling the checkbox or opening View.
    root.addEventListener('click', (e) => {
      if (!this._suppressClick) return;
      e.stopPropagation();
      e.preventDefault();
      this._suppressClick = false;
    }, true);
  }

  // Slide a swiped-out card back into place (cancelled delete confirm, or a
  // pointercancel mid-swipe).
  snapBackSwipe() {
    this._pendingSwipe = null;
    this.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
    this.style.transform = 'translateX(0)';
    this.style.opacity = '1';
  }

  _render() {
    const root = this;
    const keyPrefix = this.getAttribute('key-prefix') || smdImagePrefix();

    root.querySelector('.list-title').textContent = this.getAttribute('title') || '';

    const setThumb = (selector, name) => {
      const thumb = root.querySelector(selector);
      const sImg = thumb.querySelector('smd-image');
      sImg.setAttribute('key-prefix', keyPrefix);
      // The thumb wrapper always stays in place (even with no image) so the
      // list thumbnail keeps its slot and list images line up across cards.
      if (name) {
        sImg.setAttribute('image', name);
      } else {
        sImg.removeAttribute('image');
      }
    };
    setThumb('.category-thumb', this.getAttribute('category-image') || '');
    setThumb('.list-thumb', this.getAttribute('list-image') || '');

    root.querySelector('.category-title').textContent = this.getAttribute('category-title') || '';

    const descEl = root.querySelector('.description');
    const description = this.getAttribute('description') || '';
    if (description) {
      descEl.textContent = description;
      descEl.hidden = false;
    } else {
      descEl.hidden = true;
    }
  }
}

if (!window.customElements.get('lol-list-main-card')) {
  customElements.define('lol-list-main-card', LolListMainCard);
}
window.LolListMainCard = LolListMainCard;