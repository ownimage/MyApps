const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
async function serveFreshAssets(page) {
  await page.route('http://localhost:8080/**', async route => {
    let pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({status: 404, body: 'Not found'});
    return route.fulfill({path: file});
  });
}
// Real app/modal code with a deterministic pending worker and an older active build.
async function stubPendingUpdate(page) {
  await serveFreshAssets(page);
  await page.addInitScript(() => {
    sessionStorage.setItem('swTestBoots', String(Number(sessionStorage.getItem('swTestBoots') || 0) + 1));
    const state = window.__swTest = {checked: false, unregistered: false, messages: [], polls: 0};
    const worker = {scriptURL: location.origin + '/sw.js', postMessage(message, ports) {
      state.messages.push(message.type);
      if (message.type === 'GET_BUILD') {
        ports[0].postMessage({type: 'BUILD', build: String(Number(BUILD_NUMBER) - 1)});
        state.checked = true;
      }
      if (message.type === 'SET_NO_CACHE' && ports?.[0]) ports[0].postMessage({type: 'NO_CACHE', enabled: false});
    }};
    const reg = {active: worker, waiting: worker, addEventListener() {},
      update: async () => {state.polls++;},
      unregister: async () => {state.unregistered = true; return true;}};
    Object.defineProperty(navigator, 'serviceWorker', {configurable: true, value: {
      controller: worker, register: async () => reg, getRegistration: async () => reg,
      addEventListener() {}, ready: Promise.resolve(reg)
    }});
  });
}
module.exports = {stubPendingUpdate};

