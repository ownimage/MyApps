const { test, expect } = require("@playwright/test");
async function choose(page, id, value) {
  await page.locator(`#${id} .smd-select-btn`).click();
  await page.locator(`#${id} .smd-select-item[data-value="${value}"]`).click();
}
test.beforeEach(async ({page}) => {
  await page.goto("/Clock/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});
test("Alarm tab saves enabled, time format, time and sleep duration", async ({page}, testInfo) => {
  await page.evaluate(() => openSettings());
  await expect(page.locator("#settingsTabs > .smd-tab-list .smd-tab-btn")).toHaveText(["Display", "Alarm", "Credits", "Danger"]);
  await page.locator("#alarm-tab").click();
  await expect(page.locator("#clockAlarmEnabled input")).not.toBeChecked();
  await choose(page, "clockAlarmFormat", "12");
  await expect(page.locator("#clockAlarmHour .smd-select-item")).toHaveCount(12);
  await expect(page.locator("#clockAlarmMinute .smd-select-item")).toHaveCount(60);
  await choose(page, "clockAlarmHour", "11");
  await choose(page, "clockAlarmMinute", "25");
  await choose(page, "clockAlarmPeriod", "PM");
  await choose(page, "clockAlarmSleep", "15");
  await page.locator("#clockAlarmEnabled input").check();
  await page.screenshot({path: testInfo.outputPath("alarm-settings.png")});
  await page.evaluate(() => closeSettings());
  await expect(page.locator("#clockAlarmIndicator")).toBeVisible();
  await page.evaluate(() => changeClockFont("seven"));
  await expect(page.locator("#clockAlarmIndicator")).toHaveCSS("font-family", /DSEG7 Modern/);
  await page.evaluate(async () => { await document.fonts.ready; fitClockDisplay(); fitClockDate(); updateClockAlarmIndicator(); });
  await page.screenshot({path: testInfo.outputPath("alarm-indicator.png")});
  const geometry = await page.evaluate(() => {
    const label = document.getElementById("clockAlarmIndicator").getBoundingClientRect();
    const time = document.getElementById("clockDisplay").getBoundingClientRect();
    return { left: Math.abs(label.left-time.left), above: label.bottom <= time.top+1 };
  });
  expect(geometry.left).toBeLessThan(2); expect(geometry.above).toBe(true);
  await page.reload();
  await page.evaluate(() => openSettings());
  await page.locator("#alarm-tab").click();
  await expect(page.locator("#clockAlarmEnabled input")).toBeChecked();
  await expect(page.locator("#clockAlarmHour")).toHaveAttribute("value", "11");
  await expect(page.locator("#clockAlarmMinute")).toHaveAttribute("value", "25");
  await expect(page.locator("#clockAlarmPeriod")).toHaveAttribute("value", "PM");
  await expect(page.locator("#clockAlarmSleep")).toHaveAttribute("value", "15");
  await choose(page, "clockAlarmFormat", "24");
  await expect(page.locator("#clockAlarmHour")).toHaveAttribute("value", "23");
  await expect(page.locator("#clockAlarmHour .smd-select-item")).toHaveCount(24);
  await expect(page.locator("#clockAlarmPeriod")).toBeHidden();
  await page.locator("#clockAlarmEnabled input").uncheck();
  await page.evaluate(() => closeSettings());
  await expect(page.locator("#clockAlarmIndicator")).toBeHidden();
});
for (const minutes of [5, 10, 15]) {
  test(`alarm rings, sleeps ${minutes} minutes and repeats the next day`, async ({page}) => {
    const base = new Date(); base.setSeconds(0, 0);
    await page.clock.install({time: base});
    await page.clock.pauseAt(new Date(base.getTime()+1000));
    await page.evaluate(({base, minutes}) => {
      changeClockAlarmSleep(String(minutes));
      changeClockAlarmEnabled(true);
      localStorage.setItem("clock_alarmNext", String(base+60000));
      window.alarmPlayCount = 0;
      HTMLMediaElement.prototype.play = function () { window.alarmPlayCount++; return Promise.resolve(); };
    }, {base: base.getTime(), minutes});
    await page.clock.runFor(59000);
    await expect(page.locator("#clockAlarmAudio")).toHaveAttribute("loop", "");
    await expect.poll(() => page.evaluate(() => alarmPlayCount)).toBe(1);
    await expect(page.locator("#clockAlarmModal")).not.toHaveAttribute("open", "");
    await page.locator("main").dispatchEvent("click");
    await expect(page.locator("#clockAlarmModal")).toHaveAttribute("open", "");
    await page.locator("#clockAlarmModal button", {hasText: "Sleep"}).dispatchEvent("click");
    await expect.poll(() => page.evaluate(() => clockAlarmRinging)).toBe(false);
    await page.clock.fastForward(minutes*60000-1000);
    await expect.poll(() => page.evaluate(() => alarmPlayCount)).toBe(1);
    await page.clock.runFor(1000);
    await expect.poll(() => page.evaluate(() => alarmPlayCount)).toBe(2);
    await page.locator("main").dispatchEvent("click");
    await page.locator("#clockAlarmModal button", {hasText: "Turn off"}).dispatchEvent("click");
    await expect.poll(() => page.evaluate(() => clockAlarmRinging)).toBe(false);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_alarmEnabled"))).toBe("true");
    const next = await page.evaluate(() => Number(localStorage.getItem("clock_alarmNext")));
    await page.clock.fastForward(next - (base.getTime()+60000+minutes*60000));
    await expect.poll(() => page.evaluate(() => alarmPlayCount)).toBe(3);
  });
}
test("bundled alarm tone loads as a local audio asset", async ({page, request}) => {
  const response = await request.get("/Clock/audio/alarm.wav");
  expect(response.ok()).toBe(true);
  expect((await response.body()).subarray(0,4).toString()).toBe("RIFF");
  await expect.poll(() => page.locator("#clockAlarmAudio").evaluate(el => el.readyState)).toBeGreaterThanOrEqual(2);
});

test("the bundled tone really plays and stops after Turn off", async ({page}) => {
  await page.evaluate(() => openSettings());
  await page.locator("#alarm-tab").click();
  await page.locator("#clockAlarmEnabled input").check();
  await page.evaluate(() => closeSettings());
  await expect.poll(() => page.locator("#clockAlarmAudio").evaluate(el => el.paused)).toBe(true);
  await page.evaluate(() => { localStorage.setItem("clock_alarmNext", String(Date.now()-1)); checkClockAlarm(); });
  await expect.poll(() => page.locator("#clockAlarmAudio").evaluate(el => !el.paused && el.currentTime > 0 && !el.muted)).toBe(true);
  await page.locator("main").click({position:{x:10, y:10}});
  await page.locator("#clockAlarmModal button", {hasText:"Turn off"}).click();
  await expect.poll(() => page.locator("#clockAlarmAudio").evaluate(el => el.paused)).toBe(true);
});
test("12-hour midnight and noon convert correctly without changing the clock format", async ({page}) => {
  await page.evaluate(() => openSettings());
  await page.locator("#alarm-tab").click();
  await choose(page,"clockAlarmFormat","12");
  await choose(page, "clockAlarmHour", "12");
  await choose(page, "clockAlarmMinute", "00");
  await choose(page,"clockAlarmPeriod","AM");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_alarmTime"))).toBe("00:00");
  await choose(page,"clockAlarmPeriod","PM");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_alarmTime"))).toBe("12:00");
  await expect.poll(() => page.evaluate(() => clockSetting("format","24"))).toBe("24");
  await page.locator("#clockAlarmEnabled input").check();
  const future = await page.evaluate(() => Number(localStorage.getItem("clock_alarmNext")) > Date.now());
  expect(future).toBe(true);
});
test("sleep survives reload and switching the alarm off cancels it", async ({page}) => {
  await page.evaluate(() => {
    changeClockAlarmEnabled(true);
    playClockAlarm();
    showClockAlarmModal();
  });
  await page.locator("#clockAlarmModal button",{hasText:"Sleep"}).click();
  const due = await page.evaluate(() => localStorage.getItem("clock_alarmSnooze"));
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_alarmSnooze"))).toBe(due);
  await page.evaluate(() => changeClockAlarmEnabled(false));
  await expect(page.locator("#clockAlarmIndicator")).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("clock_alarmSnooze"))).toBeNull();
  await page.evaluate(() => checkClockAlarm());
  expect(await page.evaluate(() => clockAlarmRinging)).toBe(false);
});
