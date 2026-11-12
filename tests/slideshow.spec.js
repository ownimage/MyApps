const {test,expect}=require('@playwright/test');
const {pickOption}=require('./theme-controls');
const {setup,stub,choose,openFolders,play}=require('./slideshow-fixtures');
test.describe('SlideShow',()=>{
  test.use({hasTouch:true});
  test.beforeEach(async({page})=>{
    page.__errors=[];
    await page.addInitScript(()=>{delete Object.getPrototypeOf(navigator).serviceWorker;});
    page.on('pageerror',e=>page.__errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')page.__errors.push(m.text());});
    page.on('requestfailed',r=>page.__errors.push(r.url()));
  });
  test.afterEach(async({page})=>{expect(page.__errors).toEqual([]);});
  test('settings provide Folder and Play with no playback banners',async({page})=>{
    await setup(page);
    await page.locator('#btnMainMenu').click();
    await page.locator('#mainNav .dropdown-item').filter({hasText:/^Settings$/}).click();
    await expect(page.locator('#chooseSlideFolder button')).toBeVisible();
    await expect(page.locator('#playSlides button')).toBeEnabled();
    await choose(page);
    await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo2.PNG');
    await expect(page.locator('#slideToolbar,#slideCaption,#slideMain footer')).toHaveCount(0);
    await expect(page.locator('#slideEmpty')).toBeHidden();
  });
  test('disconnected folder selection opens the OneDrive tab',async({page})=>{
    await page.goto('/SlideShow/');await page.evaluate(()=>openSettings());
    await page.locator('#chooseSlideFolder button').click();
    await expect(page.locator('#source-tab')).toHaveClass(/active/);
    await expect(page.locator('#oneDriveDirectory')).toBeVisible();
    await expect(page.locator('#btnOneDriveSignIn button')).toBeDisabled();
  });
  test('touching left and right loops images and root browsing stays bounded',async({page})=>{
    await setup(page);await choose(page);
    const bounds=await page.locator('#slideStage').boundingBox();
    await page.locator('#slideStage').tap({position:{x:bounds.width-20,y:bounds.height/2}});
    await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo10.jpg');
    await page.locator('#slideStage').tap({position:{x:20,y:bounds.height/2}});
    await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo2.PNG');
    await openFolders(page);
    await expect(page.locator('#parentSlideFolder button')).toBeDisabled();
    await page.locator('#slideFolderList button').click();
    await expect(page.locator('#slideFolderPath')).toHaveText('Pictures/Holiday & friends');
    await page.locator('#parentSlideFolder button').click();
    await expect(page.locator('#slideFolderPath')).toHaveText('Pictures');
    expect((await page.evaluate(()=>__folders)).every(p=>p.startsWith('Pictures'))).toBe(true);
  });
  test('subfolder option and transition duration persist and Play applies them',async({page})=>{
    await setup(page);await choose(page);await page.evaluate(()=>openSettings());
    await page.locator('#slideRecursive').check();await pickOption(page,'#slideTransition','slide');
    await page.locator('#slideSeconds').fill('3');await page.locator('#slideSeconds').blur();
    await play(page);
    await expect(page.locator('#slideImage')).toHaveAttribute('alt','beach.webp');
    expect(await page.evaluate(()=>ss.files.length)).toBe(3);
    await page.reload();await stub(page);await page.evaluate(()=>openSettings());
    await expect(page.locator('#slideRecursive')).toBeChecked();
    await expect(page.locator('#slideTransition')).toHaveJSProperty('value','slide');
    await expect(page.locator('#slideSeconds')).toHaveValue('3');
    await page.locator('#slideSeconds').fill('0');await page.locator('#slideSeconds').blur();
    await expect(page.locator('#slideSeconds')).toHaveValue('3');
  });
  test('top level folder changes constrain selection and blank allows the root',async({page})=>{
    await setup(page);await page.evaluate(()=>openSettings());await page.locator('#source-tab').click();
    await page.locator('#oneDriveDirectory').fill('Pictures/New/');await page.locator('#oneDriveDirectory').blur();
    await expect(page.locator('#oneDriveDirectory')).toHaveValue('Pictures/New');
    await openFolders(page);
    await expect(page.locator('#slideFolderPath')).toHaveText('Pictures/New');
    await expect(page.locator('#parentSlideFolder button')).toBeDisabled();
    await page.evaluate(()=>ssCloseFolders());await page.locator('#source-tab').click();
    await page.locator('#oneDriveDirectory').fill('');await page.locator('#oneDriveDirectory').blur();
    await openFolders(page);await expect(page.locator('#slideFolderPath')).toHaveText('OneDrive');
    await expect(page.locator('#parentSlideFolder button')).toBeDisabled();
  });
  test('automatic duration and opening settings pause playback',async({page})=>{
    await setup(page,{auto:true});await page.clock.install();await choose(page);
    await page.clock.runFor(1900);await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo2.PNG');
    await page.clock.runFor(200);await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo10.jpg');
    await page.evaluate(()=>openSettings());await page.clock.runFor(6000);
    await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo10.jpg');
    await page.evaluate(()=>closeSettings());await page.clock.runFor(2100);
    await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo2.PNG');
  });
  test('late downloads cannot replace newer navigation',async({page})=>{
    await setup(page);await choose(page);
    await page.evaluate(()=>{const original=oneDriveDownloadBlob;oneDriveDownloadBlob=key=>key.endsWith('photo10.jpg')?new Promise(resolve=>{window.__release=async()=>resolve(await original(key));}):original(key);ssMove(1);});
    await page.evaluate(()=>ssMove(-1));await expect.poll(()=>page.evaluate(()=>ss.busy)).toBe(false);
    await page.evaluate(()=>__release());await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo2.PNG');
  });
  test('empty folders and image errors are recoverable',async({page})=>{
    await setup(page);await page.evaluate(()=>{oneDriveListFolder=async()=>({folders:[],files:[]});});
    await openFolders(page);await expect(page.locator('#useSlideFolder button')).toBeEnabled();
    await page.locator('#useSlideFolder button').click();await play(page);
    await expect(page.locator('#slideSettingsStatus')).toContainText('No supported images');
    await stub(page);await page.evaluate(()=>{const original=oneDriveDownloadBlob;oneDriveDownloadBlob=key=>key.endsWith('photo2.PNG')?Promise.reject(new Error('Image unavailable')):original(key);});
    await play(page);await expect(page.locator('#slideStatus')).toContainText('Cannot display this image');
    await page.evaluate(()=>ssMove(1));await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo10.jpg');
  });
  test('shared sign-out clears media and invalidates pending downloads',async({page})=>{
    await setup(page);await choose(page);
    await page.evaluate(()=>{const original=oneDriveDownloadBlob;oneDriveDownloadBlob=key=>new Promise(resolve=>{window.__release=async()=>resolve(await original(key));});ssMove(1);localStorage.removeItem('smd_onedrive_account');window.dispatchEvent(new StorageEvent('storage',{key:'smd_onedrive_account',newValue:null}));});
    await page.evaluate(()=>__release());await expect(page.locator('#slideImage')).toBeHidden();
  });
  test('phone viewer fills the space below the menu at large font sizes',async({page})=>{
    await page.setViewportSize({width:390,height:844});await setup(page);await page.evaluate(()=>changeFontSize('jumbo'));await choose(page);
    await expect.poll(()=>page.evaluate(()=>document.getElementById('slideStage').getBoundingClientRect().top>=document.getElementById('mainNav').getBoundingClientRect().bottom-1)).toBe(true);
    const bounds=await page.locator('#slideStage').boundingBox();expect(bounds.height).toBeGreaterThan(500);expect(bounds.x+bounds.width).toBeLessThanOrEqual(391);
  });
  test('cancelling folder browsing ignores a late listing',async({page})=>{
    await setup(page);await choose(page);await openFolders(page);await expect(page.locator('#useSlideFolder button')).toBeEnabled();
    await page.evaluate(()=>{oneDriveListFolder=()=>new Promise(resolve=>{window.__releaseFolder=()=>resolve({folders:[{name:'Late',path:'Pictures/Late'}],files:[]});});});
    await page.locator('#slideFolderList button').click();await page.locator('#slideFolderPage .smd-page-footer button').filter({hasText:'Cancel'}).click();
    await page.evaluate(()=>__releaseFolder());await expect(page.locator('#slideFolderPage')).toBeHidden();
    await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo2.PNG');
  });
  test('sub-path deployment keeps shared assets and Launch links relative',async({page})=>{
    await setup(page);await page.goto('http://127.0.0.1:8081/PlanMyDay/SlideShow/');await stub(page);await choose(page);
    await expect(page.locator('#appNavTitle')).toHaveText('SlideShow');await page.evaluate(()=>ssRevealMenu());await page.locator('#btnMainMenu').click();await page.locator('.launch-submenu-toggle').click();
    await expect(page.locator('.launch-submenu-menu a').filter({hasText:/^SlideShow$/})).toHaveAttribute('href','../SlideShow/');
  });
  test('real Graph helper paginates and encodes paths',async({page})=>{
    await setup(page);await page.addScriptTag({url:'/shared/js/smd-onedrive.js'});await page.evaluate(()=>{oneDriveGetToken=async()=>'test-token';});
    const requests=[];await page.route('https://graph.microsoft.com/v1.0/**',async route=>{
      const url=route.request().url();requests.push(url);expect(route.request().headers().authorization).toBe('Bearer test-token');
      await route.fulfill({json:url.includes('skiptoken')?{value:[{name:'image2.jpg',file:{}}]}:{value:[{name:'image1.jpg',file:{}}],'@odata.nextLink':'https://graph.microsoft.com/v1.0/me/drive/root:/Pictures%20%26%20friends:/children?$skiptoken=page2'}});
    });
    const listing=await page.evaluate(()=>oneDriveListFolder('Pictures & friends'));expect(listing.files.map(f=>f.name)).toEqual(['image1.jpg','image2.jpg']);expect(requests).toHaveLength(2);expect(requests[0]).toContain('Pictures%20%26%20friends');
  });
});

test('automatic duration starts after the first image has loaded',async({page})=>{
  await page.addInitScript(()=>{delete Object.getPrototypeOf(navigator).serviceWorker;});
  await setup(page,{auto:true});await page.clock.install();
  await openFolders(page);await expect(page.locator('#useSlideFolder button')).toBeEnabled();await page.locator('#useSlideFolder button').click();
  await page.evaluate(()=>{const original=oneDriveDownloadBlob;window.__callCount=0;oneDriveDownloadBlob=key=>{__callCount++;return key.endsWith('photo2.PNG')?new Promise(resolve=>{window.__firstImage=async()=>resolve(await original(key));}):original(key);};});
  await play(page);await page.clock.runFor(6000);
  expect(await page.evaluate(()=>__callCount)).toBe(1);
  await expect(page.locator('#slideImage')).toBeHidden();
  await page.evaluate(()=>__firstImage());await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo2.PNG');
  await page.clock.runFor(1900);await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo2.PNG');
  await page.clock.runFor(200);await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo10.jpg');
});

test('SlideShow completes redirected OneDrive sign-in on startup',async({page})=>{
  await page.addInitScript(()=>{
    delete Object.getPrototypeOf(navigator).serviceWorker;
    localStorage.setItem('smd_onedrive_clientId','11111111-2222-3333-4444-555555555555');
    window.msal={PublicClientApplication:class{
      initialize(){return Promise.resolve();}
      handleRedirectPromise(){window.__redirectProcessed=true;return Promise.resolve();}
      getAllAccounts(){return [{username:'redirect@example.com'}];}
    }};
  });
  await page.goto('/SlideShow/');
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('smd_onedrive_account'))).toBe('redirect@example.com');
  expect(await page.evaluate(()=>__redirectProcessed)).toBe(true);
});
