const { test, expect } = require('@playwright/test');
const { mockFlaskApi } = require('./solar-fixtures');
const { startCoverage, stopCoverage } = require('./coverage');
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { delete Object.getPrototypeOf(navigator).serviceWorker; });
  await startCoverage(page);
});
test.afterEach(async ({ page }) => { await stopCoverage(page); });

test('Now diagram replaces the table and follows refreshed power readings', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockFlaskApi(page);
  await page.goto('/SolarControlar/', { waitUntil: 'domcontentloaded' });
  const diagram = page.locator('#tab-power solar-diagram');
  await expect(diagram).toBeVisible();
  await expect(page.locator('#tab-power table')).toHaveCount(0);
  await expect(diagram.locator('[data-node="inverter"] .solar-diagram__status')).toHaveText('ok');
  await expect(diagram.locator('[data-node="battery"] .solar-diagram__label')).toHaveText('Battery');
  await expect(diagram.locator('[data-node="battery"] svg rect')).toHaveCount(1);
  for (const [key, watts, direction] of [['solar', 300, 'incoming'], ['battery', 200, 'incoming'], ['grid', 300, 'incoming'], ['home', 500, 'outgoing']]) {
    await expect(diagram.locator(`[data-node="${key}"] .solar-diagram__value`)).toHaveText(`${watts} W`);
    await expect(diagram.locator(`[data-flow="${key}"]`)).toHaveAttribute('data-direction', direction);
  }
  await page.evaluate(() => { window.originalDiagram = document.querySelector('solar-diagram'); });
  await page.route('**/solar/api/power_data?*', route => route.fulfill({ json: {
    date: new URL(route.request().url()).searchParams.get('date'), times: ['09:30:00'],
    solar: [3100], grid: [-1200], battery: [-1000], home: [900], battery_level: [63]
  } }));
  await page.evaluate(() => refreshData());
  await expect(diagram.locator('[data-node="grid"] .solar-diagram__state')).toHaveText('Exporting');
  await expect(diagram.locator('[data-node="battery"] .solar-diagram__state')).toHaveText('Charging');
  await expect(diagram.locator('[data-node="grid"] .solar-diagram__value')).toHaveText('1,200 W');
  await expect(diagram.locator('[data-flow="grid"]')).toHaveAttribute('data-direction', 'outgoing');
  await expect(diagram.locator('[data-flow="battery"]')).toHaveAttribute('data-direction', 'outgoing');
  expect(await page.evaluate(() => originalDiagram === document.querySelector('solar-diagram'))).toBe(true);
  await expect(page.locator('#topTiles')).toHaveAttribute('power-time', '09:30:00');
  await page.evaluate(() => { _solarMainData.status = 'Standby'; renderPowerTab(); });
  await expect(diagram.locator('[data-node="inverter"] .solar-diagram__status')).toHaveText('Standby');
  expect(errors).toEqual([]);
});

test('diagram component supports signed inputs, idle, missing and reduced motion', async ({ page }) => {
  await mockFlaskApi(page);
  await page.goto('/SolarControlar/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await customElements.whenDefined('solar-diagram');
    const el = document.createElement('solar-diagram');
    el.id = 'standaloneDiagram';
    el.status = 'Waiting for power';
    el.flows = { solar: -20, battery: -250, home: -50, grid: -200 };
    document.body.appendChild(el);
  });
  const diagram = page.locator('#standaloneDiagram');
  await expect(diagram.locator('[data-node="inverter"] .solar-diagram__status')).toHaveText('Waiting for power');
  await page.evaluate(() => document.querySelector('#standaloneDiagram').setAttribute('status', '<b>Offline</b>'));
  await expect(diagram.locator('[data-node="inverter"] .solar-diagram__status')).toHaveText('<b>Offline</b>');
  await expect(diagram.locator('[data-node="inverter"] b')).toHaveCount(0);
  await page.evaluate(() => { document.querySelector('#standaloneDiagram').status = null; });
  await expect(diagram.locator('[data-node="inverter"] .solar-diagram__status')).toHaveText('Unknown');
  await expect(diagram.locator('[data-flow="solar"]')).toHaveAttribute('data-direction', 'outgoing');
  await expect(diagram.locator('[data-flow="home"]')).toHaveAttribute('data-direction', 'incoming');
  const before = await diagram.locator('[data-flow="grid"] .solar-diagram__arrow').evaluate(el => getComputedStyle(el).transform);
  await expect.poll(() => diagram.locator('[data-flow="grid"] .solar-diagram__arrow').evaluate(el => getComputedStyle(el).transform)).not.toBe(before);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await diagram.locator('[data-flow="grid"] .solar-diagram__arrow').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.evaluate(() => { document.querySelector('#standaloneDiagram').flows = { solar: 0, battery: null, home: undefined, grid: NaN }; });
  await expect(diagram.locator('[data-flow="solar"]')).toHaveAttribute('data-direction', 'idle');
  await expect(diagram.locator('[data-node="solar"] .solar-diagram__value')).toHaveText('0 W');
  for (const key of ['battery', 'home', 'grid']) {
    await expect(diagram.locator(`[data-flow="${key}"]`)).toHaveAttribute('data-direction', 'unknown');
    await expect(diagram.locator(`[data-node="${key}"] .solar-diagram__state`)).toHaveText('No data');
  }
  for (const key of ['solar', 'battery', 'home', 'grid']) {
    await expect(diagram.locator(`[data-flow="${key}"] .solar-diagram__arrow`)).toBeHidden();
  }
  await page.evaluate(() => {
    const el = document.querySelector('#standaloneDiagram');
    el.setAttribute('grid', '150'); el.battery = 75; el.home = 50; el.solar = 25;
  });
  await expect(diagram.locator('[data-node="grid"] .solar-diagram__state')).toHaveText('Importing');
  await expect(diagram.locator('[data-node="battery"] .solar-diagram__state')).toHaveText('Discharging');
});

test('diagram keeps the five positions and fits phone and desktop widths', async ({ page }) => {
  await mockFlaskApi(page);
  await page.goto('/SolarControlar/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('solar-diagram')).toBeVisible();
  await page.locator('solar-diagram').evaluate(el => { el.status = 'Waiting for power'; });
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const font of ['normal', 'jumbo']) {
      await page.evaluate(font => { document.body.classList.remove('font-size-normal', 'font-size-jumbo'); document.body.classList.add('font-size-' + font); }, font);
      const boxes = await page.locator('solar-diagram').evaluate(el => {
        const nodes = Object.fromEntries([...el.querySelectorAll('[data-node]')].map(n => {
          const r = n.getBoundingClientRect();
          return [n.dataset.node, { x: r.x + r.width / 2, y: r.y + r.height / 2, overflow: n.scrollWidth > n.clientWidth + 1 }];
        }));
        return { nodes, width: document.documentElement.scrollWidth };
      });
      const { solar, inverter, battery, grid, home } = boxes.nodes;
      expect(Math.abs(solar.x - inverter.x)).toBeLessThan(1);
      expect(Math.abs(home.x - inverter.x)).toBeLessThan(1);
      expect(solar.y).toBeLessThan(inverter.y);
      expect(home.y).toBeGreaterThan(inverter.y);
      expect(battery.x).toBeLessThan(inverter.x);
      expect(grid.x).toBeGreaterThan(inverter.x);
      expect(Math.abs(battery.y - inverter.y)).toBeLessThan(1);
      expect(Math.abs(grid.y - inverter.y)).toBeLessThan(1);
      expect(Object.values(boxes.nodes).some(n => n.overflow)).toBe(false);
      expect(boxes.width).toBeLessThanOrEqual(width);
    }
  }
});
