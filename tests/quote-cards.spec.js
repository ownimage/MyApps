const {test,expect}=require('@playwright/test');
test.use({serviceWorkers:'block'});
const data=[{q:'The same daily quote in every app.',a:'First author',sources:['zenquotes']},{q:'A manually changed quote.',a:'Second author',sources:['goodreads']}];
test.beforeEach(async({context})=>{
  await context.addInitScript(()=>{delete Object.getPrototypeOf(navigator).serviceWorker;});
  await context.route('**/Quote/quotes.json*',route=>route.fulfill({json:data}));
});
for(const app of ['PlanMyDay','CountMyDays']){
  test(app+' Show quote is opt-in, persistent and can be switched off',async({page})=>{
    await page.goto('/'+app+'/');await expect(page.locator('smd-quote')).toHaveCount(0);
    await page.evaluate(()=>openSettings());await page.locator('#general-tab').click();
    await expect(page.locator('#showQuote input')).not.toBeChecked();await page.locator('#showQuote input').check();
    await page.evaluate(()=>closeSettings());await expect(page.locator('smd-quote .smd-quote-text')).toHaveText(data[0].q);
    await expect(page.locator('smd-quote .smd-quote-author')).toHaveText('— First author');
    await page.reload();await expect(page.locator('smd-quote .smd-quote-text')).toHaveText(data[0].q);
    await page.evaluate(()=>openSettings());await page.locator('#general-tab').click();await expect(page.locator('#showQuote input')).toBeChecked();
    await page.locator('#showQuote input').uncheck();await page.evaluate(()=>closeSettings());await expect(page.locator('smd-quote')).toHaveCount(0);
  });
}
test('manual Quote changes update both open apps through the shared counter',async({context,page})=>{
  const pages=[await context.newPage(),await context.newPage()];
  for(const [index,app] of ['PlanMyDay','CountMyDays'].entries()){
    await pages[index].goto('/'+app+'/');await pages[index].evaluate(()=>smdChangeShowQuote(true));
    await expect(pages[index].locator('smd-quote .smd-quote-text')).toHaveText(data[0].q);
  }
  await page.goto('/Quote/');await expect(page.locator('#quoteDisplay .smd-big-text-line').first()).toHaveText(data[0].q);
  await page.locator('#btnMainMenu').click();await page.getByRole('link',{name:'Change quote',exact:true}).click();
  for(const other of pages){await expect(other.locator('smd-quote .smd-quote-text')).toHaveText(data[1].q);await expect(other.locator('.smd-quote-credit')).toHaveText('Quote from Goodreads');}
});
test('cards advance the daily selection without opening the Quote app',async({page})=>{
  const now=new Date();now.setHours(12,0,0,0);await page.clock.install({time:now});
  await page.goto('/CountMyDays/');await page.evaluate(()=>smdChangeShowQuote(true));
  await expect(page.locator('smd-quote .smd-quote-text')).toHaveText(data[0].q);
  const until=await page.evaluate(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)-d+1000;});
  await page.clock.fastForward(until);await expect(page.locator('smd-quote .smd-quote-text')).toHaveText(data[1].q);
});
test('re-rendering main view keeps one subscribed card and safe text',async({page})=>{
  await page.goto('/PlanMyDay/');await page.evaluate(()=>{smdChangeShowQuote(true);renderMain();renderMain();});
  await expect(page.locator('smd-quote')).toHaveCount(1);await expect(page.locator('.smd-quote-text')).toHaveText(data[0].q);
  await page.evaluate(()=>{SmdQuotes.items[0].q='<img src=x onerror=alert(1)>';SmdQuotes.sync();});
  await expect(page.locator('.smd-quote-text')).toHaveText('<img src=x onerror=alert(1)>');await expect(page.locator('smd-quote img')).toHaveCount(0);
});

test('Show quote flags are independent in PlanMyDay and CountMyDays',async({context})=>{
  const pmd=await context.newPage(),cmd=await context.newPage();
  await pmd.goto('/PlanMyDay/');await cmd.goto('/CountMyDays/');
  const pmdKey=await pmd.evaluate(()=>smdKey('showQuote'));
  const cmdKey=await cmd.evaluate(()=>smdKey('showQuote'));
  expect(pmdKey).not.toBe(cmdKey);
  await pmd.evaluate(()=>smdChangeShowQuote(true));
  await expect(pmd.locator('smd-quote')).toHaveCount(1);await expect(cmd.locator('smd-quote')).toHaveCount(0);
  await cmd.reload();await expect(cmd.locator('smd-quote')).toHaveCount(0);
  await cmd.evaluate(()=>smdChangeShowQuote(true));await pmd.evaluate(()=>smdChangeShowQuote(false));
  await cmd.reload();await pmd.reload();
  await expect(cmd.locator('smd-quote')).toHaveCount(1);await expect(pmd.locator('smd-quote')).toHaveCount(0);
});
