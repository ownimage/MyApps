const {test,expect}=require('@playwright/test');
test.describe('Shared smd-input',()=>{
  test.beforeEach(async({page})=>{
    await page.addInitScript(()=>{delete Object.getPrototypeOf(navigator).serviceWorker;});
    await page.goto('/');
  });
  test('preserves labels, inline events, form data and numeric validation',async({page})=>{
    await page.evaluate(()=>{
      const form=document.createElement('form'); form.id='inputTestForm';
      form.innerHTML='<label for="testName">Name</label><smd-input input-id="testName" name="name" value="Initial" oninput="window.__inputEvents=(window.__inputEvents||0)+1" onchange="window.__changeValue=this.value"></smd-input><smd-input input-id="testNumber" name="count" type="number" min="1" max="10" step="1" value="3" required></smd-input>';
      document.body.appendChild(form);
    });
    await page.getByLabel('Name',{exact:true}).fill('Updated');
    await page.locator('#testName').blur();
    expect(await page.evaluate(()=>__inputEvents)).toBe(1);
    expect(await page.evaluate(()=>__changeValue)).toBe('Updated');
    expect(await page.evaluate(()=>Object.fromEntries(new FormData(document.getElementById('inputTestForm'))))).toEqual({name:'Updated',count:'3'});
    await page.locator('#testNumber').fill('11');
    expect(await page.locator('#testNumber').evaluate(el=>el.checkValidity())).toBe(false);
    await page.locator('#testNumber').fill('5');
    expect(await page.locator('#testNumber').evaluate(el=>el.checkValidity())).toBe(true);
  });
  test('reflects properties and attributes, preserves edits, and reconnects and clones once',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.evaluate(()=>{
      const field=document.createElement('smd-input'); field.id='testField'; field.value='before connect';
      field.setAttribute('aria-label','Shared field'); document.body.appendChild(field);
    });
    const input=page.locator('#testField input');
    await expect(input).toHaveValue('before connect');
    await input.fill('edited');
    await page.evaluate(()=>document.getElementById('testField').setAttribute('placeholder','Updated placeholder'));
    await expect(input).toHaveValue('edited');
    await page.evaluate(()=>{const f=document.getElementById('testField'); f.disabled=true;f.readOnly=true;});
    await expect(input).toBeDisabled(); await expect(input).toHaveJSProperty('readOnly',true);
    await page.evaluate(()=>{
      const f=document.getElementById('testField');f.disabled=false;f.readOnly=false;f.remove();document.body.appendChild(f);
      const clone=f.cloneNode(true);clone.id='clonedField';clone.querySelector('input').removeAttribute('id');document.body.appendChild(clone);
    });
    await expect(page.locator('#testField input')).toHaveCount(1);
    await expect(page.locator('#clonedField input')).toHaveCount(1);
    await expect(input).toBeEditable();
    expect(errors).toEqual([]);
  });
});

test('smd-input keeps password input groups on one row',async({page})=>{
  await page.addInitScript(()=>{delete Object.getPrototypeOf(navigator).serviceWorker;});
  await page.goto('/');
  await page.evaluate(()=>{
    const group=document.createElement('div');group.id='passwordGroup';group.className='input-group';group.style.width='300px';
    group.innerHTML='<smd-input input-id="groupPassword" type="password" value="secret"></smd-input><button type="button" class="btn btn-secondary">Show</button>';
    document.body.appendChild(group);
  });
  const geometry=await page.locator('#passwordGroup').evaluate(group=>{
    const field=group.querySelector('input').getBoundingClientRect(),button=group.querySelector('button').getBoundingClientRect(),outer=group.getBoundingClientRect();
    return {sameRow:Math.abs(field.top-button.top)<1,fits:button.right<=outer.right+1,beside:button.left>=field.right-2};
  });
  expect(geometry).toEqual({sameRow:true,fits:true,beside:true});
});
