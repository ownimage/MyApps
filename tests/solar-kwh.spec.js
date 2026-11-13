const { test, expect } = require('@playwright/test');
const { mockFlaskApi } = require('./solar-fixtures');
const { pickOption } = require('./theme-controls');
test.use({serviceWorkers:'block'});
const values={day:['2026-09-15','2026-09-14'],month:['2026-09','2026-08'],year:['2026','2025']};
function plot(period,value){return {period,value,labels:period==='day'?['00:00','00:05']:period==='month'?[value+'-01',value+'-02']:[value+'-01',value+'-02'],series:{grid_import:[0,1],grid_export:[0,2],ac_charge:[0,3],solar:[0,4],usage:[0,5]}};}
async function boot(page, calls){
  await mockFlaskApi(page);
  await page.route('**/solar/api/energy_*',route=>{
    const url=new URL(route.request().url()),period=url.searchParams.get('period'),value=url.searchParams.get('value');
    calls.push(url.pathname+url.search);
    return route.fulfill({json:url.pathname.endsWith('energy_values')?{period,values:values[period]}:plot(period,value)});
  });
  await page.goto('/SolarControlar/',{waitUntil:'domcontentloaded'});
}
async function chart(page,value){await expect.poll(()=>page.evaluate(()=>window._energyChart?.data.datasets[4].data.map(p=>typeof p==='object' && p!==null?p.y:p))).toEqual([0,value]);}
test('KWh fetches only selected periods and toggles all five series locally',async({page})=>{
  const calls=[];await boot(page,calls);
  await expect(page.locator('#mainTabs .smd-tab-btn')).toHaveText(['Now','Settings','Files','Config','Forecast','Power','kWh']);
  expect(calls).toEqual([]);
  await page.getByRole('tab',{name:'kWh',exact:true}).click();await chart(page,5);
  expect(calls).toEqual(['/solar/api/energy_values?period=day','/solar/api/energy_data?period=day&value=2026-09-15']);
  await expect(page.locator('#energy-period')).toHaveJSProperty('tagName','SMD-SELECT');
  await expect(page.locator('#energy-value')).toHaveJSProperty('tagName','SMD-SELECT');
  await expect(page.locator('.energy-series')).toHaveCount(5);
  await expect(page.locator('.energy-series[value="usage"]')).toHaveText('Home');
  await expect.poll(()=>page.evaluate(()=>_energyChart.data.datasets.map(dataset=>dataset.label))).toEqual(['Grid Import','Grid Export','AC Charge','Solar','Home']);
  for(let i=0;i<5;i++){
    const cb=page.locator('.energy-series').nth(i);await cb.uncheck();
    await expect.poll(()=>page.evaluate(i=>_energyChart.isDatasetVisible(i),i)).toBe(false);
    await cb.check();
  }
  expect(calls).toHaveLength(2);
  for(const period of ['month','year']){
    await pickOption(page,'#energy-period',period);
    await expect(page.locator('#energy-value')).toHaveAttribute('value',values[period][0]);
    await expect.poll(()=>calls.at(-1)).toBe('/solar/api/energy_data?period='+period+'&value='+values[period][0]);
    await chart(page,5);
    await pickOption(page,'#energy-value',values[period][1]);
    await expect.poll(()=>calls.at(-1)).toBe('/solar/api/energy_data?period='+period+'&value='+values[period][1]);
  }
  expect(calls).toHaveLength(8);
});
test('KWh ignores stale data and values responses after period changes',async({page})=>{
  const calls=[];await boot(page,calls);
  let release;const held=new Promise(ok=>release=ok);let pending;
  await page.route('**/solar/api/energy_data?period=day*',async route=>{pending=true;await held;await route.fulfill({json:plot('day','2026-09-15')});});
  await page.getByRole('tab',{name:'kWh',exact:true}).click();
  await expect.poll(()=>pending).toBe(true);
  await pickOption(page,'#energy-period','month');await chart(page,5);
  const oldData=page.waitForResponse(r=>r.url().includes('/energy_data?period=day'));
  release();await (await oldData).finished();await page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
  await expect.poll(()=>page.evaluate(()=>_energyChart.data.labels[0])).toBe('2026-09-01');
  let releaseValues;const heldValues=new Promise(ok=>releaseValues=ok);let valuesPending;
  await page.route('**/solar/api/energy_values?period=day',async route=>{valuesPending=true;await heldValues;await route.fulfill({json:{values:values.day}});});
  await pickOption(page,'#energy-period','day');await expect.poll(()=>valuesPending).toBe(true);
  await pickOption(page,'#energy-period','year');await chart(page,5);
  const oldValues=page.waitForResponse(r=>r.url().includes('/energy_values?period=day'));
  releaseValues();await (await oldValues).finished();await page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
  await expect(page.locator('#energy-value')).toHaveAttribute('value','2026');
  await expect.poll(()=>page.evaluate(()=>_energyChart.data.labels[0])).toBe('2026-01');
});
test('KWh clears stale charts on empty history and failed requests',async({page})=>{
  const calls=[];await boot(page,calls);
  await page.getByRole('tab',{name:'kWh',exact:true}).click();await chart(page,5);
  await page.route('**/solar/api/energy_values?period=month',route=>route.fulfill({json:{values:[]}}));
  await pickOption(page,'#energy-period','month');
  await expect(page.locator('#energy-status')).toContainText('No energy data');
  await expect(page.locator('#energyChart')).toBeHidden();
  await page.route('**/solar/api/energy_values?period=year',route=>route.fulfill({status:500,body:'unavailable'}));
  await pickOption(page,'#energy-period','year');
  await expect(page.locator('#energy-status')).toContainText('Unable to load');
  await expect(page.locator('#energyChart')).toBeHidden();
  await page.route('**/solar/api/energy_data?period=day*',route=>route.fulfill({status:500,body:'unavailable'}));
  await pickOption(page,'#energy-period','day');
  await expect(page.locator('#energy-status')).toContainText('Unable to load');
});
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
test('chart axes use straight segments and a full day with hourly labels and faint half hours',async({page})=>{
  await boot(page,[]);
  await page.getByRole('tab',{name:'kWh',exact:true}).click();await chart(page,5);
  await page.getByRole('tab',{name:'Power',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!window._powerChart)).toBe(true);
  const expected=Array.from({length:49},(_,i)=>i%2?'':String(i/2).padStart(2,'0')+':00');
  for(const key of ['_energyChart','_powerChart']){
    const result=await page.evaluate(key=>{
      const c=window[key],x=c.scales.x;
      const grid=x.getTicks().map((t,index)=>x.options.grid.setContext(x.getContext(index)).color);
      return {labels:x.ticks.map(t=>t.label),min:x.min,max:x.max,tension:c.data.datasets.map((d,i)=>c.getDatasetMeta(i).dataset.options.tension),
        alpha:grid.slice(0,2).map(col=>Chart.helpers.color(col).rgb.a),
        pointX:c.getDatasetMeta(0)._parsed.map(p=>p.x),
        spacing:x.getPixelForValue(60)-x.getPixelForValue(30),nextSpacing:x.getPixelForValue(90)-x.getPixelForValue(60)};
    },key);
    expect(result.labels).toEqual(expected);
    expect(result.tension).toEqual([0,0,0,0,0]);
    expect(result.min).toBe(0);expect(result.max).toBe(1440);
    expect(result.alpha[1]).toBeLessThan(result.alpha[0]);
    expect(result.spacing).toBeCloseTo(result.nextSpacing,5);
    expect(result.pointX).toEqual(key==='_energyChart'?[0,5]:[360,420,480]);
  }
});
test('chart axes show every month day and twelve named months with period titles',async({page})=>{
  await boot(page,[]);
  await page.route('**/solar/api/energy_data*',route=>{
    const url=new URL(route.request().url()),period=url.searchParams.get('period'),value=url.searchParams.get('value');
    const p=plot(period,value);
    if(period!=='day'){
      const count=period==='year'?12:new Date(Number(value.slice(0,4)),Number(value.slice(5,7)),0).getDate();
      p.labels=Array.from({length:count},(_,i)=>value+'-'+String(i+1).padStart(2,'0'));
      for(const key of Object.keys(p.series))p.series[key]=Array.from({length:count},(_,i)=>i);
    }
    return route.fulfill({json:p});
  });
  await page.getByRole('tab',{name:'kWh',exact:true}).click();await chart(page,5);
  for(const period of ['month','year']){
    await pickOption(page,'#energy-period',period);
    const count=period==='year'?12:30;
    await expect.poll(()=>page.evaluate(()=>window._energyChart?.data.labels.length)).toBe(count);
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:950});
      await expect.poll(()=>page.evaluate(()=>{const c=_energyChart.canvas;return Math.abs(c.width-c.getBoundingClientRect().width*devicePixelRatio)<2;})).toBe(true);
      const x=await page.evaluate(()=>({labels:_energyChart.scales.x.ticks.map(t=>t.label),title:_energyChart.scales.x.options.title.text,tension:_energyChart.data.datasets.map(d=>d.tension)}));
      expect(x.labels).toEqual(period==='year'?MONTHS:Array.from({length:count},(_,i)=>String(i+1)));
      expect(x.title).toBe(period==='year'?'2026':'Sep 2026');
      expect(x.tension).toEqual([0,0,0,0,0]);
    }
  }
});
test('KWh day axis title follows the selected date as DD Mon YYYY',async({page})=>{
  await boot(page,[]);
  await page.route('**/solar/api/energy_values?period=day',route=>route.fulfill({json:{period:'day',values:['2026-09-09','2026-09-08']}}));
  await page.getByRole('tab',{name:'kWh',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window._energyChart?.scales.x.options.title.text)).toBe('09 Sep 2026');
  await pickOption(page,'#energy-value','2026-09-08');
  await expect.poll(()=>page.evaluate(()=>window._energyChart?.scales.x.options.title.text)).toBe('08 Sep 2026');
  await page.getByRole('tab',{name:'Power',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window._powerChart?.scales.x.options.title.text)).toBe('Time');
});
for(const [period,largestSeries] of [['day',0],['month',3],['year',4]]) {
  test('KWh '+period+' scale includes the largest of all five series through visibility changes',async({page})=>{
    await boot(page,[]);
    const peak=period==='day'?53.7:period==='month'?127.4:1532.8;
    await page.route('**/solar/api/energy_data*',route=>{
      const url=new URL(route.request().url()),p=url.searchParams.get('period'),value=url.searchParams.get('value');
      const payload=plot(p,value);
      payload.labels=p==='day'?['00:00','06:00','12:00']:[value+'-01',value+'-02',value+'-03'];
      Object.keys(payload.series).forEach((key,i)=>payload.series[key]=[0,i===largestSeries?peak:(i+1)*0.1,null]);
      return route.fulfill({json:payload});
    });
    await page.getByRole('tab',{name:'kWh',exact:true}).click();
    if(period!=='day')await pickOption(page,'#energy-period',period);
    await expect.poll(()=>page.evaluate(()=>window._energyChart?.scales.y.max)).toBeGreaterThanOrEqual(peak);
    await page.locator('.energy-series').nth(largestSeries).uncheck();
    await expect.poll(()=>page.evaluate(()=>_energyChart.scales.y.max)).toBeGreaterThanOrEqual(peak);
    for(const cb of await page.locator('.energy-series').all())await cb.uncheck();
    await expect.poll(()=>page.evaluate(()=>_energyChart.scales.y.max)).toBeGreaterThanOrEqual(peak);
    for(const cb of await page.locator('.energy-series').all())await cb.check();
    await expect.poll(()=>page.evaluate(()=>_energyChart.scales.y.max)).toBeGreaterThanOrEqual(peak);
    // Check the resolved axis and rendered point, not just configuration values.
    const plotted=await page.evaluate(i=>{
      const c=_energyChart,point=c.getDatasetMeta(i).data[1];
      return {min:c.scales.y.min,max:c.scales.y.max,peak:c.getDatasetMeta(i)._parsed[1].y,
        y:point.getProps(['y'],true).y,top:c.chartArea.top,bottom:c.chartArea.bottom};
    },largestSeries);
    expect(plotted.min).toBe(0);expect(plotted.peak).toBe(peak);
    expect(plotted.y).toBeGreaterThanOrEqual(plotted.top);
    expect(plotted.y).toBeLessThanOrEqual(plotted.bottom);
  });
}
for(const period of ['day','month','year']) {
  test('KWh '+period+' scale uses the latest available value from each series',async({page})=>{
    await boot(page,[]);
    await page.route('**/solar/api/energy_data*',route=>{
      const url=new URL(route.request().url()),p=url.searchParams.get('period'),value=url.searchParams.get('value');
      const labels=p==='day'?['00:00','00:05','00:10','00:15']:[1,2,3,4].map(i=>value+'-0'+i);
      // A small Usage correction must not change which samples supply the
      // endpoint-based scale; missing future calendar slots aren't zeroes.
      return route.fulfill({json:{period:p,value,labels,series:{
        grid_import:[0,2,2.1,null],grid_export:[0,2.2,2.3,null],ac_charge:[0,0,0.1,null],
        solar:[0,0.1,0.2,null],usage:[0,5.4,5.3,null]}}});
    });
    await page.getByRole('tab',{name:'kWh',exact:true}).click();
    if(period!=='day')await pickOption(page,'#energy-period',period);
    await expect.poll(()=>page.evaluate(()=>window._energyChart?.options.scales.y.suggestedMax)).toBe(5.3);
    await expect.poll(()=>page.evaluate(()=>_energyChart.scales.y.max)).toBeGreaterThanOrEqual(5.3);
    await page.locator('.energy-series[value="usage"]').uncheck();
    await expect.poll(()=>page.evaluate(()=>_energyChart.options.scales.y.suggestedMax)).toBe(5.3);
    await expect.poll(()=>page.evaluate(()=>_energyChart.scales.y.max)).toBeGreaterThanOrEqual(5.3);
  });
}
