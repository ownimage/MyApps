const {test,expect}=require('@playwright/test');
test.use({serviceWorkers:'block',timezoneId:'Europe/London'});
test.beforeEach(async({page})=>{await page.addInitScript(()=>{delete Object.getPrototypeOf(navigator).serviceWorker;});});
const quotes=[{q:'First quote for today.',a:'First author'},{q:'Second quote for another day.',a:'Second author',sources:['goodreads']},{q:'Third quote to wrap the counter.',a:'Third author'}];
async function setup(page, state) {
  const now=new Date();now.setHours(12,0,0,0);
  await page.clock.install({time:now});
  await page.route('**/Quote/quotes.json*',route=>route.fulfill({json:quotes}));
  if(state)await page.addInitScript(state=>{if(!sessionStorage.getItem('quoteTestSeeded')){localStorage.setItem('quote_daily',JSON.stringify(state));sessionStorage.setItem('quoteTestSeeded','1');}},state);
  await page.goto('/Quote/');
  await expect(page.locator('#quoteDisplay .smd-big-text-line')).toHaveCount(2);
  return now;
}
const day=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;
test('shared big text fits styled lines and still supports plain text',async({page})=>{
  await page.goto('/BigText/');
  await page.evaluate(()=>{const el=document.getElementById('bigTextDisplay');el.lines=[{text:'A bold quote',weight:700},{text:'An author',scale:.45,gap:.5}];el.fit();});
  const lines=page.locator('#bigTextDisplay .smd-big-text-line');
  await expect(lines).toHaveText(['A bold quote','An author']);
  const sizes=await lines.evaluateAll(nodes=>nodes.map(n=>({size:parseFloat(getComputedStyle(n).fontSize),weight:getComputedStyle(n).fontWeight})));
  expect(sizes[0].size).toBeGreaterThan(sizes[1].size*2);expect(sizes[0].weight).toBe('700');
  await page.evaluate(()=>{const el=document.getElementById('bigTextDisplay');el.value='<b>plain text</b>';el.fit();});
  await expect(lines).toHaveCount(0);await expect(page.locator('.smd-big-text-content')).toHaveText('<b>plain text</b>');
});
test('first quote is stable on reload and Change quote advances and persists',async({page})=>{
  await setup(page);await expect(page.locator('#quoteDisplay .smd-big-text-line').first()).toHaveText(quotes[0].q);
  await expect(page.locator('#quoteCredit')).toHaveText('Quote from ZenQuotes');
  await page.locator('#btnMainMenu').click();await page.getByRole('link',{name:'Change quote',exact:true}).click();
  await expect(page.locator('#quoteCredit')).toHaveText('Quote from Goodreads');
  await expect(page.locator('#quoteDisplay .smd-big-text-line').first()).toHaveText(quotes[1].q);
  await page.reload();await expect(page.locator('#quoteDisplay .smd-big-text-line').first()).toHaveText(quotes[1].q);
});
test('daily counter catches up missed days and wraps by the quote count',async({page})=>{
  const now=new Date();const state={counter:2,day:day(now)-2};
  await setup(page,state);await expect(page.locator('#quoteDisplay .smd-big-text-line').first()).toHaveText(quotes[1].q);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('quote_daily')).counter)).toBe(4);
});
test('open app advances at local midnight and once more the following day',async({page})=>{
  const now=await setup(page);const midnight=new Date(await page.evaluate(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime();}));
  await page.clock.fastForward(midnight.getTime()-now.getTime()+1000);
  await expect(page.locator('#quoteDisplay .smd-big-text-line').first()).toHaveText(quotes[1].q);
  const untilTomorrow=await page.evaluate(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime()-d.getTime()+1000;});
  await page.clock.fastForward(untilTomorrow);
  await expect(page.locator('#quoteDisplay .smd-big-text-line').first()).toHaveText(quotes[2].q);
});
test('calendar day arithmetic handles both daylight-saving boundaries without hourly drift',async({page})=>{
  await setup(page);
  const results=await page.evaluate(()=>{
    const year=new Date().getFullYear();
    return [2,9].map(month=>{
      const transition=new Date(year,month+1,0,12);
      transition.setDate(transition.getDate()-transition.getDay());
      const before=new Date(year,month,transition.getDate()-1,12);
      return {days:quoteDayNumber(transition)-quoteDayNumber(before),hours:(transition-before)/3600000};
    });
  });
  expect(results).toEqual([{days:1,hours:23},{days:1,hours:25}]);
});
test('backwards clock changes never advance the same day twice',async({page})=>{
  await setup(page);const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('quote_daily')));
  await page.clock.setSystemTime(new Date(Date.now()-86400000));await page.evaluate(()=>quoteSyncDay());
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('quote_daily')))).toEqual(state);
});
test('styled quote fits desktop and phone, and appearance settings use the shared shell',async({page})=>{
  await setup(page);
  for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await expect.poll(()=>page.evaluate(()=>{const el=document.getElementById('quoteDisplay');el.fit();const view=el.querySelector('.smd-big-text-viewport').getBoundingClientRect();const content=el.querySelector('.smd-big-text-content'),r=content.getBoundingClientRect();return r.width>0&&content.scrollWidth<=view.width&&content.scrollHeight<=view.height&&r.top>=view.top&&r.bottom<=view.bottom;})).toBe(true);
  }
  await page.evaluate(()=>openSettings());await expect(page.locator('#settingsTabs > .smd-tab-list button')).toHaveText(['Display','Danger']);
  await expect(page.locator('#screenResolution')).toHaveText('390 × 844 (1x)');
  await expect(page.locator('#quoteFont')).toHaveAttribute('value','atkinson');
});
test('bad persisted state recovers and failed data can be retried from the menu',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('quote_daily','{invalid'));
  await page.route('**/Quote/quotes.json*',route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.goto('/Quote/');await expect(page.locator('#quoteStatus')).toContainText('Unable to load');
  await page.unroute('**/Quote/quotes.json*');await page.route('**/Quote/quotes.json*',route=>route.fulfill({json:quotes}));
  await page.locator('#btnMainMenu').click();await page.getByRole('link',{name:'Change quote',exact:true}).click();
  await expect(page.locator('#quoteDisplay .smd-big-text-line').first()).toHaveText(quotes[0].q);
});

test('styled quote uses the available phone area despite invisible wrap spaces',async({page})=>{
  await setup(page);await page.setViewportSize({width:390,height:844});
  await page.evaluate(async()=>{const el=document.getElementById('quoteDisplay');el.lines=[{text:'Begin at once to live, and count each separate day as a separate life.',weight:700},{text:'— Seneca',scale:.45,gap:.65}];await document.fonts.ready;el.fit();});
  expect(await page.locator('#quoteDisplay .smd-big-text-content').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(50);
});

test('ZenQuotes wins when metadata lists both providers',async({page})=>{
  await setup(page);await page.evaluate(()=>{quoteItems[0].sources=['goodreads','zenquotes'];renderQuote();});
  await expect(page.locator('#quoteCredit')).toHaveText('Quote from ZenQuotes');
  await expect(page.locator('#quoteCredit a')).toHaveCount(1);
});
