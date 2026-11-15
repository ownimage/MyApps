const { test, expect } = require('./functional-test');
const { applyThemeAndWait } = require('./theme-controls');
const fs = require('fs');
const path = require('path');
const THEMES = fs.readdirSync(path.join(__dirname, '../shared/css/themes'), { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => entry.name);
// Read edited theme sheets directly: a reused preview server may cache CSS.
test.beforeEach(async ({ page }) => {
  await page.route('**/css/themes/**', route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).split('/css/themes/')[1];
    const file = path.join(__dirname, '../shared/css/themes', relative || '');
    if (!relative || !fs.existsSync(file)) return route.continue();
    return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(file, 'utf8') });
  });
});
const paint = locator => locator.evaluate(el => {
  const style = getComputedStyle(el);
  return Object.fromEntries(['color', 'backgroundColor', 'backgroundImage', 'borderColor', 'boxShadow', 'transform']
    .map(property => [property, style[property]]));
});
async function openNewList(page, theme, mode = 'light') {
  await page.goto('/ListOfLists/');
  await applyThemeAndWait(page, theme, mode);
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
  await page.evaluate(() => {
    localStorage.setItem('lol_categories', JSON.stringify([{ title: 'Test', lists: [] }]));
    listsCategoryIndex = 0;
    addNewList();
  });
  await page.locator('#listTitleInput').fill('Title');
}
test.describe('Touch button appearance', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 620, height: 850 } });
  for (const theme of ['superhero', 'brite']) {
    test(`Add List Item retains idle appearance - ${theme}`, async ({ page }) => {
      await openNewList(page, theme);
      const bottom = page.locator('#listAddItemBottomBtn');
      const idle = await paint(bottom);
      await bottom.tap();
      await expect(page.locator('input.item-desc-input')).toBeFocused();
      expect(await paint(bottom)).toEqual(idle);
      expect(await paint(page.locator('#listAddItemBtn'))).toEqual(idle);
      await page.locator('input.item-desc-input').fill('First item');
      await bottom.tap();
      await expect(page.locator('input.item-desc-input').last()).toBeFocused();
      expect(await paint(bottom)).toEqual(idle);
    });
  }
  for (const theme of THEMES) {
    test(`retained hover leaves all button variants unchanged - ${theme}`, async ({ page }) => {
      await page.goto('/ListOfLists/');
      await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
      await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.id = 'touchButtonProbe';
        for (const variant of ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark']) {
          for (const prefix of ['', 'outline-']) {
            const button = document.createElement('button');
            button.className = `btn btn-${prefix}${variant}`;
            button.textContent = variant;
            probe.appendChild(button);
          }
        }
        document.body.appendChild(probe);
      });
      const client = await page.context().newCDPSession(page);
      await client.send('DOM.enable');
      await client.send('CSS.enable');
      const { root } = await client.send('DOM.getDocument');
      const { nodeIds } = await client.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '#touchButtonProbe button' });
      const paints = () => page.locator('#touchButtonProbe button').evaluateAll(buttons => buttons.map(button => {
        const style = getComputedStyle(button);
        return Object.fromEntries(['color', 'backgroundColor', 'backgroundImage', 'borderColor', 'boxShadow', 'transform']
          .map(property => [property, style[property]]));
      }));
      for (const mode of ['light', 'dark']) {
        await applyThemeAndWait(page, theme, mode);
        const idle = await paints();
        for (const nodeId of nodeIds) await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
        expect(await paints(), `${theme}/${mode}`).toEqual(idle);
        for (const nodeId of nodeIds) await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
      }
    });
  }
});
test.describe('Mouse button appearance', () => {
  for (const theme of ['superhero', 'brite']) {
    test(`real hover still changes the button - ${theme}`, async ({ page }) => {
      await openNewList(page, theme);
      const bottom = page.locator('#listAddItemBottomBtn');
      await page.mouse.move(0, 0);
      const idle = await paint(bottom);
      await bottom.hover();
      expect(await paint(bottom)).not.toEqual(idle);
      await page.mouse.move(0, 0);
      expect(await paint(bottom)).toEqual(idle);
      await bottom.focus();
      await expect(bottom).toBeFocused();
      expect(await bottom.evaluate(el => el.matches(':focus-visible'))).toBe(true);
    });
  }
});
