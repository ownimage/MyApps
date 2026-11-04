const { test, expect } = require("@playwright/test");

test.describe("Clock - Regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/Clock/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("seven-segment colon can flash or stay on and persists its setting", async ({ page }) => {
    const now = new Date();
    now.setSeconds(Math.floor(now.getSeconds() / 2) * 2, 0);
    await page.evaluate(() => openSettings());
    await expect(page.locator("#clockColonModeRow")).toBeVisible();
    await page.locator("#clockFontSelector .smd-select-btn").click();
    await page.locator('#clockFontSelector .smd-select-item[data-value="seven"]').click();
    await expect(page.locator("#clockColonModeRow")).toBeVisible();
    await expect(page.locator("#clockColonModeSelector")).toHaveAttribute("value", "always");
    await page.locator("#clockColonModeSelector .smd-select-btn").click();
    await page.locator('#clockColonModeSelector .smd-select-item[data-value="flashing"]').click();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(new Date(now.getTime() + 2000));
    await page.evaluate(() => closeSettings());
    const colons = page.locator(".seven-colon");
    await expect(colons).toHaveCount(2);
    await expect(colons.first()).toHaveCSS("opacity", "1");
    await page.clock.runFor(500);
    await expect(colons.first()).toHaveCSS("opacity", "1");
    await page.clock.runFor(500);
    await expect(colons.first()).toHaveCSS("opacity", "0");
    await expect(colons.last()).toHaveCSS("opacity", "0");
    await page.clock.runFor(500);
    await expect(colons.first()).toHaveCSS("opacity", "0");
    await page.clock.runFor(500);
    await expect(colons.first()).toHaveCSS("opacity", "1");
    await page.reload();
    await page.evaluate(() => openSettings());
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_colonMode"))).toBe("flashing");
    await page.evaluate(() => changeClockColonMode("always"));
    await page.evaluate(() => closeSettings());
    await page.clock.runFor(500);
    await expect(colons.first()).toHaveCSS("opacity", "1");
    await page.evaluate(() => { changeClockColonMode("flashing"); changeClockFont("arial"); });
    await page.clock.runFor(1000);
    await expect(page.locator(".flip-separator").first()).toHaveCSS("opacity", "0");
  });

  test("pure black overrides the main page while menu and settings keep their theme", async ({ page }) => {
    await page.evaluate(() => changeClockPureBlack(true));
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await expect(page.locator("main")).toHaveCSS("background-color", "rgb(0, 0, 0)");
    const navBackground = await page.locator("#mainNav").evaluate(el => getComputedStyle(el).backgroundColor);
    expect(navBackground).not.toBe("rgb(0, 0, 0)");
    expect(navBackground).not.toBe("rgba(0, 0, 0, 0)");
    await page.evaluate(() => { changeAutoHideMenu(true); document.getElementById("mainNav").classList.add("nav-hidden"); });
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage .smd-page-body")).not.toHaveCSS("background-color", "rgb(0, 0, 0)");
    await page.evaluate(() => changeClockPureBlack(false));
    await expect(page.locator("body")).not.toHaveCSS("background-color", "rgb(0, 0, 0)");
  });

  test("flip centre band matches the body background including pure black", async ({ page }, testInfo) => {
    for (const [theme, mode] of [["flatly", "light"], ["darkly", "dark"]]) {
      await page.evaluate(({theme, mode}) => {
        localStorage.setItem("clock_themeMode", mode);
        applyTheme(theme);
        changeClockGlow(0);
      }, {theme, mode});
      for (const black of [false, true]) {
        await page.evaluate(black => changeClockPureBlack(black), black);
          await expect.poll(() => page.evaluate(() => {
            const background = getComputedStyle(document.body).backgroundColor;
            return Array.from(document.querySelectorAll(".split-flap-seam, .split-flap-surface"))
              .every(el => getComputedStyle(el).backgroundColor === background);
          })).toBe(true);
      }
    }
    await page.screenshot({path: testInfo.outputPath("flip-band-pure-black.png")});
  });

  test("renders a flip-style clock with six split-flap digits", async ({ page }) => {
    await expect(page.locator("#clockDisplay")).toBeVisible();
    await expect(page.locator("#clockDisplay .flip-digit")).toHaveCount(6);
    await expect(page.locator("#clockDisplay .flip-separator")).toHaveCount(2);
    await expect(page.locator("#clockDisplay .split-flap-half")).toHaveCount(12);
  });

  test("settings persist 12/24-hour mode and font choice", async ({ page }) => {
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");
    await expect(page.locator("#settingsTabs > .smd-tab-list .smd-tab-btn")).toHaveText(["General", "Display", "Alarm", "Credits", "Danger"]);
    await expect(page.locator("#clockFormatSelector .smd-select-item")).toHaveText(["12 hour", "24 hour"]);
    await expect(page.locator("#clockFontSelector .smd-select-item")).toHaveText(["Flip style", "7-segment", "Arial", "Courier New", "Mondaine", "Nixie tubes"]);
    await expect(page.locator("#autoHideMenu")).toBeHidden();
    await page.locator("#display-tab").click();
    await expect(page.locator("#autoHideMenu")).toBeVisible();
    await page.locator("#general-tab").click();
    await expect(page.locator("#clockShowSeconds input")).toBeChecked();
    await expect(page.locator("#clockShowDate input")).toBeChecked();
    await expect(page.locator("#clockPureBlack input")).not.toBeChecked();
    await expect(page.locator("#clockColorPicker")).toBeVisible();
    await expect(page.locator("#clockGlowSlider")).toBeVisible();
    await expect(page.locator("#clockBrightnessSlider")).toBeVisible();

    await page.locator("#clockFormatSelector .smd-select-btn").click();
    await page.locator('#clockFormatSelector .smd-select-item[data-value="12"]').click();
    await page.locator("#clockFontSelector .smd-select-btn").click();
    await page.locator('#clockFontSelector .smd-select-item[data-value="seven"]').click();
    await expect(page.locator("#clockColorPicker")).toBeVisible();
    await expect(page.locator("#clockDate")).toHaveClass(/clock-date-seven/);
    await page.locator("#clockColorPicker .smd-color-hex").fill("#ffd36a");
    await page.locator("#clockGlowSlider .smd-slider-input").fill("0.8");
    await page.locator("#clockBrightnessSlider .smd-slider-input").fill("0.6");
    await page.locator("#clockShowSeconds input").uncheck();
    await page.locator("#clockShowDate input").uncheck();
    await page.locator("#clockPureBlack input").check();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_format"))).toBe("12");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_font"))).toBe("seven");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_showSeconds"))).toBe("false");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_showDate"))).toBe("false");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_pureBlack"))).toBe("true");
    await expect(page.locator("body")).toHaveClass(/clock-pure-black/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_color"))).toBe("#ffd36a");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_glow"))).toBe("0.8");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("clock_brightness"))).toBe("0.6");
    await expect(page.locator("#clockDisplay")).toHaveClass(/clock-style-seven/);
    await expect(page.locator("#clockDisplay .seven-digit")).toHaveCount(4);
    await expect(page.locator("#clockDisplay .seven-colon")).toHaveCount(1);
    await expect(page.locator("#clockDisplay .seven-digit").first()).toHaveCSS("overflow", "visible");
    await expect(page.locator("#clockDate")).toBeHidden();
  });

  test("clock colour applies to non-seven-segment colon and date", async ({ page }) => {
    await page.evaluate(() => openSettings());
    await page.locator("#clockFontSelector .smd-select-btn").click();
    await page.locator('#clockFontSelector .smd-select-item[data-value="arial"]').click();
    await page.locator("#clockColorPicker .smd-color-hex").fill("#ffd36a");
    for (const colon of await page.locator("#clockDisplay .flip-separator").all()) {
      await expect(colon).toHaveCSS("color", "rgb(255, 211, 106)");
    }
    await expect(page.locator("#clockDate")).toHaveCSS("color", "rgb(255, 211, 106)");
  });

  test("time and date share aligned edges and keep seconds inside the viewport", async ({ page }) => {
    for (const width of [2636, 1280, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const font of ["seven", "flip", "arial", "courier"]) {
        for (const seconds of [true, false]) {
          await page.evaluate(async ({ font, seconds }) => {
            changeClockFont(font);
            changeClockShowSeconds(seconds);
            await document.fonts.ready;
            fitClockDisplay();
            fitClockDate();
          }, { font, seconds });
          const bounds = await page.evaluate(() => {
            const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { left: r.left, right: r.right }; };
            return { time: rect("clockDisplay"), date: rect("clockDate"), surface: rect("clockMain"), width: innerWidth };
          });
          expect(bounds.time.left, `${width}/${font}/${seconds} left`).toBeGreaterThanOrEqual(-1);
          expect(bounds.time.right, `${width}/${font}/${seconds} right`).toBeLessThanOrEqual(width + 1);
          expect(Math.abs(bounds.time.left - bounds.surface.left)).toBeLessThan(2);
          expect(Math.abs(bounds.time.right - bounds.surface.right)).toBeLessThan(2);
          expect(Math.abs(bounds.date.left - bounds.time.left)).toBeLessThan(2);
          expect(Math.abs(bounds.date.right - bounds.time.right)).toBeLessThan(2);
        }
      }
    }
  });

  test("alarm, time and date scale together to fill the available width or height", async ({ page }, testInfo) => {
    for (const font of ["flip", "seven", "arial", "courier", "mondaine", "nixie"]) {
      let ratio;
      for (const viewport of [{width:1280,height:720},{width:844,height:390},{width:390,height:844}]) {
        await page.setViewportSize(viewport);
        await page.evaluate(async font => {
          changeClockFont(font); changeClockAlarmEnabled(true);
          await document.fonts.ready; renderClock();
        }, font);
        const metrics = await page.evaluate(() => {
          const box = id => { const r=document.getElementById(id).getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
          const main=document.querySelector("main"), style=getComputedStyle(main), r=main.getBoundingClientRect();
          const alarm=box("clockAlarmIndicator"), time=box("clockDisplay"), date=box("clockDate");
          return {alarm,time,date, ratio:alarm.height/time.height,
            width:main.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),
            height:innerHeight-r.top-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)};
        });
        expect(metrics.alarm.top, font).toBeGreaterThanOrEqual(0);
        expect(metrics.date.bottom, font).toBeLessThanOrEqual(viewport.height+1);
        expect(metrics.time.left, font).toBeGreaterThanOrEqual(0);
        expect(metrics.time.right, font).toBeLessThanOrEqual(viewport.width+1);
        expect(metrics.alarm.bottom, font).toBeLessThanOrEqual(metrics.time.top+1);
        expect(metrics.time.bottom, font).toBeLessThanOrEqual(metrics.date.top+1);
        expect(Math.abs(metrics.date.left-metrics.time.left), font).toBeLessThan(2);
        expect(Math.abs(metrics.date.right-metrics.time.right), font).toBeLessThan(2);
        expect(Math.min(Math.abs(metrics.time.width-metrics.width), Math.abs(metrics.date.bottom-metrics.alarm.top-metrics.height)), font).toBeLessThan(2);
        if (ratio !== undefined) expect(Math.abs(metrics.ratio-ratio), font).toBeLessThan(.005);
        ratio=metrics.ratio;
        await page.screenshot({path:testInfo.outputPath(`fit-${font}-${viewport.width}.png`)});
      }
    }
  });

  test("layout refits when the menu, alarm, date and seconds are hidden", async ({ page }) => {
    await page.setViewportSize({width:844,height:390});
    const errors=[]; page.on("pageerror", error => errors.push(error.message));
    await page.evaluate(() => { changeClockAlarmEnabled(true); changeAutoHideMenu(true); document.getElementById("mainNav").classList.add("nav-hidden"); });
    for (const showDate of [true, false]) {
      for (const enabled of [true, false]) {
        await page.evaluate(({showDate, enabled}) => { changeClockShowDate(showDate); changeClockAlarmEnabled(enabled); changeClockShowSeconds(false); }, {showDate, enabled});
        await expect.poll(() => page.evaluate(() => {
          fitClockLayout();
          const surface=document.getElementById("clockMain").getBoundingClientRect();
          const main=document.querySelector("main"), style=getComputedStyle(main), bounds=main.getBoundingClientRect();
          const width=main.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
          const height=main.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
          return surface.top >= bounds.top && surface.bottom <= innerHeight+1 && Math.min(Math.abs(width-surface.width), Math.abs(height-surface.height)) < 2;
        })).toBe(true);
      }
    }
    expect(errors).toEqual([]);
  });

  test("date uses uniform responsive scaling", async ({ page }) => {
    const metrics = await page.evaluate(() => {
      fitClockDate();
      const date = document.getElementById("clockDate");
      const display = document.getElementById("clockDisplay");
      const surface = document.getElementById("clockMain");
      const style = getComputedStyle(date);
      return {
        transform: style.transform,
        whiteSpace: style.whiteSpace,
        text: date.textContent,
        dateWidth: date.getBoundingClientRect().width,
        displayWidth: display.getBoundingClientRect().width,
        surfaceWidth: surface.getBoundingClientRect().width
      };
    });
    expect(metrics.whiteSpace).toBe("nowrap");
    expect(metrics.transform).toMatch(/^matrix\(/);
    expect(metrics.text).toMatch(/^[^,]+, \d{1,2} [^,]+, \d{4}$/);
    expect(Math.abs(metrics.displayWidth - metrics.surfaceWidth)).toBeLessThan(2);
    expect(Math.abs(metrics.dateWidth - metrics.displayWidth)).toBeLessThan(2);
  });

  test("dragging the clock changes brightness vertically and glow horizontally", async ({ page }) => {
    await page.evaluate(() => {
      changeClockBrightness(0.5);
      changeClockGlow(0.2);
    });
    const box = await page.locator("#clockMain").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 120);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => Number(localStorage.getItem("clock_brightness")))).toBeGreaterThan(0.5);
    await expect.poll(() => page.evaluate(() => Number(localStorage.getItem("clock_glow")))).toBeGreaterThan(0.2);
  });

  test("applies the stored theme and mode on boot", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("clock_theme", "darkly");
      localStorage.setItem("clock_themeMode", "dark");
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("darkly");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.bsTheme)).toBe("dark");
  });

  test("theme controls apply the selected theme and mode", async ({ page }) => {
    await page.evaluate(() => openSettings());
    await page.locator("#display-tab").click();
    const theme = page.locator("#themeSelector .smd-theme-select");
    await theme.locator(".smd-select-btn").click();
    await theme.locator('.smd-select-item[data-value="darkly"]').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("darkly");

    const mode = page.locator("#themeSelector .smd-theme-mode-select");
    await mode.locator(".smd-select-btn").click();
    await mode.locator('.smd-select-item[data-value="dark"]').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.bsTheme)).toBe("dark");
    await expect(page.locator("#bootstrap-theme-css")).toHaveAttribute("href", /darkly\/bootstrap\.min\.css/);
    await expect(page.locator("#theme-override-specific")).toHaveAttribute("href", /darkly\/darkly\.dark\.css/);
  });
});

test("Clock Display font size changes menu text and persists", async ({page}) => {
  await page.goto("/Clock/");
  await page.evaluate(() => openSettings());
  await page.locator("#display-tab").click();
  const size = () => page.locator("#mainNav .dropdown-item").first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  const before=await size();
  await page.locator("#fontSizeSelector .smd-select-btn").click();
  await page.locator('#fontSizeSelector .smd-select-item[data-value="small"]').click();
  expect(await size()).toBeLessThan(before);
  await page.reload();
  await page.evaluate(() => openSettings());
  await page.locator("#display-tab").click();
  await expect(page.locator("#fontSizeSelector")).toHaveAttribute("value","small");
  await expect(page.locator("#clockFormatSelector")).toBeHidden();
  await page.locator("#general-tab").click();
  await expect(page.locator("#clockFormatSelector")).toBeVisible();
});

for (const face of ["flip","arial","courier","nixie"]) {
 test(`${face} colon flashes for one second and stays on when selected`,async({page})=>{
  await page.goto("/Clock/");
  const now=new Date();now.setSeconds(Math.floor(now.getSeconds()/2)*2,0);
  await page.clock.install({time:now});await page.clock.pauseAt(new Date(now.getTime()+2000));
  await page.evaluate(face=>{changeClockFont(face);changeClockColonMode("flashing");},face);
  const colon=page.locator(".flip-separator,.nixie-colon-lights").first();
  await expect(colon).toHaveCSS("opacity","1");
  await page.clock.runFor(1000);await expect(colon).toHaveCSS("opacity","0");
  await page.clock.runFor(1000);await expect(colon).toHaveCSS("opacity","1");
  await page.evaluate(()=>changeClockColonMode("always"));
  await page.clock.runFor(1000);await expect(colon).toHaveCSS("opacity","1");
 });
}

test("digital faces render without digit card borders or backgrounds",async({page})=>{
 await page.goto("/Clock/");
 for (const face of ["flip","seven","arial","courier","nixie"]) {
  await page.evaluate(face=>changeClockFont(face),face);
  const digit=page.locator(".flip-digit").first();
  await expect(digit).toHaveCSS("background-image","none");
  await expect(digit).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
  await expect(digit).toHaveCSS("box-shadow","none");
  await expect(digit).toHaveCSS("border-top-width","0px");
 }
});
