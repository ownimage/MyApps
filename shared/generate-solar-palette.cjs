// Generate SolarControlar's static accessibility palette in each theme/mode.
// Start npm run dev:test first. For an alternate server set SOLAR_PALETTE_BASE_URL.
// This is a development tool; applications never measure contrast at runtime.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const baseURL = process.env.SOLAR_PALETTE_BASE_URL || 'http://localhost:8080';

async function generate() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    const themes = fs.readdirSync('shared/css/themes').filter(name =>
      fs.existsSync(path.join('shared/css/themes', name, 'bootstrap.min.css')));
    for (const name of themes) for (const mode of ['light', 'dark']) {
      // An isolated document avoids app startup races, inherited app overrides
      // and old stylesheet objects while links are loading.
      const sheets = [
        `shared/css/themes/${name}/bootstrap.min.css`,
        'shared/css/styles.css',
        `shared/css/themes/${mode}.css`,
        `shared/css/themes/${name}/${name}.${mode}.css`
      ];
      await page.setContent(`<html data-bs-theme="${mode}"><head>` +
        sheets.map(file => `<link rel="stylesheet" href="${baseURL}/${file}">`).join('') +
        '</head><body><div id=solarCardPalette class="card smd-card">Shared card</div></body></html>', { waitUntil: 'load' });
      const tokens = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        const ctx = document.createElement('canvas').getContext('2d');
        function rgb(color) {
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        }
        function luminance(color) {
          return color.map(value => value / 255)
            .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
            .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        }
        function contrast(a, b) {
          const x = luminance(a), y = luminance(b);
          return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
        }
        const value = token => rgb(css.getPropertyValue(token));
        const surface = value('--bs-body-bg'), ink = value('--bs-body-color');
        // Preserve the theme hue, moving only as far toward readable ink as needed.
        const endpoint = luminance(surface) < .3 ? 255 : 0;
        let adjusted = ink;
        for (let percent = 0; percent <= 100; percent++) {
          adjusted = ink.map(channel => Math.round(channel + (endpoint - channel) * percent / 100));
          if (contrast(adjusted, surface) >= 7) break;
        }
        function readable(background, foreground, minimum) {
          const end = luminance(background) > .179 ? 0 : 255;
          for (let percent = 0; percent <= 100; percent++) {
            const result = foreground.map(channel => Math.round(channel + (end - channel) * percent / 100));
            if (contrast(result, background) >= minimum) return result;
          }
          return [end, end, end];
        }
        function rgba(color) {
          ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
          return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);
        }
        const over=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])).concat(1);
        function backgrounds(el) {
          if(!el)return [[255,255,255,1]];
          const style=getComputedStyle(el);
          const bases=backgrounds(el.parentElement).map(c=>over(rgba(style.backgroundColor),c));
          const stops=style.backgroundImage.match(/rgba?\([^)]+\)|color\([^)]+\)|#[\da-f]{3,8}/gi)||[];
          return stops.length?bases.flatMap(c=>stops.map(stop=>over(rgba(stop),c))):bases;
        }
        const cardSurfaces=backgrounds(document.getElementById('solarCardPalette')).map(c=>c.slice(0,3));
        function onCard(source,minimum) {
          const score=c=>Math.min(...cardSurfaces.map(bg=>contrast(c,bg)));
          const end=score([0,0,0])>score([255,255,255])?0:255;
          for(let percent=0;percent<=100;percent++) {
            const candidate=source.map(v=>Math.round(v+(end-v)*percent/100));
            if(score(candidate)>=minimum)return candidate;
          }
          return [end,end,end];
        }
        const cardInk=onCard(ink,4.8);
        const token = (key, color) => `  --solar-${key}: rgb(${color.join(', ')});`;
        const output = [token('clock-ink',readable(cardInk,value('--bs-body-bg'),4.8)), token('card-ink',cardInk), `  --solar-card-ink-rgb: ${cardInk.join(', ')};`, token('ink', adjusted), `  --solar-ink-rgb: ${adjusted.join(', ')};`];
        for (const variant of ['danger','warning','success']) output.push(token('card-'+variant,onCard(value('--bs-'+variant),3.2)));
        const series = [['solar', 'warning'], ['grid', 'info'], ['home', 'success'],
          ['battery', 'purple'], ['battery-level', 'danger']];
        for (const [key, variant] of series) {
          const base = value('--bs-' + variant);
          let result = base;
          for (let percent = 0; percent <= 100; percent++) {
            result = base.map((channel, index) => Math.round(channel + (adjusted[index] - channel) * percent / 100));
            if (contrast(result, surface) >= 3.2) break;
          }
          output.push(token('series-' + key, result));
        }
        return output.join('\n');
      });
      const file = path.join('shared/css/themes', name, `${name}.${mode}.css`);
      const css = fs.readFileSync(file, 'utf8').replace(
        /\n\/\* solar-palette:start \*\/[\s\S]*?\/\* solar-palette:end \*\/\n?/g, '');
      fs.writeFileSync(file, css + '\n/* solar-palette:start */\n:root {\n' + tokens +
        '\n}\n/* solar-palette:end */\n');
    }
  } finally {
    await browser.close();
  }
}
generate().catch(error => { console.error(error); process.exitCode = 1; });
