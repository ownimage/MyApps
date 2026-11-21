const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const {lookup} = require('mrmime');
const root = path.resolve(__dirname, '..');

// A private origin per test: no production files or shared test server state change.
async function createInterruptedRelease(failure = 'disconnect', sameBuild = false) {
  const sw = await fs.readFile(path.join(root, 'sw.js'), 'utf8');
  const currentBuild = sw.match(/const BUILD_NUMBER = "(\d+)"/)[1];
  const nextBuild = sameBuild ? currentBuild : String(Number(currentBuild) + 1);
  let updating = false, failing = true, failureReleased = false, pending;
  const server = http.createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) {res.writeHead(403); return res.end();}
      let body = await fs.readFile(file);
      if (updating && (pathname === '/sw.js' || pathname === '/shared/js/build-number.js')) {
        body = Buffer.from(body.toString().replace(currentBuild, nextBuild) + (pathname === '/sw.js' ? '\n// Simulated deployment.\n' : ''));
      }
      if (updating && failing && pathname === '/PlanMyDay/js/app.js') {
        const rejectDownload = () => {
          if (failure === 'http') {res.writeHead(503); res.end('Incomplete release');}
          else {res.writeHead(200, {'Content-Length': body.length}); res.write(body.subarray(0, 32)); setImmediate(() => res.destroy());}
        };
        if (failureReleased) rejectDownload();
        else pending = rejectDownload;
        return;
      }
      res.writeHead(200, {'Content-Type': lookup(file) || 'application/octet-stream', 'Cache-Control': 'no-store'});
      res.end(body);
    } catch {res.writeHead(404); res.end();}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/PlanMyDay/`,
    currentBuild, nextBuild,
    hasPendingFailure: () => !!pending,
    fail: () => {failureReleased = true; const release = pending; pending = null; release();},
    start: () => {updating = true;},
    repair: () => {failing = false;},
    close: async () => {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
  };
}

async function beginUpdate(page) {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    window.__installOutcome = 'checking';
    function track() {
      const worker = reg.installing;
      if (!worker || window.__trackedInstaller === worker) return;
      window.__trackedInstaller = worker;
      function changed() {window.__installOutcome = worker.state;}
      worker.addEventListener('statechange', changed);
      changed();
    }
    reg.addEventListener('updatefound', track, {once: true});
    reg.update().then(track).catch(error => {window.__updateError = error.message;});
  });
}

async function interruptUpdate(page, release, expect) {
  await page.goto(release.url, {waitUntil: 'domcontentloaded'});
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {timeout:30000}).toBe(true);
  // Updates are checked from a returning, controlled page, as in normal use.
  await page.reload({waitUntil: 'domcontentloaded'});
  await expect(page.getByRole('button', {name:'+ Add Job', exact:true})).toBeVisible();
  await page.evaluate(async () => {
    const cache = await caches.open('myapps-images');
    await cache.put('/smd-img/update-safety-marker', new Response('saved user image'));
  });
  release.start();
  await beginUpdate(page);
  await expect.poll(release.hasPendingFailure).toBe(true);
  release.fail();
  await expect.poll(() => page.evaluate(() => window.__installOutcome)).toBe('redundant');
}
module.exports = {createInterruptedRelease, beginUpdate, interruptUpdate};
