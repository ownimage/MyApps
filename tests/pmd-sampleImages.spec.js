const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const sampleImagesData = require("../shared/sampleImages.json");

const SCREENSHOT_DIR = path.resolve(__dirname, "..", "screenshots");

test.describe("PlanMyDay - Sample Images", () => {

  test.describe.configure({ timeout: 180000 });

  test.use({
    viewport: { width: 19000, height: 450 },
  });

  test("light and dark theme gallery", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await page.evaluate((images) => {
      images = images.slice().sort((a, b) => a.name.localeCompare(b.name));
      const container = document.createElement("div");
      container.id = "sampleGallery";
      container.style.cssText = "display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

      function buildRow(themeIdx, label, bgColor, textColor) {
        const row = document.createElement("div");
        row.className = "sample-row";
        row.style.cssText = `background:${bgColor};color:${textColor};padding:10px 8px`;
        const title = document.createElement("div");
        title.textContent = label;
        title.style.cssText = "font-weight:700;font-size:14px;margin-bottom:8px";
        row.appendChild(title);
        const strip = document.createElement("div");
        strip.style.cssText = "display:flex;gap:8px;align-items:flex-end;flex-wrap:nowrap";
        images.forEach(img => {
          const tile = document.createElement("div");
          tile.className = "sample-tile";
          tile.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;width:110px";
          const el = document.createElement("img");
          el.src = getThemedImageDataUrl(img, themeIdx === 0 ? "light" : "dark");
          el.style.cssText = "max-width:96px;max-height:96px;width:96px;height:96px;object-fit:contain";
          const name = document.createElement("div");
          name.textContent = img.name;
          name.style.cssText = "font-size:9px;text-align:center;line-height:1.1;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
          tile.appendChild(el);
          tile.appendChild(name);
          strip.appendChild(tile);
        });
        row.appendChild(strip);
        container.appendChild(row);
      }

      buildRow(0, "Light", "#ffffff", "#212529");
      buildRow(1, "Dark", "#303030", "#f8f9fa");
      document.body.appendChild(container);
    }, sampleImagesData.images);

    await page.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll("#sampleGallery img"));
      return imgs.length > 0 && imgs.every(i => i.complete && i.src && i.naturalWidth > 0);
    });

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "sample-images.png"), fullPage: true });

    const tiles = page.locator("#sampleGallery .sample-tile");
    await expect(tiles).toHaveCount(sampleImagesData.images.length * 2);
    const imgs = page.locator("#sampleGallery img");
    const imgCount = await imgs.count();
    for (let i = 0; i < imgCount; i++) {
      const src = await imgs.nth(i).getAttribute("src");
      expect(src).toBeTruthy();
    }
  });
});
