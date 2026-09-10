// Shared styles for the smd-/pmd- custom elements.
//
// Instead of each component embedding its own <style> copy of the same
// bootstrap-like primitives (btn, badge, badge colours, [hidden]), define
// them once as CONSTRUCTABLE CSSStyleSheets and adopt them into each shadow
// root. Adopted sheets:
//   - are shared (one sheet instance for every element),
//   - survive shadowRoot.innerHTML re-renders (unlike a <style> child),
//   - cascade in array order, so a component's own sheet placed last wins.
(function (global) {
  "use strict";

  var sheetCache = Object.create(null); // cssText -> CSSStyleSheet

  function sheetFor(css) {
    if (!sheetCache[css]) {
      var s = new CSSStyleSheet();
      s.replaceSync(css);
      sheetCache[css] = s;
    }
    return sheetCache[css];
  }

  // Adopt one or more sheets (or CSS strings) into root.adoptedStyleSheets.
  // Dedupes by sheet reference. Returns the root.
  function adoptStyles(root, cssOrSheets) {
    if (!root) return root;
    var items = Array.isArray(cssOrSheets) ? cssOrSheets : [cssOrSheets];
    var sheets = [];
    for (var i = 0; i < items.length; i++) {
      sheets.push(items[i] instanceof CSSStyleSheet ? items[i] : sheetFor(items[i]));
    }
    var merged = (root.adoptedStyleSheets || []).slice();
    var changed = false;
    for (var j = 0; j < sheets.length; j++) {
      if (merged.indexOf(sheets[j]) === -1) {
        merged.push(sheets[j]);
        changed = true;
      }
    }
    if (changed) root.adoptedStyleSheets = merged;
    return root;
  }

  var HIDDEN_CSS = "[hidden] { display: none !important; }";

  var BTN_BADGE_CSS = `
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-primary { background: var(--bs-primary, #0d6efd); color: #fff; }
  .btn-secondary { background: var(--bs-secondary, #6c757d); color: #fff; }
  .btn-danger { background: var(--bs-danger, #e74c3c); color: #fff; }
  .btn-info { background: var(--bs-info, #0dcaf0); color: #000; }
  .btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    line-height: 1.5;
  }
  .badge {
    display: inline-block;
    padding: 0.35em 0.65em;
    font-size: 0.75em;
    font-weight: 700;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
    border-radius: 0.375rem;
  }
  .bg-primary { background: var(--bs-primary, #0d6efd); color: var(--bs-emphasis-color, #fff); }
  .bg-success { background: var(--bs-success, #198754); color: var(--bs-emphasis-color, #fff); }
  .bg-info { background: var(--bs-info, #0dcaf0); color: var(--bs-emphasis-color, #000); }
  .bg-secondary { background: var(--bs-secondary, #6c757d); color: var(--bs-emphasis-color, #fff); }
`;

  global.SmdStyles = {
    sheetFor: sheetFor,
    adoptStyles: adoptStyles,
    hiddenSheet: sheetFor(HIDDEN_CSS),
    btnBadgeSheet: sheetFor(BTN_BADGE_CSS)
  };
})(window);