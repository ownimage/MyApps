const { test, expect } = require("@playwright/test");

// Storyboard - MinIO save/load.
//
// Save writes the ACTIVE board to "<app directory>/<board name>/board-YYYYMMDDHHMM.json".
// Load uses the shared MinIO import page (scoped to the app directory), which
// lists subdirectories and "<subdirectory>:latest" shortcuts, and adds the
// chosen file as a NEW board (the current board is never overwritten).

const MINIO_KEYS = {
  enabled: "storyboard_minio_enabled",
  server: "storyboard_minio_server",
  username: "storyboard_minio_username",
  password: "storyboard_minio_password",
  bucket: "storyboard_minio_bucket",
  directory: "storyboard_minio_directory"
};

function sticker(id) {
  return {
    id,
    type: "sticker",
    sticker: "mermaid",
    x: 50,
    y: 50,
    scale: 1,
    rotation: 0,
    z: 1,
    flipX: false,
    flipY: false
  };
}

const BOARD = {
  id: "minio-board",
  name: "My Board",
  background: "space",
  items: [sticker("minio-sticker")],
  connectors: [],
  groups: [],
  view: { zoom: 1, fx: 0.5, fy: 0.5 }
};

async function seed(page, options = {}) {
  await page.goto("/");
  await page.evaluate(({ board, minio, keys }) => {
    localStorage.setItem("storyboard_boards", JSON.stringify([board]));
    localStorage.setItem("storyboard_activeBoard", board.id);
    if (minio) {
      Object.keys(minio).forEach((field) => {
        localStorage.setItem(keys[field], minio[field]);
      });
    }
  }, { board: options.board || BOARD, minio: options.minio || null, keys: MINIO_KEYS });
  await page.goto("/Storyboard/");
  await expect(page.locator("#sbCanvas")).toBeVisible();
}

const MINIO_ON = {
  enabled: "true",
  server: "http://minio:9000",
  username: "minioadmin",
  password: "minioadmin",
  bucket: "myapps",
  directory: "storyboard"
};

function xmlList({ contents = [], prefixes = [] }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
    "<Name>myapps</Name>",
    "<KeyCount>" + (contents.length + prefixes.length) + "</KeyCount>",
    "<MaxKeys>1000</MaxKeys>",
    "<IsTruncated>false</IsTruncated>"
  ].concat(
    prefixes.map((p) => "<CommonPrefixes><Prefix>" + p + "</Prefix></CommonPrefixes>"),
    contents.map((key) => "<Contents><Key>" + key + "</Key>" +
      "<LastModified>2026-08-01T10:00:00.000Z</LastModified>" +
      '<ETag>"abc"</ETag><Size>1024</Size><StorageClass>STANDARD</StorageClass></Contents>'),
    ["</ListBucketResult>"]
  ).join("");
}

test.describe("Storyboard - MinIO", () => {
  test("Settings has a Minio tab with a Directory field and the load/save items sit in the hamburger menu", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage .smd-tab-btn")).toHaveText(["Display", "Minio"]);
    await page.locator("#settingsPage .smd-tab-btn").filter({ hasText: "Minio" }).click();
    await expect(page.locator("#minioEnabled")).toBeVisible();
    await expect(page.locator("#minioDirectory")).toBeVisible();
    await page.evaluate(() => closeSettings());

    const saveItem = page.locator("a.minio-menu-item").filter({ hasText: "Save Board to Minio" });
    const loadItem = page.locator("a.minio-menu-item").filter({ hasText: "Load Board from Minio" });
    await page.locator("#btnMainMenu").click();
    await expect(saveItem).not.toBeVisible();
    await expect(loadItem).not.toBeVisible();
    await page.locator("#btnMainMenu").click();

    await page.evaluate(({ minio, keys }) => {
      Object.keys(minio).forEach((field) => localStorage.setItem(keys[field], minio[field]));
      updateMinioMenu();
    }, { minio: MINIO_ON, keys: MINIO_KEYS });
    await page.locator("#btnMainMenu").click();
    await expect(saveItem).toBeVisible();
    await expect(loadItem).toBeVisible();
  });

  test("the hamburger menu follows Settings | separator | Launch | separator | app items", async ({ page }) => {
    await seed(page, { minio: MINIO_ON });
    const order = await page.$$eval("#mainNav .dropdown-menu:not(.launch-submenu-menu) > li", (lis) => lis.map((li) => {
      if (li.querySelector(":scope > hr.dropdown-divider")) {
        return li.querySelector("hr.minio-menu-item") ? "divider:minio" : "divider";
      }
      const link = li.querySelector(":scope > a.dropdown-item");
      if (!link) return "";
      return link.classList.contains("launch-submenu-toggle") ? "launch" : link.textContent.trim();
    }).filter(Boolean));
    expect(order).toEqual([
      "Settings",
      "divider",
      "launch",
      "divider:minio",
      "Save Board to Minio",
      "Load Board from Minio"
    ]);
  });

  test("saving the current board uploads <directory>/<board>/board-<datetimestamp>.json", async ({ page }) => {
    await seed(page, { minio: MINIO_ON });
    await page.evaluate(() => {
      window.__minioPut = null;
      minioPutObject = (bucket, key, body) => {
        window.__minioPut = { bucket, key, body };
        return Promise.resolve("");
      };
    });

    await page.locator("#btnMainMenu").click();
    const saveItem = page.locator("a.minio-menu-item").filter({ hasText: "Save Board to Minio" });
    await expect(saveItem).toBeVisible();
    await saveItem.click();

    await expect.poll(() => page.evaluate(() => window.__minioPut && window.__minioPut.key))
      .toMatch(/^storyboard\/My Board\/board-\d{12}\.json$/);
    const put = await page.evaluate(() => window.__minioPut);
    expect(put.bucket).toBe("myapps");
    const payload = JSON.parse(put.body);
    expect(payload.app).toBe("storyboard");
    expect(payload.board.name).toBe("My Board");
    expect(payload.board.items.map((i) => i.id)).toEqual(["minio-sticker"]);
    await expect(page.locator("#smdConfirmModal")).toContainText("Saved");
  });

  test("path-unsafe characters in the board name are removed from the subdirectory", async ({ page }) => {
    await seed(page);
    const dir = await page.evaluate(() => sbMinioBoardDirName({ name: "Holiday/2026: plans?" }));
    expect(dir).toBe("Holiday-2026- plans-");
  });

  test("loading '<directory>:latest' adds the newest saved board as a new board", async ({ page }) => {
    const latest = "storyboard/My Board/board-202602020000.json";
    await page.route((url) => url.hostname === "minio" && url.port === "9000", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") || "";
        if (prefix === "storyboard/My Board/") {
          return route.fulfill({
            status: 200,
            body: xmlList({
              contents: [
                "storyboard/My Board/board-202601010000.json",
                latest
              ]
            })
          });
        }
        return route.fulfill({
          status: 200,
          body: xmlList({ prefixes: ["storyboard/My Board/"] })
        });
      }
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          version: 1,
          app: "storyboard",
          exportedAt: "2026-02-02T00:00:00.000Z",
          board: {
            id: "saved-board",
            name: "Holiday Plan",
            background: "underwater",
            items: [sticker("loaded-sticker")],
            connectors: [],
            groups: [],
            view: { zoom: 1, fx: 0.5, fy: 0.5 }
          }
        })
      });
    });

    await seed(page, { minio: MINIO_ON });
    await page.evaluate(() => importFromMinio());
    await expect(page.locator("#minioImportBody .minio-latest-item")).toHaveText(["My Board:latest"]);
    await page.locator("#minioImportBody .minio-latest-item").click();

    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem("storyboard_boards") || "[]").length)).toBe(2);
    const state = await page.evaluate(() => {
      const boards = JSON.parse(localStorage.getItem("storyboard_boards") || "[]");
      return { boards, active: localStorage.getItem("storyboard_activeBoard") };
    });
    const loaded = state.boards.find((b) => b.id !== BOARD.id);
    expect(loaded.name).toBe("Holiday Plan");
    expect(loaded.background).toBe("underwater");
    expect(loaded.items.map((i) => i.id)).toEqual(["loaded-sticker"]);
    expect(state.active).toBe(loaded.id);
    await expect(page.locator("#sbBoardName")).toContainText("Holiday Plan");
    await expect(page.locator('.sb-object[data-id="loaded-sticker"]')).toBeVisible();
    await expect(page.locator("#minioImportPage")).not.toHaveAttribute("open", "");
    await expect(page.locator("#smdConfirmModal")).toContainText("Loaded");
  });

  test("loading a board whose name already exists asks before overwriting it", async ({ page }) => {
    const latest = "storyboard/My Board/board-202602020000.json";
    await page.route((url) => url.hostname === "minio" && url.port === "9000", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") || "";
        if (prefix === "storyboard/My Board/") {
          return route.fulfill({
            status: 200,
            body: xmlList({
              contents: ["storyboard/My Board/board-202601010000.json", latest]
            })
          });
        }
        return route.fulfill({
          status: 200,
          body: xmlList({ prefixes: ["storyboard/My Board/"] })
        });
      }
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          version: 1,
          app: "storyboard",
          board: {
            id: "saved-board",
            name: "My Board",
            background: "underwater",
            items: [sticker("loaded-sticker")],
            connectors: [],
            groups: [],
            view: { zoom: 1, fx: 0.5, fy: 0.5 }
          }
        })
      });
    });

    await seed(page, { minio: MINIO_ON });
    await page.evaluate(() => importFromMinio());
    await page.locator("#minioImportBody .minio-latest-item").click();

    const modal = page.locator("#smdConfirmModal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("already exists");
    await expect(modal).toContainText("My Board");
    // Nothing has been replaced while the question is open.
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem("storyboard_boards") || "[]")[0].background)).toBe("space");

    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).not.toBeVisible();
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem("storyboard_boards") || "[]").length)).toBe(1);
    await expect(page.locator("#minioImportPage")).toHaveAttribute("open", "");

    // Overwrite the EXISTING board with the same name (same id, new content).
    await expect(page.locator("#minioImportBody .minio-latest-item")).toBeVisible();
    await page.locator("#minioImportBody .minio-latest-item").click();
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Overwrite" }).click();

    await expect.poll(() => page.evaluate(() => {
      const boards = JSON.parse(localStorage.getItem("storyboard_boards") || "[]");
      return boards.length === 1 && boards[0].background;
    })).toBe("underwater");
    const state = await page.evaluate(() => ({
      boards: JSON.parse(localStorage.getItem("storyboard_boards") || "[]"),
      active: localStorage.getItem("storyboard_activeBoard")
    }));
    expect(state.boards[0].id).toBe(BOARD.id);
    expect(state.boards[0].name).toBe("My Board");
    expect(state.boards[0].items.map((i) => i.id)).toEqual(["loaded-sticker"]);
    expect(state.active).toBe(BOARD.id);
    await expect(page.locator('.sb-object[data-id="loaded-sticker"]')).toBeVisible();
    await expect(page.locator("#minioImportPage")).not.toHaveAttribute("open", "");
    await expect(modal).toContainText("Loaded");
  });
});
