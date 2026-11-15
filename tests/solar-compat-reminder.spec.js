const {test, expect} = require('./functional-test');
const {mockFlaskApi} = require('./solar-fixtures');

test('JSON dashboard starts, refreshes and reloads without a compatibility reminder', async ({page}) => {
  await mockFlaskApi(page);
  await page.goto('/SolarControlar/', {waitUntil:'domcontentloaded'});
  await expect(page.locator('solar-diagram')).toBeVisible();
  await expect(page.locator('#solarCompatibilityReminder')).toHaveCount(0);
  await page.evaluate(() => refreshData());
  await expect(page.locator('#solarCompatibilityReminder')).toHaveCount(0);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('solar-diagram')).toBeVisible();
  await expect(page.locator('#solarCompatibilityReminder')).toHaveCount(0);
});
