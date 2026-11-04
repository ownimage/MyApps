const { test, expect } = require("@playwright/test");
test.beforeEach(async ({page}) => {
  await page.goto("/Clock/"); await page.evaluate(() => localStorage.clear()); await page.reload();
});
async function pick(page, id, value) {
  await page.locator(`#${id} .smd-select-btn`).click();
  await page.locator(`#${id} .smd-select-item[data-value="${value}"]`).click();
}
test("Nixie face persists and shares Mondaine's text font choices", async ({page}) => {
  await page.evaluate(() => openSettings());
  await pick(page,"clockFontSelector","nixie");
  await expect(page.locator("#clockMondaineTextFontRow")).toBeVisible();
  await pick(page,"clockMondaineTextFont","london");
  await page.evaluate(() => { closeSettings(); changeClockAlarmEnabled(true); });
  await expect(page.locator(".nixie-digit")).toHaveCount(6);
  await expect(page.locator(".nixie-separator")).toHaveCount(2);
  await expect(page.locator("#clockDate")).toHaveCSS("font-family", /Clock London Tube/);
  await expect(page.locator("#clockAlarmIndicator")).toHaveCSS("font-family", /Clock London Tube/);
  await page.reload();
  await expect(page.locator(".nixie-digit")).toHaveCount(6);
  await expect(page.locator("#clockDate")).toHaveCSS("font-family", /Clock London Tube/);
  await page.evaluate(() => { changeClockMondaineTextFont("inter"); changeClockShowSeconds(false); changeClockShowBoxes(false); });
  await expect(page.locator(".nixie-digit")).toHaveCount(4);
  await expect(page.locator(".nixie-separator")).toHaveCount(1);
  await expect(page.locator(".nixie-cover")).toHaveCount(4);
  await expect(page.locator("#clockDate")).toHaveCSS("font-family", /Clock Inter/);
  await page.evaluate(() => { changeClockFont("mondaine"); changeClockMondaineTextFont("london"); changeClockFont("nixie"); });
  await expect(page.locator("#clockDate")).toHaveCSS("font-family", /Clock London Tube/);
});
test("Nixie has ten distinct wire numerals and follows colour, glow and time updates", async ({page}) => {
  await page.evaluate(() => { changeClockFont("nixie"); renderNixieClock(document.getElementById("clockDisplay"),"01:23:45"); });
  const shapes=await page.locator(".nixie-digit").first().evaluate(el => Array.from(el.querySelectorAll("defs .nixie-numeral")).map(p => p.getAttribute("d")));
  expect(shapes).toHaveLength(10); expect(new Set(shapes).size).toBe(10);
  for (const digit of "0123456789") {
    await page.evaluate(d => renderNixieClock(document.getElementById("clockDisplay"),`${d}${d}:${d}${d}:${d}${d}`),digit);
    await expect(page.locator(".nixie-digit").first()).toHaveAttribute("data-digit", digit);
    await expect(page.locator(".nixie-active .nixie-lit-wire").first()).toHaveAttribute("href", new RegExp(`wire-${digit}$`));
  }
  for (const color of ["#ff7324","#27caff"]) {
    await page.evaluate(color => changeClockColor(color), color);
    await expect(page.locator(".nixie-lit-wire").first()).toHaveCSS("stroke",color === "#ff7324" ? "rgb(255, 115, 36)" : "rgb(39, 202, 255)");
    await expect(page.locator(".nixie-colon-glow").first()).toHaveCSS("fill",color === "#ff7324" ? "rgb(255, 115, 36)" : "rgb(39, 202, 255)");
  }
  await page.evaluate(() => changeClockGlow(0));
  await expect(page.locator(".nixie-halo").first()).toHaveCSS("opacity","0");
  await page.evaluate(() => changeClockGlow(1));
  await expect(page.locator(".nixie-halo").first()).toHaveCSS("opacity","1");
  const same=await page.evaluate(() => { const before=document.querySelector(".nixie-digit"); renderClock(); return before===document.querySelector(".nixie-digit"); });
  expect(same).toBe(true);
});
test("Nixie 0-9 detail preview", async ({page}, testInfo) => {
  await page.setViewportSize({width:1400,height:1000});
  await page.evaluate(() => {
    changeClockFont("nixie"); changeClockColor("#ff812e"); changeClockGlow(.55);
    clearInterval(clockTimer);
    const tray=document.createElement("div"); tray.id="nixiePreview";
    tray.style.cssText="position:fixed;inset:0;z-index:2000;background:#090c10;padding:40px;display:grid;grid-template-columns:repeat(5,1fr);gap:24px;place-items:center";
    for (let i=0;i<10;i++) { const tube=createNixieDigit(i); tube.style.cssText="width:210px;height:350px"; updateNixieDigit(tube,String(i)); tray.appendChild(tube); }
    document.body.appendChild(tray);
  });
  await page.screenshot({path:testInfo.outputPath("nixie-digits-0-9.png")});
  await expect(page.locator("#nixiePreview .nixie-digit")).toHaveCount(10);
});

test("one Show details switch controls the enclosure and base and persists", async ({page}) => {
  await page.evaluate(() => openSettings());
  await expect(page.locator("#clockNixieDetailsRow")).toBeHidden();
  await pick(page,"clockFontSelector","nixie");
  await expect(page.locator("#clockNixieDetails input")).toBeChecked();
  await page.locator("#clockNixieDetails input").uncheck();
  await page.evaluate(() => closeSettings());
  for (const selector of [".nixie-cover", ".nixie-base", ".nixie-colon-enclosure"]) {
    await expect(page.locator(selector).first()).toBeHidden();
  }
  await expect(page.locator(".nixie-active").first()).toBeVisible();
  await expect(page.locator(".nixie-colon-glow").first()).toBeVisible();
  await page.reload();
  await page.evaluate(() => openSettings());
  await expect(page.locator("#clockNixieDetails input")).not.toBeChecked();
  await page.locator("#clockNixieDetails input").check();
  await page.evaluate(() => closeSettings());
  for (const selector of [".nixie-cover", ".nixie-base", ".nixie-colon-enclosure"]) {
    await expect(page.locator(selector).first()).toBeVisible();
  }
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.includes("nixie"))))).toEqual({clock_nixieDetails:"true"});
});

test("Nixie remains legible on light and dark backgrounds, with and without details", async ({page}, testInfo) => {
  await page.evaluate(() => { changeClockFont("nixie"); changeClockColor("#b6ffbd"); });
  for (const [theme,mode] of [["flatly","light"],["darkly","dark"]]) {
    await page.evaluate(({theme,mode}) => { localStorage.setItem("clock_themeMode",mode); applyTheme(theme); }, {theme,mode});
    await expect(page.locator("html")).toHaveAttribute("data-theme",theme);
    for (const details of [true,false]) {
      await page.evaluate(details => changeClockNixieDetails(details),details);
      const contrast = await page.locator(".nixie-wire-edge").first().evaluate(el => {
        const ctx=document.createElement("canvas").getContext("2d");
        function luminance(color) {
          ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
          return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3).map(v => v/255).map(v => v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
        }
        const wire=luminance(getComputedStyle(el).stroke),bg=luminance(getComputedStyle(document.body).backgroundColor);
        return (Math.max(wire,bg)+.05)/(Math.min(wire,bg)+.05);
      });
      expect(contrast).toBeGreaterThan(3);
      await expect(page.locator(".nixie-lit-wire").first()).toHaveCSS("stroke","rgb(182, 255, 189)");
      expect(await page.locator("#clockDate").evaluate(el => parseFloat(getComputedStyle(el).webkitTextStrokeWidth))).toBeGreaterThan(0);
      await page.screenshot({path:testInfo.outputPath(`nixie-${mode}-${details?"details":"bare"}.png`)});
    }
  }
});

test("Nixie side uprights are pale on a light background", async ({page}, testInfo) => {
  await page.evaluate(() => { localStorage.setItem("clock_themeMode","light"); applyTheme("flatly"); changeClockFont("nixie"); });
  await expect(page.locator("body")).toHaveCSS("background-color","rgb(255, 255, 255)");
  const brightness = () => page.locator('.nixie-tube path[d="M35 54V198M109 54V198"]').first().evaluate(el => {
    const ctx=document.createElement("canvas").getContext("2d");
    ctx.fillStyle=getComputedStyle(el).stroke; ctx.fillRect(0,0,1,1);
    return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3).reduce((a,b)=>a+b,0)/3;
  });
  expect(await brightness()).toBeGreaterThan(200);
  await page.screenshot({path:testInfo.outputPath("nixie-light-uprights.png")});
  await page.evaluate(() => changeClockPureBlack(true));
  expect(await brightness()).toBeLessThan(65);
});
