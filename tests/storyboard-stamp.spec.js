const { test, expect } = require("@playwright/test");

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

function readStamp(page) {
  return page.evaluate(() => {
    const el = Array.from(document.querySelectorAll(".wb-text"))
      .find((candidate) => candidate.textContent === "xczx");
    if (!el) return null;
    const uri = el.style.getPropertyValue("--wb-frame-image");
    const svg = decodeURIComponent(
      uri.replace(/^url\("?/, "").replace(/"\)$/, "").replace("data:image/svg+xml,", "")
    );
    const stroke = svg.match(/stroke="([^"]+)"/);
    return {
      stroke: stroke ? stroke[1] : null,
      textColor: getComputedStyle(el).color,
      bodyVar: getComputedStyle(document.documentElement)
        .getPropertyValue("--bs-body-color").trim(),
      resolved: window.wbResolveColor("auto")
    };
  });
}

test.describe("Storyboard - text frames", () => {
  test("repaints an auto stamp frame when theme CSS lands after render", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((board) => {
      localStorage.setItem("storyboard_boards", JSON.stringify([board]));
      localStorage.setItem("storyboard_activeBoard", board.id);
    }, STAMP_BOARD);

    await page.goto("/Storyboard/");
    await expect(page.locator(".wb-text", { hasText: "xczx" })).toBeVisible();

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
    // wbDownloadJpg() draws the frame with this same wbResolveColor("auto")
    // value, so matching the live text colour here also matches the saved JPG.
    expect(frame.stroke).toBe(frame.resolved);
    expect(frame.textColor).toBe("rgb(73, 80, 87)");
    expect(frame.bodyVar).toBe("#495057");
  });
});
