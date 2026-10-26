// <sb-sticker-gallery> - the grid of <sb-sticker> tiles in the Stickers fly-out.
//
// DATA-driven: the host app assigns `stickers = [{id, name, src, source}]` and
// the gallery keeps one <sb-sticker> per id, updating attributes IN PLACE. That
// matters for the OneDrive tabs: ~30 images resolve one at a time while the
// panel is open, and re-rendering the whole grid for each one would throw away
// the tiles the user is already looking at (and every decoded image with them).
//
// The grid markup/classes are the same ones the panel used before, so
// storyboard.css and the existing sticker tests keep working.
class SbStickerGallery extends HTMLElement {
  connectedCallback() {
    // An assignment made BEFORE this element upgraded lands as an own property
    // that shadows the accessor (the smd-checkbox gotcha); fold it back.
    if (Object.prototype.hasOwnProperty.call(this, "stickers")) {
      var pending = this.stickers;
      delete this.stickers;
      this._stickers = Array.isArray(pending) ? pending : [];
    }
    if (!this.hasAttribute("data-smd-built")) {
      this.setAttribute("data-smd-built", "");
      this._build();
    }
    this._apply();
  }

  set stickers(list) {
    this._stickers = Array.isArray(list) ? list.slice() : [];
    if (this._grid) this._apply();
  }

  get stickers() {
    return (this._stickers || []).slice();
  }

  set emptyText(text) {
    this._emptyText = String(text == null ? "" : text);
    if (this._empty) this._empty.textContent = this._emptyText;
  }

  get emptyText() {
    return this._emptyText || "";
  }

  _build() {
    var grid = document.createElement("div");
    grid.className = "sb-sticker-grid";
    var empty = document.createElement("p");
    empty.className = "sb-panel-note sb-gallery-empty";
    empty.textContent = this._emptyText || "No stickers in this folder yet.";
    empty.hidden = true;

    this.textContent = "";
    this.appendChild(grid);
    this.appendChild(empty);
    this._grid = grid;
    this._empty = empty;
    this._tiles = {};
  }

  _apply() {
    if (!this._grid) return;
    var grid = this._grid;
    var tiles = this._tiles || (this._tiles = {});
    var wanted = this._stickers || [];
    var seen = {};

    wanted.forEach(function (item, index) {
      var id = String((item && item.id) || "");
      if (!id) return;
      seen[id] = true;
      var tile = tiles[id];
      if (!tile) {
        tile = document.createElement("sb-sticker");
        tile.setAttribute("sticker-id", id);
        tiles[id] = tile;
      }
      tile.setAttribute("name", (item && item.name) || "");
      tile.setAttribute("source", (item && item.source) || "");
      if (item && item.src) tile.setAttribute("src", item.src);
      else tile.removeAttribute("src");
      var at = grid.children[index];
      if (at !== tile) grid.insertBefore(tile, at || null);
    });

    Object.keys(tiles).forEach(function (id) {
      if (seen[id]) return;
      var tile = tiles[id];
      if (tile.parentNode) tile.parentNode.removeChild(tile);
      delete tiles[id];
    });

    if (this._empty) this._empty.hidden = wanted.length > 0;
  }
}

customElements.define("sb-sticker-gallery", SbStickerGallery);
