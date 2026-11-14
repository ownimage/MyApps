const { test, expect } = require('./functional-test');
const { startSolarWebServer } = require('./solar-web-fixture');
const { mockFlaskApi } = require('./solar-fixtures');
let server;
test.beforeAll(async () => { server = await startSolarWebServer(); });
test.afterAll(async () => { if (server) await server.stop(); });

test('Flask serves the shared UI with server-only controls and local API', async ({page}) => {
  const errors = [], failed = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => {
    // Chromium reports redirect:manual POSTs as aborted after accepting the 302.
    if (request.failure().errorText === 'net::ERR_ABORTED' && (request.method() === 'POST' || request.redirectedFrom()?.method() === 'POST')) return;
    failed.push(request.url() + ': ' + request.failure().errorText);
  });
  page.on('request', request => requests.push(request));
  await page.addInitScript(() => {
    localStorage.setItem('solarcontrolar_flaskUrl', 'https://wrong.invalid/solar');
    localStorage.setItem('solarcontrolar_flaskUser', 'stale-user');
    localStorage.setItem('solarcontrolar_flaskPass', 'stale-password');
  });
  await page.goto(server.url + '/solar/');
  await expect(page.locator('solar-diagram')).toBeVisible();
  await expect(page.locator('#batteryPercent')).toHaveText('50%');
  await expect(page.locator('#appNavTitle')).toHaveText('Solar Controlar');
  await page.locator('#btnMainMenu').click();
  await expect(page.locator('.dropdown-menu')).toBeVisible();
  await expect(page.locator('.dropdown-menu a')).toHaveText(['Settings', 'Refresh Data']);
  await page.locator('.dropdown-menu a').filter({hasText:/^Settings$/}).click();
  await expect(page.locator('#autoRefresh')).toBeVisible();
  await expect(page.locator('#flaskUrlInput, #flaskUserInput, #flaskPassInput')).toHaveCount(0);
  await page.evaluate(() => closeSettings());
  await expect(page.locator('#settingsPage')).toBeHidden();
  await page.locator('#mainTabs .smd-tab-btn').filter({hasText:/^Settings$/}).click();
  await expect(page.locator('#slider-tolerance_percent')).toHaveValue('0.8');
  await page.locator('#slider-tolerance_percent').fill('1.2');
  await page.locator('#solarSettingsForm button').click();
  await expect.poll(() => page.evaluate(() => _solarSettings && _solarSettings.find(f => f.key === 'tolerance_percent').original)).toBe('1.2');
  await page.locator('#mainTabs .smd-tab-btn').filter({hasText:/^Config$/}).click();
  await expect(page.locator('#configSlider')).toHaveValue('73');
  await page.locator('#configSlider').fill('74');
  await page.locator('#configForm button').click();
  await expect.poll(() => page.evaluate(() => _configData && _configData.charge_to_percentage)).toBe(74);
  const api = requests.filter(request => /\/api\/|\/solar\/$/.test(new URL(request.url()).pathname) && request.resourceType() === 'fetch');
  expect(api.length).toBeGreaterThan(3);
  for (const request of api) {
    expect(new URL(request.url()).origin).toBe(server.url);
    expect(request.headers().authorization).toBeUndefined();
  }
  expect(requests.some(request => request.url().includes('/sw.js'))).toBe(false);
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test('MyApps retains Launch and editable Flask connection settings', async ({page}) => {
  await mockFlaskApi(page);
  await page.goto('/SolarControlar/', {waitUntil:'domcontentloaded'});
  await page.locator('#btnMainMenu').click();
  await expect(page.locator('.launch-submenu-toggle')).toBeVisible();
  await page.locator('.dropdown-menu a').filter({hasText:/^Settings$/}).click();
  await expect(page.locator('#flaskUrlInput')).toBeVisible();
  await expect(page.locator('#flaskUserInput')).toBeVisible();
  await expect(page.locator('#flaskPassInput')).toBeVisible();
});

test('Flask UI works at the direct root and an alternate proxy prefix', async ({page}) => {
  for (const prefix of ['', '/energy']) {
    await page.setExtraHTTPHeaders(prefix ? {'X-Forwarded-Prefix':prefix} : {});
    await page.goto(server.url + prefix + '/');
    await expect(page.locator('#batteryPercent')).toHaveText('50%');
    await expect(page.locator('#mainTabs .smd-tab-btn')).toHaveCount(7);
    await page.evaluate(() => openSettings());
    await expect(page.locator('#autoRefresh')).toBeVisible();
    await expect(page.locator('#flaskUrlInput')).toHaveCount(0);
  }
});

test.describe('Flask worker isolation', () => {
  test.use({offlineCache:true});
  test('hosted UI does not register the MyApps offline bundle', async ({page}) => {
    await page.goto(server.url + '/solar/');
    await expect(page.locator('#batteryPercent')).toHaveText('50%');
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  });
});
