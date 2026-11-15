const functional = require('./functional-test');
const {expect} = functional;

async function clockReady(page) {
  // DOMContentLoaded has run the synchronous startup handlers. Fonts are the
  // remaining layout dependency; audio is not. Check the rendered result in
  // one browser call rather than several remote assertions under heavy load.
  const ready = await page.evaluate(async () => {
    await document.fonts.ready;
    const display = document.getElementById('clockDisplay');
    const bounds = display && display.getBoundingClientRect();
    return {
      timerStarted: typeof clockTimer !== 'undefined' && clockTimer !== null,
      content: !!display?.querySelector('.flip-digit, .mondaine-face'),
      visible: !!bounds && bounds.width > 0 && bounds.height > 0
    };
  });
  expect(ready, 'Clock must render before the test starts').toEqual({timerStarted:true,content:true,visible:true});
}
async function gotoClock(page, time) {
  if (time) {
    // Install before the app schedules ANY timers. Pause before navigation so
    // startup and every tick use the same exact phase, even on an overloaded host.
    // No app timers exist on about:blank. Start a day earlier so even a
    // heavily delayed pause command still moves forward to the requested time.
    await page.clock.install({time: new Date(time.getTime() - 24*60*60*1000)});
    await page.clock.pauseAt(time);
  }
  await page.goto('/Clock/', {waitUntil:'domcontentloaded'});
  await clockReady(page);
}
async function pauseClockOnEvenSecond(page) {
  // A full minute of command headroom exceeds the normal per-test budget;
  // computing an adjacent second races the host scheduler at workers=32.
  const target = await page.evaluate(() => Math.ceil((Date.now()+60000)/2000)*2000);
  await page.clock.pauseAt(target);
}
async function reloadClock(page) {
  await page.reload({waitUntil:'domcontentloaded'});
  await clockReady(page);
}
const test = functional.test.extend({
  manualClockStart: [false, {option:true}],
  clockStartup: [async ({page,manualClockStart},use) => {
    // Each test already has a fresh BrowserContext/localStorage. Do not load,
    // clear storage and reload a second time just to obtain the same state.
    if (!manualClockStart) await gotoClock(page);
    await use();
  }, {auto:true}]
});
module.exports = {...functional,test,gotoClock,reloadClock,pauseClockOnEvenSecond};
