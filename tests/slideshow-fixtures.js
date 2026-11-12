const { expect } = require('@playwright/test');
async function setup(page, options = {}) {
  await page.addInitScript(opts => {
    window.msal = { PublicClientApplication: class {
      initialize() { return Promise.resolve(); }
      handleRedirectPromise() { return Promise.resolve(); }
      getAllAccounts() { return [{ username: 'photos@example.com' }]; }
    }};
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
async function openFolders(page) {
  if (!(await page.evaluate(()=>ss.settings))) await page.evaluate(()=>openSettings());
  await page.locator('#slideshow-tab').click();
  await page.locator('#chooseSlideFolder button').click();
}
async function choose(page) {
  await openFolders(page);
  await expect(page.locator('#useSlideFolder button')).toBeEnabled();
  await page.locator('#useSlideFolder button').click();
  await page.locator('#playSlides button').click();
  await expect(page.locator('#slideImage')).toBeVisible();
  await expect(page.locator('#slideImage')).toHaveJSProperty('naturalWidth',1000);
  await expect(page.locator('#settingsPage')).toBeHidden();
}
module.exports={setup,stub,choose,openFolders};
