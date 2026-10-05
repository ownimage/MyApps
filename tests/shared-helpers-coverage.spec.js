const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

// Focused coverage for shared pure/helper functions that the UI specs never
// reach (image-cache helpers, the pure minio SHA/HMAC fallback, the theme-mode
// resolver, the shared clear-all-data modal, and a couple of CountMyDays editor
// setters). These are invoked directly via page.evaluate; the assertions pin the
// real behaviour so the tests are not coverage-only no-ops.
test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

const SVG = "data:image/svg+xml," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' stroke='#000' fill='#fff' stroke-width='2'><rect width='10' height='10'/></svg>"
);

test.describe("Shared helpers coverage", () => {

  test("smd-image hash / paint variants / cache url", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    const r = await page.evaluate(async (svg) => {
      const out = {};
      out.hashA = smdImageHash("hello");
      out.hashB = smdImageHash("hello");
      out.hashC = smdImageHash("world");
      // all tiers x themes, SVG line/fill/width overrides applied
      out.variants = smdImagePaintVariants({
        data: svg,
        data64: svg,
        themes: { light: { line: "#111", fill: "#222", width: "3" }, dark: { line: "#eee" } }
      });
      out.emptyVariants = smdImagePaintVariants(null);
      out.cacheUrl = await smdImageCacheUrl(svg);
      return out;
    }, SVG);
    expect(r.hashA).toMatch(/^[0-9a-f]{16}$/);
    expect(r.hashA).toBe(r.hashB);
    expect(r.hashA).not.toBe(r.hashC);
    expect(r.variants.length).toBe(4); // 2 tiers x 2 themes
    expect(new Set(r.variants).size).toBeGreaterThan(1); // theme overrides differ
    expect(r.emptyVariants).toEqual([]);
    expect(typeof r.cacheUrl).toBe("string");
    expect(r.cacheUrl.length).toBeGreaterThan(0);
  });

  test("pure SHA-256 / HMAC helpers produce correct digests", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    const r = await page.evaluate(() => {
      const enc = new TextEncoder();
      return {
        hex: hexFromBytes(new Uint8Array([0, 15, 255])),
        sha: hexFromBytes(sha256Core(enc.encode("abc"))),
        hmac: hexFromBytes(hmacSha256Core(enc.encode("key"), enc.encode("The quick brown fox jumps over the lazy dog")))
      };
    });
    expect(r.hex).toBe("000fff");
    expect(r.sha).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(r.hmac).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  });

  test("theme-mode resolver normalizes unknown values to light", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    const r = await page.evaluate(() => ({
      dark: resolveThemeMode("superhero", "dark"),
      def: resolveThemeMode("superhero", "default"),
      junk: resolveThemeMode("superhero", "nonsense"),
      missing: resolveThemeMode("superhero", undefined)
    }));
    expect(r.dark).toBe("dark");
    expect(r.def).toBe("light");
    expect(r.junk).toBe("light");
    expect(r.missing).toBe("light");
  });

  test("shared clear-all-data modal clears only prefixed keys", async ({ page }) => {
    await page.goto("/PlanMyDay/");
    await page.evaluate(() => {
      localStorage.setItem("planmydays_cov_probe", "1");
      localStorage.setItem("shared-images", JSON.stringify([{ name: "Keep", data: "x" }]));
      window.__covCleared = false;
      smdConfirmClearAllData({ onClear: () => { window.__covCleared = true; } });
    });
    await page.locator("#smdConfirmModal").getByRole("button", { name: "Clear" }).click();
    const r = await page.evaluate(() => ({
      cleared: window.__covCleared,
      appKeyGone: localStorage.getItem("planmydays_cov_probe") === null,
      sharedKept: localStorage.getItem("shared-images") !== null
    }));
    expect(r.cleared).toBe(true);
    expect(r.appKeyGone).toBe(true);
    expect(r.sharedKept).toBe(true);
  });

  test("CountMyDays editor search/filter setters run", async ({ page }) => {
    await page.goto("/CountMyDays/");
    const err = await page.evaluate(() => {
      try {
        setCategoryNameSearch("abc");
        clearCategoryNameSearch();
        setFilterShowLocal(true);
        setFilterShowLocal(false);
        return null;
      } catch (e) {
        return String(e);
      }
    });
    expect(err).toBeNull();
  });
});
