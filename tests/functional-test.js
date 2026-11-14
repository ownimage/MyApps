// Functional checks should not install the entire offline bundle in every
// isolated browser context. Cache checks opt in with offlineCache: true.
const playwright = require('@playwright/test');
const test = playwright.test.extend({
  offlineCache: [false, {option: true}],
  serviceWorkers: async ({offlineCache}, use) => {
    await use(offlineCache ? 'allow' : 'block');
  },
  functionalCacheIsolation: [async ({context, offlineCache}, use) => {
    if (!offlineCache) {
      await context.addInitScript(() => {
        delete Object.getPrototypeOf(navigator).serviceWorker;
      });
    }
    await use();
  }, {auto: true}]
});
module.exports = {...playwright, test};
