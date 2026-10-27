const { test, expect } = require("@playwright/test");
const sharp = require("sharp");

// A minimal board with the reported shape: auto text colour + stamp border.
const STAMP_BOARD = {
  id: "stamp-frame-test",
  name: "Stamp frame",
  background: "space",
  items: [
    {
      id: "stamp-auto",
      type: "text",
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      z: 1,
      text: "xczx",
      bg: "transparent",
      color: "auto",
      border: "stamp",
      font: "theme"
    }
  ],
  connectors: []
};

// A tall/wide stamp box makes every edge longer than one 9-slice tile.
const STAMP_EDGE_BOARD = {
  id: "stamp-edge-test",
  name: "Stamp edge",
  background: "",
  items: [
    {
      id: "stamp-edge",
      type: "text",
      x: 50,
      y: 50,
      scale: 4,
      rotation: 0,
      z: 1,
      text: "Space\nSpace\nSpace",
      bg: "transparent",
      color: "white",
      border: "stamp",
      font: "theme"
    }
  ],
  connectors: []
};

// A clean black surface makes the white glyph pixels trivial to measure.
const ALIGN_BOARD = {
  id: "text-align-test",
  name: "Text align",
  background: "",
  items: [
    {
      id: "align-text",
      type: "text",
      x: 50,
      y: 50,
      scale: 3,
      rotation: 0,
      z: 1,
      text: "Space",
      bg: "black",
      color: "white",
      border: "none",
      font: "theme"
    }
  ],
  connectors: []
};

function readStamp(page) {
  return page.evaluate(() => {
    const el = Array.from(document.querySelectorAll(".sb-text"))
      .find((candidate) => candidate.textContent === "xczx");
    if (!el) return null;
    const uri = el.style.getPropertyValue("--sb-frame-image");
    const svg = decodeURIComponent(
      uri.replace(/^url\("?/, "").replace(/"\)$/, "").replace("data:image/svg+xml,", "")
    );
    const stroke = svg.match(/stroke="([^"]+)"/);
    return {
      stroke: stroke ? stroke[1] : null,
      textColor: getComputedStyle(el).color,
      bodyVar: getComputedStyle(document.documentElement)
        .getPropertyValue("--bs-body-color").trim(),
      resolved: window.sbResolveColor("auto")
    };
  });
}

async function whiteTextCenter(buffer, x0f, x1f, y0f, y1f) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const x0 = Math.round(info.width * x0f);
  const x1 = Math.round(info.width * x1f);
  const y0 = Math.round(info.height * y0f);
  const y1 = Math.round(info.height * y1f);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  expect(maxY, "white text pixels").toBeGreaterThanOrEqual(0);
  return {
    width: info.width,
    height: info.height,
    x: (minX + maxX) / 2 / info.width,
    y: (minY + maxY) / 2 / info.height
  };
}

test.describe("Storyboard - text frames", () => {
  test("repaints an auto stamp frame when theme CSS lands after render", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((board) => {
      localStorage.setItem("storyboard_stories", JSON.stringify([{
        id: "story-" + board.id,
        name: "Story 1",
        scenes: [board],
        activeSceneId: board.id
      }]));
      localStorage.setItem("storyboard_activeStory", "story-" + board.id);
      localStorage.setItem("storyboard_activeScene", board.id);
    }, STAMP_BOARD);

    await page.goto("/Storyboard/");
    await expect(page.locator(".sb-text", { hasText: "xczx" })).toBeVisible();

    // applyTheme() only re-points the stylesheet links, so the new CSS arrives
    // after the caller's render - exactly what can happen on the initial boot
    // and on a live theme switch. The frame SVG bakes its colour, while the
    // text colour is live CSS, so the two must be re-synced when the sheet lands.
    await page.evaluate(() => applyTheme("cerulean", "light"));
    await page.waitForFunction(() => {
      const link = document.getElementById("bootstrap-theme-css");
      return link && link.sheet &&
        /\/cerulean\/bootstrap\.min\.css/.test(link.sheet.href) &&
        getComputedStyle(document.documentElement)
          .getPropertyValue("--bs-body-color").trim() === "#495057";
    });

    await expect.poll(async () => {
      const state = await readStamp(page);
      return state && state.stroke;
    }).toBe("#495057");

    const frame = await readStamp(page);
    expect(frame.resolved).toBe("#495057");
    // sbDownloadJpg() draws the frame with this same sbResolveColor("auto")
    // value, so matching the live text colour here also matches the saved JPG.
    expect(frame.stroke).toBe(frame.resolved);
    expect(frame.textColor).toBe("rgb(73, 80, 87)");
    expect(frame.bodyVar).toBe("#495057");
  });

  test("saves stamp edges as repeated tiles rather than one stretched slice", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((board) => {
      localStorage.setItem("storyboard_stories", JSON.stringify([{
        id: "story-" + board.id,
        name: "Story 1",
        scenes: [board],
        activeSceneId: board.id
      }]));
      localStorage.setItem("storyboard_activeStory", "story-" + board.id);
      localStorage.setItem("storyboard_activeScene", board.id);
    }, STAMP_EDGE_BOARD);

    await page.goto("/Storyboard/");
    await expect(page.locator(".sb-text")).toBeVisible();

    // The frame SVG is 120x120. Its middle edge slices are 60x30 (top/bottom)
    // and 30x60 (left/right). On screen those slices are repeated by
    // border-image-repeat: round; a single drawImage per edge means the JPG
    // stretches one slice over the whole side.
    const calls = await page.evaluate(async () => {
      const seen = [];
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (img, ...args) {
        if (img && img.naturalWidth === 120 && img.naturalHeight === 120 &&
            args.length === 8) {
          seen.push(args.map(Number));
        }
        return drawImage.apply(this, arguments);
      };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};
      try {
        await sbDownloadJpg();
      } finally {
        CanvasRenderingContext2D.prototype.drawImage = drawImage;
        HTMLAnchorElement.prototype.click = click;
      }
      return seen;
    });

    const edges = {
      top: (c) => c[0] === 30 && c[1] === 0 && c[2] === 60 && c[3] === 30,
      bottom: (c) => c[0] === 30 && c[1] === 90 && c[2] === 60 && c[3] === 30,
      left: (c) => c[0] === 0 && c[1] === 30 && c[2] === 30 && c[3] === 60,
      right: (c) => c[0] === 90 && c[1] === 30 && c[2] === 30 && c[3] === 60
    };
    for (const [edge, isEdge] of Object.entries(edges)) {
      const found = calls.filter(isEdge);
      expect(found.length, `${edge} edge tiles`).toBeGreaterThan(1);
    }
  });

  test("keeps the live glyphs on the JPG's vertical baseline", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((board) => {
      localStorage.setItem("storyboard_stories", JSON.stringify([{
        id: "story-" + board.id,
        name: "Story 1",
        scenes: [board],
        activeSceneId: board.id
      }]));
      localStorage.setItem("storyboard_activeStory", "story-" + board.id);
      localStorage.setItem("storyboard_activeScene", board.id);
    }, ALIGN_BOARD);

    await page.goto("/Storyboard/");
    const text = page.locator(".sb-text");
    await expect(text).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);

    const geom = await text.evaluate((el) => {
      const cs = getComputedStyle(el);
      const canvas = document.getElementById("sbCanvas");
      return {
        width: el.offsetWidth,
        height: el.offsetHeight,
        visW: canvas.clientWidth,
        visH: canvas.clientHeight,
        padLeft: parseFloat(cs.paddingLeft),
        padTop: parseFloat(cs.paddingTop),
        bodyMarginTop: parseFloat(getComputedStyle(el.querySelector(".sb-text-body")).marginTop),
        bodyMarginBottom: parseFloat(getComputedStyle(el.querySelector(".sb-text-body")).marginBottom)
      };
    });
    // Both sides are trimmed, so the box hugs the glyphs and stays centred.
    expect(geom.bodyMarginTop).toBeLessThan(0);
    expect(geom.bodyMarginBottom).toBeLessThan(0);

    const screen = await text.screenshot();
    const downloadPromise = page.waitForEvent("download");
    await page.evaluate(() => sbDownloadJpg());
    const download = await downloadPromise;
    const jpgPath = test.info().outputPath("text-align.jpg");
    await download.saveAs(jpgPath);

    const outScale = Math.max(1, Math.min(2, 4096 / Math.max(geom.visW, geom.visH)));
    const meta = await sharp(jpgPath).metadata();
    const width = Math.round(geom.width * outScale);
    const height = Math.round(geom.height * outScale);
    const crop = await sharp(jpgPath).extract({
      left: Math.round(meta.width / 2 - width / 2),
      top: Math.round(meta.height / 2 - height / 2),
      width,
      height
    }).png().toBuffer();

    // Both images are the same box, so use the same interior fraction. The
    // 2px slack clears the glyph antialiasing, not the padding.
    const x0 = (geom.padLeft + 2) / geom.width;
    const x1 = 1 - x0;
    const y0 = (geom.padTop + 2) / geom.height;
    const y1 = 1 - y0;
    const live = await whiteTextCenter(screen, x0, x1, y0, y1);
    const saved = await whiteTextCenter(crop, x0, x1, y0, y1);

    expect(Math.abs(live.x - saved.x) * geom.width,
      "horizontal glyph centre").toBeLessThan(2);
    expect(Math.abs(live.y - saved.y) * geom.height,
      "vertical glyph centre").toBeLessThan(2.5);
  });
});
