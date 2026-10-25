const { test, expect } = require("@playwright/test");

// Storyboard - MinIO story save/load.
//
// Save writes the WHOLE active Story (all scenes) to
// "<app directory>/<story name>/story-YYYYMMDDHHMM.json".
// Load uses the shared MinIO import page (scoped to the app directory), which
// lists subdirectories and "<subdirectory>:latest" shortcuts, and adds the
// chosen file as a NEW story. If a story with the same name already exists it
// asks before overwriting it.

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

function scene(id, name, extra) {
  return Object.assign({
    id,
    name,
    background: "space",
    items: [sticker(id + "-sticker")],
    connectors: [],
    groups: [],
    view: { zoom: 1, fx: 0.5, fy: 0.5 }
  }, extra || {});
}

const FIRST_SCENE = scene("minio-scene", "Scene 1");
const STORY = {
  id: "minio-story",
  name: "My Board",
  scenes: [FIRST_SCENE],
  activeSceneId: FIRST_SCENE.id
};

async function seed(page, options = {}) {
  await page.goto("/");
  await page.evaluate(({ story, minio, keys }) => {
    localStorage.setItem("storyboard_stories", JSON.stringify([story]));
    localStorage.setItem("storyboard_activeStory", story.id);
    localStorage.setItem("storyboard_activeScene", story.activeSceneId);
    if (minio) {
      Object.keys(minio).forEach((field) => {
        localStorage.setItem(keys[field], minio[field]);
      });
    }
  }, { story: options.story || STORY, minio: options.minio || null, keys: MINIO_KEYS });
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

// The saved payload used by the load tests: one story with one scene.
function savedPayload(storyName) {
  const savedScene = scene("saved-scene", "Scene 1", {
    background: "underwater",
    items: [sticker("loaded-sticker")]
  });
  return {
    version: 1,
    app: "storyboard",
    exportedAt: "2026-02-02T00:00:00.000Z",
    story: {
      id: "saved-story",
      name: storyName,
      scenes: [savedScene],
      activeSceneId: savedScene.id
    }
  };
}

test.describe("Storyboard - MinIO", () => {
  test("Settings has a Minio tab with a Directory field and the load/save items sit in the hamburger menu", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsTabs > .smd-tab-list .smd-tab-btn")).toHaveText(["Display", "FileSync"]);
    await page.locator("#filesync-tab").click();
    await page.locator("#fileSyncTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "Minio" }).click();
    await expect(page.locator("#minioEnabled")).toBeVisible();
    await expect(page.locator("#minioDirectory")).toBeVisible();
    await page.evaluate(() => closeSettings());

    const saveItem = page.locator("a.minio-menu-item").filter({ hasText: "Save Story to Minio" });
    const loadItem = page.locator("a.minio-menu-item").filter({ hasText: "Load Story from Minio" });
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
      "Save Story to Minio",
      "Load Story from Minio",
      "divider",
      "Save Story to OneDrive",
      "Load Story from OneDrive"
    ]);
  });

  test("saving the story uploads <directory>/<story>/story-<datetimestamp>.json with every scene", async ({ page }) => {
    const second = scene("minio-scene-2", "Scene 2", {
      background: "underwater",
      items: [sticker("minio-sticker-2")]
    });
    await seed(page, {
      minio: MINIO_ON,
      story: { ...STORY, scenes: [FIRST_SCENE, second] }
    });
    await page.evaluate(() => {
      window.__minioPut = null;
      minioPutObject = (bucket, key, body) => {
        window.__minioPut = { bucket, key, body };
        return Promise.resolve("");
      };
    });

    await page.locator("#btnMainMenu").click();
    const saveItem = page.locator("a.minio-menu-item").filter({ hasText: "Save Story to Minio" });
    await expect(saveItem).toBeVisible();
    await saveItem.click();

    await expect.poll(() => page.evaluate(() => window.__minioPut && window.__minioPut.key))
      .toMatch(/^storyboard\/My Board\/story-\d{12}\.json$/);
    const put = await page.evaluate(() => window.__minioPut);
    expect(put.bucket).toBe("myapps");
    const payload = JSON.parse(put.body);
    expect(payload.app).toBe("storyboard");
    expect(payload.story.name).toBe("My Board");
    expect(payload.story.scenes.map((s) => s.name)).toEqual(["Scene 1", "Scene 2"]);
    expect(payload.story.scenes.map((s) => s.items.map((i) => i.id))).toEqual([
      ["minio-scene-sticker"],
      ["minio-sticker-2"]
    ]);
    await expect(page.locator("#smdConfirmModal")).toContainText("Saved");
  });

  test("path-unsafe characters in the story name are removed from the subdirectory", async ({ page }) => {
    await seed(page);
    const dir = await page.evaluate(() => sbMinioStoryDirName("Holiday/2026: plans?"));
    expect(dir).toBe("Holiday-2026- plans-");
  });

  test("loading '<directory>:latest' adds the newest saved story as a new story", async ({ page }) => {
    const latest = "storyboard/My Board/story-202602020000.json";
    await page.route((url) => url.hostname === "minio" && url.port === "9000", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") || "";
        if (prefix === "storyboard/My Board/") {
          return route.fulfill({
            status: 200,
            body: xmlList({
              contents: ["storyboard/My Board/story-202601010000.json", latest]
            })
          });
        }
        return route.fulfill({
          status: 200,
          body: xmlList({ prefixes: ["storyboard/My Board/"] })
        });
      }
      return route.fulfill({ status: 200, body: JSON.stringify(savedPayload("Holiday Plan")) });
    });

    await seed(page, { minio: MINIO_ON });
    await page.evaluate(() => importFromMinio());
    await expect(page.locator("#minioImportBody .minio-latest-item")).toHaveText(["My Board:latest"]);
    await page.locator("#minioImportBody .minio-latest-item").click();

    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem("storyboard_stories") || "[]").length)).toBe(2);
    const state = await page.evaluate(() => {
      const stories = JSON.parse(localStorage.getItem("storyboard_stories") || "[]");
      return {
        stories,
        activeStory: localStorage.getItem("storyboard_activeStory"),
        activeScene: localStorage.getItem("storyboard_activeScene")
      };
    });
    const loaded = state.stories.find((s) => s.id !== STORY.id);
    expect(loaded.name).toBe("Holiday Plan");
    expect(loaded.scenes).toHaveLength(1);
    expect(loaded.scenes[0].background).toBe("underwater");
    expect(loaded.scenes[0].items.map((i) => i.id)).toEqual(["loaded-sticker"]);
    expect(state.activeStory).toBe(loaded.id);
    expect(state.activeScene).toBe(loaded.scenes[0].id);
    await expect(page.locator("#sbBoardName")).toContainText("Holiday Plan");
    await expect(page.locator('.sb-object[data-id="loaded-sticker"]')).toBeVisible();
    await expect(page.locator("#minioImportPage")).not.toHaveAttribute("open", "");
    await expect(page.locator("#smdConfirmModal")).toContainText("Loaded");
  });

  test("loading a story whose name already exists asks before overwriting it", async ({ page }) => {
    const latest = "storyboard/My Board/story-202602020000.json";
    await page.route((url) => url.hostname === "minio" && url.port === "9000", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") || "";
        if (prefix === "storyboard/My Board/") {
          return route.fulfill({
            status: 200,
            body: xmlList({
              contents: ["storyboard/My Board/story-202601010000.json", latest]
            })
          });
        }
        return route.fulfill({
          status: 200,
          body: xmlList({ prefixes: ["storyboard/My Board/"] })
        });
      }
      return route.fulfill({ status: 200, body: JSON.stringify(savedPayload("My Board")) });
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
      JSON.parse(localStorage.getItem("storyboard_stories") || "[]")[0].scenes[0].background)).toBe("space");

    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).not.toBeVisible();
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem("storyboard_stories") || "[]").length)).toBe(1);
    await expect(page.locator("#minioImportPage")).toHaveAttribute("open", "");

    // Overwrite the EXISTING story with the same name (same story id, new scenes).
    await expect(page.locator("#minioImportBody .minio-latest-item")).toBeVisible();
    await page.locator("#minioImportBody .minio-latest-item").click();
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Overwrite" }).click();

    await expect.poll(() => page.evaluate(() => {
      const stories = JSON.parse(localStorage.getItem("storyboard_stories") || "[]");
      return stories.length === 1 && stories[0].scenes[0].background;
    })).toBe("underwater");
    const state = await page.evaluate(() => ({
      stories: JSON.parse(localStorage.getItem("storyboard_stories") || "[]"),
      activeStory: localStorage.getItem("storyboard_activeStory")
    }));
    expect(state.stories[0].id).toBe(STORY.id);
    expect(state.stories[0].name).toBe("My Board");
    expect(state.stories[0].scenes[0].items.map((i) => i.id)).toEqual(["loaded-sticker"]);
    expect(state.activeStory).toBe(STORY.id);
    await expect(page.locator('.sb-object[data-id="loaded-sticker"]')).toBeVisible();
    await expect(page.locator("#minioImportPage")).not.toHaveAttribute("open", "");
    await expect(modal).toContainText("Loaded");
  });
});
