const fs = require('fs');
const vm = require('vm');
const {test, expect} = require('./functional-test');
const {stubPendingUpdate} = require('./sw-update-fixture');

function workerHarness(prefix = '/') {
  const listeners = {}, entries = new Map(), network = [];
  const base = 'http://localhost:8080' + prefix;
  const key = value => new URL(typeof value === 'string' ? value : value.url, base).pathname;
  const cache = {
    match: async value => entries.get(key(value))?.clone(),
    put: async (value, response) => entries.set(key(value), response.clone()),
    delete: async value => entries.delete(key(value))
  };
  const sandbox = {
    URL, Response, Uint8Array, atob,
    self: {location: new URL(base + 'sw.js'), addEventListener: (name, fn) => listeners[name] = fn},
    caches: {open: async name => name === 'myapps-flags' ? {match: async () => undefined} : cache},
    fetch: (...args) => { network.push(args); return sandbox.networkResponse(); }
  };
  sandbox.networkResponse = () => new Promise(() => {});
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../sw.js'), 'utf8'), sandbox);
  return {
    entries, network, sandbox,
    request: (path, mode = 'cors') => {
      let response;
      listeners.fetch({request: {url: new URL(path, base).href, method: 'GET', mode}, respondWith: p => response = p});
      return response;
    }
  };
}

for (const prefix of ['/', '/MyApps/']) {
  for (const stamp of ['', '?v=another-build']) {
    test(`cached startup makes no network request ${prefix} ${stamp || 'unversioned'}`, async () => {
      const h = workerHarness(prefix);
      h.entries.set(prefix + 'shared/js/build-number.js', new Response('cached build'));
      const response = h.request('shared/js/build-number.js' + stamp);
      // Drain the cache lookup chain without waiting for the deliberately hung network.
      await new Promise(setImmediate);
      expect(h.network).toHaveLength(0);
      expect(await (await response).text()).toBe('cached build');
      expect(await h.entries.get(prefix + 'shared/js/build-number.js').text()).toBe('cached build');
    });
  }
  test(`cached navigation fallback precedes stalled network ${prefix}`, async () => {
    const h = workerHarness(prefix);
    h.entries.set(prefix + 'PlanMyDay/index.html', new Response('<h1>My cached app</h1>'));
    const response = h.request('PlanMyDay/unvisited-route', 'navigate');
    await new Promise(setImmediate);
    expect(h.network).toHaveLength(0);
    expect(await (await response).text()).toContain('My cached app');
  });
}

test('uncached asset fetch is stored for the next offline read', async () => {
  const h = workerHarness();
  h.sandbox.networkResponse = async () => new Response('downloaded');
  expect(await (await h.request('extra.json')).text()).toBe('downloaded');
  h.sandbox.networkResponse = () => Promise.reject(new Error('offline'));
  expect(await (await h.request('extra.json')).text()).toBe('downloaded');
  expect(h.network).toHaveLength(1);
});

for (const action of ['later', 'update']) {
  test(`startup build mismatch preserves update consent: ${action}`, async ({page}) => {
    await stubPendingUpdate(page);
    await page.goto('/PlanMyDay/', {waitUntil: 'domcontentloaded'});
    await expect(page.locator('#smdConfirmModal')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__swTest.checked)).toBe(true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => sessionStorage.getItem('swTestBoots'))).toBe('1');
    expect(await page.evaluate(() => window.__swTest.unregistered)).toBe(false);
    expect(await page.evaluate(() => window.__swTest.messages)).not.toContain('SKIP_WAITING');
    await page.locator('#smdConfirmModal').getByRole('button', {name: action === 'later' ? 'Later' : 'Update now', exact: true}).click();
    await expect(page.locator('#smdConfirmModal')).toBeHidden();
    expect(await page.evaluate(() => window.__swTest.messages.includes('SKIP_WAITING'))).toBe(action === 'update');
    if (action === 'later') {
      await page.reload({waitUntil: 'domcontentloaded'});
      await expect(page.locator('#mainNav')).toBeVisible();
      await expect(page.locator('#smdConfirmModal')).toBeHidden();
      expect(await page.evaluate(() => window.__swTest.messages)).not.toContain('SKIP_WAITING');
    }
  });
}


test.describe('real cached app startup', {tag: '@cache'}, () => {
  test.use({offlineCache: true});
  test('returning app renders while asset networking stalls and reopens offline', async ({page, context}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/PlanMyDay/', {waitUntil: 'domcontentloaded'});
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {timeout: 30000}).toBe(true);
    const requests = [];
    // Context routes see worker-owned network requests. Cached SW responses do
    // not reach this handler; any attempted asset download remains unresolved.
    await context.route('**/*', route => {
      if (new URL(route.request().url()).pathname.endsWith('/sw.js')) return route.continue();
      requests.push(route.request().url());
      return new Promise(() => {});
    });
    await page.reload({waitUntil: 'domcontentloaded'});
    await expect(page.locator('#mainNav')).toBeVisible();
    await expect(page.getByRole('button', {name: '+ Add Job', exact: true})).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(requests).toEqual([]);
    await context.unrouteAll({behavior: 'ignoreErrors'});
    await context.setOffline(true);
    await page.reload({waitUntil: 'domcontentloaded'});
    await expect(page.locator('#mainNav')).toBeVisible();
    await expect(page.getByRole('button', {name: '+ Add Job', exact: true})).toBeVisible();
    expect(errors).toEqual([]);
  });
});


test('explicit No Cache mode still falls back to the app shell offline', async () => {
  const h = workerHarness('/MyApps/');
  vm.runInContext('noCache = true', h.sandbox);
  h.entries.set('/MyApps/PlanMyDay/index.html', new Response('offline shell'));
  h.sandbox.networkResponse = () => Promise.reject(new Error('offline'));
  expect(await (await h.request('PlanMyDay/unvisited-route', 'navigate')).text()).toBe('offline shell');
  expect(h.network).toHaveLength(1);
});
