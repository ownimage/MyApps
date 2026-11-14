const { test, expect } = require('@playwright/test');
const { mockFlaskApi } = require('./solar-fixtures');
const { startCoverage, stopCoverage } = require('./coverage');
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { delete Object.getPrototypeOf(navigator).serviceWorker; });
  await startCoverage(page);
});
test.afterEach(async ({ page }) => { await stopCoverage(page); });

test('Solar extracted tiles render independently and update their own inputs', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockFlaskApi(page);
  await page.goto('/SolarControlar/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#topTiles')).toHaveJSProperty('tagName', 'SOLAR-TILES');
  await expect(page.locator('#tab-power solar-diagram')).toBeVisible();
  await expect(page.locator('#topTiles solar-date-tile #dateDay')).toHaveText('15');
  await expect(page.locator('#topTiles solar-time-tile .flap-card')).toHaveText(['0','8','0','0','0','0']);
  await expect(page.locator('#topTiles solar-battery-tile #batteryPercent')).toHaveText('50%');
  await page.evaluate(() => {
    const examples = document.createElement('div');
    examples.id = 'tileExamples';
    examples.style.width = '300px';
    for (const [tag, value] of [['solar-date-tile','2026-09-15'], ['solar-time-tile','12:34:56'], ['solar-battery-tile',75]]) {
      const el = document.createElement(tag);
      el.value = value;
      examples.appendChild(el);
    }
    document.body.appendChild(examples);
  });
  const examples = page.locator('#tileExamples');
  await expect(examples.locator('solar-date-tile #dateDay')).toHaveText('15');
  await expect(examples.locator('solar-time-tile .flap-card')).toHaveText(['1','2','3','4','5','6']);
  await expect(examples.locator('solar-battery-tile #batteryPercent')).toHaveText('75%');
  await examples.locator('solar-date-tile').evaluate(el => { el.value = '2026-10-02'; });
  await examples.locator('solar-time-tile').evaluate(el => el.setAttribute('power-time', '01:02:03'));
  await examples.locator('solar-battery-tile').evaluate(el => { el.value = 0; });
  await expect(examples.locator('solar-date-tile #dateMonth')).toHaveText('Oct');
  await expect(examples.locator('solar-date-tile #dateDay')).toHaveText('02');
  await expect(examples.locator('solar-time-tile .flap-card')).toHaveText(['0','1','0','2','0','3']);
  await expect(examples.locator('solar-battery-tile #batteryPercent')).toHaveText('0%');
  await examples.locator('solar-battery-tile').evaluate(el => { el.value = null; });
  await expect(examples.locator('solar-battery-tile #batteryPercent')).toHaveText('Unknown');
  await examples.locator('solar-time-tile').evaluate(el => { el.value = null; });
  await expect(examples.locator('solar-time-tile .flap-card')).toHaveText(['-','-','-','-','-','-']);
  expect(errors).toEqual([]);
});

test('Solar Now follows orientation while preserving live component instances', async ({ page }) => {
  await mockFlaskApi(page);
  await page.goto('/SolarControlar/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tab-power solar-diagram')).toBeVisible();
  await page.evaluate(() => { window.solarInstances = [...document.querySelectorAll('solar-tiles, solar-date-tile, solar-time-tile, solar-battery-tile, solar-diagram')]; });
  for (const [width,height] of [[1280,800],[390,844],[844,390],[800,800]]) {
    await page.setViewportSize({width,height});
    const layout = await page.evaluate(() => {
      const rect = el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,centerY:r.y+r.height/2}; };
      return {tiles:rect(document.querySelector('#topTiles')),diagram:rect(document.querySelector('solar-diagram')),
        cards:[...document.querySelectorAll('#topTiles .tile')].map(rect),scrollWidth:document.documentElement.scrollWidth,
        same:solarInstances.every((el,i) => el === document.querySelectorAll('solar-tiles, solar-date-tile, solar-time-tile, solar-battery-tile, solar-diagram')[i])};
    });
    expect(layout.same).toBe(true);
    expect(layout.scrollWidth).toBeLessThanOrEqual(width);
    expect(Math.max(...layout.cards.map(c=>c.width))-Math.min(...layout.cards.map(c=>c.width))).toBeLessThan(1);
    if (width > height) {
      expect(layout.tiles.right).toBeLessThanOrEqual(layout.diagram.x);
      expect(layout.cards[0].bottom).toBeLessThan(layout.cards[1].y);
      expect(layout.cards[1].bottom).toBeLessThan(layout.cards[2].y);
      expect(Math.abs(layout.tiles.centerY-layout.diagram.centerY)).toBeLessThan(1);
    } else {
      expect(new Set(layout.cards.map(c=>Math.round(c.y))).size).toBe(1);
      expect(layout.tiles.bottom).toBeLessThanOrEqual(layout.diagram.y);
    }
  }
  await page.evaluate(() => refreshData());
  await expect(page.locator('#topTiles solar-battery-tile #batteryPercent')).toHaveText('50%');
});

test('Solar Storybook exposes five working component demos', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(request.url()));
  await page.goto('/storybook/');
  for (const name of ['solar-diagram','solar-tiles','solar-date-tile','solar-time-tile','solar-battery-tile']) {
    await expect(page.locator(`nav.sb-nav a[href="#${name}"]`)).toHaveCount(1);
    await expect(page.locator(`#${name} ${name}`)).toBeVisible();
  }
  await expect(page.locator('#solar-diagram [data-node=inverter] .solar-diagram__status')).toHaveText('ok');
  await page.locator('#solar-diagram-reverse button').click();
  await expect(page.locator('#solar-diagram [data-node=grid] .solar-diagram__state')).toHaveText('Exporting');
  await page.locator('#solar-tiles-stacked').check();
  expect(await page.locator('#solar-tiles solar-tiles').evaluate(el=>getComputedStyle(el.querySelector('.solar-tiles__grid')).gridTemplateColumns.split(' ').length)).toBe(1);
  await page.locator('#solar-date-input').fill('2026-10-02');
  await expect(page.locator('#solar-date-tile #dateDay')).toHaveText('02');
  await page.locator('#solar-time-input').fill('01:02:03');
  await expect(page.locator('#solar-time-tile .flap-card')).toHaveText(['0','1','0','2','0','3']);
  await page.locator('#solar-battery-input').fill('25');
  await expect(page.locator('#solar-battery-tile #batteryPercent')).toHaveText('25%');
  expect(errors).toEqual([]);
});
