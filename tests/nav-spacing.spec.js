const { test, expect } = require('./functional-test');
const { applyThemeAndWait } = require('./theme-controls');

const { settledSpacing } = require('./navbar-layout');

test.describe('shared navbar content spacing', () => {
  for (const holdTransition of [false, true]) {
    const scenario = holdTransition ? ' - transition held near its start' : '';
    test('keeps a gap below the navbar and removes it with auto-hide' + scenario, async ({ page }) => {
      await page.goto('/CountMyDays/', { waitUntil: 'domcontentloaded' });
      await applyThemeAndWait(page, 'simplex', 'dark');
      await page.evaluate(() => changeAutoHideMenu(false));

      const normal = await settledSpacing(page);
      expect(normal.navPosition).not.toBe('fixed');
      expect(normal.marginBottom).toBeGreaterThan(0);
      expect(normal.paddingTop).toBe(0);

      if (holdTransition) {
        await page.addStyleTag({content:'body.auto-hide-menu #mainNav + .container-fluid { transition: padding-top 1s linear; }'});
      }
      await page.evaluate(hold => {
        document.body.classList.add('auto-hide-menu');
        if (hold) {
          const content = document.querySelector('#mainNav + .container-fluid');
          getComputedStyle(content).paddingTop;
          for (const animation of content.getAnimations()) {
            animation.pause();
            animation.currentTime = 1;
          }
        }
      }, holdTransition);
      const visible = await settledSpacing(page);
      expect(visible.navPosition).toBe('fixed');
      expect(visible.paddingTop).toBeGreaterThan(normal.marginBottom);

      await page.evaluate(() => document.getElementById('mainNav').classList.add('nav-hidden'));
      const hidden = await settledSpacing(page);
      expect(hidden.navPosition).toBe('fixed');
      expect(hidden.navBottom).toBeLessThanOrEqual(1);
      expect(hidden.paddingTop).toBeGreaterThanOrEqual(0);
      expect(hidden.paddingTop).toBeLessThan(visible.paddingTop);
      expect(hidden.paddingTop).toBeLessThanOrEqual(normal.marginBottom);
    });
  }
});
