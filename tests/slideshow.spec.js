const { test, expect } = require('@playwright/test');
const { pickOption } = require('./theme-controls');

async function setup(page, options = {}) {
  await page.addInitScript(opts => {
    if (localStorage.getItem('ss_test_seeded')) return;
    localStorage.setItem('ss_test_seeded','true');
    localStorage.setItem('smd_onedrive_clientId', '11111111-2222-3333-4444-555555555555');
    localStorage.setItem('smd_onedrive_account', 'photos@example.com');
    localStorage.setItem('slideshow_onedrive_directory', opts.root || 'Pictures');
    localStorage.setItem('slideshow_recursive', String(!!opts.recursive));
    localStorage.setItem('slideshow_mode', opts.auto ? 'auto' : 'touch');
    localStorage.setItem('slideshow_seconds', '2');
    localStorage.setItem('slideshow_fontSize', 'normal');
  }, options);
  await page.goto('/SlideShow/');
  await stub(page);
}
async function stub(page) {
  await page.evaluate(() => {
    window.oneDriveInit = () => Promise.resolve({ username: 'photos@example.com' });
    window.__folders = [];
    window.__downloads = [];
    window.oneDriveListFolder = async path => {
      __folders.push(path);
      if (path === 'Pictures') return { folders: [{name:'Holiday & friends',path:'Pictures/Holiday & friends'}], files: [
        {name:'photo10.jpg',key:path+'/photo10.jpg'}, {name:'notes.txt',key:path+'/notes.txt'}, {name:'photo2.PNG',key:path+'/photo2.PNG'}
      ]};
      return { folders:[],files:[{name:'beach.webp',key:path+'/beach.webp'}] };
    };
    window.oneDriveDownloadBlob = async key => {
      __downloads.push(key);
      return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="teal"/><circle cx="700" cy="180" r="80" fill="gold"/></svg>'],{type:'image/svg+xml'});
    };
  });
}
async function choose(page) {
  await page.locator('#chooseSlideFolder button').click();
  await expect(page.locator('#useSlideFolder button')).toBeEnabled();
  await page.locator('#useSlideFolder button').click();
  await expect(page.locator('#slideImage')).toBeVisible();
  await expect(page.locator('#slideImage')).toHaveJSProperty('naturalWidth', 1000);
}
test.describe('SlideShow', () => {
  test.use({hasTouch:true});
  test.beforeEach(async ({ page }) => {
    page.__errors = [];
    await page.addInitScript(() => { delete Object.getPrototypeOf(navigator).serviceWorker; });
    page.on('pageerror', e => page.__errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') page.__errors.push(m.text()); });
    page.on('requestfailed', r => page.__errors.push(r.url() + ': ' + r.failure()?.errorText));
  });
  test.afterEach(async ({ page }) => { expect(page.__errors).toEqual([]); });

  test('disconnected choose folder opens the OneDrive settings', async ({ page }) => {
    await page.goto('/SlideShow/');
    await page.locator('#chooseSlideFolder button').click();
    await expect(page.locator('#onedrive-tab')).toHaveClass(/active/);
    await expect(page.locator('#oneDriveDirectory')).toBeVisible();
    await expect(page.locator('#btnOneDriveSignIn button')).toBeDisabled();
    await expect(page.locator('#slideImage')).toBeHidden();
  });

  test('folder browsing respects the top level folder and touches loop both ways', async ({ page }) => {
    await setup(page);
    await choose(page);
    await expect(page.locator('#slideCaption')).toHaveText('1 / 2 - photo2.PNG');
    const bounds = await page.locator('#slideStage').boundingBox();
    await page.locator('#slideStage').tap({ position: {x:bounds.width-20,y:bounds.height/2} });
    await expect(page.locator('#slideCaption')).toHaveText('2 / 2 - photo10.jpg');
    await page.locator('#slideStage').tap({ position: {x:20,y:bounds.height/2} });
    await expect(page.locator('#slideCaption')).toHaveText('1 / 2 - photo2.PNG');
    await page.locator('#previousSlide button').click();
    await expect(page.locator('#slideCaption')).toHaveText('2 / 2 - photo10.jpg');
    await page.locator('#chooseSlideFolder button').click();
    await expect(page.locator('#parentSlideFolder button')).toBeDisabled();
    await page.locator('#slideFolderList button').click();
    await expect(page.locator('#slideFolderPath')).toHaveText('Pictures/Holiday & friends');
    await page.locator('#parentSlideFolder button').click();
    await expect(page.locator('#slideFolderPath')).toHaveText('Pictures');
    expect((await page.evaluate(() => __folders)).every(path => path.startsWith('Pictures'))).toBe(true);
  });

  test('subfolder option controls recursion and playback settings persist', async ({ page }) => {
    await setup(page);
    await choose(page);
    expect(await page.evaluate(() => ss.files.length)).toBe(2);
    await page.evaluate(() => openSettings());
    await page.locator('#slideRecursive').check();
    await pickOption(page, '#slideTransition', 'slide');
    await page.locator('#slideSeconds').fill('3');
    await page.locator('#slideSeconds').blur();
    await page.evaluate(() => closeSettings());
    await choose(page);
    await expect(page.locator('#slideCaption')).toContainText('/ 3');
    await page.reload(); await stub(page);
    await page.evaluate(() => openSettings());
    await expect(page.locator('#slideRecursive')).toBeChecked();
    await expect(page.locator('#slideTransition')).toHaveJSProperty('value','slide');
    await expect(page.locator('#slideSeconds')).toHaveValue('3');
    await page.locator('#slideSeconds').fill('0'); await page.locator('#slideSeconds').blur();
    await expect(page.locator('#slideSeconds')).toHaveValue('3');
    await page.locator('#onedrive-tab').click();
    await page.locator('#oneDriveDirectory').fill('Pictures/New/'); await page.locator('#oneDriveDirectory').blur();
    await expect(page.locator('#oneDriveDirectory')).toHaveValue('Pictures/New');
    await expect(page.locator('#slideImage')).toBeHidden();
    await page.evaluate(() => closeSettings());
    await page.locator('#chooseSlideFolder button').click();
    await expect(page.locator('#slideFolderPath')).toHaveText('Pictures/New');
    await expect(page.locator('#parentSlideFolder button')).toBeDisabled();
  });

  test('automatic duration, pause and settings stop the timer', async ({ page }) => {
    await setup(page, {auto:true});
    await page.clock.install();
    await choose(page);
    await page.clock.runFor(1900);
    await expect(page.locator('#slideCaption')).toHaveText('1 / 2 - photo2.PNG');
    await page.clock.runFor(200);
    await expect(page.locator('#slideCaption')).toHaveText('2 / 2 - photo10.jpg');
    await page.locator('#playPause button').click();
    await page.clock.runFor(6000);
    await expect(page.locator('#slideCaption')).toHaveText('2 / 2 - photo10.jpg');
    await page.locator('#playPause button').click();
    await page.evaluate(() => openSettings());
    await page.clock.runFor(6000);
    await expect(page.locator('#slideCaption')).toHaveText('2 / 2 - photo10.jpg');
    await page.evaluate(() => closeSettings());
    await page.clock.runFor(2100);
    await expect(page.locator('#slideCaption')).toHaveText('1 / 2 - photo2.PNG');
  });

  test('late image downloads cannot replace a newer navigation', async ({ page }) => {
    await setup(page);
    await choose(page);
    await page.evaluate(() => {
      const original = oneDriveDownloadBlob;
      oneDriveDownloadBlob = key => key.endsWith('photo10.jpg')
        ? new Promise(resolve => { window.__releaseImage = async () => resolve(await original(key)); })
        : original(key);
      ssMove(1);
    });
    await page.locator('#previousSlide button').click();
    await expect(page.locator('#slideCaption')).toHaveText('1 / 2 - photo2.PNG');
    await page.evaluate(() => __releaseImage());
    await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo2.PNG');
    await expect.poll(() => page.evaluate(() => ss.busy)).toBe(false);
  });

  test('empty folders and image errors are recoverable', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => { oneDriveListFolder = async () => ({ folders:[], files:[] }); });
    await page.locator('#chooseSlideFolder button').click();
    await expect(page.locator('#useSlideFolder button')).toBeEnabled();
    await page.locator('#useSlideFolder button').click();
    await expect(page.locator('#slideStatus')).toContainText('No supported images');
    await expect(page.locator('#nextSlide button')).toBeDisabled();
    await stub(page);
    await page.evaluate(() => { const original = oneDriveDownloadBlob; oneDriveDownloadBlob = key => key.endsWith('photo2.PNG') ? Promise.reject(new Error('Image unavailable')) : original(key); });
    await page.locator('#chooseSlideFolder button').click();
    await expect(page.locator('#useSlideFolder button')).toBeEnabled();
    await page.locator('#useSlideFolder button').click();
    await expect(page.locator('#slideStatus')).toContainText('Cannot display photo2.PNG');
    await page.locator('#nextSlide button').click();
    await expect(page.locator('#slideImage')).toBeVisible();
    await expect(page.locator('#slideCaption')).toHaveText('2 / 2 - photo10.jpg');
  });

  test('shared sign-out clears the displayed image and invalidates pending requests', async ({ page }) => {
    await setup(page); await choose(page);
    await page.evaluate(() => {
      const original = oneDriveDownloadBlob;
      oneDriveDownloadBlob = key => new Promise(resolve => { window.__releaseImage = async () => resolve(await original(key)); });
      ssMove(1);
      localStorage.removeItem('smd_onedrive_account');
      window.dispatchEvent(new StorageEvent('storage', {key:'smd_onedrive_account',newValue:null}));
    });
    await page.evaluate(() => __releaseImage());
    await expect(page.locator('#slideImage')).toBeHidden();
    await expect(page.locator('#nextSlide button')).toBeDisabled();
  });

  test('viewer stays below the menu at large font sizes on a phone', async ({ page }) => {
    await page.setViewportSize({width:390,height:844});
    await setup(page);
    await page.evaluate(() => changeFontSize('jumbo'));
    await expect.poll(() => page.evaluate(() => {
      const nav = document.getElementById('mainNav').getBoundingClientRect();
      const toolbar = document.getElementById('slideToolbar').getBoundingClientRect();
      return toolbar.top >= nav.bottom - 1;
    })).toBe(true);
    await choose(page);
    const bounds = await page.locator('#slideStage').boundingBox();
    expect(bounds.height).toBeGreaterThan(200);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  });

  test('real Graph folder helper follows pagination and encodes folder paths', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => { oneDriveGetToken = async () => 'test-access-token'; delete window.__unused; });
    // Restore the real helper from the classic shared script.
    await page.addScriptTag({url:'/shared/js/smd-onedrive.js'});
    await page.evaluate(() => { oneDriveGetToken = async () => 'test-access-token'; });
    const requests = [];
    await page.route('https://graph.microsoft.com/v1.0/**', async route => {
      const url = route.request().url(); requests.push(url);
      expect(route.request().headers().authorization).toBe('Bearer test-access-token');
      const next = url.includes('skiptoken');
      await route.fulfill({json: next ? {value:[{name:'image2.jpg',file:{},id:'two'}]} : {
        value:[{name:'image1.jpg',file:{},id:'one'}],
        '@odata.nextLink':'https://graph.microsoft.com/v1.0/me/drive/root:/Pictures%20%26%20friends:/children?$skiptoken=page2'
      }});
    });
    const listing = await page.evaluate(() => oneDriveListFolder('Pictures & friends'));
    expect(listing.files.map(f=>f.name)).toEqual(['image1.jpg','image2.jpg']);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain('Pictures%20%26%20friends');
  });
});
