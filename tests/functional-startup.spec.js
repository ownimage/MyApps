const {test,expect} = require('./functional-test');

test('functional app startup avoids installing the offline bundle', async ({page,context}) => {
  const workerRequests = [];
  context.on('request', request => {
    if (request.serviceWorker()) workerRequests.push(request.url());
  });
  for (const [path,ready] of [['/Clock/','#clockDisplay'],['/CountMyDays/','cmd-countdown-card'],['/FreeFormOX/','#mainNav']]) {
    await page.goto(path);
    await expect(page.locator(ready).first()).toBeVisible();
    expect(await page.evaluate(() => 'serviceWorker' in navigator)).toBe(false);
  }
  expect(context.serviceWorkers()).toHaveLength(0);
  expect(workerRequests).toEqual([]);
});


test.describe('offline cache opt-in', () => {
  test.use({offlineCache: true});
  test('cache checks still install a real worker and precache assets', async ({page,context}) => {
    await page.goto('/Clock/');
    expect(await page.evaluate(() => 'serviceWorker' in navigator)).toBe(true);
    expect(await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      return !!(await caches.match(new URL('../Clock/index.html',location.href).href));
    })).toBe(true);
    expect(context.serviceWorkers().length).toBeGreaterThan(0);
  });
});
