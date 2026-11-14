const {test, expect} = require('./functional-test');
const {mockFlaskApi} = require('./solar-fixtures');

for (const legacy of [false, true]) {
  test(`compatibility reminder appears each startup with ${legacy ? 'legacy' : 'JSON'} server`, async ({page}) => {
    await mockFlaskApi(page, {legacy});
    await page.goto('/SolarControlar/', {waitUntil:'domcontentloaded'});
    const reminder = page.locator('#solarCompatibilityReminder');
    await expect(reminder).toBeVisible();
    await expect(reminder).toContainText('compatibility for old and new server modes');
    await expect(reminder).toContainText('Remove this compatibility code once the updated server is deployed.');
    await expect(page.locator('solar-diagram')).toBeVisible();
    await reminder.getByRole('button', {name:'Dismiss', exact:true}).click();
    await expect(reminder).toHaveCount(0);
    await page.evaluate(() => refreshData());
    await expect(reminder).toHaveCount(0);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(reminder).toBeVisible();
    await expect(reminder).toHaveCount(1);
  });
}
