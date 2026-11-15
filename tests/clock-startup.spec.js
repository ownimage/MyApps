const { test, expect } = require('./functional-test');
const { gotoClock, reloadClock } = require('./clock-test');

for (const navigation of ['initial', 'reload']) {
  test(`Clock UI is ready while optional resources are pending - ${navigation}`, async ({ page }) => {
    if (navigation === 'reload') await gotoClock(page);
    // Hold an optional resource indefinitely, modelling a slow network/media
    // load without depending on Chromium's automatic media-suspend deadline.
    await page.route('**/Clock/', async route => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()).replace('</body>', '<img hidden src="startup-hold.png"></body>')
      });
    });
    let heldImage;
    let heldAudio;
    await page.route('**/Clock/startup-hold.png', route => { heldImage = route; });
    await page.route('**/Clock/audio/alarm.wav', route => { heldAudio = route; });
    try {
      if (navigation === 'initial') await gotoClock(page);
      else await reloadClock(page);
      await expect(page.locator('#clockDisplay .flip-digit')).toHaveCount(6);
      expect(await page.locator('#clockAlarmAudio').evaluate(audio => audio.readyState)).toBeLessThan(2);
      await page.evaluate(() => openSettings());
      await expect(page.locator('#settingsPage')).toHaveAttribute('open', '');
    } finally {
      if (heldAudio) await heldAudio.abort().catch(() => {});
      if (heldImage) await heldImage.abort().catch(() => {});
    }
  });
}

test('controlled Clock startup tolerates delay between clock commands', async ({ page }) => {
  const now = new Date();
  now.setMilliseconds(0);
  const install = page.clock.install.bind(page.clock);
  // Model host scheduling delay deterministically, without a real sleep.
  page.clock.install = async options => {
    await install(options);
    await page.clock.fastForward(5000);
  };
  await gotoClock(page, now);
  expect(await page.evaluate(() => Date.now())).toBe(now.getTime());
  await expect(page.locator('#clockDisplay .flip-digit')).toHaveCount(6);
});
