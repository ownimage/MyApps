const { test, expect } = require('./functional-test');
const { mockFlaskApi } = require('./solar-fixtures');
const { startCoverage, stopCoverage } = require('./coverage');

test.beforeEach(async ({page}) => { await startCoverage(page); });
test.afterEach(async ({page}) => { await stopCoverage(page); });
const tab = (page, name) => page.locator('#mainTabs').getByRole('tab', {name, exact:true}).click();

async function openDashboard(page) {
  await mockFlaskApi(page, {chargeToPercentage:73});
  await page.goto('/SolarControlar/', {waitUntil:'domcontentloaded'});
}

test('JSON dashboard: Settings renders original fields and access controls', async ({page}) => {
  await openDashboard(page);
  await tab(page, 'Settings');
  await expect(page.locator('#solarSettingsForm tbody tr')).toHaveCount(3);
  await expect(page.locator('input[name="timezone"]')).toHaveValue('Europe/London');
  await expect(page.locator('input[name="timezone"]')).toHaveAttribute('readonly', '');
  await expect(page.locator('#slider-tolerance_percent')).toHaveValue('0.5');
  await expect(page.locator('#slider-tolerance_percent')).toHaveAttribute('step', '0.1');
  await expect(page.locator('input[name="start_discharge_target"]')).toHaveValue('90');
  await expect(page.locator('#solarSettingsForm .access-badge')).toHaveText(['Read Only','Read/Write','Read/Write']);
  await expect(page.locator('#tab-settings')).toContainText('tolerance desc');
  await expect(page.locator('#tab-settings .alert-danger')).toHaveCount(0);
});

test('JSON dashboard: Config renders the saved target rather than the default', async ({page}) => {
  await openDashboard(page);
  await tab(page, 'Config');
  await expect(page.locator('#configSlider')).toHaveValue('73');
  await expect(page.locator('#configOutput')).toHaveText('73%');
});

{
  test('JSON server: all seven tabs render populated content', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mockFlaskApi(page, {chargeToPercentage:73});
    await page.goto('/SolarControlar/', {waitUntil:'domcontentloaded'});
    await tab(page, 'Now');
    await expect(page.locator('solar-diagram [data-node=inverter] .solar-diagram__value')).toHaveText('300 W');
    await expect(page.locator('#batteryPercent')).toHaveText('50%');
    await tab(page, 'Settings');
    await expect(page.locator('#solarSettingsForm')).toBeVisible();
    await expect(page.locator('#slider-tolerance_percent')).toHaveValue('0.5');
    await tab(page, 'Files');
    await page.locator('#tab-files').getByRole('button', {name:'Fetch', exact:true}).click();
    await expect(page.locator('#log-output')).toContainText('mock log line 1');
    await tab(page, 'Config');
    await expect(page.locator('#configSlider')).toHaveValue('73');
    await tab(page, 'Forecast');
    await page.locator('#btnRunForecast').click();
    await expect(page.locator('#forecastOutput')).toContainText('mock forecast output');
    await tab(page, 'Power');
    await expect(page.locator('#powerChart')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window._powerChart?.data.datasets[0].data.length)).toBe(3);
    await tab(page, 'kWh');
    await expect(page.locator('#energyChart')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window._energyChart?.data.datasets.length)).toBe(5);
    await expect(page.locator('.energy-series[value="usage"]')).toHaveText('Home');
    expect(errors).toEqual([]);
  });
}

test('JSON dashboard preserves authentication, CSRF and both save endpoints', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('solarcontrolar_flaskUser','test-user');
    localStorage.setItem('solarcontrolar_flaskPass','test-pass');
  });
  const requests = [];
  page.on('request', request => { if (/\/solar\/(?:api\/dashboard|api\/config)?$/.test(new URL(request.url()).pathname)) requests.push(request); });
  await openDashboard(page);
  await tab(page,'Settings');
  await expect(page.locator('#slider-tolerance_percent')).toHaveValue('0.5');
  await page.locator('#slider-tolerance_percent').fill('1.2');
  await expect(page.locator('tr[data-key="tolerance_percent"] .access-badge')).toHaveText('Changed');
  const settingPost = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/solar/');
  await page.locator('#solarSettingsForm button').click();
  const saved = (await settingPost).postData();
  expect(saved).toMatch(/name="csrf_token"\r?\n\r?\nTESTCSRF/);
  expect(saved).toMatch(/name="tolerance_percent"\r?\n\r?\n1.2/);
  await expect(page.locator('#slider-tolerance_percent')).toHaveValue('0.5');
  await tab(page,'Config');
  await expect(page.locator('#configSlider')).toHaveValue('73');
  await page.locator('#configSlider').fill('74');
  const configPost = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/solar/api/config');
  await page.locator('#configForm button').click();
  expect((await configPost).postData()).toMatch(/name="charge_to_percentage"\r?\n\r?\n74/);
  await expect(page.locator('#configSlider')).toHaveValue('73');
  expect(requests.filter(request => request.method() === 'GET' && new URL(request.url()).pathname === '/solar/')).toHaveLength(0);
  for (const request of requests) expect(request.headers().authorization).toBe('Basic ' + Buffer.from('test-user:test-pass').toString('base64'));
});

for (const status of [404, 401, 403, 500]) {
  test(`dashboard HTTP ${status} keeps its error without trying the HTML fallback`, async ({page}) => {
    await mockFlaskApi(page);
    await page.route('**/solar/api/dashboard', route => route.fulfill({status, json:{error:'dashboard unavailable'}}));
    let fallbackRequests = 0;
    await page.route('**/solar/', route => { fallbackRequests++; return route.fulfill({body:'unexpected fallback'}); });
    await page.goto('/SolarControlar/', {waitUntil:'domcontentloaded'});
    await tab(page,'Settings');
    await expect(page.locator('#tab-settings .alert-danger')).toContainText(`HTTP ${status}: dashboard unavailable`);
    expect(fallbackRequests).toBe(0);
  });
}
