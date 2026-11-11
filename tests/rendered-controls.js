// Read actual rendered states; theme variables alone do not describe Bootswatch
// rules such as Morph's body-coloured hover or Slate's per-state gradients.
const clients = new WeakMap();
async function measureRenderedControls(page, root) {
  let client = clients.get(page);
  if (!client) {
    client = await page.context().newCDPSession(page);
    await client.send('DOM.enable');
    await client.send('CSS.enable');
    clients.set(page, client);
  }
  await page.evaluate(root => {
    if (!document.getElementById('rendered-control-measure-style')) {
      const style=document.createElement('style');style.id='rendered-control-measure-style';
      style.textContent='[id^="contrast"] *, #contrastCssBorders *, #contrastCssSelect * { transition: none !important; animation: none !important; }';
      document.head.appendChild(style);
    }
  },root);
  const { root: doc } = await client.send('DOM.getDocument');
  const { nodeIds } = await client.send('DOM.querySelectorAll', {
    nodeId: doc.nodeId, selector: root + ' .btn, ' + root + ' .smd-tab-btn, #contrastCssBorders .form-control, #contrastCssSelect .smd-select-btn'
  });
  const result = {};
  try {
    for (const state of ['base', 'hover', 'focus', 'active', 'disabled']) {
      await page.evaluate(({root, state}) => {
        document.querySelectorAll(root + ' .btn').forEach(el => { el.disabled = state === 'disabled'; });
      }, {root, state});
      const forcedPseudoClasses = state === 'hover' ? ['hover'] : state === 'focus' ? ['focus', 'focus-visible'] : state === 'active' ? ['hover', 'active'] : [];
      await Promise.all(nodeIds.map(nodeId => client.send('CSS.forcePseudoState', {nodeId, forcedPseudoClasses})));
      result[state] = await page.evaluate(root => {
        const ctx = document.createElement('canvas').getContext('2d');
        const rgba = color => {
          ctx.clearRect(0,0,1,1); ctx.fillStyle = color; ctx.fillRect(0,0,1,1);
          return [...ctx.getImageData(0,0,1,1).data].map((v,i) => i === 3 ? v/255 : v);
        };
        const over = (a,b) => a.slice(0,3).map((v,i) => v*a[3]+b[i]*(1-a[3])).concat(1);
        const cache = new Map();
        function surfaces(el, flat = false) {
          if (!el) return [[255,255,255,1]];
          if (!flat && cache.has(el)) return cache.get(el);
          const cs = getComputedStyle(el);
          let colors = surfaces(el.parentElement).map(c => over(rgba(cs.backgroundColor),c));
          const stops = flat ? [] : cs.backgroundImage.match(/rgba?\([^)]+\)|color\([^)]+\)|#[\da-f]{3,8}/gi) || [];
          if (stops.length) colors = colors.flatMap(c => stops.map(stop => over(rgba(stop),c)));
          colors = [...new Map(colors.map(c => [JSON.stringify(c),c])).values()];
          if (!flat) cache.set(el,colors);
          return colors;
        }
        const paint = el => {
          const cs = getComputedStyle(el);
          return {color:cs.color, foreground:rgba(cs.color), surfaces:surfaces(el), flatSurfaces:surfaces(el,true), image:cs.backgroundImage};
        };
        const buttons = {}, tabs = {}, badges = {};
        document.querySelectorAll(root + ' .btn').forEach(el => {
          const variant = [...el.classList].find(c => /^btn-(primary|secondary|success|danger|warning|info|light|dark)$/.test(c));
          if (variant) buttons[variant.slice(4)] = paint(el);
        });
        document.querySelectorAll(root + ' .smd-tab-btn').forEach(el => {
          tabs[el.classList.contains('text-bg-primary') ? 'primary' : 'secondary'] = paint(el);
        });
        document.querySelectorAll(root + ' .badge').forEach(el => {
          const variant = [...el.classList].find(c => c.startsWith('text-bg-'));
          if (variant) badges[variant.slice(8)] = paint(el);
        });
        const cs = getComputedStyle(document.body);
        const fields = {}, selectItems = {};
        const input = document.querySelector('#contrastCssBorders .form-control');
        const select = document.querySelector('#contrastCssSelect .smd-select-btn');
        if(input) fields.input = paint(input);
        if(select) fields.select = paint(select);
        document.querySelectorAll('#contrastCssSelect .smd-select-item').forEach(el => {
          selectItems[el.classList.contains('active') ? 'selected' : 'normal'] = paint(el);
        });
        return {buttons,tabs,badges,fields,selectItems,bodyColor:rgba(cs.color),bodyBg:rgba(cs.backgroundColor)};
      }, root);
    }
    return result;
  } finally {
    await page.evaluate(root => document.querySelectorAll(root + ' .btn').forEach(el => { el.disabled = false; }),root);
    await Promise.all(nodeIds.map(nodeId => client.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]})));
  }
}
module.exports = { measureRenderedControls };
