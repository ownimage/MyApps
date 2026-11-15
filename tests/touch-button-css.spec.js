// Generate only touch exceptions to the shared mode-layer idle-button reset.
// Vendor CSS is read-only. SMD_TOUCH_FIX=1 updates per-theme mode override blocks.
const { test, expect } = require('./functional-test');
const { applyThemeAndWait } = require('./theme-controls');
const fs = require('fs');
const path = require('path');
const directory = path.join(__dirname, '../shared/css/themes');
const themes = fs.readdirSync(directory, {withFileTypes:true}).filter(e => e.isDirectory()).map(e => e.name);
const variants = ['primary','secondary','success','danger','warning','info','light','dark']
  .flatMap(v => [v, 'outline-'+v]);
const properties = ['color','background-color','background-image','border-color','box-shadow','transform'];
const strip = css => css.replace(/\n?\/\* smd-touch:start \*\/[\s\S]*?\/\* smd-touch:end \*\/\n?/g, '');
function block(idle, hovered) {
  const groups = new Map();
  idle.forEach((paint, i) => {
    const declarations = properties.filter(p => paint[p] !== hovered[i][p])
      .map(p => `    ${p}: ${paint[p]} !important;`).join('\n');
    if (!declarations) return;
    if (!groups.has(declarations)) groups.set(declarations, []);
    groups.get(declarations).push(`  .btn-${variants[i]}:where(:not(.btn-check + .btn)):hover:not(:active):not(.active):not(.show):not(:focus-visible):not(:disabled):not(.disabled)`);
  });
  if (!groups.size) return '';
  return '\n/* smd-touch:start */\n/* Idle paint for retained touch hover; mouse, focus and pressed states stay native. */\n@media (hover: none) {\n' +
    [...groups].map(([declarations, selectors]) => selectors.join(',\n') + ' {\n' + declarations + '\n  }').join('\n') +
    '\n}\n/* smd-touch:end */\n';
}
test.use({hasTouch:true,isMobile:true});
test('touch idle overrides match the rendered themes', async ({page}) => {
  test.setTimeout(180000);
  await page.route('**/css/themes/**', route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).split('/css/themes/')[1];
    const file = path.join(directory, relative || '');
    if (!relative || !fs.existsSync(file)) return route.continue();
    return route.fulfill({contentType:'text/css',body:strip(fs.readFileSync(file,'utf8'))});
  });
  await page.goto('/ListOfLists/');
  await page.addStyleTag({content:'* {transition:none!important;animation:none!important}'});
  await page.evaluate(variants => {
    const host = document.createElement('div'); host.id = 'touchCssProbe';
    host.innerHTML = variants.map(v => `<button class="btn btn-${v}">Button</button>`).join('');
    document.body.appendChild(host);
  },variants);
  const client = await page.context().newCDPSession(page);
  await client.send('DOM.enable'); await client.send('CSS.enable');
  const {root} = await client.send('DOM.getDocument');
  const {nodeIds} = await client.send('DOM.querySelectorAll',{nodeId:root.nodeId,selector:'#touchCssProbe button'});
  const paint = () => page.locator('#touchCssProbe button').evaluateAll((buttons, props) => buttons.map(button => {
    const style = getComputedStyle(button);
    return Object.fromEntries(props.map(p => [p,style.getPropertyValue(p)]));
  }), properties);
  const differences = [];
  for (const theme of themes) for (const mode of ['light','dark']) {
    await applyThemeAndWait(page,theme,mode);
    const idle = await paint();
    for (const nodeId of nodeIds) await client.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['hover']});
    const expected = block(idle,await paint());
    for (const nodeId of nodeIds) await client.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
    const file = path.join(directory,theme,`${theme}.${mode}.css`);
    const original = fs.readFileSync(file,'utf8');
    const current = original.match(/\n?\/\* smd-touch:start \*\/[\s\S]*?\/\* smd-touch:end \*\/\n?/)?.[0] || '';
    if (current.replace(/\r\n/g,'\n') === expected) continue;
    if (process.env.SMD_TOUCH_FIX === '1') fs.writeFileSync(file,strip(original).trimEnd()+'\n'+expected);
    else differences.push(theme+'/'+mode);
  }
  expect(differences, 'Run SMD_TOUCH_FIX=1 with this spec to regenerate mode-sheet touch exceptions').toEqual([]);
});
