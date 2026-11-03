const {test, expect} = require("@playwright/test");
test.beforeEach(async ({page}) => { await page.goto("/Clock/"); await page.evaluate(() => localStorage.clear()); await page.reload(); });
test("Mondaine can be selected and persists with the analogue dial", async ({page}) => {
  await page.evaluate(() => openSettings());
  await page.locator("#clockFontSelector .smd-select-btn").click();
  await page.locator('#clockFontSelector .smd-select-item[data-value="mondaine"]').click();
  await page.evaluate(() => closeSettings());
  await expect(page.locator(".mondaine-face")).toBeVisible();
  await expect(page.locator(".mondaine-tick")).toHaveCount(60);
  await expect(page.locator(".mondaine-hour-tick")).toHaveCount(12);
  await expect(page.locator("#mondaineHour")).toHaveCSS("fill", await page.locator("body").evaluate(el => getComputedStyle(el).color));
  await expect(page.locator(".mondaine-second")).toHaveCSS("fill", "rgb(255, 0, 0)");
  await page.reload();
  await expect(page.locator(".mondaine-face")).toBeVisible();
  await page.evaluate(() => changeClockFont("seven"));
  await expect(page.locator(".mondaine-face")).toHaveCount(0);
  await expect(page.locator(".seven-digit")).toHaveCount(6);
});
test("Mondaine hands follow time and the seconds hand pauses at 58 seconds", async ({page}) => {
  await page.evaluate(() => changeClockFont("mondaine"));
  const now = new Date(); now.setHours(10, 20, 29, 0);
  await page.clock.install({time:now});
  await page.clock.pauseAt(new Date(now.getTime()+1000));
  await page.evaluate(() => updateMondaineClock());
  await expect(page.locator("#mondaineMinute")).toHaveAttribute("transform", "rotate(30)");
  await expect(page.locator("#mondaineHour")).toHaveAttribute("transform", "rotate(220)");
  await page.clock.runFor(28000);
  await expect(page.locator("#mondaineSecond")).toHaveAttribute("transform", "rotate(-90)");
  await page.clock.runFor(1000);
  await expect(page.locator("#mondaineSecond")).toHaveAttribute("transform", "rotate(-90)");
  await page.clock.runFor(1000);
  await expect(page.locator("#mondaineMinute")).toHaveAttribute("transform", "rotate(36)");
  await page.evaluate(() => changeClockShowSeconds(false));
  await expect(page.locator(".mondaine-second")).toBeHidden();
  await page.evaluate(() => changeClockShowSeconds(true));
  await expect(page.locator(".mondaine-second")).toBeVisible();
});
test("Mondaine fits desktop and phone screens with date and alarm", async ({page}, testInfo) => {
  for (const textFont of ["inter", "london"]) {
  for (const viewport of [{width:1280,height:720},{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    await page.evaluate(async textFont => { changeClockFont("mondaine"); changeClockMondaineTextFont(textFont); changeClockAlarmEnabled(true); await document.fonts.ready; renderClock(); }, textFont);
    const bounds = await page.evaluate(() => {
      const box = id => { const b=document.getElementById(id).getBoundingClientRect(); return {left:b.left,right:b.right,top:b.top,bottom:b.bottom}; };
      return {face:box("clockDisplay"),date:box("clockDate"),alarm:box("clockAlarmIndicator")};
    });
    expect(bounds.face.left).toBeGreaterThanOrEqual(0);
    expect(bounds.face.right).toBeLessThanOrEqual(viewport.width);
    expect(bounds.alarm.top).toBeGreaterThanOrEqual(0);
    expect(bounds.date.bottom).toBeLessThanOrEqual(viewport.height);
    expect(Math.abs(bounds.date.left-bounds.face.left)).toBeLessThan(2);
    expect(Math.abs(bounds.date.right-bounds.face.right)).toBeLessThan(2);
    await page.screenshot({path:testInfo.outputPath(`mondaine-${textFont}-${viewport.width}.png`)});
  }
  }
});

test("Mondaine follows light/dark themes and pure black and uses the bundled open font", async ({page}) => {
  await page.evaluate(() => { changeClockFont("mondaine"); changeClockAlarmEnabled(true); });
  for (const [theme,mode] of [["flatly","light"],["darkly","dark"]]) {
    await page.evaluate(({theme,mode}) => { localStorage.setItem("clock_themeMode",mode); applyTheme(theme); }, {theme,mode});
    await expect.poll(() => page.evaluate(() => {
      const body=getComputedStyle(document.body);
      return getComputedStyle(document.querySelector(".mondaine-dial")).fill === body.backgroundColor &&
        getComputedStyle(document.getElementById("mondaineHour")).fill === body.color;
    })).toBe(true);
  }
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect(page.locator("#clockDate")).toHaveCSS("font-family", /Clock Inter/);
  await expect(page.locator("#clockAlarmIndicator")).toHaveCSS("font-family", /Clock Inter/);
  expect(await page.evaluate(() => document.fonts.check('16px "Clock Inter"'))).toBe(true);
  await page.evaluate(() => changeClockPureBlack(true));
  await expect(page.locator(".mondaine-dial")).toHaveCSS("fill","rgb(0, 0, 0)");
  await expect(page.locator("#mondaineHour")).toHaveCSS("fill","rgb(245, 245, 245)");
  await expect(page.locator(".mondaine-second")).toHaveCSS("fill","rgb(255, 0, 0)");
});

test("Mondaine text selector switches Inter and London Tube and persists", async ({page}) => {
  await page.evaluate(() => openSettings());
  await expect(page.locator("#clockMondaineTextFontRow")).toBeHidden();
  await page.locator("#clockFontSelector .smd-select-btn").click();
  await page.locator('#clockFontSelector .smd-select-item[data-value="mondaine"]').click();
  await expect(page.locator("#clockMondaineTextFontRow")).toBeVisible();
  await expect(page.locator("#clockMondaineTextFont .smd-select-item")).toHaveText(["Inter", "London Tube"]);
  await expect(page.locator("#clockMondaineTextFont")).toHaveAttribute("value", "inter");
  await page.locator("#clockMondaineTextFont .smd-select-btn").click();
  await page.locator('#clockMondaineTextFont .smd-select-item[data-value="london"]').click();
  await page.evaluate(async () => { closeSettings(); changeClockAlarmEnabled(true); await document.fonts.ready; renderClock(); });
  await expect(page.locator("#clockDate")).toHaveCSS("font-family", /Clock London Tube/);
  await expect(page.locator("#clockAlarmIndicator")).toHaveCSS("font-family", /Clock London Tube/);
  expect(await page.evaluate(() => document.fonts.check('16px "Clock London Tube"'))).toBe(true);
  await page.reload();
  await page.evaluate(() => openSettings());
  await expect(page.locator("#clockMondaineTextFont")).toHaveAttribute("value", "london");
  await page.locator("#clockMondaineTextFont .smd-select-btn").click();
  await page.locator('#clockMondaineTextFont .smd-select-item[data-value="inter"]').click();
  await page.evaluate(async () => { closeSettings(); await document.fonts.ready; renderClock(); });
  await expect(page.locator("#clockDate")).toHaveCSS("font-family", /Clock Inter/);
  await expect(page.locator("#clockAlarmIndicator")).toHaveCSS("font-family", /Clock Inter/);
});
