const { test } = require("@playwright/test");
const {
  createScreenshotAllThemes,
  seedOneDriveSettings,
  stubOneDriveBrowser
} = require("./screenshot-helpers");

// Storyboard gallery. Each scene captures the rail/panels, the board and the
// new FileSync/OneDrive surfaces across every theme and both modes.
//
// A same-mode theme swap changes neither `data-bs-theme` nor the DOM, so the
// board (whose text frames bake the resolved colour into an SVG data URI) has to
// be re-rendered per theme. The align row is re-opened too while its scene runs;
// every other scene keeps whatever the test already opened.
function refreshStoryboardAfterTheme() {
  // While a settings/OneDrive page is open the board is hidden, so a re-layout
  // would measure a zero-sized canvas. The page chrome follows CSS by itself.
  if (document.querySelector("smd-page[open]")) return;
  if (typeof sbRender === "function") sbRender();
  if (window.__sbShotAlign && typeof sbShowAlignMenu === "function") {
    sbShowAlignMenu(true);
  }
}

const screenshotAllThemes = createScreenshotAllThemes("storyboard", refreshStoryboardAfterTheme);

const ONEDRIVE = {
  prefix: "storyboard_",
  directory: "MyApps/Storyboard",
  latestName: "story-202610250930.json",
  folderNames: ["Holiday", "Space Story"],
  noBackupFolders: ["Holiday"]
};

function sticker(id, name, x, y, extra) {
  return Object.assign({
    id,
    type: "sticker",
    sticker: name,
    x,
    y,
    scale: 1,
    rotation: 0,
    z: 1,
    flipX: false,
    flipY: false
  }, extra || {});
}

function textBox(id, value, x, y, extra) {
  return Object.assign({
    id,
    type: "text",
    text: value,
    bg: "transparent",
    color: "auto",
    border: "none",
    font: "theme",
    x,
    y,
    scale: 1,
    rotation: 0,
    z: 1
  }, extra || {});
}

// A NOTE is an editor cue (a coloured sticky-note glyph whose text is the
// tooltip); it is never drawn into a downloaded JPG.
function note(id, value, x, y, extra) {
  return Object.assign({
    id,
    type: "note",
    text: value,
    color: "#ffd54f",
    x,
    y,
    scale: 1.1,
    rotation: 0,
    z: 6
  }, extra || {});
}

function scene(id, name, extra) {
  return Object.assign({
    id,
    name,
    background: "",
    items: [],
    connectors: [],
    groups: [],
    view: { zoom: 1, fx: 0.5, fy: 0.5 }
  }, extra || {});
}

// The board used by most scenes: space artwork, three stickers, two framed text
// boxes and a directional connector between them.
const SHOWCASE_SCENE = scene("showcase", "Launch", {
  background: "space",
  items: [
    sticker("st-spaceman", "spaceman", 24, 34, { scale: 1.1, rotation: -8, z: 1 }),
    sticker("st-spaceship", "spaceship", 68, 26, { scale: 1.25, rotation: 8, z: 2, flipX: true }),
    sticker("st-mermaid", "mermaid", 78, 74, { scale: 0.85, rotation: -4, z: 3 }),
    textBox("tx-control", "Mission Control", 34, 72, {
      bg: "dark", color: "auto", border: "fancy", font: "cabin-sketch", scale: 1.15, z: 4
    }),
    textBox("tx-launch", "Launch at dawn", 62, 62, {
      bg: "warning", color: "dark", border: "stamp", scale: 1, rotation: 5, z: 5
    }),
    // Notes are editor cues: the glyph is on the board, the text is the tooltip.
    note("nt-1", "Remember: moon phase at dawn", 16, 16)
  ],
  connectors: [{ id: "cn-1", from: "tx-control", to: "tx-launch" }]
});

const STORIES = [
  {
    id: "story-space",
    name: "Space Story",
    scenes: [
      SHOWCASE_SCENE,
      scene("orbit", "Orbit", {
        background: "space",
        items: [sticker("st-orbit", "spaceship", 50, 50, { scale: 1.3, rotation: 18 })]
      })
    ],
    activeSceneId: "showcase"
  },
  {
    id: "story-sea",
    name: "Underwater",
    scenes: [
      scene("reef", "Coral Reef", {
        background: "underwater",
        items: [
          sticker("st-reef-mermaid", "mermaid", 40, 46, { scale: 1.1 }),
          sticker("st-reef-shark", "shark", 70, 58, { scale: 1.2, rotation: -10 }),
          sticker("st-reef-weed", "seaweed", 20, 72, { scale: 0.9 })
        ]
      })
    ],
    activeSceneId: "reef"
  }
];

async function seedStories(page, extraKeys) {
  await page.goto("/");
  await page.evaluate(({ stories, keys }) => {
    localStorage.clear();
    localStorage.setItem("storyboard_fontSize", "normal");
    localStorage.setItem("storyboard_touchSize", "normal");
    localStorage.setItem("storyboard_slideDuration", "0");
    localStorage.setItem("storyboard_stories", JSON.stringify(stories));
    localStorage.setItem("storyboard_activeStory", stories[0].id);
    localStorage.setItem("storyboard_activeScene", stories[0].activeSceneId);
    localStorage.setItem("storyboard_toolbarPinned", "false");
    Object.keys(keys || {}).forEach((key) => localStorage.setItem(key, keys[key]));
  }, { stories: STORIES, keys: extraKeys || {} });
  await page.goto("/Storyboard/");
  await page.waitForSelector("#sbCanvas");
  await page.waitForSelector('.sb-object[data-id="st-spaceman"]');
}

// The OneDrive page + settings only need this app's Graph calls stubbed: the
// scenes must not reach Microsoft (no Azure registration on the test box).

test.describe("Storyboard - Screenshots", () => {

  test.describe.configure({ timeout: 600000 });

  // A canvas app: the rail labels and the board need room, so this gallery uses
  // a desktop window (the phone viewport hides the labels and shrinks the art).
  test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  test.beforeEach(async ({ page }) => {
    await seedStories(page);
  });

  test("board", async ({ page }) => {
    await screenshotAllThemes(page, "board.png");
  });

  test("stories panel", async ({ page }) => {
    await page.locator('.sb-rail-btn[data-tool="boards"]').click();
    await page.waitForSelector(".sb-story-row.active");
    await page.locator(".sb-story-row").nth(1).locator(".sb-story-pick").click();
    await page.locator(".sb-story-row.active + .sb-story-scenes .sb-board-row").first().click();
    // Show the row actions the panel gained: drag handle, DUPLICATE (fa-copy,
    // before the edit pen) and delete - and a duplicated scene named "<x> copy".
    await page.evaluate(() => {
      sbDuplicateBoard(sbActiveBoard().id);
      sbRenderPanel();
    });
    await page.waitForTimeout(250);
    await screenshotAllThemes(page, "stories-panel.png");
  });

  test("background panel", async ({ page }) => {
    await page.locator('.sb-rail-btn[data-tool="background"]').click();
    await page.waitForSelector(".sb-bg-option");
    await page.waitForTimeout(250);
    await screenshotAllThemes(page, "background-panel.png");
  });

  test("stickers panel", async ({ page }) => {
    await page.locator('.sb-rail-btn[data-tool="stickers"]').click();
    await page.waitForSelector(".sb-sticker-option");
    await page.waitForTimeout(250);
    await screenshotAllThemes(page, "stickers-panel.png");
  });

  test("text panel", async ({ page }) => {
    await page.evaluate(() => sbOpenTextEditor("tx-control"));
    await page.waitForSelector("#sbTextInput");
    await page.waitForTimeout(250);
    await screenshotAllThemes(page, "text-panel.png");
  });

  test("note panel", async ({ page }) => {
    // The Note tool's editor: multi-line text + the shared full colour picker.
    await page.evaluate(() => sbOpenNoteEditor("nt-1"));
    await page.waitForSelector("#sbNoteInput");
    await page.waitForTimeout(250);
    await screenshotAllThemes(page, "note-panel.png");
  });

  test("speech bubbles", async ({ page }) => {
    // The new TEXT bubble styles: a round bubble with its tail pointing at the
    // spaceman, and an oval one (fill + the line just inside it). The round one is
    // selected so the tail handle and the dashed ring are visible.
    await page.evaluate(() => {
      const board = sbActiveBoard();
      const make = (id, text, extra) => Object.assign({
        id, type: "text", text, color: "black", bg: "white", border: "none", font: "theme",
        bubble: "round", stroke: "#000000", lineWidth: 2.5, lineGap: 0,
        x: 40, y: 30, scale: 1, rotation: 0, z: 6, tail: { dx: -13, dy: 6 }
      }, extra || {});
      board.items.push(make("sb-b1", "Take me to the moon!", {}));
      board.items.push(make("sb-b2", "Oval bubble", {
        bubble: "oval", bg: "#ffe066", color: "#222222", stroke: "#333333",
        lineGap: 8, x: 70, y: 64, tail: { dx: -5, dy: 12 }
      }));
      sbRender();
      sbSelect("sb-b1");
    });
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "speech-bubbles.png");
  });

  test("undo redo", async ({ page }) => {
    // One edit arms Undo, so the rail pair is drawn in its enabled state.
    await page.evaluate(() => sbAddSticker("shark"));
    await page.waitForFunction(() => sbHistoryCanUndo());
    await page.waitForTimeout(250);
    await screenshotAllThemes(page, "undo-redo.png");
  });

  test("selection bar", async ({ page }) => {
    await page.evaluate(() => {
      sbSelect("st-spaceman");
      sbFlipSelected("x");
    });
    await page.waitForSelector("#sbSelectionBar:not(.d-none)");
    await page.waitForTimeout(250);
    await screenshotAllThemes(page, "selection-bar.png");
  });

  test("multi-selection align", async ({ page }) => {
    await page.evaluate(() => {
      window.__sbShotAlign = true;
      sbSetSelection(["st-spaceman", "st-spaceship", "st-mermaid"]);
      sbShowAlignMenu(true);
    });
    await page.waitForSelector("#sbSelAlignRow:not(.d-none)");
    await page.waitForTimeout(250);
    await screenshotAllThemes(page, "multi-selection-align.png");
  });

  test("main menu dropdown", async ({ page }) => {
    await seedOneDriveSettings(page, ONEDRIVE);
    await page.evaluate(() => {
      localStorage.setItem("storyboard_minio_enabled", "true");
      if (typeof updateFileSyncMenu === "function") updateFileSyncMenu();
      else if (typeof updateOneDriveMenu === "function") updateOneDriveMenu();
    });
    await page.locator("#btnMainMenu").click();
    await page.locator(".dropdown-menu.show").first().waitFor({ state: "visible" });
    await page.waitForTimeout(250);
    await screenshotAllThemes(page, "main-menu-dropdown.png");
  });

  test("settings", async ({ page }) => {
    await page.evaluate(() => openSettings());
    await page.waitForSelector("#settingsPage:not(.d-none)");
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "settings.png");
  });

  test("settings - onedrive", async ({ page }) => {
    await seedOneDriveSettings(page, ONEDRIVE);
    await page.evaluate(() => openSettings());
    await page.waitForSelector("#settingsPage:not(.d-none)");
    await page.locator("#filesync-tab").click();
    await page.locator("#fileSyncTabs > .smd-tab-list .smd-tab-btn").filter({ hasText: "OneDrive" }).click();
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "settings-onedrive.png");
  });

  test("open from onedrive", async ({ page }) => {
    await seedOneDriveSettings(page, ONEDRIVE);
    await stubOneDriveBrowser(page, ONEDRIVE);
    await page.evaluate(() => openOneDrivePage());
    await page.waitForSelector("#oneDriveBody .od-folder-split");
    await page.waitForTimeout(300);
    await screenshotAllThemes(page, "onedrive-open.png");
  });
});
