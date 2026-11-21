const {test, expect} = require('./functional-test');
const {createInterruptedRelease, beginUpdate, interruptUpdate} = require('./sw-install-fixture');

test.describe('interrupted update installation', {tag:'@cache'}, () => {
  test.use({offlineCache:true});
  for (const failure of ['disconnect', 'http']) {
    test(`existing cached app works after interrupted update: ${failure}`, async ({page, context}) => {
      const release = await createInterruptedRelease(failure);
      try {
        await interruptUpdate(page, release, expect);
        expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)).toBe(false);
        await expect(page.locator('#smdConfirmModal')).toBeHidden();
        await context.setOffline(true);
        await page.reload({waitUntil:'domcontentloaded'});
        await expect(page.locator('#mainNav')).toBeVisible();
        await expect(page.getByRole('button', {name:'+ Add Job', exact:true})).toBeVisible();
        expect(await page.evaluate(() => String(BUILD_NUMBER))).toBe(release.currentBuild);
      } finally {await release.close();}
    });

    test(`failed update cache is removed immediately and retry succeeds: ${failure}`, async ({page}) => {
      const release = await createInterruptedRelease(failure);
      try {
        await interruptUpdate(page, release, expect);
        const names = await page.evaluate(() => caches.keys());
        expect(names).toContain('myapps-' + release.currentBuild);
        expect(names).not.toContain('myapps-' + release.nextBuild);
        release.repair();
        await beginUpdate(page);
        await expect.poll(() => page.evaluate(() => window.__installOutcome), {timeout:30000}).toBe('installed');
        expect(await page.evaluate(() => caches.keys())).toContain('myapps-' + release.nextBuild);
        await expect(page.locator('#smdConfirmModal')).toBeVisible();
        // Successful retry waits for consent; the incumbent still serves its build.
        expect(await page.evaluate(() => String(BUILD_NUMBER))).toBe(release.currentBuild);
      } finally {await release.close();}
    });
  }
});

test.describe('same build deployment safety', {tag:'@cache'}, () => {
  test.use({offlineCache:true});
  test('failed same-build reinstall preserves incumbent cache and saved images', async ({page, context}) => {
    const release = await createInterruptedRelease('http', true);
    try {
      await interruptUpdate(page, release, expect);
      expect(await page.evaluate(() => caches.keys())).toContain('myapps-' + release.currentBuild);
      expect(await page.evaluate(async () => (await (await caches.open('myapps-images')).match('/smd-img/update-safety-marker')).text())).toBe('saved user image');
      await context.setOffline(true);
      await page.reload({waitUntil:'domcontentloaded'});
      await expect(page.getByRole('button', {name:'+ Add Job', exact:true})).toBeVisible();
      expect(await page.evaluate(() => String(BUILD_NUMBER))).toBe(release.currentBuild);
    } finally {await release.close();}
  });
});

test.describe('abandoned update cache cleanup', {tag:'@cache'}, () => {
  test.use({offlineCache:true});
  test('failed retry also removes an empty cache left by an earlier attempt', async ({page}) => {
    const release = await createInterruptedRelease('http');
    try {
      await page.goto(release.url, {waitUntil:'domcontentloaded'});
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {timeout:30000}).toBe(true);
      await page.evaluate(name => caches.open(name).then(() => undefined), 'myapps-' + release.nextBuild);
      await interruptUpdate(page, release, expect);
      const names = await page.evaluate(() => caches.keys());
      expect(names).toContain('myapps-' + release.currentBuild);
      expect(names).not.toContain('myapps-' + release.nextBuild);
    } finally {await release.close();}
  });
});
