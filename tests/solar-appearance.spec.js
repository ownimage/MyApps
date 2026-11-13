
const { test, expect } = require('@playwright/test');
const { mockFlaskApi } = require('./solar-fixtures');
test.use({ serviceWorkers: 'block' });
const THEMES = ['bootstrap','brite','cerulean','cosmo','cyborg','darkly','flatly','journal','litera','lumen','lux','materia','minty','morph','pulse','quartz','sandstone','simplex','sketchy','slate','solar','spacelab','superhero','united','vapor','yeti','zephyr'];
const { theme, inspectContrast } = require("./solar-appearance-helpers");
for(const name of THEMES) test('Solar appearance contrast '+name,async({page})=>{
  test.setTimeout(120000);await mockFlaskApi(page);await page.goto('/SolarControlar/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#tab-power .power-table')).toBeVisible();await page.addStyleTag({content:'*, *::before, *::after { transition: none !important; }'});const failures=[];
  for(const mode of ['light','dark']){
    await theme(page,name,mode);
    for(const tab of ['Now','Settings','Files','Config','Forecast','Power','kWh']){
      await page.locator('#mainTabs .smd-tab-btn').filter({hasText:new RegExp('^'+tab+'$')}).click();
      if(tab==='Settings'){await expect(page.locator('#solarSettingsForm')).toBeVisible();await page.locator('input[name=start_discharge_target]').fill('91');}
      if(tab==='Config'){await expect(page.locator('#configSlider')).toBeVisible();await page.locator('#configSlider').fill('60');}
      if(tab==='Files'){await page.locator('.log-controls .btn-primary').click();await expect(page.locator('#log-output')).toContainText('mock log');}
      if(tab==='Forecast'){await page.locator('#btnRunForecast').click();await expect(page.locator('#forecastOutput')).toContainText('mock forecast');}
      if(tab==='Power')await expect.poll(()=>page.evaluate(()=>!!window._powerChart)).toBeTruthy();
      if(tab==='kWh')await expect.poll(()=>page.evaluate(()=>!!window._energyChart)).toBeTruthy();
      failures.push(...(await page.evaluate(inspectContrast)).map(f=>({mode,tab,...f})));
      const action=page.locator('#mainTabs .smd-tab-panel[active] .btn-primary').first();
      if(await action.count()) for(const state of ['hover','focus']) {
        if(state==='hover')await action.hover();else await action.focus();
        failures.push(...(await page.evaluate(inspectContrast)).map(f=>({mode,tab,state,...f})));
      }
      if(tab==='Files'||tab==='Power'||tab==='kWh'){
        const control=page.locator(tab==='Files'?'#log-file .smd-select-btn':tab==='kWh'?'#energy-value .smd-select-btn':'#graph-date .smd-select-btn');
        await control.click();
        failures.push(...(await page.evaluate(inspectContrast)).map(f=>({mode,tab,state:'open select',...f})));
        await control.press('Escape');
      }
    }
  }
  await require("fs").promises.writeFile(test.info().outputPath("contrast.json"), JSON.stringify(failures,null,2));
  expect(failures).toEqual([]);
});
for(const installed of [false,true])test('Solar equal tiles and menu clearance '+(installed?'installed':'browser'),async({page})=>{
  if(installed)await page.addInitScript(()=>Object.defineProperty(navigator,'windowControlsOverlay',{value:{visible:true,addEventListener(){}}}));
  await mockFlaskApi(page);await page.goto('/SolarControlar/',{waitUntil:'domcontentloaded'});await expect(page.locator('#batteryPercent')).toHaveText('50%');
  for(const width of [1280,800,390])for(const font of ['normal','jumbo']) for(const compact of [false,true]) {
    await page.setViewportSize({width,height:950});await page.evaluate(compact=>document.body.classList.toggle('compact',compact),compact);await page.evaluate(font=>{document.body.classList.remove('font-size-normal','font-size-jumbo');document.body.classList.add('font-size-'+font);},font);
    const g=await page.evaluate(()=>{const cards=[...document.querySelectorAll('#topTiles .tile')];return {h:cards.map(e=>e.getBoundingClientRect().height),top:Math.min(...cards.map(e=>e.getBoundingClientRect().top)),nav:document.querySelector('#mainNav').getBoundingClientRect().bottom,overflow:cards.map(e=>e.scrollHeight>e.clientHeight+1),width:document.documentElement.scrollWidth};});
    expect.soft(Math.max(...g.h)-Math.min(...g.h),JSON.stringify({installed,width,font,g})).toBeLessThan(1);
    expect.soft(g.top-g.nav,JSON.stringify({installed,width,font,g})).toBeGreaterThanOrEqual(8);
    expect.soft(g.overflow).toEqual([false,false,false]);expect.soft(g.width).toBeLessThanOrEqual(width);
  }
});



test('Solar graph canvas stays sharp after tabs and viewport changes', async ({page}) => {
  await mockFlaskApi(page);
  await page.goto('/SolarControlar/', {waitUntil:'domcontentloaded'});
  for(const width of [1280,390,1280]) {
    await page.setViewportSize({width,height:900});
    for(const [tab,id,key] of [['Power','powerChart','_powerChart'],['kWh','energyChart','_energyChart']]) {
      await page.locator('#mainTabs .smd-tab-btn').filter({hasText:'Now'}).click();
      await page.getByRole('tab',{name:tab,exact:true}).click();
      await expect.poll(()=>page.evaluate(({id,key})=>{
        const c=document.getElementById(id);if(!c||!window[key])return false;
        const r=c.getBoundingClientRect();return Math.abs(c.width-r.width*devicePixelRatio)<2 && Math.abs(c.height-r.height*devicePixelRatio)<2;
      },{id,key})).toBeTruthy();
    }
  }
});

for (const name of THEMES) test('Solar shared tabs and card palette '+name, async ({page}) => {
  await mockFlaskApi(page);
  await page.goto('/SolarControlar/', {waitUntil:'domcontentloaded'});
  await expect(page.locator('#batteryPercent')).toHaveText('50%');
  await page.addStyleTag({content:'*, *::before, *::after { transition: none !important; }'});
  await page.evaluate(() => {
    const reference=document.createElement('div');
    reference.id='solarPaletteReference';
    reference.style.cssText='position:absolute;left:-10000px;width:500px';
    reference.innerHTML='<div class="card smd-card border-0 w-100">Shared card</div><smd-tabs></smd-tabs>';
    document.body.appendChild(reference);
    reference.querySelector('smd-tabs').tabs=[{title:'One'},{title:'Two'}];
  });
  for (const mode of ['light','dark']) {
    await theme(page,name,mode);
    const palette=await page.evaluate(() => {
      const paint=e=>{const s=getComputedStyle(e);return {background:s.backgroundColor,image:s.backgroundImage,color:s.color};};
      return { tabs:[...document.querySelectorAll('#mainTabs .smd-tab-btn')].slice(0,2).map(paint),
        referenceTabs:[...document.querySelectorAll('#solarPaletteReference .smd-tab-btn')].map(paint),
        cards:[...document.querySelectorAll('#topTiles .tile')].map(paint),
        referenceCard:paint(document.querySelector('#solarPaletteReference .card')) };
    });
    expect.soft(palette.tabs, name+' '+mode+' shared tabs').toEqual(palette.referenceTabs);
    for(const card of palette.cards) {
      expect.soft(card.background,name+' '+mode+' card background').toBe(palette.referenceCard.background);
      expect.soft(card.image,name+' '+mode+' card image').toBe(palette.referenceCard.image);
    }
  }
});

test('Solar Now tiles stay in one row and tabs remain clickable under the installed menu', async ({page}) => {
  test.setTimeout(15000);
  await page.addInitScript(()=>Object.defineProperty(navigator,'windowControlsOverlay',{value:{visible:true,addEventListener(){}}}));
  await mockFlaskApi(page); await page.goto('/SolarControlar/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#batteryPercent')).toHaveText('50%');
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:900});
    await page.getByRole('tab',{name:'Now',exact:true}).click();
    const cards=await page.locator('#topTiles .tile').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {width:r.width,top:r.top};}));
    expect(Math.max(...cards.map(c=>c.width))-Math.min(...cards.map(c=>c.width))).toBeLessThan(1);
    expect(new Set(cards.map(c=>Math.round(c.top))).size).toBe(1);
    await page.getByRole('tab',{name:'Settings',exact:true}).click();
    await expect(page.locator('#topTiles')).toBeHidden();
    await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
    await page.getByRole('tab',{name:'Now',exact:true}).click();
    await expect(page.locator('#topTiles')).toBeVisible();
  }
});
