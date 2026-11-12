const {test,expect}=require('@playwright/test');
const {setup,choose,play}=require('./slideshow-fixtures');
test.use({hasTouch:true});
test.beforeEach(async({page})=>{await page.addInitScript(()=>{delete Object.getPrototypeOf(navigator).serviceWorker;});});

async function centre(page){const bounds=await page.locator('#slideStage').boundingBox();await page.locator('#slideStage').tap({position:{x:bounds.width/2,y:bounds.height/2}});}

test('manual playback hides the menu and a middle touch restores it',async({page})=>{
  await setup(page);await choose(page);
  await expect(page.locator('#mainNav')).toBeHidden();
  await centre(page);await expect(page.locator('#mainNav')).toBeVisible();
  await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo2.PNG');
  const bounds=await page.locator('#slideStage').boundingBox();
  await page.locator('#slideStage').tap({position:{x:bounds.width-20,y:bounds.height/2}});
  await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo10.jpg');
  await expect(page.locator('#mainNav')).toBeHidden();
  await centre(page);await page.evaluate(()=>openSettings());
  await expect(page.locator('#slideMode .smd-select-btn')).toHaveText('Manual');
  await expect(page.locator('#autoHideMenu')).toHaveCount(0);
});
test('middle touch pauses automatic playback until Play is pressed',async({page})=>{
  await setup(page,{auto:true});await page.clock.install();await choose(page);
  await expect(page.locator('#mainNav')).toBeHidden();
  await centre(page);await expect(page.locator('#mainNav')).toBeVisible();
  await page.clock.runFor(10000);await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo2.PNG');
  await page.evaluate(()=>openSettings());await play(page);
  await expect(page.locator('#mainNav')).toBeHidden();
  await page.clock.runFor(2100);await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo10.jpg');
});
test('Source tab persists the OneDrive URL source and uses it for playback',async({page})=>{
  await setup(page);await page.evaluate(()=>openSettings());
  await expect(page.locator('#source-tab')).toBeVisible();await page.locator('#source-tab').click();
  await expect(page.locator('#slideSourceTabs > .smd-tab-list button')).toHaveText(['OneDrive','OneDrive URL']);
  await page.locator('#source-url-tab').click();
  await expect(page.locator('#oneDriveClientId')).toBeVisible();
  await expect(page.locator('#oneDriveTenant')).toBeVisible();
  await expect(page.locator('#btnOneDriveSignIn')).toBeVisible();
  await page.locator('#oneDriveUrl').fill('https://1drv.ms/f/example');await page.locator('#oneDriveUrl').blur();
  await page.reload();await page.evaluate(()=>openSettings());await page.locator('#source-tab').click();
  await expect(page.locator('#source-url-tab')).toHaveClass(/active/);
  await expect(page.locator('#oneDriveUrl')).toHaveValue('https://1drv.ms/f/example');
  await page.evaluate(()=>{
    window.__urlRequests=[];
    oneDriveGraphJson=async path=>{
      __urlRequests.push(path);
      if(path.startsWith('/shares/'))return {id:'folder',name:'Shared photos',folder:{},parentReference:{driveId:'shared-drive'}};
      if(path.includes('skiptoken'))return {value:[{id:'second',name:'photo2.jpg',file:{},parentReference:{driveId:'shared-drive'}}]};
      return {value:[{id:'first',name:'photo1.jpg',file:{},parentReference:{driveId:'shared-drive'}}],'@odata.nextLink':'https://graph.microsoft.com/v1.0/drives/shared-drive/items/folder/children?$skiptoken=page2'};
    };
    oneDriveGraphRequest=async path=>{__urlRequests.push(path);return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="700" height="400"><rect width="700" height="400" fill="navy"/></svg>'],{type:'image/svg+xml'});};
  });
  await page.locator('#slideshow-tab').click();await expect(page.locator('#chooseSlideFolder')).toBeHidden();
  await play(page);await expect(page.locator('#slideImage')).toHaveAttribute('alt','photo1.jpg');
  await expect(page.locator('#slideImage')).toHaveJSProperty('naturalWidth',700);
  const urls=await page.evaluate(()=>__urlRequests);
  expect(urls[0]).toContain('/shares/u!'+Buffer.from('https://1drv.ms/f/example').toString('base64url')+'/driveItem');
  expect(urls).toContain('/drives/shared-drive/items/first/content');
  expect(await page.evaluate(()=>ss.files.length)).toBe(2);
});

test('URL playback directs missing OneDrive setup to visible connection fields',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    localStorage.removeItem('smd_onedrive_clientId');
    localStorage.removeItem('smd_onedrive_account');
    localStorage.setItem('slideshow_source','url');
    localStorage.setItem('slideshow_sourceUrl','https://1drv.ms/f/example');
    openSettings();
  });
  await page.locator('#playSlides button').click();
  await expect(page.locator('#source-tab')).toHaveClass(/active/);
  await expect(page.locator('#source-url-tab')).toHaveClass(/active/);
  await expect(page.locator('#oneDriveClientId')).toBeVisible();
  await expect(page.locator('#oneDriveTenant')).toBeVisible();
  await expect(page.locator('#oneDriveAccount')).toHaveText('No Client ID configured');
  await expect(page.locator('#slideImage')).toBeHidden();
});

test('shared image URL uses authenticated Graph requests entirely in the browser',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    localStorage.setItem('slideshow_source','url');
    localStorage.setItem('slideshow_sourceUrl','https://1drv.ms/i/example');
    oneDriveGetToken=async()=>'test-url-access-token';
    openSettings();
  });
  const requests=[];
  await page.route('https://graph.microsoft.com/v1.0/**',async route=>{
    requests.push(route.request().url());
    expect(route.request().headers().authorization).toBe('Bearer test-url-access-token');
    if(new URL(route.request().url()).pathname.endsWith('/content')){
      await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="navy"/></svg>'});
    }else{
      expect(route.request().headers().prefer).toBe('redeemSharingLink');
      await route.fulfill({json:{id:'shared-photo',name:'shared-photo.jpg',file:{}}});
    }
  });
  await play(page);
  await expect(page.locator('#slideImage')).toHaveAttribute('alt','shared-photo.jpg');
  await expect(page.locator('#slideImage')).toHaveJSProperty('naturalWidth',640);
  await expect(page.locator('#mainNav')).toBeHidden();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toContain('/shares/u!'+Buffer.from('https://1drv.ms/i/example').toString('base64url')+'/driveItem');
  expect(requests[1]).toBe(requests[0]+'/content');
});

test('Include subfolders applies to a shared URL with a remote folder',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    localStorage.setItem('slideshow_source','url');
    localStorage.setItem('slideshow_sourceUrl','https://1drv.ms/f/example');
    window.__sharedRequests=[];
    oneDriveGraphJson=async path=>{
      __sharedRequests.push(path);
      if(path.startsWith('/shares/'))return {id:'root',name:'Shared folder',folder:{},parentReference:{driveId:'root-drive'}};
      if(path.includes('/items/root/'))return {value:[{remoteItem:{id:'nested',name:'Year',folder:{},parentReference:{driveId:'other-drive'}}}]};
      return {value:[{id:'photo',name:'nested-photo.jpg',file:{}}]};
    };
    oneDriveGraphRequest=async()=>new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="700" height="400"><rect width="700" height="400" fill="teal"/></svg>'],{type:'image/svg+xml'});
    openSettings();
  });
  await play(page);
  await expect(page.locator('#slideSettingsStatus')).toContainText('No supported images');
  expect(await page.evaluate(()=>__sharedRequests.some(path=>path.includes('other-drive')))).toBe(false);
  await page.locator('#slideRecursive').check();
  await play(page);
  await expect(page.locator('#slideImage')).toHaveAttribute('alt','nested-photo.jpg');
  await expect(page.locator('#slideImage')).toHaveJSProperty('naturalWidth',700);
  expect(await page.evaluate(()=>__sharedRequests.some(path=>path.startsWith('/drives/other-drive/items/nested/children')))).toBe(true);
});

test('Play opens OneDrive folder selection inside the top level folder',async({page})=>{
  await setup(page);await page.evaluate(()=>openSettings());
  await expect(page.locator('#playSlides button')).toBeEnabled();
  await page.locator('#playSlides button').click();
  await expect(page.locator('#slideFolderPage')).toBeVisible();
  await expect(page.locator('#slideFolderPath')).toHaveText('Pictures');
  await expect(page.locator('#parentSlideFolder button')).toBeDisabled();
  await page.locator('#slideFolderList button').click();
  await expect(page.locator('#slideFolderPath')).toHaveText('Pictures/Holiday & friends');
  await expect(page.locator('#useSlideFolder button')).toBeEnabled();
  await page.locator('#useSlideFolder button').click();
  await expect(page.locator('#slideImage')).toHaveAttribute('alt','beach.webp');
  await expect(page.locator('#mainNav')).toBeHidden();
});

test('Play opens folder selection inside a shared OneDrive URL',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    localStorage.setItem('slideshow_source','url');
    localStorage.setItem('slideshow_sourceUrl','https://1drv.ms/f/example');
    oneDriveGraphJson=async path=>{
      if(path.startsWith('/shares/'))return {id:'root',name:'Shared photos',folder:{},parentReference:{driveId:'shared-drive'}};
      if(path.includes('/items/root/'))return {value:[{id:'year',name:'Year',folder:{},parentReference:{driveId:'shared-drive'}}]};
      return {value:[{id:'photo',name:'chosen-folder.jpg',file:{}}]};
    };
    oneDriveGraphRequest=async()=>new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="700" height="400"><rect width="700" height="400" fill="teal"/></svg>'],{type:'image/svg+xml'});
    openSettings();
  });
  await page.locator('#playSlides button').click();
  await expect(page.locator('#slideFolderPage')).toBeVisible();
  await expect(page.locator('#slideFolderPath')).toHaveText('Shared photos');
  await expect(page.locator('#parentSlideFolder button')).toBeDisabled();
  await page.locator('#slideFolderList button').click();
  await expect(page.locator('#slideFolderPath')).toHaveText('Shared photos/Year');
  await page.locator('#parentSlideFolder button').click();
  await expect(page.locator('#slideFolderPath')).toHaveText('Shared photos');
  await expect(page.locator('#parentSlideFolder button')).toBeDisabled();
  await page.locator('#slideFolderList button').click();
  await expect(page.locator('#slideFolderPath')).toHaveText('Shared photos/Year');
  await expect(page.locator('#useSlideFolder button')).toBeEnabled();
  await page.locator('#useSlideFolder button').click();
  await expect(page.locator('#slideImage')).toHaveAttribute('alt','chosen-folder.jpg');
  expect(await page.evaluate(()=>ss.files.map(file=>file.name))).toEqual(['chosen-folder.jpg']);
});
