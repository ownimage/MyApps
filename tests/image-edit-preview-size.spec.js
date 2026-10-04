const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

// Coverage hooks (top-level so every test in this spec is captured).
test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// The image edit dialog's previews (the main image plus the Light and Dark theme
// previews) must render at the Settings "Icon size", clamped to 40-100px. The
// class is `.data-img` (renamed from the legacy `.date-img`, which is an old
// name for the image on the date/today card - `data-img` never existed in
// history, but the rename was requested so the hook reads as what it is now).
//
// Size is applied INLINE from SmdImage.defaultSize (the value each app's
// applyImageSize() pushes), not by a CSS rule, so there is deliberately no
// `.data-img` rule in shared/css/styles.css. That is why this is asserted on
// the rendered box: a missing rule cannot be caught by reading the CSS.
const LADDER = [
  { key: "xsmall", raw: 32, expect: 40 },   // clamped up: too small to judge
  { key: "small", raw: 40, expect: 40 },
  { key: "medium", raw: 50, expect: 50 },
  { key: "large", raw: 64, expect: 64 },
  { key: "xlarge", raw: 80, expect: 80 },
  { key: "jumbo", raw: 100, expect: 100 }
];

// Every app hosts the same shared dialog, so assert one app's behaviour once and
// then that the others at least render the renamed class at a bounded size.
const APPS = [
  { name: "PlanMyDay", path: "/PlanMyDay/", prefix: "planmydays_" },
  { name: "CountMyDays", path: "/CountMyDays/", prefix: "" },
  { name: "QRLinks", path: "/QRLinks/", prefix: "" }
];

const PROBE_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
  '<rect width="100" height="100" fill="#0dcaf0"/><circle cx="50" cy="35" r="18" fill="#fff"/></svg>'
);

async function seedImage(page, prefix) {
  await page.evaluate(([p, svg]) => {
    localStorage.setItem(p + "images", JSON.stringify([{ name: "SizeProbe", data: svg }]));
  }, [prefix ? prefix : "shared-", PROBE_SVG]);
  await page.reload();
}

// The previews unhide only once their src resolves through smdImageRenderUrl
// (Cache Storage), and the page slides in asynchronously — an <img> can be
// "loaded" while the page is still `d-none`, which measures as 0x0. So wait for
// the page to be open AND for real pixels.
async function openDialogAndMeasure(page) {
  await page.evaluate(() => { openImagesEditor(); startEditImage(0); });
  await page.waitForFunction(() => {
    const page = document.getElementById("imageEditModal");
    if (!page || !page.hasAttribute("open") || page.classList.contains("d-none")) return false;
    const imgs = Array.from(document.querySelectorAll("#imageEditModalBody img.data-img"));
    if (imgs.length < 1) return false;
    return imgs.every((i) => !i.hidden && i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().width > 0);
  }, null, { timeout: 15000 });
  return page.evaluate(() => {
    const previews = Array.from(document.querySelectorAll("#imageEditModalBody img.data-img"));
    return previews.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.id, w: Math.round(r.width), h: Math.round(r.height), objectFit: getComputedStyle(el).objectFit };
    });
  });
}

test.describe("Image edit dialog preview size", () => {
  for (const step of LADDER) {
    test(`PlanMyDay preview follows the ${step.key} icon size (${step.raw}px -> ${step.expect}px)`, async ({ page }) => {
      await page.goto("/PlanMyDay/");
      await seedImage(page, "shared-");
      await page.evaluate((k) => { localStorage.setItem("planmydays_iconSize", k); changeIconSize(k); }, step.key);
      const previews = await openDialogAndMeasure(page);
      // main image + Light theme + Dark theme
      expect(previews).toHaveLength(3);
      for (const p of previews) {
        expect(p.w, `${p.id || "main"} width`).toBe(step.expect);
        expect(p.h, `${p.id || "main"} height`).toBe(step.expect);
        expect(p.objectFit, `${p.id || "main"} object-fit`).toBe("contain");
      }
    });
  }

  test("the preview is never the unsized natural image size", async ({ page }) => {
    // Regression guard for the original bug: the .date-img sizing rule was
    // deleted, so the preview rendered at the data-URL's intrinsic size (huge).
    await page.goto("/PlanMyDay/");
    await seedImage(page, "shared-");
    await page.evaluate(() => { localStorage.setItem("planmydays_iconSize", "medium"); changeIconSize("medium"); });
    const previews = await openDialogAndMeasure(page);
    for (const p of previews) {
      expect(p.w).toBeGreaterThanOrEqual(40);
      expect(p.w).toBeLessThanOrEqual(100);
    }
  });

  for (const app of APPS) {
    test(`${app.name} renders the renamed .data-img preview within bounds`, async ({ page }) => {
      await page.goto(app.path);
      await seedImage(page, app.prefix);
      const previews = await openDialogAndMeasure(page);
      expect(previews.length).toBeGreaterThanOrEqual(1);
      for (const p of previews) {
        expect(p.w, `${p.id || "main"} width`).toBeGreaterThanOrEqual(40);
        expect(p.w, `${p.id || "main"} width`).toBeLessThanOrEqual(100);
        expect(p.h, `${p.id || "main"} height`).toBe(p.w);
      }
      // The old hook name must be gone, and the new one present.
      expect(await page.locator("#imageEditModalBody .date-img").count()).toBe(0);
      expect(await page.locator("#imageEditModalBody .data-img").count()).toBeGreaterThan(0);
    });
  }
});
