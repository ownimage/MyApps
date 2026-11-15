const {test,expect} = require('./functional-test');
const {applyThemeAndWait} = require('./theme-controls');
const {routeEditorSources,buttonPaint} = require('./editor-test-helpers');
const fs = require('fs');
const path = require('path');
const themes = fs.readdirSync(path.join(__dirname,'../shared/css/themes'),{withFileTypes:true})
  .filter(entry => entry.isDirectory()).map(entry => entry.name);
const controls = {
  list:{app:'ListOfLists',bottom:'#listAddItemBottomBtn',top:'#listAddItemBtn',input:'input.item-desc-input'},
  task:{app:'PlanMyDay',bottom:'#jobAddTaskBottomBtn',top:'#jobAddTaskBtn',input:'input.task-desc-input'}
};
test.beforeEach(async({page}) => {
  await routeEditorSources(page);
  await page.addInitScript(() => {
    localStorage.setItem('lol_slideDuration','0');
    localStorage.setItem('planmydays_slideDuration','0');
  });
});
async function openEditor(page,control,theme,mode) {
  await page.goto('/'+control.app+'/',{waitUntil:'domcontentloaded'});
  await applyThemeAndWait(page,theme,mode);
  await page.addStyleTag({content:'*{transition:none!important;animation:none!important}'});
  if(control.app==='ListOfLists') {
    await page.evaluate(() => {
      localStorage.setItem('lol_categories',JSON.stringify([{title:'Test',lists:[]}]));
      listsCategoryIndex=0;
      addNewList();
    });
    await page.locator('#listTitleInput').fill('Title');
  } else {
    await page.locator('#btnAddCard').click();
    await page.locator('#jobTitleInput').fill('Title');
    await page.locator('#jobTasks-tab').click();
  }
}
test.describe('Native-theme touch add controls',() => {
  test.use({hasTouch:true,isMobile:true,viewport:{width:620,height:850}});
  for(const theme of themes) for(const [name,control] of Object.entries(controls)) {
    test(`Add ${name} clears retained touch hover - ${theme}`,async({page}) => {
      for(const mode of ['light','dark']) {
        await openEditor(page,control,theme,mode);
        const bottom=page.locator(control.bottom),top=page.locator(control.top),input=page.locator(control.input);
        const idle=await buttonPaint(bottom);
        await bottom.tap();
        await expect(input).toBeFocused();
        expect(await buttonPaint(bottom),mode+' bottom').toEqual(idle);
        expect(await buttonPaint(top),mode+' top').toEqual(idle);
        await input.fill('First');
        await bottom.tap();
        await expect(input.last()).toBeFocused();
        await input.last().fill('Second');
        expect(await buttonPaint(bottom)).toEqual(idle);
        await top.tap();
        await expect(input.first()).toBeFocused();
        await input.first().fill('Top');
        expect(await buttonPaint(top)).toEqual(idle);
        expect(await input.evaluateAll(inputs => inputs.map(el => el.value))).toEqual(['Top','First','Second']);
      }
    });
  }
  for(const theme of ['superhero','brite']) {
    test(`Add Job hides the tapped main-page button - ${theme}`,async({page}) => {
      await page.goto('/PlanMyDay/',{waitUntil:'domcontentloaded'});
      await applyThemeAndWait(page,theme,'light');
      await page.locator('#btnAddCard').tap();
      await expect(page.locator('#jobTitleInput')).toBeVisible();
      await expect(page.locator('#btnAddCard')).not.toBeVisible();
    });
  }
});
test.describe('Native-theme mouse and keyboard add controls',() => {
  for(const theme of ['superhero','brite']) for(const [name,control] of Object.entries(controls)) {
    test(`Add ${name} preserves mouse hover and keyboard focus - ${theme}`,async({page}) => {
      await openEditor(page,control,theme,'light');
      const bottom=page.locator(control.bottom),input=page.locator(control.input);
      await page.mouse.move(0,0);
      const idle=await buttonPaint(bottom);
      await bottom.hover();
      expect(await buttonPaint(bottom)).not.toEqual(idle);
      await page.mouse.move(0,0);
      expect(await buttonPaint(bottom)).toEqual(idle);
      for(let count=1;count<=2;count++) {
        await bottom.focus();
        await page.keyboard.press('Enter');
        await expect(input).toHaveCount(count);
        await expect(input.last()).toBeFocused();
      }
    });
  }
});
